import type { RouteFeature } from "./types";
import { countryOutlines, MAP_HEIGHT, MAP_WIDTH, projectCoordinate, provinceOutlines } from "./route-map-geometry";

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
  context.strokeStyle = "rgba(37, 78, 112, .10)";
  context.lineWidth = 1;
  for (const longitude of [96, 100, 104, 108]) {
    const [x] = point([longitude, 13.5]);
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
  }
  for (const latitude of [6, 10, 14, 18, 22]) {
    const [, y] = point([101, latitude]);
    context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
  }
  for (const country of countryOutlines) {
    if (country.name === "Thailand") continue;
    context.beginPath();
    for (const ring of country.rings) {
      ring.forEach((coordinate, index) => {
        const [x, y] = point(coordinate);
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
      });
      context.closePath();
    }
    context.fillStyle = "#f0f2ed";
    context.fill();
    context.strokeStyle = "#8da3b1";
    context.lineWidth = 1.5;
    context.stroke();
  }
  for (const province of provinceOutlines) {
    context.beginPath();
    for (const rings of province.polygons) {
      for (const ring of rings) {
        ring.forEach((coordinate, index) => {
          const [x, y] = point(coordinate);
          if (index) context.lineTo(x, y);
          else context.moveTo(x, y);
        });
        context.closePath();
      }
    }
    context.fillStyle = "#e6eee3";
    context.fill("evenodd");
    context.strokeStyle = "#a4b7b1";
    context.lineWidth = 0.9;
    context.stroke();
  }

  context.fillStyle = "rgba(255,255,255,.86)";
  context.fillRect(48, 20, 600, 116);

  context.fillStyle = "#172554";
  context.font = "600 38px Segoe UI, sans-serif";
  context.fillText("Thailand Provincial Network", 64, 72);
  context.fillStyle = "#475569";
  context.font = "22px Segoe UI, sans-serif";
  context.fillText(`77 provinces  ·  ${features.length.toLocaleString("th-TH")} routes`, 64, 108);

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

  const hubs = new Map<string, { point: [number, number]; name: string; color: string; count: number }>();
  for (const feature of features) {
    const start = point(feature.geometry.coordinates[0]);
    const end = point(feature.geometry.coordinates.at(-1)!);
    context.beginPath(); context.arc(start[0], start[1], 9, 0, Math.PI * 2); context.fillStyle = colorFor(feature.properties.Region); context.fill(); context.strokeStyle = "#ffffff"; context.lineWidth = 3; context.stroke();
    const existing = hubs.get(feature.properties.Hub_ID);
    if (existing) existing.count += 1;
    else hubs.set(feature.properties.Hub_ID, { point: end, name: feature.properties.Hub_Name, color: colorFor(feature.properties.Region), count: 1 });
  }
  const hubList = [...hubs.values()].sort((left, right) => left.name.localeCompare(right.name));
  hubList.forEach((hub, index) => {
    context.beginPath(); context.arc(hub.point[0], hub.point[1], 15, 0, Math.PI * 2); context.fillStyle = "#ffffff"; context.fill(); context.strokeStyle = hub.color; context.lineWidth = 6; context.stroke();
    context.fillStyle = hub.color; context.font = "700 14px Segoe UI, sans-serif";
    context.fillText(String(index + 1), hub.point[0] - 4, hub.point[1] + 5);
  });

  const panelX = 1200;
  const panelY = 150;
  context.fillStyle = "rgba(255,255,255,.91)";
  context.fillRect(panelX, panelY, 352, 66 + hubList.length * 39);
  context.fillStyle = "#2563eb"; context.font = "800 14px Segoe UI, sans-serif";
  context.fillText("REGIONAL HUBS", panelX + 24, panelY + 32);
  context.fillStyle = "#64748b"; context.font = "14px Segoe UI, sans-serif";
  context.fillText(`${hubList.length} hubs · ${features.length} assigned routes`, panelX + 24, panelY + 53);
  hubList.forEach((hub, index) => {
    const y = panelY + 82 + index * 39;
    context.beginPath(); context.arc(panelX + 31, y - 5, 10, 0, Math.PI * 2);
    context.fillStyle = "#ffffff"; context.fill(); context.strokeStyle = hub.color; context.lineWidth = 4; context.stroke();
    context.fillStyle = "#1e3a8a"; context.font = "600 15px Segoe UI, sans-serif";
    context.fillText(`${index + 1}. ${hub.name}`, panelX + 52, y);
  });

  context.fillStyle = "rgba(255,255,255,.9)";
  context.fillRect(64, canvas.height - 84, canvas.width - 128, 36);
  context.fillStyle = "#475569"; context.font = "16px Segoe UI, sans-serif";
  context.fillText("● Branch / Province reference", 84, canvas.height - 60);
  context.fillText("◎ Regional Hub", 360, canvas.height - 60);
  context.fillText("Provincial boundaries · line colour = Hub region", 570, canvas.height - 60);
  context.fillStyle = "#475569"; context.font = "13px Segoe UI, sans-serif";
  context.fillText("Provincial boundaries © OpenStreetMap contributors / geoBoundaries (ODbL)", 64, canvas.height - 18);
  return canvas.toDataURL("image/png");
}
