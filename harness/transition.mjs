// Records and checks the welcome → login transition in a real browser.
// Usage: node harness/transition.mjs   (server.mjs on :5199, user t.student@srmist.edu.in / Student123)
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const req = createRequire('/opt/npm-tools/node_modules/')
const { chromium } = req('playwright')
const BASE = 'http://localhost:5199'
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out/transition')
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })

const results = []
const errors = []
const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, ok ? '' : detail])

const browser = await chromium.launch()
async function newPage(viewport, reduced = false) {
  const ctx = await browser.newContext({ viewport, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  const page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  page.on('pageerror', (e) => errors.push(`${viewport.width}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|fonts/.test(m.text())) errors.push(`${viewport.width}: ${m.text()}`) })
  return page
}
const brandRects = (page) => page.evaluate(() => {
  const out = {}
  for (const el of document.querySelectorAll('[data-brand]')) {
    const r = el.getBoundingClientRect()
    ;(out[el.dataset.brand] ||= []).push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), color: getComputedStyle(el).color })
  }
  return out
})

for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 834, height: 1112 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await newPage(viewport)
  await page.goto(BASE + '/'); await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUT}/${label}-00-welcome.png` })
  const start = await brandRects(page)
  check(`${label}: welcome shows logo, INVENTRA and "by ISD Lab"`, start.logo && start.wordmark && start.org && (await page.locator('[data-brand="org"]').innerText()) === 'by ISD Lab')

  // Sample brand positions on every animation frame inside the page (the SPA keeps
  // the window alive across the route change), then click GET STARTED twice quickly.
  await page.evaluate(() => {
    window.__s = []
    const t0 = performance.now()
    const tick = () => {
      const row = { t: performance.now() - t0, url: location.pathname, curtain: document.querySelectorAll('[data-curtain]').length }
      for (const el of document.querySelectorAll('[data-brand]')) {
        const r = el.getBoundingClientRect()
        ;(row[el.dataset.brand] ||= []).push({ x: r.left, y: r.top, w: r.width, h: r.height })
      }
      window.__s.push(row)
      if (row.t < 2800) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const btn = page.getByRole('button', { name: /get started/i })
  await btn.click()
  await btn.click({ force: true, timeout: 400 }).catch(() => {})
  await page.waitForTimeout(3000)
  const samples = await page.evaluate(() => window.__s)
  await page.screenshot({ path: `${OUT}/${label}-09-final.png` })
  const end = await brandRects(page)

  // Second pass, only for a visual film strip (screenshots disturb frame timing).
  {
    const p2 = await newPage(viewport)
    await p2.goto(BASE + '/'); await p2.waitForLoadState('networkidle')
    await p2.getByRole('button', { name: /get started/i }).click()
    const t0 = Date.now()
    let n = 1
    for (const ms of [120, 350, 600, 900, 1250, 1700]) {
      await p2.waitForTimeout(Math.max(0, ms - (Date.now() - t0)))
      await p2.screenshot({ path: `${OUT}/${label}-0${n++}-t${ms}.png` })
    }
    await p2.context().close()
  }

  check(`${label}: navigated to /login once`, page.url().endsWith('/login'), page.url())
  const onLogin = samples.filter((s) => s.url === '/login')
  check(`${label}: never more than one logo / wordmark / org on screen`,
    samples.every((s) => ['logo', 'wordmark', 'org'].every((k) => (s[k] || []).length <= 1)), 'duplicates seen')
  // Continuity: the wordmark's first position on the login page equals its welcome position
  const first = onLogin.find((s) => s.wordmark)
  const near = (a, b, tol) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol
  check(`${label}: wordmark starts exactly where it was on the welcome page`, first && near(first.wordmark[0], start.wordmark[0], 6),
    JSON.stringify({ start: start.wordmark[0], first: first?.wordmark[0] }))
  check(`${label}: logo starts where it was`, first && near(first.logo[0], start.logo[0], 6), JSON.stringify({ s: start.logo[0], f: first?.logo[0] }))
  check(`${label}: frames sampled during the transition`, onLogin.length > 40, String(onLogin.length))
  // Smoothness: per-frame movement (normalised to 60 fps) never exceeds 6% of the total travel,
  // so nothing visibly jumps — including the very first frame after the route change.
  for (const k of ['logo', 'wordmark', 'org']) {
    const rows = onLogin.filter((s) => s[k])
    const pts = rows.map((s) => s[k][0])
    const total = Math.hypot(pts[0].x - pts.at(-1).x, pts[0].y - pts.at(-1).y) || 1
    let maxJump = 0, at = 0, dtAt = 0
    for (let i = 1; i < pts.length; i++) {
      const dt = Math.max(1, rows[i].t - rows[i - 1].t)
      const v = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * (16.7 / dt)
      if (v > maxJump) { maxJump = v; at = rows[i].t; dtAt = dt }
    }
    const frameMs = rows.slice(1).map((r, i) => r.t - rows[i].t)
    check(`${label}: ${k} moves smoothly (max ${maxJump.toFixed(1)}px per frame of ${Math.round(total)}px travel; longest frame ${Math.round(Math.max(...frameMs))}ms)`, maxJump / total < 0.06, `at t=${Math.round(at)}ms dt=${Math.round(dtAt)}ms`)
    // curved path: some sample deviates from the straight line
    const a = pts[0], b = pts.at(-1)
    const dev = Math.max(...pts.map((p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / total))
    if (k !== 'org') check(`${label}: ${k} follows a curved path (max ${Math.round(dev)}px off the straight line)`, dev > 8, String(dev))
  }
  // Wordmark ends cyan, crisp (no transform), and nothing is left over.
  const final = await page.evaluate(() => ({
    anims: document.getAnimations().length,
    curtain: document.querySelectorAll('[data-curtain],[data-sweep]').length,
    inline: [...document.querySelectorAll('[data-brand], [data-stagger] *')].filter((e) => e.style.transform || e.style.opacity || e.style.filter).length,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    wordmarkColor: getComputedStyle(document.querySelector('[data-brand="wordmark"]')).color,
    wordmarkTransform: getComputedStyle(document.querySelector('[data-brand="wordmark"]')).transform,
    org: document.querySelector('[data-brand="org"]').innerText,
    orgPrefix: document.querySelectorAll('[data-brand="org"] .org-prefix').length,
  }))
  check(`${label}: animations finished and removed, no curtain left`, final.anims === 0 && final.curtain === 0 && final.inline === 0, JSON.stringify(final))
  check(`${label}: INVENTRA is cyan and untransformed at rest`, final.wordmarkColor === 'rgb(34, 211, 238)' && final.wordmarkTransform === 'none', JSON.stringify(final))
  check(`${label}: header reads "ISD Lab, SRMIST KTR"`, final.org === 'ISD Lab, SRMIST KTR' && final.orgPrefix === 0, JSON.stringify(final))
  check(`${label}: no horizontal overflow`, final.overflowX <= 1, String(final.overflowX))
  // Final position equals the layout position (compare with a fresh load of /login).
  const fresh = await newPage(viewport)
  await fresh.goto(BASE + '/login'); await fresh.waitForLoadState('networkidle'); await fresh.waitForTimeout(300)
  const ref = await brandRects(fresh)
  check(`${label}: settles exactly into the normal login layout`, ['logo', 'wordmark', 'org'].every((k) => near(end[k][0], ref[k][0], 1)), JSON.stringify({ end, ref }))
  const freshAnims = await fresh.evaluate(() => document.getAnimations().length + document.querySelectorAll('[data-curtain]').length)
  check(`${label}: opening /login directly (refresh/bookmark) plays no intro`, freshAnims === 0, String(freshAnims))
  await fresh.context().close()
  // In-view check: brand elements stayed within the viewport (allowing the wordmark's own size)
  const out = samples.flatMap((s) => ['logo', 'wordmark', 'org'].map((k) => s[k]?.[0]).filter(Boolean))
    .filter((r) => r.x < -40 || r.y < -40 || r.x + r.w > viewport.width + 40 || r.y + r.h > viewport.height + 40)
  check(`${label}: brand elements stay inside the viewport`, out.length === 0, JSON.stringify(out.slice(0, 3)))

  // The form is the real, working login form.
  if (label === 'desktop') {
    await page.getByRole('button', { name: 'Sign in' }).click()
    check('desktop: validation still works', (await page.locator('body').innerText()).includes('Enter a valid email address.'))
    await page.getByLabel('SRM email').fill('t.student@srmist.edu.in')
    await page.locator('input[type=password]').fill('Student123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/student', { timeout: 8000 }).catch(() => {})
    check('desktop: sign-in submits and lands on the student dashboard', page.url().endsWith('/student'), page.url())
    await page.goBack(); await page.waitForTimeout(500)
  }
  if (label === 'tablet') {
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    check('tablet: forgot-password link works', page.url().endsWith('/forgot-password'))
    await page.goBack(); await page.waitForTimeout(300)
    await page.getByRole('link', { name: 'Create an account' }).click()
    check('tablet: create-account link works', page.url().endsWith('/register'))
    await page.goBack(); await page.goBack(); await page.waitForTimeout(500)
    check('tablet: browser Back returns to the welcome page', page.url() === BASE + '/' && (await page.locator('[data-brand="org"]').innerText()) === 'by ISD Lab', page.url())
  }
  await page.context().close()
}

// Reduced motion: no travel, quick fade, same destination.
{
  const page = await newPage({ width: 1440, height: 900 }, true)
  await page.goto(BASE + '/'); await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /get started/i }).click()
  await page.waitForURL('**/login')
  await page.getByText('ISD Lab, SRMIST KTR').waitFor()
  const a = await brandRects(page)
  await page.waitForTimeout(400)
  const b = await brandRects(page)
  const st = await page.evaluate(() => ({ anims: document.getAnimations().length, curtain: document.querySelectorAll('[data-curtain]').length }))
  check('reduced motion: brand elements are already in their final place (no travel)', ['logo', 'wordmark', 'org'].every((k) => a[k][0].x === b[k][0].x && a[k][0].y === b[k][0].y), JSON.stringify({ a, b }))
  check('reduced motion: no curtain, animations done within 400ms', st.anims === 0 && st.curtain === 0, JSON.stringify(st))
  await page.getByLabel('SRM email').fill('t.student@srmist.edu.in')
  check('reduced motion: login form usable', (await page.getByLabel('SRM email').inputValue()) === 't.student@srmist.edu.in')
  await page.screenshot({ path: `${OUT}/reduced-final.png` })
  await page.context().close()
}

await browser.close()
for (const r of results) console.log(r.filter(Boolean).join('  '))
console.log(`\n${results.filter((r) => r[0] === 'PASS').length} passed, ${results.filter((r) => r[0] === 'FAIL').length} failed`)
if (errors.length) { console.log('Errors:'); [...new Set(errors)].forEach((e) => console.log(' -', e)) }
process.exit(results.some((r) => r[0] === 'FAIL') || errors.length ? 1 : 0)
