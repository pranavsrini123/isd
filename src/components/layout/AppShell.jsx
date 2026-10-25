import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, useIsPresent } from 'motion/react'
import { LogOut, Menu, X } from 'lucide-react'
import { Logo, LogoMark } from './Logo'
import { NotificationBell } from './NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { PortalContext, SurfaceContext } from '../ui/portal'
import { Avatar, PageLoader, cx } from '../ui/primitives'
import { PageTransition, m, useMotionOK } from '../ui/motion'

const WIDTH = { student: 'w-[264px]', admin: 'w-[236px]' }
const PAD = { student: 'lg:pl-[264px]', admin: 'lg:pl-[236px]' }

/**
 * Shared shell for both portals. `portal` switches the look:
 *  student: glowing night sidebar, frosted top bar over a softly lit page, page motion
 *  admin:   flat near-black sidebar, plain top bar, no motion
 */
export function AppShell({ portal, nav, topRight, switchLink, banner }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  const admin = portal === 'admin'

  return (
    <PortalContext.Provider value={portal}>
      <ShellBody portal={portal} admin={admin} nav={nav} topRight={topRight} switchLink={switchLink} banner={banner}
        open={open} setOpen={setOpen} pathname={loc.pathname} />
    </PortalContext.Provider>
  )
}

function ShellBody({ portal, admin, nav, topRight, switchLink, banner, open, setOpen, pathname }) {
  const ok = useMotionOK()
  const drawer = open && <MenuDrawer key="menu" ok={ok} portal={portal} onClose={() => setOpen(false)}>
    <Sidebar admin={admin} nav={nav} switchLink={switchLink} onClose={() => setOpen(false)} />
  </MenuDrawer>

  return (
    <div className={cx('relative isolate min-h-dvh', admin ? 'bg-page-admin' : 'bg-page')}>
      {!admin && <PageGlow />}
      <aside className={cx('fixed inset-y-0 left-0 z-30 hidden lg:block', WIDTH[portal])}>
        <Sidebar admin={admin} nav={nav} switchLink={switchLink} />
      </aside>
      {ok ? <AnimatePresence>{drawer}</AnimatePresence> : drawer}
      <div className={PAD[portal]}>
        <header className={cx('sticky top-0 z-20 flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-10',
          admin ? 'border-b border-line bg-white/90 backdrop-blur'
            : 'border-b border-white/70 bg-page/70 shadow-[0_1px_0_rgb(15_23_42/0.04)] backdrop-blur-xl backdrop-saturate-150')}>
          <button className={cx('flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors lg:hidden',
            admin ? 'hover:bg-slate-100' : 'border border-line bg-white/80 hover:bg-white')} onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2 lg:hidden" aria-hidden>
            <LogoMark size={28} />
            <span className="font-display text-[17px] font-semibold tracking-tight">ISD Lab</span>
          </span>
          <div className="min-w-0 flex-1">{topRight?.left}</div>
          {topRight?.right}
          <NotificationBell />
        </header>
        {banner}
        <main className={cx('relative mx-auto w-full px-4 pb-16 sm:px-6 lg:px-10', admin ? 'max-w-[1400px] pt-6 lg:pt-7' : 'max-w-[1320px] pt-5 sm:pt-6 lg:pt-8')}>
          <Suspense fallback={<PageLoader />}>
            <PageTransition key={pathname}>
              <Outlet />
            </PageTransition>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

/** Soft cyan / azure / iris light and a dot texture behind the student pages. */
function PageGlow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -right-40 -top-48 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.20),transparent)]" />
      <div className="absolute -left-24 top-1/3 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(139_124_255/0.12),transparent)] lg:left-[180px]" />
      <div className="absolute -bottom-56 right-1/4 h-[600px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgb(79_123_255/0.12),transparent)]" />
      <div className="tex-dots absolute inset-0 [mask-image:linear-gradient(180deg,#000,transparent_70%)]" />
    </div>
  )
}

function MenuDrawer({ ok, portal, onClose, children }) {
  const present = useIsPresent()
  const Overlay = ok ? m.div : 'div'
  const Panel = ok ? m.aside : 'aside'
  return (
    <div className={cx('fixed inset-0 z-40 lg:hidden', !present && 'pointer-events-none')}
      role={present ? 'dialog' : undefined} aria-modal={present ? 'true' : undefined} aria-label="Menu" aria-hidden={present ? undefined : true}>
      <Overlay className="absolute inset-0 bg-night/60 backdrop-blur-[2px]" onClick={onClose}
        {...(ok ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } } : {})} />
      <Panel className={cx('absolute inset-y-0 left-0 max-w-[85vw]', portal === 'admin' ? 'w-[260px]' : 'w-[284px]')}
        {...(ok ? { initial: { x: '-100%' }, animate: { x: 0 }, exit: { x: '-100%' }, transition: { type: 'spring', damping: 34, stiffness: 340 } } : {})}>
        {children}
      </Panel>
    </div>
  )
}

function Sidebar({ admin, nav, switchLink, onClose }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <SurfaceContext.Provider value="dark">
      <div className={cx('relative isolate flex h-full flex-col overflow-hidden text-white', admin ? 'bg-navy-ink px-3 py-5' : 'bg-night px-4 py-6')}>
        {!admin && (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.28),transparent)]" />
            <div className="absolute -bottom-32 -right-28 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgb(79_123_255/0.25),transparent)]" />
            <div className="tex-noise absolute inset-0 opacity-[.05] mix-blend-overlay" />
            <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-cyan/30 via-white/5 to-transparent" />
          </div>
        )}
        <div className="flex items-center justify-between px-2">
          <Logo to={admin ? '/admin' : '/student'} light size={admin ? 32 : 36} />
          {onClose && (
            <button className="rounded-lg p-1.5 text-side-text transition-colors hover:bg-white/10 hover:text-white lg:hidden" onClick={onClose} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <span className={cx('mx-2 mb-5 mt-4 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[.14em]',
          admin ? 'bg-white/[.06] text-side-text ring-1 ring-inset ring-white/10' : 'bg-cyan/10 text-cyan-light ring-1 ring-inset ring-cyan/25')}>
          <span className={cx('h-1.5 w-1.5 rounded-full', admin ? 'bg-side-text' : 'bg-cyan shadow-[0_0_8px_#22D3EE]')} aria-hidden />
          {admin ? 'Admin console' : 'Student'}
        </span>
        <nav className="-mx-1 flex flex-1 flex-col gap-1 overflow-y-auto px-1" aria-label="Main">
          {nav.map((group, gi) => (
            <div key={gi} className={cx('flex flex-col gap-0.5', gi > 0 && 'mt-4')}>
              {group.title && <p className="mb-1.5 px-3 font-mono text-[10.5px] font-medium uppercase tracking-[.14em] text-[#6E81A6]">{group.title}</p>}
              {group.items.map(({ to, label, icon: Icon, end, badge }) => (
                <NavLink key={to} to={to} end={end}
                  className={({ isActive }) => cx(
                    'group relative flex items-center gap-3 px-3 font-medium transition-colors',
                    admin ? 'min-h-10 rounded-lg text-[13.5px]' : 'min-h-11 rounded-xl text-sm',
                    isActive
                      ? cx('bg-white/[.08] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]',
                        'before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-cyan', !admin && 'before:shadow-[0_0_12px_#22D3EE]')
                      : 'text-side-text hover:bg-white/[.05] hover:text-white',
                  )}>
                  {({ isActive }) => (
                    <>
                      <Icon className={cx('h-[18px] w-[18px] flex-none transition-colors', isActive ? 'text-cyan' : 'text-[#7F92B5] group-hover:text-white')} aria-hidden />
                      <span className="flex-1">{label}</span>
                      {badge ? <span className="num min-w-5 rounded-full bg-cyan px-1.5 text-center text-[11px] font-semibold leading-5 text-night shadow-[0_0_10px_rgb(34_211_238/0.6)]">{badge}</span> : null}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        {switchLink && (
          <NavLink to={switchLink.to} className="mb-3 mt-4 flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-side-text transition-colors hover:bg-white/[.05] hover:text-white">
            <switchLink.icon className="h-[18px] w-[18px]" aria-hidden /> {switchLink.label}
          </NavLink>
        )}
        <div className={cx('mt-2 flex items-center gap-3 rounded-2xl p-3', admin ? 'border border-white/10 bg-white/[.04]' : 'glass-dark')}>
          <Avatar name={profile?.full_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{profile?.full_name}</p>
            <p className="truncate text-xs text-side-text">{profile?.email}</p>
          </div>
          <button onClick={async () => { await signOut(); navigate('/login') }} aria-label="Sign out" title="Sign out"
            className="rounded-lg p-1.5 text-side-text transition-colors hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </SurfaceContext.Provider>
  )
}
