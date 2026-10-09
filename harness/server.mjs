// Harness API server: serves the bundle and runs client queries against Postgres
// as role "authenticated" with request.jwt.claim.sub = the signed-in user.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const PORT = Number(process.env.PORT || 5199)
const DB = process.env.PGDB || 'isdtest'
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out')
const STORE = path.join(OUT, '_storage')
let version = 1

function psql(sql) {
  const r = spawnSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGTEST_PORT || '54329', '-U', 'postgres', '-d', DB, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: '\\set VERBOSITY verbose\n' + sql, encoding: 'utf8' })
  if (r.status !== 0) {
    const line = (r.stderr.split('\n').find((l) => l.includes('ERROR:')) || r.stderr).replace(/^.*ERROR:\s+/, '')
    const m = /^([0-9A-Z]{5}): (.*)$/.exec(line)
    return { error: { code: m ? m[1] : null, message: m ? m[2] : line } }
  }
  return { out: r.stdout.trim() }
}
const lit = (v) => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')) return `'{${v.map((x) => `"${String(x).replace(/["\\]/g, '\\$&')}"`).join(',')}}'`
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`); return `"${s}"` }
function asUser(uid, stmt) {
  const role = uid ? 'authenticated' : 'anon'
  return `begin;\nset local "request.jwt.claim.sub" = ${lit(uid || '')};\nset local role ${role};\n${stmt};\ncommit;\n`
}
function splitTop(s) {
  const out = []; let depth = 0; let cur = ''
  for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch }
  if (cur) out.push(cur)
  return out
}
function where(q) {
  const parts = []
  for (const f of q.filters) {
    const c = ident(f.col)
    if (f.op === 'in') parts.push(f.val.length ? `${c} in (${f.val.map(lit).join(',')})` : 'false')
    else if (f.op === 'is') parts.push(`${c} is ${f.val === null ? 'null' : f.val ? 'true' : 'false'}`)
    else parts.push(`${c} ${{ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', ilike: 'ilike' }[f.op]} ${lit(f.val)}`)
  }
  for (const expr of q.or) {
    const ors = splitTop(expr).map((t) => {
      const [col, op, ...rest] = t.split('.')
      const val = rest.join('.')
      return `${ident(col)} ${{ eq: '=', ilike: 'ilike' }[op]} ${lit(val)}`
    })
    parts.push(`(${ors.join(' or ')})`)
  }
  return parts.length ? ` where ${parts.join(' and ')}` : ''
}
const cols = (s) => (s === '*' || !s ? '*' : s.split(',').map((c) => ident(c.trim())).join(', '))

function rest(uid, q) {
  const t = `public.${ident(q.table)}`
  let stmt
  if (q.op === 'select') {
    const base = `select ${cols(q.select)} from ${t}${where(q)}`
    let ordered = base + (q.order.length ? ` order by ${q.order.map((o) => `${ident(o.col)} ${o.asc ? 'asc' : 'desc'}`).join(', ')}` : '')
    if (q.range) ordered += ` limit ${q.range[1] - q.range[0] + 1} offset ${q.range[0]}`
    else if (q.limit) ordered += ` limit ${Number(q.limit)}`
    stmt = `select json_build_object('data', coalesce((select json_agg(x) from (${ordered}) x), '[]'::json), 'count', ${q.count ? `(select count(*) from (${base}) c)` : 'null'})`
  } else if (q.op === 'insert' || q.op === 'upsert') {
    const rows = Array.isArray(q.body) ? q.body : [q.body]
    const keys = Object.keys(rows[0]).map(ident)
    const src = `select ${keys.join(', ')} from json_populate_recordset(null::${t}, ${lit(rows)})`
    let ins = `insert into ${t} (${keys.join(', ')}) ${src}`
    if (q.op === 'upsert') {
      const conf = q.onConflict.split(',').map((c) => ident(c.trim()))
      const upd = keys.filter((k) => !conf.includes(k)).map((k) => `${k} = excluded.${k}`)
      ins += ` on conflict (${conf.join(', ')}) do ${upd.length ? `update set ${upd.join(', ')}` : 'nothing'}`
    }
    stmt = `with r as (${ins} returning *) select json_build_object('data', coalesce((select json_agg(r) from r), '[]'::json), 'count', null)`
  } else if (q.op === 'update') {
    const keys = Object.keys(q.body).map(ident)
    if (!q.filters.length) throw new Error('update requires a filter')
    const up = `update ${t} set (${keys.join(', ')}) = (select ${keys.join(', ')} from json_populate_record(null::${t}, ${lit(q.body)}))${where(q)}`
    stmt = `with r as (${up} returning *) select json_build_object('data', coalesce((select json_agg(r) from r), '[]'::json), 'count', null)`
  } else if (q.op === 'delete') {
    if (!q.filters.length) throw new Error('delete requires a filter')
    stmt = `with r as (delete from ${t}${where(q)} returning *) select json_build_object('data', coalesce((select json_agg(r) from r), '[]'::json), 'count', null)`
  }
  const r = psql(asUser(uid, stmt))
  if (r.error) return { data: null, error: r.error }
  if (q.op !== 'select') version++
  let { data, count } = JSON.parse(r.out)
  if (q.op !== 'select' && !q.returning && !q.single) data = null
  if (q.single) {
    if (data.length > 1 || (q.single === 'single' && data.length === 0)) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
    data = data[0] ?? null
  }
  return { data, error: null, count }
}

const fnMeta = {}
function rpc(uid, fn, args) {
  if (!/^[a-z_]+$/.test(fn)) return { error: { message: 'bad function' } }
  if (!fnMeta[fn]) {
    const m = psql(`select json_build_object('set', p.proretset, 'type', t.typname) from pg_proc p join pg_type t on t.oid = p.prorettype where p.proname = ${lit(fn)} and p.pronamespace = 'public'::regnamespace limit 1`)
    if (m.error || !m.out) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } }
    fnMeta[fn] = JSON.parse(m.out)
  }
  const call = `public.${fn}(${Object.entries(args).map(([k, v]) => `${ident(k)} => ${lit(v)}`).join(', ')})`
  const meta = fnMeta[fn]
  const stmt = meta.set ? `select coalesce(json_agg(x), '[]'::json) from ${call} x`
    : meta.type === 'void' ? `select 'null'::json from (select ${call}) x`
    : `select to_json(x) from ${call} x`
  const r = psql(asUser(uid, stmt))
  if (r.error) return { data: null, error: r.error }
  if (!/^(get_|report_|admin_dashboard)/.test(fn)) version++
  return { data: JSON.parse(r.out || 'null'), error: null }
}

function userJson(id) {
  const r = psql(`select json_build_object('id', id, 'email', email, 'email_confirmed_at', email_confirmed_at) from auth.users where id = ${lit(id)}`)
  return r.out ? JSON.parse(r.out) : null
}
function auth(uid, route, b) {
  psql('create schema if not exists harness; create table if not exists harness.passwords (email text primary key, password text not null);')
  if (route === 'signup') {
    if (!b.password || b.password.length < 6) return { error: { message: 'Password should be at least 6 characters' } }
    const exists = psql(`select 1 from auth.users where lower(email) = lower(${lit(b.email)})`)
    if (exists.out) return { data: { user: { id: null } }, error: null }
    const ins = psql(`insert into auth.users (email, raw_user_meta_data) values (${lit(b.email)}, ${lit(b.data || {})}) returning id`)
    if (ins.error) return { error: { message: 'Database error saving new user' } }
    psql(`insert into harness.passwords values (lower(${lit(b.email)}), ${lit(b.password)})`)
    version++
    return { data: { user: userJson(ins.out) }, error: null }
  }
  if (route === 'signin') {
    const r = psql(`select u.id from auth.users u join harness.passwords p on p.email = lower(u.email) where lower(u.email) = lower(${lit(b.email)}) and p.password = ${lit(b.password)}`)
    if (!r.out) return { error: { message: 'Invalid login credentials' } }
    const user = userJson(r.out)
    if (!user.email_confirmed_at) return { error: { message: 'Email not confirmed' } }
    return { data: { user, session: { access_token: user.id, user } }, error: null }
  }
  if (route === 'user') {
    const user = uid && userJson(uid)
    return user ? { data: { user }, error: null } : { error: { message: 'invalid session' } }
  }
  if (route === 'update') {
    psql(`update harness.passwords set password = ${lit(b.password)} where email = (select lower(email) from auth.users where id = ${lit(uid)})`)
    return { data: {}, error: null }
  }
  return { error: { message: 'unknown auth route' } }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' }
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const uid = (req.headers.authorization || '').replace(/^Bearer\s*/, '') || null
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)) }
  if (req.method === 'GET' && url.pathname === '/changes') return send(200, { version })
  if (req.method === 'GET' && url.pathname === '/__confirm') { psql(`update auth.users set email_confirmed_at = now() where lower(email) = lower(${lit(url.searchParams.get('email'))})`); return send(200, { ok: true }) }
  if (req.method === 'GET' && url.pathname.startsWith('/storage/object/')) {
    const f = path.join(STORE, url.pathname.slice('/storage/object/'.length))
    if (!f.startsWith(STORE) || !fs.existsSync(f)) return send(404, 'not found', 'text/plain')
    return send(200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream')
  }
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    try {
      if (req.method === 'POST' && url.pathname === '/storage/upload') {
        const isAdmin = psql(asUser(uid, 'select public.is_admin()')).out === 't'
        if (!isAdmin) return send(200, { data: null, error: { message: 'new row violates row-level security policy' } })
        const f = path.join(STORE, url.searchParams.get('path'))
        if (!f.startsWith(STORE)) return send(400, { error: { message: 'bad path' } })
        fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.concat(chunks))
        return send(200, { data: { path: url.searchParams.get('path') }, error: null })
      }
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
      if (req.method === 'POST' && url.pathname === '/rest') return send(200, rest(uid, body))
      if (req.method === 'POST' && url.pathname === '/rpc') return send(200, rpc(uid, body.fn, body.args || {}))
      if (req.method === 'POST' && url.pathname.startsWith('/auth/')) return send(200, auth(uid, url.pathname.slice(6), body))
    } catch (e) {
      return send(200, { data: null, error: { message: String(e.message || e) } })
    }
    // static files with SPA fallback
    let f = path.join(OUT, decodeURIComponent(url.pathname))
    if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(OUT, 'index.html')
    send(200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream')
  })
}).listen(PORT, () => console.log(`harness on http://localhost:${PORT}`))
