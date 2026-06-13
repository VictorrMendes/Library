"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Clock, BookOpen, TrendingUp, Library, Flame, Settings2, Check, GripVertical } from "lucide-react";
import { Reorder } from "framer-motion";
import { seriesApi, statsApi, authApi } from "@/lib/api";
import { SeriesCard } from "@/components/series/SeriesCard";
import { SeriesCardSkeleton } from "@/components/ui/Skeleton";
import { useAuthStore } from "@/store/auth";
import type { Series, UserStats } from "@/types";
import { clsx } from "clsx";

const ALL_SECTIONS = [
  { key: "in_progress", label: "Continuar Lendo" },
  { key: "recently_completed", label: "Recém Completados" },
  { key: "recently_added", label: "Adicionados Recentemente" },
] as const;

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
  const { user, setUser } = useAuthStore();
  const [showCustomize, setShowCustomize] = useState(false);
  const customizeRef = useRef<HTMLDivElement>(null);

  const defaultOrder = ALL_SECTIONS.map((s) => s.key);
  const activeSections: string[] =
    user?.dashboard_sections?.length ? user.dashboard_sections : defaultOrder;

  const [sectionOrder, setSectionOrder] = useState<string[]>(activeSections);

  useEffect(() => {
    setSectionOrder(activeSections);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.dashboard_sections?.join(",")]);

  const { mutate: savePrefs } = useMutation({
    mutationFn: (sections: string[]) =>
      authApi.updatePreferences({ dashboard_sections: sections } as Record<string, unknown>),
    onSuccess: async () => {
      const { data: fresh } = await authApi.me();
      setUser(fresh);
    },
  });

  function toggleSection(key: string) {
    const next = sectionOrder.includes(key)
      ? sectionOrder.filter((s) => s !== key)
      : [...sectionOrder, key];
    setSectionOrder(next);
    savePrefs(next);
  }

  function handleReorder(newOrder: string[]) {
    setSectionOrder(newOrder);
    savePrefs(newOrder);
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) {
        setShowCustomize(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-classic text-3xl font-medium tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Bem-vindo de volta</p>
        </div>
        <div className="relative" ref={customizeRef}>
          <button
            onClick={() => setShowCustomize((v) => !v)}
            title="Personalizar seções"
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              showCustomize
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Personalizar
          </button>
          {showCustomize && (
            <div className="absolute right-0 top-9 z-50 w-60 bg-card border border-border rounded-xl p-3 shadow-xl space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 pb-1">
                Arraste para reordenar
              </p>
              <Reorder.Group axis="y" values={sectionOrder} onReorder={handleReorder} className="space-y-0.5">
                {sectionOrder.map((key) => {
                  const section = ALL_SECTIONS.find((s) => s.key === key);
                  if (!section) return null;
                  const active = sectionOrder.includes(key);
                  return (
                    <Reorder.Item
                      key={key}
                      value={key}
                      className={clsx(
                        "flex items-center gap-2 px-2 py-2 rounded-lg text-sm cursor-grab active:cursor-grabbing transition-colors select-none",
                        active ? "text-foreground bg-accent/40" : "text-muted-foreground"
                      )}
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      <span className="flex-1">{section.label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSection(key); }}
                        className="p-0.5 rounded hover:bg-accent"
                      >
                        <Check className={clsx("h-3.5 w-3.5", active ? "text-primary" : "text-transparent")} />
                      </button>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </div>
          )}
        </div>
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

      {/* Dynamic sections in user-defined order */}
      {sectionOrder.map((key) => {
        if (key === "in_progress") return (
          <Section key="in_progress" title="Continuar Lendo">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
              {progressLoading
                ? [1, 2, 3, 4, 5, 6].map((i) => <SeriesCardSkeleton key={i} />)
                : inProgress?.map((s) => <SeriesCard key={s.id} series={s} />)}
            </div>
          </Section>
        );
        if (key === "recently_completed" && (completedLoading || (recentlyCompleted && recentlyCompleted.length > 0))) return (
          <Section key="recently_completed" title="Recém Completados">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
              {completedLoading
                ? [1, 2, 3, 4, 5, 6].map((i) => <SeriesCardSkeleton key={i} />)
                : recentlyCompleted?.map((s) => <SeriesCard key={s.id} series={s} />)}
            </div>
          </Section>
        );
        if (key === "recently_added") return (
          <Section key="recently_added" title="Adicionados Recentemente">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
              {recentLoading
                ? [1, 2, 3, 4, 5, 6, 7, 8].map((i) => <SeriesCardSkeleton key={i} />)
                : recentSeries?.map((s) => <SeriesCard key={s.id} series={s} />)}
            </div>
          </Section>
        );
        return null;
      })}
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
