"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Globe,
  Layers,
  Hash,
  Settings,
  AlertTriangle,
  BookMarked,
  Languages,
} from "lucide-react";
import { clsx } from "clsx";
import { useAuthStore } from "@/store/auth";
import { useTranslatorStore } from "@/store/translator";
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
  { href: "/vocabulary", icon: BookMarked, label: "Vocabulário" },
  { href: "/libraries", icon: Library, label: "Bibliotecas" },
  { href: "/upload", icon: UploadCloud, label: "Upload" },
  { href: "/genres", icon: Layers, label: "Gêneros" },
  { href: "/tags", icon: Hash, label: "Tags" },
  { href: "/collections", icon: FolderOpen, label: "Coleções" },
  { href: "/reading-lists", icon: List, label: "Listas de Leitura" },
  { href: "/want-to-read", icon: Heart, label: "Quero Ler" },
  { href: "/stats", icon: BarChart2, label: "Estatísticas" },
  { href: "/settings", icon: Settings, label: "Configurações" },
];

const adminNav = [
  { href: "/admin/libraries", icon: Library, label: "Bibliotecas" },
  { href: "/admin/scanner", icon: ScanLine, label: "Scanner" },
  { href: "/admin/users", icon: Users, label: "Usuários" },
  { href: "/admin/media-errors", icon: AlertTriangle, label: "Erros de Mídia" },
];

function NavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150",
        active
          ? "bg-primary/12 text-primary font-medium border-l-2 border-primary pl-[10px]"
          : "text-muted-foreground hover:bg-accent/80 hover:text-foreground border-l-2 border-transparent pl-[10px]"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuthStore();
  const { isOpen: translatorOpen, toggle: toggleTranslator } = useTranslatorStore();
  const [isOpen, setIsOpen] = useState(false);

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  const { data: libraries = [] } = useQuery<LibraryType[]>({
    queryKey: ["libraries"],
    queryFn: () => libraryApi.list().then((r) => r.data.results as LibraryType[]),
    enabled: !!user,
  });

  useEffect(() => { setIsOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-card/95 backdrop-blur-sm border-b border-border flex items-center px-4 gap-3">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" strokeWidth={1.75} />
          <span className="font-classic font-medium text-lg tracking-tight text-foreground">
            Biblioteca
          </span>
        </Link>
      </div>

      {/* Backdrop */}
      <div
        className={clsx(
          "md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        className={clsx(
          "fixed left-0 top-0 h-full w-64 bg-card flex flex-col z-50",
          "border-r border-border/60",
          "transition-transform duration-250 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="px-4 py-5 border-b border-border/60 shrink-0">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-primary" strokeWidth={1.75} />
              </div>
              <span className="font-classic font-medium text-lg tracking-tight">
                Biblioteca
              </span>
            </Link>
            <div className="flex items-center gap-1">
              {isAdmin && (
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
                  <Cog className="h-4 w-4" strokeWidth={1.75} />
                </Link>
              )}
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
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {mainNav.map(({ href, icon: Icon, label }) => (
            <NavItem key={href} href={href} icon={Icon} label={label} active={isActive(href)} />
          ))}

          <button
            onClick={toggleTranslator}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150",
              translatorOpen
                ? "bg-primary/12 text-primary font-medium border-l-2 border-primary pl-[10px]"
                : "text-muted-foreground hover:bg-accent/80 hover:text-foreground border-l-2 border-transparent pl-[10px]"
            )}
          >
            <Globe className="h-4 w-4 shrink-0" strokeWidth={translatorOpen ? 2 : 1.75} />
            Tradutor
          </button>

          <div className="pt-5">
            <p className="px-3 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Idiomas
            </p>
            <NavItem href="/search?language=en" icon={Languages} label="🇺🇸 Inglês" active={false} />
            <NavItem href="/search?language=pt" icon={Languages} label="🇧🇷 Português" active={false} />
          </div>

          {libraries.length > 0 && (
            <div className="pt-5">
              <p className="px-3 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Bibliotecas
              </p>
              {libraries.map((lib) => {
                const Icon = LIBRARY_ICONS[lib.type] ?? Library;
                const href = `/library/${lib.id}`;
                return (
                  <NavItem key={lib.id} href={href} icon={Icon} label={lib.name} active={isActive(href)} />
                );
              })}
            </div>
          )}

          {isAdmin && (
            <div className="pt-5">
              <p className="px-3 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Administração
              </p>
              {adminNav.map(({ href, icon: Icon, label }) => (
                <NavItem key={href} href={href} icon={Icon} label={label} active={isActive(href)} />
              ))}
            </div>
          )}
        </nav>

        {/* Footer */}
        {user && (
          <div className="px-3 py-3 border-t border-border/60 shrink-0">
            <div className="flex items-center gap-1">
              <Link
                href="/profile"
                className="flex-1 flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors min-w-0"
              >
                <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                  {(user.username?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-foreground truncate text-xs leading-tight">
                    {user.username}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {user.email}
                  </span>
                </div>
              </Link>
              <button
                onClick={handleLogout}
                title="Sair"
                className="p-2 rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
