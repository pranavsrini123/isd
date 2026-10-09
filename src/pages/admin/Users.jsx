import { useEffect, useState } from 'react'
import { ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { listUsers, setUserRole, setUserStatus, userActivity } from '../../lib/api'
import { formatDate, relativeDue } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Pagination, SkeletonRows, Table, Td, Th } from '../../components/ui/primitives'
import { SearchInput, Select } from '../../components/ui/forms'
import { ConfirmDialog, Modal } from '../../components/ui/Modal'
import { RequestStatusBadge } from '../../components/domain/badges'

const PAGE_SIZE = 20
const STATUS_TONE = { active: 'ok', restricted: 'warn', suspended: 'bad' }

export default function AdminUsers() {
  const { profile: me } = useAuth()
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
      <PageHeader title="Users" subtitle="Accounts register as students. Only administrators can grant admin access or restrict an account." />
      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-[1fr_170px_170px]">
          <SearchInput value={text} onChange={setText} placeholder="Name, email or register number" />
          <Select aria-label="Role" value={f.role} onChange={(e) => setF({ role: e.target.value })} placeholder="All roles" options={[{ value: 'student', label: 'Students' }, { value: 'admin', label: 'Admins' }]} />
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ status: e.target.value })} placeholder="Any status" options={[{ value: 'active', label: 'Active' }, { value: 'restricted', label: 'Restricted' }, { value: 'suspended', label: 'Suspended' }]} />
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={8} />
          : rows.length === 0 ? <EmptyState icon={UsersIcon} title="No users found">Try a different search.</EmptyState>
          : (
            <Table>
              <thead><tr><Th>User</Th><Th>Register no.</Th><Th>Role</Th><Th>Status</Th><Th>Joined</Th><Th className="text-right">Actions</Th></tr></thead>
              <tbody>
                {rows.map((u) => {
                  const self = u.id === me.id
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <Td>
                        <button className="flex items-center gap-3 text-left" onClick={() => setViewing(u)}>
                          <Avatar name={u.full_name} size="sm" />
                          <span><span className="block font-semibold hover:text-brand">{u.full_name}{self && <span className="font-normal text-muted"> (you)</span>}</span><span className="block text-xs text-muted">{u.email}</span></span>
                        </button>
                      </Td>
                      <Td className="font-mono text-[13px]">{u.srm_id || '—'}</Td>
                      <Td>{u.role === 'admin' ? <Badge tone="info"><ShieldCheck className="h-3 w-3" />Admin</Badge> : <Badge tone="cyan">Student</Badge>}</Td>
                      <Td><Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge></Td>
                      <Td className="text-[13px] text-muted">{formatDate(u.created_at)}</Td>
                      <Td>
                        <div className="flex justify-end gap-2">
                          <Select aria-label={`Role for ${u.full_name}`} className="!min-h-9 w-32" value={u.role} disabled={self}
                            onChange={(e) => setChange({ user: u, kind: 'role', value: e.target.value })}
                            options={[{ value: 'student', label: 'Student' }, { value: 'admin', label: 'Admin' }]} />
                          <Select aria-label={`Status for ${u.full_name}`} className="!min-h-9 w-36" value={u.status} disabled={self}
                            onChange={(e) => setChange({ user: u, kind: 'status', value: e.target.value })}
                            options={[{ value: 'active', label: 'Active' }, { value: 'restricted', label: 'Restricted' }, { value: 'suspended', label: 'Suspended' }]} />
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
      </Card>
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={list.data?.count} onPage={(page) => setF({ page })} />

      <ConfirmDialog open={!!change} onClose={() => setChange(null)} onConfirm={apply} loading={busy}
        tone={change?.value === 'admin' || change?.value === 'suspended' ? 'danger' : 'primary'}
        title={change ? `Change ${change.kind} for ${change.user.full_name}?` : ''} confirmLabel="Confirm change">
        {change?.kind === 'role' && change.value === 'admin' && 'Administrators can change stock, approve requests and manage every account. Only grant this to lab staff.'}
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

function UserDrawer({ user, onClose }) {
  const act = useQuery(() => userActivity(user.id), [user.id])
  return (
    <Modal open side onClose={onClose} title={user.full_name} description={`${user.email}${user.department ? ' · ' + user.department : ''}`}>
      {act.isInitialLoading ? <SkeletonRows rows={4} /> : act.error ? <ErrorState error={act.error} /> : (
        <>
          <h3 className="label-caps mb-2">Currently on loan</h3>
          {act.data.openLines.length === 0 ? <p className="mb-6 text-sm text-muted">Nothing on loan.</p> : (
            <ul className="mb-6 divide-y divide-line rounded-xl border border-line text-sm">
              {act.data.openLines.map((l) => <li key={l.line_id} className="flex justify-between gap-3 px-3 py-2"><span>{l.item_name} × {l.qty_issued}</span><span className={l.is_overdue ? 'font-semibold text-bad' : 'text-muted'}>{relativeDue(l.due_date)}</span></li>)}
            </ul>
          )}
          <h3 className="label-caps mb-2">Recent requests</h3>
          {act.data.requests.length === 0 ? <p className="text-sm text-muted">No requests yet.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line text-sm">
              {act.data.requests.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-xs">{r.request_code}</span><span className="flex-1 truncate">{r.project_name || r.purpose}</span><RequestStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="mt-6"><Button variant="outline" onClick={onClose}>Close</Button></div>
    </Modal>
  )
}
