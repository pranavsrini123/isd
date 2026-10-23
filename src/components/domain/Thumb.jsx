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
  'from-[#D3F6FB] to-[#E2EAFF] text-brand', 'from-[#E2EAFF] to-[#D3F6FB] text-[#3346D3]',
  'from-[#ECE8FF] to-[#E2EAFF] text-[#5B4BD6]', 'from-[#DCF7EA] to-[#D3F6FB] text-ok',
  'from-[#FEF0D3] to-[#FFF4E6] text-warn',
]
const hash = (s = '') => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Shows the uploaded image, or a consistent icon tile when there is none. */
export function Thumb({ path, name, category, kind = 'item', className, alt }) {
  const [failed, setFailed] = useState(false)
  const url = !failed && imageUrl(path)
  if (url) {
    return <img src={url} alt={alt || name} loading="lazy" decoding="async" onError={() => setFailed(true)}
      className={cx('rounded-[14px] bg-[#EAF1F8] object-cover', className)} />
  }
  const Icon = kind === 'project' ? FolderKanban : (CATEGORY_ICON.find(([re]) => re.test(category || ''))?.[1] || Boxes)
  return (
    <div className={cx('flex items-center justify-center rounded-[14px] bg-gradient-to-br', GRADIENTS[hash(name) % GRADIENTS.length], className)} aria-hidden>
      <Icon className="h-1/3 max-h-12 w-1/3 max-w-12 drop-shadow-[0_6px_14px_rgb(34_211_238/0.35)]" strokeWidth={1.5} />
    </div>
  )
}
