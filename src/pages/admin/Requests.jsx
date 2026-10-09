import { Fragment, useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronRight, ClipboardCheck, PackageCheck, X } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { approveRequest, cancelRequest, issueRequest, listRequests, rejectRequest, requestCounts } from '../../lib/api'
import { formatDate, formatDateTime, timeAgo, toISODate } from '../../lib/format'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, ErrorState, InlineError, PageHeader, Pagination, SkeletonRows, Table, Tabs, Td, Th, cx } from '../../components/ui/primitives'
import { Input, SearchInput, Textarea } from '../../components/ui/forms'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { RequestStatusBadge } from '../../components/domain/badges'

const PAGE_SIZE = 20
const TABS = ['pending', 'approved', 'issued', 'rejected', 'all']
const REASONS = ['Out of stock at review', 'Quantity too high for this purpose', 'Dates clash with lab schedule', 'Please collect a kit from a lab assistant instead']

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={f.status} onChange={(status) => setF({ status })}
          tabs={TABS.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: counts.data ? counts.data[s] || 0 : undefined }))} />
        <SearchInput className="w-full sm:w-80" value={text} onChange={setText} placeholder="Code, student, email or project" />
      </div>

      <Card padded={false}>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={8} />
          : rows.length === 0 ? <EmptyState icon={ClipboardCheck} title={`No ${f.status === 'all' ? '' : f.status + ' '}requests`}>{f.status === 'pending' ? 'New requests from students appear here instantly.' : 'Nothing to show for this filter.'}</EmptyState>
          : (
            <Table>
              <thead><tr><Th className="w-8" /><Th>Request</Th><Th>Student</Th><Th>Components</Th><Th>Dates</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const expanded = open === r.id
                  return (
                    <Fragment key={r.id}>
                      <tr className={cx('hover:bg-slate-50', expanded && 'bg-slate-50')}>
                        <Td><button onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded} aria-label={`Details for ${r.request_code}`} className="rounded p-1 hover:bg-slate-200">
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></Td>
                        <Td><p className="font-mono text-[13px] font-semibold">{r.request_code}</p><p className="text-xs text-muted">{timeAgo(r.created_at)}</p></Td>
                        <Td><p className="font-medium">{r.requester_name}</p><p className="text-xs text-muted">{r.requester_srm_id || r.requester_email}</p></Td>
                        <Td>
                          <p className="max-w-xs truncate text-[13px]">{(r.items || []).map((i) => `${i.name} ×${i.qty}`).join(', ')}</p>
                          {r.status === 'pending' && (r.can_fulfil ? <Badge tone="ok" className="mt-1">Stock OK</Badge> : <Badge tone="bad" className="mt-1">Not enough stock</Badge>)}
                        </Td>
                        <Td className="whitespace-nowrap text-[13px]">{formatDate(r.needed_from)} – {formatDate(r.needed_until)}</Td>
                        <Td><RequestStatusBadge status={r.status} /></Td>
                        <Td>
                          <div className="flex justify-end gap-1.5">
                            {r.status === 'pending' && <>
                              <Button size="sm" variant="success" icon={Check} loading={busy === r.id} disabled={!r.can_fulfil}
                                title={r.can_fulfil ? 'Approve and reserve stock' : 'Not enough stock to approve'}
                                onClick={() => act(r.id, () => approveRequest(r.id), `${r.request_code} approved — stock reserved`)}>Approve</Button>
                              <Button size="sm" variant="danger-outline" icon={X} onClick={() => setRejecting(r)}>Reject</Button>
                            </>}
                            {r.status === 'approved' && <>
                              <Button size="sm" icon={PackageCheck} onClick={() => setIssuing(r)}>Issue</Button>
                              <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>Cancel</Button>
                            </>}
                          </div>
                        </Td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50"><td colSpan={7} className="border-b border-line px-6 pb-5 pt-1">
                          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
                            <div className="overflow-hidden rounded-xl border border-line bg-white">
                              <table className="w-full text-sm">
                                <thead><tr className="bg-slate-50 text-xs uppercase tracking-wider text-muted"><th className="px-3 py-2 text-left">Component</th><th className="px-3 py-2 text-right">Requested</th><th className="px-3 py-2 text-right">Available now</th></tr></thead>
                                <tbody>{(r.items || []).map((i) => (
                                  <tr key={i.item_id} className="border-t border-line">
                                    <td className="px-3 py-2">{i.name}</td><td className="px-3 py-2 text-right font-mono">{i.qty}</td>
                                    <td className={cx('px-3 py-2 text-right font-mono', r.status === 'pending' && i.available_qty < i.qty && 'font-semibold text-bad')}>{i.available_qty}</td>
                                  </tr>))}</tbody>
                              </table>
                            </div>
                            <dl className="space-y-2 text-sm">
                              <div><dt className="text-xs text-muted">Purpose</dt><dd>{r.purpose}{r.project_name && <> · <Badge tone="info">{r.project_name}</Badge></>}</dd></div>
                              {r.note && <div><dt className="text-xs text-muted">Note from student</dt><dd className="italic">“{r.note}”</dd></div>}
                              <div><dt className="text-xs text-muted">Student</dt><dd>{r.requester_name} · {r.requester_email}</dd></div>
                              <div><dt className="text-xs text-muted">Submitted</dt><dd>{formatDateTime(r.created_at)}</dd></div>
                              {r.reviewed_at && <div><dt className="text-xs text-muted">Reviewed</dt><dd>{formatDateTime(r.reviewed_at)}</dd></div>}
                              {r.rejection_reason && <div><dt className="text-xs text-muted">Rejection reason</dt><dd className="text-bad">{r.rejection_reason}</dd></div>}
                              {r.due_date && <div><dt className="text-xs text-muted">Due back</dt><dd>{formatDate(r.due_date)}</dd></div>}
                            </dl>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </Table>
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
      <div className="mb-3 flex flex-wrap gap-2">
        {REASONS.map((x) => <button key={x} type="button" onClick={() => setReason(x)} className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-brand">{x}</button>)}
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
      <p className="mb-2 text-sm font-semibold">{r.requester_name}</p>
      <ul className="mb-4 divide-y divide-line rounded-xl border border-line text-sm">
        {(r.items || []).map((i) => <li key={i.item_id} className="flex justify-between px-3 py-2"><span>{i.name}</span><span className="font-mono">× {i.qty}</span></li>)}
      </ul>
      <Input type="date" label="Due date" min={today} value={due} onChange={(e) => setDue(e.target.value)} hint={`Student asked for ${formatDate(r.needed_until)}`} />
      <div className="mt-3"><InlineError>{error}</InlineError></div>
    </Modal>
  )
}
