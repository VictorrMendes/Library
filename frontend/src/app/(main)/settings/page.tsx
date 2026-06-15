"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Palette, Type, Key, Download, Check, Plus, Trash2,
  Loader2, Copy, Eye, EyeOff, Database, Smartphone, Upload,
  AlertCircle, FileText,
} from "lucide-react";
import { authApi, apiKeysApi, progressApi, backupApi, deviceProfilesApi, fontsApi, scrobbleErrorsApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/hooks/use-toast";
import { clsx } from "clsx";

const THEMES = [
  { id: "dark", label: "Ametista", preview: "#9d4edd" },
  { id: "light", label: "Lavanda", preview: "#7c3aed" },
  { id: "midnight", label: "Meia-noite", preview: "#3b82f6" },
  { id: "forest", label: "Floresta", preview: "#22c55e" },
  { id: "ocean", label: "Oceano", preview: "#06b6d4" },
  { id: "sepia", label: "Sépia", preview: "#c2410c" },
  { id: "crimson", label: "Carmesim", preview: "#e11d48" },
];

const EPUB_FONTS = [
  { id: "serif", label: "Serif (padrão)" },
  { id: "sans-serif", label: "Sans-serif" },
  { id: "Merriweather", label: "Merriweather" },
  { id: "EB Garamond", label: "EB Garamond" },
  { id: "Lato", label: "Lato" },
  { id: "Georgia", label: "Georgia" },
  { id: "monospace", label: "Monospace" },
];

function applyTheme(theme: string) {
  const root = document.documentElement;
  root.className = root.className
    .split(" ")
    .filter((c) => !["dark", "light", "midnight", "forest", "ocean", "sepia", "crimson"].includes(c))
    .join(" ");
  if (theme !== "dark") root.classList.add(theme);
}

interface ApiKey {
  id: number;
  label: string;
  created_at: string;
  key?: string;
}

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const qc = useQueryClient();
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [annotationLoading, setAnnotationLoading] = useState(false);
  const [fontName, setFontName] = useState("");
  const [fontFile, setFontFile] = useState<File | null>(null);

  const currentTheme = user?.theme ?? "dark";
  const currentFont = user?.book_font_family ?? "serif";

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const { mutate: savePrefs } = useMutation({
    mutationFn: (prefs: Record<string, unknown>) => authApi.updatePreferences(prefs),
    onSuccess: (res) => { setUser(res.data); toast({ title: "Preferências salvas", variant: "success" }); },
    onError: () => toast({ title: "Erro ao salvar preferências", variant: "destructive" }),
  });

  const { data: deviceProfiles = [], refetch: refetchProfiles } = useQuery({
    queryKey: ["device-profiles"],
    queryFn: () => deviceProfilesApi.list().then((r) => r.data as Array<{
      id: number; device_name: string; reading_mode: string;
      reading_direction: string; book_font_family: string;
    }>),
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (id: number) => deviceProfilesApi.delete(id),
    onSuccess: () => refetchProfiles(),
  });

  const { data: customFonts = [], refetch: refetchFonts } = useQuery({
    queryKey: ["fonts"],
    queryFn: () => fontsApi.list().then((r) => r.data.results ?? r.data),
  });

  const uploadFontMutation = useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) =>
      fontsApi.upload(name, file),
    onSuccess: () => { refetchFonts(); setFontName(""); setFontFile(null); toast({ title: "Fonte adicionada", variant: "success" }); },
    onError: () => toast({ title: "Erro ao adicionar fonte", variant: "destructive" }),
  });

  const deleteFontMutation = useMutation({
    mutationFn: (id: number) => fontsApi.delete(id),
    onSuccess: () => refetchFonts(),
  });

  const { data: scrobbleErrors = [] } = useQuery({
    queryKey: ["scrobble-errors"],
    queryFn: () => scrobbleErrorsApi.list().then((r) => r.data as Array<{
      id: number; provider: string; series_name: string;
      error_message: string; attempted_at: string;
    }>),
  });

  const resolveErrorMutation = useMutation({
    mutationFn: (id: number) => scrobbleErrorsApi.resolve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scrobble-errors"] }),
  });

  const { data: apiKeys = [], refetch: refetchKeys } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => apiKeysApi.list().then((r) => r.data),
  });

  const createKeyMutation = useMutation({
    mutationFn: (label: string) => apiKeysApi.create(label),
    onSuccess: (res) => {
      setNewKeyValue(res.data.key);
      setNewKeyLabel("");
      refetchKeys();
      toast({ title: "Chave de API criada", variant: "success" });
    },
    onError: () => toast({ title: "Erro ao criar chave", variant: "destructive" }),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: number) => apiKeysApi.revoke(id),
    onSuccess: () => refetchKeys(),
  });

  async function handleExport() {
    setExportLoading(true);
    try {
      const res = await progressApi.export();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `biblioteca_progress_${user?.username ?? "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  }

  async function handleBackup() {
    setBackupLoading(true);
    try {
      const res = await backupApi.download();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "biblioteca_backup.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBackupLoading(false);
    }
  }

  async function handleExportAnnotations() {
    setAnnotationLoading(true);
    try {
      const res = await backupApi.exportAnnotations();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `annotations_${user?.username ?? "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setAnnotationLoading(false);
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 space-y-10 max-w-2xl">
      <div>
        <h1 className="font-classic text-2xl font-medium tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Personalize sua experiência de leitura.</p>
      </div>

      {/* ── Theme ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Tema Visual</h2>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                applyTheme(t.id);
                savePrefs({ theme: t.id });
              }}
              className={clsx(
                "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                currentTheme === t.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40 hover:bg-accent"
              )}
            >
              <div
                className="h-8 w-8 rounded-full shadow-lg"
                style={{ background: t.preview }}
              />
              <span className="text-xs font-medium">{t.label}</span>
              {currentTheme === t.id && (
                <Check className="h-3 w-3 text-primary" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── EPUB Font ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Fonte para Leitura (EPUB)</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {EPUB_FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => savePrefs({ book_font_family: f.id })}
              className={clsx(
                "flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all text-left",
                currentFont === f.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40 hover:bg-accent"
              )}
              style={{ fontFamily: f.id }}
            >
              <span className="text-sm">{f.label}</span>
              {currentFont === f.id && (
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── API Keys (OPDS/Tachiyomi) ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Chaves de API (OPDS / Tachiyomi)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Use uma chave de API para autenticar o Tachiyomi ou outros clientes OPDS.
          URL OPDS: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
            {typeof window !== "undefined" ? `${window.location.origin}/opds/` : "/opds/"}
          </code>
        </p>

        {newKeyValue && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium text-amber-400">
              Copie agora — não será exibida novamente!
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-xs bg-black/20 px-3 py-2 rounded-lg break-all">
                {showKey ? newKeyValue : "•".repeat(40)}
              </code>
              <button onClick={() => setShowKey((v) => !v)} className="p-2 text-muted-foreground hover:text-foreground">
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button onClick={() => copyKey(newKeyValue)} className="p-2 text-muted-foreground hover:text-primary">
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {apiKeys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
              <div>
                <p className="text-sm font-medium">{k.label}</p>
                <p className="text-xs text-muted-foreground">
                  Criada em {new Date(k.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <button
                onClick={() => revokeKeyMutation.mutate(k.id)}
                className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Revogar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            placeholder="Nome da chave (ex: Tachiyomi)"
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => createKeyMutation.mutate(newKeyLabel || "OPDS")}
            disabled={createKeyMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {createKeyMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Criar
          </button>
        </div>
      </section>

      {/* ── Progress & Annotations Export ────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Exportar Dados</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-60"
          >
            {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Progresso (.json)
          </button>
          <button
            onClick={handleExportAnnotations}
            disabled={annotationLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-60"
          >
            {annotationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Anotações (.json)
          </button>
          {user?.role === "admin" && (
            <button
              onClick={handleBackup}
              disabled={backupLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-amber-500/30 text-sm font-medium hover:bg-amber-500/10 transition-colors disabled:opacity-60 text-amber-400"
            >
              {backupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Backup BD completo
            </button>
          )}
        </div>
      </section>

      {/* ── Device Profiles ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Perfis por Dispositivo</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Salve configurações de leitura separadas para cada dispositivo (celular, tablet, desktop).
        </p>
        {deviceProfiles.length > 0 ? (
          <div className="space-y-2">
            {deviceProfiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
                <div>
                  <p className="text-sm font-medium">{p.device_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[p.reading_direction, p.reading_mode, p.book_font_family].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  onClick={() => deleteProfileMutation.mutate(p.id)}
                  className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum perfil salvo. Os perfis são criados automaticamente ao ler em um dispositivo.</p>
        )}
      </section>

      {/* ── Custom EPUB Fonts (admin) ─────────────────────────────────────── */}
      {user?.role === "admin" && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Fontes Personalizadas (EPUB)</h2>
          </div>
          <div className="space-y-2">
            {(customFonts as Array<{ id: number; name: string; file_url: string }>).map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-card border border-border">
                <span className="text-sm font-medium">{f.name}</span>
                <button
                  onClick={() => deleteFontMutation.mutate(f.id)}
                  className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              value={fontName}
              onChange={(e) => setFontName(e.target.value)}
              placeholder="Nome da fonte"
              className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-sm cursor-pointer hover:bg-accent transition-colors">
              <Upload className="h-3.5 w-3.5" />
              {fontFile ? fontFile.name : "Escolher .ttf/.otf"}
              <input
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                className="hidden"
                onChange={(e) => setFontFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              onClick={() => fontName && fontFile && uploadFontMutation.mutate({ name: fontName, file: fontFile })}
              disabled={!fontName || !fontFile || uploadFontMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {uploadFontMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Enviar
            </button>
          </div>
        </section>
      )}

      {/* ── Scrobble Errors ───────────────────────────────────────────────── */}
      {scrobbleErrors.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <h2 className="font-semibold">Erros de Scrobble</h2>
          </div>
          <div className="space-y-2">
            {scrobbleErrors.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 px-4 py-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{e.series_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.provider.toUpperCase()} · {new Date(e.attempted_at).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="text-xs text-red-400 truncate">{e.error_message}</p>
                </div>
                <button
                  onClick={() => resolveErrorMutation.mutate(e.id)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-green-400 hover:bg-green-500/10 transition-colors"
                >
                  <Check className="h-3 w-3" />
                  Resolver
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
