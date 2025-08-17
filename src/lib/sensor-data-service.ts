import { runCommand, runQuery, runQuerySingle } from './database';
import {
  EnergyPointsResponse,
  SensorPoint,
  PointEntity,
  PointSeriesEntity,
  EnergyConsumptionEntity,
  CreatePointEntity,
  CreatePointSeriesEntity,
  CreateEnergyConsumptionEntity,
  Building,
  BuildingFloor,
  BuildingSpace
} from './types/sensors';

// Store all sensor data from GraphQL response
export async function storeSensorData(response: EnergyPointsResponse): Promise<void> {
  console.log('Storing sensor data from GraphQL response...');
  
  for (const building of response.data.buildings) {
    // Store building-level points
    await storePointsForLocation(building.points, building.id);
    
    // Store floor-level points
    for (const floor of building.floors) {
      await storePointsForLocation(floor.points, building.id, floor.id);
      
      // Store space-level points
      for (const space of floor.spaces) {
        await storePointsForLocation(space.points, building.id, floor.id, space.id);
      }
    }
  }
  
  console.log('Sensor data storage completed');
}

// Store points for a specific location (building, floor, or space)
async function storePointsForLocation(
  points: SensorPoint[], 
  buildingId: string, 
  floorId?: string, 
  spaceId?: string
): Promise<void> {
  for (const point of points) {
    // Store or update point metadata
    await upsertPoint({
      id: point.id,
      building_id: buildingId,
      floor_id: floorId,
      space_id: spaceId,
      name: point.name,
      description: point.description,
      exact_type: point.exactType,
      unit_name: point.unit.name
    });
    
    // Store time series data
    for (const series of point.series) {
      await upsertPointSeries({
        id: `${point.id}_${series.timestamp}`,
        point_id: point.id,
        timestamp: series.timestamp,
        float64_value: series.value.float64Value,
        float32_value: series.value.float32Value,
        string_value: series.value.stringValue,
        bool_value: series.value.boolValue
      });
    }
  }
}

// Insert or update point metadata
async function upsertPoint(point: CreatePointEntity): Promise<void> {
  const sql = `
    INSERT OR REPLACE INTO points (
      id, building_id, floor_id, space_id, name, description, exact_type, unit_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  await runCommand(sql, [
    point.id,
    point.building_id,
    point.floor_id,
    point.space_id,
    point.name,
    point.description,
    point.exact_type,
    point.unit_name
  ]);
}

// Insert or update point series data
async function upsertPointSeries(series: CreatePointSeriesEntity): Promise<void> {
  const sql = `
    INSERT OR REPLACE INTO point_series (
      id, point_id, timestamp, float64_value, float32_value, string_value, bool_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  await runCommand(sql, [
    series.id,
    series.point_id,
    series.timestamp,
    series.float64_value,
    series.float32_value,
    series.string_value,
    series.bool_value
  ]);
}

// Calculate and store total energy consumption from watts sensors
export async function calculateAndStoreEnergyConsumption(): Promise<void> {
  console.log('Calculating energy consumption from watts sensors...');
  
  // Get all watts sensors grouped by location and timestamp
  const wattsDataSql = `
    SELECT 
      p.building_id,
      p.floor_id,
      p.space_id,
      ps.timestamp,
      COALESCE(ps.float64_value, ps.float32_value, 0) as watt_value
    FROM points p
    JOIN point_series ps ON p.id = ps.point_id
    WHERE p.unit_name = 'Watt'
      AND (ps.float64_value IS NOT NULL OR ps.float32_value IS NOT NULL)
    ORDER BY p.building_id, p.floor_id, p.space_id, ps.timestamp
  `;
  
  const wattsData = await runQuery<{
    building_id: string;
    floor_id?: string;
    space_id?: string;
    timestamp: string;
    watt_value: number;
  }>(wattsDataSql);
  
  // Group by location and timestamp, sum watts
  const consumptionMap = new Map<string, {
    building_id: string;
    floor_id?: string;
    space_id?: string;
    timestamp: string;
    total_watts: number;
  }>();
  
  for (const row of wattsData) {
    const key = `${row.building_id}_${row.floor_id || 'null'}_${row.space_id || 'null'}_${row.timestamp}`;
    
    if (consumptionMap.has(key)) {
      consumptionMap.get(key)!.total_watts += row.watt_value;
    } else {
      consumptionMap.set(key, {
        building_id: row.building_id,
        floor_id: row.floor_id,
        space_id: row.space_id,
        timestamp: row.timestamp,
        total_watts: row.watt_value
      });
    }
  }
  
  // Store calculated consumption data
  for (const [key, consumption] of consumptionMap) {
    // Convert watts to kWh (assuming timestamp intervals, simplified to instant reading)
    const totalKwh = consumption.total_watts / 1000; // Simple conversion for demonstration
    
    await upsertEnergyConsumption({
      id: key,
      building_id: consumption.building_id,
      floor_id: consumption.floor_id,
      space_id: consumption.space_id,
      timestamp: consumption.timestamp,
      total_watts: consumption.total_watts,
      total_kwh: totalKwh
    });
  }
  
  console.log(`Stored ${consumptionMap.size} energy consumption records`);
}

// Insert or update energy consumption record
async function upsertEnergyConsumption(consumption: CreateEnergyConsumptionEntity): Promise<void> {
  const sql = `
    INSERT OR REPLACE INTO energy_consumption (
      id, building_id, floor_id, space_id, timestamp, total_watts, total_kwh
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  await runCommand(sql, [
    consumption.id,
    consumption.building_id,
    consumption.floor_id,
    consumption.space_id,
    consumption.timestamp,
    consumption.total_watts,
    consumption.total_kwh
  ]);
}

// Query functions for retrieving sensor data

export async function getPointsByLocation(
  buildingId: string, 
  floorId?: string, 
  spaceId?: string
): Promise<PointEntity[]> {
  let sql = 'SELECT * FROM points WHERE building_id = ?';
  const params: (string | undefined)[] = [buildingId];
  
  if (floorId) {
    sql += ' AND floor_id = ?';
    params.push(floorId);
  }
  
  if (spaceId) {
    sql += ' AND space_id = ?';
    params.push(spaceId);
  }
  
  return runQuery<PointEntity>(sql, params);
}

export async function getWattsSensors(buildingId?: string): Promise<PointEntity[]> {
  let sql = "SELECT * FROM points WHERE unit_name = 'Watt'";
  const params: string[] = [];
  
  if (buildingId) {
    sql += ' AND building_id = ?';
    params.push(buildingId);
  }
  
  sql += ' ORDER BY building_id, floor_id, space_id, name';
  
  return runQuery<PointEntity>(sql, params);
}

export async function getLatestPointSeries(pointId: string): Promise<PointSeriesEntity | null> {
  const sql = `
    SELECT * FROM point_series 
    WHERE point_id = ? 
    ORDER BY timestamp DESC 
    LIMIT 1
  `;
  
  return runQuerySingle<PointSeriesEntity>(sql, [pointId]);
}

export async function getEnergyConsumptionByBuilding(
  buildingId: string, 
  startTime?: string, 
  endTime?: string
): Promise<EnergyConsumptionEntity[]> {
  let sql = 'SELECT * FROM energy_consumption WHERE building_id = ?';
  const params: string[] = [buildingId];
  
  if (startTime) {
    sql += ' AND timestamp >= ?';
    params.push(startTime);
  }
  
  if (endTime) {
    sql += ' AND timestamp <= ?';
    params.push(endTime);
  }
  
  sql += ' ORDER BY timestamp DESC';
  
  return runQuery<EnergyConsumptionEntity>(sql, params);
}

export async function getTotalEnergyConsumption(
  buildingId?: string,
  startTime?: string,
  endTime?: string
): Promise<{ total_watts: number; total_kwh: number } | null> {
  let sql = 'SELECT SUM(total_watts) as total_watts, SUM(total_kwh) as total_kwh FROM energy_consumption WHERE 1=1';
  const params: string[] = [];
  
  if (buildingId) {
    sql += ' AND building_id = ?';
    params.push(buildingId);
  }
  
  if (startTime) {
    sql += ' AND timestamp >= ?';
    params.push(startTime);
  }
  
  if (endTime) {
    sql += ' AND timestamp <= ?';
    params.push(endTime);
  }
  
  return runQuerySingle<{ total_watts: number; total_kwh: number }>(sql, params);
}