/**
 * Shimmer skeleton shown while a page's data loads (Next.js route-level loading UI).
 *
 * `.route-skeleton` HOLDS it invisible for --m-hold (250 ms) before it fades up, so a route that
 * resolves inside the hold shows no skeleton at all and the first frame of real content is the first
 * frame of that content's arrival — not a settled skeleton swapping for settled content, which is the
 * one thing the navigation gesture may not look like (motion spec §10). Dev fetches are slower than
 * the hold, so the ramp is visible on localhost; raise --m-hold in devtools to see the production path.
 */
export default function AppLoading() {
  return (
    <div className="route-skeleton space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="skeleton h-7 w-40 rounded-lg" />
        <div className="skeleton h-4 w-64 rounded" />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-gray-200 bg-surface p-4" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between">
              <div className="skeleton h-5 w-24 rounded-full" />
              <div className="skeleton h-4 w-12 rounded" />
            </div>
            <div className="skeleton h-5 w-2/3 rounded" />
            <div className="skeleton h-4 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
