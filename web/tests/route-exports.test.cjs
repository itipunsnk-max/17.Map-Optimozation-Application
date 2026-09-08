const assert = require("node:assert/strict");
const test = require("node:test");
const ExcelJS = require("exceljs");

const { analyzeInputWorkbook, routeDistanceCeiling } = require("../node_modules/.cache/route-tests/lib/geojson.js");
const { routeFeaturesToHtml } = require("../node_modules/.cache/route-tests/lib/route-html-export.js");
const { buildRouteWorkbook } = require("../node_modules/.cache/route-tests/lib/route-workbook-export.js");

const branches = [
  { Branch_ID: "B01", Branch_Name: "Bangkok", Province: "Bangkok", Latitude: 13.7563, Longitude: 100.5018 },
  { Branch_ID: "B02", Branch_Name: "Chiang Mai", Province: "เชียงใหม่", Latitude: 18.7883, Longitude: 98.9853 },
];

const hubs = [
  { Hub_ID: "H01", Region: "Central", Hub_Name: "Bangkok Hub", Province: "Bangkok", Latitude: 13.75, Longitude: 100.5 },
  { Hub_ID: "H02", Region: "North", Hub_Name: "Chiang Mai Hub", Province: "เชียงใหม่", Latitude: 18.79, Longitude: 98.99 },
];

test("imports every valid branch and assigns the nearest hub", () => {
  const result = analyzeInputWorkbook(branches, hubs);
  assert.equal(result.report.totalBranches, 2);
  assert.equal(result.report.importedBranches, 2);
  assert.equal(result.report.skippedBranches, 0);
  assert.deepEqual(result.dataset.features.map((feature) => feature.properties.Hub_ID), ["H01", "H02"]);
  assert.ok(result.dataset.features.every((feature) => Number.isFinite(feature.properties.Distance_km)));
});

test("reports rows that cannot be resolved instead of silently dropping them", () => {
  const result = analyzeInputWorkbook([...branches, { Branch_ID: "B03" }], hubs);
  assert.equal(result.report.totalBranches, 3);
  assert.equal(result.report.importedBranches, 2);
  assert.equal(result.report.skippedBranches, 1);
});

test("treats blank coordinate cells as missing and falls back to province reference", () => {
  const result = analyzeInputWorkbook([
    { Branch_ID: "B03", Branch_Name: "Province-only", Province: "Bangkok", Latitude: "", Longitude: "" },
  ], hubs);
  assert.equal(result.dataset.features.length, 1);
  assert.equal(result.dataset.features[0].properties.Location_Method, "Province reference point");
  assert.notDeepEqual(result.dataset.features[0].geometry.coordinates[0], [0, 0]);
});

test("expands the distance filter ceiling so imported routes are not hidden", () => {
  const { dataset } = analyzeInputWorkbook(branches, hubs);
  dataset.features[0].properties.Distance_km = 612;
  assert.equal(routeDistanceCeiling(dataset.features), 650);
});

test("exports an interactive HTML map with route-distance tooltips", () => {
  const { dataset } = analyzeInputWorkbook(branches, hubs);
  const html = routeFeaturesToHtml(dataset.features, "Fixture routes");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /leaflet/i);
  assert.match(html, /bindTooltip/);
  assert.match(html, /Distance/);
  assert.match(html, /google\.com\/maps\/dir/);
  assert.match(html, /B01/);
});

test("creates Excel with Route_Map as the first sheet and an embedded map", async () => {
  const { dataset } = analyzeInputWorkbook(branches, hubs);
  const pixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+X8Y9WQAAAABJRU5ErkJggg==";
  const workbook = await buildRouteWorkbook(dataset.features, "Fixture routes", pixelPng);
  assert.equal(workbook.worksheets[0].name, "Route_Map");
  assert.equal(workbook.worksheets[0].getImages().length, 1);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    "Route_Map",
    "Executive_Summary",
    "Route_Summary",
    "Assignment_Matrix",
    "Hub_Summary",
    "Data_Quality",
  ]);
  const output = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(output);
  assert.equal(reloaded.worksheets[0].name, "Route_Map");
  assert.equal(reloaded.worksheets[0].getImages().length, 1);
});
