"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Filter, BadgeCheck } from "lucide-react";
import { getLeaderboard } from "@/utils/api";
import useCollege from "@/utils/useCollege";
import { styleFor, DEFAULT_PLATFORMS } from "@/utils/platforms";
import { timeAgo } from "@/utils/time";

// --- SUB-COMPONENT: Shimmer Header ---
// Creates the "liquid light" effect over the text
const ShimmerHeader = ({ title }) => {
  return (
    <div className="relative inline-block">
      {/* Background Text (Static) */}
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white/20">
        {title}
      </h1>
      {/* Overlay Text (Animated Gradient) */}
      <motion.h1
        className="text-4xl md:text-5xl font-bold tracking-tight absolute top-0 left-0 text-transparent bg-clip-text bg-gradient-to-r from-pastel-blue via-pastel-purple to-pastel-blue"
        animate={{
          backgroundPosition: ["0% center", "200% center"],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "linear",
        }}
        style={{ backgroundSize: "200% auto" }}
      >
        {title}
      </motion.h1>
    </div>
  );
};

const selectClass =
  "bg-black/50 border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-pastel-blue outline-none";

// --- MAIN COMPONENT ---
export default function LeaderboardTable() {
  const college = useCollege();
  const platforms = college?.platforms ?? DEFAULT_PLATFORMS;
  const batches = college?.batches ?? [];
  const departments = college?.departments ?? [];

  const [platform, setPlatform] = useState("leetcode");
  const [filters, setFilters] = useState({ batch: "", department: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // The result remembers which request produced it. "Loading" is simply "the stored
  // result isn't for the request we want now", so a slow, older response can never
  // be shown for (or overwrite) a newer selection.
  const requestKey = `${platform}|${filters.batch}|${filters.department}|${reloadKey}`;
  const [result, setResult] = useState({ key: null, data: [], error: false });
  const loading = result.key !== requestKey;
  const data = result.data;
  const error = !loading && result.error;

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const canFilter = batches.length > 0 || departments.length > 0;

  const handleFilterChange = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));

  useEffect(() => {
    let cancelled = false;
    getLeaderboard(platform, filters)
      .then((res) => !cancelled && setResult({ key: requestKey, data: res.data, error: false }))
      .catch((err) => {
        console.error(err);
        if (!cancelled) setResult({ key: requestKey, data: [], error: true });
      });
    return () => { cancelled = true; };
  }, [platform, filters, requestKey]);

  const st = styleFor(platform);
  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // "Updated 2h ago" = the most recent successful sync among the rows shown
  const freshest = useMemo(() => {
    const times = data.map((r) => Date.parse(r.last_synced_at)).filter((t) => !Number.isNaN(t));
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  }, [data]);

  return (
    <div className="w-full">
      {/* --- HEADER SECTION --- */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-6 border-b border-white/5 pb-8">
        <div>
          <ShimmerHeader title={college ? `${college.name} Rankings` : "Rankings"} />
          <p className="text-gray-500 mt-2 font-mono text-xs md:text-sm tracking-wider">
            /COMPETITIVE_PROGRAMMING /LEADERBOARD
          </p>
          {canFilter && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono border transition-all ${
                  showFilters ? "bg-white text-black border-white" : "bg-transparent text-gray-500 border-white/10 hover:border-white/30"
                }`}
              >
                <Filter className="w-3 h-3" /> Filters{activeFilters > 0 && ` (${activeFilters})`}
              </button>
            </div>
          )}
        </div>

        {/* Platform Switcher (Segmented Control Style) */}
        <div className="flex flex-wrap bg-white/5 p-1 rounded-lg backdrop-blur-sm border border-white/5">
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className={`px-5 py-2 rounded-md text-sm font-bold font-mono transition-all duration-300 tracking-tight ${
                platform === p.id ? styleFor(p.id).tab : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* FILTER BAR (Collapsible) */}
      <AnimatePresence>
        {showFilters && canFilter && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="flex flex-wrap items-center gap-4 bg-white/5 p-4 rounded-lg border border-white/10">
              {batches.length > 0 && (
                <select name="batch" value={filters.batch} onChange={handleFilterChange} className={selectClass} aria-label="Filter by batch">
                  <option value="">All batches</option>
                  {batches.map((b) => <option key={b} value={b}>Batch of {b}</option>)}
                </select>
              )}
              {departments.length > 0 && (
                <select name="department" value={filters.department} onChange={handleFilterChange} className={selectClass} aria-label="Filter by department">
                  <option value="">All departments</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              {activeFilters > 0 && (
                <button onClick={() => setFilters({ batch: "", department: "" })} className="text-xs text-gray-400 hover:text-white underline underline-offset-2">
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- TABLE SECTION --- */}
      <div className="relative">

        {/* Table Column Headers */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-[0.2em] border-b border-white/10 select-none">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-6">Competitor</div>
          <div className="col-span-2 text-right text-gray-400">
            {st.secondary === "solved" ? "Questions" : "Peak Rating"}
          </div>
          <div className="col-span-3 text-right text-pastel-blue/80">Current Rating</div>
        </div>

        {/* Table Body */}
        <div className="mt-2 space-y-1 min-h-[300px]">
          {loading ? (
            // Skeleton Loader
            [...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-16 w-full bg-white/5 animate-pulse rounded-lg mb-2 border border-white/5"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${platform}-${filters.batch}-${filters.department}`} // key change triggers re-animation
                initial="hidden"
                animate="show"
                variants={{
                  hidden: { opacity: 0 },
                  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
                }}
              >
                {data.map((user, index) => (
                  <motion.div
                    key={`${user.username}-${user.platform_handle}`}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      show: { opacity: 1, y: 0 },
                    }}
                    className="grid grid-cols-12 gap-4 px-4 py-4 items-center bg-white/[0.02] hover:bg-white/[0.05] border border-transparent hover:border-white/10 rounded-lg transition-all group"
                  >
                    {/* 1. RANK COLUMN */}
                    <div className="col-span-1 flex justify-center font-mono text-gray-400 font-bold">
                      {index === 0 ? <Trophy className="w-5 h-5 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" /> :
                       index === 1 ? <Trophy className="w-4 h-4 text-gray-300" /> :
                       index === 2 ? <Trophy className="w-4 h-4 text-amber-700" /> :
                       <span className="opacity-40 text-sm">{(index + 1).toString().padStart(2, '0')}</span>}
                    </div>

                    {/* 2. USER INFO COLUMN */}
                    <div className="col-span-6 flex items-center gap-4 min-w-0">
                      {/* Avatar Circle */}
                      <div className={`w-9 h-9 shrink-0 rounded-md flex items-center justify-center text-xs font-bold text-black shadow-lg ${st.avatar}`}>
                        {user.username.charAt(0).toUpperCase()}
                      </div>

                      {/* Name & Handle */}
                      <div className="flex flex-col min-w-0">
                        <Link
                          href={`/u/${encodeURIComponent(user.username)}?p=${platform}`}
                          className="font-bold text-gray-200 text-sm tracking-tight group-hover:text-white hover:underline underline-offset-2 transition-colors truncate"
                        >
                          {user.username}
                        </Link>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-gray-500 font-mono tracking-wider uppercase">
                            @{user.platform_handle}
                          </span>
                          {user.verified && (
                            <BadgeCheck className="w-3 h-3 text-pastel-green" title="Verified handle" />
                          )}
                          {user.department && (
                            <span className="text-[9px] text-gray-400 border border-white/10 px-1 rounded">{user.department}</span>
                          )}
                          {user.batch && (
                            <span className="text-[9px] text-gray-400 border border-white/10 px-1 rounded">&apos;{String(user.batch).slice(-2)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 3. DYNAMIC METRIC COLUMN */}
                    <div className="col-span-2 text-right font-mono text-sm">
                      {st.secondary === "solved" ? (
                        <div className="flex flex-col items-end justify-center">
                          {/* Total Solved */}
                          <span className="text-gray-400">
                            {user.questions_solved}
                            <span className="text-[10px] ml-1 opacity-40">SOLVED</span>
                          </span>

                          {/* Daily Progress Badge (Only show if > 0) */}
                          {user.questions_today > 0 && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="text-[10px] font-bold text-pastel-green bg-pastel-green/10 px-1.5 rounded mt-0.5 inline-block"
                            >
                              +{user.questions_today} today
                            </motion.span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-end justify-center">
                          <span className="text-pastel-green/90 font-bold">{user.max_rating}</span>
                          <span className="text-[10px] text-gray-600">PEAK</span>
                        </div>
                      )}
                    </div>

                    {/* 4. RATING COLUMN */}
                    <div className="col-span-3 text-right">
                      <span className={`font-mono font-bold text-lg tracking-tight drop-shadow-sm ${st.text}`}>
                        {user.rating}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="p-12 text-center border border-dashed border-red-500/30 rounded-lg bg-red-500/[0.03]">
              <p className="text-gray-300 font-mono text-sm">Couldn&apos;t load the rankings.</p>
              <button onClick={retry} className="mt-3 text-xs text-pastel-blue hover:underline">Try again</button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && data.length === 0 && (
            <div className="p-12 text-center border border-dashed border-white/10 rounded-lg bg-white/[0.01]">
              <p className="text-gray-500 font-mono text-sm">
                {activeFilters > 0 ? "No members match these filters." : "No one is ranked here yet."}
              </p>
              <p className="text-gray-600 text-xs mt-2">
                {activeFilters > 0 ? "Try clearing a filter." : "Ratings appear after a member's first sync."}
              </p>
            </div>
          )}
        </div>

        {/* Freshness */}
        {!loading && freshest && (
          <p className="mt-4 text-right text-[11px] text-gray-600 font-mono">Ratings updated {timeAgo(freshest)}</p>
        )}
      </div>
    </div>
  );
}
