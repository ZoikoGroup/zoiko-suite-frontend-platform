import { Skeleton } from "@/components/ui";

export function DomainPlaceholderSkeleton() {
  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <Skeleton className="mb-6 h-14 rounded-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
