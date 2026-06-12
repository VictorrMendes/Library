import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Direction, TranslationResult } from "@/lib/translator";

interface Pos {
  x: number;
  y: number;
}

interface TranslatorState {
  isOpen: boolean;
  isMinimized: boolean;
  position: Pos;
  direction: Direction;
  result: TranslationResult | null;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  setMinimized: (v: boolean) => void;
  setPosition: (p: Pos) => void;
  setDirection: (d: Direction) => void;
  setResult: (r: TranslationResult | null) => void;
}

export const useTranslatorStore = create<TranslatorState>()(
  persist(
    (set) => ({
      isOpen: false,
      isMinimized: false,
      position: { x: 0, y: 0 },
      direction: "en-pt" as Direction,
      result: null,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setOpen: (v) => set({ isOpen: v }),
      setMinimized: (v) => set({ isMinimized: v }),
      setPosition: (p) => set({ position: p }),
      setDirection: (d) => set({ direction: d }),
      setResult: (r) => set({ result: r }),
    }),
    {
      name: "biblioteca-translator",
      // Only persist position and direction — not open state or results
      partialize: (s) => ({ position: s.position, direction: s.direction }),
    }
  )
);
