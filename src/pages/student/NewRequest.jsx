import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, ShoppingBasket, Trash2, X } from 'lucide-react'
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
import { Badge, Button, Card, EmptyState, ErrorState, InlineError, PageHeader, Spinner } from '../../components/ui/primitives'
import { Input, SearchInput, Select, Stepper, Textarea, Toggle } from '../../components/ui/forms'
import { Modal } from '../../components/ui/Modal'
import { StockBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'

export default function NewRequest() {
  const cart = useCart()
  const toast = useToast()
  const nav = useNavigate()
  const { profile } = useAuth()
  const today = toISODate(new Date())
  const settings = useQuery(() => getPublicSettings(), [])
  const maxDays = settings.data?.max_loan_days ?? 14
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

  const lines = cart.lines.map((l) => ({ ...l, available_qty: stock[l.item_id]?.available_qty ?? 0, item: stock[l.item_id] }))

  async function submit(e) {
    e.preventDefault()
    setServerError('')
    const v = validateRequest({ ...form, lines }, { today, maxLoanDays: maxDays, maxItems: 20 })
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
        <Card><EmptyState icon={ShoppingBasket} title="Your request list is empty"
          action={<div className="flex flex-wrap justify-center gap-2"><Button to="/student/projects" icon={FolderKanban}>Start from a project</Button><Button variant="outline" onClick={() => setPicker(true)} icon={Plus}>Add components</Button></div>}>
          Pick a project to pre-fill its parts, or add individual components from the inventory.
        </EmptyState></Card>
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

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold">1 · Components</h2>
              {cart.projectName && (
                <Badge tone="info" className="!py-1">{cart.projectName}
                  <button type="button" onClick={cart.clearProject} aria-label="Unlink project" className="ml-1"><X className="h-3 w-3" /></button>
                </Badge>
              )}
            </div>
            <ul className="divide-y divide-line">
              {lines.map((l) => {
                const err = errors.lineErrors?.[l.item_id]
                const out = live.data && l.available_qty === 0
                return (
                  <li key={l.item_id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                    <Thumb path={l.item?.image_path} name={l.name} category={l.item?.category_name} className="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{l.name}</p>
                      <p className="flex items-center gap-2 text-sm text-muted">
                        {live.data ? `${l.available_qty} available` : 'Checking stock…'} {l.item && <StockBadge status={l.item.stock_status} />}
                      </p>
                      {(err || out) && <p className="text-[13px] font-medium text-bad">{out ? 'Out of stock — remove it or wait for returns' : err}</p>}
                    </div>
                    <Stepper value={l.qty} onChange={(v) => cart.setQty(l.item_id, v)} min={1} max={Math.max(1, l.available_qty)} label={`${l.name} quantity`} />
                    <Button variant="ghost" size="icon" onClick={() => cart.removeItem(l.item_id)} aria-label={`Remove ${l.name}`}><Trash2 className="h-4 w-4 text-bad" /></Button>
                  </li>
                )
              })}
            </ul>
            <div className="border-t border-line px-6 py-3">
              <Button variant="ghost" size="sm" icon={Plus} onClick={() => setPicker(true)}>Add another component</Button>
              {errors.lines && <p className="mt-1 text-[13px] font-medium text-bad">{errors.lines}</p>}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold">2 · Dates</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input type="date" label="Required from" min={today} value={form.neededFrom} error={errors.neededFrom}
                onChange={(e) => setForm((f) => ({ ...f, neededFrom: e.target.value }))} required />
              <Input type="date" label="Required till" min={form.neededFrom || today} max={form.neededFrom ? addDays(form.neededFrom, maxDays) : undefined}
                value={form.neededUntil} error={errors.neededUntil} onChange={(e) => setForm((f) => ({ ...f, neededUntil: e.target.value }))} required />
            </div>
            <p className="mt-2 text-[13px] text-muted">Loans can last up to {maxDays} days. Extensions need the lab manager's approval.</p>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold">3 · Purpose</h2>
            <div className="space-y-4">
              <Input label="Project or purpose" value={form.purpose} maxLength={300} error={errors.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} required />
              <Textarea label="Note for the lab manager" hint="Optional" value={form.note} maxLength={1000} rows={3}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Building this for the Embedded Systems mini-project. Will collect after 2 pm." />
            </div>
          </Card>
        </div>

        <aside>
          <Card className="xl:sticky xl:top-24">
            <h2 className="text-lg font-semibold">Summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Component types</dt><dd className="font-semibold">{lines.length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Total units</dt><dd className="font-semibold">{lines.reduce((s, l) => s + l.qty, 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Dates</dt><dd className="font-semibold">{form.neededFrom || '—'} → {form.neededUntil || '—'}</dd></div>
            </dl>
            <p className="mt-4 rounded-xl bg-info-bg px-3 py-2.5 text-[13px] text-info">
              Submitting does not reserve stock. Parts are held for you once an administrator approves the request.
            </p>
            {serverError && <div className="mt-4"><InlineError>{serverError}</InlineError></div>}
            <div className="mt-5 flex flex-col gap-2">
              <Button type="submit" size="lg" loading={pending} disabled={profile.status !== 'active'}>Submit request</Button>
              <Button variant="outline" onClick={() => { cart.clear(); nav('/student/projects') }}>Cancel and clear</Button>
            </div>
          </Card>
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
      footer={<Button onClick={onClose}>Done · {selectedCount} component type{selectedCount === 1 ? '' : 's'} selected</Button>}>
      <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
        <SearchInput value={q} onChange={setQ} placeholder="Search by name, brand or model" />
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories"
          options={(cats.data || []).map((c) => ({ value: c.id, label: c.name }))} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Toggle checked={availableOnly} onChange={setAvailableOnly} label="Only show components in stock" />
        {list.count !== null && <span className="text-xs text-muted">{list.count} found</span>}
      </div>

      {list.error && list.items.length === 0 ? <ErrorState error={list.error} onRetry={list.retry} className="!py-8" /> : (
        <ul className="mt-3 divide-y divide-line">
          {list.items.map((i) => {
            const line = inCart[i.id]
            const out = i.available_qty === 0
            return (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Thumb path={i.image_path} name={i.name} category={i.category_name} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.name}</p>
                  <p className={out ? 'text-xs font-medium text-bad' : 'text-xs text-muted'}>
                    {out ? 'Out of stock — cannot be requested right now' : `${i.available_qty} available · ${i.category_name}`}
                  </p>
                </div>
                {line ? (
                  <div className="flex items-center gap-1">
                    <Stepper size="sm" value={line.qty} min={1} max={Math.max(1, i.available_qty)} label={`${i.name} quantity`}
                      onChange={(v) => cart.setQty(i.id, v)} />
                    <Button size="icon" variant="ghost" aria-label={`Remove ${i.name}`} onClick={() => cart.removeItem(i.id)}><Trash2 className="h-4 w-4 text-bad" /></Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" icon={Plus} disabled={out} onClick={() => cart.addItem(i, 1)}
                    aria-label={out ? `${i.name} is out of stock` : `Add ${i.name}`}>
                    {out ? 'Unavailable' : 'Add'}
                  </Button>
                )}
              </li>
            )
          })}
          {list.isInitialLoading && <li className="py-8 text-center"><Spinner label="Loading components" /></li>}
          {!list.loading && list.items.length === 0 && (
            <li className="py-8 text-center text-sm text-muted">
              No components found{availableOnly ? ' in stock' : ''}.{availableOnly && ' Turn off "Only show components in stock" to see everything.'}
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
