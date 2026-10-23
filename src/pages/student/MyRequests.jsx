import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BadgeCheck, Ban, CalendarClock, CalendarDays, CalendarRange, CircleCheck, CircleX, ClipboardList, Clock,
  FolderKanban, Hourglass, Info, Package, PackageCheck, PackageOpen, Plus, RotateCcw, TriangleAlert, Undo2,
} from 'lucide-react'
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
import { Badge, Button, Card, EmptyState, ErrorState, IconTile, InlineError, PageHeader, SectionTitle, Skeleton, Tabs, cx } from '../../components/ui/primitives'
import { Input, Textarea } from '../../components/ui/forms'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { Stagger, StaggerItem } from '../../components/ui/motion'
import { RequestStatusBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'

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

// ------------------------------------------------------------------ visual helpers
/** Status → icon tile shown at the head of each request card (decorative). */
const STATUS_TILE = {
  pending: { icon: Hourglass, tone: 'warn' },
  approved: { icon: BadgeCheck, tone: 'brand' },
  issued: { icon: PackageOpen, tone: 'cyan' },
  returned: { icon: PackageCheck, tone: 'ok' },
  rejected: { icon: CircleX, tone: 'bad' },
  cancelled: { icon: Ban, tone: 'none' },
}
/** Green with time to spare, amber when due within two days, red once overdue. */
const dueTone = (d) => (d < 0 ? 'bad' : d <= 2 ? 'warn' : 'ok')
const CHIP = {
  ok: 'bg-ok-bg text-ok ring-ok/15',
  warn: 'bg-warn-bg text-warn ring-warn/20',
  bad: 'bg-bad-bg text-bad ring-bad/20',
  info: 'bg-info-bg text-info ring-info/15',
  neutral: 'bg-neutral-pill text-neutral-pill-text ring-neutral-pill-text/10',
}
const DOT = { ok: 'bg-ok-solid', warn: 'bg-warn-solid', bad: 'bg-bad-solid shadow-[0_0_8px_rgb(239_68_68/0.8)]' }
const ACCENT = { ok: 'from-ok-solid via-ok-solid/40', warn: 'from-warn-solid via-warn-solid/45', bad: 'from-bad-solid via-bad-solid/50' }

function Chip({ tone = 'neutral', icon: Icon, className, children }) {
  return (
    <span className={cx('inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-tight ring-1 ring-inset', CHIP[tone], className)}>
      {Icon && <Icon className="h-3.5 w-3.5 flex-none" aria-hidden />}
      {children}
    </span>
  )
}

/** One "label · value" fact: a row on phones, a fixed label column on wider screens. */
function Fact({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 sm:justify-start">
      <dt className="label-caps flex w-[96px] flex-none items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-subtle" aria-hidden />{label}
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-sm font-medium text-ink sm:justify-start sm:text-left">{children}</dd>
    </div>
  )
}

const NOTE = {
  info: 'bg-info-bg/70 text-info ring-info/15',
  ok: 'bg-ok-bg/70 text-ok ring-ok/15',
  warn: 'bg-warn-bg/70 text-warn ring-warn/20',
  bad: 'bg-bad-bg/70 text-bad ring-bad/15',
}
function Note({ tone, icon: Icon, children }) {
  return (
    <div className={cx('flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ring-1 ring-inset', NOTE[tone])}>
      <Icon className="mt-[3px] h-4 w-4 flex-none" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** "× 3" quantity tag. */
function Qty({ children }) {
  return (
    <span className="num flex-none rounded-lg bg-white px-2 py-0.5 text-[13px] font-semibold text-ink ring-1 ring-inset ring-line">× {children}</span>
  )
}

// Card frame shared by request and loan cards: identity top-left, actions top-right on
// wider screens and as a full-width footer on phones (one set of buttons, moved by the grid).
const CARD_GRID = 'grid grid-cols-1 overflow-hidden sm:grid-cols-[minmax(0,1fr)_auto]'
const ACTIONS = cx(
  'order-last flex flex-wrap items-center gap-2 border-t border-line/80 bg-white/50 px-5 py-3.5 [&>*]:flex-1',
  'sm:order-none sm:flex-nowrap sm:items-start sm:border-t-0 sm:bg-transparent sm:pb-0 sm:pl-0 sm:pr-6 sm:pt-5 sm:[&>*]:flex-none',
)
const ITEMS_PANEL = 'divide-y divide-line/70 rounded-2xl bg-white/60 ring-1 ring-inset ring-line/80'

function CardsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <div className="flex items-center gap-3.5">
            <Skeleton className="h-11 w-11 rounded-[14px]" />
            <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-4 w-3/5" /></div>
          </div>
          <Skeleton className="mt-5 h-12 rounded-2xl" />
        </Card>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ page
export default function MyRequests() {
  const { profile } = useAuth()
  const [f, setF] = useSearchState({ tab: 'all' })
  const reqs = useQuery(() => myRequests(profile.id), [profile.id])
  const lines = useQuery(() => myBorrowingLines(profile.id), [profile.id])
  const exts = useQuery(() => myExtensions(profile.id), [profile.id])
  const settings = useQuery(() => getPublicSettings(), [])
  const refetchAll = () => { reqs.refetch(); lines.refetch(); exts.refetch() }
  useRealtime(['borrow_requests', 'borrowings', 'return_records', 'loan_extension_requests'], refetchAll)

  // Unknown tab values (including the old "cancelled") fall back to All.
  const tab = f.tab === 'borrowed' || REQUEST_TABS.includes(f.tab) ? f.tab : 'all'
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
        actions={<Button to="/student/request" icon={Plus}>New request</Button>}>
        <Tabs className="-mx-5 -mb-2 px-3 sm:mx-0 sm:-mb-3 sm:px-0" value={tab} onChange={(t) => setF({ tab: t })}
          tabs={[
            ...REQUEST_TABS.map((s) => ({ value: s, label: LABELS[s], count: counts[s] })),
            { value: 'borrowed', label: 'On loan', count: onLoanCount },
          ]} />
      </PageHeader>

      {tab === 'borrowed' ? (
        <BorrowedList lines={lines} onChanged={refetchAll} />
      ) : reqs.error ? <Card><ErrorState error={reqs.error} onRetry={reqs.refetch} /></Card>
        : reqs.isInitialLoading ? <CardsSkeleton />
        : rows.length === 0 ? (
          <Card><EmptyState icon={ClipboardList} title={tab === 'all' ? 'No requests yet' : `No ${LABELS[tab].toLowerCase()} requests`}
            action={tab === 'all' && <Button to="/student/projects">Find a project to build</Button>}>
            {tab === 'all' ? 'When you request components they appear here with their status.' : 'Nothing in this list right now.'}
          </EmptyState></Card>
        ) : (
          <Stagger key={tab} className="space-y-4 sm:space-y-5">
            {rows.map((r) => (
              <StaggerItem key={r.id}>
                <RequestCard r={r} loan={r.borrowing_id ? loanInfo[r.borrowing_id] : null}
                  maxLoanDays={settings.data?.max_loan_days ?? 14} onChanged={refetchAll} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
    </div>
  )
}

// ------------------------------------------------------------------ request card
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
  const tile = STATUS_TILE[r.status] || STATUS_TILE.cancelled
  const hasNotes = (r.status === 'rejected' && r.rejection_reason) || (r.status === 'approved') || (r.status === 'issued' && (loan?.returnRequested || ext))

  return (
    <Card padded={false} data-request={r.request_code} className={CARD_GRID}>
      {/* Identity */}
      <div className="flex min-w-0 items-start gap-3.5 px-5 pb-4 pt-5 sm:px-6">
        <IconTile icon={tile.icon} tone={tile.tone} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="num text-[15px] font-semibold text-ink">{r.request_code}</span>
            <RequestStatusBadge status={r.status} />
          </div>
          {r.purpose && <p className="mt-1.5 break-words font-display text-[16px] font-semibold leading-snug tracking-tight text-ink sm:text-[17px]">{r.purpose}</p>}
          {r.project_name && (
            <Chip icon={FolderKanban} className="mt-2"><span className="truncate">{r.project_name}</span></Chip>
          )}
        </div>
      </div>

      {/* Actions (a phone footer, top-right from sm up) */}
      {actions.length > 0 && (
        <div className={ACTIONS}>
          {actions.map((a) => {
            if (a.key === 'cancel') return <Button key="cancel" variant="danger-outline" onClick={() => setDialog('cancel')}>Cancel request</Button>
            if (a.key === 'return') return <Button key="return" variant="outline" icon={Undo2} disabled={a.disabled} title={a.reason || undefined} onClick={() => setDialog('return')}>Return</Button>
            if (a.key === 'extend') return <Button key="extend" variant="outline" icon={CalendarClock} disabled={a.disabled} title={a.reason || undefined} onClick={() => setDialog('extend')}>Extend</Button>
            if (a.key === 'again') return <Button key="again" icon={RotateCcw} onClick={requestAgain}>Request again</Button>
            return null
          })}
        </div>
      )}

      {/* Details: dates beside the component list on large screens */}
      <div className="min-w-0 border-t border-line/70 px-5 pb-5 pt-3 sm:col-span-2 sm:px-6 sm:pt-4">
        <div className="lg:grid lg:grid-cols-[330px_minmax(0,1fr)] lg:gap-6">
          <dl className="mb-3 lg:mb-0">
            <Fact icon={CalendarDays} label="Submitted">{formatDateTime(r.created_at)}</Fact>
            <Fact icon={CalendarRange} label="Needed">
              <span>{formatDate(r.needed_from)} – {formatDate(r.needed_until)}</span>
            </Fact>
            {due && (
              <Fact icon={Clock} label="Due">
                <span className={cx(r.status === 'issued' && 'font-semibold')}>{formatDate(due)}</span>
                {r.status === 'issued' && (
                  <Chip tone={dueTone(d)}>
                    <span className={cx('h-1.5 w-1.5 flex-none rounded-full', DOT[dueTone(d)])} aria-hidden />
                    {relativeDue(due)}
                  </Chip>
                )}
              </Fact>
            )}
          </dl>

          <ul className={cx(ITEMS_PANEL, 'self-start')} aria-label={`Components in ${r.request_code}`}>
            {(r.items || []).map((i) => {
              const line = loan?.lines[i.item_id]
              return (
                <li key={i.item_id} className="flex items-center gap-3 px-3 py-2.5 sm:px-3.5">
                  <Thumb name={i.name} className="h-10 w-10 flex-none !rounded-xl" />
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 break-words text-sm font-medium text-ink">{i.name}</span>
                    {line && (line.is_verified ? (
                      <span className="flex flex-wrap gap-1 sm:ml-auto">
                        {line.qty_good > 0 && <Badge tone="ok"><span className="num">{line.qty_good}</span> returned</Badge>}
                        {line.qty_damaged > 0 && <Badge tone="warn"><span className="num">{line.qty_damaged}</span> damaged</Badge>}
                        {line.qty_missing > 0 && <Badge tone="bad"><span className="num">{line.qty_missing}</span> missing</Badge>}
                      </span>
                    ) : <Badge tone="cyan" dot className="sm:ml-auto">On loan</Badge>)}
                  </div>
                  <Qty>{i.qty}</Qty>
                </li>
              )
            })}
          </ul>
        </div>

        {hasNotes ? (
          <div className="mt-3 space-y-2">
            {r.status === 'rejected' && r.rejection_reason && (
              <Note tone="bad" icon={CircleX}><p><strong>Reason:</strong> {r.rejection_reason}</p></Note>
            )}
            {r.status === 'approved' && (
              <Note tone="info" icon={BadgeCheck}><p className="font-medium">Approved — your components are reserved. Collect them from the ISD Lab desk.</p></Note>
            )}
            {r.status === 'issued' && loan?.returnRequested && (
              <Note tone="info" icon={Undo2}><p className="font-medium">Return requested — bring the components to the lab desk. They are checked before the loan closes.</p></Note>
            )}
            {r.status === 'issued' && ext && <ExtensionNote ext={ext} onWithdraw={() => run(() => cancelLoanExtension(ext.id), 'Extension request withdrawn')} />}
          </div>
        ) : null}
      </div>

      <ConfirmDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} loading={busy} tone="danger" confirmLabel="Cancel request"
        title={<>Cancel <span className="num">{r.request_code}</span>?</>} onConfirm={() => run(() => cancelRequest(r.id), `Request ${r.request_code} cancelled`)}>
        {r.status === 'approved' ? 'The reserved components will be released for other students.' : 'The lab administrator will no longer see this request.'}
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'return'} onClose={() => setDialog(null)} loading={busy} confirmLabel="Request return"
        title={<>Return <span className="num">{r.request_code}</span>?</>} onConfirm={() => run(() => requestReturn(r.borrowing_id), 'Return requested. Bring the components to the lab desk.')}>
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
      <Note tone="warn" icon={CalendarClock}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><strong>Extension requested</strong> to {formatDate(ext.requested_due_date)} — waiting for approval.</span>
          <button className="rounded-md text-xs font-semibold text-muted underline underline-offset-2 transition-colors hover:text-ink" onClick={onWithdraw}>Withdraw</button>
        </p>
      </Note>
    )
  }
  if (ext.status === 'approved') return <Note tone="ok" icon={CircleCheck}><p><strong>Extension approved</strong> — due date moved to {formatDate(ext.requested_due_date)}.</p></Note>
  if (ext.status === 'rejected') return <Note tone="bad" icon={CircleX}><p><strong>Extension declined:</strong> {ext.review_note}</p></Note>
  return null
}

// ------------------------------------------------------------------ extend modal
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
    <Modal open onClose={onClose} title={<>Extend <span className="num">{r.request_code}</span></>} description={`Currently due ${formatDate(r.due_date)}. An administrator must approve the new date.`}
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button icon={CalendarClock} onClick={submit} loading={saving} disabled={impossible}>Request extension</Button></>}>
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

// ------------------------------------------------------------------ on loan
function BorrowedList({ lines, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  if (lines.error) return <Card><ErrorState error={lines.error} onRetry={lines.refetch} /></Card>
  if (lines.isInitialLoading) return <CardsSkeleton />
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
    <Stagger className="space-y-4 sm:space-y-5">
      {groups.length === 0 ? (
        <StaggerItem>
          <Card><EmptyState icon={Package} title="Nothing on loan">Components you borrow appear here with their due dates.</EmptyState></Card>
        </StaggerItem>
      ) : groups.map((g) => {
        const d = daysFromToday(g.due_date)
        const tone = dueTone(d)
        return (
          <StaggerItem key={g.borrowing_id}>
            <Card padded={false} data-loan={g.request_code} className={cx(CARD_GRID, 'relative')}>
              <span aria-hidden className={cx('pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r to-transparent', ACCENT[tone])} />
              <div className="flex min-w-0 items-start gap-3.5 px-5 pb-4 pt-5 sm:px-6">
                <IconTile icon={d < 0 ? TriangleAlert : Clock} tone={tone} />
                <div className="min-w-0 flex-1">
                  <p className="num text-[15px] font-semibold text-ink">{g.request_code}</p>
                  <Chip tone={tone} className="mt-1.5">
                    <span className={cx('h-1.5 w-1.5 flex-none rounded-full', DOT[tone])} aria-hidden />
                    <span>{relativeDue(g.due_date)} · {formatDate(g.due_date)}</span>
                  </Chip>
                  <p className="mt-1.5 text-xs text-muted">Issued {formatDate(g.issued_at)}</p>
                </div>
              </div>
              <div className={ACTIONS}>
                {g.return_requested_at
                  ? <Chip tone="info" icon={Info} className="justify-center py-1.5 sm:max-w-xs">Return requested {formatDate(g.return_requested_at)} · awaiting lab check</Chip>
                  : <Button variant="outline" icon={Undo2} loading={busy === g.borrowing_id} onClick={() => ask(g)}>Request return</Button>}
              </div>
              <div className="min-w-0 px-5 pb-5 sm:col-span-2 sm:px-6">
                <ul className={ITEMS_PANEL}>
                  {g.lines.map((l) => (
                    <li key={l.line_id} className="flex items-center gap-3 px-3 py-2.5 sm:px-3.5">
                      <Thumb path={l.item_image_path} name={l.item_name} className="h-11 w-11 flex-none !rounded-xl" />
                      <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink">{l.item_name}</span>
                      <Qty>{l.qty_issued}</Qty>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </StaggerItem>
        )
      })}
      {history.length > 0 && (
        <StaggerItem>
          <Card>
            <SectionTitle className="mb-3">Returned</SectionTitle>
            <ul className="-mx-2">
              {history.map((l) => (
                <li key={l.line_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-2 py-2.5 transition-colors hover:bg-white/70">
                  <Thumb path={l.item_image_path} name={l.item_name} className="h-10 w-10 flex-none !rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-ink">{l.item_name} × <span className="num">{l.qty_issued}</span></p>
                    <p className="mt-0.5 text-xs text-muted"><span className="num">{l.request_code}</span> · Verified {formatDate(l.verified_at)}</p>
                  </div>
                  <span className="flex w-full flex-wrap gap-1 pl-[52px] sm:w-auto sm:pl-0">
                    {l.qty_good > 0 && <Badge tone="ok"><span className="num">{l.qty_good}</span> good</Badge>}
                    {l.qty_damaged > 0 && <Badge tone="warn"><span className="num">{l.qty_damaged}</span> damaged</Badge>}
                    {l.qty_missing > 0 && <Badge tone="bad"><span className="num">{l.qty_missing}</span> missing</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </StaggerItem>
      )}
    </Stagger>
  )
}
