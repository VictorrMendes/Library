"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Library,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  RefreshCw,
  Clock,
  BookOpen,
  FolderOpen,
  X,
  AlertCircle,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { libraryApi } from "@/lib/api";
import type { Library as LibraryType } from "@/types";
import { clsx } from "clsx";

const TYPE_LABELS: Record<string, string> = {
  manga: "Mangá",
  comic: "Quadrinho",
  book: "Livro",
  light_novel: "Light Novel",
  image: "Imagens",
};

const TYPE_COLORS: Record<string, string> = {
  manga: "bg-blue-500/20 text-blue-400",
  comic: "bg-yellow-500/20 text-yellow-400",
  book: "bg-green-500/20 text-green-400",
  light_novel: "bg-purple-500/20 text-purple-400",
  image: "bg-pink-500/20 text-pink-400",
};

interface LibraryForm {
  name: string;
  type: "manga" | "comic" | "book" | "light_novel" | "image";
  folder_paths: string;
  include_in_dashboard: boolean;
  include_in_search: boolean;
  folder_watching: boolean;
}

function formatDate(iso: string | null) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminLibrariesPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing: LibraryType | null }>({
    open: false,
    editing: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<LibraryType | null>(null);
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const { data: libraries = [], isLoading } = useQuery<LibraryType[]>({
    queryKey: ["libraries"],
    queryFn: () => libraryApi.list().then((r) => r.data.results as LibraryType[]),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<LibraryType>) => libraryApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<LibraryType> }) =>
      libraryApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => libraryApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      setDeleteTarget(null);
    },
  });

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<LibraryForm>({
    defaultValues: { type: "manga", include_in_dashboard: true, include_in_search: true, folder_watching: false },
  });

  function openCreate() {
    reset({ name: "", type: "manga", folder_paths: "", include_in_dashboard: true, include_in_search: true, folder_watching: false });
    setModal({ open: true, editing: null });
  }

  function openEdit(lib: LibraryType) {
    reset({
      name: lib.name,
      type: lib.type,
      folder_paths: lib.folder_paths.join("\n"),
      include_in_dashboard: lib.include_in_dashboard,
      include_in_search: lib.include_in_search,
      folder_watching: lib.folder_watching,
    });
    setModal({ open: true, editing: lib });
  }

  function closeModal() {
    setModal({ open: false, editing: null });
  }

  async function onSubmit(form: LibraryForm) {
    const payload = {
      name: form.name.trim(),
      type: form.type,
      folder_paths: form.folder_paths
        .split(/[\n,\s]+/)
        .map((p) => p.trim())
        .filter((p) => p.startsWith("/")),
      include_in_dashboard: form.include_in_dashboard,
      include_in_search: form.include_in_search,
      folder_watching: form.folder_watching,
    };
    if (modal.editing) {
      await updateMutation.mutateAsync({ id: modal.editing.id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
  }

  function getApiErrors(error: unknown): Record<string, string[]> | null {
    const e = error as { response?: { data?: Record<string, string[]> } };
    return e?.response?.data ?? null;
  }

  async function handleScan(lib: LibraryType) {
    setScanningId(lib.id);
    setScanMsg(null);
    try {
      await libraryApi.scan(lib.id);
      setScanMsg(`Scan da "${lib.name}" iniciado com sucesso.`);
      setTimeout(() => setScanMsg(null), 4000);
    } finally {
      setScanningId(null);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-classic text-2xl font-medium tracking-tight">Bibliotecas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie as pastas de arquivos escaneadas pelo sistema.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Biblioteca
        </button>
      </div>

      {/* Scan feedback */}
      {scanMsg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {scanMsg}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : libraries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
          <Library className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhuma biblioteca criada ainda.</p>
          <button
            onClick={openCreate}
            className="text-sm text-primary hover:underline"
          >
            Criar a primeira biblioteca
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {libraries.map((lib) => (
            <div
              key={lib.id}
              className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
            >
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Library className="h-6 w-6 text-primary" />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-sm">{lib.name}</h2>
                  <span className={clsx("text-[11px] px-2 py-0.5 rounded-full font-medium", TYPE_COLORS[lib.type] ?? "bg-muted text-muted-foreground")}>
                    {TYPE_LABELS[lib.type] ?? lib.type}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    {lib.series_count} séries
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(lib.last_scanned)}
                  </span>
                  {lib.folder_paths.slice(0, 2).map((p) => (
                    <span key={p} className="flex items-center gap-1 font-mono truncate max-w-xs">
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleScan(lib)}
                  disabled={scanningId === lib.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-60"
                >
                  {scanningId === lib.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Escanear
                </button>
                <button
                  onClick={() => openEdit(lib)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(lib)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-lg space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {modal.editing ? "Editar Biblioteca" : "Nova Biblioteca"}
              </h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Nome</label>
                <input
                  {...register("name", { required: true })}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Minha Biblioteca de Mangás"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Tipo</label>
                <select
                  {...register("type")}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Pastas{" "}
                  <span className="text-muted-foreground font-normal text-xs">
                    (uma por linha, ou separadas por espaço)
                  </span>
                </label>
                <textarea
                  {...register("folder_paths", { required: true })}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                  placeholder={"/biblioteca/manga\n/biblioteca/livros\n/biblioteca/comics"}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use caminhos absolutos começando com /
                </p>
              </div>

              <div className="space-y-2">
                {[
                  { name: "include_in_dashboard" as const, label: "Incluir no Dashboard" },
                  { name: "include_in_search" as const, label: "Incluir na Busca" },
                  { name: "folder_watching" as const, label: "Monitorar pasta (auto-scan)" },
                ].map(({ name, label }) => (
                  <label key={name} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register(name)}
                      className="h-4 w-4 rounded border-border bg-background accent-primary"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>

              {(createMutation.isError || updateMutation.isError) && (() => {
                const errs = getApiErrors(
                  createMutation.error ?? updateMutation.error
                );
                if (!errs) return (
                  <p className="text-sm text-red-400">
                    Erro ao salvar. Tente novamente.
                  </p>
                );
                return (
                  <div className="space-y-1 p-3 rounded-md bg-red-500/8 border border-red-500/20">
                    {Object.entries(errs).map(([field, msgs]) => (
                      <p key={field} className="text-sm text-red-400">
                        <span className="font-medium capitalize">{field.replace(/_/g, " ")}</span>
                        {": "}
                        {Array.isArray(msgs) ? msgs[0] : msgs}
                      </p>
                    ))}
                  </div>
                );
              })()}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {modal.editing ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="text-base font-semibold">Excluir biblioteca?</h2>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir{" "}
              <span className="text-foreground font-medium">"{deleteTarget.name}"</span>? Esta ação
              não pode ser desfeita. As séries e capítulos associados também serão removidos.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
