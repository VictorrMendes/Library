"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { authApi } from "@/lib/api";

function AuthInit() {
  const { setUser } = useAuthStore();

  useEffect(() => {
    const fetchUserIfMissing = () => {
      if (useAuthStore.getState().user) return;
      const token = localStorage.getItem("access_token");
      if (!token) return;
      authApi.me().then(({ data }) => setUser(data)).catch(() => {});
    };

    if (useAuthStore.persist.hasHydrated()) {
      fetchUserIfMissing();
      return;
    }

    return useAuthStore.persist.onFinishHydration(fetchUserIfMissing);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: 1 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInit />
      {children}
    </QueryClientProvider>
  );
}
