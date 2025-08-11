import { NextRequest, NextResponse } from 'next/server';
import { runQuery, runQuerySingle, initializeDatabase } from '@/lib/database';
import { getTimeRangeConfig, getTimeRangeDuration, formatChartLabel } from '@/lib/time-range-utils';
import { TimeRange } from '@/types/energy';

export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const buildingId = searchParams.get('buildingId');
    const timeRangeParam = searchParams.get('timeRange') || '24h';
    const aggregation = searchParams.get('aggregation') || 'hourly';
    
    // Map API time range to our TimeRange type
    const timeRangeMap: Record<string, TimeRange> = {
      '1h': 'hour',
      '24h': 'day',
      '7d': 'week',
      '30d': 'month'
    };
    
    const timeRange: TimeRange = timeRangeMap[timeRangeParam] || 'day';
    
    // Calculate time range using utility
    const now = new Date();
    const duration = getTimeRangeDuration(timeRange);
    const startTime = new Date(now.getTime() - duration);
    
    // Get time range configuration
    const config = getTimeRangeConfig(timeRange);
    
    let sql = '';
    const startTimeStr = startTime.toISOString();
    
    // Base query conditions using direct values to avoid parameter binding issues
    let whereClause = `WHERE e.timestamp >= '${startTimeStr}'`;
    if (buildingId) {
      const escapedBuildingId = buildingId.replace(/'/g, "''");
      whereClause += ` AND e.building_id = '${escapedBuildingId}'`;
    }
    
    // Use the modular time range configuration for SQL
    const usedAggregation = aggregation === 'hourly' || aggregation === 'daily' ? config.aggregation : aggregation;
    
    if (usedAggregation === 'minute' || usedAggregation === 'hourly' || usedAggregation === 'daily' || usedAggregation === 'weekly') {
      sql = `
        SELECT 
          strftime(date_trunc('${config.sqlTrunc}', e.timestamp), '${config.sqlFormat}') as period,
          AVG(e.consumption_kwh)::DOUBLE as avg_consumption,
          SUM(e.consumption_kwh)::DOUBLE as total_consumption,
          AVG(e.cost_usd)::DOUBLE as avg_cost,
          SUM(e.cost_usd)::DOUBLE as total_cost,
          AVG(e.efficiency_score)::DOUBLE as avg_efficiency,
          AVG(e.temperature_celsius)::DOUBLE as avg_temperature,
          AVG(e.occupancy_count)::DOUBLE as avg_occupancy,
          COUNT(*)::INTEGER as record_count
        FROM energy_usage e
        ${whereClause}
        GROUP BY date_trunc('${config.sqlTrunc}', e.timestamp)
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
    const energyData = rawEnergyData.map((item: any, index: number) => ({
      ...item,
      label: formatChartLabel(item.period || item.timestamp, timeRange, index)
    }));
    
    // Get summary statistics
    const summarySQL = `
      SELECT 
        COUNT(*)::INTEGER as total_records,
        AVG(consumption_kwh)::DOUBLE as avg_consumption,
        SUM(consumption_kwh)::DOUBLE as total_consumption,
        AVG(cost_usd)::DOUBLE as avg_cost,
        SUM(cost_usd)::DOUBLE as total_cost,
        AVG(efficiency_score)::DOUBLE as avg_efficiency,
        strftime(MIN(timestamp), '%Y-%m-%d %H:%M:%S') as earliest_record,
        strftime(MAX(timestamp), '%Y-%m-%d %H:%M:%S') as latest_record
      FROM energy_usage e
      ${whereClause}
    `;
    
    const summary = await runQuerySingle(summarySQL, []);
    
    // Convert any BigInt values to regular numbers to avoid JSON serialization issues
    const sanitizeData = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return Number(obj);
      if (Array.isArray(obj)) return obj.map(sanitizeData);
      if (typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeData(value);
        }
        return sanitized;
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
          endTime: now.toISOString()
        },
        config: {
          timeRange,
          sqlTrunc: config.sqlTrunc,
          sqlFormat: config.sqlFormat,
          aggregation: config.aggregation
        }
      }
    });
    
  } catch (error) {
    console.error('Energy API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch energy data', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}