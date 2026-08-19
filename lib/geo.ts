/**
 * Haversine formula to calculate the distance between two lat/lng points in kilometers.
 */
export function haversineDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sin_dLat = Math.sin(dLat / 2);
  const sin_dLng = Math.sin(dLng / 2);

  const haversine =
    sin_dLat * sin_dLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sin_dLng * sin_dLng;

  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return R * c;
}

/**
 * Calculates the total distance of a route defined by an ordered list of waypoints.
 */
export function calculateRouteDistance(waypoints: { lat: number; lng: number }[]): number {
  if (!waypoints || waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += haversineDistance(waypoints[i], waypoints[i + 1]);
  }
  return total;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  return `${km.toFixed(2)} km`;
}

/**
 * Returns the lat/lng positions of each 1km mark along the route.
 * e.g. [1km_pos, 2km_pos, 3km_pos, ...]
 */
export function getKmMarkers(waypoints: { lat: number; lng: number }[]): { lat: number; lng: number; km: number }[] {
  if (!waypoints || waypoints.length < 2) return [];

  const markers: { lat: number; lng: number; km: number }[] = [];
  let accumulated = 0;
  let nextKm = 1;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const segDist = haversineDistance(waypoints[i], waypoints[i + 1]);

    while (accumulated + segDist >= nextKm) {
      // How far into this segment is the km mark?
      const remainder = nextKm - accumulated;
      const t = remainder / segDist;

      const lat = waypoints[i].lat + t * (waypoints[i + 1].lat - waypoints[i].lat);
      const lng = waypoints[i].lng + t * (waypoints[i + 1].lng - waypoints[i].lng);

      markers.push({ lat, lng, km: nextKm });
      nextKm++;
    }

    accumulated += segDist;
  }

  return markers;
}

/**
 * Returns coloured segment positions for a rainbow gradient polyline.
 * Each segment between two waypoints gets a colour from the rainbow cycle.
 */
const RAINBOW_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];

export function getRainbowSegments(path: { lat: number; lng: number }[]): { positions: [number, number][]; color: string }[] {
  if (!path || path.length < 2) return [];
  
  const totalPoints = path.length;
  // Divide into N equal chunks based on number of points
  // (A more accurate but complex way would be based on actual distance, but points are usually evenly distributed enough)
  const colors = RAINBOW_COLORS;
  const numChunks = colors.length;
  const pointsPerChunk = Math.max(1, Math.ceil(totalPoints / numChunks));
  
  const segments: { positions: [number, number][]; color: string }[] = [];
  
  for (let i = 0; i < numChunks; i++) {
    const startIdx = i * pointsPerChunk;
    const endIdx = Math.min(startIdx + pointsPerChunk + 1, totalPoints); // +1 to overlap with next chunk
    
    if (startIdx >= totalPoints - 1) break;
    
    const chunk = path.slice(startIdx, endIdx);
    segments.push({
      positions: chunk.map(p => [p.lat, p.lng]),
      color: colors[i],
    });
  }
  
  return segments;
}
