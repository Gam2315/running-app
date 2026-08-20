"use client";

import { useState, useEffect, useRef, useEffectEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Waypoint } from "@/components/AdminMap";
import { formatDistance, haversineDistance } from "@/lib/geo";

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
  finishedAt?: { toMillis?: () => number } | number;
  actualDistanceKm?: number;
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

const ROUTES_CACHE_KEY = "alcalarun:routes:v1";

type RoutesCache = {
  savedAt: number;
  routes: RouteData[];
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
  const [runArmed, setRunArmed] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [showGuestNameModal, setShowGuestNameModal] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [trackedDistanceKm, setTrackedDistanceKm] = useState(0);
  const [satelliteMode, setSatelliteMode] = useState(false);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "locating" | "ready" | "error">("idle");
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const resultSavedRef = useRef(false);

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
      let cachedRoutes: RouteData[] | null = null;
      try {
        const cached = window.localStorage.getItem(ROUTES_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as RoutesCache;
          if (Array.isArray(parsed.routes)) {
            cachedRoutes = parsed.routes;
            setRoutes(parsed.routes);
            setLoading(false);
          }
        }
      } catch (error) {
        console.warn("Unable to read cached routes:", error);
      }

      if (!cachedRoutes) setLoading(true);
      try {
        const { collection, getDocs } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const querySnapshot = await getDocs(collection(db, "routes"));
        const data: RouteData[] = [];
        querySnapshot.forEach((doc) => {
          data.push({ id: doc.id, ...(doc.data() as Omit<RouteData, "id">) });
        });
        setRoutes(data);
        window.localStorage.setItem(ROUTES_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), routes: data } satisfies RoutesCache));
      } catch (e) {
        console.error("Error fetching routes from Firestore:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRoutes();
  }, []);

  const activeRoute = routes.find((r) => r.distance === activeDistance);
  const currentPace = trackedDistanceKm > 0.03 ? elapsedSeconds / trackedDistanceKm : 0;
  const runnerName = (user?.displayName?.trim() || user?.email?.split("@")[0] || guestName.trim() || "ALCALEÑOS").split(/\s+/)[0];

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
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
    const fetchLeaderboard = async () => {
      setLeaderboardLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "leaderboards"));
        const entries = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }) as LeaderboardEntry)
          .filter((entry) => typeof entry.distance === "string")
          .sort((first, second) => {
            const getFinishTime = (entry: LeaderboardEntry) => {
              if (typeof entry.finishedAt === "number") return entry.finishedAt;
              return entry.finishedAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
            };
            return getFinishTime(first) - getFinishTime(second);
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
  }, []);

  const startRun = (name?: string) => {
    if (!user && !name) return;
    if (name) setGuestName(name);
    setElapsedSeconds(0);
    setTrackedDistanceKm(0);
    lastPositionRef.current = null;
    setUserPosition(null);
    setGpsStatus("locating");
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (position.coords.accuracy <= 15) {
            setUserPosition({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
            setGpsStatus("ready");
          }
        },
        () => setGpsStatus("error"),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    } else {
      setGpsStatus("error");
    }
    resultSavedRef.current = false;
    setRunStartedAt(null);
    setIsFinishing(false);
    setIsRunning(false);
    setRunArmed(true);
  };

  const handleStartRun = () => {
    if (user) {
      startRun();
      return;
    }
    setGuestName("");
    setShowGuestNameModal(true);
  };

  const finishRun = () => {
    if (runStartedAt === null) {
      setRunArmed(false);
      setIsRunning(false);
      setGpsStatus("idle");
      return;
    }
    if (isFinishing || resultSavedRef.current) return;
    resultSavedRef.current = true;
    const finalElapsedSeconds = runStartedAt === null ? elapsedSeconds : Math.floor((Date.now() - runStartedAt) / 1000);
    if (runStartedAt !== null) {
      setElapsedSeconds(finalElapsedSeconds);
    }
    if (activeRoute) {
      const paceSecondsPerKm = trackedDistanceKm > 0.03 ? finalElapsedSeconds / trackedDistanceKm : 0;
      const leaderboardEntry = {
        distance: activeRoute.distance,
        displayName: user?.displayName || user?.email?.split("@")[0] || guestName || "Runner",
        timeSeconds: finalElapsedSeconds,
        paceSecondsPerKm,
        actualDistanceKm: trackedDistanceKm,
        finishedAt: serverTimestamp(),
        ...(user ? { userId: user.uid } : {}),
      };
      addDoc(collection(db, "leaderboards"), leaderboardEntry).catch((error) => console.error("Error saving finish result:", error));
    }
    setIsRunning(false);
    setRunArmed(false);
    setIsFinishing(true);
    window.setTimeout(() => setIsFinishing(false), 900);
  };
  const finishRunEvent = useEffectEvent(finishRun);

  useEffect(() => {
    if (!runArmed || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const nextPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (position.coords.accuracy > 15) return;
        setUserPosition({ ...nextPosition, accuracy: position.coords.accuracy });
        const startPoint = activeRoute?.waypoints?.[0];
        const finishPoint = activeRoute?.waypoints?.[activeRoute.waypoints.length - 1];
        if (!startPoint) return;

        const distanceFromStart = haversineDistance(nextPosition, startPoint);
        if (!isRunning && distanceFromStart <= 0.015) {
          setRunStartedAt(Date.now());
          setIsRunning(true);
          setGpsStatus("ready");
        }

        const previousPosition = lastPositionRef.current;
        if (previousPosition) {
          const segmentKm = haversineDistance(previousPosition, nextPosition);
          if (isRunning && segmentKm > 0.001 && segmentKm < 0.2) setTrackedDistanceKm((distance) => distance + segmentKm);
        }
        lastPositionRef.current = nextPosition;
        setGpsStatus("ready");

        if (isRunning && finishPoint && haversineDistance(nextPosition, finishPoint) <= 0.015) finishRunEvent();
      },
      (error) => console.warn("Location tracking unavailable:", error.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [runArmed, isRunning, activeRoute]);

  if ((runArmed || isRunning || isFinishing) && activeRoute?.waypoints && activeRoute.waypoints.length >= 2) {
    return (
      <div className="run-screen-enter fixed inset-0 z-100 overflow-hidden bg-[#17262d] text-white">
        <UserMap
          waypoints={activeRoute.waypoints}
          detailedPath={activeRoute.detailedPath}
          routeDistance={activeRoute.calculatedDistanceKm}
          runMode
          satellite={satelliteMode}
          userPosition={userPosition}
        />

        {gpsStatus !== "ready" && <div className="pointer-events-none absolute left-1/2 top-24 z-2000 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-center text-xs font-semibold text-white shadow-lg">{gpsStatus === "error" ? "Allow location access to show your position" : "Locating you..."}</div>}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-2000 flex items-center justify-between bg-black/75 px-5 pb-5 pt-6 text-white drop-shadow-lg">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">ALCALA RUN</p>
            <p className="mt-1 text-lg font-bold">{activeRoute.distance} route</p>
          </div>
          <button onClick={finishRun} disabled={isFinishing} className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-xl text-white shadow-lg disabled:opacity-50" aria-label="Finish run">
            ×
          </button>
        </div>

        {isFinishing && (
          <div className="run-complete-enter absolute inset-0 z-2100 flex items-center justify-center bg-black/35 px-6 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[28px] border border-brand/30 bg-[#111214]/95 p-7 text-center shadow-2xl">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand text-3xl font-bold text-black">✓</div>
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-brand">Run complete</p>
              <p className="mt-2 text-5xl font-bold tabular-nums">{formatTime(elapsedSeconds)}</p>
              <p className="mt-2 text-zinc-400">Final pace: <span className="font-semibold text-white">{formatPace(currentPace)} / km</span></p>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-4 bottom-5 z-2000 mx-auto max-w-lg space-y-3">
          <div className={`${isFinishing ? "run-panel-exit" : "run-panel-enter"} rounded-[28px] border border-white/10 bg-[#111214]/95 px-5 py-5 shadow-2xl backdrop-blur-md`}>
            <div className="mb-4 text-center">
              <p className="text-sm font-semibold text-white/60">{isRunning ? "RUNNING" : "WAITING AT START LINE"}</p>
              <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums">{formatTime(elapsedSeconds)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold tabular-nums text-brand">{formatPace(currentPace)}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-white/50">Pace / km</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{formatDistance(trackedDistanceKm)}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-white/50">Distance</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{activeRoute.distance}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-white/50">Category</p>
              </div>
            </div>
          </div>

          <div className={`${isFinishing ? "run-panel-exit" : "run-panel-enter"} pointer-events-auto rounded-[28px] border border-white/10 bg-[#111214]/95 px-5 py-5 shadow-2xl backdrop-blur-md`}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/25" />
            <button onClick={finishRun} disabled={isFinishing} className="flex w-full items-center justify-center gap-3 rounded-full bg-brand py-4 text-lg font-bold text-black shadow-[0_0_24px_rgba(203,249,70,0.25)] transition-transform active:scale-95 disabled:opacity-50">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/15">■</span>
              {isRunning ? "Finish Run" : "Waiting for start line"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen font-sans">
      <header className="z-50 flex w-full items-center justify-between gap-3 border-b border-border bg-black/95 px-4 py-4 backdrop-blur-md sticky top-0 isolate sm:px-6 md:px-12">
        <div className="flex min-w-0 shrink items-center gap-2">
          <Image src="/alcalarun.png" alt="Alcala Run logo" width={42} height={42} className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" priority />
          <h1 className="truncate text-xl font-bold tracking-tighter text-white sm:text-2xl">ALCALA<span className="text-brand">RUN</span></h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {user ? (
            <>
              <Link href="#leaderboards" className="max-w-[90px] truncate rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:text-brand sm:max-w-none sm:px-4 sm:text-sm">
                Hi, {user.displayName?.split(" ")[0] || "Runner"}
              </Link>
              <button onClick={() => signOut(auth)} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white sm:h-auto sm:w-auto sm:px-0" aria-label="Log out" title="Log out">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:hidden"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
                <span className="hidden text-sm font-medium sm:inline">Log out</span>
              </button>
            </>
          ) : (
            <Link href="/login" className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:text-brand sm:px-4 sm:text-sm">
              Login
            </Link>
          )}
        </div>
      </header>

      {authReady && !user && (
        <div className="sticky top-20.25 z-40 w-full bg-brand px-6 py-3 text-center text-sm font-semibold text-black">
          <Link href="/login" className="underline underline-offset-4">Log in</Link> to appear on the category leaderboards.
        </div>
      )}

      <main className="flex-1 flex flex-col items-center py-16 px-6 md:px-12 max-w-5xl mx-auto w-full">
        
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight">
            HAPPY <br/><span className="break-words text-transparent bg-clip-text bg-linear-to-r from-brand to-[#7ab81d]">RUNNNIG {runnerName.toUpperCase()}</span>
          </h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            Choose a distance, follow the route, and track your real-time pace as you run.
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
                       satellite={satelliteMode}
                       onSatelliteChange={setSatelliteMode}
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

                <button onClick={isRunning ? finishRun : handleStartRun} className={`w-full py-4 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 ${isRunning ? "bg-red-500 text-white hover:bg-red-600" : "bg-white text-black hover:bg-zinc-200"}`}>
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
            <span className="text-sm text-zinc-500">Top finishers</span>
          </div>

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
        </section>

      </main>

      {showGuestNameModal && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = guestName.trim();
              if (!name) return;
              setShowGuestNameModal(false);
              startRun(name);
            }}
            className="w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-2xl"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Guest runner</p>
            <h2 className="mt-3 text-3xl font-bold text-white">What should we call you?</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">Your name will appear on the finish results and leaderboard.</p>
            <label htmlFor="guest-name" className="mt-6 block text-sm font-semibold text-white">Display name</label>
            <input
              id="guest-name"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              maxLength={40}
              autoFocus
              required
              className="mt-2 w-full rounded-xl border border-border bg-black/50 px-4 py-3 text-white outline-none transition focus:border-brand"
              placeholder="Enter your name"
            />
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowGuestNameModal(false)} className="flex-1 rounded-xl border border-border px-4 py-3 font-semibold text-zinc-300 transition hover:bg-white/5">Cancel</button>
              <button type="submit" className="flex-1 rounded-xl bg-brand px-4 py-3 font-bold text-black transition hover:bg-brand-hover">Start run</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
