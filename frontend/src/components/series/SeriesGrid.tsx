"use client";

import { SeriesCard } from "./SeriesCard";
import { SeriesCardSkeleton } from "@/components/ui/Skeleton";
import { useGridStore, GRID_COLS } from "@/store/grid";
import { clsx } from "clsx";
import type { Series } from "@/types";

interface Props {
  series: Series[];
  loading?: boolean;
}

export function SeriesGrid({ series, loading }: Props) {
  const { size } = useGridStore();
  const cols = GRID_COLS[size];

  if (loading) {
    return (
      <div className={clsx("grid gap-3 sm:gap-4", cols)}>
        {Array.from({ length: 24 }).map((_, i) => (
          <SeriesCardSkeleton key={i} />
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
    <div className={clsx("grid gap-3 sm:gap-4", cols)}>
      {series.map((s) => (
        <SeriesCard key={s.id} series={s} showStatus />
      ))}
    </div>
  );
}
