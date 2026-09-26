import southeastAsiaOutline from "../data/southeast_asia_outline.json";
import type { Position } from "./types";

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 900;

// A fixed geographic frame keeps the exports comparable across filters.
const CENTER_LONGITUDE = 101;
const CENTER_LATITUDE = 13.5;
const PIXELS_PER_DEGREE = 48;

type CountryGeometry = { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };

export const countryOutlines = southeastAsiaOutline.features.flatMap((feature) => {
  const geometry = feature.geometry as CountryGeometry;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as Position[][]]
    : geometry.coordinates as Position[][][];
  return polygons.map((rings) => ({ name: feature.properties.name, rings }));
});

export function projectCoordinate([longitude, latitude]: Position): [number, number] {
  return [
    MAP_WIDTH / 2 + (longitude - CENTER_LONGITUDE) * PIXELS_PER_DEGREE,
    MAP_HEIGHT / 2 - (latitude - CENTER_LATITUDE) * PIXELS_PER_DEGREE,
  ];
}

export function pathForCoordinates(coordinates: Position[]): string {
  return coordinates.map((coordinate, index) => {
    const [x, y] = projectCoordinate(coordinate);
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

export function pathForCountry(rings: Position[][]): string {
  return rings.map((ring) => `${pathForCoordinates(ring)} Z`).join(" ");
}
