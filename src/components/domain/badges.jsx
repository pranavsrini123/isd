import { Badge } from '../ui/primitives'
import { DIFFICULTY, ENQUIRY_STATUS, REQUEST_STATUS, STOCK_STATUS, TAKEAWAY_STATUS } from '../../lib/format'

export function StockBadge({ status }) {
  const s = STOCK_STATUS[status] || STOCK_STATUS.in_stock
  return <Badge tone={s.tone} dot>{s.label}</Badge>
}
export function RequestStatusBadge({ status }) {
  const s = REQUEST_STATUS[status] || { label: status, tone: 'neutral' }
  return <Badge tone={s.tone}>{s.label}</Badge>
}
export function EnquiryStatusBadge({ status }) {
  const s = ENQUIRY_STATUS[status] || { label: status, tone: 'neutral' }
  return <Badge tone={s.tone}>{s.label}</Badge>
}
export function TakeawayStatusBadge({ status }) {
  const s = TAKEAWAY_STATUS[status] || { label: status, tone: 'neutral' }
  return <Badge tone={s.tone}>{s.label}</Badge>
}
export function DifficultyBadge({ level }) {
  const d = DIFFICULTY[level]
  return d ? <Badge tone={d.tone}>{d.label}</Badge> : null
}
/** Shown on items students can see but not request (tools, special equipment). */
export function LabUseBadge({ show }) {
  return show === false ? <Badge tone="warn">Lab use only</Badge> : null
}
export function DemoBadge({ show }) {
  return show ? <Badge tone="neutral" className="!text-[10px] uppercase tracking-wider">Demo data</Badge> : null
}
