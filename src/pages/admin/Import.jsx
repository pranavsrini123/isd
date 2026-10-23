import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, Archive, CheckCheck, Download, FileSpreadsheet, FolderKanban, Link2, MessageSquareText, PackageCheck,
  PackagePlus, RotateCcw, SkipForward, Sparkles,
} from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import {
  applyReadySourceRecords, applySourceRecord, listCategories, listInventory, listSourceBatches, listSourceRecords,
  projectLinksNeedingReview, retireDemoInventory, revertSourceRecord, skipSourceRecord,
} from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { toCsv } from '../../lib/csv'
import { useToast } from '../../context/ToastContext'
import {
  Badge, Button, Card, EmptyState, ErrorState, IconTile, InlineError, PageHeader, SkeletonRows, StatCard, Table, Tabs, Td, Th, cx,
} from '../../components/ui/primitives'
import { Input, SearchInput, Select, Textarea, Toggle } from '../../components/ui/forms'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'

export const FLAG_LABELS = {
  quantity_mismatch: { label: 'Quantity mismatch', tone: 'bad' },
  damaged: { label: 'Damaged', tone: 'bad' },
  allocated: { label: 'Allocated to project', tone: 'warn' },
  duplicate_serial: { label: 'Duplicate No.', tone: 'warn' },
  unclear_name: { label: 'Unclear name', tone: 'warn' },
  zero_available: { label: 'None available', tone: 'neutral' },
  borrowing_policy: { label: 'Borrowing policy', tone: 'info' },
}
// Same colours as the summary cards: amber to review, green ready, cyan applied, grey skipped.
const STATUS = {
  ready: { label: 'Ready', tone: 'ok' },
  needs_review: { label: 'Needs review', tone: 'warn' },
  applied: { label: 'Applied', tone: 'cyan' },
  skipped: { label: 'Skipped', tone: 'neutral' },
}
const SECTION = { special_equipment: 'Special equipment', small_components: 'Small components' }

export function sourceQty(r) {
  return r.source_section === 'special_equipment'
    ? `Qty ${r.qty_reported ?? '–'} · avail. ${r.qty_available_reported ?? '–'}`
    : `ISD ${r.qty_isd_lab ?? '–'} + old ${r.qty_old_project ?? '–'} · avail. ${r.qty_available_reported ?? '–'}`
}

/** Builds the discrepancy CSV from the records currently in the database. */
export function discrepancyCsv(records) {
  const cols = ['section', 'page', 'row', 'serial', 'original_name', 'qty_reported', 'qty_isd_lab', 'qty_old_project',
    'qty_available_reported', 'remarks', 'flags', 'review_notes', 'status', 'linked_item']
  const rows = records.filter((r) => r.flags?.length).map((r) => ({
    section: r.source_section, page: r.source_page, row: r.source_row, serial: r.source_serial, original_name: r.original_name,
    qty_reported: r.qty_reported, qty_isd_lab: r.qty_isd_lab, qty_old_project: r.qty_old_project,
    qty_available_reported: r.qty_available_reported, remarks: r.remarks, flags: (r.flags || []).join('; '),
    review_notes: r.review_notes, status: r.status, linked_item: r.item_name,
  }))
  return toCsv(rows, cols)
}

// ------------------------------------------------------------------ Row pieces (table + phone list)
/** The audit's own numbers (the words of sourceQty()), figures in mono: what was counted, then what was available. */
function SourceQty({ r }) {
  const v = (x) => <span className="num font-semibold text-ink">{x ?? '–'}</span>
  return (
    <div className="text-muted">
      <p>{r.source_section === 'special_equipment' ? <>Qty {v(r.qty_reported)}</> : <>ISD {v(r.qty_isd_lab)} + old {v(r.qty_old_project)}</>}</p>
      <p className="mt-0.5">avail. {v(r.qty_available_reported)}</p>
    </div>
  )
}

function Proposed({ r }) {
  return (
    <>
      <p className="text-muted"><span className="num font-semibold text-ink">{r.proposed_available}</span> avail.</p>
      {r.proposed_damaged ? <p className="mt-0.5 text-bad"><span className="num font-semibold">{r.proposed_damaged}</span> damaged</p> : null}
      <p className={cx('mt-0.5', r.proposed_requestable ? 'text-muted' : 'font-medium text-warn')}>{r.proposed_requestable ? 'Borrowable' : 'Lab use only'}</p>
    </>
  )
}

function Flags({ flags, className }) {
  if (!flags?.length) return <span className="text-subtle" aria-hidden>—</span>
  return (
    <div className={cx('flex flex-wrap gap-1', className)}>
      {flags.map((f) => <Badge key={f} tone={FLAG_LABELS[f]?.tone} dot>{FLAG_LABELS[f]?.label || f}</Badge>)}
    </div>
  )
}

function Target({ r }) {
  if (r.item_id) {
    return (
      <span className="flex items-start gap-1.5 font-medium text-ink">
        <Link2 className="mt-px h-3.5 w-3.5 flex-none text-brand" aria-hidden />
        <span className="min-w-0 [overflow-wrap:anywhere]">{r.item_name}{r.item_is_archived ? ' (archived)' : ''}</span>
      </span>
    )
  }
  if (r.suggested_item_id) {
    return (
      <span className="flex items-start gap-1.5 text-muted">
        <Sparkles className="mt-px h-3.5 w-3.5 flex-none text-warn" aria-hidden />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          Possible match: <span className="font-medium text-ink">{r.suggested_item_name}</span> (<span className="num">{Math.round(r.suggested_score * 100)}%</span>){r.suggested_is_demo ? ' · demo' : ''}
        </span>
      </span>
    )
  }
  return <span className="flex items-center gap-1.5 text-muted"><PackagePlus className="h-3.5 w-3.5 flex-none" aria-hidden />New item</span>
}

const StatusBadge = ({ status }) => <Badge tone={STATUS[status].tone} dot>{STATUS[status].label}</Badge>
const isDone = (r) => r.status === 'applied' || r.status === 'skipped'

// ------------------------------------------------------------------ Page
export default function AdminImport() {
  const toast = useToast()
  const batches = useQuery(() => listSourceBatches(), [])
  const [batch, setBatch] = useState('')
  useEffect(() => { if (!batch && batches.data?.length) setBatch(batches.data[0].batch_key) }, [batches.data, batch])
  const recs = useQuery(() => (batch ? listSourceRecords(batch) : Promise.resolve([])), [batch], { enabled: !!batch })
  const links = useQuery(() => projectLinksNeedingReview(), [])
  useRealtime(['inventory_items'], () => { recs.refetch(); links.refetch() })

  const [tab, setTab] = useState('needs_review')
  const [section, setSection] = useState('')
  const [flag, setFlag] = useState('')
  const [text, setText] = useState('')
  const q = useDebounce(text, 200).trim().toLowerCase()
  const [open, setOpen] = useState(null)
  const [confirm, setConfirm] = useState(null) // 'bulk' | 'retire'
  const [withProjects, setWithProjects] = useState(false)
  const [busy, setBusy] = useState(false)

  const all = useMemo(() => recs.data || [], [recs.data])
  const count = (s) => all.filter((r) => r.status === s).length
  const bulkable = all.filter((r) => r.status === 'ready' && !r.suggested_item_id).length
  const rows = all.filter((r) => (tab === 'all' || r.status === tab)
    && (!section || r.source_section === section)
    && (!flag || r.flags?.includes(flag))
    && (!q || r.original_name.toLowerCase().includes(q) || r.display_name.toLowerCase().includes(q) || r.source_serial === q))
  const current = open && all.find((r) => r.id === open)

  function refresh() { recs.refetch(); links.refetch() }

  async function runBulk() {
    setBusy(true)
    try {
      const n = await applyReadySourceRecords(batch)
      toast.success(`${n} reconciled row${n === 1 ? '' : 's'} applied`)
      setConfirm(null)
      refresh()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  async function runRetire() {
    setBusy(true)
    try {
      const r = await retireDemoInventory(withProjects)
      toast.success(`Archived ${r.items_archived} demo item(s)${withProjects ? ` and ${r.projects_archived} demo project(s)` : ''}`
        + (r.items_still_in_use ? ` · ${r.items_still_in_use} still in use were kept` : ''))
      setConfirm(null)
      refresh()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  function download() {
    const blob = new Blob([discrepancyCsv(all)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${batch}-discrepancies.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const doc = batches.data?.find((b) => b.batch_key === batch)
  const many = batches.data?.length > 1
  const loadingStats = recs.isInitialLoading
  return (
    <div>
      <PageHeader eyebrow="Inventory" title="Audit import" back={{ to: '/admin/inventory', label: 'Inventory' }}
        subtitle="Review each line of the stock audit before it changes inventory. Stock moves through the audited adjustment workflow and can be reverted."
        actions={<>
          <Button variant="outline" icon={Download} onClick={download} disabled={!all.length} className="flex-1 sm:flex-none">Discrepancies CSV</Button>
          <Button variant="outline" icon={Archive} onClick={() => setConfirm('retire')} className="flex-1 sm:flex-none">Retire demo items</Button>
          <Button icon={CheckCheck} onClick={() => setConfirm('bulk')} disabled={!bulkable} className="flex-1 sm:flex-none">
            <span>Apply reconciled (<span className="num">{bulkable}</span>)</span>
          </Button>
        </>}>
        {(doc || many) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {doc && (
              <p className="inline-flex min-w-0 max-w-full items-start gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-muted">
                <FileSpreadsheet className="mt-px h-4 w-4 flex-none text-brand" aria-hidden />
                <span className="min-w-0 break-words">
                  Source: <span className="font-semibold text-ink">{doc.source_doc}</span> · batch <span className="num text-ink">{batch}</span>
                </span>
              </p>
            )}
            {many && (
              <Select aria-label="Audit" value={batch} onChange={(e) => setBatch(e.target.value)} className="w-full sm:w-72"
                options={batches.data.map((b) => ({ value: b.batch_key, label: b.batch_key }))} />
            )}
          </div>
        )}
      </PageHeader>

      {batches.error ? <Card><ErrorState error={batches.error} onRetry={batches.refetch} /></Card>
        : batches.data && batches.data.length === 0 ? (
          <Card><EmptyState icon={FileSpreadsheet} title="No audit loaded">
            Run the audit data migration (supabase/migrations/0008_…) in the Supabase SQL editor, then reload this page.
          </EmptyState></Card>
        ) : (
          <>
            {/* Summary: phone shows the total on its own row, then the four statuses in pairs. */}
            <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5 xl:gap-4">
              <div className="col-span-2 xl:col-span-1">
                <StatCard label="Source rows" value={all.length} loading={loadingStats}
                  hint={<><span className="num">{all.filter((r) => r.source_section === 'special_equipment').length}</span> special · <span className="num">{all.filter((r) => r.source_section === 'small_components').length}</span> small</>} />
              </div>
              <StatCard label="Needs review" value={count('needs_review')} accent="warn" loading={loadingStats} hint="Discrepancy or decision" />
              <StatCard label="Ready" value={count('ready')} accent="ok" loading={loadingStats} hint="Numbers reconcile" />
              <StatCard label="Applied" value={count('applied')} accent="cyan" loading={loadingStats} hint="In live inventory" />
              <StatCard label="Skipped" value={count('skipped')} accent="none" loading={loadingStats} hint="Not imported" />
            </div>

            <Card padded={false} className="overflow-hidden">
              <Tabs value={tab} onChange={setTab} className="px-2 sm:px-3" tabs={[
                { value: 'needs_review', label: 'Needs review', count: count('needs_review') },
                { value: 'ready', label: 'Ready', count: count('ready') },
                { value: 'applied', label: 'Applied', count: count('applied') },
                { value: 'skipped', label: 'Skipped', count: count('skipped') },
                { value: 'all', label: 'All', count: all.length },
              ]} />
              {/* Toolbar. Phone: search on top, the two filters side by side. */}
              <div className="grid grid-cols-2 gap-2.5 border-b border-line bg-slate-50/60 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_200px_200px] md:gap-3">
                <SearchInput className="col-span-2 md:col-span-1" value={text} onChange={setText} placeholder="Search item name or No." />
                <Select aria-label="Section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="Both sections"
                  options={Object.entries(SECTION).map(([value, label]) => ({ value, label }))} />
                <Select aria-label="Issue" value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="Any issue"
                  options={Object.entries(FLAG_LABELS).map(([value, f]) => ({ value, label: f.label }))} />
              </div>

              {recs.error ? <ErrorState error={recs.error} onRetry={recs.refetch} />
                : recs.isInitialLoading ? <SkeletonRows rows={8} />
                : rows.length === 0 ? <EmptyState icon={FileSpreadsheet} title="Nothing here">No rows match these filters.</EmptyState>
                : (
                  <div className={cx(recs.loading && 'opacity-70')}>
                    {/* Tablet and desktop: one dense table row per source record. */}
                    <div className="hidden md:block">
                      <Table>
                        <thead><tr>
                          <Th>No.</Th><Th>Item (as written)</Th><Th><span className="whitespace-normal">Source quantities</span></Th><Th>Proposed</Th><Th>Issues</Th><Th><span className="whitespace-normal">Inventory item</span></Th><Th>Status</Th><Th className="text-right">Action</Th>
                        </tr></thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.id}>
                              <Td className="whitespace-nowrap">
                                <span className="num block text-[13px] font-semibold text-ink">{r.source_serial}</span>
                                <span className="num block text-[11px] text-subtle">p.{r.source_page}</span>
                              </Td>
                              <Td className="min-w-[200px] max-w-[340px]">
                                <p className="font-semibold leading-snug text-ink">{r.original_name}</p>
                                <p className="mt-0.5 text-xs text-muted">{SECTION[r.source_section]}{r.category_name ? ` · ${r.category_name}` : ''}</p>
                                {r.remarks && (
                                  <p className="mt-1 flex items-start gap-1 text-xs text-warn">
                                    <MessageSquareText className="mt-px h-3.5 w-3.5 flex-none" aria-hidden /><span className="min-w-0">Remark: “{r.remarks}”</span>
                                  </p>
                                )}
                              </Td>
                              <Td className="w-px whitespace-nowrap text-xs"><SourceQty r={r} /></Td>
                              <Td className="w-px whitespace-nowrap text-xs"><Proposed r={r} /></Td>
                              <Td><Flags flags={r.flags} className="min-w-[124px] max-w-[200px]" /></Td>
                              <Td className="min-w-[112px] max-w-[230px] text-xs"><Target r={r} /></Td>
                              <Td className="w-px whitespace-nowrap"><StatusBadge status={r.status} /></Td>
                              <Td className="w-px text-right">
                                <Button size="sm" variant="outline" onClick={() => setOpen(r.id)}>{isDone(r) ? 'View' : 'Review'}</Button>
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>

                    {/* Phone: stacked records, no sideways scroll. */}
                    <ul className="divide-y divide-line md:hidden">
                      {rows.map((r) => (
                        <li key={r.id} className="px-4 py-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="num text-[11px] text-subtle"><span className="font-semibold text-ink">{r.source_serial}</span> · p.{r.source_page}</p>
                              <p className="mt-0.5 break-words font-semibold leading-snug text-ink">{r.original_name}</p>
                              <p className="mt-0.5 text-xs text-muted">{SECTION[r.source_section]}{r.category_name ? ` · ${r.category_name}` : ''}</p>
                            </div>
                            <StatusBadge status={r.status} />
                          </div>
                          {r.remarks && <p className="mt-1.5 break-words text-xs text-warn">Remark: “{r.remarks}”</p>}
                          <dl className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                            <div className="min-w-0 rounded-lg bg-slate-50 px-2.5 py-2 ring-1 ring-inset ring-line">
                              <dt className="mb-0.5 text-[11px] font-medium text-subtle">Source quantities</dt>
                              <dd><SourceQty r={r} /></dd>
                            </div>
                            <div className="min-w-0 rounded-lg bg-slate-50 px-2.5 py-2 ring-1 ring-inset ring-line">
                              <dt className="mb-0.5 text-[11px] font-medium text-subtle">Proposed</dt>
                              <dd><Proposed r={r} /></dd>
                            </div>
                          </dl>
                          <div className="mt-2.5 flex items-end justify-between gap-3 text-xs">
                            <div className="min-w-0 space-y-2">
                              {r.flags?.length > 0 && <Flags flags={r.flags} />}
                              <Target r={r} />
                            </div>
                            <Button size="sm" variant="outline" className="flex-none" onClick={() => setOpen(r.id)}>{isDone(r) ? 'View' : 'Review'}</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </Card>

            <ProjectLinks q={links} />
          </>
        )}

      {current && <ReviewModal rec={current} onClose={() => setOpen(null)} onDone={() => { setOpen(null); refresh() }} />}
      <ConfirmDialog open={confirm === 'bulk'} onClose={() => setConfirm(null)} onConfirm={runBulk} loading={busy}
        title={<>Apply <span className="num">{bulkable}</span> reconciled rows?</>} confirmLabel="Apply">
        Creates a new inventory item for each row whose numbers reconcile, has no remark and does not look like an
        existing item. Stock is added with the audit row as the reason. Rows that need a decision are not touched.
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'retire'} onClose={() => setConfirm(null)} onConfirm={runRetire} loading={busy}
        title="Retire demo inventory?" confirmLabel="Archive demo items" tone="danger">
        <p>Archives demo items that have no reserved or borrowed stock and are not linked to an applied audit row. Nothing is deleted; archived items keep their history and can be restored from Inventory.</p>
        <div className="mt-4 rounded-xl border border-line bg-slate-50 p-3">
          <Toggle checked={withProjects} onChange={setWithProjects} label="Also archive demo projects" />
        </div>
      </ConfirmDialog>
    </div>
  )
}

// ------------------------------------------------------------------ Project links
function ProjectLinks({ q }) {
  const list = q.data || []
  return (
    <Card className="mt-6 overflow-hidden" padded={false}>
      <div className="flex items-start gap-3 border-b border-line px-4 py-4 sm:px-5">
        <IconTile icon={FolderKanban} size="sm" />
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            Project requirements to check
            {list.length > 0 && <span className="num rounded-full bg-warn-bg px-2 py-px text-[11.5px] font-semibold text-warn">{list.length}</span>}
          </h2>
          <p className="mt-0.5 text-sm text-muted">Projects that still require demo, archived or lab-use-only items. Re-link them to the imported items so readiness is accurate.</p>
        </div>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} />
        : q.isInitialLoading ? <SkeletonRows rows={3} />
        : list.length === 0 ? <p className="px-4 py-5 text-sm text-muted sm:px-5">No project points at a demo, archived or lab-use-only item.</p>
        : (
          <ul className="divide-y divide-line">
            {list.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 break-words font-semibold text-ink">{p.name}</p>
                    {p.is_demo && <Badge>Demo</Badge>}
                    <Badge tone={p.status === 'published' ? 'info' : 'neutral'}>{p.status}</Badge>
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.links.map((l, i) => (
                      <li key={`${l.item?.name}-${i}`} className="inline-flex max-w-full flex-wrap items-baseline gap-x-1 rounded-md bg-slate-50 px-2 py-0.5 text-xs ring-1 ring-inset ring-line">
                        <span className="min-w-0 break-words font-medium text-ink">{l.item?.name}</span>
                        <span className="num text-ink">×{l.qty_required}</span>
                        <span className="text-muted">({[l.item?.is_demo && 'demo', l.item?.is_archived && 'archived', l.item?.is_requestable === false && 'lab use only'].filter(Boolean).join(', ')})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button size="sm" variant="outline" icon={Link2} to={`/admin/projects/${p.id}`} className="self-start sm:self-auto">Edit requirements</Button>
              </li>
            ))}
          </ul>
        )}
    </Card>
  )
}

// ------------------------------------------------------------------ Review dialog
function SourceFigure({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-0.5 text-xl font-semibold leading-tight text-ink">{value ?? '–'}</dd>
    </div>
  )
}

function ReviewModal({ rec, onClose, onDone }) {
  const toast = useToast()
  const done = rec.status === 'applied' || rec.status === 'skipped'
  const [mode, setMode] = useState(rec.suggested_item_id ? 'existing' : 'new')
  const [itemId, setItemId] = useState(rec.suggested_item_id || '')
  const [itemSearch, setItemSearch] = useState('')
  const dq = useDebounce(itemSearch, 250)
  const items = useQuery(() => listInventory({ search: dq, archived: false, pageSize: 30 }), [dq], { enabled: !done && mode === 'existing' })
  const cats = useQuery(() => listCategories(), [])
  const [form, setForm] = useState({
    name: rec.display_name, category: rec.category_name, available: rec.proposed_available, damaged: rec.proposed_damaged,
    requestable: rec.proposed_requestable, note: '',
  })
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const options = useMemo(() => {
    const list = items.data?.data || []
    const opts = list.map((i) => ({ value: i.id, label: `${i.name}${i.is_demo ? ' (demo)' : ''} · ${i.available_qty} avail.` }))
    if (rec.suggested_item_id && !opts.some((o) => o.value === rec.suggested_item_id)) {
      opts.unshift({ value: rec.suggested_item_id, label: `${rec.suggested_item_name} (suggested)` })
    }
    return opts
  }, [items.data, rec.suggested_item_id, rec.suggested_item_name])
  const target = mode === 'existing' ? (items.data?.data || []).find((i) => i.id === itemId) : null

  async function apply() {
    setError('')
    const available = Number(form.available)
    const damaged = Number(form.damaged)
    if (!Number.isInteger(available) || available < 0 || !Number.isInteger(damaged) || damaged < 0) return setError('Quantities must be whole numbers, 0 or more.')
    if (mode === 'existing' && !itemId) return setError('Choose the inventory item this row describes, or create a new item.')
    if (mode === 'new' && !form.name.trim()) return setError('Give the new item a name.')
    setSaving(true)
    try {
      await applySourceRecord({
        recordId: rec.id, itemId: mode === 'existing' ? itemId : null, available, damaged, requestable: form.requestable,
        name: mode === 'new' ? form.name.trim() : null, category: mode === 'new' ? form.category : null, note: form.note.trim() || null,
      })
      toast.success('Row applied to inventory')
      onDone()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  async function act(fn, msg) {
    setError('')
    if (reason.trim().length < 3) return setError('Give a short reason; it is kept in the activity log.')
    setSaving(true)
    try { await fn(rec.id, reason.trim()); toast.success(msg); onDone() } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const av = rec.applied_values || {}
  const n = (v) => <span className="num font-semibold text-ink">{v}</span>
  return (
    <Modal open onClose={onClose} size="xl" title={rec.original_name}
      description={<>{SECTION[rec.source_section]} · page <span className="num">{rec.source_page}</span> · No. <span className="num">{rec.source_serial}</span> · row <span className="num">{rec.source_row}</span> of the section</>}
      footer={done ? (
        <>
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Close</Button>
          <Button variant="outline" icon={RotateCcw} loading={saving} className="flex-1 sm:flex-none" onClick={() => act(revertSourceRecord, rec.status === 'applied' ? 'Row reverted' : 'Row re-opened')}>
            {rec.status === 'applied' ? 'Revert' : 'Re-open'}
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" icon={SkipForward} loading={saving} onClick={() => act(skipSourceRecord, 'Row skipped')} className="flex-1 sm:mr-auto sm:flex-none">Skip row</Button>
          <Button icon={mode === 'new' ? PackagePlus : Link2} loading={saving} onClick={apply} className="flex-1 sm:flex-none">{mode === 'new' ? 'Create item and apply' : 'Apply to selected item'}</Button>
        </>
      )}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-6">
        {/* Left: what the audit document says, read-only. */}
        <section className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-xl border border-line bg-slate-50 p-4">
            <h3 className="label-caps mb-3">Source (unchanged)</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted">As written</dt>
                <dd className="mt-0.5 break-words font-semibold text-ink">{rec.original_name}</dd>
              </div>
              <div className={cx('grid gap-2', rec.source_section === 'special_equipment' ? 'grid-cols-2' : 'grid-cols-3')}>
                {rec.source_section === 'special_equipment' ? <SourceFigure label="Quantity" value={rec.qty_reported} /> : (
                  <>
                    <SourceFigure label="Qty ISD Lab" value={rec.qty_isd_lab} />
                    <SourceFigure label="Qty from old project" value={rec.qty_old_project} />
                  </>
                )}
                <SourceFigure label="Available" value={rec.qty_available_reported} />
              </div>
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-line pt-3">
                <dt className="text-muted">Remarks</dt><dd className="break-words">{rec.remarks || '—'}</dd>
                {rec.received_date && <><dt className="text-muted">Received</dt><dd>{rec.received_date}</dd></>}
                <dt className="text-muted">Document</dt><dd className="break-words text-xs leading-5">{rec.source_doc}</dd>
              </div>
            </dl>
          </div>
          {(rec.flags || []).length > 0 && (
            <div className="rounded-xl border border-warn/30 bg-warn-bg/45 p-4 text-sm">
              <p className="mb-2 flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="h-4 w-4" aria-hidden /> Check before applying</p>
              <Flags flags={rec.flags} className="mb-2" />
              {rec.review_notes && <p className="leading-relaxed text-ink">{rec.review_notes}</p>}
            </div>
          )}
        </section>

        {/* Right: the decision. */}
        <section className="min-w-0">
          {done ? (
            <div className="space-y-4 text-sm">
              <div className="space-y-3 rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge status={rec.status} />
                  <p className="text-xs text-muted">{rec.applied_at ? formatDateTime(rec.applied_at) : ''}</p>
                </div>
                {rec.status === 'applied' && (
                  <>
                    <p className="flex items-start gap-2">
                      <PackageCheck className="mt-0.5 h-4 w-4 flex-none text-brand" aria-hidden />
                      <span>Linked to <Link to="/admin/inventory" className="font-semibold text-brand transition-colors hover:text-brand-dark hover:underline">{rec.item_name}</Link>{av.created_item ? ' (created by this import)' : ''}.</span>
                    </p>
                    <StockDelta before={av.before} after={av.after} />
                    {av.note && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px]">Note: {av.note}</p>}
                    <p className="text-xs leading-relaxed text-muted">Revert puts stock back exactly as it was, provided nothing else changed this item since. An item created by the import is archived, not deleted.</p>
                  </>
                )}
                {rec.status === 'skipped' && <p>Reason: {av.skip_reason}</p>}
              </div>
              <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={rec.status === 'applied' ? 'e.g. Linked to the wrong item' : 'e.g. Decided to import it'} maxLength={300} />
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1. Which inventory item this row becomes. */}
              <div className="space-y-3">
                <Tabs value={mode} onChange={setMode} tabs={[{ value: 'existing', label: 'Update an existing item' }, { value: 'new', label: 'Create a new item' }]} />
                {mode === 'existing' ? (
                  <div className="space-y-2.5">
                    <SearchInput value={itemSearch} onChange={setItemSearch} placeholder="Search inventory" />
                    <Select aria-label="Inventory item" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="Choose an item" options={options} />
                    {rec.suggested_item_id && (
                      <p className="flex items-start gap-2 rounded-lg bg-cyan-soft/45 px-3 py-2 text-xs leading-relaxed text-muted ring-1 ring-inset ring-brand/10">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-none text-brand" aria-hidden />
                        <span>Suggested by name similarity (<span className="num">{Math.round(rec.suggested_score * 100)}%</span>): <span className="font-semibold text-ink">{rec.suggested_item_name}</span>{rec.suggested_is_demo ? ' — this is a demo item; prefer creating a new item unless real projects use it' : ''}. Confirm it is really the same component.</span>
                      </p>
                    )}
                    {target && (
                      <p className="rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs leading-relaxed text-muted">
                        Now: {n(target.available_qty)} available · {n(target.reserved_qty)} reserved · {n(target.borrowed_qty)} on loan · {n(target.damaged_qty)} damaged · {n(target.lost_qty)} lost.
                        <span className="block">Reserved, on-loan and lost units are kept as they are.</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Item name" value={form.name} onChange={set('name')} maxLength={160} hint="Formatting cleaned only; correct spelling if you are sure." className="sm:col-span-2" />
                    <Select label="Category" value={form.category} onChange={set('category')}
                      options={[...new Set([rec.category_name, ...(cats.data || []).map((c) => c.name)])].map((c) => ({ value: c, label: c }))} />
                  </div>
                )}
              </div>

              {/* 2. Stock and borrowing. */}
              <div className="space-y-3 border-t border-line pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Available (usable, not on loan)" type="number" min={0} value={form.available} onChange={set('available')} className="[&_input]:num" />
                  <Input label="Damaged" type="number" min={0} value={form.damaged} onChange={set('damaged')} className="[&_input]:num" />
                </div>
                <div className={cx('rounded-xl border p-3', form.requestable ? 'border-line bg-white' : 'border-warn/30 bg-warn-bg/35')}>
                  <Toggle checked={form.requestable} onChange={(v) => setForm((f) => ({ ...f, requestable: v }))} label="Available for borrowing" />
                  <p className="mt-1.5 pl-[54px] text-xs leading-relaxed text-muted">{form.requestable ? 'Students can request it.' : 'Lab use only: visible to students, but it cannot be requested and does not count toward project readiness.'}</p>
                </div>
              </div>

              {/* 3. Note for the activity log. */}
              <div className="space-y-2 border-t border-line pt-4">
                <Textarea label="Note (optional)" value={form.note} onChange={set('note')} rows={2} maxLength={300} placeholder="e.g. Recounted on 14/10 — 13 confirmed" />
                <p className="text-xs leading-relaxed text-muted">Units allocated to a project are not a separate stock bucket. If a student or project holds them, record a request and loan for them rather than counting them as available.</p>
              </div>

              {/* Only used by Skip row. */}
              <div className="rounded-xl border border-dashed border-line-strong bg-slate-50/70 p-3.5">
                <Textarea label="Reason if skipping" value={reason} onChange={(e) => setReason(e.target.value)} rows={1} maxLength={300} placeholder="Only needed for Skip row" />
              </div>
            </div>
          )}
          {error && <div className="mt-4"><InlineError>{error}</InlineError></div>}
        </section>
      </div>
    </Modal>
  )
}

function StockDelta({ before, after }) {
  if (!before || !after) return null
  const keys = [['total', 'Total'], ['available', 'Available'], ['reserved', 'Reserved'], ['borrowed', 'On loan'], ['damaged', 'Damaged'], ['lost', 'Lost']]
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-muted">
          <tr className="border-b border-line">
            <th className="px-3 py-1.5 text-left font-medium" />
            <th className="px-3 py-1.5 text-right font-medium">Before</th>
            <th className="px-3 py-1.5 text-right font-medium">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {keys.map(([k, label]) => {
            const changed = before[k] !== after[k]
            return (
              <tr key={k} className={cx(changed ? 'bg-cyan-soft/35 font-semibold text-ink' : 'text-muted')}>
                <td className="px-3 py-1.5">{label}</td>
                <td className="num px-3 py-1.5 text-right">{before[k]}</td>
                <td className={cx('num px-3 py-1.5 text-right', changed && 'text-brand')}>{after[k]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
