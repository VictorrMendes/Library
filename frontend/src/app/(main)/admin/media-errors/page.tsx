"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Check, CheckCheck, Loader2, RefreshCw, X,
} from "lucide-react";
import { mediaErrorsApi } from "@/lib/api";
import { clsx } from "clsx";

interface MediaError {
  id: number;
  file_path: string;
  extension: string;
  error_type: "corrupt" | "missing" | "unreadable" | "other";
  details: string;
  series_id: number | null;
  series_name: string | null;
  created_at: string;
  resolved: boolean;
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  corrupt: "Corrompido",
  missing: "Ausente",
  unreadable: "Ilegível",
  other: "Outro",
};

const ERROR_TYPE_COLORS: Record<string, string> = {
  corrupt: "bg-red-500/15 text-red-400 border border-red-500/20",
  missing: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  unreadable: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  other: "bg-muted text-muted-foreground border border-border",
};

export default function MediaErrorsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("unresolved");

  const params: Record<string, unknown> = {};
  if (filter === "unresolved") params.resolved = "false";
  if (filter === "resolved") params.resolved = "true";

  const { data: errors = [], isLoading, refetch } = useQuery<MediaError[]>({
    queryKey: ["media-errors", filter],
    queryFn: () => mediaErrorsApi.list(params).then((r) => r.data.results ?? r.data),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => mediaErrorsApi.resolve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-errors"] }),
  });

  const resolveAllMutation = useMutation({
    mutationFn: () => mediaErrorsApi.resolveAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media-errors"] }),
  });

  const unresolvedCount = errors.filter((e) => !e.resolved).length;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-classic text-2xl font-medium tracking-tight">Erros de Mídia</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Arquivos com problemas detectados durante o scan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {unresolvedCount > 0 && (
            <button
              onClick={() => resolveAllMutation.mutate()}
              disabled={resolveAllMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {resolveAllMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Resolver todos ({unresolvedCount})
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex bg-muted/40 rounded-lg p-1 w-fit gap-1">
        {(["unresolved", "all", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "unresolved" ? "Pendentes" : f === "resolved" ? "Resolvidos" : "Todos"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : errors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            {filter === "unresolved" ? "Nenhum erro pendente." : "Nenhum erro encontrado."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((err) => (
            <div
              key={err.id}
              className={clsx(
                "bg-card border border-border rounded-xl p-4 space-y-2 transition-opacity",
                err.resolved && "opacity-50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-full", ERROR_TYPE_COLORS[err.error_type])}>
                      {ERROR_TYPE_LABELS[err.error_type]}
                    </span>
                    {err.series_name && (
                      <span className="text-xs text-muted-foreground">
                        Série: <span className="text-foreground">{err.series_name}</span>
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(err.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    {err.resolved && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <Check className="h-3 w-3" /> Resolvido
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground truncate" title={err.file_path}>
                    {err.file_path}
                  </p>
                  {err.details && (
                    <p className="text-xs text-muted-foreground/70 line-clamp-2">{err.details}</p>
                  )}
                </div>
                {!err.resolved && (
                  <button
                    onClick={() => resolveMutation.mutate(err.id)}
                    disabled={resolveMutation.isPending}
                    title="Marcar como resolvido"
                    className="p-1.5 rounded text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors shrink-0"
                  >
                    {resolveMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
