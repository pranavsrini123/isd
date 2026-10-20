import { useState } from 'react'
import { Cpu, Gauge, Cog, Monitor, Radio, BatteryCharging, Cable, Boxes, FolderKanban, Wrench, Bot } from 'lucide-react'
import { imageUrl } from '../../lib/api'
import { cx } from '../ui/primitives'

const CATEGORY_ICON = [
  [/micro|controller|board/i, Cpu], [/sensor/i, Gauge], [/motor|driver|actuator/i, Cog],
  [/display|screen|lcd/i, Monitor], [/comm|radio|wireless/i, Radio], [/power|battery/i, BatteryCharging],
  [/proto|wire|bread|accessor/i, Cable], [/tool/i, Wrench], [/special|equipment/i, Bot],
]
const GRADIENTS = [
  'from-[#E0ECFF] to-[#CFF5FB] text-brand', 'from-[#CFF5FB] to-[#E0ECFF] text-teal',
  'from-[#EDE9FE] to-[#E0ECFF] text-[#6D28D9]', 'from-[#DCFCE7] to-[#CFF5FB] text-ok',
  'from-[#FEF3C7] to-[#FFEDD5] text-warn',
]
const hash = (s = '') => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Shows the uploaded image, or a consistent icon tile when there is none. */
export function Thumb({ path, name, category, kind = 'item', className }) {
  const [failed, setFailed] = useState(false)
  const url = !failed && imageUrl(path)
  if (url) {
    return <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)}
      className={cx('rounded-[14px] bg-slate-100 object-cover', className)} />
  }
  const Icon = kind === 'project' ? FolderKanban : (CATEGORY_ICON.find(([re]) => re.test(category || ''))?.[1] || Boxes)
  return (
    <div className={cx('flex items-center justify-center rounded-[14px] bg-gradient-to-br', GRADIENTS[hash(name) % GRADIENTS.length], className)} aria-hidden>
      <Icon className="h-1/3 max-h-12 w-1/3 max-w-12" strokeWidth={1.6} />
    </div>
  )
}
