import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// The platform operator's session. Separate from the college auth store: an operator
// isn't a member of any college and their token is a different kind of token.
const usePlatformStore = create(
  persist(
    (set) => ({
      token: null,
      email: null,
      signIn: (token, email) => set({ token, email }),
      signOut: () => set({ token: null, email: null }),
    }),
    {
      name: "platform-auth",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true, // rehydrated on the client, like the college auth store
    }
  )
);

export default usePlatformStore;
