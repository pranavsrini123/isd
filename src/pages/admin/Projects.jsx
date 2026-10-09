import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Pencil, Plus } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { rankedProjects } from '../../lib/api'
import { readinessTone } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, ProgressBar, SkeletonRows, Table, Tabs, Td, Th } from '../../components/ui/primitives'
import { SearchInput } from '../../components/ui/forms'
import { DemoBadge, DifficultyBadge } from '../../components/domain/badges'

const STATUS_TONE = { published: 'ok', draft: 'warn', archived: 'neutral' }

export default function AdminProjects() {
  const nav = useNavigate()
  const [status, setStatus] = useState('all')
  const [text, setText] = useState('')
  const search = useDebounce(text, 300)
  const list = useQuery(() => rankedProjects({ search }), [search])
  useRealtime(['projects', 'project_components', 'inventory_items'], list.refetch)
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
              <thead><tr><Th>Project</Th><Th>Status</Th><Th>Difficulty</Th><Th className="text-right">Components</Th><Th className="w-56">Readiness</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/admin/projects/${p.id}`)}>
                    <Td><p className="font-semibold">{p.name} <DemoBadge show={p.is_demo} /></p><p className="text-xs text-muted">{p.category}</p></Td>
                    <Td><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></Td>
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
    </div>
  )
}
