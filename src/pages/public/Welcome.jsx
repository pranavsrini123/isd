import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { IsdLabsLogo, Wordmark } from '../../components/brand/Brand'
import { captureBrand, prefersReducedMotion } from '../../lib/brandTransition'
import { useAuth } from '../../context/AuthContext'

/**
 * INVENTRA welcome screen. GET STARTED records where the brand elements are and
 * hands over to the login page, which animates those same elements into place.
 */
export default function Welcome() {
  const nav = useNavigate()
  const root = useRef(null)
  const { session, profile } = useAuth()
  const [leaving, setLeaving] = useState(false)

  function start(e) {
    if (leaving) return // ignore repeated clicks
    setLeaving(true)
    const home = session && profile ? (profile.role === 'admin' ? '/admin' : '/student') : null
    if (home) { nav(home); return }
    const btn = e.currentTarget
    const r = btn.getBoundingClientRect()
    btn.style.setProperty('--rx', `${(e.clientX || r.left + r.width / 2) - r.left}px`)
    btn.style.setProperty('--ry', `${(e.clientY || r.top + r.height / 2) - r.top}px`)
    captureBrand(root.current)
    // A short press response, then hand over. Brand elements have not moved yet,
    // so the recorded positions are exact.
    setTimeout(() => nav('/login', { state: { from: 'welcome' } }), prefersReducedMotion() ? 0 : 150)
  }

  return (
    <div ref={root} className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-navy px-6 text-white">
      <div className={`pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-3xl transition-opacity duration-300 ${leaving ? 'opacity-0' : ''}`} aria-hidden />
      <main className="relative flex flex-col items-center text-center">
        <IsdLabsLogo className="h-28 w-28 sm:h-36 sm:w-36" />
        <h1 className="mt-8 sm:mt-10">
          <Wordmark className="text-[2.9rem] sm:text-[5.5rem] lg:text-[7.5rem] text-white" />
        </h1>
        <p data-brand="org" className="mt-4 text-base font-medium tracking-[0.08em] text-side-text sm:text-lg">by ISD Lab</p>
        <button type="button" onClick={start} disabled={leaving} aria-busy={leaving || undefined}
          className={`welcome-cta group relative mt-12 inline-flex min-h-12 items-center gap-2 overflow-hidden rounded-full bg-cyan px-8 text-sm font-bold uppercase tracking-[0.18em] text-[#06142E] transition-[transform,box-shadow] duration-300 hover:shadow-[0_0_32px_rgba(34,211,238,.45)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan/40 disabled:cursor-default ${leaving ? 'is-pressed' : ''}`}>
          Get started <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
        </button>
      </main>
    </div>
  )
}
