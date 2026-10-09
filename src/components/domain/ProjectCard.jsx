import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { Card, ProgressBar, cx } from '../ui/primitives'
import { DifficultyBadge, DemoBadge } from './badges'
import { Thumb } from './Thumb'
import { hoursLabel, readinessTone } from '../../lib/format'

/** One project from get_ranked_projects(): readiness, buildability and what is missing. */
export function ProjectCard({ project: p, to }) {
  const tone = readinessTone(p.ready_pct, p.buildable)
  const hours = hoursLabel(p.est_hours_min, p.est_hours_max)
  return (
    <Card padded={false} className="group flex h-full flex-col overflow-hidden transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[#93B4F5]">
      <Link to={to} className="flex h-full flex-col p-4 focus:outline-none" aria-label={`${p.name}: ${p.ready_pct}% ready`}>
        <div className="relative">
          <Thumb path={p.image_path} name={p.name} kind="project" className="h-36 w-full" />
          <span className={cx('absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm',
            p.buildable ? 'bg-ok text-white' : 'bg-white text-ink')}>
            {p.buildable ? <><CheckCircle2 className="h-3.5 w-3.5" /> Buildable now</> : `${p.ready_pct}% ready`}
          </span>
        </div>
        <div className="flex flex-1 flex-col px-1 pb-1 pt-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <DifficultyBadge level={p.difficulty} />
            <span className="text-xs font-medium text-muted">{p.category}</span>
            <DemoBadge show={p.is_demo} />
          </div>
          <h3 className="text-[17px] font-semibold leading-snug group-hover:text-brand">{p.name}</h3>
          {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
          <div className="mt-auto pt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
              <span>{p.n_satisfied} of {p.n_required} components available</span>
              {hours && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{hours}</span>}
            </div>
            <ProgressBar value={p.ready_pct} tone={tone} label={`${p.name} readiness`} />
            {!p.buildable && p.missing?.length > 0 && (
              <p className="mt-2.5 flex items-start gap-1.5 text-[13px] text-bad">
                <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
                <span className="line-clamp-2">
                  Missing: {p.missing.map((m) => `${m.name}${m.missing_qty > 1 ? ` ×${m.missing_qty}` : ''}`).join(', ')}
                </span>
              </p>
            )}
          </div>
        </div>
      </Link>
    </Card>
  )
}
