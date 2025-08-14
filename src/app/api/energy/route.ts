import { NextRequest, NextResponse } from "next/server";
import { runQuery, runQuerySingle, initializeDatabase } from "@/lib/database";
import {
  getTimeRangeConfig,
  getTimeRangeDuration,
  formatChartLabel,
} from "@/lib/time-range-utils";
import { TimeRange } from "@/types/energy";

interface RawEnergyRow {
  period?: string;
  timestamp?: string;
  avg_consumption?: number;
  total_consumption?: number;
  avg_cost?: number;
  total_cost?: number;
  avg_efficiency?: number;
  record_count?: number;
  building_id?: string;
  building_name?: string;
  floor_name?: string;
  space_name?: string;
  efficiency_score?: number; // present in raw table when not aggregated
  consumption_kwh?: number;
  cost_usd?: number;
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
      usedAggregation === "30minute" ||
      usedAggregation === "hourly" ||
      usedAggregation === "daily" ||
      usedAggregation === "weekly"
    ) {
      // Special handling for 30-minute intervals
      if (usedAggregation === "30minute") {
        sql = `
          SELECT 
            strftime('%Y-%m-%d %H:', e.timestamp) || 
            CASE WHEN CAST(strftime('%M', e.timestamp) AS INTEGER) < 30 THEN '00:00' ELSE '30:00' END as period,
            AVG(e.consumption_kwh) as avg_consumption,
            AVG(e.consumption_kwh) as total_consumption,
            AVG(e.cost_usd) as avg_cost,
            AVG(e.cost_usd) as total_cost,
            AVG(e.efficiency_score) as avg_efficiency,
            COUNT(*) as record_count
          FROM energy_usage e
          ${whereClause}
          GROUP BY strftime('%Y-%m-%d %H:', e.timestamp) || 
                   CASE WHEN CAST(strftime('%M', e.timestamp) AS INTEGER) < 30 THEN '00:00' ELSE '30:00' END
          ORDER BY period ASC
          LIMIT 100
        `;
      } else {
        sql = `
          SELECT 
            strftime('${config.sqlFormat}', e.timestamp) as period,
            AVG(e.consumption_kwh) as avg_consumption,
            AVG(e.consumption_kwh) as total_consumption,
            AVG(e.cost_usd) as avg_cost,
            AVG(e.cost_usd) as total_cost,
            AVG(e.efficiency_score) as avg_efficiency,
            COUNT(*) as record_count
          FROM energy_usage e
          ${whereClause}
          GROUP BY strftime('${config.sqlFormat}', e.timestamp)
          ORDER BY period ASC
          LIMIT 100
        `;
      }
    } else {
      // Raw data
      sql = `
        SELECT 
          e.id,
          e.building_id,
          e.floor_id,
          e.space_id,
          e.timestamp,
          e.consumption_kwh,
          e.cost_usd,
          e.efficiency_score,
          e.usage_type,
          e.source,
          e.sync_timestamp,
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
    const energyData: RawEnergyRow[] = (rawEnergyData as RawEnergyRow[]).map(
      (item, index) => ({
        ...item,
        label: formatChartLabel(
          item.period || item.timestamp || now.toISOString(),
          timeRange,
          index
        ),
      })
    );

    // Get summary statistics using aggregated period data
    const summarySQL = `
      WITH period_totals AS (
        SELECT 
          strftime('${config.sqlFormat}', e.timestamp) as period,
          AVG(e.consumption_kwh) as period_consumption,
          AVG(e.cost_usd) as period_cost,
          AVG(e.efficiency_score) as period_efficiency
        FROM energy_usage e
        ${whereClause}
        GROUP BY strftime('${config.sqlFormat}', e.timestamp)
      )
      SELECT 
        COUNT(*) as total_periods,
        COUNT(*) as total_records,
        AVG(period_consumption) as avg_consumption,
        SUM(period_consumption) as total_consumption,
        AVG(period_cost) as avg_cost,
        SUM(period_cost) as total_cost,
        AVG(period_efficiency) as avg_efficiency,
        (SELECT strftime('%Y-%m-%d %H:%M:%S', MIN(timestamp)) FROM energy_usage e ${whereClause}) as earliest_record,
        (SELECT strftime('%Y-%m-%d %H:%M:%S', MAX(timestamp)) FROM energy_usage e ${whereClause}) as latest_record
      FROM period_totals
    `;

    const summary = await runQuerySingle(summarySQL, []);

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
