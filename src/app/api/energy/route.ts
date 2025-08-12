import { NextRequest, NextResponse } from "next/server";
import { runQuery, runQuerySingle, initializeDatabase } from "@/lib/database";
import {
  getTimeRangeConfig,
  getTimeRangeDuration,
  formatChartLabel,
} from "@/lib/time-range-utils";
import { TimeRange } from "@/types/energy";
import {
  fetchRenewableAttribution,
  RenewableAttributionRecord,
} from "@/lib/renewable-service";

interface RawEnergyRow {
  period?: string;
  timestamp?: string;
  avg_consumption?: number;
  total_consumption?: number;
  avg_cost?: number;
  total_cost?: number;
  avg_efficiency?: number;
  avg_temperature?: number;
  avg_occupancy?: number;
  record_count?: number;
  building_id?: string;
  building_name?: string;
  floor_name?: string;
  space_name?: string;
  efficiency_score?: number; // present in raw table when not aggregated
  consumption_kwh?: number;
  cost_usd?: number;
  renewable_consumption?: number;
  renewable_cost?: number;
  label?: string;
}

export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();

    const { searchParams } = new URL(request.url);
    const buildingId = searchParams.get("buildingId");
    const timeRangeParam = searchParams.get("timeRange") || "24h";
    const aggregation = searchParams.get("aggregation") || "hourly";

    // Map API time range to our TimeRange type
    const timeRangeMap: Record<string, TimeRange> = {
      "1h": "hour",
      "24h": "day",
      "7d": "week",
      "30d": "month",
    };

    const timeRange: TimeRange = timeRangeMap[timeRangeParam] || "day";

    // Calculate time range using utility
    const now = new Date();
    const duration = getTimeRangeDuration(timeRange);
    const startTime = new Date(now.getTime() - duration);

    // Get time range configuration
    const config = getTimeRangeConfig(timeRange);

    let sql = "";
    const startTimeStr = startTime.toISOString();

    // Base query conditions using direct values to avoid parameter binding issues
    let whereClause = `WHERE e.timestamp >= '${startTimeStr}'`;
    if (buildingId) {
      const escapedBuildingId = buildingId.replace(/'/g, "''");
      whereClause += ` AND e.building_id = '${escapedBuildingId}'`;
    }

    // Use the modular time range configuration for SQL
    const usedAggregation =
      aggregation === "hourly" || aggregation === "daily"
        ? config.aggregation
        : aggregation;

    if (
      usedAggregation === "minute" ||
      usedAggregation === "hourly" ||
      usedAggregation === "daily" ||
      usedAggregation === "weekly"
    ) {
      sql = `
        SELECT 
          strftime('${config.sqlFormat}', e.timestamp) as period,
          AVG(e.consumption_kwh) as avg_consumption,
          SUM(e.consumption_kwh) as total_consumption,
          AVG(e.cost_usd) as avg_cost,
          SUM(e.cost_usd) as total_cost,
          AVG(e.efficiency_score) as avg_efficiency,
          AVG(e.temperature_celsius) as avg_temperature,
          AVG(e.occupancy_count) as avg_occupancy,
          COUNT(*) as record_count
        FROM energy_usage e
        ${whereClause}
        GROUP BY strftime('${config.sqlFormat}', e.timestamp)
        ORDER BY period ASC
        LIMIT 100
      `;
    } else {
      // Raw data
      sql = `
        SELECT 
          e.*,
          b.name as building_name,
          f.name as floor_name,
          s.name as space_name
        FROM energy_usage e
        LEFT JOIN buildings b ON e.building_id = b.id
        LEFT JOIN floors f ON e.floor_id = f.id
        LEFT JOIN spaces s ON e.space_id = s.id
        ${whereClause}
        ORDER BY e.timestamp DESC
        LIMIT 1000
      `;
    }

    const rawEnergyData = await runQuery(sql, []);

    // Add formatted labels to the energy data
    let energyData: RawEnergyRow[] = (rawEnergyData as RawEnergyRow[]).map(
      (item, index) => ({
        ...item,
        label: formatChartLabel(
          item.period || item.timestamp || now.toISOString(),
          timeRange,
          index
        ),
      })
    );

    // Attempt to enrich with renewable metrics from external API when we have aggregated periods
    if (energyData.length > 0 && energyData[0].period) {
      const attribution = await fetchRenewableAttribution({
        periodStart: energyData[0].period
          ? new Date(energyData[0].period).toISOString()
          : startTime.toISOString(),
        periodEnd: now.toISOString(),
        granularity: config.aggregation === "hourly" ? "hour" : "day",
        buildingId: buildingId || undefined,
      });
      if (attribution) {
        const map = new Map<
          string,
          {
            renewable_consumption?: number;
            renewable_cost?: number;
            renewable_share?: number;
          }
        >();
        attribution.records.forEach(
          (r: RenewableAttributionRecord & { renewable_share?: number }) =>
            map.set(r.period, {
              renewable_consumption: r.renewable_consumption,
              renewable_cost: r.renewable_cost,
              renewable_share: r.renewable_share,
            })
        );
        energyData = energyData.map((row) => {
          const key = row.period || "";
          const match = key ? map.get(key) : undefined;
          if (!match) return row;
          // If renewable_consumption is zero but we have a share, compute via share * total_consumption
          let { renewable_consumption, renewable_cost } = match;
          if (
            (renewable_consumption === 0 ||
              renewable_consumption === undefined) &&
            match.renewable_share !== undefined
          ) {
            const totalCons = row.total_consumption ?? row.avg_consumption ?? 0;
            renewable_consumption = totalCons * match.renewable_share;
            const totalCost = row.total_cost ?? row.avg_cost ?? 0;
            renewable_cost = totalCost * match.renewable_share;
          }
          return { ...row, renewable_consumption, renewable_cost };
        });
      }
    }

    // Get summary statistics
    const summarySQL = `
      SELECT 
        COUNT(*) as total_records,
        AVG(consumption_kwh) as avg_consumption,
        SUM(consumption_kwh) as total_consumption,
        AVG(cost_usd) as avg_cost,
        SUM(cost_usd) as total_cost,
        AVG(efficiency_score) as avg_efficiency,
        strftime('%Y-%m-%d %H:%M:%S', MIN(timestamp)) as earliest_record,
        strftime('%Y-%m-%d %H:%M:%S', MAX(timestamp)) as latest_record
      FROM energy_usage e
      ${whereClause}
    `;

    let summary = await runQuerySingle(summarySQL, []);

    // Aggregate renewable metrics if present in enriched records
    if (energyData.some((r) => r.renewable_consumption !== undefined)) {
      const total_renewable_consumption = energyData.reduce(
        (acc: number, r) => acc + (r.renewable_consumption || 0),
        0
      );
      const total_renewable_cost = energyData.reduce(
        (acc: number, r) => acc + (r.renewable_cost || 0),
        0
      );
      summary = {
        ...summary,
        total_renewable_consumption,
        total_renewable_cost,
      };
    }

    // Convert any BigInt values to regular numbers to avoid JSON serialization issues
    const sanitizeData = <T>(obj: T): T => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === "bigint") return Number(obj) as unknown as T;
      if (Array.isArray(obj))
        return obj.map((o) => sanitizeData(o)) as unknown as T;
      if (typeof obj === "object") {
        const entries = Object.entries(obj as Record<string, unknown>).map(
          ([k, v]) => [k, sanitizeData(v)] as const
        );
        return Object.fromEntries(entries) as T;
      }
      return obj;
    };

    return NextResponse.json({
      success: true,
      data: {
        energyData: sanitizeData(energyData),
        summary: sanitizeData(summary),
        filters: {
          buildingId,
          timeRange,
          timeRangeParam,
          aggregation: usedAggregation,
          startTime: startTime.toISOString(),
          endTime: now.toISOString(),
        },
        config: {
          timeRange,
          sqlTrunc: config.sqlTrunc,
          sqlFormat: config.sqlFormat,
          aggregation: config.aggregation,
        },
      },
    });
  } catch (error) {
    console.error("Energy API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch energy data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
