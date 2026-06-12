"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Home,
  List,
  Heart,
  BarChart2,
  Search,
  FolderOpen,
  UploadCloud,
  Users,
  ScanLine,
  Cog,
  Library,
  BookText,
  ImageIcon,
  Swords,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { clsx } from "clsx";
import { useAuthStore } from "@/store/auth";
import { libraryApi } from "@/lib/api";
import type { Library as LibraryType } from "@/types";

const LIBRARY_ICONS: Record<string, React.ElementType> = {
  manga: Swords,
  comic: BookText,
  book: BookOpen,
  light_novel: BookText,
  image: ImageIcon,
};

const mainNav = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/search", icon: Search, label: "Buscar" },
  { href: "/collections", icon: FolderOpen, label: "Coleções" },
  { href: "/reading-lists", icon: List, label: "Listas de Leitura" },
  { href: "/want-to-read", icon: Heart, label: "Quero Ler" },
  { href: "/stats", icon: BarChart2, label: "Estatísticas" },
  { href: "/admin/upload", icon: UploadCloud, label: "Upload" },
];

const adminNav = [
  { href: "/admin/libraries", icon: Library, label: "Bibliotecas" },
  { href: "/admin/scanner", icon: ScanLine, label: "Scanner" },
  { href: "/admin/users", icon: Users, label: "Usuários" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const { data: libraries = [] } = useQuery<LibraryType[]>({
    queryKey: ["libraries"],
    queryFn: () => libraryApi.list().then((r) => r.data.results as LibraryType[]),
    enabled: !!user,
  });

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* ── Mobile top bar ───────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-bold text-base tracking-tight">Biblioteca</span>
        </Link>
      </div>

      {/* ── Backdrop (mobile only) ────────────────────────── */}
      <div
        className={clsx(
          "md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* ── Sidebar panel ────────────────────────────────── */}
      <aside
        className={clsx(
          "fixed left-0 top-0 h-full w-64 bg-card border-r border-border flex flex-col z-50",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-bold text-base tracking-tight">Biblioteca</span>
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/admin/libraries"
                title="Gerenciar bibliotecas"
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  isActive("/admin/libraries")
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Cog className="h-4 w-4" />
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {mainNav.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive(href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}

          {libraries.length > 0 && (
            <div className="pt-4">
              <div className="px-3 pb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Bibliotecas
                </p>
              </div>
              {libraries.map((lib) => {
                const Icon = LIBRARY_ICONS[lib.type] ?? Library;
                const href = `/library/${lib.id}`;
                return (
                  <Link
                    key={lib.id}
                    href={href}
                    className={clsx(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive(href)
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{lib.name}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {isAdmin && (
            <div className="pt-4">
              <div className="px-3 pb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Administração
                </p>
              </div>
              {adminNav.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive(href)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        {/* Footer — user profile */}
        {user && (
          <div className="px-2 py-3 border-t border-border shrink-0">
            <div className="flex items-center gap-1">
              <Link
                href="/profile"
                className="flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors min-w-0"
              >
                <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                  {user.username[0].toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-foreground truncate text-xs">
                    {user.username}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </span>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                title="Sair"
                className="p-2 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors shrink-0"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
