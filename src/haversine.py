"""Geodesic reference calculations."""

from __future__ import annotations

import math

from .models import Coordinate


EARTH_RADIUS_KM = 6371.0088


def haversine_km(origin: Coordinate | tuple[float, float], destination: Coordinate | tuple[float, float]) -> float:
    """Calculate straight-line great-circle distance in kilometres."""
    if not isinstance(origin, Coordinate):
        origin = Coordinate(float(origin[0]), float(origin[1]))
    if not isinstance(destination, Coordinate):
        destination = Coordinate(float(destination[0]), float(destination[1]))
    lat1, lon1, lat2, lon2 = map(math.radians, (origin.latitude, origin.longitude, destination.latitude, destination.longitude))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def is_thailand_coordinate(coordinate: Coordinate, bounds: tuple[float, float, float, float]) -> bool:
    min_lat, max_lat, min_lon, max_lon = bounds
    return min_lat <= coordinate.latitude <= max_lat and min_lon <= coordinate.longitude <= max_lon
