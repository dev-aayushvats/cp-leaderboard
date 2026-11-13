// "3h ago", "2d ago" for an ISO timestamp. Returns null for missing/invalid input.
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return null;
  // Server timestamps are UTC without a zone suffix.
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
