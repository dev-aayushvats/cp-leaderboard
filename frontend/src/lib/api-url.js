// Where this app's SERVER reaches the backend API (used by the /api proxy and by server-side
// rendering, so the two can never disagree):
//   1. API_INTERNAL_URL (runtime)       e.g. http://api:5000 in docker
//   2. NEXT_PUBLIC_API_BASE_URL, if it's an absolute URL
//   3. http://localhost:5000
export function apiInternalUrl() {
  const strip = (u) => u.replace(/\/$/, "");
  if (process.env.API_INTERNAL_URL) return strip(process.env.API_INTERNAL_URL);
  const pub = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  if (/^https?:/.test(pub)) return strip(pub);
  return "http://localhost:5000";
}
