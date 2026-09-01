"""Batched matrix calculation with persistent pair-level caching."""

from __future__ import annotations

from collections.abc import Sequence

import pandas as pd

from config.settings import Settings

from .cache import RouteCache
from .models import Coordinate, RouteMetric
from .routing_provider import RoutingProvider


def _coordinate(row: pd.Series) -> Coordinate:
    return Coordinate(float(row["Resolved_Latitude"]), float(row["Resolved_Longitude"]))


def calculate_distance_matrix(branches: pd.DataFrame, hubs: pd.DataFrame, provider: RoutingProvider, settings: Settings, use_cache: bool = True, force_recalculate: bool = False, logger=None) -> tuple[dict[tuple[int, int], RouteMetric], pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Calculate every valid branch-to-hub pair in origin batches."""
    valid_branches = [(position, row) for position, (_, row) in enumerate(branches.iterrows()) if bool(row.get("Location_Valid", False))]
    valid_hubs = [(position, row) for position, (_, row) in enumerate(hubs.iterrows()) if bool(row.get("Location_Valid", False))]
    metrics: dict[tuple[int, int], RouteMetric] = {}
    failures: list[dict] = []
    cache = RouteCache(settings.cache_path) if use_cache and settings.cache_enabled else None
    try:
        for start in range(0, len(valid_branches), max(1, settings.matrix_batch_size)):
            batch = valid_branches[start:start + max(1, settings.matrix_batch_size)]
            origins = [_coordinate(row) for _, row in batch]
            destinations = [_coordinate(row) for _, row in valid_hubs]
            uncached = False
            for branch_position, branch_row in batch:
                for hub_position, hub_row in valid_hubs:
                    origin, destination = _coordinate(branch_row), _coordinate(hub_row)
                    cached_metric = None if force_recalculate or cache is None else cache.get(origin, destination, settings.routing_profile, provider.name)
                    if cached_metric:
                        metrics[(branch_position, hub_position)] = cached_metric
                        if logger:
                            logger.info("Cache hit branch=%s hub=%s", branch_row.get("Branch_ID"), hub_row.get("Hub_ID"))
                    else:
                        uncached = True
                        if logger:
                            logger.info("Cache miss branch=%s hub=%s", branch_row.get("Branch_ID"), hub_row.get("Hub_ID"))
            if not uncached or not origins or not destinations:
                continue
            try:
                batch_metrics = provider.calculate_matrix(origins, destinations, settings.routing_profile)
                for origin_position, (branch_position, branch_row) in enumerate(batch):
                    for destination_position, (hub_position, hub_row) in enumerate(valid_hubs):
                        metric = batch_metrics.get((origin_position, destination_position))
                        if metric is None:
                            metric = RouteMetric(None, None, source=provider.name, error="Missing pair in matrix response")
                        metrics[(branch_position, hub_position)] = metric
                        if cache and metric.error is None and metric.distance_m is not None:
                            cache.put(_coordinate(branch_row), _coordinate(hub_row), settings.routing_profile, provider.name, metric)
                        if metric.error or metric.distance_m is None:
                            failures.append(_failure(branch_row, hub_row, "Matrix Route Failure", metric.error or "No distance returned"))
            except Exception as exc:  # one failed batch must not stop remaining batches
                if logger:
                    logger.exception("Matrix batch failed: %s", exc)
                for branch_position, branch_row in batch:
                    for hub_position, hub_row in valid_hubs:
                        if (branch_position, hub_position) not in metrics:
                            metrics[(branch_position, hub_position)] = RouteMetric(None, None, source=provider.name, error=str(exc))
                            failures.append(_failure(branch_row, hub_row, "Matrix Request Failure", str(exc)))
    finally:
        if cache:
            cache.close()

    distance_matrix, duration_matrix = _matrix_frames(branches, hubs, metrics)
    failure_columns = ["Branch_ID", "Branch_Name", "Province", "Hub_ID", "Error_Type", "Error_Message"]
    return metrics, distance_matrix, duration_matrix, pd.DataFrame(failures, columns=failure_columns)


def _failure(branch: pd.Series, hub: pd.Series, error_type: str, error_message: str) -> dict:
    return {"Branch_ID": branch.get("Branch_ID", ""), "Branch_Name": branch.get("Branch_Name", ""), "Province": branch.get("Province", ""), "Hub_ID": hub.get("Hub_ID", ""), "Error_Type": error_type, "Error_Message": error_message}


def _matrix_frames(branches: pd.DataFrame, hubs: pd.DataFrame, metrics: dict[tuple[int, int], RouteMetric]) -> tuple[pd.DataFrame, pd.DataFrame]:
    distance_rows, duration_rows = [], []
    for branch_position, (_, branch) in enumerate(branches.iterrows()):
        distance_row = {"Branch_ID": branch.get("Branch_ID", ""), "Branch_Name": branch.get("Branch_Name", "")}
        duration_row = {"Branch_ID": branch.get("Branch_ID", ""), "Branch_Name": branch.get("Branch_Name", "")}
        for hub_position, (_, hub) in enumerate(hubs.iterrows()):
            metric = metrics.get((branch_position, hub_position))
            hub_id = str(hub.get("Hub_ID", ""))
            distance_row[f"Distance_to_{hub_id}_km"] = None if not metric or metric.distance_m is None else metric.distance_m / 1000
            duration_row[f"Duration_to_{hub_id}_min"] = None if not metric or metric.duration_s is None else metric.duration_s / 60
        distance_rows.append(distance_row)
        duration_rows.append(duration_row)
    return pd.DataFrame(distance_rows), pd.DataFrame(duration_rows)
