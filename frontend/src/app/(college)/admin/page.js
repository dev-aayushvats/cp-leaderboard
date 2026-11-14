"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Loader2, ShieldCheck, Users, Search, Copy, Check, Download, Link2, X, Upload, Ban, RotateCcw, Trash2, BadgeCheck, Save, ChevronLeft, ChevronRight, AlertTriangle,
} from "lucide-react";
import useRequireAuth from "@/store/useRequireAuth";
import {
  getProfile, getAdminStats, getAdminUsers, updateAdminUser, deleteAdminUser, getAdminCollege, updateAdminCollege,
  uploadCollegeLogo, removeCollegeLogo,
} from "@/utils/api";
import useCollege from "@/utils/useCollege";
import { DEFAULT_PLATFORMS } from "@/utils/platforms";
import { DEFAULT_BRAND, HEX, colorProblem, hexToTriplet } from "@/utils/branding";
import { sharedSuffixProblem } from "@/utils/domains";
import CollegeLogo from "@/components/CollegeLogo";
import SiteHeader from "@/components/SiteHeader";
import ImportMembers from "@/components/ImportMembers";
import { timeAgo } from "@/utils/time";

const PAGE_SIZE = 25;
const NO_FILTERS = { role: "", status: "", batch: "", department: "", problem: "" };
// Only send what is set; empty strings would be ignored by the API anyway
const activeFilters = (search, f) => ({ search: search || undefined, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
const errMsg = (err, fallback) => err.response?.data?.error || fallback;

function StatCard({ label, value, sub, onClick, hint }) {
  const body = (
    <>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </>
  );
  const base = "bg-white/[0.03] border border-white/10 rounded-xl p-4 text-left";
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button onClick={onClick} aria-label={`${label}: ${hint}`} title={hint} className={`${base} flex flex-col items-start justify-start hover:border-white/30 hover:bg-white/[0.06] transition-colors`}>
      {body}
    </button>
  );
}

// Invite link for the college: what an admin pastes into a group chat. Uses the address this page
// is served from, so it is right for subdomains and custom domains alike.
function ShareCard({ college }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setUrl(window.location.origin); }, []);
  const domains = college?.email_domains ?? [];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the link is selectable */ }
  };
  return (
    <div className="flex items-center gap-3 flex-wrap bg-brand/5 border border-brand/20 rounded-xl px-4 py-3">
      <Link2 className="w-4 h-4 text-brand shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Your college link</p>
        <p className="text-sm text-gray-200 break-all select-all">{url || "…"}</p>
        <p className="text-[11px] text-gray-500">
          {domains.length ? `Students sign up with a ${domains.map((d) => "@" + d).join(" or ")} address.` : "Registration is open to any email address."}
        </p>
      </div>
      <button onClick={copy} disabled={!url} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/15 text-xs font-bold text-gray-200 hover:border-white/40 transition-colors">
        {copied ? <><Check className="w-3.5 h-3.5 text-pastel-green" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
      </button>
    </div>
  );
}

const csvCell = (v) => {
  let t = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // stop spreadsheets from running a cell as a formula
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

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
  const [initial, setInitial] = useState(null);
  const [customDomain, setCustomDomain] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // The uploaded logo is saved the moment it is chosen (it is not part of the "unsaved changes" form)
  const [logoVersion, setLogoVersion] = useState(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoNote, setLogoNote] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    getAdminCollege()
      .then((res) => {
        setCustomDomain(res.data.custom_domain);
        setLogoVersion(res.data.logo_version);
        const loaded = {
          name: res.data.name,
          logo_url: res.data.logo_url || "",
          tagline: res.data.tagline || "",
          brand_primary: res.data.brand_primary || "",
          brand_secondary: res.data.brand_secondary || "",
          domains: res.data.email_domains.join(", "),
          departments: res.data.departments.join(", "),
          require_verified_handles: res.data.require_verified_handles,
        };
        setForm(loaded);
        setInitial(loaded);
      })
      .catch((err) => onError(errMsg(err, "Failed to load college settings")));
  }, [onError]);

  if (!form) return <div className="h-40 bg-white/5 animate-pulse rounded-xl" />;

  const set = (patch) => { setForm({ ...form, ...patch }); setSaved(false); };
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  // What the site shows right now: the uploaded image if there is one, otherwise the pasted URL
  const shownLogo = logoVersion ? `/api/college/logo?v=${logoVersion}` : form.logo_url;

  const changeLogo = async (file) => {
    if (!file) return;
    setLogoNote("");
    if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) { onError("Choose a PNG, JPEG, GIF, WebP or SVG image."); return; }
    if (file.size > 512 * 1024) { onError(`That image is ${Math.round(file.size / 1024)} KB. The limit is 512 KB.`); return; }
    setLogoBusy(true);
    onError("");
    try {
      const res = await uploadCollegeLogo(file);
      setLogoVersion(res.data.logo_version);
      setLogoNote("Logo uploaded.");
      onSaved?.();
    } catch (err) {
      onError(errMsg(err, "Failed to upload the logo"));
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const dropLogo = async () => {
    setLogoBusy(true);
    onError("");
    setLogoNote("");
    try {
      const res = await removeCollegeLogo();
      setLogoVersion(res.data.logo_version);
      setLogoNote("Uploaded logo removed.");
      onSaved?.();
    } catch (err) {
      onError(errMsg(err, "Failed to remove the logo"));
    } finally {
      setLogoBusy(false);
    }
  };
  const colorsInvalid = !!(colorProblem(form.brand_primary, "Primary color") || colorProblem(form.brand_secondary, "Secondary color"));
  const domainIssue = sharedSuffixProblem(form.domains);

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
      setInitial(form);
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
          <div className="space-y-2">
            <label className="text-[10px] text-gray-400 uppercase font-bold">Logo / icon (optional)</label>
            <div className="flex items-center gap-3">
              <CollegeLogo key={shownLogo} college={{ name: form.name, logo_url: shownLogo }} size={48} />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  className="sr-only"
                  id="logo-file"
                  onChange={(e) => changeLogo(e.target.files?.[0])}
                />
                <label
                  htmlFor="logo-file"
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/15 text-xs font-bold text-gray-200 hover:border-white/40 cursor-pointer transition-colors focus-within:ring-1 focus-within:ring-white/40 ${logoBusy ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {logoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {logoVersion ? "Replace image" : "Upload image"}
                </label>
                {logoVersion && (
                  <button type="button" onClick={dropLogo} disabled={logoBusy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/30 text-xs font-bold text-red-300 hover:border-red-500/60 disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-gray-500" role="status">
              {logoNote || "PNG, JPEG, GIF, WebP or SVG, up to 512 KB. A square image works best. Without a logo, your college's initials are shown."}
            </p>
            <div className="space-y-1 pt-1">
              <label htmlFor="logo-url" className="text-[10px] text-gray-500">Or use an image from a web address</label>
              <input id="logo-url" className={inputClass} value={form.logo_url} onChange={(e) => set({ logo_url: e.target.value })} placeholder="https://..." />
              {logoVersion && form.logo_url && <p className="text-[10px] text-orange-300">The uploaded image is shown. Remove it to use this address.</p>}
            </div>
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
            <CollegeLogo key={shownLogo} college={{ name: form.name, logo_url: shownLogo }} size={32} />
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
          {domainIssue && <p className="text-[11px] text-orange-300" role="alert">{domainIssue}</p>}
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

      {/* Pinned to the bottom of the screen while there is something to save */}
      <div
        className={`sticky bottom-4 z-40 flex items-center justify-between gap-3 flex-wrap rounded-xl border px-4 py-3 shadow-xl backdrop-blur ${
          dirty ? "bg-[#161616]/95 border-brand/40" : "bg-transparent border-transparent shadow-none"
        }`}
      >
        {dirty ? (
          <>
            <span className="text-xs text-gray-300">
              {colorsInvalid ? "Fix the highlighted colors to save." : domainIssue ? "Fix the email domains to save." : "You have unsaved changes."}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setForm(initial); setSaved(false); }} disabled={saving}
                className="text-xs font-bold px-3 py-2 rounded-lg border border-white/15 text-gray-300 hover:border-white/40 disabled:opacity-50">
                Discard
              </button>
              <button disabled={saving || colorsInvalid || !!domainIssue} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save settings
              </button>
            </div>
          </>
        ) : (
          <span className="text-xs text-pastel-green min-h-[2rem] flex items-center">{saved ? "Saved" : ""}</span>
        )}
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
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ role: "", status: "", batch: "", department: "", problem: "" });
  const [exporting, setExporting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("members");

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
      const res = await getAdminUsers({ ...activeFilters(search, filters), limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      setUsers(res.data.users);
      setTotal(res.data.total);
      setUsersLoaded(true);
    } catch (err) {
      setError(errMsg(err, "Failed to load members"));
    }
  }, [search, filters, page]);

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

  const changeFilter = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(0); };
  const jumpTo = (patch) => { setFilters({ ...NO_FILTERS, ...patch }); setSearch(""); setPage(0); setTab("members"); };
  const filterCount = Object.values(filters).filter(Boolean).length;

  const exportCsv = async () => {
    setExporting(true);
    setError("");
    try {
      const rows = [];
      for (let offset = 0; ; offset += 200) {
        const res = await getAdminUsers({ ...activeFilters(search, filters), limit: 200, offset });
        rows.push(...res.data.users);
        if (rows.length >= res.data.total || res.data.users.length === 0) break;
      }
      const head = ["email", "name", "role", "status", "batch", "department", ...platformList.flatMap((p) => [p.id, `${p.id}_verified`])];
      const lines = [head, ...rows.map((u) => [
        u.email, u.username, u.role === "college_admin" ? "admin" : "student", u.is_active ? "active" : "suspended", u.batch ?? "", u.department ?? "",
        ...platformList.flatMap((p) => [u.handles?.[p.id]?.handle ?? "", u.handles?.[p.id] ? (u.handles[p.id].verified ? "yes" : "no") : ""]),
      ])];
      const blob = new Blob(["\uFEFF" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(errMsg(err, "Export failed"));
    } finally {
      setExporting(false);
    }
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
        <SiteHeader back />
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-pastel-green" /> Admin Panel
        </h1>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg px-4 py-3" role="alert">{error}</div>
        )}

        <ShareCard college={college} />

        {/* Overview */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Members" value={stats?.members.total ?? "–"} sub={stats && `${stats.members.active} active · ${stats.members.admins} admin`} onClick={() => jumpTo({})} hint="show all members" />
          <StatCard label="Suspended" value={stats ? stats.members.total - stats.members.active : "–"} onClick={() => jumpTo({ status: "suspended" })} hint="show suspended members" />
          <StatCard label="Verified handles" value={stats ? `${verifiedTotal}/${linkedTotal}` : "–"} sub={byPlatform || "verified / linked"} />
          <StatCard
            label="Sync issues"
            value={stats ? stats.sync.issues : "–"}
            sub={stats ? (syncedAgo ? `last sync ${syncedAgo}` : "no sync has run yet") : undefined}
            onClick={() => jumpTo({ problem: "1" })}
            hint="show members with sync issues"
          />
        </section>

        {/* Tabs */}
        <div role="tablist" className="flex overflow-x-auto bg-white/5 p-1 rounded-lg border border-white/5 [scrollbar-width:none]">
          {[["members", `Members${stats ? ` (${stats.members.total})` : ""}`], ["settings", "Settings"], ["import", "Import"]].map(([id, text]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 md:flex-none whitespace-nowrap px-5 py-2 rounded-md text-sm font-bold transition-colors ${tab === id ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
            >
              {text}
            </button>
          ))}
        </div>

        {tab === "settings" && <CollegeSettings onError={setError} onSaved={() => router.refresh()} />}

        {tab === "import" && <ImportMembers platforms={platformList} onImported={() => { loadUsers(); loadStats(); }} />}

        {tab === "members" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" /> Members ({total})
            </h2>
            <button onClick={exportCsv} disabled={exporting || total === 0} className={`${btn} border-white/10 text-gray-300 hover:border-white/30 md:order-last`}>
              {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Export CSV
            </button>
            <div className="relative w-full md:w-auto">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search name or email..."
                className="bg-dark-bg/50 border border-white/10 rounded-lg py-2 pl-9 pr-3 text-xs text-gray-200 focus:border-white/30 focus:outline-none w-full md:w-64"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["role", "All roles", [["student", "Students"], ["college_admin", "Admins"]]],
              ["status", "Any status", [["active", "Active"], ["suspended", "Suspended"]]],
              ...((college?.batches ?? []).length ? [["batch", "All batches", college.batches.map((b) => [String(b), `Batch of ${b}`])]] : []),
              ...((college?.departments ?? []).length ? [["department", "All departments", college.departments.map((d) => [d, d])]] : []),
            ].map(([key, all, options]) => (
              <select
                key={key}
                value={filters[key]}
                onChange={(e) => changeFilter({ [key]: e.target.value })}
                aria-label={all.replace(/^All |^Any /, "Filter by ")}
                className={`bg-dark-bg/50 border rounded-lg py-1.5 pl-3 text-xs text-gray-200 focus:outline-none focus:border-white/30 ${filters[key] ? "border-brand/50" : "border-white/10"}`}
              >
                <option value="">{all}</option>
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <button
              onClick={() => changeFilter({ problem: filters.problem ? "" : "1" })}
              aria-pressed={!!filters.problem}
              className={`${btn} ${filters.problem ? "border-orange-400/50 text-orange-300 bg-orange-400/10" : "border-white/10 text-gray-400 hover:border-white/30"}`}
            >
              <AlertTriangle className="w-3 h-3" /> Sync issues
            </button>
            {(filterCount > 0 || search) && (
              <button onClick={() => { setFilters(NO_FILTERS); setSearch(""); setPage(0); }} className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1 underline underline-offset-2">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          {/* Phones: one card per member */}
          <div className="md:hidden space-y-3">
            {users.map((u) => {
              const isMe = u.email === me;
              const busy = busyId === u.user_id;
              return (
                <div key={u.user_id} className="border border-white/10 rounded-xl p-4 bg-white/[0.02] space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-gray-200 text-sm truncate">
                        {u.username}
                        {u.role === "college_admin" && <span className="ml-2 text-[10px] text-pastel-green border border-pastel-green/30 rounded px-1.5 py-px">ADMIN</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{u.email}</div>
                      {(u.department || u.batch) && (
                        <div className="text-[10px] text-gray-600 mt-0.5">{[u.department, u.batch && `Batch ${u.batch}`].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                    <span className={`text-[11px] shrink-0 ${u.is_active ? "text-pastel-green" : "text-red-400"}`}>{u.is_active ? "Active" : "Suspended"}</span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-[11px]">
                    {platformList.map((p) => (
                      <div key={p.id}>
                        <dt className="text-[10px] text-gray-500 uppercase tracking-widest">{p.label}</dt>
                        <dd className="text-gray-300 truncate"><Handle info={u.handles?.[p.id]} /></dd>
                      </div>
                    ))}
                  </dl>
                  {isMe ? (
                    <p className="text-[11px] text-gray-600">This is you</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy} onClick={() => toggleRole(u)} className={`${btn} border-white/10 text-gray-300 hover:border-white/30`}>
                        <ShieldCheck className="w-3 h-3" /> {u.role === "college_admin" ? "Remove admin" : "Make admin"}
                      </button>
                      <button disabled={busy} onClick={() => toggleActive(u)} className={`${btn} ${u.is_active ? "border-orange-400/30 text-orange-300" : "border-pastel-green/30 text-pastel-green"}`}>
                        {u.is_active ? <><Ban className="w-3 h-3" /> Suspend</> : <><RotateCcw className="w-3 h-3" /> Restore</>}
                      </button>
                      <button disabled={busy} onClick={() => remove(u)} className={`${btn} border-red-500/30 text-red-400`} aria-label={`Remove ${u.username}`}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {!usersLoaded && <div className="h-24 bg-white/5 animate-pulse rounded-xl" />}
            {usersLoaded && users.length === 0 && <p className="px-4 py-10 text-center text-gray-500 text-xs">{filterCount > 0 || search ? "No members match these filters." : "No members found."}</p>}
          </div>

          <div className="hidden md:block border border-white/10 rounded-xl overflow-x-auto">
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
                            <span className="ml-2 text-[10px] text-pastel-green border border-pastel-green/30 rounded px-1.5 py-px">ADMIN</span>
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
                {usersLoaded && users.length === 0 && (
                  <tr><td colSpan={platformList.length + 3} className="px-4 py-10 text-center text-gray-500">{filterCount > 0 || search ? "No members match these filters." : "No members found."}</td></tr>
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
        )}
      </div>
    </main>
  );
}
