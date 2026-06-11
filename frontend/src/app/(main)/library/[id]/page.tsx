"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Library, Loader2 } from "lucide-react";
import { libraryApi, seriesApi } from "@/lib/api";
import { SeriesGrid } from "@/components/series/SeriesGrid";
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

        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-60 shrink-0"
        >
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Escanear</span>
        </button>
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

      {/* Grid */}
      <SeriesGrid series={series} loading={isLoading} />

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
