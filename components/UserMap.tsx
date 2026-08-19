"use client";

import { useEffect, useRef } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";
import { calculateRouteDistance, formatDistance, getKmMarkers, getRainbowSegments } from "@/lib/geo";
import type { Waypoint } from "@/components/AdminMap";

interface UserMapProps {
  waypoints: Waypoint[];
  detailedPath?: {lat: number, lng: number}[];
  routeDistance?: number;
}

function MapPolylines({ detailedPath }: { detailedPath: { lat: number; lng: number }[] }) {
  const map = useMap();
  const linesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map) return;
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];
    if (!detailedPath || detailedPath.length < 2) return;

    const segments = getRainbowSegments(detailedPath);

    segments.forEach((seg) => {
      linesRef.current.push(new google.maps.Polyline({
        path: seg.positions.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: "#ffffff",
        strokeWeight: 12,
        strokeOpacity: 0.3,
        map,
        zIndex: 1,
      }));
    });

    segments.forEach((seg) => {
      linesRef.current.push(new google.maps.Polyline({
        path: seg.positions.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: seg.color,
        strokeWeight: 7,
        strokeOpacity: 0.95,
        map,
        zIndex: 2,
      }));
    });

    return () => {
      linesRef.current.forEach((l) => l.setMap(null));
      linesRef.current = [];
    };
  }, [map, detailedPath]);

  return null;
}

const kmLabelHtml = (km: number) =>
  `<div style="background:#dc2626;color:white;font-size:11px;font-weight:900;padding:3px 8px;border-radius:6px;white-space:nowrap;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.6);font-family:sans-serif;">${km}KM</div>`;

const startHtml = `<div style="width:36px;height:36px;background:#22c55e;border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.6);font-size:18px;">▶</div>`;
const finishHtml = `<div style="width:36px;height:36px;background:#ef4444;border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.6);font-size:18px;">🏁</div>`;
const hydrationHtml = `<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:32px;height:32px;background:#06b6d4;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;">💧</div><div style="background:#06b6d4;color:white;font-size:9px;font-weight:900;padding:2px 5px;border-radius:4px;white-space:nowrap;margin-top:2px;border:1px solid white;">HYDRATION</div></div>`;
const uturnHtml = `<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:32px;height:32px;background:#f97316;border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;">↩</div><div style="background:#f97316;color:white;font-size:9px;font-weight:900;padding:2px 5px;border-radius:4px;white-space:nowrap;margin-top:2px;border:1px solid white;">U-TURN</div></div>`;

function UserMapInner({ waypoints, detailedPath, routeDistance }: UserMapProps) {
  const actualPath = detailedPath && detailedPath.length > 0 ? detailedPath : waypoints;
  const totalDistance = routeDistance || calculateRouteDistance(waypoints);
  const kmMarkers = getKmMarkers(actualPath);
  const center = { lat: waypoints[0].lat, lng: waypoints[0].lng };

  return (
    <div className="flex flex-col gap-3">
      {/* Stats */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
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
      </div>

      {/* Map */}
      <div className="h-[420px] w-full rounded-xl overflow-hidden border border-border shadow-xl">
        <Map
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
          defaultCenter={center}
          defaultZoom={14}
          mapTypeId="hybrid"
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          <MapPolylines detailedPath={actualPath} />

          {/* KM markers */}
          {kmMarkers.map((km) => (
            <AdvancedMarker key={`km-${km.km}`} position={{ lat: km.lat, lng: km.lng }}>
              <div dangerouslySetInnerHTML={{ __html: kmLabelHtml(km.km) }} />
            </AdvancedMarker>
          ))}

          {/* Start & Finish + special waypoints only */}
          {waypoints.map((wp, index) => {
            const isStart = index === 0;
            const isEnd = index === waypoints.length - 1;
            if (!isStart && !isEnd && wp.type === "regular") return null;
            const html = isStart ? startHtml : isEnd ? finishHtml : wp.type === "hydration" ? hydrationHtml : uturnHtml;
            return (
              <AdvancedMarker key={index} position={{ lat: wp.lat, lng: wp.lng }}>
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </AdvancedMarker>
            );
          })}
        </Map>
      </div>
    </div>
  );
}

export default function UserMap({ waypoints, detailedPath, routeDistance }: UserMapProps) {
  if (!waypoints || waypoints.length === 0) return null;
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}>
      <UserMapInner waypoints={waypoints} detailedPath={detailedPath} routeDistance={routeDistance} />
    </APIProvider>
  );
}
