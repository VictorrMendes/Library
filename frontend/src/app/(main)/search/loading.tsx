import { Skeleton, SeriesCardSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 space-y-5 max-w-screen-2xl">
      <Skeleton className="h-10 w-full max-w-xl rounded-lg" />
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-4">
        {Array.from({ length: 16 }).map((_, i) => (
          <SeriesCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
