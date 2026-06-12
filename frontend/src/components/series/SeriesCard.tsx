"use client";

import Link from "next/link";
import Image from "next/image";
import { clsx } from "clsx";
import type { Series } from "@/types";

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  ongoing: { label: "Em andamento", color: "bg-blue-500/20 text-blue-400" },
  completed: { label: "Completo", color: "bg-green-500/20 text-green-400" },
  hiatus: { label: "Hiato", color: "bg-yellow-500/20 text-yellow-400" },
  cancelled: { label: "Cancelado", color: "bg-red-500/20 text-red-400" },
  ended: { label: "Encerrado", color: "bg-gray-500/20 text-gray-400" },
};

interface Props {
  series: Series;
  showStatus?: boolean;
}

export function SeriesCard({ series, showStatus = false }: Props) {
  const status = series.metadata?.publication_status;
  const badge = status ? STATUS_BADGE[status] : null;

  return (
    <Link
      href={`/series/${series.id}`}
      className="group block"
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card border border-border/50 transition-all duration-200 group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/10 group-hover:-translate-y-0.5">
        {series.cover_image ? (
          <Image
            src={series.cover_image}
            alt={series.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw"
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

        {showStatus && badge && (
          <div className="absolute top-1.5 left-1.5">
            <span className={clsx("text-[10px] font-medium px-1.5 py-0.5 rounded-full", badge.color)}>
              {badge.label}
            </span>
          </div>
        )}

        {series.user_progress_pct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${series.user_progress_pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-2 space-y-0.5">
        <p className="text-xs font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {series.localized_name || series.name}
        </p>
        {series.metadata?.genres?.[0] && (
          <p className="text-[11px] text-muted-foreground truncate">
            {series.metadata.genres[0].name}
          </p>
        )}
      </div>
    </Link>
  );
}
