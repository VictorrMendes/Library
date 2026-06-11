"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { List, Plus, Trash2, Pencil, Loader2, X, Hash } from "lucide-react";
import { useForm } from "react-hook-form";
import { collectionsApi } from "@/lib/api";
import type { ReadingList } from "@/types";

interface ListForm {
  title: string;
  summary: string;
}

export default function ReadingListsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing: ReadingList | null }>({
    open: false,
    editing: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<ReadingList | null>(null);

  const { data: lists = [], isLoading } = useQuery<ReadingList[]>({
    queryKey: ["reading-lists"],
    queryFn: () => collectionsApi.readingLists().then((r) => r.data.results as ReadingList[]),
  });

  const createMutation = useMutation({
    mutationFn: (data: ListForm) => collectionsApi.createReadingList(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reading-lists"] }); closeModal(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ListForm }) =>
      collectionsApi.updateReadingList(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reading-lists"] }); closeModal(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => collectionsApi.deleteReadingList(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reading-lists"] }); setDeleteTarget(null); },
  });

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<ListForm>();

  function openCreate() {
    reset({ title: "", summary: "" });
    setModal({ open: true, editing: null });
  }

  function openEdit(list: ReadingList) {
    reset({ title: list.title, summary: list.summary });
    setModal({ open: true, editing: list });
  }

  function closeModal() {
    setModal({ open: false, editing: null });
  }

  async function onSubmit(form: ListForm) {
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
          <h1 className="text-2xl font-bold font-sans">Listas de Leitura</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Organize capítulos em listas ordenadas.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Lista
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
          <List className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhuma lista de leitura criada.</p>
          <button onClick={openCreate} className="text-sm text-primary hover:underline">
            Criar a primeira lista
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map((list) => (
            <div
              key={list.id}
              className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <List className="h-5 w-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{list.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Hash className="h-3 w-3" />
                  {list.item_count} capítulos
                  {list.summary && (
                    <span className="ml-2 truncate max-w-xs opacity-70">{list.summary}</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEdit(list)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(list)}
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
          <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {modal.editing ? "Editar Lista" : "Nova Lista"}
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
                  placeholder="Minha lista"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Descrição</label>
                <textarea
                  {...register("summary")}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Opcional…"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80">
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
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
            <h2 className="text-base font-semibold">Excluir lista?</h2>
            <p className="text-sm text-muted-foreground">
              A lista{" "}
              <span className="text-foreground font-medium">"{deleteTarget.title}"</span>{" "}
              e seus {deleteTarget.item_count} itens serão removidos.
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
