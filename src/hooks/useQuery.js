import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Small data-loading hook: runs `fn` when `deps` change, keeps the last good
 * data while refetching (no flashing), ignores out-of-order responses, and
 * exposes `refetch` for realtime updates or after a mutation.
 */
export function useQuery(fn, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled })
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(async () => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true }))
    try {
      const data = await fnRef.current()
      if (id === seq.current) setState({ data, error: null, loading: false })
    } catch (error) {
      if (id === seq.current) setState((s) => ({ data: s.data, error, loading: false }))
    }
  }, [])

  useEffect(() => {
    if (enabled) run()
    else setState((s) => ({ ...s, loading: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  return { ...state, refetch: run, isInitialLoading: state.loading && state.data === undefined }
}

/** Wraps an async action with pending/error state. */
export function useAction(fn) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const run = useCallback(async (...args) => {
    setPending(true)
    setError(null)
    try {
      return await fnRef.current(...args)
    } catch (e) {
      setError(e)
      throw e
    } finally {
      setPending(false)
    }
  }, [])
  return { run, pending, error, setError }
}
