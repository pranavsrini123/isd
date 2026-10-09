import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Filters kept in the URL so they survive refresh and can be shared. */
export function useSearchState(defaults) {
  const [params, setParams] = useSearchParams()
  const values = {}
  for (const [k, d] of Object.entries(defaults)) {
    const raw = params.get(k)
    if (raw === null) values[k] = d
    else if (typeof d === 'number') values[k] = Number(raw) || d
    else if (typeof d === 'boolean') values[k] = raw === '1'
    else values[k] = raw
  }
  const set = useCallback((patch) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        const d = defaults[k]
        if (v === d || v === '' || v === null || v === undefined || v === false) next.delete(k)
        else next.set(k, typeof v === 'boolean' ? '1' : String(v))
      }
      // Changing any filter returns to page 1 unless the page itself is being set.
      if (!('page' in patch)) next.delete('page')
      return next
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParams])
  return [values, set]
}
