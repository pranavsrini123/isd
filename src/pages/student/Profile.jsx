import { useEffect, useState } from 'react'
import { Check, GraduationCap, IdCard, Lock, Mail, Plus, Save, SlidersHorizontal, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { updateMyProfile, projectCategories } from '../../lib/api'
import { useQuery } from '../../hooks/useQuery'
import { isValidSrmId } from '../../lib/validation'
import { departmentError, joinDepartment, splitDepartment } from '../../lib/department'
import { roleLabel } from '../../lib/roles'
import { DepartmentField } from '../../components/domain/DepartmentField'
import { Avatar, Badge, Button, Card, Hero, IconTile, cx } from '../../components/ui/primitives'
import { Field, Input, Select } from '../../components/ui/forms'
import { Stagger, StaggerItem } from '../../components/ui/motion'
import { Orbit } from '../../components/ui/decor'

/** The student's initials inside a glowing gradient ring (purely visual). */
function AvatarHalo({ name }) {
  return (
    <span className="relative inline-flex flex-none" aria-hidden>
      <span className="absolute -inset-4 rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.42),transparent)]" />
      <span className="absolute -inset-[5px] rounded-full bg-[conic-gradient(from_210deg,#22D3EE,#4F7BFF,#8B7CFF,#67E8F9,#22D3EE)] shadow-[0_0_24px_rgb(34_211_238/0.45)]" />
      <Avatar name={name}
        className="relative !h-16 !w-16 !text-[22px] !ring-[3px] !ring-night-2 sm:!h-[76px] sm:!w-[76px] sm:!text-[26px]" />
    </span>
  )
}

/** Light chip on the night hero for one identity detail. */
function HeroChip({ icon: Icon, children }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-white/[.12] bg-white/[.07] px-3 py-1.5 text-[13px] font-medium text-white/90">
      <Icon className="h-3.5 w-3.5 flex-none text-cyan-light" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

/** A labelled input with a leading icon. The label stays tied to the input for screen readers and tests. */
function IconInput({ id, label, icon: Icon, error, className, inputClassName, ...rest }) {
  return (
    <Field label={label} htmlFor={id} error={error} className={className}>
      <div className="relative">
        <Icon className={cx('pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2', error ? 'text-bad' : 'text-subtle')} aria-hidden />
        <Input id={id} error={error} className={cx('!pl-10', inputClassName)} {...rest} />
      </div>
    </Field>
  )
}

const sameList = (a, b) => [...a].sort().join('|') === [...b].sort().join('|')

export default function Profile() {
  const { profile, setProfile } = useAuth()
  const toast = useToast()
  const cats = useQuery(() => projectCategories(), [])
  const [form, setForm] = useState({
    full_name: profile.full_name || '',
    srm_id: profile.srm_id || '',
    department: splitDepartment(profile.department),
    preferred_difficulty: profile.preferred_difficulty || '',
    interests: profile.interests || [],
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  // "Add it now" in the missing-department banner links to #department.
  useEffect(() => {
    if (window.location.hash === '#department') document.getElementById('department')?.scrollIntoView({ block: 'center' })
  }, [])

  async function save(e) {
    e.preventDefault()
    const v = {}
    if (form.full_name.trim().length < 2) v.full_name = 'Enter your full name'
    if (!isValidSrmId(form.srm_id)) v.srm_id = '6–20 letters or digits'
    const dErr = departmentError(form.department)
    if (dErr) v.department = dErr
    setErrors(v)
    if (Object.keys(v).length) return
    setSaving(true)
    try {
      const updated = await updateMyProfile(profile.id, {
        full_name: form.full_name.trim(),
        srm_id: form.srm_id.trim() ? form.srm_id.trim().toUpperCase() : null,
        department: joinDepartment(form.department),
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

  // Purely visual: marks the save button while the form differs from the saved profile.
  const dirty = form.full_name.trim() !== (profile.full_name || '')
    || form.srm_id.trim().toUpperCase() !== (profile.srm_id || '')
    || joinDepartment(form.department) !== (profile.department || '')
    || form.preferred_difficulty !== (profile.preferred_difficulty || '')
    || !sameList(form.interests, profile.interests || [])

  return (
    <div>
      <Hero eyebrow="Profile"
        decor={<>
          <Orbit className="-right-24 top-1/2 hidden h-[400px] w-[400px] -translate-y-1/2 opacity-75 md:block lg:right-6" />
          <Orbit className="-right-24 -top-20 h-60 w-60 opacity-30 md:hidden" />
        </>}
        title={
          <span className="flex items-center gap-4 sm:gap-5">
            <AvatarHalo name={profile.full_name} />
            <span className="min-w-0 break-words">{profile.full_name}</span>
          </span>
        }
        titleClassName="mt-3.5"
        subtitle="Your details and the preferences used to rank projects for you.">
        <div className="flex flex-wrap items-center gap-2">
          <HeroChip icon={Mail}>{profile.email}</HeroChip>
          {profile.srm_id && <HeroChip icon={IdCard}><span className="num">{profile.srm_id}</span></HeroChip>}
          <Badge tone={profile.role === 'student' ? 'cyan' : 'info'} dot>{roleLabel(profile.role)}</Badge>
          {profile.status !== 'active' && <Badge tone="warn">{profile.status}</Badge>}
        </div>
      </Hero>

      <form onSubmit={save} noValidate>
        <Stagger className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <StaggerItem className="h-full">
            <Card className="relative flex h-full flex-col overflow-hidden">
              <span aria-hidden className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan/70 to-transparent" />
              <div className="grid flex-1 content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <IconInput id="profile-full-name" label="Full name" icon={UserRound} value={form.full_name} error={errors.full_name} maxLength={120}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                <IconInput id="profile-srm-id" label="Register number" icon={IdCard} inputClassName="num" value={form.srm_id} error={errors.srm_id} maxLength={20}
                  onChange={(e) => setForm({ ...form, srm_id: e.target.value })} />
                <div id="department" className="scroll-mt-24 sm:col-span-2 xl:col-span-1">
                  {!profile.department && (
                    <p className="mb-3 flex items-start gap-2 rounded-xl bg-warn-bg px-3 py-2 text-[13px] font-medium text-warn" role="status">
                      <GraduationCap className="mt-px h-4 w-4 flex-none" aria-hidden />Add your department. It is required and is filled into your requests and enquiries.
                    </p>
                  )}
                  <DepartmentField value={form.department} error={errors.department}
                    onChange={(d) => { setForm({ ...form, department: d }); if (errors.department) setErrors({ ...errors, department: '' }) }} />
                </div>
              </div>
              <p className="mt-6 flex items-start gap-2.5 border-t border-line/80 pt-4 text-xs leading-relaxed text-muted">
                <span className="mt-px flex h-5 w-5 flex-none items-center justify-center rounded-md bg-slate-100 text-subtle" aria-hidden><Lock className="h-3 w-3" /></span>
                Your email and role can only be changed by a lab administrator.
              </p>
            </Card>
          </StaggerItem>

          <StaggerItem className="h-full">
            <Card className="h-full">
              <div className="flex items-start gap-3.5">
                <IconTile icon={SlidersHorizontal} tone="brand" />
                <div className="min-w-0">
                  <h2 className="text-[19px] font-semibold leading-snug">Project preferences</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">When two projects are equally ready, the one matching your preferences is shown first.</p>
                </div>
              </div>
              <div className="mt-5 border-t border-line/80 pt-5">
                <div className="max-w-xs">
                  <Select label="Preferred difficulty" value={form.preferred_difficulty} placeholder="No preference" onChange={(e) => setForm({ ...form, preferred_difficulty: e.target.value })}
                    options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
                </div>
                <p id="profile-interests" className="mb-2.5 mt-5 text-[13.5px] font-semibold text-ink">Interests</p>
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="profile-interests">
                  {(cats.data || []).map((c) => {
                    const on = form.interests.includes(c)
                    return (
                      <button type="button" key={c} onClick={() => toggle(c)} aria-pressed={on}
                        className={cx('inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-3.5 text-left text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150',
                          'motion-safe:active:scale-[.97]',
                          on ? 'border-transparent bg-night-2 text-white shadow-[0_0_0_1px_rgb(34_211_238/0.4),0_8px_18px_-10px_rgb(34_211_238/0.8)]'
                            : 'border-line-strong bg-white/85 text-ink hover:border-brand/50 hover:bg-white hover:text-brand')}>
                        {on ? <Check className="h-4 w-4 flex-none text-cyan" aria-hidden /> : <Plus className="h-4 w-4 flex-none text-subtle" aria-hidden />}
                        <span className="min-w-0 break-words">{c}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </Card>
          </StaggerItem>
        </Stagger>

        <div className="sticky bottom-3 z-10 mt-5 flex justify-end rounded-2xl border border-white/80 bg-white/80 p-2.5 shadow-card backdrop-blur-xl sm:static sm:mt-6 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
          <span className="relative w-full sm:w-auto">
            <Button type="submit" size="lg" icon={Save} loading={saving} className="w-full sm:w-auto">Save changes</Button>
            {dirty && !saving && (
              <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 rounded-full bg-cyan ring-2 ring-white shadow-[0_0_10px_rgb(34_211_238/0.9)]" />
            )}
          </span>
        </div>
      </form>
    </div>
  )
}
