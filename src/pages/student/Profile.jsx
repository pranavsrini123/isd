import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { updateMyProfile, projectCategories } from '../../lib/api'
import { useQuery } from '../../hooks/useQuery'
import { isValidSrmId } from '../../lib/validation'
import { Badge, Button, Card, PageHeader, cx } from '../../components/ui/primitives'
import { Input, Select } from '../../components/ui/forms'

export default function Profile() {
  const { profile, setProfile } = useAuth()
  const toast = useToast()
  const cats = useQuery(() => projectCategories(), [])
  const [form, setForm] = useState({
    full_name: profile.full_name || '',
    srm_id: profile.srm_id || '',
    department: profile.department || '',
    preferred_difficulty: profile.preferred_difficulty || '',
    interests: profile.interests || [],
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  async function save(e) {
    e.preventDefault()
    const v = {}
    if (form.full_name.trim().length < 2) v.full_name = 'Enter your full name'
    if (!isValidSrmId(form.srm_id)) v.srm_id = '6–20 letters or digits'
    setErrors(v)
    if (Object.keys(v).length) return
    setSaving(true)
    try {
      const updated = await updateMyProfile(profile.id, {
        full_name: form.full_name.trim(),
        srm_id: form.srm_id.trim() ? form.srm_id.trim().toUpperCase() : null,
        department: form.department.trim() || null,
        preferred_difficulty: form.preferred_difficulty || null,
        interests: form.interests,
      })
      setProfile(updated)
      toast.success('Profile saved. Project recommendations now use your preferences.')
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }
  const toggle = (c) => setForm((f) => ({ ...f, interests: f.interests.includes(c) ? f.interests.filter((x) => x !== c) : [...f.interests, c].slice(0, 12) }))

  return (
    <div className="max-w-3xl">
      <PageHeader title="Profile" subtitle="Your details and the preferences used to rank projects for you." />
      <form onSubmit={save} className="space-y-6" noValidate>
        <Card>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{profile.email}</span>
            <Badge tone={profile.role === 'admin' ? 'info' : 'cyan'}>{profile.role === 'admin' ? 'Administrator' : 'Student'}</Badge>
            {profile.status !== 'active' && <Badge tone="warn">{profile.status}</Badge>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={form.full_name} error={errors.full_name} maxLength={120} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Input label="Register number" value={form.srm_id} error={errors.srm_id} maxLength={20} onChange={(e) => setForm({ ...form, srm_id: e.target.value })} />
            <Input label="Department" value={form.department} maxLength={120} onChange={(e) => setForm({ ...form, department: e.target.value })} className="sm:col-span-2" />
          </div>
          <p className="mt-3 text-xs text-muted">Your email and role can only be changed by a lab administrator.</p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Project preferences</h2>
          <p className="mt-1 text-sm text-muted">When two projects are equally ready, the one matching your preferences is shown first.</p>
          <div className="mt-4 max-w-xs">
            <Select label="Preferred difficulty" value={form.preferred_difficulty} placeholder="No preference" onChange={(e) => setForm({ ...form, preferred_difficulty: e.target.value })}
              options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
          </div>
          <p className="mb-2 mt-5 text-sm font-semibold">Interests</p>
          <div className="flex flex-wrap gap-2">
            {(cats.data || []).map((c) => (
              <button type="button" key={c} onClick={() => toggle(c)} aria-pressed={form.interests.includes(c)}
                className={cx('rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  form.interests.includes(c) ? 'border-brand bg-brand text-white' : 'border-[#CBD5E1] bg-white hover:border-brand')}>
                {c}
              </button>
            ))}
          </div>
        </Card>
        <div className="flex justify-end"><Button type="submit" loading={saving}>Save changes</Button></div>
      </form>
    </div>
  )
}
