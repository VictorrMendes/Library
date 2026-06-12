"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Tag as TagIcon } from "lucide-react";
import { metaApi } from "@/lib/api";
import type { Genre } from "@/types";

const PALETTE = [
  "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20",
  "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20",
  "bg-green-500/10 text-green-400 hover:bg-green-500/20",
  "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20",
  "bg-pink-500/10 text-pink-400 hover:bg-pink-500/20",
  "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20",
  "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20",
  "bg-red-500/10 text-red-400 hover:bg-red-500/20",
];

export default function GenresPage() {
  const { data: genres = [], isLoading } = useQuery<Genre[]>({
    queryKey: ["genres"],
    queryFn: () => metaApi.genres().then((r) => r.data.results as Genre[]),
  });

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold font-sans">Gêneros</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isLoading ? "Carregando…" : `${genres.length} gêneros`}
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="h-9 rounded-full bg-muted animate-pulse" style={{ width: `${60 + Math.random() * 80}px` }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {genres.map((g, i) => (
            <Link
              key={g.id}
              href={`/search?genre=${encodeURIComponent(g.name)}`}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${PALETTE[i % PALETTE.length]}`}
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}

      {!isLoading && genres.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <TagIcon className="h-12 w-12 opacity-20 mb-3" />
          <p className="text-sm">Nenhum gênero encontrado.</p>
        </div>
      )}
    </div>
  );
}
