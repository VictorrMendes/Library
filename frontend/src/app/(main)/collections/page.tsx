"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { FolderOpen, Plus, Trash2, Pencil, Loader2, X, BookOpen } from "lucide-react";
import { useForm } from "react-hook-form";
import { collectionsApi } from "@/lib/api";
import type { Collection } from "@/types";

interface CollectionForm {
  title: string;
  summary: string;
}

export default function CollectionsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing: Collection | null }>({
    open: false,
    editing: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);

  const { data: collections = [], isLoading } = useQuery<Collection[]>({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.list().then((r) => r.data.results as Collection[]),
  });

  const createMutation = useMutation({
    mutationFn: (data: CollectionForm) => collectionsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["collections"] }); closeModal(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CollectionForm }) =>
      collectionsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["collections"] }); closeModal(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => collectionsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["collections"] }); setDeleteTarget(null); },
  });

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<CollectionForm>();

  function openCreate() {
    reset({ title: "", summary: "" });
    setModal({ open: true, editing: null });
  }

  function openEdit(col: Collection) {
    reset({ title: col.title, summary: col.summary });
    setModal({ open: true, editing: col });
  }

  function closeModal() {
    setModal({ open: false, editing: null });
  }

  async function onSubmit(form: CollectionForm) {
    if (modal.editing) {
      await updateMutation.mutateAsync({ id: modal.editing.id, data: form });
    } else {
      await createMutation.mutateAsync(form);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-sans">Coleções</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agrupe séries em coleções personalizadas.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Coleção
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
          <FolderOpen className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhuma coleção criada ainda.</p>
          <button onClick={openCreate} className="text-sm text-primary hover:underline">
            Criar a primeira coleção
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {collections.map((col) => (
            <div key={col.id} className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-colors">
              {/* Cover area */}
              <Link href={`/collections/${col.id}`}>
                <div className="aspect-[3/2] bg-muted flex items-center justify-center">
                  {col.cover_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={col.cover_image} alt={col.title} className="w-full h-full object-cover" />
                  ) : (
                    <FolderOpen className="h-10 w-10 text-muted-foreground/30" />
                  )}
                </div>
              </Link>

              <div className="p-3 space-y-1">
                <Link href={`/collections/${col.id}`}>
                  <h3 className="font-medium text-sm line-clamp-1 hover:text-primary transition-colors">
                    {col.title}
                  </h3>
                </Link>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  {col.series_count} séries
                </p>
              </div>

              {/* Actions */}
              <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                <button
                  onClick={() => openEdit(col)}
                  className="p-1.5 rounded-lg bg-card/90 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors border border-border"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(col)}
                  className="p-1.5 rounded-lg bg-card/90 backdrop-blur-sm text-muted-foreground hover:text-red-400 transition-colors border border-border"
                >
                  <Trash2 className="h-3.5 w-3.5" />
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
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {modal.editing ? "Editar Coleção" : "Nova Coleção"}
              </h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Título</label>
                <input
                  {...register("title", { required: true })}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Minha coleção"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Descrição</label>
                <textarea
                  {...register("summary")}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Descrição opcional…"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {modal.editing ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="text-base font-semibold">Excluir coleção?</h2>
            <p className="text-sm text-muted-foreground">
              Isso removerá a coleção{" "}
              <span className="text-foreground font-medium">"{deleteTarget.title}"</span>.
              As séries não serão excluídas.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80">
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-60"
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
