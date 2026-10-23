import { Link } from 'react-router-dom'
import { ArrowRight, Clock, XCircle } from 'lucide-react'
import { Badge, Card, ProgressBar } from '../ui/primitives'
import { DifficultyBadge, DemoBadge } from './badges'
import { Thumb } from './Thumb'
import { AVAILABILITY, hoursLabel, readinessTone } from '../../lib/format'

/** Availability badge for a project (status computed by the database from live stock). */
export function AvailabilityBadge({ status, className }) {
  const a = AVAILABILITY[status]
  return a ? <Badge tone={a.tone} dot className={className}>{a.label}</Badge> : null
}

/**
 * Picture frame for the project illustrations: an inset, rounded window with a soft
 * inner edge, so the light illustrations sit cleanly on glass and night surfaces alike.
 */
export function ProjectFrame({ children, className, zoom = false }) {
  return (
    <div className={`relative overflow-hidden rounded-[16px] bg-[#EAF1F8] shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06)] ${className || ''}`}>
      <div className={zoom ? 'transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover:scale-[1.045]' : ''}>{children}</div>
      <div className="pointer-events-none absolute inset-0 rounded-[16px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.5),inset_0_-40px_40px_-30px_rgb(7_13_31/0.18)]" />
    </div>
  )
}

/** One project from get_ranked_projects(): picture, summary, live availability and what is missing. */
export function ProjectCard({ project: p, to }) {
  const tone = readinessTone(p.ready_pct, p.buildable)
  const hours = hoursLabel(p.est_hours_min, p.est_hours_max)
  const a = AVAILABILITY[p.availability_status]
  return (
    <Card padded={false} className="lift group flex h-full flex-col">
      <Link to={to} className="flex h-full flex-col rounded-[22px] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2" aria-label={`${p.name}: ${a?.label || `${p.ready_pct}% ready`}. View details`}>
        <div className="relative p-2 pb-0">
          <ProjectFrame zoom>
            <Thumb path={p.image_path} name={p.name} alt={p.image_alt || p.name} kind="project" className="aspect-[16/10] w-full !rounded-none" />
          </ProjectFrame>
          {a && (
            <span className="absolute left-4 top-4 rounded-full bg-white/90 shadow-[0_4px_14px_-6px_rgb(7_13_31/0.35)] backdrop-blur">
              <AvailabilityBadge status={p.availability_status} />
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <DifficultyBadge level={p.difficulty} />
            <span className="text-xs font-medium text-muted">{p.category}</span>
            <DemoBadge show={p.is_demo} />
          </div>
          <h3 className="text-[17px] font-semibold leading-snug transition-colors group-hover:text-brand">{p.name}</h3>
          {p.description && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{p.description}</p>}
          <div className="mt-auto pt-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-muted">
              <span><span className="num text-ink">{p.n_satisfied}</span> of <span className="num text-ink">{p.n_required}</span> components in stock</span>
              {hours && <span className="inline-flex items-center gap-1 whitespace-nowrap"><Clock className="h-3.5 w-3.5" aria-hidden /><span className="num">{hours}</span></span>}
            </div>
            <ProgressBar value={p.ready_pct} tone={tone} label={`${p.name} component availability`} />
            {p.missing?.length > 0 && (
              <p className="mt-2.5 flex items-start gap-1.5 text-[13px] text-bad">
                <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
                <span className="line-clamp-2">
                  Short: {p.missing.map((m) => `${m.name}${m.missing_qty > 1 ? ` ×${m.missing_qty}` : ''}`).join(', ')}
                </span>
              </p>
            )}
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
              View details <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </Card>
  )
}
