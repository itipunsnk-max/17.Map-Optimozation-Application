"""Input workbook and row-level validation."""

from __future__ import annotations

from typing import Any

import pandas as pd

from config.settings import get_settings

from .haversine import is_thailand_coordinate
from .models import Coordinate
from .province_reference import ProvinceReference


BRANCH_COLUMNS = ["Branch_ID", "Branch_Name", "Province", "Latitude", "Longitude"]
HUB_COLUMNS = ["Hub_ID", "Region", "Hub_Name", "Province", "Latitude", "Longitude"]


def _blank(value: Any) -> bool:
    if value is None:
        return True
    try:
        if bool(pd.isna(value)):
            return True
    except (TypeError, ValueError):
        pass
    return str(value).strip() == ""


def _number(value: Any) -> float | None:
    if _blank(value):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if pd.notna(number) else None


def _error(record_type: str, record_id: Any, name: Any, province: Any, lat: Any, lon: Any, error_type: str, message: str) -> dict:
    return {
        "Record_Type": record_type,
        "Record_ID": "" if _blank(record_id) else str(record_id),
        "Branch_or_Hub_Name": "" if _blank(name) else str(name),
        "Province": "" if _blank(province) else str(province),
        "Latitude": lat,
        "Longitude": lon,
        "Error_Type": error_type,
        "Error_Message": message,
    }


def canonicalize_columns(frame: pd.DataFrame) -> pd.DataFrame:
    """Map common Excel header variations to the documented canonical names."""
    aliases = {
        "branchid": "Branch_ID", "branchname": "Branch_Name", "province": "Province",
        "latitude": "Latitude", "longitude": "Longitude", "hubid": "Hub_ID",
        "hubname": "Hub_Name", "region": "Region",
    }
    renamed = {}
    for column in frame.columns:
        key = "".join(ch for ch in str(column).strip().lower() if ch.isalnum())
        if key in aliases:
            renamed[column] = aliases[key]
    return frame.rename(columns=renamed).copy()


def validate_records(frame: pd.DataFrame, record_type: str, reference: ProvinceReference, warning_bounds: tuple[float, float, float, float] | None = None) -> pd.DataFrame:
    """Validate rows without stopping processing of other rows."""
    id_column = "Branch_ID" if record_type == "Branch" else "Hub_ID"
    name_column = "Branch_Name" if record_type == "Branch" else "Hub_Name"
    errors: list[dict] = []
    warning_bounds = warning_bounds or get_settings().thailand_warning_bounds
    if id_column not in frame.columns:
        return pd.DataFrame([_error(record_type, "", "", "", "", "", "Missing Required Column", f"Missing column: {id_column}")])
    if name_column not in frame.columns:
        return pd.DataFrame([_error(record_type, "", "", "", "", "", "Missing Required Column", f"Missing column: {name_column}")])

    seen: dict[str, int] = {}
    for index, row in frame.iterrows():
        record_id = row.get(id_column, "")
        name = row.get(name_column, "")
        province = row.get("Province", "")
        lat = row.get("Latitude", "")
        lon = row.get("Longitude", "")
        key = "" if _blank(record_id) else str(record_id).strip()
        if _blank(record_id):
            errors.append(_error(record_type, record_id, name, province, lat, lon, "Missing ID", f"Row {index + 2} has no {id_column}."))
        elif key in seen:
            errors.append(_error(record_type, record_id, name, province, lat, lon, "Duplicate ID", f"Duplicate {id_column}: {key}."))
        else:
            seen[key] = index
        if _blank(name):
            errors.append(_error(record_type, record_id, name, province, lat, lon, "Missing Name", f"Row {index + 2} has no {name_column}."))
        if record_type == "Hub" and _blank(row.get("Region", "")):
            errors.append(_error(record_type, record_id, name, province, lat, lon, "Missing Region", "Regional Hub Region is blank."))

        lat_value, lon_value = _number(lat), _number(lon)
        lat_blank, lon_blank = _blank(lat), _blank(lon)
        if lat_blank and lon_blank:
            pass
        elif lat_value is None or lon_value is None:
            errors.append(_error(record_type, record_id, name, province, lat, lon, "Malformed Coordinates", "Latitude and Longitude must be numeric."))
        elif not (-90 <= lat_value <= 90 and -180 <= lon_value <= 180):
            errors.append(_error(record_type, record_id, name, province, lat, lon, "Invalid Coordinates", "Latitude must be -90..90 and Longitude must be -180..180."))
        elif not is_thailand_coordinate(Coordinate(lat_value, lon_value), warning_bounds):
            errors.append(_error(record_type, record_id, name, province, lat, lon, "Coordinate Outside Thailand Warning", "Coordinates are valid globally but outside the configured Thailand warning bounds."))

        if _blank(province):
            errors.append(_error(record_type, record_id, name, province, lat, lon, "Missing Province", "Province is blank."))
        elif reference.lookup(province) is None:
            errors.append(_error(record_type, record_id, name, province, lat, lon, "Unknown Province", f"Province is not found in the 77-province reference: {province}."))
    return pd.DataFrame(errors, columns=["Record_Type", "Record_ID", "Branch_or_Hub_Name", "Province", "Latitude", "Longitude", "Error_Type", "Error_Message"])


def validate_workbook_frames(branches: pd.DataFrame, hubs: pd.DataFrame, reference: ProvinceReference, warning_bounds: tuple[float, float, float, float] | None = None) -> pd.DataFrame:
    branch_errors = validate_records(branches, "Branch", reference, warning_bounds)
    hub_errors = validate_records(hubs, "Hub", reference, warning_bounds)
    return pd.concat([branch_errors, hub_errors], ignore_index=True)


def validate_coordinate_pair(latitude: Any, longitude: Any) -> tuple[bool, float | None, float | None]:
    lat, lon = _number(latitude), _number(longitude)
    return lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180, lat, lon
