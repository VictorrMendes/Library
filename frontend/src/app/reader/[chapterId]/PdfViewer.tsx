"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  pdfUrl: string;
  onNumPages: (n: number) => void;
}

export default function PdfViewer({ pdfUrl, onNumPages }: Props) {
  const [numPages, setNumPages] = useState(0);

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
          <Page
            key={i}
            pageNumber={i + 1}
            className="shadow-2xl mb-2"
            width={Math.min(
              typeof window !== "undefined" ? window.innerWidth - 32 : 900,
              900
            )}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        ))}
    </Document>
  );
}
