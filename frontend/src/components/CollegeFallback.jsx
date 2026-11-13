"use client";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

const shell = "min-h-screen bg-dark-bg text-gray-200 font-mono flex items-center justify-center p-6";

// Shown when the hostname doesn't belong to any college (e.g. the bare root domain or a typo'd subdomain).
export function CollegeNotFound({ rootDomain }) {
  const [slug, setSlug] = useState("");

  const go = (e) => {
    e.preventDefault();
    const clean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!clean || !rootDomain) return;
    const { protocol, port } = window.location;
    window.location.href = `${protocol}//${clean}.${rootDomain}${port ? `:${port}` : ""}`;
  };

  return (
    <main className={shell}>
      <div className="w-full max-w-sm text-center space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">College not found</h1>
          <p className="text-gray-500 text-sm mt-2">
            We couldn&apos;t find a leaderboard at this address.
            {rootDomain ? " Enter your college's name to go to it." : " Check the link you were given."}
          </p>
        </div>
        {rootDomain && (
          <form onSubmit={go} className="flex gap-2">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. mit"
              aria-label="College name"
              className="flex-1 min-w-0 bg-dark-bg/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:border-white/30 outline-none"
            />
            <button className="bg-white text-black font-bold rounded-lg px-4 flex items-center gap-1.5 hover:bg-gray-200 transition-colors">
              Go <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
        {rootDomain && <p className="text-[11px] text-gray-600">Takes you to <span className="text-gray-400">name.{rootDomain}</span></p>}
      </div>
    </main>
  );
}

// Shown when the API can't be reached at all.
export function ServiceUnavailable() {
  const [busy, setBusy] = useState(false);
  return (
    <main className={shell}>
      <div className="w-full max-w-sm text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Can&apos;t reach the server</h1>
        <p className="text-gray-500 text-sm">The leaderboard is temporarily unavailable. Please try again in a moment.</p>
        <button
          onClick={() => { setBusy(true); window.location.reload(); }}
          className="bg-white text-black font-bold rounded-lg px-5 py-2.5 inline-flex items-center gap-2 hover:bg-gray-200 transition-colors"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Try again
        </button>
      </div>
    </main>
  );
}
