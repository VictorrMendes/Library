"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { Trash2, Loader2, Library } from "lucide-react";
import { collectionsApi } from "@/lib/api";
import { SHELF_OPTIONS } from "@/components/series/ShelfButton";
import type { ShelfStatus } from "@/components/series/ShelfButton";
import type { Series } from "@/types";
import { clsx } from "clsx";

interface ShelfItem {
  id: number;
  series_id: number;
  series: Series;
  status: ShelfStatus;
  added_at: string;
  updated_at: string;
}

const ALL_TAB = { value: "all" as const, label: "Todos" };

export default function MyShelfPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ShelfStatus | "all">("all");

  const { data: items = [], isLoading } = useQuery<ShelfItem[]>({
    queryKey: ["want-to-read"],
    queryFn: () =>
      collectionsApi.wantToRead().then((r) => r.data.results as ShelfItem[]),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => collectionsApi.removeWantToRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["want-to-read"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ShelfStatus }) =>
      collectionsApi.updateWantToRead(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["want-to-read"] }),
  });

  const tabs = [
    ALL_TAB,
    ...SHELF_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ];

  const filtered =
    activeTab === "all"
      ? items
      : items.filter((i) => i.status === activeTab);

  const countByStatus = (s: ShelfStatus) =>
    items.filter((i) => i.status === s).length;

  return (
    <div className="p-5 sm:p-8 space-y-6 max-w-screen-2xl">
      {/* Header */}
      <div>
        <h1 className="font-classic text-3xl font-medium tracking-tight">
          Minha Estante
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {items.length} {items.length === 1 ? "série" : "séries"} na sua estante
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/50 overflow-x-auto pb-px">
        {tabs.map((tab) => {
          const count =
            tab.value === "all"
              ? items.length
              : countByStatus(tab.value as ShelfStatus);
          const opt = SHELF_OPTIONS.find((o) => o.value === tab.value);
          const Icon = opt?.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value as ShelfStatus | "all")}
              className={clsx(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                activeTab === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {Icon && (
                <Icon
                  className={clsx(
                    "h-3.5 w-3.5 shrink-0",
                    activeTab === tab.value ? opt?.color : ""
                  )}
                  strokeWidth={1.75}
                />
              )}
              {tab.label}
              {count > 0 && (
                <span
                  className={clsx(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                    activeTab === tab.value
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[2/3] rounded-md bg-muted animate-pulse" />
              <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground space-y-3">
          <Library className="h-12 w-12 opacity-20" strokeWidth={1.5} />
          <p className="text-sm">
            {activeTab === "all"
              ? "Nenhuma série na sua estante ainda."
              : `Nenhuma série com status "${
                  SHELF_OPTIONS.find((o) => o.value === activeTab)?.label
                }".`}
          </p>
          <Link href="/search" className="text-sm text-primary hover:underline">
            Explorar séries
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-4">
          {filtered.map((item) => {
            const series = item.series;
            if (!series) return null;
            const opt = SHELF_OPTIONS.find((o) => o.value === item.status);
            const StatusIcon = opt?.icon;
            return (
              <div key={item.id} className="group relative">
                <Link href={`/series/${series.id}`} className="block">
                  <div className="relative aspect-[2/3] rounded-md overflow-hidden bg-card cover-glow">
                    {series.cover_image ? (
                      <Image
                        src={series.cover_image}
                        alt={series.name}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                        sizes="(max-width: 640px) 33vw, 12vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/images/placeholders/cover-missing-dark.png"
                          alt="Sem capa"
                          className="w-full h-full object-cover opacity-30"
                        />
                      </div>
                    )}

                    {/* Status badge */}
                    {opt && StatusIcon && (
                      <div className="absolute top-1.5 left-1.5">
                        <span
                          className={clsx(
                            "flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide",
                            "px-1.5 py-0.5 rounded-sm backdrop-blur-sm",
                            "bg-black/50 border border-white/10",
                            opt.color
                          )}
                        >
                          <StatusIcon className="h-2.5 w-2.5" strokeWidth={2} />
                          {opt.label}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 font-classic text-[13px] leading-snug line-clamp-2 text-foreground/90 group-hover:text-primary transition-colors">
                    {series.localized_name || series.name}
                  </p>
                </Link>

                {/* Quick status change on hover */}
                <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => removeMutation.mutate(item.id)}
                    disabled={removeMutation.isPending}
                    className="p-1.5 rounded-md bg-card/90 backdrop-blur-sm border border-border/60 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Remover da estante"
                  >
                    {removeMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                    )}
                  </button>
                </div>

                {/* Quick status cycle buttons */}
                <div className="mt-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {SHELF_OPTIONS.filter((o) => o.value !== item.status)
                    .slice(0, 3)
                    .map((o) => {
                      const OIcon = o.icon;
                      return (
                        <button
                          key={o.value}
                          onClick={() =>
                            updateMutation.mutate({
                              id: item.id,
                              status: o.value,
                            })
                          }
                          title={o.label}
                          className="flex-1 flex items-center justify-center py-1 rounded-sm bg-secondary hover:bg-accent transition-colors"
                        >
                          <OIcon
                            className={clsx("h-3 w-3", o.color)}
                            strokeWidth={1.75}
                          />
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
