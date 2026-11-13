"use client";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { MapPin, Globe, Save, ArrowLeft, Code2, Terminal, Loader2, BadgeCheck, ShieldAlert, Copy, Check } from "lucide-react";
import Link from "next/link";
import useRequireAuth from "@/store/useRequireAuth";
import { getProfile, updateProfile, verifyHandle } from "@/utils/api";

const PLATFORMS = {
  leetcode: { label: "LeetCode Username", field: "leetcodeHandle", Icon: Code2 },
  codeforces: { label: "Codeforces Handle", field: "codeforcesHandle", Icon: Terminal },
};

// One linked platform: input + verification status + proof instructions.
function HandleField({ platform, value, onChange, saved, onVerified }) {
  const { label, field, Icon } = PLATFORMS[platform];
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // Instructions only apply to the handle as it is *saved*, not to unsaved edits.
  const isSaved = saved && saved.handle.toLowerCase() === value.trim().toLowerCase();

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(saved.verification_token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the code is selectable on screen */
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setMessage("");
    try {
      await verifyHandle(platform);
      await onVerified();
    } catch (err) {
      setMessage(err.response?.data?.error || "Verification failed. Try again.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-gray-400 uppercase font-bold ml-1">{label}</label>
        {isSaved && saved.verified && (
          <span className="flex items-center gap-1 text-[10px] text-pastel-green font-bold uppercase">
            <BadgeCheck className="w-3 h-3" /> Verified
          </span>
        )}
        {isSaved && !saved.verified && (
          <span className="flex items-center gap-1 text-[10px] text-orange-400 font-bold uppercase">
            <ShieldAlert className="w-3 h-3" /> Unverified
          </span>
        )}
      </div>

      <div className="relative group">
        <Icon className="absolute left-3 top-3 w-4 h-4 text-gray-500 group-focus-within:text-white transition-colors" />
        <input
          type="text"
          name={field}
          value={value}
          onChange={onChange}
          className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 focus:border-white/30 focus:outline-none transition-all text-sm font-mono"
        />
      </div>

      {saved && !isSaved && value.trim() && (
        <p className="text-[10px] text-gray-500 ml-1">Save changes to link this handle, then verify it.</p>
      )}

      {isSaved && !saved.verified && (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Prove this is your account: add this code to {saved.verification_hint}, save it there, then click Verify.
            You can remove it afterwards.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-black/50 border border-white/10 rounded px-3 py-1.5 text-sm text-pastel-blue select-all">
              {saved.verification_token}
            </code>
            <button type="button" onClick={copyCode} className="p-2 rounded border border-white/10 text-gray-400 hover:text-white hover:border-white/30 transition-colors" title="Copy code">
              {copied ? <Check className="w-4 h-4 text-pastel-green" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="px-4 py-1.5 rounded bg-pastel-green text-black text-xs font-bold hover:bg-emerald-400 transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {verifying && <Loader2 className="w-3 h-3 animate-spin" />} Verify
            </button>
          </div>
          {message && <p className="text-[11px] text-red-400">{message}</p>}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const ready = useRequireAuth();

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState({ leetcode: null, codeforces: null }); // server-side handle info

  const [formData, setFormData] = useState({
    country: "",
    state: "",
    leetcodeHandle: "",
    codeforcesHandle: "",
  });

  const loadProfile = useCallback(async () => {
    const res = await getProfile();
    setSaved(res.data.handles);
    setFormData({
      country: res.data.country || "",
      state: res.data.state || "",
      leetcodeHandle: res.data.handles.leetcode?.handle || "",
      codeforcesHandle: res.data.handles.codeforces?.handle || "",
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadProfile()
      .catch((err) => console.error("Failed to fetch profile", err))
      .finally(() => setInitialLoading(false));
  }, [ready, loadProfile]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setStatus("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      await updateProfile(formData);
      await loadProfile(); // stay on the page so new handles can be verified right away
      setStatus("Saved. Verify any new handle below to show the verified badge. Ratings refresh in a few hours.");
    } catch (err) {
      console.error(err);
      setStatus(err.response?.data?.error || "Failed to update profile");
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

             <div className="grid grid-cols-2 gap-4">
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
                * Changing a handle resets its stats and verification.
             </p>

             <div className="space-y-6">
                {Object.keys(PLATFORMS).map((platform) => (
                  <HandleField
                    key={platform}
                    platform={platform}
                    value={formData[PLATFORMS[platform].field]}
                    onChange={handleChange}
                    saved={saved[platform]}
                    onVerified={loadProfile}
                  />
                ))}
             </div>
          </div>

          {status && <p className="text-xs text-gray-400" role="status">{status}</p>}

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
