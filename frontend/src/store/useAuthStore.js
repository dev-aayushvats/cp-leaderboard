// src/store/useAuthStore.js
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,

      // Action: Login
      login: (token, userData) => set({ 
        token, 
        user: userData 
      }),

      // Action: Logout
      logout: () => set({ 
        user: null, 
        token: null 
      }),
    }),
    {
      name: 'auth-storage', // unique name in localStorage
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      skipHydration: true, // Important for Next.js to avoid server/client mismatch errors
    }
  )
);

export default useAuthStore;