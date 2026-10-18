import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, ClipboardList, Package, Plus, RotateCcw, Undo2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useSearchState } from '../../hooks/useSearchState'
import {
  cancelLoanExtension, cancelRequest, getPublicSettings, myBorrowingLines, myExtensions, myRequests,
  requestLoanExtension, requestReturn,
} from '../../lib/api'
import { addDays, daysFromToday, formatDate, formatDateTime, relativeDue, toISODate } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, InlineError, PageHeader, SkeletonRows, Tabs, cx } from '../../components/ui/primitives'
import { Input, Textarea } from '../../components/ui/forms'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { RequestStatusBadge } from '../../components/domain/badges'

// "Cancelled" has no tab of its own; cancelled requests still appear under All.
export const REQUEST_TABS = ['all', 'pending', 'approved', 'issued', 'returned', 'rejected']

/**
 * Which actions a request card offers, by request status (and loan state for
 * issued requests). Pure function so it can be unit tested.
 *   pending / approved → Cancel request
 *   issued             → Return + Extend (each disabled with a reason when not possible)
 *   rejected           → Request again
 *   returned/cancelled → none
 * ("On loan" is a separate tab listing loans; it offers Request return.)
 */
export function requestActions(r, { returnRequested = false, pendingExtension = null, loanClosed = false } = {}) {
  switch (r.status) {
    case 'pending':
    case 'approved':
      return [{ key: 'cancel' }]
    case 'issued': {
      if (loanClosed) return []
      return [
        { key: 'return', disabled: returnRequested, reason: returnRequested ? 'Return requested — waiting for the lab to check the components' : null },
        {
          key: 'extend',
          disabled: returnRequested || !!pendingExtension,
          reason: returnRequested ? 'A return has already been requested'
            : pendingExtension ? `Extension to ${formatDate(pendingExtension.requested_due_date)} is waiting for approval` : null,
        },
      ]
    }
    case 'rejected':
      return [{ key: 'again' }]
    default:
      return []
  }
}

const LABELS = { all: 'All', pending: 'Pending', approved: 'Approved', issued: 'Issued', returned: 'Returned', rejected: 'Rejected' }

export default function MyRequests() {
  const { profile } = useAuth()
  const [f, setF] = useSearchState({ tab: 'all' })
  const reqs = useQuery(() => myRequests(profile.id), [profile.id])
  const lines = useQuery(() => myBorrowingLines(profile.id), [profile.id])
  const exts = useQuery(() => myExtensions(profile.id), [profile.id])
  const settings = useQuery(() => getPublicSettings(), [])
  const refetchAll = () => { reqs.refetch(); lines.refetch(); exts.refetch() }
  useRealtime(['borrow_requests', 'borrowings', 'return_records', 'loan_extension_requests'], refetchAll)

  const tab = f.tab === 'cancelled' ? 'all' : f.tab
  const all = reqs.data || []
  const counts = Object.fromEntries(REQUEST_TABS.map((s) => [s, s === 'all' ? all.length : all.filter((r) => r.status === s).length]))
  const openLines = (lines.data || []).filter((l) => !l.is_verified)
  const onLoanCount = new Set(openLines.map((l) => l.borrowing_id)).size
  const rows = tab === 'all' ? all : all.filter((r) => r.status === tab)

  // Loan details per borrowing, used by issued request cards.
  const loanInfo = useMemo(() => {
    const m = {}
    for (const l of lines.data || []) {
      const x = (m[l.borrowing_id] ||= { lines: {}, returnRequested: !!l.return_requested_at, open: false })
      x.lines[l.item_id] = l
      if (!l.is_verified) x.open = true
    }
    for (const e of exts.data || []) {
      const x = (m[e.borrowing_id] ||= { lines: {}, returnRequested: false, open: true })
      if (e.status === 'pending') x.pendingExtension = e
      if (!x.latestExtension) x.latestExtension = e // list is newest first
    }
    return m
  }, [lines.data, exts.data])

  return (
    <div>
      <PageHeader title="My requests" subtitle="Every component you have requested, with its status and what you can do next."
        actions={<Button to="/student/request" icon={Plus}>New request</Button>} />

      <Tabs className="mb-5" value={tab} onChange={(t) => setF({ tab: t })}
        tabs={[
          ...REQUEST_TABS.map((s) => ({ value: s, label: LABELS[s], count: counts[s] })),
          { value: 'borrowed', label: 'On loan', count: onLoanCount },
        ]} />

      {tab === 'borrowed' ? (
        <BorrowedList lines={lines} onChanged={refetchAll} />
      ) : reqs.error ? <Card><ErrorState error={reqs.error} onRetry={reqs.refetch} /></Card>
        : reqs.isInitialLoading ? <Card padded={false}><SkeletonRows /></Card>
        : rows.length === 0 ? (
          <Card><EmptyState icon={ClipboardList} title={tab === 'all' ? 'No requests yet' : `No ${LABELS[tab].toLowerCase()} requests`}
            action={tab === 'all' && <Button to="/student/projects">Find a project to build</Button>}>
            {tab === 'all' ? 'When you request components they appear here with their status.' : 'Nothing in this list right now.'}
          </EmptyState></Card>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <RequestCard key={r.id} r={r} loan={r.borrowing_id ? loanInfo[r.borrowing_id] : null}
                maxLoanDays={settings.data?.max_loan_days ?? 14} onChanged={refetchAll} />
            ))}
          </div>
        )}
    </div>
  )
}

function RequestCard({ r, loan, maxLoanDays, onChanged }) {
  const toast = useToast()
  const cart = useCart()
  const nav = useNavigate()
  const [dialog, setDialog] = useState(null) // 'cancel' | 'return' | 'extend'
  const [busy, setBusy] = useState(false)
  const actions = requestActions(r, {
    returnRequested: !!loan?.returnRequested,
    pendingExtension: loan?.pendingExtension || null,
    loanClosed: r.status === 'issued' && loan && !loan.open,
  })
  const ext = loan?.latestExtension

  async function run(fn, msg) {
    setBusy(true)
    try { await fn(); toast.success(msg); setDialog(null); onChanged() } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  function requestAgain() {
    cart.loadRequest(r)
    toast.info(`Components from ${r.request_code} copied into a new request. Check quantities and dates, then submit.`)
    nav('/student/request')
  }

  const due = r.due_date
  const d = due ? daysFromToday(due) : null

  return (
    <Card padded={false} data-request={r.request_code}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{r.request_code}</span>
            <RequestStatusBadge status={r.status} />
            {r.project_name && <Badge tone="neutral">{r.project_name}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">{r.purpose}</p>
          <p className="mt-1 text-xs text-muted">
            Submitted {formatDateTime(r.created_at)} · Needed {formatDate(r.needed_from)} – {formatDate(r.needed_until)}
            {due && <> · <span className={cx('font-semibold', r.status === 'issued' && (d < 0 ? 'text-bad' : d <= 2 ? 'text-warn' : 'text-teal'))}>
              Due {formatDate(due)}{r.status === 'issued' ? ` (${relativeDue(due).toLowerCase()})` : ''}</span></>}
          </p>
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((a) => {
              if (a.key === 'cancel') return <Button key="cancel" size="sm" variant="danger-outline" onClick={() => setDialog('cancel')}>Cancel request</Button>
              if (a.key === 'return') return <Button key="return" size="sm" variant="outline" icon={Undo2} disabled={a.disabled} title={a.reason || undefined} onClick={() => setDialog('return')}>Return</Button>
              if (a.key === 'extend') return <Button key="extend" size="sm" variant="outline" icon={CalendarClock} disabled={a.disabled} title={a.reason || undefined} onClick={() => setDialog('extend')}>Extend</Button>
              if (a.key === 'again') return <Button key="again" size="sm" icon={RotateCcw} onClick={requestAgain}>Request again</Button>
              return null
            })}
          </div>
        )}
      </div>

      <ul className="divide-y divide-line" aria-label={`Components in ${r.request_code}`}>
        {(r.items || []).map((i) => {
          const line = loan?.lines[i.item_id]
          return (
            <li key={i.item_id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
              <Package className="h-4 w-4 flex-none text-muted" aria-hidden />
              <span className="min-w-0 flex-1 font-medium">{i.name}</span>
              <span className="font-mono text-muted">× {i.qty}</span>
              {line && (line.is_verified ? (
                <span className="flex gap-1">
                  {line.qty_good > 0 && <Badge tone="ok">{line.qty_good} returned</Badge>}
                  {line.qty_damaged > 0 && <Badge tone="warn">{line.qty_damaged} damaged</Badge>}
                  {line.qty_missing > 0 && <Badge tone="bad">{line.qty_missing} missing</Badge>}
                </span>
              ) : <Badge tone="cyan">On loan</Badge>)}
            </li>
          )
        })}
      </ul>

      {(r.status === 'rejected' && r.rejection_reason) || (r.status === 'approved') || (r.status === 'issued' && (loan?.returnRequested || ext)) ? (
        <div className="space-y-1.5 border-t border-line px-5 py-3 text-sm">
          {r.status === 'rejected' && r.rejection_reason && <p className="text-bad"><strong>Reason:</strong> {r.rejection_reason}</p>}
          {r.status === 'approved' && <p className="font-medium text-info">Approved — your components are reserved. Collect them from the ISD Lab desk.</p>}
          {r.status === 'issued' && loan?.returnRequested && <p className="font-medium text-info">Return requested — bring the components to the lab desk. They are checked before the loan closes.</p>}
          {r.status === 'issued' && ext && <ExtensionNote ext={ext} onWithdraw={() => run(() => cancelLoanExtension(ext.id), 'Extension request withdrawn')} />}
        </div>
      ) : null}

      <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} loading={busy} tone="danger" confirmLabel="Cancel request"
        title={`Cancel ${r.request_code}?`} onConfirm={() => run(() => cancelRequest(r.id), `Request ${r.request_code} cancelled`)}>
        {r.status === 'approved' ? 'The reserved components will be released for other students.' : 'The lab administrator will no longer see this request.'}
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'return'} onClose={() => setDialog(null)} loading={busy} confirmLabel="Request return"
        title={`Return ${r.request_code}?`} onConfirm={() => run(() => requestReturn(r.borrowing_id), 'Return requested. Bring the components to the lab desk.')}>
        Bring every component to the ISD Lab desk. A lab administrator checks each one and records it as returned, damaged or missing; until then the loan stays open.
      </ConfirmDialog>
      {dialog === 'extend' && (
        <ExtendModal r={r} maxLoanDays={maxLoanDays} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged() }} />
      )}
    </Card>
  )
}

function ExtensionNote({ ext, onWithdraw }) {
  if (ext.status === 'pending') {
    return (
      <p className="flex flex-wrap items-center gap-2 text-warn">
        <span><strong>Extension requested</strong> to {formatDate(ext.requested_due_date)} — waiting for approval.</span>
        <button className="text-xs font-semibold text-muted underline hover:text-ink" onClick={onWithdraw}>Withdraw</button>
      </p>
    )
  }
  if (ext.status === 'approved') return <p className="text-ok"><strong>Extension approved</strong> — due date moved to {formatDate(ext.requested_due_date)}.</p>
  if (ext.status === 'rejected') return <p className="text-bad"><strong>Extension declined:</strong> {ext.review_note}</p>
  return null
}

function ExtendModal({ r, maxLoanDays, onClose, onDone }) {
  const toast = useToast()
  const issued = r.issued_at ? toISODate(new Date(r.issued_at)) : toISODate(new Date())
  const minDate = addDays(r.due_date, 1)
  const maxDate = addDays(issued, maxLoanDays)
  const [date, setDate] = useState(minDate <= maxDate ? minDate : '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const impossible = minDate > maxDate

  async function submit() {
    setError('')
    if (!date || date < minDate) return setError(`Choose a date after ${formatDate(r.due_date)}.`)
    if (date > maxDate) return setError(`Loans are limited to ${maxLoanDays} days in total, so the latest date is ${formatDate(maxDate)}.`)
    if (reason.trim().length < 3) return setError('Tell the lab why you need more time.')
    setSaving(true)
    try {
      await requestLoanExtension(r.borrowing_id, date, reason.trim())
      toast.success('Extension requested. Your due date changes once an administrator approves it.')
      onDone()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Extend ${r.request_code}`} description={`Currently due ${formatDate(r.due_date)}. An administrator must approve the new date.`}
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button onClick={submit} loading={saving} disabled={impossible}>Request extension</Button></>}>
      {impossible ? (
        <InlineError>This loan already uses the maximum {maxLoanDays} days, so it can't be extended. Please return the components or speak to the lab staff.</InlineError>
      ) : (
        <div className="space-y-4">
          <Input type="date" label="New due date" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)}
            hint={`Latest possible: ${formatDate(maxDate)} (loans are limited to ${maxLoanDays} days)`} />
          <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
            placeholder="e.g. Project demo moved to next week" required />
          <InlineError>{error}</InlineError>
        </div>
      )}
    </Modal>
  )
}

function BorrowedList({ lines, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  if (lines.error) return <Card><ErrorState error={lines.error} onRetry={lines.refetch} /></Card>
  if (lines.isInitialLoading) return <Card padded={false}><SkeletonRows /></Card>
  const open = (lines.data || []).filter((l) => !l.is_verified)
  const history = (lines.data || []).filter((l) => l.is_verified).slice(0, 20)
  const groups = Object.values(open.reduce((acc, l) => {
    (acc[l.borrowing_id] ||= { ...l, lines: [] }).lines.push(l)
    return acc
  }, {}))

  async function ask(g) {
    setBusy(g.borrowing_id)
    try {
      await requestReturn(g.borrowing_id)
      toast.success('Return requested. Bring the components to the lab desk for checking.')
      onChanged()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <Card><EmptyState icon={Package} title="Nothing on loan">Components you borrow appear here with their due dates.</EmptyState></Card>
      ) : groups.map((g) => {
        const d = daysFromToday(g.due_date)
        return (
          <Card key={g.borrowing_id} padded={false} data-loan={g.request_code}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="font-mono text-sm font-semibold">{g.request_code}</p>
                <p className={cx('mt-0.5 text-sm font-semibold', d < 0 ? 'text-bad' : d <= 2 ? 'text-warn' : 'text-teal')}>{relativeDue(g.due_date)} · {formatDate(g.due_date)}</p>
                <p className="text-xs text-muted">Issued {formatDate(g.issued_at)}</p>
              </div>
              {g.return_requested_at
                ? <Badge tone="info">Return requested {formatDate(g.return_requested_at)} · awaiting lab check</Badge>
                : <Button size="sm" variant="outline" icon={Undo2} loading={busy === g.borrowing_id} onClick={() => ask(g)}>Request return</Button>}
            </div>
            <ul className="divide-y divide-line">
              {g.lines.map((l) => (
                <li key={l.line_id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Package className="h-4 w-4 flex-none text-muted" aria-hidden />
                  <span className="flex-1 font-medium">{l.item_name}</span><span className="font-mono text-muted">× {l.qty_issued}</span>
                </li>
              ))}
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
