import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  noPadding?: boolean
}

export function Card({ children, noPadding, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-white border border-[var(--border)] rounded-xl ${noPadding ? '' : 'p-5'} ${className}`}
      style={{ boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
        {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
