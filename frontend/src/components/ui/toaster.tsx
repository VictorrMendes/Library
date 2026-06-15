"use client";

import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/hooks/use-toast";

const ICONS = {
  default: <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />,
  success: <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />,
  destructive: <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />,
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200",
            t.variant === "destructive" && "border-destructive/40 bg-destructive/10"
          )}
        >
          {ICONS[t.variant ?? "default"]}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">{t.title}</p>
            {t.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
