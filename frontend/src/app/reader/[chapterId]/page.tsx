"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, X, Maximize2, Minimize2, Globe, Settings,
  Bookmark, BookmarkPlus, Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { readerApi, authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useTranslatorStore } from "@/store/translator";
import { clsx } from "clsx";

interface BookmarkEntry {
  id: number;
  chapter_id: number;
  page: number;
  label: string;
  created_at: string;
}

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

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="h-8 w-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
    </div>
  );
}

function ReaderContent() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const searchParams = useSearchParams();
  const { user, setUser } = useAuthStore();
  const { toggle: toggleTranslator, isOpen: translatorOpen } = useTranslatorStore();

  const initialPage = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [mode, setMode] = useState<ReadingMode>(user?.reading_mode ?? "single");
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [editingPage, setEditingPage] = useState(false);
  const [inputPage, setInputPage] = useState("");
  const [fontSize, setFontSize] = useState(user?.book_font_size ?? 16);
  const [lineSpacing, setLineSpacing] = useState(user?.book_line_spacing ?? 1.6);
  const [brightness, setBrightness] = useState(100);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webtoonRefs = useRef<(HTMLImageElement | null)[]>([]);
  const webtoonObserver = useRef<IntersectionObserver | null>(null);
  const webtoonDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: chapterData } = useQuery<ChapterData>({
    queryKey: ["reader", "chapter", chapterId],
    queryFn: () => readerApi.chapterImages(Number(chapterId)).then((r) => r.data),
  });

  const { mutate: saveProgress } = useMutation({
    mutationFn: (page: number) =>
      readerApi.updateProgress({
        chapter_id: Number(chapterId),
        pages_read: page + 1,
      }),
  });

  const { data: bookmarks = [], refetch: refetchBookmarks } = useQuery<BookmarkEntry[]>({
    queryKey: ["bookmarks", chapterId],
    queryFn: () =>
      readerApi.bookmarks().then((r) =>
        (r.data as BookmarkEntry[]).filter((b) => b.chapter_id === Number(chapterId))
      ),
  });

  const { mutate: addBookmark } = useMutation({
    mutationFn: () =>
      readerApi.createBookmark({
        chapter_id: Number(chapterId),
        page: currentPage,
        label: `Página ${currentPage + 1}`,
      }),
    onSuccess: () => refetchBookmarks(),
  });

  const { mutate: removeBookmark } = useMutation({
    mutationFn: (id: number) => readerApi.deleteBookmark(id),
    onSuccess: () => refetchBookmarks(),
  });

  const { mutate: savePreferences } = useMutation({
    mutationFn: (prefs: Record<string, unknown>) => authApi.updatePreferences(prefs),
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

  // Debounced progress save for PDF scroll tracking
  const handlePdfPageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
      saveDebounce.current = setTimeout(() => saveProgress(page), 1500);
    },
    [saveProgress]
  );

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showSettings || editingPage) return;
      if (e.key === "ArrowRight" || e.key === "d") goTo(currentPage + 1);
      if (e.key === "ArrowLeft" || e.key === "a") goTo(currentPage - 1);
      if (e.key === "Escape") history.back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, goTo, showSettings, editingPage]);

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

  // Webtoon: IntersectionObserver tracks visible page + saves progress
  useEffect(() => {
    if (format !== "images" || mode !== "webtoon" || totalPages === 0) return;

    webtoonObserver.current?.disconnect();
    webtoonObserver.current = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting && e.intersectionRatio > 0.1)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        const idx = webtoonRefs.current.indexOf(best.target as HTMLImageElement);
        if (idx < 0 || idx === currentPage) return;
        clearTimeout(webtoonDebounce.current!);
        webtoonDebounce.current = setTimeout(() => {
          setCurrentPage(idx);
          if (saveDebounce.current) clearTimeout(saveDebounce.current);
          saveDebounce.current = setTimeout(() => saveProgress(idx), 1500);
        }, 300);
      },
      { threshold: [0.1, 0.4, 0.7] }
    );

    const refs = webtoonRefs.current.slice(0, totalPages);
    refs.forEach((el) => { if (el) webtoonObserver.current?.observe(el); });

    return () => {
      webtoonObserver.current?.disconnect();
      clearTimeout(webtoonDebounce.current!);
    };
  }, [format, mode, totalPages, saveProgress, currentPage]);

  // Preload next pages for image viewer
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

  if (!chapterData) return <LoadingScreen />;

  const pageLabel = `${currentPage + 1} / ${
    format === "pdf" ? (pdfNumPages || "…") : (totalPages || "…")
  }`;

  // Clickable progress bar (seek to position)
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (totalPages === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    goTo(Math.floor(ratio * totalPages));
  };

  // Page number input submit
  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(inputPage, 10) - 1;
    if (!isNaN(p)) goTo(p);
    setEditingPage(false);
  };

  const progressPct = totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0;

  const navButtonClass = (visible: boolean) =>
    clsx(
      "fixed top-0 h-full w-16 flex items-center transition-all z-40",
      visible ? "opacity-100" : "opacity-0 pointer-events-none"
    );

  return (
    <div
      className="min-h-screen bg-black relative select-none"
      style={{ filter: brightness !== 100 ? `brightness(${brightness}%)` : undefined }}
      onMouseMove={showControlsTemporarily}
      onClick={showControlsTemporarily}
    >
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div
        className={clsx(
          "fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm transition-all duration-300",
          showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
        )}
      >
        <button
          onClick={() => history.back()}
          className="flex items-center gap-2 text-white/80 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Page indicator — click to jump */}
        {editingPage ? (
          <form onSubmit={handlePageInputSubmit} onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              type="number"
              min={1}
              max={totalPages || undefined}
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onBlur={() => setEditingPage(false)}
              className="w-24 text-center bg-white/10 text-white text-sm border border-white/20 rounded-md px-2 py-1 focus:outline-none focus:border-primary"
            />
          </form>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setInputPage(String(currentPage + 1));
              setEditingPage(true);
            }}
            title="Clique para ir a uma página"
            className="text-white/70 text-sm hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
          >
            {pageLabel}
          </button>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTranslator}
            title="Tradutor"
            className={clsx("p-2 transition-colors", translatorOpen ? "text-primary" : "text-white/70 hover:text-white")}
          >
            <Globe className="h-5 w-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowBookmarks((v) => !v); setShowSettings(false); }}
            title="Marcadores"
            className={clsx("p-2 transition-colors relative", showBookmarks ? "text-primary" : "text-white/70 hover:text-white")}
          >
            <Bookmark className="h-5 w-5" />
            {bookmarks.length > 0 && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary" />
            )}
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            title="Configurações"
            className={clsx("p-2 transition-colors", showSettings ? "text-primary" : "text-white/70 hover:text-white")}
          >
            <Settings className="h-5 w-5" />
          </button>
          <button onClick={toggleFullscreen} className="p-2 text-white/70 hover:text-white">
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
          {format === "images" && (
            <div className="flex bg-white/10 rounded-lg p-0.5 gap-0.5">
              {(["single", "double", "webtoon"] as ReadingMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={clsx(
                    "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    mode === m ? "bg-white text-black" : "text-white/70 hover:text-white"
                  )}
                >
                  {m === "single" ? "1" : m === "double" ? "2" : "∞"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bookmarks panel ─────────────────────────────────────────── */}
      {showBookmarks && (
        <div
          className="fixed top-14 right-4 z-50 w-72 bg-black/90 border border-white/10 rounded-xl p-4 space-y-3 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Marcadores</p>
            <button
              onClick={() => addBookmark()}
              title="Adicionar marcador na página atual"
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <BookmarkPlus className="h-4 w-4" />
              Pg. {currentPage + 1}
            </button>
          </div>
          {bookmarks.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-3">
              Nenhum marcador. Clique em + para adicionar.
            </p>
          ) : (
            <ul className="space-y-1 max-h-60 overflow-y-auto pr-1">
              {bookmarks.map((bm) => (
                <li
                  key={bm.id}
                  className="flex items-center justify-between gap-2 group"
                >
                  <button
                    onClick={() => { goTo(bm.page); setShowBookmarks(false); }}
                    className="flex-1 text-left text-sm text-white/80 hover:text-white truncate px-2 py-1 rounded hover:bg-white/10 transition-colors"
                  >
                    {bm.label || `Página ${bm.page + 1}`}
                  </button>
                  <button
                    onClick={() => removeBookmark(bm.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Settings panel ───────────────────────────────────────────── */}
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

      {/* ── EPUB Viewer ──────────────────────────────────────────────── */}
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
            className={clsx(navButtonClass(showControls), "left-0 justify-start pl-3", currentPage === 0 && "cursor-default")}
          >
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <ChevronLeft className="h-6 w-6 text-white" />
            </div>
          </button>
          <button
            onClick={() => goTo(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
            className={clsx(navButtonClass(showControls), "right-0 justify-end pr-3", currentPage >= totalPages - 1 && "cursor-default")}
          >
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <ChevronRight className="h-6 w-6 text-white" />
            </div>
          </button>
        </>
      )}

      {/* ── PDF Viewer ───────────────────────────────────────────────── */}
      {format === "pdf" && chapterData.pdf_url && (
        <>
          <div
            className="flex flex-col items-center gap-0 overflow-auto bg-neutral-900 min-h-screen"
            style={{ paddingTop: "64px", paddingBottom: "64px" }}
          >
            <PdfViewer
              pdfUrl={chapterData.pdf_url}
              currentPage={currentPage}
              onNumPages={setPdfNumPages}
              onPageChange={handlePdfPageChange}
            />
          </div>

          {/* PDF prev/next buttons */}
          <button
            onClick={() => goTo(currentPage - 1)}
            disabled={currentPage === 0}
            className={clsx(navButtonClass(showControls), "left-0 justify-start pl-3", currentPage === 0 && "cursor-default")}
          >
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <ChevronLeft className="h-6 w-6 text-white" />
            </div>
          </button>
          <button
            onClick={() => goTo(currentPage + 1)}
            disabled={currentPage >= pdfNumPages - 1}
            className={clsx(navButtonClass(showControls), "right-0 justify-end pr-3", currentPage >= pdfNumPages - 1 && "cursor-default")}
          >
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <ChevronRight className="h-6 w-6 text-white" />
            </div>
          </button>
        </>
      )}

      {/* ── Image Viewer (CBZ / archive) ──────────────────────────────── */}
      {(format === "images" || !chapterData.format) && (
        <>
          {mode === "webtoon" ? (
            <div className="flex flex-col items-center pt-16">
              {Array.from({ length: totalPages }, (_, i) => (
                <img
                  key={i}
                  ref={(el) => { webtoonRefs.current[i] = el; }}
                  src={chapterData.pages?.[i] ?? readerApi.imageUrl(Number(chapterId), i)}
                  alt={`Página ${i + 1}`}
                  className="w-full max-w-2xl"
                  loading={i < 3 ? "eager" : "lazy"}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-screen">
              <div className={clsx("flex gap-0", mode === "double" ? "max-w-6xl" : "max-w-3xl")}>
                <img
                  src={chapterData.pages?.[currentPage] ?? readerApi.imageUrl(Number(chapterId), currentPage)}
                  alt={`Página ${currentPage + 1}`}
                  className="h-screen object-contain"
                />
                {mode === "double" && currentPage + 1 < totalPages && (
                  <img
                    src={chapterData.pages?.[currentPage + 1] ?? readerApi.imageUrl(Number(chapterId), currentPage + 1)}
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
                onClick={() => goTo(currentPage - (mode === "double" ? 2 : 1))}
                disabled={currentPage === 0}
                className={clsx(navButtonClass(showControls), "left-0 justify-start pl-3", currentPage === 0 && "cursor-default")}
              >
                <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
                  <ChevronLeft className="h-6 w-6 text-white" />
                </div>
              </button>
              <button
                onClick={() => goTo(currentPage + (mode === "double" ? 2 : 1))}
                disabled={currentPage >= totalPages - 1}
                className={clsx(navButtonClass(showControls), "right-0 justify-end pr-3", currentPage >= totalPages - 1 && "cursor-default")}
              >
                <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
                  <ChevronRight className="h-6 w-6 text-white" />
                </div>
              </button>
            </>
          )}
        </>
      )}

      {/* ── Progress bar (all formats except webtoon) ─────────────────── */}
      {!(format === "images" && mode === "webtoon") && (
        <div
          className={clsx(
            "fixed bottom-0 left-0 right-0 h-1.5 bg-white/10 cursor-pointer transition-opacity duration-300 z-40",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={handleProgressClick}
          title={`Ir para página (${Math.round(progressPct)}%)`}
        >
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ReaderContent />
    </Suspense>
  );
}
