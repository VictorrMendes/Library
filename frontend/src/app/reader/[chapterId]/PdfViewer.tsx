"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { pdfToolsApi } from "@/lib/api";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// Placeholder height for unrendered pages (keeps scrollbar accurate)
const ESTIMATED_PAGE_HEIGHT = 1100;
// Pages rendered above/below the visible set
const RENDER_BUFFER = 3;

interface Props {
  pdfUrl: string;
  currentPage: number;
  onNumPages: (n: number) => void;
  onPageChange?: (page: number) => void;
  mangaFileId?: number;
  hasTextLayer?: boolean | null;
}

export default function PdfViewer({
  pdfUrl,
  currentPage,
  onNumPages,
  onPageChange,
  mangaFileId,
  hasTextLayer,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(
    new Set([0, 1, 2])
  );
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isProgrammaticScroll = useRef(false);
  const lastTrackedPage = useRef(-1);

  // OCR job state
  const [ocrJobId, setOcrJobId] = useState<number | null>(null);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startOcr = useCallback(async () => {
    if (!mangaFileId) return;
    setOcrError(null);
    setOcrStatus("pending");
    try {
      const res = await pdfToolsApi.ocr(mangaFileId, "por,eng");
      setOcrJobId(res.data.id);
    } catch {
      setOcrError("Não foi possível iniciar o OCR.");
      setOcrStatus(null);
    }
  }, [mangaFileId]);

  // Poll job status until done/failed
  useEffect(() => {
    if (!ocrJobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await pdfToolsApi.getJob(ocrJobId);
        setOcrStatus(res.data.status);
        if (res.data.status === "done") {
          clearInterval(pollRef.current!);
          setTimeout(() => window.location.reload(), 1500);
        } else if (res.data.status === "failed") {
          clearInterval(pollRef.current!);
          setOcrError(res.data.error_message || "OCR falhou.");
          setOcrJobId(null);
        }
      } catch {
        clearInterval(pollRef.current!);
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [ocrJobId]);

  const expandRendered = useCallback(
    (center: number, total: number) => {
      setRenderedPages((prev) => {
        const next = new Set(prev);
        const lo = Math.max(0, center - RENDER_BUFFER);
        const hi = Math.min(total - 1, center + RENDER_BUFFER + 2);
        for (let i = lo; i <= hi; i++) next.add(i);
        return next;
      });
    },
    []
  );

  // Scroll to page when currentPage changes from parent (button / continue reading)
  useEffect(() => {
    if (numPages === 0) return;
    expandRendered(currentPage, numPages);
    const el = pageRefs.current[currentPage];
    if (!el) return;
    isProgrammaticScroll.current = true;
    el.scrollIntoView({
      behavior: currentPage === 0 ? "instant" : "smooth",
      block: "start",
    });
    const t = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 1000);
    return () => clearTimeout(t);
  }, [currentPage, numPages, expandRendered]);

  // Initial scroll restore (once numPages is known)
  useEffect(() => {
    if (numPages === 0 || currentPage === 0) return;
    expandRendered(currentPage, numPages);
    const el = pageRefs.current[currentPage];
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  }, [numPages]); // eslint-disable-line react-hooks/exhaustive-deps

  // IntersectionObserver: track visible page for progress bar / parent
  useEffect(() => {
    if (numPages === 0 || !onPageChange) return;
    let debounce: ReturnType<typeof setTimeout>;

    const scrollObserver = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const best = entries
            .filter((e) => e.isIntersecting && e.intersectionRatio > 0.15)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!best) return;
          const idx = pageRefs.current.indexOf(best.target as HTMLDivElement);
          if (idx >= 0 && idx !== lastTrackedPage.current) {
            lastTrackedPage.current = idx;
            onPageChange(idx);
          }
        }, 350);
      },
      { threshold: [0.15, 0.4, 0.7] }
    );

    pageRefs.current.slice(0, numPages).forEach((el) => {
      if (el) scrollObserver.observe(el);
    });
    return () => {
      scrollObserver.disconnect();
      clearTimeout(debounce);
    };
  }, [numPages, onPageChange]);

  // IntersectionObserver: lazy-render pages as they approach the viewport
  useEffect(() => {
    if (numPages === 0) return;

    const renderObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = pageRefs.current.indexOf(
              entry.target as HTMLDivElement
            );
            if (idx >= 0) expandRendered(idx, numPages);
          }
        });
      },
      { rootMargin: "800px" }
    );

    pageRefs.current.slice(0, numPages).forEach((el) => {
      if (el) renderObserver.observe(el);
    });
    return () => renderObserver.disconnect();
  }, [numPages, expandRendered]);

  const pageWidth =
    typeof window !== "undefined"
      ? Math.min(window.innerWidth - 32, 900)
      : 900;

  const ocrBanner = hasTextLayer === false && (
    <div className="sticky top-16 z-30 mx-auto mb-4 max-w-2xl">
      <div className="flex items-center gap-3 rounded-xl border border-yellow-500/30 bg-yellow-950/60 px-4 py-3 text-sm backdrop-blur-sm">
        <span className="text-yellow-400 shrink-0">⚠</span>
        <span className="text-yellow-200/90 flex-1">
          {ocrStatus === "processing" || ocrStatus === "pending"
            ? "OCR em andamento…"
            : ocrStatus === "done"
            ? "OCR concluído! Recarregando…"
            : ocrError
            ? ocrError
            : "PDF sem texto pesquisável — pesquisa e seleção de texto indisponíveis."}
        </span>
        {!ocrJobId && !ocrStatus && mangaFileId && (
          <button
            onClick={startOcr}
            className="shrink-0 rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-yellow-400 transition-colors"
          >
            Ativar OCR
          </button>
        )}
        {(ocrStatus === "pending" || ocrStatus === "processing") && (
          <span className="shrink-0 h-4 w-4 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />
        )}
      </div>
    </div>
  );

  return (
    <>
      {ocrBanner}
      <Document
        file={pdfUrl}
        onLoadSuccess={({ numPages: n }) => {
          setNumPages(n);
          onNumPages(n);
          setRenderedPages(new Set([0, 1, 2]));
        }}
        loading={
          <div className="text-white/50 text-sm mt-20 text-center">
            Carregando PDF…
          </div>
        }
        error={
          <div className="text-red-400 text-sm mt-20 text-center">
            Erro ao carregar PDF.
          </div>
        }
      >
        {numPages > 0 &&
          Array.from({ length: numPages }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                pageRefs.current[i] = el;
              }}
              style={{
                minHeight: renderedPages.has(i)
                  ? undefined
                  : ESTIMATED_PAGE_HEIGHT,
              }}
            >
              {renderedPages.has(i) && (
                <Page
                  pageNumber={i + 1}
                  className="shadow-2xl mb-2"
                  width={pageWidth}
                  renderAnnotationLayer={false}
                  renderTextLayer={hasTextLayer === true}
                />
              )}
            </div>
          ))}
      </Document>
    </>
  );
}
