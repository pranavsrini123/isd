import { useState } from 'react'
import { CalendarDays, FileDown, FileSignature, Info, PackageOpen, Plus, Search, Send, Trash2, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { cancelTakeaway, createTakeaway, getTakeawayLetter, listInventory, myTakeaways } from '../../lib/api'
import { departmentError, joinDepartment, splitDepartment } from '../../lib/department'
import { formatDate, formatDateTime, toISODate } from '../../lib/format'
import { buildTakeawayLetter, letterFileName } from '../../lib/takeawayLetter'
import { downloadPdf } from '../../lib/download'
import { Button, Card, EmptyState, ErrorState, IconTile, InlineError, PageHeader, SectionTitle, SkeletonRows, Spinner, cx } from '../../components/ui/primitives'
import { Input, SearchInput, Stepper, Textarea } from '../../components/ui/forms'
import { ConfirmDialog } from '../../components/ui/Modal'
import { DepartmentField } from '../../components/domain/DepartmentField'
import { TakeawayStatusBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'

/** Client-side checks; create_takeaway_request() repeats them. Pure (tested). */
export function validateTakeaway({ name, registrationNumber, dept, purpose, takeawayDate, expectedReturnDate, lines }, today) {
  const errors = {}
  if (!name || name.trim().length < 2) errors.name = 'Enter your name'
  if (!/^[A-Za-z0-9]{6,20}$/.test((registrationNumber || '').trim())) errors.registrationNumber = 'Enter your registration number (6–20 letters and digits)'
  const d = departmentError(dept)
  if (d) errors.department = d
  const p = (purpose || '').trim().length
  if (p < 10) errors.purpose = 'Explain why the items must leave the lab (at least 10 characters)'
  else if (p > 1000) errors.purpose = 'Keep the purpose under 1000 characters'
  if (!takeawayDate) errors.takeawayDate = 'Choose the take-away date'
  else if (takeawayDate < today) errors.takeawayDate = 'The take-away date cannot be in the past'
  if (expectedReturnDate && takeawayDate && expectedReturnDate < takeawayDate) errors.expectedReturnDate = 'The return date must be on or after the take-away date'
  if (!lines?.length) errors.lines = 'Add at least one component'
  else if (lines.some((l) => !Number.isInteger(l.qty) || l.qty < 1 || (l.max != null && l.qty > l.max))) errors.lines = 'Check the quantities'
  return errors
}

/** True once a letter can be downloaded (after Super Admin approval). Pure (tested). */
export const canDownloadLetter = (r) => r.status === 'approved' || r.status === 'submitted'

export default function Takeaway() {
  const { profile } = useAuth()
  const list = useQuery(() => myTakeaways(profile.id), [profile.id])
  useRealtime(['takeaway_requests'], list.refetch)
  const [composing, setComposing] = useState(false)
  const rows = list.data || []

  return (
    <div>
      <PageHeader title="Component take-away"
        subtitle="Ask for formal permission to take components or equipment outside the lab. After Super Admin approval, download the letter, get it signed and hand it to the lab admin."
        actions={!composing && <Button variant="cyan" icon={Plus} onClick={() => setComposing(true)}>New take-away request</Button>} />

      {composing && <TakeawayForm onClose={() => setComposing(false)} onDone={() => { setComposing(false); list.refetch() }} />}

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6"><SectionTitle>Your take-away requests</SectionTitle></div>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <div className="p-5"><SkeletonRows rows={3} /></div>
          : rows.length === 0 ? (
            <EmptyState icon={PackageOpen} title="No take-away requests"
              action={!composing && <Button icon={Plus} onClick={() => setComposing(true)}>New take-away request</Button>}>
              Use this when components must leave the lab, for example for a field test or an off-campus demo.
            </EmptyState>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {rows.map((r) => <TakeawayRow key={r.id} r={r} onChanged={list.refetch} />)}
            </ul>
          )}
      </Card>
    </div>
  )
}

function TakeawayRow({ r, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function download() {
    setBusy(true)
    try {
      // The database refuses letter data for anything not approved.
      const data = await getTakeawayLetter(r.id)
      downloadPdf(buildTakeawayLetter(data), letterFileName(data))
      toast.success('Letter downloaded. Print it, get both signatures, then hand it to the lab admin.')
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  async function cancel() {
    setBusy(true)
    try { await cancelTakeaway(r.id); toast.success(`${r.request_code} cancelled`); setConfirm(false); onChanged() }
    catch (e) { toast.error(e) } finally { setBusy(false) }
  }

  return (
    <li className="px-5 py-4 sm:px-6" data-takeaway={r.request_code}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="num text-[15px] font-semibold text-ink">{r.request_code}</span>
            <TakeawayStatusBadge status={r.status} />
          </div>
          <p className="mt-1.5 break-words text-sm leading-relaxed text-ink">{r.purpose}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden />
              Take-away {formatDate(r.takeaway_date)}{r.expected_return_date ? ` · return ${formatDate(r.expected_return_date)}` : ''}</span>
            <span>Submitted {formatDateTime(r.created_at)}</span>
          </p>
          <p className="mt-2 text-[13px] text-ink">
            {(r.items || []).map((i, k) => <span key={i.item_id}>{k > 0 && ', '}{i.name} <span className="num font-medium text-muted">×{i.qty}</span></span>)}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {canDownloadLetter(r) && <Button icon={FileDown} loading={busy} onClick={download} className="flex-1 sm:flex-none">Download permission letter</Button>}
          {r.status === 'pending' && <Button variant="danger-outline" onClick={() => setConfirm(true)} className="flex-1 sm:flex-none">Cancel</Button>}
        </div>
      </div>
      {r.status === 'pending' && <Hint tone="warn" icon={Info}>Waiting for the Super Admin. The permission letter becomes available once it is approved.</Hint>}
      {r.status === 'approved' && <Hint tone="info" icon={FileSignature}>Approved by {r.decided_by_name} on {formatDate(r.decided_at)}. Print the letter, get it signed by the Chairperson and the Associate Chairperson, and hand it to the lab admin.{r.decision_note ? ` Note: ${r.decision_note}` : ''}</Hint>}
      {r.status === 'submitted' && <Hint tone="ok" icon={FileSignature}>The lab received your signed letter on {formatDate(r.document_received_at)}.</Hint>}
      {r.status === 'rejected' && <Hint tone="bad" icon={X}>Rejected: {r.decision_note}</Hint>}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={cancel} loading={busy} tone="danger" confirmLabel="Cancel request"
        title={<>Cancel <span className="num">{r.request_code}</span>?</>}>The Super Admin will no longer see this request.</ConfirmDialog>
    </li>
  )
}

const HINT = { info: 'bg-info-bg/70 text-info', ok: 'bg-ok-bg/70 text-ok', warn: 'bg-warn-bg/70 text-warn', bad: 'bg-bad-bg/70 text-bad' }
function Hint({ tone, icon: Icon, children }) {
  return (
    <p className={cx('mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] font-medium leading-relaxed', HINT[tone])}>
      <Icon className="mt-[3px] h-3.5 w-3.5 flex-none" aria-hidden /><span className="min-w-0 break-words">{children}</span>
    </p>
  )
}

// ------------------------------------------------------------------ form
function TakeawayForm({ onClose, onDone }) {
  const { profile } = useAuth()
  const toast = useToast()
  const today = toISODate(new Date())
  const [form, setForm] = useState({
    name: profile.full_name || '',
    registrationNumber: profile.srm_id || '',
    dept: splitDepartment(profile.department),
    purpose: '',
    takeawayDate: today,
    expectedReturnDate: '',
    additionalInfo: '',
  })
  const [lines, setLines] = useState([]) // { item_id, name, brand_model, image_path, qty, max }
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => (x[k] ? { ...x, [k]: '' } : x)) }

  const add = (it) => {
    setErrors((x) => ({ ...x, lines: '' }))
    setLines((ls) => (ls.some((l) => l.item_id === it.id) ? ls
      : [...ls, { item_id: it.id, name: it.name, brand_model: it.brand_model, image_path: it.image_path, qty: 1, max: it.total_qty }]))
  }
  const setQty = (id, qty) => setLines((ls) => ls.map((l) => (l.item_id === id ? { ...l, qty } : l)))
  const remove = (id) => setLines((ls) => ls.filter((l) => l.item_id !== id))

  async function submit(e) {
    e.preventDefault()
    setError('')
    const v = validateTakeaway({ ...form, lines }, today)
    setErrors(v)
    if (Object.keys(v).length) return
    setSaving(true)
    try {
      await createTakeaway({
        name: form.name.trim(),
        registrationNumber: form.registrationNumber.trim().toUpperCase(),
        department: joinDepartment(form.dept),
        purpose: form.purpose.trim(),
        takeawayDate: form.takeawayDate,
        expectedReturnDate: form.expectedReturnDate || null,
        additionalInfo: form.additionalInfo.trim() || null,
        items: lines,
      })
      toast.success('Take-away request sent to the Super Admin for approval.')
      onDone()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Card className="mb-6">
      <div className="mb-5 flex items-start gap-3.5">
        <IconTile icon={FileSignature} tone="brand" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold leading-snug">New take-away request</h2>
          <p className="mt-1 text-sm text-muted">This asks for permission only. It does not reserve or issue stock; borrow components through a normal request.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close the form" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Student name" required value={form.name} onChange={set('name')} error={errors.name} maxLength={120} autoComplete="name" />
          <Input label="Registration number" required value={form.registrationNumber} onChange={set('registrationNumber')} error={errors.registrationNumber} maxLength={20} autoComplete="off" />
          <Input label="Email ID" value={profile.email} readOnly disabled />
          <DepartmentField value={form.dept} error={errors.department} onChange={(dept) => { setForm((f) => ({ ...f, dept })); setErrors((x) => ({ ...x, department: '' })) }} />
        </div>

        <ComponentPicker lines={lines} onAdd={add} onQty={setQty} onRemove={remove} error={errors.lines} />

        <Textarea label="Purpose" required rows={3} value={form.purpose} onChange={set('purpose')} error={errors.purpose} maxLength={1000}
          placeholder="Why the items must leave the lab, where they will be used and by whom" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input type="date" label="Intended take-away date" required min={today} value={form.takeawayDate} onChange={set('takeawayDate')} error={errors.takeawayDate} />
          <Input type="date" label="Expected return date" min={form.takeawayDate || today} value={form.expectedReturnDate} onChange={set('expectedReturnDate')}
            error={errors.expectedReturnDate} hint="Leave empty if not applicable" />
        </div>
        <Textarea label="Additional information" rows={2} value={form.additionalInfo} onChange={set('additionalInfo')} maxLength={1000}
          hint="Optional · e.g. faculty guide, event name, where the items will be kept" />
        <InlineError>{error}</InlineError>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" icon={Send} loading={saving}>Send for approval</Button>
        </div>
      </form>
    </Card>
  )
}

function ComponentPicker({ lines, onAdd, onQty, onRemove, error }) {
  const [text, setText] = useState('')
  const q = useDebounce(text, 250)
  const results = useQuery(() => (q.trim().length >= 2 ? listInventory({ search: q, pageSize: 8 }) : Promise.resolve(null)), [q])
  const found = results.data?.data || []
  return (
    <div>
      <p className="mb-1.5 text-[13.5px] font-semibold text-ink">Components or equipment<span className="text-bad" aria-hidden> *</span></p>
      <SearchInput label="Search the lab inventory" value={text} onChange={setText} placeholder="Search the lab inventory (at least 2 letters)" />
      {q.trim().length >= 2 && (
        <div className="mt-2 rounded-xl border border-line bg-white/80">
          {results.loading && !found.length ? <div className="flex justify-center p-4"><Spinner /></div>
            : found.length === 0 ? <p className="flex items-center gap-2 p-3 text-sm text-muted"><Search className="h-4 w-4" aria-hidden />Nothing matches “{q}”.</p>
            : (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto" aria-label="Search results">
                {found.map((it) => {
                  const added = lines.some((l) => l.item_id === it.id)
                  return (
                    <li key={it.id} className="flex items-center gap-3 px-3 py-2">
                      <Thumb path={it.image_path} name={it.name} className="h-9 w-9 flex-none !rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{it.name}</p>
                        <p className="truncate text-xs text-muted">{it.brand_model || it.category_name} · <span className="num">{it.total_qty}</span> in the lab</p>
                      </div>
                      <Button size="sm" variant={added ? 'ghost' : 'outline'} icon={added ? undefined : Plus} disabled={added || it.total_qty < 1}
                        onClick={() => onAdd(it)} aria-label={added ? `${it.name} added` : `Add ${it.name}`}>{added ? 'Added' : 'Add'}</Button>
                    </li>
                  )
                })}
              </ul>
            )}
        </div>
      )}
      {lines.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white/80" aria-label="Selected components">
          {lines.map((l) => (
            <li key={l.item_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Thumb path={l.image_path} name={l.name} className="h-9 w-9 flex-none !rounded-lg" />
              <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink">{l.name}</span>
              <Stepper value={l.qty} min={1} max={l.max ?? 1000} onChange={(v) => onQty(l.item_id, v)} label={`Quantity of ${l.name}`} size="sm" />
              <Button variant="ghost" size="icon" aria-label={`Remove ${l.name}`} onClick={() => onRemove(l.item_id)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1.5 text-[13px] font-medium text-bad" role="alert">{error}</p>}
    </div>
  )
}
