import type { RouteFeatureCollection } from "./types";

export const sampleRoutes: RouteFeatureCollection = {
  type: "FeatureCollection",
  name: "Thailand Branch Routes — Offline Demo",
  features: [
    route("B001", "Station Rayong 01", "ระยอง", "Exact Coordinate", "H04", "Rayong Regional Hub", "East", [101.281, 12.681], [101.275, 12.6825], 0.82, 0.89, "0-50 km"),
    route("B002", "Station Chiang Mai 01", "เชียงใหม่", "Province Reference Point", "H02", "Chiang Mai Regional Hub", "North", [98.9853, 18.7883], [98.9853, 18.7883], 0, 0, "0-50 km"),
    route("B003", "Station Khon Kaen 01", "ขอนแก่น", "Exact Coordinate", "H03", "Khon Kaen Regional Hub", "Northeast", [102.835, 16.441], [102.835, 16.4419], 0.12, 0.13, "0-50 km"),
    route("B004", "Station Phuket 01", "ภูเก็ต", "Province Reference Point", "H06", "Surat Thani Regional Hub", "South Upper", [98.3923, 7.8804], [99.3217, 9.1382], 211.33, 230.55, "> 200-300 km"),
    route("B005", "Station Chonburi 01", "ชลบุรี", "Exact Coordinate", "H01", "Bangkok Regional Hub", "Central", [100.985, 13.361], [100.5018, 13.7563], 83.28, 90.86, "> 50-100 km"),
    route("B006", "Station Songkhla 01", "Songkhla", "Province Reference Point", "H07", "Songkhla Regional Hub", "South Lower", [100.5954, 7.1898], [100.5954, 7.1898], 0, 0, "0-50 km"),
    route("B007", "Station Bangkok 01", "Bangkok", "Exact Coordinate", "H01", "Bangkok Regional Hub", "Central", [100.5018, 13.7563], [100.5018, 13.7563], 0, 0, "0-50 km"),
    route("B008", "Station Nakhon Sawan 01", "นครสวรรค์", "Province Reference Point", "H05", "Kanchanaburi Regional Hub", "West", [100.1372, 15.703], [99.5328, 14.0228], 241.32, 263.25, "> 200-300 km"),
    route("B009", "Station Surat Thani 01", "สุราษฎร์ธานี", "Exact Coordinate", "H06", "Surat Thani Regional Hub", "South Upper", [99.322, 9.138], [99.3217, 9.1382], 0.05, 0.05, "0-50 km"),
    route("B010", "Station Udon Thani 01", "อุดรธานี", "Province Reference Point", "H03", "Khon Kaen Regional Hub", "Northeast", [102.7875, 17.4138], [102.835, 16.4419], 131.99, 143.99, "> 100-150 km"),
  ],
};

function route(
  branchId: string,
  branchName: string,
  province: string,
  method: string,
  hubId: string,
  hubName: string,
  region: string,
  branch: [number, number],
  hub: [number, number],
  distance: number,
  duration: number,
  band: string,
) {
  return {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: [branch, hub] },
    properties: {
      Branch_ID: branchId,
      Branch_Name: branchName,
      Province: province,
      Location_Method: method,
      Hub_ID: hubId,
      Hub_Name: hubName,
      Region: region,
      Distance_km: distance,
      Duration_min: duration,
      Distance_Band: band,
      Routing_Source: "Offline Demo",
      Coordinate_Source: method,
    },
  };
}
