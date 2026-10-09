import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { listSettings, updateSetting } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { Button, Card, ErrorState, InlineError, PageHeader, PageLoader } from '../../components/ui/primitives'
import { Input } from '../../components/ui/forms'

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
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Lab-wide rules. They are enforced by the database, not just this screen." />
      <InlineError>{error}</InlineError>
      <Card>
        <h2 className="font-semibold">Allowed email domains</h2>
        <p className="mt-1 text-sm text-muted">Only addresses on these domains can register. Leave the list empty to allow any domain (not recommended).</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {domains.map((d) => (
            <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-3 py-1 text-sm font-medium text-info">
              @{d}<button onClick={() => setDomains(domains.filter((x) => x !== d))} aria-label={`Remove ${d}`}><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
          {domains.length === 0 && <span className="text-sm font-medium text-warn">No restriction — anyone can register.</span>}
        </div>
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); const d = newDomain.trim().toLowerCase().replace(/^@/, ''); if (d && !domains.includes(d)) setDomains([...domains, d]); setNewDomain('') }}>
          <Input aria-label="Domain" placeholder="e.g. srmist.edu.in" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
          <Button type="submit" variant="outline" icon={Plus}>Add</Button>
        </form>
        <div className="mt-4 flex justify-end"><Button onClick={() => save('allowed_email_domains', domains)} loading={saving === 'allowed_email_domains'}>Save domains</Button></div>
      </Card>
      <Card>
        <h2 className="font-semibold">Borrowing limits</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[['max_loan_days', 'Longest loan (days)'], ['max_items_per_request', 'Components per request'], ['max_pending_requests', 'Pending requests per student']].map(([k, label]) => (
            <div key={k} className="space-y-2">
              <Input label={label} type="number" min={1} max={365} value={nums[k] ?? ''} onChange={(e) => setNums({ ...nums, [k]: e.target.value })} />
              <Button size="sm" variant="outline" loading={saving === k} onClick={() => save(k, Number(nums[k]))}>Save</Button>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="font-semibold">Lab time zone</h2>
        <p className="mt-1 text-sm text-muted">Used for due dates and overdue checks.</p>
        <div className="mt-4 flex gap-2"><Input aria-label="Time zone" value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Asia/Kolkata" />
          <Button variant="outline" loading={saving === 'lab_timezone'} onClick={() => save('lab_timezone', tz.trim())}>Save</Button></div>
      </Card>
    </div>
  )
}
