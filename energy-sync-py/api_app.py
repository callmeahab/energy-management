from __future__ import annotations

import os
import json
import math
import time
import sqlite3
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import Database


logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------------
# FastAPI app setup
# ----------------------------------------------------------------------------

app = FastAPI(title="Energy Efficiency API (FastAPI)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------------------
# Helpers: time range utils (ported from src/lib/time-range-utils.ts)
# ----------------------------------------------------------------------------


class TimeRangeConfig:
    def __init__(self, sql_trunc: str, sql_format: str, aggregation: str):
        self.sqlTrunc = sql_trunc
        self.sqlFormat = sql_format
        self.aggregation = aggregation


def get_time_range_config(time_range: str) -> TimeRangeConfig:
    if time_range == "day":
        return TimeRangeConfig(
            sql_trunc="minute", sql_format="%Y-%m-%d %H:%M:00", aggregation="30minute"
        )
    if time_range == "week":
        return TimeRangeConfig(
            sql_trunc="day", sql_format="%Y-%m-%d", aggregation="daily"
        )
    if time_range == "month":
        return TimeRangeConfig(
            sql_trunc="day", sql_format="%Y-%m-%d", aggregation="daily"
        )
    return get_time_range_config("day")


def get_time_range_duration_ms(time_range: str) -> int:
    if time_range == "day":
        return 24 * 60 * 60 * 1000
    if time_range == "week":
        return 7 * 24 * 60 * 60 * 1000
    if time_range == "month":
        return 30 * 24 * 60 * 60 * 1000
    return 24 * 60 * 60 * 1000


def format_chart_label(
    period_iso: str, time_range: str, index: Optional[int] = None
) -> str:
    try:
        dt = datetime.fromisoformat(period_iso.replace("Z", "+00:00"))
    except Exception:
        # Fallback: attempt to parse partial strings
        try:
            dt = datetime.strptime(period_iso.split(" ")[0], "%Y-%m-%d")
        except Exception:
            dt = datetime.now(timezone.utc)

    if time_range == "day":
        return dt.strftime("%I:%M %p").lstrip("0")
    if time_range == "week":
        return dt.strftime("%a")
    if time_range == "month":
        return dt.strftime("%b %d")
    return dt.isoformat()


# ----------------------------------------------------------------------------
# Helpers: EIA Balancing Authorities (ported from src/lib/eia-balancing-authorities.ts)
# ----------------------------------------------------------------------------

BALANCING_AUTHORITIES: List[Dict[str, Any]] = [
    {
        "code": "NYIS",
        "name": "New York ISO",
        "latitude": 42.9,
        "longitude": -75.5,
        "region": "Northeast",
    },
    {
        "code": "PJM",
        "name": "PJM Interconnection",
        "latitude": 40.0,
        "longitude": -79.5,
        "region": "Mid-Atlantic",
    },
    {
        "code": "MISO",
        "name": "Midcontinent ISO",
        "latitude": 43.5,
        "longitude": -91.0,
        "region": "Midwest",
    },
    {
        "code": "CAISO",
        "name": "California ISO",
        "latitude": 37.2,
        "longitude": -120.5,
        "region": "West",
    },
    {
        "code": "SPP",
        "name": "Southwest Power Pool",
        "latitude": 37.5,
        "longitude": -98.5,
        "region": "Central",
    },
    {
        "code": "ERCOT",
        "name": "ERCOT (Texas)",
        "latitude": 31.0,
        "longitude": -99.0,
        "region": "Texas",
    },
    {
        "code": "ISNE",
        "name": "ISO New England",
        "latitude": 43.7,
        "longitude": -71.5,
        "region": "Northeast",
    },
    {
        "code": "SOCO",
        "name": "Southern Company",
        "latitude": 33.0,
        "longitude": -85.5,
        "region": "Southeast",
    },
    {
        "code": "TVA",
        "name": "Tennessee Valley Authority",
        "latitude": 35.8,
        "longitude": -86.0,
        "region": "Southeast",
    },
    {
        "code": "BPAT",
        "name": "Bonneville Power",
        "latitude": 45.7,
        "longitude": -120.5,
        "region": "Northwest",
    },
]


# ----------------------------------------------------------------------------
# DB access
# ----------------------------------------------------------------------------

db = Database()

# ----------------------------------------------------------------------------
# Routes: Maintenance - Backfill half-hour energy consumption
# ----------------------------------------------------------------------------


@app.post("/api/maintenance/backfill-energy")
def backfill_energy(
    startTime: Optional[str] = Query(default=None),
    endTime: Optional[str] = Query(default=None),
    rebuild: bool = Query(default=False),
):
    try:
        ensure_initialized()
        count = db.backfill_energy_consumption(
            start_time=startTime, end_time=endTime, rebuild=rebuild
        )
        return JSONResponse({"success": True, "recordsProcessed": count})
    except Exception as e:
        logger.exception("Backfill API error")
        raise HTTPException(status_code=500, detail=str(e))


def ensure_initialized() -> None:
    # Initialize schema if not present
    db.initialize()


@app.get("/api/health")
def health():
    return {"ok": True}


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    cur = conn.cursor()
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
    )
    return cur.fetchone() is not None


# ----------------------------------------------------------------------------
# Routes: Energy (mirrors src/app/api/energy/route.ts)
# ----------------------------------------------------------------------------


@app.get("/api/energy")
def get_energy(
    buildingId: Optional[str] = Query(default=None),
    timeRange: str = Query(default="day"),
    aggregation: str = Query(default="hourly"),
):
    try:
        ensure_initialized()

        # Map API time range variants to canonical values
        time_range_map = {
            "24h": "day",
            "7d": "week",
            "30d": "month",
            "day": "day",
            "week": "week",
            "month": "month",
        }
        time_range_canonical = time_range_map.get(timeRange, "day")

        now = datetime.now(timezone.utc)
        duration_ms = get_time_range_duration_ms(time_range_canonical)
        start_time = now - timedelta(milliseconds=duration_ms)

        config = get_time_range_config(time_range_canonical)

        start_iso = start_time.isoformat()

        where_clauses: List[str] = ["e.timestamp >= ?"]
        params: List[Any] = [start_iso]
        if buildingId:
            where_clauses.append("e.building_id = ?")
            params.append(buildingId)
        where_sql = " WHERE " + " AND ".join(where_clauses)

        used_agg = (
            config.aggregation if aggregation in ("hourly", "daily") else aggregation
        )

        with db.get_connection() as conn:
            cur = conn.cursor()

            if used_agg in ("minute", "30minute", "hourly", "daily", "weekly"):
                if used_agg == "30minute":
                    sql = f"""
                        SELECT 
                          strftime('%Y-%m-%d %H:', e.timestamp) || 
                          CASE WHEN CAST(strftime('%M', e.timestamp) AS INTEGER) < 30 THEN '00:00' ELSE '30:00' END as period,
                          AVG(e.total_kwh) as avg_consumption,
                          AVG(e.total_kwh) as total_consumption,
                          AVG(e.total_kwh * 0.12) as avg_cost,
                          AVG(e.total_kwh * 0.12) as total_cost,
                          75.0 as avg_efficiency,
                          COUNT(*) as record_count
                        FROM energy_consumption e
                        {where_sql}
                        GROUP BY strftime('%Y-%m-%d %H:', e.timestamp) || 
                          CASE WHEN CAST(strftime('%M', e.timestamp) AS INTEGER) < 30 THEN '00:00' ELSE '30:00' END
                        ORDER BY period ASC
                        LIMIT 100
                    """
                else:
                    sql = f"""
                        SELECT 
                          strftime('{config.sqlFormat}', e.timestamp) as period,
                          AVG(e.total_kwh) as avg_consumption,
                          AVG(e.total_kwh) as total_consumption,
                          AVG(e.total_kwh * 0.12) as avg_cost,
                          AVG(e.total_kwh * 0.12) as total_cost,
                          75.0 as avg_efficiency,
                          COUNT(*) as record_count
                        FROM energy_consumption e
                        {where_sql}
                        GROUP BY strftime('{config.sqlFormat}', e.timestamp)
                        ORDER BY period ASC
                        LIMIT 100
                    """
            else:
                sql = f"""
                    SELECT 
                      e.id,
                      e.building_id,
                      e.floor_id,
                      e.space_id,
                      e.timestamp,
                      e.total_kwh as consumption_kwh,
                      e.total_kwh * 0.12 as cost_usd,
                      75.0 as efficiency_score,
                      'power' as usage_type,
                      'sensor-calculated' as source,
                      e.calculation_timestamp as sync_timestamp,
                      b.name as building_name,
                      f.name as floor_name,
                      s.name as space_name
                    FROM energy_consumption e
                    LEFT JOIN buildings b ON e.building_id = b.id
                    LEFT JOIN floors f ON e.floor_id = f.id
                    LEFT JOIN spaces s ON e.space_id = s.id
                    {where_sql}
                    ORDER BY e.timestamp DESC
                    LIMIT 1000
                """

            cur.execute(sql, params)
            rows = [
                dict(zip([c[0] for c in cur.description], r)) for r in cur.fetchall()
            ]

            # Add labels
            energy_data = []
            for idx, item in enumerate(rows):
                period_or_ts = (
                    item.get("period") or item.get("timestamp") or now.isoformat()
                )
                item["label"] = format_chart_label(
                    str(period_or_ts), time_range_canonical, idx
                )
                energy_data.append(item)

            # Summary using aggregated periods
            summary_sql = f"""
                WITH period_totals AS (
                  SELECT 
                    strftime('{config.sqlFormat}', e.timestamp) as period,
                    AVG(e.total_kwh) as period_consumption,
                    AVG(e.total_kwh * 0.12) as period_cost,
                    75.0 as period_efficiency
                  FROM energy_consumption e
                  {where_sql}
                  GROUP BY strftime('{config.sqlFormat}', e.timestamp)
                )
                SELECT 
                  COUNT(*) as total_periods,
                  COUNT(*) as total_records,
                  AVG(period_consumption) as avg_consumption,
                  SUM(period_consumption) as total_consumption,
                  AVG(period_cost) as avg_cost,
                  SUM(period_cost) as total_cost,
                  AVG(period_efficiency) as avg_efficiency,
                  (SELECT strftime('%Y-%m-%d %H:%M:%S', MIN(timestamp)) FROM energy_consumption e {where_sql}) as earliest_record,
                  (SELECT strftime('%Y-%m-%d %H:%M:%S', MAX(timestamp)) FROM energy_consumption e {where_sql}) as latest_record
                FROM period_totals
            """
            summary_params = params * 3
            cur.execute(summary_sql, summary_params)
            summary_row = cur.fetchone()
            if summary_row:
                columns = [c[0] for c in cur.description]
                summary = dict(zip(columns, summary_row))
            else:
                summary = {}

        return JSONResponse(
            {
                "success": True,
                "data": {
                    "energyData": energy_data,
                    "summary": summary,
                    "filters": {
                        "buildingId": buildingId,
                        "timeRange": time_range_canonical,
                        "aggregation": used_agg,
                        "startTime": start_time.isoformat(),
                        "endTime": now.isoformat(),
                    },
                    "config": {
                        "timeRange": time_range_canonical,
                        "sqlTrunc": config.sqlTrunc,
                        "sqlFormat": config.sqlFormat,
                        "aggregation": config.aggregation,
                    },
                },
            }
        )
    except Exception as e:
        logger.exception("Energy API error")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: Buildings
# ----------------------------------------------------------------------------


@app.get("/api/buildings")
def get_buildings(
    includeStats: bool = Query(default=False), id: Optional[str] = Query(default=None)
):
    try:
        ensure_initialized()
        with db.get_connection() as conn:
            cur = conn.cursor()

            if id:
                cur.execute(
                    """
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
                      b.sync_timestamp,
                      COUNT(DISTINCT f.id) as floors_count,
                      COUNT(DISTINCT s.id) as spaces_count
                    FROM buildings b
                    LEFT JOIN floors f ON b.id = f.building_id
                    LEFT JOIN spaces s ON b.id = s.building_id
                    WHERE b.id = ?
                    GROUP BY b.id, b.name, b.description, b.exact_type, b.address_street, 
                             b.address_city, b.address_state, b.address_country, b.address_postal_code,
                             b.latitude, b.longitude, b.date_created, b.date_updated, b.sync_timestamp
                    """,
                    (id,),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Building not found")
                columns = [c[0] for c in cur.description]
                building = dict(zip(columns, row))

                # Floors
                cur.execute(
                    """
                    SELECT 
                      f.id,
                      f.building_id,
                      f.name,
                      f.description,
                      f.date_created,
                      f.date_updated,
                      f.sync_timestamp,
                      COUNT(s.id) as spaces_count
                    FROM floors f
                    LEFT JOIN spaces s ON f.id = s.floor_id
                    WHERE f.building_id = ?
                    GROUP BY f.id, f.building_id, f.name, f.description, f.date_created, 
                             f.date_updated, f.sync_timestamp
                    ORDER BY f.name
                    """,
                    (id,),
                )
                floors = [
                    dict(zip([c[0] for c in cur.description], r))
                    for r in cur.fetchall()
                ]

                # Spaces
                cur.execute(
                    "SELECT s.* FROM spaces s WHERE s.building_id = ? ORDER BY s.floor_id, s.name",
                    (id,),
                )
                space_rows = [
                    dict(zip([c[0] for c in cur.description], r))
                    for r in cur.fetchall()
                ]
                spaces_map: Dict[str, List[Dict[str, Any]]] = {}
                for sp in space_rows:
                    spaces_map.setdefault(str(sp.get("floor_id")), []).append(sp)

                # Energy stats (last 1 day)
                energy_stats = None
                if includeStats:
                    cur.execute(
                        """
                        SELECT 
                          AVG(total_kwh) as avg_consumption,
                          SUM(total_kwh) as total_consumption,
                          AVG(total_kwh * 0.12) as avg_cost,
                          SUM(total_kwh * 0.12) as total_cost,
                          75.0 as avg_efficiency,
                          COUNT(*) as record_count,
                          MAX(timestamp) as latest_record
                        FROM energy_consumption
                        WHERE building_id = ? AND timestamp >= datetime('now', '-1 day')
                        """,
                        (id,),
                    )
                    row = cur.fetchone()
                    if row:
                        energy_stats = dict(zip([c[0] for c in cur.description], row))

                return JSONResponse(
                    {
                        "success": True,
                        "data": {
                            "building": {
                                **building,
                                "floors": floors,
                                "spaces": spaces_map,
                            },
                            "energyStats": energy_stats,
                        },
                    }
                )

            # List buildings
            cur.execute(
                """
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
                  b.sync_timestamp,
                  COUNT(DISTINCT f.id) as floors_count,
                  COUNT(DISTINCT s.id) as spaces_count
                FROM buildings b
                LEFT JOIN floors f ON b.id = f.building_id
                LEFT JOIN spaces s ON b.id = s.building_id
                GROUP BY b.id, b.name, b.description, b.exact_type, b.address_street,
                         b.address_city, b.address_state, b.address_country, b.address_postal_code,
                         b.latitude, b.longitude, b.date_created, b.date_updated, b.sync_timestamp
                ORDER BY b.name, b.id
                """
            )
            buildings = [
                dict(zip([c[0] for c in cur.description], r)) for r in cur.fetchall()
            ]

            if includeStats:
                cur.execute(
                    """
                    SELECT 
                      building_id,
                      AVG(total_kwh) as avg_consumption,
                      SUM(total_kwh) as total_consumption,
                      AVG(total_kwh * 0.12) as avg_cost,
                      SUM(total_kwh * 0.12) as total_cost,
                      75.0 as avg_efficiency,
                      COUNT(*) as record_count,
                      MAX(timestamp) as latest_record
                    FROM energy_consumption
                    WHERE timestamp >= datetime('now', '-1 day')
                    GROUP BY building_id
                    """
                )
                stats_rows = [
                    dict(zip([c[0] for c in cur.description], r))
                    for r in cur.fetchall()
                ]
                stats_map = {r["building_id"]: r for r in stats_rows}
                for b in buildings:
                    b["energyStats"] = stats_map.get(b["id"]) or None

            return JSONResponse(
                {
                    "success": True,
                    "data": {"buildings": buildings, "totalCount": len(buildings)},
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Buildings API error")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: Building history (sync_status)
# ----------------------------------------------------------------------------


@app.get("/api/buildings/history")
def get_building_history(
    buildingId: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
):
    try:
        ensure_initialized()
        with db.get_connection() as conn:
            cur = conn.cursor()
            if buildingId:
                cur.execute(
                    """
                    SELECT 
                      id,
                      last_sync_timestamp,
                      sync_type,
                      status,
                      records_synced,
                      errors_count,
                      error_message,
                      duration_ms,
                      created_at
                    FROM sync_status 
                    WHERE sync_type LIKE '%building%' OR sync_type = 'full' OR sync_type = 'incremental'
                    ORDER BY created_at DESC 
                    LIMIT ?
                    """,
                    (limit,),
                )
                rows = [
                    dict(zip([c[0] for c in cur.description], r))
                    for r in cur.fetchall()
                ]
                return JSONResponse(
                    {
                        "success": True,
                        "data": {
                            "buildingId": buildingId,
                            "changes": rows,
                            "totalChanges": len(rows),
                        },
                    }
                )
            else:
                cur.execute(
                    """
                    SELECT 
                      id,
                      last_sync_timestamp,
                      sync_type,
                      status,
                      records_synced,
                      errors_count,
                      error_message,
                      duration_ms,
                      created_at
                    FROM sync_status 
                    ORDER BY created_at DESC 
                    LIMIT ?
                    """,
                    (limit,),
                )
                rows = [
                    dict(zip([c[0] for c in cur.description], r))
                    for r in cur.fetchall()
                ]
                return JSONResponse(
                    {
                        "success": True,
                        "data": {"recentChanges": rows, "totalChanges": len(rows)},
                    }
                )
    except Exception as e:
        logger.exception("Building history API error")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: Analytics Historical (with fallback if energy_usage missing)
# ----------------------------------------------------------------------------


def energy_usage_table_exists(conn: sqlite3.Connection) -> bool:
    return table_exists(conn, "energy_usage")


@app.get("/api/analytics/historical")
def analytics_historical(
    timeRange: str = Query(default="week", regex="^(day|week|month|year)$"),
    buildingId: Optional[str] = Query(default=None),
):
    try:
        ensure_initialized()
        now = datetime.now(timezone.utc)
        if timeRange == "day":
            start = now - timedelta(days=1)
        elif timeRange == "week":
            start = now - timedelta(days=7)
        elif timeRange == "month":
            start = now - timedelta(days=30)
        else:
            start = now - timedelta(days=365)

        with db.get_connection() as conn:
            cur = conn.cursor()

            if energy_usage_table_exists(conn):
                if buildingId:
                    energy_sql = (
                        "SELECT DATE(timestamp) as date, SUM(consumption_kwh) as total_consumption, "
                        "SUM(cost_usd) as total_cost, AVG(efficiency_score) as avg_efficiency, COUNT(*) as sensor_count "
                        "FROM energy_usage WHERE timestamp >= ? AND timestamp <= ? AND building_id = ? GROUP BY DATE(timestamp) ORDER BY date ASC"
                    )
                    params: List[Any] = [start.isoformat(), now.isoformat(), buildingId]
                else:
                    energy_sql = (
                        "SELECT DATE(timestamp) as date, SUM(consumption_kwh) as total_consumption, "
                        "SUM(cost_usd) as total_cost, AVG(efficiency_score) as avg_efficiency, COUNT(*) as sensor_count "
                        "FROM energy_usage WHERE timestamp >= ? AND timestamp <= ? GROUP BY DATE(timestamp) ORDER BY date ASC"
                    )
                    params = [start.isoformat(), now.isoformat()]
            else:
                # Fallback: derive from energy_consumption
                if buildingId:
                    energy_sql = (
                        "SELECT DATE(timestamp) as date, SUM(total_kwh) as total_consumption, "
                        "SUM(total_kwh * 0.12) as total_cost, AVG(0.75) as avg_efficiency, COUNT(*) as sensor_count "
                        "FROM energy_consumption WHERE timestamp >= ? AND timestamp <= ? AND building_id = ? GROUP BY DATE(timestamp) ORDER BY date ASC"
                    )
                    params = [start.isoformat(), now.isoformat(), buildingId]
                else:
                    energy_sql = (
                        "SELECT DATE(timestamp) as date, SUM(total_kwh) as total_consumption, "
                        "SUM(total_kwh * 0.12) as total_cost, AVG(0.75) as avg_efficiency, COUNT(*) as sensor_count "
                        "FROM energy_consumption WHERE timestamp >= ? AND timestamp <= ? GROUP BY DATE(timestamp) ORDER BY date ASC"
                    )
                    params = [start.isoformat(), now.isoformat()]

            cur.execute(energy_sql, params)
            columns = [c[0] for c in cur.description]
            energy_data = [dict(zip(columns, r)) for r in cur.fetchall()]

        # Mock occupancy and appliance insights (as in Next.js route)
        occupancy_data = []
        for i, day in enumerate(energy_data):
            occupancy_data.append(
                {
                    "date": day["date"],
                    "avg_occupancy": 35
                    + math.sin(i * 0.5) * 15
                    + (os.urandom(1)[0] % 10),
                    "total_people": int(
                        8 + math.sin(i * 0.3) * 4 + (os.urandom(1)[0] % 6)
                    ),
                }
            )

        mock_appliances = [
            {"type": "HVAC", "name": "Central Air System 1", "baseConsumption": 45},
            {"type": "Lighting", "name": "LED Panel Array", "baseConsumption": 12},
            {
                "type": "Computing",
                "name": "Server Room Equipment",
                "baseConsumption": 28,
            },
            {"type": "HVAC", "name": "Heat Pump Unit 2", "baseConsumption": 38},
            {
                "type": "Lighting",
                "name": "Emergency Exit Lighting",
                "baseConsumption": 3,
            },
            {"type": "Equipment", "name": "Elevator Motors", "baseConsumption": 22},
            {"type": "HVAC", "name": "Ventilation System", "baseConsumption": 18},
            {"type": "Security", "name": "Access Control System", "baseConsumption": 5},
        ]
        appliance_data = []
        for idx, ap in enumerate(mock_appliances[:6]):
            appliance_data.append(
                {
                    "appliance_type": ap["type"],
                    "appliance_name": ap["name"],
                    "avg_consumption": ap["baseConsumption"] + (os.urandom(1)[0] % 10),
                    "avg_efficiency": 0.7 + ((os.urandom(1)[0] % 25) / 100.0),
                    "days_tracked": min(len(energy_data), 30),
                    "latest_issues": (
                        "Minor efficiency degradation detected" if idx < 2 else None
                    ),
                    "latest_recommendations": (
                        "Schedule maintenance check"
                        if idx < 2
                        else "Operating optimally"
                    ),
                }
            )

        total_consumption = sum((d.get("total_consumption") or 0) for d in energy_data)
        total_cost = sum((d.get("total_cost") or 0) for d in energy_data)
        avg_efficiency = (
            (
                sum((d.get("avg_efficiency") or 0) for d in energy_data)
                / len(energy_data)
            )
            if energy_data
            else 0
        )
        potential_eff_gain = max(0.0, 0.85 - avg_efficiency)
        potential_savings = total_cost * potential_eff_gain

        # Combine data
        combined = []
        for d in energy_data:
            occ = next((o for o in occupancy_data if o["date"] == d["date"]), None)
            people = occ["total_people"] if occ else 0
            eff_per_person = (
                (d["total_consumption"] / people)
                if people > 0
                else d["total_consumption"]
            )
            cost_per_person = (
                (d["total_cost"] / people) if people > 0 else d["total_cost"]
            )
            combined.append(
                {
                    "date": d["date"],
                    "consumption": round((d["total_consumption"] or 0) * 100) / 100,
                    "cost": round((d["total_cost"] or 0) * 100) / 100,
                    "efficiency": round((d.get("avg_efficiency") or 0) * 100) / 100,
                    "occupancy": int(round(occ["avg_occupancy"])) if occ else 0,
                    "savingsPotential": round(
                        ((d["total_cost"] or 0) * potential_eff_gain) * 100
                    )
                    / 100,
                    "efficiencyPerPerson": round(eff_per_person * 100) / 100,
                    "costPerPerson": round(cost_per_person * 100) / 100,
                }
            )

        # Peak usage analysis
        with db.get_connection() as conn:
            cur = conn.cursor()
            if buildingId:
                cur.execute(
                    """
                    SELECT 
                      CASE 
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 6 AND 8 THEN '6 AM - 9 AM'
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 9 AND 11 THEN '9 AM - 12 PM' 
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 12 AND 14 THEN '12 PM - 3 PM'
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 15 AND 17 THEN '3 PM - 6 PM'
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 18 AND 20 THEN '6 PM - 9 PM'
                        ELSE 'Other'
                      END as time_period,
                      SUM(total_kwh) as total_consumption,
                      SUM(total_kwh * 0.12) as total_cost,
                      COUNT(*) as reading_count
                    FROM energy_consumption 
                    WHERE timestamp >= ? AND timestamp <= ? AND building_id = ?
                    GROUP BY time_period
                    ORDER BY total_consumption DESC
                    """,
                    (start.isoformat(), now.isoformat(), buildingId),
                )
            else:
                cur.execute(
                    """
                    SELECT 
                      CASE 
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 6 AND 8 THEN '6 AM - 9 AM'
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 9 AND 11 THEN '9 AM - 12 PM' 
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 12 AND 14 THEN '12 PM - 3 PM'
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 15 AND 17 THEN '3 PM - 6 PM'
                        WHEN CAST(strftime('%H', timestamp) AS INTEGER) BETWEEN 18 AND 20 THEN '6 PM - 9 PM'
                        ELSE 'Other'
                      END as time_period,
                      SUM(total_kwh) as total_consumption,
                      SUM(total_kwh * 0.12) as total_cost,
                      COUNT(*) as reading_count
                    FROM energy_consumption 
                    WHERE timestamp >= ? AND timestamp <= ?
                    GROUP BY time_period
                    ORDER BY total_consumption DESC
                    """,
                    (start.isoformat(), now.isoformat()),
                )
            cols = [c[0] for c in cur.description]
            peak_usage_rows = [dict(zip(cols, r)) for r in cur.fetchall()]

        def week_over_week_trend(values: List[Dict[str, Any]]) -> float:
            if len(values) < 14:
                return 0.0
            this_week = values[-7:]
            last_week = values[-14:-7]
            this_avg = sum(v["consumption"] for v in this_week) / 7
            last_avg = sum(v["consumption"] for v in last_week) / 7
            return ((this_avg - last_avg) / last_avg) * 100 if last_avg > 0 else 0.0

        def cost_trend(values: List[Dict[str, Any]]) -> float:
            if len(values) < 14:
                return 0.0
            this_week = values[-7:]
            last_week = values[-14:-7]
            this_avg = sum(v["cost"] for v in this_week) / 7
            last_avg = sum(v["cost"] for v in last_week) / 7
            return ((this_avg - last_avg) / last_avg) * 100 if last_avg > 0 else 0.0

        response = {
            "success": True,
            "data": {
                "timeRange": timeRange,
                "dateRange": {"start": start.isoformat(), "end": now.isoformat()},
                "summary": {
                    "totalConsumption": total_consumption,
                    "totalCost": total_cost,
                    "avgEfficiency": round(avg_efficiency * 100) / 100,
                    "consumptionTrend": round(week_over_week_trend(combined) * 100)
                    / 100,
                    "costTrend": round(cost_trend(combined) * 100) / 100,
                    "potentialSavings": round(potential_savings * 100) / 100,
                    "totalSavingsPotential": round(potential_savings * 100) / 100,
                },
                "dailyData": combined,
                "peakUsageHours": [
                    {
                        "name": p["time_period"],
                        "consumption": round((p["total_consumption"] or 0) * 100) / 100,
                        "cost": round((p["total_cost"] or 0) * 100) / 100,
                        "percentage": (
                            int(
                                round(
                                    ((p["total_consumption"] or 0) / total_consumption)
                                    * 100
                                )
                            )
                            if total_consumption
                            else 0
                        ),
                    }
                    for p in peak_usage_rows
                ],
                "applianceInsights": [
                    {
                        "name": a["appliance_name"],
                        "type": a["appliance_type"],
                        "consumption": round(a["avg_consumption"] * 100) / 100,
                        "efficiency": round(a["avg_efficiency"] * 100) / 100,
                        "daysTracked": a["days_tracked"],
                        "issues": a["latest_issues"],
                        "recommendations": a["latest_recommendations"],
                    }
                    for a in appliance_data
                ],
                "buildingId": buildingId or "all",
                "recordCount": len(energy_data),
            },
        }
        return JSONResponse(response)
    except Exception as e:
        logger.exception("Historical analytics API error")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: Analytics Seed Historical (create energy_usage if missing)
# ----------------------------------------------------------------------------


@app.post("/api/analytics/seed-historical")
def analytics_seed_historical(days: int = Query(default=30, ge=1, le=366)):
    try:
        ensure_initialized()
        with db.get_connection() as conn:
            cur = conn.cursor()
            # Ensure energy_usage table exists (compat with Next.js route)
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS energy_usage (
                    id TEXT PRIMARY KEY,
                    building_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    consumption_kwh REAL,
                    cost_usd REAL,
                    efficiency_score REAL,
                    usage_type TEXT,
                    source TEXT,
                    sync_timestamp TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            # Pick an existing building or use demo
            cur.execute("SELECT id FROM buildings LIMIT 1")
            row = cur.fetchone()
            building_id = row[0] if row else "demo_building_1"

            now = datetime.now(timezone.utc)
            records = []
            for day_offset in range(days, 0, -1):
                date = now - timedelta(days=day_offset)
                for hour in range(0, 24):
                    ts = datetime(
                        date.year, date.month, date.day, hour, 0, 0, tzinfo=timezone.utc
                    )
                    # rough pattern similar to Next.js
                    if 9 <= hour <= 18:
                        base = 15 + (os.urandom(1)[0] % 25)
                    elif 6 <= hour <= 9 or 18 <= hour <= 22:
                        base = 8 + (os.urandom(1)[0] % 12)
                    else:
                        base = 3 + (os.urandom(1)[0] % 7)
                    weekend_mult = 0.6 if (ts.weekday() in (5, 6)) else 1.0
                    trend = 1 + ((os.urandom(1)[0] % 21 - 10) / 100.0)
                    seasonal = (
                        1 + math.sin((day_offset / max(1, days)) * math.pi) * 0.15
                    )
                    consumption = base * weekend_mult * trend * seasonal
                    cost = consumption * (0.10 + ((os.urandom(1)[0] % 9) / 100.0))
                    efficiency = 0.65 + ((os.urandom(1)[0] % 31) / 100.0)

                    energy_id = f"{building_id}_historical_{int(ts.timestamp() * 1000)}"
                    records.append(
                        (
                            energy_id,
                            building_id,
                            ts.isoformat(),
                            round(consumption, 2),
                            round(cost, 2),
                            round(efficiency, 2),
                            "simulated",
                            "historical_seed",
                            now.isoformat(),
                        )
                    )

            cur.executemany(
                """
                INSERT OR IGNORE INTO energy_usage (
                  id, building_id, timestamp, consumption_kwh, cost_usd, efficiency_score, usage_type, source, sync_timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                records,
            )
            conn.commit()

            cur.execute(
                "SELECT COUNT(*) as count FROM energy_usage WHERE source = ?",
                ("historical_seed",),
            )
            count = cur.fetchone()[0]

        return JSONResponse(
            {
                "success": True,
                "message": f"Successfully generated {days} days of historical energy data",
                "data": {
                    "daysGenerated": days,
                    "recordsCreated": {"energy": count, "total": count},
                },
            }
        )
    except Exception as e:
        logger.exception("Historical seeding error")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: EIA mix (stub consistent with current Next.js impl)
# ----------------------------------------------------------------------------


@app.get("/api/eia/mix")
def eia_mix():
    try:
        return JSONResponse({"success": True, "data": []})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: Weather current (uses OpenWeatherMap)
# ----------------------------------------------------------------------------

_weather_cache: Dict[str, Dict[str, Any]] = {}
_WEATHER_TTL_MS = 5 * 60 * 1000


@app.get("/api/weather/current")
def weather_current():
    try:
        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            raise HTTPException(status_code=400, detail="Missing OPENWEATHER_API_KEY")

        now_ms = int(time.time() * 1000)
        cached = _weather_cache.get("current")
        if cached and (now_ms - cached["ts"]) < _WEATHER_TTL_MS:
            return JSONResponse(
                {"success": True, "data": cached["data"], "cached": True}
            )

        results: List[Dict[str, Any]] = []
        for ba in BALANCING_AUTHORITIES:
            try:
                url = (
                    "https://api.openweathermap.org/data/2.5/weather?lat="
                    f"{ba['latitude']}&lon={ba['longitude']}&units=metric&appid={api_key}"
                )
                res = requests.get(url, timeout=15)
                if not res.ok:
                    continue
                j = res.json()
                results.append(
                    {
                        "code": ba["code"],
                        "name": ba["name"],
                        "latitude": ba["latitude"],
                        "longitude": ba["longitude"],
                        "temperature": (j.get("main", {}).get("temp") or 0),
                        "humidity": j.get("main", {}).get("humidity"),
                        "windSpeed": j.get("wind", {}).get("speed"),
                        "conditions": (j.get("weather") or [{}])[0].get("main"),
                    }
                )
            except Exception:
                continue

        _weather_cache["current"] = {"ts": now_ms, "data": results}
        return JSONResponse(
            {
                "success": True,
                "data": results,
                "meta": {
                    "fetchedAt": datetime.utcnow().isoformat(),
                    "stationCount": len(results),
                    "totalStations": len(BALANCING_AUTHORITIES),
                },
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Weather API error")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: Population (reads processed JSON files)
# ----------------------------------------------------------------------------

_population_cache: Dict[str, Dict[str, Any]] = {}
_POP_CACHE_TTL_MS = 10 * 60 * 1000


@app.get("/api/population")
def population(
    resolution: str = Query(default="US", regex="^(US|r4|r6)$"),
    limit: Optional[int] = Query(default=None, ge=1),
    bbox: Optional[str] = Query(default=None),
):
    try:
        now_ms = int(time.time() * 1000)
        cached = _population_cache.get(resolution)
        data: List[Dict[str, Any]]

        if cached and (now_ms - cached["ts"]) < _POP_CACHE_TTL_MS:
            data = cached["data"]
        else:
            project_root = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..")
            )
            processed_dir = os.path.join(
                project_root, "population-density-data", "processed"
            )
            filename_map = {
                "US": "kontur_us.json",
                "r4": "kontur_r4.json",
                "r6": "kontur_r6.json",
            }
            filename = filename_map.get(resolution, "kontur_us.json")
            filepath = os.path.join(processed_dir, filename)
            if not os.path.exists(filepath):
                raise HTTPException(
                    status_code=500,
                    detail=f"Processed data file not found: {filename}. Run npm run process-population-data",
                )
            with open(filepath, "r", encoding="utf-8") as f:
                dataset = json.load(f)
            data = dataset.get("data", [])
            _population_cache[resolution] = {"ts": now_ms, "data": data}

        filtered = data
        if bbox:
            try:
                min_lng, min_lat, max_lng, max_lat = [float(x) for x in bbox.split(",")]
                filtered = [
                    p
                    for p in filtered
                    if (
                        p["lng"] >= min_lng
                        and p["lng"] <= max_lng
                        and p["lat"] >= min_lat
                        and p["lat"] <= max_lat
                    )
                ]
            except Exception:
                pass

        # Sort by population desc
        filtered = sorted(filtered, key=lambda x: x.get("population", 0), reverse=True)
        if limit:
            filtered = filtered[:limit]

        return JSONResponse(
            {
                "data": filtered,
                "count": len(filtered),
                "cached": cached is not None,
                "source": resolution,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Population API error")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: GraphQL proxy to mapped.com
# ----------------------------------------------------------------------------


@app.post("/api/graphql")
async def graphql_proxy(request: Request):
    try:
        token = os.getenv("MAPPED_API_KEY")
        if not token:
            raise HTTPException(status_code=401, detail="API token not configured")

        body = await request.json()
        resp = requests.post(
            "https://api.mapped.com/graphql",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"token {token}",
                "User-Agent": "EnergyEfficiencyApp/1.0",
            },
            json=body,
            timeout=30,
        )
        if not resp.ok:
            return JSONResponse(
                {
                    "error": f"API request failed: {resp.status_code}",
                    "details": resp.text,
                },
                status_code=resp.status_code,
            )
        data = resp.json()
        return JSONResponse(data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("GraphQL proxy error")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: Sensors (mirrors src/pages/api/sensors.ts)
# ----------------------------------------------------------------------------


@app.get("/api/sensors")
def sensors(
    buildingId: Optional[str] = Query(default=None),
    unitName: Optional[str] = Query(default=None),
):
    try:
        ensure_initialized()
        conditions: List[str] = []
        params: List[Any] = []
        if buildingId:
            conditions.append("p.building_id = ?")
            params.append(buildingId)
        if unitName:
            conditions.append("p.unit_name = ?")
            params.append(unitName)
        where_sql = (" WHERE " + " AND ".join(conditions)) if conditions else ""

        with db.get_connection() as conn:
            cur = conn.cursor()

            sensors_sql = f"""
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
              {where_sql}
              ORDER BY p.building_id, p.floor_id, p.space_id, p.name
            """
            cur.execute(sensors_sql, params)
            cols = [c[0] for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]

            processed = []
            for s in rows:
                latest_value = None
                if s.get("latest_float64") is not None:
                    latest_value = s.get("latest_float64")
                elif s.get("latest_float32") is not None:
                    latest_value = s.get("latest_float32")
                elif s.get("latest_string") is not None:
                    latest_value = s.get("latest_string")
                elif s.get("latest_bool") is not None:
                    latest_value = s.get("latest_bool")
                processed.append(
                    {
                        "id": s.get("id"),
                        "building_id": s.get("building_id"),
                        "floor_id": s.get("floor_id"),
                        "space_id": s.get("space_id"),
                        "name": s.get("name"),
                        "description": s.get("description"),
                        "exact_type": s.get("exact_type"),
                        "unit_name": s.get("unit_name"),
                        "sync_timestamp": s.get("sync_timestamp"),
                        "latest_value": latest_value,
                        "latest_timestamp": s.get("latest_timestamp"),
                    }
                )

            # Summary
            summary_sql = f"""
              SELECT 
                COUNT(*) as total_sensors,
                COUNT(CASE WHEN unit_name = 'Watt' THEN 1 END) as watts_sensors,
                COUNT(CASE WHEN unit_name LIKE '%Celsius%' OR unit_name LIKE '%Fahrenheit%' THEN 1 END) as temperature_sensors,
                COUNT(CASE WHEN unit_name != 'Watt' AND unit_name NOT LIKE '%Celsius%' AND unit_name NOT LIKE '%Fahrenheit%' THEN 1 END) as other_sensors
              FROM points p
              {where_sql}
            """
            cur.execute(summary_sql, params)
            summary_row = cur.fetchone()
            summary_cols = [c[0] for c in cur.description]
            summary = dict(zip(summary_cols, summary_row)) if summary_row else {}

            latest_reading_sql = f"""
              SELECT MAX(ps.timestamp) as latest_reading
              FROM points p
              JOIN point_series ps ON p.id = ps.point_id
              {where_sql}
            """
            cur.execute(latest_reading_sql, params)
            latest_row = cur.fetchone()
            if latest_row:
                summary["latest_reading"] = latest_row[0]

        return JSONResponse(
            {"success": True, "data": {"sensors": processed, "summary": summary}}
        )
    except Exception as e:
        logger.exception("Sensors API error")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------------
# Routes: Energy consumption (mirrors src/pages/api/energy-consumption.ts)
# ----------------------------------------------------------------------------


@app.get("/api/energy-consumption")
def energy_consumption(
    buildingId: Optional[str] = Query(default=None),
    startTime: Optional[str] = Query(default=None),
    endTime: Optional[str] = Query(default=None),
):
    try:
        ensure_initialized()
        conditions: List[str] = []
        params: List[Any] = []
        if buildingId:
            conditions.append("building_id = ?")
            params.append(buildingId)
        if startTime:
            conditions.append("timestamp >= ?")
            params.append(startTime)
        if endTime:
            conditions.append("timestamp <= ?")
            params.append(endTime)
        where_sql = (" WHERE " + " AND ".join(conditions)) if conditions else ""

        with db.get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT *
                FROM energy_consumption
                {where_sql}
                ORDER BY timestamp DESC
                """,
                params,
            )
            cols = [c[0] for c in cur.description]
            consumption = [dict(zip(cols, r)) for r in cur.fetchall()]

            cur.execute(
                f"""
                SELECT 
                  COUNT(*) as total_records,
                  COALESCE(SUM(total_watts), 0) as total_watts,
                  COALESCE(SUM(total_kwh), 0) as total_kwh,
                  COALESCE(AVG(total_watts), 0) as avg_watts,
                  MAX(calculation_timestamp) as latest_calculation
                FROM energy_consumption
                {where_sql}
                """,
                params,
            )
            row = cur.fetchone()
            cols = [c[0] for c in cur.description]
            summary = dict(zip(cols, row)) if row else {}

        return JSONResponse(
            {"success": True, "data": {"consumption": consumption, "summary": summary}}
        )
    except Exception as e:
        logger.exception("Energy consumption API error")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api_app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True
    )
