"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Search, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { seriesApi, libraryApi } from "@/lib/api";
import { SeriesGrid } from "@/components/series/SeriesGrid";
import { GridSizeControl } from "@/components/ui/GridSizeControl";
import type { Library, Series, PaginatedResponse } from "@/types";
import { clsx } from "clsx";

const STATUS_OPTIONS = [
  { value: "", label: "Qualquer status" },
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

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [libraryId, setLibraryId] = useState("");
  const [status, setStatus] = useState("");
  const [genre, setGenre] = useState(searchParams.get("genre") ?? "");
  const [tag, setTag] = useState(searchParams.get("tag") ?? "");
  const [ordering, setOrdering] = useState("sort_name");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(
    !!(searchParams.get("genre") || searchParams.get("tag"))
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, 350);

  // Focus on mount and on Ctrl+K
  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, libraryId, status, ordering, genre, tag]);

  const { data: libraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => libraryApi.list().then((r) => r.data.results as Library[]),
  });

  const params: Record<string, unknown> = {
    ordering,
    page,
    page_size: PAGE_SIZE,
  };
  if (debouncedQuery) params.search = debouncedQuery;
  if (libraryId) params.library = libraryId;
  if (status) params.status = status;
  if (genre) params.genre = genre;
  if (tag) params.tag = tag;

  const hasFilters = !!debouncedQuery || !!libraryId || !!status || !!genre || !!tag;

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<Series>>({
    queryKey: ["series", "search", debouncedQuery, libraryId, status, genre, tag, ordering, page],
    queryFn: () => seriesApi.list(params).then((r) => r.data),
    enabled: hasFilters,
  });

  const series = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  function clearFilters() {
    setQuery("");
    setLibraryId("");
    setStatus("");
    setGenre("");
    setTag("");
    setOrdering("sort_name");
    setPage(1);
    inputRef.current?.focus();
  }

  const activeFilterCount = [libraryId, status, genre, tag].filter(Boolean).length;

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl">
      {/* Header */}
      <div>
        <h1 className="font-classic text-2xl font-medium tracking-tight">Buscar</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pesquise por nome, autor ou descrição.
        </p>
      </div>

      {/* Search input */}
      <div className="flex items-center gap-3">
        <GridSizeControl />
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar séries… (Ctrl+K)"
            className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className={clsx(
            "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors",
            showFilters || activeFilterCount > 0
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={clsx("h-3 w-3 transition-transform", showFilters && "rotate-180")} />
        </button>

        {(hasFilters) && (
          <button
            onClick={clearFilters}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-card border border-border rounded-xl">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Biblioteca</label>
            <select
              value={libraryId}
              onChange={(e) => setLibraryId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[160px]"
            >
              <option value="">Todas</option>
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>{lib.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[160px]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Gênero</label>
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="ex: Action"
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Tag</label>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="ex: Adventure"
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Ordenar por</label>
            <select
              value={ordering}
              onChange={(e) => setOrdering(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px]"
            >
              {ORDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Results */}
      {!hasFilters ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground space-y-3">
          <Search className="h-12 w-12 opacity-20" />
          <p className="text-sm">Digite algo para começar a buscar.</p>
        </div>
      ) : (
        <>
          {data && !isLoading && (
            <p className="text-sm text-muted-foreground">
              {data.count === 0
                ? "Nenhum resultado encontrado."
                : `${data.count} resultado${data.count !== 1 ? "s" : ""} encontrado${data.count !== 1 ? "s" : ""}${isFetching ? "…" : ""}`}
            </p>
          )}

          <SeriesGrid series={series} loading={isLoading} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-sm disabled:opacity-40 hover:bg-secondary/80 transition-colors"
              >
                Anterior
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const pageNum =
                    totalPages <= 7
                      ? i + 1
                      : page <= 4
                      ? i + 1
                      : page >= totalPages - 3
                      ? totalPages - 6 + i
                      : page - 3 + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={clsx(
                        "w-8 h-8 rounded-lg text-sm transition-colors",
                        pageNum === page
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-sm disabled:opacity-40 hover:bg-secondary/80 transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="p-6">
        <div className="h-8 w-32 bg-muted rounded animate-pulse mb-4" />
        <div className="h-10 w-full max-w-xl bg-muted rounded animate-pulse" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
