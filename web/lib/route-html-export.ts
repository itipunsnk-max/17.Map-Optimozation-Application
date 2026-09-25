import type { RouteFeature } from "./types";
import southeastAsiaOutline from "../../data/southeast_asia_outline.json";

const htmlDocumentTitle = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character] ?? character);

const scriptSafeJson = (value: unknown) => JSON.stringify(value)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

/** Build a portable interactive Leaflet map with route distances embedded in the file. */
export function routeFeaturesToHtml(features: RouteFeature[], title = "Thailand Route Intelligence"): string {
  if (!features.length) throw new Error("ไม่มีเส้นทางสำหรับส่งออก HTML");
  const featureData = scriptSafeJson(features);
  const outlineData = scriptSafeJson(southeastAsiaOutline);
  const safeTitle = htmlDocumentTitle(title);

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <style>
    html, body, #map { height: 100%; margin: 0; }
    #map { background: #dceef4; }
    body { font-family: "Segoe UI", Tahoma, sans-serif; color: #172554; }
    .summary { position: fixed; z-index: 1000; top: 16px; left: 52px; max-width: 340px; padding: 12px 16px; border: 1px solid #bfdbfe; border-radius: 12px; background: rgba(255,255,255,.94); box-shadow: 0 8px 24px rgba(15,23,42,.16); }
    .summary b, .summary span { display: block; }
    .summary span { margin-top: 3px; color: #64748b; font-size: 12px; }
    .route-popup { min-width: 230px; line-height: 1.45; }
    .route-popup b { color: #1e3a8a; }
    .route-popup dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 8px 0; }
    .route-popup dt { color: #64748b; }
    .route-popup dd { margin: 0; font-weight: 600; text-align: right; }
    .route-popup a { color: #0f766e; font-weight: 700; }
  </style>
</head>
<body>
  <div class="summary"><b>${safeTitle}</b><span>${features.length.toLocaleString("th-TH")} เส้นทาง · คลิกเส้นเพื่อดูระยะทางและเปิด Google Maps</span></div>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <script>
    const features = ${featureData};
    const colors = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#ea580c", "#0f766e", "#4f46e5"];
    const regions = [...new Set(features.map((feature) => feature.properties.Region))];
    const colorFor = (region) => colors[Math.max(regions.indexOf(region), 0) % colors.length];
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
    const map = L.map("map", { preferCanvas: true });
    L.geoJSON(${outlineData}, {
      style: (feature) => ({ color: "#8da3b1", weight: 1, fillColor: feature?.properties?.name === "Thailand" ? "#e6eee3" : "#f0f2ed", fillOpacity: 1 }),
      interactive: false,
    }).addTo(map);
    const bounds = [];
    const hubs = new Map();

    for (const feature of features) {
      const p = feature.properties;
      const positions = feature.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]);
      if (!positions.length) continue;
      bounds.push(...positions);
      const distance = Number.isFinite(p.Distance_km) ? p.Distance_km.toLocaleString("th-TH", { maximumFractionDigits: 1 }) + " km" : "N/A";
      const duration = Number.isFinite(p.Duration_min) ? p.Duration_min.toLocaleString("th-TH", { maximumFractionDigits: 0 }) + " min" : "N/A";
      const [branchLatitude, branchLongitude] = positions[0];
      const [hubLatitude, hubLongitude] = positions[positions.length - 1];
      const directionsUrl = "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(branchLatitude + "," + branchLongitude) + "&destination=" + encodeURIComponent(hubLatitude + "," + hubLongitude) + "&travelmode=driving";
      const popup = '<div class="route-popup"><b>' + escapeHtml(p.Branch_ID) + ' · ' + escapeHtml(p.Branch_Name) + '</b><dl>'
        + '<dt>Province</dt><dd>' + escapeHtml(p.Province) + '</dd>'
        + '<dt>Assigned Hub</dt><dd>' + escapeHtml(p.Hub_Name) + '</dd>'
        + '<dt>Distance</dt><dd>' + escapeHtml(distance) + '</dd>'
        + '<dt>Duration</dt><dd>' + escapeHtml(duration) + '</dd>'
        + '<dt>Source</dt><dd>' + escapeHtml(p.Routing_Source || "Workbook import") + '</dd></dl>'
        + '<a href="' + directionsUrl + '" target="_blank" rel="noopener noreferrer">เปิดเส้นทางใน Google Maps ↗</a></div>';
      const line = L.polyline(positions, { color: colorFor(p.Region), weight: 4, opacity: .78 }).addTo(map);
      line.bindTooltip(distance, { sticky: true });
      line.bindPopup(popup);
      L.circleMarker(positions[0], { radius: 6, color: "#fff", weight: 2, fillColor: colorFor(p.Region), fillOpacity: 1 }).addTo(map).bindPopup(popup);
      hubs.set(p.Hub_ID, { position: positions[positions.length - 1], name: p.Hub_Name });
    }
    for (const [hubId, hub] of hubs) {
      L.circleMarker(hub.position, { radius: 10, color: "#062d2c", weight: 4, fillColor: "#ecfdf5", fillOpacity: 1 })
        .addTo(map).bindPopup("<b>" + escapeHtml(hub.name) + "</b><br>" + escapeHtml(hubId));
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 10 });
    else map.setView([13.2, 101], 5);
  </script>
</body>
</html>`;
}
