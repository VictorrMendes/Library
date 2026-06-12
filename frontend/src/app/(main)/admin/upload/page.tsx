"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  UploadCloud, X, CheckCircle2, XCircle, Loader2,
  RefreshCw, FileArchive, FolderOpen,
} from "lucide-react";
import { clsx } from "clsx";
import { libraryApi, scannerApi } from "@/lib/api";
import type { Library } from "@/types";

const ALLOWED_EXT = [".cbz", ".cbr", ".cb7", ".zip", ".epub", ".pdf"];
const MAX_SIZE_MB = 500;

interface UploadItem {
  uid: string;
  file: File;
  jobId: number | null;
  uploadPct: number;
  status: "queued" | "uploading" | "processing" | "completed" | "failed";
  seriesName?: string;
  targetPath?: string;
  error?: string;
}

function fileExt(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_CFG = {
  queued:     { label: "Na fila",      color: "text-muted-foreground bg-muted",     icon: FileArchive,  spin: false },
  uploading:  { label: "Enviando…",    color: "text-blue-400 bg-blue-500/10",       icon: UploadCloud,  spin: true  },
  processing: { label: "Processando…", color: "text-yellow-400 bg-yellow-500/10",   icon: RefreshCw,    spin: true  },
  completed:  { label: "Concluído",    color: "text-green-400 bg-green-500/10",     icon: CheckCircle2, spin: false },
  failed:     { label: "Falhou",       color: "text-red-400 bg-red-500/10",         icon: XCircle,      spin: false },
};

export default function AdminUploadPage() {
  const [libraryId, setLibraryId] = useState<string>("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [noLibraryError, setNoLibraryError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep a ref so async callbacks always see current state
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;

  const { data: libraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => libraryApi.list().then((r) => r.data.results as Library[]),
  });

  const selectedLibrary = libraries.find((l) => String(l.id) === libraryId);
  const selectedHasNoFolder =
    selectedLibrary !== undefined &&
    (!selectedLibrary.folder_paths || selectedLibrary.folder_paths.length === 0);

  useEffect(() => {
    if (libraries.length > 0 && !libraryId) {
      setLibraryId(String(libraries[0].id));
    }
  }, [libraries, libraryId]);

  // Poll jobs still in "processing" state (fallback for any pending backend tasks)
  useEffect(() => {
    const processing = items.filter((i) => i.status === "processing" && i.jobId);
    if (processing.length === 0) return;

    let polls = 0;
    const MAX_POLLS = 120; // 5 minutes at 2.5s interval

    const interval = setInterval(async () => {
      polls++;
      if (polls > MAX_POLLS) {
        setItems((prev) =>
          prev.map((i) =>
            i.status === "processing"
              ? { ...i, status: "failed", error: "Tempo esgotado. Verifique os logs do servidor." }
              : i
          )
        );
        clearInterval(interval);
        return;
      }

      await Promise.all(
        processing.map(async ({ jobId }) => {
          try {
            const { data } = await scannerApi.uploadJob(jobId!);
            if (data.status === "completed" || data.status === "failed") {
              setItems((prev) =>
                prev.map((i) =>
                  i.jobId === jobId
                    ? {
                        ...i,
                        status: data.status,
                        seriesName: data.series_name || undefined,
                        targetPath: data.target_path || undefined,
                        error: data.error_message || undefined,
                      }
                    : i
                )
              );
            }
          } catch {
            // ignore transient poll errors
          }
        })
      );
    }, 2500);

    return () => clearInterval(interval);
  }, [items]);

  function addFiles(files: FileList | File[]) {
    const valid = Array.from(files).filter((f) => {
      const ext = fileExt(f.name);
      return ALLOWED_EXT.includes(ext) && f.size <= MAX_SIZE_MB * 1024 * 1024;
    });
    if (valid.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...valid.map((f) => ({
        uid: crypto.randomUUID(),
        file: f,
        jobId: null,
        uploadPct: 0,
        status: "queued" as const,
      })),
    ]);
  }

  async function processQueue() {
    if (uploading) return;
    if (!libraryId || selectedHasNoFolder) {
      setNoLibraryError(true);
      setTimeout(() => setNoLibraryError(false), 3000);
      return;
    }
    setNoLibraryError(false);
    setUploading(true);

    // Read current items from ref so we always have the latest state
    const queued = itemsRef.current.filter((i) => i.status === "queued");

    for (const item of queued) {
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("library_id", libraryId);

      setItems((prev) =>
        prev.map((i) => (i.uid === item.uid ? { ...i, status: "uploading", uploadPct: 0 } : i))
      );

      try {
        const { data } = await scannerApi.upload(formData, (pct) => {
          setItems((prev) =>
            prev.map((i) => (i.uid === item.uid ? { ...i, uploadPct: pct } : i))
          );
        });

        const finalStatus =
          data.status === "completed" || data.status === "failed"
            ? data.status
            : "processing";

        setItems((prev) =>
          prev.map((i) =>
            i.uid === item.uid
              ? {
                  ...i,
                  status: finalStatus,
                  jobId: data.id,
                  uploadPct: 100,
                  seriesName: data.series_name || undefined,
                  targetPath: data.target_path || undefined,
                  error: data.error_message || undefined,
                }
              : i
          )
        );
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })
            ?.response?.data?.detail ?? "Erro ao enviar arquivo.";
        setItems((prev) =>
          prev.map((i) =>
            i.uid === item.uid ? { ...i, status: "failed", error: msg } : i
          )
        );
      }
    }

    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function removeItem(uid: string) {
    setItems((prev) => prev.filter((i) => i.uid !== uid));
  }

  const hasQueued = items.some((i) => i.status === "queued");

  return (
    <div className="p-6 space-y-6 max-w-screen-lg">
      <div>
        <h1 className="text-2xl font-bold font-sans">Upload de Arquivos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Envie CBZ, CBR, EPUB ou PDF. O sistema detecta a série e organiza
          automaticamente na biblioteca selecionada.
        </p>
      </div>

      {/* Library selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0">Biblioteca de destino:</label>
          <select
            value={libraryId}
            onChange={(e) => { setLibraryId(e.target.value); setNoLibraryError(false); }}
            className={clsx(
              "px-3 py-2 rounded-lg bg-card border text-sm focus:outline-none focus:ring-2 focus:ring-primary",
              noLibraryError ? "border-red-500" : "border-border"
            )}
          >
            {libraries.length === 0
              ? <option value="">— nenhuma biblioteca cadastrada —</option>
              : libraries.map((lib) => (
                  <option key={lib.id} value={lib.id}>{lib.name}</option>
                ))
            }
          </select>
        </div>

        {libraries.length === 0 && (
          <p className="text-sm text-yellow-400">
            Nenhuma biblioteca cadastrada.{" "}
            <a href="/admin/libraries" className="underline hover:text-yellow-300">
              Crie uma biblioteca primeiro.
            </a>
          </p>
        )}

        {noLibraryError && libraries.length > 0 && (
          <p className="text-sm text-red-400">Selecione uma biblioteca de destino.</p>
        )}

        {selectedHasNoFolder && (
          <p className="text-sm text-yellow-400">
            Esta biblioteca não tem nenhuma pasta configurada. O upload vai falhar.{" "}
            <a href="/admin/libraries" className="underline hover:text-yellow-300">
              Configure a pasta em Admin → Bibliotecas.
            </a>
          </p>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/20"
        )}
      >
        <UploadCloud className={clsx(
          "h-10 w-10 transition-colors",
          dragging ? "text-primary" : "text-muted-foreground"
        )} />
        <div className="text-center">
          <p className="text-sm font-medium">
            Arraste arquivos aqui ou{" "}
            <span className="text-primary">clique para selecionar</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {ALLOWED_EXT.join(", ")} · máx {MAX_SIZE_MB} MB por arquivo
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_EXT.join(",")}
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Queue */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Arquivos ({items.length})</h2>
            {hasQueued && (
              <button
                onClick={processQueue}
                disabled={uploading || !libraryId || selectedHasNoFolder}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {uploading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <UploadCloud className="h-4 w-4" />}
                Enviar tudo
              </button>
            )}
          </div>

          <div className="space-y-2">
            {items.map((item) => {
              const cfg = STATUS_CFG[item.status];
              const Icon = cfg.icon;
              return (
                <div key={item.uid} className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <FileArchive className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtSize(item.file.size)}
                        {item.seriesName && (
                          <span className="ml-2 inline-flex items-center gap-1">
                            <FolderOpen className="h-3 w-3" />
                            {item.seriesName}
                          </span>
                        )}
                      </p>
                    </div>

                    <span className={clsx(
                      "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium shrink-0",
                      cfg.color
                    )}>
                      <Icon className={clsx("h-3 w-3", cfg.spin && "animate-spin")} />
                      {cfg.label}
                    </span>

                    {(item.status === "queued" || item.status === "failed") && (
                      <button
                        onClick={() => removeItem(item.uid)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {item.status === "uploading" && (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-200"
                        style={{ width: `${item.uploadPct}%` }}
                      />
                    </div>
                  )}

                  {item.error && (
                    <p className="text-xs text-red-400">{item.error}</p>
                  )}

                  {item.status === "completed" && item.targetPath && (
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {item.targetPath}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
