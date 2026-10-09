import { useEffect, useState } from 'react'
import { Activity as ActivityIcon } from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { listActivity } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, SkeletonRows, Table, Td, Th } from '../../components/ui/primitives'
import { SearchInput, Select } from '../../components/ui/forms'

const PAGE_SIZE = 30
const ENTITY = [
  { value: 'borrow_request', label: 'Requests' }, { value: 'borrowing', label: 'Loans & returns' },
  { value: 'inventory_item', label: 'Inventory' }, { value: 'project', label: 'Projects' },
  { value: 'profile', label: 'Users' }, { value: 'app_setting', label: 'Settings' }, { value: 'inventory_category', label: 'Categories' },
]
const toneFor = (action) => /reject|lost|missing|delete|suspend/.test(action) ? 'bad' : /approve|verified|issued|created/.test(action) ? 'ok' : /adjust|update|change/.test(action) ? 'info' : 'neutral'

export default function AdminActivity() {
  const [f, setF] = useSearchState({ search: '', entity: '', page: 1 })
  const [text, setText] = useState(f.search)
  const dq = useDebounce(text, 300)
  useEffect(() => { if (dq !== f.search) setF({ search: dq }) }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useQuery(() => listActivity({ search: f.search, entity: f.entity, page: f.page, pageSize: PAGE_SIZE }), [f.search, f.entity, f.page])
  useRealtime(['borrow_requests', 'inventory_items', 'return_records'], list.refetch, { enabled: f.page === 1 })
  const rows = list.data?.data || []
  return (
    <div>
      <PageHeader title="Activity log" subtitle="An append-only record of every approval, issue, return, stock adjustment and permission change." />
      <Card padded={false}>
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-[1fr_220px]">
          <SearchInput value={text} onChange={setText} placeholder="Search the log" />
          <Select aria-label="Type" value={f.entity} onChange={(e) => setF({ entity: e.target.value })} placeholder="All types" options={ENTITY} />
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={10} />
          : rows.length === 0 ? <EmptyState icon={ActivityIcon} title="No activity found" />
          : (
            <Table>
              <thead><tr><Th className="w-44">When</Th><Th className="w-40">Who</Th><Th className="w-44">Action</Th><Th>Summary</Th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <Td className="whitespace-nowrap text-[13px] text-muted">{formatDateTime(a.created_at)}</Td>
                    <Td className="text-[13px]">{a.actor_name || <span className="text-muted">System</span>}</Td>
                    <Td><Badge tone={toneFor(a.action)}>{a.action}</Badge></Td>
                    <Td>
                      <p className="text-sm">{a.summary}</p>
                      {a.details?.reason && <p className="text-xs text-muted">Reason: {a.details.reason}</p>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
      </Card>
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={list.data?.count} onPage={(page) => setF({ page })} />
    </div>
  )
}
