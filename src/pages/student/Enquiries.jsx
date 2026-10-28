import { useState } from 'react'
import { HelpCircle, MessageSquareText, Send } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { createEnquiry, myEnquiries } from '../../lib/api'
import { departmentError, joinDepartment, splitDepartment } from '../../lib/department'
import { formatDateTime } from '../../lib/format'
import { Button, Card, EmptyState, ErrorState, IconTile, InlineError, PageHeader, SectionTitle, SkeletonRows } from '../../components/ui/primitives'
import { Input, Textarea } from '../../components/ui/forms'
import { DepartmentField } from '../../components/domain/DepartmentField'
import { EnquiryStatusBadge } from '../../components/domain/badges'

export const ENQUIRY_MIN = 10
export const ENQUIRY_MAX = 2000

/** Client-side checks; the database repeats them in create_enquiry(). Pure (tested). */
export function validateEnquiry({ name, registrationNumber, dept, description }) {
  const errors = {}
  if (!name || name.trim().length < 2) errors.name = 'Enter your name'
  if (!/^[A-Za-z0-9]{6,20}$/.test((registrationNumber || '').trim())) errors.registrationNumber = 'Enter your registration number (6–20 letters and digits)'
  const d = departmentError(dept)
  if (d) errors.department = d
  const len = (description || '').trim().length
  if (len < ENQUIRY_MIN) errors.description = `Describe what you need in at least ${ENQUIRY_MIN} characters`
  else if (len > ENQUIRY_MAX) errors.description = `Keep it under ${ENQUIRY_MAX} characters`
  return errors
}

export default function Enquiries() {
  const { profile } = useAuth()
  const toast = useToast()
  const list = useQuery(() => myEnquiries(profile.id), [profile.id])
  useRealtime(['enquiries'], list.refetch)

  const blank = () => ({
    name: profile.full_name || '',
    registrationNumber: profile.srm_id || '',
    dept: splitDepartment(profile.department),
    description: '',
  })
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => (x[k] ? { ...x, [k]: '' } : x)) }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const v = validateEnquiry(form)
    setErrors(v)
    if (Object.keys(v).length) return
    setSaving(true)
    try {
      await createEnquiry({
        name: form.name.trim(),
        registrationNumber: form.registrationNumber.trim().toUpperCase(),
        department: joinDepartment(form.dept),
        description: form.description.trim(),
      })
      toast.success('Enquiry sent. The lab team will reply here and in your notifications.')
      setForm((f) => ({ ...f, description: '' }))
      list.refetch()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const rows = list.data || []
  const len = form.description.trim().length

  return (
    <div>
      <PageHeader title="Enquiries" subtitle="Ask the lab about components, availability or project requirements. Sending an enquiry does not reserve anything." />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Card>
          <div className="mb-5 flex items-start gap-3.5">
            <IconTile icon={MessageSquareText} tone="brand" />
            <div className="min-w-0">
              <h2 className="text-[19px] font-semibold leading-snug">New enquiry</h2>
              <p className="mt-1 text-sm text-muted">Your details come from your profile. Change them here only if they are wrong.</p>
            </div>
          </div>
          <form onSubmit={submit} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name" required value={form.name} onChange={set('name')} error={errors.name} maxLength={120} autoComplete="name" />
              <Input label="Registration number" required value={form.registrationNumber} onChange={set('registrationNumber')}
                error={errors.registrationNumber} maxLength={20} autoComplete="off" />
              <Input label="Email ID" value={profile.email} readOnly disabled hint="Replies go to your account" />
              <DepartmentField value={form.dept} error={errors.department} onChange={(dept) => { setForm((f) => ({ ...f, dept })); setErrors((x) => ({ ...x, department: '' })) }} />
            </div>
            <Textarea label="Enquiry" required rows={6} value={form.description} onChange={set('description')} error={errors.description}
              maxLength={ENQUIRY_MAX} placeholder="e.g. Is a second Jetson Nano free next week for our final-year project?"
              hint={`${len} / ${ENQUIRY_MAX} characters`} />
            <InlineError>{error}</InlineError>
            <div className="flex justify-end">
              <Button type="submit" icon={Send} loading={saving} className="w-full sm:w-auto">Send enquiry</Button>
            </div>
          </form>
        </Card>

        <Card>
          <SectionTitle className="mb-3">Your enquiries</SectionTitle>
          {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
            : list.isInitialLoading ? <SkeletonRows rows={3} />
            : rows.length === 0 ? (
              <EmptyState icon={HelpCircle} title="No enquiries yet">Questions you send appear here with their status.</EmptyState>
            ) : (
              <ul className="-mx-1 divide-y divide-line">
                {rows.map((q) => (
                  <li key={q.id} className="px-1 py-3.5" data-enquiry={q.enquiry_code}>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="num text-sm font-semibold text-ink">{q.enquiry_code}</span>
                      <EnquiryStatusBadge status={q.status} />
                      <span className="ml-auto text-xs text-muted">{formatDateTime(q.created_at)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 break-words text-sm leading-relaxed text-ink">{q.description}</p>
                    {q.status !== 'open' && q.updated_at !== q.created_at && (
                      <p className="mt-1 text-xs text-muted">Updated {formatDateTime(q.updated_at)}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>
    </div>
  )
}
