"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatDistance, getKmMarkers, getRainbowSegments } from "@/lib/geo";

export type WaypointType = "regular" | "hydration" | "uturn";

export interface Waypoint {
  lat: number;
  lng: number;
  type: WaypointType;
}

// ── Rainbow polyline drawn imperatively ───────────────────────────────────────
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onMapClick(event.latlng.lat, event.latlng.lng) });
  return null;
}

// ── Marker HTML builders ──────────────────────────────────────────────────────
const markerHtml = {
  start: `<div style="width:40px;height:40px;background:#22c55e;border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.6);font-size:18px;">▶</div>`,
  finish: `<div style="width:40px;height:40px;background:#ef4444;border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.6);font-size:18px;">🏁</div>`,
  hydration: `<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:36px;height:36px;background:#06b6d4;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.5);font-size:18px;">💧</div><div style="background:#06b6d4;color:white;font-size:9px;font-weight:900;padding:2px 5px;border-radius:4px;white-space:nowrap;margin-top:2px;border:1px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);">HYDRATION</div></div>`,
  uturn: `<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:36px;height:36px;background:#f97316;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.5);font-size:20px;">↩</div><div style="background:#f97316;color:white;font-size:9px;font-weight:900;padding:2px 5px;border-radius:4px;white-space:nowrap;margin-top:2px;border:1px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);">U-TURN</div></div>`,
  regular: (n: number) => `<div style="width:28px;height:28px;background:#cbf946;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;color:#000;box-shadow:0 2px 8px rgba(0,0,0,0.5);">${n}</div>`,
  km: (km: number) => `<div style="background:#dc2626;color:white;font-size:11px;font-weight:900;padding:3px 8px;border-radius:6px;white-space:nowrap;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.6);font-family:sans-serif;">${km}KM</div>`,
};

function mkDiv(html: string) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild as HTMLElement;
}

function getMarkerHtml(wp: Waypoint, routeIndex: number, routeTotal: number): string {
  if (wp.type === "hydration") return markerHtml.hydration;
  if (wp.type === "uturn") return markerHtml.uturn;
  if (routeIndex === 0) return markerHtml.start;
  if (routeIndex === routeTotal - 1) return markerHtml.finish;
  return markerHtml.regular(routeIndex);
}

// ── Main component ─────────────────────────────────────────────────────────────
interface AdminMapProps {
  waypoints: Waypoint[];
  setWaypoints: (wps: Waypoint[]) => void;
  detailedPath: {lat: number, lng: number}[];
  setDetailedPath: (path: {lat: number, lng: number}[]) => void;
  routeDistance: number;
  setRouteDistance: (dist: number) => void;
}

const typeConfig: Record<WaypointType, { label: string; emoji: string; color: string }> = {
  regular: { label: "Waypoint", emoji: "📍", color: "#cbf946" },
  hydration: { label: "Hydration", emoji: "💧", color: "#06b6d4" },
  uturn: { label: "U-Turn", emoji: "↩", color: "#f97316" },
};

// ── Free OSRM routing (no API key, no billing) ────────────────────────────────
async function fetchOsrmRoute(wps: Waypoint[]): Promise<{ path: {lat:number,lng:number}[]; distanceKm: number } | null> {
  if (wps.length < 2) return null;
  // OSRM uses lng,lat order
  const coords = wps.map(wp => `${wp.lng},${wp.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/foot/${coords}?geometries=geojson&overview=full&continue_straight=false`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    const route = data.routes[0];
    const roadPath = (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));
    const distanceKm = route.distance / 1000;

    // Force path to connect exactly from the first marker to the last marker,
    // so there is never a visual gap between the line and the waypoint pins.
    const fullPath = [
      { lat: wps[0].lat, lng: wps[0].lng },
      ...roadPath,
      { lat: wps[wps.length - 1].lat, lng: wps[wps.length - 1].lng },
    ];

    return { path: fullPath, distanceKm };
  } catch (e) {
    console.error("OSRM routing error:", e);
    return null;
  }
}

function AdminMapInner({ waypoints, setWaypoints, detailedPath, setDetailedPath, routeDistance, setRouteDistance }: AdminMapProps) {
  const [activeType, setActiveType] = useState<WaypointType>("regular");
  const [infoIndex, setInfoIndex] = useState<number | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [satellite, setSatellite] = useState(false);

  // Fetch road-snapped route from OSRM whenever waypoints change
  useEffect(() => {
    const routingWaypoints = waypoints.filter((waypoint) => waypoint.type !== "hydration");
    if (routingWaypoints.length < 2) {
      setDetailedPath([]);
      setRouteDistance(0);
      return;
    }
    let cancelled = false;
    setIsRouting(true);
    fetchOsrmRoute(routingWaypoints).then(result => {
      if (cancelled) return;
      if (result) {
        setDetailedPath(result.path);
        setRouteDistance(result.distanceKm);
      }
      setIsRouting(false);
    });
    return () => { cancelled = true; };
  }, [waypoints, setDetailedPath, setRouteDistance]);

  const kmMarkers = getKmMarkers(detailedPath ?? []);
  const routeWaypoints = waypoints.filter((waypoint) => waypoint.type !== "hydration");

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      setWaypoints([...waypoints, { lat, lng, type: activeType }]);
      setInfoIndex(null);
    },
    [waypoints, setWaypoints, activeType]
  );

  const handleDragEnd = (index: number, lat: number, lng: number) => {
    const updated = [...waypoints];
    updated[index] = { ...updated[index], lat, lng };
    setWaypoints(updated);
  };

  const handleDelete = (index: number) => {
    setWaypoints(waypoints.filter((_, i) => i !== index));
    setInfoIndex(null);
  };

  const getMarkerContent = (wp: Waypoint, index: number) => {
    if (wp.type === "hydration") return mkDiv(markerHtml.hydration);
    if (wp.type === "uturn") return mkDiv(markerHtml.uturn);
    if (index === 0) return mkDiv(markerHtml.start);
    if (index === waypoints.length - 1) return mkDiv(markerHtml.finish);
    return mkDiv(markerHtml.regular(index));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-black/50 border border-border rounded-xl">
        <span className="text-xs text-zinc-400 font-semibold mr-1">Add:</span>
        {(Object.entries(typeConfig) as [WaypointType, typeof typeConfig[WaypointType]][]).map(([type, cfg]) => (
          <button key={type} type="button" onClick={() => setActiveType(type)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-all"
            style={{ background: activeType === type ? cfg.color : "transparent", color: activeType === type ? "#000" : "#aaa", borderColor: activeType === type ? cfg.color : "#444" }}>
            {cfg.emoji} {cfg.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {isRouting && (
            <span className="text-xs text-zinc-400 flex items-center gap-1.5 animate-pulse">
              <span className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin inline-block" />
              Routing...
            </span>
          )}
          {!isRouting && waypoints.length >= 2 && (
            <span className="text-brand font-bold text-sm bg-brand/10 border border-brand/30 px-3 py-1 rounded-full">
              {formatDistance(routeDistance)}
            </span>
          )}
          {waypoints.length > 0 && (
            <>
              <button type="button" onClick={() => setWaypoints(waypoints.slice(0, -1))} className="text-xs text-zinc-400 hover:text-white border border-border px-3 py-1.5 rounded-full transition-colors">↩ Undo</button>
              <button type="button" onClick={() => setWaypoints([])} className="text-xs text-red-400 hover:text-red-300 border border-red-900 px-3 py-1.5 rounded-full transition-colors">✕ Clear</button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500 italic px-1">
        {waypoints.length === 0 ? `Select a type above, then click the map to place your starting point.` : `Click to add · Drag to reposition · Click a marker to remove`}
      </p>

      {/* Map */}
      <div className="relative h-[540px] w-full overflow-hidden rounded-xl border border-border shadow-xl">
        <button type="button" onClick={() => setSatellite((value) => !value)} className="absolute right-3 top-3 z-[1000] rounded-lg bg-black/85 px-3 py-2 text-xs font-bold text-white shadow-lg">
          {satellite ? "Street view" : "Satellite"}
        </button>
        <MapContainer center={[14.5995, 120.9842]} zoom={14} className="h-full w-full">
          {satellite ? <TileLayer attribution='&copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" /> : <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
          <MapClickHandler onMapClick={handleMapClick} />
          {getRainbowSegments(detailedPath ?? []).map((segment, index) => <Polyline key={index} positions={segment.positions.map(([lat, lng]) => [lat, lng] as [number, number])} pathOptions={{ color: segment.color, weight: 7, opacity: 0.95 }} />)}

          {/* KM markers */}
          {kmMarkers.map((km) => <Marker key={`km-${km.km}`} position={[km.lat, km.lng]} icon={L.divIcon({ className: "custom-leaflet-label", html: markerHtml.km(km.km), iconSize: [50, 26], iconAnchor: [25, 13] })} />)}

          {/* Waypoint markers */}
          {waypoints.map((wp, index) => (
            (() => {
              const routeIndex = wp.type === "hydration" ? -1 : routeWaypoints.indexOf(wp);
              const isStart = routeIndex === 0;
              const isFinish = routeIndex > 0 && routeIndex === routeWaypoints.length - 1;
              return (
            <Marker
              key={index}
              position={{ lat: wp.lat, lng: wp.lng }}
              draggable={true}
              eventHandlers={{ dragend: (event) => { const position = event.target.getLatLng(); handleDragEnd(index, position.lat, position.lng); }, click: () => setInfoIndex(infoIndex === index ? null : index) }}
              icon={L.divIcon({ className: "custom-leaflet-marker", html: getMarkerHtml(wp, routeIndex, routeWaypoints.length), iconSize: [40, 40], iconAnchor: [20, 20] })}
            >
              <div>
                {wp.type === "hydration" && <div dangerouslySetInnerHTML={{ __html: markerHtml.hydration }} />}
                {wp.type === "uturn" && <div dangerouslySetInnerHTML={{ __html: markerHtml.uturn }} />}
                {wp.type === "regular" && isStart && <div dangerouslySetInnerHTML={{ __html: markerHtml.start }} />}
                {wp.type === "regular" && isFinish && <div dangerouslySetInnerHTML={{ __html: markerHtml.finish }} />}
                {wp.type === "regular" && !isStart && !isFinish && <div dangerouslySetInnerHTML={{ __html: markerHtml.regular(routeIndex) }} />}

                {/* Info popup */}
                {infoIndex === index && (
                  <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid #333", borderRadius: 10, padding: "10px 14px", minWidth: 150, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.7)", zIndex: 999 }}>
                    <p style={{ color: "white", fontWeight: "bold", margin: "0 0 4px", fontSize: 13 }}>
                      {isStart ? "🟢 Starting Line" : isFinish ? "🏁 Finish" : wp.type === "hydration" ? "💧 Hydration" : wp.type === "uturn" ? "↩ U-Turn" : `📍 Point ${routeIndex}`}
                    </p>
                    <p style={{ color: "#888", fontSize: 11, margin: "0 0 8px" }}>{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</p>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(index); }}
                      style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 6, padding: "4px 14px", cursor: "pointer", fontWeight: "bold", fontSize: 12 }}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </Marker>
              );
            })()
          ))}
        </MapContainer>
      </div>

      {/* Waypoint list */}
      {waypoints.length > 0 && (
        <div className="bg-black/40 border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Route Points</h4>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {waypoints.map((wp, index) => {
              const routeIndex = wp.type === "hydration" ? -1 : routeWaypoints.indexOf(wp);
              const isStart = routeIndex === 0;
              const isEnd = routeIndex > 0 && routeIndex === routeWaypoints.length - 1;
              const cfg = typeConfig[wp.type];
              return (
                <div key={index} className="flex items-center gap-3 text-xs p-2 rounded-lg bg-white/5 hover:bg-white/10 group transition-colors">
                  <span className="text-base w-5 text-center flex-shrink-0">{isStart ? "▶" : isEnd ? "🏁" : cfg.emoji}</span>
                  <span className="font-semibold" style={{ color: isStart ? "#22c55e" : isEnd ? "#ef4444" : cfg.color }}>
                    {isStart ? "Start" : isEnd ? "Finish" : cfg.label}
                  </span>
                  <span className="text-zinc-500 font-mono flex-1 truncate">{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</span>
                  <button type="button" onClick={() => handleDelete(index)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 transition-all font-bold">✕</button>
                </div>
              );
            })}
          </div>
          {waypoints.length >= 2 && (
            <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
              <span className="text-xs text-zinc-500">Total Route Distance</span>
              <span className="text-brand font-bold">{formatDistance(routeDistance)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Exported wrapper with APIProvider ─────────────────────────────────────────
export default function AdminMap({ waypoints, setWaypoints, detailedPath, setDetailedPath, routeDistance, setRouteDistance }: AdminMapProps) {
  return <AdminMapInner 
        waypoints={waypoints} 
        setWaypoints={setWaypoints}
        detailedPath={detailedPath}
        setDetailedPath={setDetailedPath}
        routeDistance={routeDistance}
        setRouteDistance={setRouteDistance}
      />;
}
