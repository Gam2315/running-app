"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const UserMap = dynamic(() => import("@/components/UserMap"), { 
  ssr: false,
  loading: () => <div className="h-64 w-full bg-zinc-900 animate-pulse rounded-lg flex items-center justify-center text-zinc-500 mt-6">Loading Map...</div>
});

export default function Home() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedDistance, setSelectedDistance] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Derive distances dynamically from Firestore routes, sorted numerically
  const distances = Array.from(new Set(routes.map((r) => r.distance)))
    .filter((d): d is string => typeof d === "string" && !!d)
    .sort((a, b) => {
      const numA = parseFloat(a) || 0;
      const numB = parseFloat(b) || 0;
      return numA - numB;
    });

  // Auto-select the first available distance when routes load
  useEffect(() => {
    if (distances.length > 0 && (!selectedDistance || !distances.includes(selectedDistance))) {
      setSelectedDistance(distances[0]);
    }
  }, [distances, selectedDistance]);

  useEffect(() => {
    const fetchRoutes = async () => {
      setLoading(true);
      try {
        const { collection, getDocs } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const querySnapshot = await getDocs(collection(db, "routes"));
        const data: any[] = [];
        querySnapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() });
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

  const activeRoute = routes.find((r) => r.distance === selectedDistance);

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
          <Link href="/login" className="text-sm font-medium text-white hover:text-brand transition-colors bg-white/10 px-4 py-2 rounded-lg">
            Login
          </Link>
          <Link href="/admin" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            Admin Portal
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center py-16 px-6 md:px-12 max-w-5xl mx-auto w-full">
        
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight">
            Find Your <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-[#7ab81d]">Perfect Pace</span>
          </h2>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto">
            Choose your distance and we'll show you the meticulously planned route to crush your goals today.
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
                  selectedDistance === dist 
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
                
                <button className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  START RUN
                </button>
              </div>
            ) : routes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <h3 className="text-xl font-semibold text-white">No Routes Found</h3>
                <p className="text-zinc-500">Go to the Admin Portal to configure routes first.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center px-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <h3 className="text-xl font-semibold text-white">No Route Set</h3>
                <p className="text-zinc-500">The admin hasn't configured a route for {selectedDistance} yet.</p>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
