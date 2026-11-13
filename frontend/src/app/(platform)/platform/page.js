import PlatformConsole from "@/components/platform/PlatformConsole";

export const metadata = { title: "Platform console", description: "Manage colleges" };

// Operator console: creates and manages colleges. Not tied to any one college, so it
// lives outside the (college) route group and works on any hostname.
export default function PlatformPage() {
  return <PlatformConsole />;
}
