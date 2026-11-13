// Same-origin proxy to the backend API: the browser calls /api/..., this forwards to API_INTERNAL_URL.
// Why: Next.js bakes NEXT_PUBLIC_* values into the client bundle at BUILD time, so a prebuilt image
// couldn't be pointed at a different API address. Here the target is read at RUNTIME, and because
// the browser always uses a relative /api it works unchanged on every subdomain and custom domain
// (and needs no CORS).
export const dynamic = "force-dynamic";

import { apiInternalUrl } from "@/lib/api-url";

// Only what the API actually uses; nothing else from the browser is forwarded
const FORWARD = ["authorization", "content-type", "accept", "x-college-host", "x-college-slug", "x-forwarded-for", "x-real-ip"];

async function proxy(request, { params }) {
  const { path } = await params;
  const incoming = new URL(request.url);
  const target = `${apiInternalUrl()}/${path.map(encodeURIComponent).join("/")}${incoming.search}`;

  const headers = new Headers();
  for (const name of FORWARD) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Which college? Normally the browser says (X-College-Host). If it didn't (curl, scripts), use the host asked for.
  if (!headers.has("x-college-host") && !headers.has("x-college-slug")) {
    const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
    if (host) headers.set("x-college-host", host.replace(/:\d+$/, ""));
  }

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return Response.json({ error: "The API is unreachable" }, { status: 502 });
  }

  const out = new Headers();
  const type = upstream.headers.get("content-type");
  if (type) out.set("content-type", type);
  const retry = upstream.headers.get("retry-after");
  if (retry) out.set("retry-after", retry);
  return new Response(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
