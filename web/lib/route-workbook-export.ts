import type ExcelJS from "exceljs";

import type { RouteFeature } from "./types";

type ExportRow = Record<string, string | number>;

export async function buildRouteWorkbook(
  features: RouteFeature[],
  datasetNotice: string,
  routeMapPng: string,
): Promise<ExcelJS.Workbook> {
  const ExcelModule = await import("exceljs");
  const workbook = new ExcelModule.Workbook();
  workbook.creator = "Route Intelligence";
  workbook.created = new Date();

  const routes = features.map(({ properties: p }) => ({
    Branch_ID: p.Branch_ID,
    Branch_Name: p.Branch_Name,
    Province: p.Province,
    Assigned_Hub_ID: p.Hub_ID,
    Assigned_Hub_Name: p.Hub_Name,
    Hub_Region: p.Region,
    Location_Method: p.Location_Method,
    Distance_km: Number.isFinite(p.Distance_km) ? Number(p.Distance_km.toFixed(2)) : "",
    Duration_min: Number.isFinite(p.Duration_min) ? Number(p.Duration_min.toFixed(1)) : "",
    Distance_Band: p.Distance_Band,
    Routing_Source: p.Routing_Source ?? "",
    Coordinate_Source: p.Coordinate_Source ?? "",
    Geometry_Source: p.Geometry_Source ?? "",
  }));
  const hubNames = [...new Set(routes.map((route) => route.Assigned_Hub_Name))];
  const assignmentMatrix = routes.map((route) => ({
    Branch_ID: route.Branch_ID,
    Branch_Name: route.Branch_Name,
    Province: route.Province,
    ...Object.fromEntries(hubNames.map((hubName) => [hubName, route.Assigned_Hub_Name === hubName ? route.Distance_km : ""])),
  }));
  const hubSummary = hubNames.map((hubName) => {
    const assigned = routes.filter((route) => route.Assigned_Hub_Name === hubName);
    const distances = assigned.map((route) => Number(route.Distance_km)).filter(Number.isFinite);
    return {
      Hub_Name: hubName,
      Hub_ID: assigned[0]?.Assigned_Hub_ID ?? "",
      Region: assigned[0]?.Hub_Region ?? "",
      Assigned_Branches: assigned.length,
      Covered_Provinces: new Set(assigned.map((route) => route.Province)).size,
      Average_Distance_km: distances.length ? Number((distances.reduce((total, value) => total + value, 0) / distances.length).toFixed(2)) : "",
      Longest_Distance_km: distances.length ? Number(Math.max(...distances).toFixed(2)) : "",
    };
  });
  const exactCount = features.filter((feature) => !feature.properties.Location_Method.toLowerCase().includes("province")).length;
  const distances = features.map((feature) => feature.properties.Distance_km).filter(Number.isFinite);
  const averageDistance = distances.length ? distances.reduce((total, value) => total + value, 0) / distances.length : 0;
  const longestDistance = distances.length ? Math.max(...distances) : 0;
  const dataQuality = [
    { Metric: "Displayed routes", Value: features.length, Note: "Current filters applied" },
    { Metric: "Input dataset", Value: features.length, Note: datasetNotice },
    { Metric: "Exact coordinates", Value: exactCount, Note: "Coordinates supplied in source" },
    { Metric: "Province reference", Value: features.length - exactCount, Note: "Static province reference point" },
    { Metric: "Distance interpretation", Value: "See Routing_Source", Note: "Input preview uses a straight-line nearest-hub estimate" },
  ];

  const addSheet = (name: string, rows: ExportRow[]) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    const keys = Object.keys(rows[0] ?? {});
    sheet.columns = keys.map((key) => ({ header: key, key, width: Math.min(Math.max(key.length + 4, 16), 34) }));
    sheet.addRows(rows);
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    header.alignment = { vertical: "middle" };
    if (keys.length) sheet.autoFilter = { from: "A1", to: { row: 1, column: keys.length } };
    return sheet;
  };

  // Deliberately create Route_Map first so Excel opens on the visual overview.
  const routeMap = workbook.addWorksheet("Route_Map", { views: [{ showGridLines: false }] });
  routeMap.getCell("B2").value = "Thailand Route Overview";
  routeMap.getCell("B2").font = { name: "Segoe UI", size: 20, bold: true, color: { argb: "FF1E3A8A" } };
  routeMap.getCell("B3").value = "Schematic route map from the current filters. Lines show selected routes; use Route_Summary for audit details.";
  routeMap.getCell("B3").font = { name: "Segoe UI", size: 10, color: { argb: "FF475569" } };
  routeMap.addImage(workbook.addImage({ base64: routeMapPng, extension: "png" }), {
    tl: { col: 1, row: 4 },
    ext: { width: 1200, height: 675 },
  });
  routeMap.getColumn(2).width = 18;

  addSheet("Executive_Summary", [
    { Metric: "Routes displayed", Value: features.length },
    { Metric: "Provinces covered", Value: new Set(features.map((feature) => feature.properties.Province)).size },
    { Metric: "Assigned hubs", Value: new Set(features.map((feature) => feature.properties.Hub_ID)).size },
    { Metric: "Average distance (km)", Value: Number(averageDistance.toFixed(2)) },
    { Metric: "Longest distance (km)", Value: Number(longestDistance.toFixed(2)) },
    { Metric: "Exported at", Value: new Date().toLocaleString("th-TH") },
  ]);
  addSheet("Route_Summary", routes);
  addSheet("Assignment_Matrix", assignmentMatrix);
  addSheet("Hub_Summary", hubSummary);
  addSheet("Data_Quality", dataQuality);
  return workbook;
}
