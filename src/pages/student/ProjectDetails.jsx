import { useParams, useNavigate } from 'react-router-dom'
import { BookOpen, CheckCircle2, Clock, ExternalLink, FolderKanban, Github, PlayCircle, ShoppingBasket, XCircle } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { getProject, getProjectComponents, getProjectReadiness } from '../../lib/api'
import { hoursLabel } from '../../lib/format'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, ErrorState, PageLoader, ReadinessRing, cx } from '../../components/ui/primitives'
import { DifficultyBadge, DemoBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'

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
  const steps = parseSteps(p.instructions)
  const hours = hoursLabel(p.est_hours_min, p.est_hours_max)

  function requestComponents(onlyAvailable) {
    const chosen = (onlyAvailable ? rows.filter((c) => c.available_qty > 0) : rows)
      .map((c) => ({ ...c, qty_required: Math.min(c.qty_required, c.available_qty) }))
      .filter((c) => c.qty_required > 0)
    if (!chosen.length) return toast.error('None of these components are in stock right now.')
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
        <div className="space-y-6">
          <Card>
            <div className="grid gap-6 md:grid-cols-[240px_1fr]">
              <Thumb path={p.image_path} name={p.name} kind="project" className="h-48 w-full" />
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <DifficultyBadge level={p.difficulty} />
                  {hours && <Badge tone="neutral"><Clock className="h-3 w-3" />{hours}</Badge>}
                  <Badge tone="cyan">{p.category}</Badge>
                  <DemoBadge show={p.is_demo} />
                </div>
                <h1 className="text-[28px] font-bold leading-tight">{p.name}</h1>
                {p.description && <p className="mt-2 leading-relaxed text-muted">{p.description}</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                  {r.buildable
                    ? <Button icon={ShoppingBasket} onClick={() => requestComponents(false)}>Request all components</Button>
                    : <Button icon={ShoppingBasket} onClick={() => requestComponents(true)} disabled={available.length === 0 && rows.every((c) => c.available_qty === 0)}>Request available components</Button>}
                  {p.documentation_url && <Button variant="outline" icon={BookOpen} to={undefined} onClick={() => window.open(p.documentation_url, '_blank', 'noopener')}>Docs</Button>}
                  {p.github_url && <Button variant="outline" icon={Github} onClick={() => window.open(p.github_url, '_blank', 'noopener')}>Code</Button>}
                  {p.video_url && <Button variant="outline" icon={PlayCircle} onClick={() => window.open(p.video_url, '_blank', 'noopener')}>Video</Button>}
                </div>
              </div>
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold">Required components</h2>
              <span className="text-sm text-muted">{r.n_satisfied} of {r.n_required} available</span>
            </div>
            {rows.length === 0 ? <p className="px-6 py-8 text-center text-sm text-muted">No components listed yet.</p> : (
              <ul className="divide-y divide-line">
                {rows.map((c) => (
                  <li key={c.item_id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                    {c.satisfied ? <CheckCircle2 className="h-5 w-5 flex-none text-ok" aria-label="Available" /> : <XCircle className="h-5 w-5 flex-none text-bad" aria-label="Not enough" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{c.item_name}</p>
                      {c.notes && <p className="text-xs text-muted">{c.notes}</p>}
                      {!c.satisfied && <p className="text-xs font-medium text-bad">{c.item_archived ? 'No longer stocked' : `Short by ${c.missing_qty}`}</p>}
                    </div>
                    <span className="font-mono text-sm text-muted">× {c.qty_required}</span>
                    <span className={cx('w-16 text-right font-mono text-sm', c.satisfied ? 'text-muted' : 'font-semibold text-bad')}>{c.available_qty} free</span>
                    <Badge tone={c.satisfied ? 'ok' : 'bad'}>{c.satisfied ? 'Available' : 'Unavailable'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {steps.length > 0 && (
            <Card>
              <h2 className="mb-4 text-lg font-semibold">Build instructions</h2>
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
        </div>

        <aside className="space-y-6">
          <Card className="xl:sticky xl:top-24">
            <p className="label-caps">What can I build?</p>
            <div className="mt-4 flex items-center gap-4">
              <ReadinessRing pct={r.ready_pct} buildable={r.buildable} size={84} />
              <div>
                <p className="font-display text-lg font-bold leading-snug">
                  {r.buildable ? 'You can build this today' : `You can start with ${r.n_satisfied} of ${r.n_required} components`}
                </p>
                <p className="text-sm text-muted">{r.buildable ? 'Every part is on the shelf.' : `${missing.length} component type${missing.length === 1 ? ' is' : 's are'} short right now.`}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="rounded-xl bg-ok-bg/60 p-3">
                <p className="font-semibold text-ok">Available · {available.length}</p>
                <p className="mt-0.5 text-ink">{available.map((c) => c.item_name).join(', ') || '—'}</p>
              </div>
              {missing.length > 0 && (
                <div className="rounded-xl bg-bad-bg/60 p-3">
                  <p className="font-semibold text-bad">Missing · {missing.length}</p>
                  <ul className="mt-0.5 text-ink">
                    {missing.map((c) => <li key={c.item_id}>{c.item_name} — need {c.qty_required}, {c.available_qty} free</li>)}
                  </ul>
                </div>
              )}
            </div>
            {!r.buildable && missing.length > 0 && (
              <p className="mt-4 text-xs text-muted">This page updates automatically when parts are returned to the lab.</p>
            )}
          </Card>
          {p.learning_outcomes?.length > 0 && (
            <Card>
              <h2 className="mb-3 text-lg font-semibold">What you'll learn</h2>
              <ul className="space-y-2 text-sm">
                {p.learning_outcomes.map((o) => <li key={o} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-cyan" />{o}</li>)}
              </ul>
            </Card>
          )}
          {(p.documentation_url || p.github_url) && (
            <p className="flex items-center gap-1.5 px-1 text-xs text-muted"><ExternalLink className="h-3.5 w-3.5" /> External links open in a new tab.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
