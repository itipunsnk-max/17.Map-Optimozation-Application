import type { RouteFeature, RouteFeatureCollection, RouteProperties } from "./types";
import { provinceReference } from "./province-reference";

type WorkbookRow = Record<string, unknown>;

export type InputWorkbookReport = {
  totalBranches: number;
  importedBranches: number;
  skippedBranches: number;
  totalHubs: number;
  resolvedHubs: number;
  skippedHubs: number;
};

const provinceAliases: Record<string, string> = {
  "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e": "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e\u0e21\u0e2b\u0e32\u0e19\u0e04\u0e23",
  "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e\u0e2f": "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e\u0e21\u0e2b\u0e32\u0e19\u0e04\u0e23",
  "\u0e2d\u0e22\u0e38\u0e18\u0e22\u0e32": "\u0e1e\u0e23\u0e30\u0e19\u0e04\u0e23\u0e28\u0e23\u0e35\u0e2d\u0e22\u0e38\u0e18\u0e22\u0e32",
};

const normalizeProvince = (value: unknown) => String(value ?? "").trim().toLowerCase()
  .replace(/^\u0e08\u0e31\u0e07\u0e2b\u0e27\u0e31\u0e14\s*/, "")
  .replace(/\s*province\s*$/, "")
  .replace(/[\s_\-–—./()]+/g, "");

const provinceCoordinates = new Map<string, [number, number]>(provinceReference.flatMap((province): [string, [number, number]][] => [
  [normalizeProvince(province.thai), [province.latitude, province.longitude] as [number, number]],
  [normalizeProvince(province.english), [province.latitude, province.longitude] as [number, number]],
]));

const numberFrom = (row: WorkbookRow, keys: string[]) => {
  for (const key of keys) {
    const raw = row[key];
    if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return Number.NaN;
};

const stringFrom = (row: WorkbookRow, keys: string[], fallback = "ไม่ระบุ") => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
};

const coordinateFrom = (row: WorkbookRow, province: string): [number, number] | undefined => {
  const latitude = numberFrom(row, ["Latitude"]);
  const longitude = numberFrom(row, ["Longitude"]);
  const normalized = normalizeProvince(province);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : provinceCoordinates.get(provinceAliases[normalized] ?? normalized);
};

const haversineKm = ([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) => {
  const radians = (value: number) => value * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export function routeDistanceCeiling(features: RouteFeature[], minimum = 100, step = 50): number {
  const longest = Math.max(0, ...features.map((feature) => feature.properties.Distance_km).filter(Number.isFinite));
  return Math.max(minimum, Math.ceil(longest / step) * step);
}

/** Create a display-only preview and an import-quality report from the documented input sheets. */
export function analyzeInputWorkbook(branches: WorkbookRow[], hubs: WorkbookRow[]): {
  dataset: RouteFeatureCollection;
  report: InputWorkbookReport;
} {
  const resolvedHubs = hubs.flatMap((hub) => {
    const province = stringFrom(hub, ["Province"], "");
    const coordinate = coordinateFrom(hub, province);
    return coordinate ? [{ row: hub, province, coordinate }] : [];
  });
  if (!resolvedHubs.length) throw new Error("ไม่พบพิกัดของ Regional_Hubs");
  const features = branches.flatMap<RouteFeature>((branch) => {
    const province = stringFrom(branch, ["Province"], "");
    const coordinate = coordinateFrom(branch, province);
    if (!coordinate) return [];
    const assigned = resolvedHubs.reduce((nearest, candidate) =>
      haversineKm(coordinate, candidate.coordinate) < haversineKm(coordinate, nearest.coordinate) ? candidate : nearest,
    );
    const distance = haversineKm(coordinate, assigned.coordinate);
    return [{ type: "Feature", geometry: { type: "LineString", coordinates: [[coordinate[1], coordinate[0]], [assigned.coordinate[1], assigned.coordinate[0]]] }, properties: {
      Branch_ID: stringFrom(branch, ["Branch_ID"]), Branch_Name: stringFrom(branch, ["Branch_Name"]), Province: province,
      Location_Method: Number.isFinite(numberFrom(branch, ["Latitude"])) ? "Input coordinate" : "Province reference point",
      Hub_ID: stringFrom(assigned.row, ["Hub_ID"]), Hub_Name: stringFrom(assigned.row, ["Hub_Name"]), Region: stringFrom(assigned.row, ["Region"]),
      Distance_km: distance, Duration_min: Number.NaN, Distance_Band: "Input preview", Routing_Source: "Input preview (straight-line nearest hub)",
      Coordinate_Source: "Input workbook / province reference", Geometry_Source: "Straight preview line; not audited route calculation",
    }}];
  });
  return {
    dataset: { type: "FeatureCollection", name: "Input workbook preview", features },
    report: {
      totalBranches: branches.length,
      importedBranches: features.length,
      skippedBranches: branches.length - features.length,
      totalHubs: hubs.length,
      resolvedHubs: resolvedHubs.length,
      skippedHubs: hubs.length - resolvedHubs.length,
    },
  };
}

/** Backward-compatible dataset-only helper. */
export function inputWorkbookToGeoJson(branches: WorkbookRow[], hubs: WorkbookRow[]): RouteFeatureCollection {
  return analyzeInputWorkbook(branches, hubs).dataset;
}

export function workbookRowsToGeoJson(rows: WorkbookRow[]): RouteFeatureCollection {
  const features = rows.flatMap<RouteFeature>((row) => {
    const branchLat = numberFrom(row, ["Resolved_Latitude", "Resolved_Lat", "Branch_Latitude", "Latitude"]);
    const branchLon = numberFrom(row, ["Resolved_Longitude", "Resolved_Lon", "Branch_Longitude", "Longitude"]);
    const hubLat = numberFrom(row, ["Hub_Latitude", "Hub_Lat"]);
    const hubLon = numberFrom(row, ["Hub_Longitude", "Hub_Lon"]);
    if (![branchLat, branchLon, hubLat, hubLon].every(Number.isFinite)) return [];

    const properties: RouteProperties = {
      Branch_ID: stringFrom(row, ["Branch_ID"]),
      Branch_Name: stringFrom(row, ["Branch_Name"]),
      Province: stringFrom(row, ["Province", "Province_Name"]),
      Location_Method: stringFrom(row, ["Location_Method"]),
      Hub_ID: stringFrom(row, ["Assigned_Hub_ID", "Hub_ID"]),
      Hub_Name: stringFrom(row, ["Assigned_Hub_Name", "Hub_Name"]),
      Region: stringFrom(row, ["Assigned_Region", "Region"]),
      Distance_km: numberFrom(row, ["Road_Distance_km", "Distance_km"]),
      Duration_min: numberFrom(row, ["Travel_Time_min", "Road_Duration_min", "Duration_min"]),
      Distance_Band: stringFrom(row, ["Distance_Band"]),
      Routing_Source: stringFrom(row, ["Routing_Source"], "Workbook import"),
      Coordinate_Source: stringFrom(row, ["Coordinate_Source"], "Workbook coordinates"),
      Geometry_Source: "Straight display line from workbook coordinates",
    };

    return [{
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[branchLon, branchLat], [hubLon, hubLat]] },
      properties,
    }];
  });

  return { type: "FeatureCollection", name: "Imported Route Results", features };
}

export function normalizeGeoJson(input: unknown): RouteFeatureCollection {
  if (!input || typeof input !== "object") throw new Error("ไฟล์ไม่ใช่ GeoJSON ที่ถูกต้อง");
  const candidate = input as Partial<RouteFeatureCollection>;
  if (candidate.type !== "FeatureCollection" || !Array.isArray(candidate.features)) {
    throw new Error("ต้องเป็น GeoJSON ชนิด FeatureCollection");
  }

  const features = candidate.features.filter((feature) =>
    feature?.type === "Feature" &&
    feature.geometry?.type === "LineString" &&
    Array.isArray(feature.geometry.coordinates) &&
    feature.geometry.coordinates.length >= 2,
  );
  if (!features.length) throw new Error("ไม่พบเส้นทาง LineString ในไฟล์");
  return { type: "FeatureCollection", name: candidate.name ?? "Imported routes", features };
}
