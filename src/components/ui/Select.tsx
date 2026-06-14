import { type SelectHTMLAttributes, forwardRef } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: SelectOption[]
  error?: string
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, placeholder, className = '', id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-xs text-[var(--text-muted)]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`bg-[var(--bg-dark)] border ${error ? 'border-[var(--red)]' : 'border-[var(--border)]'} rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--purple)] transition-colors cursor-pointer ${className}`}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <span className="text-xs text-[var(--red)]">{error}</span>}
      </div>
    )
  }
)

Select.displayName = 'Select'
export { Select }
