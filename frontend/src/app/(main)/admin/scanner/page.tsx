"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Loader2, CheckCircle2, XCircle, Clock, AlertCircle,
  Play, FileText, FilePlus, FileMinus, Pencil,
} from "lucide-react";
import { scannerApi, libraryApi } from "@/lib/api";
import type { Library } from "@/types";
import { clsx } from "clsx";

interface ScanJob {
  id: number;
  library_id: number | null;
  status: "pending" | "running" | "completed" | "failed";
  files_added: number;
  files_removed: number;
  files_updated: number;
  error_message: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  duration_seconds: number | null;
}

const STATUS_CONFIG = {
  pending: { label: "Pendente", icon: Clock, color: "text-yellow-400 bg-yellow-500/10" },
  running: { label: "Executando", icon: RefreshCw, color: "text-blue-400 bg-blue-500/10", spin: true },
  completed: { label: "Concluído", icon: CheckCircle2, color: "text-green-400 bg-green-500/10" },
  failed: { label: "Falhou", icon: XCircle, color: "text-red-400 bg-red-500/10" },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function AdminScannerPage() {
  const qc = useQueryClient();
  const [filterLibrary, setFilterLibrary] = useState("");
  const [scanning, setScanning] = useState(false);

  const { data: libraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => libraryApi.list().then((r) => r.data.results as Library[]),
  });

  const { data: jobs = [], isLoading, refetch } = useQuery<ScanJob[]>({
    queryKey: ["scan-jobs", filterLibrary],
    queryFn: () =>
      scannerApi.jobs(filterLibrary ? Number(filterLibrary) : undefined).then((r) => r.data.results as ScanJob[]),
    refetchInterval: 5000,
  });

  const hasRunning = jobs.some((j) => j.status === "running" || j.status === "pending");

  async function handleScanAll() {
    setScanning(true);
    try {
      await scannerApi.scanAll();
      setTimeout(() => refetch(), 1000);
    } finally {
      setScanning(false);
    }
  }

  const libMap = new Map(libraries.map((l) => [l.id, l.name]));

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-sans">Scanner</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Histórico de scans das bibliotecas.
            {hasRunning && (
              <span className="ml-2 inline-flex items-center gap-1 text-blue-400">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Scan em andamento…
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleScanAll}
          disabled={scanning || hasRunning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 shrink-0"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Escanear Tudo
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={filterLibrary}
          onChange={(e) => setFilterLibrary(e.target.value)}
          className="px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Todas as bibliotecas</option>
          {libraries.map((lib) => (
            <option key={lib.id} value={lib.id}>{lib.name}</option>
          ))}
        </select>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="Atualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <p className="text-xs text-muted-foreground">
          Atualiza automaticamente a cada 5s
        </p>
      </div>

      {/* Jobs table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
          <AlertCircle className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum scan registrado.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Biblioteca</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Início</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Duração</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Arquivos</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const cfg = STATUS_CONFIG[job.status];
                const StatusIcon = cfg.icon;
                return (
                  <tr key={job.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className={clsx("inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium", cfg.color)}>
                        <StatusIcon className={clsx("h-3 w-3", "spin" in cfg && cfg.spin ? "animate-spin" : "")} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {job.library_id ? libMap.get(job.library_id) ?? `#${job.library_id}` : "Todas"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(job.started_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDuration(job.duration_seconds)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 text-xs">
                        {job.files_added > 0 && (
                          <span className="flex items-center gap-1 text-green-400">
                            <FilePlus className="h-3 w-3" />
                            +{job.files_added}
                          </span>
                        )}
                        {job.files_updated > 0 && (
                          <span className="flex items-center gap-1 text-blue-400">
                            <Pencil className="h-3 w-3" />
                            ~{job.files_updated}
                          </span>
                        )}
                        {job.files_removed > 0 && (
                          <span className="flex items-center gap-1 text-red-400">
                            <FileMinus className="h-3 w-3" />
                            -{job.files_removed}
                          </span>
                        )}
                        {job.files_added === 0 && job.files_updated === 0 && job.files_removed === 0 && (
                          <span className="text-muted-foreground">sem alterações</span>
                        )}
                      </div>
                      {job.error_message && (
                        <p className="text-[11px] text-red-400 mt-0.5 truncate max-w-xs" title={job.error_message}>
                          {job.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(job.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
