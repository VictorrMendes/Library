"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Library, Loader2, CheckSquare, Trash2, X } from "lucide-react";
import { libraryApi, seriesApi } from "@/lib/api";
import { SeriesGrid } from "@/components/series/SeriesGrid";
import { SelectableSeriesGrid } from "@/components/series/SelectableSeriesGrid";
import { GridSizeControl } from "@/components/ui/GridSizeControl";
import type { Library as LibraryType, Series, PaginatedResponse } from "@/types";
import { clsx } from "clsx";

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "ongoing", label: "Em andamento" },
  { value: "completed", label: "Completo" },
  { value: "hiatus", label: "Hiato" },
  { value: "cancelled", label: "Cancelado" },
  { value: "ended", label: "Encerrado" },
];

const ORDER_OPTIONS = [
  { value: "sort_name", label: "Nome (A-Z)" },
  { value: "-sort_name", label: "Nome (Z-A)" },
  { value: "-created_at", label: "Mais recentes" },
  { value: "-last_modified", label: "Última modificação" },
  { value: "-pages", label: "Mais páginas" },
];

const PAGE_SIZE = 48;

export default function LibraryPage() {
  const { id } = useParams<{ id: string }>();
  const libraryId = Number(id);

  const [status, setStatus] = useState("");
  const [ordering, setOrdering] = useState("sort_name");
  const [page, setPage] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) await seriesApi.delete(id);
    },
    onSuccess: () => {
      setSelected(new Set());
      setSelectMode(false);
      queryClient.invalidateQueries({ queryKey: ["series", "library", libraryId] });
    },
  });

  const { data: library } = useQuery<LibraryType>({
    queryKey: ["library", libraryId],
    queryFn: () => libraryApi.get(libraryId).then((r) => r.data),
    enabled: !!libraryId,
  });

  const { data, isLoading } = useQuery<PaginatedResponse<Series>>({
    queryKey: ["series", "library", libraryId, status, ordering, page],
    queryFn: () =>
      seriesApi
        .list({
          library: libraryId,
          ...(status && { status }),
          ordering,
          page,
          page_size: PAGE_SIZE,
        })
        .then((r) => r.data),
    enabled: !!libraryId,
  });

  const series = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  async function handleScan() {
    if (!library) return;
    setScanning(true);
    try {
      await libraryApi.scan(library.id);
    } finally {
      setScanning(false);
    }
  }

  function handleFilterChange(newStatus: string, newOrdering: string) {
    setStatus(newStatus);
    setOrdering(newOrdering);
    setPage(1);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-screen-2xl">
      {/* Breadcrumb */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Library className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold font-sans truncate">
              {library?.name ?? "Biblioteca"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {data ? `${data.count} séries` : "Carregando…"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <GridSizeControl />
          <button
            onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
            title="Selecionar"
            className={clsx(
              "p-2 rounded-lg border text-sm transition-colors",
              selectMode
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <CheckSquare className="h-4 w-4" />
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-60"
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Escanear</span>
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={status}
          onChange={(e) => handleFilterChange(e.target.value, ordering)}
          className="flex-1 min-w-0 sm:flex-none px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={ordering}
          onChange={(e) => handleFilterChange(status, e.target.value)}
          className="flex-1 min-w-0 sm:flex-none px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {ORDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Bulk action toolbar */}
      {selectMode && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-sm text-muted-foreground flex-1">
            {selected.size} {selected.size === 1 ? "série selecionada" : "séries selecionadas"}
          </span>
          {selected.size > 0 && (
            <button
              onClick={() => {
                if (confirm(`Apagar ${selected.size} série(s)?`)) {
                  deleteMutation.mutate(Array.from(selected));
                }
              }}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-60"
            >
              {deleteMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
              Apagar
            </button>
          )}
          <button
            onClick={() => { setSelectMode(false); setSelected(new Set()); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Grid */}
      {selectMode ? (
        <SelectableSeriesGrid
          series={series}
          loading={isLoading}
          selected={selected}
          onToggle={toggleSelect}
        />
      ) : (
        <SeriesGrid series={series} loading={isLoading} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-sm disabled:opacity-40 hover:bg-secondary/80 transition-colors"
          >
            ‹ Anterior
          </button>

          <span className="text-sm text-muted-foreground px-2">
            {page} / {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-sm disabled:opacity-40 hover:bg-secondary/80 transition-colors"
          >
            Próxima ›
          </button>
        </div>
      )}
    </div>
  );
}
