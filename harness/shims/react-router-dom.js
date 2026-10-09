// Harness stand-in for react-router-dom with the subset of the v7 API the app uses.
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, Children, isValidElement } from 'react'

const RouterCtx = createContext(null)
const RouteCtx = createContext({ outlet: null, params: {} })

function readLoc() {
  const { pathname, search, hash } = window.location
  return { pathname, search, hash, state: window.history.state?.usr ?? null, key: String(Math.random()) }
}

export function BrowserRouter({ children }) {
  const [loc, setLoc] = useState(readLoc)
  useEffect(() => {
    const on = () => setLoc(readLoc())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  const navigate = useCallback((to, opts = {}) => {
    if (typeof to === 'number') { window.history.go(to); return }
    const url = new URL(to, window.location.origin + window.location.pathname)
    const next = url.pathname + url.search + url.hash
    window.history[opts.replace ? 'replaceState' : 'pushState']({ usr: opts.state ?? null }, '', next)
    setLoc(readLoc())
    if (!opts.replace) window.scrollTo(0, 0)
  }, [])
  const value = useMemo(() => ({ loc, navigate }), [loc, navigate])
  return React.createElement(RouterCtx.Provider, { value }, children)
}

export function Route() { return null }

function routesFrom(children) {
  const out = []
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    if (c.type === React.Fragment) { out.push(...routesFrom(c.props.children)); return }
    out.push({ path: c.props.path, index: c.props.index, element: c.props.element, children: routesFrom(c.props.children) })
  })
  return out
}
const join = (a, b) => (b.startsWith('/') ? b : `${a.replace(/\/$/, '')}/${b}`)
function matchPath(pattern, path) {
  const ps = pattern.split('/').filter(Boolean)
  const xs = path.split('/').filter(Boolean)
  const params = {}
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] === '*') { params['*'] = xs.slice(i).join('/'); return { params, rest: [] } }
    if (i >= xs.length) return null
    if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(xs[i])
    else if (ps[i] !== xs[i]) return null
  }
  return { params, rest: xs.slice(ps.length) }
}
// Returns the chain of matched routes or null. Full-path matches only.
function match(routes, path, base) {
  for (const r of routes) {
    if (r.index) { if (path.replace(/\/$/, '') === base.replace(/\/$/, '') || (base === '/' && path === '/')) return [{ route: r, params: {} }]; continue }
    if (r.path === undefined) {
      const inner = match(r.children, path, base)
      if (inner) return [{ route: r, params: {} }, ...inner]
      continue
    }
    const full = join(base, r.path)
    if (r.children.length) {
      const m = matchPath(full, path)
      const prefix = matchPrefix(full, path)
      if (prefix) {
        const inner = match(r.children, path, full)
        if (inner) return [{ route: r, params: prefix }, ...inner]
        if (m && m.rest.length === 0 && r.element) return [{ route: r, params: m.params }]
      }
      continue
    }
    const m = matchPath(full, path)
    if (m && (m.rest.length === 0 || full.endsWith('*'))) return [{ route: r, params: m.params }]
  }
  return null
}
function matchPrefix(pattern, path) {
  const ps = pattern.split('/').filter(Boolean)
  const xs = path.split('/').filter(Boolean)
  if (xs.length < ps.length) return null
  const params = {}
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) params[ps[i].slice(1)] = xs[i]
    else if (ps[i] !== xs[i]) return null
  }
  return params
}

export function Routes({ children }) {
  const { loc } = useContext(RouterCtx)
  const chain = match(routesFrom(children), loc.pathname, '/')
  if (!chain) return null
  const params = Object.assign({}, ...chain.map((c) => c.params))
  let el = null
  for (let i = chain.length - 1; i >= 0; i--) {
    el = React.createElement(RouteCtx.Provider, { value: { outlet: el, params } }, chain[i].route.element ?? React.createElement(Outlet))
  }
  return el
}

export function Outlet() { return useContext(RouteCtx).outlet }
export function useNavigate() { return useContext(RouterCtx).navigate }
export function useLocation() { return useContext(RouterCtx).loc }
export function useParams() { return useContext(RouteCtx).params }
export function useSearchParams() {
  const { loc, navigate } = useContext(RouterCtx)
  const params = useMemo(() => new URLSearchParams(loc.search), [loc.search])
  const set = useCallback((next, opts = {}) => {
    const cur = new URLSearchParams(window.location.search)
    const v = typeof next === 'function' ? next(cur) : new URLSearchParams(next)
    const s = v.toString()
    navigate(window.location.pathname + (s ? `?${s}` : ''), opts)
  }, [navigate])
  return [params, set]
}
export function Navigate({ to, replace, state }) {
  const navigate = useNavigate()
  useEffect(() => { navigate(to, { replace, state }) }, []) // eslint-disable-line
  return null
}
export const Link = React.forwardRef(function Link({ to, replace, state, onClick, ...rest }, ref) {
  const navigate = useNavigate()
  return React.createElement('a', {
    ref, href: to, ...rest,
    onClick: (e) => {
      onClick?.(e)
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || rest.target) return
      e.preventDefault()
      navigate(to, { replace, state })
    },
  })
})
export const NavLink = React.forwardRef(function NavLink({ to, end, className, children, ...rest }, ref) {
  const { loc } = useContext(RouterCtx)
  const isActive = end ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + '/')
  const cls = typeof className === 'function' ? className({ isActive }) : className
  return React.createElement(Link, { ref, to, className: cls, 'aria-current': isActive ? 'page' : undefined, ...rest },
    typeof children === 'function' ? children({ isActive }) : children)
})
