"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, Tag as TagIcon } from "lucide-react";
import { metaApi } from "@/lib/api";
import type { Tag } from "@/types";

export default function TagsPage() {
  const [search, setSearch] = useState("");

  const { data: tags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: () => metaApi.tags().then((r) => r.data.results as Tag[]),
  });

  const filtered = search.trim()
    ? tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : tags;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold font-sans">Tags</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isLoading ? "Carregando…" : `${tags.length} tags`}
        </p>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar tags…"
          className="w-full pl-9 pr-4 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-muted animate-pulse" style={{ width: `${50 + Math.random() * 70}px` }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <TagIcon className="h-12 w-12 opacity-20 mb-3" />
          <p className="text-sm">Nenhuma tag encontrada.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/search?tag=${encodeURIComponent(t.name)}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              <TagIcon className="h-3 w-3 shrink-0" />
              {t.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
