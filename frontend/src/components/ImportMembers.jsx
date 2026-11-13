"use client";
import { useRef, useState } from "react";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, MinusCircle, Users } from "lucide-react";
import { importMembers } from "@/utils/api";
import { rosterFromCsv, templateCsv } from "@/utils/csv";

const MAX_ROWS = 1000; // keep in sync with the server

const STATUS = {
  ok: { label: "Ready", cls: "text-pastel-green border-pastel-green/30", Icon: CheckCircle2 },
  imported: { label: "Imported", cls: "text-pastel-green border-pastel-green/30", Icon: CheckCircle2 },
  exists: { label: "Already registered", cls: "text-gray-400 border-white/15", Icon: MinusCircle },
  error: { label: "Needs fixing", cls: "text-orange-300 border-orange-400/30", Icon: AlertTriangle },
};

// Pre-create members from a roster so students can just sign in with their email.
// Always previews first (a dry run); nothing is written until the admin confirms.
export default function ImportMembers({ platforms, onImported }) {
  const fileRef = useRef(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(null); // 'check' | 'import'
  const [error, setError] = useState("");
  const [notes, setNotes] = useState([]); // e.g. ignored columns
  const [result, setResult] = useState(null); // { summary, rows, dryRun }
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [parsedRows, setParsedRows] = useState(null);

  const reset = () => { setResult(null); setParsedRows(null); setError(""); setNotes([]); };

  const loadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    setText(await file.text());
    e.target.value = ""; // allow re-picking the same file
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv(platforms)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "members-template.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const check = async () => {
    reset();
    const parsed = rosterFromCsv(text, platforms);
    if (parsed.error) return setError(parsed.error);
    if (parsed.rows.length > MAX_ROWS) return setError(`This file has ${parsed.rows.length} rows. Import up to ${MAX_ROWS} at a time: split the file and import each part.`);
    if (parsed.unknownColumns.length) setNotes([`Ignored columns: ${parsed.unknownColumns.join(", ")}`]);
    setBusy("check");
    try {
      const res = await importMembers(parsed.rows, { dryRun: true });
      setParsedRows(parsed.rows);
      setResult({ ...res.data, dryRun: true });
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't check the file. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    setBusy("import");
    setError("");
    try {
      const res = await importMembers(parsedRows, { dryRun: false });
      setResult({ ...res.data, dryRun: false });
      onImported?.();
    } catch (err) {
      setError(err.response?.data?.error || "The import failed. Nothing was changed; try again.");
    } finally {
      setBusy(null);
    }
  };

  const rows = result ? (onlyProblems ? result.rows.filter((r) => r.status === "error") : result.rows) : [];
  const s = result?.summary;

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-gray-300">
          Add a whole class at once from a spreadsheet. Members aren&apos;t emailed: they sign in with their address
          like anyone else, and can verify their handles in Settings.
        </p>
        <p className="text-[11px] text-gray-500">
          Columns: <code className="text-gray-400">email</code> (required), <code className="text-gray-400">name</code>,{" "}
          <code className="text-gray-400">batch</code>, <code className="text-gray-400">department</code>
          {platforms.map((p) => <span key={p.id}>, <code className="text-gray-400">{p.id}</code></span>)}. Up to {MAX_ROWS} rows per import.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={loadFile} className="hidden" aria-label="Choose a CSV file" />
        <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-200 hover:border-white/30 flex items-center gap-2">
          <Upload className="w-3.5 h-3.5" /> Choose CSV file
        </button>
        <button type="button" onClick={downloadTemplate} className="text-xs text-gray-400 hover:text-white underline underline-offset-2 flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" /> Download template
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); reset(); }}
        rows={5}
        spellCheck={false}
        aria-label="CSV contents"
        placeholder={"…or paste rows here:\nemail,name,batch,department\nasha@college.edu,Asha Rao,2027,CSE"}
        className="w-full bg-dark-bg/50 border border-white/10 rounded-lg p-3 text-xs font-mono text-gray-200 focus:border-white/30 focus:outline-none"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={check} disabled={!text.trim() || busy} className="bg-white text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2 disabled:opacity-50">
          {busy === "check" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />} Check file
        </button>
        {result && (
          <button type="button" onClick={() => { setText(""); reset(); }} className="text-xs text-gray-400 hover:text-white underline underline-offset-2">Start over</button>
        )}
      </div>

      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
      {notes.map((n) => <p key={n} className="text-[11px] text-gray-500">{n}</p>)}

      {result && (
        <div className="space-y-3" data-testid="import-result">
          {result.dryRun ? (
            <p className="text-xs text-gray-300">
              <strong className="text-white">{s.ok}</strong> ready to import
              {s.exists > 0 && <> · <strong className="text-white">{s.exists}</strong> already registered (skipped)</>}
              {s.error > 0 && <> · <strong className="text-orange-300">{s.error}</strong> need fixing</>}
              <span className="text-gray-500"> · nothing has been added yet</span>
            </p>
          ) : (
            <p className="text-sm text-pastel-green flex items-center gap-2" role="status">
              <CheckCircle2 className="w-4 h-4" /> Imported {s.imported} member{s.imported === 1 ? "" : "s"}.
              <span className="text-gray-400 text-xs">They can sign in with their email address now.</span>
            </p>
          )}

          {s.error > 0 && (
            <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer w-fit">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="accent-orange-300" />
              Show only rows that need fixing
            </label>
          )}

          <div className="border border-white/10 rounded-lg overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-dark-card">
                <tr className="text-left text-[10px] text-gray-500 uppercase tracking-widest border-b border-white/10">
                  <th className="px-3 py-2">Line</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATUS[r.status] || STATUS.error;
                  return (
                    <tr key={r.line} className="border-b border-white/5 last:border-0 align-top">
                      <td className="px-3 py-2 text-gray-500">{r.line}</td>
                      <td className="px-3 py-2 text-gray-300 break-all">{r.email || <span className="text-gray-600">(empty)</span>}</td>
                      <td className="px-3 py-2 text-gray-400">{r.username || "–"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}><st.Icon className="w-3 h-3" /> {st.label}</span>
                        {r.message && r.status !== "exists" && <span className="block text-[11px] text-gray-400 mt-1">{r.message}</span>}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Nothing to show.</td></tr>}
              </tbody>
            </table>
          </div>

          {result.dryRun && (
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={confirm} disabled={s.ok === 0 || busy} className="bg-pastel-green text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-emerald-400 flex items-center gap-2 disabled:opacity-50">
                {busy === "import" && <Loader2 className="w-3 h-3 animate-spin" />} Import {s.ok} member{s.ok === 1 ? "" : "s"}
              </button>
              {s.error > 0 && s.ok > 0 && <span className="text-[11px] text-gray-500">Rows that need fixing are skipped. Fix them in your file and import again.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
