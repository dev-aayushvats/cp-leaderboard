"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, LogOut, ExternalLink, Pencil, UserPlus, Power, AlertTriangle, ShieldCheck, Mail, KeyRound, ArrowRight } from "lucide-react";
import usePlatformStore from "@/store/usePlatformStore";
import {
  platformSendOtp, platformLogin, getPlatformConfig, listColleges, createCollege, updateCollege, addCollegeAdmin,
} from "@/utils/platformApi";

const errMsg = (err, fallback) => err.response?.data?.error || fallback;
const input = "w-full bg-dark-bg/50 border border-white/10 rounded-lg py-2 px-3 text-gray-200 focus:border-white/30 focus:outline-none text-sm";
const label = "text-[10px] text-gray-400 uppercase font-bold";
const btn = "px-2.5 py-1 rounded border text-[11px] font-bold transition-colors disabled:opacity-40 flex items-center gap-1";

// Where a college lives, from the address bar you're on now (keeps the port in dev)
function collegeAddress(slug, rootDomain) {
  const { protocol, port } = window.location;
  return `${protocol}//${slug}.${rootDomain || "localhost"}${port ? `:${port}` : ""}`;
}
const domainsOf = (text) => text.split(",").map((d) => d.trim()).filter(Boolean);

// --- Sign in ---------------------------------------------------------------------
function SignIn() {
  const signIn = usePlatformStore((s) => s.signIn);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await platformSendOtp(email); setStep(2); }
    catch (err) { setError(errMsg(err, "Couldn't send a code. Try again.")); }
    finally { setBusy(false); }
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { const res = await platformLogin(email, otp); signIn(res.data.token, res.data.email); }
    catch (err) { setError(errMsg(err, "Invalid or expired code.")); }
    finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-dark-bg flex items-center justify-center p-4 font-mono">
      <form onSubmit={step === 1 ? sendCode : verify} className="w-full max-w-sm bg-white/[0.02] border border-white/10 rounded-2xl p-8 space-y-5">
        <div className="text-center space-y-2">
          <ShieldCheck className="w-8 h-8 text-brand mx-auto" />
          <h1 className="text-2xl font-bold text-white">Platform console</h1>
          <p className="text-gray-500 text-xs">{step === 1 ? "For platform administrators" : `If ${email} is an administrator, a code is on its way`}</p>
        </div>
        {step === 1 ? (
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
            <input type="email" required autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="Email address" aria-label="Email address"
              className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 focus:border-white/30 outline-none text-sm" />
          </div>
        ) : (
          <div className="relative">
            <KeyRound className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
            <input required autoFocus maxLength={6} inputMode="numeric" value={otp} onChange={(e) => { setOtp(e.target.value); setError(""); }} placeholder="6-digit code" aria-label="Code"
              className="w-full bg-dark-bg/50 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-gray-200 focus:border-white/30 outline-none text-lg tracking-widest font-bold text-center" />
          </div>
        )}
        {error && <p className="text-xs text-red-300 text-center" role="alert">{error}</p>}
        <button disabled={busy} className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{step === 1 ? "Send code" : "Sign in"} <ArrowRight className="w-4 h-4" /></>}
        </button>
        {step === 2 && <button type="button" onClick={() => { setStep(1); setOtp(""); setError(""); }} className="w-full text-xs text-gray-500 hover:text-white">Use a different email</button>}
      </form>
    </main>
  );
}

// --- Create a college ----------------------------------------------------------------
function NewCollege({ rootDomain, onCreated }) {
  const empty = { slug: "", name: "", domains: "", custom_domain: "", admin_email: "", admin_name: "" };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => { setF({ ...f, ...patch }); setError(""); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await createCollege({
        slug: f.slug, name: f.name, email_domains: domainsOf(f.domains),
        custom_domain: f.custom_domain.trim() || null,
        admin_email: f.admin_email.trim() || undefined, admin_name: f.admin_name.trim() || undefined,
      });
      setF(empty); setOpen(false);
      onCreated(res.data);
    } catch (err) { setError(errMsg(err, "Couldn't create the college.")); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2">
        <Plus className="w-3.5 h-3.5" /> New college
      </button>
    );
  }
  const slugPreview = f.slug.trim().toLowerCase() || "name";
  return (
    <form onSubmit={submit} className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-4" aria-label="New college">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={label} htmlFor="nc-name">College name</label>
          <input id="nc-name" className={input} required value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Massachusetts Institute of Technology" />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="nc-slug">Address (subdomain)</label>
          <input id="nc-slug" className={`${input} font-mono`} required value={f.slug} onChange={(e) => set({ slug: e.target.value })} placeholder="mit" />
          <p className="text-[10px] text-gray-500 font-mono">{slugPreview}.{rootDomain || "localhost"}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={label} htmlFor="nc-domains">Allowed sign-up email domains</label>
          <input id="nc-domains" className={input} value={f.domains} onChange={(e) => set({ domains: e.target.value })} placeholder="mit.edu, alum.mit.edu" />
          <p className="text-[10px] text-gray-500">{f.domains.trim() ? "Comma-separated. Subdomains are included." : "Empty means anyone can register."}</p>
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="nc-custom">Custom domain (optional)</label>
          <input id="nc-custom" className={`${input} font-mono`} value={f.custom_domain} onChange={(e) => set({ custom_domain: e.target.value })} placeholder="cp.mit.edu" />
          <p className="text-[10px] text-gray-500">Its DNS must point at this platform.</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={label} htmlFor="nc-admin">First admin&apos;s email (optional)</label>
          <input id="nc-admin" type="email" className={input} value={f.admin_email} onChange={(e) => set({ admin_email: e.target.value })} placeholder="dean@mit.edu" />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="nc-admin-name">Their name (optional)</label>
          <input id="nc-admin-name" className={input} value={f.admin_name} onChange={(e) => set({ admin_name: e.target.value })} placeholder="Dean Smith" />
        </div>
      </div>
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
      <div className="flex items-center gap-3">
        <button disabled={busy} className="bg-pastel-green text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-emerald-400 flex items-center gap-2 disabled:opacity-60">
          {busy && <Loader2 className="w-3 h-3 animate-spin" />} Create college
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(""); }} className="text-xs text-gray-400 hover:text-white">Cancel</button>
      </div>
    </form>
  );
}

// --- One college ---------------------------------------------------------------------
function CollegeCard({ college, rootDomain, onChanged, onError }) {
  const [mode, setMode] = useState(null); // 'edit' | 'admin' | null
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: college.name, domains: college.email_domains.join(", "), custom: college.custom_domain || "" });
  const [admin, setAdmin] = useState({ email: "", name: "" });
  const [note, setNote] = useState("");
  const address = collegeAddress(college.slug, rootDomain);
  const id = (field) => `${college.slug}-${field}`; // unique per card, so every label points at its own input

  const run = async (fn, okNote) => {
    setBusy(true); onError(""); setNote("");
    try { await fn(); if (okNote) setNote(okNote); await onChanged(); return true; }
    catch (err) { onError(errMsg(err, "That didn't work.")); return false; }
    finally { setBusy(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    if (await run(() => updateCollege(college.slug, { name: form.name, email_domains: domainsOf(form.domains), custom_domain: form.custom.trim() || null }), "Saved.")) setMode(null);
  };
  const addAdmin = async (e) => {
    e.preventDefault();
    const email = admin.email.trim();
    if (await run(async () => {
      const res = await addCollegeAdmin(college.slug, { email, name: admin.name.trim() || undefined });
      setNote(res.data.action === "promoted" ? `${email} is now an admin.` : `Admin created. ${email} can sign in at ${address}/login with an emailed code.`);
    })) { setAdmin({ email: "", name: "" }); setMode(null); }
  };
  const toggleActive = () => {
    if (college.is_active && !window.confirm(`Take ${college.name} offline? Its address stops working for everyone until you reactivate it. No data is deleted.`)) return;
    run(() => updateCollege(college.slug, { is_active: !college.is_active }));
  };

  return (
    <article className={`border rounded-xl p-4 space-y-3 ${college.is_active ? "border-white/10 bg-white/[0.02]" : "border-orange-400/20 bg-orange-400/[0.03]"}`} data-college={college.slug}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-bold text-white flex items-center gap-2 flex-wrap">
            {college.name}
            {!college.is_active && <span className="text-[10px] font-bold text-orange-300 border border-orange-400/30 rounded px-1.5 py-0.5">OFFLINE</span>}
          </h3>
          <a href={`${address}/`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline inline-flex items-center gap-1 font-mono">
            {address.replace(/^https?:\/\//, "")} <ExternalLink className="w-3 h-3" />
          </a>
          {college.custom_domain && <p className="text-[11px] text-gray-500 font-mono">also {college.custom_domain}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMode(mode === "edit" ? null : "edit")} disabled={busy} className={`${btn} border-white/10 text-gray-300 hover:border-white/30`}><Pencil className="w-3 h-3" /> Edit</button>
          <button onClick={() => setMode(mode === "admin" ? null : "admin")} disabled={busy} className={`${btn} border-white/10 text-gray-300 hover:border-white/30`}><UserPlus className="w-3 h-3" /> Add admin</button>
          <button onClick={toggleActive} disabled={busy} className={`${btn} ${college.is_active ? "border-orange-400/30 text-orange-300 hover:border-orange-400/60" : "border-pastel-green/30 text-pastel-green hover:border-pastel-green/60"}`}>
            <Power className="w-3 h-3" /> {college.is_active ? "Take offline" : "Bring online"}
          </button>
        </div>
      </div>

      <dl className="grid sm:grid-cols-3 gap-3 text-xs">
        <div><dt className={label}>Members</dt><dd className="text-gray-200 mt-0.5">{college.members}</dd></div>
        <div>
          <dt className={label}>Sign-up</dt>
          <dd className="mt-0.5">
            {college.email_domains.length
              ? <span className="text-gray-300">{college.email_domains.map((d) => `@${d}`).join(", ")}</span>
              : <span className="inline-flex items-center gap-1 text-orange-300"><AlertTriangle className="w-3 h-3" /> Open to any email</span>}
          </dd>
        </div>
        <div>
          <dt className={label}>Admins</dt>
          <dd className="mt-0.5 text-gray-300 break-all">
            {college.admins.length ? college.admins.map((a) => a.email).join(", ") : <span className="inline-flex items-center gap-1 text-orange-300"><AlertTriangle className="w-3 h-3" /> None yet</span>}
          </dd>
        </div>
      </dl>

      {mode === "edit" && (
        <form onSubmit={save} className="grid md:grid-cols-3 gap-3 pt-3 border-t border-white/5" aria-label={`Edit ${college.name}`}>
          <div className="space-y-1"><label className={label} htmlFor={id("name")}>Name</label><input id={id("name")} className={input} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><label className={label} htmlFor={id("domains")}>Email domains</label><input id={id("domains")} className={input} value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} placeholder="empty = open" /></div>
          <div className="space-y-1"><label className={label} htmlFor={id("custom")}>Custom domain</label><input id={id("custom")} className={`${input} font-mono`} value={form.custom} onChange={(e) => setForm({ ...form, custom: e.target.value })} placeholder="cp.college.edu" /></div>
          <div className="md:col-span-3 flex gap-3"><button disabled={busy} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-60">Save</button><button type="button" onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button></div>
        </form>
      )}
      {mode === "admin" && (
        <form onSubmit={addAdmin} className="grid md:grid-cols-3 gap-3 pt-3 border-t border-white/5" aria-label={`Add admin to ${college.name}`}>
          <div className="space-y-1 md:col-span-2"><label className={label} htmlFor={id("admin-email")}>Email</label><input id={id("admin-email")} type="email" required className={input} value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} placeholder="dean@college.edu" /></div>
          <div className="space-y-1"><label className={label} htmlFor={id("admin-name")}>Name (optional)</label><input id={id("admin-name")} className={input} value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></div>
          <div className="md:col-span-3 flex gap-3"><button disabled={busy} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-60">Make admin</button><button type="button" onClick={() => setMode(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button></div>
        </form>
      )}
      {note && <p className="text-xs text-pastel-green" role="status">{note}</p>}
    </article>
  );
}

// --- Console ----------------------------------------------------------------------------
function Console() {
  const { email, signOut } = usePlatformStore();
  const [colleges, setColleges] = useState(null);
  const [rootDomain, setRootDomain] = useState(null);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  const load = useCallback(
    () => listColleges()
      .then((res) => setColleges(res.data))
      .catch((err) => { if (err.response?.status !== 401) setError(errMsg(err, "Couldn't load colleges.")); }),
    []
  );

  useEffect(() => {
    getPlatformConfig().then((res) => setRootDomain(res.data.root_domain)).catch(() => {});
    load();
  }, [load]);

  const onCreated = async ({ college, admin }) => {
    setCreated({ college, admin });
    await load();
  };

  return (
    <main className="min-h-screen bg-dark-bg text-gray-200 font-mono p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-brand" /> Platform console</h1>
            <p className="text-xs text-gray-500 mt-1">Signed in as {email}</p>
          </div>
          <button onClick={signOut} className={`${btn} border-white/10 text-gray-300 hover:border-white/30`}><LogOut className="w-3 h-3" /> Sign out</button>
        </header>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-lg px-4 py-3" role="alert">{error}</div>}

        {created && (
          <div className="bg-pastel-green/5 border border-pastel-green/30 rounded-xl p-4 text-xs space-y-1" role="status">
            <p className="text-pastel-green font-bold">{created.college.name} is live.</p>
            <p className="text-gray-300">
              Address: <a className="underline" href={`${collegeAddress(created.college.slug, rootDomain)}/`} target="_blank" rel="noopener noreferrer">{collegeAddress(created.college.slug, rootDomain)}</a>
            </p>
            {created.admin && <p className="text-gray-400">{created.admin.email} can sign in there with an emailed code{created.admin.action === "promoted" ? " (promoted from member)" : ""}.</p>}
            {!created.admin && <p className="text-orange-300">No admin yet. Use &quot;Add admin&quot; on the college below.</p>}
          </div>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-xs font-bold text-white/50 uppercase tracking-widest">Colleges {colleges && `(${colleges.length})`}</h2>
          </div>
          <NewCollege rootDomain={rootDomain} onCreated={onCreated} />
          {!colleges ? (
            <div className="h-32 bg-white/5 animate-pulse rounded-xl" />
          ) : colleges.length === 0 ? (
            <p className="text-gray-500 text-sm">No colleges yet.</p>
          ) : (
            <div className="space-y-3">
              {colleges.map((c) => <CollegeCard key={c.slug} college={c} rootDomain={rootDomain} onChanged={load} onError={setError} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function PlatformConsole() {
  const token = usePlatformStore((s) => s.token);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.resolve(usePlatformStore.persist.rehydrate()).then(() => setReady(true));
  }, []);

  if (!ready) return <div className="min-h-screen bg-dark-bg flex items-center justify-center"><Loader2 className="animate-spin text-brand" /></div>;
  return token ? <Console /> : <SignIn />;
}
