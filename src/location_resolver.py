"""Resolve exact or province-reference coordinates per record."""

from __future__ import annotations

from typing import Literal

import pandas as pd

from .province_reference import ProvinceReference
from .validation import _blank, _number


LocationMode = Literal["Auto Detect", "Exact Lat/Long Only", "Province Only"]


def resolve_locations(frame: pd.DataFrame, record_type: Literal["Branch", "Hub"], mode: LocationMode, reference: ProvinceReference) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Resolve each row independently; exact coordinates have priority in auto mode."""
    result = frame.copy()
    id_column = "Branch_ID" if record_type == "Branch" else "Hub_ID"
    name_column = "Branch_Name" if record_type == "Branch" else "Hub_Name"
    result["Input_Latitude"] = result.get("Latitude", pd.Series(index=result.index, dtype="object"))
    result["Input_Longitude"] = result.get("Longitude", pd.Series(index=result.index, dtype="object"))
    result["Resolved_Latitude"] = pd.NA
    result["Resolved_Longitude"] = pd.NA
    result["Location_Method"] = "Invalid Location"
    result["Coordinate_Source"] = ""
    result["Location_Valid"] = False
    errors: list[dict] = []

    for index, row in result.iterrows():
        lat_raw, lon_raw = row.get("Latitude"), row.get("Longitude")
        lat, lon = _number(lat_raw), _number(lon_raw)
        both_blank = _blank(lat_raw) and _blank(lon_raw)
        both_valid = lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180
        partial = not both_blank and not both_valid
        method = "Invalid Location"
        source = ""
        resolved_lat = resolved_lon = None
        reason = ""

        if mode == "Province Only":
            reference_row = reference.lookup(row.get("Province"))
            if reference_row:
                resolved_lat, resolved_lon = float(reference_row["Latitude"]), float(reference_row["Longitude"])
                method, source = "Province Reference Point", str(reference_row["Coordinate_Source"])
            else:
                reason = "Province Only mode requires a recognized Province."
        elif both_valid:
            resolved_lat, resolved_lon = lat, lon
            method, source = "Exact Coordinate", "Input Excel"
        elif mode == "Auto Detect" and both_blank:
            reference_row = reference.lookup(row.get("Province"))
            if reference_row:
                resolved_lat, resolved_lon = float(reference_row["Latitude"]), float(reference_row["Longitude"])
                method, source = "Province Reference Point", str(reference_row["Coordinate_Source"])
            else:
                reason = "No coordinates and Province was not found in the reference table."
        elif mode == "Exact Lat/Long Only":
            reason = "Exact Lat/Long Only mode requires valid Latitude and Longitude."
        elif partial:
            reason = "Latitude and Longitude must both be blank or both be valid numeric coordinates."

        if method == "Invalid Location":
            errors.append({
                "Record_Type": record_type,
                "Record_ID": row.get(id_column, ""),
                "Branch_or_Hub_Name": row.get(name_column, ""),
                "Province": row.get("Province", ""),
                "Latitude": lat_raw,
                "Longitude": lon_raw,
                "Error_Type": "Invalid Location",
                "Error_Message": reason or "Unable to resolve a usable location.",
            })
        else:
            result.at[index, "Resolved_Latitude"] = resolved_lat
            result.at[index, "Resolved_Longitude"] = resolved_lon
            result.at[index, "Location_Method"] = method
            result.at[index, "Coordinate_Source"] = source
            result.at[index, "Location_Valid"] = True
    error_columns = ["Record_Type", "Record_ID", "Branch_or_Hub_Name", "Province", "Latitude", "Longitude", "Error_Type", "Error_Message"]
    return result, pd.DataFrame(errors, columns=error_columns)
