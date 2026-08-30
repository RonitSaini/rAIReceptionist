/**
 * Dashboard-shaped skeleton (Next.js route-level loading UI). Mirrors the real layout — header →
 * KPI row → two columns of cards → chart pair → host card — so nothing jumps when the data lands.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="skeleton h-8 w-24 rounded-lg" />
          <div className="skeleton h-4 w-56 rounded" />
        </div>
        <div className="skeleton h-9 w-32 rounded-xl" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-gray-200 bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-4 w-4 rounded" />
            </div>
            <div className="skeleton mt-2 h-9 w-14 rounded-lg" />
            <div className="skeleton mt-2 h-3 w-24 rounded" />
          </div>
        ))}
      </div>

      {/* Two columns of cards */}
      <div className="grid gap-5 2xl:grid-cols-2 2xl:items-start">
        <div className="space-y-5">
          <CardSkeleton rows={3} />
          <CardSkeleton rows={2} />
        </div>
        <div className="space-y-5">
          <CardSkeleton rows={3} />
          <CardSkeleton rows={2} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      <CardSkeleton rows={2} />
    </div>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="skeleton h-5 w-40 rounded" />
        <div className="skeleton h-4 w-16 rounded" />
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
            <div className="skeleton h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="skeleton h-5 w-32 rounded" />
        <div className="skeleton h-3 w-28 rounded" />
      </div>
      <div className="skeleton aspect-[3/1] w-full rounded-lg" />
      <div className="mt-2 flex gap-4">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>
    </div>
  );
}
