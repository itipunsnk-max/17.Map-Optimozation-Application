"""Routing provider abstraction and an explicit offline test/demo provider."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Sequence

from .haversine import haversine_km
from .models import Coordinate, RouteMetric


class RoutingProvider(ABC):
    name = "routing-provider"

    @abstractmethod
    def calculate_matrix(self, origins: Sequence[Coordinate], destinations: Sequence[Coordinate], profile: str) -> dict[tuple[int, int], RouteMetric]:
        """Return road metrics keyed by zero-based origin and destination positions."""

    @abstractmethod
    def get_route(self, origin: Coordinate, destination: Coordinate, profile: str) -> RouteMetric:
        """Return one detailed route, including GeoJSON geometry when available."""

    def health_check(self) -> bool:
        return True


class OfflineRoutingProvider(RoutingProvider):
    """Deterministic development provider; never presented as actual road distance."""

    name = "offline-demo"

    def __init__(self, road_factor: float = 1.22, average_speed_kmh: float = 55.0):
        self.road_factor = road_factor
        self.average_speed_kmh = average_speed_kmh

    def _metric(self, origin: Coordinate, destination: Coordinate) -> RouteMetric:
        distance_m = haversine_km(origin, destination) * self.road_factor * 1000
        duration_s = distance_m / 1000 / self.average_speed_kmh * 3600
        geometry = {"type": "LineString", "coordinates": [origin.ors_pair, destination.ors_pair]}
        return RouteMetric(distance_m, duration_s, source="Offline demo approximation (not actual road routing)", geometry=geometry)

    def calculate_matrix(self, origins: Sequence[Coordinate], destinations: Sequence[Coordinate], profile: str) -> dict[tuple[int, int], RouteMetric]:
        return {(i, j): self._metric(origin, destination) for i, origin in enumerate(origins) for j, destination in enumerate(destinations)}

    def get_route(self, origin: Coordinate, destination: Coordinate, profile: str) -> RouteMetric:
        return self._metric(origin, destination)
