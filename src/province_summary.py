"""Province-level output summary."""

from __future__ import annotations

import pandas as pd


def _mode(values: pd.Series) -> str:
    values = values.dropna().astype(str)
    return values.mode().iloc[0] if not values.empty and not values.mode().empty else ""


def build_province_summary(results: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for province, group in results.groupby("Province", dropna=False, sort=True):
        province_text = "" if pd.isna(province) else str(province)
        assigned = group[group["Status"].astype(str).str.startswith("OK")]
        distances = pd.to_numeric(assigned["Road_Distance_km"], errors="coerce").dropna()
        durations = pd.to_numeric(assigned["Travel_Time_min"], errors="coerce").dropna()
        rows.append({
            "Province": province_text, "Branch_Count": len(group),
            "Exact_Coordinate_Count": int((group["Location_Method"] == "Exact Coordinate").sum()),
            "Province_Mode_Count": int((group["Location_Method"] == "Province Reference Point").sum()),
            "Dominant_Assigned_Hub": _mode(assigned["Assigned_Hub_Name"]) if not assigned.empty else "",
            "Dominant_Region": _mode(assigned["Assigned_Region"]) if not assigned.empty else "",
            "Average_Road_Distance_km": distances.mean() if not distances.empty else None,
            "Minimum_Road_Distance_km": distances.min() if not distances.empty else None,
            "Maximum_Road_Distance_km": distances.max() if not distances.empty else None,
            "Average_Travel_Time_min": durations.mean() if not durations.empty else None,
            "Maximum_Travel_Time_min": durations.max() if not durations.empty else None,
        })
    return pd.DataFrame(rows, columns=["Province", "Branch_Count", "Exact_Coordinate_Count", "Province_Mode_Count", "Dominant_Assigned_Hub", "Dominant_Region", "Average_Road_Distance_km", "Minimum_Road_Distance_km", "Maximum_Road_Distance_km", "Average_Travel_Time_min", "Maximum_Travel_Time_min"])
