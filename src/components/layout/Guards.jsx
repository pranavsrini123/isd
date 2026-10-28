import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert, UserX } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button, IconTile, PageLoader } from '../ui/primitives'
import { Logo } from './Logo'
import { homePath } from '../../lib/roles'

function Centered({ icon: Icon, title, children, action }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-page px-6 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.18),transparent)]" />
        <div className="tex-dots absolute inset-0 [mask-image:radial-gradient(closest-side,#000,transparent)]" />
      </div>
      <Logo />
      <div className="glass mt-10 flex max-w-md flex-col items-center rounded-[24px] px-8 py-9">
        <IconTile icon={Icon} tone="bad" size="lg" className="mb-4" />
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted">{children}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  )
}

/** Signed in + verified + has an active-or-restricted profile. */
export function RequireAuth() {
  const { loading, session, profile, profileError, isVerified, signOut } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="min-h-dvh bg-page"><PageLoader label="Loading your account" /></div>
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  if (!isVerified) return <Navigate to="/verify-email" replace state={{ email: session.user.email }} />
  if (profileError) {
    return <Centered icon={ShieldAlert} title="Account problem" action={<Button variant="outline" onClick={signOut}>Sign out</Button>}>{profileError.message}</Centered>
  }
  if (!profile) return <div className="min-h-dvh bg-page"><PageLoader label="Loading your profile" /></div>
  if (profile.status === 'suspended') {
    return (
      <Centered icon={UserX} title="Account suspended" action={<Button variant="outline" onClick={signOut}>Sign out</Button>}>
        Your lab account has been suspended. Please speak to the ISD Lab administrator.
      </Centered>
    )
  }
  return <Outlet />
}

/** Admin pages. The database enforces the same rule on every admin action. */
export function RequireAdmin() {
  const { isAdmin, profile } = useAuth()
  if (!profile) return <PageLoader />
  if (!isAdmin) {
    return (
      <Centered icon={ShieldAlert} title="Administrators only" action={<Button to="/student">Go to student portal</Button>}>
        This area is restricted to ISD Lab administrators.
      </Centered>
    )
  }
  return <Outlet />
}

/** Sends signed-in users away from login/register to their home. */
export function RedirectIfSignedIn({ children }) {
  const { loading, session, profile, isVerified } = useAuth()
  if (loading) return <div className="min-h-dvh bg-page"><PageLoader /></div>
  if (session && isVerified && profile) return <Navigate to={homePath(profile)} replace />
  return children
}
