import { getCollege } from "@/lib/college-server";
import { CollegeProvider } from "@/utils/useCollege";
import { CollegeNotFound, ServiceUnavailable } from "@/components/CollegeFallback";

// Every college page (leaderboard, profiles, sign-in, settings, admin) needs to know which
// college the hostname belongs to. This is where that's decided; the platform console
// (/platform) lives outside this group and doesn't need a college.
export default async function CollegeLayout({ children }) {
  const result = await getCollege();
  if (result.status === "ok") return <CollegeProvider college={result.college}>{children}</CollegeProvider>;
  if (result.status === "unknown") return <CollegeNotFound rootDomain={result.rootDomain} />;
  return <ServiceUnavailable />;
}
