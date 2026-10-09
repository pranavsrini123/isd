import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { useAuth } from '../../context/AuthContext'
import { PortalContext } from '../ui/portal'
import { Avatar, cx } from '../ui/primitives'

/**
 * Shared shell for both portals. `portal` switches the visual density:
 *  student — navy sidebar, cyan active marker, roomy cards
 *  admin   — near-black sidebar, blue active marker, dense tables
 */
export function AppShell({ portal, nav, topRight, switchLink }) {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const navigate = useNavigate()
  useEffect(() => setOpen(false), [loc.pathname])

  const admin = portal === 'admin'
  const sidebar = (
    <div className={cx('flex h-full flex-col px-3 py-5 text-white', admin ? 'bg-navy-ink' : 'bg-navy px-4 py-6')}>
      <div className="flex items-center justify-between px-2">
        <Logo to={admin ? '/admin' : '/student'} light size={admin ? 34 : 38} />
        <button className="rounded-lg p-1.5 text-side-text hover:text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      <span className={cx('mx-2 mb-5 mt-3 self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[.08em]',
        admin ? 'bg-brand/20 text-[#93C5FD]' : 'bg-cyan/15 text-cyan-light')}>
        {admin ? 'Admin console' : 'Student'}
      </span>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Main">
        {nav.map((group, gi) => (
          <div key={gi} className={cx(gi > 0 && 'mt-4')}>
            {group.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[.08em] text-[#6B7FA3]">{group.title}</p>}
            {group.items.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => cx(
                  'flex items-center gap-3 px-3 font-medium transition-colors',
                  admin ? 'min-h-10 rounded-lg text-[13.5px]' : 'min-h-11 rounded-xl text-sm',
                  isActive
                    ? admin ? 'bg-navy-hover text-white shadow-[inset_3px_0_0_#3B82F6]' : 'bg-cyan/15 text-white shadow-[inset_3px_0_0_var(--color-cyan)]'
                    : 'text-side-text hover:bg-white/5 hover:text-white',
                )}>
                <Icon className="h-[18px] w-[18px] flex-none" aria-hidden />
                <span className="flex-1">{label}</span>
                {badge ? <span className="rounded-full bg-[#F59E0B] px-1.5 text-[11px] font-bold text-[#06142E]">{badge}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      {switchLink && (
        <NavLink to={switchLink.to} className="mb-3 flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-side-text hover:bg-white/5 hover:text-white">
          <switchLink.icon className="h-[18px] w-[18px]" aria-hidden /> {switchLink.label}
        </NavLink>
      )}
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <Avatar name={profile?.full_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{profile?.full_name}</p>
          <p className="truncate text-xs text-side-text">{profile?.email}</p>
        </div>
        <button onClick={async () => { await signOut(); navigate('/login') }} aria-label="Sign out" title="Sign out"
          className="rounded-lg p-1.5 text-side-text hover:bg-white/10 hover:text-white">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  return (
    <PortalContext.Provider value={portal}>
      <div className={cx('min-h-dvh', admin ? 'bg-page-admin' : 'bg-page')}>
        <aside className={cx('fixed inset-y-0 left-0 z-30 hidden lg:block', admin ? 'w-[232px]' : 'w-[252px]')}>{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-[#06142E]/60" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-[272px] max-w-[85vw]">{sidebar}</aside>
          </div>
        )}
        <div className={cx(admin ? 'lg:pl-[232px]' : 'lg:pl-[252px]')}>
          <header className={cx('sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line px-4 backdrop-blur sm:px-6 lg:px-10',
            admin ? 'bg-page-admin/90' : 'bg-page/90')}>
            <button className="rounded-lg p-2 text-ink hover:bg-white lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex-1">{topRight?.left}</div>
            {topRight?.right}
            <NotificationBell />
          </header>
          <main className={cx('mx-auto w-full max-w-[1400px] px-4 pb-14 pt-6 sm:px-6 lg:px-10', admin ? 'lg:pt-7' : 'lg:pt-8')}>
            <Outlet />
          </main>
        </div>
      </div>
    </PortalContext.Provider>
  )
}
