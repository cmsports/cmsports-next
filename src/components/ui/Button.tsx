'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { type LucideIcon } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  loading?: boolean
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-[var(--purple)] hover:bg-[#5b54e6] text-white',
  secondary: 'bg-transparent border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--purple-light)]',
  danger: 'bg-[var(--red)]/10 border border-[var(--red)]/30 text-[var(--red)] hover:bg-[var(--red)]/20',
  ghost: 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/5',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon: Icon, loading, children, className = '', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : Icon ? (
          <Icon className="size-4" />
        ) : null}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export { Button }
export type { ButtonProps }
