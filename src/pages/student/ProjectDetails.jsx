import { useParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, Clock, Cpu, ExternalLink, FlaskConical, FolderKanban, Github, GraduationCap, Lightbulb, ListChecks, PackageX, PlayCircle, ShieldAlert, ShoppingBasket, Target, Wrench, XCircle } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { getProject, getProjectComponents, getProjectReadiness } from '../../lib/api'
import { AVAILABILITY, hoursLabel } from '../../lib/format'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, ErrorState, PageLoader, ReadinessRing, cx } from '../../components/ui/primitives'
import { DifficultyBadge, DemoBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'
import { AvailabilityBadge } from '../../components/domain/ProjectCard'

const FLOW = ['Inventory', 'Availability', 'Projects', 'Required components', 'Request', 'Approval', 'Borrow', 'Return']

/** Splits free-text instructions into steps: blank lines or "1." style numbering. */
export function parseSteps(text) {
  if (!text) return []
  const blocks = text.split(/\n\s*\n|\n(?=\s*\d+[.)]\s)/).map((b) => b.trim()).filter(Boolean)
  return blocks.map((b) => {
    const clean = b.replace(/^\d+[.)]\s*/, '')
    const [first, ...rest] = clean.split('\n')
    return rest.length ? { title: first.trim(), body: rest.join(' ').trim() } : { title: null, body: first.trim() }
  })
}

/** A titled card with a bullet list; renders nothing when the list is empty. */
function ListCard({ title, icon: Icon, items, ordered = false, tone = 'text-cyan' }) {
  if (!items?.length) return null
  const L = ordered ? 'ol' : 'ul'
  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Icon className={cx('h-5 w-5', tone)} aria-hidden />{title}</h2>
      <L className="space-y-2 text-sm leading-relaxed">
        {items.map((o, i) => (
          <li key={i} className="flex gap-2.5">
            {ordered ? <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-info-bg text-xs font-bold text-brand">{i + 1}</span>
              : <CheckCircle2 className={cx('mt-0.5 h-4 w-4 flex-none', tone)} aria-hidden />}
            <span>{o}</span>
          </li>
        ))}
      </L>
    </Card>
  )
}

export default function ProjectDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const cart = useCart()
  const toast = useToast()
  const project = useQuery(() => getProject(id), [id])
  const comps = useQuery(() => getProjectComponents(id), [id])
  const ready = useQuery(() => getProjectReadiness(id), [id])
  useRealtime(['inventory_items', 'project_components'], () => { comps.refetch(); ready.refetch() })

  if (project.isInitialLoading || comps.isInitialLoading) return <PageLoader label="Loading project" />
  if (project.error) return <Card><ErrorState error={project.error} onRetry={project.refetch} /></Card>
  if (!project.data) return <Card><EmptyState icon={FolderKanban} title="Project not found" action={<Button to="/student/projects">Back to projects</Button>}>It may have been unpublished.</EmptyState></Card>

  const p = project.data
  const rows = comps.data || []
  const r = ready.data || { ready_pct: 0, buildable: false, n_required: rows.length, n_satisfied: 0 }
  const available = rows.filter((c) => c.satisfied)
  const missing = rows.filter((c) => !c.satisfied)
  const borrowable = rows.filter((c) => c.item_requestable !== false)
  const labOnly = rows.filter((c) => c.item_requestable === false)
  const external = p.external_requirements || []
  const status = availabilityOf(r, external, p.verification_note)
  const steps = parseSteps(p.instructions)
  const hours = hoursLabel(p.est_hours_min, p.est_hours_max)
  const objectives = p.objectives?.length ? p.objectives : p.learning_outcomes

  /** Adds the borrowable components to the request list; lab-use-only equipment is used in the lab. */
  function requestComponents() {
    const chosen = borrowable
      .map((c) => ({ ...c, qty_required: Math.min(c.qty_required, c.available_qty) }))
      .filter((c) => c.qty_required > 0)
    if (!chosen.length) return toast.error(borrowable.length ? 'None of the borrowable components are in stock right now.' : 'This project uses lab equipment only — ask the lab staff to book a session.')
    cart.loadProject(p, chosen)
    nav('/student/request')
  }

  return (
    <div>
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted" aria-label="Breadcrumb">
        <a href="/student/projects" onClick={(e) => { e.preventDefault(); nav('/student/projects') }} className="hover:text-ink">Projects</a>
        <span>/</span><span className="font-medium text-ink">{p.name}</span>
      </nav>
      <ol className="mb-6 hidden flex-wrap items-center gap-1.5 text-xs font-medium lg:flex" aria-label="Lab workflow">
        {FLOW.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cx('rounded-full px-2.5 py-1', s === 'Required components' ? 'bg-brand text-white' : i < 3 ? 'bg-info-bg text-info' : 'bg-white text-muted ring-1 ring-line')}>{s}</span>
            {i < FLOW.length - 1 && <span className="text-[#94A3B8]">›</span>}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card padded={false} className="overflow-hidden">
            <Thumb path={p.image_path} name={p.name} alt={p.image_alt || p.name} kind="project" className="aspect-[16/10] max-h-[440px] w-full !rounded-none" />
            <div className="p-6">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <AvailabilityBadge status={status} />
                <DifficultyBadge level={p.difficulty} />
                {hours && <Badge tone="neutral"><Clock className="h-3 w-3" />{hours}</Badge>}
                <Badge tone="cyan">{p.category}</Badge>
                <DemoBadge show={p.is_demo} />
              </div>
              <h1 className="text-[28px] font-bold leading-tight">{p.name}</h1>
              {p.description && <p className="mt-2 leading-relaxed text-muted">{p.description}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                <Button icon={ShoppingBasket} onClick={requestComponents} disabled={!borrowable.some((c) => c.available_qty > 0)}>
                  {borrowable.length && borrowable.every((c) => c.satisfied) ? 'Request components' : 'Request available components'}
                </Button>
                {p.documentation_url && <Button variant="outline" icon={BookOpen} onClick={() => window.open(p.documentation_url, '_blank', 'noopener')}>Docs</Button>}
                {p.github_url && <Button variant="outline" icon={Github} onClick={() => window.open(p.github_url, '_blank', 'noopener')}>Code</Button>}
                {p.video_url && <Button variant="outline" icon={PlayCircle} onClick={() => window.open(p.video_url, '_blank', 'noopener')}>Video</Button>}
              </div>
            </div>
          </Card>

          {p.verification_note && (
            <div className="flex gap-3 rounded-2xl border border-line bg-white p-4 text-sm">
              <AlertTriangle className="h-5 w-5 flex-none text-warn" aria-hidden />
              <div><p className="font-semibold">Check with the lab staff before starting</p><p className="text-muted">{p.verification_note}</p></div>
            </div>
          )}

          <ListCard title="Objectives" icon={Target} items={objectives} />
          {p.expected_outcome && (
            <Card>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold"><Lightbulb className="h-5 w-5 text-cyan" aria-hidden />Expected outcome</h2>
              <p className="text-sm leading-relaxed">{p.expected_outcome}</p>
            </Card>
          )}

          <Card padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold">Required components</h2>
              <span className="text-sm text-muted">{r.n_satisfied} of {r.n_required} in stock now</span>
            </div>
            {rows.length === 0 ? <p className="px-6 py-8 text-center text-sm text-muted">No components listed yet.</p> : (
              <ul className="divide-y divide-line">
                {rows.map((c) => (
                  <li key={c.item_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3.5">
                    {c.satisfied ? <CheckCircle2 className="h-5 w-5 flex-none text-ok" aria-label="In stock" /> : <XCircle className="h-5 w-5 flex-none text-bad" aria-label="Not enough in stock" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{c.item_name}</p>
                      {c.notes && <p className="text-xs text-muted">{c.notes}</p>}
                      {!c.satisfied && <p className="text-xs font-medium text-bad">{c.item_archived ? 'No longer stocked' : `Short by ${c.missing_qty}`}</p>}
                    </div>
                    {c.item_requestable === false && <Badge tone="warn">Use in lab</Badge>}
                    <span className="whitespace-nowrap font-mono text-sm text-muted">need {c.qty_required}</span>
                    <span className={cx('min-w-24 whitespace-nowrap text-right font-mono text-sm', c.satisfied ? 'text-muted' : 'font-semibold text-bad')}>{c.available_qty} in stock</span>
                  </li>
                ))}
              </ul>
            )}
            {(external.length > 0 || labOnly.length > 0) && (
              <div className="space-y-2 border-t border-line px-6 py-4 text-sm">
                {external.length > 0 && <p className="flex gap-2"><PackageX className="h-4 w-4 flex-none text-info" aria-hidden /><span><strong>Not stocked by the lab:</strong> {external.join('; ')}</span></p>}
                {labOnly.length > 0 && <p className="flex gap-2"><Wrench className="h-4 w-4 flex-none text-warn" aria-hidden /><span><strong>Lab equipment</strong> ({labOnly.map((c) => c.item_name).join(', ')}) is used in the lab under supervision and cannot be borrowed.</span></p>}
              </div>
            )}
          </Card>

          <ListCard title="Prerequisites and skills" icon={GraduationCap} items={p.prerequisites} />
          <ListCard title="Hardware and software" icon={Cpu} items={p.hardware_software} />

          {steps.length > 0 && (
            <Card>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><ListChecks className="h-5 w-5 text-cyan" aria-hidden />Implementation steps</h2>
              <ol className="space-y-4">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-info-bg font-display text-sm font-bold text-brand">{i + 1}</span>
                    <div className="pt-1">
                      {s.title && <p className="font-semibold">{s.title}</p>}
                      <p className="text-sm leading-relaxed text-muted">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <ListCard title="Testing procedure" icon={ClipboardCheck} items={p.testing_steps} ordered />
          <ListCard title="Safety notes" icon={ShieldAlert} items={p.safety_notes} tone="text-bad" />
          <ListCard title="Extensions for advanced students" icon={FlaskConical} items={p.extensions} />
        </div>

        <aside className="space-y-6">
          <Card className="xl:sticky xl:top-24">
            <p className="label-caps">Can I build this now?</p>
            <div className="mt-4 flex items-center gap-4">
              <ReadinessRing pct={r.ready_pct} buildable={r.buildable} size={84} />
              <div>
                <p className="font-display text-lg font-bold leading-snug">{AVAILABILITY[status]?.label}</p>
                <p className="text-sm text-muted">{r.buildable ? 'Every listed component is in stock.' : `${missing.length} component type${missing.length === 1 ? ' is' : 's are'} short right now.`}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="rounded-xl bg-ok-bg/60 p-3">
                <p className="font-semibold text-ok">In stock · {available.length}</p>
                <p className="mt-0.5 text-ink">{available.map((c) => c.item_name).join(', ') || '—'}</p>
              </div>
              {missing.length > 0 && (
                <div className="rounded-xl bg-bad-bg/60 p-3">
                  <p className="font-semibold text-bad">Missing · {missing.length}</p>
                  <ul className="mt-0.5 text-ink">
                    {missing.map((c) => <li key={c.item_id}>{c.item_name} — need {c.qty_required}, {c.available_qty} in stock</li>)}
                  </ul>
                </div>
              )}
              {external.length > 0 && (
                <div className="rounded-xl bg-info-bg/60 p-3">
                  <p className="font-semibold text-info">Bring or arrange · {external.length}</p>
                  <ul className="mt-0.5 text-ink">{external.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              )}
            </div>
            <p className="mt-4 text-xs text-muted">Stock updates live. Damaged and reserved units are not counted as available.</p>
          </Card>
          {(p.documentation_url || p.github_url) && (
            <p className="flex items-center gap-1.5 px-1 text-xs text-muted"><ExternalLink className="h-3.5 w-3.5" /> External links open in a new tab.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

/** Same rule as the database's _project_availability(), from the readiness row. */
export function availabilityOf(r, external = [], verification = null) {
  if (verification && verification.trim()) return 'requires_verification'
  if (r.n_required > 0 && r.n_satisfied === r.n_required) return external.length ? 'requires_external' : 'available'
  if (r.n_satisfied > 0) return 'partially_available'
  if (r.n_required === 0 && external.length) return 'requires_external'
  return 'temporarily_unavailable'
}
