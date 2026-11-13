import { Code2, Terminal, Flag } from "lucide-react";

// Display config per platform id. The backend owns *which* platforms exist
// (GET /college -> platforms); this only decides how each one looks. Class
// names are written out in full so Tailwind can see them.
// `chart` is the line color on the chart surface: the validated dark-mode step
// of the data-viz palette for the matching hue (blue / red / violet).
export const PLATFORM_STYLES = {
  leetcode: {
    Icon: Code2,
    tab: "bg-pastel-blue/10 text-pastel-blue shadow-[0_0_10px_rgba(130,177,255,0.2)]",
    text: "text-pastel-blue",
    avatar: "bg-gradient-to-br from-pastel-blue to-blue-500",
    chart: "#3987e5",
    // second leaderboard column
    secondary: "solved",
  },
  codeforces: {
    Icon: Terminal,
    tab: "bg-pastel-red/10 text-pastel-red shadow-[0_0_10px_rgba(255,138,128,0.2)]",
    text: "text-pastel-red",
    avatar: "bg-gradient-to-br from-pastel-red to-red-500",
    chart: "#e66767",
    secondary: "peak",
  },
  atcoder: {
    Icon: Flag,
    tab: "bg-pastel-purple/10 text-pastel-purple shadow-[0_0_10px_rgba(209,196,233,0.2)]",
    text: "text-pastel-purple",
    avatar: "bg-gradient-to-br from-pastel-purple to-purple-400",
    chart: "#9085e9",
    secondary: "peak",
  },
};

const FALLBACK = {
  Icon: Code2,
  tab: "bg-white/10 text-white",
  text: "text-gray-300",
  avatar: "bg-gradient-to-br from-gray-300 to-gray-500",
  chart: "#898781",
  secondary: "peak",
};

export const styleFor = (id) => PLATFORM_STYLES[id] || FALLBACK;

// Used until /college has loaded (or if it fails), so pages still render.
export const DEFAULT_PLATFORMS = [
  { id: "leetcode", label: "LeetCode" },
  { id: "codeforces", label: "Codeforces" },
  { id: "atcoder", label: "AtCoder" },
];
