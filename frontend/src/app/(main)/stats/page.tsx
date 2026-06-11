"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BookOpen, TrendingUp, Library, Clock, Calendar, ArrowRight } from "lucide-react";
import { statsApi } from "@/lib/api";
import type { UserStats } from "@/types";

interface ReadingHistory {
  id: number;
  series: { id: number; name: string; cover_image: string | null };
  chapter: { id: number; title_name: string } | null;
  pages_read: number;
  read_at: string;
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function StatsPage() {
  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ["stats", "me"],
    queryFn: () => statsApi.me().then((r) => r.data),
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<ReadingHistory[]>({
    queryKey: ["stats", "history"],
    queryFn: () => statsApi.history().then((r) => r.data.results as ReadingHistory[]),
  });

  // Group history by date for a simple bar chart (last 30 days)
  const dailyMap = new Map<string, number>();
  history.forEach((h) => {
    const key = h.read_at.slice(0, 10);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + h.pages_read);
  });

  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const key = d.toISOString().slice(0, 10);
    return { date: key, pages: dailyMap.get(key) ?? 0 };
  });

  const maxPages = Math.max(...last30.map((d) => d.pages), 1);

  // Series most read
  const seriesMap = new Map<number, { name: string; pages: number }>();
  history.forEach((h) => {
    if (!h.series) return;
    const existing = seriesMap.get(h.series.id);
    seriesMap.set(h.series.id, {
      name: h.series.name,
      pages: (existing?.pages ?? 0) + h.pages_read,
    });
  });
  const topSeries = Array.from(seriesMap.entries())
    .sort((a, b) => b[1].pages - a[1].pages)
    .slice(0, 5);
  const maxSeriesPages = topSeries[0]?.[1].pages ?? 1;

  return (
    <div className="p-6 space-y-8 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold font-sans">Estatísticas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Seu histórico de leitura.</p>
      </div>

      {/* Summary cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : stats ? (
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
            sub={`${stats.total_reading_time_minutes.toLocaleString("pt-BR")} minutos`}
          />
        </div>
      ) : null}

      {/* Daily chart */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Páginas por dia — últimos 30 dias</h2>
        </div>
        <div className="flex items-end gap-0.5 h-24">
          {last30.map((d) => {
            const pct = d.pages > 0 ? Math.max(4, (d.pages / maxPages) * 100) : 2;
            return (
              <div
                key={d.date}
                className="flex-1 group relative"
                title={`${d.date}: ${d.pages} páginas`}
              >
                <div
                  className="w-full rounded-sm transition-all duration-300"
                  style={{
                    height: `${pct}%`,
                    backgroundColor: d.pages > 0
                      ? "hsl(var(--primary))"
                      : "hsl(var(--muted))",
                    opacity: d.pages > 0 ? 0.8 : 0.3,
                  }}
                />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                  <div className="bg-popover border border-border rounded px-2 py-1 text-xs whitespace-nowrap shadow">
                    {d.date.slice(5)}: {d.pages}p
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>30 dias atrás</span>
          <span>Hoje</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top series */}
        {topSeries.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold">Séries mais lidas</h2>
            <div className="space-y-3">
              {topSeries.map(([seriesId, data]) => (
                <div key={seriesId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <Link
                      href={`/series/${seriesId}`}
                      className="font-medium hover:text-primary transition-colors truncate max-w-[200px]"
                    >
                      {data.name}
                    </Link>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {data.pages.toLocaleString("pt-BR")}p
                    </span>
                  </div>
                  <MiniBar value={data.pages} max={maxSeriesPages} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent history */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Histórico recente</h2>
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum histórico de leitura ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 10).map((h) => (
                <div key={h.id} className="flex items-center gap-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    {h.series && (
                      <Link
                        href={`/series/${h.series.id}`}
                        className="text-xs font-medium hover:text-primary transition-colors truncate block"
                      >
                        {h.series.name}
                      </Link>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {h.pages_read} páginas · {new Date(h.read_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {h.series && (
                    <Link href={`/series/${h.series.id}`}>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
