import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  isAdmin: boolean;
}

function setAuthCookie(token: string) {
  // 1h lifetime matches JWT access token — middleware reads this for route protection
  document.cookie = `access_token=${token}; path=/; max-age=3600; SameSite=Strict`;
}

function clearAuthCookie() {
  document.cookie = "access_token=; path=/; max-age=0; SameSite=Strict";
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      get isAdmin() {
        return get().user?.role === "admin";
      },
      setTokens: (access, refresh) => {
        localStorage.setItem("access_token", access);
        localStorage.setItem("refresh_token", refresh);
        setAuthCookie(access);
        set({ accessToken: access, refreshToken: refresh });
      },
      setUser: (user) => set({ user }),
      logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        clearAuthCookie();
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    { name: "biblioteca-auth", partialize: (s) => ({ user: s.user }) }
  )
);
