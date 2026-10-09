import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert, UserX } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button, PageLoader } from '../ui/primitives'
import { Logo } from './Logo'

function Centered({ icon: Icon, title, children, action }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-6 text-center">
      <Logo />
      <span className="mb-4 mt-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-bad-bg text-bad"><Icon className="h-7 w-7" aria-hidden /></span>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 max-w-md text-muted">{children}</p>
      {action && <div className="mt-6">{action}</div>}
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
  if (session && isVerified && profile) return <Navigate to={profile.role === 'admin' ? '/admin' : '/student'} replace />
  return children
}
