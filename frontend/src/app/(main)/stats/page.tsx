"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { BookOpen, TrendingUp, Library, Clock, Calendar, ArrowRight, Flame, Target, Plus, Trash2, BarChart2, Clock3 } from "lucide-react";
import { statsApi } from "@/lib/api";
import type { UserStats } from "@/types";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface ReadingGoal {
  id: number;
  period: "monthly" | "yearly";
  metric: "pages" | "chapters";
  target: number;
  year: number;
  month: number | null;
  progress: number;
}

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

function computeStreak(history: ReadingHistory[]): number {
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

export default function StatsPage() {
  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ["stats", "me"],
    queryFn: () => statsApi.me().then((r) => r.data),
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<ReadingHistory[]>({
    queryKey: ["stats", "history"],
    queryFn: () => statsApi.history().then((r) => r.data.results as ReadingHistory[]),
  });

  const streak = computeStreak(history);

  const queryClient = useQueryClient();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ period: "monthly", metric: "pages", target: "500" });

  const { data: heatmap } = useQuery({
    queryKey: ["stats", "heatmap"],
    queryFn: () => statsApi.heatmap().then((r) => r.data as {
      by_hour: Array<{ hour: number; count: number }>;
      by_weekday: Array<{ weekday: number; count: number }>;
    }),
  });

  const { data: activityData = [] } = useQuery<Array<{ date: string; pages: number }>>({
    queryKey: ["stats", "activity"],
    queryFn: () => statsApi.activity(90).then((r) => r.data),
  });

  const { data: goals = [] } = useQuery<ReadingGoal[]>({
    queryKey: ["stats", "goals"],
    queryFn: () => statsApi.goals().then((r) => r.data),
  });

  const createGoalMutation = useMutation({
    mutationFn: () => statsApi.createGoal({
      period: goalForm.period,
      metric: goalForm.metric,
      target: Number(goalForm.target),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stats", "goals"] });
      setShowGoalForm(false);
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (id: number) => statsApi.deleteGoal(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stats", "goals"] }),
  });

  const [last30, setLast30] = useState<Array<{ date: string; pages: number }>>([]);
  const [last90, setLast90] = useState<Array<{ date: string; pages: number }> | null>(null);

  useEffect(() => {
    const map = new Map<string, number>();
    history.forEach((h) => {
      const key = h.read_at.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + h.pages_read);
    });
    setLast30(
      Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const key = d.toISOString().slice(0, 10);
        return { date: key, pages: map.get(key) ?? 0 };
      })
    );
  }, [history]);

  useEffect(() => {
    if (!activityData.length) {
      setLast90(null);
      return;
    }
    const actMap = new Map(activityData.map((d) => [d.date, d.pages]));
    setLast90(
      Array.from({ length: 90 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (89 - i));
        const key = d.toISOString().slice(0, 10);
        return { date: key, pages: actMap.get(key) ?? 0 };
      })
    );
  }, [activityData]);

  const maxPages = Math.max(...last30.map((d) => d.pages), 1);
  const maxAct = last90 ? Math.max(...last90.map((d) => d.pages), 1) : 1;

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

      {/* Streak */}
      {streak > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-orange-500/10 border border-orange-500/20 rounded-xl w-fit">
          <Flame className="h-5 w-5 text-orange-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-400">{streak} {streak === 1 ? "dia" : "dias"} de sequência</p>
            <p className="text-xs text-muted-foreground">Você leu algo nos últimos {streak} dias consecutivos</p>
          </div>
        </div>
      )}

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

      {/* Reading goals */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Metas de leitura</h2>
          </div>
          <button
            onClick={() => setShowGoalForm((v) => !v)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Nova meta
          </button>
        </div>

        {showGoalForm && (
          <div className="flex flex-wrap gap-3 p-3 bg-muted/30 rounded-lg">
            <select
              value={goalForm.period}
              onChange={(e) => setGoalForm((f) => ({ ...f, period: e.target.value }))}
              className="px-2 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
            <select
              value={goalForm.metric}
              onChange={(e) => setGoalForm((f) => ({ ...f, metric: e.target.value }))}
              className="px-2 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="pages">Páginas</option>
              <option value="chapters">Capítulos</option>
            </select>
            <input
              type="number"
              value={goalForm.target}
              onChange={(e) => setGoalForm((f) => ({ ...f, target: e.target.value }))}
              placeholder="Meta"
              className="w-24 px-2 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => createGoalMutation.mutate()}
              disabled={createGoalMutation.isPending}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              Criar
            </button>
          </div>
        )}

        {goals.length === 0 && !showGoalForm ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma meta definida ainda.</p>
        ) : (
          <div className="space-y-3">
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((g.progress / g.target) * 100));
              return (
                <div key={g.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {g.period === "monthly" ? "Mensal" : "Anual"} — {g.metric === "pages" ? "Páginas" : "Capítulos"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{g.progress.toLocaleString("pt-BR")} / {g.target.toLocaleString("pt-BR")}</span>
                      <span className={pct >= 100 ? "text-green-400 font-semibold" : "text-primary"}>{pct}%</span>
                      <button onClick={() => deleteGoalMutation.mutate(g.id)} className="text-muted-foreground hover:text-red-400">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-green-500" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Daily chart — from activity endpoint (90 days) */}
      {last90 && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Páginas por dia — últimos 90 dias</h2>
          </div>
          <div className="flex items-end gap-px h-20">
            {last90.map((d) => {
              const pct = d.pages > 0 ? Math.max(4, (d.pages / maxAct) * 100) : 2;
              return (
                <div key={d.date} className="flex-1 group relative">
                  <div
                    className="w-full rounded-sm transition-all duration-300"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: d.pages > 0 ? "hsl(var(--primary))" : "hsl(var(--muted))",
                      opacity: d.pages > 0 ? 0.8 : 0.25,
                    }}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 pointer-events-none">
                    <div className="bg-popover border border-border rounded px-2 py-1 text-xs whitespace-nowrap shadow">
                      {d.date.slice(5)}: {d.pages}p
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>90 dias atrás</span>
            <span>Hoje</span>
          </div>
        </div>
      )}

      {/* Daily chart (from local history — always rendered) */}
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

      {/* Heatmap: reading by hour and weekday */}
      {heatmap && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Leitura por hora do dia</h2>
            </div>
            <div className="flex items-end gap-px h-16">
              {Array.from({ length: 24 }, (_, h) => {
                const found = heatmap.by_hour.find((x) => x.hour === h);
                const count = found?.count ?? 0;
                const maxCount = Math.max(...heatmap.by_hour.map((x) => x.count), 1);
                const pct = count > 0 ? Math.max(6, (count / maxCount) * 100) : 3;
                return (
                  <div key={h} className="flex-1 group relative">
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${pct}%`,
                        backgroundColor: count > 0 ? "hsl(var(--primary))" : "hsl(var(--muted))",
                        opacity: count > 0 ? 0.8 : 0.2,
                      }}
                    />
                    {count > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 pointer-events-none">
                        <div className="bg-popover border border-border rounded px-2 py-1 text-xs whitespace-nowrap shadow">
                          {h}h: {count}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>0h</span>
              <span>12h</span>
              <span>23h</span>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Leitura por dia da semana</h2>
            </div>
            <div className="flex items-end gap-2 h-16">
              {Array.from({ length: 7 }, (_, i) => {
                const dbWeekday = i + 1;
                const found = heatmap.by_weekday.find((x) => x.weekday === dbWeekday);
                const count = found?.count ?? 0;
                const maxCount = Math.max(...heatmap.by_weekday.map((x) => x.count), 1);
                const pct = count > 0 ? Math.max(6, (count / maxCount) * 100) : 3;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full group relative">
                      <div
                        className="w-full rounded-sm"
                        style={{
                          height: `${pct * 0.64}px`,
                          maxHeight: "52px",
                          backgroundColor: count > 0 ? "hsl(var(--primary))" : "hsl(var(--muted))",
                          opacity: count > 0 ? 0.8 : 0.2,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{WEEKDAY_LABELS[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
