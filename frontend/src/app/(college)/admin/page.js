"use client";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, ShieldCheck, Users, Search, Ban, RotateCcw, Trash2, BadgeCheck, Save, ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";
import useRequireAuth from "@/store/useRequireAuth";
import {
  getProfile, getAdminStats, getAdminUsers, updateAdminUser, deleteAdminUser, getAdminCollege, updateAdminCollege,
} from "@/utils/api";
import useCollege from "@/utils/useCollege";
import { DEFAULT_PLATFORMS } from "@/utils/platforms";
import { DEFAULT_BRAND, HEX, colorProblem, hexToTriplet } from "@/utils/branding";
import CollegeLogo from "@/components/CollegeLogo";
import { timeAgo } from "@/utils/time";

const PAGE_SIZE = 25;
const errMsg = (err, fallback) => err.response?.data?.error || fallback;

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// One linked handle in the members table: verified badge, and a warning if syncing it keeps failing.
function Handle({ info }) {
  if (!info) return <span className="text-gray-600">-</span>;
  const problem = info.sync_error_kind === "not_found" || info.sync_failures >= 3;
  return (
    <span className="inline-flex items-center gap-1">
      {info.handle}
      {info.verified && <BadgeCheck className="w-3 h-3 text-pastel-green" title="Verified" />}
      {problem && (
        <AlertTriangle
          className="w-3 h-3 text-orange-400"
          title={`Sync problem: ${info.sync_error || "repeated failures"}`}
          aria-label={`Sync problem: ${info.sync_error || "repeated failures"}`}
        />
      )}
    </span>
  );
}

// --- College settings -------------------------------------------------------
const inputClass = "w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2 px-3 text-gray-200 focus:border-white/30 focus:outline-none text-sm";

// A color picker plus a hex box, with the same readability rule the server enforces.
function ColorField({ label, value, onChange, fallback }) {
  const problem = colorProblem(value, label);
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-gray-400 uppercase font-bold">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 shrink-0 rounded-md bg-transparent border border-white/10 cursor-pointer p-0.5"
        />
        <input
          className={`${inputClass} font-mono`}
          aria-label={`${label} hex`}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={`${fallback} (default)`}
          maxLength={7}
        />
      </div>
      {problem && <p className="text-[11px] text-orange-300" role="alert">{problem}</p>}
    </div>
  );
}

function CollegeSettings({ onError, onSaved }) {
  const [form, setForm] = useState(null);
  const [customDomain, setCustomDomain] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAdminCollege()
      .then((res) => {
        setCustomDomain(res.data.custom_domain);
        setForm({
          name: res.data.name,
          logo_url: res.data.logo_url || "",
          tagline: res.data.tagline || "",
          brand_primary: res.data.brand_primary || "",
          brand_secondary: res.data.brand_secondary || "",
          domains: res.data.email_domains.join(", "),
          departments: res.data.departments.join(", "),
          require_verified_handles: res.data.require_verified_handles,
        });
      })
      .catch((err) => onError(errMsg(err, "Failed to load college settings")));
  }, [onError]);

  if (!form) return <div className="h-40 bg-white/5 animate-pulse rounded-xl" />;

  const set = (patch) => { setForm({ ...form, ...patch }); setSaved(false); };
  const colorsInvalid = !!(colorProblem(form.brand_primary, "Primary color") || colorProblem(form.brand_secondary, "Secondary color"));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      await updateAdminCollege({
        name: form.name,
        logo_url: form.logo_url,
        tagline: form.tagline,
        brand_primary: form.brand_primary || null,
        brand_secondary: form.brand_secondary || null,
        email_domains: form.domains.split(",").map((d) => d.trim()).filter(Boolean),
        departments: form.departments.split(",").map((d) => d.trim()).filter(Boolean),
        require_verified_handles: form.require_verified_handles,
      });
      setSaved(true);
      onSaved?.(); // re-render the server layout so the new name/colors/logo apply right away
    } catch (err) {
      onError(errMsg(err, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  // Preview scoped to the unsaved colors: the brand classes read these CSS variables
  const previewStyle = {
    "--brand": hexToTriplet(form.brand_primary) || hexToTriplet(DEFAULT_BRAND.primary),
    "--brand-2": hexToTriplet(form.brand_secondary) || hexToTriplet(DEFAULT_BRAND.secondary),
  };

  return (
    <form onSubmit={save} className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-6">
      {/* Branding */}
      <section className="space-y-4">
        <h3 className="text-[11px] font-bold text-white/60 uppercase tracking-widest">Branding</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase font-bold">College name</label>
            <input className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase font-bold">Logo URL (optional)</label>
            <div className="flex items-center gap-3">
              <CollegeLogo key={form.logo_url} college={{ name: form.name, logo_url: form.logo_url }} size={36} />
              <input className={inputClass} value={form.logo_url} onChange={(e) => set({ logo_url: e.target.value })} placeholder="https://..." />
            </div>
            <p className="text-[10px] text-gray-500">A square image works best. Without one, your college&apos;s initials are shown.</p>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase font-bold">Tagline (optional)</label>
          <input className={inputClass} value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={120} placeholder="Competitive Programming Club" />
          <p className="text-[10px] text-gray-500">Shown under the leaderboard title. {form.tagline.length}/120</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <ColorField label="Primary color" value={form.brand_primary} onChange={(v) => set({ brand_primary: v })} fallback={DEFAULT_BRAND.primary} />
          <ColorField label="Secondary color" value={form.brand_secondary} onChange={(v) => set({ brand_secondary: v })} fallback={DEFAULT_BRAND.secondary} />
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div style={previewStyle} className="flex items-center gap-3 bg-dark-bg border border-white/10 rounded-lg px-4 py-3" aria-label="Preview">
            <CollegeLogo key={form.logo_url} college={{ name: form.name, logo_url: form.logo_url }} size={32} />
            <div>
              <p className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand-2 to-brand leading-tight">{form.name || "Your college"} Rankings</p>
              <p className="text-[11px] text-gray-500">{form.tagline || "/COMPETITIVE_PROGRAMMING /LEADERBOARD"}</p>
            </div>
            <span className="text-[10px] font-bold border border-brand/40 text-brand rounded px-1.5 py-0.5">Preview</span>
          </div>
          {(form.brand_primary || form.brand_secondary) && (
            <button type="button" onClick={() => set({ brand_primary: "", brand_secondary: "" })} className="text-xs text-gray-400 hover:text-white underline underline-offset-2">
              Reset colors to default
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-500">
          {customDomain
            ? <>Also served at <span className="text-gray-300">{customDomain}</span>.</>
            : <>Want your own address (e.g. cp.yourcollege.edu)? Ask the platform operator to set it up.</>}
        </p>
      </section>

      {/* Membership */}
      <section className="space-y-4">
        <h3 className="text-[11px] font-bold text-white/60 uppercase tracking-widest">Membership</h3>
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase font-bold">Allowed sign-up email domains</label>
          <input className={inputClass} value={form.domains} onChange={(e) => set({ domains: e.target.value })} placeholder="college.edu, alumni.college.edu" />
          <p className="text-[10px] text-gray-500">
            Comma-separated. Subdomains are included. {form.domains.trim() ? "" : "Empty means anyone can register."}
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase font-bold">Departments</label>
          <input className={inputClass} value={form.departments} onChange={(e) => set({ departments: e.target.value })} placeholder="Computer Science, Electronics, Mechanical" />
          <p className="text-[10px] text-gray-500">
            Comma-separated. Members pick one in their settings and the leaderboard can be filtered by it. Leave empty to turn departments off.
          </p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 accent-emerald-300"
            checked={form.require_verified_handles}
            onChange={(e) => set({ require_verified_handles: e.target.checked })}
          />
          <span className="text-xs text-gray-300">
            Only show verified handles on the leaderboard
            <span className="block text-[10px] text-gray-500">Members whose handle isn&apos;t verified are hidden until they verify it.</span>
          </span>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button disabled={saving || colorsInvalid} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save settings
        </button>
        {saved && <span className="text-xs text-pastel-green">Saved</span>}
      </div>
    </form>
  );
}

// --- Page ---------------------------------------------------------------------
export default function AdminPage() {
  const ready = useRequireAuth();
  const router = useRouter();
  const college = useCollege();
  const platformList = college?.platforms ?? DEFAULT_PLATFORMS;

  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [me, setMe] = useState(null);

  // Gate: only college admins may see this page (the API enforces it too).
  useEffect(() => {
    if (!ready) return;
    getProfile()
      .then((res) => {
        if (res.data.role !== "college_admin") router.replace("/");
        else setAuthorized(true);
      })
      .catch(() => router.replace("/"));
  }, [ready, router]);

  const loadStats = useCallback(
    () => getAdminStats().then((res) => setStats(res.data)).catch((err) => setError(errMsg(err, "Failed to load stats"))),
    []
  );

  const loadUsers = useCallback(async () => {
    try {
      const res = await getAdminUsers({ search: search || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      setUsers(res.data.users);
      setTotal(res.data.total);
    } catch (err) {
      setError(errMsg(err, "Failed to load members"));
    }
  }, [search, page]);

  useEffect(() => {
    if (!authorized) return;
    loadStats();
    getProfile().then((res) => setMe(res.data.email)).catch(() => {});
  }, [authorized, loadStats]);

  // Debounced so typing in search doesn't fire a request per keystroke
  useEffect(() => {
    if (!authorized) return;
    const t = setTimeout(loadUsers, 300);
    return () => clearTimeout(t);
  }, [authorized, loadUsers]);

  const act = async (user, fn, failMsg) => {
    setBusyId(user.user_id);
    setError("");
    try {
      await fn();
      await Promise.all([loadUsers(), loadStats()]);
    } catch (err) {
      setError(errMsg(err, failMsg));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = (u) => act(u, () => updateAdminUser(u.user_id, { is_active: !u.is_active }), "Action failed");
  const toggleRole = (u) =>
    act(u, () => updateAdminUser(u.user_id, { role: u.role === "college_admin" ? "student" : "college_admin" }), "Action failed");
  const remove = (u) => {
    if (!window.confirm(`Permanently remove ${u.username} (${u.email})? This deletes their account and stats.`)) return;
    act(u, () => deleteAdminUser(u.user_id), "Failed to remove user");
  };

  if (!authorized) {
    return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><Loader2 className="animate-spin text-brand" /></div>;
  }

  const verifiedTotal = stats ? stats.platforms.reduce((n, p) => n + p.verified, 0) : 0;
  const linkedTotal = stats ? stats.platforms.reduce((n, p) => n + p.linked, 0) : 0;
  const byPlatform = stats
    ? stats.platforms
        .map((p) => `${platformList.find((x) => x.id === p.platform)?.label ?? p.platform} ${p.verified}/${p.linked}`)
        .join(" · ")
    : "";
  const syncedAgo = stats?.sync?.last_synced_at ? timeAgo(stats.sync.last_synced_at) : null;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const btn = "px-2.5 py-1 rounded border text-[11px] font-bold transition-colors disabled:opacity-40 flex items-center gap-1";

  return (
    <main className="min-h-screen bg-dark-bg text-gray-200 font-mono p-4 md:p-8 relative">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <Link href="/" className="inline-flex items-center text-xs text-gray-500 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-3 h-3 mr-1" /> Back to Leaderboard
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-pastel-green" /> Admin Panel
          </h1>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg px-4 py-3" role="alert">{error}</div>
        )}

        {/* Overview */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Members" value={stats?.members.total ?? "–"} sub={stats && `${stats.members.active} active · ${stats.members.admins} admin`} />
          <StatCard label="Suspended" value={stats ? stats.members.total - stats.members.active : "–"} />
          <StatCard label="Verified handles" value={stats ? `${verifiedTotal}/${linkedTotal}` : "–"} sub={byPlatform || "verified / linked"} />
          <StatCard
            label="Sync issues"
            value={stats ? stats.sync.issues : "–"}
            sub={stats ? (syncedAgo ? `last sync ${syncedAgo}` : "no sync has run yet") : undefined}
          />
        </section>

        {/* College settings */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-white/50 uppercase tracking-widest">College settings</h2>
          <CollegeSettings onError={setError} onSaved={() => router.refresh()} />
        </section>

        {/* Members */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" /> Members ({total})
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search name or email..."
                className="bg-dark-bg/50 border border-white/10 rounded-lg py-2 pl-9 pr-3 text-xs text-gray-200 focus:border-white/30 focus:outline-none w-64"
              />
            </div>
          </div>

          <div className="border border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] text-gray-500 uppercase tracking-widest border-b border-white/10">
                  <th className="px-4 py-3">Member</th>
                  {platformList.map((p) => <th key={p.id} className="px-4 py-3">{p.label}</th>)}
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.email === me;
                  const busy = busyId === u.user_id;
                  return (
                    <motion.tr key={u.user_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-200">
                          {u.username}
                          {u.role === "college_admin" && (
                            <span className="ml-2 text-[9px] text-pastel-green border border-pastel-green/30 rounded px-1">ADMIN</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500">{u.email}</div>
                        {(u.department || u.batch) && (
                          <div className="text-[10px] text-gray-600 mt-0.5">{[u.department, u.batch && `Batch ${u.batch}`].filter(Boolean).join(" · ")}</div>
                        )}
                      </td>
                      {platformList.map((p) => (
                        <td key={p.id} className="px-4 py-3"><Handle info={u.handles?.[p.id]} /></td>
                      ))}
                      <td className="px-4 py-3">
                        {u.is_active
                          ? <span className="text-pastel-green">Active</span>
                          : <span className="text-red-400">Suspended</span>}
                      </td>
                      <td className="px-4 py-3">
                        {isMe ? (
                          <div className="text-right text-[11px] text-gray-600">You</div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button disabled={busy} onClick={() => toggleRole(u)} className={`${btn} border-white/10 text-gray-300 hover:border-white/30`}>
                              <ShieldCheck className="w-3 h-3" /> {u.role === "college_admin" ? "Remove admin" : "Make admin"}
                            </button>
                            <button disabled={busy} onClick={() => toggleActive(u)} className={`${btn} ${u.is_active ? "border-orange-400/30 text-orange-300 hover:border-orange-400/60" : "border-pastel-green/30 text-pastel-green hover:border-pastel-green/60"}`}>
                              {u.is_active ? <><Ban className="w-3 h-3" /> Suspend</> : <><RotateCcw className="w-3 h-3" /> Restore</>}
                            </button>
                            <button disabled={busy} onClick={() => remove(u)} className={`${btn} border-red-500/30 text-red-400 hover:border-red-500/60`} title="Remove permanently">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan={platformList.length + 3} className="px-4 py-10 text-center text-gray-500">No members found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-end gap-3 text-xs text-gray-500">
              <button disabled={page === 0} onClick={() => setPage(page - 1)} className={`${btn} border-white/10 text-gray-300`}>
                <ChevronLeft className="w-3 h-3" /> Prev
              </button>
              Page {page + 1} of {pages}
              <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className={`${btn} border-white/10 text-gray-300`}>
                Next <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
