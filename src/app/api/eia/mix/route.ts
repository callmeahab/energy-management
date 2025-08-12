import { NextRequest, NextResponse } from "next/server";
import { BALANCING_AUTHORITIES } from "@/lib/eia-balancing-authorities";
import { fetchRenewableAttribution } from "@/lib/renewable-service";

// GET /api/eia/mix?granularity=hour&bas=NYIS,PJM
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const granularity =
      searchParams.get("granularity") === "day" ? "day" : "hour";
    const basParam = searchParams.get("bas");
    const bas = basParam
      ? basParam.split(",").map((s) => s.trim().toUpperCase())
      : BALANCING_AUTHORITIES.map((b) => b.code);

    const now = new Date();
    const periodEnd = now.toISOString();
    const periodStart = new Date(
      now.getTime() - (granularity === "hour" ? 3600000 : 24 * 3600000)
    ).toISOString();

    // For each BA we temporarily override env EIA_RESPONDENT (since service reads it at call time) – but service currently uses process.env only.
    // Instead call fetchRenewableAttribution sequentially by temporarily setting process.env.EIA_RESPONDENT. This is safe in single-request context.

    interface MixPoint {
      code: string;
      share: number;
      latitude?: number;
      longitude?: number;
      name: string;
      period: string;
    }
    const results: MixPoint[] = [];
    const originalRespondent = process.env.EIA_RESPONDENT;

    for (const code of bas) {
      process.env.EIA_RESPONDENT = code; // mutate env for service call
      const attribution = await fetchRenewableAttribution({
        periodStart,
        periodEnd,
        granularity,
      });
      if (attribution && attribution.records.length > 0) {
        const share = attribution.records[0].renewable_share;
        const baMeta = BALANCING_AUTHORITIES.find((b) => b.code === code);
        results.push({
          code,
          share,
          latitude: baMeta?.latitude,
          longitude: baMeta?.longitude,
          name: baMeta?.name || code,
          period: attribution.records[0].period,
        });
      }
    }

    // Restore env
    if (originalRespondent !== undefined)
      process.env.EIA_RESPONDENT = originalRespondent;
    else delete process.env.EIA_RESPONDENT;

    return NextResponse.json({ success: true, data: results });
  } catch (e) {
    console.error("EIA mix endpoint error", e);
    return NextResponse.json(
      { success: false, error: "Failed to fetch EIA mix" },
      { status: 500 }
    );
  }
}
