"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, BookOpen, TrendingUp, Library, Flame } from "lucide-react";
import { seriesApi, statsApi } from "@/lib/api";
import { SeriesCard } from "@/components/series/SeriesCard";
import { SeriesCardSkeleton, StatCardSkeleton } from "@/components/ui/Skeleton";
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
      seriesApi.list({ ordering: "-created_at", page_size: 12 }).then((r) => r.data.results as Series[]),
  });

  const { data: inProgress, isLoading: progressLoading } = useQuery({
    queryKey: ["series", "in-progress"],
    queryFn: () =>
      seriesApi.list({ reading_status: "in_progress", ordering: "-last_modified", page_size: 6 }).then((r) => r.data.results as Series[]),
  });

  const { data: recentlyCompleted, isLoading: completedLoading } = useQuery({
    queryKey: ["series", "recently-completed"],
    queryFn: () =>
      seriesApi.list({ reading_status: "completed", ordering: "-last_modified", page_size: 6 }).then((r) => r.data.results as Series[]),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ["stats", "me"],
    queryFn: () => statsApi.me().then((r) => r.data),
  });

  const { data: history = [] } = useQuery({
    queryKey: ["stats", "history"],
    queryFn: () => statsApi.history().then((r) => r.data.results as Array<{ read_at: string }>),
  });

  const streak = computeStreak(history);

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading
          ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
          : stats
          ? <>
              <StatCard icon={<BookOpen className="h-5 w-5" />} label="Páginas Lidas" value={stats.total_pages_read.toLocaleString("pt-BR")} />
              <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Capítulos Lidos" value={stats.total_chapters_read.toLocaleString("pt-BR")} />
              <StatCard icon={<Library className="h-5 w-5" />} label="Séries Lidas" value={stats.total_series_read.toLocaleString("pt-BR")} />
              <StatCard icon={<Clock className="h-5 w-5" />} label="Horas de Leitura" value={`${stats.total_reading_hours}h`} />
            </>
          : null}
      </div>

      {/* Streak */}
      {streak > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-orange-500/10 border border-orange-500/20 rounded-xl w-fit">
          <Flame className="h-5 w-5 text-orange-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-400">{streak} {streak === 1 ? "dia" : "dias"} seguidos</p>
            <p className="text-xs text-muted-foreground">Sequência de leitura ativa</p>
          </div>
        </div>
      )}

      {/* In progress */}
      <Section title="Continuar Lendo">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
          {progressLoading
            ? [1, 2, 3, 4, 5, 6].map((i) => <SeriesCardSkeleton key={i} />)
            : inProgress?.map((s) => <SeriesCard key={s.id} series={s} />)}
        </div>
      </Section>

      {/* Recently completed */}
      {(completedLoading || (recentlyCompleted && recentlyCompleted.length > 0)) && (
        <Section title="Recém Completados">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
            {completedLoading
              ? [1, 2, 3, 4, 5, 6].map((i) => <SeriesCardSkeleton key={i} />)
              : recentlyCompleted?.map((s) => <SeriesCard key={s.id} series={s} />)}
          </div>
        </Section>
      )}

      {/* Recently added */}
      <Section title="Adicionados Recentemente">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
          {recentLoading
            ? [1, 2, 3, 4, 5, 6, 7, 8].map((i) => <SeriesCardSkeleton key={i} />)
            : recentSeries?.map((s) => <SeriesCard key={s.id} series={s} />)}
        </div>
      </Section>
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
