import { useEffect, useState } from 'react'
import {
  Activity as ActivityIcon, Boxes, ClipboardCheck, Cpu, FileSpreadsheet, FolderKanban, PackageCheck, Settings, Shapes, Tags, Users,
} from 'lucide-react'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useDebounce } from '../../hooks/useDebounce'
import { useSearchState } from '../../hooks/useSearchState'
import { listActivity } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { Avatar, Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, SkeletonRows, Table, Td, Th } from '../../components/ui/primitives'
import { SearchInput, Select } from '../../components/ui/forms'

const PAGE_SIZE = 30
const ENTITY = [
  { value: 'borrow_request', label: 'Requests' }, { value: 'borrowing', label: 'Loans & returns' },
  { value: 'inventory_item', label: 'Inventory' }, { value: 'project', label: 'Projects' },
  { value: 'profile', label: 'Users' }, { value: 'app_setting', label: 'Settings' }, { value: 'category', label: 'Categories' },
]
const toneFor = (action) => /reject|lost|missing|delete|suspend/.test(action) ? 'bad' : /approve|verified|issued|created/.test(action) ? 'ok' : /adjust|update|change/.test(action) ? 'info' : 'neutral'

// Display only: an icon per record type (same icons as the console sidebar) and its filter label.
const ENTITY_ICON = {
  borrow_request: ClipboardCheck, borrowing: PackageCheck, inventory_item: Boxes, project: FolderKanban,
  profile: Users, app_setting: Settings, category: Tags, inventory_source_record: FileSpreadsheet,
}
const ENTITY_LABEL = { ...Object.fromEntries(ENTITY.map((e) => [e.value, e.label])), inventory_source_record: 'Audit import' }

// Request codes, IDs, counts and quantities inside a summary are set in the mono face; dates stay in the sans.
const TOKEN = /(\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} [A-Z][a-z]{2} \d{4}\b)|(\b[A-Z]{2,}-\d+\b)|(\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b)|((?<![\w.-])\d+(?:\.\d+)?(?![\w-]))/g
const TOKEN_CLASS = [null, 'num whitespace-nowrap text-[0.93em] font-medium text-ink', 'num break-all text-[0.9em] text-muted', 'num text-[0.93em]', 'whitespace-nowrap']
function Coded({ text }) {
  const s = String(text ?? '')
  const out = []
  let last = 0
  for (const mt of s.matchAll(TOKEN)) {
    if (mt.index > last) out.push(s.slice(last, mt.index))
    const kind = mt[1] ? 4 : mt[2] ? 1 : mt[3] ? 2 : 3
    out.push(<span key={mt.index} className={TOKEN_CLASS[kind]}>{mt[0]}</span>)
    last = mt.index + mt[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return <>{out}</>
}

function ActionBadge({ action }) {
  return <Badge tone={toneFor(action)} dot><span className="num text-[11.5px]">{action}</span></Badge>
}

function EntityTag({ type }) {
  if (!type) return null
  const Icon = ENTITY_ICON[type] || Shapes
  const label = ENTITY_LABEL[type]
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
      <Icon className="h-3.5 w-3.5 flex-none text-subtle" aria-hidden />
      {label ? <span className="truncate">{label}</span> : <span className="num truncate">{type}</span>}
    </span>
  )
}

function SystemMark() {
  return (
    <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-subtle ring-1 ring-inset ring-line" aria-hidden>
      <Cpu className="h-4 w-4" />
    </span>
  )
}

function Summary({ a }) {
  return (
    <>
      <p className="break-words text-sm leading-snug text-ink"><Coded text={a.summary} /></p>
      {a.details?.reason && (
        <p className="mt-1 break-words border-l-2 border-line-strong pl-2 text-xs leading-snug text-muted">Reason: <Coded text={a.details.reason} /></p>
      )}
    </>
  )
}

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
      <Card padded={false} className="overflow-hidden">
        <div className="grid gap-2.5 border-b border-line bg-slate-50/70 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_224px]">
          <SearchInput value={text} onChange={setText} placeholder="Search the log" />
          <Select aria-label="Type" value={f.entity} onChange={(e) => setF({ entity: e.target.value })} placeholder="All types" options={ENTITY} />
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
          : list.isInitialLoading ? <SkeletonRows rows={10} />
          : rows.length === 0 ? <EmptyState icon={ActivityIcon} title="No activity found" />
          : (
            <>
              {/* Desktop and tablet: a dense log table. */}
              <Table className="hidden md:block">
                <thead>
                  <tr><Th className="w-[6.5rem] xl:w-px">When</Th><Th className="w-px">Who</Th><Th className="w-px">Action</Th><Th>Summary</Th></tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <Td className="text-[13px] leading-snug tabular-nums text-muted xl:whitespace-nowrap">
                        <time dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="flex items-center gap-2.5 pr-2">
                          <span className="hidden xl:block">{a.actor_name ? <Avatar name={a.actor_name} size="sm" /> : <SystemMark />}</span>
                          <span className="text-[13px] font-medium">{a.actor_name || <span className="font-normal text-muted">System</span>}</span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1 xl:flex-row xl:items-center xl:gap-3">
                          <ActionBadge action={a.action} />
                          <EntityTag type={a.entity_type} />
                        </div>
                      </Td>
                      <Td className="min-w-[220px]">
                        <Summary a={a} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {/* Phone: the same entries stacked. */}
              <ul className="divide-y divide-line md:hidden">
                {rows.map((a) => (
                  <li key={a.id} className="flex gap-3 px-4 py-3.5">
                    {a.actor_name ? <Avatar name={a.actor_name} size="sm" /> : <SystemMark />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-[13.5px] font-semibold">{a.actor_name || <span className="font-normal text-muted">System</span>}</p>
                        <time dateTime={a.created_at} className="flex-none text-xs tabular-nums text-muted">{formatDateTime(a.created_at)}</time>
                      </div>
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                        <ActionBadge action={a.action} />
                        <EntityTag type={a.entity_type} />
                      </div>
                      <div className="mt-2"><Summary a={a} /></div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
      </Card>
      <Pagination page={f.page} pageSize={PAGE_SIZE} total={list.data?.count} onPage={(page) => setF({ page })} />
    </div>
  )
}
