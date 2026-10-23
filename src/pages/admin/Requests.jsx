import { Fragment, useEffect, useState } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronRight, ClipboardCheck, PackageCheck, X } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { approveRequest, cancelRequest, issueRequest, listRequests, rejectRequest, requestCounts } from '../../lib/api'
import { formatDate, formatDateTime, timeAgo, toISODate } from '../../lib/format'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, ErrorState, InlineError, PageHeader, Pagination, SkeletonRows, Tabs, cx } from '../../components/ui/primitives'
import { Input, SearchInput, Textarea } from '../../components/ui/forms'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { RequestStatusBadge } from '../../components/domain/badges'

const PAGE_SIZE = 20
const TABS = ['pending', 'approved', 'issued', 'rejected', 'all']
const REASONS = ['Out of stock at review', 'Quantity too high for this purpose', 'Dates clash with lab schedule', 'Please collect a kit from a lab assistant instead']

// One request = one grid row. Phone: a stacked card; sm: three columns; xl: one line with a column per field.
// Columns on xl must match the header row below.
const XL_COLS = 'xl:grid-cols-[1.75rem_6rem_minmax(0,1fr)_minmax(0,1.5fr)_7rem_6rem_13.5rem]'
const ROW_BASE = cx('grid items-start gap-x-3 gap-y-2.5 grid-cols-[1.75rem_minmax(0,1fr)_auto]',
  'sm:grid-cols-[1.75rem_minmax(0,0.8fr)_minmax(0,1fr)_auto] sm:gap-x-4',
  XL_COLS, "xl:items-center xl:gap-x-3 xl:[grid-template-areas:'chev_req_who_items_dates_status_acts']")
const ROW_ACTS = cx(ROW_BASE,
  "[grid-template-areas:'chev_req_status'_'._who_who'_'._items_items'_'._dates_dates'_'._acts_acts']",
  "sm:[grid-template-areas:'chev_req_who_status'_'._items_items_dates'_'._acts_acts_acts']")
const ROW_PLAIN = cx(ROW_BASE,
  "[grid-template-areas:'chev_req_status'_'._who_who'_'._items_items'_'._dates_dates']",
  "sm:[grid-template-areas:'chev_req_who_status'_'._items_items_dates']")

export default function AdminRequests() {
  const toast = useToast()
  const [f, setF] = useSearchState({ status: 'pending', search: '', page: 1 })
  const [text, setText] = useState(f.search)
  const dq = useDebounce(text, 300)
  useEffect(() => { if (dq !== f.search) setF({ search: dq }) }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useQuery(() => listRequests({ status: f.status === 'all' ? '' : f.status, search: f.search, page: f.page, pageSize: PAGE_SIZE }), [f.status, f.search, f.page])
  const counts = useQuery(() => requestCounts(), [])
  useRealtime(['borrow_requests', 'inventory_items'], () => { list.refetch(); counts.refetch() })

  const [open, setOpen] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [issuing, setIssuing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [busy, setBusy] = useState(null)
  const rows = list.data?.data || []

  async function act(id, fn, msg) {
    setBusy(id)
    try { await fn(); toast.success(msg); list.refetch(); counts.refetch(); return true }
    catch (e) { toast.error(e); list.refetch(); return false }
    finally { setBusy(null) }
  }

  return (
    <div>
      <PageHeader title="Borrowing requests" subtitle="Approve to reserve stock, then issue when the student collects. Rejections need a reason."
        actions={<Button to="/admin/issuance" variant="outline" icon={PackageCheck}>Issue & returns</Button>} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-6">
        <Tabs className="min-w-0 lg:flex-1" value={f.status} onChange={(status) => setF({ status })}
          tabs={TABS.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: counts.data ? counts.data[s] || 0 : undefined }))} />
        <SearchInput className="w-full lg:mb-1 lg:w-80 lg:flex-none" value={text} onChange={setText} placeholder="Code, student, email or project" />
      </div>

      <Card padded={false} className="overflow-hidden">
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={8} />
          : rows.length === 0 ? <EmptyState icon={ClipboardCheck} title={`No ${f.status === 'all' ? '' : f.status + ' '}requests`}>{f.status === 'pending' ? 'New requests from students appear here instantly.' : 'Nothing to show for this filter.'}</EmptyState>
          : (
            <>
              <div className={cx('hidden border-b border-line bg-slate-50/90 px-4 py-2.5 xl:grid xl:items-center xl:gap-x-3', XL_COLS)} aria-hidden>
                <span />
                <span className="label-caps">Request</span>
                <span className="label-caps">Student</span>
                <span className="label-caps">Components</span>
                <span className="label-caps">Dates</span>
                <span className="label-caps">Status</span>
                <span className="label-caps text-right">Actions</span>
              </div>
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <RequestRow key={r.id} r={r} expanded={open === r.id} busy={busy === r.id}
                    onToggle={() => setOpen(open === r.id ? null : r.id)}
                    onApprove={() => act(r.id, () => approveRequest(r.id), `${r.request_code} approved — stock reserved`)}
                    onReject={() => setRejecting(r)} onIssue={() => setIssuing(r)} onCancel={() => setCancelling(r)} />
                ))}
              </ul>
            </>
          )}
      </Card>
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={list.data?.count} onPage={(page) => setF({ page })} />

      {rejecting && <RejectModal r={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); list.refetch(); counts.refetch() }} />}
      {issuing && <IssueModal r={issuing} onClose={() => setIssuing(null)} onDone={() => { setIssuing(null); list.refetch(); counts.refetch() }} />}
      <ConfirmDialog open={!!cancelling} onClose={() => setCancelling(null)} tone="danger" confirmLabel="Cancel request" loading={busy === cancelling?.id}
        title={`Cancel ${cancelling?.request_code}?`}
        onConfirm={async () => { if (await act(cancelling.id, () => cancelRequest(cancelling.id), 'Request cancelled; reserved stock released')) setCancelling(null) }}>
        The reserved components go back to available stock. Use this when a student does not collect.
      </ConfirmDialog>
    </div>
  )
}

function RequestRow({ r, expanded, busy, onToggle, onApprove, onReject, onIssue, onCancel }) {
  const pending = r.status === 'pending'
  const approved = r.status === 'approved'
  const items = r.items || []
  const detailsId = `request-details-${r.id}`
  return (
    <li className={cx('transition-colors', expanded ? 'bg-slate-50/80 shadow-[inset_3px_0_0_var(--color-cyan)]' : 'hover:bg-slate-50/70')}>
      <div className={cx('px-4 py-3.5 xl:py-3', pending || approved ? ROW_ACTS : ROW_PLAIN)}>
        <button onClick={onToggle} aria-expanded={expanded} aria-controls={expanded ? detailsId : undefined} aria-label={`Details for ${r.request_code}`}
          className={cx('-ml-1 flex h-7 w-7 items-center justify-center rounded-md transition-colors [grid-area:chev] xl:ml-0',
            expanded ? 'bg-cyan-soft text-brand' : 'text-muted hover:bg-slate-200/70 hover:text-ink')}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="min-w-0 [grid-area:req]">
          <p className="num text-[13.5px] font-semibold leading-7 text-ink xl:leading-normal">{r.request_code}</p>
          <p className="text-xs text-muted">{timeAgo(r.created_at)}</p>
        </div>

        <div className="min-w-0 [grid-area:who]">
          <p className="truncate text-sm font-medium text-ink">{r.requester_name}</p>
          <p className={cx('truncate text-xs text-muted', r.requester_srm_id && 'num')}>{r.requester_srm_id || r.requester_email}</p>
        </div>

        <div className="min-w-0 [grid-area:items]">
          <p className="line-clamp-2 text-[13px] leading-snug text-ink">
            {items.map((i, k) => (
              <Fragment key={i.item_id || k}>{k > 0 && ', '}{i.name} <span className="num whitespace-nowrap font-medium text-muted">×{i.qty}</span></Fragment>
            ))}
          </p>
          {pending && (r.can_fulfil
            ? <Badge tone="ok" dot className="mt-1.5">Stock OK</Badge>
            : <Badge tone="bad" dot className="mt-1.5">Not enough stock</Badge>)}
        </div>

        <div className="flex items-start gap-1.5 text-[13px] leading-snug text-muted [grid-area:dates] xl:text-ink">
          <CalendarDays className="mt-px h-3.5 w-3.5 flex-none text-subtle xl:hidden" aria-hidden />
          <p><span className="whitespace-nowrap">{formatDate(r.needed_from)} –</span> <span className="whitespace-nowrap">{formatDate(r.needed_until)}</span></p>
        </div>

        <div className="justify-self-end [grid-area:status] xl:justify-self-start"><RequestStatusBadge status={r.status} /></div>

        {(pending || approved) && (
          <div className="flex flex-wrap gap-1.5 [grid-area:acts] xl:justify-end">
            {pending && <>
              <Button size="sm" variant="success" icon={Check} loading={busy} disabled={!r.can_fulfil}
                title={r.can_fulfil ? 'Approve and reserve stock' : 'Not enough stock to approve'}
                onClick={onApprove}>Approve</Button>
              <Button size="sm" variant="danger-outline" icon={X} onClick={onReject}>Reject</Button>
            </>}
            {approved && <>
              <Button size="sm" icon={PackageCheck} onClick={onIssue}>Issue</Button>
              <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
            </>}
          </div>
        )}
      </div>

      {expanded && (
        <div id={detailsId} className="px-3 pb-5 pt-1 sm:px-4 xl:pl-[3.5rem]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8">
            <div className="self-start overflow-x-auto rounded-lg border border-line bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-slate-50 text-left">
                    <th scope="col" className="label-caps px-2.5 py-2 sm:px-3">Component</th>
                    <th scope="col" className="label-caps px-2.5 py-2 text-right sm:whitespace-nowrap sm:px-3">Requested</th>
                    <th scope="col" className="label-caps px-2.5 py-2 text-right sm:whitespace-nowrap sm:px-3">Available now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((i, k) => {
                    const short = pending && i.available_qty < i.qty
                    return (
                      <tr key={i.item_id || k}>
                        <td className="px-2.5 py-2 text-ink [overflow-wrap:anywhere] sm:px-3">{i.name}</td>
                        <td className="num px-2.5 py-2 text-right font-medium sm:px-3">{i.qty}</td>
                        <td className={cx('num px-2.5 py-2 text-right sm:px-3', short ? 'bg-bad-bg/60 font-semibold text-bad' : 'text-muted')}>{i.available_qty}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <dl className="grid content-start gap-x-6 gap-y-3.5 text-sm sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2">
                <dt className="label-caps mb-0.5">Purpose</dt>
                <dd className="break-words text-ink">{r.purpose}{r.project_name && <> · <Badge tone="info">{r.project_name}</Badge></>}</dd>
              </div>
              {r.note && <div className="min-w-0 sm:col-span-2">
                <dt className="label-caps mb-1">Note from student</dt>
                <dd className="break-words border-l-2 border-cyan bg-white py-1.5 pl-3 pr-2 leading-relaxed text-ink">“{r.note}”</dd>
              </div>}
              <div className="min-w-0 sm:col-span-2">
                <dt className="label-caps mb-0.5">Student</dt>
                <dd className="break-words text-ink">{r.requester_name} · <span className="text-muted">{r.requester_email}</span></dd>
              </div>
              <div className="min-w-0">
                <dt className="label-caps mb-0.5">Submitted</dt>
                <dd className="text-ink">{formatDateTime(r.created_at)}</dd>
              </div>
              {r.reviewed_at && <div className="min-w-0">
                <dt className="label-caps mb-0.5">Reviewed</dt>
                <dd className="text-ink">{formatDateTime(r.reviewed_at)}</dd>
              </div>}
              {r.due_date && <div className="min-w-0">
                <dt className="label-caps mb-0.5">Due back</dt>
                <dd className="text-ink">{formatDate(r.due_date)}</dd>
              </div>}
              {r.rejection_reason && <div className="min-w-0 sm:col-span-2">
                <dt className="label-caps mb-1">Rejection reason</dt>
                <dd className="break-words rounded-lg border border-bad/15 bg-bad-bg/60 px-3 py-2 font-medium text-bad">{r.rejection_reason}</dd>
              </div>}
            </dl>
          </div>
        </div>
      )}
    </li>
  )
}

function RejectModal({ r, onClose, onDone }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (reason.trim().length < 3) return setError('Give the student a short reason.')
    setSaving(true)
    try { await rejectRequest(r.id, reason.trim()); toast.success(`${r.request_code} rejected`); onDone() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Reject ${r.request_code}`} description={`${r.requester_name} will see this reason.`}
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button variant="danger" onClick={submit} loading={saving}>Reject request</Button></>}>
      <div className="mb-4 flex flex-wrap gap-2">
        {REASONS.map((x) => {
          const on = reason === x
          return (
            <button key={x} type="button" onClick={() => setReason(x)} aria-pressed={on}
              className={cx('max-w-full rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors',
                on ? 'border-brand bg-cyan-soft text-brand' : 'border-line-strong bg-white text-ink hover:border-brand hover:text-brand')}>
              {x}
            </button>
          )
        })}
      </div>
      <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} required />
      <div className="mt-3"><InlineError>{error}</InlineError></div>
    </Modal>
  )
}

export function IssueModal({ r, onClose, onDone }) {
  const toast = useToast()
  const today = toISODate(new Date())
  const [due, setDue] = useState(r.needed_until < today ? today : r.needed_until)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (!due || due < today) return setError('The due date cannot be in the past.')
    setSaving(true)
    try { await issueRequest(r.id, due); toast.success(`${r.request_code} issued to ${r.requester_name}`); onDone() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Issue ${r.request_code}`} description="Hand the reserved components to the student. Stock moves from reserved to on loan."
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button icon={PackageCheck} onClick={submit} loading={saving}>Confirm issue</Button></>}>
      <p className="mb-2 text-sm font-semibold text-ink">{r.requester_name}</p>
      <ul className="mb-4 divide-y divide-line overflow-hidden rounded-lg border border-line text-sm">
        {(r.items || []).map((i) => (
          <li key={i.item_id} className="flex items-start justify-between gap-3 px-3 py-2">
            <span className="min-w-0 break-words text-ink">{i.name}</span>
            <span className="num flex-none font-medium text-muted">× {i.qty}</span>
          </li>
        ))}
      </ul>
      <Input type="date" label="Due date" min={today} value={due} onChange={(e) => setDue(e.target.value)} hint={`Student asked for ${formatDate(r.needed_until)}`} />
      <div className="mt-3"><InlineError>{error}</InlineError></div>
    </Modal>
  )
}
