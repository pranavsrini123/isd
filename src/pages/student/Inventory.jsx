import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, ChevronDown, CircleSlash, FolderKanban, Info, MapPin, Plus, RefreshCw, ShoppingBasket, X } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useInfiniteList } from '../../hooks/useInfiniteList'
import { useSearchState } from '../../hooks/useSearchState'
import { getItemProjects, inventoryTotals, listCategories, listInventory } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import { Button, Card, EmptyState, ErrorState, Hero, ProgressBar, Skeleton, Spinner, cx } from '../../components/ui/primitives'
import { SearchInput, Select, Stepper } from '../../components/ui/forms'
import { Modal } from '../../components/ui/Modal'
import { CountUp, Stagger, StaggerItem } from '../../components/ui/motion'
import { StockBadge, DemoBadge, LabUseBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'

const BATCH = 24

// Phone: one compact row per component (picture left). Tablet and up: picture cards.
const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 2xl:grid-cols-4'
// Selects sit two to a row on a phone, so they get a little less padding there.
const CHEVRON = { backgroundPosition: 'right 0.6rem center' }
// Stock meter colours: green good, amber low, red out.
const METER = {
  in_stock: 'from-ok-solid to-[#2DD4BF]',
  low_stock: 'from-warn-solid to-[#FBBF24]',
  out_of_stock: 'from-bad-solid to-[#F87171]',
}
const share = (part, whole) => (whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0)

/** Decorative microchip with circuit traces for the hero. Purely visual. */
function ChipDecor({ className }) {
  const id = useId().replace(/:/g, '')
  const pins = [156, 178, 200, 222, 244]
  const traces = [
    ['M156 126V98H118V66', 118, 66], ['M222 126V88H272V56', 272, 56], ['M274 178H312V138H352', 352, 138],
    ['M274 244H330V292', 330, 292], ['M200 274V318H244V352', 244, 352], ['M156 274V312H98', 98, 312],
    ['M126 222H88V262H54', 54, 262], ['M126 178H78V128', 78, 128],
  ]
  return (
    <svg viewBox="0 0 400 400" className={cx('absolute', className)} fill="none" aria-hidden>
      <defs>
        <radialGradient id={`${id}g`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#22D3EE" stopOpacity=".34" />
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="400" y2="400" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#67E8F9" />
          <stop offset="1" stopColor="#4F7BFF" stopOpacity=".2" />
        </linearGradient>
      </defs>
      <circle cx="200" cy="200" r="140" fill={`url(#${id}g)`} />
      <circle cx="200" cy="200" r="192" stroke="#fff" strokeOpacity=".06" />
      <circle cx="200" cy="200" r="172" stroke={`url(#${id}r)`} strokeWidth="1.5" strokeDasharray="3 7" strokeLinecap="round" />
      {traces.map(([d]) => <path key={d} d={d} stroke="#67E8F9" strokeOpacity=".38" strokeWidth="1.5" strokeLinejoin="round" />)}
      {pins.map((p) => (
        <g key={p} fill="#67E8F9" fillOpacity=".55">
          <rect x={p - 2} y="126" width="4" height="14" rx="1" />
          <rect x={p - 2} y="260" width="4" height="14" rx="1" />
          <rect x="126" y={p - 2} width="14" height="4" rx="1" />
          <rect x="260" y={p - 2} width="14" height="4" rx="1" />
        </g>
      ))}
      <rect x="140" y="140" width="120" height="120" rx="18" fill="#0B1734" fillOpacity=".6" stroke="#67E8F9" strokeOpacity=".55" strokeWidth="1.5" />
      <rect x="166" y="166" width="68" height="68" rx="11" fill="#22D3EE" fillOpacity=".08" stroke="#22D3EE" strokeOpacity=".7" strokeWidth="1.5" />
      <path d="M200 182 215.6 191v18L200 218l-15.6-9v-18Z" stroke="#67E8F9" strokeOpacity=".8" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M184.4 191 200 200l15.6-9M200 200v18" stroke="#67E8F9" strokeOpacity=".6" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="152" cy="152" r="3" fill="#A5F3FC" fillOpacity=".7" />
      {traces.map(([d, x, y], i) => (
        <g key={`n${d}`}>
          <circle cx={x} cy={y} r={i % 3 === 0 ? 10 : 7} fill="#22D3EE" fillOpacity=".12" />
          <circle cx={x} cy={y} r={i % 3 === 0 ? 3.5 : 2.5} fill="#A5F3FC" />
        </g>
      ))}
    </svg>
  )
}

/** Lab-wide units available, with a small live meter (hero). */
function UnitsChip({ available, total }) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full bg-cyan/[.09] px-3 py-1.5 text-[13px] text-side-text sm:px-3.5 sm:text-[13.5px] ring-1 ring-inset ring-cyan/30">
      <span>
        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-cyan align-[1px] shadow-[0_0_10px_rgb(34_211_238/0.9)]" aria-hidden />
        <CountUp value={available} className="num text-[14px] font-semibold sm:text-[15px] text-cyan-light" />
        {' '}of <span className="num font-medium text-white/90">{formatNumber(total)}</span> available
      </span>
      <ProgressBar value={share(available, total)} tone="cyan" className="hidden w-20 sm:block"
        label={`${formatNumber(available)} of ${formatNumber(total)} available`} />
    </div>
  )
}

/** Picture window for a component; the picture zooms a little when its card is hovered. */
function ThumbFrame({ item, className, thumbClassName }) {
  return (
    <div className={cx('relative isolate overflow-hidden rounded-[16px] bg-[#EAF1F8]', className)}>
      <div className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover:scale-[1.05]">
        <Thumb path={item.image_path} name={item.name} category={item.category_name}
          className={cx('w-full !rounded-none', item.stock_status === 'out_of_stock' && 'opacity-60 grayscale', thumbClassName)} />
      </div>
      {!item.image_path && <div aria-hidden className="tex-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_75%_75%_at_50%_50%,transparent_35%,#000)]" />}
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[16px] shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06),inset_0_1px_0_rgb(255_255_255/0.7)]" />
    </div>
  )
}

/** Placeholders shaped like the cards (rows on a phone, picture cards above). */
function GridSkeleton() {
  return (
    <div className={GRID} aria-busy="true" aria-label="Loading">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={cx('min-w-0', i > 5 && 'hidden 2xl:block')}>
          <Card padded={false} className="flex h-full gap-3.5 p-2.5 sm:flex-col sm:gap-0 sm:p-2">
            <Skeleton className="aspect-square w-24 flex-none !rounded-[16px] sm:aspect-auto sm:h-36 sm:w-full" />
            <div className="min-w-0 flex-1 space-y-2.5 py-1 sm:px-3 sm:pb-3 sm:pt-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="!mt-5 h-6 w-24" />
              <Skeleton className="hidden h-1.5 w-full !rounded-full sm:block" />
              <div className="flex items-center justify-between gap-3 pt-1">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-9 w-16 !rounded-[10px]" />
              </div>
            </div>
          </Card>
        </div>
      ))}
    </div>
  )
}

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
      <Hero
        decor={<>
          <ChipDecor className="-right-12 -top-32 hidden h-[420px] w-[420px] opacity-80 md:block" />
          <ChipDecor className="-right-20 -top-16 h-60 w-60 opacity-30 md:hidden" />
        </>}
        title="Inventory"
        subtitle="Everything the ISD Lab holds, with availability updated live. Request what you need.">
        {/* Filters sit on the night surface: the search and selects switch to their dark style automatically. */}
        <div className="sm:glass-dark sm:rounded-[20px] sm:p-3">
          <SearchInput value={searchText} onChange={setSearchText} placeholder="Search by name, brand, model or asset ID" />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3 xl:grid-cols-4 max-sm:[&_select]:pl-3 max-sm:[&_select]:pr-7 max-sm:[&_select]:text-[13px]">
            <Select aria-label="Category" value={f.category} onChange={(e) => setF({ category: e.target.value })} style={CHEVRON}
              placeholder="All categories" options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
            <Select aria-label="Availability" value={f.stock} onChange={(e) => setF({ stock: e.target.value })} placeholder="Any availability" style={CHEVRON}
              options={[{ value: 'in_stock', label: 'In stock' }, { value: 'low_stock', label: 'Low stock' }, { value: 'out_of_stock', label: 'Out of stock' }]} />
            <Select aria-label="Borrowing" value={f.borrow} onChange={(e) => setF({ borrow: e.target.value })} placeholder="Any borrowing" style={CHEVRON}
              options={[{ value: 'yes', label: 'Can be borrowed' }, { value: 'no', label: 'Lab use only' }]} />
            <Select aria-label="Sort" value={f.sort} onChange={(e) => setF({ sort: e.target.value })} style={CHEVRON}
              options={[{ value: 'name', label: 'Sort: Name' }, { value: 'available', label: 'Sort: Most available' }, { value: 'low', label: 'Sort: Least available' }]} />
          </div>
        </div>

        <div className="mt-4 flex min-h-9 flex-wrap items-center gap-2">
          {list.isInitialLoading ? (
            <span className="h-8 w-32 max-w-full rounded-full bg-white/[.07] sm:w-40" aria-hidden />
          ) : rows.length > 0 && (
            <p className="rounded-full bg-white/[.07] px-3 py-1.5 text-[13px] text-side-text ring-1 ring-inset ring-white/10 sm:px-3.5 sm:text-[13.5px]" aria-live="polite">
              {list.count === rows.length
                ? <><span className="num text-[14px] font-semibold sm:text-[15px] text-white">{list.count}</span> component{list.count === 1 ? '' : 's'}</>
                : <>Showing <span className="num text-[14px] font-semibold sm:text-[15px] text-white">{rows.length}</span> of <span className="num text-[14px] font-semibold sm:text-[15px] text-white">{list.count}</span> components</>}
            </p>
          )}
          {totals.data && <UnitsChip available={totals.data.available} total={totals.data.total} />}
        </div>
      </Hero>

      {list.error && rows.length === 0 ? <Card><ErrorState error={list.error} onRetry={list.retry} /></Card>
        : list.isInitialLoading ? <GridSkeleton />
        : rows.length === 0 ? (
          <Card className="relative isolate overflow-hidden">
            <div aria-hidden className="tex-dots pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_60%_70%_at_50%_40%,#000,transparent)]" />
            <EmptyState icon={Boxes} title="No components match"
              action={(f.search || f.category || f.stock || f.borrow) && <Button variant="outline" icon={X} onClick={() => { setSearchText(''); setF({ search: '', category: '', stock: '', borrow: '' }) }}>Clear filters</Button>}>
              Try a different search or remove a filter.
            </EmptyState>
          </Card>
        ) : (
          <>
            <Stagger className={GRID}>
              {rows.map((item) => (
                <StaggerItem key={item.id} className="h-full">
                  <ItemCard item={item} onOpen={() => setSelectedId(item.id)} />
                </StaggerItem>
              ))}
            </Stagger>
            <div ref={list.hasMore ? list.sentinelRef : undefined} className="flex min-h-16 items-center justify-center py-8">
              {list.error ? (
                <Button variant="outline" size="sm" icon={RefreshCw} onClick={list.retry}>Couldn't load more · Try again</Button>
              ) : list.hasMore ? (
                list.loading
                  ? <span className="glass inline-flex rounded-full px-4 py-2"><Spinner label="Loading more components" /></span>
                  : <Button variant="outline" size="sm" icon={ChevronDown} onClick={list.loadMore}>Load more</Button>
              ) : rows.length > BATCH ? (
                <p className="flex w-full max-w-lg items-center gap-3 text-sm text-muted">
                  <span className="h-px min-w-6 flex-1 bg-gradient-to-r from-transparent to-line-strong" aria-hidden />
                  <span className="text-center">You've reached the end of the inventory.</span>
                  <span className="h-px min-w-6 flex-1 bg-gradient-to-l from-transparent to-line-strong" aria-hidden />
                </p>
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
    <Card padded={false} className="lift group flex h-full gap-3.5 p-2.5 sm:flex-col sm:gap-0 sm:p-2">
      <button onClick={onOpen} className="relative w-24 flex-none self-start rounded-[16px] text-left sm:w-full sm:self-auto" aria-label={`View ${item.name}`}>
        <ThumbFrame item={item} thumbClassName="aspect-square sm:aspect-auto sm:h-36" />
        <span className="absolute left-3 top-3 hidden rounded-full bg-white/95 shadow-[0_4px_14px_-6px_rgb(7_13_31/0.35)] sm:block">
          <StockBadge status={item.stock_status} />
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col py-0.5 pr-0.5 sm:px-3 sm:pb-3 sm:pt-3.5">
        <h3 className="text-[15px] leading-snug sm:text-base">
          <button onClick={onOpen} className="text-left font-semibold transition-colors hover:text-brand group-hover:text-brand">
            <span className="line-clamp-2 break-words">{item.name}</span>
          </button>
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-muted">{item.category_name}{item.brand_model ? ` · ${item.brand_model}` : ''}</p>
        {item.is_requestable === false && <div className="mt-2"><LabUseBadge show={false} /></div>}
        <div className="mt-auto pt-2.5 sm:pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted">
              <span className="num text-lg font-semibold leading-none text-ink sm:text-[22px]">{item.available_qty}</span> / <span className="num">{item.total_qty}</span> available
            </p>
            <span className="sm:hidden"><StockBadge status={item.stock_status} /></span>
          </div>
          <div className="mt-2.5 hidden h-1.5 overflow-hidden rounded-full bg-[#E3E9F2] sm:block" aria-hidden>
            <div className={cx('h-full rounded-full bg-gradient-to-r', METER[item.stock_status] || METER.in_stock)} style={{ width: `${share(item.available_qty, item.total_qty)}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 border-line/80 sm:mt-3.5 sm:border-t sm:pt-3">
            <p className="min-w-0 truncate text-xs text-muted">
              Used in <span className="num">{item.projects_using}</span> project{item.projects_using === 1 ? '' : 's'}
              {item.borrowed_qty ? <> · <span className="num">{item.borrowed_qty}</span> on loan</> : ''}
            </p>
            <Button size="sm" variant="outline" className="flex-none" onClick={onOpen}>View</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

// Tint of the "Available" tile in the item modal.
const AVAILABLE_TILE = {
  in_stock: 'bg-ok-bg/70 ring-ok/15 [&>dd]:text-ok',
  low_stock: 'bg-warn-bg/70 ring-warn/15 [&>dd]:text-warn',
  out_of_stock: 'bg-bad-bg/70 ring-bad/15 [&>dd]:text-bad',
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
        <p className="flex w-full items-start gap-2.5 rounded-xl bg-warn-bg/80 px-3.5 py-3 text-sm font-medium text-warn ring-1 ring-inset ring-warn/15">
          <Info className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>For use in the lab only — it can't be added to a borrowing request. Ask the lab staff to use it in the lab.</span>
        </p>
      ) : item.available_qty > 0 ? (
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 text-sm text-muted sm:flex-1">
            {inCart ? <><span className="num font-semibold text-ink">{inCart.qty}</span> already in your request list</> : 'Add to your request list, then submit it for approval.'}
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:flex-none sm:flex-nowrap">
            <Stepper value={Math.min(qty, Math.max(max, 1))} onChange={setQty} min={1} max={Math.max(max, 1)} label="quantity" />
            <Button icon={Plus} className="flex-1 sm:flex-none" disabled={max === 0} onClick={() => { cart.addItem(item, Math.min(qty, max)); toast.success(`${item.name} added to your request list`); setQty(1); onClose() }}>
              Add to request
            </Button>
            {cart.count > 0 && <Button to="/student/request" variant="cyan" icon={ShoppingBasket} className="w-full sm:w-auto">Review</Button>}
          </div>
        </div>
      ) : (
        <p className="flex w-full items-start gap-2.5 text-sm font-medium text-bad">
          <CircleSlash className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
          <span>Out of stock right now. It will reappear here as soon as units are returned.</span>
        </p>
      )}>
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-4 sm:grid-cols-[188px_minmax(0,1fr)] sm:grid-rows-[auto_1fr] sm:gap-x-6">
        <ThumbFrame item={item} className="self-start sm:row-span-2" thumbClassName="aspect-square" />
        <div className="min-w-0 self-center sm:self-start">
          <div className="flex flex-wrap gap-2"><StockBadge status={item.stock_status} /><LabUseBadge show={item.is_requestable} /><DemoBadge show={item.is_demo} /></div>
          {item.storage_location && (
            <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-muted">
              <MapPin className="h-4 w-4 flex-none text-brand" aria-hidden /> <span className="min-w-0 truncate">{item.storage_location}</span>
            </p>
          )}
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:self-end">
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {[['Available', item.available_qty], ['On loan', item.borrowed_qty + item.reserved_qty], ['Total', item.total_qty]].map(([k, v], i) => (
              <div key={k} className={cx('min-w-0 rounded-2xl px-3 py-3 ring-1 ring-inset sm:px-3.5',
                i === 0 ? AVAILABLE_TILE[item.stock_status] || AVAILABLE_TILE.in_stock : 'bg-slate-50 ring-line')}>
                <dt className="truncate text-xs font-medium text-muted">{k}</dt>
                <dd className="num mt-1.5 text-2xl font-semibold leading-none text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E3E9F2]" aria-hidden>
            <div className={cx('h-full rounded-full bg-gradient-to-r', METER[item.stock_status] || METER.in_stock)} style={{ width: `${share(item.available_qty, item.total_qty)}%` }} />
          </div>
        </div>
      </div>
      {item.description && <p className="mt-6 text-sm leading-relaxed text-ink">{item.description}</p>}
      {specs.length > 0 && (
        <section className="mt-6">
          <h3 className="label-caps mb-2">Specifications</h3>
          <dl className="grid gap-x-6 text-sm sm:grid-cols-2">
            {specs.map(([k, v]) => (
              <div key={k} className="flex min-w-0 justify-between gap-3 border-b border-line/80 py-2">
                <dt className="text-muted">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section className="mt-6">
        <h3 className="label-caps mb-2.5">Used in projects</h3>
        {projects.loading ? <Spinner label="Loading" />
          : (projects.data || []).length === 0 ? (
            <p className="flex items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-sm text-muted">
              <FolderKanban className="h-4 w-4 flex-none text-subtle" aria-hidden />Not part of any published project yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {projects.data.map((p) => (
                <li key={p.id} className="min-w-0 max-w-full">
                  <Link to={`/student/projects/${p.id}`} onClick={onClose}
                    className="group/p inline-flex max-w-full items-center gap-2 rounded-full bg-white py-1.5 pl-2.5 pr-3 text-sm font-medium text-ink shadow-[0_1px_2px_rgb(11_19_36/0.05)] ring-1 ring-inset ring-line transition-colors hover:bg-cyan-soft/50 hover:text-brand hover:ring-brand/25">
                    <FolderKanban className="h-4 w-4 flex-none text-brand" aria-hidden />
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="flex-none text-subtle">·</span>
                    <span className="num flex-none text-[13px] font-semibold text-brand">×{p.qty_required}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </Modal>
  )
}
