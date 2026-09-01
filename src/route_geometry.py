"""Retrieve detailed geometry only for each branch's assigned hub."""

from __future__ import annotations

import pandas as pd

from config.settings import Settings

from .cache import RouteCache
from .models import Coordinate
from .routing_provider import RoutingProvider


def retrieve_assigned_geometry(results: pd.DataFrame, branches: pd.DataFrame, hubs: pd.DataFrame, provider: RoutingProvider, settings: Settings, use_cache: bool = True, force_recalculate: bool = False, logger=None) -> pd.DataFrame:
    """Enrich assigned rows with geometry; this makes at most one request per branch."""
    cache = RouteCache(settings.cache_path) if use_cache and settings.cache_enabled else None
    try:
        for index, result in results.iterrows():
            hub_position = result.get("_Assigned_Hub_Position")
            if pd.isna(hub_position) or hub_position is None:
                continue
            branch_position = int(result["_Branch_Position"])
            hub_position = int(hub_position)
            branch = branches.iloc[branch_position]
            hub = hubs.iloc[hub_position]
            origin = Coordinate(float(branch["Resolved_Latitude"]), float(branch["Resolved_Longitude"]))
            destination = Coordinate(float(hub["Resolved_Latitude"]), float(hub["Resolved_Longitude"]))
            metric = None if force_recalculate or cache is None else cache.get(origin, destination, settings.routing_profile, provider.name)
            if metric and metric.geometry is not None:
                results.at[index, "Route_Geometry"] = metric.geometry
                continue
            try:
                metric = provider.get_route(origin, destination, settings.routing_profile)
                results.at[index, "Route_Geometry"] = metric.geometry
                if cache and metric.geometry is not None:
                    cache.put(origin, destination, settings.routing_profile, provider.name, metric)
                if logger:
                    logger.info("Retrieved assigned geometry branch=%s hub=%s", result.get("Branch_ID"), result.get("Assigned_Hub_ID"))
            except Exception as exc:
                if logger:
                    logger.exception("Assigned geometry failed branch=%s: %s", result.get("Branch_ID"), exc)
                results.at[index, "Status"] = "OK - Geometry Unavailable"
                results.at[index, "_Geometry_Error"] = str(exc)
    finally:
        if cache:
            cache.close()
    return results
