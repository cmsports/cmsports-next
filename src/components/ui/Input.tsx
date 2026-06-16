import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-[var(--text-muted)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`bg-[var(--bg-dark)] border ${error ? 'border-[var(--red)]' : 'border-[var(--border)]'} rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50 outline-none focus:border-[var(--sky)] transition-colors ${className}`}
          {...props}
        />
        {error && <span className="text-xs text-[var(--red)]">{error}</span>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export { Input }
