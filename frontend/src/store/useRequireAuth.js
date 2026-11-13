import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuthStore from "@/store/useAuthStore";

// For pages that need a logged-in user. The auth store uses skipHydration, so
// on a direct load/refresh the token isn't there until we rehydrate it. Returns
// true once a token is available; otherwise redirects to /login.
export default function useRequireAuth() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.resolve(useAuthStore.persist.rehydrate()).then(() => {
      if (useAuthStore.getState().token) setReady(true);
      else router.replace("/login");
    });
  }, [router]);

  return ready;
}
