const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const XLSX = require("xlsx");

const { analyzeInputWorkbook } = require("../node_modules/.cache/route-tests/lib/geojson.js");
const { provinceReference } = require("../node_modules/.cache/route-tests/lib/province-reference.js");
const inputDirectory = process.env.ROUTE_INPUT_DIR
  ? path.resolve(process.env.ROUTE_INPUT_DIR)
  : path.join(__dirname, "..", "..", "input");

const normalizeProvince = (value) => String(value ?? "").trim().toLowerCase()
  .replace(/^จังหวัด\s*/, "")
  .replace(/\s*province\s*$/, "")
  .replace(/[\s_\-–—./()]+/g, "");

const provinceAliases = {
  กรุงเทพ: "กรุงเทพมหานคร",
  "กรุงเทพฯ": "กรุงเทพมหานคร",
  อยุธยา: "พระนครศรีอยุธยา",
};

const provinceCoordinates = new Map(provinceReference.flatMap((province) => [
  [normalizeProvince(province.thai), [province.latitude, province.longitude]],
  [normalizeProvince(province.english), [province.latitude, province.longitude]],
]));

const coordinateFrom = (row) => {
  const latitude = row.Latitude === undefined || row.Latitude === null || String(row.Latitude).trim() === "" ? Number.NaN : Number(row.Latitude);
  const longitude = row.Longitude === undefined || row.Longitude === null || String(row.Longitude).trim() === "" ? Number.NaN : Number(row.Longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return [latitude, longitude];
  const normalized = normalizeProvince(row.Province);
  return provinceCoordinates.get(normalizeProvince(provinceAliases[normalized] ?? normalized));
};

const haversineKm = ([lat1, lon1], [lat2, lon2]) => {
  const radians = (value) => value * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const cases = [
  ["sample_locations.xlsx", 77, 77, 77],
  ["sample_locations-2.xlsx", 24, 10, 4],
  ["sample_locations-3.xlsx", 77, 77, 14],
];

for (const [fileName, totalBranches, importedBranches, resolvedHubs] of cases) {
  test(`${fileName} imports all resolvable branches and assigns the nearest hub`, () => {
    const workbook = XLSX.readFile(path.join(inputDirectory, fileName));
    const branches = XLSX.utils.sheet_to_json(workbook.Sheets.Branches);
    const hubs = XLSX.utils.sheet_to_json(workbook.Sheets.Regional_Hubs);
    const result = analyzeInputWorkbook(branches, hubs);
    assert.equal(result.report.totalBranches, totalBranches);
    assert.equal(result.report.importedBranches, importedBranches);
    assert.equal(result.report.resolvedHubs, resolvedHubs);
    assert.equal(result.dataset.features.length, importedBranches);

    const candidates = hubs.flatMap((hub) => {
      const coordinate = coordinateFrom(hub);
      return coordinate ? [{ id: String(hub.Hub_ID), coordinate }] : [];
    });
    for (const feature of result.dataset.features) {
      const [branchLongitude, branchLatitude] = feature.geometry.coordinates[0];
      const expected = candidates.reduce((nearest, candidate) =>
        haversineKm([branchLatitude, branchLongitude], candidate.coordinate) < haversineKm([branchLatitude, branchLongitude], nearest.coordinate)
          ? candidate
          : nearest,
      );
      assert.equal(feature.properties.Hub_ID, expected.id, `${fileName}: ${feature.properties.Branch_ID}`);
    }
  });
}
