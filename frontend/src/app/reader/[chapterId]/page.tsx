"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import { readerApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { clsx } from "clsx";

// Carregado apenas no cliente — pdfjs não funciona no Node.js 20 via SSR
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
  const { user } = useAuthStore();

  const [currentPage, setCurrentPage] = useState(0);
  const [mode, setMode] = useState<ReadingMode>(user?.reading_mode ?? "single");
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfNumPages, setPdfNumPages] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (e.key === "ArrowRight" || e.key === "d") goTo(currentPage + 1);
      if (e.key === "ArrowLeft" || e.key === "a") goTo(currentPage - 1);
      if (e.key === "Escape") history.back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, goTo]);

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

      {/* ── EPUB Viewer (iframe) ─────────────────────────────────── */}
      {format === "epub" && chapterData.book_page_base_url && (
        <>
          <iframe
            key={`epub-${currentPage}`}
            src={`${chapterData.book_page_base_url}?page=${currentPage}`}
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
