import { ArrowRight, AlertTriangle, Boxes, ClipboardCheck, Clock, PackageCheck, PackageOpen, Undo2, Wrench } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { dashboardStats, listActivity, listInventory, listRequests, openBorrowingLines, report } from '../../lib/api'
import { formatDate, formatNumber, timeAgo } from '../../lib/format'
import { Badge, Button, Card, ErrorState, PageHeader, SectionTitle, StatCard, Table, Td, Th } from '../../components/ui/primitives'
import { StockBadge } from '../../components/domain/badges'

export default function AdminDashboard() {
  const stats = useQuery(() => dashboardStats(), [])
  const pending = useQuery(() => listRequests({ status: 'pending', pageSize: 6 }), [])
  const low = useQuery(() => listInventory({ sort: 'low', pageSize: 8, stock: '' }), [])
  const overdue = useQuery(() => openBorrowingLines(), [])
  const usage = useQuery(() => report('usage_over_time', { p_weeks: 12 }), [])
  const activity = useQuery(() => listActivity({ pageSize: 8 }), [])
  useRealtime(['inventory_items', 'borrow_requests', 'borrowings', 'return_records'], () => {
    stats.refetch(); pending.refetch(); low.refetch(); overdue.refetch(); activity.refetch()
  })

  const s = stats.data || {}
  const lowRows = (low.data?.data || []).filter((i) => i.stock_status !== 'in_stock')
  const overdueRows = (overdue.data || []).filter((l) => l.is_overdue)

  return (
    <div>
      <PageHeader eyebrow="Admin console" title="Lab overview" subtitle="Live figures from inventory, requests and loans."
        actions={<><Button to="/admin/requests" icon={ClipboardCheck}>Review requests</Button><Button to="/admin/inventory" variant="outline" icon={Boxes}>Inventory</Button></>} />
      {stats.error && <Card className="mb-5"><ErrorState error={stats.error} onRetry={stats.refetch} /></Card>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Total units" value={formatNumber(s.total_units)} hint={`${formatNumber(s.item_types)} item types`} icon={Boxes} accent="brand" loading={stats.isInitialLoading} to="/admin/inventory" />
        <StatCard label="Available" value={formatNumber(s.available)} hint={`${formatNumber(s.reserved)} reserved`} icon={PackageOpen} accent="ok" loading={stats.isInitialLoading} />
        <StatCard label="On loan" value={formatNumber(s.borrowed)} hint={`${formatNumber(s.active_borrowings)} active loans`} icon={PackageCheck} accent="cyan" loading={stats.isInitialLoading} to="/admin/issuance" />
        <StatCard label="Pending requests" value={formatNumber(s.pending_requests)} hint={`${formatNumber(s.approved_awaiting)} approved, awaiting issue`} icon={ClipboardCheck} accent="warn" loading={stats.isInitialLoading} to="/admin/requests" />
        <StatCard label="Overdue" value={formatNumber(s.overdue_lines)} hint={`${formatNumber(s.overdue_units)} units · ${formatNumber(s.returns_to_verify)} returns to verify`} icon={Clock} accent="bad" loading={stats.isInitialLoading} to="/admin/issuance" />
        <StatCard label="Damaged / lost" value={`${formatNumber(s.damaged)} / ${formatNumber(s.lost)}`} hint={`${formatNumber(s.low_stock)} items low on stock`} icon={Wrench} accent="none" loading={stats.isInitialLoading} to="/admin/reports" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="font-semibold">Pending requests</h2>
            <Button to="/admin/requests" variant="ghost" size="sm">Open queue <ArrowRight className="h-4 w-4" /></Button>
          </div>
          {pending.error ? <ErrorState error={pending.error} onRetry={pending.refetch} /> : (
            <Table>
              <thead><tr><Th>Request</Th><Th>Student</Th><Th>Items</Th><Th>Stock</Th></tr></thead>
              <tbody>
                {(pending.data?.data || []).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td><span className="font-mono text-[13px] font-medium">{r.request_code}</span><p className="text-xs text-muted">{timeAgo(r.created_at)}</p></Td>
                    <Td><p className="font-medium">{r.requester_name}</p><p className="text-xs text-muted">{r.project_name || r.purpose}</p></Td>
                    <Td className="text-[13px]">{r.item_count} types · {r.total_units} units</Td>
                    <Td>{r.can_fulfil ? <Badge tone="ok">Can fulfil</Badge> : <Badge tone="bad">Short</Badge>}</Td>
                  </tr>
                ))}
                {pending.data && pending.data.data.length === 0 && <tr><Td colSpan={4} className="py-10 text-center text-muted">No pending requests. Nice and quiet.</Td></tr>}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <SectionTitle>Units on loan · last 12 weeks</SectionTitle>
          <div className="h-56">
            {usage.data && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usage.data.map((d) => ({ ...d, label: formatDate(d.week_end).slice(0, 6) }))} margin={{ left: -20, right: 8, top: 8 }}>
                  <defs><linearGradient id="loan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2563EB" stopOpacity={0.35} /><stop offset="1" stopColor="#2563EB" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#556377' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#556377' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => [v, 'Units on loan']} />
                  <Area type="monotone" dataKey="units_on_loan" stroke="#2563EB" strokeWidth={2} fill="url(#loan)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {usage.error && <ErrorState error={usage.error} />}
          </div>
        </Card>

        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-warn" /> Low and out of stock</h2>
            <Button to="/admin/inventory?stock=low_stock" variant="ghost" size="sm">Inventory <ArrowRight className="h-4 w-4" /></Button>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {lowRows.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="flex-1 font-medium">{i.name}</span>
                <span className="font-mono text-xs text-muted">{i.available_qty} / {i.total_qty}</span>
                <StockBadge status={i.stock_status} />
              </li>
            ))}
            {low.data && lowRows.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted">Everything is well stocked.</li>}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card padded={false}>
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><Undo2 className="h-4 w-4 text-bad" /> Overdue loans</h2>
              <Button to="/admin/issuance" variant="ghost" size="sm">Returns <ArrowRight className="h-4 w-4" /></Button>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {overdueRows.slice(0, 6).map((l) => (
                <li key={l.line_id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 flex-1"><span className="font-medium">{l.borrower_name}</span><span className="text-muted"> · {l.item_name} × {l.qty_issued}</span></span>
                  <Badge tone="bad">{l.days_overdue} d late</Badge>
                </li>
              ))}
              {overdue.data && overdueRows.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">No overdue loans.</li>}
            </ul>
          </Card>
          <Card padded={false}>
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-semibold">Recent activity</h2>
              <Button to="/admin/activity" variant="ghost" size="sm">Activity log <ArrowRight className="h-4 w-4" /></Button>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {(activity.data?.data || []).map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-2.5 text-sm"><span className="flex-1">{a.summary}</span><span className="whitespace-nowrap text-xs text-muted">{timeAgo(a.created_at)}</span></li>
              ))}
              {activity.data && activity.data.data.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">No activity yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
