"use client";

import L from "leaflet";
import { Circle, MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { calculateRouteDistance, formatDistance, getKmMarkers, getRainbowSegments } from "@/lib/geo";
import type { Waypoint } from "@/components/AdminMap";

interface UserMapProps {
  waypoints: Waypoint[];
  detailedPath?: {lat: number, lng: number}[];
  routeDistance?: number;
  runMode?: boolean;
  satellite?: boolean;
  onSatelliteChange?: (satellite: boolean) => void;
  userPosition?: { lat: number; lng: number; accuracy: number } | null;
}

const userIcon = L.divIcon({
  className: "custom-leaflet-user-marker",
  html: '<div style="width:20px;height:20px;background:#4285f4;border:4px solid white;border-radius:50%;box-shadow:0 0 0 8px rgba(66,133,244,.2),0 2px 8px rgba(0,0,0,.55);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const markerIcon = (background: string, label: string) => L.divIcon({
  className: "custom-leaflet-marker",
  html: `<div style="width:36px;height:36px;background:${background};border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.6);font-size:18px;">${label}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const startIcon = markerIcon("#22c55e", "▶");
const finishIcon = markerIcon("#ef4444", "🏁");
const hydrationIcon = markerIcon("#06b6d4", "💧");
const uturnIcon = markerIcon("#f97316", "↩");
const kmIcon = (km: number, satellite: boolean) => L.divIcon({
  className: "custom-leaflet-label",
  html: `<div style="background:${satellite ? "#111827" : "#dc2626"};color:#fff;font:900 11px sans-serif;padding:4px 7px;border:2px solid #fff;border-radius:7px;white-space:nowrap;box-shadow:0 2px 7px rgba(0,0,0,.75);">${km}KM</div>`,
  iconSize: [50, 26],
  iconAnchor: [25, 13],
});

function UserMapInner({ waypoints, detailedPath, routeDistance, runMode = false, satellite = false, onSatelliteChange, userPosition = null }: UserMapProps) {
  const actualPath = detailedPath && detailedPath.length > 0 ? detailedPath : waypoints;
  const totalDistance = routeDistance || calculateRouteDistance(waypoints);
  const kmMarkers = getKmMarkers(actualPath);
  const center = { lat: waypoints[0].lat, lng: waypoints[0].lng };

  return (
    <div className={runMode ? "h-full" : "flex flex-col gap-3"}>
      {/* Stats */}
      {!runMode && <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2 bg-brand/10 border border-brand/30 text-brand font-bold px-4 py-2 rounded-full">
          📏 {formatDistance(totalDistance)}
        </div>
        <div className="flex items-center gap-2 bg-white/5 border border-border text-zinc-300 px-4 py-2 rounded-full">
          📍 {waypoints.length} points
        </div>
        {waypoints.filter(w => w.type === "hydration").length > 0 && (
          <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-4 py-2 rounded-full">
            💧 {waypoints.filter(w => w.type === "hydration").length} hydration
          </div>
        )}
      </div>}

      {/* Map */}
      <div className={`${runMode ? "absolute inset-0 h-full rounded-none border-0" : "h-[420px] rounded-xl border border-border"} relative w-full overflow-hidden shadow-xl`}>
        {!runMode && <button type="button" onClick={() => onSatelliteChange?.(!satellite)} className="absolute right-3 top-3 z-[1000] rounded-lg bg-black/85 px-3 py-2 text-xs font-bold text-white shadow-lg">{satellite ? "Street view" : "Satellite"}</button>}
        <MapContainer center={[center.lat, center.lng]} zoom={14} zoomControl={false} scrollWheelZoom={!runMode} className="h-full w-full">
          {satellite ? <TileLayer attribution='&copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" /> : <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
          {getRainbowSegments(actualPath).map((segment, index) => <Polyline key={index} positions={segment.positions.map(([lat, lng]) => [lat, lng] as [number, number])} pathOptions={{ color: segment.color, weight: 7, opacity: 0.95 }} />)}
          {kmMarkers.map((km) => <Marker key={`km-${km.km}`} position={[km.lat, km.lng]} icon={kmIcon(km.km, satellite)} />)}
          {waypoints.map((wp, index) => {
            const isStart = index === 0;
            const isEnd = index === waypoints.length - 1;
            if (!isStart && !isEnd && wp.type === "regular") return null;
            return <Marker key={index} position={[wp.lat, wp.lng]} icon={isStart ? startIcon : isEnd ? finishIcon : wp.type === "hydration" ? hydrationIcon : uturnIcon} />;
          })}
          {userPosition && <>
            <Circle center={[userPosition.lat, userPosition.lng]} radius={Math.min(userPosition.accuracy, 50)} pathOptions={{ color: "#4285f4", fillColor: "#4285f4", fillOpacity: 0.12, weight: 1 }} />
            <Marker position={[userPosition.lat, userPosition.lng]} icon={userIcon} />
          </>}
        </MapContainer>
      </div>
    </div>
  );
}

export default function UserMap({ waypoints, detailedPath, routeDistance, runMode = false, satellite = false, onSatelliteChange, userPosition = null }: UserMapProps) {
  if (!waypoints || waypoints.length === 0) return null;
  return <UserMapInner waypoints={waypoints} detailedPath={detailedPath} routeDistance={routeDistance} runMode={runMode} satellite={satellite} onSatelliteChange={onSatelliteChange} userPosition={userPosition} />;
}
