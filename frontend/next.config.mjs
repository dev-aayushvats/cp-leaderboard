/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Docker image builds a self-contained server (NEXT_OUTPUT=standalone); normal builds are unaffected.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
  // Development only: origins allowed to load the dev server. *.localhost lets you open
  // http://mit.localhost:3000 to try subdomain routing; add a college's custom domain via
  // ALLOWED_DEV_ORIGINS=cp.college.edu (comma-separated) to try that locally too.
  allowedDevOrigins: ["*.localhost", ...(process.env.ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])],
};

export default nextConfig;
