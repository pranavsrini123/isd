import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { listNotifications, markNotificationsRead } from '../../lib/api'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { timeAgo } from '../../lib/format'
import { cx } from '../ui/primitives'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const box = useRef(null)
  const { data = [], refetch } = useQuery(() => listNotifications(20), [])
  useRealtime(['notifications'], refetch)
  const unread = data.filter((n) => !n.read_at).length

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  async function openItem(n) {
    setOpen(false)
    if (!n.read_at) { await markNotificationsRead([n.id]).catch(() => {}); refetch() }
    if (n.link) nav(n.link)
  }
  async function markAll() {
    await markNotificationsRead().catch(() => {})
    refetch()
  }

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-ink hover:bg-slate-50">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {data.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</li>}
            {data.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50', !n.read_at && 'bg-info-bg/40')}>
                  <span className={cx('mt-1.5 h-2 w-2 flex-none rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{n.title}</span>
                    {n.body && <span className="block text-[13px] text-muted">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-[#8A97AB]">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
