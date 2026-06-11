"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { Heart, Trash2, Loader2 } from "lucide-react";
import { collectionsApi } from "@/lib/api";
import type { Series } from "@/types";

interface WantToReadItem {
  id: number;
  series_id: number;
  series: Series;
  added_at: string;
}

export default function WantToReadPage() {
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery<WantToReadItem[]>({
    queryKey: ["want-to-read"],
    queryFn: () => collectionsApi.wantToRead().then((r) => r.data.results as WantToReadItem[]),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => collectionsApi.removeWantToRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["want-to-read"] }),
  });

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl">
      <div>
        <h1 className="text-2xl font-bold font-sans">Quero Ler</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Séries que você quer ler futuramente.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
              <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground space-y-3">
          <Heart className="h-12 w-12 opacity-20" />
          <p className="text-sm">Nenhuma série na sua lista de desejos.</p>
          <Link href="/search" className="text-sm text-primary hover:underline">
            Explorar séries
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {items.map((item) => {
            const series = item.series;
            if (!series) return null;
            return (
              <div key={item.id} className="group relative">
                <Link href={`/series/${series.id}`} className="block">
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card border border-border/50 transition-all duration-200 group-hover:border-primary/50 group-hover:-translate-y-0.5">
                    {series.cover_image ? (
                      <Image
                        src={series.cover_image}
                        alt={series.name}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 640px) 33vw, 12vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/images/placeholders/cover-missing-dark.png"
                          alt="Sem capa"
                          className="w-full h-full object-cover opacity-40"
                        />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">
                    {series.localized_name || series.name}
                  </p>
                </Link>

                {/* Remove button */}
                <button
                  onClick={() => removeMutation.mutate(item.id)}
                  disabled={removeMutation.isPending}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-card/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity border border-border text-muted-foreground hover:text-red-400"
                  title="Remover da lista"
                >
                  {removeMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
