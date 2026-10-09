import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ClipboardList, Cpu, FolderKanban, Hammer, Package, Search, XCircle, Clock } from 'lucide-react'
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
  const top = ranked[0]
  const nextNotBuildable = ranked.find((p) => !p.buildable)
  const hero = top?.buildable ? top : nextNotBuildable || top
  const open = (lines.data || []).filter((l) => !l.is_verified)
  const nextDue = open.map((l) => l.due_date).sort()[0]
  const pending = (requests.data || []).filter((r) => r.status === 'pending')

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold">{greeting()}, {profile.full_name.split(' ')[0]}</h1>
          <p className="mt-1 text-muted">
            {new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())} · Here is what the lab has on the shelf today.
          </p>
        </div>
        <form className="w-full sm:w-80" onSubmit={(e) => { e.preventDefault(); nav(`/student/inventory?search=${encodeURIComponent(q)}`) }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search components" />
        </form>
      </div>

      {hero && (
        <section className="relative mb-7 overflow-hidden rounded-[24px] bg-navy p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/40 blur-3xl" aria-hidden />
          <div className="relative grid items-center gap-6 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="label-caps !text-cyan-light">Your next build</p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{hero.name}</h2>
              <p className="mt-2 max-w-2xl text-side-text">
                {hero.buildable
                  ? `Every part is on the shelf right now — ${hero.n_required} component types ready to request.`
                  : `${hero.n_satisfied} of ${hero.n_required} parts are ready on the shelf. ${hero.missing.length === 1 ? `Only the ${hero.missing[0].name} is short right now.` : `${hero.missing.length} parts are short right now.`}`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {hero.missing.slice(0, 4).map((m) => (
                  <span key={m.item_id} className="inline-flex items-center gap-1.5 rounded-full border border-[#F87171]/60 bg-[#F87171]/15 px-3 py-1 text-[13px] text-[#FECACA]">
                    <XCircle className="h-3.5 w-3.5" /> {m.name}
                  </span>
                ))}
                {hero.buildable && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[13px]"><CheckCircle2 className="h-3.5 w-3.5 text-cyan" /> Buildable now</span>}
              </div>
            </div>
            <Button to={`/student/projects/${hero.id}`} variant="cyan" size="lg">See what you can build <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </section>
      )}

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
        <h2 className="mb-4 text-lg font-semibold">Quick actions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['/student/inventory', Search, 'Browse inventory', `Search ${formatNumber(totals.data?.types ?? 0)} component types`, 'bg-info-bg text-brand'],
            ['/student/projects', FolderKanban, 'Explore projects', `${ranked.length} builds, ranked for you`, 'bg-[#CFF5FB] text-teal'],
            ['/student/requests', ClipboardList, 'My requests', 'Track status and history', 'bg-ok-bg text-ok'],
          ].map(([to, Icon, title, text, tile]) => (
            <Card key={to} as={Link} to={to} className="flex items-center gap-4 transition-colors hover:border-[#93B4F5]">
              <span className={cx('flex h-11 w-11 flex-none items-center justify-center rounded-[14px]', tile)}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{text}</span></span>
              <ArrowRight className="h-4 w-4 text-muted" />
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <SectionTitle action={<Button to="/student/projects" variant="ghost" size="sm">View all projects <ArrowRight className="h-4 w-4" /></Button>}>
          Recommended projects for you
        </SectionTitle>
        <p className="-mt-2 mb-4 text-sm text-muted">Ranked by how many of the required parts are on the shelf right now.</p>
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
