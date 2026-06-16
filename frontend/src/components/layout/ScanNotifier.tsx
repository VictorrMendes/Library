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
  const colors = { success: "#16a34a", error: "#dc2626", info: "#2563eb" };
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

// Use fetch() instead of EventSource so we control every reconnect;
// EventSource has a built-in browser retry that fires before onerror
// and can't be fully suppressed — causing rapid reconnect storms over QUIC.
async function readSseStream(
  url: string,
  token: string,
  onEvent: (line: string) => void,
  signal: AbortSignal
) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    signal,
    // Force HTTP/1.1 — fetch doesn't expose this directly, but the
    // Alt-Svc:clear header from nginx prevents QUIC negotiation.
    cache: "no-store",
  });

  if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) onEvent(line);
  }
}

export function ScanNotifier() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const statusRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();
    let attempts = 0;
    let timerRef: ReturnType<typeof setTimeout> | null = null;

    function handleLine(line: string) {
      if (!line.startsWith("data:")) return;
      attempts = 0; // reset backoff on live data
      try {
        const job: ScanEvent = JSON.parse(line.slice(5).trim());
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
    }

    function scheduleConnect() {
      if (controller.signal.aborted || attempts >= 6) return;
      // Exponential backoff: 2s, 4s, 8s, 16s, 30s, 30s
      const delay = Math.min(1000 * 2 ** (attempts + 1), 30_000);
      attempts++;
      timerRef = setTimeout(connect, delay);
    }

    async function connect() {
      if (controller.signal.aborted) return;
      const token = localStorage.getItem("access_token");
      if (!token) return;
      try {
        await readSseStream(sseUrl(), token, handleLine, controller.signal);
        // Stream ended cleanly — reconnect
        scheduleConnect();
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError") return;
        scheduleConnect();
      }
    }

    connect();

    return () => {
      controller.abort();
      if (timerRef) clearTimeout(timerRef);
    };
  }, [user, queryClient]);

  return null;
}
