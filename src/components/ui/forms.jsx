import { forwardRef, useId } from 'react'
import { Minus, Plus, Search, X } from 'lucide-react'
import { cx } from './primitives'

const base = 'w-full min-h-11 rounded-xl border bg-white px-3.5 text-sm text-ink placeholder:text-[#8A97AB] transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50 disabled:text-muted'

export function Field({ label, hint, error, children, className, required, htmlFor }) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
          {label}{required && <span className="text-bad" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-[13px] font-medium text-bad" role="alert">{error}</p>
        : hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  )
}

export const Input = forwardRef(function Input({ label, hint, error, className, required, id, ...rest }, ref) {
  const autoId = useId()
  const fid = id || autoId
  const input = (
    <input ref={ref} id={fid} required={required} aria-invalid={error ? true : undefined}
      className={cx(base, error ? 'border-bad' : 'border-[#CBD5E1]', !label && className)} {...rest} />
  )
  if (!label) return input
  return <Field label={label} hint={hint} error={error} required={required} htmlFor={fid} className={className}>{input}</Field>
})

export const Textarea = forwardRef(function Textarea({ label, hint, error, className, required, id, rows = 3, ...rest }, ref) {
  const autoId = useId()
  const fid = id || autoId
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fid} className={className}>
      <textarea ref={ref} id={fid} rows={rows} required={required} aria-invalid={error ? true : undefined}
        className={cx(base, 'py-2.5', error ? 'border-bad' : 'border-[#CBD5E1]')} {...rest} />
    </Field>
  )
})

export function Select({ label, hint, error, className, options, placeholder, required, id, ...rest }) {
  const autoId = useId()
  const fid = id || autoId
  const select = (
    <select id={fid} required={required} aria-invalid={error ? true : undefined}
      className={cx(base, 'pr-8', error ? 'border-bad' : 'border-[#CBD5E1]', !label && className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  )
  if (!label) return select
  return <Field label={label} hint={hint} error={error} required={required} htmlFor={fid} className={className}>{select}</Field>
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, label = 'Search' }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A97AB]" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        aria-label={label} className={cx(base, 'border-[#CBD5E1] pl-10 pr-9')} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = 999, label, size = 'md' }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, Number.isFinite(v) ? Math.trunc(v) : min)))
  const h = size === 'sm' ? 'h-9' : 'h-11'
  return (
    <div className={cx('inline-flex items-center overflow-hidden rounded-xl border border-[#CBD5E1] bg-white', h)}>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}
        className="flex h-full w-9 items-center justify-center text-muted hover:bg-slate-50 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
      <input type="number" inputMode="numeric" value={value} min={min} max={max} aria-label={label}
        onChange={(e) => set(parseInt(e.target.value, 10))}
        className="h-full w-12 border-x border-[#CBD5E1] text-center text-sm font-semibold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}
        className="flex h-full w-9 items-center justify-center text-muted hover:bg-slate-50 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
    </div>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
      {label}
    </label>
  )
}
