"use client";
import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { BadgeCheck, ExternalLink, Loader2, Pencil, Clock } from "lucide-react";
import useAuthStore from "@/store/useAuthStore";
import SiteHeader from "@/components/SiteHeader";
import { getUserProfile } from "@/utils/api";
import { styleFor } from "@/utils/platforms";
import { timeAgo } from "@/utils/time";
import RatingChart from "@/components/RatingChart";

const fmt = (n) => Number(n).toLocaleString("en-US");

function Tile({ label, value, sub, accent }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent || "text-white"}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Chip({ children }) {
  return <span className="text-[11px] text-gray-300 border border-white/10 bg-white/[0.03] rounded-full px-2.5 py-0.5">{children}</span>;
}

export default function MemberProfile() {
  const params = useParams();
  const preferred = useSearchParams().get("p"); // platform the visitor came from (leaderboard tab)
  const username = useMemo(() => {
    try { return decodeURIComponent(params.username); } catch { return params.username; }
  }, [params.username]);

  const [state, setState] = useState({ status: "loading", data: null });
  const [platformId, setPlatformId] = useState(null);
  const [metric, setMetric] = useState("rating"); // 'rating' | 'solved'

  useEffect(() => {
    let cancelled = false;
    getUserProfile(username)
      .then((res) => {
        if (cancelled) return;
        setState({ status: "ok", data: res.data });
        const wanted = res.data.platforms.find((x) => x.platform === preferred);
        setPlatformId((cur) => cur ?? wanted?.platform ?? res.data.platforms[0]?.platform ?? null);
      })
      .catch((err) => !cancelled && setState({ status: err.response?.status === 404 ? "missing" : "error", data: null }));
    return () => { cancelled = true; };
  }, [username, preferred]);

  const me = useAuthStore((s) => s.user);

  if (state.status === "loading") {
    return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><Loader2 className="animate-spin text-brand" /></div>;
  }
  if (state.status !== "ok") {
    return (
      <main className="min-h-screen bg-dark-bg text-gray-200 font-mono p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <SiteHeader back />
          <div className="p-12 text-center border border-dashed border-white/10 rounded-lg">
            <p className="text-gray-300">{state.status === "missing" ? "Member not found." : "Couldn't load this profile."}</p>
            <p className="text-gray-500 text-xs mt-2">
              {state.status === "missing" ? "They may have left the college or changed their name." : "Please try again in a moment."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const p = state.data;
  const current = p.platforms.find((x) => x.platform === platformId) || p.platforms[0];
  const st = current ? styleFor(current.platform) : null;
  const hasSolved = current && (current.questions_solved > 0 || current.history.some((h) => h.questions_solved > 0));
  const activeMetric = metric === "solved" && hasSolved ? "solved" : "rating";
  const series = current
    ? current.history.map((h) => ({ date: h.date, value: activeMetric === "solved" ? h.questions_solved : h.rating }))
    : [];
  const rated = current && (current.rating > 0 || current.max_rating > 0);
  const ago = current && timeAgo(current.last_synced_at);

  return (
    <main className="min-h-screen bg-dark-bg text-gray-200 font-mono relative overflow-x-hidden">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand/5 rounded-full blur-[128px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-brand-2/5 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-8">
        <SiteHeader back />

        {/* Header */}
        <header className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-black shadow-lg ${st ? st.avatar : "bg-gradient-to-br from-gray-300 to-gray-500"}`}>
            {p.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight truncate">{p.username}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {p.department && <Chip>{p.department}</Chip>}
              {p.batch && <Chip>Batch of {p.batch}</Chip>}
              <span className="text-[11px] text-gray-500">
                Member since {new Date(p.member_since).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>
            </div>
          </div>
          {me && me.username === p.username && (
            <Link href="/settings" className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/15 text-gray-300 hover:text-white hover:border-white/40 transition-colors">
              <Pencil className="w-3 h-3" /> Edit profile
            </Link>
          )}
        </header>

        {!current ? (
          <div className="p-12 text-center border border-dashed border-white/10 rounded-lg bg-white/[0.01]">
            <p className="text-gray-400 text-sm">No linked coding profiles yet.</p>
          </div>
        ) : (
          <motion.div key={current.platform} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Platform switcher */}
            {p.platforms.length > 1 && (
              <div className="inline-flex bg-white/5 p-1 rounded-lg border border-white/5 flex-wrap">
                {p.platforms.map((x) => (
                  <button
                    key={x.platform}
                    onClick={() => { setPlatformId(x.platform); setMetric("rating"); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
                      x.platform === current.platform ? styleFor(x.platform).tab : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            )}

            {/* Handle line */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
              <a href={current.profile_url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 hover:underline ${st.text}`}>
                @{current.handle} <ExternalLink className="w-3 h-3" />
              </a>
              {current.verified && (
                <span className="inline-flex items-center gap-1 text-[11px] text-pastel-green"><BadgeCheck className="w-3.5 h-3.5" /> Verified</span>
              )}
              <span className="text-[11px] text-gray-500">{ago ? `Updated ${ago}` : "Not synced yet"}</span>
            </div>

            {!ago && (
              <div className="flex items-start gap-2.5 text-xs text-gray-300 bg-brand/5 border border-brand/20 rounded-lg px-4 py-3">
                <Clock className="w-4 h-4 text-brand shrink-0 mt-px" />
                <span>
                  Waiting for the first sync. Ratings are fetched in the background, so this fills in within a few hours of linking a handle.
                </span>
              </div>
            )}

            {/* Stat tiles */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label="Rank" value={`#${current.rank}`} sub={`of ${fmt(current.participants)} in college`} accent={st.text} />
              <Tile label="Rating" value={rated ? fmt(current.rating) : "Unrated"} sub={rated ? undefined : ago ? "No rated contests yet" : "Pending first sync"} />
              <Tile label="Peak rating" value={current.max_rating > 0 ? fmt(current.max_rating) : "–"} />
              <Tile
                label="Solved"
                value={current.questions_solved > 0 ? fmt(current.questions_solved) : "–"}
                sub={current.questions_today > 0 ? `+${current.questions_today} today` : undefined}
              />
            </section>

            {/* History chart */}
            <section className="bg-dark-card border border-white/10 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                  <h2 className="text-sm font-bold text-white">{activeMetric === "solved" ? "Problems solved" : "Rating"} over time</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">Last 12 months · one point per day</p>
                </div>
                {hasSolved && (
                  <div className="flex bg-white/5 p-0.5 rounded-md border border-white/5" role="group" aria-label="Metric">
                    {[["rating", "Rating"], ["solved", "Solved"]].map(([id, text]) => (
                      <button
                        key={id}
                        onClick={() => setMetric(id)}
                        aria-pressed={activeMetric === id}
                        className={`px-3 py-1 rounded text-[11px] font-bold transition-colors ${activeMetric === id ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {series.length >= 2 ? (
                <RatingChart
                  points={series}
                  color={st.chart}
                  label={activeMetric === "solved" ? "Solved" : "Rating"}
                  ariaLabel={`${p.username}'s ${current.label} ${activeMetric === "solved" ? "problems solved" : "rating"} over time, ${series.length} daily values from ${series[0].date} to ${series[series.length - 1].date}`}
                />
              ) : (
                <div className="py-12 text-center border border-dashed border-white/10 rounded-lg">
                  <p className="text-gray-400 text-sm">Not enough history for a graph yet.</p>
                  <p className="text-gray-600 text-xs mt-1.5">A new point is added every day, so check back tomorrow.</p>
                </div>
              )}
            </section>
          </motion.div>
        )}
      </div>
    </main>
  );
}
