import { useEffect, useState } from 'react'
import { FolderKanban } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { projectCategories, rankedProjects } from '../../lib/api'
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, SkeletonCards } from '../../components/ui/primitives'
import { SearchInput, Select, Toggle } from '../../components/ui/forms'
import { ProjectCard } from '../../components/domain/ProjectCard'

const PAGE_SIZE = 12

export default function ProjectLibrary() {
  const [f, setF] = useSearchState({ search: '', category: '', difficulty: '', buildable: false, sort: 'rank', page: 1 })
  const [text, setText] = useState(f.search)
  const debounced = useDebounce(text, 300)
  useEffect(() => { if (debounced !== f.search) setF({ search: debounced }) }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const cats = useQuery(() => projectCategories(), [])
  const list = useQuery(
    () => rankedProjects({ search: f.search, category: f.category, difficulty: f.difficulty, buildableOnly: f.buildable, sort: f.sort }),
    [f.search, f.category, f.difficulty, f.buildable, f.sort],
  )
  // Readiness depends on live stock: refresh when inventory or requirements change.
  useRealtime(['inventory_items', 'project_components', 'projects'], list.refetch)

  const all = (list.data || []).filter((p) => p.n_required > 0)
  const rows = all.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE)
  const buildable = all.filter((p) => p.buildable).length

  return (
    <div>
      <PageHeader title="Project library" subtitle="Every project shows how many of its parts are on the shelf right now. Buildable projects come first." />
      <Card className="mb-5" padded={false}>
        <div className="grid items-center gap-3 p-4 md:grid-cols-[1fr_170px_170px_190px]">
          <SearchInput value={text} onChange={setText} placeholder="Search projects" />
          <Select aria-label="Category" value={f.category} onChange={(e) => setF({ category: e.target.value })} placeholder="All categories"
            options={(cats.data || []).map((c) => ({ value: c, label: c }))} />
          <Select aria-label="Difficulty" value={f.difficulty} onChange={(e) => setF({ difficulty: e.target.value })} placeholder="Any difficulty"
            options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
          <Select aria-label="Sort" value={f.sort} onChange={(e) => setF({ sort: e.target.value })}
            options={[{ value: 'rank', label: 'Sort: Best match' }, { value: 'readiness', label: 'Sort: Readiness' }, { value: 'name', label: 'Sort: Name' }, { value: 'time', label: 'Sort: Quickest build' }]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <Toggle checked={f.buildable} onChange={(v) => setF({ buildable: v })} label="Only show projects I can build now" />
          {list.data && <p className="text-sm text-muted"><strong className="text-ok">{buildable}</strong> of {all.length} shown are buildable now</p>}
        </div>
      </Card>

      {list.error ? <Card><ErrorState error={list.error} onRetry={list.refetch} /></Card>
        : list.isInitialLoading ? <SkeletonCards count={6} className="h-80" />
        : rows.length === 0 ? (
          <Card><EmptyState icon={FolderKanban} title={f.buildable ? 'Nothing fully buildable right now' : 'No projects match'}
            action={<Button variant="outline" onClick={() => { setText(''); setF({ search: '', category: '', difficulty: '', buildable: false }) }}>Clear filters</Button>}>
            {f.buildable ? 'Turn off the buildable filter to see projects that are only a part or two short.' : 'Try a different search or filter.'}
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
