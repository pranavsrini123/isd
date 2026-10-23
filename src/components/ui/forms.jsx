import { forwardRef, useId } from 'react'
import { Minus, Plus, Search, X } from 'lucide-react'
import { cx } from './primitives'
import { usePortal, useSurface } from './portal'

const CHEVRON = (c) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`

/** Input chrome for the current surface (light page / glass card, or a night panel). */
function useFieldClasses(error) {
  const dark = useSurface() === 'dark'
  const admin = usePortal() === 'admin'
  return cx(
    'w-full min-h-11 rounded-xl border px-3.5 text-sm transition-[border-color,box-shadow,background-color] duration-150 focus:outline-none disabled:cursor-not-allowed',
    dark
      ? 'bg-white/[.07] text-white placeholder:text-white/45 focus:border-cyan focus:bg-white/10 focus:ring-4 focus:ring-cyan/20 disabled:opacity-60'
      : cx(admin ? 'bg-white' : 'bg-white/85', 'text-ink placeholder:text-subtle hover:border-[#A9B8CC] focus:border-focus focus:bg-white focus:ring-4 focus:ring-cyan/20 disabled:bg-slate-50 disabled:text-muted'),
    error ? 'border-bad hover:border-bad' : dark ? 'border-white/15' : 'border-line-strong',
  )
}

export function Field({ label, hint, error, children, className, required, htmlFor }) {
  const dark = useSurface() === 'dark'
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className={cx('block text-[13.5px] font-semibold', dark ? 'text-white' : 'text-ink')}>
          {label}{required && <span className="text-bad" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-[13px] font-medium text-bad" role="alert">{error}</p>
        : hint ? <p className={cx('text-[13px]', dark ? 'text-side-text' : 'text-muted')}>{hint}</p> : null}
    </div>
  )
}

export const Input = forwardRef(function Input({ label, hint, error, className, required, id, ...rest }, ref) {
  const autoId = useId()
  const fid = id || autoId
  const base = useFieldClasses(error)
  const input = (
    <input ref={ref} id={fid} required={required} aria-invalid={error ? true : undefined}
      className={cx(base, !label && className)} {...rest} />
  )
  if (!label) return input
  return <Field label={label} hint={hint} error={error} required={required} htmlFor={fid} className={className}>{input}</Field>
})

export const Textarea = forwardRef(function Textarea({ label, hint, error, className, required, id, rows = 3, ...rest }, ref) {
  const autoId = useId()
  const fid = id || autoId
  const base = useFieldClasses(error)
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fid} className={className}>
      <textarea ref={ref} id={fid} rows={rows} required={required} aria-invalid={error ? true : undefined}
        className={cx(base, 'py-2.5 leading-relaxed')} {...rest} />
    </Field>
  )
})

export function Select({ label, hint, error, className, options, placeholder, required, id, style, ...rest }) {
  const autoId = useId()
  const fid = id || autoId
  const dark = useSurface() === 'dark'
  const base = useFieldClasses(error)
  const select = (
    <select id={fid} required={required} aria-invalid={error ? true : undefined}
      style={{ backgroundImage: CHEVRON(dark ? '%23CBD5E1' : '%23526079'), backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '16px', ...style }}
      className={cx(base, 'cursor-pointer appearance-none pr-9 [&>option]:text-ink', !label && className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  )
  if (!label) return select
  return <Field label={label} hint={hint} error={error} required={required} htmlFor={fid} className={className}>{select}</Field>
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, label = 'Search' }) {
  const dark = useSurface() === 'dark'
  const base = useFieldClasses(false)
  return (
    <div className={cx('relative', className)}>
      <Search className={cx('pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2', dark ? 'text-white/55' : 'text-subtle')} aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        aria-label={label} className={cx(base, 'pl-10 pr-9 [&::-webkit-search-cancel-button]:appearance-none')} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search"
          className={cx('absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors', dark ? 'text-white/60 hover:text-white' : 'text-muted hover:text-ink')}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = 999, label, size = 'md' }) {
  const set = (v) => onChange(Math.max(min, Math.min(max, Number.isFinite(v) ? Math.trunc(v) : min)))
  const h = size === 'sm' ? 'h-9' : 'h-11'
  const btn = 'flex h-full w-9 items-center justify-center text-muted transition-colors hover:bg-cyan/10 hover:text-brand disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted'
  return (
    <div className={cx('inline-flex items-center overflow-hidden rounded-xl border border-line-strong bg-white focus-within:border-focus focus-within:ring-4 focus-within:ring-cyan/20', h)}>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`} className={btn}><Minus className="h-4 w-4" /></button>
      <input type="number" inputMode="numeric" value={value} min={min} max={max} aria-label={label}
        onChange={(e) => set(parseInt(e.target.value, 10))}
        className="num h-full w-12 border-x border-line text-center text-sm font-semibold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`} className={btn}><Plus className="h-4 w-4" /></button>
    </div>
  )
}

/**
 * On/off switch. One <button role="switch"> holds both the track and the text,
 * so the whole control is a single click target with the right accessible name.
 *
 * The knob sits in normal flex flow inside a fixed-size track (flex-none, so it
 * can never be squeezed) and moves with a single transform: 0 when off and
 * exactly (track inner width − knob width) = 20px when on. It is never
 * absolutely positioned, so it cannot drift outside the track.
 */
export function Toggle({ checked, onChange, label, disabled = false, className }) {
  const dark = useSurface() === 'dark'
  return (
    <button type="button" role="switch" aria-checked={!!checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('group inline-flex items-center gap-2.5 rounded-full text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
        dark ? 'text-white' : 'text-ink', className)}>
      <span aria-hidden="true"
        className={cx('inline-flex h-6 w-11 flex-none items-center rounded-full p-0.5 transition-[background-color,box-shadow] duration-200',
          'group-focus-visible:ring-2 group-focus-visible:ring-focus group-focus-visible:ring-offset-2',
          checked ? 'bg-gradient-to-r from-brand to-[#0891B2] shadow-[0_0_12px_rgb(34_211_238/0.45)]' : dark ? 'bg-white/20' : 'bg-slate-300')}>
        <span className={cx('block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0')} />
      </span>
      {label && <span>{label}</span>}
    </button>
  )
}
