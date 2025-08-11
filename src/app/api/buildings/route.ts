import { NextRequest, NextResponse } from 'next/server';
import { runQuery, runQuerySingle, initializeDatabase } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get('includeStats') === 'true';
    const buildingId = searchParams.get('id');
    
    if (buildingId) {
      // Get specific building with details
      const building = await runQuerySingle(`
        SELECT 
          b.id,
          b.name,
          b.description,
          b.exact_type,
          b.address_street,
          b.address_city,
          b.address_state,
          b.address_country,
          b.address_postal_code,
          b.latitude,
          b.longitude,
          b.date_created,
          b.date_updated,
          b.floors_count,
          b.spaces_count,
          b.sync_timestamp,
          COUNT(DISTINCT f.id) as actual_floors_count,
          COUNT(DISTINCT s.id) as actual_spaces_count
        FROM buildings b
        LEFT JOIN floors f ON b.id = f.building_id
        LEFT JOIN spaces s ON b.id = s.building_id
        WHERE b.id = ?
        GROUP BY b.id, b.name, b.description, b.exact_type, b.address_street, 
                 b.address_city, b.address_state, b.address_country, b.address_postal_code,
                 b.latitude, b.longitude, b.date_created, b.date_updated, 
                 b.floors_count, b.spaces_count, b.sync_timestamp
      `, [buildingId]);
      
      if (!building) {
        return NextResponse.json(
          { success: false, error: 'Building not found' },
          { status: 404 }
        );
      }
      
      // Get floors and spaces
      const floors = await runQuery(`
        SELECT 
          f.id,
          f.building_id,
          f.name,
          f.description,
          f.date_created,
          f.date_updated,
          f.spaces_count,
          f.sync_timestamp,
          COUNT(s.id) as actual_spaces_count
        FROM floors f
        LEFT JOIN spaces s ON f.id = s.floor_id
        WHERE f.building_id = ?
        GROUP BY f.id, f.building_id, f.name, f.description, f.date_created, 
                 f.date_updated, f.spaces_count, f.sync_timestamp
        ORDER BY f.name
      `, [buildingId]);
      
      const spaces = await runQuery(`
        SELECT s.*
        FROM spaces s
        WHERE s.building_id = ?
        ORDER BY s.floor_id, s.name
      `, [buildingId]);
      
      // Get recent energy data if requested
      let energyStats = null;
      if (includeStats) {
        energyStats = await runQuerySingle(`
          SELECT 
            AVG(consumption_kwh) as avg_consumption,
            SUM(consumption_kwh) as total_consumption,
            AVG(cost_usd) as avg_cost,
            SUM(cost_usd) as total_cost,
            AVG(efficiency_score) as avg_efficiency,
            COUNT(*) as record_count,
            MAX(timestamp) as latest_record
          FROM energy_usage
          WHERE building_id = ? AND timestamp >= (CURRENT_TIMESTAMP - INTERVAL '1 day')
        `, [buildingId]);
      }
      
      return NextResponse.json({
        success: true,
        data: {
          building: {
            ...building,
            floors,
            spaces: spaces.reduce((acc: any, space: any) => {
              if (!acc[space.floor_id]) acc[space.floor_id] = [];
              acc[space.floor_id].push(space);
              return acc;
            }, {})
          },
          energyStats
        }
      });
    }
    
    // Get all buildings with basic stats - simplified query for debugging
    const buildings = await runQuery(`
      SELECT 
        id,
        name,
        description,
        exact_type,
        address_street,
        address_city,
        address_state,
        address_country,
        address_postal_code,
        latitude,
        longitude,
        date_created,
        date_updated,
        floors_count,
        spaces_count,
        sync_timestamp
      FROM buildings
      ORDER BY name, id
    `);
    
    // Get energy stats for all buildings if requested
    let buildingsWithStats = buildings;
    if (includeStats) {
      const energyStats = await runQuery(`
        SELECT 
          building_id,
          AVG(consumption_kwh) as avg_consumption,
          SUM(consumption_kwh) as total_consumption,
          AVG(cost_usd) as avg_cost,
          SUM(cost_usd) as total_cost,
          AVG(efficiency_score) as avg_efficiency,
          COUNT(*) as record_count,
          MAX(timestamp) as latest_record
        FROM energy_usage
        WHERE timestamp >= (CURRENT_TIMESTAMP - INTERVAL '1 day')
        GROUP BY building_id
      `);
      
      const statsMap = energyStats.reduce((acc: any, stat: any) => {
        acc[stat.building_id] = {
          ...stat,
          avg_consumption: Number(stat.avg_consumption) || 0,
          total_consumption: Number(stat.total_consumption) || 0,
          avg_cost: Number(stat.avg_cost) || 0,
          total_cost: Number(stat.total_cost) || 0,
          avg_efficiency: Number(stat.avg_efficiency) || 0,
          record_count: Number(stat.record_count) || 0
        };
        return acc;
      }, {});
      
      buildingsWithStats = buildings.map((building: any) => ({
        ...building,
        energyStats: statsMap[building.id] || null
      }));
    }
    
    return NextResponse.json({
      success: true,
      data: {
        buildings: buildingsWithStats,
        totalCount: buildings.length
      }
    });
    
  } catch (error) {
    console.error('Buildings API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch buildings data', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}