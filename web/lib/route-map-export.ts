import type { RouteFeature } from "./types";

const PALETTE = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#ea580c", "#0f766e", "#4f46e5"];

/** Render an offline-safe route overview for embedding in an Excel workbook. */
export function routeMapToPng(features: RouteFeature[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ไม่สามารถสร้างภาพแผนที่สำหรับ Excel ได้");

  const coordinates = features.flatMap((feature) => feature.geometry.coordinates);
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);
  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);
  const padding = 130;
  const longitudeRange = Math.max(maximumLongitude - minimumLongitude, 1);
  const latitudeRange = Math.max(maximumLatitude - minimumLatitude, 1);
  const scale = Math.min((canvas.width - padding * 2) / longitudeRange, (canvas.height - padding * 2) / latitudeRange);
  const offsetX = (canvas.width - longitudeRange * scale) / 2 - minimumLongitude * scale;
  const offsetY = (canvas.height - latitudeRange * scale) / 2 + maximumLatitude * scale;
  const point = ([longitude, latitude]: [number, number]) => [offsetX + longitude * scale, offsetY - latitude * scale] as [number, number];

  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#eff6ff");
  background.addColorStop(1, "#dbeafe");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(37, 99, 235, .12)";
  context.lineWidth = 1;
  for (let grid = 0; grid < canvas.width; grid += 80) { context.beginPath(); context.moveTo(grid, 0); context.lineTo(grid, canvas.height); context.stroke(); }
  for (let grid = 0; grid < canvas.height; grid += 80) { context.beginPath(); context.moveTo(0, grid); context.lineTo(canvas.width, grid); context.stroke(); }

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
  for (const hub of hubs.values()) {
    context.beginPath(); context.arc(hub.point[0], hub.point[1], 15, 0, Math.PI * 2); context.fillStyle = "#ffffff"; context.fill(); context.strokeStyle = hub.color; context.lineWidth = 6; context.stroke();
    context.fillStyle = "#172554"; context.font = "600 18px Segoe UI, sans-serif"; context.fillText(hub.name, hub.point[0] + 22, hub.point[1] + 6);
  }

  context.fillStyle = "rgba(255,255,255,.9)";
  context.fillRect(64, canvas.height - 84, canvas.width - 128, 36);
  context.fillStyle = "#475569"; context.font = "16px Segoe UI, sans-serif";
  context.fillText("● Branch / Province reference", 84, canvas.height - 60);
  context.fillText("◎ Regional Hub", 360, canvas.height - 60);
  context.fillText("Line colour = Hub region · schematic distance overview", 570, canvas.height - 60);
  return canvas.toDataURL("image/png");
}
