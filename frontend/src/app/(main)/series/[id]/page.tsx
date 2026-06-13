"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  BookOpen, Clock, ChevronRight, Play, Tag, Trash2, Loader2, Camera, Star,
} from "lucide-react";
import { seriesApi, readerApi, collectionsApi, ratingsApi, statsApi } from "@/lib/api";
import { ShelfButton } from "@/components/series/ShelfButton";
import type { ShelfStatus } from "@/components/series/ShelfButton";
import { SeriesDetailSkeleton } from "@/components/ui/Skeleton";
import { SeriesCard } from "@/components/series/SeriesCard";
import type { Series, SeriesRelation, Volume } from "@/types";
import { clsx } from "clsx";

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Em andamento",
  completed: "Completo",
  hiatus: "Hiato",
  cancelled: "Cancelado",
  ended: "Encerrado",
  unknown: "Desconhecido",
};

const AGE_RATING_LABELS: Record<number, string> = {
  1: "E", 2: "T", 3: "M", 4: "18+",
};
const AGE_RATING_COLORS: Record<number, string> = {
  1: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  2: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  3: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  4: "bg-red-500/15 text-red-400 border border-red-500/20",
};
const RELATION_LABELS: Record<SeriesRelation["relation_type"], string> = {
  sequel: "Sequência",
  prequel: "Prelúdio",
  spin_off: "Spin-off",
  adaptation: "Adaptação",
  alternative: "Alternativo",
  contains: "Contém",
  side_story: "História paralela",
};

const STATUS_COLORS: Record<string, string> = {
  ongoing: "bg-sky-500/15 text-sky-400 border border-sky-500/20",
  completed: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  hiatus: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  cancelled: "bg-red-500/15 text-red-400 border border-red-500/20",
  ended: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20",
  unknown: "bg-muted text-muted-foreground border border-border",
};

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data: series, isLoading } = useQuery<Series>({
    queryKey: ["series", id],
    queryFn: () => seriesApi.get(Number(id)).then((r) => r.data),
  });

  const { data: volumes } = useQuery<Volume[]>({
    queryKey: ["series", id, "volumes"],
    queryFn: () => seriesApi.volumes(Number(id)).then((r) => r.data),
    enabled: !!series,
  });

  const { data: progress } = useQuery({
    queryKey: ["progress", "series", id],
    queryFn: () => readerApi.seriesProgress(Number(id)).then((r) => r.data),
    enabled: !!series,
  });

  const { data: shelfItems = [] } = useQuery<
    Array<{ id: number; status: ShelfStatus }>
  >({
    queryKey: ["shelf", id],
    queryFn: () =>
      collectionsApi
        .wantToRead({ series_id: id })
        .then((r) => r.data.results),
    enabled: !!series,
  });

  const shelfItem = shelfItems[0] ?? null;

  const shelfAddMutation = useMutation({
    mutationFn: (s: ShelfStatus) =>
      collectionsApi.addWantToRead(Number(id), s),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shelf", id] }),
  });

  const shelfUpdateMutation = useMutation({
    mutationFn: ({ itemId, s }: { itemId: number; s: ShelfStatus }) =>
      collectionsApi.updateWantToRead(itemId, s),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shelf", id] }),
  });

  const shelfRemoveMutation = useMutation({
    mutationFn: (itemId: number) => collectionsApi.removeWantToRead(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shelf", id] }),
  });

  const [ratingScore, setRatingScore] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingReview, setRatingReview] = useState("");
  const [showRatingForm, setShowRatingForm] = useState(false);

  const { data: ratings = [], refetch: refetchRatings } = useQuery<
    Array<{ id: number; user_id: number; username: string; score: number; review: string; created_at: string }>
  >({
    queryKey: ["ratings", id],
    queryFn: () => ratingsApi.list(Number(id)).then((r) => r.data.results ?? r.data),
    enabled: !!series,
  });

  const submitRatingMutation = useMutation({
    mutationFn: () =>
      ratingsApi.create({ series_id: Number(id), score: ratingScore, review: ratingReview }),
    onSuccess: () => {
      refetchRatings();
      queryClient.invalidateQueries({ queryKey: ["series", id] });
      setShowRatingForm(false);
    },
  });

  const [editMeta, setEditMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({
    summary: "", publication_status: "", release_year: "", language: "",
  });

  function openEditMeta() {
    setMetaForm({
      summary: series?.metadata?.summary ?? "",
      publication_status: series?.metadata?.publication_status ?? "",
      release_year: String(series?.metadata?.release_year ?? ""),
      language: series?.metadata?.language ?? "",
    });
    setEditMeta(true);
  }

  const updateMetaMutation = useMutation({
    mutationFn: () =>
      seriesApi.updateMetadata(Number(id), {
        summary: metaForm.summary,
        publication_status: metaForm.publication_status || undefined,
        release_year: metaForm.release_year ? Number(metaForm.release_year) : null,
        language: metaForm.language,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series", id] });
      setEditMeta(false);
    },
  });

  const fetchMetaMutation = useMutation({
    mutationFn: () => seriesApi.fetchMetadata(Number(id)),
    onSuccess: (res) => {
      const d = res.data;
      setMetaForm((f) => ({
        ...f,
        summary: d.summary || f.summary,
        release_year: d.release_year ? String(d.release_year) : f.release_year,
        language: d.language || f.language,
      }));
    },
  });

  const firstGenre = series?.metadata?.genres?.[0]?.name;
  const { data: similar } = useQuery<Series[]>({
    queryKey: ["series", "similar", id, firstGenre],
    queryFn: () =>
      seriesApi
        .list({ genre: firstGenre, page_size: 7 })
        .then((r) => (r.data.results as Series[]).filter((s) => s.id !== Number(id)).slice(0, 6)),
    enabled: !!firstGenre,
  });

  const deleteMutation = useMutation({
    mutationFn: () => seriesApi.delete(Number(id)),
    onSuccess: () => router.push("/dashboard"),
  });

  const { data: estimate } = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => statsApi.estimate(Number(id)).then((r) => r.data as {
      remaining_pages: number; estimated_days: number; avg_pages_per_day: number;
    }),
    enabled: !!series,
  });

  const { data: anilistMeta } = useQuery({
    queryKey: ["anilist-meta", id],
    queryFn: () => seriesApi.anilistMetadata(Number(id)).then((r) => r.data),
    enabled: !!(series?.anilist_id),
    retry: false,
  });

  const coverMutation = useMutation({
    mutationFn: (file: File) => seriesApi.uploadCover(Number(id), file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["series", id] }),
  });

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) coverMutation.mutate(file);
  }

  const handleContinue = async () => {
    try {
      const { data } = await readerApi.continuePoint(Number(id));
      if (!data.chapter_id) return;
      const startPage = data.pages_read > 1 ? data.pages_read - 1 : 0;
      router.push(`/reader/${data.chapter_id}?page=${startPage}`);
    } catch {
      // series has no chapters yet
    }
  };

  if (isLoading) return <SeriesDetailSkeleton />;
  if (!series) return null;

  const meta = series.metadata;
  const writers = meta?.people?.filter((p) => p.role === "writer") ?? [];
  const artists = meta?.people?.filter((p) => p.role === "penciller") ?? [];
  const totalChapters = volumes?.reduce((acc, v) => acc + v.chapters.length, 0) ?? 0;
  const statusColor = meta?.publication_status ? STATUS_COLORS[meta.publication_status] : null;

  return (
    <div className="min-h-screen">
      {/* Blurred hero */}
      <div className="relative h-52 sm:h-80 overflow-hidden">
        {series.cover_image && (
          <Image
            src={series.cover_image}
            alt={series.name}
            fill
            className="object-cover blur-2xl scale-110 opacity-25"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-28 sm:-mt-44 relative z-10 pb-16">
        <div className="flex gap-5 sm:gap-7">
          {/* Cover */}
          <div className="shrink-0 w-28 h-40 sm:w-40 sm:h-56 relative group">
            <div className="rounded-md overflow-hidden shadow-2xl shadow-black/60 w-full h-full border border-white/5">
              {series.cover_image ? (
                <Image
                  src={series.cover_image}
                  alt={series.name}
                  width={160}
                  height={224}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                </div>
              )}
            </div>
            <button
              onClick={() => coverInputRef.current?.click()}
              disabled={coverMutation.isPending}
              title="Alterar capa"
              className="absolute inset-0 rounded-md bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              {coverMutation.isPending
                ? <Loader2 className="h-6 w-6 text-white animate-spin" />
                : <Camera className="h-6 w-6 text-white" strokeWidth={1.5} />}
            </button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverChange}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-12 sm:pt-20">
            <h1 className="font-classic text-2xl sm:text-3xl font-medium leading-tight tracking-tight">
              {series.localized_name || series.name}
            </h1>
            {series.original_name && series.original_name !== series.name && (
              <p className="text-sm text-muted-foreground mt-0.5 font-classic">
                {series.original_name}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {meta?.publication_status && statusColor && (
                <span className={clsx(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-sm uppercase tracking-wide",
                  statusColor
                )}>
                  {STATUS_LABELS[meta.publication_status]}
                </span>
              )}
              {meta?.release_year && (
                <span className="text-xs text-muted-foreground">{meta.release_year}</span>
              )}
              {meta?.language && (
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  {meta.language}
                </span>
              )}
              {meta?.age_rating != null && meta.age_rating > 0 && AGE_RATING_LABELS[meta.age_rating] && (
                <span className={clsx(
                  "text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide",
                  AGE_RATING_COLORS[meta.age_rating]
                )}>
                  {AGE_RATING_LABELS[meta.age_rating]}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{totalChapters} capítulos</span>
              {series.avg_hours_to_read > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" strokeWidth={1.75} />
                  {series.avg_hours_to_read.toFixed(1)}h
                </span>
              )}
              {estimate && estimate.remaining_pages > 0 && (
                <span className="text-xs text-primary/80 flex items-center gap-1" title="Estimativa de conclusão baseada no seu ritmo de leitura">
                  <Clock className="h-3 w-3" strokeWidth={1.75} />
                  ~{estimate.estimated_days}d restantes
                </span>
              )}
            </div>

            <div className="flex gap-2 mt-5 flex-wrap">
              <button
                onClick={handleContinue}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Continuar
              </button>
              <ShelfButton
                currentStatus={shelfItem?.status ?? null}
                shelfId={shelfItem?.id ?? null}
                onAdd={(s) => shelfAddMutation.mutate(s)}
                onUpdate={(itemId, s) =>
                  shelfUpdateMutation.mutate({ itemId, s })
                }
                onRemove={(itemId) => shelfRemoveMutation.mutate(itemId)}
                loading={
                  shelfAddMutation.isPending ||
                  shelfUpdateMutation.isPending ||
                  shelfRemoveMutation.isPending
                }
              />
              <button
                onClick={openEditMeta}
                className="px-4 py-2 rounded-md bg-secondary border border-border/60 text-sm font-medium hover:bg-accent transition-colors"
              >
                Editar
              </button>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary border border-border/60 text-sm font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                Apagar
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        {meta?.summary && (
          <div className="mt-10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Sinopse
            </p>
            <p className="font-classic text-base leading-relaxed text-foreground/80 max-w-2xl">
              {meta.summary}
            </p>
          </div>
        )}

        {/* Meta grid */}
        {(writers.length > 0 || artists.length > 0) && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-5 border-t border-border/50 pt-6">
            {writers.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                  Escritor
                </p>
                <p className="text-sm font-medium">{writers.map((w) => w.name).join(", ")}</p>
              </div>
            )}
            {artists.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                  Arte
                </p>
                <p className="text-sm font-medium">{artists.map((a) => a.name).join(", ")}</p>
              </div>
            )}
          </div>
        )}

        {/* Genres + Tags */}
        {((meta?.genres?.length ?? 0) > 0 || (meta?.tags?.length ?? 0) > 0) && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {meta?.genres?.map((g) => (
              <span key={g.id} className="text-[11px] px-2.5 py-1 rounded-sm bg-primary/10 text-primary border border-primary/15">
                {g.name}
              </span>
            ))}
            {meta?.tags?.map((t) => (
              <span key={t.id} className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-sm bg-secondary text-secondary-foreground border border-border/50">
                <Tag className="h-2.5 w-2.5" strokeWidth={1.75} />
                {t.name}
              </span>
            ))}
          </div>
        )}

        {/* Ratings */}
        <div className="mt-12">
          <div className="section-rule mb-5">
            <h2 className="font-classic text-xl font-medium shrink-0">Avaliações</h2>
            <div className="flex items-center gap-3 ml-auto">
              {(series as Record<string, unknown>).avg_score != null && (
                <span className="flex items-center gap-1 text-sm font-semibold text-amber-400">
                  <Star className="h-4 w-4 fill-amber-400" />
                  {((series as Record<string, unknown>).avg_score as number).toFixed(1)}
                  <span className="text-muted-foreground font-normal text-xs">
                    ({(series as Record<string, unknown>).rating_count as number})
                  </span>
                </span>
              )}
              <button
                onClick={() => setShowRatingForm((v) => !v)}
                className="text-xs text-primary hover:underline"
              >
                Avaliar
              </button>
            </div>
          </div>

          {showRatingForm && (
            <div className="mb-6 bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onMouseEnter={() => setRatingHover(n)}
                    onMouseLeave={() => setRatingHover(0)}
                    onClick={() => setRatingScore(n)}
                    className="p-0.5"
                  >
                    <Star
                      className={clsx(
                        "h-5 w-5 transition-colors",
                        n <= (ratingHover || ratingScore)
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground"
                      )}
                    />
                  </button>
                ))}
                {ratingScore > 0 && (
                  <span className="ml-2 text-sm font-semibold text-amber-400">{ratingScore}/10</span>
                )}
              </div>
              <textarea
                value={ratingReview}
                onChange={(e) => setRatingReview(e.target.value)}
                placeholder="Escreva uma review (opcional)..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowRatingForm(false)}
                  className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => submitRatingMutation.mutate()}
                  disabled={ratingScore === 0 || submitRatingMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {submitRatingMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Publicar avaliação
                </button>
              </div>
            </div>
          )}

          {ratings.length > 0 ? (
            <div className="space-y-3">
              {ratings.slice(0, 5).map((r) => (
                <div key={r.id} className="bg-card border border-border/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold">
                        {r.username[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">{r.username}</span>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-semibold text-amber-400">
                      <Star className="h-3.5 w-3.5 fill-amber-400" />
                      {r.score}/10
                    </span>
                  </div>
                  {r.review && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{r.review}</p>
                  )}
                  <p className="text-xs text-muted-foreground/60">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma avaliação ainda. Seja o primeiro a avaliar!
            </p>
          )}
        </div>

        {/* AniList metadata */}
        {anilistMeta && (
          <div className="mt-12">
            <div className="section-rule mb-5">
              <h2 className="font-classic text-xl font-medium shrink-0">Dados AniList</h2>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {anilistMeta.averageScore != null && (
                <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                  <span className="font-medium">{anilistMeta.averageScore / 10}</span>
                  <span className="text-xs text-muted-foreground">/ 10</span>
                </div>
              )}
              {anilistMeta.popularity != null && (
                <div className="bg-card border border-border rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground">Popularidade</p>
                  <p className="font-medium">{anilistMeta.popularity.toLocaleString("pt-BR")}</p>
                </div>
              )}
              {anilistMeta.favourites != null && (
                <div className="bg-card border border-border rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground">Favoritos</p>
                  <p className="font-medium">{anilistMeta.favourites.toLocaleString("pt-BR")}</p>
                </div>
              )}
            </div>
            {anilistMeta.recommendations?.nodes?.length > 0 && (
              <div className="mt-5">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mb-3">Recomendados pelo AniList</p>
                <div className="flex gap-3 flex-wrap">
                  {anilistMeta.recommendations.nodes.slice(0, 6).map((node: {
                    mediaRecommendation?: { id: number; title: { romaji: string }; coverImage: { medium: string } }
                  }) => {
                    const rec = node.mediaRecommendation;
                    if (!rec) return null;
                    return (
                      <div key={rec.id} className="flex flex-col items-center gap-1 w-20">
                        {rec.coverImage?.medium && (
                          <img src={rec.coverImage.medium} alt={rec.title.romaji} className="w-16 h-24 object-cover rounded" />
                        )}
                        <p className="text-[10px] text-center text-muted-foreground line-clamp-2">{rec.title.romaji}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Related series */}
        {series.relations && series.relations.length > 0 && (
          <div className="mt-12">
            <div className="section-rule mb-5">
              <h2 className="font-classic text-xl font-medium shrink-0">Séries relacionadas</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {series.relations.map((rel) => (
                <a
                  key={rel.id}
                  href={`/series/${rel.target_id}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 hover:border-primary/40 hover:bg-accent/30 transition-colors group min-w-0 w-full sm:w-auto"
                >
                  {rel.target_cover ? (
                    <img
                      src={rel.target_cover}
                      alt={rel.target_name}
                      className="w-10 h-14 object-cover rounded shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-muted rounded shrink-0 flex items-center justify-center">
                      <BookOpen className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-primary font-medium uppercase tracking-wide mb-0.5">
                      {RELATION_LABELS[rel.relation_type]}
                    </p>
                    <p className="text-sm font-medium truncate group-hover:text-foreground">
                      {rel.target_name}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Similar series */}
        {similar && similar.length > 0 && (
          <div className="mt-12">
            <div className="section-rule mb-5">
              <h2 className="font-classic text-xl font-medium shrink-0">Séries similares</h2>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {similar.map((s) => (
                <SeriesCard key={s.id} series={s} />
              ))}
            </div>
          </div>
        )}

        {/* Volumes + Chapters */}
        {volumes && volumes.length > 0 && (
          <div className="mt-12">
            <div className="section-rule mb-5">
              <h2 className="font-classic text-xl font-medium shrink-0">Volumes e Capítulos</h2>
            </div>
            <div className="space-y-2">
              {volumes.map((vol) => (
                <VolumeAccordion key={vol.id} volume={vol} progress={progress ?? []} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit metadata modal */}
      {editMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEditMeta(false)} />
          <div className="relative bg-card border border-border/60 rounded-lg p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-classic text-lg font-medium">Editar metadados</h2>
              <button
                onClick={() => fetchMetaMutation.mutate()}
                disabled={fetchMetaMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-accent transition-colors disabled:opacity-60"
              >
                {fetchMetaMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Buscar online
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block uppercase tracking-wide">
                  Sinopse
                </label>
                <textarea
                  value={metaForm.summary}
                  onChange={(e) => setMetaForm((f) => ({ ...f, summary: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1.5 block uppercase tracking-wide">
                    Status
                  </label>
                  <select
                    value={metaForm.publication_status}
                    onChange={(e) => setMetaForm((f) => ({ ...f, publication_status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">—</option>
                    {["ongoing", "completed", "hiatus", "cancelled", "ended"].map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1.5 block uppercase tracking-wide">
                    Ano
                  </label>
                  <input
                    type="number"
                    value={metaForm.release_year}
                    onChange={(e) => setMetaForm((f) => ({ ...f, release_year: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block uppercase tracking-wide">
                  Idioma
                </label>
                <input
                  value={metaForm.language}
                  onChange={(e) => setMetaForm((f) => ({ ...f, language: e.target.value }))}
                  placeholder="pt, en, ja…"
                  className="w-full px-3 py-2 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            {updateMetaMutation.isError && (
              <p className="text-sm text-red-400">Erro ao salvar. Tente novamente.</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditMeta(false)}
                className="px-4 py-2 rounded-md bg-secondary border border-border/60 text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => updateMetaMutation.mutate()}
                disabled={updateMetaMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {updateMetaMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(false)} />
          <div className="relative bg-card border border-border/60 rounded-lg p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h2 className="font-classic text-lg font-medium">Apagar série?</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tem certeza que deseja apagar{" "}
              <span className="text-foreground font-medium">
                &ldquo;{series.localized_name || series.name}&rdquo;
              </span>
              ? Esta ação não pode ser desfeita. Os arquivos físicos não serão removidos do disco.
            </p>
            {deleteMutation.isError && (
              <p className="text-sm text-red-400">Erro ao apagar. Tente novamente.</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2 rounded-md bg-secondary border border-border/60 text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VolumeAccordion({
  volume,
  progress,
}: {
  volume: Volume;
  progress: Array<{ chapter_id: number; pages_read: number; is_completed: boolean }>;
}) {
  const progressMap = new Map(progress.map((p) => [p.chapter_id, p]));
  const completedCount = volume.chapters.filter(
    (c) => progressMap.get(c.id)?.is_completed
  ).length;
  const router = useRouter();
  const pct = volume.chapters.length > 0
    ? (completedCount / volume.chapters.length) * 100
    : 0;

  return (
    <div className="bg-card border border-border/50 rounded-md overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{volume.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount}/{volume.chapters.length} capítulos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-20 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="divide-y divide-border/40">
        {volume.chapters.map((ch) => {
          const prog = progressMap.get(ch.id);
          return (
            <button
              key={ch.id}
              onClick={() => router.push(`/reader/${ch.id}`)}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-accent/40 transition-colors text-left group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={clsx(
                  "h-1.5 w-1.5 rounded-full shrink-0 transition-colors",
                  prog?.is_completed
                    ? "bg-emerald-500"
                    : prog?.pages_read
                    ? "bg-amber-500"
                    : "bg-border"
                )} />
                <p className="text-sm truncate text-foreground/80 group-hover:text-foreground transition-colors">
                  {ch.title || `Capítulo ${ch.range || ch.min_number}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {ch.pages > 0 && (
                  <span className="text-xs text-muted-foreground">{ch.pages}p</span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
