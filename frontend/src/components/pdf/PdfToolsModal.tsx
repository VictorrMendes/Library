"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Minimize2,
  ScanText,
  Wrench,
  KeyRound,
  FileOutput,
  GitMerge,
  Scissors,
  FileText,
  ImageDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  X,
} from "lucide-react";
import { pdfToolsApi } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { MangaFile, PdfJob } from "@/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// ─── async job status panel ───────────────────────────────────────────────────

function JobStatusPanel({
  jobId,
  onDownload,
}: {
  jobId: number;
  onDownload: (job: PdfJob) => void;
}) {
  const { data: job } = useQuery<PdfJob>({
    queryKey: ["pdf-job", jobId],
    queryFn: () => pdfToolsApi.getJob(jobId).then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      return data.status === "done" || data.status === "failed" ? false : 3000;
    },
    enabled: !!jobId,
  });

  if (!job) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Aguardando status…
      </div>
    );
  }

  const statusMap: Record<PdfJob["status"], { label: string; color: string }> = {
    pending: { label: "Na fila", color: "text-amber-400" },
    processing: { label: "Processando", color: "text-sky-400" },
    done: { label: "Concluído", color: "text-emerald-400" },
    failed: { label: "Falhou", color: "text-red-400" },
  };
  const s = statusMap[job.status];

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {job.status === "processing" || job.status === "pending" ? (
          <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
        ) : job.status === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-400" />
        )}
        <span className={s.color}>{s.label}</span>
      </div>

      {/* indeterminate progress bar while running */}
      {(job.status === "pending" || job.status === "processing") && (
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-pulse w-1/2" />
        </div>
      )}

      {job.status === "failed" && job.error_message && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {job.error_message}
        </p>
      )}

      {job.status === "done" && (
        <button
          onClick={() => onDownload(job)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Download className="h-4 w-4" />
          Baixar resultado
        </button>
      )}
    </div>
  );
}

// ─── individual tool panels ───────────────────────────────────────────────────

function CompressPanel({ file }: { file: MangaFile }) {
  const [level, setLevel] = useState("3");
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => pdfToolsApi.compress(file.id, Number(level)),
    onSuccess: (res) => {
      downloadBlob(res.data as Blob, `${basename(file.file_path)}_comprimido.pdf`);
      setDone(true);
      toast({ title: "PDF comprimido e baixado", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao comprimir PDF", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Reduz o tamanho do arquivo PDF. Níveis mais altos comprimem mais, mas podem reduzir a
        qualidade de imagens.
      </p>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Nível de otimização (1 = mínimo · 9 = máximo)
        </label>
        <select
          value={level}
          onChange={(e) => { setLevel(e.target.value); setDone(false); }}
          className="w-full px-3 py-2 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}{n === 3 ? " (padrão)" : ""}
            </option>
          ))}
        </select>
      </div>
      {done && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Download concluído.
        </p>
      )}
      <button
        onClick={() => { setDone(false); mutation.mutate(); }}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Comprimir
      </button>
    </div>
  );
}

function OcrPanel({ file }: { file: MangaFile }) {
  const [lang, setLang] = useState("por,eng");
  const [jobId, setJobId] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: () => pdfToolsApi.ocr(file.id, lang),
    onSuccess: (res) => {
      setJobId(res.data.id);
      toast({ title: "OCR iniciado", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao iniciar OCR", variant: "destructive" }),
  });

  const handleDownload = async (job: PdfJob) => {
    try {
      const res = await pdfToolsApi.downloadJob(job.id);
      downloadBlob(res.data as Blob, `${basename(file.file_path)}_ocr.pdf`);
    } catch {
      toast({ title: "Erro ao baixar resultado", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Adiciona uma camada de texto pesquisável ao PDF usando reconhecimento ótico de caracteres
        (OCR). O processo é assíncrono.
      </p>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Idioma(s)
        </label>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="por,eng">Português + Inglês</option>
          <option value="eng">Inglês</option>
          <option value="por">Português</option>
          <option value="jpn">Japonês</option>
          <option value="spa">Espanhol</option>
        </select>
      </div>
      <button
        onClick={() => { setJobId(null); mutation.mutate(); }}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Iniciar OCR
      </button>
      {jobId && <JobStatusPanel jobId={jobId} onDownload={handleDownload} />}
    </div>
  );
}

function RepairPanel({ file }: { file: MangaFile }) {
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => pdfToolsApi.repair(file.id),
    onSuccess: (res) => {
      downloadBlob(res.data as Blob, `${basename(file.file_path)}_reparado.pdf`);
      setDone(true);
      toast({ title: "PDF reparado e baixado", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao reparar PDF", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tenta corrigir estruturas corrompidas no arquivo PDF. O arquivo reparado será baixado
        automaticamente.
      </p>
      {done && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Download concluído.
        </p>
      )}
      <button
        onClick={() => { setDone(false); mutation.mutate(); }}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Reparar PDF
      </button>
    </div>
  );
}

function RemovePasswordPanel({ file }: { file: MangaFile }) {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => pdfToolsApi.removePassword(file.id, password),
    onSuccess: (res) => {
      downloadBlob(res.data as Blob, `${basename(file.file_path)}_sem_senha.pdf`);
      setDone(true);
      toast({ title: "Senha removida — PDF baixado", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao remover senha (senha incorreta?)", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Remove a proteção por senha do PDF. Informe a senha atual para continuar.
      </p>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Senha atual (deixe em branco se o arquivo não tiver senha de abertura)
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setDone(false); }}
          placeholder="••••••••"
          className="w-full px-3 py-2 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>
      {done && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Download concluído.
        </p>
      )}
      <button
        onClick={() => { setDone(false); mutation.mutate(); }}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Remover senha
      </button>
    </div>
  );
}

function PdfToEpubPanel({ file }: { file: MangaFile }) {
  const [jobId, setJobId] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: () => pdfToolsApi.pdfToEpub(file.id),
    onSuccess: (res) => {
      setJobId(res.data.id);
      toast({ title: "Conversão iniciada", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao iniciar conversão", variant: "destructive" }),
  });

  const handleDownload = async (job: PdfJob) => {
    try {
      const res = await pdfToolsApi.downloadJob(job.id);
      const name = basename(file.file_path).replace(/\.pdf$/i, ".epub");
      downloadBlob(res.data as Blob, name);
    } catch {
      toast({ title: "Erro ao baixar EPUB", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Converte o PDF para o formato EPUB. O processo é assíncrono e pode levar alguns minutos
        dependendo do tamanho do arquivo.
      </p>
      <button
        onClick={() => { setJobId(null); mutation.mutate(); }}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Converter para EPUB
      </button>
      {jobId && <JobStatusPanel jobId={jobId} onDownload={handleDownload} />}
    </div>
  );
}

function MergePanel({
  file,
  allPdfFiles,
}: {
  file: MangaFile;
  allPdfFiles: MangaFile[];
}) {
  const others = allPdfFiles.filter((f) => f.id !== file.id);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setDone(false);
  }

  // Merge order: current file first, then selected in the order they appear
  const ids = [file.id, ...allPdfFiles.filter((f) => selected.has(f.id)).map((f) => f.id)];

  const mutation = useMutation({
    mutationFn: () => pdfToolsApi.merge(ids),
    onSuccess: (res) => {
      downloadBlob(res.data as Blob, `merged_${Date.now()}.pdf`);
      setDone(true);
      toast({ title: "PDFs mesclados e baixados", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao mesclar PDFs", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mescla múltiplos PDFs em um único arquivo. O arquivo atual é sempre incluído em primeiro
        lugar.
      </p>
      {others.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Nenhum outro PDF disponível nesta série.
        </p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Selecione os PDFs para juntar:
          </p>
          {others.map((f) => (
            <label
              key={f.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md bg-background border border-border/50 cursor-pointer hover:border-primary/40 hover:bg-accent/20 transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                onChange={() => toggle(f.id)}
                className="accent-primary"
              />
              <span className="text-sm truncate flex-1">{basename(f.file_path)}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.bytes)}</span>
            </label>
          ))}
        </div>
      )}
      {done && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Download concluído.
        </p>
      )}
      <button
        onClick={() => { setDone(false); mutation.mutate(); }}
        disabled={mutation.isPending || selected.size === 0}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Juntar {selected.size > 0 ? `(${selected.size + 1} arquivos)` : ""}
      </button>
    </div>
  );
}

function SplitPanel({ file }: { file: MangaFile }) {
  const [pages, setPages] = useState("");
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => pdfToolsApi.split(file.id, pages),
    onSuccess: (res) => {
      downloadBlob(res.data as Blob, `${basename(file.file_path)}_dividido.zip`);
      setDone(true);
      toast({ title: "PDF dividido — ZIP baixado", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao dividir PDF", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Divide o PDF nos pontos de página indicados. Você receberá um ZIP com os segmentos.
        {file.pages > 0 && (
          <> Este arquivo tem <strong>{file.pages} páginas</strong>.</>
        )}
      </p>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          Páginas de corte (ex: 10,20,30)
        </label>
        <input
          type="text"
          value={pages}
          onChange={(e) => { setPages(e.target.value); setDone(false); }}
          placeholder="10,20,30"
          className="w-full px-3 py-2 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <p className="text-xs text-muted-foreground mt-1">
          O PDF será cortado após cada página listada, gerando múltiplos arquivos.
        </p>
      </div>
      {done && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Download concluído.
        </p>
      )}
      <button
        onClick={() => { setDone(false); mutation.mutate(); }}
        disabled={mutation.isPending || !pages.trim()}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Dividir
      </button>
    </div>
  );
}

function MetadataPanel({ file }: { file: MangaFile }) {
  const [form, setForm] = useState({
    title: "",
    author: "",
    subject: "",
    keywords: "",
  });
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      pdfToolsApi.updateMetadata(file.id, {
        title: form.title,
        author: form.author,
        subject: form.subject,
        keywords: form.keywords,
      }),
    onSuccess: (res) => {
      downloadBlob(res.data as Blob, `${basename(file.file_path)}_metadados.pdf`);
      setDone(true);
      toast({ title: "Metadados atualizados — PDF baixado", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao atualizar metadados", variant: "destructive" }),
  });

  const fields: { key: keyof typeof form; label: string; placeholder: string }[] = [
    { key: "title", label: "Título", placeholder: "Título do documento" },
    { key: "author", label: "Autor", placeholder: "Nome do autor" },
    { key: "subject", label: "Assunto", placeholder: "Assunto ou descrição breve" },
    { key: "keywords", label: "Palavras-chave", placeholder: "manga, aventura, ficção" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Edita os metadados internos do arquivo PDF (título, autor, assunto e palavras-chave).
      </p>
      <div className="space-y-3">
        {fields.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              {label}
            </label>
            <input
              type="text"
              value={form[key]}
              onChange={(e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setDone(false); }}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-md bg-background border border-border/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        ))}
      </div>
      {done && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Download concluído.
        </p>
      )}
      <button
        onClick={() => { setDone(false); mutation.mutate(); }}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvar metadados
      </button>
    </div>
  );
}

function ExtractImagesPanel({ file }: { file: MangaFile }) {
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: () => pdfToolsApi.extractImages(file.id),
    onSuccess: (res) => {
      downloadBlob(res.data as Blob, `${basename(file.file_path)}_imagens.zip`);
      setDone(true);
      toast({ title: "Imagens extraídas — ZIP baixado", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao extrair imagens", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Extrai todas as imagens embutidas no PDF e as compacta em um arquivo ZIP para download.
      </p>
      {done && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Download concluído.
        </p>
      )}
      <button
        onClick={() => { setDone(false); mutation.mutate(); }}
        disabled={mutation.isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Extrair imagens
      </button>
    </div>
  );
}

// ─── tool list ────────────────────────────────────────────────────────────────

type ToolId =
  | "compress"
  | "ocr"
  | "repair"
  | "remove-password"
  | "pdf-to-epub"
  | "merge"
  | "split"
  | "metadata"
  | "extract-images";

const TOOLS: { id: ToolId; label: string; icon: React.ReactNode; async?: boolean }[] = [
  { id: "compress", label: "Comprimir", icon: <Minimize2 className="h-4 w-4" /> },
  { id: "ocr", label: "OCR", icon: <ScanText className="h-4 w-4" />, async: true },
  { id: "repair", label: "Reparar", icon: <Wrench className="h-4 w-4" /> },
  { id: "remove-password", label: "Remover senha", icon: <KeyRound className="h-4 w-4" /> },
  { id: "pdf-to-epub", label: "PDF → EPUB", icon: <FileOutput className="h-4 w-4" />, async: true },
  { id: "merge", label: "Juntar PDFs", icon: <GitMerge className="h-4 w-4" /> },
  { id: "split", label: "Dividir", icon: <Scissors className="h-4 w-4" /> },
  { id: "metadata", label: "Metadados", icon: <FileText className="h-4 w-4" /> },
  { id: "extract-images", label: "Extrair imagens", icon: <ImageDown className="h-4 w-4" /> },
];

// ─── modal ────────────────────────────────────────────────────────────────────

interface PdfToolsModalProps {
  file: MangaFile | null;
  allPdfFiles?: MangaFile[];
  open: boolean;
  onClose: () => void;
}

export function PdfToolsModal({
  file,
  allPdfFiles = [],
  open,
  onClose,
}: PdfToolsModalProps) {
  const [activeTool, setActiveTool] = useState<ToolId>("compress");

  if (!open || !file) return null;

  const filename = basename(file.file_path);

  function renderPanel() {
    if (!file) return null;
    switch (activeTool) {
      case "compress":
        return <CompressPanel file={file} />;
      case "ocr":
        return <OcrPanel file={file} />;
      case "repair":
        return <RepairPanel file={file} />;
      case "remove-password":
        return <RemovePasswordPanel file={file} />;
      case "pdf-to-epub":
        return <PdfToEpubPanel file={file} />;
      case "merge":
        return <MergePanel file={file} allPdfFiles={allPdfFiles} />;
      case "split":
        return <SplitPanel file={file} />;
      case "metadata":
        return <MetadataPanel file={file} />;
      case "extract-images":
        return <ExtractImagesPanel file={file} />;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* modal */}
      <div className="relative bg-card border border-border/60 rounded-lg shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
          <div className="min-w-0">
            <h2 className="font-classic text-base font-medium flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary shrink-0" />
              Ferramentas PDF
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate" title={filename}>
              {filename}
              {" · "}
              {formatBytes(file.bytes)}
              {file.pages > 0 && ` · ${file.pages} páginas`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 ml-3"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body: sidebar + panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* tool sidebar */}
          <nav className="w-44 shrink-0 border-r border-border/50 bg-background/40 py-2 overflow-y-auto">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={[
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left",
                  activeTool === tool.id
                    ? "bg-primary/10 text-primary border-r-2 border-primary"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                ].join(" ")}
              >
                {tool.icon}
                <span className="truncate">{tool.label}</span>
                {tool.async && (
                  <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 bg-muted rounded px-1">
                    async
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* tool panel */}
          <div className="flex-1 p-5 overflow-y-auto">
            <h3 className="font-medium text-sm mb-4 flex items-center gap-2">
              {TOOLS.find((t) => t.id === activeTool)?.icon}
              {TOOLS.find((t) => t.id === activeTool)?.label}
            </h3>
            {renderPanel()}
          </div>
        </div>
      </div>
    </div>
  );
}
