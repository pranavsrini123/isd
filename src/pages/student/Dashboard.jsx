import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ClipboardList, Cpu, FolderKanban, Hammer, Package, Clock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { inventoryTotals, myBorrowingLines, myRequests, rankedProjects } from '../../lib/api'
import { formatDate, formatNumber, relativeDue, daysFromToday } from '../../lib/format'
import { Button, Card, EmptyState, ErrorState, Hero, IconTile, SectionTitle, Skeleton, SkeletonCards, StatCard, cx } from '../../components/ui/primitives'
import { Reveal, Stagger, StaggerItem } from '../../components/ui/motion'
import { Orbit } from '../../components/ui/decor'
import { ProjectCard } from '../../components/domain/ProjectCard'
import { RequestStatusBadge } from '../../components/domain/badges'
import { Thumb } from '../../components/domain/Thumb'
import { SearchInput } from '../../components/ui/forms'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function DueChip({ tone, due, className }) {
  return (
    <span className={cx('flex-none items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', tone, className)}>
      <Clock className="h-3.5 w-3.5" aria-hidden />{relativeDue(due)}
    </span>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-3 py-1" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-3/5" /><Skeleton className="h-3 w-2/5" /></div>
        </div>
      ))}
    </div>
  )
}

export default function StudentDashboard() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const totals = useQuery(() => inventoryTotals(), [])
  const projects = useQuery(() => rankedProjects(), [])
  const requests = useQuery(() => myRequests(profile.id), [profile.id])
  const lines = useQuery(() => myBorrowingLines(profile.id), [profile.id])
  useRealtime(['inventory_items', 'project_components', 'projects'], () => { totals.refetch(); projects.refetch() })
  useRealtime(['borrow_requests', 'borrowings', 'return_records'], () => { requests.refetch(); lines.refetch() })

  const ranked = (projects.data || []).filter((p) => p.n_required > 0)
  const buildableCount = ranked.filter((p) => p.buildable).length
  const open = (lines.data || []).filter((l) => !l.is_verified)
  const nextDue = open.map((l) => l.due_date).sort()[0]
  const pending = (requests.data || []).filter((r) => r.status === 'pending')

  return (
    <div>
      <Hero flush className="pb-28 sm:pb-32"
        decor={<>
          <Orbit className="-right-28 top-1/2 hidden h-[440px] w-[440px] -translate-y-[56%] opacity-80 md:block lg:right-4" />
          <Orbit className="-right-20 -top-16 h-64 w-64 opacity-35 md:hidden" />
        </>}
        title={<>{greeting()}, <span className="text-cyan">{profile.full_name.split(' ')[0]}</span></>}
        subtitle={<>
          <span className="font-medium text-white">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span>
          {' · '}Here is what the lab has available today.
        </>}>
        <form className="w-full max-w-md" onSubmit={(e) => { e.preventDefault(); nav(`/student/inventory?search=${encodeURIComponent(q)}`) }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search components" />
        </form>
      </Hero>

      <Stagger className="relative z-10 -mt-20 mb-10 grid grid-cols-2 gap-3 px-2 sm:-mt-24 sm:gap-4 sm:px-4 xl:grid-cols-4 xl:px-6">
        <StaggerItem>
          <StatCard label="Available components" icon={Cpu} accent="brand" loading={totals.isInitialLoading}
            value={formatNumber(totals.data?.available)} hint={`of ${formatNumber(totals.data?.total)} units in the lab`} to="/student/inventory" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="My borrowed items" icon={Package} accent="cyan" loading={lines.isInitialLoading}
            value={formatNumber(open.reduce((s, l) => s + l.qty_issued, 0))} hint={nextDue ? `Next due ${formatDate(nextDue)}` : 'Nothing on loan'} to="/student/requests?tab=borrowed" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Pending requests" icon={ClipboardList} accent="warn" loading={requests.isInitialLoading}
            value={pending.length} hint={pending.length ? 'Awaiting admin review' : 'No requests waiting'} to="/student/requests?tab=pending" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Projects ready to build" icon={Hammer} accent="ok" loading={projects.isInitialLoading}
            value={buildableCount} hint={`of ${ranked.length} in the library`} to="/student/projects?buildable=1" />
        </StaggerItem>
      </Stagger>

      <section className="mb-10">
        <SectionTitle className="mb-1" action={<Button to="/student/projects" variant="link" size="sm">View all projects <ArrowRight className="h-4 w-4" /></Button>}>
          Recommended projects for you
        </SectionTitle>
        <p className="mb-5 pl-[18px] text-sm text-muted">Ranked by how many of the required components are available right now.</p>
        {projects.error ? <Card><ErrorState error={projects.error} onRetry={projects.refetch} /></Card>
          : projects.isInitialLoading ? <SkeletonCards count={3} className="h-80" />
          : ranked.length === 0 ? <Card><EmptyState icon={FolderKanban} title="No projects yet">The lab has not published any projects. Check back soon.</EmptyState></Card>
          : (
            <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {ranked.slice(0, 3).map((p) => <StaggerItem key={p.id} className="h-full"><ProjectCard project={p} to={`/student/projects/${p.id}`} /></StaggerItem>)}
            </Stagger>
          )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal>
          <Card className="h-full">
            <SectionTitle action={<Button to="/student/requests?tab=borrowed" variant="link" size="sm">View all</Button>}>My borrowed items</SectionTitle>
            {lines.isInitialLoading ? <ListSkeleton />
              : open.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <IconTile icon={Package} tone="cyan" className="mb-3" />
                  <p className="text-sm text-muted">You have nothing on loan.</p>
                </div>
              ) : (
                <ul className="-mx-2">
                  {open.slice(0, 5).map((l) => {
                    const d = daysFromToday(l.due_date)
                    const tone = d < 0 ? 'bg-bad-bg text-bad ring-bad/15' : d <= 3 ? 'bg-warn-bg text-warn ring-warn/15' : 'bg-neutral-pill text-neutral-pill-text ring-neutral-pill-text/10'
                    return (
                      <li key={l.line_id} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-white/70">
                        <Thumb path={l.item_image_path} name={l.item_name} className="h-11 w-11 flex-none !rounded-xl" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{l.item_name} × <span className="num">{l.qty_issued}</span></p>
                          <p className="truncate text-xs text-muted">Issued {formatDate(l.issued_at)} · <span className="num">{l.request_code}</span></p>
                          <DueChip tone={tone} due={l.due_date} className="mt-1.5 inline-flex sm:hidden" />
                        </div>
                        <DueChip tone={tone} due={l.due_date} className="hidden sm:inline-flex" />
                      </li>
                    )
                  })}
                </ul>
              )}
          </Card>
        </Reveal>
        <Reveal delay={0.08}>
          <Card className="h-full">
            <SectionTitle action={<Button to="/student/requests" variant="link" size="sm">View all</Button>}>Recent requests</SectionTitle>
            {requests.isInitialLoading ? <ListSkeleton />
              : (requests.data || []).length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <IconTile icon={ClipboardList} tone="brand" className="mb-3" />
                  <p className="text-sm text-muted">No requests yet.</p>
                  <Button to="/student/projects" size="sm" variant="outline" className="mt-4">Find a project to build</Button>
                </div>
              ) : (
                <ul className="-mx-2">
                  {requests.data.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-white/70">
                      <IconTile icon={ClipboardList} tone="none" size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{(r.items || []).map((i) => `${i.name} × ${i.qty}`).join(', ')}</p>
                        <p className="truncate text-xs text-muted"><span className="num">{r.request_code}</span> · {formatDate(r.created_at)}{r.project_name ? ` · ${r.project_name}` : ''}</p>
                      </div>
                      <RequestStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </Reveal>
      </div>
    </div>
  )
}
