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

/** One project from get_ranked_projects(): photo, summary, live availability and what is missing. */
export function ProjectCard({ project: p, to }) {
  const tone = readinessTone(p.ready_pct, p.buildable)
  const hours = hoursLabel(p.est_hours_min, p.est_hours_max)
  const a = AVAILABILITY[p.availability_status]
  return (
    <Card padded={false} className="group flex h-full flex-col overflow-hidden transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[#93B4F5]">
      <Link to={to} className="flex h-full flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" aria-label={`${p.name}: ${a?.label || `${p.ready_pct}% ready`}. View details`}>
        <div className="relative">
          <Thumb path={p.image_path} name={p.name} alt={p.image_alt || p.name} kind="project" className="aspect-[16/10] w-full !rounded-none" />
          {a && (
            <span className="absolute left-3 top-3 rounded-full bg-white/95 shadow-sm">
              <AvailabilityBadge status={p.availability_status} />
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <DifficultyBadge level={p.difficulty} />
            <span className="text-xs font-medium text-muted">{p.category}</span>
            <DemoBadge show={p.is_demo} />
          </div>
          <h3 className="text-[17px] font-semibold leading-snug group-hover:text-brand">{p.name}</h3>
          {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
          <div className="mt-auto pt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
              <span>{p.n_satisfied} of {p.n_required} components in stock</span>
              {hours && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{hours}</span>}
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
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
              View details <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </Card>
  )
}
