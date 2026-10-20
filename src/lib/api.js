// The only module that talks to Supabase. Screens call these functions, so
// queries stay consistent and are easy to audit. Every write goes through a
// database function or an RLS-protected table; nothing here is trusted for
// security.
import { supabase } from './supabase'
import { unwrap } from './errors'

const IMAGE_BUCKET = 'lab-images'
const sb = () => {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
const rpc = async (fn, args) => unwrap(await sb().rpc(fn, args))
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c)
// PostgREST or-filters are comma separated; strip characters that would break the expression.
const orSafe = (s) => escapeLike(s.trim()).replace(/[,()*]/g, ' ')

/** Applies a page window. `offset` (row index) takes precedence over `page` (1-based). */
function paginate(query, page, pageSize, offset) {
  if (!pageSize) return query
  const from = offset != null ? Math.max(0, offset) : (Math.max(1, page || 1) - 1) * pageSize
  return query.range(from, from + pageSize - 1)
}

// ---------------------------------------------------------------- settings
export const getPublicSettings = () => rpc('get_public_settings')
export async function listSettings() {
  return unwrap(await sb().from('app_settings').select('*').order('key'))
}
export const updateSetting = (key, value) => rpc('admin_update_setting', { p_key: key, p_value: value })

// ---------------------------------------------------------------- profile
export async function getProfile(id) {
  return unwrap(await sb().from('profiles').select('*').eq('id', id).maybeSingle())
}
export async function updateMyProfile(id, patch) {
  const allowed = ['full_name', 'srm_id', 'department', 'preferred_difficulty', 'interests']
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)))
  return unwrap(await sb().from('profiles').update(clean).eq('id', id).select('*').single())
}

// ---------------------------------------------------------------- categories
export async function listCategories() {
  return unwrap(await sb().from('inventory_categories').select('*').order('sort_order').order('name'))
}
export async function createCategory(name) {
  return unwrap(await sb().from('inventory_categories').insert({ name: name.trim() }).select('*').single())
}
export async function renameCategory(id, name) {
  return unwrap(await sb().from('inventory_categories').update({ name: name.trim() }).eq('id', id).select('*').single())
}
export async function deleteCategory(id) {
  return unwrap(await sb().from('inventory_categories').delete().eq('id', id))
}

// ---------------------------------------------------------------- inventory
export async function listInventory({
  search = '', categoryId = '', stock = '', archived = false, page = 1, pageSize = 12, sort = 'name', offset = null, availableOnly = false, requestable = '',
} = {}) {
  let q = sb().from('inventory_overview').select('*', { count: 'exact' })
  if (search.trim()) {
    const s = orSafe(search)
    q = q.or(`name.ilike.%${s}%,brand_model.ilike.%${s}%,asset_ids.ilike.%${s}%`)
  }
  if (categoryId) q = q.eq('category_id', categoryId)
  if (stock) q = q.eq('stock_status', stock)
  // "Available" for a student means it can actually be requested: borrowable and in stock.
  if (availableOnly) q = q.gt('requestable_qty', 0)
  if (requestable === 'yes') q = q.eq('is_requestable', true)
  if (requestable === 'no') q = q.eq('is_requestable', false)
  if (archived !== null) q = q.eq('is_archived', archived)
  if (sort === 'available') q = q.order('available_qty', { ascending: false })
  else if (sort === 'low') q = q.order('available_qty', { ascending: true })
  q = q.order('name').order('id')
  return unwrap(await paginate(q, page, pageSize, offset))
}
export async function getItem(id) {
  return unwrap(await sb().from('inventory_overview').select('*').eq('id', id).maybeSingle())
}
/** Published projects that use this item, with the quantity they need. */
export async function getItemProjects(itemId) {
  const rows = unwrap(await sb().from('project_components').select('project_id, qty_required').eq('item_id', itemId))
  if (!rows.length) return []
  const projects = unwrap(await sb().from('projects').select('id, name, status').in('id', rows.map((r) => r.project_id)))
  return projects.map((p) => ({ ...p, qty_required: rows.find((r) => r.project_id === p.id)?.qty_required }))
}
const ITEM_FIELDS = ['name', 'category_id', 'brand_model', 'description', 'specifications', 'asset_ids',
  'low_stock_threshold', 'storage_location', 'condition', 'image_path', 'is_requestable', 'remarks']
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]))
export async function createItem(item) {
  // Initial quantity is allowed on insert only; the database moves it all to "available".
  const row = { ...pick(item, ITEM_FIELDS), total_qty: Number(item.total_qty) || 0 }
  return unwrap(await sb().from('inventory_items').insert(row).select('*').single())
}
export async function updateItem(id, patch) {
  return unwrap(await sb().from('inventory_items').update(pick(patch, ITEM_FIELDS)).eq('id', id).select('*').single())
}
export async function setItemArchived(id, archived) {
  return unwrap(await sb().from('inventory_items').update({ is_archived: archived }).eq('id', id).select('id').single())
}
export const adjustStock = (itemId, action, qty, reason) =>
  rpc('adjust_inventory', { p_item_id: itemId, p_action: action, p_qty: qty, p_reason: reason })
export async function itemHistory(itemId, limit = 50) {
  return unwrap(await sb().from('activity_overview').select('*').eq('entity_id', itemId)
    .order('created_at', { ascending: false }).limit(limit))
}

// ---------------------------------------------------------------- projects
export async function rankedProjects({
  search = '', category = '', difficulty = '', buildableOnly = false, sort = 'rank', limit = null, offset = 0,
} = {}) {
  return rpc('get_ranked_projects', {
    p_search: search.trim() || null,
    p_category: category || null,
    p_difficulty: difficulty || null,
    p_buildable_only: buildableOnly,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  })
}
export async function getProject(id) {
  return unwrap(await sb().from('projects').select('*').eq('id', id).maybeSingle())
}
export async function getProjectReadiness(id) {
  return unwrap(await sb().from('project_readiness').select('*').eq('project_id', id).maybeSingle())
}
export async function getProjectComponents(id) {
  return unwrap(await sb().from('project_component_status').select('*').eq('project_id', id).order('item_name'))
}
export async function projectCategories() {
  const rows = unwrap(await sb().from('projects').select('category'))
  return [...new Set(rows.map((r) => r.category))].sort()
}
const PROJECT_FIELDS = ['name', 'slug', 'description', 'image_path', 'category', 'difficulty', 'est_hours_min',
  'est_hours_max', 'instructions', 'documentation_url', 'github_url', 'video_url', 'learning_outcomes', 'status']
export async function createProject(project) {
  const row = { ...pick(project, PROJECT_FIELDS), status: 'draft' }
  return unwrap(await sb().from('projects').insert(row).select('*').single())
}
export async function updateProject(id, patch) {
  return unwrap(await sb().from('projects').update(pick(patch, PROJECT_FIELDS)).eq('id', id).select('*').single())
}
export async function deleteProject(id) {
  return unwrap(await sb().from('projects').delete().eq('id', id))
}
/** Replaces the component list: rows = [{ item_id, qty_required, notes }]. */
export async function saveProjectComponents(projectId, rows) {
  const existing = unwrap(await sb().from('project_components').select('item_id').eq('project_id', projectId))
  const keep = new Set(rows.map((r) => r.item_id))
  const remove = existing.map((e) => e.item_id).filter((id) => !keep.has(id))
  if (rows.length) {
    unwrap(await sb().from('project_components').upsert(
      rows.map((r) => ({ project_id: projectId, item_id: r.item_id, qty_required: r.qty_required, notes: r.notes || null })),
      { onConflict: 'project_id,item_id' },
    ))
  }
  if (remove.length) {
    unwrap(await sb().from('project_components').delete().eq('project_id', projectId).in('item_id', remove))
  }
}

// ---------------------------------------------------------------- requests
export const createRequest = ({ projectId, purpose, note, neededFrom, neededUntil, items }) =>
  rpc('create_borrow_request', {
    p_project_id: projectId || null,
    p_purpose: purpose,
    p_note: note || null,
    p_needed_from: neededFrom,
    p_needed_until: neededUntil,
    p_items: items.map((i) => ({ item_id: i.item_id, qty: i.qty })),
  })
export const cancelRequest = (id) => rpc('cancel_borrow_request', { p_request_id: id })
export const approveRequest = (id) => rpc('approve_request', { p_request_id: id })
export const rejectRequest = (id, reason) => rpc('reject_request', { p_request_id: id, p_reason: reason })
export const issueRequest = (id, dueDate) => rpc('issue_request', { p_request_id: id, p_due_date: dueDate || null })

export async function myRequests(userId) {
  return unwrap(await sb().from('request_overview').select('*').eq('requester_id', userId)
    .order('created_at', { ascending: false }))
}
export async function listRequests({ status = '', search = '', page = 1, pageSize = 20 } = {}) {
  let q = sb().from('request_overview').select('*', { count: 'exact' })
  if (status) q = q.eq('status', status)
  if (search.trim()) {
    const s = orSafe(search)
    q = q.or(`request_code.ilike.%${s}%,requester_name.ilike.%${s}%,requester_email.ilike.%${s}%,project_name.ilike.%${s}%`)
  }
  q = q.order('created_at', { ascending: status === 'pending' }).order('id')
  return unwrap(await paginate(q, page, pageSize))
}
export async function requestCounts() {
  const rows = unwrap(await sb().from('borrow_requests').select('status'))
  return rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1, all: (acc.all || 0) + 1 }), { all: 0 })
}

// ---------------------------------------------------------------- borrowings / returns
export async function myBorrowingLines(userId) {
  return unwrap(await sb().from('borrowing_lines').select('*').eq('borrower_id', userId)
    .order('issued_at', { ascending: false }))
}
export async function openBorrowingLines() {
  return unwrap(await sb().from('borrowing_lines').select('*').eq('is_verified', false)
    .order('due_date').order('request_code'))
}
export async function recentReturns(limit = 30) {
  return unwrap(await sb().from('borrowing_lines').select('*').eq('is_verified', true)
    .order('verified_at', { ascending: false }).limit(limit))
}
export const requestReturn = (borrowingId) => rpc('request_return', { p_borrowing_id: borrowingId })
export const verifyReturn = (lineId, { good, damaged, missing, notes }) =>
  rpc('verify_return', { p_line_id: lineId, p_good: good, p_damaged: damaged, p_missing: missing, p_notes: notes || null })

// ---------------------------------------------------------------- notifications
export async function listNotifications(limit = 20) {
  return unwrap(await sb().from('notifications').select('*').order('created_at', { ascending: false }).limit(limit))
}
export const markNotificationsRead = (ids = null) => rpc('mark_notifications_read', { p_ids: ids })

// ---------------------------------------------------------------- admin
export const dashboardStats = () => rpc('admin_dashboard_stats')
export const report = (name, args = {}) => rpc(`report_${name}`, args)

export async function listUsers({ search = '', role = '', status = '', page = 1, pageSize = 20 } = {}) {
  let q = sb().from('profiles').select('*', { count: 'exact' })
  if (search.trim()) {
    const s = orSafe(search)
    q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,srm_id.ilike.%${s}%`)
  }
  if (role) q = q.eq('role', role)
  if (status) q = q.eq('status', status)
  q = q.order('created_at', { ascending: false }).order('id')
  return unwrap(await paginate(q, page, pageSize))
}
export async function userActivity(userId) {
  const reqs = unwrap(await sb().from('request_overview').select('*').eq('requester_id', userId)
    .order('created_at', { ascending: false }).limit(20))
  const lines = unwrap(await sb().from('borrowing_lines').select('*').eq('borrower_id', userId)
    .eq('is_verified', false))
  return { requests: reqs, openLines: lines }
}
export const setUserRole = (id, role) => rpc('admin_set_user_role', { p_user_id: id, p_role: role })
export const setUserStatus = (id, status) => rpc('admin_set_user_status', { p_user_id: id, p_status: status })

export async function listActivity({ search = '', entity = '', page = 1, pageSize = 30 } = {}) {
  let q = sb().from('activity_overview').select('*', { count: 'exact' })
  if (search.trim()) q = q.ilike('summary', `%${escapeLike(search.trim())}%`)
  if (entity) q = q.eq('entity_type', entity)
  q = q.order('created_at', { ascending: false }).order('id')
  return unwrap(await paginate(q, page, pageSize))
}

// ---------------------------------------------------------------- storage
export function imageUrl(path) {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  if (!supabase) return null
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}
export async function uploadImage(file, folder) {
  const okTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!okTypes.includes(file.type)) throw new Error('Use a JPG, PNG or WebP image')
  if (file.size > 2 * 1024 * 1024) throw new Error('Images must be 2 MB or smaller')
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  unwrap(await sb().storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false }))
  return path
}

/** Sums for the student dashboard (non-archived items only; RLS hides archived ones from students). */
export async function inventoryTotals() {
  const rows = unwrap(await sb().from('inventory_items').select('available_qty, total_qty, is_archived').eq('is_archived', false))
  return rows.reduce((a, r) => ({ types: a.types + 1, available: a.available + r.available_qty, total: a.total + r.total_qty }),
    { types: 0, available: 0, total: 0 })
}

export async function getItemsByIds(ids) {
  if (!ids.length) return []
  return unwrap(await sb().from('inventory_overview').select('*').in('id', ids))
}

// ---------------------------------------------------------------- loan extensions
export const requestLoanExtension = (borrowingId, newDueDate, reason) =>
  rpc('request_loan_extension', { p_borrowing_id: borrowingId, p_new_due_date: newDueDate, p_reason: reason })
export const cancelLoanExtension = (id) => rpc('cancel_loan_extension', { p_extension_id: id })
export const reviewLoanExtension = (id, approve, note) =>
  rpc('review_loan_extension', { p_extension_id: id, p_approve: approve, p_note: note || null })
export async function myExtensions(userId) {
  return unwrap(await sb().from('loan_extension_overview').select('*').eq('borrower_id', userId)
    .order('created_at', { ascending: false }))
}
export async function listExtensions({ status = 'pending' } = {}) {
  let q = sb().from('loan_extension_overview').select('*')
  if (status) q = q.eq('status', status)
  return unwrap(await q.order('created_at', { ascending: status === 'pending' }).limit(100))
}

// ---------------------------------------------------------------- audited inventory import (admin)
// Source records are read-only for the client; every change goes through a
// database function that re-checks the admin role and logs the stock moves.
export async function listSourceBatches() {
  const rows = unwrap(await sb().from('inventory_source_records').select('batch_key, source_doc, created_at').order('created_at', { ascending: false }))
  const seen = new Map()
  for (const r of rows) if (!seen.has(r.batch_key)) seen.set(r.batch_key, r)
  return [...seen.values()]
}
export async function listSourceRecords(batchKey) {
  return unwrap(await sb().from('inventory_source_review').select('*').eq('batch_key', batchKey)
    .order('source_section', { ascending: false }).order('source_row'))
}
export async function itemSourceRecords(itemId) {
  return unwrap(await sb().from('inventory_source_records')
    .select('id, batch_key, source_doc, source_section, source_page, source_row, source_serial, original_name, qty_reported, qty_isd_lab, qty_old_project, qty_available_reported, remarks, status, applied_at')
    .eq('item_id', itemId).order('applied_at', { ascending: false }))
}
export const applySourceRecord = ({ recordId, itemId = null, available, damaged, requestable, name = null, category = null, note = null }) =>
  rpc('admin_apply_source_record', {
    p_record_id: recordId, p_item_id: itemId, p_available: available, p_damaged: damaged,
    p_requestable: requestable, p_name: name, p_category: category, p_note: note,
  })
export const revertSourceRecord = (recordId, reason) => rpc('admin_revert_source_record', { p_record_id: recordId, p_reason: reason })
export const skipSourceRecord = (recordId, reason) => rpc('admin_skip_source_record', { p_record_id: recordId, p_reason: reason })
export const applyReadySourceRecords = (batchKey) => rpc('admin_apply_ready_source_records', { p_batch_key: batchKey })
export const retireDemoInventory = (includeProjects = false) => rpc('admin_retire_demo_inventory', { p_include_projects: includeProjects })
/** Project requirements that point at demo, archived or lab-use-only items (need re-linking after an import). */
export async function projectLinksNeedingReview() {
  const items = unwrap(await sb().from('inventory_items').select('id, name, is_demo, is_archived, is_requestable')
    .or('is_demo.eq.true,is_archived.eq.true,is_requestable.eq.false'))
  if (!items.length) return []
  const comps = unwrap(await sb().from('project_components').select('project_id, item_id, qty_required').in('item_id', items.map((i) => i.id)))
  if (!comps.length) return []
  const projects = unwrap(await sb().from('projects').select('id, name, status, is_demo').in('id', [...new Set(comps.map((c) => c.project_id))]))
  const byItem = Object.fromEntries(items.map((i) => [i.id, i]))
  return projects
    .filter((p) => p.status !== 'archived')
    .map((p) => ({ ...p, links: comps.filter((c) => c.project_id === p.id).map((c) => ({ ...c, item: byItem[c.item_id] })) }))
    .sort((a, b) => Number(a.is_demo) - Number(b.is_demo) || a.name.localeCompare(b.name))
}
