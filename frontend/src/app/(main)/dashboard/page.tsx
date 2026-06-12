"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, BookOpen, TrendingUp, Library, Flame } from "lucide-react";
import { seriesApi, statsApi } from "@/lib/api";
import { SeriesCard } from "@/components/series/SeriesCard";
import { SeriesCardSkeleton } from "@/components/ui/Skeleton";
import type { Series, UserStats } from "@/types";

function computeStreak(history: Array<{ read_at: string }>): number {
  if (!history.length) return 0;
  const days = new Set(history.map((h) => h.read_at.slice(0, 10)));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (days.has(d.toISOString().slice(0, 10))) streak++;
    else if (i > 0) break;
  }
  return streak;
}

export default function DashboardPage() {
  const { data: recentSeries, isLoading: recentLoading } = useQuery({
    queryKey: ["series", "recent"],
    queryFn: () =>
      seriesApi
        .list({ ordering: "-created_at", page_size: 12 })
        .then((r) => r.data.results as Series[]),
  });

  const { data: inProgress, isLoading: progressLoading } = useQuery({
    queryKey: ["series", "in-progress"],
    queryFn: () =>
      seriesApi
        .list({ reading_status: "in_progress", ordering: "-last_modified", page_size: 6 })
        .then((r) => r.data.results as Series[]),
  });

  const { data: recentlyCompleted, isLoading: completedLoading } = useQuery({
    queryKey: ["series", "recently-completed"],
    queryFn: () =>
      seriesApi
        .list({ reading_status: "completed", ordering: "-last_modified", page_size: 6 })
        .then((r) => r.data.results as Series[]),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ["stats", "me"],
    queryFn: () => statsApi.me().then((r) => r.data),
  });

  const { data: history = [] } = useQuery({
    queryKey: ["stats", "history"],
    queryFn: () =>
      statsApi.history().then((r) => r.data.results as Array<{ read_at: string }>),
  });

  const streak = computeStreak(history);

  return (
    <div className="p-5 sm:p-8 space-y-10 max-w-screen-2xl">

      {/* Page heading */}
      <div>
        <h1 className="font-classic text-3xl font-medium tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Bem-vindo de volta</p>
      </div>

      {/* Streak banner */}
      {streak > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-md w-fit">
          <Flame className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-400">
              {streak} {streak === 1 ? "dia" : "dias"} seguidos
            </p>
            <p className="text-xs text-muted-foreground">Sequência de leitura ativa</p>
          </div>
        </div>
      )}

      {/* Stats */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/40 rounded-lg overflow-hidden border border-border/40">
          <StatCard
            icon={<BookOpen className="h-4 w-4" strokeWidth={1.75} />}
            label="Páginas Lidas"
            value={stats.total_pages_read.toLocaleString("pt-BR")}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" strokeWidth={1.75} />}
            label="Capítulos"
            value={stats.total_chapters_read.toLocaleString("pt-BR")}
          />
          <StatCard
            icon={<Library className="h-4 w-4" strokeWidth={1.75} />}
            label="Séries Lidas"
            value={stats.total_series_read.toLocaleString("pt-BR")}
          />
          <StatCard
            icon={<Clock className="h-4 w-4" strokeWidth={1.75} />}
            label="Horas de Leitura"
            value={`${stats.total_reading_hours}h`}
          />
        </div>
      )}

      {/* Continuar lendo */}
      <Section title="Continuar Lendo">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
          {progressLoading
            ? [1, 2, 3, 4, 5, 6].map((i) => <SeriesCardSkeleton key={i} />)
            : inProgress?.map((s) => <SeriesCard key={s.id} series={s} />)}
        </div>
      </Section>

      {/* Recém completados */}
      {(completedLoading || (recentlyCompleted && recentlyCompleted.length > 0)) && (
        <Section title="Recém Completados">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
            {completedLoading
              ? [1, 2, 3, 4, 5, 6].map((i) => <SeriesCardSkeleton key={i} />)
              : recentlyCompleted?.map((s) => <SeriesCard key={s.id} series={s} />)}
          </div>
        </Section>
      )}

      {/* Adicionados recentemente */}
      <Section title="Adicionados Recentemente">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
          {recentLoading
            ? [1, 2, 3, 4, 5, 6, 7, 8].map((i) => <SeriesCardSkeleton key={i} />)
            : recentSeries?.map((s) => <SeriesCard key={s.id} series={s} />)}
        </div>
      </Section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="font-classic text-3xl font-medium text-foreground mt-1.5 leading-none">
        {value}
      </p>
      <div className="mt-3 text-primary/70">{icon}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="section-rule">
        <h2 className="font-classic text-xl font-medium text-foreground shrink-0">{title}</h2>
      </div>
      {children}
    </section>
  );
}
