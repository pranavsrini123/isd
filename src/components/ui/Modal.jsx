import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, useIsPresent } from 'motion/react'
import { X } from 'lucide-react'
import { Button, cx } from './primitives'
import { usePortal } from './portal'
import { EASE_OUT, m, useMotionOK } from './motion'
import { useMediaQuery } from '../../hooks/useMediaQuery'

const SHEET = { type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }

/**
 * Accessible modal: focus moves in, Escape closes, background scroll is locked.
 * Student/public: a centred card on desktop, a bottom sheet on phones, or a side drawer,
 * each with enter/exit motion. Admin: the same frames, shown instantly.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', side = false }) {
  const ref = useRef(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const ok = useMotionOK()
  const admin = usePortal() === 'admin'
  const wide = useMediaQuery('(min-width: 640px)')

  useEffect(() => {
    if (!open) return undefined
    const prev = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.() }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setTimeout(() => {
      const el = ref.current?.querySelector('input,select,textarea,button:not([data-close])')
      ;(el || ref.current)?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [open])

  const frame = open && (
    <Frame key="modal" panelRef={ref} titleId={titleId} onClose={onClose} title={title} description={description}
      footer={footer} size={size} side={side} ok={ok} admin={admin} wide={wide}>
      {children}
    </Frame>
  )
  return createPortal(ok ? <AnimatePresence>{frame}</AnimatePresence> : frame || null, document.body)
}

function Frame({ panelRef, titleId, onClose, title, description, footer, size, side, ok, admin, wide, children }) {
  // While an exit animation plays the old panel is no longer "the dialog".
  const present = useIsPresent()
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]
  const Overlay = ok ? m.div : 'div'
  const Panel = ok ? m.div : 'div'
  const sheet = !side && !wide
  const overlayMotion = ok ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.22 } } : {}
  const panelMotion = !ok ? {}
    : side ? { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' }, transition: SHEET }
    : sheet ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: SHEET }
    : { initial: { opacity: 0, y: 18, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 10, scale: 0.98 }, transition: { duration: 0.32, ease: EASE_OUT } }

  return (
    <div className={cx('fixed inset-0 z-50 flex', side ? 'justify-end' : 'items-end justify-center p-0 sm:items-center sm:p-4', !present && 'pointer-events-none')}
      aria-hidden={present ? undefined : true}
      onMouseDown={(e) => { if (e.target === e.currentTarget || e.target.dataset.overlay) onClose?.() }}>
      <Overlay data-overlay="1" className={cx('absolute inset-0', admin ? 'bg-night/50' : 'bg-night/55 backdrop-blur-[3px]')} {...overlayMotion} />
      <Panel ref={panelRef} role={present ? 'dialog' : undefined} aria-modal={present ? 'true' : undefined} aria-labelledby={titleId} tabIndex={-1}
        className={cx('relative flex w-full flex-col bg-white focus:outline-none',
          admin ? 'shadow-2xl' : 'shadow-pop',
          side ? cx('h-full max-h-[100dvh] max-w-xl', !admin && 'sm:rounded-l-[24px]')
            : cx(width, 'max-h-[92dvh]', admin ? 'rounded-t-2xl sm:rounded-xl' : 'rounded-t-[26px] sm:rounded-[24px]'))}
        {...panelMotion}>
        {sheet && !admin && <span className="mx-auto mt-2.5 h-1.5 w-10 flex-none rounded-full bg-slate-200" aria-hidden />}
        <div className={cx('flex items-start justify-between gap-4 border-b border-line', admin ? 'px-6 py-4' : 'px-5 py-4 sm:px-6 sm:py-5')}>
          <div className="min-w-0">
            <h2 id={titleId} className={cx('font-semibold', admin ? 'text-lg' : 'text-[19px]')}>{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button data-close onClick={onClose} aria-label="Close"
            className="-mr-1 flex h-9 w-9 flex-none items-center justify-center rounded-full text-muted transition-colors hover:bg-slate-100 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={cx('flex-1 overflow-y-auto', admin ? 'px-6 py-5' : 'px-5 py-5 sm:px-6')}>{children}</div>
        {footer && (
          <div className={cx('flex flex-wrap justify-end gap-2 border-t border-line bg-slate-50/70', admin ? 'px-6 py-4' : 'px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:rounded-b-[24px]')}>
            {footer}
          </div>
        )}
      </Panel>
    </div>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', tone = 'primary', loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant={tone} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>}>
      <div className="text-sm leading-relaxed text-muted">{children}</div>
    </Modal>
  )
}
