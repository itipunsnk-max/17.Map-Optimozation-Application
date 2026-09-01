"use client";

import { Fragment, useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { RouteFeature } from "@/lib/types";

const REGION_COLORS: Record<string, string> = {
  Central: "#0b6e69",
  East: "#f97316",
  North: "#7c3aed",
  Northeast: "#d9485f",
  West: "#2563eb",
  "South Upper": "#0f9f87",
  "South Lower": "#ca8a04",
};

function colorFor(region: string) {
  return REGION_COLORS[region] ?? "#64748b";
}

function FitToRoutes({ features }: { features: RouteFeature[] }) {
  const map = useMap();
  useEffect(() => {
    const points = features.flatMap((feature) =>
      feature.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
    );
    if (points.length) map.fitBounds(points as LatLngBoundsExpression, { padding: [28, 28], maxZoom: 10 });
  }, [features, map]);
  return null;
}

function DetailPopup({ feature, title }: { feature: RouteFeature; title: string }) {
  const p = feature.properties;
  return (
    <div className="map-popup">
      <strong>{title}</strong>
      <span>{p.Province} · {p.Region}</span>
      <dl>
        <div><dt>Assigned hub</dt><dd>{p.Hub_Name}</dd></div>
        <div><dt>Distance</dt><dd>{p.Distance_km.toLocaleString("th-TH", { maximumFractionDigits: 1 })} km</dd></div>
        <div><dt>Duration</dt><dd>{p.Duration_min.toLocaleString("th-TH", { maximumFractionDigits: 0 })} min</dd></div>
        <div><dt>Location</dt><dd>{p.Location_Method}</dd></div>
      </dl>
    </div>
  );
}

export default function RouteMap({ features }: { features: RouteFeature[] }) {
  const hubs = new Map<string, { feature: RouteFeature; point: [number, number] }>();
  for (const feature of features) {
    const end = feature.geometry.coordinates.at(-1);
    if (end) hubs.set(feature.properties.Hub_ID, { feature, point: [end[1], end[0]] });
  }

  return (
    <MapContainer center={[13.2, 101]} zoom={5} className="route-map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToRoutes features={features} />
      {features.map((feature) => {
        const p = feature.properties;
        const color = colorFor(p.Region);
        const positions = feature.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]);
        const [branchLat, branchLon] = positions[0];
        const isReference = p.Location_Method.toLowerCase().includes("province");
        const square: LatLngBoundsExpression = [
          [branchLat - 0.025, branchLon - 0.025],
          [branchLat + 0.025, branchLon + 0.025],
        ];

        return (
          <Fragment key={p.Branch_ID}>
            <Polyline positions={positions} pathOptions={{ color, weight: 3, opacity: 0.78, dashArray: isReference ? "8 7" : undefined }}>
              <Popup><DetailPopup feature={feature} title={`${p.Branch_ID} · ${p.Branch_Name}`} /></Popup>
            </Polyline>
            {isReference ? (
              <Rectangle bounds={square} pathOptions={{ color: "#f59e0b", fillColor: "#fbbf24", fillOpacity: 0.9, weight: 2 }}>
                <Popup><DetailPopup feature={feature} title={`${p.Branch_ID} · ${p.Branch_Name}`} /></Popup>
              </Rectangle>
            ) : (
              <CircleMarker center={[branchLat, branchLon]} radius={7} pathOptions={{ color: "#ffffff", fillColor: color, fillOpacity: 1, weight: 2 }}>
                <Popup><DetailPopup feature={feature} title={`${p.Branch_ID} · ${p.Branch_Name}`} /></Popup>
              </CircleMarker>
            )}
          </Fragment>
        );
      })}
      {[...hubs.entries()].map(([hubId, { feature, point }]) => (
        <CircleMarker key={hubId} center={point} radius={10} pathOptions={{ color: "#062d2c", fillColor: "#ecfdf5", fillOpacity: 1, weight: 4 }}>
          <Popup>
            <div className="map-popup"><strong>{feature.properties.Hub_Name}</strong><span>{hubId} · Regional Hub</span></div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
