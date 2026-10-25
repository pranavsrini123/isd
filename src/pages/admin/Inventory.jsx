import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Boxes, FileSpreadsheet, History, ImagePlus, Pencil, Plus, Settings2, SlidersHorizontal, StickyNote, Tags, Trash2 } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { useMediaQuery } from '../../hooks/useMediaQuery'
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

// The six stock buckets, in the order the table and the phone cards show them.
const FIGURES = [
  ['Total', 'total_qty'], ['Avail.', 'available_qty'], ['Reserved', 'reserved_qty'],
  ['On loan', 'borrowed_qty'], ['Damaged', 'damaged_qty'], ['Lost', 'lost_qty'],
]
/** Colour for a stock figure: zeros recede, damaged/lost stand out, nothing available reads as a problem. */
function figureTone(key, v) {
  if (key === 'available_qty') return v ? 'font-semibold text-ink' : 'font-semibold text-bad'
  if (key === 'total_qty') return 'text-ink'
  if (!v) return 'text-muted'
  if (key === 'damaged_qty') return 'font-medium text-warn'
  if (key === 'lost_qty') return 'font-medium text-bad'
  return 'font-medium text-ink'
}

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
  // The full table needs a wide screen; below that every item becomes a stacked card.
  const wide = useMediaQuery('(min-width: 1280px)')

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

  const actions = (i) => (
    <RowActions item={i} onEdit={() => setEditing(i)} onAdjust={() => setAdjusting(i)} onHistory={() => setHistory(i)} onArchive={() => setArchiving(i)} />
  )

  return (
    <div>
      <PageHeader title="Inventory management" subtitle="Catalogue, stock levels and adjustments. Every quantity change is logged."
        actions={<><Button to="/admin/import" variant="outline" icon={FileSpreadsheet}>Audit import</Button><Button variant="outline" icon={Tags} onClick={() => setCatsOpen(true)}>Categories</Button><Button icon={Plus} onClick={() => setEditing('new')}>Add item</Button></>} />

      {/* Toolbar */}
      <Card padded={false} className="mb-4 p-3 sm:p-4">
        <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_220px_200px_auto]">
          <SearchInput value={text} onChange={setText} placeholder="Search name, brand, asset ID" className="sm:col-span-3 xl:col-span-1" />
          <Select aria-label="Category" value={f.category} onChange={(e) => setF({ category: e.target.value })} placeholder="All categories" options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select aria-label="Stock" value={f.stock} onChange={(e) => setF({ stock: e.target.value })} placeholder="Any stock level"
            options={[{ value: 'in_stock', label: 'In stock' }, { value: 'low_stock', label: 'Low stock' }, { value: 'out_of_stock', label: 'Out of stock' }]} />
          <div className={cx('flex min-h-11 rounded-xl border',
            f.archived ? 'border-brand/35 bg-cyan-soft/50' : 'border-line-strong hover:border-[#A9B8CC]')}>
            <Toggle checked={f.archived} onChange={(v) => setF({ archived: v })} label="Archived" className="w-full px-3.5" />
          </div>
        </div>
      </Card>

      {list.error ? <Card padded={false}><ErrorState error={list.error} onRetry={list.refetch} /></Card>
        : list.isInitialLoading ? <Card padded={false}><SkeletonRows rows={8} /></Card>
        : rows.length === 0 ? (
          <Card padded={false}>
            <EmptyState icon={f.archived ? Archive : Boxes} title={f.archived ? 'No archived items' : 'No items found'} action={!f.archived && <Button icon={Plus} onClick={() => setEditing('new')}>Add item</Button>}>
              {f.search || f.category || f.stock ? 'Try different filters.' : 'Add the first component to the catalogue.'}
            </EmptyState>
          </Card>
        )
        : wide ? (
          <Card padded={false} className={cx('overflow-hidden', list.loading && 'opacity-70')}>
            <Table>
              <thead><tr>
                <Th>Item</Th>
                {FIGURES.map(([label]) => <Th key={label} className="!px-2.5 text-right">{label}</Th>)}
                <Th className="!px-3">Status</Th><Th className="!pl-2 text-right">Actions</Th>
              </tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <Td className="min-w-[200px]">
                      <div className="flex items-center gap-3">
                        <Thumb path={i.image_path} name={i.name} category={i.category_name}
                          className={cx('h-10 w-10 flex-none !rounded-[10px]', i.is_archived && 'opacity-60 grayscale')} />
                        <div className="min-w-0">
                          <ItemName item={i} className="text-sm" />
                          <ItemMeta item={i} className="mt-0.5" />
                          {i.remarks && <ItemNote remarks={i.remarks} className="mt-1" />}
                        </div>
                      </div>
                    </Td>
                    {FIGURES.map(([label, key]) => (
                      <Td key={label} className={cx('num !px-2.5 text-right text-[13px]', figureTone(key, i[key]))}>{i[key]}</Td>
                    ))}
                    <Td className="!px-3"><div className="flex flex-col items-start gap-1"><StatusBadges item={i} /></div></Td>
                    <Td className="!py-2 !pl-2">{actions(i)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : (
          <ul className={cx('grid gap-3 md:grid-cols-2', list.loading && 'opacity-70')}>
            {rows.map((i) => (
              <li key={i.id} className="min-w-0">
                <Card padded={false} className="flex h-full flex-col p-4">
                  <div className="flex items-start gap-3">
                    <Thumb path={i.image_path} name={i.name} category={i.category_name}
                      className={cx('h-12 w-12 flex-none !rounded-xl', i.is_archived && 'opacity-60 grayscale')} />
                    <div className="min-w-0 flex-1">
                      <ItemName item={i} className="text-[15px]" />
                      <ItemMeta item={i} className="mt-0.5" />
                      <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadges item={i} /></div>
                    </div>
                  </div>
                  {i.remarks && <ItemNote remarks={i.remarks} className="mt-3" />}
                  <dl className="mb-3 mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-slate-50/70">
                    {FIGURES.map(([label, key], idx) => (
                      <div key={label} className={cx('flex min-w-0 items-baseline justify-between gap-2 px-2.5 py-1.5', idx % 3 !== 0 && 'border-l border-line', idx >= 3 && 'border-t border-line')}>
                        <dt className="truncate text-[11.5px] text-muted">{label}</dt>
                        <dd className={cx('num text-[13.5px]', figureTone(key, i[key]))}>{i[key]}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="-mx-4 -mb-4 mt-auto border-t border-line px-3 py-1.5">{actions(i)}</div>
                </Card>
              </li>
            ))}
          </ul>
        )}
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

// ------------------------------------------------------------------ Row pieces
function ItemName({ item: i, className }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h3 className={cx('min-w-0 break-words font-semibold leading-snug text-ink', className)}>{i.name}</h3>
      <DemoBadge show={i.is_demo} />
    </div>
  )
}

function ItemMeta({ item: i, className }) {
  return (
    <p className={cx('break-words text-xs leading-relaxed text-muted', className)}>
      {i.category_name}
      {i.storage_location ? <> · <span className="text-ink/75">{i.storage_location}</span></> : null}
      {i.asset_ids ? <> · <span className="num text-[11.5px]">{i.asset_ids}</span></> : null}
    </p>
  )
}

function ItemNote({ remarks, className }) {
  return (
    <p className={cx('flex items-start gap-1.5 text-xs font-medium text-warn', className)}>
      <StickyNote className="mt-px h-3.5 w-3.5 flex-none" aria-hidden />
      <span className="min-w-0 break-words">Note: {remarks}</span>
    </p>
  )
}

function StatusBadges({ item: i }) {
  return (
    <>
      {i.is_archived ? <Badge>Archived</Badge> : <StockBadge status={i.stock_status} />}
      {!i.is_requestable && <Badge tone="warn">Lab use only</Badge>}
    </>
  )
}

const ICON = 'h-4 w-4 text-muted transition-colors'
function RowActions({ item: i, onEdit, onAdjust, onHistory, onArchive }) {
  return (
    <div className="flex justify-end gap-0.5">
      <Button size="icon" variant="ghost" className="group" title="Edit details" aria-label={`Edit ${i.name}`} onClick={onEdit}>
        <Pencil className={cx(ICON, 'group-hover:text-ink')} />
      </Button>
      <Button size="icon" variant="ghost" className="group" title="Adjust stock" aria-label={`Adjust stock for ${i.name}`} onClick={onAdjust}>
        <SlidersHorizontal className={cx(ICON, 'group-hover:text-ink')} />
      </Button>
      <Button size="icon" variant="ghost" className="group" title="History" aria-label={`History for ${i.name}`} onClick={onHistory}>
        <History className={cx(ICON, 'group-hover:text-ink')} />
      </Button>
      <Button size="icon" variant="ghost" className="group" title={i.is_archived ? 'Restore' : 'Archive'} aria-label={`${i.is_archived ? 'Restore' : 'Archive'} ${i.name}`} onClick={onArchive}>
        {i.is_archived ? <ArchiveRestore className={cx(ICON, 'group-hover:text-brand')} /> : <Archive className={cx(ICON, 'group-hover:text-bad')} />}
      </Button>
    </div>
  )
}

// ------------------------------------------------------------------ Add / edit item
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

  const caption = 'text-[13.5px] font-semibold text-ink'
  return (
    <Modal open onClose={onClose} title={isNew ? 'Add inventory item' : `Edit ${item.name}`} size="lg"
      description={isNew ? 'Initial stock goes straight to "available". Use Adjust stock for later changes.' : 'Quantities are changed with Adjust stock, so they are always audited.'}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} disabled={uploading}>{isNew ? 'Add item' : 'Save changes'}</Button></>}>
      <form onSubmit={save} className="space-y-5" noValidate>
        {/* What it is */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={set('name')} error={errors.name} required className="sm:col-span-2" maxLength={160} />
          <Select label="Category" value={form.category_id} onChange={set('category_id')} error={errors.category_id} options={categories.map((c) => ({ value: c.id, label: c.name }))} required />
          <Input label="Brand / model" value={form.brand_model} onChange={set('brand_model')} maxLength={160} />
        </div>

        {/* Stock and where it lives */}
        <div className="grid gap-4 rounded-xl border border-line bg-slate-50/70 p-4 sm:grid-cols-2">
          {isNew
            ? <Input label="Initial quantity" type="number" min={0} value={form.total_qty} onChange={set('total_qty')} error={errors.total_qty} />
            : (
              <div className="space-y-1.5">
                <p className={caption}>Stock</p>
                <div className="flex min-h-11 items-center rounded-xl border border-dashed border-line-strong px-3.5 text-sm text-muted">
                  <p><span className="num font-semibold text-ink">{item.available_qty}</span> available of <span className="num font-semibold text-ink">{item.total_qty}</span></p>
                </div>
              </div>
            )}
          <Input label="Low-stock alert at" type="number" min={0} value={form.low_stock_threshold} onChange={set('low_stock_threshold')} error={errors.low_stock_threshold} hint="Shown as low stock at or below this" />
          <Input label="Storage location" value={form.storage_location} onChange={set('storage_location')} placeholder="e.g. Rack B, Bin 2" maxLength={80} />
          <Select label="Condition" value={form.condition} onChange={set('condition')} options={CONDITIONS} />
          <Input label="Asset IDs" value={form.asset_ids} onChange={set('asset_ids')} placeholder="e.g. ISD-MCU-0001..0010" className="sm:col-span-2" maxLength={200} />
        </div>

        <Textarea label="Description" value={form.description} onChange={set('description')} maxLength={4000} />

        {/* Who can borrow it */}
        <div className={cx('rounded-xl border p-4', form.is_requestable ? 'border-line' : 'border-warn/30 bg-warn-bg/40')}>
          <Toggle checked={form.is_requestable} onChange={(v) => setForm((f) => ({ ...f, is_requestable: v }))} label="Available for borrowing" />
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted sm:pl-[54px]">{form.is_requestable ? 'Students can add this item to a request.' : 'Lab use only: students see the item but cannot request it, and it does not count toward project readiness.'}</p>
        </div>
        <Textarea label="Remarks" value={form.remarks} onChange={set('remarks')} rows={2} maxLength={1000} hint="Internal note, e.g. from a stock audit. Shown to admins only." />

        {/* Image */}
        <div className="border-t border-line pt-5">
          <p className={cx(caption, 'mb-2')}>Image</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Thumb path={form.image_path} name={form.name || 'item'} className="h-16 w-16 flex-none ring-1 ring-line" />
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line-strong bg-white px-3.5 text-[13px] font-semibold text-ink transition-colors hover:border-[#9FB0C6] hover:bg-slate-50 focus-within:border-focus focus-within:ring-4 focus-within:ring-cyan/20">
                <ImagePlus className="h-4 w-4" aria-hidden /> {uploading ? 'Uploading…' : form.image_path ? 'Replace' : 'Upload'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile} disabled={uploading} />
              </label>
              {form.image_path && <Button size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, image_path: null }))}>Remove</Button>}
            </div>
            <span className="text-xs text-muted">JPG, PNG or WebP · max 2 MB</span>
          </div>
        </div>

        {/* Specifications */}
        <div className="border-t border-line pt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className={caption}>Specifications</p>
            <Button size="sm" variant="link" icon={Plus} onClick={() => setForm((f) => ({ ...f, specs: [...f.specs, { k: '', v: '' }] }))}>Add row</Button>
          </div>
          {form.specs.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">Optional key/value details such as voltage or interface.</p>}
          <div className="space-y-2">
            {form.specs.map((s, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input aria-label="Specification name" placeholder="e.g. Voltage" className="min-w-0 flex-1" value={s.k} onChange={(e) => setForm((f) => ({ ...f, specs: f.specs.map((x, j) => (j === idx ? { ...x, k: e.target.value } : x)) }))} />
                <Input aria-label="Specification value" placeholder="e.g. 5 V" className="min-w-0 flex-1" value={s.v} onChange={(e) => setForm((f) => ({ ...f, specs: f.specs.map((x, j) => (j === idx ? { ...x, v: e.target.value } : x)) }))} />
                <Button size="icon" variant="ghost" className="group flex-none" aria-label="Remove row" onClick={() => setForm((f) => ({ ...f, specs: f.specs.filter((_, j) => j !== idx) }))}>
                  <Trash2 className={cx(ICON, 'group-hover:text-bad')} />
                </Button>
              </div>
            ))}
          </div>
        </div>
        {error && <InlineError>{error}</InlineError>}
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ Adjust stock
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
      {/* Current stock; the bucket the chosen action draws from is highlighted. */}
      <dl className="mb-5 grid grid-cols-5 overflow-hidden rounded-xl border border-line text-center">
        {[['Total', 'total_qty'], ['Avail.', 'available_qty'], ['Reserved', 'reserved_qty'], ['Damaged', 'damaged_qty'], ['Lost', 'lost_qty']].map(([k, key], idx) => {
          const source = a.from === key
          return (
            <div key={k} className={cx('min-w-0 px-1 py-2.5', idx > 0 && 'border-l border-line', source ? 'bg-cyan-soft/70' : 'bg-slate-50/70')}>
              <dt className={cx('truncate text-[11px] font-semibold', source ? 'text-brand' : 'text-muted')}>{k}</dt>
              <dd className="num mt-0.5 text-lg font-semibold leading-tight text-ink">{item[key]}</dd>
            </div>
          )
        })}
      </dl>
      <div className="space-y-4">
        <Select label="Action" value={action} onChange={(e) => setAction(e.target.value)} options={ACTIONS.map((x) => ({ value: x.value, label: x.label, disabled: x.from && item[x.from] === 0 }))} hint={a.help} />
        <Input label="Quantity" type="number" min={1} max={max} value={qty} onChange={(e) => setQty(e.target.value)} hint={a.from ? `Up to ${max}` : undefined} className="sm:max-w-[220px]" />
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="e.g. Delivery from vendor, PO 2291" required />
        <InlineError>{error}</InlineError>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------------ History drawer
function HistoryDrawer({ item, onClose }) {
  const h = useQuery(() => itemHistory(item.id), [item.id])
  const used = useQuery(() => getItemProjects(item.id), [item.id])
  const src = useQuery(() => itemSourceRecords(item.id), [item.id])
  return (
    <Modal open onClose={onClose} side title={item.name} description="Stock adjustments, edits and project usage">
      <section className="mb-6">
        <h3 className="label-caps mb-2.5">Used by projects</h3>
        <div className="flex flex-wrap gap-2">
          {(used.data || []).map((p) => (
            <Badge key={p.id} tone={p.status === 'published' ? 'info' : 'neutral'}>
              <span>{p.name} <span className="num">×{p.qty_required}</span></span>
            </Badge>
          ))}
          {used.data && used.data.length === 0 && <p className="text-sm text-muted">Not used by any project.</p>}
        </div>
      </section>
      {(src.data || []).length > 0 && (
        <section className="mb-6">
          <h3 className="label-caps mb-2.5">Source records</h3>
          <ul className="space-y-2">
            {src.data.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-slate-50/70 p-3 text-sm">
                <p className="font-semibold text-ink">{r.original_name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {r.source_doc} · {r.source_section === 'special_equipment' ? 'Special equipment' : 'Small components'} · page <span className="num">{r.source_page}</span> · No. <span className="num">{r.source_serial}</span>
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  {r.qty_reported != null
                    ? <>Quantity <span className="num text-ink">{r.qty_reported}</span></>
                    : <>ISD Lab <span className="num text-ink">{r.qty_isd_lab ?? '–'}</span> · old project <span className="num text-ink">{r.qty_old_project ?? '–'}</span></>}
                  {' · '}available <span className="num text-ink">{r.qty_available_reported ?? '–'}</span>
                  {r.remarks ? ` · “${r.remarks}”` : ''} · {r.status}{r.applied_at ? ` ${formatDateTime(r.applied_at)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="label-caps mb-3">History</h3>
        {h.isInitialLoading ? <SkeletonRows rows={4} /> : h.error ? <ErrorState error={h.error} /> : (
          <>
            <ol>
              {(h.data || []).map((e, idx, all) => (
                <li key={e.id} className="relative pb-5 pl-6 last:pb-0">
                  {idx < all.length - 1 && <span className="absolute -bottom-1.5 left-[4.5px] top-4 w-px bg-line-strong" aria-hidden />}
                  <span className="absolute left-0 top-[5px] h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-cyan-soft" aria-hidden />
                  <p className="text-sm font-medium text-ink">{e.summary}</p>
                  {e.details?.reason && <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[13px] text-muted">Reason: {e.details.reason}</p>}
                  <p className="mt-1 text-xs text-muted">{formatDateTime(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ''}</p>
                </li>
              ))}
            </ol>
            {h.data?.length === 0 && <p className="text-sm text-muted">No recorded changes yet.</p>}
          </>
        )}
      </section>
    </Modal>
  )
}

// ------------------------------------------------------------------ Categories
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
        <Input aria-label="New category name" placeholder="New category name" className="min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Button type="submit" icon={Plus} className="flex-none">Add</Button>
      </form>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {(cats.data || []).map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-slate-50">
            {edit[c.id] !== undefined ? (
              <>
                <Input aria-label="Category name" className="min-w-0 flex-1" value={edit[c.id]} onChange={(e) => setEdit({ ...edit, [c.id]: e.target.value })} />
                <Button size="sm" className="flex-none" onClick={() => run(() => renameCategory(c.id, edit[c.id]), 'Renamed').then(() => setEdit({ ...edit, [c.id]: undefined }))}>Save</Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                <Button size="icon" variant="ghost" className="group flex-none" aria-label={`Rename ${c.name}`} onClick={() => setEdit({ ...edit, [c.id]: c.name })}><Settings2 className={cx(ICON, 'group-hover:text-ink')} /></Button>
                <Button size="icon" variant="ghost" className="flex-none" aria-label={`Delete ${c.name}`} onClick={() => run(() => deleteCategory(c.id), 'Category deleted')}><Trash2 className="h-4 w-4 text-bad" /></Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
