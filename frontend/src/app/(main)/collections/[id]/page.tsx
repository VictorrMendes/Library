"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { collectionsApi } from "@/lib/api";
import { SeriesGrid } from "@/components/series/SeriesGrid";
import type { Collection, Series } from "@/types";

interface CollectionDetail extends Collection {
  series: Series[];
}

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: collection, isLoading } = useQuery<CollectionDetail>({
    queryKey: ["collection", id],
    queryFn: () => collectionsApi.get(Number(id)).then((r) => r.data),
    enabled: !!id,
  });

  const series = collection?.series ?? [];

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl">
      <Link
        href="/collections"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Coleções
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FolderOpen className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-sans">
            {collection?.title ?? "Coleção"}
          </h1>
          {collection?.summary && (
            <p className="text-sm text-muted-foreground mt-0.5">{collection.summary}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading ? "Carregando…" : `${series.length} séries`}
          </p>
        </div>
      </div>

      <SeriesGrid series={series} loading={isLoading} />
    </div>
  );
}
