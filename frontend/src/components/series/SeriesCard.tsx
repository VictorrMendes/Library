"use client";

import Link from "next/link";
import Image from "next/image";
import { clsx } from "clsx";
import type { Series } from "@/types";

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  ongoing: { label: "Em andamento", color: "bg-sky-500/20 text-sky-400 border border-sky-500/20" },
  completed: { label: "Completo", color: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" },
  hiatus: { label: "Hiato", color: "bg-amber-500/20 text-amber-400 border border-amber-500/20" },
  cancelled: { label: "Cancelado", color: "bg-red-500/20 text-red-400 border border-red-500/20" },
  ended: { label: "Encerrado", color: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/20" },
};

interface Props {
  series: Series;
  showStatus?: boolean;
}

export function SeriesCard({ series, showStatus = false }: Props) {
  const status = series.metadata?.publication_status;
  const badge = status ? STATUS_BADGE[status] : null;
  const pct = series.user_progress_pct ?? 0;

  return (
    <Link href={`/series/${series.id}`} className="group block">
      <div className="relative aspect-[2/3] rounded-md overflow-hidden bg-card cover-glow">
        {/* Cover image */}
        {series.cover_image ? (
          <Image
            src={series.cover_image}
            alt={series.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/placeholders/cover-missing-dark.png"
              alt="Sem capa"
              className="w-full h-full object-cover opacity-30"
            />
          </div>
        )}

        {/* Gradient veil for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Status badge */}
        {showStatus && badge && (
          <div className="absolute top-1.5 left-1.5">
            <span className={clsx(
              "text-[9px] font-semibold px-1.5 py-0.5 rounded-sm uppercase tracking-wide backdrop-blur-sm",
              badge.color
            )}>
              {badge.label}
            </span>
          </div>
        )}

        {/* Progress bar */}
        {pct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/30">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-2 space-y-0.5 px-0.5">
        <p className="font-classic text-[13px] leading-snug line-clamp-2 text-foreground/90 group-hover:text-primary transition-colors duration-150">
          {series.localized_name || series.name}
        </p>
        {series.metadata?.genres?.[0] && (
          <p className="text-[11px] text-muted-foreground/70 truncate">
            {series.metadata.genres[0].name}
          </p>
        )}
      </div>
    </Link>
  );
}
