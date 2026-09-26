import type { RouteFeature } from "./types";
import { countryOutlines, MAP_HEIGHT, MAP_WIDTH, projectCoordinate } from "./route-map-geometry";

const PALETTE = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#ea580c", "#0f766e", "#4f46e5"];

/** Render an offline-safe route overview for embedding in an Excel workbook. */
export function routeMapToPng(features: RouteFeature[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ไม่สามารถสร้างภาพแผนที่สำหรับ Excel ได้");

  const point = projectCoordinate;

  context.fillStyle = "#dceef4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const country of countryOutlines) {
    context.beginPath();
    for (const ring of country.rings) {
      ring.forEach((coordinate, index) => {
        const [x, y] = point(coordinate);
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
      });
      context.closePath();
    }
    context.fillStyle = country.name === "Thailand" ? "#e6eee3" : "#f0f2ed";
    context.fill();
    context.strokeStyle = "#8da3b1";
    context.lineWidth = 1.5;
    context.stroke();
  }

  context.fillStyle = "rgba(255,255,255,.86)";
  context.fillRect(48, 20, 520, 108);

  context.fillStyle = "#172554";
  context.font = "600 38px Segoe UI, sans-serif";
  context.fillText("Thailand Route Overview", 64, 72);
  context.fillStyle = "#475569";
  context.font = "22px Segoe UI, sans-serif";
  context.fillText(`${features.length.toLocaleString("th-TH")} routes · exported from Route Intelligence`, 64, 108);

  const regions = [...new Set(features.map((feature) => feature.properties.Region))];
  const colorFor = (region: string) => PALETTE[Math.max(regions.indexOf(region), 0) % PALETTE.length];
  for (const feature of features) {
    const positions = feature.geometry.coordinates.map(point);
    context.beginPath();
    positions.forEach(([x, y], index) => index === 0 ? context.moveTo(x, y) : context.lineTo(x, y));
    context.strokeStyle = colorFor(feature.properties.Region);
    context.globalAlpha = 0.62;
    context.lineWidth = 5;
    context.stroke();
    context.globalAlpha = 1;
  }

  const hubs = new Map<string, { point: [number, number]; name: string; color: string }>();
  for (const feature of features) {
    const start = point(feature.geometry.coordinates[0]);
    const end = point(feature.geometry.coordinates.at(-1)!);
    context.beginPath(); context.arc(start[0], start[1], 9, 0, Math.PI * 2); context.fillStyle = colorFor(feature.properties.Region); context.fill(); context.strokeStyle = "#ffffff"; context.lineWidth = 3; context.stroke();
    hubs.set(feature.properties.Hub_ID, { point: end, name: feature.properties.Hub_Name, color: colorFor(feature.properties.Region) });
  }
  const labelPositions: Array<[number, number]> = [];
  for (const hub of hubs.values()) {
    context.beginPath(); context.arc(hub.point[0], hub.point[1], 15, 0, Math.PI * 2); context.fillStyle = "#ffffff"; context.fill(); context.strokeStyle = hub.color; context.lineWidth = 6; context.stroke();
    const labelX = hub.point[0] + 22;
    let labelY = hub.point[1] + 6;
    while (labelPositions.some(([x, y]) => Math.abs(x - labelX) < 300 && Math.abs(y - labelY) < 24)) labelY += 26;
    labelPositions.push([labelX, labelY]);
    context.fillStyle = "#172554"; context.font = "600 18px Segoe UI, sans-serif"; context.fillText(hub.name, labelX, labelY);
  }

  context.fillStyle = "rgba(255,255,255,.9)";
  context.fillRect(64, canvas.height - 84, canvas.width - 128, 36);
  context.fillStyle = "#475569"; context.font = "16px Segoe UI, sans-serif";
  context.fillText("● Branch / Province reference", 84, canvas.height - 60);
  context.fillText("◎ Regional Hub", 360, canvas.height - 60);
  context.fillText("Line colour = Hub region · schematic distance overview", 570, canvas.height - 60);
  return canvas.toDataURL("image/png");
}
