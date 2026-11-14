"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import useAuthStore from "@/store/useAuthStore";
import useCollege from "@/utils/useCollege";
import CollegeLogo from "@/components/CollegeLogo";
import UserMenu from "@/components/UserMenu";

// The one header every college page shares. It is sticky and has a fixed height and width, so the logo and the
// account control sit in exactly the same place on every page and while scrolling. Layout width must match
// PageShell's (max-w-5xl, same horizontal padding) so the header lines up with the content below it.
export default function SiteHeader({ back = false, hideAccount = false }) {
  const college = useCollege();
  const user = useAuthStore((s) => s.user);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    useAuthStore.persist.rehydrate(); // the store skips hydration so SSR and the first client render match
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-dark-bg/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-3 min-w-0" aria-label={`${college?.name ?? "Leaderboard"} home`}>
            <CollegeLogo college={college} size={32} />
            <span className="text-sm font-bold text-gray-200 truncate hidden sm:block">{college?.name}</span>
          </Link>
          {back && (
            <Link href="/" className="inline-flex items-center text-xs text-gray-500 hover:text-white transition-colors whitespace-nowrap">
              <ArrowLeft className="w-3 h-3 mr-1" /> Leaderboard
            </Link>
          )}
        </div>
        {/* A fixed-size slot, so the header looks the same before and after the sign-in state loads */}
        <div className="shrink-0 min-w-[5rem] flex justify-end">
          {!hideAccount && hydrated && (user ? (
            <UserMenu user={user} />
          ) : (
            <Link href="/login" className="text-sm px-4 py-1.5 rounded-full border border-white/15 text-gray-300 hover:text-white hover:border-white/40 transition-colors">
              Log in
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
