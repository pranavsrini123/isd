import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, FolderKanban, Pencil, Plus } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { componentDemand, rankedProjects } from '../../lib/api'
import { readinessTone } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, ProgressBar, SkeletonRows, Table, Tabs, Td, Th } from '../../components/ui/primitives'
import { SearchInput } from '../../components/ui/forms'
import { DemoBadge, DifficultyBadge } from '../../components/domain/badges'
import { AvailabilityBadge } from '../../components/domain/ProjectCard'
import { Thumb } from '../../components/domain/Thumb'

const STATUS_TONE = { published: 'ok', draft: 'warn', archived: 'neutral' }

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onChange={setStatus} tabs={[
          { value: 'all', label: 'All', count: all.length }, { value: 'published', label: 'Published', count: count('published') },
          { value: 'draft', label: 'Drafts', count: count('draft') }, { value: 'archived', label: 'Archived', count: count('archived') },
        ]} />
        <SearchInput className="w-full sm:w-72" value={text} onChange={setText} placeholder="Search projects" />
      </div>
      <Card padded={false}>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={8} />
          : rows.length === 0 ? <EmptyState icon={FolderKanban} title="No projects here" action={<Button icon={Plus} to="/admin/projects/new">New project</Button>}>Create a project and attach its components from the inventory.</EmptyState>
          : (
            <Table>
              <thead><tr><Th>Project</Th><Th>Status</Th><Th>Availability</Th><Th>Difficulty</Th><Th className="text-right">Components</Th><Th className="w-48">In stock</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/admin/projects/${p.id}`)}>
                    <Td><div className="flex items-center gap-3"><Thumb path={p.image_path} name={p.name} alt={p.image_alt} kind="project" className="aspect-[16/10] w-16 flex-none" /><div><p className="font-semibold">{p.name} <DemoBadge show={p.is_demo} /></p><p className="text-xs text-muted">{p.category}</p></div></div></Td>
                    <Td><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></Td>
                    <Td><AvailabilityBadge status={p.availability_status} /></Td>
                    <Td><DifficultyBadge level={p.difficulty} /></Td>
                    <Td className="text-right font-mono">{p.n_required}</Td>
                    <Td>
                      {p.n_required === 0 ? <span className="text-xs text-warn">No components yet</span> : (
                        <div>
                          <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{p.ready_pct}%</span><span className={p.buildable ? 'text-ok' : 'text-muted'}>{p.buildable ? 'Buildable' : `${p.missing_types} short`}</span></div>
                          <ProgressBar value={p.ready_pct} tone={readinessTone(p.ready_pct, p.buildable)} />
                        </div>
                      )}
                    </Td>
                    <Td className="text-right"><Button size="sm" variant="outline" icon={Pencil} onClick={(e) => { e.stopPropagation(); nav(`/admin/projects/${p.id}`) }}>Edit</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
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
    <Card className="mt-6" padded={false}>
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">Components shared by several projects</h2>
        <p className="text-xs text-muted">Live stock against what each published project needs. Changing requirements never changes stock.</p>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.refetch} />
        : q.isInitialLoading ? <SkeletonRows rows={4} />
        : rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">No component is used by more than one published project.</p>
        : (
          <Table>
            <thead><tr><Th>Component</Th><Th className="text-right">Projects</Th><Th className="text-right">Largest need</Th><Th className="text-right">Available</Th><Th>Projects short</Th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.item_id} className="align-top">
                  <Td><p className="font-medium">{d.item_name}</p>{!d.is_requestable && <p className="text-xs text-warn">Lab use only</p>}</Td>
                  <Td className="text-right font-mono" title={d.project_names.join(', ')}>{d.projects_count}</Td>
                  <Td className="text-right font-mono">{d.max_required}</Td>
                  <Td className={'text-right font-mono ' + (d.available_qty < d.max_required ? 'font-semibold text-bad' : '')}>{d.is_archived ? 0 : d.available_qty}</Td>
                  <Td>{d.projects_short > 0
                    ? <span className="inline-flex items-center gap-1 text-sm text-bad"><AlertTriangle className="h-4 w-4" aria-hidden />{d.projects_short}</span>
                    : <span className="text-sm text-muted">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
    </Card>
  )
}
