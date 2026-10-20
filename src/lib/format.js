// Formatting helpers shared by student and admin screens. Pure functions (tested).

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
})
const numFmt = new Intl.NumberFormat('en-IN')

/** Parses 'YYYY-MM-DD' as a local calendar date (no UTC shift). */
export function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(value) {
  const d = parseDate(value)
  return d ? dateFmt.format(d) : '—'
}

export function formatDateTime(value) {
  const d = parseDate(value)
  return d ? dateTimeFmt.format(d) : '—'
}

export function formatNumber(n) {
  return n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : numFmt.format(Number(n))
}

/** 'YYYY-MM-DD' for a local date. */
export function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(isoOrDate, n) {
  const d = parseDate(isoOrDate) ?? new Date()
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  return toISODate(copy)
}

/** Whole days from today to the date (negative = past). */
export function daysFromToday(value, today = new Date()) {
  const d = parseDate(value)
  if (!d) return null
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((d - t) / 86400000)
}

export function relativeDue(value, today = new Date()) {
  const n = daysFromToday(value, today)
  if (n === null) return '—'
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  if (n > 1) return `Due in ${n} days`
  if (n === -1) return '1 day overdue'
  return `${-n} days overdue`
}

export function timeAgo(value, now = new Date()) {
  const d = parseDate(value)
  if (!d) return ''
  const s = Math.max(0, Math.round((now - d) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const days = Math.round(h / 24)
  if (days < 30) return `${days} d ago`
  return formatDate(d)
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function pluralize(n, singular, plural = `${singular}s`) {
  return `${formatNumber(n)} ${n === 1 ? singular : plural}`
}

// ---- Status vocabularies --------------------------------------------------
export const REQUEST_STATUS = {
  pending:   { label: 'Pending',   tone: 'warn' },
  approved:  { label: 'Approved',  tone: 'info' },
  rejected:  { label: 'Rejected',  tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  issued:    { label: 'Issued',    tone: 'cyan' },
  returned:  { label: 'Returned',  tone: 'ok' },
}

export const STOCK_STATUS = {
  in_stock:     { label: 'In stock',     tone: 'ok' },
  low_stock:    { label: 'Low stock',    tone: 'warn' },
  out_of_stock: { label: 'Out of stock', tone: 'bad' },
}

export const DIFFICULTY = {
  beginner:     { label: 'Beginner',     tone: 'ok' },
  intermediate: { label: 'Intermediate', tone: 'info' },
  advanced:     { label: 'Advanced',     tone: 'bad' },
}

export function stockStatus(available, threshold) {
  if (available <= 0) return 'out_of_stock'
  if (available <= threshold) return 'low_stock'
  return 'in_stock'
}

export function readinessTone(pct, buildable) {
  if (buildable) return 'ok'
  if (pct >= 60) return 'warn'
  return 'bad'
}

export function hoursLabel(min, max) {
  if (min == null && max == null) return null
  if (min != null && max != null && Number(min) !== Number(max)) return `${Number(min)}–${Number(max)} h`
  return `${Number(min ?? max)} h`
}

/** Project availability status (computed by get_ranked_projects) → label and badge tone. */
export const AVAILABILITY = {
  available: { label: 'Available to build', short: 'Available', tone: 'ok' },
  partially_available: { label: 'Partially available', short: 'Partially available', tone: 'warn' },
  requires_external: { label: 'Requires external components', short: 'Needs external parts', tone: 'info' },
  temporarily_unavailable: { label: 'Temporarily unavailable', short: 'Unavailable', tone: 'bad' },
  requires_verification: { label: 'Requires compatibility verification', short: 'Needs verification', tone: 'neutral' },
}

export const DURATION_FILTERS = [
  { value: 'short', label: 'Up to 6 h' },
  { value: 'medium', label: '6–12 h' },
  { value: 'long', label: '12–24 h' },
  { value: 'xl', label: 'More than 24 h' },
]

/** Duration bucket from the upper estimate (falls back to the lower one). */
export function durationBucket(min, max) {
  const h = Number(max ?? min)
  if (max == null && min == null) return null
  if (h <= 6) return 'short'
  if (h <= 12) return 'medium'
  if (h <= 24) return 'long'
  return 'xl'
}
