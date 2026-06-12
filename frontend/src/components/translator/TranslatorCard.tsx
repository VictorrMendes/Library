"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Globe, Minus, X, ArrowLeftRight, Loader2 } from "lucide-react";
import { useTranslatorStore } from "@/store/translator";
import { lookupWord } from "@/lib/translator";
import type { Direction } from "@/lib/translator";

export function TranslatorCard() {
  const {
    isOpen, isMinimized, position, direction, result,
    setOpen, setMinimized, setPosition, setDirection, setResult,
  } = useTranslatorStore();

  const [word, setWord] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Place at bottom-right the first time the card is opened (no saved position)
  useEffect(() => {
    if (isOpen && position.x === 0 && position.y === 0) {
      setPosition({
        x: Math.max(20, window.innerWidth - 340),
        y: Math.max(20, window.innerHeight - 500),
      });
    }
  }, [isOpen]);

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      dragStart.current = { mx: e.clientX, my: e.clientY, px: position.x, py: position.y };
      e.preventDefault();
    },
    [position]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 320, dragStart.current.px + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 48, dragStart.current.py + dy)),
      });
    };
    const onUp = () => { dragging.current = false; };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [setPosition]);

  const handleTranslate = async () => {
    if (!word.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await lookupWord(word, direction);
      setResult(res);
    } catch {
      setError("Não foi possível buscar a tradução. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const toggleDirection = () => {
    const next: Direction = direction === "en-pt" ? "pt-en" : "en-pt";
    setDirection(next);
    setResult(null);
    setWord("");
    setError("");
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
    setError("");
  };

  if (!isOpen) return null;

  return (
    <div
      style={{ left: position.x, top: position.y }}
      className="fixed z-[200] w-80 bg-card border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
    >
      {/* Header — drag handle */}
      <div
        onMouseDown={onHeaderMouseDown}
        className="flex items-center justify-between px-3 py-2.5 bg-primary/5 border-b border-border cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold">Tradutor</span>
          <span className="text-xs text-muted-foreground">
            {direction === "en-pt" ? "EN → PT" : "PT → EN"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMinimized(!isMinimized)}
            title={isMinimized ? "Expandir" : "Minimizar"}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleClose}
            title="Fechar"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3 space-y-3">
          {/* Input + direction toggle */}
          <div className="flex gap-2">
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTranslate()}
              placeholder={direction === "en-pt" ? "English word or phrase..." : "Palavra em português..."}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              onClick={toggleDirection}
              title="Inverter idioma"
              className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shrink-0"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleTranslate}
            disabled={loading || !word.trim()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando...
              </>
            ) : (
              "Traduzir"
            )}
          </button>

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          {result && !error && (
            <div className="space-y-3 pt-1 border-t border-border">
              {/* Translation highlight */}
              <div className="bg-primary/5 rounded-lg px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {direction === "en-pt" ? "Português" : "English"}
                </p>
                <p className="text-base font-semibold text-primary leading-snug">
                  {result.translation}
                </p>
                {result.phonetic && (
                  <p className="text-xs text-muted-foreground mt-0.5">{result.phonetic}</p>
                )}
              </div>

              {result.definition && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Definição
                  </p>
                  <p className="text-xs leading-relaxed text-foreground/80">{result.definition}</p>
                </div>
              )}

              {result.example && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Exemplo
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground italic">
                    &ldquo;{result.example}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
