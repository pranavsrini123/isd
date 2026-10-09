import { Link } from 'react-router-dom'

export function LogoMark({ size = 38 }) {
  return (
    <span className="inline-flex flex-none items-center justify-center rounded-[11px] bg-gradient-to-br from-cyan to-brand"
      style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="#06142E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" /><path d="M12 8v8M8 10v4M16 10v4" />
      </svg>
    </span>
  )
}

export function Logo({ to = '/', light = false, size = 38 }) {
  return (
    <Link to={to} className="inline-flex items-center gap-3 rounded-lg" aria-label="ISD Lab home">
      <LogoMark size={size} />
      <span className={`font-display text-[21px] font-bold ${light ? 'text-white' : 'text-ink'}`}>ISD Lab</span>
    </Link>
  )
}
