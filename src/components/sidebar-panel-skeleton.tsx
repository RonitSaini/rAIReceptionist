/** Shimmer stand-in for <SidebarPanel> while its queries run, shaped like the real panel. */
export function SidebarPanelSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 px-3 pt-2 short:gap-2 short:pt-1" aria-busy="true" aria-label="Loading">
      <div className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5">
        <div className="skeleton h-3 w-12 rounded" />
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 short:mt-1 short:grid-cols-3 short:gap-y-1">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="px-1 py-0.5">
              <div className="skeleton h-5 w-8 rounded" />
              <div className="skeleton mt-1 h-3 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5 micro:hidden">
        <div className="skeleton h-3 w-14 rounded" />
        <div className="mt-2 space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-5/6 rounded" />
        </div>
      </div>
      <div className="space-y-2 short:flex short:gap-2 short:space-y-0">
        <div className="skeleton h-9 w-full rounded-xl short:flex-1" />
        <div className="skeleton h-9 w-full rounded-xl short:flex-1" />
      </div>
      <div className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5 micro:hidden">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton mt-2 h-4 w-28 rounded" />
      </div>
      <div className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5">
        <div className="skeleton h-3 w-14 rounded" />
        <div className="skeleton mt-2 h-4 w-32 rounded" />
        <div className="skeleton mt-1 h-3 w-24 rounded" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5 tiny:hidden">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="mt-2 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-2 px-1">
              <div className="flex-1 space-y-1">
                <div className="skeleton h-3.5 w-3/4 rounded" />
                <div className="skeleton h-2.5 w-1/3 rounded" />
              </div>
              <div className="skeleton h-4 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
