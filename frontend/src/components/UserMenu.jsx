"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, ShieldCheck, UserRound, ChevronDown } from "lucide-react";
import useAuthStore from "@/store/useAuthStore";

// Avatar button + dropdown: Profile, Settings, Admin (admins only), Sign out.
export default function UserMenu({ user }) {
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const item = "flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white rounded-md transition-colors";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-white/10 hover:border-white/30 transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand to-brand-2 text-black text-xs font-bold flex items-center justify-center">
          {user.username.charAt(0).toUpperCase()}
        </span>
        <span className="text-xs text-gray-300 max-w-[8rem] truncate hidden sm:block">{user.username}</span>
        <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-52 p-1.5 rounded-lg border border-white/10 bg-[#111] shadow-xl z-50">
          <div className="px-3 py-2 text-[11px] text-gray-500 border-b border-white/5 mb-1 truncate">Signed in as {user.username}</div>
          <Link role="menuitem" href={`/u/${encodeURIComponent(user.username)}`} className={item} onClick={() => setOpen(false)}>
            <UserRound className="w-4 h-4" /> My profile
          </Link>
          <Link role="menuitem" href="/settings" className={item} onClick={() => setOpen(false)}>
            <Settings className="w-4 h-4" /> Settings
          </Link>
          {user.role === "college_admin" && (
            <Link role="menuitem" href="/admin" className={item} onClick={() => setOpen(false)}>
              <ShieldCheck className="w-4 h-4" /> Admin panel
            </Link>
          )}
          <button
            role="menuitem"
            onClick={() => { setOpen(false); logout(); router.refresh(); }}
            className={`${item} w-full text-left`}
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
