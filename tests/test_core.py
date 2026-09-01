from dataclasses import replace

import pandas as pd

from config.settings import distance_band, get_settings
from src.cache import RouteCache
from src.haversine import haversine_km
from src.location_resolver import resolve_locations
from src.models import Coordinate, RouteMetric
from src.province_reference import normalize_province_name
from src.province_resolver import load_province_reference
from src.route_ranker import rank_hubs
from src.routing_provider import OfflineRoutingProvider
from src.validation import validate_coordinate_pair, validate_records


def _frames():
    branches = pd.DataFrame([
        {"Branch_ID": "B001", "Branch_Name": "Rayong exact", "Province": "ระยอง", "Latitude": 12.681, "Longitude": 101.281},
        {"Branch_ID": "B002", "Branch_Name": "Chiang Mai province", "Province": "Chiang Mai", "Latitude": "", "Longitude": ""},
        {"Branch_ID": "B003", "Branch_Name": "Invalid", "Province": "Unknown Province", "Latitude": 10, "Longitude": ""},
    ])
    hubs = pd.DataFrame([
        {"Hub_ID": "H-BKK", "Region": "Central", "Hub_Name": "Bangkok Hub", "Province": "Bangkok", "Latitude": 13.7563, "Longitude": 100.5018},
        {"Hub_ID": "H-CMI", "Region": "North", "Hub_Name": "Chiang Mai Hub", "Province": "เชียงใหม่", "Latitude": 18.7883, "Longitude": 98.9853},
    ])
    return branches, hubs


def test_haversine_and_coordinate_validation():
    assert 110 < haversine_km(Coordinate(0, 0), Coordinate(1, 0)) < 112
    assert validate_coordinate_pair(12.3, 101.2)[0]
    assert not validate_coordinate_pair(100, 101.2)[0]


def test_all_77_provinces_and_normalization():
    reference = load_province_reference()
    assert len(reference.data) == 77
    assert reference.data["Province_Code"].nunique() == 77
    assert reference.data[["Latitude", "Longitude"]].notna().all().all()
    assert normalize_province_name(" จังหวัดกรุงเทพมหานคร ") == normalize_province_name("กรุงเทพมหานคร")
    assert reference.lookup("จังหวัดกรุงเทพมหานคร")["Province_Code"] == "BKK"
    assert reference.lookup("จังหวัดกรุงเทพ")["Province_Code"] == "BKK"
    assert reference.lookup("Ayutthaya")["Province_Code"] == "AYA"


def test_location_modes_and_exact_override():
    branches, hubs = _frames()
    reference = load_province_reference()
    resolved, errors = resolve_locations(branches, "Branch", "Auto Detect", reference)
    assert resolved.loc[0, "Location_Method"] == "Exact Coordinate"
    assert resolved.loc[1, "Location_Method"] == "Province Reference Point"
    assert not resolved.loc[2, "Location_Valid"]
    province_only, _ = resolve_locations(branches.iloc[[0]], "Branch", "Province Only", reference)
    assert province_only.iloc[0]["Location_Method"] == "Province Reference Point"
    exact_only, _ = resolve_locations(branches.iloc[[1]], "Branch", "Exact Lat/Long Only", reference)
    assert not exact_only.iloc[0]["Location_Valid"]


def test_validation_reports_duplicates_unknown_and_bad_coordinates():
    reference = load_province_reference()
    frame = pd.DataFrame([
        {"Branch_ID": "B1", "Branch_Name": "A", "Province": "No Such Province", "Latitude": 12, "Longitude": 101},
        {"Branch_ID": "B1", "Branch_Name": "B", "Province": "ระยอง", "Latitude": "bad", "Longitude": 101},
    ])
    errors = validate_records(frame, "Branch", reference)
    types = set(errors["Error_Type"])
    assert {"Duplicate ID", "Unknown Province", "Malformed Coordinates"}.issubset(types)


def test_ranking_uses_road_distance_and_conversions():
    branches, hubs = _frames()
    reference = load_province_reference()
    branches, _ = resolve_locations(branches.iloc[[0]], "Branch", "Auto Detect", reference)
    hubs, _ = resolve_locations(hubs, "Hub", "Auto Detect", reference)
    settings = replace(get_settings(), cache_path=__import__("pathlib").Path("cache") / "test-routing.sqlite3")
    metrics = {(0, 0): RouteMetric(200000, 7200, source="mock"), (0, 1): RouteMetric(100000, 3600, source="mock")}
    results = rank_hubs(branches, hubs, metrics, settings, __import__("datetime").datetime.now(), "mock")
    assert results.iloc[0]["Assigned_Hub_ID"] == "H-CMI"
    assert results.iloc[0]["Road_Distance_km"] == 100
    assert results.iloc[0]["Travel_Time_min"] == 60
    assert results.iloc[0]["Rank_2_Distance_km"] == 200
    assert distance_band(50) == "0-50 km"
    assert distance_band(50.01) == "> 50-100 km"
    assert distance_band(350) == "> 300 km"


def test_sqlite_cache_round_trip(tmp_path):
    cache = RouteCache(tmp_path / "cache.sqlite3")
    origin, destination = Coordinate(13.7, 100.5), Coordinate(12.7, 101.2)
    metric = RouteMetric(12345, 678, source="mock", geometry={"type": "LineString", "coordinates": [[100.5, 13.7], [101.2, 12.7]]})
    cache.put(origin, destination, "driving-car", "mock", metric)
    found = cache.get(origin, destination, "driving-car", "mock")
    cache.close()
    assert found is not None
    assert found.distance_m == 12345
    assert found.geometry["type"] == "LineString"


def test_offline_provider_matrix_and_geometry():
    provider = OfflineRoutingProvider()
    matrix = provider.calculate_matrix([Coordinate(13.7, 100.5)], [Coordinate(12.7, 101.2)], "driving-car")
    assert matrix[(0, 0)].distance_m > 0
    assert provider.get_route(Coordinate(13.7, 100.5), Coordinate(12.7, 101.2), "driving-car").geometry["type"] == "LineString"
