export function DashboardSkeleton() {
  return (
    <div
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading air quality dashboard"
    >
      {/* Top source diagnostic strip skeleton */}
      <div className="aeris-panel rounded-xl px-4 py-4 space-y-3 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="h-4 w-72 max-w-full rounded bg-slate-800/80" />
          <div className="h-8 w-24 rounded-lg bg-slate-800/80" />
        </div>
        <div className="pt-2.5 border-t border-slate-800/70 flex flex-wrap gap-5">
          <div className="h-3 w-36 rounded bg-slate-800/70" />
          <div className="h-3 w-28 rounded bg-slate-800/70" />
          <div className="h-3 w-40 rounded bg-slate-800/70" />
        </div>
      </div>

      {/* Hero Split Skeleton matching 7/5 layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 aeris-panel rounded-xl p-6 space-y-6 animate-pulse">
          <div className="space-y-3 pb-5 border-b border-slate-800/70">
            <div className="h-3 w-44 rounded bg-slate-800/80" />
            <div className="h-7 w-60 rounded bg-slate-800/90" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="h-10 rounded-lg bg-slate-800/75" />
              <div className="h-10 rounded-lg bg-slate-800/75" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="h-14 w-32 rounded bg-slate-800/90" />
              <div className="h-4 w-44 rounded bg-slate-800/80" />
              <div className="h-12 w-full rounded bg-slate-800/65" />
            </div>
            <div className="space-y-3">
              <div className="h-3.5 w-full rounded bg-slate-800/75" />
              <div className="h-3.5 w-5/6 rounded bg-slate-800/75" />
              <div className="h-3.5 w-4/5 rounded bg-slate-800/75" />
              <div className="h-3.5 w-full rounded bg-slate-800/75" />
            </div>
          </div>
          <div className="pt-4 border-t border-slate-800/70 flex items-center justify-between">
            <div className="h-3.5 w-44 rounded bg-slate-800/70" />
            <div className="h-9 w-44 rounded-lg bg-cyan-500/20" />
          </div>
        </div>

        <div className="lg:col-span-5 aeris-panel rounded-xl min-h-[340px] flex flex-col items-center justify-center p-6 animate-pulse">
          <div className="w-40 h-40 rounded-full border border-cyan-500/25 bg-slate-900/80" />
          <div className="mt-4 h-3 w-48 rounded bg-slate-800/80" />
        </div>
      </div>

      {/* 4 KPI Pollutant Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="aeris-panel rounded-xl p-5 space-y-2.5 animate-pulse"
          >
            <div className="h-3 w-28 rounded bg-slate-800/80" />
            <div className="h-8 w-20 rounded bg-slate-800/90" />
            <div className="h-1.5 w-full rounded-full bg-slate-800/70" />
            <div className="h-3 w-24 rounded bg-slate-800/60" />
          </div>
        ))}
      </div>

      {/* Chart + Stations Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 aeris-panel rounded-xl p-6 h-80 animate-pulse space-y-4">
          <div className="h-4 w-52 rounded bg-slate-800/80" />
          <div className="h-56 w-full rounded-lg bg-slate-900/70" />
        </div>
        <div className="lg:col-span-6 aeris-panel rounded-xl p-6 h-80 animate-pulse space-y-3">
          <div className="h-4 w-48 rounded bg-slate-800/80" />
          {[1, 2, 3, 4].map((row) => (
            <div
              key={row}
              className="h-12 w-full rounded-lg bg-slate-900/65"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      aria-busy="true"
      aria-label="Loading monitoring stations map"
    >
      <div className="lg:col-span-7 aeris-panel rounded-xl p-5 min-h-[480px] animate-pulse flex flex-col gap-3">
        <div className="h-3.5 w-64 rounded bg-slate-800/80" />
        <div className="flex-1 rounded-lg bg-slate-900/75" />
      </div>
      <div className="lg:col-span-5 space-y-4 animate-pulse">
        <div className="aeris-panel rounded-xl p-5 h-60 space-y-3">
          <div className="h-4 w-44 rounded bg-slate-800/80" />
          <div className="h-6 w-56 rounded bg-slate-800/90" />
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[1, 2, 3].map((k) => (
              <div key={k} className="h-14 rounded-lg bg-slate-800/75" />
            ))}
          </div>
        </div>
        <div className="aeris-panel rounded-xl p-4 h-64 space-y-2.5">
          <div className="h-4 w-36 rounded bg-slate-800/80" />
          {[1, 2, 3, 4].map((r) => (
            <div key={r} className="h-11 rounded-lg bg-slate-800/70" />
          ))}
        </div>
      </div>
    </div>
  );
}
