import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GridSize = "sm" | "md" | "lg";

interface GridStore {
  size: GridSize;
  setSize: (s: GridSize) => void;
}

export const useGridStore = create<GridStore>()(
  persist(
    (set) => ({
      size: "md",
      setSize: (size) => set({ size }),
    }),
    { name: "biblioteca-grid" }
  )
);

export const GRID_COLS: Record<GridSize, string> = {
  sm: "grid-cols-3 sm:grid-cols-4 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11",
  md: "grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
  lg: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
};
