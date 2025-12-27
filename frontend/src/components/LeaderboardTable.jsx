"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Filter } from "lucide-react";
import axios from "axios";

// --- SUB-COMPONENT: Shimmer Header ---
// Creates the "liquid light" effect over the text
const ShimmerHeader = () => {
  return (
    <div className="relative inline-block">
      {/* Background Text (Static) */}
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white/20">
        Global Rankings
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
        Global Rankings
      </motion.h1>
    </div>
  );
};

// --- MAIN COMPONENT ---
export default function LeaderboardTable() {
  const [platform, setPlatform] = useState("leetcode"); // 'leetcode' or 'codeforces'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    institute: "",
    country: "",
    state: ""
  });
  const [showFilters, setShowFilters] = useState(false); // Toggle filter menu

  // Handle Input Change for Filters
  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Construct Query String dynamically
        const params = new URLSearchParams();
        if (filters.institute) params.append("institute", filters.institute);
        if (filters.country) params.append("country", filters.country);
        if (filters.state) params.append("state", filters.state);

        const res = await axios.get(`http://localhost:5000/leaderboard/${platform}?${params.toString()}`);
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    // Debounce the call so we don't spam API while typing
    const timeoutId = setTimeout(() => fetchData(), 500);
    return () => clearTimeout(timeoutId);

  }, [platform, filters]);

  return (
    <div className="w-full">
      {/* --- HEADER SECTION --- */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-6 border-b border-white/5 pb-8">
        <div>
          <ShimmerHeader />
          <p className="text-gray-500 mt-2 font-mono text-xs md:text-sm tracking-wider">
            /COMPETITIVE_PROGRAMMING /LEADERBOARD
          </p>
          <div className="mt-4 flex gap-2">
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono border transition-all ${
                  showFilters ? "bg-white text-black border-white" : "bg-transparent text-gray-500 border-white/10 hover:border-white/30"
                }`}
              >
                <Filter className="w-3 h-3" /> Filters
              </button>
           </div>
        </div>

        {/* Platform Switcher (Segmented Control Style) */}
        <div className="flex bg-white/5 p-1 rounded-lg backdrop-blur-sm border border-white/5">
          {["leetcode", "codeforces"].map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`px-6 py-2 rounded-md text-sm font-bold font-mono transition-all duration-300 capitalize tracking-tight ${
                platform === p
                  ? p === 'leetcode' 
                    ? "bg-pastel-blue/10 text-pastel-blue shadow-[0_0_10px_rgba(130,177,255,0.2)]"
                    : "bg-pastel-red/10 text-pastel-red shadow-[0_0_10px_rgba(255,138,128,0.2)]"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* FILTER BAR (Collapsible) */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white/5 p-4 rounded-lg border border-white/10">
               <input 
                 name="institute" 
                 placeholder="Filter by Institute..." 
                 onChange={handleFilterChange}
                 className="bg-black/50 border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-pastel-blue outline-none"
               />
               <input 
                 name="country" 
                 placeholder="Filter by Country..." 
                 onChange={handleFilterChange}
                 className="bg-black/50 border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-pastel-purple outline-none"
               />
               <input 
                 name="state" 
                 placeholder="Filter by State..." 
                 onChange={handleFilterChange}
                 className="bg-black/50 border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-pastel-green outline-none"
               />
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
          
          {/* Dynamic Header: Changes based on platform */}
          <div className="col-span-2 text-right text-gray-400 group-hover:text-white transition-colors">
            {platform === 'leetcode' ? 'Questions' : 'Peak Rating'}
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
                key={platform} // Key change triggers re-animation
                initial="hidden"
                animate="show"
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: { staggerChildren: 0.05 }
                  }
                }}
              >
                {data.map((user, index) => (
                  <motion.div
                    key={index}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      show: { opacity: 1, y: 0 }
                    }}
                    className="grid grid-cols-12 gap-4 px-4 py-4 items-center bg-white/[0.02] hover:bg-white/[0.05] border border-transparent hover:border-white/10 rounded-lg transition-all group cursor-default"
                  >
                    {/* 1. RANK COLUMN */}
                    <div className="col-span-1 flex justify-center font-mono text-gray-400 font-bold">
                       {index === 0 ? <Trophy className="w-5 h-5 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" /> : 
                        index === 1 ? <Trophy className="w-4 h-4 text-gray-300" /> : 
                        index === 2 ? <Trophy className="w-4 h-4 text-amber-700" /> : 
                        <span className="opacity-40 text-sm">{(index + 1).toString().padStart(2, '0')}</span>}
                    </div>

                    {/* 2. USER INFO COLUMN */}
                    <div className="col-span-6 flex items-center gap-4">
                      {/* Avatar Circle */}
                      <div className={`w-9 h-9 rounded-md flex items-center justify-center text-xs font-bold text-black shadow-lg ${
                          platform === 'leetcode' 
                            ? 'bg-gradient-to-br from-pastel-blue to-blue-500' 
                            : 'bg-gradient-to-br from-pastel-red to-red-500'
                      }`}>
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      
                      {/* Name & Handle */}
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-200 text-sm tracking-tight group-hover:text-white transition-colors">
                            {user.username}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 font-mono tracking-wider uppercase">
                                @{user.platform_handle}
                            </span>
                            {/* Show Institute Badge if exists */}
                            {user.institute && (
                                <span className="text-[9px] text-pastel-blue/70 border border-pastel-blue/20 px-1 rounded">
                                    {user.institute}
                                </span>
                            )}
                        </div>
                      </div>
                    </div>

                    {/* 3. DYNAMIC METRIC COLUMN */}
                    <div className="col-span-2 text-right font-mono text-sm">
                      {platform === 'leetcode' ? (
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
                        // Codeforces Layout
                        <div className="flex flex-col items-end justify-center">
                            <span className="text-pastel-green/90 font-bold">
                                {user.max_rating}
                            </span>
                            <span className="text-[10px] text-gray-600">PEAK</span>
                        </div>
                      )}
                    </div>

                    {/* 4. RATING COLUMN */}
                    <div className="col-span-3 text-right">
                      <span className={`font-mono font-bold text-lg tracking-tight drop-shadow-sm ${
                        platform === 'leetcode' ? 'text-pastel-blue' : 'text-pastel-red'
                      }`}>
                        {user.rating}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Empty State */}
          {!loading && data.length === 0 && (
            <div className="p-12 text-center border border-dashed border-white/10 rounded-lg bg-white/[0.01]">
              <p className="text-gray-500 font-mono text-sm">No data found in database.</p>
              <p className="text-gray-600 text-xs mt-2">Run the worker script to populate rankings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}