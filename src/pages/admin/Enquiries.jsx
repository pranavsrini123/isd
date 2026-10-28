import { Fragment, useEffect, useState } from 'react'
import { ChevronRight, Download, HelpCircle, Save } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { useToast } from '../../context/ToastContext'
import { enquiryCounts, listEnquiries, updateEnquiryStatus } from '../../lib/api'
import { ENQUIRY_STATUS, formatDateTime, timeAgo } from '../../lib/format'
import { toCsv } from '../../lib/csv'
import { downloadCsv } from '../../lib/download'
import { Button, Card, EmptyState, ErrorState, InlineError, PageHeader, Pagination, SkeletonRows, Tabs, cx } from '../../components/ui/primitives'
import { SearchInput, Select, Textarea } from '../../components/ui/forms'
import { Modal } from '../../components/ui/Modal'
import { EnquiryStatusBadge } from '../../components/domain/badges'

const PAGE_SIZE = 20
const TABS = ['open', 'in_progress', 'resolved', 'closed', 'all']
const label = (s) => (s === 'all' ? 'All' : ENQUIRY_STATUS[s]?.label || s)

/** "2026-10-28 15:35 IST": sortable in Excel, and in the lab's time zone. */
export function csvTime(value) {
  if (!value) return ''
  const d = new Date(new Date(value).getTime() + 330 * 60000)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} IST`
}

/** Rows from enquiry_overview -> the downloadable log (one line per enquiry). Pure (tested). */
export function enquiryLogCsv(rows) {
  const out = (rows || []).map((e) => ({
    'Enquiry ID': e.enquiry_code,
    'Student name': e.student_name,
    'Registration number': e.registration_number,
    'Email ID': e.email,
    Department: e.department,
    'Enquiry description': e.description,
    'Submitted at': csvTime(e.created_at),
    'Current status': label(e.status),
    'Resolution note': e.resolution_note || '',
    'Last handled by': e.handled_by_name || '',
    'Last updated': csvTime(e.updated_at),
    'Status history': (e.history || []).map((h) =>
      `${csvTime(h.at)}: ${h.from ? `${label(h.from)} -> ` : ''}${label(h.to)}${h.by ? ` (${h.by})` : ''}${h.note ? ` - ${h.note}` : ''}`).join(' | '),
  }))
  const cols = ['Enquiry ID', 'Student name', 'Registration number', 'Email ID', 'Department', 'Enquiry description', 'Submitted at',
    'Current status', 'Resolution note', 'Last handled by', 'Last updated', 'Status history']
  return toCsv(out, cols)
}

export default function AdminEnquiries() {
  const toast = useToast()
  const [f, setF] = useSearchState({ status: 'open', search: '', page: 1 })
  const status = TABS.includes(f.status) ? f.status : 'open'
  const [text, setText] = useState(f.search)
  const dq = useDebounce(text, 300)
  useEffect(() => { if (dq !== f.search) setF({ search: dq, page: 1 }) }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useQuery(() => listEnquiries({ status: status === 'all' ? '' : status, search: f.search, page: f.page, pageSize: PAGE_SIZE }), [status, f.search, f.page])
  const counts = useQuery(() => enquiryCounts(), [])
  useRealtime(['enquiries'], () => { list.refetch(); counts.refetch() })
  const [open, setOpen] = useState(null)
  const [exporting, setExporting] = useState(false)
  const rows = list.data?.data || []

  async function exportLog() {
    setExporting(true)
    try {
      const all = await listEnquiries({ status: status === 'all' ? '' : status, search: f.search, all: true })
      const data = all.data || all
      downloadCsv(enquiryLogCsv(data), `enquiry-log-${status}-${new Date().toISOString().slice(0, 10)}.csv`)
      toast.success(`Downloaded ${data.length} ${data.length === 1 ? 'enquiry' : 'enquiries'}`)
    } catch (e) { toast.error(e) } finally { setExporting(false) }
  }

  return (
    <div>
      <PageHeader title="Enquiries" subtitle="Questions from students about components, availability and projects. Nothing here reserves stock."
        actions={<Button variant="outline" icon={Download} loading={exporting} onClick={exportLog}>Download log</Button>} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-6">
        <Tabs className="min-w-0 lg:flex-1" value={status} onChange={(s) => setF({ status: s, page: 1 })}
          tabs={TABS.map((s) => ({ value: s, label: label(s), count: counts.data ? counts.data[s] || 0 : undefined }))} />
        <SearchInput className="w-full lg:mb-1 lg:w-80 lg:flex-none" value={text} onChange={setText} placeholder="Code, student, email or text" />
      </div>
      <p className="mb-3 text-xs text-muted">Download log exports every enquiry in the current filter, with its full status history, as a CSV file for Excel.</p>

      <Card padded={false} className="overflow-hidden">
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={6} />
          : rows.length === 0 ? <EmptyState icon={HelpCircle} title={`No ${status === 'all' ? '' : label(status).toLowerCase() + ' '}enquiries`}>New enquiries from students appear here instantly.</EmptyState>
          : (
            <ul className="divide-y divide-line">
              {rows.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => setOpen(e)} data-enquiry={e.enquiry_code}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 px-4 py-3.5 text-left transition-colors hover:bg-slate-50/80 sm:grid-cols-[7rem_minmax(0,12rem)_minmax(0,1fr)_auto_auto] sm:items-center">
                    <span className="num text-[13.5px] font-semibold text-ink">{e.enquiry_code}</span>
                    <span className="justify-self-end sm:order-4 sm:justify-self-start"><EnquiryStatusBadge status={e.status} /></span>
                    <span className="col-span-2 min-w-0 sm:order-2 sm:col-span-1">
                      <span className="block truncate text-sm font-medium text-ink">{e.student_name}</span>
                      <span className="block truncate text-xs text-muted"><span className="num">{e.registration_number}</span> · {e.department}</span>
                    </span>
                    <span className="col-span-2 line-clamp-2 text-[13px] leading-snug text-ink sm:order-3 sm:col-span-1">{e.description}</span>
                    <span className="col-span-2 flex items-center justify-between gap-2 text-xs text-muted sm:order-5 sm:col-span-1 sm:justify-end">
                      {timeAgo(e.created_at)}<ChevronRight className="h-4 w-4 flex-none text-subtle" aria-hidden />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </Card>
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={list.data?.count} onPage={(page) => setF({ page })} />

      {open && <EnquiryDrawer enquiry={rows.find((r) => r.id === open.id) || open} onClose={() => setOpen(null)}
        onSaved={() => { list.refetch(); counts.refetch() }} />}
    </div>
  )
}

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'].map((s) => ({ value: s, label: label(s) }))

function EnquiryDrawer({ enquiry: e, onClose, onSaved }) {
  const toast = useToast()
  const [status, setStatus] = useState(e.status)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const closed = e.status === 'closed'

  async function save() {
    setError('')
    if (status === e.status && !note.trim()) return setError('Choose a different status or add a note.')
    setSaving(true)
    try {
      await updateEnquiryStatus(e.id, status, note.trim())
      toast.success(`${e.enquiry_code} updated`)
      setNote('')
      onSaved()
      onClose()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open side onClose={onClose} title={e.enquiry_code} description={`Submitted ${formatDateTime(e.created_at)}`}
      footer={closed ? <Button variant="outline" onClick={onClose}>Close</Button>
        : <><Button variant="outline" onClick={onClose}>Back</Button><Button icon={Save} loading={saving} onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><EnquiryStatusBadge status={e.status} />{e.handled_by_name && <span className="text-xs text-muted">Last handled by {e.handled_by_name}</span>}</div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {[['Student', e.student_name], ['Registration number', e.registration_number], ['Email ID', e.email], ['Department', e.department]].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="label-caps mb-0.5">{k}</dt><dd className="break-words text-ink">{v}</dd></div>
          ))}
        </dl>
        <div>
          <p className="label-caps mb-1">Enquiry</p>
          <p className="whitespace-pre-wrap break-words rounded-lg border-l-2 border-cyan bg-white py-2 pl-3 pr-2 text-sm leading-relaxed text-ink">{e.description}</p>
        </div>

        {!closed ? (
          <div className="space-y-3 rounded-xl border border-line bg-slate-50/70 p-4">
            <Select label="Status" value={status} onChange={(ev) => setStatus(ev.target.value)} options={STATUS_OPTIONS}
              hint={status === 'closed' ? 'Closed is final: the enquiry can no longer be changed (it stays on record).' : undefined} />
            <Textarea label="Internal note" value={note} onChange={(ev) => setNote(ev.target.value)} rows={3} maxLength={1000}
              hint="Optional. Visible to lab staff only, and included in the downloaded log." />
            <InlineError>{error}</InlineError>
          </div>
        ) : <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-muted">This enquiry is closed. It stays on record and in the log.</p>}

        <div>
          <p className="label-caps mb-2">History</p>
          <ol className="space-y-3">
            {(e.history || []).map((h, i) => (
              <li key={i} className="relative pl-5 text-sm before:absolute before:left-0 before:top-[7px] before:h-2 before:w-2 before:rounded-full before:bg-cyan">
                <p className="text-ink">
                  {h.from ? <Fragment><span className="font-medium">{label(h.from)}</span> → </Fragment> : 'Submitted as '}
                  <span className="font-medium">{label(h.to)}</span>
                  {h.by && <span className="text-muted"> · {h.by}</span>}
                </p>
                <p className="text-xs text-muted">{formatDateTime(h.at)}</p>
                {h.note && <p className={cx('mt-1 break-words rounded-md bg-white px-2.5 py-1.5 text-[13px] text-ink ring-1 ring-inset ring-line')}>{h.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  )
}
