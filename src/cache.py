"""Persistent SQLite cache for route metrics and assigned-route geometry."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Coordinate, RouteMetric


class RouteCache:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path, check_same_thread=False)
        self.connection.execute(
            """CREATE TABLE IF NOT EXISTS route_cache (
                cache_key TEXT PRIMARY KEY,
                origin_lat REAL NOT NULL, origin_lon REAL NOT NULL,
                destination_lat REAL NOT NULL, destination_lon REAL NOT NULL,
                routing_profile TEXT NOT NULL, routing_provider TEXT NOT NULL,
                distance_m REAL, duration_s REAL, geometry_json TEXT,
                timestamp TEXT NOT NULL
            )"""
        )
        self.connection.commit()

    @staticmethod
    def key(origin: Coordinate, destination: Coordinate, profile: str, provider: str) -> str:
        return "|".join(
            [f"{origin.latitude:.6f}", f"{origin.longitude:.6f}", f"{destination.latitude:.6f}", f"{destination.longitude:.6f}", profile, provider]
        )

    def get(self, origin: Coordinate, destination: Coordinate, profile: str, provider: str) -> RouteMetric | None:
        key = self.key(origin, destination, profile, provider)
        row = self.connection.execute(
            "SELECT distance_m, duration_s, geometry_json FROM route_cache WHERE cache_key = ?", (key,)
        ).fetchone()
        if not row:
            return None
        geometry = json.loads(row[2]) if row[2] else None
        return RouteMetric(row[0], row[1], source=f"{provider} (cached)", geometry=geometry)

    def put(self, origin: Coordinate, destination: Coordinate, profile: str, provider: str, metric: RouteMetric) -> None:
        key = self.key(origin, destination, profile, provider)
        geometry_json = json.dumps(metric.geometry, ensure_ascii=False) if metric.geometry is not None else None
        self.connection.execute(
            """INSERT INTO route_cache (cache_key, origin_lat, origin_lon, destination_lat, destination_lon,
               routing_profile, routing_provider, distance_m, duration_s, geometry_json, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(cache_key) DO UPDATE SET distance_m=excluded.distance_m,
               duration_s=excluded.duration_s, geometry_json=excluded.geometry_json, timestamp=excluded.timestamp""",
            (key, origin.latitude, origin.longitude, destination.latitude, destination.longitude, profile, provider,
             metric.distance_m, metric.duration_s, geometry_json, datetime.now(timezone.utc).isoformat()),
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "RouteCache":
        return self

    def __exit__(self, *_args) -> None:
        self.close()
