import { useEffect, useState } from 'react'
import { FolderKanban } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { projectCategories, rankedProjects } from '../../lib/api'
import { AVAILABILITY, DURATION_FILTERS, durationBucket } from '../../lib/format'
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, SkeletonCards } from '../../components/ui/primitives'
import { SearchInput, Select } from '../../components/ui/forms'
import { ProjectCard } from '../../components/domain/ProjectCard'

const PAGE_SIZE = 12
const EMPTY = { search: '', category: '', difficulty: '', duration: '', availability: '' }

export default function ProjectLibrary() {
  const [f, setF] = useSearchState({ ...EMPTY, sort: 'rank', page: 1 })
  const [text, setText] = useState(f.search)
  const debounced = useDebounce(text, 300)
  useEffect(() => { if (debounced !== f.search) setF({ search: debounced, page: 1 }) }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const cats = useQuery(() => projectCategories(), [])
  const list = useQuery(
    () => rankedProjects({ search: f.search, category: f.category, difficulty: f.difficulty, sort: f.sort }),
    [f.search, f.category, f.difficulty, f.sort],
  )
  // Availability depends on live stock: refresh when inventory or requirements change.
  useRealtime(['inventory_items', 'project_components', 'projects'], list.refetch)

  const active = (list.data || []).filter((p) => p.n_required > 0 || p.n_external > 0)
  const all = active.filter((p) => (!f.duration || durationBucket(p.est_hours_min, p.est_hours_max) === f.duration)
    && (!f.availability || p.availability_status === f.availability))
  const rows = all.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE)
  const ready = all.filter((p) => p.availability_status === 'available').length
  const filtered = Object.keys(EMPTY).some((k) => f[k])
  const set = (patch) => setF({ ...patch, page: 1 })

  return (
    <div>
      <PageHeader title="Project library" subtitle="Each project shows whether its components are in the lab right now. Projects you can build today come first." />
      <Card className="mb-5" padded={false}>
        <div className="grid items-center gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={text} onChange={setText} placeholder="Search projects" className="sm:col-span-2 lg:col-span-5" />
          <Select aria-label="Category" value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="All categories"
            options={(cats.data || []).map((c) => ({ value: c, label: c }))} />
          <Select aria-label="Difficulty" value={f.difficulty} onChange={(e) => set({ difficulty: e.target.value })} placeholder="Any difficulty"
            options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
          <Select aria-label="Duration" value={f.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="Any duration" options={DURATION_FILTERS} />
          <Select aria-label="Availability" value={f.availability} onChange={(e) => set({ availability: e.target.value })} placeholder="Any availability"
            options={Object.entries(AVAILABILITY).map(([value, a]) => ({ value, label: a.label }))} />
          <Select aria-label="Sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })}
            options={[{ value: 'rank', label: 'Sort: Best match' }, { value: 'readiness', label: 'Sort: Most in stock' }, { value: 'name', label: 'Sort: Name' }, { value: 'time', label: 'Sort: Quickest build' }]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
          {list.data ? <p aria-live="polite"><strong className="text-ink">{all.length}</strong> project{all.length === 1 ? '' : 's'} · <strong className="text-ok">{ready}</strong> available to build now</p> : <span />}
          {filtered && <Button size="sm" variant="ghost" onClick={() => { setText(''); setF({ ...EMPTY, page: 1 }) }}>Clear filters</Button>}
        </div>
      </Card>

      {list.error ? <Card><ErrorState error={list.error} onRetry={list.refetch} /></Card>
        : list.isInitialLoading ? <SkeletonCards count={6} className="h-96" />
        : rows.length === 0 ? (
          <Card><EmptyState icon={FolderKanban} title={active.length ? 'No projects match' : 'No projects yet'}
            action={filtered && <Button variant="outline" onClick={() => { setText(''); setF({ ...EMPTY, page: 1 }) }}>Clear filters</Button>}>
            {active.length ? 'Try a different search or remove a filter.' : 'The lab has not published any projects yet.'}
          </EmptyState></Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => <ProjectCard key={p.id} project={p} to={`/student/projects/${p.id}`} />)}
          </div>
        )}
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={all.length} onPage={(page) => setF({ page })} />
    </div>
  )
}
