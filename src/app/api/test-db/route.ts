import { NextResponse } from 'next/server';
import { initializeDatabase, runQuery } from '@/lib/database';

export async function GET() {
  try {
    await initializeDatabase();
    
    // Check database contents 
    const buildingCount = await runQuery('SELECT COUNT(*) as count FROM buildings');
    const energyCount = await runQuery('SELECT COUNT(*) as count FROM energy_usage');
    const buildingSample = await runQuery('SELECT id, name FROM buildings ORDER BY sync_timestamp DESC LIMIT 5');
    const energySample = await runQuery('SELECT building_id, timestamp, consumption_kwh FROM energy_usage ORDER BY timestamp DESC LIMIT 5');
    
    // Check problematic building details
    const intellicareBuilding = await runQuery(`
      SELECT * FROM buildings 
      WHERE id = 'BLDG5o26DguWKu5T9nRvSYn5Em'
    `);
    
    return NextResponse.json({
      success: true,
      message: 'SQLite connection successful',
      data: {
        buildingCount: Number(buildingCount[0]?.count || 0),
        energyCount: Number(energyCount[0]?.count || 0),
        buildingSample,
        energySample,
        intellicareBuilding: intellicareBuilding[0] || null
      }
    });
    
  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Database test failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}