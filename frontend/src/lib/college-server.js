import { cache } from "react";
import { headers } from "next/headers";

// Server-side only: resolves which college the *current request* is for, from its hostname.
// Memoised per request, so the layout and generateMetadata share one API call.
// Uses API_INTERNAL_URL when the server reaches the API on a different address than
// browsers do (e.g. a docker network); otherwise the public API URL.
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
const PINNED_SLUG = process.env.NEXT_PUBLIC_COLLEGE_SLUG || "";

export const getCollege = cache(async () => {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim().replace(/:\d+$/, "");
  try {
    const res = await fetch(`${API_URL}/college`, {
      headers: { "X-College-Host": host, ...(PINNED_SLUG ? { "X-College-Slug": PINNED_SLUG } : {}) },
      cache: "no-store", // branding changes must show immediately after an admin saves
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      return { status: "unknown", rootDomain: body.root_domain || null };
    }
    if (!res.ok) return { status: "error" };
    return { status: "ok", college: await res.json() };
  } catch {
    return { status: "error" };
  }
});
