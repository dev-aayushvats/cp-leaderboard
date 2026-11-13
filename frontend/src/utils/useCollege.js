"use client";
import { createContext, useContext } from "react";

// The college for this request, resolved on the server from the hostname by the root
// layout (see lib/college-server.js) and provided here, so components get it
// synchronously on first render: no loading state, no flash of default branding.
const CollegeContext = createContext(null);

// A component (not the bare Context.Provider object) so the server-rendered root
// layout can render it: Server Components can only pass components across to the client.
export function CollegeProvider({ college, children }) {
  return <CollegeContext.Provider value={college}>{children}</CollegeContext.Provider>;
}

export default function useCollege() {
  return useContext(CollegeContext);
}
