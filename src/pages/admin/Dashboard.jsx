import { Activity, ArrowRight, AlertTriangle, Boxes, CheckCircle2, ClipboardCheck, Clock, PackageCheck, PackageOpen, TrendingUp, Undo2, Wrench } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useAuth } from '../../context/AuthContext'
import { dashboardStats, listActivity, listInventory, listRequests, openBorrowingLines, report } from '../../lib/api'
import { formatDate, formatNumber, timeAgo } from '../../lib/format'
import { Avatar, Badge, Button, Card, ErrorState, PageHeader, Skeleton, SkeletonRows, StatCard, Table, Td, Th, cx } from '../../components/ui/primitives'
import { StockBadge } from '../../components/domain/badges'

// Chart colours from the design tokens (recharts needs literal values).
const C = { line: '#0E7490', fill: '#22D3EE', grid: '#E1E7EF', tick: '#526079', ink: '#0B1324', mono: '"JetBrains Mono", ui-monospace, monospace' }

const CHIP = {
  brand: 'bg-cyan-soft text-brand',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  none: 'bg-slate-100 text-muted',
}

/** A figure inside a sentence: monospace, a touch darker than the text around it. */
function N({ children }) {
  return <span className="num font-medium text-ink">{children}</span>
}

/** Request codes inside activity summaries in monospace. */
function WithCodes({ text }) {
  return String(text ?? '').split(/([A-Z]{2,}-\d+)/).map((part, i) => (i % 2 ? <span key={i} className="num font-medium">{part}</span> : part))
}

/** White card with a header row: tinted icon chip, title and a link to the full page. */
function Panel({ title, icon: Icon, tone = 'brand', action, className, children }) {
  return (
    <Card padded={false} className={cx('overflow-hidden', className)}>
      <div className="flex min-h-[60px] items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold leading-snug">
          {Icon && (
            <span className={cx('inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg', CHIP[tone])} aria-hidden>
              <Icon className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

function PanelLink({ to, children }) {
  return <Button to={to} variant="link" size="sm" className="-mr-2 flex-none">{children} <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden /></Button>
}

function AllClear({ children }) {
  return (
    <li className="flex items-center justify-center gap-2 px-5 py-7 text-center text-sm text-muted">
      <CheckCircle2 className="h-4 w-4 flex-none text-ok-solid" aria-hidden />{children}
    </li>
  )
}

export default function AdminDashboard() {
  const { isSuperAdmin } = useAuth()
  // Super Admins see the approval queue; Admins see what is approved and ready to issue.
  const queue = isSuperAdmin ? 'pending' : 'approved'
  const stats = useQuery(() => dashboardStats(), [])
  const pending = useQuery(() => listRequests({ status: queue, pageSize: 6 }), [queue])
  const low = useQuery(() => listInventory({ sort: 'low', pageSize: 8, stock: '' }), [])
  const overdue = useQuery(() => openBorrowingLines(), [])
  const usage = useQuery(() => report('usage_over_time', { p_weeks: 12 }), [])
  const activity = useQuery(() => listActivity({ pageSize: 8 }), [])
  useRealtime(['inventory_items', 'borrow_requests', 'borrowings', 'return_records', 'enquiries', 'takeaway_requests'], () => {
    stats.refetch(); pending.refetch(); low.refetch(); overdue.refetch(); activity.refetch()
  })

  const s = stats.data || {}
  const lowRows = (low.data?.data || []).filter((i) => i.stock_status !== 'in_stock')
  const overdueRows = (overdue.data || []).filter((l) => l.is_overdue)
  const pendingRows = pending.data?.data || []
  const fulfil = (r) => (r.can_fulfil ? <Badge tone="ok" dot>Can fulfil</Badge> : <Badge tone="bad" dot>Short</Badge>)
  const items = (r) => <><span className="num">{r.item_count}</span> types · <span className="num">{r.total_units}</span> units</>

  return (
    <div>
      <PageHeader eyebrow={isSuperAdmin ? 'Super Admin console' : 'Admin console'} title="Lab overview" subtitle="Live figures from inventory, requests and loans."
        actions={<><Button to="/admin/requests" icon={ClipboardCheck}>{isSuperAdmin ? 'Review requests' : 'Issue requests'}</Button><Button to="/admin/inventory" variant="outline" icon={Boxes}>Inventory</Button></>} />
      {stats.error && <Card className="mb-5"><ErrorState error={stats.error} onRetry={stats.refetch} /></Card>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total units" value={formatNumber(s.total_units)} hint={<><N>{formatNumber(s.item_types)}</N> item types</>} icon={Boxes} accent="brand" loading={stats.isInitialLoading} to="/admin/inventory" />
        <StatCard label="Available" value={formatNumber(s.available)} hint={<><N>{formatNumber(s.reserved)}</N> reserved</>} icon={PackageOpen} accent="ok" loading={stats.isInitialLoading} />
        <StatCard label="On loan" value={formatNumber(s.borrowed)} hint={<><N>{formatNumber(s.active_borrowings)}</N> active loans</>} icon={PackageCheck} accent="cyan" loading={stats.isInitialLoading} to="/admin/issuance" />
        {isSuperAdmin
          ? <StatCard label="Pending requests" value={formatNumber(s.pending_requests)} hint={<><N>{formatNumber(s.approved_awaiting)}</N> awaiting issue · <N>{formatNumber(s.pending_takeaways)}</N> take-away to approve</>} icon={ClipboardCheck} accent="warn" loading={stats.isInitialLoading} to="/admin/requests" />
          : <StatCard label="Ready to issue" value={formatNumber(s.approved_awaiting)} hint={<><N>{formatNumber(s.open_enquiries)}</N> open enquiries · <N>{formatNumber(s.takeaways_awaiting_document)}</N> letters to collect</>} icon={ClipboardCheck} accent="warn" loading={stats.isInitialLoading} to="/admin/requests?status=approved" />}
        <StatCard label="Overdue" value={formatNumber(s.overdue_lines)} hint={<><N>{formatNumber(s.overdue_units)}</N> units · <N>{formatNumber(s.returns_to_verify)}</N> returns to verify</>} icon={Clock} accent="bad" loading={stats.isInitialLoading} to="/admin/issuance" />
        <StatCard label="Damaged / lost" value={`${formatNumber(s.damaged)} / ${formatNumber(s.lost)}`} hint={<><N>{formatNumber(s.low_stock)}</N> items low on stock</>} icon={Wrench} accent="none" loading={stats.isInitialLoading} to="/admin/reports" />
      </div>

      {/* Two independent columns on wide screens; on narrower screens one column ordered by urgency. */}
      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
          <Panel className="order-1" title={isSuperAdmin ? 'Pending requests' : 'Ready to issue'} icon={ClipboardCheck} action={<PanelLink to={isSuperAdmin ? '/admin/requests' : '/admin/requests?status=approved'}>{isSuperAdmin ? 'Open queue' : 'Open list'}</PanelLink>}>
            {pending.error ? <ErrorState error={pending.error} onRetry={pending.refetch} />
              : pending.isInitialLoading ? <SkeletonRows rows={3} />
              : (
                <>
                  <Table className="hidden md:block [&>table]:min-w-[520px] [&_tbody_tr:last-child>td]:border-b-0">
                    <thead><tr><Th className="pl-5">Request</Th><Th>Student</Th><Th>Items</Th><Th className="pr-5">Stock</Th></tr></thead>
                    <tbody>
                      {pendingRows.map((r) => (
                        <tr key={r.id}>
                          <Td className="whitespace-nowrap pl-5">
                            <span className="num text-[13px] font-semibold">{r.request_code}</span>
                            <p className="mt-0.5 text-xs text-muted">{timeAgo(r.created_at)}</p>
                          </Td>
                          <Td>
                            <div className="flex max-w-[18rem] items-center gap-3">
                              <Avatar name={r.requester_name} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-medium">{r.requester_name}</p>
                                <p className="truncate text-xs text-muted">{r.project_name || r.purpose}</p>
                              </div>
                            </div>
                          </Td>
                          <Td className="whitespace-nowrap text-[13px]">{items(r)}</Td>
                          <Td className="pr-5">{fulfil(r)}</Td>
                        </tr>
                      ))}
                      {pending.data && pendingRows.length === 0 && <tr><Td colSpan={4} className="py-10 text-center text-muted">{isSuperAdmin ? 'No pending requests. Nice and quiet.' : 'Nothing waiting to be issued.'}</Td></tr>}
                    </tbody>
                  </Table>
                  <ul className="divide-y divide-line md:hidden">
                    {pendingRows.map((r) => (
                      <li key={r.id} className="flex items-start gap-3 px-5 py-3.5 text-sm">
                        <Avatar name={r.requester_name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 break-words font-medium leading-snug">{r.requester_name}</p>
                            {fulfil(r)}
                          </div>
                          <p className="truncate text-xs text-muted">{r.project_name || r.purpose}</p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                            <span className="num text-[12.5px] font-semibold text-ink">{r.request_code}</span>
                            <span>{timeAgo(r.created_at)}</span>
                            <span className="text-ink">{items(r)}</span>
                          </p>
                        </div>
                      </li>
                    ))}
                    {pending.data && pendingRows.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">{isSuperAdmin ? 'No pending requests. Nice and quiet.' : 'Nothing waiting to be issued.'}</li>}
                  </ul>
                </>
              )}
          </Panel>

          <Panel className="order-4" title="Recent activity" icon={Activity} tone="none" action={<PanelLink to="/admin/activity">Activity log</PanelLink>}>
            {activity.isInitialLoading ? <SkeletonRows rows={4} /> : (
              <ul className="px-5 py-2">
                {(activity.data?.data || []).map((a) => (
                  <li key={a.id} className="relative flex gap-3 py-2.5 text-sm before:absolute before:bottom-[-11px] before:left-[3.5px] before:top-[22px] before:w-px before:bg-line-strong/70 last:before:hidden">
                    <span className="mt-[6px] h-2 w-2 flex-none rounded-full bg-cyan ring-[3px] ring-cyan-soft" aria-hidden />
                    <p className="min-w-0 flex-1 break-words leading-snug"><WithCodes text={a.summary} /></p>
                    <span className="whitespace-nowrap pt-px text-xs text-muted">{timeAgo(a.created_at)}</span>
                  </li>
                ))}
                {activity.data && activity.data.data.length === 0 && <li className="py-6 text-center text-sm text-muted">No activity yet.</li>}
              </ul>
            )}
          </Panel>
        </div>

        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
          <Panel className="order-2" title="Overdue loans" icon={Undo2} tone="bad" action={<PanelLink to="/admin/issuance">Returns</PanelLink>}>
            {overdue.isInitialLoading ? <SkeletonRows rows={2} /> : (
              <ul className="divide-y divide-line">
                {overdueRows.slice(0, 6).map((l) => (
                  <li key={l.line_id} className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{l.borrower_name}</p>
                      <p className="truncate text-xs text-muted">{l.item_name} × <span className="num">{l.qty_issued}</span></p>
                    </div>
                    <Badge tone="bad" dot><span><span className="num">{l.days_overdue}</span> d late</span></Badge>
                  </li>
                ))}
                {overdue.data && overdueRows.length === 0 && <AllClear>No overdue loans.</AllClear>}
              </ul>
            )}
          </Panel>

          <Panel className="order-3" title="Low and out of stock" icon={AlertTriangle} tone="warn" action={<PanelLink to="/admin/inventory?stock=low_stock">Inventory</PanelLink>}>
            {low.isInitialLoading ? <SkeletonRows rows={4} /> : (
              <ul className="divide-y divide-line">
                {lowRows.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-slate-50">
                    <span className="min-w-0 flex-1 break-words font-medium leading-snug">{i.name}</span>
                    <span className="num min-w-[4.5rem] whitespace-nowrap text-right text-xs text-muted"><span className="font-semibold text-ink">{i.available_qty}</span> / {i.total_qty}</span>
                    <StockBadge status={i.stock_status} />
                  </li>
                ))}
                {low.data && lowRows.length === 0 && <AllClear>Everything is well stocked.</AllClear>}
              </ul>
            )}
          </Panel>

          <Panel className="order-5" title="Units on loan · last 12 weeks" icon={TrendingUp}>
            <div className="px-3 pb-3 pt-4">
              {usage.data && (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={usage.data.map((d) => ({ ...d, label: formatDate(d.week_end).slice(0, 6) }))} margin={{ left: -14, right: 10, top: 6, bottom: 0 }}>
                      <defs><linearGradient id="loan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.fill} stopOpacity={0.3} /><stop offset="1" stopColor={C.fill} stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.tick }} tickLine={false} axisLine={{ stroke: C.grid }} tickMargin={8} minTickGap={16} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.tick, fontFamily: C.mono }} tickLine={false} axisLine={false} />
                      <Tooltip isAnimationActive={false} formatter={(v) => [v, 'Units on loan']}
                        cursor={{ stroke: '#CBD5E1', strokeDasharray: '3 3' }}
                        contentStyle={{ borderRadius: 10, border: `1px solid ${C.grid}`, boxShadow: '0 10px 24px -14px rgb(11 19 36 / 0.35)', padding: '8px 12px', fontSize: 12 }}
                        labelStyle={{ color: C.tick, marginBottom: 2 }} itemStyle={{ color: C.ink, fontFamily: C.mono, padding: 0 }} />
                      <Area type="monotone" dataKey="units_on_loan" stroke={C.line} strokeWidth={2} fill="url(#loan)" isAnimationActive={false}
                        activeDot={{ r: 4, fill: C.line, stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {usage.isInitialLoading && <Skeleton className="h-56" />}
              {usage.error && <ErrorState error={usage.error} />}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
