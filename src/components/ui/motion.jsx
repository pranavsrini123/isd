import { useEffect, useRef, useState } from 'react'
import { LazyMotion, MotionConfig, domAnimation, m, useInView, useReducedMotion } from 'motion/react'
import { usePortal } from './portal'

// Motion for the student portal and the public pages ("medium"): page entrances,
// staggered cards, count-ups and filling bars. The admin console gets none of it
// (only CSS hover/focus transitions), and prefers-reduced-motion turns it all off.
// Only the m component and the domAnimation feature set are loaded.

export const EASE_OUT = [0.16, 1, 0.3, 1]

export function MotionProvider({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.45, ease: EASE_OUT }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

/** True when decorative motion may play here: not the admin console, not reduced motion. */
export function useMotionOK() {
  const reduced = useReducedMotion()
  return usePortal() !== 'admin' && !reduced
}

/** Fades the page up on entry. Re-keyed per route by the shell. */
export function PageTransition({ children, className = 'min-w-0' }) {
  const ok = useMotionOK()
  if (!ok) return <div className={className}>{children}</div>
  return (
    <m.div className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}>
      {children}
    </m.div>
  )
}

const LIST = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } }
const ITEM = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } } }

/** Grid/list whose StaggerItem children enter one after another. */
export function Stagger({ as = 'div', className, children, ...rest }) {
  const ok = useMotionOK()
  if (!ok) { const As = as; return <As className={className} {...rest}>{children}</As> }
  const M = m[as]
  return <M className={className} variants={LIST} initial="hidden" animate="show" {...rest}>{children}</M>
}
export function StaggerItem({ as = 'div', className, children, ...rest }) {
  const ok = useMotionOK()
  className = className ? `min-w-0 ${className}` : 'min-w-0'
  if (!ok) { const As = as; return <As className={className} {...rest}>{children}</As> }
  const M = m[as]
  return <M className={className} variants={ITEM} {...rest}>{children}</M>
}

/** Fades content up once it scrolls into view. */
export function Reveal({ as = 'div', className, children, delay = 0, ...rest }) {
  const ok = useMotionOK()
  className = className ? `min-w-0 ${className}` : 'min-w-0'
  if (!ok) { const As = as; return <As className={className} {...rest}>{children}</As> }
  const M = m[as]
  return (
    <M className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }} transition={{ duration: 0.6, ease: EASE_OUT, delay }} {...rest}>
      {children}
    </M>
  )
}

const numFmt = new Intl.NumberFormat('en-IN')

/**
 * Counts up to `value` when it comes into view. Non-numeric values ('—') render as they are.
 * Formatted strings such as "1,234" are understood, so callers can pass formatNumber() output.
 */
export function CountUp({ value, format = (n) => numFmt.format(n), duration = 1100, className }) {
  const ok = useMotionOK()
  const target = typeof value === 'number' ? value
    : typeof value === 'string' && /^-?[\d,]+$/.test(value.trim()) ? Number(value.replace(/,/g, '')) : null
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const [shown, setShown] = useState(ok ? 0 : target)
  const from = useRef(0)

  useEffect(() => {
    if (target === null) return undefined
    if (!ok) { setShown(target); return undefined }
    if (!inView) return undefined
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const e = 1 - Math.pow(1 - t, 4)
      setShown(Math.round(a + (target - a) * e))
      if (t < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, inView, ok, duration])

  if (target === null) return <span className={className}>{value}</span>
  return <span ref={ref} className={className}>{format(shown ?? target)}</span>
}

export { m }
