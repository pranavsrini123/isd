import { forwardRef, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw } from 'lucide-react'
import { SurfaceContext, usePortal, useSurface } from './portal'
import { CountUp, EASE_OUT, m, useMotionOK } from './motion'

export const cx = (...c) => c.filter(Boolean).join(' ')

// ------------------------------------------------------------------ Button
// Every variant carries a border (transparent where none shows) so all buttons share one box size.
const BTN = {
  primary: 'border-transparent bg-night-2 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_8px_18px_-10px_rgb(7_13_31/0.7)] hover:bg-night-3 hover:shadow-[0_0_0_1px_rgb(34_211_238/0.35),0_10px_24px_-10px_rgb(34_211_238/0.6)] disabled:bg-night-2/45 disabled:shadow-none',
  cyan: 'border-transparent bg-cyan text-night shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] hover:bg-[#45DCF2] hover:shadow-glow disabled:opacity-50 disabled:shadow-none',
  outline: 'border-line-strong bg-white/85 text-ink hover:border-[#9FB0C6] hover:bg-white disabled:opacity-50',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-ink/[.05] disabled:opacity-50',
  link: 'border-transparent bg-transparent text-brand hover:bg-cyan/10 hover:text-brand-dark disabled:opacity-50',
  danger: 'border-transparent bg-[#DC2626] text-white hover:bg-bad disabled:opacity-50',
  'danger-outline': 'border-bad/30 bg-white/85 text-bad hover:border-bad/50 hover:bg-bad-bg disabled:opacity-50',
  success: 'border-transparent bg-ok text-white hover:bg-[#065F46] disabled:opacity-50',
  dark: 'border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/15 disabled:opacity-50',
}
// On the night surfaces the light-surface variants would vanish, so they map to their dark twins.
const ON_DARK = {
  primary: 'cyan',
  outline: 'dark',
  ghost: 'border-transparent bg-transparent text-white/85 hover:bg-white/10 hover:text-white disabled:opacity-50',
  link: 'border-transparent bg-transparent text-cyan-light hover:bg-white/10 hover:text-white disabled:opacity-50',
  'danger-outline': 'border-[#FCA5A5]/40 bg-white/5 text-[#FECACA] hover:bg-white/10 disabled:opacity-50',
}
const SIZE = {
  sm: 'min-h-9 px-3.5 text-[13px] rounded-[10px] gap-1.5',
  md: 'min-h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'min-h-12 px-6 text-[15px] rounded-[14px] gap-2',
  icon: 'h-9 w-9 rounded-[10px]',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, to, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const admin = usePortal() === 'admin'
  const dark = useSurface() === 'dark'
  const mapped = dark && ON_DARK[variant] ? ON_DARK[variant] : variant
  const cls = cx(
    'inline-flex select-none items-center justify-center border font-semibold whitespace-nowrap',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
    !admin && 'motion-safe:active:scale-[.97]',
    BTN[mapped] || mapped, SIZE[size], className,
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
/** Student: frosted glass, round. Admin: flat white, tighter. */
export function Card({ className, children, as: As = 'div', padded = true, ...rest }) {
  const admin = usePortal() === 'admin'
  return (
    <As
      className={cx(
        'min-w-0',
        admin ? 'rounded-xl border border-line bg-white shadow-card-flat' : 'glass rounded-[22px]',
        padded && (admin ? 'p-5' : 'p-5 sm:p-6'),
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  )
}

// ------------------------------------------------------------------ Night surfaces
/** Grid, grain and a cyan hairline for a `bg-hero` panel (parent needs `relative isolate overflow-hidden`). */
export function GlowBackdrop({ className, grid = true, noise = true, hairline = true }) {
  return (
    <div aria-hidden className={cx('pointer-events-none absolute inset-0 -z-10', className)}>
      {grid && <div className="tex-grid absolute inset-0" />}
      {noise && <div className="tex-noise absolute inset-0 opacity-[.06] mix-blend-overlay" />}
      {hairline && <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan/70 to-transparent" />}
    </div>
  )
}

/** Deep glowing panel with light-on-dark content; buttons and inputs inside switch to dark styles. */
export function NightPanel({ as: As = 'section', className, children, ...rest }) {
  return (
    <As className={cx('relative isolate overflow-hidden bg-hero text-white', className)} {...rest}>
      <GlowBackdrop />
      <SurfaceContext.Provider value="dark">{children}</SurfaceContext.Provider>
    </As>
  )
}

// ------------------------------------------------------------------ Badge
const TONES = {
  ok: 'bg-ok-bg text-ok ring-ok/15',
  warn: 'bg-warn-bg text-warn ring-warn/15',
  bad: 'bg-bad-bg text-bad ring-bad/15',
  info: 'bg-info-bg text-info ring-info/15',
  cyan: 'bg-cyan-soft text-brand ring-brand/15',
  neutral: 'bg-neutral-pill text-neutral-pill-text ring-neutral-pill-text/10',
  dark: 'bg-white/10 text-white ring-white/15',
}
export function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

// ------------------------------------------------------------------ Icon tile
const TILE = {
  brand: 'bg-gradient-to-br from-[#D3F6FB] to-[#E2EAFF] text-brand ring-cyan/30',
  cyan: 'bg-gradient-to-br from-[#CDF5FB] to-[#DDF8F2] text-brand ring-cyan/35',
  ok: 'bg-gradient-to-br from-[#D5F5E6] to-[#E8FBF4] text-ok ring-ok-solid/25',
  warn: 'bg-gradient-to-br from-[#FDEBC8] to-[#FFF6E4] text-warn ring-warn-solid/30',
  bad: 'bg-gradient-to-br from-[#FCDCDC] to-[#FFF0F0] text-bad ring-bad-solid/25',
  none: 'bg-slate-100 text-muted ring-slate-200',
  dark: 'bg-white/10 text-cyan-light ring-white/15',
}
/** Rounded icon square used by stats, lists and empty states. */
export function IconTile({ icon: Icon, tone = 'brand', size = 'md', className }) {
  const s = { sm: 'h-9 w-9 rounded-xl [&>svg]:h-4 [&>svg]:w-4', md: 'h-11 w-11 rounded-[14px] [&>svg]:h-5 [&>svg]:w-5', lg: 'h-14 w-14 rounded-2xl [&>svg]:h-7 [&>svg]:w-7' }[size]
  return (
    <span className={cx('inline-flex flex-none items-center justify-center ring-1 ring-inset', s, TILE[tone] || TILE.brand, className)} aria-hidden>
      <Icon />
    </span>
  )
}

// ------------------------------------------------------------------ Loading
export function Spinner({ className, label = 'Loading' }) {
  const dark = useSurface() === 'dark'
  return (
    <span role="status" className={cx('inline-flex items-center gap-2 text-sm', dark ? 'text-side-text' : 'text-muted', className)}>
      <Loader2 className={cx('h-5 w-5 animate-spin', dark ? 'text-cyan' : 'text-brand')} aria-hidden />
      <span>{label}…</span>
    </span>
  )
}
export function PageLoader({ label }) {
  return <div className="flex min-h-[40vh] items-center justify-center"><Spinner label={label} /></div>
}
export function Skeleton({ className }) {
  const admin = usePortal() === 'admin'
  return <div className={cx('skeleton rounded-lg', !admin && 'is-shimmer', className)} aria-hidden />
}
export function SkeletonCards({ count = 6, className = 'h-56' }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={cx('rounded-[22px]', className)} />)}
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
  const admin = usePortal() === 'admin'
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 text-center', admin ? 'py-12' : 'py-14', className)}>
      <IconTile icon={Icon} size="lg" tone="brand" className={cx('mb-4', !admin && 'shadow-[0_12px_30px_-12px_rgb(34_211_238/0.7)]')} />
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
export function ErrorState({ error, onRetry, className }) {
  return (
    <div role="alert" className={cx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <IconTile icon={AlertTriangle} size="lg" tone="bad" className="mb-4" />
      <h3 className="text-lg font-semibold">Could not load this</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <Button variant="outline" size="sm" icon={RefreshCw} className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  )
}
export function InlineError({ children }) {
  if (!children) return null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/20 bg-bad-bg/80 px-3.5 py-2.5 text-sm font-medium text-bad">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

// ------------------------------------------------------------------ Headings
function BackLink({ back, dark }) {
  return (
    <Link to={back.to} className={cx('group mb-3 inline-flex items-center gap-1 rounded-md text-sm font-medium transition-colors',
      dark ? 'text-side-text hover:text-white' : 'text-muted hover:text-ink')}>
      <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden /> {back.label}
    </Link>
  )
}

/**
 * Student page hero: a deep glowing night panel with the title, an optional eyebrow,
 * back link and actions, plus any extra content passed as children. `decor` is purely
 * visual (drawn behind the content); `flush` drops the bottom margin for overlapping content.
 */
export function Hero({ title, subtitle, eyebrow, actions, back, children, decor, flush = false, className, titleClassName }) {
  const ok = useMotionOK()
  const Inner = ok ? m.div : 'div'
  const enter = ok ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE_OUT, delay: 0.05 } } : {}
  return (
    <NightPanel className={cx('rounded-[26px] px-5 py-7 shadow-[0_28px_60px_-30px_rgb(7_13_31/0.75)] sm:px-8 sm:py-9', !flush && 'mb-6 lg:mb-8', className)}>
      {decor && <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">{decor}</div>}
      <Inner className="relative" {...enter}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 max-w-3xl">
            {back && <BackLink back={back} dark />}
            {eyebrow && <p className="mb-2 font-mono text-[11.5px] font-medium uppercase tracking-[.16em] text-cyan-light">{eyebrow}</p>}
            <h1 className={cx('text-[28px] font-bold leading-[1.12] text-white sm:text-[36px]', titleClassName)}>{title}</h1>
            {subtitle && <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-[#B9C6DE]">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children && <div className="mt-6">{children}</div>}
      </Inner>
    </NightPanel>
  )
}

/** Page title block. Student portal: a Hero. Admin console: a clean header row. */
export function PageHeader({ title, subtitle, eyebrow, actions, back, children }) {
  const admin = usePortal() === 'admin'
  if (!admin) return <Hero title={title} subtitle={subtitle} eyebrow={eyebrow} actions={actions} back={back}>{children}</Hero>
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        {back && <BackLink back={back} />}
        {eyebrow && <p className="label-caps mb-1">{eyebrow}</p>}
        <h1 className="text-[22px] font-semibold leading-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children && <div className="w-full">{children}</div>}
    </div>
  )
}

export function SectionTitle({ children, action, className }) {
  const admin = usePortal() === 'admin'
  return (
    <div className={cx('mb-4 flex items-center justify-between gap-3', className)}>
      <h2 className={cx('flex min-w-0 items-start gap-2.5 font-semibold leading-snug', admin ? 'text-base' : 'text-[19px]')}>
        {!admin && <span className="mt-[0.5em] h-2 w-2 flex-none rounded-full bg-cyan shadow-[0_0_10px_rgb(34_211_238/0.9)]" aria-hidden />}
        {children}
      </h2>
      {action}
    </div>
  )
}

// ------------------------------------------------------------------ Stats
const STAT_LINE = {
  brand: 'from-cyan via-azure/70', cyan: 'from-cyan via-cyan-light/60', ok: 'from-ok-solid via-ok-solid/50',
  warn: 'from-warn-solid via-warn-solid/50', bad: 'from-bad-solid via-bad-solid/50', none: 'from-slate-300',
}
const ADMIN_ACCENT = { brand: 'border-t-cyan', cyan: 'border-t-cyan', ok: 'border-t-ok-solid', warn: 'border-t-warn-solid', bad: 'border-t-bad-solid', none: 'border-t-transparent' }

/** A number with its label. Numeric values count up in the student portal. */
export function StatCard({ label, value, hint, icon: Icon, accent = 'brand', to, loading }) {
  const admin = usePortal() === 'admin'
  const number = loading ? <Skeleton className="mt-1 h-8 w-16" /> : <CountUp value={value} />
  const body = admin ? (
    <Card className={cx('h-full border-t-[3px]', ADMIN_ACCENT[accent], to && 'transition-colors hover:border-x-[#A5B4C8] hover:border-b-[#A5B4C8]')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps">{label}</p>
          <div className="num mt-1.5 text-[26px] font-semibold leading-tight">{number}</div>
          {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
        </div>
        {Icon && <IconTile icon={Icon} tone={accent} />}
      </div>
    </Card>
  ) : (
    <div className={cx('group relative h-full min-w-0 overflow-hidden rounded-[22px] border border-white bg-white/[.97] p-4 shadow-card backdrop-blur-xl sm:p-5', to && 'lift')}>
      <div className="flex items-start justify-between gap-2">
        {Icon && <IconTile icon={Icon} tone={accent} />}
        {to && <ArrowUpRight className="h-4 w-4 text-subtle transition-colors group-hover:text-brand" aria-hidden />}
      </div>
      <div className="num mt-4 text-[28px] font-semibold leading-none text-ink sm:text-[32px]">{number}</div>
      <p className="label-caps mt-2.5 leading-snug">{label}</p>
      {hint && <p className="mt-1 text-[13px] leading-snug text-muted">{hint}</p>}
      <span className={cx('absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r to-transparent opacity-80', STAT_LINE[accent])} aria-hidden />
    </div>
  )
  return to ? <Link to={to} className="block h-full rounded-[22px]">{body}</Link> : body
}

// ------------------------------------------------------------------ Progress / readiness
const BAR = {
  brand: 'bg-gradient-to-r from-cyan to-azure',
  ok: 'bg-gradient-to-r from-ok-solid to-[#2DD4BF]',
  warn: 'bg-gradient-to-r from-warn-solid to-[#FBBF24]',
  bad: 'bg-gradient-to-r from-bad-solid to-[#F87171]',
  cyan: 'bg-gradient-to-r from-cyan to-cyan-light',
}
/** Fills in when it comes into view (student portal). */
export function ProgressBar({ value, tone = 'brand', className, label }) {
  const ok = useMotionOK()
  const dark = useSurface() === 'dark'
  const v = Math.max(0, Math.min(100, value || 0))
  const fill = cx('h-full rounded-full', BAR[tone] || BAR.brand)
  return (
    <div className={cx('h-2 overflow-hidden rounded-full', dark ? 'bg-white/10' : 'bg-[#E3E9F2]', className)} role="progressbar"
      aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {ok
        ? <m.div className={fill} initial={{ width: 0 }} whileInView={{ width: `${v}%` }} viewport={{ once: true }}
            transition={{ duration: 1, ease: EASE_OUT, delay: 0.1 }} />
        : <div className={fill} style={{ width: `${v}%` }} />}
    </div>
  )
}

export function ReadinessRing({ pct, buildable, size = 64 }) {
  const ok = useMotionOK()
  const dark = useSurface() === 'dark'
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, pct || 0))
  const color = buildable ? '#10B981' : v >= 60 ? '#F59E0B' : '#EF4444'
  const target = c * (1 - v / 100)
  const ring = { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, strokeWidth: 7, strokeLinecap: 'round', strokeDasharray: c }
  return (
    <div className="relative flex-none" style={{ width: size, height: size }} role="img" aria-label={`${v}% of components available${buildable ? ', buildable now' : ''}`}>
      <svg width={size} height={size} className="-rotate-90" style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? 'rgb(255 255 255 / 0.12)' : '#E3E9F2'} strokeWidth="7" />
        {ok
          ? <m.circle {...ring} initial={{ strokeDashoffset: c }} whileInView={{ strokeDashoffset: target }} viewport={{ once: true }}
              transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.15 }} />
          : <circle {...ring} strokeDashoffset={target} />}
      </svg>
      <span className={cx('num absolute inset-0 flex items-center justify-center text-sm font-semibold', dark && 'text-white')}>{v}%</span>
    </div>
  )
}

// ------------------------------------------------------------------ Tabs
/** Underlined tabs. The underline slides between tabs in the student portal. */
export function Tabs({ tabs, value, onChange, className }) {
  const ok = useMotionOK()
  const dark = useSurface() === 'dark'
  const box = useRef(null)
  const first = useRef(true)
  const [ind, setInd] = useState(null)
  const sig = tabs.map((t) => `${t.value}:${t.count ?? ''}`).join('|')

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return undefined
    const measure = () => {
      const a = el.querySelector('[role="tab"][aria-selected="true"]')
      setInd(a ? { x: a.offsetLeft, w: a.offsetWidth } : null)
      // Keep the active tab visible when the row scrolls sideways on a phone.
      if (a && (a.offsetLeft < el.scrollLeft || a.offsetLeft + a.offsetWidth > el.scrollLeft + el.clientWidth)) {
        el.scrollLeft = Math.max(0, a.offsetLeft - 16)
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, sig])
  useLayoutEffect(() => { if (ind) first.current = false }, [ind])

  return (
    <div ref={box} role="tablist"
      className={cx('relative flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        dark ? 'border-white/10' : 'border-line', className)}>
      {tabs.map((t) => {
        const on = value === t.value
        return (
          <button key={t.value} role="tab" aria-selected={on} onClick={() => onChange(t.value)}
            className={cx('relative inline-flex min-h-11 flex-none items-center gap-2 rounded-t-lg px-3.5 text-sm font-semibold transition-colors',
              on ? (dark ? 'text-white' : 'text-ink') : (dark ? 'text-side-text hover:text-white' : 'text-muted hover:text-ink'),
              !ok && on && 'after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-full after:bg-cyan')}>
            {t.label}
            {t.count !== undefined && t.count !== null && (
              <span className={cx('num rounded-full px-1.5 py-px text-[11px] font-semibold',
                on ? 'bg-cyan-soft text-brand' : dark ? 'bg-white/10 text-side-text' : 'bg-slate-100 text-muted')}>{t.count}</span>
            )}
          </button>
        )
      })}
      {ok && (
        <m.span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-full bg-gradient-to-r from-cyan to-azure shadow-[0_0_12px_rgb(34_211_238/0.75)]"
          initial={false}
          animate={ind ? { x: ind.x + 8, width: Math.max(0, ind.w - 16), opacity: 1 } : { opacity: 0 }}
          transition={first.current ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }} />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Pagination
export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize))
  if (!total || pages <= 1) return total ? <p className="mt-5 text-sm text-muted"><span className="num">{total}</span> result{total === 1 ? '' : 's'}</p> : null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-sm text-muted">Showing <span className="num text-ink">{from}–{to}</span> of <span className="num text-ink">{total}</span></p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="px-1.5 text-sm font-medium">Page <span className="num">{page}</span> of <span className="num">{pages}</span></span>
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
    <span className={cx('inline-flex flex-none items-center justify-center rounded-full bg-gradient-to-br from-cyan to-azure font-display font-semibold text-night ring-2 ring-white/60',
      size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm', className)} aria-hidden>
      {initials}
    </span>
  )
}

// ------------------------------------------------------------------ Table
export function Table({ children, className }) {
  const admin = usePortal() === 'admin'
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className={cx('w-full min-w-[640px] border-collapse text-left text-sm',
        '[&_tbody_tr]:transition-colors', admin ? '[&_tbody_tr:hover]:bg-slate-50' : '[&_tbody_tr:hover]:bg-cyan/[.04]')}>{children}</table>
    </div>
  )
}
export function Th({ children, className, ...rest }) {
  return <th scope="col" className={cx('whitespace-nowrap border-b border-line bg-slate-50/90 px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[.07em] text-muted', className)} {...rest}>{children}</th>
}
export function Td({ children, className, ...rest }) {
  return <td className={cx('border-b border-line/80 px-4 py-3 align-middle', className)} {...rest}>{children}</td>
}
