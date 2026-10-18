import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Continuous-scroll loader. `fetchBatch(offset, limit)` must return { data, count }.
 *
 * - Loads the first batch whenever `deps` (filters) change and discards any
 *   in-flight responses from the previous filters, so results never mix.
 * - `loadMore()` appends the next batch; rows are de-duplicated by `id`, so a
 *   row that shifts position between batches is never shown twice.
 * - `refresh()` re-reads everything already loaded in one request (used by
 *   Realtime), so quantities update in place without losing the scroll position.
 * - `sentinelRef` goes on an element at the end of the list: when it scrolls
 *   into view, the next batch loads automatically.
 */
export function useInfiniteList(fetchBatch, deps, { batchSize = 24 } = {}) {
  const [items, setItems] = useState([])
  const [count, setCount] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const gen = useRef(0) // increments when filters change
  const busy = useRef(false)
  const state = useRef({ items: [], count: null })
  const fetchRef = useRef(fetchBatch)
  fetchRef.current = fetchBatch

  const apply = (next, total) => {
    state.current = { items: next, count: total }
    setItems(next)
    setCount(total)
  }

  const load = useCallback(async (mode) => {
    const g = gen.current
    if (mode === 'more' && (busy.current || (state.current.count !== null && state.current.items.length >= state.current.count))) return
    if (mode === 'refresh' && busy.current) { setTimeout(() => load('refresh'), 400); return }
    busy.current = true
    setLoading(true)
    try {
      const have = state.current.items
      const [offset, limit] = mode === 'more' ? [have.length, batchSize]
        : mode === 'refresh' ? [0, Math.max(have.length, batchSize)]
        : [0, batchSize]
      const { data, count: total } = await fetchRef.current(offset, limit)
      if (g !== gen.current) return // filters changed meanwhile: drop this response
      const merged = mode === 'more' ? [...have, ...data] : data
      const seen = new Set()
      apply(merged.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))), total ?? merged.length)
      setError(null)
    } catch (e) {
      if (g === gen.current) setError(e)
    } finally {
      if (g === gen.current) { busy.current = false; setLoading(false) }
    }
  }, [batchSize])

  useEffect(() => {
    gen.current += 1
    busy.current = false
    apply([], null)
    load('reset')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Auto-load when the sentinel becomes visible.
  const observer = useRef(null)
  const sentinelRef = useCallback((node) => {
    observer.current?.disconnect()
    if (!node) return
    observer.current = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) load('more')
    }, { rootMargin: '600px 0px' })
    observer.current.observe(node)
    // Re-observing after every batch makes the observer report the current
    // position again, so a short list keeps filling until the page can scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, items.length])
  useEffect(() => () => observer.current?.disconnect(), [])

  const hasMore = count === null || items.length < count
  return {
    items, count, error, loading, hasMore,
    isInitialLoading: loading && items.length === 0 && count === null,
    loadMore: () => load('more'),
    refresh: () => load('refresh'),
    retry: () => load(items.length ? 'more' : 'reset'),
    sentinelRef,
  }
}
