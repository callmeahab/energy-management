import { NextApiRequest, NextApiResponse } from "next";
import { initializeDatabase, runQuery, runQuerySingle } from "../../lib/database";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    await initializeDatabase();

    const { buildingId, unitName } = req.query;

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: string[] = [];

    if (buildingId && typeof buildingId === "string") {
      conditions.push("p.building_id = ?");
      params.push(buildingId);
    }

    if (unitName && typeof unitName === "string") {
      conditions.push("p.unit_name = ?");
      params.push(unitName);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get sensors with latest values
    const sensorsQuery = `
      SELECT 
        p.*,
        ps.float64_value as latest_float64,
        ps.float32_value as latest_float32,
        ps.string_value as latest_string,
        ps.bool_value as latest_bool,
        ps.timestamp as latest_timestamp
      FROM points p
      LEFT JOIN point_series ps ON p.id = ps.point_id
      LEFT JOIN (
        SELECT point_id, MAX(timestamp) as max_timestamp
        FROM point_series
        GROUP BY point_id
      ) latest ON ps.point_id = latest.point_id AND ps.timestamp = latest.max_timestamp
      ${whereClause}
      ORDER BY p.building_id, p.floor_id, p.space_id, p.name
    `;

    const sensors = await runQuery(sensorsQuery, params);

    // Process sensors to determine latest values
    const processedSensors = sensors.map((sensor: any) => {
      let latest_value = null;
      
      if (sensor.latest_float64 !== null) {
        latest_value = sensor.latest_float64;
      } else if (sensor.latest_float32 !== null) {
        latest_value = sensor.latest_float32;
      } else if (sensor.latest_string !== null) {
        latest_value = sensor.latest_string;
      } else if (sensor.latest_bool !== null) {
        latest_value = sensor.latest_bool;
      }

      return {
        id: sensor.id,
        building_id: sensor.building_id,
        floor_id: sensor.floor_id,
        space_id: sensor.space_id,
        name: sensor.name,
        description: sensor.description,
        exact_type: sensor.exact_type,
        unit_name: sensor.unit_name,
        sync_timestamp: sensor.sync_timestamp,
        latest_value,
        latest_timestamp: sensor.latest_timestamp,
      };
    });

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_sensors,
        COUNT(CASE WHEN unit_name = 'Watt' THEN 1 END) as watts_sensors,
        COUNT(CASE WHEN unit_name LIKE '%Celsius%' OR unit_name LIKE '%Fahrenheit%' THEN 1 END) as temperature_sensors,
        COUNT(CASE WHEN unit_name != 'Watt' AND unit_name NOT LIKE '%Celsius%' AND unit_name NOT LIKE '%Fahrenheit%' THEN 1 END) as other_sensors
      FROM points p
      ${whereClause}
    `;

    const summaryResult = await runQuerySingle(summaryQuery, params);

    // Get latest reading timestamp
    const latestReadingQuery = `
      SELECT MAX(ps.timestamp) as latest_reading
      FROM points p
      JOIN point_series ps ON p.id = ps.point_id
      ${whereClause}
    `;

    const latestResult = await runQuerySingle(latestReadingQuery, params);

    const summary = {
      total_sensors: summaryResult?.total_sensors || 0,
      watts_sensors: summaryResult?.watts_sensors || 0,
      temperature_sensors: summaryResult?.temperature_sensors || 0,
      other_sensors: summaryResult?.other_sensors || 0,
      latest_reading: latestResult?.latest_reading || null,
    };

    return res.status(200).json({
      success: true,
      data: {
        sensors: processedSensors,
        summary,
      },
    });

  } catch (error) {
    console.error("Error fetching sensor data:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch sensor data",
    });
  }
}