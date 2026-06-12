"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scannerApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface ScanJob {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  library: { id: number; name: string } | null;
  created_at: string;
}

const POLL_INTERVAL = 8000;

export function ScanNotifier() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const lastActiveRef = useRef<Set<number>>(new Set());
  const toastRef = useRef<((msg: string, type: "success" | "error") => void) | null>(null);

  useEffect(() => {
    // Simple toast using native notification or a div overlay
    toastRef.current = (msg, type) => {
      const el = document.createElement("div");
      el.textContent = msg;
      el.style.cssText = `
        position:fixed; bottom:1.5rem; right:1.5rem; z-index:9999;
        padding:0.75rem 1.25rem; border-radius:0.75rem; font-size:0.875rem;
        font-weight:500; color:white; box-shadow:0 4px 20px rgba(0,0,0,0.4);
        background:${type === "success" ? "#16a34a" : "#dc2626"};
        animation:fadeIn 0.2s ease;
        transition:opacity 0.3s ease;
      `;
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 300);
      }, 4000);
    };
  }, []);

  const { data: jobs = [] } = useQuery<ScanJob[]>({
    queryKey: ["scanner", "jobs"],
    queryFn: () => scannerApi.jobs().then((r) => r.data.results as ScanJob[]),
    enabled: !!user,
    refetchInterval: (query) => {
      const jobs = query.state.data as ScanJob[] | undefined;
      const hasActive = jobs?.some((j) => j.status === "pending" || j.status === "running");
      return hasActive ? POLL_INTERVAL : false;
    },
  });

  useEffect(() => {
    if (!jobs.length) return;
    const active = new Set(
      jobs.filter((j) => j.status === "pending" || j.status === "running").map((j) => j.id)
    );

    jobs.forEach((job) => {
      if (lastActiveRef.current.has(job.id) && !active.has(job.id)) {
        const name = job.library?.name ?? "Biblioteca";
        if (job.status === "completed") {
          toastRef.current?.(`Scan de "${name}" concluído!`, "success");
          queryClient.invalidateQueries({ queryKey: ["series"] });
        } else if (job.status === "failed") {
          toastRef.current?.(`Scan de "${name}" falhou.`, "error");
        }
      }
    });

    lastActiveRef.current = active;
  }, [jobs, queryClient]);

  return null;
}
