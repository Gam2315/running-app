"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { collection, getDocs, addDoc, setDoc, doc, deleteDoc, query } from "firebase/firestore";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Waypoint } from "@/components/AdminMap";
import { formatDistance } from "@/lib/geo";

type LeaderboardEntry = {
  id: string;
  distance: string;
  displayName?: string;
  actualDistanceKm?: number;
  paceSecondsPerKm?: number;
  timeSeconds?: number;
  finishedAt?: { toDate?: () => Date; toMillis?: () => number } | number;
};

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
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [routeToDelete, setRouteToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [detailedPath, setDetailedPath] = useState<{lat: number, lng: number}[]>([]);
  const [routeDistance, setRouteDistance] = useState(0);

  // Auto-generated values
  const distanceVariant = getDistanceVariant(routeDistance);
  const routeName = getRouteName(routeDistance);

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setAdminUser(user?.email?.toLowerCase() === adminEmail ? user : null);
      setAuthReady(true);
    });
  }, [adminEmail]);

  const handleAdminSignOut = async () => {
    await signOut(auth);
    router.replace("/");
  };

  useEffect(() => {
    if (authReady && !adminUser) router.replace("/login");
  }, [authReady, adminUser, router]);

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

  useEffect(() => {
    if (!adminUser) return;

    const fetchLeaderboard = async () => {
      setLeaderboardLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "leaderboards"));
        const entries = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }) as LeaderboardEntry)
          .filter((entry) => typeof entry.distance === "string")
          .sort((first, second) => {
            const getTime = (entry: LeaderboardEntry) => {
              if (typeof entry.finishedAt === "number") return entry.finishedAt;
              return entry.finishedAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
            };
            return getTime(first) - getTime(second);
          });
        setLeaderboardEntries(entries);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
        setLeaderboardEntries([]);
      } finally {
        setLeaderboardLoading(false);
      }
    };

    fetchLeaderboard();
  }, [adminUser]);

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
    setDeletingId(id);
    setDeleteError("");
    try {
      await deleteDoc(doc(db, "routes", id));
      await fetchRoutes();
    } catch (e) {
      console.error("Error deleting document: ", e);
      setDeleteError("Unable to delete the route. Please try again.");
    } finally {
      setDeletingId(null);
      setRouteToDelete(null);
    }
  };

  const leaderboardCategories = Array.from(new Set([
    ...routes.map((route) => route.distance),
    ...leaderboardEntries.map((entry) => entry.distance),
  ])).sort((first, second) => (parseFloat(first) || 0) - (parseFloat(second) || 0));

  const formatLeaderboardTime = (seconds?: number) => {
    if (typeof seconds !== "number") return "--:--";
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
  };

  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center text-zinc-400">Checking admin access...</div>;
  }

  if (!adminUser) return <div className="min-h-screen flex items-center justify-center text-zinc-400">Redirecting to sign in...</div>;

  return (
    <div className="min-h-screen p-6 lg:p-12 max-w-5xl mx-auto pb-32">
      <div className="flex justify-between items-center mb-12">
        <h1 className="text-4xl font-bold text-brand">Admin Panel</h1>
        <div className="flex items-center gap-4">
          <button onClick={handleAdminSignOut} className="text-sm font-medium text-white hover:text-brand transition-colors bg-white/10 px-4 py-2 rounded-lg">Sign out</button>
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
          {deleteError && <p className="mb-4 text-sm text-red-400">{deleteError}</p>}
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
                          window.scrollTo({ top: 0, behavior: "smooth" });
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
                    onClick={() => setRouteToDelete({ id: route.id, name: route.name || route.distance })}
                    disabled={deletingId !== null}
                    aria-label={`Delete ${route.name || route.distance} route`}
                    className="absolute top-4 right-4 text-zinc-500 hover:text-red-500 transition-colors disabled:cursor-wait disabled:opacity-40"
                    title="Delete Route"
                  >
                    {deletingId === route.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Finish order</p>
              <h2 className="mt-2 text-2xl font-semibold">Leaderboards by category</h2>
            </div>
            <span className="text-sm text-zinc-500">First across the line</span>
          </div>

          {leaderboardLoading ? (
            <p className="text-zinc-500">Loading leaderboard...</p>
          ) : leaderboardCategories.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-zinc-500">No finish records yet.</div>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {leaderboardCategories.map((category) => {
                const entries = leaderboardEntries.filter((entry) => entry.distance === category);
                return (
                  <div key={category} className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border px-5 py-4">
                      <h3 className="font-bold text-white">{category} category</h3>
                      <span className="text-xs uppercase tracking-wider text-zinc-500">{entries.length} finishers</span>
                    </div>
                    {entries.length === 0 ? (
                      <p className="p-5 text-sm text-zinc-600">No finish records yet.</p>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {entries.map((entry, index) => (
                          <div key={entry.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-5 py-4">
                            <span className={`text-lg font-bold ${index === 0 ? "text-brand" : "text-zinc-500"}`}>{index + 1}</span>
                            <div>
                              <p className="font-semibold text-white">{entry.displayName || "Runner"}</p>
                              <p className="text-xs text-zinc-500">{entry.actualDistanceKm?.toFixed(2) || "0.00"} km recorded</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-brand">{formatLeaderboardTime(entry.timeSeconds)}</p>
                              <p className="text-xs text-zinc-500">{formatLeaderboardTime(entry.paceSecondsPerKm)} / km</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {routeToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRouteToDelete(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-route-title"
          >
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-400">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </div>
            <h2 id="delete-route-title" className="text-xl font-semibold text-white">Delete route?</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              This will permanently remove <span className="font-semibold text-zinc-200">{routeToDelete.name}</span>.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRouteToDelete(null)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(routeToDelete.id)}
                className="rounded-lg bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-400 disabled:cursor-wait disabled:opacity-50"
                disabled={deletingId !== null}
              >
                {deletingId === routeToDelete.id ? "Deleting..." : "Delete route"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
