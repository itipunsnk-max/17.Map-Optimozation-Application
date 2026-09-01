"""Rank hubs by actual road distance and build auditable result rows."""

from __future__ import annotations

from datetime import datetime

import pandas as pd

from config.settings import Settings, distance_band

from .haversine import haversine_km
from .models import Coordinate, RouteMetric


def rank_hubs(branches: pd.DataFrame, hubs: pd.DataFrame, metrics: dict[tuple[int, int], RouteMetric], settings: Settings, calculation_date: datetime, routing_source: str) -> pd.DataFrame:
    output: list[dict] = []
    for branch_position, (_, branch) in enumerate(branches.iterrows()):
        row = {
            "Branch_ID": branch.get("Branch_ID", ""), "Branch_Name": branch.get("Branch_Name", ""), "Province": branch.get("Province", ""),
            "Input_Latitude": branch.get("Input_Latitude", ""), "Input_Longitude": branch.get("Input_Longitude", ""),
            "Resolved_Latitude": branch.get("Resolved_Latitude", ""), "Resolved_Longitude": branch.get("Resolved_Longitude", ""),
            "Location_Method": branch.get("Location_Method", "Invalid Location"), "Coordinate_Source": branch.get("Coordinate_Source", ""),
            "Assigned_Hub_ID": "", "Assigned_Hub_Name": "", "Assigned_Region": "", "Hub_Latitude": None, "Hub_Longitude": None,
            "Hub_Location_Method": "", "Hub_Coordinate_Source": "",
            "Road_Distance_km": None, "Travel_Time_min": None, "Straight_Line_Distance_km": None,
            "Rank_2_Hub_ID": "", "Rank_2_Hub_Name": "", "Rank_2_Distance_km": None,
            "Rank_3_Hub_ID": "", "Rank_3_Hub_Name": "", "Rank_3_Distance_km": None,
            "Distance_Band": "Not Available", "Routing_Profile": settings.routing_profile, "Routing_Source": routing_source,
            "Calculation_Date": calculation_date, "Application_Version": settings.app_version,
            "Status": "Invalid Location" if not bool(branch.get("Location_Valid", False)) else "Routing Failed",
            "_Branch_Position": branch_position, "_Assigned_Hub_Position": None, "Route_Geometry": None,
        }
        if bool(branch.get("Location_Valid", False)):
            ranked: list[tuple[int, pd.Series, RouteMetric]] = []
            for hub_position, (_, hub) in enumerate(hubs.iterrows()):
                metric = metrics.get((branch_position, hub_position))
                if metric and metric.error is None and metric.distance_m is not None:
                    ranked.append((hub_position, hub, metric))
            ranked.sort(key=lambda item: (float(item[2].distance_m), str(item[1].get("Hub_ID", ""))))
            if ranked:
                assigned_position, assigned_hub, assigned_metric = ranked[0]
                row.update({
                    "Assigned_Hub_ID": assigned_hub.get("Hub_ID", ""), "Assigned_Hub_Name": assigned_hub.get("Hub_Name", ""), "Assigned_Region": assigned_hub.get("Region", ""),
                    "Hub_Latitude": assigned_hub.get("Resolved_Latitude"), "Hub_Longitude": assigned_hub.get("Resolved_Longitude"),
                    "Hub_Location_Method": assigned_hub.get("Location_Method", ""), "Hub_Coordinate_Source": assigned_hub.get("Coordinate_Source", ""),
                    "Road_Distance_km": float(assigned_metric.distance_m) / 1000, "Travel_Time_min": None if assigned_metric.duration_s is None else float(assigned_metric.duration_s) / 60,
                    "Straight_Line_Distance_km": haversine_km(Coordinate(float(branch["Resolved_Latitude"]), float(branch["Resolved_Longitude"])), Coordinate(float(assigned_hub["Resolved_Latitude"]), float(assigned_hub["Resolved_Longitude"]))),
                    "Distance_Band": distance_band(float(assigned_metric.distance_m) / 1000, settings.distance_bands), "Status": "OK",
                    "_Assigned_Hub_Position": assigned_position, "Route_Geometry": assigned_metric.geometry,
                })
                if len(ranked) > 1:
                    row.update({"Rank_2_Hub_ID": ranked[1][1].get("Hub_ID", ""), "Rank_2_Hub_Name": ranked[1][1].get("Hub_Name", ""), "Rank_2_Distance_km": float(ranked[1][2].distance_m) / 1000})
                if len(ranked) > 2:
                    row.update({"Rank_3_Hub_ID": ranked[2][1].get("Hub_ID", ""), "Rank_3_Hub_Name": ranked[2][1].get("Hub_Name", ""), "Rank_3_Distance_km": float(ranked[2][2].distance_m) / 1000})
        output.append(row)
    return pd.DataFrame(output)
