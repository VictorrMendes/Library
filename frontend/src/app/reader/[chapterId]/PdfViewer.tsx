"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  pdfUrl: string;
  currentPage: number;
  onNumPages: (n: number) => void;
  onPageChange?: (page: number) => void;
}

export default function PdfViewer({ pdfUrl, currentPage, onNumPages, onPageChange }: Props) {
  const [numPages, setNumPages] = useState(0);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isProgrammaticScroll = useRef(false);
  const lastTrackedPage = useRef(-1);

  // Scroll to page when currentPage changes from parent (button / continue reading)
  useEffect(() => {
    if (numPages === 0) return;
    const el = pageRefs.current[currentPage];
    if (!el) return;
    isProgrammaticScroll.current = true;
    el.scrollIntoView({ behavior: currentPage === 0 ? "instant" : "smooth", block: "start" });
    const t = setTimeout(() => { isProgrammaticScroll.current = false; }, 1000);
    return () => clearTimeout(t);
  }, [currentPage, numPages]);

  // Initial scroll when PDF finishes loading (restore saved position)
  useEffect(() => {
    if (numPages === 0 || currentPage === 0) return;
    const el = pageRefs.current[currentPage];
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  }, [numPages]); // intentionally omit currentPage

  // IntersectionObserver: tracks which page is most visible as user scrolls
  useEffect(() => {
    if (numPages === 0 || !onPageChange) return;
    let debounce: ReturnType<typeof setTimeout>;

    const observer = new IntersectionObserver(
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

    const els = pageRefs.current.slice(0, numPages);
    els.forEach((el) => { if (el) observer.observe(el); });
    return () => { observer.disconnect(); clearTimeout(debounce); };
  }, [numPages, onPageChange]);

  return (
    <Document
      file={pdfUrl}
      onLoadSuccess={({ numPages: n }) => {
        setNumPages(n);
        onNumPages(n);
      }}
      loading={<div className="text-white/50 text-sm mt-20">Carregando PDF…</div>}
      error={<div className="text-red-400 text-sm mt-20">Erro ao carregar PDF.</div>}
    >
      {numPages > 0 &&
        Array.from({ length: numPages }, (_, i) => (
          <div
            key={i}
            ref={(el) => { pageRefs.current[i] = el; }}
          >
            <Page
              pageNumber={i + 1}
              className="shadow-2xl mb-2"
              width={Math.min(
                typeof window !== "undefined" ? window.innerWidth - 32 : 900,
                900
              )}
              renderAnnotationLayer={false}
              renderTextLayer={false}
            />
          </div>
        ))}
    </Document>
  );
}
