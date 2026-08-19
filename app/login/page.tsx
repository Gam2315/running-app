"use client";

import { useState } from "react";
import { browserLocalPersistence, setPersistence, signInWithPopup } from "firebase/auth";
import { auth, googleProvider, facebookProvider } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const getErrorMessage = (error: unknown): string => {
    if (!error || typeof error !== "object" || !("code" in error)) {
      return "Unable to sign in. Please try again.";
    }

    switch (error.code) {
      case "auth/operation-not-allowed":
        return "This sign-in method is not enabled in Firebase Authentication.";
      case "auth/unauthorized-domain":
        return "This website domain is not authorized in Firebase Authentication.";
      case "auth/popup-blocked":
        return "Your browser blocked the sign-in popup. Allow popups and try again.";
      case "auth/popup-closed-by-user":
        return "The sign-in window was closed before completing sign-in.";
      case "auth/account-exists-with-different-credential":
        return "An account already exists with a different sign-in method.";
      case "auth/invalid-api-key":
        return "Firebase has an invalid API key. Check the Vercel environment variables.";
      default:
        return "Sign-in failed. Check the Firebase provider settings and try again.";
    }
  };

  const signIn = async (provider: typeof googleProvider | typeof facebookProvider) => {
    setError(null);
    setLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await signInWithPopup(auth, provider);
      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase() || "";
      const signedInEmail = credential.user.email?.trim().toLowerCase() || "";
      const destination = signedInEmail === adminEmail ? "/admin" : "/";
      router.replace(destination);
      router.refresh();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
      console.error("Sign-in failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await signIn(googleProvider);
  };

  const handleFacebookSignIn = async () => {
    await signIn(facebookProvider);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-black relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-card p-8 rounded-3xl border border-border relative z-10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand rounded-xl transform rotate-45 flex items-center justify-center mx-auto mb-6 overflow-hidden">
            <div className="w-6 h-6 bg-black transform -rotate-45" />
          </div>
          <h1 className="text-3xl font-bold tracking-tighter text-white mb-2">Welcome to ALCALA<span className="text-brand">RUN</span></h1>
          <p className="text-zinc-400">Sign in to sync your running progress.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold py-3.5 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-70"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {loading ? "Signing in..." : "Continue with Google"}
          </button>

          <button
            onClick={handleFacebookSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white font-semibold py-3.5 rounded-xl hover:bg-[#1864D9] transition-colors disabled:opacity-70"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.557-.14-2.857-.14C11.928 2 10 3.657 10 6.7v2.8H7v4h3V22h4v-8.5z" />
            </svg>
            {loading ? "Signing in..." : "Continue with Facebook"}
          </button>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
