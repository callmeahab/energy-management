/**
 * Renewable attribution service (USA-focused implementation via WattTime by default)
 * Falls back to null so caller can apply heuristic.
 */

export interface RenewableAttributionRequest {
  periodStart: string; // ISO timestamp (inclusive)
  periodEnd: string; // ISO timestamp (exclusive)
  granularity: "hour" | "day";
  buildingId?: string; // reserved for future site-specific on-site generation blending
}

export interface RenewableAttributionRecord {
  period: string; // normalized period key (hour start or day start ISO)
  renewable_consumption: number; // kWh (share * total consumption; share derived from grid mix)
  renewable_cost?: number; // USD (optional; may be derived later by caller)
  renewable_share: number; // 0-1 share used
  source_breakdown?: Record<string, number>; // MW per fuel (if available)
}

export interface RenewableAttributionResponse {
  records: RenewableAttributionRecord[];
  aggregates?: {
    total_renewable_consumption: number;
    total_renewable_cost?: number;
    avg_share?: number;
  };
}

// WattTime specifics

function truncateToGranularity(
  dateIso: string,
  granularity: "hour" | "day"
): string {
  const d = new Date(dateIso);
  if (granularity === "day") {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    ).toISOString();
  }
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours()
    )
  ).toISOString();
}

export async function fetchRenewableAttribution(
  params: RenewableAttributionRequest
): Promise<RenewableAttributionResponse | null> {
  return fetchEiaAttribution(params);
}

// ---------------- EIA Provider (USA) ----------------
// EIA v2 API: https://www.eia.gov/opendata/browser/electricity/rto/fuel-type-data
// Requires env EIA_API_KEY and optional EIA_RESPONDENT (NYIS, CAISO, PJM, MISO, ISONE, ERCOT, SPP, etc.)
const EIA_API_KEY = process.env.EIA_API_KEY;
const EIA_RESPONDENT = process.env.EIA_RESPONDENT || "NYIS";
const EIA_BASE = "https://api.eia.gov/v2/electricity/rto/fuel-type-data/data/";

// Fuel type codes considered renewable in EIA dataset
const EIA_RENEWABLE_FUELS = new Set([
  "WAT", // Hydro conventional
  "WAT+", // Pumped storage (net positive periods may count) – optional
  "SUN", // Solar
  "WND", // Wind
  "GEO", // Geothermal
  "OTH", // Other (may include biomass; conservative inclusion – can refine)
  "BM", // Biomass (if present in some feeds)
]);

interface EiaFuelRecord {
  period: string;
  fueltype: string;
  value: number;
}

async function fetchEiaAttribution(
  params: RenewableAttributionRequest
): Promise<RenewableAttributionResponse | null> {
  if (!EIA_API_KEY) {
    console.warn(
      "EIA_API_KEY not set – cannot fetch EIA renewable attribution"
    );
    return null;
  }
  try {
    // EIA expects local timezone offsets; we can pass ISO (the API tolerates Z) but we'll keep as given
    const url = new URL(EIA_BASE);
    url.searchParams.set(
      "frequency",
      params.granularity === "hour" ? "hourly" : "daily"
    );
    url.searchParams.append("data[0]", "value");
    url.searchParams.append("facets[respondent][]", EIA_RESPONDENT);
    url.searchParams.set("start", params.periodStart);
    url.searchParams.set("end", params.periodEnd);
    url.searchParams.set("api_key", EIA_API_KEY);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn("EIA API non-OK", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const dataArray =
      json && json.response && Array.isArray(json.response.data)
        ? (json.response.data as unknown[])
        : [];
    const rows: EiaFuelRecord[] = dataArray.map((raw) => {
      const d = raw as Record<string, unknown>;
      const period = String(d.period || "");
      const fueltype = String(d.fueltype || "");
      const value = Number(d.value) || 0;
      return { period, fueltype, value };
    });
    if (!rows.length) return null;

    // Normalize period to hour/day UTC bucket
    const bucketMap = new Map<
      string,
      { total: number; renewable: number; breakdown: Record<string, number> }
    >();
    for (const r of rows) {
      const bucket = truncateToGranularity(r.period, params.granularity);
      let entry = bucketMap.get(bucket);
      if (!entry) {
        entry = { total: 0, renewable: 0, breakdown: {} };
        bucketMap.set(bucket, entry);
      }
      entry.total += r.value;
      entry.breakdown[r.fueltype] =
        (entry.breakdown[r.fueltype] || 0) + r.value;
      if (EIA_RENEWABLE_FUELS.has(r.fueltype)) {
        entry.renewable += r.value;
      }
    }

    const records: RenewableAttributionRecord[] = Array.from(
      bucketMap.entries()
    )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, v]) => ({
        period,
        renewable_consumption: 0, // caller scales
        renewable_share: v.total > 0 ? v.renewable / v.total : 0,
        source_breakdown: v.breakdown,
      }));
    if (!records.length) return null;
    const avg_share =
      records.reduce((a, r) => a + r.renewable_share, 0) / records.length;
    return {
      records,
      aggregates: { total_renewable_consumption: 0, avg_share },
    };
  } catch (e) {
    console.warn("EIA attribution error", e);
    return null;
  }
}
