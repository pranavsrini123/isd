import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

let channelSeq = 0

/**
 * Calls `onChange` (debounced) whenever any row in the given tables changes.
 * Realtime respects RLS, so a student only hears about rows they can see.
 * Used to keep stock, readiness and request queues live without polling.
 */
export function useRealtime(tables, onChange, { debounceMs = 400, enabled = true } = {}) {
  const cb = useRef(onChange)
  cb.current = onChange
  const key = tables.join(',')

  useEffect(() => {
    if (!supabase || !enabled || !tables.length) return undefined
    let timer
    const fire = () => {
      clearTimeout(timer)
      timer = setTimeout(() => cb.current?.(), debounceMs)
    }
    const channel = supabase.channel(`rt-${key}-${++channelSeq}`)
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire)
    }
    channel.subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, debounceMs])
}
