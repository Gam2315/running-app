import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | ALCALARUN",
  description: "Terms of Service for ALCALARUN.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white md:px-12">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-brand hover:underline">
          Back to ALCALARUN
        </Link>
        <h1 className="mt-8 text-4xl font-bold tracking-tight md:text-5xl">Terms of Service</h1>
        <p className="mt-3 text-sm text-zinc-500">Last updated: August 20, 2026</p>

        <div className="mt-10 space-y-8 leading-7 text-zinc-300">
          <section>
            <h2 className="text-xl font-semibold text-white">Using ALCALARUN</h2>
            <p className="mt-3">ALCALARUN provides running routes, GPS-based run tracking, and community leaderboards. You must provide accurate information and use the service lawfully.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Location and safety</h2>
            <p className="mt-3">Run tracking depends on your device and location services. GPS measurements may be inaccurate or unavailable. You are responsible for choosing a safe route, following local laws, and exercising within your own limits.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Accounts and content</h2>
            <p className="mt-3">You are responsible for activity performed through your account and for the name shown with your leaderboard results. Do not submit content that is unlawful, abusive, misleading, or that infringes another person&apos;s rights.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Service changes</h2>
            <p className="mt-3">We may update, suspend, or discontinue features and may remove leaderboard entries that violate these terms or appear inaccurate.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3">Questions about these terms can be directed to the ALCALARUN app administrator.</p>
          </section>
        </div>

        <p className="mt-10 text-sm text-zinc-500">
          See also <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link>.
        </p>
      </article>
    </main>
  );
}
