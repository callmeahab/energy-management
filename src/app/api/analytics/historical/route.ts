import { NextRequest, NextResponse } from 'next/server';
import { runQuery, runQuerySingle, initializeDatabase } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    await initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || 'week'; // day, week, month, year
    const buildingId = searchParams.get('buildingId');
    
    // Calculate date range based on timeRange parameter
    const now = new Date();
    let startDate: Date;
    let endDate = now;
    
    switch (timeRange) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get historical energy consumption data
    const energyConsumptionQuery = buildingId 
      ? `SELECT 
           DATE(timestamp) as date,
           SUM(consumption_kwh) as total_consumption,
           SUM(cost_usd) as total_cost,
           AVG(efficiency_score) as avg_efficiency,
           COUNT(*) as sensor_count
         FROM energy_usage 
         WHERE timestamp >= ? AND timestamp <= ? AND building_id = ?
         GROUP BY DATE(timestamp)
         ORDER BY date ASC`
      : `SELECT 
           DATE(timestamp) as date,
           SUM(consumption_kwh) as total_consumption,
           SUM(cost_usd) as total_cost,
           AVG(efficiency_score) as avg_efficiency,
           COUNT(*) as sensor_count
         FROM energy_usage 
         WHERE timestamp >= ? AND timestamp <= ?
         GROUP BY DATE(timestamp)
         ORDER BY date ASC`;

    const queryParams = buildingId 
      ? [startDate.toISOString(), endDate.toISOString(), buildingId]
      : [startDate.toISOString(), endDate.toISOString()];

    const energyData = await runQuery(energyConsumptionQuery, queryParams);

    // Generate mock occupancy data since occupancy_data table was removed
    // TODO: Replace with actual occupancy data from GraphQL when available
    const occupancyData = energyData.map((energyDay: any, index: number) => ({
      date: energyDay.date,
      avg_occupancy: 35 + Math.sin(index * 0.5) * 15 + Math.random() * 10, // Mock 20-60% occupancy
      total_people: Math.floor(8 + Math.sin(index * 0.3) * 4 + Math.random() * 6) // Mock 2-18 people
    }));

    // Generate mock appliance data since appliance_efficiency table was removed  
    // TODO: Replace with actual appliance data from GraphQL when available
    const mockAppliances = [
      { type: 'HVAC', name: 'Central Air System 1', baseConsumption: 45 },
      { type: 'Lighting', name: 'LED Panel Array', baseConsumption: 12 },
      { type: 'Computing', name: 'Server Room Equipment', baseConsumption: 28 },
      { type: 'HVAC', name: 'Heat Pump Unit 2', baseConsumption: 38 },
      { type: 'Lighting', name: 'Emergency Exit Lighting', baseConsumption: 3 },
      { type: 'Equipment', name: 'Elevator Motors', baseConsumption: 22 },
      { type: 'HVAC', name: 'Ventilation System', baseConsumption: 18 },
      { type: 'Security', name: 'Access Control System', baseConsumption: 5 }
    ];

    const applianceData = mockAppliances.slice(0, 6).map((appliance, index) => ({
      appliance_type: appliance.type,
      appliance_name: appliance.name,
      avg_consumption: appliance.baseConsumption + Math.random() * 10,
      avg_efficiency: 0.7 + Math.random() * 0.25, // 70-95% efficiency
      days_tracked: Math.min(energyData.length, 30),
      latest_issues: index < 2 ? 'Minor efficiency degradation detected' : null,
      latest_recommendations: index < 2 ? 'Schedule maintenance check' : 'Operating optimally'
    }));

    // Calculate savings opportunities based on historical patterns
    const totalConsumption = energyData.reduce((sum: number, day: any) => sum + (day.total_consumption || 0), 0);
    const totalCost = energyData.reduce((sum: number, day: any) => sum + (day.total_cost || 0), 0);
    const avgEfficiency = energyData.length > 0 
      ? energyData.reduce((sum: number, day: any) => sum + (day.avg_efficiency || 0), 0) / energyData.length 
      : 0;

    // Calculate potential savings based on efficiency improvements
    const potentialEfficiencyGain = Math.max(0, 0.85 - avgEfficiency); // Assume 85% is optimal efficiency
    const potentialSavings = totalCost * potentialEfficiencyGain;
    

    // Merge energy and occupancy data by date
    const combinedData = energyData.map((energyDay: any) => {
      const occupancyDay = occupancyData.find((occ: any) => occ.date === energyDay.date);
      return {
        ...energyDay,
        occupancy_percentage: occupancyDay?.avg_occupancy || 0,
        total_people: occupancyDay?.total_people || 0,
        // Calculate efficiency per person
        efficiency_per_person: occupancyDay?.total_people > 0 
          ? energyDay.total_consumption / occupancyDay.total_people 
          : energyDay.total_consumption,
        // Calculate cost per person
        cost_per_person: occupancyDay?.total_people > 0 
          ? energyDay.total_cost / occupancyDay.total_people 
          : energyDay.total_cost,
        // Calculate daily savings potential
        daily_savings_potential: (energyDay.total_cost * potentialEfficiencyGain)
      };
    });

    // If we only have one day of data, generate some additional context for better visualization
    if (combinedData.length === 1 && timeRange !== 'day') {
      console.log(`Only found ${combinedData.length} day of data, consider seeding historical data via POST /api/analytics/seed-historical`);
    }

    // Calculate trends
    const getWeekOverWeekTrend = () => {
      if (combinedData.length < 7) return 0;
      const thisWeekData = combinedData.slice(-7);
      const lastWeekData = combinedData.slice(-14, -7);
      
      const thisWeekAvg = thisWeekData.reduce((sum: number, day: any) => sum + day.total_consumption, 0) / 7;
      const lastWeekAvg = lastWeekData.reduce((sum: number, day: any) => sum + day.total_consumption, 0) / 7;
      
      return lastWeekAvg > 0 ? ((thisWeekAvg - lastWeekAvg) / lastWeekAvg) * 100 : 0;
    };

    const getCostTrend = () => {
      if (combinedData.length < 7) return 0;
      const thisWeekData = combinedData.slice(-7);
      const lastWeekData = combinedData.slice(-14, -7);
      
      const thisWeekCost = thisWeekData.reduce((sum: number, day: any) => sum + day.total_cost, 0) / 7;
      const lastWeekCost = lastWeekData.reduce((sum: number, day: any) => sum + day.total_cost, 0) / 7;
      
      return lastWeekCost > 0 ? ((thisWeekCost - lastWeekCost) / lastWeekCost) * 100 : 0;
    };

    // Peak usage analysis
    const peakUsageHours = await runQuery(`
      SELECT 
        CASE 
          WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 6 AND 8 THEN '6 AM - 9 AM'
          WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 9 AND 11 THEN '9 AM - 12 PM' 
          WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 12 AND 14 THEN '12 PM - 3 PM'
          WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 15 AND 17 THEN '3 PM - 6 PM'
          WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 18 AND 20 THEN '6 PM - 9 PM'
          ELSE 'Other'
        END as time_period,
        SUM(consumption_kwh) as total_consumption,
        SUM(cost_usd) as total_cost,
        COUNT(*) as reading_count
      FROM energy_usage 
      WHERE timestamp >= ? AND timestamp <= ? ${buildingId ? 'AND building_id = ?' : ''}
      GROUP BY time_period
      ORDER BY total_consumption DESC
    `, queryParams);

    return NextResponse.json({
      success: true,
      data: {
        timeRange,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        summary: {
          totalConsumption,
          totalCost,
          avgEfficiency: Math.round(avgEfficiency * 100) / 100,
          consumptionTrend: Math.round(getWeekOverWeekTrend() * 100) / 100,
          costTrend: Math.round(getCostTrend() * 100) / 100,
          potentialSavings: Math.round(potentialSavings * 100) / 100,
          totalSavingsPotential: Math.round(potentialSavings * 100) / 100
        },
        dailyData: combinedData.map((day: any) => ({
          date: day.date,
          consumption: Math.round(day.total_consumption * 100) / 100,
          cost: Math.round(day.total_cost * 100) / 100,
          efficiency: Math.round(day.avg_efficiency * 100) / 100,
          occupancy: Math.round(day.occupancy_percentage),
          savingsPotential: Math.round(day.daily_savings_potential * 100) / 100,
          efficiencyPerPerson: Math.round(day.efficiency_per_person * 100) / 100,
          costPerPerson: Math.round(day.cost_per_person * 100) / 100
        })),
        peakUsageHours: peakUsageHours.map((period: any) => ({
          name: period.time_period,
          consumption: Math.round(period.total_consumption * 100) / 100,
          cost: Math.round(period.total_cost * 100) / 100,
          percentage: Math.round((period.total_consumption / totalConsumption) * 100)
        })),
        applianceInsights: applianceData.map((appliance: any) => ({
          name: appliance.appliance_name,
          type: appliance.appliance_type,
          consumption: Math.round(appliance.avg_consumption * 100) / 100,
          efficiency: Math.round(appliance.avg_efficiency * 100) / 100,
          daysTracked: appliance.days_tracked,
          issues: appliance.latest_issues,
          recommendations: appliance.latest_recommendations
        })),
        buildingId: buildingId || 'all',
        recordCount: energyData.length
      }
    });

  } catch (error) {
    console.error('Historical analytics API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get historical analytics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}