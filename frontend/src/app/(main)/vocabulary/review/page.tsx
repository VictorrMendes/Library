"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { vocabularyApi } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { VocabularyEntry } from "@/types";

export default function VocabularyReviewPage() {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [startTime] = useState(() => Date.now());

  const { data: entries = [], isLoading } = useQuery<VocabularyEntry[]>({
    queryKey: ["vocabulary", "review"],
    queryFn: () =>
      vocabularyApi
        .list({ due_today: true })
        .then((r) => r.data.results ?? r.data),
  });

  const { mutate: submitReview } = useMutation({
    mutationFn: ({ id, quality }: { id: number; quality: number }) =>
      vocabularyApi.review(id, quality),
    onError: () => {
      toast({ title: "Erro ao registrar revisão", variant: "destructive" });
    },
  });

  const handleQuality = useCallback(
    (quality: number) => {
      const entry = entries[currentIndex];
      if (!entry) return;

      submitReview({ id: entry.id, quality });
      if (quality >= 3) setCorrect((c) => c + 1);
      setReviewed((r) => r + 1);

      const next = currentIndex + 1;
      if (next >= entries.length) {
        queryClient.invalidateQueries({ queryKey: ["vocabulary"] });
        setDone(true);
      } else {
        setCurrentIndex(next);
        setFlipped(false);
      }
    },
    [entries, currentIndex, submitReview, queryClient]
  );

  const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-sm">Carregando revisões...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <p className="text-5xl">🎉</p>
        <h2 className="font-classic text-2xl font-medium">Tudo em dia!</h2>
        <p className="text-muted-foreground">Volte amanhã para continuar sua revisão.</p>
        <Link
          href="/vocabulary"
          className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Vocabulário
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <p className="text-5xl">✅</p>
        <h2 className="font-classic text-2xl font-medium">Revisão concluída!</h2>
        <div className="space-y-1 text-muted-foreground text-sm">
          <p>{reviewed} palavras revisadas</p>
          <p>{correct} acertos ({reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0}%)</p>
          {elapsedMinutes > 0 && <p>Tempo: {elapsedMinutes} min</p>}
        </div>
        <div className="flex gap-2 mt-2">
          <Link
            href="/vocabulary"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Vocabulário
          </Link>
          <button
            onClick={() => {
              setCurrentIndex(0);
              setFlipped(false);
              setReviewed(0);
              setCorrect(0);
              setDone(false);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Revisar novamente
          </button>
        </div>
      </div>
    );
  }

  const entry = entries[currentIndex];

  return (
    <div className="p-5 sm:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/vocabulary"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Vocabulário
        </Link>
        <span className="text-sm text-muted-foreground">
          {reviewed + 1} / {entries.length} revisadas
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 rounded-full"
          style={{ width: `${((reviewed) / entries.length) * 100}%` }}
        />
      </div>

      {/* Flashcard */}
      <div className="relative" style={{ perspective: "1000px" }}>
        <div
          className={cn(
            "relative w-full transition-transform duration-500",
            flipped ? "[transform:rotateY(180deg)]" : ""
          )}
          style={{ transformStyle: "preserve-3d", minHeight: "320px" }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-4 [backface-visibility:hidden]"
          >
            <div className="text-center space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                {entry.direction === "en-pt" ? "Inglês → Português" : "Português → Inglês"}
              </p>
              <p className="font-classic text-4xl font-medium text-foreground">{entry.word}</p>
              {entry.phonetic && (
                <p className="text-sm text-muted-foreground">{entry.phonetic}</p>
              )}
            </div>
            <button
              onClick={() => setFlipped(true)}
              className="mt-4 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Ver resposta
            </button>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 bg-card border border-border rounded-2xl p-8 flex flex-col gap-4 [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-y-auto"
          >
            <div className="space-y-4 flex-1">
              <div className="bg-primary/5 rounded-lg px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {entry.direction === "en-pt" ? "Português" : "English"}
                </p>
                <p className="text-2xl font-semibold text-primary">{entry.translation}</p>
              </div>
              {entry.definition && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Definição</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{entry.definition}</p>
                </div>
              )}
              {entry.example && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Exemplo</p>
                  <p className="text-sm text-muted-foreground italic">&ldquo;{entry.example}&rdquo;</p>
                </div>
              )}
              {entry.context_sentence && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Contexto</p>
                  <p className="text-sm text-muted-foreground/70 italic">&ldquo;{entry.context_sentence}&rdquo;</p>
                </div>
              )}
            </div>

            {/* Quality buttons */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
              <button
                onClick={() => handleQuality(1)}
                className="flex flex-col items-center gap-1 py-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors text-sm font-medium"
              >
                Não sei
              </button>
              <button
                onClick={() => handleQuality(3)}
                className="flex flex-col items-center gap-1 py-3 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors text-sm font-medium"
              >
                Difícil
              </button>
              <button
                onClick={() => handleQuality(5)}
                className="flex flex-col items-center gap-1 py-3 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors text-sm font-medium"
              >
                Sei
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
