import { Skeleton, SeriesCardSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 space-y-6 max-w-screen-2xl">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56 rounded-sm" />
        <Skeleton className="h-4 w-32 rounded-sm" />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-4">
        {Array.from({ length: 24 }).map((_, i) => (
          <SeriesCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
