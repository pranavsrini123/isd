import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, MapPin, Plus, ShoppingBasket } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useInfiniteList } from '../../hooks/useInfiniteList'
import { useSearchState } from '../../hooks/useSearchState'
import { getItemProjects, inventoryTotals, listCategories, listInventory } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonCards, Spinner } from '../../components/ui/primitives'
import { SearchInput, Select, Stepper } from '../../components/ui/forms'
import { Modal } from '../../components/ui/Modal'
import { StockBadge, DemoBadge, LabUseBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'

const BATCH = 24

export default function StudentInventory() {
  const [f, setF] = useSearchState({ search: '', category: '', stock: '', borrow: '', sort: 'name' })
  const [searchText, setSearchText] = useState(f.search)
  const debounced = useDebounce(searchText, 300)
  useEffect(() => { if (debounced !== f.search) setF({ search: debounced }) }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedId, setSelectedId] = useState(null)

  const cats = useQuery(() => listCategories(), [])
  const totals = useQuery(() => inventoryTotals(), [])
  // One continuous list: batches load automatically as the student scrolls.
  const list = useInfiniteList(
    (offset, limit) => listInventory({ search: f.search, categoryId: f.category, stock: f.stock, requestable: f.borrow, sort: f.sort, offset, pageSize: limit }),
    [f.search, f.category, f.stock, f.borrow, f.sort],
    { batchSize: BATCH },
  )
  useRealtime(['inventory_items'], () => { list.refresh(); totals.refetch() })
  const rows = list.items

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Everything the ISD Lab holds, with availability updated live. Request what you need."
        actions={totals.data && <Badge tone="info" className="!px-3 !py-1 !text-sm">{formatNumber(totals.data.available)} of {formatNumber(totals.data.total)} available</Badge>} />

      <Card className="mb-5" padded={false}>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[1fr_190px_170px_170px_170px]">
          <SearchInput value={searchText} onChange={setSearchText} placeholder="Search by name, brand, model or asset ID" />
          <Select aria-label="Category" value={f.category} onChange={(e) => setF({ category: e.target.value })}
            placeholder="All categories" options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select aria-label="Availability" value={f.stock} onChange={(e) => setF({ stock: e.target.value })} placeholder="Any availability"
            options={[{ value: 'in_stock', label: 'In stock' }, { value: 'low_stock', label: 'Low stock' }, { value: 'out_of_stock', label: 'Out of stock' }]} />
          <Select aria-label="Borrowing" value={f.borrow} onChange={(e) => setF({ borrow: e.target.value })} placeholder="Any borrowing"
            options={[{ value: 'yes', label: 'Can be borrowed' }, { value: 'no', label: 'Lab use only' }]} />
          <Select aria-label="Sort" value={f.sort} onChange={(e) => setF({ sort: e.target.value })}
            options={[{ value: 'name', label: 'Sort: Name' }, { value: 'available', label: 'Sort: Most available' }, { value: 'low', label: 'Sort: Least available' }]} />
        </div>
      </Card>

      {list.error && rows.length === 0 ? <Card><ErrorState error={list.error} onRetry={list.retry} /></Card>
        : list.isInitialLoading ? <SkeletonCards count={8} className="h-64" />
        : rows.length === 0 ? (
          <Card><EmptyState icon={Boxes} title="No components match"
            action={(f.search || f.category || f.stock || f.borrow) && <Button variant="outline" onClick={() => { setSearchText(''); setF({ search: '', category: '', stock: '', borrow: '' }) }}>Clear filters</Button>}>
            Try a different search or remove a filter.
          </EmptyState></Card>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted" aria-live="polite">
              {list.count === rows.length ? `${list.count} component${list.count === 1 ? '' : 's'}` : `Showing ${rows.length} of ${list.count} components`}
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.map((item) => <ItemCard key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />)}
            </div>
            <div ref={list.hasMore ? list.sentinelRef : undefined} className="flex min-h-16 items-center justify-center py-6">
              {list.error ? (
                <Button variant="outline" size="sm" onClick={list.retry}>Couldn't load more · Try again</Button>
              ) : list.hasMore ? (
                list.loading ? <Spinner label="Loading more components" /> : <Button variant="ghost" size="sm" onClick={list.loadMore}>Load more</Button>
              ) : rows.length > BATCH ? (
                <p className="text-sm text-muted">You've reached the end of the inventory.</p>
              ) : null}
            </div>
          </>
        )}
      {/* Looked up by id so the modal shows live quantities after a realtime refresh. */}
      <ItemModal item={rows.find((r) => r.id === selectedId) || null} onClose={() => setSelectedId(null)} />
    </div>
  )
}

function ItemCard({ item, onOpen }) {
  return (
    <Card padded={false} className="flex flex-col overflow-hidden p-4">
      <button onClick={onOpen} className="text-left" aria-label={`View ${item.name}`}>
        <Thumb path={item.image_path} name={item.name} category={item.category_name} className="h-32 w-full" />
      </button>
      <div className="flex flex-1 flex-col px-1 pt-3">
        <div className="flex items-start justify-between gap-2">
          <button onClick={onOpen} className="text-left font-semibold leading-snug hover:text-brand">{item.name}</button>
          <StockBadge status={item.stock_status} />
        </div>
        <p className="mt-0.5 text-[13px] text-muted">{item.category_name}{item.brand_model ? ` · ${item.brand_model}` : ''}</p>
        {item.is_requestable === false && <div className="mt-2"><LabUseBadge show={false} /></div>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div>
            <p className="text-sm"><span className="font-display text-xl font-bold">{item.available_qty}</span><span className="text-muted"> / {item.total_qty} available</span></p>
            <p className="text-xs text-muted">Used in {item.projects_using} project{item.projects_using === 1 ? '' : 's'}{item.borrowed_qty ? ` · ${item.borrowed_qty} on loan` : ''}</p>
          </div>
          <Button size="sm" variant="outline" onClick={onOpen}>View</Button>
        </div>
      </div>
    </Card>
  )
}

function ItemModal({ item, onClose }) {
  const cart = useCart()
  const toast = useToast()
  const [qty, setQty] = useState(1)
  const projects = useQuery(() => (item ? getItemProjects(item.id) : Promise.resolve([])), [item?.id], { enabled: !!item })
  if (!item) return null
  const inCart = cart.lines.find((l) => l.item_id === item.id)
  const requestable = item.is_requestable !== false
  const max = Math.max(0, (item.requestable_qty ?? item.available_qty) - (inCart?.qty || 0))
  const specs = Object.entries(item.specifications || {})
  return (
    <Modal open={!!item} onClose={onClose} title={item.name} description={`${item.category_name}${item.brand_model ? ' · ' + item.brand_model : ''}`} size="lg"
      footer={!requestable ? (
        <p className="text-sm text-warn">For use in the lab only — it can't be added to a borrowing request. Ask the lab staff to use it in the lab.</p>
      ) : item.available_qty > 0 ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted">{inCart ? `${inCart.qty} already in your request list` : 'Add to your request list, then submit it for approval.'}</span>
          <div className="flex items-center gap-2">
            <Stepper value={Math.min(qty, Math.max(max, 1))} onChange={setQty} min={1} max={Math.max(max, 1)} label="quantity" />
            <Button icon={Plus} disabled={max === 0} onClick={() => { cart.addItem(item, Math.min(qty, max)); toast.success(`${item.name} added to your request list`); setQty(1); onClose() }}>
              Add to request
            </Button>
            {cart.count > 0 && <Button to="/student/request" variant="cyan" icon={ShoppingBasket}>Review</Button>}
          </div>
        </div>
      ) : <p className="text-sm text-bad">Out of stock right now. It will reappear here as soon as units are returned.</p>}>
      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <Thumb path={item.image_path} name={item.name} category={item.category_name} className="h-44 w-full" />
        <div>
          <div className="mb-3 flex flex-wrap gap-2"><StockBadge status={item.stock_status} /><LabUseBadge show={item.is_requestable} /><DemoBadge show={item.is_demo} /></div>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[['Available', item.available_qty], ['On loan', item.borrowed_qty + item.reserved_qty], ['Total', item.total_qty]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-display text-xl font-bold">{v}</dd></div>
            ))}
          </dl>
          {item.storage_location && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted"><MapPin className="h-4 w-4" /> {item.storage_location}</p>}
        </div>
      </div>
      {item.description && <p className="mt-5 text-sm leading-relaxed text-ink">{item.description}</p>}
      {specs.length > 0 && (
        <div className="mt-5">
          <h3 className="label-caps mb-2">Specifications</h3>
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {specs.map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-line py-1"><dt className="text-muted">{k}</dt><dd className="font-medium">{String(v)}</dd></div>)}
          </dl>
        </div>
      )}
      <div className="mt-5">
        <h3 className="label-caps mb-2">Used in projects</h3>
        {projects.loading ? <p className="text-sm text-muted">Loading…</p>
          : (projects.data || []).length === 0 ? <p className="text-sm text-muted">Not part of any published project yet.</p>
          : (
            <ul className="flex flex-wrap gap-2">
              {projects.data.map((p) => (
                <li key={p.id}><Link to={`/student/projects/${p.id}`} onClick={onClose} className="inline-flex rounded-full bg-info-bg px-3 py-1 text-sm font-medium text-info hover:underline">{p.name} · ×{p.qty_required}</Link></li>
              ))}
            </ul>
          )}
      </div>
    </Modal>
  )
}
