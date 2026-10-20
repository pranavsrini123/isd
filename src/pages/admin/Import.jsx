import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Archive, CheckCheck, Download, FileSpreadsheet, FolderKanban, Link2, PackagePlus, RotateCcw, SkipForward } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import {
  applyReadySourceRecords, applySourceRecord, listCategories, listInventory, listSourceBatches, listSourceRecords,
  projectLinksNeedingReview, retireDemoInventory, revertSourceRecord, skipSourceRecord,
} from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { useToast } from '../../context/ToastContext'
import {
  Badge, Button, Card, EmptyState, ErrorState, InlineError, PageHeader, SkeletonRows, StatCard, Table, Tabs, Td, Th, cx,
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
const STATUS = {
  ready: { label: 'Ready', tone: 'ok' },
  needs_review: { label: 'Needs review', tone: 'warn' },
  applied: { label: 'Applied', tone: 'info' },
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
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = records.filter((r) => r.flags?.length).map((r) => [
    r.source_section, r.source_page, r.source_row, r.source_serial, r.original_name, r.qty_reported, r.qty_isd_lab,
    r.qty_old_project, r.qty_available_reported, r.remarks, (r.flags || []).join('; '), r.review_notes, r.status, r.item_name,
  ].map(esc).join(','))
  return [cols.join(','), ...rows].join('\n')
}

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
  return (
    <div>
      <PageHeader eyebrow="Inventory" title="Audit import" back={{ to: '/admin/inventory', label: 'Inventory' }}
        subtitle="Review each line of the stock audit before it changes inventory. Stock moves through the audited adjustment workflow and can be reverted."
        actions={<>
          <Button variant="outline" icon={Download} onClick={download} disabled={!all.length}>Discrepancies CSV</Button>
          <Button variant="outline" icon={Archive} onClick={() => setConfirm('retire')}>Retire demo items</Button>
          <Button icon={CheckCheck} onClick={() => setConfirm('bulk')} disabled={!bulkable}>Apply reconciled ({bulkable})</Button>
        </>} />

      {batches.error ? <Card><ErrorState error={batches.error} onRetry={batches.refetch} /></Card>
        : batches.data && batches.data.length === 0 ? (
          <Card><EmptyState icon={FileSpreadsheet} title="No audit loaded">
            Run the audit data migration (supabase/migrations/0008_…) in the Supabase SQL editor, then reload this page.
          </EmptyState></Card>
        ) : (
          <>
            <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Source rows" value={all.length} loading={recs.isInitialLoading}
                hint={`${all.filter((r) => r.source_section === 'special_equipment').length} special · ${all.filter((r) => r.source_section === 'small_components').length} small`} />
              <StatCard label="Needs review" value={count('needs_review')} accent="warn" loading={recs.isInitialLoading} hint="Discrepancy or decision" />
              <StatCard label="Ready" value={count('ready')} accent="ok" loading={recs.isInitialLoading} hint="Numbers reconcile" />
              <StatCard label="Applied" value={count('applied')} accent="cyan" loading={recs.isInitialLoading} hint="In live inventory" />
              <StatCard label="Skipped" value={count('skipped')} loading={recs.isInitialLoading} hint="Not imported" />
            </div>

            <Card padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
                <Tabs value={tab} onChange={setTab} tabs={[
                  { value: 'needs_review', label: 'Needs review', count: count('needs_review') },
                  { value: 'ready', label: 'Ready', count: count('ready') },
                  { value: 'applied', label: 'Applied', count: count('applied') },
                  { value: 'skipped', label: 'Skipped', count: count('skipped') },
                  { value: 'all', label: 'All', count: all.length },
                ]} />
                {batches.data?.length > 1 && (
                  <Select aria-label="Audit" value={batch} onChange={(e) => setBatch(e.target.value)}
                    options={batches.data.map((b) => ({ value: b.batch_key, label: b.batch_key }))} />
                )}
              </div>
              <div className="grid gap-3 border-b border-line p-4 md:grid-cols-[1fr_200px_200px]">
                <SearchInput value={text} onChange={setText} placeholder="Search item name or No." />
                <Select aria-label="Section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="Both sections"
                  options={Object.entries(SECTION).map(([value, label]) => ({ value, label }))} />
                <Select aria-label="Issue" value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="Any issue"
                  options={Object.entries(FLAG_LABELS).map(([value, f]) => ({ value, label: f.label }))} />
              </div>
              {doc && <p className="border-b border-line px-4 py-2 text-xs text-muted">Source: {doc.source_doc} · batch {batch}</p>}
              {recs.error ? <ErrorState error={recs.error} onRetry={recs.refetch} />
                : recs.isInitialLoading ? <SkeletonRows rows={8} />
                : rows.length === 0 ? <EmptyState icon={FileSpreadsheet} title="Nothing here">No rows match these filters.</EmptyState>
                : (
                  <Table className={cx(recs.loading && 'opacity-70')}>
                    <thead><tr>
                      <Th>No.</Th><Th>Item (as written)</Th><Th>Source quantities</Th><Th>Proposed</Th><Th>Issues</Th><Th>Inventory item</Th><Th>Status</Th><Th className="text-right">Action</Th>
                    </tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="align-top hover:bg-slate-50">
                          <Td className="font-mono text-xs text-muted">{r.source_serial}<br /><span className="whitespace-nowrap">p.{r.source_page}</span></Td>
                          <Td>
                            <p className="font-semibold">{r.original_name}</p>
                            <p className="text-xs text-muted">{SECTION[r.source_section]}{r.category_name ? ` · ${r.category_name}` : ''}</p>
                            {r.remarks && <p className="text-xs text-warn">Remark: “{r.remarks}”</p>}
                          </Td>
                          <Td className="whitespace-nowrap font-mono text-xs">{sourceQty(r)}</Td>
                          <Td className="whitespace-nowrap text-xs">
                            {r.proposed_available} avail.{r.proposed_damaged ? ` · ${r.proposed_damaged} damaged` : ''}
                            <br /><span className={r.proposed_requestable ? 'text-muted' : 'text-warn'}>{r.proposed_requestable ? 'Borrowable' : 'Lab use only'}</span>
                          </Td>
                          <Td><div className="flex max-w-56 flex-wrap gap-1">{(r.flags || []).map((f) => <Badge key={f} tone={FLAG_LABELS[f]?.tone}>{FLAG_LABELS[f]?.label || f}</Badge>)}</div></Td>
                          <Td className="text-xs">
                            {r.item_id ? <span className="font-medium">{r.item_name}{r.item_is_archived ? ' (archived)' : ''}</span>
                              : r.suggested_item_id ? <span className="text-muted">Possible match: {r.suggested_item_name} ({Math.round(r.suggested_score * 100)}%){r.suggested_is_demo ? ' · demo' : ''}</span>
                              : <span className="text-muted">New item</span>}
                          </Td>
                          <Td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></Td>
                          <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setOpen(r.id)}>{r.status === 'applied' || r.status === 'skipped' ? 'View' : 'Review'}</Button></Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
            </Card>

            <ProjectLinks q={links} />
          </>
        )}

      {current && <ReviewModal rec={current} onClose={() => setOpen(null)} onDone={() => { setOpen(null); refresh() }} />}
      <ConfirmDialog open={confirm === 'bulk'} onClose={() => setConfirm(null)} onConfirm={runBulk} loading={busy}
        title={`Apply ${bulkable} reconciled rows?`} confirmLabel="Apply">
        Creates a new inventory item for each row whose numbers reconcile, has no remark and does not look like an
        existing item. Stock is added with the audit row as the reason. Rows that need a decision are not touched.
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'retire'} onClose={() => setConfirm(null)} onConfirm={runRetire} loading={busy}
        title="Retire demo inventory?" confirmLabel="Archive demo items" tone="danger">
        <p>Archives demo items that have no reserved or borrowed stock and are not linked to an applied audit row. Nothing is deleted; archived items keep their history and can be restored from Inventory.</p>
        <Toggle className="mt-3" checked={withProjects} onChange={setWithProjects} label="Also archive demo projects" />
      </ConfirmDialog>
    </div>
  )
}

function ProjectLinks({ q }) {
  const list = q.data || []
  return (
    <Card className="mt-6">
      <div className="mb-3 flex items-center gap-2"><FolderKanban className="h-5 w-5 text-brand" /><h2 className="font-display text-lg font-bold">Project requirements to check</h2></div>
      <p className="mb-4 text-sm text-muted">Projects that still require demo, archived or lab-use-only items. Re-link them to the imported items so readiness is accurate.</p>
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} />
        : q.isInitialLoading ? <SkeletonRows rows={3} />
        : list.length === 0 ? <p className="text-sm text-muted">No project points at a demo, archived or lab-use-only item.</p>
        : (
          <ul className="divide-y divide-line">
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{p.name} {p.is_demo && <Badge className="ml-1">Demo</Badge>} <Badge tone={p.status === 'published' ? 'info' : 'neutral'} className="ml-1">{p.status}</Badge></p>
                  <p className="mt-1 text-xs text-muted">
                    {p.links.map((l) => `${l.item?.name} ×${l.qty_required} (${[l.item?.is_demo && 'demo', l.item?.is_archived && 'archived', l.item?.is_requestable === false && 'lab use only'].filter(Boolean).join(', ')})`).join(' · ')}
                  </p>
                </div>
                <Button size="sm" variant="outline" icon={Link2} to={`/admin/projects/${p.id}`}>Edit requirements</Button>
              </li>
            ))}
          </ul>
        )}
    </Card>
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
  return (
    <Modal open onClose={onClose} size="xl" title={rec.original_name}
      description={`${SECTION[rec.source_section]} · page ${rec.source_page} · No. ${rec.source_serial} · row ${rec.source_row} of the section`}
      footer={done ? (
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" icon={RotateCcw} loading={saving} onClick={() => act(revertSourceRecord, rec.status === 'applied' ? 'Row reverted' : 'Row re-opened')}>
            {rec.status === 'applied' ? 'Revert' : 'Re-open'}
          </Button>
        </>
      ) : (
        <>
          <Button variant="outline" icon={SkipForward} loading={saving} onClick={() => act(skipSourceRecord, 'Row skipped')}>Skip row</Button>
          <Button icon={mode === 'new' ? PackagePlus : Link2} loading={saving} onClick={apply}>{mode === 'new' ? 'Create item and apply' : 'Apply to selected item'}</Button>
        </>
      )}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section>
          <h3 className="label-caps mb-2">Source (unchanged)</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
            <dt className="text-muted">As written</dt><dd className="font-medium">{rec.original_name}</dd>
            {rec.source_section === 'special_equipment' ? <><dt className="text-muted">Quantity</dt><dd className="font-mono">{rec.qty_reported ?? '–'}</dd></> : (
              <>
                <dt className="text-muted">Qty ISD Lab</dt><dd className="font-mono">{rec.qty_isd_lab ?? '–'}</dd>
                <dt className="text-muted">Qty from old project</dt><dd className="font-mono">{rec.qty_old_project ?? '–'}</dd>
              </>
            )}
            <dt className="text-muted">Available</dt><dd className="font-mono">{rec.qty_available_reported ?? '–'}</dd>
            <dt className="text-muted">Remarks</dt><dd>{rec.remarks || '—'}</dd>
            {rec.received_date && <><dt className="text-muted">Received</dt><dd>{rec.received_date}</dd></>}
            <dt className="text-muted">Document</dt><dd className="text-xs">{rec.source_doc}</dd>
          </dl>
          {(rec.flags || []).length > 0 && (
            <div className="mt-4 rounded-xl border border-warn/30 bg-warn-bg/40 p-4 text-sm">
              <p className="mb-2 flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="h-4 w-4" /> Check before applying</p>
              <div className="mb-2 flex flex-wrap gap-1">{rec.flags.map((f) => <Badge key={f} tone={FLAG_LABELS[f]?.tone}>{FLAG_LABELS[f]?.label || f}</Badge>)}</div>
              {rec.review_notes && <p className="text-ink">{rec.review_notes}</p>}
            </div>
          )}
        </section>

        <section>
          {done ? (
            <div className="space-y-3 text-sm">
              <h3 className="label-caps">{rec.status === 'applied' ? 'Applied' : 'Skipped'}</h3>
              <p className="text-muted">{rec.applied_at ? formatDateTime(rec.applied_at) : ''}</p>
              {rec.status === 'applied' && (
                <>
                  <p>Linked to <Link to="/admin/inventory" className="font-semibold text-brand hover:underline">{rec.item_name}</Link>{av.created_item ? ' (created by this import)' : ''}.</p>
                  <StockDelta before={av.before} after={av.after} />
                  {av.note && <p>Note: {av.note}</p>}
                  <p className="text-xs text-muted">Revert puts stock back exactly as it was, provided nothing else changed this item since. An item created by the import is archived, not deleted.</p>
                </>
              )}
              {rec.status === 'skipped' && <p>Reason: {av.skip_reason}</p>}
              <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={rec.status === 'applied' ? 'e.g. Linked to the wrong item' : 'e.g. Decided to import it'} maxLength={300} />
            </div>
          ) : (
            <div className="space-y-4">
              <Tabs value={mode} onChange={setMode} tabs={[{ value: 'existing', label: 'Update an existing item' }, { value: 'new', label: 'Create a new item' }]} />
              {mode === 'existing' ? (
                <div className="space-y-2">
                  <SearchInput value={itemSearch} onChange={setItemSearch} placeholder="Search inventory" />
                  <Select aria-label="Inventory item" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="Choose an item" options={options} />
                  {rec.suggested_item_id && <p className="text-xs text-muted">Suggested by name similarity ({Math.round(rec.suggested_score * 100)}%): {rec.suggested_item_name}{rec.suggested_is_demo ? ' — this is a demo item; prefer creating a new item unless real projects use it' : ''}. Confirm it is really the same component.</p>}
                  {target && (
                    <p className="rounded-lg bg-slate-50 p-2 text-xs text-muted">
                      Now: {target.available_qty} available · {target.reserved_qty} reserved · {target.borrowed_qty} on loan · {target.damaged_qty} damaged · {target.lost_qty} lost.
                      Reserved, on-loan and lost units are kept as they are.
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Available (usable, not on loan)" type="number" min={0} value={form.available} onChange={set('available')} />
                <Input label="Damaged" type="number" min={0} value={form.damaged} onChange={set('damaged')} />
              </div>
              <div className="rounded-xl border border-line p-3">
                <Toggle checked={form.requestable} onChange={(v) => setForm((f) => ({ ...f, requestable: v }))} label="Available for borrowing" />
                <p className="mt-1 text-xs text-muted">{form.requestable ? 'Students can request it.' : 'Lab use only: visible to students, but it cannot be requested and does not count toward project readiness.'}</p>
              </div>
              <Textarea label="Note (optional)" value={form.note} onChange={set('note')} rows={2} maxLength={300} placeholder="e.g. Recounted on 14/10 — 13 confirmed" />
              <p className="text-xs text-muted">Units allocated to a project are not a separate stock bucket. If a student or project holds them, record a request and loan for them rather than counting them as available.</p>
              <Textarea label="Reason if skipping" value={reason} onChange={(e) => setReason(e.target.value)} rows={1} maxLength={300} placeholder="Only needed for Skip row" />
            </div>
          )}
          <div className="mt-3"><InlineError>{error}</InlineError></div>
        </section>
      </div>
    </Modal>
  )
}

function StockDelta({ before, after }) {
  if (!before || !after) return null
  const keys = [['total', 'Total'], ['available', 'Available'], ['reserved', 'Reserved'], ['borrowed', 'On loan'], ['damaged', 'Damaged'], ['lost', 'Lost']]
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-muted"><th className="text-left font-medium" /><th className="text-right font-medium">Before</th><th className="text-right font-medium">After</th></tr></thead>
      <tbody>
        {keys.map(([k, label]) => (
          <tr key={k} className={cx(before[k] !== after[k] && 'font-semibold')}>
            <td className="py-0.5">{label}</td><td className="text-right font-mono">{before[k]}</td><td className="text-right font-mono">{after[k]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
