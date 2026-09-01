import type { RouteFeature, RouteFeatureCollection, RouteProperties } from "./types";

type WorkbookRow = Record<string, unknown>;

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
