const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const ExcelJS = require("exceljs");

const { analyzeInputWorkbook, routeDistanceCeiling } = require("../node_modules/.cache/route-tests/web/lib/geojson.js");
const { routeFeaturesToHtml } = require("../node_modules/.cache/route-tests/web/lib/route-html-export.js");
const { buildRouteWorkbook } = require("../node_modules/.cache/route-tests/web/lib/route-workbook-export.js");
const { routeMapToPng } = require("../node_modules/.cache/route-tests/web/lib/route-map-export.js");

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

test("exports a standalone HTML map with route-distance details", () => {
  const { dataset } = analyzeInputWorkbook(branches, hubs);
  const html = routeFeaturesToHtml(dataset.features, "Fixture routes");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /class="route-line"/);
  assert.match(html, /Distance/);
  assert.match(html, /google\.com\/maps\/dir/);
  assert.match(html, /B01/);
  assert.match(html, /data-country="Thailand"/);
  assert.match(html, /<svg[\s>]/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="https?:/i);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
});

test("Excel map image draws a geographic Thailand outline behind the routes", () => {
  const calls = [];
  const context = new Proxy({}, {
    get(_target, name) {
      if (name === "createLinearGradient") return () => ({ addColorStop() {} });
      if (["beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillRect", "fillText", "arc"].includes(name)) {
        return (...args) => calls.push([name, ...args]);
      }
      return undefined;
    },
    set(_target, name, value) { calls.push([name, value]); return true; },
  });
  const previousDocument = global.document;
  global.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context, toDataURL: () => "data:image/png;base64,fixture" }) };
  try {
    const { dataset } = analyzeInputWorkbook(branches, hubs);
    assert.match(routeMapToPng(dataset.features), /^data:image\/png/);
    assert.ok(calls.some(([name, value]) => name === "fillStyle" && value === "#e6eee3"), "Thailand land fill is missing");
    assert.ok(calls.some(([name]) => name === "closePath"), "geographic outline is missing");
  } finally {
    global.document = previousDocument;
  }
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
