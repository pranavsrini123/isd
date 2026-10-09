import { useState } from 'react'
import { Download } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useQuery } from '../../hooks/useQuery'
import { report } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { Button, Card, EmptyState, ErrorState, PageHeader, SectionTitle, SkeletonRows, Table, Td, Th } from '../../components/ui/primitives'
import { Select } from '../../components/ui/forms'

const AXIS = { tick: { fontSize: 11, fill: '#556377' }, tickLine: false, axisLine: false }

/** CSV export of a report's rows. Values are quoted to survive commas. */
export function toCsv(rows) {
  if (!rows?.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return `"${safe.replace(/"/g, '""')}"`
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}
function download(name, rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function Panel({ title, q, name, children, className }) {
  return (
    <Card className={className}>
      <SectionTitle action={q.data?.length ? <Button size="sm" variant="ghost" icon={Download} onClick={() => download(name, q.data)}>CSV</Button> : null}>{title}</SectionTitle>
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.isInitialLoading ? <SkeletonRows rows={4} />
        : !q.data?.length ? <EmptyState title="No data yet" className="!py-8">This fills in as the lab is used.</EmptyState> : children(q.data)}
    </Card>
  )
}

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
        actions={<Select aria-label="Period" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}
          options={[{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }]} />} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Inventory by category" q={byCat} name="inventory-by-category" className="xl:col-span-2">
          {(d) => (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={d} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="category" {...AXIS} interval={0} />
                  <YAxis allowDecimals={false} {...AXIS} />
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="available" stackId="s" fill="#2563EB" name="Available" />
                  <Bar dataKey="reserved" stackId="s" fill="#93C5FD" name="Reserved" />
                  <Bar dataKey="borrowed" stackId="s" fill="#22D3EE" name="On loan" />
                  <Bar dataKey="damaged" stackId="s" fill="#F59E0B" name="Damaged" />
                  <Bar dataKey="lost" stackId="s" fill="#DC2626" name="Lost" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Units on loan (weekly)" q={usage} name="usage-over-time">
          {(d) => (
            <div className="h-60"><ResponsiveContainer>
              <LineChart data={d.map((x) => ({ ...x, label: formatDate(x.week_end).slice(0, 6) }))} margin={{ left: -16, right: 8 }}>
                <CartesianGrid stroke="#E2E8F0" vertical={false} /><XAxis dataKey="label" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} /><Tooltip />
                <Line type="monotone" dataKey="units_on_loan" name="Units on loan" stroke="#2563EB" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer></div>
          )}
        </Panel>
        <Panel title="Request decisions (weekly)" q={history} name="request-history">
          {(d) => (
            <div className="h-60"><ResponsiveContainer>
              <BarChart data={d.map((x) => ({ ...x, label: formatDate(x.week_start).slice(0, 6) }))} margin={{ left: -16, right: 8 }}>
                <CartesianGrid stroke="#E2E8F0" vertical={false} /><XAxis dataKey="label" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="approved" fill="#15803D" name="Approved" /><Bar dataKey="rejected" fill="#DC2626" name="Rejected" /><Bar dataKey="cancelled" fill="#94A3B8" name="Cancelled" />
              </BarChart>
            </ResponsiveContainer></div>
          )}
        </Panel>
        <Panel title="Most borrowed components" q={borrowed} name="most-borrowed">
          {(d) => <Table><thead><tr><Th>Component</Th><Th className="text-right">Units</Th><Th className="text-right">Loans</Th></tr></thead>
            <tbody>{d.map((r) => <tr key={r.item_id}><Td>{r.item_name}</Td><Td className="text-right font-mono">{r.units}</Td><Td className="text-right font-mono">{r.loans}</Td></tr>)}</tbody></Table>}
        </Panel>
        <Panel title="Most requested components" q={requested} name="frequently-requested">
          {(d) => <Table><thead><tr><Th>Component</Th><Th className="text-right">Requests</Th><Th className="text-right">Units asked</Th><Th className="text-right">Available now</Th></tr></thead>
            <tbody>{d.map((r) => <tr key={r.item_id}><Td>{r.item_name}</Td><Td className="text-right font-mono">{r.requests}</Td><Td className="text-right font-mono">{r.units_requested}</Td><Td className="text-right font-mono">{r.available_now}</Td></tr>)}</tbody></Table>}
        </Panel>
        <Panel title="Damaged and lost stock" q={damaged} name="damaged-lost">
          {(d) => <Table><thead><tr><Th>Component</Th><Th className="text-right">Damaged</Th><Th className="text-right">Lost</Th></tr></thead>
            <tbody>{d.map((r) => <tr key={r.item_id}><Td>{r.item_name}</Td><Td className="text-right font-mono text-warn">{r.damaged}</Td><Td className="text-right font-mono text-bad">{r.lost}</Td></tr>)}</tbody></Table>}
        </Panel>
        <Panel title="Most requested projects" q={projects} name="popular-projects">
          {(d) => <Table><thead><tr><Th>Project</Th><Th className="text-right">Requests</Th></tr></thead>
            <tbody>{d.map((r) => <tr key={r.project_id}><Td>{r.project_name}</Td><Td className="text-right font-mono">{r.requests}</Td></tr>)}</tbody></Table>}
        </Panel>
        <Panel title="Most active users" q={users} name="active-users" className="xl:col-span-2">
          {(d) => <Table><thead><tr><Th>User</Th><Th>Email</Th><Th className="text-right">Requests</Th><Th className="text-right">Loans</Th></tr></thead>
            <tbody>{d.map((r) => <tr key={r.user_id}><Td>{r.full_name}</Td><Td className="text-muted">{r.email}</Td><Td className="text-right font-mono">{r.requests}</Td><Td className="text-right font-mono">{r.loans}</Td></tr>)}</tbody></Table>}
        </Panel>
      </div>
    </div>
  )
}
