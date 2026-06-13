"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { User, BookOpen, Loader2 } from "lucide-react";
import { peopleApi } from "@/lib/api";
import { SeriesCard } from "@/components/series/SeriesCard";
import type { Series } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  writer: "Escritor(a)",
  penciller: "Desenhista",
  inker: "Arte-finalista",
  colorist: "Colorista",
  cover_artist: "Capa",
  editor: "Editor(a)",
  translator: "Tradutor(a)",
  publisher: "Editora",
  character: "Personagem",
  imprint: "Selo",
};

interface Person {
  id: number;
  name: string;
  role: string;
  cover_image: string | null;
  description: string;
  series_count: number;
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();

  const { data: person, isLoading } = useQuery<Person>({
    queryKey: ["person", id],
    queryFn: () => peopleApi.get(Number(id)).then((r) => r.data),
  });

  const { data: series = [] } = useQuery<Series[]>({
    queryKey: ["person", id, "series"],
    queryFn: () => peopleApi.series(Number(id)).then((r) => r.data),
    enabled: !!person,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!person) return null;

  return (
    <div className="p-6 space-y-8 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-start gap-6">
        <div className="relative h-28 w-28 shrink-0 rounded-full overflow-hidden bg-card border-2 border-border shadow-lg">
          {person.cover_image ? (
            <Image
              src={person.cover_image}
              alt={person.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <User className="h-10 w-10 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-classic text-3xl font-medium tracking-tight">
              {person.name}
            </h1>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/15 text-primary">
              {ROLE_LABELS[person.role] ?? person.role}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            <span>{person.series_count} obra{person.series_count !== 1 ? "s" : ""}</span>
          </div>
          {person.description && (
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {person.description}
            </p>
          )}
        </div>
      </div>

      {/* Series grid */}
      {series.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-semibold text-lg">Obras</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {series.map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        </section>
      )}

      {series.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Nenhuma obra encontrada.</p>
        </div>
      )}
    </div>
  );
}
