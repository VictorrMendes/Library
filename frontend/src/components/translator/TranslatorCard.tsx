"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Globe, Minus, X, ArrowLeftRight, Loader2 } from "lucide-react";
import { useTranslatorStore } from "@/store/translator";
import { lookupWord } from "@/lib/translator";
import type { Direction } from "@/lib/translator";

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 640;
}

export function TranslatorCard() {
  const {
    isOpen, isMinimized, position, direction, result,
    setOpen, setMinimized, setPosition, setDirection, setResult,
  } = useTranslatorStore();

  const [word, setWord] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Capture text selection (mouse + touch)
  useEffect(() => {
    const capture = () => {
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length > 0 && sel.length < 200) {
        setWord(sel);
        if (!isOpen) setOpen(true);
      }
    };
    document.addEventListener("mouseup", capture);
    document.addEventListener("selectionchange", capture);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("selectionchange", capture);
    };
  }, [isOpen, setOpen]);

  // Initial position — bottom-right on desktop, ignored on mobile
  useEffect(() => {
    if (isOpen && !isMobile() && position.x === 0 && position.y === 0) {
      setPosition({
        x: Math.max(16, window.innerWidth - 340),
        y: Math.max(16, window.innerHeight - 500),
      });
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag (desktop — mouse) ────────────────────────────────────────────────
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile()) return;
      dragging.current = true;
      dragStart.current = { mx: e.clientX, my: e.clientY, px: position.x, py: position.y };
      e.preventDefault();
    },
    [position]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 320, dragStart.current.px + e.clientX - dragStart.current.mx)),
        y: Math.max(0, Math.min(window.innerHeight - 48, dragStart.current.py + e.clientY - dragStart.current.my)),
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

  // ── Drag (mobile — touch) ─────────────────────────────────────────────────
  const touching = useRef(false);

  const onHeaderTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isMobile()) return; // bottom sheet on mobile — no drag
      touching.current = true;
      const t = e.touches[0];
      dragStart.current = { mx: t.clientX, my: t.clientY, px: position.x, py: position.y };
    },
    [position]
  );

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (!touching.current) return;
      const t = e.touches[0];
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 320, dragStart.current.px + t.clientX - dragStart.current.mx)),
        y: Math.max(0, Math.min(window.innerHeight - 48, dragStart.current.py + t.clientY - dragStart.current.my)),
      });
      e.preventDefault();
    };
    const onTouchEnd = () => { touching.current = false; };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [setPosition]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleTranslate = async () => {
    if (!word.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await lookupWord(word, direction));
    } catch {
      setError("Não foi possível buscar a tradução. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const toggleDirection = () => {
    setDirection(direction === "en-pt" ? "pt-en" : "en-pt");
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

  const mobile = isMobile();

  // ── Mobile bottom sheet ───────────────────────────────────────────────────
  if (mobile) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[200] bg-card border-t border-border rounded-t-2xl shadow-2xl shadow-black/60 overflow-hidden">
        {/* Drag indicator + header */}
        <div className="flex flex-col">
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold">Tradutor</span>
              <span className="text-xs text-muted-foreground">
                {direction === "en-pt" ? "EN → PT" : "PT → EN"}
              </span>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 pb-safe">
          <div className="flex gap-2">
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTranslate()}
              placeholder={direction === "en-pt" ? "English word or phrase..." : "Palavra em português..."}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={toggleDirection}
              className="p-2.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shrink-0"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleTranslate}
            disabled={loading || !word.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Buscando...</> : "Traduzir"}
          </button>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          {result && !error && <TranslationResult result={result} direction={direction} />}
        </div>
      </div>
    );
  }

  // ── Desktop floating card ─────────────────────────────────────────────────
  return (
    <div
      style={{ left: position.x, top: position.y }}
      className="fixed z-[200] w-80 bg-card border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
    >
      <div
        onMouseDown={onHeaderMouseDown}
        onTouchStart={onHeaderTouchStart}
        className="flex items-center justify-between px-3 py-2.5 bg-primary/5 border-b border-border cursor-grab active:cursor-grabbing select-none"
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
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleClose}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3 space-y-3">
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
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Buscando...</> : "Traduzir"}
          </button>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          {result && !error && <TranslationResult result={result} direction={direction} />}
        </div>
      )}
    </div>
  );
}

function TranslationResult({ result, direction }: {
  result: { translation: string; phonetic: string; definition: string; example: string };
  direction: Direction;
}) {
  return (
    <div className="space-y-3 pt-1 border-t border-border">
      <div className="bg-primary/5 rounded-lg px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          {direction === "en-pt" ? "Português" : "English"}
        </p>
        <p className="text-base font-semibold text-primary leading-snug">{result.translation}</p>
        {result.phonetic && (
          <p className="text-xs text-muted-foreground mt-0.5">{result.phonetic}</p>
        )}
      </div>
      {result.definition && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Definição</p>
          <p className="text-xs leading-relaxed text-foreground/80">{result.definition}</p>
        </div>
      )}
      {result.example && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Exemplo</p>
          <p className="text-xs leading-relaxed text-muted-foreground italic">&ldquo;{result.example}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
