"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  BookOpen, Clock, ChevronRight, Play, Heart, Star, Tag, Trash2, Loader2,
} from "lucide-react";
import { seriesApi, readerApi, collectionsApi } from "@/lib/api";
import type { Series, Volume } from "@/types";
import { clsx } from "clsx";

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Em andamento",
  completed: "Completo",
  hiatus: "Hiato",
  cancelled: "Cancelado",
  ended: "Encerrado",
  unknown: "Desconhecido",
};

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data: series, isLoading } = useQuery<Series>({
    queryKey: ["series", id],
    queryFn: () => seriesApi.get(Number(id)).then((r) => r.data),
  });

  const { data: volumes } = useQuery<Volume[]>({
    queryKey: ["series", id, "volumes"],
    queryFn: () => seriesApi.volumes(Number(id)).then((r) => r.data),
    enabled: !!series,
  });

  const { data: progress } = useQuery({
    queryKey: ["progress", "series", id],
    queryFn: () => readerApi.seriesProgress(Number(id)).then((r) => r.data),
    enabled: !!series,
  });

  const deleteMutation = useMutation({
    mutationFn: () => seriesApi.delete(Number(id)),
    onSuccess: () => router.push("/dashboard"),
  });

  const handleContinue = async () => {
    const { data } = await readerApi.continuePoint(Number(id));
    router.push(`/reader/${data.chapter_id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!series) return null;

  const meta = series.metadata;
  const writers = meta?.people?.filter((p) => p.role === "writer") ?? [];
  const artists = meta?.people?.filter((p) => p.role === "penciller") ?? [];
  const totalChapters = volumes?.reduce((acc, v) => acc + v.chapters.length, 0) ?? 0;

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative h-48 sm:h-72 overflow-hidden">
        {series.cover_image && (
          <Image
            src={series.cover_image}
            alt={series.name}
            fill
            className="object-cover blur-xl scale-110 opacity-20"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-24 sm:-mt-40 relative z-10 pb-12">
        <div className="flex gap-4 sm:gap-6">
          {/* Cover */}
          <div className="shrink-0 w-28 h-40 sm:w-36 sm:h-52 rounded-xl overflow-hidden border border-border shadow-xl shadow-black/40">
            {series.cover_image ? (
              <Image
                src={series.cover_image}
                alt={series.name}
                width={144}
                height={208}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <BookOpen className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-10 sm:pt-16">
            <h1 className="text-xl sm:text-2xl font-bold font-sans leading-tight">
              {series.localized_name || series.name}
            </h1>
            {series.original_name && series.original_name !== series.name && (
              <p className="text-sm text-muted-foreground mt-0.5">{series.original_name}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-3">
              {meta?.publication_status && (
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                  {STATUS_LABELS[meta.publication_status]}
                </span>
              )}
              {meta?.release_year && (
                <span className="text-xs text-muted-foreground">{meta.release_year}</span>
              )}
              {meta?.language && (
                <span className="text-xs text-muted-foreground uppercase">{meta.language}</span>
              )}
              <span className="text-xs text-muted-foreground">{totalChapters} capítulos</span>
              {series.avg_hours_to_read > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {series.avg_hours_to_read.toFixed(1)}h
                </span>
              )}
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              <button
                onClick={handleContinue}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Play className="h-4 w-4 fill-current" />
                Continuar
              </button>
              <button
                onClick={() => collectionsApi.addWantToRead(series.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-sm font-medium hover:bg-accent transition-colors"
              >
                <Heart className="h-4 w-4" />
                Quero Ler
              </button>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-sm font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Apagar
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        {meta?.summary && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sinopse</h2>
            <p className="text-sm leading-relaxed text-foreground/80">{meta.summary}</p>
          </div>
        )}

        {/* Metadata grid */}
        <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
          {writers.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Escritor</p>
              <p className="text-sm font-medium">{writers.map((w) => w.name).join(", ")}</p>
            </div>
          )}
          {artists.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Arte</p>
              <p className="text-sm font-medium">{artists.map((a) => a.name).join(", ")}</p>
            </div>
          )}
        </div>

        {/* Genres + Tags */}
        {((meta?.genres?.length ?? 0) > 0 || (meta?.tags?.length ?? 0) > 0) && (
          <div className="mt-6 flex flex-wrap gap-2">
            {meta?.genres?.map((g) => (
              <span key={g.id} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                {g.name}
              </span>
            ))}
            {meta?.tags?.map((t) => (
              <span key={t.id} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">
                <Tag className="h-3 w-3" />
                {t.name}
              </span>
            ))}
          </div>
        )}

        {/* Volumes + Chapters */}
        {volumes && volumes.length > 0 && (
          <div className="mt-10">
            <h2 className="text-base font-semibold mb-4">Volumes e Capítulos</h2>
            <div className="space-y-3">
              {volumes.map((vol) => (
                <VolumeAccordion key={vol.id} volume={vol} progress={progress ?? []} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(false)} />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="text-base font-semibold">Apagar série?</h2>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja apagar{" "}
              <span className="text-foreground font-medium">"{series.localized_name || series.name}"</span>?{" "}
              Esta ação não pode ser desfeita. Os arquivos físicos não serão removidos do disco.
            </p>
            {deleteMutation.isError && (
              <p className="text-sm text-red-400">Erro ao apagar. Tente novamente.</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VolumeAccordion({
  volume,
  progress,
}: {
  volume: Volume;
  progress: Array<{ chapter_id: number; pages_read: number; is_completed: boolean }>;
}) {
  const progressMap = new Map(progress.map((p) => [p.chapter_id, p]));
  const completedCount = volume.chapters.filter(
    (c) => progressMap.get(c.id)?.is_completed
  ).length;
  const router = useRouter();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{volume.name}</p>
          <p className="text-xs text-muted-foreground">
            {completedCount}/{volume.chapters.length} capítulos
          </p>
        </div>
        <div className="w-24 h-1.5 bg-secondary rounded-full">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${(completedCount / volume.chapters.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="divide-y divide-border">
        {volume.chapters.map((ch) => {
          const prog = progressMap.get(ch.id);
          return (
            <button
              key={ch.id}
              onClick={() => router.push(`/reader/${ch.id}`)}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-accent/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={clsx(
                  "h-2 w-2 rounded-full shrink-0",
                  prog?.is_completed ? "bg-green-500" : prog?.pages_read ? "bg-yellow-500" : "bg-border"
                )} />
                <p className="text-sm truncate">{ch.title || `Capítulo ${ch.range || ch.min_number}`}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {ch.pages > 0 && (
                  <span className="text-xs text-muted-foreground">{ch.pages}p</span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
