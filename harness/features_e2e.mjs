// End-to-end run of the 0012 features in a real browser against the real database:
// Super Admin / Admin separation, mandatory department, My requests dropdown,
// enquiries (with the downloadable log) and component take-away (with the PDF letter).
// Usage: bash harness/run_features.sh
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const req = createRequire('/opt/npm-tools/node_modules/')
const { chromium } = req('playwright')
const BASE = 'http://localhost:5199'
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out/features')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const sql = (s) => execSync(`psql -h 127.0.0.1 -p 54329 -U postgres -d isdtest -X -q -At -c "${s.replace(/"/g, '\\"')}"`).toString().trim()

const results = []
const consoleErrors = []
let step = 0
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]) } catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]) }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
let page = await ctx.newPage()
page.setDefaultTimeout(8000)
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.googleapis|net::ERR/.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text()}`) })
  p.on('pageerror', (e) => consoleErrors.push(`${p.url()} :: PAGEERROR ${e.message}`))
}
watch(page)
const shot = async (name, full = true) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: full }) }
const go = async (p) => { await page.goto(BASE + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400) }
const text = () => page.locator('body').innerText()
async function rpcAs(uid, fn, args) {
  const r = await fetch(BASE + '/rpc', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + uid }, body: JSON.stringify({ fn, args }) })
  return r.json()
}
async function signup(email, name, extra = {}) {
  await fetch(BASE + '/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Passw0rd1', data: { full_name: name, ...extra } }) })
  await fetch(BASE + '/__confirm?email=' + encodeURIComponent(email))
  return sql(`select id from public.profiles where email = '${email}'`)
}
async function login(email) {
  await go('/login')
  await page.getByLabel('SRM email').fill(email)
  await page.getByLabel('Password').fill('Passw0rd1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)
}
async function logout() {
  // On a phone the sign-out button lives in the menu drawer.
  if (!(await page.getByRole('button', { name: 'Sign out' }).first().isVisible())) await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await page.waitForURL('**/login')
}
const today = sql('select public.lab_today()')

// ---- accounts: one Super Admin, one Admin, one older student without a department
const sup = await signup('lab.super@srmist.edu.in', 'Lab Super Admin', { department: 'CTech' })
const adm = await signup('lab.ops@srmist.edu.in', 'Lab Operations Admin', { department: 'CTech' })
sql(`update public.profiles set role = 'super_admin' where id = '${sup}'`)
sql(`update public.profiles set role = 'admin' where id = '${adm}'`)
const old = await signup('old.student@srmist.edu.in', 'Older Student')
const buzzer = sql("select id from public.inventory_items where name = 'Piezo Buzzer'")

// ======================================================= 2. department at sign-up
await check('register: department is required; Other shows a name field that is required too', async () => {
  await go('/register')
  await page.getByLabel('Full name').fill('Ananya Raman')
  await page.getByLabel('SRM email').fill('ananya.r@srmist.edu.in')
  await page.getByLabel('Register number').fill('RA2311003010001')
  await page.locator('input[autocomplete="new-password"]').first().fill('Passw0rd1')
  await page.getByLabel('Confirm password').fill('Passw0rd1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('alert').filter({ hasText: 'Choose your department' }).waitFor()
  expect(await page.getByLabel('Department name').count() === 0, 'name field shown before choosing Other')
  await page.getByLabel('Department').first().selectOption('other')
  await page.getByLabel('Department name').waitFor()
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('alert').filter({ hasText: 'Enter your department name' }).waitFor()
  await shot('register-department-other', false)
  // switching back to CTech hides and clears the custom name
  await page.getByLabel('Department name').fill('Something')
  await page.getByLabel('Department').first().selectOption('CTech')
  expect(await page.getByLabel('Department name').count() === 0, 'name field still shown for CTech')
  await page.getByLabel('Department').first().selectOption('other')
  expect(await page.getByLabel('Department name').inputValue() === '', 'custom name not cleared')
  await page.getByLabel('Department name').fill('Electronics and Communication')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('**/verify-email')
  expect(sql("select department from public.profiles where email = 'ananya.r@srmist.edu.in'") === 'Electronics and Communication', 'department not saved')
})
await fetch(BASE + '/__confirm?email=ananya.r@srmist.edu.in')
const stu = sql("select id from public.profiles where email = 'ananya.r@srmist.edu.in'")

await check('existing account without a department: banner, then completes it in Profile', async () => {
  await login('old.student@srmist.edu.in')
  await page.waitForURL('**/student')
  expect((await text()).includes('Add your department to complete your profile'), 'banner missing')
  await shot('department-missing-banner', false)
  await page.getByRole('link', { name: 'Add it now' }).click()
  await page.waitForURL('**/student/profile**')
  await page.getByLabel('Department').first().selectOption('CTech')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.waitForTimeout(900)
  expect(sql(`select department from public.profiles where id = '${old}'`) === 'CTech', 'not saved')
  expect(!(await text()).includes('Add your department to complete'), 'banner still shown')
  await logout()
})

// ======================================================= 1. role separation
let reqCode
await check('setup: student submits a borrow request (pending)', async () => {
  const r = await rpcAs(stu, 'create_borrow_request', { p_project_id: null, p_purpose: 'Buzzer alarm test', p_note: null, p_needed_from: today, p_needed_until: today, p_items: [{ item_id: buzzer, qty: 1 }] })
  expect(!r.error, JSON.stringify(r.error))
  reqCode = sql(`select request_code from public.borrow_requests where id = '${r.data}'`)
})
await check('admin: no pending queue in the UI, and none through the API', async () => {
  await login('lab.ops@srmist.edu.in')
  await page.waitForURL('**/admin')
  await shot('admin-dashboard-ops')
  await go('/admin/requests')
  const tabs = (await page.getByRole('tab').allInnerTexts()).map((t) => t.replace(/\d+/g, '').trim())
  expect(!tabs.includes('Pending'), 'pending tab shown: ' + JSON.stringify(tabs))
  await go('/admin/requests?status=pending')
  expect(!(await text()).includes(reqCode), 'pending request visible')
  await shot('admin-requests-ops')
  const viaApi = await fetch(BASE + '/rest', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + adm },
    body: JSON.stringify({ table: 'borrow_requests', op: 'select', select: '*', filters: [{ op: 'eq', col: 'status', val: 'pending' }], or: [], order: [] }) }).then((r) => r.json())
  expect(!viaApi.error && viaApi.data.length === 0, 'API returned pending rows: ' + JSON.stringify(viaApi).slice(0, 200))
  const approve = await rpcAs(adm, 'approve_request', { p_request_id: sql(`select id from public.borrow_requests where request_code = '${reqCode}'`) })
  expect(approve.error && /Super Admin privileges required/.test(approve.error.message), 'admin could approve: ' + JSON.stringify(approve))
  await logout()
})
await check('super admin: approves from the queue (stock reserved)', async () => {
  await login('lab.super@srmist.edu.in')
  await go('/admin/requests')
  expect((await text()).includes(reqCode), 'request not in queue')
  await shot('superadmin-requests-queue')
  const before = sql(`select reserved_qty from public.inventory_items where id = '${buzzer}'`)
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await page.waitForTimeout(900)
  expect(sql(`select status from public.borrow_requests where request_code = '${reqCode}'`) === 'approved', 'not approved')
  expect(Number(sql(`select reserved_qty from public.inventory_items where id = '${buzzer}'`)) === Number(before) + 1, 'not reserved')
  await logout()
})
await check('admin: issues the approved request and verifies the return', async () => {
  await login('lab.ops@srmist.edu.in')
  await go('/admin/requests')
  expect((await text()).includes(reqCode), 'approved request not visible to admin')
  await go('/admin/issuance')
  await page.getByRole('tab', { name: /Ready to issue/ }).click()
  await page.getByRole('button', { name: 'Issue' }).first().click()
  await page.getByRole('button', { name: 'Confirm issue' }).click()
  await page.waitForTimeout(900)
  expect(sql(`select status from public.borrow_requests where request_code = '${reqCode}'`) === 'issued', 'not issued')
  const bid = sql(`select b.id from public.borrowings b join public.borrow_requests r on r.id = b.request_id where r.request_code = '${reqCode}'`)
  const rr = await rpcAs(stu, 'request_return', { p_borrowing_id: bid })
  expect(!rr.error, 'return request failed')
  await go('/admin/issuance')
  await page.getByRole('tab', { name: /On loan/ }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Verify return' }).first().click()
  await page.getByRole('button', { name: 'Confirm verification' }).click()
  await page.waitForTimeout(900)
  expect(sql(`select status from public.borrow_requests where request_code = '${reqCode}'`) === 'returned', 'not returned')
  await logout()
})
await check('super admin: notified that the admin verified the return', async () => {
  await login('lab.super@srmist.edu.in')
  await page.getByRole('button', { name: /Notifications/ }).first().click()
  await page.waitForTimeout(500)
  expect((await text()).includes(`Return verified for ${reqCode}`), 'notification missing')
  await shot('superadmin-return-notification', false)
  await page.keyboard.press('Escape')
  await logout()
})

// ======================================================= 3. My requests dropdown
await check('my requests: one dropdown with counts; filters the list; kept in the URL', async () => {
  await rpcAs(stu, 'create_borrow_request', { p_project_id: null, p_purpose: 'Second request', p_note: null, p_needed_from: today, p_needed_until: today, p_items: [{ item_id: buzzer, qty: 1 }] })
  await login('ananya.r@srmist.edu.in')
  await go('/student/requests')
  expect(await page.getByRole('tab').count() === 0, 'tabs still there')
  const opts = await page.locator('#request-filter option').allInnerTexts()
  expect(JSON.stringify(opts) === JSON.stringify(['All (2)', 'Pending (1)', 'Approved (0)', 'Issued (0)', 'Returned (1)', 'Rejected (0)', 'On loan (0)']), JSON.stringify(opts))
  await shot('student-my-requests-dropdown', false)
  await page.locator('#request-filter').selectOption('returned')
  await page.waitForTimeout(500)
  expect(page.url().includes('tab=returned'), 'not in URL')
  const codes = await page.locator('[data-request]').evaluateAll((els) => els.map((e) => e.dataset.request))
  expect(JSON.stringify(codes) === JSON.stringify([reqCode]), 'filtered list: ' + JSON.stringify(codes))
  await page.reload(); await page.waitForTimeout(800)
  expect(await page.locator('#request-filter').inputValue() === 'returned', 'filter lost on reload')
  await page.locator('#request-filter').selectOption('pending'); await page.waitForTimeout(400)
  expect(await page.locator('[data-request]').count() === 1, 'pending filter wrong')
})

// ======================================================= 4. enquiries
let enqCode
await check('enquiry: form is prefilled from the profile; submitting creates no request', async () => {
  await go('/student/enquiries')
  expect(await page.getByLabel('Name').first().inputValue() === 'Ananya Raman', 'name not prefilled')
  expect(await page.getByLabel('Registration number').inputValue() === 'RA2311003010001', 'reg no not prefilled')
  expect(await page.getByLabel('Department name').inputValue() === 'Electronics and Communication', 'department not prefilled')
  expect(await page.getByLabel('Email ID').inputValue() === 'ananya.r@srmist.edu.in', 'email not shown')
  const before = sql(`select count(*) from public.borrow_requests where requester_id = '${stu}'`)
  await page.getByLabel('Enquiry').fill('short')
  await page.getByRole('button', { name: 'Send enquiry' }).click()
  await page.getByRole('alert').filter({ hasText: 'at least 10 characters' }).waitFor()
  await page.getByLabel('Enquiry').fill('=SUM(1) Is a second Jetson Nano free next week for our final-year project?')
  await page.getByRole('button', { name: 'Send enquiry' }).click()
  await page.waitForTimeout(900)
  enqCode = sql(`select enquiry_code from public.enquiries where student_id = '${stu}'`)
  expect(/^ENQ-\d+$/.test(enqCode), 'not created')
  expect(sql(`select count(*) from public.borrow_requests where requester_id = '${stu}'`) === before, 'a request was created')
  expect((await text()).includes(enqCode), 'not listed for the student')
  await shot('student-enquiries')
  await logout()
})
await check('enquiry: admin sees it, updates status with an internal note', async () => {
  await login('lab.ops@srmist.edu.in')
  await go('/admin/enquiries')
  expect((await text()).includes(enqCode), 'not listed')
  await shot('admin-enquiries')
  await page.locator(`[data-enquiry="${enqCode}"]`).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Status').selectOption('in_progress')
  await dlg.getByLabel('Internal note').fill('Checking the Jetson cupboard')
  await shot('admin-enquiry-detail', false)
  await dlg.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(900)
  expect(sql(`select status from public.enquiries where enquiry_code = '${enqCode}'`) === 'in_progress', 'status not saved')
  await logout()
})
await check('enquiry: super admin resolves it and downloads the log (CSV, formulas neutralised)', async () => {
  await login('lab.super@srmist.edu.in')
  await go('/admin/enquiries?status=all')
  await page.locator(`[data-enquiry="${enqCode}"]`).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Status').selectOption('resolved')
  await dlg.getByLabel('Internal note').fill('One unit free from Monday')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(900)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download log' }).click()])
  const file = path.join(OUT, dl.suggestedFilename())
  await dl.saveAs(file)
  const csv = fs.readFileSync(file, 'utf8')
  expect(csv.charCodeAt(0) === 0xfeff, 'no BOM for Excel')
  expect(csv.includes('Enquiry ID,Student name,Registration number,Email ID,Department,Enquiry description,Submitted at,Current status,Resolution note'), 'header wrong')
  expect(csv.includes(enqCode) && csv.includes('"Resolved"') && csv.includes('One unit free from Monday'), 'row wrong')
  expect(csv.includes(`"'=SUM(1) Is a second`), 'formula not neutralised')
  expect(csv.includes('Open -> In progress (Lab Operations Admin) - Checking the Jetson cupboard'), 'history missing')
  await logout()
})
await check('enquiry: student sees the new status but not the internal notes', async () => {
  await login('ananya.r@srmist.edu.in')
  await go('/student/enquiries')
  const t = await text()
  expect(t.includes('Resolved'), 'status not shown')
  expect(!t.includes('One unit free from Monday') && !t.includes('Jetson cupboard'), 'internal note leaked')
})

// ======================================================= 5. component take-away
let tkaCode
await check('take-away: student fills the form with inventory components and submits', async () => {
  await go('/student/takeaway')
  await page.getByRole('button', { name: 'New take-away request' }).first().click()
  expect(await page.getByLabel('Student name').inputValue() === 'Ananya Raman', 'not prefilled')
  await page.getByRole('button', { name: 'Send for approval' }).click()
  await page.getByRole('alert').filter({ hasText: 'Add at least one component' }).waitFor()
  await page.getByRole('searchbox', { name: 'Search the lab inventory' }).fill('buzzer')
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'Add Piezo Buzzer' }).click()
  await page.getByRole('searchbox', { name: 'Search the lab inventory' }).fill('breadboard')
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: /^Add 830-point Breadboard/ }).click()
  await page.getByRole('button', { name: 'Increase Quantity of Piezo Buzzer' }).click()
  await page.getByLabel('Purpose').fill('Field test of the alarm prototype at the campus pond')
  await page.getByLabel('Expected return date').fill(sql("select (public.lab_today() + 4)::text"))
  await page.getByLabel('Additional information').fill('Faculty guide: Dr. S. Rao')
  await shot('student-takeaway-form')
  const stock = sql("select sum(available_qty) || '/' || sum(reserved_qty) from public.inventory_items")
  await page.getByRole('button', { name: 'Send for approval' }).click()
  await page.waitForTimeout(1000)
  tkaCode = sql(`select request_code from public.takeaway_requests where student_id = '${stu}'`)
  expect(/^TKA-\d+$/.test(tkaCode), 'not created')
  expect(sql(`select string_agg(i.name || '=' || t.quantity, ';' order by i.name) from public.takeaway_items t join public.inventory_items i on i.id = t.item_id`) === '830-point Breadboard=1;Piezo Buzzer=2', 'items wrong')
  expect(sql("select sum(available_qty) || '/' || sum(reserved_qty) from public.inventory_items") === stock, 'stock changed on submit')
  expect(await page.getByRole('button', { name: 'Download permission letter' }).count() === 0, 'letter offered before approval')
  await shot('student-takeaway-pending')
  const forged = await rpcAs(stu, 'get_takeaway_letter', { p_request_id: sql(`select id from public.takeaway_requests where request_code = '${tkaCode}'`) })
  expect(forged.error && /only available after Super Admin approval/.test(forged.error.message), 'letter data served before approval')
  await logout()
})
await check('take-away: admin cannot see or approve it while pending', async () => {
  await login('lab.ops@srmist.edu.in')
  await go('/admin/takeaway')
  expect(!(await text()).includes(tkaCode), 'pending take-away visible to admin')
  const tabs = (await page.getByRole('tab').allInnerTexts()).join('|')
  expect(!tabs.includes('Pending approval'), 'pending tab shown to admin')
  const r = await rpcAs(adm, 'decide_takeaway_request', { p_request_id: sql(`select id from public.takeaway_requests where request_code = '${tkaCode}'`), p_approve: true, p_note: null })
  expect(r.error && /Super Admin privileges required/.test(r.error.message), 'admin could approve')
  await logout()
})
await check('take-away: super admin approves', async () => {
  await login('lab.super@srmist.edu.in')
  await go('/admin/takeaway')
  expect((await text()).includes(tkaCode), 'not in queue')
  await shot('superadmin-takeaway-queue')
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await page.getByRole('dialog').getByRole('textbox').fill('Return by Friday')
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click()
  await page.waitForTimeout(900)
  expect(sql(`select status || '/' || decided_by_name from public.takeaway_requests where request_code = '${tkaCode}'`) === 'approved/Lab Super Admin', 'not approved')
  await logout()
})
await check('take-away: student downloads a real PDF letter with the request details', async () => {
  await login('ananya.r@srmist.edu.in')
  await go('/student/takeaway')
  await shot('student-takeaway-approved')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download permission letter' }).click()])
  const file = path.join(OUT, dl.suggestedFilename())
  await dl.saveAs(file)
  expect(dl.suggestedFilename() === `${tkaCode}-permission-letter.pdf`, 'file name ' + dl.suggestedFilename())
  const head = fs.readFileSync(file).subarray(0, 8).toString('latin1')
  expect(head.startsWith('%PDF-1.4'), 'not a PDF: ' + head)
  const txt = execSync(`pdftotext -layout "${file}" -`).toString()
  for (const s of [tkaCode, 'Ananya Raman', 'RA2311003010001', 'ananya.r@srmist.edu.in', 'Electronics and Communication', 'Piezo Buzzer', '830-point Breadboard',
    'Field test of the alarm prototype', 'Lab Super Admin', 'Return by Friday', 'Chairperson', 'Associate Chairperson', 'Signature:', 'Name:', 'Date:']) {
    expect(txt.includes(s), 'letter missing: ' + s)
  }
  const pages = Number(/Pages:\s+(\d+)/.exec(execSync(`pdfinfo "${file}"`).toString())[1])
  expect(pages === 1, 'pages: ' + pages)
  execSync(`pdftoppm -r 80 -png -singlefile "${file}" "${OUT}/${String(++step).padStart(2, '0')}-letter"`)
  await logout()
})
await check('take-away: admin records the signed letter (status: submitted to admin)', async () => {
  await login('lab.ops@srmist.edu.in')
  await go('/admin/takeaway')
  await page.getByRole('button', { name: 'Signed letter received' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Record as received' }).click()
  await page.waitForTimeout(900)
  expect(sql(`select status from public.takeaway_requests where request_code = '${tkaCode}'`) === 'submitted', 'not submitted')
  await go('/admin/takeaway?status=submitted')
  await page.getByRole('button', { name: `Details for ${tkaCode}` }).click()
  await shot('admin-takeaway-history')
  expect((await text()).includes('Signed letter received'), 'history missing')
  await logout()
})

// ======================================================= phones
await check('phone: new pages fit a 390px screen without sideways scrolling', async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await phone.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  page = await phone.newPage(); page.setDefaultTimeout(8000); watch(page)
  await login('ananya.r@srmist.edu.in')
  for (const p of ['/student/requests', '/student/enquiries', '/student/takeaway', '/student/profile']) {
    await go(p)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(over <= 1, `${p} overflows by ${over}px`)
    await shot('phone' + p.replaceAll('/', '-'))
  }
  await page.getByRole('button', { name: 'Open menu' }).click()
  await shot('phone-student-menu', false)
  await logout()
  await login('lab.super@srmist.edu.in')
  for (const p of ['/admin/enquiries?status=all', '/admin/takeaway?status=all', '/admin/users']) {
    await go(p)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(over <= 1, `${p} overflows by ${over}px`)
    await shot('phone' + p.split('?')[0].replaceAll('/', '-'))
  }
  await phone.close()
})

await check('no console errors', async () => expect(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ')))
await browser.close()
for (const r of results) console.log(r[0].padEnd(5), r[1], r[2] ? ' ' + r[2] : '')
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
