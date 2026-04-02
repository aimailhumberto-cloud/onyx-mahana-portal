interface SkeletonProps {
  lines?: number
  className?: string
}

export function SkeletonCard({ lines = 3, className = '' }: SkeletonProps) {
  return (
    <div className={`card-premium p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="skeleton w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/3 rounded" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-3 rounded" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card-premium overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-b from-gray-50 to-gray-100/50 border-b-2 border-gray-200 px-4 py-3 flex gap-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton h-3 rounded flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-gray-100 flex items-center gap-4">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-4 w-20 rounded" />
          <div className="skeleton h-6 w-16 rounded-full" />
          <div className="skeleton h-4 w-16 rounded ml-auto" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonKPI() {
  return (
    <div className="card-premium p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="skeleton w-8 h-8 rounded-lg" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
      <div className="skeleton h-7 w-24 rounded" />
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header skeleton */}
      <div className="skeleton h-24 rounded-2xl" />
      
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <SkeletonKPI key={i} />
        ))}
      </div>
      
      {/* Three column */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>

      {/* Chart area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-premium p-4">
          <div className="skeleton h-4 w-32 rounded mb-3" />
          <div className="skeleton h-44 rounded-xl" />
        </div>
        <div className="card-premium p-4">
          <div className="skeleton h-4 w-40 rounded mb-3" />
          <div className="skeleton h-44 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
