import { useLayoutEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useQuery } from '../../hooks/useQuery'
import { report } from '../../lib/api'
import { formatDate, formatNumber } from '../../lib/format'
import { toCsv } from '../../lib/csv'
import { Avatar, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, Table, Td, Th, cx } from '../../components/ui/primitives'
import { Select } from '../../components/ui/forms'

// ------------------------------------------------------------------ Chart styling
// Light gridlines, muted axis text, numbers in JetBrains Mono. No chart animation in the admin console.
const GRID = '#E1E7EF'
const MUTED = '#526079'
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const TICK = { fontSize: 11.5, fill: MUTED }
const NUM_TICK = { fontSize: 11, fill: MUTED, fontFamily: MONO }

const INVENTORY = [
  { key: 'available', name: 'Available', color: '#10B981' },
  { key: 'reserved', name: 'Reserved', color: '#8B7CFF' },
  { key: 'borrowed', name: 'On loan', color: '#22D3EE' },
  { key: 'damaged', name: 'Damaged', color: '#F59E0B' },
  { key: 'lost', name: 'Lost', color: '#EF4444' },
]
const DECISIONS = [
  { key: 'approved', name: 'Approved', color: '#10B981' },
  { key: 'rejected', name: 'Rejected', color: '#EF4444' },
  { key: 'cancelled', name: 'Cancelled', color: '#94A3B8' },
]
const LOAN = { key: 'units_on_loan', name: 'Units on loan', color: '#0E7490' }
const colorsOf = (series) => Object.fromEntries(series.map((s) => [s.key, s.color]))

function download(name, rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Width of an element, kept current with a ResizeObserver (charts adapt their axes to it). */
function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    setWidth(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** Colour key for a multi-series chart. */
function Key({ series }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
          <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  )
}

/** Tooltip card: label on top, one row per series with its colour, name and value. */
function ChartTip({ active, payload, label, colors = {} }) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[164px] rounded-lg border border-line bg-white px-3 py-2.5 text-[13px] shadow-[0_10px_28px_-10px_rgb(11_19_36/0.28)]">
      <p className="mb-1.5 max-w-[240px] font-semibold leading-snug text-ink">{label}</p>
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={p.dataKey} className="flex items-center gap-2">
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: colors[p.dataKey] || p.color }} aria-hidden />
            <span className="flex-1 text-muted">{p.name}</span>
            <span className={cx('num pl-3 font-semibold', Number(p.value) ? 'text-ink' : 'text-subtle')}>{formatNumber(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Horizontal stacked segment: a hairline gap from its neighbours, round corners only on the row's last filled segment. */
function stackSegment(keys, i) {
  const after = keys.slice(i + 1)
  return function Segment({ x, y, width, height, fill, payload }) {
    if (!(width > 0) || !(height > 0)) return null
    const r = after.every((k) => !Number(payload?.[k])) ? Math.min(4, width, height / 2) : 0
    const e = x + width
    const d = `M${x},${y}H${e - r}Q${e},${y} ${e},${y + r}V${y + height - r}Q${e},${y + height} ${e - r},${y + height}H${x}Z`
    return <path d={d} fill={fill} stroke="#fff" strokeWidth={1.5} />
  }
}

let measureCtx = null
/** Shortens a category name with an ellipsis so it fits the axis (12px Instrument Sans). */
function fitLabel(text, max) {
  measureCtx ||= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text
  measureCtx.font = '12px "Instrument Sans", ui-sans-serif, sans-serif'
  if (measureCtx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && measureCtx.measureText(`${s}…`).width > max) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

function CategoryTick({ x, y, payload, maxWidth }) {
  const full = String(payload?.value ?? '')
  const short = fitLabel(full, maxWidth)
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={MUTED}>
      {short !== full && <title>{full}</title>}
      {short}
    </text>
  )
}

function InventoryChart({ data }) {
  const [ref, width] = useWidth()
  const axis = width < 480 ? 120 : width < 820 ? 150 : 180
  const keys = INVENTORY.map((s) => s.key)
  return (
    <div ref={ref} style={{ height: data.length * 32 + 34 }}>
      {width > 0 && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={NUM_TICK} tickLine={false} axisLine={false} tickMargin={6} />
            <YAxis type="category" dataKey="category" width={axis} interval={0} tickLine={false} axisLine={false}
              tick={<CategoryTick maxWidth={axis - 14} />} />
            <Tooltip content={<ChartTip colors={colorsOf(INVENTORY)} />} cursor={{ fill: '#EEF3F8' }} isAnimationActive={false} />
            {INVENTORY.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="s" name={s.name} fill={s.color} maxBarSize={20}
                shape={stackSegment(keys, i)} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Cards
function Panel({ title, q, name, legend, table = false, children, className }) {
  const has = !!q.data?.length
  const busy = q.loading && q.data !== undefined
  const state = q.error ? <ErrorState error={q.error} onRetry={q.refetch} />
    : q.isInitialLoading ? <SkeletonRows rows={4} />
    : !has ? <EmptyState title="No data yet" className="!py-8">This fills in as the lab is used.</EmptyState> : null
  return (
    <Card padded={false} className={cx('flex flex-col', table && 'overflow-hidden', className)} aria-busy={busy || undefined}>
      <div className="px-5 pb-3.5 pt-4">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <h2 className="min-w-0 text-[15px] font-semibold leading-snug">{title}</h2>
          {has && <Button size="sm" variant="outline" icon={Download} className="flex-none" onClick={() => download(name, q.data)}>CSV</Button>}
        </div>
        {legend && has && <div className="mt-1.5">{legend}</div>}
      </div>
      <div className={cx('min-w-0 flex-1', !table && 'px-5 pb-5', busy && 'opacity-60')}>{state || children(q.data)}</div>
    </Card>
  )
}

/** Table inside a card: full-bleed, sized to its content, scrolling sideways only inside itself. */
function TopTable({ children }) {
  return <Table className="border-t border-line [&>table]:min-w-0 [&_tbody_tr:last-child_td]:border-b-0">{children}</Table>
}
const NUM_TH = 'text-right max-sm:px-3'
const NUM_TD = 'num text-right font-medium max-sm:px-3'

/** Ranked name cell with a slim bar showing the value against the list's top value. */
function RankCell({ rank, name, parts, max }) {
  const total = parts.reduce((a, p) => a + (Number(p.value) || 0), 0)
  return (
    <Td className="max-sm:px-3">
      <div className="flex min-w-[150px] items-start gap-3">
        <span className="num mt-px w-5 flex-none text-right text-xs font-medium text-subtle">{String(rank).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium leading-snug text-ink">{name}</p>
          {max > 0 && (
            <div className="mt-1.5 h-1 max-w-[240px] overflow-hidden rounded-full bg-[#EDF1F6]" aria-hidden>
              <div className="flex h-full gap-px" style={{ width: `${Math.max(3, (total / max) * 100)}%` }}>
                {parts.filter((p) => Number(p.value) > 0).map((p, i) => (
                  <span key={i} className={cx('h-full first:rounded-l-full last:rounded-r-full', p.className)} style={{ flexGrow: Number(p.value) }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Td>
  )
}
const maxOf = (rows, fn) => rows.reduce((m, r) => Math.max(m, fn(r)), 0)

// ------------------------------------------------------------------ Page
export default function AdminReports() {
  const [days, setDays] = useState(90)
  const byCat = useQuery(() => report('inventory_by_category'), [])
  const borrowed = useQuery(() => report('most_borrowed', { p_days: days, p_limit: 10 }), [days])
  const requested = useQuery(() => report('frequently_requested', { p_days: days, p_limit: 10 }), [days])
  const damaged = useQuery(() => report('damaged_lost'), [])
  const projects = useQuery(() => report('popular_projects', { p_days: days, p_limit: 10 }), [days])
  const users = useQuery(() => report('most_active_users', { p_days: days, p_limit: 10 }), [days])
  const usage = useQuery(() => report('usage_over_time', { p_weeks: 12 }), [])
  const history = useQuery(() => report('request_history', { p_weeks: 12 }), [])

  return (
    <div>
      <PageHeader title="Reports" subtitle="Calculated from live data. Export any table as CSV."
        actions={<Select aria-label="Period" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="min-w-[168px]"
          options={[{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }]} />} />

      <div className="space-y-5">
        <Panel title="Inventory by category" q={byCat} name="inventory-by-category" legend={<Key series={INVENTORY} />}>
          {(d) => <InventoryChart data={d} />}
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Units on loan (weekly)" q={usage} name="usage-over-time">
            {(d) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.map((x) => ({ ...x, label: formatDate(x.week_end).slice(0, 6) }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="reports-loan-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#22D3EE" stopOpacity={0.32} />
                        <stop offset="1" stopColor="#22D3EE" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} tickMargin={8} minTickGap={18} />
                    <YAxis allowDecimals={false} tick={NUM_TICK} tickLine={false} axisLine={false} width={36} />
                    <Tooltip content={<ChartTip colors={colorsOf([LOAN])} />} cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }} isAnimationActive={false} />
                    <Area type="monotone" dataKey={LOAN.key} name={LOAN.name} stroke={LOAN.color} strokeWidth={2} fill="url(#reports-loan-fill)"
                      dot={false} activeDot={{ r: 4.5, fill: LOAN.color, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel title="Request decisions (weekly)" q={history} name="request-history" legend={<Key series={DECISIONS} />}>
            {(d) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.map((x) => ({ ...x, label: formatDate(x.week_start).slice(0, 6) }))} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                    barGap={3} barCategoryGap="22%">
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} tickMargin={8} minTickGap={12} />
                    <YAxis allowDecimals={false} tick={NUM_TICK} tickLine={false} axisLine={false} width={36} />
                    <Tooltip content={<ChartTip colors={colorsOf(DECISIONS)} />} cursor={{ fill: '#EEF3F8' }} isAnimationActive={false} />
                    {DECISIONS.map((s) => (
                      <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <Panel title="Most borrowed components" q={borrowed} name="most-borrowed" table>
            {(d) => {
              const max = maxOf(d, (r) => Number(r.units) || 0)
              return (
                <TopTable>
                  <thead><tr><Th className="max-sm:px-3">Component</Th><Th className={NUM_TH}>Units</Th><Th className={NUM_TH}>Loans</Th></tr></thead>
                  <tbody>{d.map((r, i) => (
                    <tr key={r.item_id}>
                      <RankCell rank={i + 1} name={r.item_name} max={max} parts={[{ value: r.units, className: 'bg-cyan' }]} />
                      <Td className={NUM_TD}>{r.units}</Td><Td className={cx(NUM_TD, 'text-muted')}>{r.loans}</Td>
                    </tr>
                  ))}</tbody>
                </TopTable>
              )
            }}
          </Panel>

          <Panel title="Most requested components" q={requested} name="frequently-requested" table>
            {(d) => {
              const max = maxOf(d, (r) => Number(r.requests) || 0)
              return (
                <TopTable>
                  <thead><tr><Th className="max-sm:px-3">Component</Th><Th className={NUM_TH}>Requests</Th><Th className={NUM_TH}>Units asked</Th><Th className={NUM_TH}>Available now</Th></tr></thead>
                  <tbody>{d.map((r, i) => (
                    <tr key={r.item_id}>
                      <RankCell rank={i + 1} name={r.item_name} max={max} parts={[{ value: r.requests, className: 'bg-azure' }]} />
                      <Td className={NUM_TD}>{r.requests}</Td>
                      <Td className={cx(NUM_TD, 'text-muted')}>{r.units_requested}</Td>
                      <Td className={cx(NUM_TD, Number(r.available_now) > 0 ? 'text-ink' : 'text-bad')}>{r.available_now}</Td>
                    </tr>
                  ))}</tbody>
                </TopTable>
              )
            }}
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Damaged and lost stock" q={damaged} name="damaged-lost" table>
            {(d) => {
              const max = maxOf(d, (r) => (Number(r.damaged) || 0) + (Number(r.lost) || 0))
              return (
                <TopTable>
                  <thead><tr><Th className="max-sm:px-3">Component</Th><Th className={NUM_TH}>Damaged</Th><Th className={NUM_TH}>Lost</Th></tr></thead>
                  <tbody>{d.map((r, i) => (
                    <tr key={r.item_id}>
                      <RankCell rank={i + 1} name={r.item_name} max={max}
                        parts={[{ value: r.damaged, className: 'bg-warn-solid' }, { value: r.lost, className: 'bg-bad-solid' }]} />
                      <Td className={cx(NUM_TD, Number(r.damaged) ? 'text-warn' : 'text-subtle')}>{r.damaged}</Td>
                      <Td className={cx(NUM_TD, Number(r.lost) ? 'text-bad' : 'text-subtle')}>{r.lost}</Td>
                    </tr>
                  ))}</tbody>
                </TopTable>
              )
            }}
          </Panel>

          <Panel title="Most requested projects" q={projects} name="popular-projects" table>
            {(d) => {
              const max = maxOf(d, (r) => Number(r.requests) || 0)
              return (
                <TopTable>
                  <thead><tr><Th className="max-sm:px-3">Project</Th><Th className={NUM_TH}>Requests</Th></tr></thead>
                  <tbody>{d.map((r, i) => (
                    <tr key={r.project_id}>
                      <RankCell rank={i + 1} name={r.project_name} max={max} parts={[{ value: r.requests, className: 'bg-iris' }]} />
                      <Td className={NUM_TD}>{r.requests}</Td>
                    </tr>
                  ))}</tbody>
                </TopTable>
              )
            }}
          </Panel>
        </div>

        <Panel title="Most active users" q={users} name="active-users" table>
          {(d) => (
            <TopTable>
              <thead><tr><Th className="max-sm:px-3">User</Th><Th className="max-sm:px-3">Email</Th><Th className={NUM_TH}>Requests</Th><Th className={NUM_TH}>Loans</Th></tr></thead>
              <tbody>{d.map((r) => (
                <tr key={r.user_id}>
                  <Td className="max-sm:px-3">
                    <div className="flex min-w-[150px] items-center gap-3">
                      <Avatar name={r.full_name} size="sm" />
                      <span className="min-w-0 break-words font-medium text-ink">{r.full_name}</span>
                    </div>
                  </Td>
                  <Td className="text-muted max-sm:px-3">{r.email}</Td>
                  <Td className={NUM_TD}>{r.requests}</Td>
                  <Td className={cx(NUM_TD, 'text-muted')}>{r.loans}</Td>
                </tr>
              ))}</tbody>
            </TopTable>
          )}
        </Panel>
      </div>
    </div>
  )
}
