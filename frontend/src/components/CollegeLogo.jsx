"use client";
import { useState } from "react";

// The college's logo, or (no logo / it fails to load) a badge with its initials in the brand colors.
export default function CollegeLogo({ college, size = 36, className = "" }) {
  // Failure is tracked per URL, so changing the logo gives the new one a fresh chance
  const [failedUrl, setFailedUrl] = useState(null);
  const failed = failedUrl === college?.logo_url;
  const style = { width: size, height: size };

  if (college?.logo_url && !failed) {
    return (
      // A plain <img>: logos are arbitrary admin-supplied URLs, which next/image would need allow-listed.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={college.logo_url}
        alt={`${college.name} logo`}
        style={style}
        className={`object-contain rounded-md shrink-0 ${className}`}
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(college.logo_url)}
        // The server-rendered <img> can fail to load *before* React hydrates, so onError never fires:
        // catch an image that has already finished loading with no pixels.
        ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setFailedUrl(college.logo_url); }}
      />
    );
  }

  const initials = (college?.name || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div
      aria-hidden
      style={{ ...style, fontSize: Math.max(11, Math.round(size * 0.38)) }}
      className={`rounded-md shrink-0 flex items-center justify-center font-bold text-black bg-gradient-to-br from-brand to-brand-2 ${className}`}
    >
      {initials}
    </div>
  );
}
