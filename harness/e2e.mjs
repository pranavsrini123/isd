// End-to-end run of the real app (src/) against the real database through the harness.
// Usage: node harness/e2e.mjs   (expects server.mjs running on :5199 and a freshly seeded DB)
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const req = createRequire('/opt/npm-tools/node_modules/')
const { chromium } = req('playwright')
const BASE = 'http://localhost:5199'
const SHOTS = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out/screens')
fs.mkdirSync(SHOTS, { recursive: true })
const sql = (s) => execSync(`psql -h 127.0.0.1 -p 54329 -U postgres -d isdtest -X -q -At -c "${s.replace(/"/g, '\\"')}"`).toString().trim()

const results = []
const consoleErrors = []
let step = 0
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]) } catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]) }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
const page = await ctx.newPage()
page.setDefaultTimeout(8000)
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.googleapis|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|net::ERR/.test(m.text())) consoleErrors.push(`${page.url()} :: ${m.text()}`) })
page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: PAGEERROR ${e.message}`))
const shot = async (name, full = true) => { await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: full }) }
const go = async (p) => { await page.goto(BASE + p); await page.waitForLoadState('networkidle') }
const shelfHits = new Set()
const text = async () => {
  const t = await page.locator('body').innerText()
  if (/shelf/i.test(t)) shelfHits.add(new URL(page.url()).pathname)
  return t
}

// Calls a database function as a given user through the harness API (same path the app uses).
async function rpcAs(uid, fn, args) {
  const r = await fetch(BASE + '/rpc', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + uid }, body: JSON.stringify({ fn, args }) })
  const j = await r.json()
  if (j.error) throw new Error(`${fn}: ${j.error.message}`)
  return j.data
}
const uidOf = (email) => sql(`select id from public.profiles where email = '${email}'`)
const ymd = (d) => d.toISOString().slice(0, 10)
const labToday = () => sql('select public.lab_today()')

async function login(email, pw) {
  await go('/login')
  await page.getByLabel('SRM email').fill(email)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
}
async function logout() {
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await page.waitForURL('**/login')
}

// --- admin bootstrap (documented SQL step) ---------------------------------
await fetch(BASE + '/auth/signup', { method: 'POST', body: JSON.stringify({ email: 'lab.admin@srmist.edu.in', password: 'Admin12345', data: { full_name: 'Lab Admin' } }), headers: { 'content-type': 'application/json' } })
await fetch(BASE + '/__confirm?email=lab.admin@srmist.edu.in')
sql("update public.profiles set role='admin' where email='lab.admin@srmist.edu.in'")

// 30 extra items so the student inventory needs more than one batch (24).
sql("insert into public.inventory_items (name, category_id, total_qty, available_qty, is_demo) select 'Extra Part '||lpad(g::text, 2, '0'), (select id from public.inventory_categories where name = 'Prototyping'), 5, 5, true from generate_series(1, 30) g")

// --- public -----------------------------------------------------------------
await check('landing renders', async () => { await go('/'); expect((await text()).includes('What can I build?'), 'hero missing'); await shot('landing') })
await check('register rejects non-SRM email', async () => {
  await go('/register')
  await page.getByLabel('Full name').fill('Test Outsider')
  await page.getByLabel('SRM email').fill('someone@gmail.com')
  await page.locator('input[autocomplete="new-password"]').first().fill('Student123')
  await page.getByLabel('Confirm password').fill('Student123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForTimeout(300)
  expect((await text()).includes('Use your institutional email'), 'no domain error')
  await shot('register-domain-error', false)
})
await check('register student → verify email page', async () => {
  await page.getByLabel('SRM email').fill('demo.student@srmist.edu.in')
  await page.getByLabel('Register number').fill('RA2311003010001')
  await page.getByLabel('Full name').fill('Demo Student')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('**/verify-email')
  await page.getByText('Check your inbox').waitFor()
  await shot('verify-email', false)
})
await check('unverified login is refused', async () => {
  await login('demo.student@srmist.edu.in', 'Student123')
  expect((await text()).includes('verify your email'), 'expected verify message')
})
await check('profile created as student by trigger', async () => {
  expect(sql("select role from public.profiles where email='demo.student@srmist.edu.in'") === 'student', 'not student')
})
await fetch(BASE + '/__confirm?email=demo.student@srmist.edu.in')
await check('wrong password shows friendly error', async () => {
  await login('demo.student@srmist.edu.in', 'nope-nope1')
  expect((await text()).includes('Incorrect email or password'), 'no error')
})

// --- student ----------------------------------------------------------------
await check('student login → dashboard', async () => {
  await login('demo.student@srmist.edu.in', 'Student123')
  await page.waitForURL('**/student')
  const t = (await text()).toLowerCase()
  expect(t.includes('recommended projects for you'), 'dashboard missing')
  expect(t.includes('projects ready to build'), 'stat missing')
  await shot('student-dashboard')
})
await check('dashboard: no next-build banner, no quick actions', async () => {
  const t = (await text()).toLowerCase()
  expect(!t.includes('your next build') && !t.includes('see what you can build'), 'banner still present')
  expect(!t.includes('quick actions') && !t.includes('browse inventory'), 'quick actions still present')
  expect(t.includes('recommended projects for you') && t.includes('available components'), 'dashboard content missing')
})
await check('student cannot open admin console', async () => {
  await go('/admin/inventory')
  expect((await text()).includes('Administrators only'), 'admin page leaked')
})
await check('inventory: search + filter + item modal', async () => {
  await go('/student/inventory')
  expect((await text()).includes('Arduino Uno R3'), 'no items')
  await shot('student-inventory')
  await page.getByRole('searchbox').fill('l298')
  await page.waitForTimeout(900)
  const t = await text()
  expect(t.includes('L298N Motor Driver') && !t.includes('Arduino Uno R3'), 'search failed')
  expect(t.includes('Out of stock'), 'stock badge missing')
  await page.getByRole('searchbox').fill('')
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'View Arduino Uno R3' }).click()
  await page.waitForTimeout(500)
  expect((await page.getByRole('dialog').innerText()).toLowerCase().includes('used in projects'), 'modal missing')
  await shot('student-item-modal', false)
  await page.getByRole('button', { name: 'Close' }).click()
})
await check('inventory: one continuous scroll, no pagination, no duplicates', async () => {
  await go('/student/inventory')
  const total = Number(sql('select count(*) from public.inventory_items where not is_archived'))
  expect(total > 24, 'need more than one batch')
  expect(await page.getByRole('button', { name: /^(Previous|Next)$/ }).count() === 0, 'pagination buttons present')
  for (let i = 0; i < 15 && !(await text()).includes('reached the end'); i++) {
    await page.mouse.wheel(0, 4000)
    await page.waitForTimeout(500)
  }
  const names = await page.getByRole('button', { name: /^View / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  expect(names.length === total, `showed ${names.length} of ${total}`)
  expect(new Set(names).size === names.length, 'duplicate cards')
  expect((await text()).includes('reached the end of the inventory'), 'no end marker')
  await shot('student-inventory-scrolled', false)
  // filters still work and reset the list
  await page.getByLabel('Category').selectOption({ label: 'Sensors' })
  await page.waitForTimeout(900)
  const sensors = Number(sql("select count(*) from public.inventory_items i join public.inventory_categories c on c.id = i.category_id where c.name = 'Sensors' and not i.is_archived"))
  expect(await page.getByRole('button', { name: /^View / }).count() === sensors, 'category filter count wrong')
})
await check('toggle: knob stays inside the track in both states (desktop + mobile)', async () => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await go('/student/projects')
    const sw = page.getByRole('switch').first()
    const geom = () => sw.evaluate((b) => {
      const track = b.querySelector('span'); const knob = track.querySelector('span')
      const t = track.getBoundingClientRect(); const k = knob.getBoundingClientRect()
      return { t: [t.left, t.right, t.top, t.bottom], k: [k.left, k.right, k.top, k.bottom], on: b.getAttribute('aria-checked') }
    })
    const inside = (g) => g.k[0] >= g.t[0] && g.k[1] <= g.t[1] && g.k[2] >= g.t[2] && g.k[3] <= g.t[3]
    const off = await geom()
    expect(off.on === 'false' && inside(off) && Math.abs(off.k[0] - off.t[0] - 2) < 1, `off state wrong ${JSON.stringify(off)}`)
    await sw.click(); await page.waitForTimeout(400)
    const on = await geom()
    expect(on.on === 'true' && inside(on) && Math.abs(on.t[1] - on.k[1] - 2) < 1, `on state wrong ${JSON.stringify(on)}`)
    expect(page.url().includes('buildable=1'), 'state not applied')
    if (width === 390) await shot('toggle-mobile-on', false)
    await sw.click(); await page.waitForTimeout(400)
    expect(inside(await geom()), 'off again wrong')
  }
  await page.setViewportSize({ width: 1440, height: 900 })
})
await check('project library ranks buildable first', async () => {
  await go('/student/projects')
  const cards = await page.locator('h3').allInnerTexts()
  expect(cards.length >= 8, `only ${cards.length} projects`)
  const t = await text()
  expect(t.indexOf('Weather Station') < t.indexOf('Obstacle Avoiding Robot'), 'ranking wrong')
  await shot('student-projects')
  await page.getByText('Only show projects I can build now').click()
  await page.waitForTimeout(600)
  expect(!(await text()).includes('Obstacle Avoiding Robot'), 'buildable filter failed')
})
await check('project details shows 80% and missing L298N', async () => {
  await go('/student/projects')
  await page.getByRole('link', { name: /Obstacle Avoiding Robot/ }).click()
  await page.waitForTimeout(800)
  const t = await text()
  expect(t.includes('80%') && t.includes('L298N Motor Driver') && t.includes('Short by 1'), 'readiness wrong')
  await shot('student-project-details')
})
await check('request flow from buildable project', async () => {
  await go('/student/projects')
  await page.getByRole('link', { name: /Weather Station/ }).click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Request all components' }).click()
  await page.waitForURL('**/student/request')
  await page.waitForTimeout(700)
  expect((await text()).includes('Pre-filled from Weather Station'), 'not prefilled')
  await shot('student-new-request')
  const before = sql("select available_qty from inventory_items where name='DHT11 Temperature & Humidity Sensor'")
  await page.getByRole('button', { name: 'Submit request' }).click()
  await page.waitForURL('**/student/requests**')
  await page.waitForTimeout(700)
  expect((await text()).includes('REQ-'), 'request not listed')
  expect(sql("select available_qty from inventory_items where name='DHT11 Temperature & Humidity Sensor'") === before, 'pending request changed stock!')
  await shot('student-my-requests')
})
await check('add components end-to-end: add A and B, +A, −B, remove one, submit, saved exactly', async () => {
  await go('/student/request')
  await page.getByRole('button', { name: 'Add components' }).click()
  const dlg = page.getByRole('dialog')
  const find = async (q) => { await dlg.getByRole('searchbox').fill(q); await page.waitForTimeout(800) }
  await find('servo')
  await dlg.getByRole('button', { name: 'Add SG90 Micro Servo' }).click()                       // A
  expect(await dlg.getByText('Added', { exact: true }).count() === 0, '"Added" badge still shown')
  expect(await dlg.getByLabel('SG90 Micro Servo quantity', { exact: true }).inputValue() === '1', 'A not at 1')
  expect(await dlg.getByRole('button', { name: 'Decrease SG90 Micro Servo quantity' }).isDisabled(), 'minus must be disabled at 1')
  await find('dht11')
  await dlg.getByRole('button', { name: /^Add DHT11/ }).click()                                   // B
  await find('breadboard')
  await dlg.getByRole('button', { name: 'Add 830-point Breadboard' }).click()                    // C (to remove later)
  // out-of-stock items: hidden by default, disabled with an explanation when shown
  await find('l298n')
  expect((await dlg.innerText()).includes('No components found in stock'), 'out-of-stock not hidden')
  await dlg.getByRole('switch').click(); await page.waitForTimeout(800)
  expect(await dlg.getByRole('button', { name: 'L298N Motor Driver is out of stock' }).isDisabled(), 'out-of-stock not disabled')
  expect((await dlg.innerText()).includes('Out of stock — cannot be requested right now'), 'no explanation')
  await dlg.getByRole('switch').click(); await page.waitForTimeout(500)
  await shot('student-add-components', false)
  await dlg.getByRole('button', { name: /^Done/ }).click()

  const val = (n) => page.getByLabel(`${n} quantity`, { exact: true }).inputValue()
  const summary = async () => [await page.locator('dt:has-text("Component types") + dd').innerText(), await page.locator('dt:has-text("Total units") + dd').innerText()]
  expect(JSON.stringify(await summary()) === '["3","3"]', 'summary after adding 3: ' + JSON.stringify(await summary()))
  await page.getByRole('button', { name: 'Increase SG90 Micro Servo quantity' }).click()          // +A → 2
  await page.getByRole('button', { name: 'Increase SG90 Micro Servo quantity' }).click()          // +A → 3
  await page.getByRole('button', { name: /^Increase DHT11/ }).click()                            // B → 2
  await page.getByRole('button', { name: /^Decrease DHT11/ }).click()                            // −B → 1
  expect(await val('SG90 Micro Servo') === '3', 'A not 3')
  expect(await page.getByLabel(/^DHT11.*quantity$/).inputValue() === '1', 'B not 1')
  // adding A again from the picker must not create a second row
  await page.getByRole('button', { name: 'Add another component' }).click()
  await find('servo')
  expect(await dlg.getByRole('button', { name: 'Add SG90 Micro Servo' }).count() === 0, 'duplicate add possible')
  await dlg.getByRole('button', { name: /^Done/ }).click()
  expect(await page.getByLabel('SG90 Micro Servo quantity', { exact: true }).count() === 1, 'duplicate row')
  await page.getByRole('button', { name: 'Remove 830-point Breadboard' }).click()                 // remove C
  expect(JSON.stringify(await summary()) === '["2","4"]', 'summary after edits: ' + JSON.stringify(await summary()))
  await page.getByLabel('Project or purpose').fill('Servo and sensor test rig')
  await shot('student-request-multi', false)
  await page.getByRole('button', { name: 'Submit request' }).click()
  await page.waitForURL('**/student/requests**')
  const saved = sql("select string_agg(i.name || '=' || ri.qty, ';' order by i.name) from public.request_items ri join public.inventory_items i on i.id = ri.item_id join public.borrow_requests r on r.id = ri.request_id where r.purpose = 'Servo and sensor test rig'")
  expect(saved === 'DHT11 Temperature & Humidity Sensor=1;SG90 Micro Servo=3', 'saved request: ' + saved)
})
await check('my requests: no Cancelled tab, no Latest Request timeline (also after refresh / new request)', async () => {
  await go('/student/requests')
  const tabs = await page.getByRole('tab').allInnerTexts()
  const names = tabs.map((t) => t.replace(/\d+/g, '').trim())
  expect(JSON.stringify(names) === JSON.stringify(['All', 'Pending', 'Approved', 'Issued', 'Returned', 'Rejected', 'On loan']), 'tabs: ' + JSON.stringify(names))
  for (let i = 0; i < 2; i++) {
    const t = (await text()).toLowerCase()
    expect(!t.includes('latest request') && !t.includes('admin review'), 'timeline present (pass ' + i + ')')
    await page.reload(); await page.waitForTimeout(900)
  }
  // each component is its own row inside the request card
  const card = page.locator('[data-request]').first()
  expect(await card.locator('li').count() >= 2, 'components not listed individually')
  await shot('student-my-requests-list')
})
await check('request over stock is refused by DB with clear message', async () => {
  await go('/student/inventory?search=nrf24')
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'View NRF24L01 Radio Module' }).click()
  await page.getByRole('button', { name: 'Add to request' }).click()
  // force the quantity above stock through the API layer to prove the DB check
  const r = await page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem('harness.session'))
    const id = (await (await fetch('/rest', { method: 'POST', headers: { authorization: 'Bearer ' + s.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ table: 'inventory_items', op: 'select', select: 'id', filters: [{ op: 'eq', col: 'name', val: 'NRF24L01 Radio Module' }], or: [], order: [] }) })).json()).data[0].id
    const today = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    return (await fetch('/rpc', { method: 'POST', headers: { authorization: 'Bearer ' + s.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ fn: 'create_borrow_request', args: { p_project_id: null, p_purpose: 'too many', p_note: null, p_needed_from: today, p_needed_until: today, p_items: [{ item_id: id, qty: 50 }] } }) })).json()
  })
  expect(r.error && /Only 1/.test(r.error.message), 'DB did not refuse: ' + JSON.stringify(r))
})
await check('student cannot approve own request via API', async () => {
  const r = await page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem('harness.session'))
    return (await fetch('/rpc', { method: 'POST', headers: { authorization: 'Bearer ' + s.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ fn: 'approve_request', args: { p_request_id: '00000000-0000-0000-0000-000000000000' } }) })).json()
  })
  expect(r.error && /Administrator/.test(r.error.message), 'not refused')
})
await check('student cannot edit stock via table API', async () => {
  const r = await page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem('harness.session'))
    return (await fetch('/rest', { method: 'POST', headers: { authorization: 'Bearer ' + s.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ table: 'inventory_items', op: 'update', body: { available_qty: 999 }, filters: [{ op: 'eq', col: 'name', val: 'Piezo Buzzer' }], or: [], order: [], returning: '*' }) })).json()
  })
  expect(!r.error && r.data.length === 0, 'update should affect 0 rows: ' + JSON.stringify(r).slice(0, 200))
  expect(sql("select available_qty from inventory_items where name='Piezo Buzzer'") === '20', 'stock changed')
})
await check('profile preferences save', async () => {
  await go('/student/profile')
  await page.getByLabel('Preferred difficulty').selectOption('intermediate')
  await page.getByRole('button', { name: 'Robotics' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.waitForTimeout(700)
  expect(sql("select preferred_difficulty from profiles where email='demo.student@srmist.edu.in'") === 'intermediate', 'not saved')
  await shot('student-profile', false)
})
await check('student signs out', async () => { await logout() })

// --- admin ------------------------------------------------------------------
await check('admin login → dashboard with live stats', async () => {
  await login('lab.admin@srmist.edu.in', 'Admin12345')
  await page.waitForURL('**/admin')
  await page.waitForTimeout(800)
  const t = await text()
  expect(t.toLowerCase().includes('pending requests') && t.includes('Lab overview'), 'dashboard missing')
  const total = sql('select sum(total_qty) from inventory_items where not is_archived')
  expect(t.includes(Number(total).toLocaleString('en-IN')), `total units ${total} not shown`)
  await shot('admin-dashboard')
})
await check('admin approves request (stock reserved)', async () => {
  await go('/admin/requests')
  await page.waitForTimeout(600)
  await shot('admin-requests')
  const before = sql("select available_qty||'/'||reserved_qty from inventory_items where name='DHT11 Temperature & Humidity Sensor'")
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await page.waitForTimeout(1000)
  const after = sql("select available_qty||'/'||reserved_qty from inventory_items where name='DHT11 Temperature & Humidity Sensor'")
  const [a0, r0] = before.split('/').map(Number); const [a1, r1] = after.split('/').map(Number)
  expect(a1 === a0 - 1 && r1 === r0 + 1, `stock ${before} → ${after}`)
})
await check('admin issues approved request', async () => {
  await go('/admin/issuance')
  await page.getByRole('tab', { name: /Ready to issue/ }).click()
  await page.getByRole('button', { name: 'Issue' }).first().click()
  await page.getByRole('button', { name: 'Confirm issue' }).click()
  await page.waitForTimeout(1000)
  expect(sql("select count(*) from borrowings") === '1', 'no borrowing')
  expect(sql("select reserved_qty from inventory_items where name='DHT11 Temperature & Humidity Sensor'") === '0', 'reserved not moved')
})
await check('admin verifies return with damaged + missing', async () => {
  await page.getByRole('tab', { name: /On loan/ }).click()
  await page.waitForTimeout(500)
  await shot('admin-loans')
  const before = sql("select available_qty||'/'||damaged_qty||'/'||lost_qty||'/'||borrowed_qty from inventory_items where name='830-point Breadboard'")
  const verifyButtons = page.getByRole('button', { name: 'Verify return' })
  const n = await verifyButtons.count()
  let done = false
  for (let i = 0; i < n && !done; i++) {
    await verifyButtons.nth(i).click()
    const title = await page.getByRole('dialog').locator('h2').innerText()
    if (title.includes('830-point Breadboard')) {
      await page.getByRole('button', { name: 'Increase Returned damaged' }).click()
      await page.getByRole('button', { name: 'Decrease Returned in good condition' }).click()
      await page.getByLabel('Notes').fill('Cracked rail')
      await shot('admin-verify-modal', false)
      await page.getByRole('button', { name: 'Confirm verification' }).click()
      await page.waitForTimeout(900)
      done = true
    } else await page.getByRole('button', { name: 'Cancel' }).click()
  }
  expect(done, 'breadboard line not found')
  const after = sql("select available_qty||'/'||damaged_qty||'/'||lost_qty||'/'||borrowed_qty from inventory_items where name='830-point Breadboard'")
  const [a0, d0, l0, b0] = before.split('/').map(Number); const [a1, d1, l1, b1] = after.split('/').map(Number)
  expect(a1 === a0 && d1 === d0 + 1 && l1 === l0 && b1 === b0 - 1, `breadboard ${before} → ${after}`)
})
await check('verify the rest; borrowing closes; request returned', async () => {
  while (await page.getByRole('button', { name: 'Verify return' }).count()) {
    await page.getByRole('button', { name: 'Verify return' }).first().click()
    await page.getByRole('button', { name: 'Confirm verification' }).click()
    await page.waitForTimeout(800)
  }
  expect(sql("select status from borrow_requests order by created_at limit 1") === 'returned', 'not returned')
  expect(sql('select count(*) from inventory_items where total_qty<>available_qty+reserved_qty+borrowed_qty+damaged_qty+lost_qty') === '0', 'invariant broken')
})
await check('admin inventory: add item, adjust stock, history', async () => {
  await go('/admin/inventory')
  await shot('admin-inventory')
  await page.getByRole('button', { name: 'Add item' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Name').fill('Demo Logic Analyzer')
  await dlg.getByLabel('Initial quantity').fill('4')
  await dlg.getByLabel('Storage location').fill('Rack H1')
  await dlg.getByRole('button', { name: 'Add item' }).click()
  await page.waitForTimeout(900)
  expect(sql("select available_qty from inventory_items where name='Demo Logic Analyzer'") === '4', 'item not created')
  await page.getByRole('searchbox').fill('Logic Analyzer')
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Adjust stock for Demo Logic Analyzer' }).click()
  await page.getByLabel('Action').selectOption('mark_damaged')
  await page.getByLabel('Quantity').fill('1')
  await page.getByLabel('Reason').fill('Probe snapped')
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.waitForTimeout(900)
  expect(sql("select available_qty||'/'||damaged_qty from inventory_items where name='Demo Logic Analyzer'") === '3/1', 'adjust failed')
  await page.getByRole('button', { name: 'History for Demo Logic Analyzer' }).click()
  await page.waitForTimeout(700)
  expect((await page.getByRole('dialog').innerText()).includes('Probe snapped'), 'history missing reason')
  await shot('admin-item-history', false)
  await page.getByRole('button', { name: 'Close' }).click()
})
await check('admin project editor: create, add component, publish', async () => {
  await go('/admin/projects')
  await shot('admin-projects')
  await go('/admin/projects/new')
  await page.getByLabel('Name').fill('Demo Logic Probe Kit')
  await page.getByLabel('Category').fill('Tools')
  await page.getByRole('button', { name: 'Add component' }).click()
  await page.getByRole('dialog').getByRole('searchbox').fill('Logic')
  await page.waitForTimeout(800)
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).first().click()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: /Save & publish/ }).click()
  await page.waitForTimeout(1200)
  expect(sql("select status from projects where name='Demo Logic Probe Kit'") === 'published', 'not published')
  await shot('admin-project-editor')
})
await check('admin users page + role change confirm', async () => {
  await go('/admin/users')
  expect((await text()).includes('Demo Student'), 'student missing')
  await shot('admin-users')
})
await check('reports + activity + settings render', async () => {
  await go('/admin/reports'); await page.waitForTimeout(900)
  expect((await text()).includes('Most borrowed components'), 'reports missing'); await shot('admin-reports')
  await go('/admin/activity'); await page.waitForTimeout(600)
  const t = await text()
  expect(t.includes('Approved request') && t.includes('Lab Admin'), 'activity missing'); await shot('admin-activity')
  await go('/admin/settings'); await page.waitForTimeout(600)
  expect((await text()).includes('srmist.edu.in'), 'settings missing'); await shot('admin-settings', false)
})
// ---- status → action mapping on My requests, with real data in every state ----
const STU = 'demo.student@srmist.edu.in'
let ids = {}
await check('setup: requests in every status (pending, approved, issued, rejected)', async () => {
  const s = uidOf(STU), a = uidOf('lab.admin@srmist.edu.in')
  const item = (n) => sql(`select id from public.inventory_items where name = '${n}'`)
  const today = labToday()
  const until = sql(`select (public.lab_today() + 3)::text`)
  const mk = (purpose, name, qty = 1) => rpcAs(s, 'create_borrow_request', { p_project_id: null, p_purpose: purpose, p_note: null, p_needed_from: today, p_needed_until: until, p_items: [{ item_id: item(name), qty }] })
  ids.approved = await mk('Approved state', 'HC-05 Bluetooth Module')
  ids.issued = await mk('Issued state', 'Soil Moisture Sensor', 2)
  ids.rejected = await mk('Rejected state', 'MPU6050 Accelerometer/Gyro', 2)
  await rpcAs(a, 'approve_request', { p_request_id: ids.approved })
  await rpcAs(a, 'approve_request', { p_request_id: ids.issued })
  await rpcAs(a, 'issue_request', { p_request_id: ids.issued, p_due_date: until })
  await rpcAs(a, 'reject_request', { p_request_id: ids.rejected, p_reason: 'Out of stock at review' })
  for (const k of Object.keys(ids)) ids[k] = sql(`select request_code from public.borrow_requests where id = '${ids[k]}'`)
  ids.pending = sql("select request_code from public.borrow_requests where purpose = 'Servo and sensor test rig'")
})
const cardButtons = async (code) => (await page.locator(`[data-request="${code}"] button`).allInnerTexts()).map((t) => t.trim()).filter(Boolean)
await check('status → actions: Pending/Approved Cancel, Issued Return+Extend, Rejected Request again, On loan Request return', async () => {
  await logout()
  await login(STU, 'Student123')
  await go('/student/requests')
  const want = { pending: ['Cancel request'], approved: ['Cancel request'], issued: ['Return', 'Extend'], rejected: ['Request again'] }
  for (const [state, buttons] of Object.entries(want)) {
    const got = await cardButtons(ids[state])
    expect(JSON.stringify(got) === JSON.stringify(buttons), `${state} ${ids[state]}: ${JSON.stringify(got)}`)
  }
  const returned = sql("select request_code from public.borrow_requests where status = 'returned' limit 1")
  expect((await cardButtons(returned)).length === 0, 'returned should have no actions')
  await shot('student-requests-actions')
  await page.getByRole('tab', { name: /On loan/ }).click(); await page.waitForTimeout(500)
  const loanBtns = (await page.locator(`[data-loan="${ids.issued}"] button`).allInnerTexts()).map((t) => t.trim())
  expect(JSON.stringify(loanBtns) === '["Request return"]', 'on loan: ' + JSON.stringify(loanBtns))
  await page.getByRole('tab', { name: /^All/ }).click(); await page.waitForTimeout(400)
})
await check('Extend: student requests → due date unchanged until admin approves → then moves', async () => {
  const before = sql(`select b.due_date from public.borrowings b join public.borrow_requests r on r.id = b.request_id where r.request_code = '${ids.issued}'`)
  await page.locator(`[data-request="${ids.issued}"]`).getByRole('button', { name: 'Extend' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Reason').fill('Project demo moved to next week')
  await shot('student-extend-modal', false)
  await dlg.getByRole('button', { name: 'Request extension' }).click()
  await page.waitForTimeout(900)
  expect(sql(`select count(*) from public.loan_extension_requests where status = 'pending'`) === '1', 'no pending extension')
  expect(sql(`select b.due_date from public.borrowings b join public.borrow_requests r on r.id = b.request_id where r.request_code = '${ids.issued}'`) === before, 'due date changed before approval')
  expect((await page.locator(`[data-request="${ids.issued}"]`).innerText()).includes('waiting for approval'), 'pending state not shown')
  expect(await page.locator(`[data-request="${ids.issued}"]`).getByRole('button', { name: 'Extend' }).isDisabled(), 'extend should be disabled while pending')
  await logout()
  await login('lab.admin@srmist.edu.in', 'Admin12345')
  await go('/admin/issuance?tab=extensions')
  await shot('admin-extension-queue', false)
  await page.getByRole('button', { name: 'Approve' }).click(); await page.waitForTimeout(900)
  const after = sql(`select b.due_date from public.borrowings b join public.borrow_requests r on r.id = b.request_id where r.request_code = '${ids.issued}'`)
  expect(after > before, `due date ${before} → ${after}`)
  await logout()
  await login(STU, 'Student123')
})
await check('Return on an Issued card requests a return (no stock change until verified)', async () => {
  await go('/student/requests')
  const stock = sql("select available_qty || '/' || borrowed_qty from public.inventory_items where name = 'Soil Moisture Sensor'")
  await page.locator(`[data-request="${ids.issued}"]`).getByRole('button', { name: 'Return' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Request return' }).click()
  await page.waitForTimeout(900)
  expect(sql(`select (b.return_requested_at is not null)::text from public.borrowings b join public.borrow_requests r on r.id = b.request_id where r.request_code = '${ids.issued}'`) === 'true', 'return not requested')
  expect(sql("select available_qty || '/' || borrowed_qty from public.inventory_items where name = 'Soil Moisture Sensor'") === stock, 'stock moved before verification')
  const card = page.locator(`[data-request="${ids.issued}"]`)
  expect((await card.innerText()).includes('Return requested'), 'pending verification not shown')
  expect(await card.getByRole('button', { name: 'Return' }).isDisabled(), 'return should be disabled after request')
})
await check('Cancel on Pending: request cancelled, still listed under All, no Cancelled tab', async () => {
  await page.locator(`[data-request="${ids.approved}"]`).getByRole('button', { name: 'Cancel request' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel request' }).click()
  await page.waitForTimeout(900)
  expect(sql(`select status from public.borrow_requests where request_code = '${ids.approved}'`) === 'cancelled', 'not cancelled')
  expect(await page.locator(`[data-request="${ids.approved}"]`).count() === 1, 'cancelled request vanished from All')
  expect(await page.getByRole('tab', { name: /Cancelled/ }).count() === 0, 'Cancelled tab present')
})
await check('Request again on Rejected: new request with same components; rejected one unchanged', async () => {
  await page.locator(`[data-request="${ids.rejected}"]`).getByRole('button', { name: 'Request again' }).click()
  await page.waitForURL('**/student/request')
  await page.waitForTimeout(800)
  expect(await page.getByLabel('MPU6050 Accelerometer/Gyro quantity', { exact: true }).inputValue() === '2', 'components not prefilled')
  expect(await page.getByLabel('Project or purpose').inputValue() === 'Rejected state', 'purpose not prefilled')
  await page.getByRole('button', { name: 'Submit request' }).click()
  await page.waitForURL('**/student/requests**'); await page.waitForTimeout(600)
  expect(sql("select count(*) from public.borrow_requests where purpose = 'Rejected state'") === '2', 'no new request')
  expect(sql(`select status from public.borrow_requests where request_code = '${ids.rejected}'`) === 'rejected', 'rejected record modified')
  expect(!(await text()).toLowerCase().includes('latest request'), 'timeline appeared after new request')
})
await check('mobile layout: student dashboard', async () => {
  await logout()
  await login('demo.student@srmist.edu.in', 'Student123')
  await page.setViewportSize({ width: 390, height: 844 })
  await go('/student')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow <= 1, `horizontal overflow ${overflow}px`)
  await shot('mobile-student-dashboard')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await shot('mobile-menu', false)
})
await check('student sees notifications for approval/issue/return', async () => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await go('/student')
  await page.getByRole('button', { name: /Notifications/ }).click()
  const t = await text()
  expect(t.includes('approved') && t.includes('Return verified'), 'notifications missing')
  await shot('student-notifications', false)
})
await check('404 page', async () => { await go('/nope'); expect((await text()).includes("We couldn't find that page"), 'no 404') })

await check('no "shelf" wording on any visited page', async () => {
  expect(shelfHits.size === 0, 'found on ' + [...shelfHits].join(', '))
})
await browser.close()
for (const r of results) console.log(r.join('  '))
console.log(`\n${results.filter((r) => r[0] === 'PASS').length} passed, ${results.filter((r) => r[0] === 'FAIL').length} failed`)
if (consoleErrors.length) { console.log('\nConsole errors:'); for (const e of [...new Set(consoleErrors)].slice(0, 30)) console.log(' -', e) }
process.exit(results.some((r) => r[0] === 'FAIL') || consoleErrors.length ? 1 : 0)
