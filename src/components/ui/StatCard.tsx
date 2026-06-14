import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  trend?: { value: number; label?: string }
  className?: string
}

export function StatCard({ label, value, icon: Icon, trend, className = '' }: StatCardProps) {
  return (
    <div className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
        {Icon && <Icon className="size-4 text-[var(--purple-light)]" />}
      </div>
      <p className="text-2xl font-bold text-[var(--text)]">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${trend.value >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          {trend.value >= 0 ? '+' : ''}{trend.value}%{trend.label ? ` ${trend.label}` : ''}
        </p>
      )}
    </div>
  )
}
