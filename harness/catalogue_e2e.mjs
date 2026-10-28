// End-to-end check of the project catalogue (0009 + load_catalogue.sql) in the real app.
// Usage: bash harness/run_catalogue.sh
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const req = createRequire('/opt/npm-tools/node_modules/')
const { chromium } = req('playwright')
const BASE = 'http://localhost:5199'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const SHOTS = path.join(ROOT, 'harness/out/catalogue-screens')
fs.rmSync(SHOTS, { recursive: true, force: true })
fs.mkdirSync(SHOTS, { recursive: true })
const PSQL = 'psql -h 127.0.0.1 -p 54329 -U postgres -d isdtest -X -q -At'
const sql = (s) => execSync(`${PSQL} -c "${s.replace(/"/g, '\\"')}"`).toString().trim()
const sqlFile = (f) => execSync(`${PSQL} -f ${f}`, { stdio: 'pipe' })

const results = []
const consoleErrors = []
let step = 0
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]) } catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]) }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

async function signup(email, pw, name) {
  await fetch(BASE + '/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw, data: { full_name: name } }) })
  await fetch(BASE + '/__confirm?email=' + email)
}
await signup('lab.admin@srmist.edu.in', 'Admin12345', 'Lab Admin')
sql("update public.profiles set role='super_admin' where email='lab.admin@srmist.edu.in'")
await signup('cat.student@srmist.edu.in', 'Student123', 'Catalogue Student')
sqlFile(path.join(ROOT, 'supabase/import/components_audit_2026-10-12/replace_inventory_with_audit.sql'))
sqlFile(path.join(ROOT, 'supabase/import/project_catalogue_2026-10/load_catalogue.sql'))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
const page = await ctx.newPage()
page.setDefaultTimeout(8000)
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.googleapis|net::ERR/.test(m.text())) consoleErrors.push(`${page.url()} :: ${m.text()}`) })
page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: PAGEERROR ${e.message}`))
const shot = async (name, full = true) => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: full }) }
const go = async (p) => { await page.goto(BASE + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400) }
const body = () => page.locator('body').innerText()
async function login(email, pw) {
  await go('/login')
  await page.getByLabel('SRM email').fill(email)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)
}
async function logout() {
  await go(new URL(page.url()).pathname.startsWith('/admin') ? '/admin' : '/student')
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await page.waitForURL('**/login')
}
/** Every <img> inside the project grid has loaded and is an SVG from /projects/. */
async function imagesOk() {
  await page.waitForTimeout(300)
  return page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('main img')]
    for (const i of imgs) { i.loading = 'eager'; if (!i.complete) await new Promise((r) => { i.onload = i.onerror = r }) }
    return imgs.map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, alt: i.alt }))
  })
}
const cardCount = () => page.locator('main a[aria-label$="View details"]').count()

await check('all 40 image files exist and are SVGs', async () => {
  const paths = sql("select string_agg(image_path, ' ') from projects where catalogue_key is not null").split(' ')
  expect(paths.length === 40, 'paths ' + paths.length)
  for (const p of paths) {
    const r = await fetch(BASE + p)
    const t = await r.text()
    expect(r.status === 200 && r.headers.get('content-type').includes('svg') && t.includes('<svg') && t.length > 2000, 'bad image ' + p)
  }
})

await login('cat.student@srmist.edu.in', 'Student123')

await check('student library: 40 projects, 12 per page, every card image loads with alt text', async () => {
  await go('/student/projects')
  const t = await body()
  expect(/40\s+projects/.test(t), 'count text missing')
  expect(!/Plant Monitor|Weather Station|Servo Radar/.test(t), 'old demo project visible')
  let seen = 0
  for (let pg = 1; pg <= 4; pg++) {
    await go(`/student/projects?page=${pg}`)
    const n = await cardCount()
    const imgs = await imagesOk()
    expect(imgs.length === n, `page ${pg}: ${imgs.length} images for ${n} cards`)
    for (const i of imgs) expect(i.ok && /^\/projects\/[a-z0-9-]+\.svg$/.test(i.src) && i.alt.length > 10, `image failed ${i.src}`)
    seen += n
    if (pg === 1) await shot('library')
  }
  expect(seen === 40, 'cards ' + seen)
})

await check('card shows category, difficulty, description, time, availability and details link', async () => {
  await go('/student/projects?search=Obstacle')
  const card = page.locator('main a[aria-label$="View details"]').first()
  const t = await card.innerText()
  for (const s of ['Robotics', 'Beginner', 'ultrasonic', '4–8 h', 'Available to build', 'View details', 'in stock']) expect(t.includes(s), 'missing ' + s)
})

await check('filters: category, difficulty, duration, availability and search', async () => {
  const count = async (q) => { await go('/student/projects?' + q); return cardCount() }
  expect(await count('category=Robotics') === 6, 'robotics')
  expect(await count('category=AI%20%26%20Advanced%20Systems') === 4, 'ai')
  const adv = Number(sql("select count(*) from projects where catalogue_key is not null and difficulty='advanced'"))
  expect(await count('difficulty=advanced') === Math.min(adv, 12), 'advanced')
  expect(await count('duration=xl') === 3, 'xl duration')
  expect(await count('availability=requires_verification') === 10, 'verification')
  expect(await count('availability=requires_external') === 10, 'external')
  expect(await count('search=drone') === 1, 'search')
  await go('/student/projects')
  await page.getByLabel('Availability', { exact: true }).selectOption('requires_external')
  await page.waitForTimeout(500)
  expect(await cardCount() === 10, 'select filter')
  await shot('filter-external', false)
})

await check('details page: large image and every section', async () => {
  await go('/student/projects?search=Obstacle')
  await page.locator('main a[aria-label$="View details"]').first().click()
  await page.waitForURL(/\/student\/projects\/[0-9a-f-]+$/)
  await page.getByRole('heading', { name: 'Obstacle-Avoiding Robot', level: 1 }).waitFor()
  const t = await body()
  for (const s of ['Objectives', 'Expected outcome', 'Required components', 'Prerequisites and skills', 'Hardware and software',
    'Implementation steps', 'Testing procedure', 'Safety notes', 'Extensions for advanced students', 'CAN I BUILD THIS NOW?',
    'Arduino Uno Smd Ch340', 'L298N Driver', 'Ultra Sonic Sensor', 'need 2', 'in stock']) expect(t.includes(s), 'missing ' + s + ' :: ' + page.url() + ' :: ' + t.slice(0, 300).replace(/\n/g, ' | '))
  const big = await page.evaluate(() => { const i = document.querySelector('main img'); return { w: i.getBoundingClientRect().width, ok: i.naturalWidth > 0, src: i.getAttribute('src') } })
  expect(big.ok && big.w > 600 && big.src === '/projects/obstacle-avoiding-robot.svg', 'hero image ' + JSON.stringify(big))
  await shot('details')
})

await check('details: request flow adds the project components to the request list', async () => {
  await page.getByRole('button', { name: /Request (available )?components/ }).click()
  await page.waitForURL('**/student/request')
  const t = await body()
  expect(t.includes('Ultra Sonic Sensor') && t.includes('L298N Driver') && t.includes('Obstacle-Avoiding Robot'), 'cart missing items')
})

await check('lab-use project: equipment marked "Use in lab" and request disabled', async () => {
  await go('/student/projects?search=Omnidirectional')
  await page.locator('main a[aria-label$="View details"]').first().click()
  await page.getByRole('heading', { name: 'Omnidirectional Robot', level: 1 }).waitFor()
  const t = await body()
  expect(t.includes('Use in lab') && t.includes('cannot be borrowed'), 'lab-use note missing')
  expect(await page.getByRole('button', { name: /Request/ }).isDisabled(), 'request should be disabled')
})

await check('external parts and verification notes are shown', async () => {
  await go('/student/projects?search=GSM')
  await page.locator('main a[aria-label$="View details"]').first().click()
  await page.getByRole('heading', { name: 'GSM-Based Alert System', level: 1 }).waitFor()
  expect((await body()).includes('Not stocked by the lab: Active SIM card'), 'external missing')
  await go('/student/projects?search=Drone')
  await page.locator('main a[aria-label$="View details"]').first().click()
  await page.getByRole('heading', { name: 'Drone Telemetry and Control', level: 1 }).waitFor()
  const t = await body()
  expect(t.includes('Check with the lab staff before starting') && t.includes('Requires compatibility verification'), 'verification missing')
})

await check('broken image falls back to an icon tile', async () => {
  const id = sql("select id from projects where catalogue_key = 'project-catalogue-2026-10:29'")
  sql(`update projects set image_path = '/projects/does-not-exist.svg' where id = '${id}'`)
  await go('/student/projects?search=Dice')
  await page.waitForTimeout(800)
  const imgs = await page.locator('main img').count()
  const tile = await page.locator('main a[aria-label$="View details"] div[aria-hidden]').count()
  sql(`update projects set image_path = '/projects/electronic-dice.svg' where id = '${id}'`)
  expect(imgs === 0 && tile >= 1, `imgs ${imgs} tiles ${tile}`)
})

for (const [w, h, name] of [[390, 844, 'mobile'], [820, 1180, 'tablet']]) {
  await check(`${name}: library and details fit without horizontal scrolling`, async () => {
    await page.setViewportSize({ width: w, height: h })
    await go('/student/projects')
    let o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    await shot(`library-${name}`, false)
    expect(o <= 1, 'library overflow ' + o)
    await page.locator('main a[aria-label$="View details"]').first().click()
    await page.waitForTimeout(800)
    o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    await shot(`details-${name}`, false)
    expect(o <= 1, 'details overflow ' + o)
  })
}
await page.setViewportSize({ width: 1440, height: 900 })

await logout()
await login('lab.admin@srmist.edu.in', 'Admin12345')

await check('admin list: availability column, archived old projects, shared-component panel', async () => {
  await go('/admin/projects')
  const t = await body()
  expect(/Published\s*40/.test(t) && /Archived\s*9/.test(t), 'tab counts')
  expect(t.includes('Available to build') && t.includes('Requires compatibility verification'), 'availability column')
  expect(t.includes('Components shared by several projects') && t.includes('Arduino Uno Smd Ch340'), 'demand panel')
  await shot('admin-projects')
})

await check('admin editor shows catalogue fields; clearing the verification note changes the status', async () => {
  const id = sql("select id from projects where catalogue_key = 'project-catalogue-2026-10:26'")
  await go(`/admin/projects/${id}`)
  await page.getByLabel('Compatibility check needed').waitFor()
  for (const l of ['Objectives', 'Expected outcome', 'Prerequisites and skills', 'Testing procedure', 'Safety notes', 'Not stocked by the lab', 'Image description (alt text)']) {
    expect(await page.getByLabel(l).count() === 1, 'missing field ' + l)
  }
  expect((await page.getByLabel('Testing procedure').inputValue()).includes('motor on and off'), 'testing not loaded')
  await shot('admin-editor')
  await page.getByLabel('Compatibility check needed').fill('')
  await page.getByRole('button', { name: /^Save/ }).first().click()
  await page.waitForTimeout(1200)
  expect(sql(`select coalesce(verification_note,'NULL') from projects where id='${id}'`) === 'NULL', 'note not cleared')
  expect(sql(`select availability_status from get_ranked_projects() where id='${id}'`) === 'available', 'status not available')
  expect(sql(`select cardinality(testing_steps) from projects where id='${id}'`) === '2', 'list fields lost on save')
})

await check('no console errors', async () => { expect(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ')) })

await browser.close()
for (const r of results) console.log(r.join('  '))
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
