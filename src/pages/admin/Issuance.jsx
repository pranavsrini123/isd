import { useMemo, useState } from 'react'
import { CalendarClock, Check, CheckCircle2, Clock, PackageCheck, Undo2, X } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { listExtensions, listRequests, openBorrowingLines, recentReturns, reviewLoanExtension, verifyReturn } from '../../lib/api'
import { useSearchState } from '../../hooks/useSearchState'
import { daysFromToday, formatDate, formatDateTime, relativeDue } from '../../lib/format'
import { validateReturn } from '../../lib/validation'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, ErrorState, IconTile, InlineError, PageHeader, SkeletonRows, Tabs, cx } from '../../components/ui/primitives'
import { SearchInput, Stepper, Textarea } from '../../components/ui/forms'
import { Modal } from '../../components/ui/Modal'
import { Thumb } from '../../components/domain/Thumb'
import { IssueModal } from './Requests'

/** Due state of a loan: red when overdue, amber when due within three days, green otherwise. */
function dueTone(due, overdue) {
  const d = daysFromToday(due)
  if (overdue || (d !== null && d < 0)) return 'bad'
  if (d !== null && d <= 3) return 'warn'
  return 'ok'
}
const ACCENT = { ok: 'bg-ok-solid', warn: 'bg-warn-solid', bad: 'bg-bad-solid' }

function DueBadge({ due, overdue }) {
  return (
    <span title={formatDate(due)} className="inline-flex">
      <Badge tone={dueTone(due, overdue)}><Clock className="h-3 w-3" aria-hidden />{relativeDue(due)}</Badge>
    </span>
  )
}

/** Small count pill used inside the loan filter chips. */
function Count({ n, active, tone }) {
  return (
    <span className={cx('num rounded-full px-1.5 py-px text-[11px] font-semibold',
      active ? 'bg-white/15 text-white' : n > 0 && tone ? tone : 'bg-slate-100 text-muted')}>{n}</span>
  )
}

export default function AdminIssuance() {
  const [sp, setSp] = useSearchState({ tab: 'loans' })
  const tab = sp.tab
  const setTab = (t) => setSp({ tab: t })
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const approved = useQuery(() => listRequests({ status: 'approved', pageSize: 100 }), [])
  const open = useQuery(() => openBorrowingLines(), [])
  const recent = useQuery(() => recentReturns(30), [])
  const exts = useQuery(() => listExtensions({ status: 'pending' }), [])
  useRealtime(['borrow_requests', 'borrowings', 'return_records', 'loan_extension_requests'], () => { approved.refetch(); open.refetch(); recent.refetch(); exts.refetch() })
  const pendingExtByLoan = Object.fromEntries((exts.data || []).map((e) => [e.borrowing_id, e]))
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

  const filters = [
    ['all', 'All loans'],
    ['requested', 'Return requested', requestedCount, 'bg-info-bg text-info'],
    ['overdue', 'Overdue lines', overdueCount, 'bg-bad-bg text-bad'],
  ]

  return (
    <div>
      <PageHeader title="Issue & returns" subtitle="Hand over approved requests and verify every returned part: good, damaged or missing." />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[
        { value: 'issue', label: 'Ready to issue', count: approvedRows.length },
        { value: 'loans', label: 'On loan / verify returns', count: new Set((open.data || []).map((l) => l.borrowing_id)).size },
        { value: 'extensions', label: 'Extension requests', count: (exts.data || []).length },
        { value: 'recent', label: 'Recently verified' },
      ]} />

      {tab === 'issue' && (
        approved.error ? <Card><ErrorState error={approved.error} onRetry={approved.refetch} /></Card>
          : approved.isInitialLoading ? <Card padded={false}><SkeletonRows /></Card>
          : approvedRows.length === 0 ? <Card><EmptyState icon={PackageCheck} title="Nothing waiting to be issued">Approved requests appear here until the student collects them.</EmptyState></Card>
          : (
            <div className="grid gap-4 lg:grid-cols-2">
              {approvedRows.map((r) => (
                <Card key={r.id} padded={false} className="flex flex-col">
                  <div className="flex items-start gap-3 p-4 sm:px-5">
                    <span className="hidden flex-none sm:block"><IconTile icon={PackageCheck} tone="cyan" size="sm" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="num text-sm font-semibold text-ink">{r.request_code}</p>
                      <p className="mt-0.5 break-words font-medium leading-snug">{r.requester_name}</p>
                      <p className="mt-1 text-xs text-muted">Approved {formatDateTime(r.reviewed_at)} · needed {formatDate(r.needed_from)}</p>
                    </div>
                    <Button size="sm" icon={PackageCheck} onClick={() => setIssuing(r)}>Issue</Button>
                  </div>
                  <ul className="flex-1 divide-y divide-line border-t border-line bg-slate-50/60 text-sm">
                    {(r.items || []).map((i) => (
                      <li key={i.item_id} className="flex items-baseline justify-between gap-4 px-4 py-2 sm:px-5">
                        <span className="min-w-0 break-words">{i.name}</span>
                        <span className="num flex-none font-medium text-muted">× {i.qty}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )
      )}

      {tab === 'loans' && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {filters.map(([v, label, n, tone]) => {
                const on = filter === v
                return (
                  <button key={v} onClick={() => setFilter(v)} aria-pressed={on}
                    className={cx('inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                      on ? 'border-night-2 bg-night-2 text-white' : 'border-line-strong bg-white text-ink hover:border-[#9FB0C6] hover:bg-slate-50')}>
                    {label}
                    {n !== undefined && <><span className="sr-only"> · </span><Count n={n} active={on} tone={tone} /></>}
                  </button>
                )
              })}
            </div>
            <SearchInput className="w-full sm:w-72" value={q} onChange={setQ} placeholder="Student, code or item" />
          </div>
          {open.error ? <Card><ErrorState error={open.error} onRetry={open.refetch} /></Card>
            : open.isInitialLoading ? <Card padded={false}><SkeletonRows /></Card>
            : groups.length === 0 ? <Card><EmptyState icon={Undo2} title="No loans match">Everything issued has been returned and verified.</EmptyState></Card>
            : (
              <div className="space-y-4">
                {groups.map((g) => (
                  <Card key={g.borrowing_id} padded={false} className="relative overflow-hidden">
                    <span aria-hidden className={cx('absolute inset-y-0 left-0 w-[3px]', ACCENT[dueTone(g.due_date, g.is_overdue)])} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-slate-50/70 py-3 pl-5 pr-4 sm:pr-5">
                      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="num text-sm font-semibold">{g.request_code}</span>
                        <span className="min-w-0 break-words font-semibold">{g.borrower_name}</span>
                        <span className={cx('min-w-0 truncate text-xs text-muted', g.borrower_srm_id && 'num')}>{g.borrower_srm_id || g.borrower_email}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {g.return_requested_at && <Badge tone="info">Return requested {formatDate(g.return_requested_at)}</Badge>}
                        {pendingExtByLoan[g.borrowing_id] && (
                          <button onClick={() => setTab('extensions')} className="rounded-full transition-colors [&>span]:transition-colors hover:[&>span]:bg-[#FBE3B3]">
                            <Badge tone="warn"><CalendarClock className="h-3 w-3" />Extension requested</Badge>
                          </button>
                        )}
                        <DueBadge due={g.due_date} overdue={g.is_overdue} />
                      </div>
                    </div>
                    <ul className="divide-y divide-line">
                      {g.lines.map((l) => (
                        <li key={l.line_id} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 py-3 pl-5 pr-4 sm:pr-5">
                          <div className="flex min-w-[12rem] flex-1 items-center gap-3">
                            <Thumb path={l.item_image_path} name={l.item_name} className="h-10 w-10 flex-none !rounded-lg" />
                            <div className="min-w-0">
                              <p className="break-words text-sm leading-snug"><span className="font-medium">{l.item_name}</span> <span className="num text-muted">× {l.qty_issued}</span></p>
                              <p className="mt-0.5 text-xs text-muted">Issued {formatDate(l.issued_at)}</p>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" icon={CheckCircle2} className="ml-auto" onClick={() => setVerifying(l)}>Verify return</Button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
        </>
      )}

      {tab === 'extensions' && <ExtensionQueue q={exts} onChanged={() => { exts.refetch(); open.refetch() }} />}

      {tab === 'recent' && (
        <Card padded={false}>
          {recent.isInitialLoading ? <SkeletonRows /> : (recent.data || []).length === 0 ? <EmptyState icon={CheckCircle2} title="No verified returns yet" /> : (
            <ul className="divide-y divide-line">
              {recent.data.map((l) => (
                <li key={l.line_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm sm:px-5">
                  <div className="flex min-w-[12rem] flex-1 items-center gap-3">
                    <Thumb path={l.item_image_path} name={l.item_name} className="h-9 w-9 flex-none !rounded-lg" />
                    <div className="min-w-0">
                      <p className="break-words font-medium leading-snug">{l.item_name} × <span className="num">{l.qty_issued}</span></p>
                      <p className="mt-0.5 break-words text-xs text-muted">{l.borrower_name} · <span className="num">{l.request_code}</span></p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {l.qty_good > 0 && <Badge tone="ok"><span className="num">{l.qty_good}</span> good</Badge>}
                    {l.qty_damaged > 0 && <Badge tone="warn"><span className="num">{l.qty_damaged}</span> damaged</Badge>}
                    {l.qty_missing > 0 && <Badge tone="bad"><span className="num">{l.qty_missing}</span> missing</Badge>}
                  </div>
                  <span className="w-full text-xs text-muted sm:w-28 sm:text-right">{formatDateTime(l.verified_at)}</span>
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

const VERIFY_TONE = {
  'text-ok': 'bg-ok-solid',
  'text-warn': 'bg-warn-solid',
  'text-bad': 'bg-bad-solid',
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
    <div className={cx('flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors', v[key] > 0 ? 'border-line-strong bg-white' : 'border-line bg-slate-50/60')}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={cx('mt-[5px] h-2.5 w-2.5 flex-none rounded-full', VERIFY_TONE[tone])} aria-hidden />
        <div className="min-w-0"><p className={cx('text-sm font-semibold leading-snug', tone)}>{label}</p><p className="mt-0.5 text-xs text-muted">{help}</p></div>
      </div>
      <Stepper value={v[key]} onChange={(n) => setV((s) => ({ ...s, [key]: n }))} min={0} max={line.qty_issued} label={label} />
    </div>
  )
  const sum = v.good + v.damaged + v.missing
  const scale = Math.max(sum, line.qty_issued, 1)
  const pct = (n) => `${(n / scale) * 100}%`
  return (
    <Modal open onClose={onClose} title={`Verify return · ${line.item_name}`}
      description={<>{line.borrower_name} · <span className="num">{line.request_code}</span> · <span className="num">{line.qty_issued}</span> issued</>}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving} disabled={!!problem}>Confirm verification</Button></>}>
      <div className="space-y-3">
        {row('good', 'Returned in good condition', 'text-ok', 'Goes back to available stock')}
        {row('damaged', 'Returned damaged', 'text-warn', 'Kept as damaged stock, not available')}
        {row('missing', 'Missing', 'text-bad', 'Recorded as lost; never counted as available')}
        <div className={cx('rounded-xl border px-3.5 py-3', problem ? 'border-bad/20 bg-bad-bg/50' : 'border-ok/15 bg-ok-bg/50')}>
          <p className={cx('text-sm font-semibold', problem ? 'text-bad' : 'text-ok')}>
            <span className="num">{sum}</span> of <span className="num">{line.qty_issued}</span> accounted for{problem ? '' : ' ✓'}
          </p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-line" aria-hidden>
            <span className="h-full bg-ok-solid" style={{ width: pct(v.good) }} />
            <span className="h-full bg-warn-solid" style={{ width: pct(v.damaged) }} />
            <span className="h-full bg-bad-solid" style={{ width: pct(v.missing) }} />
          </div>
        </div>
        <Textarea label="Notes" hint={v.damaged || v.missing ? 'Required for damaged or missing parts' : 'Optional'} value={v.notes} maxLength={500} rows={2}
          onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} />
        <InlineError>{error}</InlineError>
        <p className="text-xs text-muted">Each line can only be verified once. Stock is updated immediately.</p>
      </div>
    </Modal>
  )
}

function ExtensionQueue({ q, onChanged }) {
  const toast = useToast()
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null)
  async function review(e, approve, reason) {
    setBusy(e.id)
    try {
      await reviewLoanExtension(e.id, approve, reason)
      toast.success(approve ? `${e.request_code} now due ${formatDate(e.requested_due_date)}` : `Extension for ${e.request_code} declined`)
      setRejecting(null); setNote('')
      onChanged()
    } catch (err) { toast.error(err) } finally { setBusy(null) }
  }
  if (q.error) return <Card><ErrorState error={q.error} onRetry={q.refetch} /></Card>
  if (q.isInitialLoading) return <Card padded={false}><SkeletonRows /></Card>
  if (!(q.data || []).length) return <Card><EmptyState icon={CalendarClock} title="No extension requests">When a student asks for more time on a loan, it appears here for approval.</EmptyState></Card>
  return (
    <div className="space-y-3">
      {q.data.map((e) => (
        <Card key={e.id} padded={false}>
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="hidden flex-none sm:block"><IconTile icon={CalendarClock} tone="warn" size="sm" /></span>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold"><span className="num">{e.request_code}</span> <span className="font-medium">· {e.borrower_name}</span></p>
                <p className="mt-1.5 text-sm">
                  Due <strong className="font-semibold">{formatDate(e.current_due_date)}</strong> <span className="text-subtle">→</span> requested{' '}
                  <strong className="font-semibold text-brand">{formatDate(e.requested_due_date)}</strong>
                </p>
                <p className="mt-2 break-words rounded-lg border-l-[3px] border-line-strong bg-slate-50 px-3 py-2 text-sm text-muted">“{e.reason}”</p>
                <p className="mt-2 text-xs text-muted">Asked {formatDateTime(e.created_at)} · issued {formatDate(e.issued_at)}</p>
              </div>
            </div>
            <div className="flex flex-none gap-2 sm:pt-0.5">
              <Button size="sm" variant="success" icon={Check} loading={busy === e.id} onClick={() => review(e, true)}>Approve</Button>
              <Button size="sm" variant="danger-outline" icon={X} onClick={() => { setRejecting(e); setNote('') }}>Decline</Button>
            </div>
          </div>
        </Card>
      ))}
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Decline extension for ${rejecting?.request_code}`} size="sm"
        footer={<><Button variant="outline" onClick={() => setRejecting(null)}>Back</Button><Button variant="danger" loading={busy === rejecting?.id} onClick={() => review(rejecting, false, note)}>Decline</Button></>}>
        <Textarea label="Reason for the student" value={note} onChange={(ev) => setNote(ev.target.value)} rows={3} maxLength={500} required />
      </Modal>
    </div>
  )
}
