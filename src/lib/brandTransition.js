// Landing → login "shared element" transition (FLIP, Web Animations API).
//
// 1. On GET STARTED the welcome page records where its brand elements are
//    (logo, wordmark, "by ISD Lab") and navigates.
// 2. The login page renders its own brand elements in their FINAL places, then
//    — before the browser paints — each one is moved back onto the recorded
//    start position with a transform and animated home along a curved path.
//
// Only one copy of each element exists at any time (the welcome page has
// already unmounted), nothing is cloned or screenshotted, and once the
// animations finish no inline styles remain, so the login page is exactly the
// normal page.

export const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const MAX_AGE_MS = 1500 // a recorded start older than this is ignored (e.g. back/refresh)
let pending = null

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Called by the welcome page. Stores viewport rects + computed colours of the brand elements. */
export function captureBrand(root) {
  const rects = {}
  for (const el of root.querySelectorAll('[data-brand]')) {
    const r = el.getBoundingClientRect()
    rects[el.dataset.brand] = { x: r.left, y: r.top, w: r.width, h: r.height, color: getComputedStyle(el).color }
  }
  pending = { rects, at: performance.now(), reduced: prefersReducedMotion() }
}

/** Recorded start, if fresh. Read during render (does not clear, so React StrictMode re-renders agree). */
export function peekBrand() {
  if (!pending || performance.now() - pending.at > MAX_AGE_MS) return null
  return pending
}
/** Forget the recorded start once the login page has used it (back/refresh then show the plain page). */
export function clearBrand() { pending = null }

// cubic-bezier(0.16, 1, 0.3, 1) evaluated numerically, so the curved path can be
// sampled into keyframes with the same feel as the CSS easing.
function bezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by
  const sx = (t) => ((ax * t + bx) * t + cx) * t
  const sy = (t) => ((ay * t + by) * t + cy) * t
  const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    let t = x
    for (let i = 0; i < 8; i++) { const d = sx(t) - x; const s = dsx(t); if (Math.abs(d) < 1e-6 || !s) break; t -= d / s }
    return sy(Math.min(1, Math.max(0, t)))
  }
}
export const easeOutExpo = bezier(0.16, 1, 0.3, 1)
// Path easing for travelling elements: starts from rest (no first-frame jump)
// and settles with the same long, soft tail as cubic-bezier(0.16, 1, 0.3, 1).
export const easeTravel = bezier(0.33, 0, 0.12, 1)

/**
 * Keyframes that carry an element from rect `from` to its own (current) rect
 * `to` along a gentle arc. `bend` (−1..1) sets how far the path bows, as a
 * fraction of the travel distance, perpendicular to the straight line.
 */
export function arcKeyframes(from, to, { bend = 0.18, steps = 40, scaleBy = 'w', extra } = {}) {
  // Uniform scale keeps text and logos undistorted; 'h' is used when the source
  // and destination text differ in length ("by ISD Lab" → "ISD Lab, SRMIST KTR").
  const sx = scaleBy === 'h' ? from.h / to.h : from.w / to.w
  const sy = sx
  const dx = from.x - to.x
  const dy = from.y - to.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len, ny = dx / len // unit normal
  const frames = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const e = easeTravel(t)
    const k = 1 - e // remaining share of the offset
    const arc = Math.sin(Math.PI * e) * bend * len
    const x = dx * k + nx * arc
    const y = dy * k + ny * arc
    const s = (a) => a + (1 - a) * e
    frames.push({
      offset: t,
      transformOrigin: '0 0',
      transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s(sx).toFixed(4)}, ${s(sy).toFixed(4)})`,
      ...(extra ? extra(e, t) : {}),
    })
  }
  return frames
}
