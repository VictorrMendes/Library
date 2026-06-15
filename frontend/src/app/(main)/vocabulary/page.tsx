"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { BookMarked, Download, Trash2, GraduationCap } from "lucide-react";
import { vocabularyApi } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { VocabularyEntry, VocabularyStats } from "@/types";

const STATUS_TABS = [
  { key: "", label: "Todas" },
  { key: "new", label: "Novas" },
  { key: "learning", label: "Aprendendo" },
  { key: "known", label: "Conhecidas" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  new: "bg-sky-500/15 text-sky-400 border border-sky-500/20",
  learning: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  known: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Nova",
  learning: "Aprendendo",
  known: "Conhecida",
};

export default function VocabularyPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams: Record<string, unknown> = {};
  if (activeTab) queryParams.status = activeTab;
  if (debouncedSearch) queryParams.search = debouncedSearch;

  const { data: entries, isLoading } = useQuery<VocabularyEntry[]>({
    queryKey: ["vocabulary", activeTab, debouncedSearch],
    queryFn: () =>
      vocabularyApi.list(queryParams).then((r) => r.data.results ?? r.data),
  });

  const { data: stats } = useQuery<VocabularyStats>({
    queryKey: ["vocabulary", "stats"],
    queryFn: () => vocabularyApi.stats().then((r) => r.data),
  });

  const { mutate: deleteEntry } = useMutation({
    mutationFn: (id: number) => vocabularyApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vocabulary"] });
      toast({ title: "Palavra removida", variant: "success" });
    },
    onError: () => {
      toast({ title: "Erro ao remover palavra", variant: "destructive" });
    },
  });

  const { mutate: exportAnki, isPending: exporting } = useMutation({
    mutationFn: () => vocabularyApi.exportAnki(),
    onSuccess: (response) => {
      const blob = new Blob([response.data], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vocabulario.txt";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exportação concluída", variant: "success" });
    },
    onError: () => {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    },
  });

  return (
    <div className="p-5 sm:p-8 space-y-8 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-classic text-3xl font-medium tracking-tight flex items-center gap-2">
            <BookMarked className="h-7 w-7 text-primary" strokeWidth={1.75} />
            Vocabulário
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Palavras salvas durante a leitura</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/vocabulary/review"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <GraduationCap className="h-4 w-4" />
            Revisar
          </Link>
          <button
            onClick={() => exportAnki()}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exportando..." : "Exportar Anki"}
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Novas", value: stats.new, color: "text-sky-400" },
            { label: "Aprendendo", value: stats.learning, color: "text-amber-400" },
            { label: "Conhecidas", value: stats.known, color: "text-emerald-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-lg px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className={cn("font-classic text-3xl font-medium mt-1 leading-none", color)}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {stats && stats.due_today > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/8 border border-primary/20 rounded-md w-fit">
          <GraduationCap className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-medium text-primary">
            {stats.due_today} {stats.due_today === 1 ? "palavra" : "palavras"} para revisar hoje
          </p>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por palavra..."
        className="w-full max-w-sm px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Entry list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : !entries || entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <BookMarked className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nenhuma palavra salva ainda.</p>
          <p className="text-sm text-muted-foreground/60">Selecione texto durante a leitura para salvar no caderno.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-card border border-border rounded-lg p-4 flex items-start justify-between gap-4 hover:border-border/80 transition-colors"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-semibold text-foreground">{entry.word}</span>
                  {entry.phonetic && (
                    <span className="text-xs text-muted-foreground">{entry.phonetic}</span>
                  )}
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-sm uppercase tracking-wide", STATUS_BADGE[entry.status])}>
                    {STATUS_LABEL[entry.status]}
                  </span>
                </div>
                <p className="text-sm font-medium text-primary">{entry.translation}</p>
                {entry.definition && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{entry.definition}</p>
                )}
                {entry.context_sentence && (
                  <p className="text-xs text-muted-foreground/70 italic line-clamp-1">
                    &ldquo;{entry.context_sentence}&rdquo;
                  </p>
                )}
              </div>
              <button
                onClick={() => deleteEntry(entry.id)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                title="Remover palavra"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
