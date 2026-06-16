import type { ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-600',
  success: 'bg-[var(--green-light)] text-[var(--green)]',
  danger:  'bg-[var(--red-light)] text-[var(--red)]',
  warning: 'bg-[var(--yellow-light)] text-[var(--yellow)]',
  info:    'bg-[var(--sky-light)] text-[var(--sky-dark)]',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  )
}
