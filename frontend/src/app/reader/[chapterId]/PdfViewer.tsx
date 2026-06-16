"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const ESTIMATED_PAGE_HEIGHT = 1100;
const RENDER_BUFFER = 3;

interface Props {
  pdfUrl: string;
  currentPage: number;
  onNumPages: (n: number) => void;
  onPageChange?: (page: number) => void;
}

export default function PdfViewer({
  pdfUrl,
  currentPage,
  onNumPages,
  onPageChange,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(
    new Set([0, 1, 2])
  );
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isProgrammaticScroll = useRef(false);
  const lastTrackedPage = useRef(-1);

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

  useEffect(() => {
    if (numPages === 0 || currentPage === 0) return;
    expandRendered(currentPage, numPages);
    const el = pageRefs.current[currentPage];
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  }, [numPages]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
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
                renderTextLayer={false}
              />
            )}
          </div>
        ))}
    </Document>
  );
}
