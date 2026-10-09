import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, PackageCheck, Undo2 } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { listRequests, openBorrowingLines, recentReturns, verifyReturn } from '../../lib/api'
import { formatDate, formatDateTime, relativeDue } from '../../lib/format'
import { validateReturn } from '../../lib/validation'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, ErrorState, InlineError, PageHeader, SkeletonRows, Tabs, cx } from '../../components/ui/primitives'
import { SearchInput, Stepper, Textarea } from '../../components/ui/forms'
import { Modal } from '../../components/ui/Modal'
import { IssueModal } from './Requests'

export default function AdminIssuance() {
  const [tab, setTab] = useState('loans')
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const approved = useQuery(() => listRequests({ status: 'approved', pageSize: 100 }), [])
  const open = useQuery(() => openBorrowingLines(), [])
  const recent = useQuery(() => recentReturns(30), [])
  useRealtime(['borrow_requests', 'borrowings', 'return_records'], () => { approved.refetch(); open.refetch(); recent.refetch() })
  const [issuing, setIssuing] = useState(null)
  const [verifying, setVerifying] = useState(null)

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    const lines = (open.data || []).filter((l) =>
      (filter === 'all' || (filter === 'requested' && l.return_requested_at) || (filter === 'overdue' && l.is_overdue)) &&
      (!s || [l.borrower_name, l.borrower_email, l.request_code, l.item_name].some((v) => v?.toLowerCase().includes(s))))
    return Object.values(lines.reduce((acc, l) => { (acc[l.borrowing_id] ||= { ...l, lines: [] }).lines.push(l); return acc }, {}))
  }, [open.data, filter, q])
  const overdueCount = (open.data || []).filter((l) => l.is_overdue).length
  const requestedCount = new Set((open.data || []).filter((l) => l.return_requested_at).map((l) => l.borrowing_id)).size
  const approvedRows = approved.data?.data || []

  return (
    <div>
      <PageHeader title="Issue & returns" subtitle="Hand over approved requests and verify every returned part: good, damaged or missing." />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[
        { value: 'issue', label: 'Ready to issue', count: approvedRows.length },
        { value: 'loans', label: 'On loan / verify returns', count: new Set((open.data || []).map((l) => l.borrowing_id)).size },
        { value: 'recent', label: 'Recently verified' },
      ]} />

      {tab === 'issue' && (
        approved.error ? <Card><ErrorState error={approved.error} onRetry={approved.refetch} /></Card>
          : approved.isInitialLoading ? <Card padded={false}><SkeletonRows /></Card>
          : approvedRows.length === 0 ? <Card><EmptyState icon={PackageCheck} title="Nothing waiting to be issued">Approved requests appear here until the student collects them.</EmptyState></Card>
          : (
            <div className="grid gap-4 lg:grid-cols-2">
              {approvedRows.map((r) => (
                <Card key={r.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold">{r.request_code}</p>
                      <p className="font-medium">{r.requester_name}</p>
                      <p className="text-xs text-muted">Approved {formatDateTime(r.reviewed_at)} · needed {formatDate(r.needed_from)}</p>
                    </div>
                    <Button size="sm" icon={PackageCheck} onClick={() => setIssuing(r)}>Issue</Button>
                  </div>
                  <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
                    {(r.items || []).map((i) => <li key={i.item_id} className="flex justify-between py-1.5"><span>{i.name}</span><span className="font-mono">× {i.qty}</span></li>)}
                  </ul>
                </Card>
              ))}
            </div>
          )
      )}

      {tab === 'loans' && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[['all', 'All loans'], ['requested', `Return requested · ${requestedCount}`], ['overdue', `Overdue lines · ${overdueCount}`]].map(([v, l]) => (
                <button key={v} onClick={() => setFilter(v)} className={cx('rounded-full border px-3.5 py-1.5 text-sm font-medium', filter === v ? 'border-navy bg-navy text-white' : 'border-line bg-white hover:border-brand')}>{l}</button>
              ))}
            </div>
            <SearchInput className="w-full sm:w-72" value={q} onChange={setQ} placeholder="Student, code or item" />
          </div>
          {open.error ? <Card><ErrorState error={open.error} onRetry={open.refetch} /></Card>
            : open.isInitialLoading ? <Card padded={false}><SkeletonRows /></Card>
            : groups.length === 0 ? <Card><EmptyState icon={Undo2} title="No loans match">Everything issued has been returned and verified.</EmptyState></Card>
            : (
              <div className="space-y-4">
                {groups.map((g) => (
                  <Card key={g.borrowing_id} padded={false}>
                    <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
                      <span className="font-mono text-sm font-semibold">{g.request_code}</span>
                      <span className="font-medium">{g.borrower_name}</span>
                      <span className="text-xs text-muted">{g.borrower_srm_id || g.borrower_email}</span>
                      <span className="flex-1" />
                      {g.return_requested_at && <Badge tone="info">Return requested {formatDate(g.return_requested_at)}</Badge>}
                      <Badge tone={g.is_overdue ? 'bad' : 'neutral'}><Clock className="h-3 w-3" />{relativeDue(g.due_date)}</Badge>
                    </div>
                    <ul className="divide-y divide-line">
                      {g.lines.map((l) => (
                        <li key={l.line_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="flex-1 text-sm"><span className="font-medium">{l.item_name}</span> <span className="font-mono text-muted">× {l.qty_issued}</span></span>
                          <span className="text-xs text-muted">Issued {formatDate(l.issued_at)}</span>
                          <Button size="sm" variant="outline" icon={CheckCircle2} onClick={() => setVerifying(l)}>Verify return</Button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
        </>
      )}

      {tab === 'recent' && (
        <Card padded={false}>
          {recent.isInitialLoading ? <SkeletonRows /> : (recent.data || []).length === 0 ? <EmptyState icon={CheckCircle2} title="No verified returns yet" /> : (
            <ul className="divide-y divide-line">
              {recent.data.map((l) => (
                <li key={l.line_id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="flex-1"><span className="font-medium">{l.item_name} × {l.qty_issued}</span> <span className="text-muted">· {l.borrower_name} · <span className="font-mono">{l.request_code}</span></span></span>
                  {l.qty_good > 0 && <Badge tone="ok">{l.qty_good} good</Badge>}
                  {l.qty_damaged > 0 && <Badge tone="warn">{l.qty_damaged} damaged</Badge>}
                  {l.qty_missing > 0 && <Badge tone="bad">{l.qty_missing} missing</Badge>}
                  <span className="text-xs text-muted">{formatDateTime(l.verified_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {issuing && <IssueModal r={issuing} onClose={() => setIssuing(null)} onDone={() => { setIssuing(null); approved.refetch(); open.refetch() }} />}
      {verifying && <VerifyModal line={verifying} onClose={() => setVerifying(null)} onDone={() => { setVerifying(null); open.refetch(); recent.refetch() }} />}
    </div>
  )
}

function VerifyModal({ line, onClose, onDone }) {
  const toast = useToast()
  const [v, setV] = useState({ good: line.qty_issued, damaged: 0, missing: 0, notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const problem = validateReturn(v, line.qty_issued)
  async function submit() {
    if (problem) return setError(problem)
    if ((v.damaged || v.missing) && v.notes.trim().length < 3) return setError('Add a short note describing the damage or what is missing.')
    setSaving(true)
    try {
      await verifyReturn(line.line_id, v)
      toast.success(`Return verified: ${v.good} good${v.damaged ? `, ${v.damaged} damaged` : ''}${v.missing ? `, ${v.missing} missing` : ''}`)
      onDone()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const row = (key, label, tone, help) => (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line p-3">
      <div><p className={cx('text-sm font-semibold', tone)}>{label}</p><p className="text-xs text-muted">{help}</p></div>
      <Stepper value={v[key]} onChange={(n) => setV((s) => ({ ...s, [key]: n }))} min={0} max={line.qty_issued} label={label} />
    </div>
  )
  return (
    <Modal open onClose={onClose} title={`Verify return · ${line.item_name}`} description={`${line.borrower_name} · ${line.request_code} · ${line.qty_issued} issued`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving} disabled={!!problem}>Confirm verification</Button></>}>
      <div className="space-y-3">
        {row('good', 'Returned in good condition', 'text-ok', 'Goes back to available stock')}
        {row('damaged', 'Returned damaged', 'text-warn', 'Kept as damaged stock, not available')}
        {row('missing', 'Missing', 'text-bad', 'Recorded as lost; never counted as available')}
        <p className={cx('text-sm font-medium', problem ? 'text-bad' : 'text-ok')}>
          {v.good + v.damaged + v.missing} of {line.qty_issued} accounted for{problem ? '' : ' ✓'}
        </p>
        <Textarea label="Notes" hint={v.damaged || v.missing ? 'Required for damaged or missing parts' : 'Optional'} value={v.notes} maxLength={500} rows={2}
          onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} />
        <InlineError>{error}</InlineError>
        <p className="text-xs text-muted">Each line can only be verified once. Stock is updated immediately.</p>
      </div>
    </Modal>
  )
}
