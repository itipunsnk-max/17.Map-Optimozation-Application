# Thailand provincial boundaries

`thailand_provinces.json` contains 77 ADM1 units derived from the geoBoundaries
Thailand gbOpen simplified GeoJSON, pinned to commit `9469f09`:

https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/THA/ADM1/geoBoundaries-THA-ADM1_simplified.geojson

The geoBoundaries API identifies the underlying source as OpenStreetMap and
Wambacher, boundary year 2017, and license as Open Data Commons Open Database
License 1.0 (ODbL). Attribution: © OpenStreetMap contributors, geoBoundaries.

The checked-in data retains the province name, ISO code, and geometry, simplified
at 0.006 degrees and rounded to four decimal places for this map. Install Shapely
and run `python scripts/build_province_map_data.py` to rebuild it from the pinned
source. These boundaries are for visual orientation
in exports and are not a survey or legal boundary reference.
