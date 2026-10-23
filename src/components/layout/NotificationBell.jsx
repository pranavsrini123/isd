import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { Bell, CheckCheck } from 'lucide-react'
import { listNotifications, markNotificationsRead } from '../../lib/api'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { timeAgo } from '../../lib/format'
import { cx } from '../ui/primitives'
import { usePortal } from '../ui/portal'
import { EASE_OUT, m, useMotionOK } from '../ui/motion'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const box = useRef(null)
  const ok = useMotionOK()
  const admin = usePortal() === 'admin'
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

  const Panel = ok ? m.div : 'div'
  const panel = open && (
    <Panel key="panel"
      {...(ok ? { initial: { opacity: 0, y: -6, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.15 } }, transition: { duration: 0.28, ease: EASE_OUT } } : {})}
      style={{ transformOrigin: 'top right' }}
      className={cx('absolute right-0 z-40 mt-2 w-[min(23rem,calc(100vw-2rem))] overflow-hidden',
        admin ? 'rounded-xl border border-line bg-white shadow-xl' : 'rounded-[20px] border border-line bg-white shadow-pop')}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="font-display font-semibold">Notifications</p>
        {unread > 0 && (
          <button onClick={markAll} className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand hover:underline">
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>
      <ul className="max-h-96 overflow-y-auto py-1">
        {data.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</li>}
        {data.map((n) => (
          <li key={n.id}>
            <button onClick={() => openItem(n)} className={cx('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50', !n.read_at && 'bg-cyan/[.05]')}>
              <span className={cx('mt-1.5 h-2 w-2 flex-none rounded-full', n.read_at ? 'bg-transparent' : 'bg-cyan shadow-[0_0_8px_rgb(34_211_238/0.9)]')} aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{n.title}</span>
                {n.body && <span className="block text-[13px] leading-snug text-muted">{n.body}</span>}
                <span className="mt-1 block text-xs text-subtle">{timeAgo(n.created_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className={cx('relative flex h-10 w-10 items-center justify-center rounded-xl border text-ink transition-colors',
          admin ? 'border-line bg-white hover:bg-slate-50' : 'border-line bg-white/80 hover:bg-white',
          open && 'border-[#A9B8CC] bg-white')}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="num absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10.5px] font-semibold text-white ring-2 ring-page">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {ok ? <AnimatePresence>{panel}</AnimatePresence> : panel}
    </div>
  )
}
