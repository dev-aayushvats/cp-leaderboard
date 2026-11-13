// Roster CSV -> import rows. Parsed in the browser (the server only ever sees JSON rows).
// Tolerates what spreadsheets actually export: quoted cells with commas/newlines/"" escapes,
// CRLF line endings, a UTF-8 BOM, ';' or tab delimiters (some locales), blank lines, and
// a bare list of emails with no header.

// -> [{ cells: string[], line }] where `line` is the row's physical line in the file, so
// error messages point at the spreadsheet row the admin is actually looking at
// (blank lines and multi-line cells are counted).
function parseCsvLines(text) {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  // Delimiter: whichever of , ; tab appears most in the first line
  const first = src.split(/\r?\n/, 1)[0] || "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length - 1]).sort((a, b) => b[1] - a[1])[0][0];

  const rows = [];
  let row = [], cell = "", quoted = false, started = false;
  let line = 1, rowLine = null;
  const endCell = () => { row.push(cell); cell = ""; started = false; };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "")) rows.push({ cells: row, line: rowLine ?? line });
    row = []; rowLine = null;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (rowLine === null && ch !== "\n" && ch !== "\r") rowLine = line;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else {
        if (ch === "\n" || (ch === "\r" && src[i + 1] !== "\n")) line++;
        cell += ch;
      }
    } else if (ch === '"' && !started) {
      quoted = true; started = true;
    } else if (ch === delim) {
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
      line++;
    } else {
      cell += ch; started = true;
    }
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

export const parseCsv = (text) => parseCsvLines(text).map((r) => r.cells);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

const FIELD_ALIASES = {
  email: ["email", "emailaddress", "mail", "emailid", "collegeemail"],
  name: ["name", "fullname", "displayname", "username", "student", "studentname"],
  batch: ["batch", "year", "graduationyear", "passoutyear", "gradyear"],
  department: ["department", "dept", "branch", "stream"],
};

// platforms: [{ id, label }]. -> { rows, unknownColumns, error }
export function rosterFromCsv(text, platforms = []) {
  const parsed = parseCsvLines(text);
  const table = parsed.map((r) => r.cells);
  if (table.length === 0) return { rows: [], unknownColumns: [], error: "The file is empty." };

  const headerCells = table[0].map(norm);
  const columnOf = (aliases) => headerCells.findIndex((h) => aliases.includes(h));
  let emailCol = columnOf(FIELD_ALIASES.email);

  // No header, just emails (optionally followed by a name): first cell is an address
  if (emailCol === -1 && looksLikeEmail(table[0][0])) {
    return {
      rows: table.map((r, i) => ({ line: parsed[i].line, email: r[0].trim(), name: (r[1] || "").trim() })),
      unknownColumns: [],
      error: null,
    };
  }
  if (emailCol === -1) return { rows: [], unknownColumns: [], error: 'No "email" column found. The first row should be a header like: email,name,batch,department' };

  const cols = {
    name: columnOf(FIELD_ALIASES.name),
    batch: columnOf(FIELD_ALIASES.batch),
    department: columnOf(FIELD_ALIASES.department),
  };
  // Platform columns: header mentions the platform ("leetcode", "LeetCode username", ...)
  const platformCols = platforms
    .map((p) => ({ id: p.id, col: headerCells.findIndex((h) => h.includes(norm(p.id)) || h.includes(norm(p.label))) }))
    .filter((p) => p.col !== -1);

  const known = new Set([emailCol, ...Object.values(cols), ...platformCols.map((p) => p.col)]);
  const unknownColumns = table[0].map((h, i) => (known.has(i) || h.trim() === "" ? null : h.trim())).filter(Boolean);

  const cell = (r, i) => (i === -1 ? "" : (r[i] ?? "").trim());
  const rows = table.slice(1).map((r, i) => ({
    line: parsed[i + 1].line, // physical line in the file
    email: cell(r, emailCol),
    name: cell(r, cols.name),
    batch: cell(r, cols.batch),
    department: cell(r, cols.department),
    handles: Object.fromEntries(platformCols.map((p) => [p.id, cell(r, p.col)])),
  }));
  return { rows, unknownColumns, error: rows.length === 0 ? "The file has a header but no rows." : null };
}

export function templateCsv(platforms = []) {
  const handles = platforms.map((p) => p.id);
  const header = ["email", "name", "batch", "department", ...handles].join(",");
  const example = ["student@college.edu", "Asha Rao", "2027", "Computer Science", ...handles.map((id, i) => (i === 0 ? "asha_rao" : ""))].join(",");
  return `${header}\n${example}\n`;
}
