"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, X, Maximize2, Minimize2, Globe, Settings,
  Bookmark, BookmarkPlus, Trash2, List, Eye, EyeOff,
} from "lucide-react";
import dynamic from "next/dynamic";
import { readerApi, authApi, tocApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useTranslatorStore } from "@/store/translator";
import { clsx } from "clsx";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BookmarkEntry {
  id: number; chapter_id: number; page: number;
  label: string; created_at: string;
}
type ReadingMode = "single" | "double" | "webtoon";
type ScalingMode = "fit_height" | "fit_width" | "fit_screen" | "original";
type Direction   = "ltr" | "rtl";
type EpubTheme   = "dark" | "black" | "white" | "paper";
type FontFamily  = "sans" | "serif" | "mono";
type PageSplit   = "none" | "auto";
type SettingsTab = "display" | "epub" | "screen";

interface ChapterData {
  format?: "images" | "pdf" | "epub";
  total_pages?: number; pages?: string[];
  pdf_url?: string; book_page_base_url?: string;
}

// ── Local-only prefs (localStorage) ──────────────────────────────────────────
const LOCAL_KEY = "biblioteca-reader-local";
function loadLocal(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}"); } catch { return {}; }
}
function saveLocal(key: string, value: unknown) {
  const p = loadLocal(); p[key] = value;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(p));
}

// ── Dynamic imports ───────────────────────────────────────────────────────────
const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <div className="text-white/50 text-sm mt-20">Carregando PDF…</div>,
});

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="h-8 w-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
    </div>
  );
}

// ── Reader ────────────────────────────────────────────────────────────────────
function ReaderContent() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const searchParams  = useSearchParams();
  const { user, setUser } = useAuthStore();
  const { toggle: toggleTranslator, isOpen: translatorOpen } = useTranslatorStore();

  const initialPage   = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);
  const localRef      = useRef<Record<string, unknown>>(
    typeof window !== "undefined" ? loadLocal() : {}
  );

  // ── Settings backed by user profile ──────────────────────────────────────
  const [mode, setMode]           = useState<ReadingMode>(user?.reading_mode ?? "single");
  const [direction, setDirection] = useState<Direction>(
    (user?.reading_direction as Direction) === "rtl" ? "rtl" : "ltr"
  );
  const [scaling, setScaling]     = useState<ScalingMode>(
    (user?.scaling as ScalingMode) ?? "fit_height"
  );
  const [fontSize, setFontSize]         = useState(user?.book_font_size ?? 16);
  const [lineSpacing, setLineSpacing]   = useState(user?.book_line_spacing ?? 1.6);
  const [fontFamily, setFontFamily]     = useState<FontFamily>(
    (user?.book_font_family as FontFamily) ?? "sans"
  );
  const [epubTheme, setEpubTheme]       = useState<EpubTheme>(
    (user?.theme as EpubTheme) ?? "dark"
  );

  // ── Settings stored locally ───────────────────────────────────────────────
  const [webtoonWidth, setWebtoonWidth] = useState<number>(
    (localRef.current.webtoon_width as number) ?? 100
  );
  const [pageSplit, setPageSplit] = useState<PageSplit>(
    (localRef.current.page_split as PageSplit) ?? "none"
  );
  const [immersive, setImmersive] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage]   = useState(initialPage);
  const [subPage, setSubPage]           = useState<0 | 1>(0);
  const [pageDims, setPageDims]         = useState<Record<number, boolean>>({});
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfNumPages, setPdfNumPages]   = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showToc, setShowToc]           = useState(false);
  const [settingsTab, setSettingsTab]   = useState<SettingsTab>("display");
  const [editingPage, setEditingPage]   = useState(false);
  const [inputPage, setInputPage]       = useState("");
  const [brightness, setBrightness]     = useState(100);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const hideTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX     = useRef<number | null>(null);
  const touchStartY     = useRef<number | null>(null);
  const saveDebounce    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webtoonRefs     = useRef<(HTMLImageElement | null)[]>([]);
  const webtoonObserver = useRef<IntersectionObserver | null>(null);
  const webtoonDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs to avoid stale closures in effects
  const goToRef      = useRef<(page: number, sub?: 0 | 1) => void>(() => {});
  const navigateRef  = useRef<(forward: boolean) => void>(() => {});
  const immersiveRef = useRef(immersive);
  immersiveRef.current = immersive;

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: chapterData } = useQuery<ChapterData>({
    queryKey: ["reader", "chapter", chapterId],
    queryFn:  () => readerApi.chapterImages(Number(chapterId)).then((r) => r.data),
  });

  const { mutate: saveProgress } = useMutation({
    mutationFn: (page: number) =>
      readerApi.updateProgress({ chapter_id: Number(chapterId), pages_read: page + 1 }),
  });

  const { data: toc = [] } = useQuery<Array<{ label: string; src: string; order: number }>>({
    queryKey: ["toc", chapterId],
    queryFn:  () => tocApi.get(Number(chapterId)).then((r) => r.data.toc),
    enabled:  chapterData?.format === "epub",
  });

  const { data: bookmarks = [], refetch: refetchBookmarks } = useQuery<BookmarkEntry[]>({
    queryKey: ["bookmarks", chapterId],
    queryFn:  () =>
      readerApi.bookmarks().then((r) =>
        (r.data as BookmarkEntry[]).filter((b) => b.chapter_id === Number(chapterId))
      ),
  });

  const { mutate: addBookmark }    = useMutation({
    mutationFn: () => readerApi.createBookmark({
      chapter_id: Number(chapterId), page: currentPage, label: `Página ${currentPage + 1}`,
    }),
    onSuccess: () => refetchBookmarks(),
  });
  const { mutate: removeBookmark } = useMutation({
    mutationFn: (id: number) => readerApi.deleteBookmark(id),
    onSuccess:  () => refetchBookmarks(),
  });
  const { mutate: savePreferences } = useMutation({
    mutationFn: (prefs: Record<string, unknown>) => authApi.updatePreferences(prefs),
    onSuccess:  (res) => setUser(res.data),
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const format     = chapterData?.format ?? "images";
  const totalPages = format === "pdf" ? pdfNumPages : (chapterData?.total_pages ?? 0);
  const rtl        = direction === "rtl";
  const step       = mode === "double" ? 2 : 1;

  const isWide = useCallback(
    (pg: number) => pageSplit === "auto" && pageDims[pg] === true && mode === "single",
    [pageSplit, pageDims, mode]
  );

  // ── Navigation callbacks ──────────────────────────────────────────────────
  const goTo = useCallback(
    (page: number, sub: 0 | 1 = 0) => {
      const clamped = Math.max(0, Math.min(page, totalPages - 1));
      setCurrentPage(clamped);
      setSubPage(sub);
      saveProgress(clamped);
    },
    [totalPages, saveProgress]
  );

  const goForward = useCallback(() => {
    if (isWide(currentPage) && subPage === 0) { setSubPage(1); return; }
    const next = Math.min(currentPage + step, totalPages - 1);
    setCurrentPage(next); setSubPage(0); saveProgress(next);
  }, [currentPage, step, totalPages, subPage, isWide, saveProgress]);

  const goBackward = useCallback(() => {
    if (isWide(currentPage) && subPage === 1) { setSubPage(0); return; }
    const prev = Math.max(0, currentPage - step);
    const prevWide = pageSplit === "auto" && pageDims[prev] === true && mode === "single";
    setCurrentPage(prev); setSubPage(prevWide ? 1 : 0); saveProgress(prev);
  }, [currentPage, step, subPage, isWide, pageSplit, pageDims, mode, saveProgress]);

  // Debounced progress save for PDF scroll tracking
  const handlePdfPageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
      saveDebounce.current = setTimeout(() => saveProgress(page), 1500);
    },
    [saveProgress]
  );

  // Update stable refs every render
  goToRef.current     = goTo;
  navigateRef.current = (forward: boolean) =>
    rtl ? (forward ? goBackward() : goForward()) : (forward ? goForward() : goBackward());

  // ── Controls visibility ───────────────────────────────────────────────────
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(
      () => setShowControls(false),
      immersiveRef.current ? 1500 : 3000
    );
  }, []);

  useEffect(() => {
    if (immersive) { if (hideTimer.current) clearTimeout(hideTimer.current); setShowControls(false); }
    else setShowControls(true);
  }, [immersive]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showSettings || editingPage) return;
      const k = e.key;
      if (k === "ArrowRight" || k === "d") navigateRef.current(true);
      if (k === "ArrowLeft"  || k === "a") navigateRef.current(false);
      if (k === "Home")    goToRef.current(0);
      if (k === "End")     goToRef.current(totalPages - 1);
      if (k === "Escape")  history.back();
      if (k === "f" || k === "F") {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen(); setIsFullscreen(true);
        } else { document.exitFullscreen(); setIsFullscreen(false); }
      }
      if (k === "i" || k === "I") setImmersive((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSettings, editingPage, totalPages]);

  // ── Touch swipe ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
      navigateRef.current(dx < 0);
      touchStartX.current = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend",   onEnd,   { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend",   onEnd);
    };
  }, []);

  // ── Webtoon IntersectionObserver ──────────────────────────────────────────
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
    webtoonRefs.current.slice(0, totalPages).forEach((el) => {
      if (el) webtoonObserver.current?.observe(el);
    });
    return () => {
      webtoonObserver.current?.disconnect();
      clearTimeout(webtoonDebounce.current!);
    };
  }, [format, mode, totalPages, saveProgress, currentPage]);

  // ── Preload ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (format !== "images" || !chapterData?.pages) return;
    const count = mode === "double" ? 4 : 2;
    for (let i = 1; i <= count; i++) {
      const p = currentPage + i;
      if (p < totalPages) {
        const img = new Image();
        img.src = chapterData.pages?.[p] ?? readerApi.imageUrl(Number(chapterId), p);
      }
    }
  }, [currentPage, format, chapterData, totalPages, chapterId, mode]);

  // ── Render guards ─────────────────────────────────────────────────────────
  if (!chapterData) return <LoadingScreen />;

  const pageLabel   = `${currentPage + 1} / ${format === "pdf" ? (pdfNumPages || "…") : (totalPages || "…")}`;
  const progressPct = totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (totalPages === 0) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    goTo(Math.floor(ratio * totalPages));
  };

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(inputPage, 10) - 1;
    if (!isNaN(p)) goTo(p);
    setEditingPage(false);
  };

  // ── Image style helpers ───────────────────────────────────────────────────
  const imgStyle: React.CSSProperties = {
    fit_height: { height: "100vh", objectFit: "contain" },
    fit_width:  { width: "100%",   maxHeight: "100vh", objectFit: "contain" },
    fit_screen: { maxHeight: "100vh", maxWidth: "90vw", objectFit: "contain" },
    original:   {},
  }[scaling];

  const bgColorMap: Record<string, string> = {
    dark: "#0d0d12", black: "#000000", white: "#f0f0f0", paper: "#f5e6c9",
  };
  const viewerBg  = bgColorMap[epubTheme] ?? "#000000";

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>, pg: number) => {
    const img  = e.currentTarget;
    const wide = img.naturalWidth > img.naturalHeight * 1.5;
    setPageDims((prev) => prev[pg] === wide ? prev : { ...prev, [pg]: wide });
  };

  const navBtn = (visible: boolean) =>
    clsx("fixed top-0 h-full w-16 flex items-center transition-all z-40",
      visible ? "opacity-100" : "opacity-0 pointer-events-none");

  const toggleFs = () => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };

  // Page split: left or right half via flex alignment in half-width container
  const currentIsWide = isWide(currentPage);
  const showRightHalf = currentIsWide && ((subPage === 1) !== rtl);

  // EPUB iframe URL (theme + font wired to backend)
  const epubSrc = chapterData.book_page_base_url
    ? `${chapterData.book_page_base_url}?page=${currentPage}&font_size=${fontSize}&line_spacing=${lineSpacing}&font_family=${fontFamily}&theme=${epubTheme}`
    : undefined;

  // ── Nav arrow icons (RTL-aware) ───────────────────────────────────────────
  const LeftIcon  = rtl ? ChevronRight : ChevronLeft;
  const RightIcon = rtl ? ChevronLeft  : ChevronRight;

  return (
    <div
      className="min-h-screen relative select-none"
      style={{
        background: format === "images" ? viewerBg : "#000",
        filter: brightness !== 100 ? `brightness(${brightness}%)` : undefined,
      }}
      onMouseMove={showControlsTemporarily}
      onClick={() => { if (!showSettings && !showBookmarks && !showToc) showControlsTemporarily(); }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className={clsx(
        "fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3",
        "bg-gradient-to-b from-black/90 to-transparent",
        "transition-all duration-300",
        showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
      )}>
        <button onClick={() => history.back()}
          className="p-2 -ml-2 text-white/80 hover:text-white transition-colors">
          <X className="h-5 w-5" />
        </button>

        {editingPage ? (
          <form onSubmit={handlePageSubmit} onClick={(e) => e.stopPropagation()}>
            <input autoFocus type="number" min={1} max={totalPages || undefined}
              value={inputPage} onChange={(e) => setInputPage(e.target.value)}
              onBlur={() => setEditingPage(false)}
              className="w-24 text-center bg-white/10 text-white text-sm border border-white/20 rounded-md px-2 py-1 focus:outline-none focus:border-primary"
            />
          </form>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); setInputPage(String(currentPage + 1)); setEditingPage(true); }}
            className="text-white/70 text-sm hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors">
            {pageLabel}
          </button>
        )}

        <div className="flex items-center gap-1">
          <button onClick={toggleTranslator} title="Tradutor"
            className={clsx("p-2 transition-colors", translatorOpen ? "text-primary" : "text-white/70 hover:text-white")}>
            <Globe className="h-5 w-5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowBookmarks((v) => !v); setShowSettings(false); setShowToc(false); }}
            className={clsx("p-2 transition-colors relative", showBookmarks ? "text-primary" : "text-white/70 hover:text-white")}>
            <Bookmark className="h-5 w-5" />
            {bookmarks.length > 0 && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary" />}
          </button>
          {format === "epub" && toc.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setShowToc((v) => !v); setShowBookmarks(false); setShowSettings(false); }}
              className={clsx("p-2 transition-colors", showToc ? "text-primary" : "text-white/70 hover:text-white")}>
              <List className="h-5 w-5" />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); setShowSettings((v) => !v); setShowToc(false); setShowBookmarks(false); }}
            className={clsx("p-2 transition-colors", showSettings ? "text-primary" : "text-white/70 hover:text-white")}>
            <Settings className="h-5 w-5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setImmersive((v) => !v); }}
            title={immersive ? "Sair do modo imersivo (I)" : "Modo imersivo (I)"}
            className={clsx("p-2 transition-colors", immersive ? "text-primary" : "text-white/70 hover:text-white")}>
            {immersive ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); toggleFs(); }}
            className="p-2 text-white/70 hover:text-white transition-colors">
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
          {format === "images" && (
            <div className="flex bg-white/10 rounded-lg p-0.5 gap-0.5 ml-1">
              {(["single", "double", "webtoon"] as ReadingMode[]).map((m) => (
                <button key={m} onClick={() => { setMode(m); savePreferences({ reading_mode: m }); }}
                  className={clsx("px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    mode === m ? "bg-white text-black" : "text-white/70 hover:text-white")}>
                  {m === "single" ? "1" : m === "double" ? "2" : "∞"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bookmarks panel ─────────────────────────────────────────────── */}
      {showBookmarks && (
        <div className="fixed top-14 right-4 z-50 w-72 bg-black/92 border border-white/10 rounded-xl p-4 space-y-3 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Marcadores</p>
            <button onClick={() => addBookmark()}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
              <BookmarkPlus className="h-4 w-4" /> Pg. {currentPage + 1}
            </button>
          </div>
          {bookmarks.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-3">Nenhum marcador ainda.</p>
          ) : (
            <ul className="space-y-1 max-h-60 overflow-y-auto pr-1">
              {bookmarks.map((bm) => (
                <li key={bm.id} className="flex items-center justify-between gap-2 group">
                  <button onClick={() => { goTo(bm.page); setShowBookmarks(false); }}
                    className="flex-1 text-left text-sm text-white/80 hover:text-white truncate px-2 py-1 rounded hover:bg-white/10 transition-colors">
                    {bm.label || `Página ${bm.page + 1}`}
                  </button>
                  <button onClick={() => removeBookmark(bm.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-red-400 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── TOC panel ────────────────────────────────────────────────────── */}
      {showToc && toc.length > 0 && (
        <div className="fixed top-14 right-4 z-50 w-72 bg-black/92 border border-white/10 rounded-xl p-4 space-y-2 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}>
          <p className="text-sm font-semibold text-white mb-3">Índice</p>
          <ul className="space-y-0.5 max-h-72 overflow-y-auto pr-1">
            {toc.map((entry, i) => (
              <li key={i}>
                <button onClick={() => { goTo(entry.order); setShowToc(false); }}
                  className="w-full text-left text-sm text-white/75 hover:text-white px-2 py-1.5 rounded hover:bg-white/10 transition-colors truncate">
                  {entry.label || `Página ${entry.order + 1}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Settings panel ───────────────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed top-14 right-4 z-50 w-80 bg-black/95 border border-white/10 rounded-xl backdrop-blur-sm overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}>
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            {(["display", "epub", "screen"] as SettingsTab[]).map((tab) => (
              <button key={tab} onClick={() => setSettingsTab(tab)}
                className={clsx("flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                  settingsTab === tab
                    ? "text-primary border-b-2 border-primary -mb-px"
                    : "text-white/40 hover:text-white/70")}>
                {tab === "display" ? "Visualização" : tab === "epub" ? "Livro" : "Tela"}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">

            {/* ── Display tab ─────────────────────────────────────────── */}
            {settingsTab === "display" && (
              <>
                {/* Reading direction */}
                <div>
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">
                    Direção de leitura
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["ltr", "rtl"] as Direction[]).map((d) => (
                      <button key={d}
                        onClick={() => { setDirection(d); savePreferences({ reading_direction: d }); }}
                        className={clsx("py-2 text-xs rounded-lg font-medium transition-colors border",
                          direction === d
                            ? "bg-primary/20 text-primary border-primary/40"
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10")}>
                        {d === "ltr" ? "← Esq → Dir (LTR)" : "→ Dir → Esq (RTL)"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scaling / fit (non-epub) */}
                {format !== "epub" && (
                  <div>
                    <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">
                      Ajuste da imagem
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["fit_height", "fit_width", "fit_screen", "original"] as ScalingMode[]).map((s) => (
                        <button key={s}
                          onClick={() => { setScaling(s); savePreferences({ scaling: s }); }}
                          className={clsx("py-2 text-xs rounded-lg font-medium transition-colors border",
                            scaling === s
                              ? "bg-primary/20 text-primary border-primary/40"
                              : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10")}>
                          {{ fit_height: "Ajustar altura", fit_width: "Ajustar largura",
                             fit_screen: "Ajustar tela",   original: "Tamanho original" }[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Background color (images) */}
                {format === "images" && (
                  <div>
                    <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">
                      Cor de fundo
                    </p>
                    <div className="flex gap-3 items-center">
                      {(["black", "dark", "white", "paper"] as EpubTheme[]).map((c) => (
                        <button key={c} onClick={() => setEpubTheme(c)}
                          title={{ black: "Preto", dark: "Escuro", white: "Claro", paper: "Papel" }[c]}
                          className={clsx("h-8 w-8 rounded-full border-2 transition-all shrink-0",
                            epubTheme === c
                              ? "ring-2 ring-primary ring-offset-2 ring-offset-black border-transparent"
                              : "border-white/20 hover:border-white/50")}
                          style={{ background: bgColorMap[c] ?? "#000" }}
                        />
                      ))}
                      <span className="text-xs text-white/40">
                        {{ black: "Preto", dark: "Escuro", white: "Claro", paper: "Papel" }[epubTheme]}
                      </span>
                    </div>
                  </div>
                )}

                {/* Page split (single mode, images) */}
                {format === "images" && mode === "single" && (
                  <div>
                    <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1">
                      Dividir página dupla larga
                    </p>
                    <p className="text-[10px] text-white/30 mb-2">
                      Detecta spreads e mostra metade de cada vez
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["none", "auto"] as PageSplit[]).map((ps) => (
                        <button key={ps}
                          onClick={() => { setPageSplit(ps); saveLocal("page_split", ps); }}
                          className={clsx("py-2 text-xs rounded-lg font-medium transition-colors border",
                            pageSplit === ps
                              ? "bg-primary/20 text-primary border-primary/40"
                              : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10")}>
                          {ps === "none" ? "Desligado" : "Automático"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Webtoon width */}
                {format === "images" && mode === "webtoon" && (
                  <div>
                    <div className="flex justify-between text-[10px] mb-2">
                      <span className="font-semibold text-white/40 uppercase tracking-widest">Largura máxima</span>
                      <span className="text-white/60">{webtoonWidth}%</span>
                    </div>
                    <input type="range" min={30} max={100} step={5} value={webtoonWidth}
                      onChange={(e) => { const v = Number(e.target.value); setWebtoonWidth(v); saveLocal("webtoon_width", v); }}
                      className="w-full accent-primary" />
                    <div className="flex justify-between text-[10px] text-white/30 mt-1">
                      <span>Estreito</span><span>Cheio</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── EPUB/Book tab ────────────────────────────────────────── */}
            {settingsTab === "epub" && (
              <>
                {format !== "epub" && (
                  <p className="text-xs text-white/30 text-center py-4">
                    Estas opções aplicam-se apenas a livros EPUB.
                  </p>
                )}
                {/* Theme */}
                <div>
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">Tema</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["dark", "black", "white", "paper"] as EpubTheme[]).map((t) => (
                      <button key={t}
                        onClick={() => { setEpubTheme(t); savePreferences({ theme: t }); }}
                        className={clsx("py-2 text-xs rounded-lg font-medium transition-colors border",
                          epubTheme === t
                            ? "bg-primary/20 text-primary border-primary/40"
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10")}>
                        {{ dark: "🌙 Escuro", black: "⬛ Preto", white: "☀️ Claro", paper: "📄 Papel" }[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font family */}
                <div>
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">Fonte</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["sans", "serif", "mono"] as FontFamily[]).map((f) => (
                      <button key={f}
                        onClick={() => { setFontFamily(f); savePreferences({ book_font_family: f }); }}
                        className={clsx("py-2 text-xs rounded-lg font-medium transition-colors border",
                          fontFamily === f
                            ? "bg-primary/20 text-primary border-primary/40"
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10")}
                        style={{
                          fontFamily: f === "serif" ? "Georgia, serif"
                            : f === "mono"  ? "monospace" : "inherit",
                        }}>
                        { { sans: "Sans", serif: "Serif", mono: "Mono" }[f] }
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font size */}
                <div>
                  <div className="flex justify-between text-[10px] mb-2">
                    <span className="font-semibold text-white/40 uppercase tracking-widest">Tamanho da fonte</span>
                    <span className="text-white/60">{fontSize}px</span>
                  </div>
                  <input type="range" min={12} max={28} value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    onMouseUp={() => savePreferences({ book_font_size: fontSize })}
                    onTouchEnd={() => savePreferences({ book_font_size: fontSize })}
                    className="w-full accent-primary" />
                  <div className="flex justify-between text-[10px] text-white/30 mt-1">
                    <span>12px</span><span>28px</span>
                  </div>
                </div>

                {/* Line spacing */}
                <div>
                  <div className="flex justify-between text-[10px] mb-2">
                    <span className="font-semibold text-white/40 uppercase tracking-widest">Espaçamento entre linhas</span>
                    <span className="text-white/60">{lineSpacing.toFixed(1)}</span>
                  </div>
                  <input type="range" min={1.2} max={2.5} step={0.1} value={lineSpacing}
                    onChange={(e) => setLineSpacing(Number(e.target.value))}
                    onMouseUp={() => savePreferences({ book_line_spacing: lineSpacing })}
                    onTouchEnd={() => savePreferences({ book_line_spacing: lineSpacing })}
                    className="w-full accent-primary" />
                  <div className="flex justify-between text-[10px] text-white/30 mt-1">
                    <span>Compacto</span><span>Espaçado</span>
                  </div>
                </div>
              </>
            )}

            {/* ── Screen tab ───────────────────────────────────────────── */}
            {settingsTab === "screen" && (
              <>
                {/* Brightness */}
                <div>
                  <div className="flex justify-between text-[10px] mb-2">
                    <span className="font-semibold text-white/40 uppercase tracking-widest">Brilho</span>
                    <span className="text-white/60">{brightness}%</span>
                  </div>
                  <input type="range" min={30} max={150} value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full accent-primary" />
                  <div className="flex justify-between text-[10px] text-white/30 mt-1">
                    <span>Escuro</span><span>Brilhante</span>
                  </div>
                </div>

                {/* Immersive toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-xs font-medium text-white/80">Modo imersivo</p>
                    <p className="text-[11px] text-white/40 mt-0.5">
                      Oculta controles automaticamente (tecla: I)
                    </p>
                  </div>
                  <button onClick={() => setImmersive((v) => !v)}
                    className={clsx("relative w-11 h-6 rounded-full transition-colors shrink-0",
                      immersive ? "bg-primary" : "bg-white/20")}>
                    <span className={clsx(
                      "absolute top-0.5 h-5 w-5 bg-white rounded-full shadow transition-all",
                      immersive ? "left-[22px]" : "left-0.5"
                    )} />
                  </button>
                </div>

                {/* Keyboard shortcuts reference */}
                <div className="pt-3 border-t border-white/10">
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-3">
                    Atalhos de teclado
                  </p>
                  <div className="space-y-2">
                    {[
                      ["← / A",   "Página anterior"],
                      ["→ / D",   "Próxima página"],
                      ["Home",    "Primeira página"],
                      ["End",     "Última página"],
                      ["F",       "Tela cheia"],
                      ["I",       "Modo imersivo"],
                      ["Esc",     "Fechar leitor"],
                    ].map(([key, desc]) => (
                      <div key={key} className="flex items-center gap-3">
                        <kbd className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded font-mono min-w-[52px] text-center">
                          {key}
                        </kbd>
                        <span className="text-[11px] text-white/50">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── EPUB Viewer ──────────────────────────────────────────────────── */}
      {format === "epub" && epubSrc && (
        <>
          <iframe
            key={`epub-${currentPage}-${epubTheme}-${fontFamily}-${fontSize}-${lineSpacing}`}
            src={epubSrc}
            className="w-full border-0"
            style={{ height: "100vh", paddingTop: "48px" }}
            title={`Página ${currentPage + 1}`}
          />
          <button onClick={() => navigateRef.current(false)} disabled={currentPage === 0}
            className={clsx(navBtn(showControls), "left-0 justify-start pl-3", currentPage === 0 && "cursor-default")}>
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <LeftIcon className="h-6 w-6 text-white" />
            </div>
          </button>
          <button onClick={() => navigateRef.current(true)} disabled={currentPage >= totalPages - 1}
            className={clsx(navBtn(showControls), "right-0 justify-end pr-3", currentPage >= totalPages - 1 && "cursor-default")}>
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <RightIcon className="h-6 w-6 text-white" />
            </div>
          </button>
        </>
      )}

      {/* ── PDF Viewer ───────────────────────────────────────────────────── */}
      {format === "pdf" && chapterData.pdf_url && (
        <>
          <div className="flex flex-col items-center gap-0 overflow-auto bg-neutral-900 min-h-screen"
            style={{ paddingTop: "64px", paddingBottom: "64px" }}>
            <PdfViewer
              pdfUrl={chapterData.pdf_url} currentPage={currentPage}
              onNumPages={setPdfNumPages} onPageChange={handlePdfPageChange}
            />
          </div>
          <button onClick={() => navigateRef.current(false)} disabled={currentPage === 0}
            className={clsx(navBtn(showControls), "left-0 justify-start pl-3", currentPage === 0 && "cursor-default")}>
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <LeftIcon className="h-6 w-6 text-white" />
            </div>
          </button>
          <button onClick={() => navigateRef.current(true)} disabled={currentPage >= pdfNumPages - 1}
            className={clsx(navBtn(showControls), "right-0 justify-end pr-3", currentPage >= pdfNumPages - 1 && "cursor-default")}>
            <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
              <RightIcon className="h-6 w-6 text-white" />
            </div>
          </button>
        </>
      )}

      {/* ── Image Viewer (CBZ / archive) ─────────────────────────────────── */}
      {(format === "images" || !chapterData.format) && (
        <>
          {mode === "webtoon" ? (
            /* ── Webtoon: vertical continuous scroll ── */
            <div className="flex flex-col items-center pt-16" style={{ gap: 0 }}>
              {Array.from({ length: totalPages }, (_, i) => (
                <img
                  key={i}
                  ref={(el) => { webtoonRefs.current[i] = el; }}
                  src={chapterData.pages?.[i] ?? readerApi.imageUrl(Number(chapterId), i)}
                  alt={`Página ${i + 1}`}
                  style={{ display: "block", width: "100%", maxWidth: webtoonWidth >= 100 ? "100%" : `${webtoonWidth}%` }}
                  loading={i < 3 ? "eager" : "lazy"}
                />
              ))}
            </div>
          ) : (
            /* ── Single / Double page ── */
            <div className="flex items-center justify-center min-h-screen">
              {currentIsWide ? (
                /* Wide page split: show left or right half */
                <div style={{
                  width: "50vw", height: "100vh", overflow: "hidden",
                  display: "flex", alignItems: "center",
                  justifyContent: showRightHalf ? "flex-end" : "flex-start",
                }}>
                  <img
                    src={chapterData.pages?.[currentPage] ?? readerApi.imageUrl(Number(chapterId), currentPage)}
                    alt={`Página ${currentPage + 1}`}
                    style={{ height: "100%", width: "auto", flexShrink: 0 }}
                    onLoad={(e) => handleImageLoad(e, currentPage)}
                  />
                </div>
              ) : (
                /* Normal rendering */
                <div className={clsx(
                  "flex gap-0",
                  rtl && mode === "double" ? "flex-row-reverse" : "flex-row",
                  mode === "double" ? "max-w-6xl" : "max-w-3xl w-full",
                )}>
                  <img
                    src={chapterData.pages?.[currentPage] ?? readerApi.imageUrl(Number(chapterId), currentPage)}
                    alt={`Página ${currentPage + 1}`}
                    style={imgStyle}
                    className={scaling === "fit_width" ? "w-full" : ""}
                    onLoad={(e) => handleImageLoad(e, currentPage)}
                  />
                  {mode === "double" && currentPage + 1 < totalPages && (
                    <img
                      src={chapterData.pages?.[currentPage + 1] ?? readerApi.imageUrl(Number(chapterId), currentPage + 1)}
                      alt={`Página ${currentPage + 2}`}
                      style={imgStyle}
                      className={scaling === "fit_width" ? "w-full" : ""}
                      onLoad={(e) => handleImageLoad(e, currentPage + 1)}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Left / Right nav (non-webtoon) */}
          {mode !== "webtoon" && (
            <>
              <button onClick={() => navigateRef.current(false)}
                disabled={currentPage === 0 && !(currentIsWide && subPage === 1)}
                className={clsx(navBtn(showControls), "left-0 justify-start pl-3",
                  currentPage === 0 && !(currentIsWide && subPage === 1) && "cursor-default")}>
                <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
                  <LeftIcon className="h-6 w-6 text-white" />
                </div>
              </button>
              <button onClick={() => navigateRef.current(true)}
                disabled={currentPage >= totalPages - 1 && !(currentIsWide && subPage === 0)}
                className={clsx(navBtn(showControls), "right-0 justify-end pr-3",
                  currentPage >= totalPages - 1 && !(currentIsWide && subPage === 0) && "cursor-default")}>
                <div className="bg-black/50 rounded-full p-2 backdrop-blur-sm">
                  <RightIcon className="h-6 w-6 text-white" />
                </div>
              </button>
            </>
          )}
        </>
      )}

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {!(format === "images" && mode === "webtoon") && (
        <div
          className={clsx(
            "fixed bottom-0 left-0 right-0 h-1.5 bg-white/10 cursor-pointer transition-opacity duration-300 z-40",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={handleProgressClick}
          title={`Ir para página (${Math.round(progressPct)}%)`}
        >
          <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progressPct}%` }} />
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
