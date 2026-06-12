"use client";

import { useState, useRef, useEffect } from "react";
import {
  BookOpen, BookMarked, BookCheck, Heart, X, ChevronDown, Check, Loader2,
} from "lucide-react";
import { clsx } from "clsx";

export type ShelfStatus =
  | "want_to_read"
  | "reading"
  | "completed"
  | "liked"
  | "dropped";

export const SHELF_OPTIONS: {
  value: ShelfStatus;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  { value: "want_to_read", label: "Quero Ler",    icon: BookOpen,  color: "text-sky-400" },
  { value: "reading",      label: "Estou Lendo",  icon: BookMarked, color: "text-amber-400" },
  { value: "completed",    label: "Lido",         icon: BookCheck, color: "text-emerald-400" },
  { value: "liked",        label: "Gostei",       icon: Heart,     color: "text-pink-400" },
  { value: "dropped",      label: "Abandonei",    icon: X,         color: "text-zinc-400" },
];

interface Props {
  currentStatus: ShelfStatus | null;
  shelfId: number | null;
  onAdd: (status: ShelfStatus) => void;
  onUpdate: (id: number, status: ShelfStatus) => void;
  onRemove: (id: number) => void;
  loading?: boolean;
}

export function ShelfButton({
  currentStatus,
  shelfId,
  onAdd,
  onUpdate,
  onRemove,
  loading,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = SHELF_OPTIONS.find((o) => o.value === currentStatus);
  const CurrentIcon = current?.icon ?? BookOpen;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={clsx(
          "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border",
          "transition-colors disabled:opacity-60",
          currentStatus
            ? "bg-primary/10 border-primary/25 text-primary hover:bg-primary/15"
            : "bg-secondary border-border/60 text-foreground hover:bg-accent"
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CurrentIcon
            className={clsx("h-3.5 w-3.5", current?.color ?? "text-muted-foreground")}
            strokeWidth={1.75}
          />
        )}
        <span>{current ? current.label : "Minha Estante"}</span>
        <ChevronDown
          className={clsx(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          strokeWidth={1.75}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-52 bg-card border border-border/60 rounded-md shadow-xl z-30 py-1 overflow-hidden">
          {SHELF_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  if (shelfId) {
                    onUpdate(shelfId, opt.value);
                  } else {
                    onAdd(opt.value);
                  }
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              >
                <Icon
                  className={clsx("h-4 w-4 shrink-0", opt.color)}
                  strokeWidth={1.75}
                />
                <span className="flex-1">{opt.label}</span>
                {currentStatus === opt.value && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" strokeWidth={2} />
                )}
              </button>
            );
          })}

          {shelfId && (
            <>
              <div className="h-px bg-border/50 my-1" />
              <button
                onClick={() => { onRemove(shelfId); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/8 transition-colors text-left"
              >
                <X className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                Remover da estante
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
