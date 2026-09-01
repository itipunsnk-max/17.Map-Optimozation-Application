"""Small typed models shared by routing modules."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class Coordinate:
    latitude: float
    longitude: float

    @property
    def ors_pair(self) -> list[float]:
        return [self.longitude, self.latitude]


@dataclass
class RouteMetric:
    distance_m: float | None
    duration_s: float | None
    source: str = ""
    geometry: dict[str, Any] | None = None
    error: str | None = None


@dataclass
class AnalysisResult:
    route_results: Any
    distance_matrix: Any
    duration_matrix: Any
    province_summary: Any
    hub_summary: Any
    validation_errors: Any
    failed_routes: Any
    calculation_date: datetime
    application_version: str
    routing_profile: str
    routing_source: str
    metadata: dict[str, Any] = field(default_factory=dict)
