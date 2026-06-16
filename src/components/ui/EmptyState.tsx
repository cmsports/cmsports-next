import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="size-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Icon className="size-7 text-[var(--text-muted)]" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--text)] mb-1">{title}</h3>
      {description && <p className="text-xs text-[var(--text-muted)] max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
