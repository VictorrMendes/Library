"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAdmin } = useAuthStore();

  useEffect(() => {
    if (user !== null && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [user, isAdmin, router]);

  if (!user || !isAdmin) return null;

  return <>{children}</>;
}
