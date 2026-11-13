import { Space_Mono } from "next/font/google";
import "./globals.css";
import { getCollege } from "@/lib/college-server";
import { themeCss } from "@/utils/branding";
import { CollegeProvider } from "@/utils/useCollege";
import { CollegeNotFound, ServiceUnavailable } from "@/components/CollegeFallback";

// Configure the font
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"], // Regular and Bold
  variable: "--font-space-mono", // Define a CSS variable
  display: "swap",
});

// The page title, description and favicon belong to the college the request is for.
export async function generateMetadata() {
  const result = await getCollege();
  if (result.status !== "ok") return { title: "Competitive Leaderboard", icons: { icon: "/favicon.ico" } };
  const c = result.college;
  return {
    title: `${c.name} Rankings`,
    description: c.tagline || `Competitive programming rankings for ${c.name}`,
    // The college's logo, or the platform default. (favicon.ico lives in public/ rather than
    // app/ so Next doesn't also auto-link it next to the logo.)
    icons: { icon: c.logo_url || "/favicon.ico" },
  };
}

export default async function RootLayout({ children }) {
  const result = await getCollege();
  const css = result.status === "ok" ? themeCss(result.college) : "";

  return (
    <html lang="en">
      <head>
        {/* The college's brand colors, in the first byte of HTML: no flash of default colors.
            themeCss only ever emits validated hex digits. */}
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      </head>
      <body className={`${spaceMono.variable} font-mono antialiased bg-dark-bg text-gray-200`}>
        {result.status === "ok" ? (
          <CollegeProvider college={result.college}>{children}</CollegeProvider>
        ) : result.status === "unknown" ? (
          <CollegeNotFound rootDomain={result.rootDomain} />
        ) : (
          <ServiceUnavailable />
        )}
      </body>
    </html>
  );
}
