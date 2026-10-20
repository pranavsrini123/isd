// End-to-end check of the audited inventory import (migrations 0007/0008) in the real app.
// Usage: node harness/import_e2e.mjs   (server.mjs on :5199, freshly reset + seeded DB)
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const req = createRequire('/opt/npm-tools/node_modules/')
const { chromium } = req('playwright')
const BASE = 'http://localhost:5199'
const SHOTS = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out/import-screens')
fs.rmSync(SHOTS, { recursive: true, force: true })
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
const page = await ctx.newPage()
page.setDefaultTimeout(8000)
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.googleapis|net::ERR/.test(m.text())) consoleErrors.push(`${page.url()} :: ${m.text()}`) })
page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: PAGEERROR ${e.message}`))
const shot = async (name, full = true) => { await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: full }) }
const go = async (p) => { await page.goto(BASE + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300) }
const body = () => page.locator('body').innerText()
const dialog = () => page.getByRole('dialog')

async function signup(email, pw, name) {
  await fetch(BASE + '/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw, data: { full_name: name } }) })
  await fetch(BASE + '/__confirm?email=' + email)
}
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
async function openRow(search) {
  await page.getByRole('tab', { name: /^All/ }).click()
  await page.getByPlaceholder('Search item name or No.').fill(search)
  await page.waitForTimeout(400)
  await page.getByRole('row').filter({ hasText: search }).first().getByRole('button').click()
  await dialog().waitFor()
}

await signup('lab.admin@srmist.edu.in', 'Admin12345', 'Lab Admin')
sql("update public.profiles set role='admin' where email='lab.admin@srmist.edu.in'")
await signup('imp.student@srmist.edu.in', 'Student123', 'Import Student')
const stockSnapshot = sql("select string_agg(id||':'||total_qty||'/'||available_qty||'/'||reserved_qty, ',' order by id) from inventory_items")

// A real request holding stock on the demo item we will link, to prove reserved stock is untouched.
const soilId = sql("select id from inventory_items where name='Soil Moisture Sensor'")
const stuId = sql("select id from profiles where email='imp.student@srmist.edu.in'")
const admId = sql("select id from profiles where email='lab.admin@srmist.edu.in'")
async function rpcAs(uid, fn, args) {
  const r = await fetch(BASE + '/rpc', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + uid }, body: JSON.stringify({ fn, args }) })
  const j = await r.json()
  if (j.error) throw new Error(`${fn}: ${j.error.message}`)
  return j.data
}
const today = sql('select public.lab_today()')
const plus = (n) => sql(`select (public.lab_today() + ${n})::text`)
const reqId = await rpcAs(stuId, 'create_borrow_request', { p_project_id: null, p_purpose: 'Plant monitor', p_note: null, p_needed_from: today, p_needed_until: plus(3), p_items: [{ item_id: soilId, qty: 2 }] })
await rpcAs(admId, 'approve_request', { p_request_id: reqId })

await login('lab.admin@srmist.edu.in', 'Admin12345')

await check('loading the audit changed no stock', async () => {
  const now = sql("select string_agg(id||':'||total_qty||'/'||(available_qty+reserved_qty)||'/0', ',' order by id) from inventory_items")
  const before = stockSnapshot.split(',').map((x) => { const [id, q] = x.split(':'); const [t, a, r] = q.split('/'); return `${id}:${t}/${+a + +r}/0` }).join(',')
  expect(now === before, 'stock differs after load')
})

await check('import page shows 103 source rows, sections and status counts', async () => {
  await go('/admin/import')
  await page.getByText('Source rows').waitFor()
  const t = await body()
  expect(/Source rows\s*103/i.test(t), 'no 103: ' + t.slice(0, 400).replace(/\n/g, ' | '))
  expect(t.includes('15 special · 88 small'), 'no section split')
  expect(/Needs review\s*64/i.test(t) && /Ready\s*39/i.test(t), 'status counts wrong')
  expect(t.includes('COMPONENTS Audit.docx'), 'source doc not shown')
  await shot('import-needs-review')
})

await check('nav link and inventory button lead to the import page', async () => {
  await go('/admin/inventory')
  await page.getByRole('link', { name: 'Audit import' }).first().click()
  await page.waitForURL('**/admin/import')
})

await check('filters: issue = quantity mismatch shows the 11 mismatched rows', async () => {
  await go('/admin/import')
  await page.getByRole('tab', { name: /^All/ }).click()
  await page.getByLabel('Issue').selectOption('quantity_mismatch')
  await page.waitForTimeout(300)
  const n = await page.locator('tbody tr').count()
  expect(n === 11, `got ${n}`)
  expect((await body()).includes('L298N Driver'), 'L298N missing')
  await shot('import-mismatches')
  await page.getByLabel('Issue').selectOption('')
})

await check('review: damaged tool row created as a new lab-use-only item', async () => {
  await go('/admin/import')
  await openRow('Gluegun-60W')
  const t = await dialog().innerText()
  expect(t.includes('Qty ISD Lab') && t.includes('Damaged') && t.includes('Check before applying'), 'source panel incomplete')
  expect(await dialog().getByLabel('Damaged').inputValue() === '1', 'damaged not proposed')
  expect(await dialog().getByRole('switch', { name: 'Available for borrowing' }).getAttribute('aria-checked') === 'false', 'should be lab use only')
  await shot('review-gluegun', false)
  await dialog().getByRole('button', { name: 'Create item and apply' }).click()
  await dialog().waitFor({ state: 'detached' })
  const row = sql("select total_qty||'/'||available_qty||'/'||damaged_qty||'/'||is_requestable from inventory_items where name='Gluegun-60W'")
  expect(row === '2/1/1/false', 'item ' + row)
  const logs = sql("select count(*) from activity_logs a join inventory_items i on i.id=a.entity_id where i.name='Gluegun-60W' and a.action='stock.adjusted' and a.details->>'reason' like 'Audit import components-audit-2026-10-12%'")
  expect(logs === '3', 'audit logs ' + logs)
})

await check('review: soil sensor linked to existing item keeps id, project links and reserved stock', async () => {
  await openRow('Soil sensor')
  const t = await dialog().innerText()
  expect(t.includes('Suggested by name similarity') && t.includes('Soil Moisture Sensor'), 'no suggestion')
  await dialog().getByText(/Reserved, on-loan and lost units are kept/).waitFor()
  await shot('review-soil-existing', false)
  await dialog().getByRole('button', { name: 'Apply to selected item' }).click()
  await dialog().waitFor({ state: 'detached' })
  const row = sql(`select available_qty||'/'||reserved_qty||'/'||total_qty from inventory_items where id='${soilId}'`)
  expect(row === '1/2/3', 'got ' + row) // source says 1 available; 2 stay reserved
  expect(sql(`select count(*) from project_components where item_id='${soilId}'`) !== '0', 'project link lost')
})

await check('apply reconciled rows (only rows with no possible match)', async () => {
  const expected = sql("select count(*) from inventory_source_review where status='ready' and suggested_item_id is null")
  await page.getByRole('button', { name: /Apply reconciled/ }).click()
  await dialog().getByRole('button', { name: 'Apply' }).click()
  await dialog().waitFor({ state: 'detached', timeout: 20000 })
  const applied = sql("select count(*) from inventory_source_records where status='applied' and applied_values->>'note' = 'bulk apply of reconciled rows'")
  expect(applied === expected, `${applied} vs ${expected}`)
  expect(sql("select count(*) from inventory_source_records where status='ready'") !== '0', 'ambiguous ready rows should remain')
})

await check('discrepancy CSV downloads with every flagged row', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Discrepancies CSV' }).click()])
  const file = path.join(SHOTS, 'discrepancies.csv')
  await dl.saveAs(file)
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  const flagged = sql("select count(*) from inventory_source_records where cardinality(flags) > 0")
  expect(lines[0].startsWith('section,page,row,serial,original_name'), 'bad header')
  expect(String(lines.length - 1) === flagged, `${lines.length - 1} vs ${flagged}`)
})

await check('skip a row with a reason, then re-open it', async () => {
  await openRow('Walking Stick')
  await dialog().getByLabel('Reason if skipping').fill('Project prototype, not lab stock')
  await dialog().getByRole('button', { name: 'Skip row' }).click()
  await dialog().waitFor({ state: 'detached' })
  expect(sql("select status from inventory_source_records where original_name='Walking Stick'") === 'skipped', 'not skipped')
  await openRow('Walking Stick')
  await dialog().getByLabel('Reason').fill('Lab decided to track it')
  await dialog().getByRole('button', { name: 'Re-open' }).click()
  await dialog().waitFor({ state: 'detached' })
  expect(sql("select status from inventory_source_records where original_name='Walking Stick'") === 'needs_review', 'not reopened')
})

await check('applied row view shows before/after and can be reverted', async () => {
  await openRow('Soil sensor')
  const t = await dialog().innerText()
  expect(t.includes('Before') && t.includes('After') && t.includes('Soil Moisture Sensor'), 'no delta')
  await shot('applied-view', false)
  await dialog().getByLabel('Reason').fill('Checking revert')
  await dialog().getByRole('button', { name: 'Revert' }).click()
  await dialog().waitFor({ state: 'detached' })
  const row = sql(`select available_qty||'/'||reserved_qty from inventory_items where id='${soilId}'`)
  expect(row === '8/2', 'got ' + row)
})

await check('retire demo items: archives idle demo items, keeps busy ones, deletes nothing', async () => {
  const before = sql('select count(*) from inventory_items')
  await page.getByRole('button', { name: 'Retire demo items' }).click()
  await dialog().getByRole('button', { name: 'Archive demo items' }).click()
  await page.waitForTimeout(1200)
  expect(sql('select count(*) from inventory_items') === before, 'rows deleted')
  expect(sql(`select is_archived from inventory_items where id='${soilId}'`) === 'f', 'busy demo item archived')
  expect(sql("select count(*) from inventory_items where is_demo and not is_archived and reserved_qty=0 and borrowed_qty=0") === '0', 'idle demo items left')
  await page.waitForTimeout(300)
  await shot('after-retire')
})

await check('project requirements to check lists projects on demo/archived items', async () => {
  const t = await body()
  expect(t.includes('Project requirements to check') && t.includes('Plant Monitor'), 'list missing')
})

await check('admin inventory: lab-use badge, remarks and source record in history', async () => {
  await go('/admin/inventory?search=Gluegun')
  await page.waitForTimeout(500)
  const t = await body()
  expect(t.includes('Gluegun-60W') && t.includes('Lab use only') && t.includes('Note: Damaged'), 'badge/remark missing')
  await page.getByRole('button', { name: 'History for Gluegun-60W' }).click()
  await dialog().getByText('Source records').waitFor()
  const d = await dialog().innerText()
  expect(d.includes('COMPONENTS Audit.docx') && d.includes('page 3') && d.includes('No. 30'), 'source detail missing')
  await shot('history-source', false)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Edit Gluegun-60W' }).click()
  await dialog().getByRole('switch', { name: 'Available for borrowing' }).waitFor()
  await page.keyboard.press('Escape')
})

await logout()
await login('imp.student@srmist.edu.in', 'Student123')

await check('student inventory shows imported items, not archived demo items', async () => {
  await go('/student/inventory?search=ESP32')
  await page.waitForTimeout(400)
  expect((await body()).includes('ESP32'), 'ESP32 missing')
  await go('/student/inventory?search=Arduino%20Uno%20R3')
  await page.waitForTimeout(400)
  expect((await body()).includes('No components match'), 'archived demo item still visible')
})

await check('student: lab-use-only item shows badge and cannot be added', async () => {
  await go('/student/inventory?search=Gluegun')
  await page.waitForTimeout(400)
  expect((await body()).includes('Lab use only'), 'no badge')
  await page.getByRole('button', { name: 'View Gluegun-60W' }).click()
  await dialog().waitFor()
  const t = await dialog().innerText()
  expect(t.includes('For use in the lab only'), 'no restriction text')
  expect(await dialog().getByRole('button', { name: 'Add to request' }).count() === 0, 'add button present')
  await shot('student-lab-only', false)
  await page.keyboard.press('Escape')
})

await check('student: borrowing filter "Lab use only"', async () => {
  await go('/student/inventory')
  await page.getByLabel('Borrowing').selectOption('no')
  await page.waitForTimeout(500)
  const names = await page.locator('h3, button.text-left.font-semibold').allInnerTexts()
  expect(names.some((n) => n.includes('Gluegun-60W')), 'gluegun not listed')
  expect(!names.some((n) => n.includes('ESP32')), 'borrowable item listed')
})

await check('student: request picker blocks lab-use-only items', async () => {
  await go('/student/request')
  await page.getByRole('button', { name: /Add components|Browse/ }).first().click()
  await page.getByRole('switch', { name: 'Only show components I can borrow now' }).click()
  await page.getByPlaceholder(/Search/).last().fill('Gluegun')
  await page.waitForTimeout(600)
  const btn = page.getByRole('button', { name: 'Gluegun-60W is for lab use only' })
  expect(await btn.isDisabled(), 'add enabled')
  await shot('picker-lab-only', false)
})

await check('server rejects a request for a lab-use-only item', async () => {
  const glue = sql("select id from inventory_items where name='Gluegun-60W'")
  let msg = ''
  try { await rpcAs(stuId, 'create_borrow_request', { p_project_id: null, p_purpose: 'Glue gun', p_note: null, p_needed_from: today, p_needed_until: plus(2), p_items: [{ item_id: glue, qty: 1 }] }) } catch (e) { msg = e.message }
  expect(/lab only/.test(msg), 'msg ' + msg)
})

await check('mobile layout of the import page', async () => {
  await logout()
  await login('lab.admin@srmist.edu.in', 'Admin12345')
  await page.setViewportSize({ width: 390, height: 844 })
  await go('/admin/import')
  await page.getByText('Source rows').waitFor()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  await shot('import-mobile', false)
  expect(overflow <= 1, 'horizontal page overflow ' + overflow)
})

await check('no console errors', async () => { expect(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ')) })

await browser.close()
for (const r of results) console.log(r.join('  '))
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
