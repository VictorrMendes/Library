"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sseUrl } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface ScanEvent {
  id: number;
  library_id: number;
  library_name: string;
  status: "pending" | "running" | "completed" | "failed";
  files_added: number;
}

function showToast(msg: string, type: "success" | "error" | "info") {
  const colors = {
    success: "#16a34a",
    error: "#dc2626",
    info: "#2563eb",
  };
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position:fixed; bottom:1.5rem; right:1.5rem; z-index:9999;
    padding:0.75rem 1.25rem; border-radius:0.75rem; font-size:0.875rem;
    font-weight:500; color:white; box-shadow:0 4px 20px rgba(0,0,0,0.4);
    background:${colors[type]}; opacity:1; transition:opacity 0.3s ease;
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

export function ScanNotifier() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const statusRef = useRef<Map<number, string>>(new Map());
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!user) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const token = localStorage.getItem("access_token");
      if (!token) return;

      const es = new EventSource(`${sseUrl()}?token=${token}`);
      esRef.current = es;

      es.onmessage = (e) => {
        attempts = 0; // reset backoff on successful message
        try {
          const job: ScanEvent = JSON.parse(e.data);
          const prev = statusRef.current.get(job.id);

          if (prev && prev !== job.status) {
            if (job.status === "completed") {
              showToast(
                `Scan de "${job.library_name}" concluído! +${job.files_added} arquivo(s)`,
                "success"
              );
              queryClient.invalidateQueries({ queryKey: ["series"] });
              queryClient.invalidateQueries({ queryKey: ["libraries"] });
            } else if (job.status === "failed") {
              showToast(`Scan de "${job.library_name}" falhou.`, "error");
            } else if (job.status === "running" && prev === "pending") {
              showToast(`Scan de "${job.library_name}" iniciado…`, "info");
            }
          }

          statusRef.current.set(job.id, job.status);
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (destroyed || attempts >= 6) return;
        // Exponential backoff: 2s, 4s, 8s, 16s, 30s, 30s
        const delay = Math.min(1000 * 2 ** (attempts + 1), 30_000);
        attempts++;
        timeoutId = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (timeoutId) clearTimeout(timeoutId);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [user, queryClient]);

  return null;
}
