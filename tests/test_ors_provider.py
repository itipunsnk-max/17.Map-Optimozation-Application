from src.models import Coordinate
from src.ors_provider import OpenRouteServiceProvider


class FakeResponse:
    status_code = 200
    text = "ok"

    def raise_for_status(self):
        return None

    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self):
        self.payloads = []

    def post(self, url, **kwargs):
        self.payloads.append((url, kwargs["json"]))
        if "matrix" in url:
            return FakeResponse({"distances": [[1200, 2400]], "durations": [[60, 120]]})
        return FakeResponse({"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[100, 13], [101, 14]]}, "properties": {"summary": {"distance": 1300, "duration": 70}}}]})


def test_ors_v2_matrix_and_directions_payloads():
    session = FakeSession()
    provider = OpenRouteServiceProvider("key", "https://example/v2/matrix/driving-car", "https://example/v2/directions/driving-car/geojson", retries=0, session=session)
    origins = [Coordinate(13, 100)]
    destinations = [Coordinate(14, 101), Coordinate(15, 102)]
    matrix = provider.calculate_matrix(origins, destinations, "driving-car")
    route = provider.get_route(origins[0], destinations[0], "driving-car")
    assert matrix[(0, 0)].distance_m == 1200000
    assert matrix[(0, 1)].duration_s == 120
    assert route.geometry["type"] == "LineString"
    assert session.payloads[0][0].endswith("/v2/matrix/driving-car")
    assert session.payloads[1][0].endswith("/v2/directions/driving-car/geojson")
    assert session.payloads[0][1]["sources"] == [0]
    assert session.payloads[0][1]["destinations"] == [1, 2]
