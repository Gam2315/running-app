"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, setDoc, doc, deleteDoc, query } from "firebase/firestore";
import dynamic from "next/dynamic";
import type { Waypoint } from "@/components/AdminMap";
import { formatDistance } from "@/lib/geo";

const AdminMap = dynamic(() => import("@/components/AdminMap"), { 
  ssr: false,
  loading: () => <div className="h-[520px] w-full bg-zinc-900 animate-pulse rounded-xl flex items-center justify-center text-zinc-500">Loading Map...</div>
});

// ── Auto-generate variant label and route name from km ───────────────────────
function getDistanceVariant(km: number): string {
  if (km <= 0) return "Unknown";
  const rounded = Math.round(km);
  return `${rounded}K`;
}

function getRouteName(km: number): string {
  if (km <= 0) return "Untitled Route";
  const rounded = Math.round(km);
  return `${rounded}K ALCALARUN Route`;
}

export default function AdminPage() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [detailedPath, setDetailedPath] = useState<{lat: number, lng: number}[]>([]);
  const [routeDistance, setRouteDistance] = useState(0);

  // Auto-generated values
  const distanceVariant = getDistanceVariant(routeDistance);
  const routeName = getRouteName(routeDistance);

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "routes"));
      const querySnapshot = await getDocs(q);
      const data: any[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setRoutes(data);
    } catch (e) {
      console.error("Error fetching routes: ", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (waypoints.length < 2) return;
    setSaving(true);
    try {
      const payload = {
        distance: distanceVariant,
        name: routeName,
        waypoints,
        detailedPath,
        calculatedDistanceKm: routeDistance,
        calculatedDistanceLabel: formatDistance(routeDistance),
      };

      const existingRoute = routes.find(r => r.distance === distanceVariant);
      
      if (existingRoute) {
        await setDoc(doc(db, "routes", existingRoute.id), payload);
      } else {
        await addDoc(collection(db, "routes"), payload);
      }
      
      setWaypoints([]);
      setDetailedPath([]);
      setRouteDistance(0);
      setSavedMsg(`✓ Saved: ${routeName}`);
      setTimeout(() => setSavedMsg(""), 3000);
      fetchRoutes();
    } catch (e) {
      console.error("Error saving route: ", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "routes", id));
      fetchRoutes();
    } catch (e) {
      console.error("Error deleting document: ", e);
    }
  };

  return (
    <div className="min-h-screen p-6 lg:p-12 max-w-5xl mx-auto pb-32">
      <div className="flex justify-between items-center mb-12">
        <h1 className="text-4xl font-bold text-brand">Admin Panel</h1>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-white hover:text-brand transition-colors bg-white/10 px-4 py-2 rounded-lg">
            Login
          </Link>
          <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
            Back to App
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-12">
        <div className="bg-card p-6 md:p-8 rounded-2xl border border-border shadow-xl">
          <h2 className="text-2xl font-semibold mb-2">Create / Update Route</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Place waypoints on the map — the route name and distance category will be detected automatically.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            
            {/* Auto-generated preview badges */}
            {routeDistance > 0 && (
              <div className="flex flex-wrap items-center gap-3 p-4 bg-black/50 border border-brand/30 rounded-xl animate-in fade-in duration-300">
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Auto-generated:</span>
                <span className="bg-brand/20 text-brand text-sm font-bold px-3 py-1 rounded-full border border-brand/30">
                  {distanceVariant}
                </span>
                <span className="text-zinc-300 font-semibold">{routeName}</span>
                <span className="ml-auto text-brand font-bold">{formatDistance(routeDistance)}</span>
              </div>
            )}

            {/* Map */}
            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Route Waypoints
              </label>
              <AdminMap 
                waypoints={waypoints} 
                setWaypoints={setWaypoints}
                detailedPath={detailedPath}
                setDetailedPath={setDetailedPath}
                routeDistance={routeDistance}
                setRouteDistance={setRouteDistance}
              />
            </div>

            {/* Save button */}
            <button
              type="submit"
              disabled={waypoints.length < 2 || saving}
              className="mt-2 w-full bg-brand text-black font-bold text-lg py-4 rounded-xl hover:bg-brand-hover transition-colors shadow-[0_0_15px_rgba(203,249,70,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : waypoints.length < 2 ? "Place at least 2 waypoints to save" : `Save Route — ${routeName}`}
            </button>

            {savedMsg && (
              <p className="text-center text-brand font-semibold animate-in fade-in">{savedMsg}</p>
            )}
          </form>
        </div>

        {/* Current Routes */}
        <div>
          <h2 className="text-2xl font-semibold mb-6">Current Routes</h2>
          {loading ? (
            <p className="text-zinc-500">Loading...</p>
          ) : routes.length === 0 ? (
            <p className="text-zinc-500">No routes configured yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {routes.map((route) => (
                <div key={route.id} className="bg-card p-5 rounded-xl border border-border relative group">
                  <span className="inline-block bg-brand/20 text-brand text-xs font-bold px-2 py-1 rounded mb-2">
                    {route.distance}
                  </span>
                  <h3 className="text-xl font-medium mb-1">{route.name}</h3>
                  <p className="text-sm text-zinc-500 mb-3">{route.calculatedDistanceLabel || "—"}</p>
                  
                  {route.waypoints && route.waypoints.length >= 2 ? (
                    <div className="text-xs bg-black p-2 rounded border border-border flex items-center justify-between">
                      <span className="text-zinc-400">
                        {route.waypoints.length} waypoints · {route.calculatedDistanceLabel || "—"}
                      </span>
                      <button 
                        onClick={() => {
                          setWaypoints(route.waypoints);
                          setDetailedPath(route.detailedPath || []);
                          setRouteDistance(route.calculatedDistanceKm || 0);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="text-brand hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-red-400">No waypoints configured</span>
                  )}
                  
                  <button 
                    onClick={() => handleDelete(route.id)}
                    className="absolute top-4 right-4 text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete Route"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
