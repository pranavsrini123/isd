import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, Mail, MailCheck } from 'lucide-react'
import { IsdLabsLogo, Wordmark } from '../../components/brand/Brand'
import { arcKeyframes, clearBrand, EASE, peekBrand, prefersReducedMotion } from '../../lib/brandTransition'
import { Button, InlineError, PageLoader } from '../../components/ui/primitives'
import { Input } from '../../components/ui/forms'
import { useAuth } from '../../context/AuthContext'
import { getPublicSettings } from '../../lib/api'
import { useQuery } from '../../hooks/useQuery'
import { hasErrors, isValidEmail, passwordProblems, validateSignup } from '../../lib/validation'

/**
 * Two-panel auth layout: navy INVENTRA brand panel (left on desktop, top band on
 * mobile) and the light form panel. When it is entered from the welcome page's
 * GET STARTED, the brand elements fly in from where they were on that page and
 * the form panel is revealed (see useBrandIntro).
 */
function AuthLayout({ children }) {
  const root = useRef(null)
  const intro = useBrandIntro(root)
  return (
    <div ref={root} className="grid min-h-dvh bg-page lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* z-20: during the intro the travelling brand elements must pass over the form panel's curtain. */}
      <aside className="relative z-20 bg-navy px-6 pb-8 pt-6 text-white sm:px-10 lg:flex lg:flex-col lg:p-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div data-intro="glow" className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/30 blur-3xl" />
        </div>
        <Link to="/" className="relative inline-flex items-center gap-3 rounded-lg" aria-label="INVENTRA home">
          <IsdLabsLogo className="h-12 w-12 lg:h-14 lg:w-14" />
          {/* "by ISD Lab" becomes "ISD Lab, SRMIST KTR": "ISD Lab" stays put while "by" folds away and the campus unfolds. */}
          <span data-brand="org" className="relative whitespace-nowrap text-sm font-semibold tracking-[0.04em] text-white lg:text-[15px]">
            {intro && <span className="org-prefix inline-block max-w-0 overflow-hidden whitespace-pre align-bottom" aria-hidden>by </span>}
            ISD Lab<span className="org-suffix inline-block whitespace-pre">, SRMIST KTR</span>
          </span>
        </Link>
        <div className="relative mt-8 lg:mt-auto lg:mb-auto lg:pt-10">
          <Wordmark className="text-[2.5rem] text-cyan sm:text-5xl lg:text-[4.25rem]" />
          <h2 data-intro="copy" className="mt-5 max-w-lg text-2xl font-bold leading-tight sm:text-3xl lg:mt-8 lg:text-[2.6rem]">
            Discover what's available. <span className="text-cyan-light">Build what's possible.</span>
          </h2>
          <p data-intro="copy" className="mt-3 max-w-md text-[15px] leading-relaxed text-side-text lg:mt-5 lg:text-base">
            Discover lab resources, request equipment, and find inspiration for your next project — all in one place.
          </p>
        </div>
      </aside>
      <main className="relative flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-end" data-intro="form">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
        </div>
        <div data-stagger className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
        {intro && (
          <>
            {/* Navy curtain continuing the welcome background; it recedes to reveal the form panel. */}
            <div data-curtain className="pointer-events-none absolute -inset-px z-10 bg-navy" aria-hidden />
            <div data-sweep className="pointer-events-none absolute inset-y-0 left-0 z-20 w-24 bg-gradient-to-r from-transparent via-cyan/35 to-transparent opacity-0" aria-hidden />
          </>
        )}
      </main>
    </div>
  )
}

const mix = (a, b, t) => {
  const p = (c) => (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number)
  const [x, y] = [p(a), p(b)]
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(', ')})`
}

/**
 * Plays the welcome → login choreography once, before first paint, if the user
 * arrived via GET STARTED. Returns true while the intro overlay is needed.
 */
function useBrandIntro(rootRef) {
  const loc = useLocation()
  const startRef = useRef(undefined)
  if (startRef.current === undefined) startRef.current = loc.state?.from === 'welcome' ? peekBrand() : null
  const start = startRef.current
  const reduced = !!start && (start.reduced || prefersReducedMotion())
  const [intro, setIntro] = useState(!!start && !reduced)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!start || !root) return undefined
    clearBrand()
    const anims = []
    const play = (el, frames, opts) => { if (el) anims.push(el.animate(frames, { fill: 'both', ...opts })) }

    if (reduced) {
      // Reduced motion: no travel, just a short, calm fade-in of the real page.
      play(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' })
    }

    const q = (sel) => root.querySelector(sel)
    if (!reduced) {
      const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }
      const fly = (name, opts, timing) => {
        const el = q(`[data-brand="${name}"]`)
        const from = start.rects[name]
        if (!el || !from) return
        play(el, arcKeyframes(from, rect(el), opts), { duration: timing.duration, delay: timing.delay || 0, easing: 'linear' })
        return el
      }

      // Brand elements travel concurrently, lightly staggered, on curved paths.
      fly('logo', { bend: 0.2 }, { duration: 1500 })
      const wm = q('[data-brand="wordmark"]')
      const cyan = wm ? getComputedStyle(wm).color : null
      fly('wordmark', { bend: -0.1, extra: (e) => ({ color: mix(start.rects.wordmark?.color || 'rgb(255,255,255)', cyan, Math.min(1, Math.max(0, (e - 0.35) / 0.5))) }) },
        { duration: 1650, delay: 50 })
      const orgEl = q('[data-brand="org"]')
      const white = orgEl ? getComputedStyle(orgEl).color : null
      // Its path crosses the wordmark's, so it dims while they overlap and brightens as it lands.
      const orgOpacity = (t) => (t < 0.18 ? 1 - (t / 0.18) * 0.8 : t < 0.5 ? 0.2 : t < 0.8 ? 0.2 + ((t - 0.5) / 0.3) * 0.8 : 1)
      const org = fly('org', { bend: 0.24, scaleBy: 'h', extra: (e, t) => ({ color: mix(start.rects.org?.color || white, white, Math.min(1, e / 0.6)), opacity: orgOpacity(t).toFixed(3) }) },
        { duration: 1450, delay: 110 })
      if (org) {
        // "by " folds away while ", SRMIST KTR" unfolds; "ISD Lab" itself never changes.
        play(org.querySelector('.org-prefix'), [
          { maxWidth: '1.6em', opacity: 1 }, { maxWidth: '1.6em', opacity: 1, offset: 0.25 }, { maxWidth: '0em', opacity: 0, offset: 0.6 }, { maxWidth: '0em', opacity: 0 },
        ], { duration: 1450, delay: 110, easing: 'linear' })
        play(org.querySelector('.org-suffix'), [
          { clipPath: 'inset(0 100% 0 0)', opacity: 0 }, { clipPath: 'inset(0 100% 0 0)', opacity: 0, offset: 0.45 }, { clipPath: 'inset(0 0% 0 0)', opacity: 1, offset: 0.85 }, { clipPath: 'inset(0 0% 0 0)', opacity: 1 },
        ], { duration: 1450, delay: 110, easing: 'linear' })
      }
      // Panel copy arrives after the wordmark has nearly settled.
      root.querySelectorAll('[data-intro="copy"]').forEach((el, i) =>
        play(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 1050 + i * 110, easing: EASE }))
      // The panel's corner glow takes over from the welcome page's centre glow.
      play(q('[data-intro="glow"]'), [{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 500, easing: 'ease-out' })

      // The navy curtain recedes left→right with a soft cyan sweep at its edge.
      const curtain = q('[data-curtain]')
      play(curtain, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 0 100%)' }], { duration: 950, delay: 520, easing: EASE })
      const main = curtain?.parentElement
      const w = main ? main.getBoundingClientRect().width : 0
      play(q('[data-sweep]'), [
        { opacity: 0, transform: 'translateX(-48px)' },
        { opacity: 1, transform: `translateX(${w * 0.35}px)`, offset: 0.35 },
        { opacity: 0, transform: `translateX(${w}px)` },
      ], { duration: 950, delay: 520, easing: EASE })

      // Form panel: blur-to-sharp with a slight horizontal settle, then the fields stagger in.
      const stack = q('[data-stagger]')
      play(stack, [{ filter: 'blur(8px)', transform: 'translateX(28px)' }, { filter: 'blur(0px)', transform: 'none' }], { duration: 900, delay: 600, easing: EASE })
      const items = []
      for (const child of stack ? stack.children : []) {
        if (child.tagName === 'FORM') items.push(...child.children); else items.push(child)
      }
      items.forEach((el, i) => play(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 720 + i * 60, easing: EASE }))
      play(q('[data-intro="form"]'), [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1100, easing: 'ease-out' })
    }

    // When everything has finished, drop all effects so only the plain page remains.
    let alive = true
    Promise.all(anims.map((a) => a.finished)).then(() => {
      if (!alive) return
      anims.forEach((a) => a.cancel())
      setIntro(false)
    }).catch(() => {})
    return () => { alive = false; anims.forEach((a) => a.cancel()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return intro
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
