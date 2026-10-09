import { ArrowRight, BadgeCheck, CheckCircle2, ClipboardCheck, Cpu, FolderKanban, LogIn, PackageCheck, RefreshCw, ShieldCheck, Sparkles, Undo2, XCircle, Eye, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '../../components/layout/Logo'
import { Button } from '../../components/ui/primitives'
import { useAuth } from '../../context/AuthContext'

const LOOP = [
  ['Admin', 'Inventory', 'Every part is catalogued with quantity, condition and shelf.', Cpu],
  ['System', 'Availability', 'Live counts show what is free right now.', Eye],
  ['System', 'Projects', 'A library of builds, ranked by what you can make today.', FolderKanban],
  ['System', 'Required components', 'Each part is marked ready or missing against live stock.', Search],
  ['Student', 'Request', 'Choose parts, dates and purpose in a single form.', ClipboardCheck],
  ['Admin', 'Approval', 'The lab manager approves or rejects with a reason.', BadgeCheck],
  ['Admin', 'Borrow', 'Parts are issued and the due-date clock starts.', PackageCheck],
  ['Admin', 'Return', 'Staff inspect each part: returned, damaged or missing.', Undo2],
  ['System', 'Inventory update', 'Stock changes only after a return is verified. Back to step 02.', RefreshCw],
]
const ROLE_TONE = { Admin: 'bg-info-bg text-info', System: 'bg-[#CFF5FB] text-teal', Student: 'bg-ok-bg text-ok' }

// Illustration only (anonymous visitors cannot read inventory).
const EXAMPLE = [
  ['Arduino Uno R3', 7, true], ['HC-SR04 Ultrasonic Sensor', 14, true], ['Robot Chassis 2WD', 3, true],
  ['18650 Battery Holder', 9, true], ['L298N Motor Driver', 0, false],
]

export default function Landing() {
  const { session, profile } = useAuth()
  const home = profile ? (profile.role === 'admin' ? '/admin' : '/student') : null
  return (
    <div className="min-h-dvh bg-page">
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-48 left-1/3 h-[420px] w-[420px] rounded-full bg-cyan/15 blur-3xl" aria-hidden />
        <header className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Logo light />
          <nav className="hidden items-center gap-7 text-sm font-medium text-side-text md:flex" aria-label="Sections">
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#roles" className="hover:text-white">For students</a>
            <a href="#roles" className="hover:text-white">For lab staff</a>
          </nav>
          <div className="flex items-center gap-2">
            {session && home ? (
              <Button to={home} variant="cyan" size="sm">Open the lab <ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <>
                <Button to="/login" variant="dark" size="sm" icon={LogIn}>Login</Button>
                <Button to="/register" variant="cyan" size="sm" className="hidden sm:inline-flex">Get started</Button>
              </>
            )}
          </div>
        </header>

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:pb-28 lg:pt-16">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[13px] font-medium text-cyan-light">
              <Sparkles className="h-4 w-4" /> SRM Institute of Science and Technology · ISD Lab
            </p>
            <h1 className="text-[40px] font-bold leading-[1.05] sm:text-6xl">
              Manage. Borrow.<br /><span className="bg-gradient-to-r from-cyan to-[#60A5FA] bg-clip-text text-transparent">Build.</span> Innovate.
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-side-text">
              See what is on the shelf, find out what you can build with it, and borrow it. Every request is approved, tracked and returned in one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to={home || '/register'} variant="cyan" size="lg">{home ? 'Open the lab' : 'Get started'} <ArrowRight className="h-4 w-4" /></Button>
              {!session && <Button to="/login" variant="dark" size="lg">Login</Button>}
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-side-text">
              {['Live stock counts', 'SRM account sign-in', 'Admin-verified returns'].map((t) => (
                <li key={t} className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-cyan" />{t}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[.06] p-5 shadow-2xl backdrop-blur sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-display text-lg font-semibold">What can I build?</p>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-side-text">Example</span>
            </div>
            <div className="rounded-2xl bg-white p-5 text-ink">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold">Obstacle Avoiding Robot</p>
                  <p className="text-sm text-muted">4 of 5 components available</p>
                </div>
                <span className="rounded-full bg-warn-bg px-2.5 py-1 text-sm font-bold text-warn">80% ready</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E5EAF2]"><div className="h-full w-4/5 rounded-full bg-[#F59E0B]" /></div>
              <ul className="mt-4 divide-y divide-line text-sm">
                {EXAMPLE.map(([n, free, ok]) => (
                  <li key={n} className="flex items-center gap-3 py-2">
                    {ok ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <XCircle className="h-4 w-4 text-bad" />}
                    <span className="flex-1">{n} × 1</span>
                    <span className={`font-mono text-xs ${ok ? 'text-muted' : 'font-semibold text-bad'}`}>{free} free</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 rounded-xl bg-info-bg px-3 py-2 text-[13px] text-info">Only one part missing. Request the other four in one go.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl scroll-mt-6 px-5 py-20 sm:px-8">
        <p className="label-caps">How the lab works</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-bold sm:text-4xl">One loop, from the shelf to your build and back again</h2>
        <p className="mt-3 max-w-2xl text-muted">Inventory and projects share one database, so every project knows exactly which parts are on the shelf today.</p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LOOP.map(([role, title, text, Icon], i) => (
            <li key={title} className="rounded-[20px] border border-line bg-white p-5 shadow-card">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-muted">{String(i + 1).padStart(2, '0')}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${ROLE_TONE[role]}`}>{role}</span>
                <Icon className="ml-auto h-5 w-5 text-brand" aria-hidden />
              </div>
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="roles" className="mx-auto max-w-7xl scroll-mt-6 px-5 pb-20 sm:px-8">
        <p className="label-caps">One product, two experiences</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-bold sm:text-4xl">Built for the people who borrow, and the people who run the lab</h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[20px] border border-line bg-white p-7 shadow-card">
            <span className="rounded-full bg-[#CFF5FB] px-2.5 py-0.5 text-xs font-semibold text-teal">Student</span>
            <h3 className="mt-3 text-2xl font-bold">Find parts. Find projects. Build.</h3>
            <ul className="mt-4 space-y-2.5 text-[15px]">
              {['Browse and search live inventory', 'See which projects you can build right now', 'Request parts and track every status', 'Never edit stock. Staff keep counts accurate'].map((t) => (
                <li key={t} className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-cyan" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[20px] bg-navy-ink p-7 text-white shadow-card">
            <span className="rounded-full bg-brand/25 px-2.5 py-0.5 text-xs font-semibold text-[#93C5FD]">Admin &amp; Staff</span>
            <h3 className="mt-3 text-2xl font-bold">Stock, approvals and returns under control.</h3>
            <ul className="mt-4 space-y-2.5 text-[15px] text-side-text">
              {['Manage items, quantities, condition and location', 'Approve, reject and issue requests', 'Verify returns and log damaged or lost parts', 'Reports, activity log and project requirements'].map((t) => (
                <li key={t} className="flex gap-2.5"><ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-[#60A5FA]" />{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-br from-brand to-navy p-8 text-white sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 className="text-3xl font-bold">Ready to build something?</h2>
            <p className="mt-2 text-[#C7D7F5]">Sign in with your SRM account and see what the lab has today.</p>
          </div>
          <div className="flex gap-3">
            <Button to={home || '/register'} variant="cyan" size="lg">Get started</Button>
            {!session && <Button to="/login" variant="dark" size="lg">Login</Button>}
          </div>
        </div>
      </section>
      <footer className="border-t border-line py-8 text-center text-sm text-muted">
        ISD Lab Management System · SRM Institute of Science and Technology · <Link to="/login" className="hover:text-ink">Staff sign-in</Link>
      </footer>
    </div>
  )
}
