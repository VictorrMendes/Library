"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, X, Maximize2, Minimize2, Globe, Settings,
} from "lucide-react";
import dynamic from "next/dynamic";
import { readerApi, authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useTranslatorStore } from "@/store/translator";
import { clsx } from "clsx";

const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="text-white/50 text-sm mt-20">Carregando PDF…</div>
  ),
});

type ReadingMode = "single" | "double" | "webtoon";

interface ChapterData {
  format?: "images" | "pdf" | "epub";
  total_pages?: number;
  pages?: string[];
  pdf_url?: string;
  book_page_base_url?: string;
}

export default function ReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const { user, setUser } = useAuthStore();
  const { toggle: toggleTranslator, isOpen: translatorOpen } = useTranslatorStore();

  const [currentPage, setCurrentPage] = useState(0);
  const [mode, setMode] = useState<ReadingMode>(user?.reading_mode ?? "single");
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  // Reader settings (mirror user prefs, saved on change)
  const [fontSize, setFontSize] = useState(user?.book_font_size ?? 16);
  const [lineSpacing, setLineSpacing] = useState(user?.book_line_spacing ?? 1.6);
  const [brightness, setBrightness] = useState(100);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const { data: chapterData } = useQuery<ChapterData>({
    queryKey: ["reader", "chapter", chapterId],
    queryFn: () =>
      readerApi.chapterImages(Number(chapterId)).then((r) => r.data),
  });

  const { mutate: saveProgress } = useMutation({
    mutationFn: (page: number) =>
      readerApi.updateProgress({
        chapter_id: Number(chapterId),
        pages_read: page + 1,
      }),
  });

  const { mutate: savePreferences } = useMutation({
    mutationFn: (prefs: Record<string, unknown>) =>
      authApi.updatePreferences(prefs),
    onSuccess: (res) => setUser(res.data),
  });

  const format = chapterData?.format ?? "images";
  const totalPages =
    format === "pdf" ? pdfNumPages : (chapterData?.total_pages ?? 0);

  const goTo = useCallback(
    (page: number) => {
      const clamped = Math.max(0, Math.min(page, totalPages - 1));
      setCurrentPage(clamped);
      saveProgress(clamped);
    },
    [totalPages, saveProgress]
  );

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showSettings) return;
      if (e.key === "ArrowRight" || e.key === "d") goTo(currentPage + 1);
      if (e.key === "ArrowLeft" || e.key === "a") goTo(currentPage - 1);
      if (e.key === "Escape") history.back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, goTo, showSettings]);

  // Touch swipe navigation
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
      if (dx < 0) goTo(currentPage + (mode === "double" ? 2 : 1));
      else goTo(currentPage - (mode === "double" ? 2 : 1));
      touchStartX.current = null;
      touchStartY.current = null;
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [currentPage, goTo, mode]);

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Preload next pages
  useEffect(() => {
    if (format !== "images" || !chapterData?.pages) return;
    const preloadCount = mode === "double" ? 4 : 2;
    for (let i = 1; i <= preloadCount; i++) {
      const nextPage = currentPage + i;
      if (nextPage < totalPages) {
        const url =
          chapterData.pages?.[nextPage] ??
          readerApi.imageUrl(Number(chapterId), nextPage);
        const img = new Image();
        img.src = url;
      }
    }
  }, [currentPage, format, chapterData, totalPages, chapterId, mode]);

  if (!chapterData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="h-8 w-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
      </div>
    );
  }

  const pageLabel =
    format === "epub"
      ? `${currentPage + 1} / ${totalPages || "…"}`
      : format === "pdf"
      ? `${currentPage + 1} / ${pdfNumPages || "…"}`
      : `${currentPage + 1} / ${totalPages}`;

  return (
    <div
      className="min-h-screen bg-black relative select-none"
      style={{ filter: brightness !== 100 ? `brightness(${brightness}%)` : undefined }}
      onMouseMove={showControlsTemporarily}
      onClick={showControlsTemporarily}
    >
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div
        className={clsx(
          "fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm transition-all duration-300",
          showControls
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-full pointer-events-none"
        )}
      >
        <button
          onClick={() => history.back()}
          className="flex items-center gap-2 text-white/80 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-white/70 text-sm">{pageLabel}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTranslator}
            title="Tradutor"
            className={clsx(
              "p-2 transition-colors",
              translatorOpen ? "text-primary" : "text-white/70 hover:text-white"
            )}
          >
            <Globe className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            title="Configurações"
            className={clsx(
              "p-2 transition-colors",
              showSettings ? "text-primary" : "text-white/70 hover:text-white"
            )}
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 text-white/70 hover:text-white"
          >
            {isFullscreen ? (
              <Minimize2 className="h-5 w-5" />
            ) : (
              <Maximize2 className="h-5 w-5" />
            )}
          </button>
          {format === "images" && (
            <div className="flex bg-white/10 rounded-lg p-0.5 gap-0.5">
              {(["single", "double", "webtoon"] as ReadingMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={clsx(
                    "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    mode === m
                      ? "bg-white text-black"
                      : "text-white/70 hover:text-white"
                  )}
                >
                  {m === "single" ? "1" : m === "double" ? "2" : "∞"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Settings panel ──────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed top-14 right-4 z-50 w-72 bg-black/90 border border-white/10 rounded-xl p-4 space-y-4 backdrop-blur-sm">
          <p className="text-sm font-semibold text-white">Configurações de leitura</p>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-white/60">
              <span>Brilho</span><span>{brightness}%</span>
            </div>
            <input type="range" min={30} max={150} value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full accent-primary" />
          </div>

          {format === "epub" && (
            <>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-white/60">
                  <span>Tamanho da fonte</span><span>{fontSize}px</span>
                </div>
                <input type="range" min={12} max={28} value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  onMouseUp={() => savePreferences({ book_font_size: fontSize })}
                  className="w-full accent-primary" />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-white/60">
                  <span>Espaçamento entre linhas</span><span>{lineSpacing.toFixed(1)}</span>
                </div>
                <input type="range" min={1.2} max={2.5} step={0.1} value={lineSpacing}
                  onChange={(e) => setLineSpacing(Number(e.target.value))}
                  onMouseUp={() => savePreferences({ book_line_spacing: lineSpacing })}
                  className="w-full accent-primary" />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── EPUB Viewer (iframe) ─────────────────────────────────── */}
      {format === "epub" && chapterData.book_page_base_url && (
        <>
          <iframe
            key={`epub-${currentPage}`}
            src={`${chapterData.book_page_base_url}?page=${currentPage}&font_size=${fontSize}&line_spacing=${lineSpacing}`}
            className="w-full border-0"
            style={{ height: "100vh", paddingTop: "48px" }}
            title={`Página ${currentPage + 1}`}
          />
          <button
            onClick={() => goTo(currentPage - 1)}
            disabled={currentPage === 0}
            className={clsx(
              "fixed left-0 top-0 h-full w-16 flex items-center justify-start pl-3 transition-opacity z-40",
              showControls ? "opacity-100" : "opacity-0",
              currentPage === 0 ? "cursor-default" : "cursor-pointer"
            )}
          >
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <ChevronLeft className="h-6 w-6 text-white" />
            </div>
          </button>
          <button
            onClick={() => goTo(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
            className={clsx(
              "fixed right-0 top-0 h-full w-16 flex items-center justify-end pr-3 transition-opacity z-40",
              showControls ? "opacity-100" : "opacity-0",
              currentPage >= totalPages - 1 ? "cursor-default" : "cursor-pointer"
            )}
          >
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <ChevronRight className="h-6 w-6 text-white" />
            </div>
          </button>
        </>
      )}

      {/* ── PDF Viewer ──────────────────────────────────────────── */}
      {format === "pdf" && chapterData.pdf_url && (
        <div
          className="flex flex-col items-center gap-4 overflow-auto bg-neutral-900 min-h-screen"
          style={{ paddingTop: "64px", paddingBottom: "32px" }}
        >
          <PdfViewer
            pdfUrl={chapterData.pdf_url}
            onNumPages={setPdfNumPages}
          />
        </div>
      )}

      {/* ── Image Viewer (CBZ / archive) ────────────────────────── */}
      {(format === "images" || !chapterData.format) && (
        <>
          {mode === "webtoon" ? (
            <div className="flex flex-col items-center pt-16">
              {Array.from({ length: totalPages }, (_, i) => (
                <img
                  key={i}
                  src={
                    chapterData.pages?.[i] ??
                    readerApi.imageUrl(Number(chapterId), i)
                  }
                  alt={`Página ${i + 1}`}
                  className="w-full max-w-2xl"
                  loading={i < 3 ? "eager" : "lazy"}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-screen">
              <div
                className={clsx(
                  "flex gap-0",
                  mode === "double" ? "max-w-6xl" : "max-w-3xl"
                )}
              >
                <img
                  src={
                    chapterData.pages?.[currentPage] ??
                    readerApi.imageUrl(Number(chapterId), currentPage)
                  }
                  alt={`Página ${currentPage + 1}`}
                  className="h-screen object-contain"
                />
                {mode === "double" && currentPage + 1 < totalPages && (
                  <img
                    src={
                      chapterData.pages?.[currentPage + 1] ??
                      readerApi.imageUrl(Number(chapterId), currentPage + 1)
                    }
                    alt={`Página ${currentPage + 2}`}
                    className="h-screen object-contain"
                  />
                )}
              </div>
            </div>
          )}

          {mode !== "webtoon" && (
            <>
              <button
                onClick={() =>
                  goTo(currentPage - (mode === "double" ? 2 : 1))
                }
                disabled={currentPage === 0}
                className={clsx(
                  "fixed left-0 top-0 h-full w-16 flex items-center justify-start pl-3 transition-all",
                  showControls ? "opacity-100" : "opacity-0",
                  currentPage === 0 ? "cursor-default" : "cursor-pointer"
                )}
              >
                <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
                  <ChevronLeft className="h-6 w-6 text-white" />
                </div>
              </button>
              <button
                onClick={() =>
                  goTo(currentPage + (mode === "double" ? 2 : 1))
                }
                disabled={currentPage >= totalPages - 1}
                className={clsx(
                  "fixed right-0 top-0 h-full w-16 flex items-center justify-end pr-3 transition-all",
                  showControls ? "opacity-100" : "opacity-0",
                  currentPage >= totalPages - 1
                    ? "cursor-default"
                    : "cursor-pointer"
                )}
              >
                <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
                  <ChevronRight className="h-6 w-6 text-white" />
                </div>
              </button>
            </>
          )}

          <div
            className={clsx(
              "fixed bottom-0 left-0 right-0 h-1 bg-white/10 transition-opacity duration-300",
              showControls ? "opacity-100" : "opacity-0"
            )}
          >
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{
                width: totalPages
                  ? `${((currentPage + 1) / totalPages) * 100}%`
                  : "0%",
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
