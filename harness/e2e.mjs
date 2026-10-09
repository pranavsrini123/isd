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
const text = () => page.locator('body').innerText()

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
  expect((await text()).includes('Check your inbox'), 'verify page missing')
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
  expect(sql("select status from borrow_requests limit 1") === 'returned', 'not returned')
  expect(sql('select count(*) from inventory_items where total_qty<>available_qty+reserved_qty+borrowed_qty+damaged_qty+lost_qty') === '0', 'invariant broken')
})
await check('admin inventory: add item, adjust stock, history', async () => {
  await go('/admin/inventory')
  await shot('admin-inventory')
  await page.getByRole('button', { name: 'Add item' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Name').fill('Demo Logic Analyzer')
  await dlg.getByLabel('Initial quantity').fill('4')
  await dlg.getByLabel('Storage location').fill('Shelf H1')
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
await check('404 page', async () => { await go('/nope'); expect((await text()).includes("isn't on the shelf"), 'no 404') })

await browser.close()
for (const r of results) console.log(r.join('  '))
console.log(`\n${results.filter((r) => r[0] === 'PASS').length} passed, ${results.filter((r) => r[0] === 'FAIL').length} failed`)
if (consoleErrors.length) { console.log('\nConsole errors:'); for (const e of [...new Set(consoleErrors)].slice(0, 30)) console.log(' -', e) }
process.exit(results.some((r) => r[0] === 'FAIL') || consoleErrors.length ? 1 : 0)
