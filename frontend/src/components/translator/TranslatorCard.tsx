"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Globe, Minus, X, ArrowLeftRight, Loader2, Trash2, BookOpen, Clock } from "lucide-react";
import { clsx } from "clsx";
import { useTranslatorStore } from "@/store/translator";
import { lookupWord } from "@/lib/translator";
import type { Direction } from "@/lib/translator";

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 640;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ── Tab type ──────────────────────────────────────────────────────────────────
type Tab = "translate" | "history";

export function TranslatorCard() {
  const {
    isOpen, isMinimized, position, direction, result, history,
    setOpen, setMinimized, setPosition, setDirection, setResult,
    addToHistory, clearHistory,
  } = useTranslatorStore();

  const [word, setWord] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("translate");

  // Capture text selection (mouse + touch)
  useEffect(() => {
    const capture = () => {
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length > 0 && sel.length < 200) {
        setWord(sel);
        setTab("translate");
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

  // Initial position — bottom-right on desktop
  useEffect(() => {
    if (isOpen && !isMobile() && position.x === 0 && position.y === 0) {
      setPosition({
        x: Math.max(16, window.innerWidth - 340),
        y: Math.max(16, window.innerHeight - 560),
      });
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Desktop drag (mouse) ──────────────────────────────────────────────────
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

  // ── Desktop touch drag ────────────────────────────────────────────────────
  const touching = useRef(false);

  const onHeaderTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isMobile()) return;
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

  // ── Mobile swipe-to-dismiss ───────────────────────────────────────────────
  const [sheetY, setSheetY] = useState(0);
  const sheetTouchStartY = useRef<number | null>(null);

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    sheetTouchStartY.current = e.touches[0].clientY;
  }, []);

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (sheetTouchStartY.current === null) return;
    const delta = e.touches[0].clientY - sheetTouchStartY.current;
    if (delta > 0) setSheetY(delta);
  }, []);

  const onHandleTouchEnd = useCallback(() => {
    if (sheetY > 80) {
      setOpen(false);
      setResult(null);
      setError("");
    }
    setSheetY(0);
    sheetTouchStartY.current = null;
  }, [sheetY, setOpen, setResult]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleTranslate = async () => {
    if (!word.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await lookupWord(word, direction);
      setResult(res);
      addToHistory({
        word: res.word,
        direction,
        translation: res.translation,
        phonetic: res.phonetic,
        definition: res.definition,
        example: res.example,
      });
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

  // ── Shared tab bar ────────────────────────────────────────────────────────
  const TabBar = () => (
    <div className="flex border-b border-border">
      {(["translate", "history"] as Tab[]).map((t) => (
        <button
          key={t}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setTab(t)}
          className={clsx(
            "flex-1 py-1.5 text-xs font-medium transition-colors",
            tab === t
              ? "text-primary border-b-2 border-primary -mb-px"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t === "translate" ? "Traduzir" : `Análise${history.length > 0 ? ` (${history.length})` : ""}`}
        </button>
      ))}
    </div>
  );

  // ── Translate panel ───────────────────────────────────────────────────────
  const TranslatePanel = ({ compact }: { compact?: boolean }) => (
    <div className={clsx("space-y-3", compact ? "p-3" : "p-4")}>
      <div className="flex gap-2">
        <input
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleTranslate()}
          placeholder={direction === "en-pt" ? "English word or phrase..." : "Palavra em português..."}
          className={clsx(
            "flex-1 min-w-0 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary",
            compact ? "py-2" : "py-2.5"
          )}
        />
        <button
          onClick={toggleDirection}
          className={clsx(
            "rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shrink-0",
            compact ? "p-2" : "p-2.5"
          )}
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={handleTranslate}
        disabled={loading || !word.trim()}
        className={clsx(
          "w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 transition-colors hover:bg-primary/90",
          compact ? "py-2" : "py-2.5"
        )}
      >
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Buscando...</> : "Traduzir"}
      </button>

      {!word.trim() && !loading && (
        <p className="text-xs text-muted-foreground text-center">
          Selecione texto na página ou digite acima
        </p>
      )}

      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      {result && !error && <TranslationResult result={result} direction={direction} />}
    </div>
  );

  // ── History / Analysis panel ──────────────────────────────────────────────
  const HistoryPanel = ({ maxH }: { maxH: string }) => (
    <div className="flex flex-col">
      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
          <BookOpen className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Nenhuma palavra traduzida ainda.<br />Selecione texto na página ou use a aba Traduzir.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground">{history.length} palavra{history.length !== 1 ? "s" : ""}</span>
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Limpar
            </button>
          </div>
          <div className={clsx("overflow-y-auto divide-y divide-border", maxH)}>
            {history.map((entry) => (
              <div
                key={entry.id}
                className="px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => {
                  setWord(entry.word);
                  setDirection(entry.direction);
                  setTab("translate");
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{entry.word}</span>
                      {entry.phonetic && (
                        <span className="text-[10px] text-muted-foreground">{entry.phonetic}</span>
                      )}
                      <span className="text-[10px] px-1 rounded bg-primary/10 text-primary font-medium">
                        {entry.direction === "en-pt" ? "EN→PT" : "PT→EN"}
                      </span>
                    </div>
                    <p className="text-xs text-primary font-medium mt-0.5 truncate">{entry.translation}</p>
                    {entry.definition && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{entry.definition}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {fmtTime(entry.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // ── Mobile bottom sheet ───────────────────────────────────────────────────
  if (mobile) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-[200] bg-card border-t border-border rounded-t-2xl shadow-2xl shadow-black/60 flex flex-col"
        style={{
          transform: `translateY(${sheetY}px)`,
          transition: sheetY === 0 ? "transform 0.2s ease" : "none",
          maxHeight: "85dvh",
        }}
      >
        {/* Drag handle */}
        <div
          className="flex flex-col cursor-grab active:cursor-grabbing shrink-0"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
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

        <div className="shrink-0">
          <TabBar />
        </div>

        <div className="flex-1 overflow-hidden">
          {tab === "translate"
            ? <TranslatePanel />
            : <HistoryPanel maxH="max-h-[60dvh]" />
          }
        </div>
      </div>
    );
  }

  // ── Desktop floating card ─────────────────────────────────────────────────
  return (
    <div
      style={{ left: position.x, top: position.y }}
      className="fixed z-[200] w-80 bg-card border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col"
    >
      {/* Header (draggable) */}
      <div
        onMouseDown={onHeaderMouseDown}
        onTouchStart={onHeaderTouchStart}
        className="flex items-center justify-between px-3 py-2.5 bg-primary/5 border-b border-border cursor-grab active:cursor-grabbing select-none shrink-0"
      >
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold">Tradutor</span>
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
        <div className="flex flex-col" style={{ maxHeight: "calc(100vh - 120px)" }}>
          <div className="shrink-0">
            <TabBar />
          </div>
          <div className="flex-1 overflow-hidden">
            {tab === "translate"
              ? <TranslatePanel compact />
              : <HistoryPanel maxH="max-h-[400px]" />
            }
          </div>
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
