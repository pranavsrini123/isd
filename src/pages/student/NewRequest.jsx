import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarDays, FolderKanban, Info, Plus, ShoppingBasket, Trash2, X } from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useInfiniteList } from '../../hooks/useInfiniteList'
import { createRequest, getItemsByIds, getPublicSettings, listCategories, listInventory } from '../../lib/api'
import { addDays, toISODate } from '../../lib/format'
import { hasErrors, validateRequest } from '../../lib/validation'
import { Button, Card, EmptyState, ErrorState, InlineError, NightPanel, PageHeader, Spinner, cx } from '../../components/ui/primitives'
import { Input, SearchInput, Select, Stepper, Textarea, Toggle } from '../../components/ui/forms'
import { Modal } from '../../components/ui/Modal'
import { Reveal, Stagger, StaggerItem } from '../../components/ui/motion'
import { Orbit } from '../../components/ui/decor'
import { StockBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'

/** Numbered step heading: a glowing night chip with the step number, then the title (reads "1 · Components"). */
function StepTitle({ n, children, className }) {
  return (
    <h2 className={cx('flex min-w-0 items-center gap-3 text-lg font-semibold leading-snug', className)}>
      <span className="num flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-night-2 text-[13px] font-semibold text-cyan-light shadow-[0_0_0_1px_rgb(34_211_238/0.28),0_8px_16px_-8px_rgb(34_211_238/0.7)]">{n}</span>
      <span className="sr-only"> · </span>
      <span className="min-w-0">{children}</span>
    </h2>
  )
}

const DT = 'text-[11px] font-semibold uppercase tracking-[.09em] text-side-text'
const TILE = 'glass-dark flex min-w-0 flex-col justify-between gap-2 rounded-2xl px-4 py-3.5'

export default function NewRequest() {
  const cart = useCart()
  const toast = useToast()
  const nav = useNavigate()
  const { profile } = useAuth()
  const today = toISODate(new Date())
  const settings = useQuery(() => getPublicSettings(), [])
  const maxDays = settings.data?.max_loan_days ?? 14
  const maxItems = settings.data?.max_items_per_request ?? 20
  const ids = cart.lines.map((l) => l.item_id)
  const live = useQuery(() => getItemsByIds(ids), [ids.join(',')])
  useRealtime(['inventory_items'], live.refetch)
  const stock = useMemo(() => Object.fromEntries((live.data || []).map((i) => [i.id, i])), [live.data])

  const [form, setForm] = useState({
    purpose: cart.purpose || (cart.projectName ? `Building: ${cart.projectName}` : ''),
    note: '',
    neededFrom: today,
    neededUntil: addDays(today, 7),
  })
  useEffect(() => {
    if (!form.purpose && (cart.purpose || cart.projectName)) setForm((f) => ({ ...f, purpose: cart.purpose || `Building: ${cart.projectName}` }))
  }, [cart.projectName, cart.purpose]) // eslint-disable-line react-hooks/exhaustive-deps
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [pending, setPending] = useState(false)
  const [picker, setPicker] = useState(false)

  // Only borrowable, non-archived stock counts (requestable_qty is computed by the database).
  const lines = cart.lines.map((l) => ({ ...l, available_qty: stock[l.item_id]?.requestable_qty ?? 0, item: stock[l.item_id] }))

  async function submit(e) {
    e.preventDefault()
    setServerError('')
    const v = validateRequest({ ...form, lines }, { today, maxLoanDays: maxDays, maxItems })
    setErrors(v)
    if (hasErrors(v)) return
    setPending(true)
    try {
      await createRequest({ projectId: cart.projectId, purpose: form.purpose, note: form.note, neededFrom: form.neededFrom, neededUntil: form.neededUntil, items: lines.filter((l) => l.qty > 0) })
      cart.clear()
      toast.success('Request submitted. The lab administrator will review it.')
      nav('/student/requests?tab=pending')
    } catch (err) {
      setServerError(err.message)
      live.refetch()
    } finally {
      setPending(false)
    }
  }

  // Rendered at the same tree position in both branches below, so adding the
  // first component (empty → filled page) keeps the picker open with its search.
  const pickerEl = <ComponentPicker key="picker" open={picker} onClose={() => setPicker(false)} />

  if (cart.lines.length === 0) {
    return (
      <>
      <div key="empty">
        <PageHeader title="Request components" />
        <Card className="relative isolate overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="tex-dots absolute inset-0 [mask-image:radial-gradient(ellipse_60%_70%_at_50%_40%,#000_10%,transparent_75%)]" />
            <div className="absolute left-1/2 top-10 h-48 w-48 -translate-x-1/2 rounded-full bg-cyan/20 blur-3xl" />
          </div>
          <EmptyState icon={ShoppingBasket} title="Your request list is empty" className="sm:py-20"
            action={(
              <div className="flex w-full flex-col items-stretch gap-2.5 sm:flex-row sm:justify-center">
                <Button to="/student/projects" icon={FolderKanban}>Start from a project</Button>
                <Button variant="outline" onClick={() => setPicker(true)} icon={Plus}>Add components</Button>
              </div>
            )}>
            Pick a project to pre-fill its parts, or add individual components from the inventory.
          </EmptyState>
        </Card>
      </div>
      {pickerEl}
      </>
    )
  }

  return (
    <>
    <form key="form" onSubmit={submit} noValidate>
      <PageHeader title="Request components" back={cart.projectId ? { to: `/student/projects/${cart.projectId}`, label: cart.projectName } : { to: '/student/inventory', label: 'Inventory' }}
        subtitle={cart.projectName ? `Pre-filled from ${cart.projectName}. Adjust quantities, dates or add more parts.` : 'Choose quantities and dates, then submit for approval.'} />
      {profile.status !== 'active' && <div className="mb-5"><InlineError>Your account is restricted, so new requests cannot be submitted.</InlineError></div>}

      <div className="grid gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5 sm:space-y-6">
          <Card padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line/80 px-5 py-4 sm:px-6">
              <StepTitle n={1}>Components</StepTitle>
              {cart.projectName && (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-cyan-soft py-1 pl-2.5 pr-1 text-xs font-semibold text-brand ring-1 ring-inset ring-brand/15">
                  <FolderKanban className="h-3.5 w-3.5 flex-none" aria-hidden />
                  <span className="truncate">{cart.projectName}</span>
                  <button type="button" onClick={cart.clearProject} aria-label="Unlink project"
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-full transition-colors hover:bg-brand/10">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </div>
            <Stagger as="ul" className="space-y-2.5 p-3 sm:p-4">
              {lines.map((l) => {
                const err = errors.lineErrors?.[l.item_id]
                const out = live.data && l.available_qty === 0
                const problem = err || out
                return (
                  <StaggerItem as="li" key={l.item_id}
                    className={cx('flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border p-3 shadow-[0_1px_2px_rgb(11_19_36/0.04)] transition-colors sm:p-3.5',
                      problem ? 'border-bad/25 bg-bad-bg/45' : 'border-white bg-white/70 hover:bg-white/95')}>
                    <Thumb path={l.item?.image_path} name={l.name} category={l.item?.category_name} className="h-14 w-14 flex-none sm:h-16 sm:w-16" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold leading-snug">{l.name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                        {live.data
                          ? <span><span className="num font-semibold text-ink">{l.available_qty}</span> available</span>
                          : <span>Checking stock…</span>}
                        {l.item && <StockBadge status={l.item.stock_status} />}
                      </p>
                      {problem && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-[13px] font-medium text-bad">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
                          <span>{l.item?.is_requestable === false ? 'Lab use only — this item can no longer be requested. Remove it.' : out ? 'Out of stock — remove it or wait for returns' : err}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex w-full items-center justify-between gap-2 border-t border-line/70 pt-3 sm:w-auto sm:border-0 sm:pt-0">
                      <Stepper value={l.qty} onChange={(v) => cart.setQty(l.item_id, v)} min={1} max={Math.max(1, l.available_qty)} label={`${l.name} quantity`} />
                      <Button variant="ghost" size="icon" className="!h-11 !w-11 hover:bg-bad-bg!" onClick={() => cart.removeItem(l.item_id)} aria-label={`Remove ${l.name}`}>
                        <Trash2 className="h-4 w-4 text-bad" />
                      </Button>
                    </div>
                  </StaggerItem>
                )
              })}
            </Stagger>
            <div className="px-3 pb-3 sm:px-4 sm:pb-4">
              <button type="button" onClick={() => setPicker(true)}
                className="group flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-white/40 px-4 text-sm font-semibold text-brand transition-colors hover:border-cyan hover:bg-cyan/[.06]">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-cyan-soft ring-1 ring-inset ring-cyan/35 transition-shadow group-hover:shadow-[0_0_12px_rgb(34_211_238/0.6)]" aria-hidden>
                  <Plus className="h-4 w-4" />
                </span>
                Add another component
              </button>
              {errors.lines && <p className="mt-2 px-1 text-[13px] font-medium text-bad">{errors.lines}</p>}
            </div>
          </Card>

          <Reveal>
            <Card>
              <StepTitle n={2} className="mb-5">Dates</StepTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input type="date" label="Required from" min={today} value={form.neededFrom} error={errors.neededFrom} className="min-w-0"
                  onChange={(e) => setForm((f) => ({ ...f, neededFrom: e.target.value }))} required />
                <Input type="date" label="Required till" min={form.neededFrom || today} max={form.neededFrom ? addDays(form.neededFrom, maxDays) : undefined} className="min-w-0"
                  value={form.neededUntil} error={errors.neededUntil} onChange={(e) => setForm((f) => ({ ...f, neededUntil: e.target.value }))} required />
              </div>
              <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-500/[.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
                <CalendarDays className="mt-0.5 h-4 w-4 flex-none text-brand" aria-hidden />
                <span>Loans can last up to <span className="num font-semibold text-ink">{maxDays}</span> days. Extensions need the lab manager's approval.</span>
              </p>
            </Card>
          </Reveal>

          <Reveal>
            <Card>
              <StepTitle n={3} className="mb-5">Purpose</StepTitle>
              <div className="space-y-4">
                <Input label="Project or purpose" value={form.purpose} maxLength={300} error={errors.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} required />
                <Textarea label="Note for the lab manager" hint="Optional" value={form.note} maxLength={1000} rows={3}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Building this for the Embedded Systems mini-project. Will collect after 2 pm." />
              </div>
            </Card>
          </Reveal>
        </div>

        <aside className="min-w-0">
          <Reveal className="xl:sticky xl:top-24" delay={0.08}>
            <NightPanel as="div" className="rounded-[22px] p-5 shadow-[0_28px_60px_-30px_rgb(7_13_31/0.75)] sm:p-6">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10"><Orbit className="-right-24 -top-24 h-64 w-64 opacity-40" /></div>
              <h2 className="flex items-center gap-2.5 text-lg font-semibold text-white">
                <span className="h-2 w-2 flex-none rounded-full bg-cyan shadow-[0_0_10px_rgb(34_211_238/0.9)]" aria-hidden />
                Summary
              </h2>
              <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">
                <div className={TILE}>
                  <dt className={DT}>Component types</dt>
                  <dd className="num text-[30px] font-semibold leading-none text-white">{lines.length}</dd>
                </div>
                <div className={TILE}>
                  <dt className={DT}>Total units</dt>
                  <dd className="num text-[30px] font-semibold leading-none text-cyan-light">{lines.reduce((s, l) => s + l.qty, 0)}</dd>
                </div>
                <div className={cx(TILE, 'col-span-2 sm:col-span-1 xl:col-span-2')}>
                  <dt className={DT}>Dates</dt>
                  <dd className="text-[15px] font-semibold text-white">{form.neededFrom || '—'} <span className="text-cyan-light">→</span> {form.neededUntil || '—'}</dd>
                </div>
              </dl>
              <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-cyan/20 bg-cyan/[.07] px-3.5 py-3 text-[13px] leading-relaxed text-[#B9C6DE]">
                <Info className="mt-0.5 h-4 w-4 flex-none text-cyan-light" aria-hidden />
                <span>Submitting does not reserve stock. Parts are held for you once an administrator approves the request.</span>
              </p>
              {serverError && <div className="mt-4"><InlineError>{serverError}</InlineError></div>}
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse sm:justify-start xl:flex-col">
                <Button type="submit" size="lg" loading={pending} disabled={profile.status !== 'active'}>Submit request</Button>
                <Button variant="outline" onClick={() => { cart.clear(); nav('/student/projects') }}>Cancel and clear</Button>
              </div>
            </NightPanel>
          </Reveal>
        </aside>
      </div>
    </form>
    {pickerEl}
    </>
  )
}

/**
 * "Add another component": searchable, filterable, continuously scrolling list of
 * the inventory. A component already in the request shows its quantity selector
 * instead of an Add button, so it can never be added twice as separate rows.
 */
function ComponentPicker({ open, onClose }) {
  const cart = useCart()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [availableOnly, setAvailableOnly] = useState(true)
  const dq = useDebounce(q, 250)
  const cats = useQuery(() => listCategories(), [], { enabled: open })
  const list = useInfiniteList(
    (offset, limit) => (open
      ? listInventory({ search: dq, categoryId: category, availableOnly, offset, pageSize: limit })
      : Promise.resolve({ data: [], count: 0 })),
    [open, dq, category, availableOnly],
    { batchSize: 20 },
  )
  useRealtime(['inventory_items'], list.refresh, { enabled: open })
  const inCart = Object.fromEntries(cart.lines.map((l) => [l.item_id, l]))
  const selectedCount = cart.lines.length

  return (
    <Modal open={open} onClose={onClose} title="Add components" size="lg"
      description="Search the inventory and set how many of each you need."
      footer={<Button onClick={onClose} className="w-full sm:w-auto"><span>Done · <span className="num">{selectedCount}</span> component type{selectedCount === 1 ? '' : 's'} selected</span></Button>}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
        <SearchInput value={q} onChange={setQ} placeholder="Search by name, brand or model" />
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories"
          options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-3">
        <Toggle checked={availableOnly} onChange={setAvailableOnly} label="Only show components I can borrow now" />
        {list.count !== null && (
          <span className="flex-none rounded-full bg-neutral-pill px-2.5 py-1 text-xs font-medium text-neutral-pill-text"><span className="num font-semibold">{list.count}</span> found</span>
        )}
      </div>

      {list.error && list.items.length === 0 ? <ErrorState error={list.error} onRetry={list.retry} className="!py-8" /> : (
        <ul className="-mx-2 mt-3 space-y-1">
          {list.items.map((i) => {
            const line = inCart[i.id]
            const labOnly = i.is_requestable === false
            const out = labOnly || i.requestable_qty === 0
            return (
              <li key={i.id} className={cx('flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors',
                line ? 'bg-cyan/[.07] ring-1 ring-inset ring-cyan/30' : 'hover:bg-slate-50')}>
                <Thumb path={i.image_path} name={i.name} category={i.category_name} className={cx('h-11 w-11 flex-none !rounded-xl', out && 'opacity-60')} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm font-semibold leading-snug">{i.name}</p>
                  <p className={out ? 'mt-0.5 text-xs font-medium text-bad' : 'mt-0.5 truncate text-xs text-muted'}>
                    {labOnly ? 'Lab use only — cannot be requested' : out ? 'Out of stock — cannot be requested right now'
                      : <><span className="num font-semibold text-ink">{i.requestable_qty}</span> available · {i.category_name}</>}
                  </p>
                </div>
                {line ? (
                  <div className="flex flex-none items-center gap-0.5">
                    <Stepper size="sm" value={line.qty} min={1} max={Math.max(1, i.requestable_qty)} label={`${i.name} quantity`}
                      onChange={(v) => cart.setQty(i.id, v)} />
                    <Button size="icon" variant="ghost" className="hover:bg-bad-bg!" aria-label={`Remove ${i.name}`} onClick={() => cart.removeItem(i.id)}><Trash2 className="h-4 w-4 text-bad" /></Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" icon={Plus} disabled={out} onClick={() => cart.addItem(i, 1)} className="flex-none"
                    aria-label={labOnly ? `${i.name} is for lab use only` : out ? `${i.name} is out of stock` : `Add ${i.name}`}>
                    {labOnly ? 'Lab only' : out ? 'Unavailable' : 'Add'}
                  </Button>
                )}
              </li>
            )
          })}
          {list.isInitialLoading && <li className="py-8 text-center"><Spinner label="Loading components" /></li>}
          {!list.loading && list.items.length === 0 && (
            <li className="py-8 text-center text-sm text-muted">
              No components found{availableOnly ? ' that can be borrowed now' : ''}.{availableOnly && ' Turn off "Only show components I can borrow now" to see everything.'}
            </li>
          )}
        </ul>
      )}
      {list.items.length > 0 && (
        <div ref={list.hasMore ? list.sentinelRef : undefined} className="flex min-h-10 items-center justify-center pt-2">
          {list.hasMore && (list.loading ? <Spinner label="Loading more" /> : <Button size="sm" variant="ghost" onClick={list.loadMore}>Load more</Button>)}
        </div>
      )}
    </Modal>
  )
}
