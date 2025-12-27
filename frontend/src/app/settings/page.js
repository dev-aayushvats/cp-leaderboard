"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building, MapPin, Globe, Save, ArrowLeft, Code2, Terminal, Loader2 } from "lucide-react";
import Link from "next/link";
import axios from "axios";
import useAuthStore from "@/store/useAuthStore";
import { useRouter } from "next/navigation";

export default function Settings() {
  const { user, token, login } = useAuthStore();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true); // For fetching initial data
  
  const [formData, setFormData] = useState({
    institute: "",
    country: "",
    state: "",
    leetcodeHandle: "",
    codeforcesHandle: ""
  });

  // Fetch latest data from backend on mount
  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchProfile = async () => {
      try {
        const res = await axios.get("http://localhost:5000/profile", {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        // Populate form with fetched data
        setFormData({
            institute: res.data.institute || "",
            country: res.data.country || "",
            state: res.data.state || "",
            leetcodeHandle: res.data.leetcode_handle || "",
            codeforcesHandle: res.data.codeforces_handle || ""
        });
      } catch (err) {
        console.error("Failed to fetch profile", err);
      } finally {
        setInitialLoading(false);
      }
    };

    fetchProfile();
  }, [token, router]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.put("http://localhost:5000/profile", formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Update local user state (optional, mainly for username/email)
      // Note: We don't necessarily store handles in the 'user' object of auth store, 
      // but if you do, update it here.
      alert("Profile & Handles Updated! Rankings will refresh in a few hours.");
      router.push("/");
    } catch (err) {
      console.error(err);
      alert("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><Loader2 className="animate-spin text-pastel-blue"/></div>;

  return (
    <main className="min-h-screen bg-dark-bg flex items-center justify-center p-4 relative font-mono">
       <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-pastel-blue/5 rounded-full blur-[128px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10"
      >
        <Link href="/" className="inline-flex items-center text-xs text-gray-500 hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-3 h-3 mr-1" /> Back to Leaderboard
        </Link>

        <h1 className="text-2xl font-bold text-white mb-1">Profile Settings</h1>
        <p className="text-gray-500 text-xs mb-8">
          Update your personal info and coding handles.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* SECTION 1: Personal Info */}
          <div className="space-y-4">
             <h2 className="text-xs font-bold text-white/50 uppercase tracking-widest border-b border-white/5 pb-2">
                Regional Info
             </h2>
             
             {/* Institute */}
             <div className="space-y-2">
                <label className="text-[10px] text-pastel-blue uppercase font-bold ml-1">Institute</label>
                <div className="relative group">
                <Building className="absolute left-3 top-3 w-4 h-4 text-gray-500 group-focus-within:text-pastel-blue transition-colors" />
                <input
                    type="text"
                    name="institute"
                    value={formData.institute}
                    onChange={handleChange}
                    placeholder="e.g. IIT Dharwad"
                    className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 focus:border-pastel-blue/50 focus:outline-none transition-all text-sm"
                />
                </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
                {/* Country */}
                <div className="space-y-2">
                <label className="text-[10px] text-pastel-purple uppercase font-bold ml-1">Country</label>
                <div className="relative group">
                    <Globe className="absolute left-3 top-3 w-4 h-4 text-gray-500 group-focus-within:text-pastel-purple transition-colors" />
                    <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    placeholder="India"
                    className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 focus:border-pastel-purple/50 focus:outline-none transition-all text-sm"
                    />
                </div>
                </div>

                {/* State */}
                <div className="space-y-2">
                <label className="text-[10px] text-pastel-green uppercase font-bold ml-1">State</label>
                <div className="relative group">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-500 group-focus-within:text-pastel-green transition-colors" />
                    <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    placeholder="Karnataka"
                    className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 focus:border-pastel-green/50 focus:outline-none transition-all text-sm"
                    />
                </div>
                </div>
             </div>
          </div>

          {/* SECTION 2: Platform Handles */}
          <div className="space-y-4">
             <h2 className="text-xs font-bold text-white/50 uppercase tracking-widest border-b border-white/5 pb-2">
                Linked Platforms
             </h2>
             <p className="text-[10px] text-orange-400/80 italic">
                * Changing these will reset your stats until the next update cycle.
             </p>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] text-gray-400 uppercase font-bold ml-1">LeetCode Username</label>
                    <div className="relative group">
                        <Code2 className="absolute left-3 top-3 w-4 h-4 text-gray-500 group-focus-within:text-white transition-colors" />
                        <input
                            type="text"
                            name="leetcodeHandle"
                            value={formData.leetcodeHandle}
                            onChange={handleChange}
                            className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 focus:border-white/30 focus:outline-none transition-all text-sm font-mono"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] text-gray-400 uppercase font-bold ml-1">Codeforces Handle</label>
                    <div className="relative group">
                        <Terminal className="absolute left-3 top-3 w-4 h-4 text-gray-500 group-focus-within:text-white transition-colors" />
                        <input
                            type="text"
                            name="codeforcesHandle"
                            value={formData.codeforcesHandle}
                            onChange={handleChange}
                            className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 focus:border-white/30 focus:outline-none transition-all text-sm font-mono"
                        />
                    </div>
                </div>
             </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />} 
            Save Changes
          </button>
        </form>
      </motion.div>
    </main>
  );
}