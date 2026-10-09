import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// The student's in-progress request ("request list"). Kept in sessionStorage so a
// refresh does not lose it. It holds no stock: stock is only checked/reserved by
// the database when the request is submitted and approved.
const CartContext = createContext(null)
const KEY = 'isdlab.cart.v1'

function load() {
  try {
    const raw = sessionStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && Array.isArray(parsed.lines) ? parsed : { lines: [], projectId: null, projectName: null }
  } catch {
    return { lines: [], projectId: null, projectName: null }
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
      projectId: project.id,
      projectName: project.name,
      lines: components.map((c) => ({ item_id: c.item_id, name: c.item_name, qty: c.qty_required })),
    })
  }, [])
  const clear = useCallback(() => setCart({ lines: [], projectId: null, projectName: null }), [])
  const clearProject = useCallback(() => setCart((c) => ({ ...c, projectId: null, projectName: null })), [])

  const value = useMemo(() => ({
    ...cart, count: cart.lines.length, addItem, setQty, removeItem, loadProject, clear, clearProject,
  }), [cart, addItem, setQty, removeItem, loadProject, clear, clearProject])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
