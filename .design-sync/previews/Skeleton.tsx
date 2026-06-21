import { Skeleton } from 'l1beat-design-system';

export function Line() {
  return (
    <div className="w-72 space-y-3 bg-background p-6">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function Card() {
  return (
    <div className="flex w-80 items-center gap-4 rounded-xl border border-border bg-card p-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function StatTiles() {
  return (
    <div className="grid w-96 grid-cols-3 gap-3 bg-background p-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}
