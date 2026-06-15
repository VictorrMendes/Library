import { Skeleton } from "@/components/ui/Skeleton";

export default function VocabularyLoading() {
  return (
    <div className="p-5 sm:p-8 space-y-8 max-w-screen-xl">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44 rounded-sm" />
        <Skeleton className="h-4 w-60 rounded-sm" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-10 w-64 rounded-lg" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
