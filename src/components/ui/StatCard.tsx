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
    <div className={`bg-white border border-[var(--border)] rounded-xl p-5 ${className}`} style={{ boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className="size-8 rounded-lg bg-[var(--sky-light)] flex items-center justify-center">
            <Icon className="size-4 text-[var(--sky)]" />
          </div>
        )}
      </div>
      <p className="text-2xl font-semibold text-[var(--text)]">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 font-medium ${trend.value >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          {trend.value >= 0 ? '+' : ''}{trend.value}%{trend.label ? ` ${trend.label}` : ''}
        </p>
      )}
    </div>
  )
}
