import { NextRequest, NextResponse } from 'next/server';
import { runCommand, runQuery, initializeDatabase } from '@/lib/database';

// Generate realistic historical data for the past 30 days
export async function POST(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');
    
    console.log(`Generating ${days} days of historical energy data...`);
    
    const now = new Date();
    const records = [];
    
    // Get existing buildings to use as data sources
    const buildings = await runQuery('SELECT id FROM buildings LIMIT 1');
    const buildingId = buildings.length > 0 ? buildings[0].id : 'demo_building_1';
    
    for (let dayOffset = days; dayOffset > 0; dayOffset--) {
      const date = new Date(now);
      date.setDate(date.getDate() - dayOffset);
      
      // Generate 24 hourly readings per day
      for (let hour = 0; hour < 24; hour++) {
        const timestamp = new Date(date);
        timestamp.setHours(hour, 0, 0, 0);
        
        // Generate realistic consumption patterns
        // Higher consumption during business hours (9 AM - 6 PM)
        let baseConsumption;
        if (hour >= 9 && hour <= 18) {
          baseConsumption = 15 + Math.random() * 25; // 15-40 kWh during business hours
        } else if (hour >= 6 && hour <= 9 || hour >= 18 && hour <= 22) {
          baseConsumption = 8 + Math.random() * 12; // 8-20 kWh during evening/morning
        } else {
          baseConsumption = 3 + Math.random() * 7; // 3-10 kWh during night
        }
        
        // Add some weekly and seasonal variation
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const weekendMultiplier = isWeekend ? 0.6 : 1.0; // Lower consumption on weekends
        
        // Add some randomness and trends
        const trendFactor = 1 + (Math.random() - 0.5) * 0.2; // ±10% variation
        const seasonalFactor = 1 + Math.sin((dayOffset / days) * Math.PI) * 0.15; // Seasonal variation
        
        const consumption = baseConsumption * weekendMultiplier * trendFactor * seasonalFactor;
        const cost = consumption * (0.10 + Math.random() * 0.08); // $0.10-$0.18 per kWh
        const efficiency = 0.65 + Math.random() * 0.3; // 65-95% efficiency
        
        const energyId = `${buildingId}_historical_${timestamp.getTime()}`;
        
        records.push({
          id: energyId,
          building_id: buildingId,
          timestamp: timestamp.toISOString(),
          consumption_kwh: Math.round(consumption * 100) / 100,
          cost_usd: Math.round(cost * 100) / 100,
          efficiency_score: Math.round(efficiency * 100) / 100,
          usage_type: 'simulated',
          source: 'historical_seed',
          sync_timestamp: now.toISOString()
        });
      }
    }
    
    console.log(`Generated ${records.length} historical energy records`);
    
    // Insert only energy records (occupancy and appliance tables were removed)
    for (const record of records) {
      try {
        await runCommand(`
          INSERT OR IGNORE INTO energy_usage (
            id, building_id, timestamp, consumption_kwh, cost_usd, 
            efficiency_score, usage_type, source, sync_timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          record.id, record.building_id, record.timestamp,
          record.consumption_kwh, record.cost_usd, record.efficiency_score,
          record.usage_type, record.source, record.sync_timestamp
        ]);
      } catch (error) {
        console.error('Error inserting energy record:', error);
      }
    }
    
    // Get final count
    const finalStats = await runQuery('SELECT COUNT(*) as count FROM energy_usage WHERE source = ?', ['historical_seed']);
    
    return NextResponse.json({
      success: true,
      message: `Successfully generated ${days} days of historical energy data`,
      data: {
        daysGenerated: days,
        recordsCreated: {
          energy: finalStats[0].count,
          total: finalStats[0].count
        }
      }
    });
    
  } catch (error) {
    console.error('Historical data seeding error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate historical data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}