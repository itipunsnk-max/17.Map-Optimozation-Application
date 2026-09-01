"""OpenRouteService v2 matrix and directions provider."""

from __future__ import annotations

import time
from typing import Sequence

import requests

from .models import Coordinate, RouteMetric
from .routing_provider import RoutingProvider


class RoutingRequestError(RuntimeError):
    """Raised when a routing API request cannot produce usable data."""


class OpenRouteServiceProvider(RoutingProvider):
    name = "openrouteservice"

    def __init__(self, api_key: str, matrix_url: str, directions_geojson_url: str, timeout: float = 30, retries: int = 3, backoff: float = 1.0, session: requests.Session | None = None, logger=None):
        self.api_key = api_key.strip()
        self.matrix_url = matrix_url
        self.directions_geojson_url = directions_geojson_url
        self.timeout = timeout
        self.retries = max(0, retries)
        self.backoff = max(0.0, backoff)
        self.session = session or requests.Session()
        self.logger = logger

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": self.api_key, "Content-Type": "application/json", "Accept": "application/json, application/geo+json"}

    def _post_json(self, url: str, payload: dict) -> dict:
        if not self.api_key:
            raise RoutingRequestError("ORS_API_KEY is not configured. Set it in .env or select Offline Demo for testing.")
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                response = self.session.post(url, json=payload, headers=self.headers, timeout=self.timeout)
                if self.logger:
                    self.logger.info("API request %s status=%s attempt=%s", url, response.status_code, attempt + 1)
                if response.status_code == 429 or response.status_code >= 500:
                    raise requests.HTTPError(f"HTTP {response.status_code}: {response.text[:300]}")
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise RoutingRequestError("API returned a non-object JSON response.")
                return data
            except (requests.RequestException, ValueError, RoutingRequestError) as exc:
                last_error = exc
                if self.logger:
                    self.logger.warning("API request failed (%s): %s", url, exc)
                if attempt < self.retries:
                    time.sleep(self.backoff * (2 ** attempt))
        raise RoutingRequestError(str(last_error or "Unknown routing request failure"))

    def calculate_matrix(self, origins: Sequence[Coordinate], destinations: Sequence[Coordinate], profile: str) -> dict[tuple[int, int], RouteMetric]:
        payload = {
            "locations": [coordinate.ors_pair for coordinate in list(origins) + list(destinations)],
            "sources": list(range(len(origins))),
            "destinations": list(range(len(origins), len(origins) + len(destinations))),
            "metrics": ["distance", "duration"],
            # ORS Matrix returns distances in the requested unit. Keep the
            # provider boundary in metres so all downstream calculations use
            # one canonical unit.
            "units": "km",
        }
        # ORS supports independent sources/destinations, but locations must be one combined list.
        data = self._post_json(self.matrix_url, payload)
        distances, durations = data.get("distances"), data.get("durations")
        if not isinstance(distances, list) or not isinstance(durations, list):
            raise RoutingRequestError("Matrix response is missing distances or durations arrays.")
        output: dict[tuple[int, int], RouteMetric] = {}
        for i in range(len(origins)):
            if i >= len(distances) or i >= len(durations):
                raise RoutingRequestError("Matrix response has fewer rows than requested origins.")
            for j in range(len(destinations)):
                distance = distances[i][j] if isinstance(distances[i], list) and j < len(distances[i]) else None
                duration = durations[i][j] if isinstance(durations[i], list) and j < len(durations[i]) else None
                if distance is None or duration is None:
                    output[(i, j)] = RouteMetric(None, None, source=self.name, error="No route returned by ORS")
                else:
                    output[(i, j)] = RouteMetric(float(distance) * 1000, float(duration), source=self.name)
        return output

    def get_route(self, origin: Coordinate, destination: Coordinate, profile: str) -> RouteMetric:
        data = self._post_json(self.directions_geojson_url, {"coordinates": [origin.ors_pair, destination.ors_pair], "preference": "shortest", "instructions": False})
        features = data.get("features") if isinstance(data, dict) else None
        feature = features[0] if isinstance(features, list) and features else data if data.get("type") == "Feature" else None
        if not isinstance(feature, dict) or not isinstance(feature.get("geometry"), dict):
            raise RoutingRequestError("Directions response does not contain GeoJSON geometry.")
        properties = feature.get("properties") or {}
        summary = properties.get("summary") or data.get("summary") or {}
        distance = summary.get("distance")
        duration = summary.get("duration")
        return RouteMetric(float(distance) if distance is not None else None, float(duration) if duration is not None else None, source=self.name, geometry=feature["geometry"])

    def health_check(self) -> bool:
        return bool(self.api_key)
