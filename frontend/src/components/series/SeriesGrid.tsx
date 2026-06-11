"use client";

import { SeriesCard } from "./SeriesCard";
import type { Series } from "@/types";

interface Props {
  series: Series[];
  loading?: boolean;
}

export function SeriesGrid({ series, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[2/3] rounded-lg bg-muted animate-pulse" />
            <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-2.5 bg-muted rounded animate-pulse w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-sm">Nenhuma série encontrada.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
      {series.map((s) => (
        <SeriesCard key={s.id} series={s} showStatus />
      ))}
    </div>
  );
}
