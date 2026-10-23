import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Boxes, FolderKanban, Pencil, Plus } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { componentDemand, rankedProjects } from '../../lib/api'
import { AVAILABILITY, readinessTone } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, IconTile, PageHeader, ProgressBar, SkeletonRows, Table, Tabs, Td, Th, cx } from '../../components/ui/primitives'
import { SearchInput } from '../../components/ui/forms'
import { DemoBadge, DifficultyBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'

const STATUS_TONE = { published: 'ok', draft: 'warn', archived: 'neutral' }

// Availability as a coloured dot and label: it can wrap onto two lines, so the
// longest states ("Requires compatibility verification") keep the table narrow.
const AVAIL_DOT = { ok: 'bg-ok-solid', warn: 'bg-warn-solid', bad: 'bg-bad-solid', info: 'bg-info', neutral: 'bg-subtle' }
const AVAIL_TEXT = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info', neutral: 'text-muted' }

function Availability({ status }) {
  const a = AVAILABILITY[status]
  if (!a) return null
  return (
    <span className={cx('inline-flex items-start gap-2 text-[13px] font-medium leading-snug', AVAIL_TEXT[a.tone])}>
      <span className={cx('mt-[0.45em] h-1.5 w-1.5 flex-none rounded-full', AVAIL_DOT[a.tone])} aria-hidden />
      {a.label}
    </span>
  )
}

/*
 * The project list is a real table when its card is at least 64rem wide (desktop).
 * Narrower (laptop with sidebar, tablet, phone) each row reflows into a compact block:
 *   line 1  picture, name, category … (readiness from 42rem) … Edit
 *   line 2  status, difficulty, availability
 *   line 3  readiness (phones)
 * The `after:` element on the row is the forced line break between lines 1 and 2.
 */
const TH = 'whitespace-nowrap border-b border-line bg-slate-50/90 py-2.5 text-[11.5px] font-semibold uppercase tracking-[.07em] text-muted'

export default function AdminProjects() {
  const nav = useNavigate()
  const [status, setStatus] = useState('all')
  const [text, setText] = useState('')
  const search = useDebounce(text, 300)
  const list = useQuery(() => rankedProjects({ search }), [search])
  const demand = useQuery(() => componentDemand(), [])
  useRealtime(['projects', 'project_components', 'inventory_items'], () => { list.refetch(); demand.refetch() })
  const all = list.data || []
  const rows = status === 'all' ? all : all.filter((p) => p.status === status)
  const count = (s) => all.filter((p) => p.status === s).length

  return (
    <div>
      <PageHeader title="Project management" subtitle="Projects list their required components from the inventory, so readiness is always calculated from live stock."
        actions={<Button icon={Plus} to="/admin/projects/new">New project</Button>} />

      <Card padded={false} className="@container overflow-hidden">
        {/* Toolbar: status filters (tabs sit on the divider) and search */}
        <div className="flex flex-col-reverse gap-2 border-b border-line px-4 pt-3 lg:h-[60px] lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:pt-0">
          <Tabs className="-mb-px -ml-3.5 min-w-0 lg:self-stretch" value={status} onChange={setStatus} tabs={[
            { value: 'all', label: 'All', count: all.length }, { value: 'published', label: 'Published', count: count('published') },
            { value: 'draft', label: 'Drafts', count: count('draft') }, { value: 'archived', label: 'Archived', count: count('archived') },
          ]} />
          <SearchInput className="w-full flex-none lg:w-72 xl:w-80" value={text} onChange={setText} placeholder="Search projects" />
        </div>

        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={8} />
          : rows.length === 0 ? <EmptyState icon={FolderKanban} title="No projects here" action={<Button icon={Plus} to="/admin/projects/new">New project</Button>}>Create a project and attach its components from the inventory.</EmptyState>
          : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm @max-5xl:block">
                <thead className="@max-5xl:hidden">
                  <tr>
                    <th scope="col" className={cx(TH, 'pl-4 pr-3')}>Project</th>
                    <th scope="col" className={cx(TH, 'w-28 px-3')}>Status</th>
                    <th scope="col" className={cx(TH, 'w-44 px-3')}>Availability</th>
                    <th scope="col" className={cx(TH, 'w-32 px-3')}>Difficulty</th>
                    <th scope="col" className={cx(TH, 'w-28 px-3 text-right')}>Components</th>
                    <th scope="col" className={cx(TH, 'w-40 px-3')}>In stock</th>
                    <th scope="col" className={cx(TH, 'w-28 pl-3 pr-4 text-right')}>Actions</th>
                  </tr>
                </thead>
                <tbody className="@max-5xl:block">
                  {rows.map((p) => {
                    const to = `/admin/projects/${p.id}`
                    return (
                      <tr key={p.id} onClick={() => nav(to)}
                        className={cx('cursor-pointer border-b border-line/80 transition-colors last:border-b-0 hover:bg-slate-50',
                          '@max-5xl:flex @max-5xl:flex-wrap @max-5xl:items-center @max-5xl:gap-x-2.5 @max-5xl:px-4 @max-5xl:py-3.5',
                          "@max-5xl:after:order-4 @max-5xl:after:basis-full @max-5xl:after:content-['']")}>
                        <td className="order-1 py-3 pl-4 pr-3 align-middle @max-5xl:min-w-0 @max-5xl:flex-1 @max-5xl:p-0">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="block w-14 flex-none overflow-hidden rounded-lg bg-[#EAF1F8] ring-1 ring-line">
                              <Thumb path={p.image_path} name={p.name} alt={p.image_alt} kind="project" className="aspect-[16/10] w-full !rounded-none" />
                            </span>
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-snug">
                                <Link to={to} onClick={(e) => e.stopPropagation()}
                                  className="min-w-0 break-words rounded-sm font-semibold text-ink transition-colors hover:text-brand">{p.name}</Link>
                                <DemoBadge show={p.is_demo} />
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted">{p.category}</p>
                            </div>
                          </div>
                        </td>
                        <td className="order-5 mt-2.5 px-3 py-3 align-middle @2xl:ml-[4.25rem] @max-5xl:p-0">
                          <Badge tone={STATUS_TONE[p.status]} dot>{p.status}</Badge>
                        </td>
                        <td className="order-6 mt-2.5 min-w-0 px-3 py-3 align-middle @max-5xl:p-0">
                          <Availability status={p.availability_status} />
                        </td>
                        <td className="order-5 mt-2.5 px-3 py-3 align-middle @max-5xl:p-0">
                          <DifficultyBadge level={p.difficulty} />
                        </td>
                        <td className="num px-3 py-3 text-right align-middle font-medium @max-5xl:hidden">{p.n_required}</td>
                        <td className="order-7 mt-3 flex-none basis-full px-3 py-3 align-middle @2xl:order-2 @2xl:mr-3 @2xl:mt-0 @2xl:basis-44 @max-5xl:p-0">
                          {p.n_required === 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warn">
                              <AlertTriangle className="h-3.5 w-3.5 flex-none" aria-hidden />No components yet
                            </span>
                          ) : (
                            <div>
                              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                                <span className="num text-[13px] font-semibold text-ink">{p.ready_pct}%</span>
                                <span className={p.buildable ? 'font-semibold text-ok' : 'font-medium text-muted'}>
                                  {p.buildable ? 'Buildable' : <><span className="num">{p.missing_types}</span> short</>}
                                </span>
                              </div>
                              <ProgressBar value={p.ready_pct} tone={readinessTone(p.ready_pct, p.buildable)} />
                            </div>
                          )}
                        </td>
                        <td className="order-3 flex-none py-3 pl-3 pr-4 text-right align-middle @max-5xl:p-0">
                          <Button size="sm" variant="outline" icon={Pencil} to={to} onClick={(e) => e.stopPropagation()}>Edit</Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>
      <DemandPanel q={demand} />
    </div>
  )
}

/** Components needed by several published projects, ranked so shortages stand out. */
function DemandPanel({ q }) {
  const rows = (q.data || []).filter((d) => d.projects_count > 1)
  return (
    <Card className="mt-6 overflow-hidden" padded={false}>
      <div className="flex items-start gap-3 border-b border-line px-4 py-4">
        <IconTile icon={Boxes} size="sm" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-snug">Components shared by several projects</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">Live stock against what each published project needs. Changing requirements never changes stock.</p>
        </div>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} />
        : q.isInitialLoading ? <SkeletonRows rows={4} />
        : rows.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted">No component is used by more than one published project.</p>
        : (
          <Table>
            <thead><tr><Th>Component</Th><Th className="w-24 text-right">Projects</Th><Th className="w-32 text-right">Largest need</Th><Th className="w-24 text-right">Available</Th><Th className="w-36">Projects short</Th></tr></thead>
            <tbody>
              {rows.map((d) => {
                const short = d.available_qty < d.max_required
                return (
                  <tr key={d.item_id} className="last:[&>td]:border-b-0">
                    <Td>
                      <div className="flex min-h-[22px] flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-ink">{d.item_name}</span>
                        {!d.is_requestable && <Badge tone="warn">Lab use only</Badge>}
                      </div>
                    </Td>
                    <Td className="num text-right" title={d.project_names.join(', ')}>
                      <span className="cursor-help underline decoration-line-strong decoration-dotted underline-offset-4">{d.projects_count}</span>
                    </Td>
                    <Td className="num text-right text-muted">{d.max_required}</Td>
                    <Td className={cx('num text-right', short ? 'font-semibold text-bad' : 'font-medium text-ink')}>{d.is_archived ? 0 : d.available_qty}</Td>
                    <Td>{d.projects_short > 0
                      ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-bad"><AlertTriangle className="h-4 w-4" aria-hidden /><span className="num">{d.projects_short}</span></span>
                      : <span className="text-sm text-subtle">—</span>}</Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
    </Card>
  )
}
