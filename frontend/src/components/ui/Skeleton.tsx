import { clsx } from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("animate-pulse rounded-md bg-muted", className)} />
  );
}

export function SeriesCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-2.5 w-1/2" />
    </div>
  );
}

export function StatCardSkeleton() {
  return <Skeleton className="h-24 w-full rounded-xl" />;
}

export function SeriesDetailSkeleton() {
  return (
    <div className="min-h-screen">
      <Skeleton className="h-48 sm:h-72 w-full" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-24 sm:-mt-40 relative z-10 pb-12">
        <div className="flex gap-4 sm:gap-6">
          <Skeleton className="shrink-0 w-28 h-40 sm:w-36 sm:h-52 rounded-xl" />
          <div className="flex-1 pt-10 sm:pt-16 space-y-3">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <div className="flex gap-2 mt-4">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="mt-8 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-6 sm:space-y-8 max-w-screen-2xl">
      <div className="space-y-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <SeriesCardSkeleton key={i} />)}
        </div>
      </div>
    </div>
  );
}
