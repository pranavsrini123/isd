import { useEffect, useState } from 'react'
import { AlertTriangle, AtSign, Boxes, CalendarClock, Globe, Hourglass, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { listSettings, updateSetting } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { Button, Card, ErrorState, IconTile, InlineError, PageHeader, PageLoader, cx } from '../../components/ui/primitives'
import { Input } from '../../components/ui/forms'

// Purely decorative icons for the borrowing-limit rows.
const LIMIT_ICONS = { max_loan_days: CalendarClock, max_items_per_request: Boxes, max_pending_requests: Hourglass }

/** One settings group: a white card with its title and hint beside (desktop) or above (phone) the controls. */
function Section({ icon, title, hint, footer, children }) {
  return (
    <Card as="section" padded={false}>
      <div className="grid gap-5 p-5 lg:p-6 xl:grid-cols-[16rem_minmax(0,1fr)] xl:gap-10">
        <div className="flex min-w-0 items-start gap-3 xl:block">
          <IconTile icon={icon} size="sm" className="xl:mb-3" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug">{title}</h2>
            {hint && <p className="mt-1 text-sm leading-relaxed text-muted">{hint}</p>}
          </div>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-3 rounded-b-xl border-t border-line bg-slate-50 px-5 py-3 lg:px-6">{footer}</div>
      )}
    </Card>
  )
}

export default function AdminSettings() {
  const toast = useToast()
  const q = useQuery(() => listSettings(), [])
  const [domains, setDomains] = useState([])
  const [newDomain, setNewDomain] = useState('')
  const [nums, setNums] = useState({})
  const [tz, setTz] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    if (!q.data) return
    const m = Object.fromEntries(q.data.map((s) => [s.key, s.value]))
    setDomains(m.allowed_email_domains || [])
    setNums({ max_loan_days: m.max_loan_days, max_items_per_request: m.max_items_per_request, max_pending_requests: m.max_pending_requests })
    setTz(m.lab_timezone || 'Asia/Kolkata')
  }, [q.data])

  async function save(key, value) {
    setError('')
    setSaving(key)
    try { await updateSetting(key, value); toast.success('Setting saved'); q.refetch() }
    catch (e) { setError(e.message) } finally { setSaving(null) }
  }

  if (q.isInitialLoading) return <PageLoader />
  if (q.error) return <Card><ErrorState error={q.error} onRetry={q.refetch} /></Card>

  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Lab-wide rules. They are enforced by the database, not just this screen." />
      <div className="space-y-5">
        <InlineError>{error}</InlineError>

        <Section icon={AtSign} title="Allowed email domains"
          hint="Only addresses on these domains can register. Leave the list empty to allow any domain (not recommended)."
          footer={<Button onClick={() => save('allowed_email_domains', domains)} loading={saving === 'allowed_email_domains'}>Save domains</Button>}>
          <div className={cx('flex min-h-[3.25rem] flex-wrap items-center gap-2 rounded-lg border p-2.5',
            domains.length ? 'border-line bg-slate-50' : 'border-warn/25 bg-warn-bg')}>
            {domains.map((d) => (
              <span key={d} className="inline-flex max-w-full items-center gap-1 rounded-full bg-cyan-soft py-1 pl-3 pr-1 text-[13px] font-medium text-brand ring-1 ring-inset ring-brand/15">
                <span className="min-w-0 truncate font-mono">@{d}</span>
                <button type="button" onClick={() => setDomains(domains.filter((x) => x !== d))} aria-label={`Remove ${d}`}
                  className="flex-none rounded-full p-1 text-brand/70 transition-colors hover:bg-bad/10 hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {domains.length === 0 && (
              <span className="inline-flex items-center gap-2 px-1 text-sm font-medium text-warn">
                <AlertTriangle className="h-4 w-4 flex-none" aria-hidden />No restriction — anyone can register.
              </span>
            )}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const d = newDomain.trim().toLowerCase().replace(/^@/, ''); if (d && !domains.includes(d)) setDomains([...domains, d]); setNewDomain('') }}>
            <div className="min-w-0 flex-1">
              <Input aria-label="Domain" placeholder="e.g. srmist.edu.in" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
            </div>
            <Button type="submit" variant="outline" icon={Plus}>Add</Button>
          </form>
        </Section>

        <Section icon={SlidersHorizontal} title="Borrowing limits">
          <div className="divide-y divide-line rounded-lg border border-line">
            {[['max_loan_days', 'Longest loan (days)'], ['max_items_per_request', 'Components per request'], ['max_pending_requests', 'Pending requests per student']].map(([k, label]) => {
              const Icon = LIMIT_ICONS[k]
              return (
                <div key={k} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <label htmlFor={`setting-${k}`} className="flex min-w-0 items-center gap-3 text-[13.5px] font-semibold text-ink">
                    <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-slate-100 text-muted ring-1 ring-inset ring-slate-200" aria-hidden>
                      <Icon className="h-4 w-4" />
                    </span>
                    {label}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 sm:w-28 sm:flex-none">
                      <Input id={`setting-${k}`} type="number" min={1} max={365} value={nums[k] ?? ''}
                        onChange={(e) => setNums({ ...nums, [k]: e.target.value })} className="num font-semibold" />
                    </div>
                    <Button variant="outline" loading={saving === k} onClick={() => save(k, Number(nums[k]))}>Save</Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        <Section icon={Globe} title="Lab time zone" hint="Used for due dates and overdue checks.">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1 sm:max-w-sm">
              <Input aria-label="Time zone" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Asia/Kolkata" />
            </div>
            <Button variant="outline" loading={saving === 'lab_timezone'} onClick={() => save('lab_timezone', tz.trim())}>Save</Button>
          </div>
        </Section>
      </div>
    </div>
  )
}
