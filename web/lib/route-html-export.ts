import type { RouteFeature } from "./types";
import { countryOutlines, MAP_HEIGHT, MAP_WIDTH, pathForCoordinates, pathForCountry, projectCoordinate } from "./route-map-geometry";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] ?? character);

const scriptSafeJson = (value: unknown) => JSON.stringify(value)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");

const PALETTE = ["#2563eb", "#7c3aed", "#0891b2", "#db2777", "#ea580c", "#0f766e", "#4f46e5"];

/** Export a standalone map that remains visible when opened as a local file. */
export function routeFeaturesToHtml(features: RouteFeature[], title = "Thailand Route Intelligence"): string {
  if (!features.length) throw new Error("ไม่มีเส้นทางสำหรับส่งออก HTML");
  const regions = [...new Set(features.map((feature) => feature.properties.Region))];
  const colorFor = (region: string) => PALETTE[Math.max(regions.indexOf(region), 0) % PALETTE.length];
  const countries = countryOutlines.map((country) =>
    `<path class="country" data-country="${escapeHtml(country.name)}" d="${pathForCountry(country.rings)}" fill="${country.name === "Thailand" ? "#e6eee3" : "#f0f2ed"}" />`,
  ).join("\n    ");
  const routes = features.map((feature, index) => {
    const coordinates = feature.geometry.coordinates;
    if (!coordinates.length) return "";
    const color = colorFor(feature.properties.Region);
    const [x, y] = projectCoordinate(coordinates[0]);
    const distance = Number.isFinite(feature.properties.Distance_km)
      ? `${feature.properties.Distance_km.toLocaleString("th-TH", { maximumFractionDigits: 1 })} km`
      : "N/A";
    return `<g class="route-item" data-route="${index}">
      <path class="route-line" d="${pathForCoordinates(coordinates)}" stroke="${color}" />
      <circle class="branch" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${color}" />
      <title>${escapeHtml(feature.properties.Branch_Name)} → ${escapeHtml(feature.properties.Hub_Name)} · ${distance}</title>
    </g>`;
  }).join("\n    ");
  const hubs = new Map<string, { point: [number, number]; name: string }>();
  for (const feature of features) {
    const endpoint = feature.geometry.coordinates.at(-1);
    if (endpoint) hubs.set(feature.properties.Hub_ID, { point: projectCoordinate(endpoint), name: feature.properties.Hub_Name });
  }
  const hubMarkers = [...hubs.values()].map(({ point: [x, y], name }) =>
    `<g class="hub-marker"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" /><title>${escapeHtml(name)}</title></g>`,
  ).join("\n    ");

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; }
    body { overflow: hidden; font-family: "Segoe UI", Tahoma, sans-serif; color: #172554; background: #dceef4; }
    svg { display: block; width: 100%; height: 100%; touch-action: none; }
    .country { stroke: #8da3b1; stroke-width: 1.5; }
    .route-item { cursor: pointer; }
    .route-line { fill: none; stroke-width: 5; stroke-opacity: .85; pointer-events: stroke; }
    .route-item:hover .route-line { stroke-width: 9; }
    .branch { stroke: #fff; stroke-width: 2.5; }
    .hub-marker circle { fill: #ecfdf5; stroke: #062d2c; stroke-width: 4; }
    .summary, .details, .controls { position: fixed; z-index: 2; background: rgba(255,255,255,.96); border: 1px solid #bfdbfe; border-radius: 12px; box-shadow: 0 8px 24px rgba(15,23,42,.16); }
    .summary { top: 16px; left: 16px; max-width: 340px; padding: 12px 16px; }
    .summary b, .summary span { display: block; }
    .summary span { margin-top: 3px; color: #64748b; font-size: 12px; }
    .controls { top: 16px; right: 16px; display: flex; gap: 4px; padding: 5px; }
    .controls button { width: 36px; height: 36px; border: 0; border-radius: 8px; background: #eff6ff; color: #172554; cursor: pointer; font-size: 20px; }
    .details { left: 16px; bottom: 16px; width: min(360px, calc(100vw - 64px)); padding: 15px; }
    .details[hidden] { display: none; }
    .details h2 { margin: 0 0 8px; font-size: 16px; }
    .details dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0 0 12px; font-size: 13px; }
    .details dt { color: #64748b; }
    .details dd { margin: 0; text-align: right; font-weight: 600; }
    .details a { color: #0f766e; font-weight: 700; }
    .close { float: right; border: 0; background: none; font-size: 20px; cursor: pointer; }
    .source { position: fixed; right: 12px; bottom: 8px; color: #475569; font-size: 11px; }
  </style>
</head>
<body>
  <div class="summary"><b>${escapeHtml(title)}</b><span>${features.length.toLocaleString("th-TH")} เส้นทาง · คลิกเส้นหรือจุดสาขาเพื่อดูระยะทาง</span></div>
  <div class="controls"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="reset" aria-label="Reset view">⌂</button></div>
  <svg id="map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="แผนที่ประเทศไทยและเส้นทางสาขา">
    <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="#dceef4" />
    ${countries}
    ${routes}
    ${hubMarkers}
  </svg>
  <section class="details" id="details" hidden><button class="close" id="close" aria-label="Close">×</button><h2 id="route-title"></h2><dl id="route-fields"></dl><a id="directions" target="_blank" rel="noopener noreferrer">เปิดเส้นทางใน Google Maps ↗</a></section>
  <span class="source">Country outlines: Natural Earth · Route geometry: current dataset</span>
  <script>
    const features = ${scriptSafeJson(features)};
    const svg = document.getElementById("map");
    const details = document.getElementById("details");
    let view = [0, 0, ${MAP_WIDTH}, ${MAP_HEIGHT}];
    const updateView = () => svg.setAttribute("viewBox", view.join(" "));
    const zoom = (factor) => {
      const width = Math.max(180, Math.min(${MAP_WIDTH}, view[2] * factor));
      const height = width * ${MAP_HEIGHT} / ${MAP_WIDTH};
      view = [view[0] + (view[2] - width) / 2, view[1] + (view[3] - height) / 2, width, height];
      updateView();
    };
    document.getElementById("zoom-in").onclick = () => zoom(.7);
    document.getElementById("zoom-out").onclick = () => zoom(1.4);
    document.getElementById("reset").onclick = () => { view = [0, 0, ${MAP_WIDTH}, ${MAP_HEIGHT}]; updateView(); };
    document.getElementById("close").onclick = () => { details.hidden = true; };
    svg.addEventListener("click", (event) => {
      const item = event.target.closest("[data-route]");
      if (!item) return;
      const feature = features[Number(item.dataset.route)];
      const p = feature.properties;
      document.getElementById("route-title").textContent = p.Branch_ID + " · " + p.Branch_Name;
      const fields = document.getElementById("route-fields");
      fields.replaceChildren();
      for (const [label, value] of [
        ["Province", p.Province], ["Assigned Hub", p.Hub_Name],
        ["Distance", Number.isFinite(p.Distance_km) ? p.Distance_km.toLocaleString("th-TH", { maximumFractionDigits: 1 }) + " km" : "N/A"],
        ["Duration", Number.isFinite(p.Duration_min) ? p.Duration_min.toLocaleString("th-TH", { maximumFractionDigits: 0 }) + " min" : "N/A"],
        ["Source", p.Routing_Source || "Workbook import"],
      ]) {
        const term = document.createElement("dt"); term.textContent = label;
        const description = document.createElement("dd"); description.textContent = String(value ?? "");
        fields.append(term, description);
      }
      const start = feature.geometry.coordinates[0];
      const end = feature.geometry.coordinates.at(-1);
      document.getElementById("directions").href = "https://www.google.com/maps/dir/?api=1&origin="
        + encodeURIComponent(start[1] + "," + start[0]) + "&destination="
        + encodeURIComponent(end[1] + "," + end[0]) + "&travelmode=driving";
      details.hidden = false;
    });
  </script>
</body>
</html>`;
}
