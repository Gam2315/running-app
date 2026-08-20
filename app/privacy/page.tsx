import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | ALCALARUN",
  description: "Privacy Policy for ALCALARUN.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white md:px-12">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-brand hover:underline">
          Back to ALCALARUN
        </Link>
        <h1 className="mt-8 text-4xl font-bold tracking-tight md:text-5xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-zinc-500">Last updated: August 20, 2026</p>

        <div className="mt-10 space-y-8 leading-7 text-zinc-300">
          <section>
            <h2 className="text-xl font-semibold text-white">Information we collect</h2>
            <p className="mt-3">When you sign in with Google or Facebook, we receive the account information provided by that service, such as your name, email address, and profile identifier. When you use run tracking, ALCALARUN may process your location, route progress, distance, time, and pace.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">How we use information</h2>
            <p className="mt-3">We use this information to authenticate you, provide route and run tracking features, save your results, and display leaderboard entries. We do not sell your personal information.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Third-party sign-in</h2>
            <p className="mt-3">Sign-in is provided by Firebase Authentication and the identity provider you choose. Their own privacy policies also apply to information they process.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Data retention and deletion</h2>
            <p className="mt-3">You can request deletion of your account and associated data by contacting the app administrator. Guest leaderboard entries may remain publicly visible unless a deletion request is made.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3">For privacy questions or data deletion requests, contact the ALCALARUN app administrator.</p>
          </section>
        </div>
      </article>
    </main>
  );
}
