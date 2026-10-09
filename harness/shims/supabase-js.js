// Harness stand-in for @supabase/supabase-js. Implements the subset of the client
// API used by src/lib/*.js and forwards everything to harness/server.mjs, which runs
// it against the real Postgres as the signed-in user (so RLS applies).
const KEY = 'harness.session'

class Query {
  constructor(base, table) {
    this.base = base
    this.q = { table, op: 'select', select: '*', filters: [], or: [], order: [], range: null, limit: null, single: null, count: null }
  }
  select(cols = '*', opts = {}) { if (this.q.op === 'select') this.q.select = cols; else this.q.returning = cols; if (opts.count) this.q.count = opts.count; return this }
  insert(body) { this.q.op = 'insert'; this.q.body = body; return this }
  update(body) { this.q.op = 'update'; this.q.body = body; return this }
  upsert(body, opts = {}) { this.q.op = 'upsert'; this.q.body = body; this.q.onConflict = opts.onConflict; return this }
  delete() { this.q.op = 'delete'; return this }
  _f(op, col, val) { this.q.filters.push({ op, col, val }); return this }
  eq(c, v) { return this._f('eq', c, v) }
  neq(c, v) { return this._f('neq', c, v) }
  gt(c, v) { return this._f('gt', c, v) }
  gte(c, v) { return this._f('gte', c, v) }
  lt(c, v) { return this._f('lt', c, v) }
  lte(c, v) { return this._f('lte', c, v) }
  in(c, v) { return this._f('in', c, v) }
  ilike(c, v) { return this._f('ilike', c, v) }
  is(c, v) { return this._f('is', c, v) }
  or(expr) { this.q.or.push(expr); return this }
  order(col, opts = {}) { this.q.order.push({ col, asc: opts.ascending !== false }); return this }
  range(a, b) { this.q.range = [a, b]; return this }
  limit(n) { this.q.limit = n; return this }
  single() { this.q.single = 'single'; return this }
  maybeSingle() { this.q.single = 'maybe'; return this }
  then(res, rej) { return this.base._post('/rest', this.q).then(res, rej) }
}

class Channel {
  constructor(client, name) { this.client = client; this.name = name; this.handlers = [] }
  on(_type, _filter, cb) { this.handlers.push(cb); return this }
  subscribe() { this.client._channels.add(this); return this }
}

export function createClient(url) {
  const listeners = new Set()
  const client = {
    _channels: new Set(),
    _session: (() => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } })(),
    async _post(path, body) {
      try {
        const r = await fetch(url + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: client._session ? `Bearer ${client._session.access_token}` : '' },
          body: JSON.stringify(body),
        })
        return await r.json()
      } catch (e) {
        return { data: null, error: { message: 'Failed to fetch' } }
      }
    },
    _setSession(s, event) {
      client._session = s
      if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY)
      for (const l of listeners) l(event, s)
    },
    from(table) { return new Query(client, table) },
    rpc(fn, args = {}) { return client._post('/rpc', { fn, args }) },
    channel(name) { return new Channel(client, name) },
    removeChannel(ch) { client._channels.delete(ch) },
    storage: {
      from(bucket) {
        return {
          getPublicUrl: (path) => ({ data: { publicUrl: `${url}/storage/object/${bucket}/${path}` } }),
          async upload(path, file) {
            const r = await fetch(`${url}/storage/upload?path=${encodeURIComponent(bucket + '/' + path)}`, {
              method: 'POST', body: file, headers: { authorization: client._session ? `Bearer ${client._session.access_token}` : '' },
            })
            return r.json()
          },
        }
      },
    },
    auth: {
      async getSession() {
        if (client._session) {
          const r = await client._post('/auth/user', {})
          if (r.error) { client._setSession(null, 'SIGNED_OUT'); return { data: { session: null } } }
          client._session = { ...client._session, user: r.data.user }
        }
        return { data: { session: client._session } }
      },
      onAuthStateChange(cb) { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } } },
      async signInWithPassword({ email, password }) {
        const r = await client._post('/auth/signin', { email, password })
        if (r.error) return { data: { user: null, session: null }, error: r.error }
        client._setSession(r.data.session, 'SIGNED_IN')
        return { data: r.data, error: null }
      },
      async signUp({ email, password, options }) {
        const r = await client._post('/auth/signup', { email, password, data: options?.data })
        return r.error ? { data: { user: null, session: null }, error: r.error } : { data: { user: r.data.user, session: null }, error: null }
      },
      async resend() { return { error: null } },
      async signOut() { client._setSession(null, 'SIGNED_OUT'); return { error: null } },
      async resetPasswordForEmail() { return { error: null } },
      async updateUser({ password }) { const r = await client._post('/auth/update', { password }); return { error: r.error } },
    },
  }
  // "Realtime": poll a change counter and notify every subscribed channel.
  let version = null
  setInterval(async () => {
    if (!client._channels.size) return
    try {
      const v = (await (await fetch(url + '/changes')).json()).version
      if (version !== null && v !== version) for (const ch of client._channels) ch.handlers.forEach((h) => h({}))
      version = v
    } catch { /* ignore */ }
  }, 1000)
  return client
}
