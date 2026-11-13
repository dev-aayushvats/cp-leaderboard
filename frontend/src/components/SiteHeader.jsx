"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import useAuthStore from "@/store/useAuthStore";
import useCollege from "@/utils/useCollege";
import CollegeLogo from "@/components/CollegeLogo";
import UserMenu from "@/components/UserMenu";

// The one header every college page shares: logo + name, optional back link, account menu / log in.
export default function SiteHeader({ back = false, className = "" }) {
  const college = useCollege();
  const user = useAuthStore((s) => s.user);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    useAuthStore.persist.rehydrate(); // the store skips hydration so SSR and the first client render match
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  return (
    <header className={`relative z-50 flex items-center justify-between gap-4 ${className}`}>
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
      {hydrated && user ? (
        <UserMenu user={user} />
      ) : (
        <Link href="/login" className="text-sm px-4 py-1.5 rounded-full border border-white/15 text-gray-300 hover:text-white hover:border-white/40 transition-colors">
          Log in
        </Link>
      )}
    </header>
  );
}
