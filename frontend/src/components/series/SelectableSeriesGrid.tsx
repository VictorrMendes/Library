"use client";

import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";
import { clsx } from "clsx";
import { useGridStore, GRID_COLS } from "@/store/grid";
import { SeriesCardSkeleton } from "@/components/ui/Skeleton";
import type { Series } from "@/types";

interface Props {
  series: Series[];
  loading?: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
}

export function SelectableSeriesGrid({ series, loading, selected, onToggle }: Props) {
  const { size } = useGridStore();
  const cols = GRID_COLS[size];

  if (loading) {
    return (
      <div className={clsx("grid gap-3 sm:gap-4", cols)}>
        {Array.from({ length: 24 }).map((_, i) => <SeriesCardSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className={clsx("grid gap-3 sm:gap-4", cols)}>
      {series.map((s) => {
        const sel = selected.has(s.id);
        return (
          <div
            key={s.id}
            onClick={() => onToggle(s.id)}
            className="group block cursor-pointer"
          >
            <div className={clsx(
              "relative aspect-[2/3] rounded-lg overflow-hidden bg-card border transition-all duration-200",
              sel
                ? "border-primary ring-2 ring-primary/50"
                : "border-border/50 group-hover:border-primary/50"
            )}>
              {s.cover_image ? (
                <Image src={s.cover_image} alt={s.name} fill className="object-cover" sizes="20vw" />
              ) : (
                <div className="absolute inset-0 bg-muted" />
              )}
              <div className={clsx(
                "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                sel ? "opacity-100" : "opacity-0 group-hover:opacity-30"
              )}>
                <div className={clsx(
                  "h-7 w-7 rounded-full border-2 flex items-center justify-center transition-all",
                  sel
                    ? "bg-primary border-primary"
                    : "border-white/70 bg-black/30"
                )}>
                  {sel && <Check className="h-4 w-4 text-primary-foreground" />}
                </div>
              </div>
              {s.user_progress_pct > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                  <div className="h-full bg-primary" style={{ width: `${s.user_progress_pct}%` }} />
                </div>
              )}
            </div>
            <div className="mt-2 space-y-0.5">
              <p className="text-xs font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {s.localized_name || s.name}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
