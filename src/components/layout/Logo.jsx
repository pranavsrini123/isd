import { useId } from 'react'
import { Link } from 'react-router-dom'

/** INVENTRA's small mark: a glowing hexagon holding an isometric component box. */
export function LogoMark({ size = 38 }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="flex-none drop-shadow-[0_0_10px_rgb(34_211_238/0.45)]" aria-hidden>
      <defs>
        <linearGradient id={`${id}f`} x1="6" y1="3" x2="34" y2="37" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#16244A" />
          <stop offset="1" stopColor="#070D1F" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="5" y1="4" x2="35" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#67E8F9" />
          <stop offset="0.55" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#4F7BFF" />
        </linearGradient>
      </defs>
      <path d="M20 2.6 35.1 11.3v17.4L20 37.4 4.9 28.7V11.3Z" fill={`url(#${id}f)`} stroke={`url(#${id}s)`} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M20 12.4 27 16.4v8L20 28.4 13 24.4v-8Z" fill="#22D3EE" fillOpacity=".12" stroke="#22D3EE" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 16.4 20 20.4 27 16.4M20 20.4v8" stroke="#67E8F9" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="20" cy="20.4" r="1.7" fill="#E6FBFF" />
    </svg>
  )
}

export function Logo({ to = '/', light = false, size = 38 }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 rounded-lg" aria-label="ISD Lab home">
      <LogoMark size={size} />
      <span className={`font-display text-[19px] font-semibold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>ISD Lab</span>
    </Link>
  )
}
