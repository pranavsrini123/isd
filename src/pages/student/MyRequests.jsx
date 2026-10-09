import { useState } from 'react'
import { Check, ClipboardList, Package, Plus, Undo2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useSearchState } from '../../hooks/useSearchState'
import { cancelRequest, myBorrowingLines, myRequests, requestReturn } from '../../lib/api'
import { daysFromToday, formatDate, formatDateTime, relativeDue } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, Tabs, cx } from '../../components/ui/primitives'
import { ConfirmDialog } from '../../components/ui/Modal'
import { RequestStatusBadge } from '../../components/domain/badges'

const STATUS_TABS = ['all', 'pending', 'approved', 'issued', 'returned', 'rejected', 'cancelled']

export default function MyRequests() {
  const { profile } = useAuth()
  const toast = useToast()
  const [f, setF] = useSearchState({ tab: 'all' })
  const reqs = useQuery(() => myRequests(profile.id), [profile.id])
  const lines = useQuery(() => myBorrowingLines(profile.id), [profile.id])
  useRealtime(['borrow_requests', 'borrowings', 'return_records'], () => { reqs.refetch(); lines.refetch() })
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const all = reqs.data || []
  const counts = Object.fromEntries(STATUS_TABS.map((s) => [s, s === 'all' ? all.length : all.filter((r) => r.status === s).length]))
  const open = (lines.data || []).filter((l) => !l.is_verified)
  const rows = f.tab === 'all' ? all : all.filter((r) => r.status === f.tab)
  const latest = all[0]

  async function doCancel() {
    setBusy(true)
    try {
      await cancelRequest(confirm.id)
      toast.success(`Request ${confirm.request_code} cancelled`)
      setConfirm(null)
      reqs.refetch()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="My requests" subtitle="Your complete borrowing history, from request to return."
        actions={<Button to="/student/request" icon={Plus}>New request</Button>} />

      {latest && ['pending', 'approved', 'issued'].includes(latest.status) && <Tracker r={latest} />}

      <Tabs className="mb-5" value={f.tab} onChange={(tab) => setF({ tab })}
        tabs={[
          ...STATUS_TABS.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: counts[s] })),
          { value: 'borrowed', label: 'On loan', count: open.length },
        ]} />

      {f.tab === 'borrowed' ? (
        <BorrowedList lines={lines} onChanged={lines.refetch} />
      ) : reqs.error ? <Card><ErrorState error={reqs.error} onRetry={reqs.refetch} /></Card>
        : reqs.isInitialLoading ? <Card padded={false}><SkeletonRows /></Card>
        : rows.length === 0 ? (
          <Card><EmptyState icon={ClipboardList} title={f.tab === 'all' ? 'No requests yet' : `No ${f.tab} requests`}
            action={f.tab === 'all' && <Button to="/student/projects">Find a project to build</Button>}>
            {f.tab === 'all' ? 'When you request components they appear here with their status.' : 'Nothing in this list right now.'}
          </EmptyState></Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <Card key={r.id} className="!p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{r.request_code}</span>
                      <RequestStatusBadge status={r.status} />
                      {r.project_name && <Badge tone="neutral">{r.project_name}</Badge>}
                    </div>
                    <p className="mt-1.5 font-semibold">{(r.items || []).map((i) => `${i.name} × ${i.qty}`).join(', ')}</p>
                    <p className="mt-0.5 text-sm text-muted">{r.purpose}</p>
                    <p className="mt-1 text-xs text-muted">Submitted {formatDateTime(r.created_at)} · Needed {formatDate(r.needed_from)} – {formatDate(r.needed_until)}</p>
                    {r.status === 'rejected' && r.rejection_reason && (
                      <p className="mt-2 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad"><strong>Reason:</strong> {r.rejection_reason}</p>
                    )}
                    {r.status === 'approved' && <p className="mt-2 text-sm font-medium text-info">Approved — your parts are reserved. Collect them from the ISD Lab desk.</p>}
                    {r.status === 'issued' && r.due_date && <p className={cx('mt-2 text-sm font-medium', daysFromToday(r.due_date) < 0 ? 'text-bad' : 'text-teal')}>{relativeDue(r.due_date)} ({formatDate(r.due_date)})</p>}
                  </div>
                  {['pending', 'approved'].includes(r.status) && (
                    <Button variant="danger-outline" size="sm" onClick={() => setConfirm(r)}>Cancel request</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={doCancel} loading={busy}
        title={`Cancel ${confirm?.request_code}?`} confirmLabel="Cancel request" tone="danger">
        {confirm?.status === 'approved' ? 'The reserved parts will be released for other students.' : 'The lab administrator will no longer see this request.'}
      </ConfirmDialog>
    </div>
  )
}

function Tracker({ r }) {
  const steps = [
    ['Submitted', formatDateTime(r.created_at)],
    ['Admin review', r.status === 'pending' ? 'In progress' : `Approved ${formatDate(r.reviewed_at)}`],
    ['Issued', r.issued_at ? formatDate(r.issued_at) : `Planned ${formatDate(r.needed_from)}`],
    ['Returned', r.due_date ? `Due ${formatDate(r.due_date)}` : `Due ${formatDate(r.needed_until)}`],
  ]
  const done = { pending: 1, approved: 2, issued: 3 }[r.status]
  return (
    <Card className="mb-6">
      <p className="label-caps">Latest request</p>
      <p className="mt-1 font-semibold"><span className="font-mono">{r.request_code}</span>{r.project_name ? ` · ${r.project_name}` : ''}</p>
      <ol className="mt-5 grid gap-4 sm:grid-cols-4">
        {steps.map(([label, sub], i) => (
          <li key={label} className="flex items-start gap-3 sm:flex-col">
            <div className="flex items-center gap-2 sm:w-full">
              <span className={cx('flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-bold',
                i < done ? 'bg-ok text-white' : i === done ? 'bg-brand text-white ring-4 ring-brand/15' : 'bg-slate-100 text-muted')}>
                {i < done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cx('hidden h-0.5 flex-1 rounded sm:block', i < done ? 'bg-ok' : 'bg-line', i === 3 && 'invisible')} />
            </div>
            <div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted">{sub}</p></div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function BorrowedList({ lines, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  if (lines.error) return <Card><ErrorState error={lines.error} onRetry={lines.refetch} /></Card>
  if (lines.isInitialLoading) return <Card padded={false}><SkeletonRows /></Card>
  const open = (lines.data || []).filter((l) => !l.is_verified)
  const history = (lines.data || []).filter((l) => l.is_verified).slice(0, 20)
  // Group open lines by borrowing so "request return" is per loan.
  const groups = Object.values(open.reduce((acc, l) => {
    (acc[l.borrowing_id] ||= { ...l, lines: [] }).lines.push(l)
    return acc
  }, {}))

  async function ask(g) {
    setBusy(g.borrowing_id)
    try {
      await requestReturn(g.borrowing_id)
      toast.success('Return requested. Bring the parts to the lab desk for checking.')
      onChanged()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      {groups.length === 0 ? (
        <Card><EmptyState icon={Package} title="Nothing on loan">Components you borrow appear here with their due dates.</EmptyState></Card>
      ) : groups.map((g) => {
        const d = daysFromToday(g.due_date)
        return (
          <Card key={g.borrowing_id} className="!p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-medium">{g.request_code}</p>
                <p className={cx('mt-0.5 text-sm font-semibold', d < 0 ? 'text-bad' : d <= 2 ? 'text-warn' : 'text-teal')}>{relativeDue(g.due_date)} · {formatDate(g.due_date)}</p>
                <p className="text-xs text-muted">Issued {formatDate(g.issued_at)}</p>
              </div>
              {g.return_requested_at
                ? <Badge tone="info">Return requested {formatDate(g.return_requested_at)}</Badge>
                : <Button size="sm" variant="outline" icon={Undo2} loading={busy === g.borrowing_id} onClick={() => ask(g)}>Request return</Button>}
            </div>
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {g.lines.map((l) => <li key={l.line_id} className="flex justify-between py-2 text-sm"><span>{l.item_name}</span><span className="font-mono text-muted">× {l.qty_issued}</span></li>)}
            </ul>
          </Card>
        )
      })}
      {history.length > 0 && (
        <Card padded={false}>
          <h2 className="border-b border-line px-5 py-3.5 font-semibold">Returned</h2>
          <ul className="divide-y divide-line">
            {history.map((l) => (
              <li key={l.line_id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="flex-1">{l.item_name} × {l.qty_issued} <span className="font-mono text-xs text-muted">· {l.request_code}</span></span>
                <span className="text-xs text-muted">Verified {formatDate(l.verified_at)}</span>
                {l.qty_good > 0 && <Badge tone="ok">{l.qty_good} good</Badge>}
                {l.qty_damaged > 0 && <Badge tone="warn">{l.qty_damaged} damaged</Badge>}
                {l.qty_missing > 0 && <Badge tone="bad">{l.qty_missing} missing</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
