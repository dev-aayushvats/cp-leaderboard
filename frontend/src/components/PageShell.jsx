import SiteHeader from "@/components/SiteHeader";

// Header plus a content area on the same grid as the header (max-w-5xl, same side padding), so every page starts
// at the same left edge and the same distance below the header. `narrow` (e.g. "max-w-2xl") centers a narrower
// column inside that grid for form-like pages.
export default function PageShell({ children, back = false, hideAccount = false, narrow = "", className = "" }) {
  return (
    <>
      <SiteHeader back={back} hideAccount={hideAccount} />
      <div className={`relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-20 ${className}`}>
        {narrow ? <div className={`mx-auto w-full ${narrow}`}>{children}</div> : children}
      </div>
    </>
  );
}
