"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Waypoint } from "@/components/AdminMap";

const UserMap = dynamic(() => import("@/components/UserMap"), { 
  ssr: false,
  loading: () => <div className="h-64 w-full bg-zinc-900 animate-pulse rounded-lg flex items-center justify-center text-zinc-500 mt-6">Loading Map...</div>
});

type LeaderboardEntry = {
  id: string;
  distance: string;
  displayName?: string;
  userName?: string;
  timeSeconds?: number;
  paceSecondsPerKm?: number;
};

type RouteData = {
  id: string;
  distance: string;
  name: string;
  description: string;
  calculatedDistanceKm?: number;
  waypoints?: Waypoint[];
  detailedPath?: { lat: number; lng: number }[];
};

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours > 0 ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "--:--";
  const roundedSeconds = Math.round(secondsPerKm);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function Home() {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [selectedDistance, setSelectedDistance] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Derive distances dynamically from Firestore routes, sorted numerically
  const distances = Array.from(new Set(routes.map((r) => r.distance)))
    .filter((d): d is string => typeof d === "string" && !!d)
    .sort((a, b) => {
      const numA = parseFloat(a) || 0;
      const numB = parseFloat(b) || 0;
      return numA - numB;
    });

  const activeDistance = selectedDistance && distances.includes(selectedDistance) ? selectedDistance : distances[0] || "";

  useEffect(() => {
    const fetchRoutes = async () => {
      setLoading(true);
      try {
        const { collection, getDocs } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const querySnapshot = await getDocs(collection(db, "routes"));
        const data: RouteData[] = [];
        querySnapshot.forEach((doc) => {
          data.push({ id: doc.id, ...(doc.data() as Omit<RouteData, "id">) });
        });
        setRoutes(data);
      } catch (e) {
        console.error("Error fetching routes from Firestore:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRoutes();
  }, []);

  const activeRoute = routes.find((r) => r.distance === activeDistance);
  const routeDistanceKm = Number(activeRoute?.calculatedDistanceKm) || parseFloat(activeDistance) || 0;
  const currentPace = routeDistanceKm > 0 ? elapsedSeconds / routeDistanceKm : 0;

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) setLeaderboardEntries([]);
    });
  }, []);

  useEffect(() => {
    if (!isRunning || runStartedAt === null) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - runStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, runStartedAt]);

  useEffect(() => {
    if (!user) return;

    const fetchLeaderboard = async () => {
      setLeaderboardLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "leaderboards"));
        const entries = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }) as LeaderboardEntry)
          .filter((entry) => typeof entry.distance === "string")
          .sort((first, second) => {
            const firstPace = first.paceSecondsPerKm ?? Number.MAX_SAFE_INTEGER;
            const secondPace = second.paceSecondsPerKm ?? Number.MAX_SAFE_INTEGER;
            return firstPace - secondPace;
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
  }, [user]);

  const startRun = () => {
    setElapsedSeconds(0);
    setRunStartedAt(Date.now());
    setIsRunning(true);
  };

  const stopRun = () => {
    if (runStartedAt !== null) {
      setElapsedSeconds(Math.floor((Date.now() - runStartedAt) / 1000));
    }
    setIsRunning(false);
  };

  return (
    <div className="flex flex-col min-h-screen font-sans">
      <header className="w-full p-6 md:px-12 flex justify-between items-center border-b border-border bg-black/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {/* Logo Placeholder */}
          <div className="w-8 h-8 bg-brand rounded-md transform rotate-45 flex items-center justify-center overflow-hidden">
            <div className="w-4 h-4 bg-black transform -rotate-45" />
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-white">ALCALA<span className="text-brand">RUN</span></h1>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link href="#leaderboards" className="text-sm font-medium text-white hover:text-brand transition-colors bg-white/10 px-4 py-2 rounded-lg">
                Hi, {user.displayName?.split(" ")[0] || "Runner"}
              </Link>
              <button onClick={() => signOut(auth)} className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Log out
              </button>
            </>
          ) : (
            <Link href="/login" className="text-sm font-medium text-white hover:text-brand transition-colors bg-white/10 px-4 py-2 rounded-lg">
              Login
            </Link>
          )}
        </div>
      </header>

      {authReady && !user && (
        <div className="w-full bg-brand px-6 py-3 text-center text-sm font-semibold text-black">
          <Link href="/login" className="underline underline-offset-4">Log in</Link> to appear on the category leaderboards.
        </div>
      )}

      <main className="flex-1 flex flex-col items-center py-16 px-6 md:px-12 max-w-5xl mx-auto w-full">
        
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight">
            Find Your <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-[#7ab81d]">Perfect Pace</span>
          </h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            Choose your distance and we&apos;ll show you the meticulously planned route to crush your goals today.
          </p>
        </div>

        {/* Distance Selector */}
        {distances.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            {distances.map((dist) => (
              <button
                key={dist}
                onClick={() => setSelectedDistance(dist)}
                className={`px-6 py-3 rounded-full text-sm md:text-base font-semibold transition-all duration-300 ${
                  activeDistance === dist
                    ? "bg-brand text-black shadow-[0_0_20px_rgba(203,249,70,0.3)] scale-105" 
                    : "bg-card text-zinc-400 hover:bg-zinc-800 hover:text-white border border-border"
                }`}
              >
                {dist}
              </button>
            ))}
          </div>
        )}

        {/* Active Route Display */}
        <div className="w-full max-w-2xl bg-card rounded-3xl p-1 md:p-8 border border-border relative overflow-hidden group">
          
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          
          <div className="p-6 md:p-4 relative z-10">
            {loading ? (
              <div className="animate-pulse flex flex-col items-center justify-center h-48 space-y-4">
                <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
                <p className="text-zinc-500 font-medium">Loading routes...</p>
              </div>
            ) : activeRoute ? (
              <div className="flex flex-col h-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="inline-block bg-black text-brand text-xs font-bold px-3 py-1.5 rounded-full mb-3 border border-brand/30">
                      {activeRoute.distance} SELECTED
                    </span>
                    <h3 className="text-3xl md:text-4xl font-bold text-white mb-2">{activeRoute.name}</h3>
                  </div>
                </div>

                <div className="bg-black/50 p-6 rounded-2xl border border-white/5">
                  <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">Route Details</h4>
                  <p className="text-zinc-300 text-lg leading-relaxed mb-4">
                    {activeRoute.description}
                  </p>
                  
                  {activeRoute.waypoints && activeRoute.waypoints.length >= 2 && (
                     <UserMap 
                       waypoints={activeRoute.waypoints} 
                       detailedPath={activeRoute.detailedPath}
                       routeDistance={activeRoute.calculatedDistanceKm} 
                     />
                  )}
                </div>
                
                {(isRunning || elapsedSeconds > 0) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/50 p-4 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Time</p>
                      <p className="mt-1 text-2xl font-bold text-white tabular-nums">{formatTime(elapsedSeconds)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/50 p-4 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pace / km</p>
                      <p className="mt-1 text-2xl font-bold text-brand tabular-nums">{formatPace(currentPace)}</p>
                    </div>
                  </div>
                )}

                <button onClick={isRunning ? stopRun : startRun} className={`w-full py-4 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 ${isRunning ? "bg-red-500 text-white hover:bg-red-600" : "bg-white text-black hover:bg-zinc-200"}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  {isRunning ? "FINISH RUN" : elapsedSeconds > 0 ? "START AGAIN" : "START RUN"}
                </button>
              </div>
            ) : routes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <h3 className="text-xl font-semibold text-white">No Routes Found</h3>
                <p className="text-zinc-500">The admin area can be used to configure routes.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center px-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <h3 className="text-xl font-semibold text-white">No Route Set</h3>
                <p className="text-zinc-500">The admin hasn&apos;t configured a route for {activeDistance} yet.</p>
              </div>
            )}
          </div>
        </div>

        <section id="leaderboards" className="w-full max-w-2xl mt-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Race results</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Category leaderboards</h2>
            </div>
            {user && <span className="text-sm text-zinc-500">Top pace / km</span>}
          </div>

          {!authReady ? (
            <p className="text-zinc-500">Checking your login...</p>
          ) : !user ? (
            <div className="rounded-2xl border border-brand/30 bg-brand/10 p-6 text-center">
              <p className="text-lg font-semibold text-white">Log in to see the rankings</p>
              <p className="mt-2 text-zinc-400">Compare your pace with runners in every distance category.</p>
              <Link href="/login" className="mt-5 inline-flex rounded-xl bg-brand px-5 py-3 font-bold text-black hover:bg-[#b9e944]">Log in to view leaderboards</Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {leaderboardLoading ? (
                <p className="p-6 text-zinc-500">Loading rankings...</p>
              ) : distances.length === 0 ? (
                <p className="p-6 text-zinc-500">No distance categories are available yet.</p>
              ) : distances.map((distance) => {
                const categoryEntries = leaderboardEntries.filter((entry) => entry.distance === distance).slice(0, 5);
                return (
                  <div key={distance} className="border-b border-white/10 p-5 last:border-b-0">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-bold text-white">{distance} category</h3>
                      <span className="text-xs uppercase tracking-wider text-zinc-500">{categoryEntries.length} runners</span>
                    </div>
                    {categoryEntries.length > 0 ? categoryEntries.map((entry, index) => (
                      <div key={entry.id} className="flex items-center justify-between border-t border-white/5 py-3 text-sm">
                        <span className="text-zinc-400">{index + 1}. <span className="text-white">{entry.displayName || entry.userName || "Runner"}</span></span>
                        <span className="font-semibold text-brand">{formatPace(entry.paceSecondsPerKm ?? 0)} / km</span>
                      </div>
                    )) : <p className="text-sm text-zinc-600">No recorded runs yet.</p>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
