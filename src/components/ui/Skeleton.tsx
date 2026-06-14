interface SkeletonProps {
  className?: string
  width?: string
  height?: string
}

export function Skeleton({ className = '', width, height = '1rem' }: SkeletonProps) {
  return (
    <div
      className={`bg-white/10 rounded-lg animate-pulse ${className}`}
      style={{ width, height }}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
      <Skeleton width="40%" height="0.75rem" />
      <Skeleton width="60%" height="1.5rem" />
      <Skeleton width="80%" height="0.75rem" />
    </div>
  )
}
