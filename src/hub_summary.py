"""Regional hub assignment summary."""

from __future__ import annotations

import pandas as pd


def build_hub_summary(results: pd.DataFrame, hubs: pd.DataFrame) -> pd.DataFrame:
    total = len(results)
    rows = []
    for _, hub in hubs.iterrows():
        hub_id = hub.get("Hub_ID", "")
        group = results[(results["Status"].astype(str).str.startswith("OK")) & (results["Assigned_Hub_ID"].astype(str) == str(hub_id))]
        distances = pd.to_numeric(group["Road_Distance_km"], errors="coerce").dropna()
        durations = pd.to_numeric(group["Travel_Time_min"], errors="coerce").dropna()
        rows.append({
            "Hub_ID": hub_id, "Hub_Name": hub.get("Hub_Name", ""), "Region": hub.get("Region", ""),
            "Assigned_Branch_Count": len(group), "Assigned_Province_Count": group["Province"].nunique() if not group.empty else 0,
            "Average_Distance_km": distances.mean() if not distances.empty else None, "Minimum_Distance_km": distances.min() if not distances.empty else None,
            "Maximum_Distance_km": distances.max() if not distances.empty else None, "Average_Travel_Time_min": durations.mean() if not durations.empty else None,
            "Maximum_Travel_Time_min": durations.max() if not durations.empty else None, "Percent_of_Total_Branches": (len(group) / total * 100) if total else 0,
        })
    return pd.DataFrame(rows, columns=["Hub_ID", "Hub_Name", "Region", "Assigned_Branch_Count", "Assigned_Province_Count", "Average_Distance_km", "Minimum_Distance_km", "Maximum_Distance_km", "Average_Travel_Time_min", "Maximum_Travel_Time_min", "Percent_of_Total_Branches"])
