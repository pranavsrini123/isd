import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, Eye, ImagePlus, Plus, Rocket, Save, Trash2, Undo2 } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useDebounce } from '../../hooks/useDebounce'
import {
  createProject, deleteProject, getProject, getProjectComponents, getProjectReadiness, listInventory, saveProjectComponents,
  updateProject, uploadImage,
} from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, ErrorState, InlineError, PageHeader, PageLoader, ReadinessRing, cx } from '../../components/ui/primitives'
import { Input, SearchInput, Select, Stepper, Textarea } from '../../components/ui/forms'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { Thumb } from '../../components/domain/Thumb'

const EMPTY = {
  name: '', slug: '', description: '', category: 'General', difficulty: 'beginner', est_hours_min: '', est_hours_max: '',
  instructions: '', documentation_url: '', github_url: '', video_url: '', learning_outcomes: '', image_path: null,
  objectives: '', prerequisites: '', hardware_software: '', expected_outcome: '', testing_steps: '', safety_notes: '',
  extensions: '', external_requirements: '', verification_note: '', image_alt: '',
}
// Text-area fields stored as text[] in the database (one entry per line).
const LIST_FIELDS = ['learning_outcomes', 'objectives', 'prerequisites', 'hardware_software', 'testing_steps', 'safety_notes', 'extensions', 'external_requirements']
const toList = (s) => (s || '').split('\n').map((x) => x.trim()).filter(Boolean)
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
const isUrl = (s) => !s || /^https:\/\/[^\s]+$/i.test(s)

export default function ProjectEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const nav = useNavigate()
  const toast = useToast()
  const project = useQuery(() => (isNew ? Promise.resolve(null) : getProject(id)), [id])
  const comps = useQuery(() => (isNew ? Promise.resolve([]) : getProjectComponents(id)), [id])
  const ready = useQuery(() => (isNew ? Promise.resolve(null) : getProjectReadiness(id)), [id])
  const [form, setForm] = useState(EMPTY)
  const [lines, setLines] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const p = project.data
    if (!p) return
    setForm({
      ...EMPTY, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])),
      image_path: p.image_path || null,
      ...Object.fromEntries(LIST_FIELDS.map((k) => [k, (p[k] || []).join('\n')])),
    })
  }, [project.data])
  useEffect(() => {
    if (comps.data) setLines(comps.data.map((c) => ({ item_id: c.item_id, name: c.item_name, qty_required: c.qty_required, notes: c.notes || '', available_qty: c.available_qty, archived: c.item_archived })))
  }, [comps.data])

  const set = (k) => (e) => { setDirty(true); setForm((f) => ({ ...f, [k]: e.target.value })) }

  function validate() {
    const v = {}
    if (!form.name.trim()) v.name = 'Required'
    if (!form.category.trim()) v.category = 'Required'
    const mn = form.est_hours_min === '' ? null : Number(form.est_hours_min)
    const mx = form.est_hours_max === '' ? null : Number(form.est_hours_max)
    if (mn !== null && (Number.isNaN(mn) || mn < 0 || mn > 999)) v.est_hours_min = '0–999'
    if (mx !== null && (Number.isNaN(mx) || mx < 0 || mx > 999)) v.est_hours_max = '0–999'
    if (mn !== null && mx !== null && mx < mn) v.est_hours_max = 'Must be ≥ minimum'
    if (form.image_path && !/^(\/[\w./-]+|https:\/\/\S+|[\w-]+\/[\w./-]+)$/.test(form.image_path)) v.image_path = 'Upload an image, or use /projects/<file>.svg or an https:// link'
    for (const k of ['documentation_url', 'github_url', 'video_url']) if (!isUrl(form[k].trim())) v[k] = 'Use a full https:// link'
    setErrors(v)
    return Object.keys(v).length === 0
  }

  const payload = () => ({
    name: form.name.trim(), slug: form.slug.trim() || slugify(form.name), description: form.description.trim() || null,
    category: form.category.trim(), difficulty: form.difficulty,
    est_hours_min: form.est_hours_min === '' ? null : Number(form.est_hours_min), est_hours_max: form.est_hours_max === '' ? null : Number(form.est_hours_max),
    instructions: form.instructions.trim() || null, documentation_url: form.documentation_url.trim() || null,
    github_url: form.github_url.trim() || null, video_url: form.video_url.trim() || null, image_path: form.image_path || null,
    ...Object.fromEntries(LIST_FIELDS.map((k) => [k, toList(form[k])])),
    expected_outcome: form.expected_outcome.trim() || null, verification_note: form.verification_note.trim() || null,
    image_alt: form.image_alt.trim() || null,
  })

  async function save(nextStatus) {
    setError('')
    if (!validate()) return
    if ((nextStatus || project.data?.status) === 'published' && lines.length === 0) return setError('A published project needs at least one required component. Unpublish it first to remove them all.')
    setSaving(true)
    try {
      let pid = id
      if (isNew) {
        const created = await createProject(payload())
        pid = created.id
      } else {
        await updateProject(pid, payload())
      }
      await saveProjectComponents(pid, lines.map((l) => ({ item_id: l.item_id, qty_required: l.qty_required, notes: l.notes })))
      if (nextStatus) await updateProject(pid, { status: nextStatus })
      setDirty(false)
      toast.success(nextStatus === 'published' ? 'Project published — students can see it now' : nextStatus ? `Project ${nextStatus}` : 'Project saved')
      if (isNew) nav(`/admin/projects/${pid}`, { replace: true })
      else { project.refetch(); comps.refetch(); ready.refetch() }
    } catch (e) {
      setError(e.code === '23505' ? 'Another project already uses this slug. Change the slug.' : e.message)
    } finally { setSaving(false) }
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try { const path = await uploadImage(file, 'projects'); setForm((f) => ({ ...f, image_path: path })); setDirty(true) } catch (err) { toast.error(err) }
  }

  if (project.isInitialLoading) return <PageLoader />
  if (project.error) return <Card><ErrorState error={project.error} onRetry={project.refetch} /></Card>
  if (!isNew && !project.data) return <Card><ErrorState error={new Error('Project not found')} /></Card>
  const status = project.data?.status || 'draft'
  const satisfied = lines.filter((l) => !l.archived && l.available_qty >= l.qty_required).length
  const pct = lines.length ? Math.round((100 * satisfied) / lines.length) : 0

  return (
    <div>
      <PageHeader back={{ to: '/admin/projects', label: 'Projects' }} title={isNew ? 'New project' : form.name || 'Project'}
        subtitle={isNew ? 'Saved as a draft. Publish when the component list is complete.' : undefined}
        actions={<>
          {!isNew && <Badge tone={{ published: 'ok', draft: 'warn', archived: 'neutral' }[status]} className="!px-3 !py-1 !text-sm">{status}</Badge>}
          {!isNew && status === 'published' && <Button variant="outline" icon={Eye} to={`/student/projects/${id}`}>Student view</Button>}
          <Button variant="outline" icon={Save} onClick={() => save(null)} loading={saving}>Save{dirty ? ' changes' : ''}</Button>
          {status !== 'published' && <Button icon={Rocket} onClick={() => save('published')} loading={saving}>Save &amp; publish</Button>}
          {status === 'published' && <Button variant="outline" icon={Undo2} onClick={() => save('draft')} loading={saving}>Unpublish</Button>}
          {!isNew && status !== 'archived' && <Button variant="ghost" icon={Archive} onClick={() => save('archived')}>Archive</Button>}
        </>} />
      {error && <div className="mb-5"><InlineError>{error}</InlineError></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name" value={form.name} onChange={set('name')} error={errors.name} required maxLength={160} className="sm:col-span-2" />
              <Input label="Category" value={form.category} onChange={set('category')} error={errors.category} hint="e.g. Robotics, IoT, Sensors" maxLength={60} />
              <Select label="Difficulty" value={form.difficulty} onChange={set('difficulty')} options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
              <Input label="Estimated hours (min)" type="number" min={0} step="0.5" value={form.est_hours_min} onChange={set('est_hours_min')} error={errors.est_hours_min} />
              <Input label="Estimated hours (max)" type="number" min={0} step="0.5" value={form.est_hours_max} onChange={set('est_hours_max')} error={errors.est_hours_max} />
              <Textarea label="Description" value={form.description} onChange={set('description')} rows={3} maxLength={4000} className="sm:col-span-2" />
              <Textarea label="Build instructions" value={form.instructions} onChange={set('instructions')} rows={7} className="sm:col-span-2"
                hint="One step per paragraph. Optional title on the first line of each step." />
              <Textarea label="Objectives" value={form.objectives} onChange={set('objectives')} rows={3} hint="One per line" className="sm:col-span-2" />
              <Textarea label="Expected outcome" value={form.expected_outcome} onChange={set('expected_outcome')} rows={2} maxLength={2000} className="sm:col-span-2" />
              <Textarea label="Prerequisites and skills" value={form.prerequisites} onChange={set('prerequisites')} rows={3} hint="One per line" />
              <Textarea label="Hardware and software" value={form.hardware_software} onChange={set('hardware_software')} rows={3} hint="One per line" />
              <Textarea label="Testing procedure" value={form.testing_steps} onChange={set('testing_steps')} rows={3} hint="One step per line" />
              <Textarea label="Safety notes" value={form.safety_notes} onChange={set('safety_notes')} rows={3} hint="One per line" />
              <Textarea label="Extensions for advanced students" value={form.extensions} onChange={set('extensions')} rows={2} hint="One per line" />
              <Textarea label="Learning outcomes (legacy)" value={form.learning_outcomes} onChange={set('learning_outcomes')} rows={2} hint="Shown only when Objectives is empty" />
              <Textarea label="Not stocked by the lab" value={form.external_requirements} onChange={set('external_requirements')} rows={2}
                hint="One per line. Listing anything here makes the status “Requires external components”." />
              <Textarea label="Compatibility check needed" value={form.verification_note} onChange={set('verification_note')} rows={2} maxLength={1000}
                hint="Leave empty once confirmed. While filled, the status is “Requires compatibility verification”." />
              <Input label="Documentation link" value={form.documentation_url} onChange={set('documentation_url')} error={errors.documentation_url} placeholder="https://" />
              <Input label="GitHub link" value={form.github_url} onChange={set('github_url')} error={errors.github_url} placeholder="https://" />
              <Input label="Video link" value={form.video_url} onChange={set('video_url')} error={errors.video_url} placeholder="https://" />
              <Input label="URL slug" value={form.slug} onChange={set('slug')} placeholder={slugify(form.name) || 'auto'} hint="Leave blank to generate" />
              <Input label="Image path or link" value={form.image_path || ''} onChange={set('image_path')} error={errors.image_path} placeholder="/projects/my-project.svg" hint="Filled automatically when you upload" />
              <Input label="Image description (alt text)" value={form.image_alt} onChange={set('image_alt')} maxLength={300} hint="What the picture shows, for screen readers" />
              <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
                <Thumb path={form.image_path} name={form.name || 'project'} alt={form.image_alt} kind="project" className="aspect-[16/10] w-40" />
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-[#CBD5E1] bg-white px-3.5 text-[13px] font-semibold hover:bg-slate-50">
                  <ImagePlus className="h-4 w-4" /> {form.image_path ? 'Replace image' : 'Upload image'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile} />
                </label>
              </div>
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div><h2 className="font-semibold">Required components</h2><p className="text-xs text-muted">Linked to inventory items, so availability is always live.</p></div>
              <Button size="sm" icon={Plus} onClick={() => setPicker(true)}>Add component</Button>
            </div>
            {lines.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted">No components yet. A project needs at least one before it can be published.</p> : (
              <ul className="divide-y divide-line">
                {lines.map((l, idx) => {
                  const ok = !l.archived && l.available_qty >= l.qty_required
                  return (
                    <li key={l.item_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{l.name}</p>
                        <p className={cx('text-xs', ok ? 'text-muted' : 'text-bad')}>{l.archived ? 'Archived item — counts as unavailable' : `${l.available_qty} available now`}</p>
                      </div>
                      <Input aria-label={`Notes for ${l.name}`} placeholder="Note (optional)" value={l.notes} maxLength={300} className="!min-h-9 w-48"
                        onChange={(e) => { setDirty(true); setLines((ls) => ls.map((x, j) => (j === idx ? { ...x, notes: e.target.value } : x))) }} />
                      <Stepper size="sm" value={l.qty_required} min={1} max={1000} label={`${l.name} quantity`} onChange={(n) => { setDirty(true); setLines((ls) => ls.map((x, j) => (j === idx ? { ...x, qty_required: n } : x))) }} />
                      <Button size="icon" variant="ghost" aria-label={`Remove ${l.name}`} onClick={() => { setDirty(true); setLines((ls) => ls.filter((_, j) => j !== idx)) }}><Trash2 className="h-4 w-4 text-bad" /></Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="xl:sticky xl:top-24">
            <p className="label-caps">Readiness preview</p>
            <div className="mt-3 flex items-center gap-4">
              <ReadinessRing pct={pct} buildable={lines.length > 0 && satisfied === lines.length} size={76} />
              <div>
                <p className="font-semibold">{satisfied} of {lines.length} components available</p>
                <p className="text-sm text-muted">{dirty ? 'Preview of unsaved changes' : ready.data ? `Saved: ${ready.data.ready_pct}%${ready.data.buildable ? ', buildable' : ''}` : 'Not saved yet'}</p>
              </div>
            </div>
            {!isNew && status === 'draft' && (
              <Button variant="danger-outline" size="sm" className="mt-5 w-full" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete draft</Button>
            )}
          </Card>
        </aside>
      </div>

      <ComponentPicker open={picker} onClose={() => setPicker(false)} exclude={new Set(lines.map((l) => l.item_id))}
        onPick={(i) => { setDirty(true); setLines((ls) => [...ls, { item_id: i.id, name: i.name, qty_required: 1, notes: '', available_qty: i.available_qty, archived: i.is_archived }]) }} />
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} tone="danger" confirmLabel="Delete" title="Delete this draft?"
        onConfirm={async () => { try { await deleteProject(id); toast.success('Draft deleted'); nav('/admin/projects') } catch (e) { toast.error(e) } }}>
        This permanently removes the draft and its component list. Past requests keep their history.
      </ConfirmDialog>
    </div>
  )
}

function ComponentPicker({ open, onClose, onPick, exclude }) {
  const [q, setQ] = useState('')
  const dq = useDebounce(q, 250)
  const res = useQuery(() => listInventory({ search: dq, pageSize: 25 }), [dq], { enabled: open })
  return (
    <Modal open={open} onClose={onClose} title="Add required component" size="lg">
      <SearchInput value={q} onChange={setQ} placeholder="Search inventory" />
      <ul className="mt-4 divide-y divide-line">
        {(res.data?.data || []).map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2.5">
            <Thumb path={i.image_path} name={i.name} category={i.category_name} className="h-10 w-10" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{i.name}</p><p className="text-xs text-muted">{i.category_name} · {i.available_qty} / {i.total_qty} available</p></div>
            {exclude.has(i.id) ? <Badge tone="info">Added</Badge> : <Button size="sm" variant="outline" icon={Plus} onClick={() => onPick(i)}>Add</Button>}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
