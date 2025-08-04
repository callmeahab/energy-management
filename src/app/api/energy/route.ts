import { NextRequest, NextResponse } from 'next/server';
import { runQuery, runQuerySingle, initializeDatabase } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const buildingId = searchParams.get('buildingId');
    const timeRange = searchParams.get('timeRange') || '24h';
    const aggregation = searchParams.get('aggregation') || 'hourly';
    
    // Calculate time range
    const now = new Date();
    let startTime: Date;
    
    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    let sql = '';
    const params: string[] = [startTime.toISOString()];
    
    // Base query conditions
    let whereClause = 'WHERE e.timestamp >= ?';
    if (buildingId) {
      whereClause += ' AND e.building_id = ?';
      params.push(buildingId);
    }
    
    // Aggregation queries using DuckDB date functions
    if (aggregation === 'hourly') {
      sql = `
        SELECT 
          date_trunc('hour', e.timestamp) as period,
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
        GROUP BY date_trunc('hour', e.timestamp)
        ORDER BY period DESC
        LIMIT 100
      `;
    } else if (aggregation === 'daily') {
      sql = `
        SELECT 
          date_trunc('day', e.timestamp) as period,
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
        GROUP BY date_trunc('day', e.timestamp)
        ORDER BY period DESC
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
    
    const energyData = await runQuery(sql, params);
    
    // Get summary statistics
    const summarySQL = `
      SELECT 
        COUNT(*)::INTEGER as total_records,
        AVG(consumption_kwh)::DOUBLE as avg_consumption,
        SUM(consumption_kwh)::DOUBLE as total_consumption,
        AVG(cost_usd)::DOUBLE as avg_cost,
        SUM(cost_usd)::DOUBLE as total_cost,
        AVG(efficiency_score)::DOUBLE as avg_efficiency,
        MIN(timestamp) as earliest_record,
        MAX(timestamp) as latest_record
      FROM energy_usage e
      ${whereClause}
    `;
    
    const summary = await runQuerySingle(summarySQL, params);
    
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
          aggregation,
          startTime: startTime.toISOString(),
          endTime: now.toISOString()
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