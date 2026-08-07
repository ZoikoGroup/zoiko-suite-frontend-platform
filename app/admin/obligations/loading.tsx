import { Card, CardContent, CardHeader, Skeleton } from "@/components/ui";

/**
 * Route-level fallback for the obligation register.
 *
 * Shaped like the real page — header, the three-caveat card, the filter row and
 * the register — rather than the generic domain skeleton, so the layout does not
 * jump when the page arrives.
 */
export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl rounded" />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="w-full space-y-2">
            <Skeleton className="h-4 w-56 rounded" />
            <Skeleton className="h-3 w-full max-w-xl rounded" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="w-full space-y-2">
            <Skeleton className="h-4 w-44 rounded" />
            <Skeleton className="h-3 w-full max-w-xl rounded" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
