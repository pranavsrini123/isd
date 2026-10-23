import { useParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, BookOpen, Boxes, CheckCircle2, ChevronLeft, ClipboardCheck, Clock, Cpu, ExternalLink, FlaskConical, FolderKanban, Github, GraduationCap, Lightbulb, ListChecks, PackageX, PlayCircle, ShieldAlert, ShoppingBasket, Target, Wrench, XCircle } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { getProject, getProjectComponents, getProjectReadiness } from '../../lib/api'
import { AVAILABILITY, hoursLabel, readinessTone } from '../../lib/format'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import { Badge, Button, Card, EmptyState, ErrorState, IconTile, NightPanel, PageLoader, ProgressBar, ReadinessRing, cx } from '../../components/ui/primitives'
import { EASE_OUT, Reveal, m, useMotionOK } from '../../components/ui/motion'
import { Orbit } from '../../components/ui/decor'
import { DifficultyBadge, DemoBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'
import { AvailabilityBadge, ProjectFrame } from '../../components/domain/ProjectCard'

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

const STATUS_TEXT = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info', neutral: 'text-ink' }

/** Opaque white surface for the panels that sit over the night hero (glass would turn grey there). */
const RAISED = 'rounded-[22px] border border-white bg-white/[.97] shadow-card backdrop-blur-xl'

/** Heading row of a section card: icon tile, title and an optional note on the right. */
function SectionHead({ icon, tone = 'brand', children, aside }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 className="flex min-w-0 items-center gap-3 text-[19px] font-semibold leading-snug">
        <IconTile icon={icon} tone={tone} size="sm" />{children}
      </h2>
      {aside}
    </div>
  )
}

/** A frosted section card that fades up when scrolled into view. */
function Section({ className, padded, children }) {
  return (
    <Reveal>
      <Card padded={padded} className={cx('relative h-full overflow-hidden', className)}>{children}</Card>
    </Reveal>
  )
}

/** A titled card with a bullet list; renders nothing when the list is empty. */
function ListCard({ title, icon, items, ordered = false, tone = 'brand' }) {
  if (!items?.length) return null
  const L = ordered ? 'ol' : 'ul'
  const danger = tone === 'bad'
  return (
    <Section>
      {danger && <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-bad-solid/60 to-transparent" />}
      <SectionHead icon={icon} tone={tone}>{title}</SectionHead>
      <L className="space-y-2.5 text-[15px] leading-relaxed">
        {items.map((o, i) => (
          <li key={i} className={cx('flex gap-3', danger && 'rounded-[14px] bg-bad-bg/45 px-3 py-2.5')}>
            {ordered
              ? <span className="num mt-px flex h-6 w-6 flex-none items-center justify-center rounded-full bg-cyan-soft text-xs font-semibold text-brand ring-1 ring-inset ring-brand/15">{i + 1}</span>
              : danger
                ? <AlertTriangle className="mt-[3px] h-4 w-4 flex-none text-bad" aria-hidden />
                : <CheckCircle2 className="mt-[3px] h-4 w-4 flex-none text-brand" aria-hidden />}
            <span className="min-w-0 break-words">{o}</span>
          </li>
        ))}
      </L>
    </Section>
  )
}

export default function ProjectDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const cart = useCart()
  const toast = useToast()
  const motionOK = useMotionOK()
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
  const statusTone = AVAILABILITY[status]?.tone || 'neutral'
  const pairSkills = p.prerequisites?.length > 0 && p.hardware_software?.length > 0

  /** Adds the borrowable components to the request list; lab-use-only equipment is used in the lab. */
  function requestComponents() {
    const chosen = borrowable
      .map((c) => ({ ...c, qty_required: Math.min(c.qty_required, c.available_qty) }))
      .filter((c) => c.qty_required > 0)
    if (!chosen.length) return toast.error(borrowable.length ? 'None of the borrowable components are in stock right now.' : 'This project uses lab equipment only — ask the lab staff to book a session.')
    cart.loadProject(p, chosen)
    nav('/student/request')
  }

  const Enter = motionOK ? m.div : 'div'
  const enter = (delay, y = 14) => (motionOK
    ? { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.65, ease: EASE_OUT, delay } }
    : {})

  return (
    <div>
      {/* ---------------------------------------------------------------- Night hero */}
      <NightPanel className="rounded-[26px] px-5 pb-28 pt-6 shadow-[0_28px_60px_-30px_rgb(7_13_31/0.75)] sm:px-8 sm:pb-36 sm:pt-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <Orbit className="-right-24 -top-32 hidden h-[480px] w-[480px] opacity-60 md:block" />
          <Orbit className="-right-24 -top-20 h-64 w-64 opacity-30 md:hidden" />
          <div className="absolute -bottom-28 left-[8%] h-56 w-[62%] rounded-full bg-cyan/25 blur-3xl" />
          <div className="absolute -bottom-24 right-[4%] h-48 w-[34%] rounded-full bg-iris/25 blur-3xl" />
        </div>
        <Enter className="relative" {...enter(0.05, 10)}>
          <nav className="mb-5 flex min-w-0 items-center gap-1.5 text-sm text-side-text" aria-label="Breadcrumb">
            <a href="/student/projects" onClick={(e) => { e.preventDefault(); nav('/student/projects') }}
              className="group inline-flex flex-none items-center gap-1 rounded-md font-medium transition-colors hover:text-white">
              <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />Projects
            </a>
            <span className="flex-none text-white/30">/</span><span className="min-w-0 truncate font-medium text-white/85">{p.name}</span>
          </nav>

          <div className="max-w-3xl">
            <div className="mb-3.5 flex flex-wrap items-center gap-2">
              <AvailabilityBadge status={status} />
              <DifficultyBadge level={p.difficulty} />
              {hours && <Badge tone="dark"><Clock className="h-3 w-3" aria-hidden /><span className="num">{hours}</span></Badge>}
              <Badge tone="dark"><span className="text-cyan-light">{p.category}</span></Badge>
              <DemoBadge show={p.is_demo} />
            </div>
            <h1 className="break-words text-[30px] font-bold leading-[1.1] text-white [text-wrap:balance] sm:text-[42px]">{p.name}</h1>
            {p.description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#B9C6DE] sm:text-base">{p.description}</p>}

            {(p.documentation_url || p.github_url || p.video_url) && (
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {p.documentation_url && <Button variant="outline" icon={BookOpen} onClick={() => window.open(p.documentation_url, '_blank', 'noopener')}>Docs</Button>}
                {p.github_url && <Button variant="outline" icon={Github} onClick={() => window.open(p.github_url, '_blank', 'noopener')}>Code</Button>}
                {p.video_url && <Button variant="outline" icon={PlayCircle} onClick={() => window.open(p.video_url, '_blank', 'noopener')}>Video</Button>}
                {(p.documentation_url || p.github_url) && (
                  <p className="flex items-center gap-1.5 px-1 text-xs text-side-text"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> External links open in a new tab.</p>
                )}
              </div>
            )}
          </div>

          <ol className="mt-7 hidden flex-wrap items-center gap-1.5 text-xs font-medium lg:flex" aria-label="Lab workflow">
            {FLOW.map((s, i) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={cx('rounded-full px-2.5 py-1',
                  s === 'Required components' ? 'bg-cyan font-semibold text-night shadow-[0_0_16px_rgb(34_211_238/0.55)]'
                    : i < 3 ? 'bg-white/10 text-white ring-1 ring-inset ring-white/15'
                    : 'text-side-text ring-1 ring-inset ring-white/10')}>{s}</span>
                {i < FLOW.length - 1 && <span className="text-white/30" aria-hidden>›</span>}
              </li>
            ))}
          </ol>
        </Enter>
      </NightPanel>

      {/* ---------------------------------------------------------------- Picture, readiness panel and sections */}
      <div className="relative z-10 -mt-20 grid gap-5 sm:-mt-28 sm:gap-6 sm:px-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:px-5">
        <Enter className="min-w-0 px-2 sm:px-0 xl:col-start-1 xl:row-start-1" {...enter(0.12, 22)}>
          <div className="relative">
            <div aria-hidden className="pointer-events-none absolute inset-x-10 -bottom-6 top-1/3 -z-10 rounded-full bg-cyan/30 blur-3xl" />
            <div className={cx(RAISED, 'p-2 shadow-[0_34px_70px_-34px_rgb(7_13_31/0.6),0_0_0_1px_rgb(15_23_42/0.04)]')}>
              <ProjectFrame>
                <Thumb path={p.image_path} name={p.name} alt={p.image_alt || p.name} kind="project" className="aspect-[16/10] w-full !rounded-none" />
              </ProjectFrame>
            </div>
          </div>
        </Enter>

        <aside className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <Enter className="xl:sticky xl:top-24" {...enter(0.2, 22)}>
            <section className={cx(RAISED, 'relative overflow-hidden p-5 sm:p-6')}>
              <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan to-transparent" />
              <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan/15 blur-2xl" />
              <div className="relative flex items-center justify-between gap-3">
                <p className="label-caps">Can I build this now?</p>
                <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-ok-solid shadow-[0_0_0_4px_rgb(16_185_129/0.15),0_0_10px_rgb(16_185_129/0.8)]" />
              </div>
              <div className="relative mt-4 flex items-center gap-4">
                <ReadinessRing pct={r.ready_pct} buildable={r.buildable} size={96} />
                <div className="min-w-0">
                  <p className={cx('font-display text-lg font-bold leading-snug', STATUS_TEXT[statusTone])}>{AVAILABILITY[status]?.label}</p>
                  <p className="mt-0.5 text-sm leading-snug text-muted">
                    {r.buildable ? 'Every listed component is in stock.'
                      : <><span className="num">{missing.length}</span>{` component type${missing.length === 1 ? ' is' : 's are'} short right now.`}</>}
                  </p>
                </div>
              </div>

              <div className="relative mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl bg-ok-bg/60 p-3.5 ring-1 ring-inset ring-ok/10">
                  <p className="flex items-center gap-1.5 font-semibold text-ok"><CheckCircle2 className="h-4 w-4 flex-none" aria-hidden /><span>In stock · <span className="num">{available.length}</span></span></p>
                  {available.length ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {available.map((c) => (
                        <li key={c.item_id} className="max-w-full truncate rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-ink ring-1 ring-inset ring-ok/15">{c.item_name}</li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-ink">—</p>}
                </div>
                {missing.length > 0 && (
                  <div className="rounded-2xl bg-bad-bg/60 p-3.5 ring-1 ring-inset ring-bad/10">
                    <p className="flex items-center gap-1.5 font-semibold text-bad"><XCircle className="h-4 w-4 flex-none" aria-hidden /><span>Missing · <span className="num">{missing.length}</span></span></p>
                    <ul className="mt-1.5 space-y-1 text-ink">
                      {missing.map((c) => (
                        <li key={c.item_id} className="break-words">
                          <span className="font-medium">{c.item_name}</span>
                          <span className="text-muted"> — need <span className="num text-ink">{c.qty_required}</span>, <span className="num font-semibold text-bad">{c.available_qty}</span> in stock</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {external.length > 0 && (
                  <div className="rounded-2xl bg-info-bg/60 p-3.5 ring-1 ring-inset ring-info/10">
                    <p className="flex items-center gap-1.5 font-semibold text-info"><PackageX className="h-4 w-4 flex-none" aria-hidden /><span>Bring or arrange · <span className="num">{external.length}</span></span></p>
                    <ul className="mt-1.5 space-y-1 text-ink">{external.map((e) => <li key={e} className="break-words">{e}</li>)}</ul>
                  </div>
                )}
              </div>

              <Button size="lg" icon={ShoppingBasket} className="relative mt-5 w-full" onClick={requestComponents} disabled={!borrowable.some((c) => c.available_qty > 0)}>
                {borrowable.length && borrowable.every((c) => c.satisfied) ? 'Request components' : 'Request available components'}
              </Button>
              <p className="relative mt-3.5 text-xs leading-relaxed text-muted">Stock updates live. Damaged and reserved units are not counted as available.</p>
            </section>
          </Enter>
        </aside>

        <div className="min-w-0 space-y-5 sm:space-y-6 xl:col-start-1 xl:row-start-2">
          {p.verification_note && (
            <Reveal>
              <div className="flex gap-3.5 rounded-[22px] border border-warn-solid/25 bg-warn-bg/75 p-4 text-sm shadow-card backdrop-blur sm:p-5">
                <IconTile icon={AlertTriangle} tone="warn" size="sm" />
                <div className="min-w-0 pt-0.5">
                  <p className="font-semibold text-ink">Check with the lab staff before starting</p>
                  <p className="mt-0.5 break-words leading-relaxed text-muted">{p.verification_note}</p>
                </div>
              </div>
            </Reveal>
          )}

          <ListCard title="Objectives" icon={Target} items={objectives} />
          {p.expected_outcome && (
            <Section>
              <SectionHead icon={Lightbulb} tone="cyan">Expected outcome</SectionHead>
              <div className="relative pl-4">
                <span aria-hidden className="absolute bottom-0.5 left-0 top-0.5 w-[3px] rounded-full bg-gradient-to-b from-cyan to-azure/60" />
                <p className="break-words text-[15px] leading-relaxed">{p.expected_outcome}</p>
              </div>
            </Section>
          )}

          <Section padded={false}>
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
              <SectionHead icon={Boxes}
                aside={<span className="text-sm text-muted"><span className="num font-semibold text-ink">{r.n_satisfied}</span> of <span className="num font-semibold text-ink">{r.n_required}</span> in stock now</span>}>
                Required components
              </SectionHead>
              {rows.length > 0 && <ProgressBar value={r.ready_pct} tone={readinessTone(r.ready_pct, r.buildable)} label={`${p.name} component availability`} className="mb-1" />}
            </div>
            {rows.length === 0 ? <p className="px-6 pb-8 pt-4 text-center text-sm text-muted">No components listed yet.</p> : (
              <ul className="mt-3 divide-y divide-line/80 border-t border-line/80">
                {rows.map((c) => (
                  <li key={c.item_id} className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-white/60 sm:items-center sm:px-6">
                    {c.satisfied
                      ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-ok sm:mt-0" aria-label="In stock" />
                      : <XCircle className="mt-0.5 h-5 w-5 flex-none text-bad sm:mt-0" aria-label="Not enough in stock" />}
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold leading-snug">{c.item_name}</p>
                      {c.notes && <p className="mt-0.5 break-words text-xs text-muted">{c.notes}</p>}
                      {!c.satisfied && (
                        <p className="mt-0.5 text-xs font-medium text-bad">
                          {c.item_archived ? 'No longer stocked' : <>Short by <span className="num">{c.missing_qty}</span></>}
                        </p>
                      )}
                      {c.item_requestable === false && <Badge tone="warn" className="mt-1.5">Use in lab</Badge>}
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <span className="whitespace-nowrap text-[13px] text-muted">need <span className="num text-ink">{c.qty_required}</span></span>
                      <span className={cx('whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold ring-1 ring-inset',
                        c.satisfied ? 'bg-ok-bg text-ok ring-ok/15' : 'bg-bad-bg text-bad ring-bad/15')}>
                        <span className="num">{c.available_qty}</span> in stock
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {(external.length > 0 || labOnly.length > 0) && (
              <div className="space-y-2.5 border-t border-line/80 bg-white/40 px-5 py-4 text-sm sm:px-6">
                {external.length > 0 && <p className="flex gap-2.5"><PackageX className="mt-0.5 h-4 w-4 flex-none text-info" aria-hidden /><span className="min-w-0 break-words"><strong>Not stocked by the lab:</strong> {external.join('; ')}</span></p>}
                {labOnly.length > 0 && <p className="flex gap-2.5"><Wrench className="mt-0.5 h-4 w-4 flex-none text-warn" aria-hidden /><span className="min-w-0 break-words"><strong>Lab equipment</strong> ({labOnly.map((c) => c.item_name).join(', ')}) is used in the lab under supervision and cannot be borrowed.</span></p>}
              </div>
            )}
          </Section>

          {(p.prerequisites?.length > 0 || p.hardware_software?.length > 0) && (
            <div className={cx('grid gap-5 sm:gap-6', pairSkills && 'lg:grid-cols-2')}>
              <ListCard title="Prerequisites and skills" icon={GraduationCap} items={p.prerequisites} />
              <ListCard title="Hardware and software" icon={Cpu} items={p.hardware_software} />
            </div>
          )}

          {steps.length > 0 && (
            <Section>
              <SectionHead icon={ListChecks}>Implementation steps</SectionHead>
              <ol>
                {steps.map((s, i) => (
                  <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < steps.length - 1 && <span aria-hidden className="absolute bottom-1 left-[17px] top-11 w-px bg-gradient-to-b from-cyan/70 to-line" />}
                    <span className="num relative flex h-9 w-9 flex-none items-center justify-center rounded-full bg-night-2 text-sm font-semibold text-cyan-light shadow-[0_0_0_4px_rgb(34_211_238/0.12),0_8px_18px_-8px_rgb(7_13_31/0.7)]">{i + 1}</span>
                    <div className="min-w-0 pt-1.5">
                      {s.title && <p className="font-semibold leading-snug">{s.title}</p>}
                      <p className={cx('break-words text-sm leading-relaxed text-muted', s.title && 'mt-1')}>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <ListCard title="Testing procedure" icon={ClipboardCheck} items={p.testing_steps} ordered />
          <ListCard title="Safety notes" icon={ShieldAlert} items={p.safety_notes} tone="bad" />
          <ListCard title="Extensions for advanced students" icon={FlaskConical} items={p.extensions} tone="cyan" />
        </div>
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
