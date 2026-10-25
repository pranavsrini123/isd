import { useId } from 'react'
import { cx } from './primitives'

/**
 * Decorative "lab orbit" for night heroes: concentric rings, a dashed cyan arc and glowing
 * nodes around a hexagon. Purely visual (aria-hidden), static, no text.
 */
export function Orbit({ className }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 400 400" className={cx('absolute', className)} fill="none" aria-hidden>
      <defs>
        <radialGradient id={`${id}c`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#22D3EE" stopOpacity=".35" />
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="400" y2="400" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#67E8F9" />
          <stop offset="1" stopColor="#4F7BFF" stopOpacity=".2" />
        </linearGradient>
      </defs>
      <circle cx="200" cy="200" r="120" fill={`url(#${id}c)`} />
      <circle cx="200" cy="200" r="190" stroke="#fff" strokeOpacity=".07" />
      <circle cx="200" cy="200" r="150" stroke="#fff" strokeOpacity=".09" />
      <circle cx="200" cy="200" r="108" stroke="#fff" strokeOpacity=".11" />
      <circle cx="200" cy="200" r="150" stroke={`url(#${id}a)`} strokeWidth="1.5" strokeDasharray="3 7" strokeLinecap="round" />
      <path d="M200 120 269.3 160v80L200 280l-69.3-40v-80Z" stroke="#67E8F9" strokeOpacity=".55" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M200 160 234.6 180v40L200 240l-34.6-20v-40Z" fill="#22D3EE" fillOpacity=".08" stroke="#22D3EE" strokeOpacity=".7" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M165.4 180 200 200l34.6-20M200 200v40" stroke="#67E8F9" strokeOpacity=".7" strokeWidth="1.5" strokeLinejoin="round" />
      {[[200, 50, 4], [350, 200, 3], [94, 306, 3.5], [306, 94, 2.5], [92, 120, 2], [330, 300, 2.5]].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r * 3} fill="#22D3EE" fillOpacity=".12" />
          <circle cx={x} cy={y} r={r} fill="#A5F3FC" />
        </g>
      ))}
    </svg>
  )
}
