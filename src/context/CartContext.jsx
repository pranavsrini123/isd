import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// The student's in-progress request ("request list"). Kept in sessionStorage so a
// refresh does not lose it. It holds no stock: stock is only checked/reserved by
// the database when the request is submitted and approved.
const CartContext = createContext(null)
const KEY = 'isdlab.cart.v1'
const EMPTY = { lines: [], projectId: null, projectName: null, purpose: null }

function load() {
  try {
    const raw = sessionStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && Array.isArray(parsed.lines) ? parsed : EMPTY
  } catch {
    return EMPTY
  }
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(load)
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(cart)) } catch { /* storage unavailable */ }
  }, [cart])

  const addItem = useCallback((item, qty = 1) => {
    setCart((c) => {
      const existing = c.lines.find((l) => l.item_id === item.id)
      const lines = existing
        ? c.lines.map((l) => (l.item_id === item.id ? { ...l, qty: l.qty + qty } : l))
        : [...c.lines, { item_id: item.id, name: item.name, qty }]
      return { ...c, lines }
    })
  }, [])
  const setQty = useCallback((itemId, qty) => {
    setCart((c) => ({ ...c, lines: c.lines.map((l) => (l.item_id === itemId ? { ...l, qty } : l)) }))
  }, [])
  const removeItem = useCallback((itemId) => {
    setCart((c) => ({ ...c, lines: c.lines.filter((l) => l.item_id !== itemId) }))
  }, [])
  /** Starts a request for a project's full component list. */
  const loadProject = useCallback((project, components) => {
    setCart({
      purpose: null,
      projectId: project.id,
      projectName: project.name,
      lines: components.map((c) => ({ item_id: c.item_id, name: c.item_name, qty: c.qty_required })),
    })
  }, [])
  /**
   * "Request again" for a rejected request: copies its components, quantities and
   * purpose into a NEW draft. The old request is never modified; stock and dates
   * are re-checked on the request page and again by the database on submit.
   */
  const loadRequest = useCallback((r) => {
    setCart({
      projectId: r.project_name ? r.project_id : null,
      projectName: r.project_name || null,
      purpose: r.purpose || null,
      lines: (r.items || []).map((i) => ({ item_id: i.item_id, name: i.name, qty: i.qty })),
    })
  }, [])
  const clear = useCallback(() => setCart(EMPTY), [])
  const clearProject = useCallback(() => setCart((c) => ({ ...c, projectId: null, projectName: null })), [])

  const value = useMemo(() => ({
    ...cart, count: cart.lines.length, addItem, setQty, removeItem, loadProject, loadRequest, clear, clearProject,
  }), [cart, addItem, setQty, removeItem, loadProject, loadRequest, clear, clearProject])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
