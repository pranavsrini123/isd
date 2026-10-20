import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Boxes, FileSpreadsheet, History, ImagePlus, Pencil, Plus, Settings2, SlidersHorizontal, Tags, Trash2 } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import {
  adjustStock, createCategory, createItem, deleteCategory, getItemProjects, itemHistory, itemSourceRecords, listCategories, listInventory,
  renameCategory, setItemArchived, updateItem, uploadImage,
} from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, ErrorState, InlineError, PageHeader, Pagination, SkeletonRows, Table, Td, Th, cx } from '../../components/ui/primitives'
import { Input, SearchInput, Select, Textarea, Toggle } from '../../components/ui/forms'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { DemoBadge, StockBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'

const PAGE_SIZE = 20
const CONDITIONS = [{ value: 'new', label: 'New' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'needs_repair', label: 'Needs repair' }]

export default function AdminInventory() {
  const toast = useToast()
  const [f, setF] = useSearchState({ search: '', category: '', stock: '', archived: false, page: 1 })
  const [text, setText] = useState(f.search)
  const dq = useDebounce(text, 300)
  useEffect(() => { if (dq !== f.search) setF({ search: dq }) }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useQuery(() => listCategories(), [])
  const list = useQuery(() => listInventory({ search: f.search, categoryId: f.category, stock: f.stock, archived: f.archived, page: f.page, pageSize: PAGE_SIZE }),
    [f.search, f.category, f.stock, f.archived, f.page])
  useRealtime(['inventory_items'], list.refetch)

  const [editing, setEditing] = useState(null) // item | 'new'
  const [adjusting, setAdjusting] = useState(null)
  const [history, setHistory] = useState(null)
  const [archiving, setArchiving] = useState(null)
  const [catsOpen, setCatsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rows = list.data?.data || []

  async function toggleArchive() {
    setBusy(true)
    try {
      await setItemArchived(archiving.id, !archiving.is_archived)
      toast.success(archiving.is_archived ? `${archiving.name} restored` : `${archiving.name} archived`)
      setArchiving(null)
      list.refetch()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Inventory management" subtitle="Catalogue, stock levels and adjustments. Every quantity change is logged."
        actions={<><Button to="/admin/import" variant="outline" icon={FileSpreadsheet}>Audit import</Button><Button variant="outline" icon={Tags} onClick={() => setCatsOpen(true)}>Categories</Button><Button icon={Plus} onClick={() => setEditing('new')}>Add item</Button></>} />

      <Card padded={false}>
        <div className="grid items-center gap-3 border-b border-line p-4 lg:grid-cols-[1fr_200px_180px_auto]">
          <SearchInput value={text} onChange={setText} placeholder="Search name, brand, asset ID" />
          <Select aria-label="Category" value={f.category} onChange={(e) => setF({ category: e.target.value })} placeholder="All categories" options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select aria-label="Stock" value={f.stock} onChange={(e) => setF({ stock: e.target.value })} placeholder="Any stock level"
            options={[{ value: 'in_stock', label: 'In stock' }, { value: 'low_stock', label: 'Low stock' }, { value: 'out_of_stock', label: 'Out of stock' }]} />
          <Toggle checked={f.archived} onChange={(v) => setF({ archived: v })} label="Archived" />
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={8} />
          : rows.length === 0 ? <EmptyState icon={Boxes} title={f.archived ? 'No archived items' : 'No items found'} action={!f.archived && <Button icon={Plus} onClick={() => setEditing('new')}>Add item</Button>}>
              {f.search || f.category || f.stock ? 'Try different filters.' : 'Add the first component to the catalogue.'}
            </EmptyState>
          : (
            <Table className={cx(list.loading && 'opacity-70')}>
              <thead><tr>
                <Th>Item</Th><Th className="text-right">Total</Th><Th className="text-right">Avail.</Th><Th className="text-right">Reserved</Th>
                <Th className="text-right">On loan</Th><Th className="text-right">Damaged</Th><Th className="text-right">Lost</Th><Th>Status</Th><Th className="text-right">Actions</Th>
              </tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Thumb path={i.image_path} name={i.name} category={i.category_name} className="h-10 w-10" />
                        <div className="min-w-0">
                          <p className="font-semibold">{i.name} <DemoBadge show={i.is_demo} />{!i.is_requestable && <Badge tone="warn" className="ml-1">Lab use only</Badge>}</p>
                          <p className="text-xs text-muted">{i.category_name}{i.storage_location ? ` · ${i.storage_location}` : ''}{i.asset_ids ? ` · ${i.asset_ids}` : ''}</p>
                          {i.remarks && <p className="text-xs text-warn">Note: {i.remarks}</p>}
                        </div>
                      </div>
                    </Td>
                    <Td className="text-right font-mono">{i.total_qty}</Td>
                    <Td className="text-right font-mono font-semibold">{i.available_qty}</Td>
                    <Td className="text-right font-mono text-muted">{i.reserved_qty}</Td>
                    <Td className="text-right font-mono text-muted">{i.borrowed_qty}</Td>
                    <Td className={cx('text-right font-mono', i.damaged_qty ? 'text-warn' : 'text-muted')}>{i.damaged_qty}</Td>
                    <Td className={cx('text-right font-mono', i.lost_qty ? 'text-bad' : 'text-muted')}>{i.lost_qty}</Td>
                    <Td>{i.is_archived ? <Badge>Archived</Badge> : <StockBadge status={i.stock_status} />}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Edit details" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Adjust stock" aria-label={`Adjust stock for ${i.name}`} onClick={() => setAdjusting(i)}><SlidersHorizontal className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="History" aria-label={`History for ${i.name}`} onClick={() => setHistory(i)}><History className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title={i.is_archived ? 'Restore' : 'Archive'} aria-label={`${i.is_archived ? 'Restore' : 'Archive'} ${i.name}`} onClick={() => setArchiving(i)}>
                          {i.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
      </Card>
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={list.data?.count} onPage={(page) => setF({ page })} />

      {editing && <ItemForm item={editing === 'new' ? null : editing} categories={cats.data || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.refetch() }} />}
      {adjusting && <AdjustForm item={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); list.refetch() }} />}
      {history && <HistoryDrawer item={history} onClose={() => setHistory(null)} />}
      {catsOpen && <CategoryManager onClose={() => { setCatsOpen(false); cats.refetch() }} />}
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} onConfirm={toggleArchive} loading={busy}
        title={archiving?.is_archived ? `Restore ${archiving?.name}?` : `Archive ${archiving?.name}?`} confirmLabel={archiving?.is_archived ? 'Restore' : 'Archive'} tone={archiving?.is_archived ? 'primary' : 'danger'}>
        {archiving?.is_archived ? 'The item will be visible to students again.'
          : 'Students will no longer see it and projects that need it will show it as unavailable. Loans in progress are not affected; history is kept.'}
      </ConfirmDialog>
    </div>
  )
}

function ItemForm({ item, categories, onClose, onSaved }) {
  const toast = useToast()
  const isNew = !item
  const [form, setForm] = useState(() => ({
    name: item?.name || '', category_id: item?.category_id || categories[0]?.id || '', brand_model: item?.brand_model || '',
    description: item?.description || '', asset_ids: item?.asset_ids || '', storage_location: item?.storage_location || '',
    condition: item?.condition || 'good', low_stock_threshold: item?.low_stock_threshold ?? 2, total_qty: 0,
    image_path: item?.image_path || null, is_requestable: item ? item.is_requestable !== false : true, remarks: item?.remarks || '',
    specs: Object.entries(item?.specifications || {}).map(([k, v]) => ({ k, v: String(v) })),
  }))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try { const path = await uploadImage(file, 'items'); setForm((f) => ({ ...f, image_path: path })) }
    catch (err) { toast.error(err) } finally { setUploading(false) }
  }

  async function save(e) {
    e.preventDefault()
    const v = {}
    if (!form.name.trim()) v.name = 'Required'
    if (!form.category_id) v.category_id = 'Choose a category'
    const thr = Number(form.low_stock_threshold)
    if (!Number.isInteger(thr) || thr < 0) v.low_stock_threshold = 'Whole number, 0 or more'
    const qty = Number(form.total_qty)
    if (isNew && (!Number.isInteger(qty) || qty < 0 || qty > 100000)) v.total_qty = 'Whole number, 0 or more'
    setErrors(v)
    if (Object.keys(v).length) return
    const payload = {
      name: form.name.trim(), category_id: form.category_id, brand_model: form.brand_model.trim() || null,
      description: form.description.trim() || null, asset_ids: form.asset_ids.trim() || null,
      storage_location: form.storage_location.trim() || null, condition: form.condition, low_stock_threshold: thr,
      image_path: form.image_path, is_requestable: form.is_requestable, remarks: form.remarks.trim() || null,
      specifications: Object.fromEntries(form.specs.filter((s) => s.k.trim()).map((s) => [s.k.trim(), s.v.trim()])),
    }
    setSaving(true)
    setError('')
    try {
      if (isNew) await createItem({ ...payload, total_qty: qty })
      else await updateItem(item.id, payload)
      toast.success(isNew ? `${payload.name} added` : 'Changes saved')
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Add inventory item' : `Edit ${item.name}`} size="lg"
      description={isNew ? 'Initial stock goes straight to "available". Use Adjust stock for later changes.' : 'Quantities are changed with Adjust stock, so they are always audited.'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} disabled={uploading}>{isNew ? 'Add item' : 'Save changes'}</Button></>}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input label="Name" value={form.name} onChange={set('name')} error={errors.name} required className="sm:col-span-2" maxLength={160} />
        <Select label="Category" value={form.category_id} onChange={set('category_id')} error={errors.category_id} options={categories.map((c) => ({ value: c.id, label: c.name }))} required />
        <Input label="Brand / model" value={form.brand_model} onChange={set('brand_model')} maxLength={160} />
        {isNew
          ? <Input label="Initial quantity" type="number" min={0} value={form.total_qty} onChange={set('total_qty')} error={errors.total_qty} />
          : <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-muted">Stock</p><p className="font-semibold">{item.available_qty} available of {item.total_qty}</p></div>}
        <Input label="Low-stock alert at" type="number" min={0} value={form.low_stock_threshold} onChange={set('low_stock_threshold')} error={errors.low_stock_threshold} hint="Shown as low stock at or below this" />
        <Input label="Storage location" value={form.storage_location} onChange={set('storage_location')} placeholder="e.g. Rack B, Bin 2" maxLength={80} />
        <Select label="Condition" value={form.condition} onChange={set('condition')} options={CONDITIONS} />
        <Input label="Asset IDs" value={form.asset_ids} onChange={set('asset_ids')} placeholder="e.g. ISD-MCU-0001..0010" className="sm:col-span-2" maxLength={200} />
        <Textarea label="Description" value={form.description} onChange={set('description')} className="sm:col-span-2" maxLength={4000} />
        <div className="sm:col-span-2 rounded-xl border border-line p-3">
          <Toggle checked={form.is_requestable} onChange={(v) => setForm((f) => ({ ...f, is_requestable: v }))} label="Available for borrowing" />
          <p className="mt-1 text-xs text-muted">{form.is_requestable ? 'Students can add this item to a request.' : 'Lab use only: students see the item but cannot request it, and it does not count toward project readiness.'}</p>
        </div>
        <Textarea label="Remarks" value={form.remarks} onChange={set('remarks')} className="sm:col-span-2" rows={2} maxLength={1000} hint="Internal note, e.g. from a stock audit. Shown to admins only." />
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-semibold">Image</p>
          <div className="flex items-center gap-4">
            <Thumb path={form.image_path} name={form.name || 'item'} className="h-16 w-16" />
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-[#CBD5E1] bg-white px-3.5 text-[13px] font-semibold hover:bg-slate-50">
              <ImagePlus className="h-4 w-4" /> {uploading ? 'Uploading…' : form.image_path ? 'Replace' : 'Upload'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile} disabled={uploading} />
            </label>
            {form.image_path && <Button size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, image_path: null }))}>Remove</Button>}
            <span className="text-xs text-muted">JPG, PNG or WebP · max 2 MB</span>
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between"><p className="text-sm font-semibold">Specifications</p>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setForm((f) => ({ ...f, specs: [...f.specs, { k: '', v: '' }] }))}>Add row</Button></div>
          {form.specs.length === 0 && <p className="text-sm text-muted">Optional key/value details such as voltage or interface.</p>}
          <div className="space-y-2">
            {form.specs.map((s, idx) => (
              <div key={idx} className="flex gap-2">
                <Input aria-label="Specification name" placeholder="e.g. Voltage" value={s.k} onChange={(e) => setForm((f) => ({ ...f, specs: f.specs.map((x, j) => (j === idx ? { ...x, k: e.target.value } : x)) }))} />
                <Input aria-label="Specification value" placeholder="e.g. 5 V" value={s.v} onChange={(e) => setForm((f) => ({ ...f, specs: f.specs.map((x, j) => (j === idx ? { ...x, v: e.target.value } : x)) }))} />
                <Button size="icon" variant="ghost" aria-label="Remove row" onClick={() => setForm((f) => ({ ...f, specs: f.specs.filter((_, j) => j !== idx) }))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>
        {error && <div className="sm:col-span-2"><InlineError>{error}</InlineError></div>}
      </form>
    </Modal>
  )
}

const ACTIONS = [
  { value: 'add_stock', label: 'Add new stock', help: 'New units arrived. Increases total and available.', from: null },
  { value: 'remove_available', label: 'Remove from available', help: 'Units taken out of service permanently (e.g. given away).', from: 'available_qty' },
  { value: 'mark_damaged', label: 'Mark available units as damaged', help: 'Moves units from available to damaged.', from: 'available_qty' },
  { value: 'repair_damaged', label: 'Repaired: damaged → available', help: 'Damaged units have been repaired and are available again.', from: 'damaged_qty' },
  { value: 'write_off_damaged', label: 'Write off damaged units', help: 'Damaged units disposed of. Reduces total.', from: 'damaged_qty' },
  { value: 'recover_lost', label: 'Found: lost → available', help: 'Missing units turned up.', from: 'lost_qty' },
  { value: 'write_off_lost', label: 'Write off lost units', help: 'Stop tracking units that will not come back. Reduces total.', from: 'lost_qty' },
]

function AdjustForm({ item, onClose, onSaved }) {
  const toast = useToast()
  const [action, setAction] = useState('add_stock')
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const a = ACTIONS.find((x) => x.value === action)
  const max = a.from ? item[a.from] : 100000

  async function save() {
    setError('')
    const n = Number(qty)
    if (!Number.isInteger(n) || n <= 0) return setError('Enter a whole number greater than zero.')
    if (n > max) return setError(`Only ${max} unit(s) can be moved for this action.`)
    if (reason.trim().length < 3) return setError('Give a short reason — it is kept in the audit log.')
    setSaving(true)
    try {
      await adjustStock(item.id, action, n, reason.trim())
      toast.success('Stock updated')
      onSaved()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Adjust stock · ${item.name}`} description="Changes are applied atomically and recorded with your name and reason."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Apply</Button></>}>
      <div className="mb-5 grid grid-cols-5 gap-2 text-center text-xs">
        {[['Total', item.total_qty], ['Avail.', item.available_qty], ['Reserved', item.reserved_qty], ['Damaged', item.damaged_qty], ['Lost', item.lost_qty]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-2"><p className="text-muted">{k}</p><p className="font-display text-lg font-bold">{v}</p></div>
        ))}
      </div>
      <div className="space-y-4">
        <Select label="Action" value={action} onChange={(e) => setAction(e.target.value)} options={ACTIONS.map((x) => ({ value: x.value, label: x.label, disabled: x.from && item[x.from] === 0 }))} hint={a.help} />
        <Input label="Quantity" type="number" min={1} max={max} value={qty} onChange={(e) => setQty(e.target.value)} hint={a.from ? `Up to ${max}` : undefined} />
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="e.g. Delivery from vendor, PO 2291" required />
        <InlineError>{error}</InlineError>
      </div>
    </Modal>
  )
}

function HistoryDrawer({ item, onClose }) {
  const h = useQuery(() => itemHistory(item.id), [item.id])
  const used = useQuery(() => getItemProjects(item.id), [item.id])
  const src = useQuery(() => itemSourceRecords(item.id), [item.id])
  return (
    <Modal open onClose={onClose} side title={item.name} description="Stock adjustments, edits and project usage">
      <h3 className="label-caps mb-2">Used by projects</h3>
      <div className="mb-6 flex flex-wrap gap-2">
        {(used.data || []).map((p) => <Badge key={p.id} tone={p.status === 'published' ? 'info' : 'neutral'}>{p.name} ×{p.qty_required}</Badge>)}
        {used.data && used.data.length === 0 && <p className="text-sm text-muted">Not used by any project.</p>}
      </div>
      {(src.data || []).length > 0 && (
        <>
          <h3 className="label-caps mb-2">Source records</h3>
          <ul className="mb-6 space-y-2">
            {src.data.map((r) => (
              <li key={r.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-medium">{r.original_name}</p>
                <p className="text-xs text-muted">{r.source_doc} · {r.source_section === 'special_equipment' ? 'Special equipment' : 'Small components'} · page {r.source_page} · No. {r.source_serial}</p>
                <p className="text-xs text-muted">
                  {r.qty_reported != null ? `Quantity ${r.qty_reported}` : `ISD Lab ${r.qty_isd_lab ?? '–'} · old project ${r.qty_old_project ?? '–'}`} · available {r.qty_available_reported ?? '–'}
                  {r.remarks ? ` · “${r.remarks}”` : ''} · {r.status}{r.applied_at ? ` ${formatDateTime(r.applied_at)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="label-caps mb-2">History</h3>
      {h.isInitialLoading ? <SkeletonRows rows={4} /> : h.error ? <ErrorState error={h.error} /> : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {(h.data || []).map((e) => (
            <li key={e.id}>
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
              <p className="text-sm font-medium">{e.summary}</p>
              {e.details?.reason && <p className="text-sm text-muted">Reason: {e.details.reason}</p>}
              <p className="text-xs text-muted">{formatDateTime(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ''}</p>
            </li>
          ))}
          {h.data?.length === 0 && <p className="text-sm text-muted">No recorded changes yet.</p>}
        </ol>
      )}
    </Modal>
  )
}

function CategoryManager({ onClose }) {
  const toast = useToast()
  const cats = useQuery(() => listCategories(), [])
  const [name, setName] = useState('')
  const [edit, setEdit] = useState({})
  async function run(fn, msg) {
    try { await fn(); toast.success(msg); cats.refetch() } catch (e) { toast.error(e.code === '23503' ? 'This category still has items. Move them first.' : e) }
  }
  return (
    <Modal open onClose={onClose} title="Categories" description="Group components for browsing and reports.">
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(() => createCategory(name), 'Category added').then(() => setName('')) }}>
        <Input aria-label="New category name" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Button type="submit" icon={Plus}>Add</Button>
      </form>
      <ul className="divide-y divide-line">
        {(cats.data || []).map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            {edit[c.id] !== undefined ? (
              <>
                <Input aria-label="Category name" value={edit[c.id]} onChange={(e) => setEdit({ ...edit, [c.id]: e.target.value })} />
                <Button size="sm" onClick={() => run(() => renameCategory(c.id, edit[c.id]), 'Renamed').then(() => setEdit({ ...edit, [c.id]: undefined }))}>Save</Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <Button size="icon" variant="ghost" aria-label={`Rename ${c.name}`} onClick={() => setEdit({ ...edit, [c.id]: c.name })}><Settings2 className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => run(() => deleteCategory(c.id), 'Category deleted')}><Trash2 className="h-4 w-4 text-bad" /></Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
