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

    const { buildingId, startTime, endTime } = req.query;

    // Build WHERE conditions
    const conditions: string[] = [];
    const params: string[] = [];

    if (buildingId && typeof buildingId === "string") {
      conditions.push("building_id = ?");
      params.push(buildingId);
    }

    if (startTime && typeof startTime === "string") {
      conditions.push("timestamp >= ?");
      params.push(startTime);
    }

    if (endTime && typeof endTime === "string") {
      conditions.push("timestamp <= ?");
      params.push(endTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get energy consumption records
    const consumptionQuery = `
      SELECT *
      FROM energy_consumption
      ${whereClause}
      ORDER BY timestamp DESC
    `;

    const consumption = await runQuery(consumptionQuery, params);

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_records,
        COALESCE(SUM(total_watts), 0) as total_watts,
        COALESCE(SUM(total_kwh), 0) as total_kwh,
        COALESCE(AVG(total_watts), 0) as avg_watts,
        MAX(calculation_timestamp) as latest_calculation
      FROM energy_consumption
      ${whereClause}
    `;

    const summaryResult = await runQuerySingle(summaryQuery, params);

    const summary = {
      total_records: summaryResult?.total_records || 0,
      total_watts: summaryResult?.total_watts || 0,
      total_kwh: summaryResult?.total_kwh || 0,
      avg_watts: summaryResult?.avg_watts || 0,
      latest_calculation: summaryResult?.latest_calculation || null,
    };

    return res.status(200).json({
      success: true,
      data: {
        consumption,
        summary,
      },
    });

  } catch (error) {
    console.error("Error fetching energy consumption data:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch energy consumption data",
    });
  }
}