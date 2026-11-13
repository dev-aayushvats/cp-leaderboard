"use client";
import { useEffect, useState } from "react";
import LeaderboardTable from "@/components/LeaderboardTable";
import Link from "next/link";
import useAuthStore from "@/store/useAuthStore"; // Import Zustand store
import useCollege from "@/utils/useCollege";
import CollegeLogo from "@/components/CollegeLogo";
import UserMenu from "@/components/UserMenu";

export default function Home() {
  // Zustand Hooks
  const { user } = useAuthStore();
  const college = useCollege();

  // Hydration fix: Ensure we only show auth state after client loads
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Manually trigger rehydration or just wait for mount
    useAuthStore.persist.rehydrate();
    setIsHydrated(true);
  }, []);


  return (
    <main className="min-h-screen bg-dark-bg text-gray-200 relative overflow-x-hidden selection:bg-brand/20">

      {/* Background Ambience (Fixed position so they don't scroll away) */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand/5 rounded-full blur-[128px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-pastel-red/5 rounded-full blur-[128px]" />
      </div>

      {/* Header with User Profile */}
      <div className="relative z-50 p-6 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <CollegeLogo college={college} size={32} />
          <span className="text-sm font-bold text-gray-200 truncate hidden sm:block">{college?.name}</span>
        </Link>
        {isHydrated && user ? (
          <UserMenu user={user} />
        ) : (
          <Link href="/login" className="text-sm px-4 py-1.5 rounded-full border border-white/15 text-gray-300 hover:text-white hover:border-white/40 transition-colors">
            Log in
          </Link>
        )}
      </div>

      {/* Main Container - Top Aligned, Centered Horizontally */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-10 md:pt-16 pb-20">
        <LeaderboardTable />
      </div>

      {/* Floating Action Button */}
      {/* Only show if NOT logged in */}
      {isHydrated && !user && (
        <div className="fixed bottom-8 right-8 z-50">
          <Link href="/register">  {/* Wrap button in Link */}
            <button className="bg-white text-black hover:bg-pastel-green transition-all duration-300 p-4 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.1)] group flex items-center gap-0 hover:gap-3">
              <span className="font-bold text-xl leading-none">+</span>
              <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 text-sm font-bold whitespace-nowrap">
                Add Profile
              </span>
            </button>
          </Link>
        </div>
      )}
    </main>
  );
}