export type Position = [number, number];

export type RouteProperties = {
  Branch_ID: string;
  Branch_Name: string;
  Province: string;
  Location_Method: string;
  Hub_ID: string;
  Hub_Name: string;
  Region: string;
  Distance_km: number;
  Duration_min: number;
  Distance_Band: string;
  Routing_Source?: string;
  Coordinate_Source?: string;
  Geometry_Source?: string;
};

export type RouteFeature = {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: Position[];
  };
  properties: RouteProperties;
};

export type RouteFeatureCollection = {
  type: "FeatureCollection";
  name?: string;
  features: RouteFeature[];
};
