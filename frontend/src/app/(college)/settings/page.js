"use client";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { GraduationCap, Building2, Save, Loader2, BadgeCheck, ShieldAlert, Copy, Check, ExternalLink, AlertTriangle } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import useRequireAuth from "@/store/useRequireAuth";
import { getProfile, updateProfile, verifyHandle } from "@/utils/api";
import useCollege from "@/utils/useCollege";
import { styleFor, DEFAULT_PLATFORMS } from "@/utils/platforms";

// One linked platform: input + verification status + proof instructions.
function HandleField({ platform, value, onChange, saved, onVerified }) {
  const { id, label } = platform;
  const { Icon } = styleFor(id);
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
      await verifyHandle(id);
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
        <label htmlFor={`handle-${id}`} className="text-[10px] text-gray-400 uppercase font-bold ml-1">{label} username</label>
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
          id={`handle-${id}`}
          type="text"
          value={value}
          onChange={onChange}
          className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 focus:border-white/30 focus:outline-none transition-all text-sm font-mono"
        />
      </div>

      {isSaved && saved.sync_error && (
        <p className="flex items-start gap-1.5 text-[11px] text-orange-300 ml-1" role="alert">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            We couldn&apos;t find this account on {label}. Check the spelling, then save.{" "}
            <a href={saved.profile_url} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
              Open it <ExternalLink className="w-3 h-3" />
            </a>
          </span>
        </p>
      )}

      {saved && !isSaved && value.trim() && (
        saved.handle ? (
          <p className="flex items-start gap-1.5 text-[11px] text-orange-300 ml-1" role="alert">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            Saving replaces <span className="font-bold">{saved.handle}</span>: its stats{saved.verified ? " and verified badge" : ""} will be reset.
          </p>
        ) : (
          <p className="text-[10px] text-gray-500 ml-1">Save changes to link this handle, then verify it.</p>
        )
      )}

      {isSaved && !saved.verified && (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Prove this is your account: add this code to {saved.verification_hint}, save it there, then click Verify.
            You can remove it afterwards.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-black/50 border border-white/10 rounded px-3 py-1.5 text-sm text-brand select-all">
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
  const college = useCollege();
  const platformList = college?.platforms ?? DEFAULT_PLATFORMS;
  const departments = college?.departments ?? [];

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState({});
  const [initial, setInitial] = useState(null); // form values as last loaded from the server // server-side handle info, by platform id

  const [formData, setFormData] = useState({ batch: "", department: "", handles: {} });

  const loadProfile = useCallback(async () => {
    const res = await getProfile();
    setSaved(res.data.handles);
    const loaded = {
      batch: res.data.batch ?? "",
      department: res.data.department || "",
      handles: Object.fromEntries(Object.entries(res.data.handles).map(([id, h]) => [id, h?.handle || ""])),
    };
    setFormData(loaded);
    setInitial(loaded);
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
  const setHandle = (id, value) => {
    setFormData({ ...formData, handles: { ...formData.handles, [id]: value } });
    setStatus("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      await updateProfile({
        batch: formData.batch === "" ? null : Number(formData.batch),
        department: formData.department || null,
        handles: formData.handles,
      });
      await loadProfile(); // stay on the page so new handles can be verified right away
      setStatus("Saved. Verify any new handle below to show the verified badge. Ratings refresh in a few hours.");
    } catch (err) {
      console.error(err);
      setStatus(err.response?.data?.error || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const dirty = !!initial && JSON.stringify({ ...formData, batch: String(formData.batch) }) !== JSON.stringify({ ...initial, batch: String(initial.batch) });
  const resets = Object.entries(formData.handles).filter(
    ([id, v]) => saved[id]?.handle && v.trim().toLowerCase() !== saved[id].handle.toLowerCase()
  ).length;

  if (initialLoading) return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><Loader2 className="animate-spin text-brand"/></div>;

  return (
    <main className="min-h-screen bg-dark-bg p-4 relative font-mono">
       <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-brand/5 rounded-full blur-[128px]" />
      </div>

      <SiteHeader back className="max-w-2xl mx-auto mb-6 pt-2" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl mx-auto bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl relative z-10"
      >
        <h1 className="text-2xl font-bold text-white mb-1">Profile Settings</h1>
        <p className="text-gray-500 text-xs mb-8">
          Update your personal info and coding handles.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* SECTION 1: College info */}
          <div className="space-y-4">
             <h2 className="text-xs font-bold text-white/50 uppercase tracking-widest border-b border-white/5 pb-2">
                College Info
             </h2>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="batch" className="text-[10px] text-brand-2 uppercase font-bold ml-1">Batch (graduation year)</label>
                  <div className="relative group">
                    <GraduationCap className="absolute left-3 top-3 w-4 h-4 text-gray-500 group-focus-within:text-brand-2 transition-colors" />
                    <input
                      id="batch"
                      type="number"
                      name="batch"
                      min="1990"
                      max="2100"
                      value={formData.batch}
                      onChange={handleChange}
                      placeholder="2027"
                      className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 focus:border-brand-2/50 focus:outline-none transition-all text-sm"
                    />
                  </div>
                </div>

                {departments.length > 0 && (
                  <div className="space-y-2">
                    <label htmlFor="department" className="text-[10px] text-pastel-green uppercase font-bold ml-1">Department</label>
                    <div className="relative group">
                      <Building2 className="absolute left-3 top-3 w-4 h-4 text-gray-500 group-focus-within:text-pastel-green transition-colors" />
                      <select
                        id="department"
                        name="department"
                        value={formData.department}
                        onChange={handleChange}
                        className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 focus:border-pastel-green/50 focus:outline-none transition-all text-sm"
                      >
                        <option value="">Not set</option>
                        {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                )}
             </div>
          </div>

          {/* SECTION 2: Platform Handles */}
          <div className="space-y-4">
             <h2 className="text-xs font-bold text-white/50 uppercase tracking-widest border-b border-white/5 pb-2">
                Linked Platforms
             </h2>
             <p className="text-[11px] text-gray-500">
                Changing a handle starts fresh: its stats and verification are reset.
             </p>

             <div className="space-y-6">
                {platformList.map((platform) => (
                  <HandleField
                    key={platform.id}
                    platform={platform}
                    value={formData.handles[platform.id] || ""}
                    onChange={(e) => setHandle(platform.id, e.target.value)}
                    saved={saved[platform.id]}
                    onVerified={loadProfile}
                  />
                ))}
             </div>
          </div>

          {status && <p className="text-xs text-gray-400" role="status">{status}</p>}

          <button
            type="submit"
            disabled={loading || !dirty}
            className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
            {dirty ? (resets ? `Save changes (resets ${resets} handle${resets > 1 ? "s" : ""})` : "Save changes") : "No changes to save"}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
