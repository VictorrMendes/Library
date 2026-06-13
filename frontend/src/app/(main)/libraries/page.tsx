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
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function LibrariesPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing: LibraryType | null }>({ open: false, editing: null });
  const [deleteTarget, setDeleteTarget] = useState<LibraryType | null>(null);
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const { data: libraries = [], isLoading } = useQuery<LibraryType[]>({
    queryKey: ["libraries"],
    queryFn: () => libraryApi.list().then((r) => r.data.results as LibraryType[]),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<LibraryType>) => libraryApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["libraries"] }); closeModal(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<LibraryType> }) => libraryApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["libraries"] }); closeModal(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => libraryApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["libraries"] }); setDeleteTarget(null); },
  });

  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<LibraryForm>({
    defaultValues: { type: "manga", include_in_dashboard: true, include_in_search: true, folder_watching: false },
  });

  function openCreate() {
    reset({ name: "", type: "manga", folder_paths: "", include_in_dashboard: true, include_in_search: true, folder_watching: false });
    setModal({ open: true, editing: null });
  }

  function openEdit(lib: LibraryType) {
    reset({
      name: lib.name, type: lib.type,
      folder_paths: lib.folder_paths.join("\n"),
      include_in_dashboard: lib.include_in_dashboard,
      include_in_search: lib.include_in_search,
      folder_watching: lib.folder_watching,
    });
    setModal({ open: true, editing: lib });
  }

  function closeModal() { setModal({ open: false, editing: null }); }

  async function onSubmit(form: LibraryForm) {
    const payload = {
      name: form.name.trim(),
      type: form.type,
      folder_paths: form.folder_paths.split(/[\n,]+/).map((p) => p.trim()).filter((p) => p.startsWith("/")),
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

  const mutationError = createMutation.error || updateMutation.error;
  const apiErrors = (mutationError as { response?: { data?: Record<string, string[]> } } | null)?.response?.data;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-classic text-2xl font-medium tracking-tight">Bibliotecas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie as pastas de arquivos escaneadas pelo sistema.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Biblioteca
        </button>
      </div>

      {scanMsg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <RefreshCw className="h-4 w-4 shrink-0" />
          {scanMsg}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : libraries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Library className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium">Nenhuma biblioteca criada ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Nova Biblioteca" para começar.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {libraries.map((lib) => (
            <div key={lib.id} className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{lib.name}</h3>
                    <span className={clsx("text-[10px] font-medium px-1.5 py-0.5 rounded", TYPE_COLORS[lib.type] ?? "bg-muted text-muted-foreground")}>
                      {TYPE_LABELS[lib.type] ?? lib.type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => openEdit(lib)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(lib)}
                    className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                {lib.folder_paths.map((fp) => (
                  <div key={fp} className="flex items-center gap-1.5">
                    <FolderOpen className="h-3 w-3 shrink-0" />
                    <span className="font-mono truncate">{fp}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(lib.last_scanned)}
                </div>
                <div className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  {(lib as LibraryType & { series_count?: number }).series_count ?? 0} séries
                </div>
              </div>

              <button
                onClick={() => handleScan(lib)}
                disabled={scanningId === lib.id}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors disabled:opacity-60"
              >
                <RefreshCw className={clsx("h-3.5 w-3.5", scanningId === lib.id && "animate-spin")} />
                {scanningId === lib.id ? "Iniciando..." : "Escanear"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">{modal.editing ? "Editar Biblioteca" : "Nova Biblioteca"}</h2>
              <button onClick={closeModal} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              {apiErrors && (
                <div className="flex gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {Object.entries(apiErrors).map(([k, v]) => (
                      <p key={k}>{Array.isArray(v) ? v.join(" ") : v}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nome</label>
                <input
                  {...register("name", { required: "Nome obrigatório" })}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Mangás, Livros..."
                />
                {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tipo</label>
                <select
                  {...register("type")}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Pastas</label>
                <textarea
                  {...register("folder_paths")}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder={"/biblioteca/manga\n/mnt/dados/livros"}
                />
                <p className="text-xs text-muted-foreground">Uma pasta por linha. Caminhos absolutos começando com /</p>
              </div>

              <div className="space-y-2">
                {(
                  [
                    { name: "include_in_dashboard" as const, label: "Incluir no Dashboard" },
                    { name: "include_in_search" as const, label: "Incluir na Busca" },
                    { name: "folder_watching" as const, label: "Monitorar pasta automaticamente" },
                  ] as const
                ).map(({ name, label }) => (
                  <label key={name} className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" {...register(name)} className="rounded border-border accent-primary" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 hover:bg-primary/90 transition-colors"
                >
                  {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {modal.editing ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold">Excluir biblioteca?</h3>
                <p className="text-sm text-muted-foreground mt-0.5">"{deleteTarget.name}" e todas as séries associadas serão removidas.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-60 hover:bg-red-600 transition-colors"
              >
                {deleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
