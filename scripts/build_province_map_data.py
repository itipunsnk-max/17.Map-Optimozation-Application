"""Create the compact province geometry used by the web export maps.

Source: geoBoundaries THA ADM1, pinned to commit 9469f09 (77 units).
Run with --source to reuse a downloaded copy, or omit it to fetch the source.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen

from shapely.geometry import mapping, shape


SOURCE_URL = (
    "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/"
    "gbOpen/THA/ADM1/geoBoundaries-THA-ADM1_simplified.geojson"
)
OUTPUT = Path(__file__).resolve().parents[1] / "web/data/thailand_provinces.json"


def compact(value):
    if isinstance(value, (list, tuple)):
        return [compact(item) for item in value]
    if isinstance(value, (int, float)):
        return round(value, 4)
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, help="Local copy of the pinned GeoJSON")
    args = parser.parse_args()
    if args.source:
        source = args.source.read_bytes()
    else:
        with urlopen(Request(SOURCE_URL, headers={"User-Agent": "Route-Intelligence/1.0"})) as response:
            source = response.read()
    original = json.loads(source)
    features = []
    source_features = original if isinstance(original, list) else original["features"]
    for feature in source_features:
        properties = feature.get("properties", feature)
        geometry = shape(feature["geometry"]).simplify(0.006, preserve_topology=True)
        if geometry.is_empty:
            raise ValueError("Province geometry became empty during simplification")
        features.append({
            "name": properties.get("shapeName", properties.get("name", "")).removesuffix(" Province"),
            "code": properties.get("shapeISO", properties.get("code")),
            "geometry": compact(mapping(geometry)),
        })
    features.sort(key=lambda item: item["code"])
    assert len(features) == 77 and len({item["code"] for item in features}) == 77
    OUTPUT.write_text(json.dumps(features, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(features)} provinces to {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
