import { useEffect, useState } from "react";
import { getCollege } from "@/utils/api";

// Fetched once per page load and shared by every component that asks for it.
let collegePromise = null;

export default function useCollege() {
  const [college, setCollege] = useState(null);

  useEffect(() => {
    if (!collegePromise) {
      collegePromise = getCollege()
        .then((res) => res.data)
        .catch((err) => {
          collegePromise = null; // allow retry on next mount
          console.error("Failed to load college info", err);
          return null;
        });
    }
    let active = true;
    collegePromise.then((c) => active && setCollege(c));
    return () => { active = false; };
  }, []);

  return college;
}
