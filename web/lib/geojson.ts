import type { RouteFeature, RouteFeatureCollection, RouteProperties } from "./types";

type WorkbookRow = Record<string, unknown>;

const inputProvinceCoordinates: Record<string, [number, number]> = {
  "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e\u0e21\u0e2b\u0e32\u0e19\u0e04\u0e23": [13.7563, 100.5018],
  "\u0e40\u0e0a\u0e35\u0e22\u0e07\u0e43\u0e2b\u0e21\u0e48": [18.7883, 98.9853],
  "\u0e20\u0e39\u0e40\u0e01\u0e47\u0e15": [7.8804, 98.3923],
  "\u0e2a\u0e07\u0e02\u0e25\u0e32": [7.1898, 100.5954],
  "\u0e19\u0e04\u0e23\u0e2a\u0e27\u0e23\u0e23\u0e04\u0e4c": [15.703, 100.1372],
  "\u0e2d\u0e38\u0e14\u0e23\u0e18\u0e32\u0e19\u0e35": [17.62, 102.7875],
};

const provinceAliases: Record<string, string> = {
  "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e": "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e\u0e21\u0e2b\u0e32\u0e19\u0e04\u0e23",
  "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e\u0e2f": "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e\u0e21\u0e2b\u0e32\u0e19\u0e04\u0e23",
  bangkok: "\u0e01\u0e23\u0e38\u0e07\u0e40\u0e17\u0e1e\u0e21\u0e2b\u0e32\u0e19\u0e04\u0e23",
  songkhla: "\u0e2a\u0e07\u0e02\u0e25\u0e32",
};

const numberFrom = (row: WorkbookRow, keys: string[]) => {
  for (const key of keys) {
    const value = Number(row[key]);
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

const normalizeProvince = (value: unknown) => {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/^จังหวัด\s*/, "").replace(/[\s_\-–—./()]+/g, "");
  return provinceAliases[normalized] ?? normalized;
};

const coordinateFrom = (row: WorkbookRow, province: string): [number, number] | undefined => {
  const latitude = numberFrom(row, ["Latitude"]);
  const longitude = numberFrom(row, ["Longitude"]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : inputProvinceCoordinates[normalizeProvince(province)];
};

const haversineKm = ([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) => {
  const radians = (value: number) => value * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Create a display-only preview from the documented Branches and Regional_Hubs input sheets. */
export function inputWorkbookToGeoJson(branches: WorkbookRow[], hubs: WorkbookRow[]): RouteFeatureCollection {
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
  return { type: "FeatureCollection", name: "Input workbook preview", features };
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
