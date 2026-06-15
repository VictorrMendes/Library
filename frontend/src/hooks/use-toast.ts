"use client";

import { useState, useCallback } from "react";

export type ToastVariant = "default" | "success" | "destructive";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

type ToastInput = Omit<Toast, "id">;

// Module-level store so toast() can be called from anywhere (no context needed)
let _addToast: ((t: ToastInput) => void) | null = null;

export function toast(input: ToastInput) {
  _addToast?.(input);
}

export function useToastStore() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((input: ToastInput) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, ...input }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Register the module-level handler so toast() works without hooks
  _addToast = add;

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, dismiss };
}
