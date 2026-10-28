import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronRight, FileDown, FileSignature, PackageOpen, X } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { decideTakeaway, getTakeawayLetter, listTakeaways, markTakeawayDocumentReceived, takeawayCounts } from '../../lib/api'
import { TAKEAWAY_STATUS, formatDate, formatDateTime, timeAgo } from '../../lib/format'
import { buildTakeawayLetter, letterFileName } from '../../lib/takeawayLetter'
import { downloadPdf } from '../../lib/download'
import { Button, Card, EmptyState, ErrorState, InlineError, PageHeader, Pagination, SkeletonRows, Tabs, cx } from '../../components/ui/primitives'
import { SearchInput, Textarea } from '../../components/ui/forms'
import { Modal } from '../../components/ui/Modal'
import { TakeawayStatusBadge } from '../../components/domain/badges'

const PAGE_SIZE = 20
const SUPER_TABS = ['pending', 'approved', 'submitted', 'rejected', 'all']
const ADMIN_TABS = ['approved', 'submitted', 'rejected', 'all']
export const takeawayTabsFor = (superAdmin) => (superAdmin ? SUPER_TABS : ADMIN_TABS)
const TAB_LABEL = { pending: 'Pending approval', approved: 'Approved · letter out', submitted: 'Signed letter received', rejected: 'Rejected', all: 'All' }

export default function AdminTakeaway() {
  const { isSuperAdmin } = useAuth()
  const tabs = takeawayTabsFor(isSuperAdmin)
  const [f, setF] = useSearchState({ status: tabs[0], search: '', page: 1 })
  const status = tabs.includes(f.status) ? f.status : tabs[0]
  const [text, setText] = useState(f.search)
  const dq = useDebounce(text, 300)
  useEffect(() => { if (dq !== f.search) setF({ search: dq, page: 1 }) }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useQuery(() => listTakeaways({ status: status === 'all' ? '' : status, search: f.search, page: f.page, pageSize: PAGE_SIZE }), [status, f.search, f.page])
  const counts = useQuery(() => takeawayCounts(), [])
  useRealtime(['takeaway_requests'], () => { list.refetch(); counts.refetch() })
  const [open, setOpen] = useState(null)
  const [dialog, setDialog] = useState(null) // { kind: 'approve'|'reject'|'received', r }
  const rows = list.data?.data || []
  const refresh = () => { list.refetch(); counts.refetch() }

  return (
    <div>
      <PageHeader title="Component take-away"
        subtitle={isSuperAdmin
          ? 'Approve or reject requests to take components outside the lab. Students download the permission letter only after your approval.'
          : 'Approved take-away permissions. When a student hands in the signed letter, record it here. Approvals are made by the Super Admin.'} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-6">
        <Tabs className="min-w-0 lg:flex-1" value={status} onChange={(s) => setF({ status: s, page: 1 })}
          tabs={tabs.map((s) => ({ value: s, label: TAB_LABEL[s], count: counts.data ? counts.data[s] || 0 : undefined }))} />
        <SearchInput className="w-full lg:mb-1 lg:w-80 lg:flex-none" value={text} onChange={setText} placeholder="Code, student or email" />
      </div>

      <Card padded={false} className="overflow-hidden">
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={6} />
          : rows.length === 0 ? <EmptyState icon={PackageOpen} title="Nothing here">{status === 'pending' ? 'New take-away requests appear here for approval.' : 'No take-away requests match this filter.'}</EmptyState>
          : (
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <Row key={r.id} r={r} expanded={open === r.id} canDecide={isSuperAdmin}
                  onToggle={() => setOpen(open === r.id ? null : r.id)} onAct={(kind) => setDialog({ kind, r })} />
              ))}
            </ul>
          )}
      </Card>
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={list.data?.count} onPage={(page) => setF({ page })} />
      {dialog && <ActionDialog {...dialog} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh() }} />}
    </div>
  )
}

function Row({ r, expanded, canDecide, onToggle, onAct }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try { const data = await getTakeawayLetter(r.id); downloadPdf(buildTakeawayLetter(data), letterFileName(data)) }
    catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  const items = r.items || []
  return (
    <li data-takeaway={r.request_code} className={cx(expanded && 'bg-slate-50/80 shadow-[inset_3px_0_0_var(--color-cyan)]')}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5 px-4 py-3.5">
        <button onClick={onToggle} aria-expanded={expanded} aria-label={`Details for ${r.request_code}`}
          className={cx('flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors', expanded ? 'bg-cyan-soft text-brand' : 'text-muted hover:bg-slate-200/70 hover:text-ink')}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="num text-[13.5px] font-semibold text-ink">{r.request_code}</span>
            <TakeawayStatusBadge status={r.status} />
            <span className="text-xs text-muted">{timeAgo(r.created_at)}</span>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-ink">{r.student_name} <span className="font-normal text-muted">· <span className="num">{r.registration_number}</span> · {r.department}</span></p>
          <p className="mt-1 line-clamp-2 text-[13px] text-ink">
            {items.map((i, k) => <span key={i.item_id}>{k > 0 && ', '}{i.name} <span className="num font-medium text-muted">×{i.qty}</span></span>)}
          </p>
          <p className="mt-1 text-xs text-muted">Take-away {formatDate(r.takeaway_date)}{r.expected_return_date ? ` · return ${formatDate(r.expected_return_date)}` : ''}</p>
        </div>
        <div className="flex w-full flex-wrap gap-1.5 pl-11 sm:w-auto sm:pl-0">
          {r.status === 'pending' && canDecide && <>
            <Button size="sm" variant="success" icon={Check} onClick={() => onAct('approve')}>Approve</Button>
            <Button size="sm" variant="danger-outline" icon={X} onClick={() => onAct('reject')}>Reject</Button>
          </>}
          {r.status === 'approved' && <Button size="sm" icon={FileSignature} onClick={() => onAct('received')}>Signed letter received</Button>}
          {(r.status === 'approved' || r.status === 'submitted') && <Button size="sm" variant="outline" icon={FileDown} loading={busy} onClick={download}>Letter</Button>}
        </div>
      </div>
      {expanded && (
        <div className="grid gap-4 px-4 pb-5 pl-[3.75rem] text-sm lg:grid-cols-2">
          <dl className="space-y-3">
            <div><dt className="label-caps mb-0.5">Purpose</dt><dd className="whitespace-pre-wrap break-words text-ink">{r.purpose}</dd></div>
            {r.additional_info && <div><dt className="label-caps mb-0.5">Additional information</dt><dd className="whitespace-pre-wrap break-words text-ink">{r.additional_info}</dd></div>}
            <div><dt className="label-caps mb-0.5">Student</dt><dd className="break-words text-ink">{r.student_name} · {r.email}</dd></div>
            {r.decided_at && <div><dt className="label-caps mb-0.5">Decision</dt><dd className="text-ink">{TAKEAWAY_STATUS[r.status === 'submitted' ? 'approved' : r.status]?.label} by {r.decided_by_name}, {formatDateTime(r.decided_at)}{r.decision_note ? ` — ${r.decision_note}` : ''}</dd></div>}
            {r.document_received_at && <div><dt className="label-caps mb-0.5">Signed letter</dt><dd className="text-ink">Received by {r.document_received_by_name}, {formatDateTime(r.document_received_at)}</dd></div>}
          </dl>
          <div>
            <p className="label-caps mb-2">History</p>
            <ol className="space-y-2">
              {(r.history || []).map((h, i) => (
                <li key={i} className="text-[13px] text-ink">
                  <span className="font-medium">{TAKEAWAY_STATUS[h.to]?.label || h.to}</span>
                  <span className="text-muted"> · {formatDateTime(h.at)}{h.by ? ` · ${h.by}` : ''}</span>
                  {h.note && <p className="text-muted">{h.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  )
}

function ActionDialog({ kind, r, onClose, onDone }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const cfg = {
    approve: { title: `Approve ${r.request_code}`, button: 'Approve', variant: 'success', noteLabel: 'Note for the student (optional, printed on the letter)',
      description: 'The student can then download the permission letter. No stock is moved.' },
    reject: { title: `Reject ${r.request_code}`, button: 'Reject', variant: 'danger', noteLabel: 'Reason (required, shown to the student)',
      description: `${r.student_name} will see this reason.` },
    received: { title: `Signed letter for ${r.request_code}`, button: 'Record as received', variant: 'primary', noteLabel: 'Note (optional)',
      description: 'Confirm you have the paper letter signed by the Chairperson and the Associate Chairperson.' },
  }[kind]

  async function submit() {
    setError('')
    if (kind === 'reject' && note.trim().length < 3) return setError('Give the student a short reason.')
    setSaving(true)
    try {
      if (kind === 'received') await markTakeawayDocumentReceived(r.id, note.trim())
      else await decideTakeaway(r.id, kind === 'approve', note.trim())
      toast.success(kind === 'approve' ? `${r.request_code} approved` : kind === 'reject' ? `${r.request_code} rejected` : `Signed letter recorded for ${r.request_code}`)
      onDone()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={cfg.title} description={cfg.description}
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button variant={cfg.variant} loading={saving} onClick={submit}>{cfg.button}</Button></>}>
      <Textarea label={cfg.noteLabel} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} required={kind === 'reject'} />
      <div className="mt-3"><InlineError>{error}</InlineError></div>
    </Modal>
  )
}
