import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, useReducedMotion } from 'motion/react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { EASE_OUT, m } from '../components/ui/motion'

const ToastContext = createContext(null)
let nextId = 1

const STYLES = {
  success: { icon: CheckCircle2, tile: 'bg-ok-bg text-ok', bar: 'bg-ok-solid' },
  error: { icon: AlertTriangle, tile: 'bg-bad-bg text-bad', bar: 'bg-bad-solid' },
  info: { icon: Info, tile: 'bg-cyan-soft text-brand', bar: 'bg-cyan' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Toasts slide in on student and public pages; the admin console shows them without motion.
  const admin = useLocation().pathname.startsWith('/admin')
  const reduced = useReducedMotion()
  const animate = !admin && !reduced
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback((type, message) => {
    const id = nextId++
    setToasts((t) => [...t.slice(-3), { id, type, message }])
    setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000)
  }, [dismiss])
  const api = useMemo(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', typeof m === 'string' ? m : m?.message || 'Something went wrong'),
    info: (m) => push('info', m),
  }), [push])

  const Item = animate ? m.div : 'div'
  const list = toasts.map((t) => {
    const { icon: Icon, tile, bar } = STYLES[t.type]
    const motion = animate ? {
      initial: { opacity: 0, y: 18, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, x: 28, scale: 0.97, transition: { duration: 0.2 } }, transition: { duration: 0.4, ease: EASE_OUT },
    } : {}
    return (
      <Item key={t.id} role={t.type === 'error' ? 'alert' : 'status'} {...motion}
        className="pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-2xl border border-white/80 bg-white/90 py-3 pl-4 pr-3 shadow-pop backdrop-blur-xl">
        <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden />
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-xl ${tile}`}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
        <p className="flex-1 pt-1.5 text-sm font-medium text-ink">{t.message}</p>
        <button onClick={() => dismiss(t.id)} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-slate-100 hover:text-ink" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </Item>
    )
  })

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)] sm:items-end sm:pr-6" aria-live="polite">
        {animate ? <AnimatePresence initial={false}>{list}</AnimatePresence> : list}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
