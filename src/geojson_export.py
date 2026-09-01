"""GeoJSON export for GIS tools."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd


def build_geojson(results: pd.DataFrame) -> dict[str, Any]:
    features = []
    for _, row in results.iterrows():
        geometry = row.get("Route_Geometry")
        if isinstance(geometry, str):
            try:
                geometry = json.loads(geometry)
            except json.JSONDecodeError:
                geometry = None
        if not isinstance(geometry, dict) or geometry.get("type") not in {"LineString", "MultiLineString"}:
            continue
        properties = {
            "Branch_ID": _json_value(row.get("Branch_ID", "")), "Branch_Name": _json_value(row.get("Branch_Name", "")), "Province": _json_value(row.get("Province", "")),
            "Location_Method": _json_value(row.get("Location_Method", "")), "Hub_ID": _json_value(row.get("Assigned_Hub_ID", "")), "Hub_Name": _json_value(row.get("Assigned_Hub_Name", "")),
            "Region": _json_value(row.get("Assigned_Region", "")), "Distance_km": _json_value(row.get("Road_Distance_km")), "Duration_min": _json_value(row.get("Travel_Time_min")),
            "Distance_Band": _json_value(row.get("Distance_Band", "")),
        }
        features.append({"type": "Feature", "geometry": geometry, "properties": properties})
    return {"type": "FeatureCollection", "name": "Thailand Branch Routes", "features": features}


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    try:
        if not isinstance(value, (dict, list)) and bool(pd.isna(value)):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):
        return value.item()
    return value


def write_geojson(results: pd.DataFrame, path: str | Path) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(build_geojson(results), ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path
