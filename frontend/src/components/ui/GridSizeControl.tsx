"use client";

import { LayoutGrid, Grid2X2, Grid3X3 } from "lucide-react";
import { clsx } from "clsx";
import { useGridStore, type GridSize } from "@/store/grid";

const OPTIONS: { value: GridSize; icon: React.ElementType; title: string }[] = [
  { value: "lg", icon: Grid2X2, title: "Grande" },
  { value: "md", icon: LayoutGrid, title: "Médio" },
  { value: "sm", icon: Grid3X3, title: "Pequeno" },
];

export function GridSizeControl() {
  const { size, setSize } = useGridStore();

  return (
    <div className="flex items-center bg-card border border-border rounded-lg p-0.5 gap-0.5">
      {OPTIONS.map(({ value, icon: Icon, title }) => (
        <button
          key={value}
          onClick={() => setSize(value)}
          title={title}
          className={clsx(
            "p-1.5 rounded transition-colors",
            size === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
