import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw } from 'lucide-react'
import { usePortal } from './portal'

export const cx = (...c) => c.filter(Boolean).join(' ')

// ------------------------------------------------------------------ Button
// Outline variants set their own border colour; the others use a transparent border so
// every variant has the same box size. (Previously a shared 'border-transparent'
// overrode the outline colours, so outline buttons rendered with no visible border.)
const BTN = {
  primary: 'border-transparent bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50',
  cyan: 'border-transparent bg-cyan text-[#06142E] hover:bg-cyan-light disabled:opacity-50',
  outline: 'bg-white border-[#CBD5E1] text-ink hover:bg-slate-50 disabled:opacity-50',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-slate-100 disabled:opacity-50',
  danger: 'border-transparent bg-bad text-white hover:bg-red-800 disabled:opacity-50',
  'danger-outline': 'bg-white border-bad/40 text-bad hover:bg-bad-bg disabled:opacity-50',
  success: 'border-transparent bg-ok text-white hover:bg-green-800 disabled:opacity-50',
  dark: 'bg-white/10 text-white border-white/20 hover:bg-white/15',
}
const SIZE = {
  sm: 'min-h-9 px-3.5 text-[13px] rounded-[10px] gap-1.5',
  md: 'min-h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'min-h-12 px-6 text-[15px] rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-[10px]',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, to, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = cx(
    'inline-flex items-center justify-center border font-semibold transition-colors whitespace-nowrap',
    BTN[variant], SIZE[size], className,
  )
  const content = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </>
  )
  if (to) return <Link ref={ref} to={to} className={cls} {...rest}>{content}</Link>
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  )
})

// ------------------------------------------------------------------ Card
export function Card({ className, children, as: As = 'div', padded = true, ...rest }) {
  const portal = usePortal()
  return (
    <As
      className={cx(
        'min-w-0 border border-line bg-white',
        portal === 'admin' ? 'rounded-xl shadow-card-flat' : 'rounded-[20px] shadow-card',
        padded && (portal === 'admin' ? 'p-5' : 'p-6'),
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  )
}

// ------------------------------------------------------------------ Badge
const TONES = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  info: 'bg-info-bg text-info',
  cyan: 'bg-[#CFF5FB] text-teal',
  neutral: 'bg-neutral-pill text-neutral-pill-text',
  dark: 'bg-white/10 text-white',
}
export function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

// ------------------------------------------------------------------ Loading
export function Spinner({ className, label = 'Loading' }) {
  return (
    <span role="status" className={cx('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden />
      <span>{label}…</span>
    </span>
  )
}
export function PageLoader({ label }) {
  return <div className="flex min-h-[40vh] items-center justify-center"><Spinner label={label} /></div>
}
export function Skeleton({ className }) {
  return <div className={cx('skeleton rounded-lg', className)} aria-hidden />
}
export function SkeletonCards({ count = 6, className = 'h-56' }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={cx('rounded-[20px]', className)} />)}
    </div>
  )
}
export function SkeletonRows({ rows = 6 }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-11" />)}
    </div>
  )
}

// ------------------------------------------------------------------ Empty / error
export function EmptyState({ icon: Icon = Inbox, title, children, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-info-bg text-brand">
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
export function ErrorState({ error, onRetry, className }) {
  return (
    <div role="alert" className={cx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bad-bg text-bad">
        <AlertTriangle className="h-7 w-7" aria-hidden />
      </span>
      <h3 className="text-lg font-semibold">Could not load this</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <Button variant="outline" size="sm" icon={RefreshCw} className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  )
}
export function InlineError({ children }) {
  if (!children) return null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/20 bg-bad-bg px-3.5 py-2.5 text-sm text-bad">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

// ------------------------------------------------------------------ Headings
export function PageHeader({ title, subtitle, eyebrow, actions, back }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
            <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
          </Link>
        )}
        {eyebrow && <p className="label-caps mb-1">{eyebrow}</p>}
        <h1 className="text-2xl font-bold sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
export function SectionTitle({ children, action, className }) {
  return (
    <div className={cx('mb-4 flex items-center justify-between gap-3', className)}>
      <h2 className="text-lg font-semibold">{children}</h2>
      {action}
    </div>
  )
}

// ------------------------------------------------------------------ Stats
const ACCENT = { brand: 'border-t-brand', cyan: 'border-t-cyan', ok: 'border-t-ok', warn: 'border-t-[#F59E0B]', bad: 'border-t-[#DC2626]', none: 'border-t-transparent' }
const TILE = { brand: 'bg-info-bg text-brand', cyan: 'bg-[#CFF5FB] text-teal', ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', none: 'bg-slate-100 text-muted' }
export function StatCard({ label, value, hint, icon: Icon, accent = 'brand', to, loading }) {
  const portal = usePortal()
  const body = (
    <Card className={cx('h-full', portal === 'admin' && cx('border-t-[3px]', ACCENT[accent]), to && 'transition-colors hover:border-[#93B4F5]')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps">{label}</p>
          {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1.5 font-display text-[28px] font-bold leading-tight">{value}</p>}
          {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
        </div>
        {Icon && <span className={cx('flex h-11 w-11 flex-none items-center justify-center rounded-[14px]', TILE[accent])}><Icon className="h-5 w-5" aria-hidden /></span>}
      </div>
    </Card>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}

// ------------------------------------------------------------------ Progress / readiness
export function ProgressBar({ value, tone = 'brand', className, label }) {
  const color = { brand: 'bg-brand', ok: 'bg-ok', warn: 'bg-[#F59E0B]', bad: 'bg-[#DC2626]', cyan: 'bg-cyan' }[tone]
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-[#E5EAF2]', className)} role="progressbar"
      aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${v}%` }} />
    </div>
  )
}
export function ReadinessRing({ pct, buildable, size = 64 }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, pct || 0))
  const color = buildable ? '#15803D' : v >= 60 ? '#F59E0B' : '#DC2626'
  return (
    <div className="relative flex-none" style={{ width: size, height: size }} role="img" aria-label={`${v}% of components available${buildable ? ', buildable now' : ''}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5EAF2" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold">{v}%</span>
    </div>
  )
}

// ------------------------------------------------------------------ Tabs
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1', className)}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('inline-flex min-h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors',
            value === t.value ? 'bg-navy text-white' : 'text-muted hover:bg-slate-100 hover:text-ink')}>
          {t.label}
          {t.count !== undefined && t.count !== null && (
            <span className={cx('rounded-full px-1.5 text-xs', value === t.value ? 'bg-white/15' : 'bg-slate-100')}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Pagination
export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize))
  if (!total || pages <= 1) return total ? <p className="mt-4 text-sm text-muted">{total} result{total === 1 ? '' : 's'}</p> : null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-sm text-muted">Showing {from}–{to} of {total}</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="px-2 text-sm font-medium">Page {page} of {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  )
}

// ------------------------------------------------------------------ Avatar
export function Avatar({ name, size = 'md', className }) {
  const initials = (name || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span className={cx('inline-flex flex-none items-center justify-center rounded-full bg-gradient-to-br from-cyan to-brand font-semibold text-white',
      size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm', className)} aria-hidden>
      {initials}
    </span>
  )
}

// ------------------------------------------------------------------ Table
export function Table({ children, className }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  )
}
export function Th({ children, className, ...rest }) {
  return <th scope="col" className={cx('border-b border-line bg-slate-50/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted', className)} {...rest}>{children}</th>
}
export function Td({ children, className, ...rest }) {
  return <td className={cx('border-b border-line px-4 py-3 align-middle', className)} {...rest}>{children}</td>
}
