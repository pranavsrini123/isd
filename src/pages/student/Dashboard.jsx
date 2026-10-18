import { useNavigate } from 'react-router-dom'
import { ArrowRight, ClipboardList, Cpu, FolderKanban, Hammer, Package, Clock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { inventoryTotals, myBorrowingLines, myRequests, rankedProjects } from '../../lib/api'
import { formatDate, formatNumber, relativeDue, daysFromToday } from '../../lib/format'
import { Button, Card, EmptyState, ErrorState, SectionTitle, SkeletonCards, StatCard, cx } from '../../components/ui/primitives'
import { ProjectCard } from '../../components/domain/ProjectCard'
import { RequestStatusBadge } from '../../components/domain/badges'
import { SearchInput } from '../../components/ui/forms'
import { useState } from 'react'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
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
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold">{greeting()}, {profile.full_name.split(' ')[0]}</h1>
          <p className="mt-1 text-muted">
            {new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())} · Here is what the lab has available today.
          </p>
        </div>
        <form className="w-full sm:w-80" onSubmit={(e) => { e.preventDefault(); nav(`/student/inventory?search=${encodeURIComponent(q)}`) }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search components" />
        </form>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available components" icon={Cpu} accent="brand" loading={totals.isInitialLoading}
          value={formatNumber(totals.data?.available)} hint={`of ${formatNumber(totals.data?.total)} units in the lab`} to="/student/inventory" />
        <StatCard label="My borrowed items" icon={Package} accent="cyan" loading={lines.isInitialLoading}
          value={formatNumber(open.reduce((s, l) => s + l.qty_issued, 0))} hint={nextDue ? `Next due ${formatDate(nextDue)}` : 'Nothing on loan'} to="/student/requests?tab=borrowed" />
        <StatCard label="Pending requests" icon={ClipboardList} accent="warn" loading={requests.isInitialLoading}
          value={pending.length} hint={pending.length ? 'Awaiting admin review' : 'No requests waiting'} to="/student/requests?tab=pending" />
        <StatCard label="Projects ready to build" icon={Hammer} accent="ok" loading={projects.isInitialLoading}
          value={buildableCount} hint={`of ${ranked.length} in the library`} to="/student/projects?buildable=1" />
      </div>

      <section className="mb-8">
        <SectionTitle action={<Button to="/student/projects" variant="ghost" size="sm">View all projects <ArrowRight className="h-4 w-4" /></Button>}>
          Recommended projects for you
        </SectionTitle>
        <p className="-mt-2 mb-4 text-sm text-muted">Ranked by how many of the required components are available right now.</p>
        {projects.error ? <Card><ErrorState error={projects.error} onRetry={projects.refetch} /></Card>
          : projects.isInitialLoading ? <SkeletonCards count={3} className="h-80" />
          : ranked.length === 0 ? <Card><EmptyState icon={FolderKanban} title="No projects yet">The lab has not published any projects. Check back soon.</EmptyState></Card>
          : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {ranked.slice(0, 3).map((p) => <ProjectCard key={p.id} project={p} to={`/student/projects/${p.id}`} />)}
            </div>
          )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle action={<Button to="/student/requests?tab=borrowed" variant="ghost" size="sm">View all</Button>}>My borrowed items</SectionTitle>
          {lines.isInitialLoading ? <p className="text-sm text-muted">Loading…</p>
            : open.length === 0 ? <p className="py-6 text-center text-sm text-muted">You have nothing on loan.</p>
            : (
              <ul className="divide-y divide-line">
                {open.slice(0, 5).map((l) => {
                  const d = daysFromToday(l.due_date)
                  return (
                    <li key={l.line_id} className="flex items-center gap-3 py-3">
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-info-bg text-brand"><Package className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{l.item_name} × {l.qty_issued}</p>
                        <p className="text-xs text-muted">Issued {formatDate(l.issued_at)} · {l.request_code}</p>
                      </div>
                      <span className={cx('inline-flex items-center gap-1 text-xs font-semibold', d < 0 ? 'text-bad' : d <= 3 ? 'text-warn' : 'text-muted')}>
                        <Clock className="h-3.5 w-3.5" />{relativeDue(l.due_date)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
        </Card>
        <Card>
          <SectionTitle action={<Button to="/student/requests" variant="ghost" size="sm">View all</Button>}>Recent requests</SectionTitle>
          {requests.isInitialLoading ? <p className="text-sm text-muted">Loading…</p>
            : (requests.data || []).length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm text-muted">No requests yet.</p>
                <Button to="/student/projects" size="sm" variant="outline" className="mt-3">Find a project to build</Button>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {requests.data.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{(r.items || []).map((i) => `${i.name} × ${i.qty}`).join(', ')}</p>
                      <p className="text-xs text-muted"><span className="font-mono">{r.request_code}</span> · {formatDate(r.created_at)}{r.project_name ? ` · ${r.project_name}` : ''}</p>
                    </div>
                    <RequestStatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>
    </div>
  )
}
