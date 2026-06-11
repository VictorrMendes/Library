"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, BookOpen, TrendingUp, Library } from "lucide-react";
import { seriesApi, statsApi, libraryApi } from "@/lib/api";
import { SeriesCard } from "@/components/series/SeriesCard";
import type { Series, UserStats } from "@/types";

export default function DashboardPage() {
  const { data: recentSeries } = useQuery({
    queryKey: ["series", "recent"],
    queryFn: () =>
      seriesApi.list({ ordering: "-created_at", page_size: 12 }).then((r) => r.data.results as Series[]),
  });

  const { data: inProgress } = useQuery({
    queryKey: ["series", "in-progress"],
    queryFn: () =>
      seriesApi.list({ ordering: "-last_modified", page_size: 6 }).then((r) => r.data.results as Series[]),
  });

  const { data: stats } = useQuery<UserStats>({
    queryKey: ["stats", "me"],
    queryFn: () => statsApi.me().then((r) => r.data),
  });

  const { data: libraries } = useQuery({
    queryKey: ["libraries"],
    queryFn: () => libraryApi.list().then((r) => r.data.results),
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 sm:space-y-8 max-w-screen-2xl">
      <div>
        <h1 className="text-2xl font-bold font-sans">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Bem-vindo de volta</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<BookOpen className="h-5 w-5" />}
            label="Páginas Lidas"
            value={stats.total_pages_read.toLocaleString("pt-BR")}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Capítulos Lidos"
            value={stats.total_chapters_read.toLocaleString("pt-BR")}
          />
          <StatCard
            icon={<Library className="h-5 w-5" />}
            label="Séries Lidas"
            value={stats.total_series_read.toLocaleString("pt-BR")}
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Horas de Leitura"
            value={`${stats.total_reading_hours}h`}
          />
        </div>
      )}

      {/* In progress */}
      {inProgress && inProgress.length > 0 && (
        <Section title="Continuar Lendo" href="/series?filter=in_progress">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
            {inProgress.map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        </Section>
      )}

      {/* Recently added */}
      {recentSeries && recentSeries.length > 0 && (
        <Section title="Adicionados Recentemente" href="/series">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
            {recentSeries.map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {href && (
          <a href={href} className="text-xs text-primary hover:underline">
            Ver todos
          </a>
        )}
      </div>
      {children}
    </section>
  );
}
