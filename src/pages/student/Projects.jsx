import { useEffect, useState } from 'react'
import { FolderKanban, X } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { projectCategories, rankedProjects } from '../../lib/api'
import { AVAILABILITY, DURATION_FILTERS, durationBucket } from '../../lib/format'
import { Button, Card, EmptyState, ErrorState, Hero, Pagination, Skeleton, cx } from '../../components/ui/primitives'
import { SearchInput, Select } from '../../components/ui/forms'
import { Stagger, StaggerItem } from '../../components/ui/motion'
import { Orbit } from '../../components/ui/decor'
import { ProjectCard } from '../../components/domain/ProjectCard'

const PAGE_SIZE = 12
const EMPTY = { search: '', category: '', difficulty: '', duration: '', availability: '' }

/** Card-shaped placeholders while the library loads (picture, badges, title, bar). */
function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} padded={false} className={cx('p-2', i > 3 ? 'hidden xl:block' : i > 1 && 'hidden sm:block')}>
          <Skeleton className="aspect-[16/10] w-full !rounded-[16px]" />
          <div className="space-y-2.5 px-2 pb-3 pt-4 sm:px-3">
            <div className="flex gap-2"><Skeleton className="h-5 w-20 !rounded-full" /><Skeleton className="h-5 w-24 !rounded-full" /></div>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="!mt-5 h-2 w-full !rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  )
}

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
  const clear = () => { setText(''); setF({ ...EMPTY, page: 1 }) }

  // Selects: two to a row on a phone (Sort full width), 3 + 2 on tablets, one row of five on wide screens.
  const third = 'sm:col-span-2 xl:col-span-1'
  const half = 'sm:col-span-3 xl:col-span-1'

  return (
    <div>
      <Hero
        decor={<>
          <Orbit className="-right-32 -top-36 hidden h-[420px] w-[420px] opacity-50 md:block xl:-right-6 xl:-top-28 xl:opacity-70" />
          <Orbit className="-right-20 -top-20 h-60 w-60 opacity-30 md:hidden" />
        </>}
        title="Project library"
        subtitle="Each project shows whether its components are in the lab right now. Projects you can build today come first.">
        {/* Filters sit on the night surface: inputs and selects switch to their dark style automatically. */}
        <div className="sm:glass-dark sm:rounded-[20px] sm:p-3">
          <SearchInput value={text} onChange={setText} placeholder="Search projects" />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:grid-cols-6 sm:gap-3 xl:grid-cols-5 max-sm:[&_select]:pl-3 max-sm:[&_select]:pr-7 max-sm:[&_select]:text-[13px]">
            <Select aria-label="Category" value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="All categories"
              className={third} style={{ backgroundPosition: 'right 0.6rem center' }}
              options={(cats.data || []).map((c) => ({ value: c, label: c }))} />
            <Select aria-label="Difficulty" value={f.difficulty} onChange={(e) => set({ difficulty: e.target.value })} placeholder="Any difficulty"
              className={third} style={{ backgroundPosition: 'right 0.6rem center' }}
              options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
            <Select aria-label="Duration" value={f.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="Any duration"
              className={third} style={{ backgroundPosition: 'right 0.6rem center' }} options={DURATION_FILTERS} />
            <Select aria-label="Availability" value={f.availability} onChange={(e) => set({ availability: e.target.value })} placeholder="Any availability"
              className={half} style={{ backgroundPosition: 'right 0.6rem center' }}
              options={Object.entries(AVAILABILITY).map(([value, a]) => ({ value, label: a.label }))} />
            <Select aria-label="Sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })}
              className={cx('col-span-2', half)} style={{ backgroundPosition: 'right 0.6rem center' }}
              options={[{ value: 'rank', label: 'Sort: Best match' }, { value: 'readiness', label: 'Sort: Most in stock' }, { value: 'name', label: 'Sort: Name' }, { value: 'time', label: 'Sort: Quickest build' }]} />
          </div>
        </div>

        <div className="mt-4 flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          {list.data ? (
            <p aria-live="polite" className="flex flex-wrap items-center gap-2 text-[13.5px] text-side-text">
              <span className="rounded-full bg-white/[.07] px-3 py-1.5 ring-1 ring-inset ring-white/10">
                <span className="num text-[15px] font-semibold text-white">{all.length}</span> project{all.length === 1 ? '' : 's'}
              </span>
              <span className="sr-only"> · </span>
              <span className="rounded-full bg-ok-solid/[.12] px-3 py-1.5 ring-1 ring-inset ring-ok-solid/30">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-ok-solid align-[1px] shadow-[0_0_10px_rgb(16_185_129/0.9)]" aria-hidden />
                <span className="num text-[15px] font-semibold text-[#6EE7B7]">{ready}</span> available to build now
              </span>
            </p>
          ) : <span className="h-8 w-64 max-w-full rounded-full bg-white/[.07]" aria-hidden />}
          {filtered && <Button size="sm" variant="ghost" icon={X} onClick={clear} className="max-sm:-ml-2">Clear filters</Button>}
        </div>
      </Hero>

      {list.error ? <Card><ErrorState error={list.error} onRetry={list.refetch} /></Card>
        : list.isInitialLoading ? <LibrarySkeleton />
        : rows.length === 0 ? (
          <Card className="relative isolate overflow-hidden">
            <div aria-hidden className="tex-dots pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_60%_70%_at_50%_40%,#000,transparent)]" />
            <EmptyState icon={FolderKanban} title={active.length ? 'No projects match' : 'No projects yet'}
              action={filtered && <Button variant="outline" icon={X} onClick={clear}>Clear filters</Button>}>
              {active.length ? 'Try a different search or remove a filter.' : 'The lab has not published any projects yet.'}
            </EmptyState>
          </Card>
        ) : (
          // Re-keyed when the visible set changes, so a new search, filter or page staggers in.
          <Stagger key={rows.map((p) => p.id).join()}
            className={cx('grid grid-cols-1 gap-4 transition-opacity duration-200 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3', list.loading && 'opacity-70')}>
            {rows.map((p) => (
              <StaggerItem key={p.id} className="h-full">
                <ProjectCard project={p} to={`/student/projects/${p.id}`} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={all.length} onPage={(page) => setF({ page })} />
    </div>
  )
}
