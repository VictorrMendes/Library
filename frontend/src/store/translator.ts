import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Direction, TranslationResult } from "@/lib/translator";

interface Pos {
  x: number;
  y: number;
}

export interface HistoryEntry {
  id: string;
  word: string;
  direction: Direction;
  translation: string;
  phonetic: string;
  definition: string;
  example: string;
  timestamp: number;
}

interface TranslatorState {
  isOpen: boolean;
  isMinimized: boolean;
  position: Pos;
  direction: Direction;
  result: TranslationResult | null;
  history: HistoryEntry[];
  toggle: () => void;
  setOpen: (v: boolean) => void;
  setMinimized: (v: boolean) => void;
  setPosition: (p: Pos) => void;
  setDirection: (d: Direction) => void;
  setResult: (r: TranslationResult | null) => void;
  addToHistory: (entry: Omit<HistoryEntry, "id" | "timestamp">) => void;
  clearHistory: () => void;
}

export const useTranslatorStore = create<TranslatorState>()(
  persist(
    (set) => ({
      isOpen: false,
      isMinimized: false,
      position: { x: 0, y: 0 },
      direction: "en-pt" as Direction,
      result: null,
      history: [],
      toggle: () => set((s) => ({ isOpen: !s.isOpen, isMinimized: false })),
      setOpen: (v) => set({ isOpen: v }),
      setMinimized: (v) => set({ isMinimized: v }),
      setPosition: (p) => set({ position: p }),
      setDirection: (d) => set({ direction: d }),
      setResult: (r) => set({ result: r }),
      addToHistory: (entry) =>
        set((s) => ({
          history: [
            { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
            ...s.history.filter((h) => h.word.toLowerCase() !== entry.word.toLowerCase()),
          ].slice(0, 200),
        })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: "biblioteca-translator",
      partialize: (s) => ({
        position: s.position,
        direction: s.direction,
        history: s.history,
      }),
    }
  )
);
