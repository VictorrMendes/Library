"use client";

import { useEffect } from "react";
import { BookX, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function SeriesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted mx-auto">
          <BookX className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Série não encontrada</h2>
        <p className="text-sm text-muted-foreground">
          Esta série pode ter sido removida ou não está disponível.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
          >
            Início
          </Link>
        </div>
      </div>
    </div>
  );
}
