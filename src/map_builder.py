"""Folium map construction with accessible location-mode markers."""

from __future__ import annotations

import html
import json
from collections import defaultdict

import pandas as pd

from config.settings import Settings


def _popup(row: pd.Series) -> str:
    fields = [
        ("Branch ID", row.get("Branch_ID", "")), ("Branch Name", row.get("Branch_Name", "")), ("Province", row.get("Province", "")),
        ("Location Method", row.get("Location_Method", "")), ("Assigned Hub", row.get("Assigned_Hub_Name", "")), ("Assigned Region", row.get("Assigned_Region", "")),
        ("Road Distance (km)", _display(row.get("Road_Distance_km"))), ("Travel Time (min)", _display(row.get("Travel_Time_min"))), ("Distance Band", row.get("Distance_Band", "")),
    ]
    return "<div style='font-size:13px'>" + "".join(f"<b>{html.escape(str(label))}:</b> {html.escape(str(value))}<br>" for label, value in fields) + "</div>"


def _display(value) -> str:
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return f"{float(value):,.2f}" if isinstance(value, (float, int)) else str(value)


def build_map(results: pd.DataFrame, hubs: pd.DataFrame, settings: Settings):
    """Return a Folium map; route geometry is rendered only for assigned routes."""
    import folium
    from folium.plugins import MarkerCluster

    fmap = folium.Map(location=list(settings.default_map_center), zoom_start=settings.default_zoom, control_scale=True, tiles="OpenStreetMap")
    branches_layer = folium.FeatureGroup(name="Branches", show=True)
    hubs_layer = folium.FeatureGroup(name="Regional Hubs", show=True)
    routes_layer = folium.FeatureGroup(name="All Routes", show=True)
    clusters = MarkerCluster(name="Branches (clustered)").add_to(branches_layer)
    region_layers: dict[str, folium.FeatureGroup] = {}
    bounds: list[list[float]] = []

    for _, hub in hubs.iterrows():
        if pd.isna(hub.get("Resolved_Latitude")) or pd.isna(hub.get("Resolved_Longitude")):
            continue
        lat, lon = float(hub["Resolved_Latitude"]), float(hub["Resolved_Longitude"])
        popup = f"<b>Hub ID:</b> {html.escape(str(hub.get('Hub_ID', '')))}<br><b>Hub Name:</b> {html.escape(str(hub.get('Hub_Name', '')))}<br><b>Region:</b> {html.escape(str(hub.get('Region', '')))}<br><b>Location Method:</b> {html.escape(str(hub.get('Location_Method', '')))}"
        folium.Marker([lat, lon], popup=folium.Popup(popup, max_width=320), tooltip=str(hub.get("Hub_Name", "")), icon=folium.Icon(color="red", icon="home", prefix="fa")).add_to(hubs_layer)
        bounds.append([lat, lon])

    for _, row in results.iterrows():
        if pd.isna(row.get("Resolved_Latitude")) or pd.isna(row.get("Resolved_Longitude")):
            continue
        lat, lon = float(row["Resolved_Latitude"]), float(row["Resolved_Longitude"])
        exact = row.get("Location_Method") == "Exact Coordinate"
        # Different icon shapes communicate exact vs representative points in addition to color.
        icon_name = "map-marker" if exact else "info-sign"
        icon_color = "blue" if exact else "green"
        folium.Marker([lat, lon], popup=folium.Popup(_popup(row), max_width=340), tooltip=str(row.get("Branch_Name", "")), icon=folium.Icon(color=icon_color, icon=icon_name)).add_to(clusters)
        bounds.append([lat, lon])
        geometry = row.get("Route_Geometry")
        if isinstance(geometry, str):
            try:
                geometry = json.loads(geometry)
            except json.JSONDecodeError:
                geometry = None
        if isinstance(geometry, dict) and geometry.get("coordinates"):
            region = str(row.get("Assigned_Region", "Unassigned"))
            if region not in region_layers:
                region_layers[region] = folium.FeatureGroup(name=region, show=True)
            style = {"color": _region_color(region), "weight": 3, "opacity": 0.75}
            tooltip = f"{row.get('Branch_ID', '')} → {row.get('Assigned_Hub_Name', '')}"
            folium.GeoJson(geometry, name=f"Route {row.get('Branch_ID', '')}", style_function=lambda _feature, style=style: style, tooltip=tooltip).add_to(region_layers[region])
            # Add a second lightweight layer so users can toggle all routes at once.
            folium.GeoJson(geometry, name=f"All Route {row.get('Branch_ID', '')}", style_function=lambda _feature, style=style: style, tooltip=tooltip).add_to(routes_layer)

    branches_layer.add_to(fmap)
    hubs_layer.add_to(fmap)
    for region_layer in region_layers.values():
        region_layer.add_to(fmap)
    routes_layer.add_to(fmap)
    folium.LayerControl(collapsed=False).add_to(fmap)
    if bounds:
        fmap.fit_bounds(bounds, padding=(20, 20))
    return fmap


def _region_color(region: str) -> str:
    colors = ["purple", "orange", "darkred", "cadetblue", "darkgreen", "black", "pink", "gray"]
    return colors[sum(ord(char) for char in region) % len(colors)]


def save_map(results: pd.DataFrame, hubs: pd.DataFrame, settings: Settings, path) -> str:
    from pathlib import Path

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    fmap = build_map(results, hubs, settings)
    fmap.save(str(path))
    return str(path)
