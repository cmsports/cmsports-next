import type { ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-white/10 text-[var(--text-muted)]',
  success: 'bg-[var(--green)]/15 text-[var(--green)]',
  danger: 'bg-[var(--red)]/15 text-[var(--red)]',
  warning: 'bg-[var(--yellow)]/15 text-[var(--yellow)]',
  info: 'bg-[var(--purple)]/15 text-[var(--purple-light)]',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  )
}
