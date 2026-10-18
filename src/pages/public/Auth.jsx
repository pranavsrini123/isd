import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, KeyRound, Mail, MailCheck } from 'lucide-react'
import { Logo } from '../../components/layout/Logo'
import { Button, InlineError, PageLoader } from '../../components/ui/primitives'
import { Input } from '../../components/ui/forms'
import { useAuth } from '../../context/AuthContext'
import { getPublicSettings } from '../../lib/api'
import { useQuery } from '../../hooks/useQuery'
import { hasErrors, isValidEmail, passwordProblems, validateSignup } from '../../lib/validation'

function AuthLayout({ children }) {
  return (
    <div className="grid min-h-dvh bg-page lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <Logo light />
        <div className="relative mt-auto">
          <h2 className="text-5xl font-bold leading-tight">Manage.<br />Borrow.<br /><span className="text-cyan">Build.</span><br />Innovate.</h2>
          <p className="mt-5 max-w-sm text-side-text">Your lab, your parts, your next project. All in one place.</p>
          <ul className="mt-8 space-y-3 text-[15px] text-side-text">
            {['Live availability for every component', 'Projects matched to the components available', 'Requests, approvals and returns tracked end to end'].map((t) => (
              <li key={t} className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-cyan" />{t}</li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden"><Logo /></span>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  )
}

export function Login() {
  const { signIn, resendVerification } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [resent, setResent] = useState(false)
  const unverified = /verify your email/i.test(error)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!isValidEmail(email)) return setError('Enter a valid email address.')
    if (!password) return setError('Enter your password.')
    setPending(true)
    try {
      const p = await signIn(email, password)
      const from = loc.state?.from
      const home = p?.role === 'admin' ? '/admin' : '/student'
      nav(from && from !== '/login' && (!from.startsWith('/admin') || p?.role === 'admin') ? from : home, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold">Welcome back</h1>
      <p className="mt-2 text-muted">Sign in to the ISD Lab Management System with your SRM account.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Input label="SRM email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@srmist.edu.in" required />
        <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-brand hover:underline">Forgot password?</Link>
        </div>
        <InlineError>{error}</InlineError>
        {unverified && (
          <Button variant="outline" className="w-full" disabled={resent}
            onClick={async () => { try { await resendVerification(email); setResent(true) } catch (e) { setError(e.message) } }}>
            {resent ? 'Verification email sent' : 'Resend verification email'}
          </Button>
        )}
        <Button type="submit" className="w-full" size="lg" loading={pending}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to the lab? <Link to="/register" className="font-semibold text-brand hover:underline">Create an account</Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted">Trouble signing in? Ask at the ISD Lab desk.</p>
    </AuthLayout>
  )
}

export function Register() {
  const { signUp } = useAuth()
  const nav = useNavigate()
  const { data: settings } = useQuery(() => getPublicSettings(), [])
  const allowed = settings?.allowed_email_domains || []
  const [form, setForm] = useState({ fullName: '', email: '', srmId: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    const v = validateSignup(form, allowed)
    setErrors(v)
    if (hasErrors(v)) return
    setPending(true)
    try {
      const res = await signUp(form)
      if (res.needsVerification) nav('/verify-email', { state: { email: form.email.trim(), justRegistered: true } })
      else nav('/student', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold">Create your lab account</h1>
      <p className="mt-2 text-muted">
        Use your SRM institutional email{allowed.length ? <> (<span className="font-medium text-ink">{allowed.map((d) => '@' + d).join(', ')}</span>)</> : null}. We'll send a link to verify it.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Input label="Full name" autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} required />
        <Input label="SRM email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="you@srmist.edu.in" required />
        <Input label="Register number" hint="Optional · 6–20 letters or digits" value={form.srmId} onChange={set('srmId')} error={errors.srmId} autoComplete="off" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="8+ characters, a letter and a number" required />
          <Input label="Confirm password" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} required />
        </div>
        <InlineError>{error}</InlineError>
        <Button type="submit" className="w-full" size="lg" loading={pending}>Create account</Button>
        <p className="text-xs text-muted">New accounts are student accounts. Lab administrators are appointed by existing administrators.</p>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already registered? <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  )
}

export function VerifyEmail() {
  const { resendVerification, session, isVerified, profile } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const email = loc.state?.email || session?.user?.email || ''
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (session && isVerified && profile) nav(profile.role === 'admin' ? '/admin' : '/student', { replace: true })
  }, [session, isVerified, profile, nav])
  return (
    <AuthLayout>
      <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-info-bg text-brand"><MailCheck className="h-7 w-7" /></span>
      <h1 className="text-3xl font-bold">Check your inbox</h1>
      <p className="mt-3 text-muted">
        {email ? <>We sent a verification link to <strong className="text-ink">{email}</strong>.</> : 'We sent you a verification link.'}{' '}
        Open it on this device to activate your account, then sign in.
      </p>
      <ul className="mt-6 space-y-2 text-sm text-muted">
        <li>• The link expires after a while. If it has, resend it below.</li>
        <li>• Not there? Check spam or "Other" folders.</li>
      </ul>
      <div className="mt-6"><InlineError>{error}</InlineError></div>
      {status && <p className="mt-4 rounded-xl bg-ok-bg px-3.5 py-2.5 text-sm font-medium text-ok" role="status">{status}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        {email && (
          <Button variant="outline" icon={Mail} onClick={async () => {
            setError(''); setStatus('')
            try { await resendVerification(email); setStatus('Verification email sent again.') } catch (e) { setError(e.message) }
          }}>Resend email</Button>
        )}
        <Button to="/login">Go to sign in</Button>
      </div>
    </AuthLayout>
  )
}

export function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!isValidEmail(email)) return setError('Enter a valid email address.')
    setPending(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }
  return (
    <AuthLayout>
      <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-info-bg text-brand"><KeyRound className="h-7 w-7" /></span>
      <h1 className="text-3xl font-bold">Reset your password</h1>
      {sent ? (
        <>
          <p className="mt-3 text-muted">If an account exists for <strong className="text-ink">{email}</strong>, a reset link is on its way. Open it on this device.</p>
          <Button to="/login" className="mt-8">Back to sign in</Button>
        </>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <p className="text-muted">Enter your SRM email and we'll send you a link to choose a new password.</p>
          <Input label="SRM email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <InlineError>{error}</InlineError>
          <Button type="submit" size="lg" className="w-full" loading={pending}>Send reset link</Button>
          <p className="text-center text-sm"><Link to="/login" className="font-semibold text-brand hover:underline">Back to sign in</Link></p>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPassword() {
  const { session, loading, updatePassword, profile } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [waited, setWaited] = useState(false)
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t) }, [])

  if (loading || (!session && !waited)) return <AuthLayout><PageLoader label="Checking your reset link" /></AuthLayout>
  if (!session) {
    return (
      <AuthLayout>
        <h1 className="text-3xl font-bold">Link expired</h1>
        <p className="mt-3 text-muted">This password reset link is invalid or has expired. Request a new one.</p>
        <Button to="/forgot-password" className="mt-8">Request new link</Button>
      </AuthLayout>
    )
  }
  async function submit(e) {
    e.preventDefault()
    setError('')
    const problems = passwordProblems(pw)
    if (problems.length) return setError(`Password needs: ${problems.join(', ').toLowerCase()}.`)
    if (pw !== confirm) return setError('Passwords do not match.')
    setPending(true)
    try {
      await updatePassword(pw)
      nav(profile?.role === 'admin' ? '/admin' : '/student', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }
  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold">Choose a new password</h1>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Input label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="8+ characters, a letter and a number" required />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <InlineError>{error}</InlineError>
        <Button type="submit" size="lg" className="w-full" loading={pending}>Update password</Button>
      </form>
    </AuthLayout>
  )
}

/** Landing page for email-verification links. supabase-js exchanges the code automatically. */
export function AuthCallback() {
  const { session, profile, loading, isVerified } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const params = new URLSearchParams(loc.search + '&' + loc.hash.replace(/^#/, ''))
  const urlError = params.get('error_description')
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => { const t = setTimeout(() => setTimedOut(true), 8000); return () => clearTimeout(t) }, [])
  useEffect(() => {
    if (!loading && session && isVerified && profile) nav(profile.role === 'admin' ? '/admin' : '/student', { replace: true })
  }, [loading, session, isVerified, profile, nav])

  if (urlError || timedOut) {
    return (
      <AuthLayout>
        <h1 className="text-3xl font-bold">We couldn't verify that link</h1>
        <p className="mt-3 text-muted">{urlError || 'The link may have expired or already been used.'} If you already verified, just sign in.</p>
        <div className="mt-8 flex gap-3"><Button to="/login">Sign in</Button><Button to="/verify-email" variant="outline">Resend link</Button></div>
      </AuthLayout>
    )
  }
  return <AuthLayout><PageLoader label="Verifying your email" /></AuthLayout>
}
