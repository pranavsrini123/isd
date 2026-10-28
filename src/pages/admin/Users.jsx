import { useEffect, useState } from 'react'
import { ArrowRight, Crown, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { listUsers, setUserRole, setUserStatus, userActivity } from '../../lib/api'
import { formatDate, relativeDue } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Pagination, SkeletonRows, Table, Td, Th, cx } from '../../components/ui/primitives'
import { SearchInput, Select } from '../../components/ui/forms'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { RequestStatusBadge } from '../../components/domain/badges'

const PAGE_SIZE = 20
const STATUS_TONE = { active: 'ok', restricted: 'warn', suspended: 'bad' }
const ROLE_OPTIONS = [{ value: 'student', label: 'Student' }, { value: 'admin', label: 'Admin' }, { value: 'super_admin', label: 'Super Admin' }]
const isStaffRole = (role) => role === 'admin' || role === 'super_admin'
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'restricted', label: 'Restricted' }, { value: 'suspended', label: 'Suspended' }]
// Compact select chrome for the per-row controls.
const ROW_SELECT = '!min-h-9 !rounded-lg !pl-3 !text-[13px] font-medium'

export default function AdminUsers() {
  const { profile: me, isSuperAdmin } = useAuth()
  const toast = useToast()
  const [f, setF] = useSearchState({ search: '', role: '', status: '', page: 1 })
  const [text, setText] = useState(f.search)
  const dq = useDebounce(text, 300)
  useEffect(() => { if (dq !== f.search) setF({ search: dq }) }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useQuery(() => listUsers({ search: f.search, role: f.role, status: f.status, page: f.page, pageSize: PAGE_SIZE }), [f.search, f.role, f.status, f.page])
  const [viewing, setViewing] = useState(null)
  const [change, setChange] = useState(null) // { user, kind: 'role'|'status', value }
  const [busy, setBusy] = useState(false)
  const rows = list.data?.data || []

  async function apply() {
    setBusy(true)
    try {
      if (change.kind === 'role') await setUserRole(change.user.id, change.value)
      else await setUserStatus(change.user.id, change.value)
      toast.success(`${change.user.full_name}: ${change.kind} set to ${change.value}`)
      setChange(null)
      list.refetch()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Users" subtitle={isSuperAdmin
        ? 'Accounts register as students. As Super Admin you appoint Admins (lab operations) and Super Admins (approvals and roles).'
        : 'Accounts register as students. Admins can restrict or suspend student accounts; only a Super Admin changes roles or staff accounts.'} />
      <Card padded={false} className="overflow-hidden">
        {/* Toolbar: search + filters. Phone: search on top, filters side by side. */}
        <div className="grid grid-cols-2 gap-2.5 border-b border-line bg-slate-50/60 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_180px_180px] md:gap-3">
          <SearchInput className="col-span-2 md:col-span-1" value={text} onChange={setText} placeholder="Name, email or register number" />
          <Select aria-label="Role" value={f.role} onChange={(e) => setF({ role: e.target.value })} placeholder="All roles" options={[{ value: 'student', label: 'Students' }, { value: 'admin', label: 'Admins' }, { value: 'super_admin', label: 'Super Admins' }]} />
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ status: e.target.value })} placeholder="Any status" options={STATUS_OPTIONS} />
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={8} />
          : rows.length === 0 ? <EmptyState icon={UsersIcon} title="No users found">Try a different search.</EmptyState>
          : (
            <>
              {/* Desktop and tablet: dense table. */}
              <div className="hidden md:block">
                <Table>
                  <thead><tr><Th>User</Th><Th>Register no.</Th><Th>Role</Th><Th>Status</Th><Th>Joined</Th><Th className="text-right">Actions</Th></tr></thead>
                  <tbody>
                    {rows.map((u) => {
                      const self = u.id === me.id
                      return (
                        <tr key={u.id}>
                          <Td className="max-w-[320px]">
                            <UserButton user={u} self={self} onOpen={() => setViewing(u)} />
                          </Td>
                          <Td className={cx('num whitespace-nowrap text-[13px]', u.srm_id ? 'text-ink' : 'text-subtle')}>{u.srm_id || '—'}</Td>
                          <Td><RoleBadge role={u.role} /></Td>
                          <Td><StatusBadge status={u.status} /></Td>
                          <Td className="whitespace-nowrap text-[13px] text-muted">{formatDate(u.created_at)}</Td>
                          <Td>
                            <RowSelects user={u} self={self} canRole={isSuperAdmin} canStatus={isSuperAdmin || !isStaffRole(u.role)} onChange={setChange} className="flex justify-end gap-2" roleClass="w-[136px]" statusClass="w-[134px]" />
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>

              {/* Phone: stacked rows, no sideways scroll. */}
              <ul className="divide-y divide-line md:hidden">
                {rows.map((u) => {
                  const self = u.id === me.id
                  return (
                    <li key={u.id} className="px-4 py-3.5">
                      <div className="flex items-start gap-3">
                        <Avatar name={u.full_name} size="sm" className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <UserButton user={u} self={self} onOpen={() => setViewing(u)} avatar={false} />
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <RoleBadge role={u.role} />
                            <StatusBadge status={u.status} />
                            {u.srm_id && <span className="num min-w-0 truncate text-xs text-ink">{u.srm_id}</span>}
                          </div>
                          <p className="mt-1.5 text-xs text-muted">Joined {formatDate(u.created_at)}</p>
                        </div>
                      </div>
                      <RowSelects user={u} self={self} canRole={isSuperAdmin} canStatus={isSuperAdmin || !isStaffRole(u.role)} onChange={setChange} className="mt-3 grid grid-cols-2 gap-2 pl-11" />
                    </li>
                  )
                })}
              </ul>
            </>
          )}
      </Card>
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={list.data?.count} onPage={(page) => setF({ page })} />

      <ConfirmDialog open={!!change} onClose={() => setChange(null)} onConfirm={apply} loading={busy}
        tone={change?.value === 'admin' || change?.value === 'super_admin' || change?.value === 'suspended' ? 'danger' : 'primary'}
        title={change ? `Change ${change.kind} for ${change.user.full_name}?` : ''} confirmLabel="Confirm change">
        {change && (
          <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-slate-50 px-3 py-2.5">
            {change.kind === 'role' ? <RoleBadge role={change.user.role} /> : <StatusBadge status={change.user.status} />}
            <ArrowRight className="h-4 w-4 text-subtle" aria-hidden />
            {change.kind === 'role' ? <RoleBadge role={change.value} /> : <StatusBadge status={change.value} />}
          </div>
        )}
        {change?.kind === 'role' && change.value === 'admin' && 'Admins run lab operations: issue approved requests, verify returns, manage inventory, projects and enquiries. They cannot see or approve pending requests. Only grant this to lab staff.'}
        {change?.kind === 'role' && change.value === 'super_admin' && 'Super Admins approve or reject requests and take-away permissions, change roles and can do everything an Admin can. Grant this sparingly.'}
        {change?.kind === 'role' && change.value === 'student' && 'They will lose access to the admin console immediately.'}
        {change?.kind === 'status' && change.value === 'restricted' && 'They can still sign in and browse, but cannot submit new requests.'}
        {change?.kind === 'status' && change.value === 'suspended' && 'They will be locked out of the app. Loans in progress stay on record.'}
        {change?.kind === 'status' && change.value === 'active' && 'Full access is restored.'}
        <span className="mt-2 block">The change is recorded in the activity log.</span>
      </ConfirmDialog>
      {viewing && <UserDrawer user={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function RoleBadge({ role }) {
  if (role === 'super_admin') return <Badge tone="cyan"><Crown className="h-3 w-3" aria-hidden />Super Admin</Badge>
  if (role === 'admin') return <Badge tone="info"><ShieldCheck className="h-3 w-3" aria-hidden />Admin</Badge>
  return <Badge tone="neutral">Student</Badge>
}

function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'neutral'} dot className="capitalize">{status}</Badge>
}

/** Name + email; opens the user's activity drawer. */
function UserButton({ user, self, onOpen, avatar = true }) {
  return (
    <button type="button" onClick={onOpen}
      className={cx('group flex max-w-full items-center gap-3 rounded-md text-left', !avatar && 'w-full')}>
      {avatar && <Avatar name={user.full_name} size="sm" />}
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink transition-colors group-hover:text-brand">
          {user.full_name}{self && <span className="font-normal text-muted"> (you)</span>}
        </span>
        <span className="block truncate text-xs text-muted">{user.email}</span>
      </span>
    </button>
  )
}

/** Role and status controls for one row; picking a value asks for confirmation. */
function RowSelects({ user, self, canRole, canStatus, onChange, className, roleClass, statusClass }) {
  return (
    <div className={className}>
      <div className={cx('min-w-0', roleClass)}>
        <Select aria-label={`Role for ${user.full_name}`} className={ROW_SELECT} value={user.role} disabled={self || !canRole} title={!canRole ? 'Only a Super Admin can change roles' : undefined}
          onChange={(e) => onChange({ user, kind: 'role', value: e.target.value })}
          options={ROLE_OPTIONS} />
      </div>
      <div className={cx('min-w-0', statusClass)}>
        <Select aria-label={`Status for ${user.full_name}`} className={ROW_SELECT} value={user.status} disabled={self || !canStatus} title={!canStatus ? 'Only a Super Admin can change a staff account' : undefined}
          onChange={(e) => onChange({ user, kind: 'status', value: e.target.value })}
          options={STATUS_OPTIONS} />
      </div>
    </div>
  )
}

function UserDrawer({ user, onClose }) {
  const act = useQuery(() => userActivity(user.id), [user.id])
  return (
    <Modal open side onClose={onClose} title={user.full_name} description={`${user.email}${user.department ? ' · ' + user.department : ''}`}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="mb-6 flex items-start gap-3.5 rounded-xl border border-line bg-slate-50/70 p-4">
        <Avatar name={user.full_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <RoleBadge role={user.role} />
            <StatusBadge status={user.status} />
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div className="min-w-0">
              <dt className="label-caps">Register no.</dt>
              <dd className={cx('num mt-0.5 break-all text-[13px]', user.srm_id ? 'text-ink' : 'text-subtle')}>{user.srm_id || '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="label-caps">Joined</dt>
              <dd className="mt-0.5 text-[13px] text-ink">{formatDate(user.created_at)}</dd>
            </div>
          </dl>
        </div>
      </div>
      {act.isInitialLoading ? <SkeletonRows rows={4} /> : act.error ? <ErrorState error={act.error} /> : (
        <>
          <DrawerHeading count={act.data.openLines.length}>Currently on loan</DrawerHeading>
          {act.data.openLines.length === 0 ? <p className="mb-6 rounded-lg border border-dashed border-line-strong px-3 py-3 text-sm text-muted">Nothing on loan.</p> : (
            <ul className="mb-6 divide-y divide-line rounded-lg border border-line text-sm">
              {act.data.openLines.map((l) => (
                <li key={l.line_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="min-w-0 truncate">{l.item_name}</span>
                    <span className="num flex-none text-muted">× {l.qty_issued}</span>
                  </span>
                  <span className={cx('flex flex-none items-center gap-1.5 whitespace-nowrap text-[13px]', l.is_overdue ? 'font-semibold text-bad' : 'text-muted')}>
                    {l.is_overdue && <span className="h-1.5 w-1.5 rounded-full bg-bad-solid" aria-hidden />}
                    {relativeDue(l.due_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <DrawerHeading count={act.data.requests.length}>Recent requests</DrawerHeading>
          {act.data.requests.length === 0 ? <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-sm text-muted">No requests yet.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {act.data.requests.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="num flex-none text-xs font-medium text-muted">{r.request_code}</span>
                  <span className="min-w-0 flex-1 truncate">{r.project_name || r.purpose}</span>
                  <RequestStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  )
}

function DrawerHeading({ count, children }) {
  return (
    <h3 className="label-caps mb-2 flex items-center gap-2">
      {children}
      <span className="num rounded-full bg-slate-100 px-1.5 py-px text-[11px] font-semibold tracking-normal text-muted">{count}</span>
    </h3>
  )
}
