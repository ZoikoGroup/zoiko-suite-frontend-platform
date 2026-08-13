import { Card, CardContent, CardHeader, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-36 rounded" />

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="w-full space-y-2">
          <Skeleton className="h-8 w-full max-w-md rounded-lg" />
          <Skeleton className="h-4 w-56 rounded" />
        </div>
        <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
      </div>

      {Array.from({ length: 3 }).map((_, card) => (
        <Card key={card} className="mb-6">
          <CardHeader>
            <div className="w-full space-y-2">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-3 w-full max-w-lg rounded" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, row) => (
                <Skeleton key={row} className="h-6 w-full rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
