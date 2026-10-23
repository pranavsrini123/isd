import { ArrowRight, BadgeCheck, Check, CheckCircle2, ClipboardCheck, Cpu, FolderKanban, GraduationCap, LogIn, PackageCheck, RefreshCw, ShieldCheck, Sparkles, Undo2, XCircle, Eye, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '../../components/layout/Logo'
import { IsdLabsLogo, Wordmark } from '../../components/brand/Brand'
import { Badge, Button, Card, IconTile, NightPanel, ProgressBar, cx } from '../../components/ui/primitives'
import { EASE_OUT, Reveal, Stagger, StaggerItem, m, useMotionOK } from '../../components/ui/motion'
import { Orbit } from '../../components/ui/decor'
import { SurfaceContext } from '../../components/ui/portal'
import { useAuth } from '../../context/AuthContext'

const LOOP = [
  ['Admin', 'Inventory', 'Every component is catalogued with quantity, condition and storage location.', Cpu],
  ['System', 'Availability', 'Live counts show what is free right now.', Eye],
  ['System', 'Projects', 'A library of builds, ranked by what you can make today.', FolderKanban],
  ['System', 'Required components', 'Each part is marked ready or missing against live stock.', Search],
  ['Student', 'Request', 'Choose parts, dates and purpose in a single form.', ClipboardCheck],
  ['Admin', 'Approval', 'The lab manager approves or rejects with a reason.', BadgeCheck],
  ['Admin', 'Borrow', 'Parts are issued and the due-date clock starts.', PackageCheck],
  ['Admin', 'Return', 'Staff inspect each part: returned, damaged or missing.', Undo2],
  ['System', 'Inventory update', 'Stock changes only after a return is verified. Back to step 02.', RefreshCw],
]
// Badge and icon-tile tones per role in the loop.
const ROLE_TONE = { Admin: ['info', 'brand'], System: ['cyan', 'cyan'], Student: ['ok', 'ok'] }

// Illustration only (anonymous visitors cannot read inventory).
const EXAMPLE = [
  ['Arduino Uno R3', 7, true], ['HC-SR04 Ultrasonic Sensor', 14, true], ['Robot Chassis 2WD', 3, true],
  ['18650 Battery Holder', 9, true], ['L298N Motor Driver', 0, false],
]

const STUDENT_POINTS = ['Browse and search live inventory', 'See which projects you can build right now', 'Request parts and track every status', 'Never edit stock. Staff keep counts accurate']
const STAFF_POINTS = ['Manage items, quantities, condition and location', 'Approve, reject and issue requests', 'Verify returns and log damaged or lost parts', 'Reports, activity log and project requirements']

/** Soft cyan / iris light and a dot texture behind the light part of the page. */
function PageGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-56 top-[30%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.15),transparent)]" />
      <div className="absolute -right-48 top-[52%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgb(139_124_255/0.11),transparent)]" />
      <div className="absolute -bottom-48 left-1/4 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgb(79_123_255/0.10),transparent)]" />
      <div className="tex-dots absolute inset-0 [mask-image:linear-gradient(180deg,transparent_15%,#000_40%,#000_70%,transparent)]" />
    </div>
  )
}

/** Small mono eyebrow with a glowing cyan dot, used above the section headings. */
function Eyebrow({ children }) {
  return (
    <p className="flex items-center gap-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[.16em] text-brand">
      <span className="h-1.5 w-1.5 flex-none rounded-full bg-cyan shadow-[0_0_10px_rgb(34_211_238/0.9)]" aria-hidden />
      {children}
    </p>
  )
}

/** The example card rises into place a beat after the headline. */
function Rise({ className, children, delay = 0 }) {
  const ok = useMotionOK()
  if (!ok) return <div className={className}>{children}</div>
  return (
    <m.div className={className} initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.85, ease: EASE_OUT, delay }}>
      {children}
    </m.div>
  )
}

export default function Landing() {
  const { session, profile } = useAuth()
  const home = profile ? (profile.role === 'admin' ? '/admin' : '/student') : null
  const ok = useMotionOK()
  // Below-the-fold grids stagger in when they scroll into view (props only passed when motion plays).
  const onView = ok ? { animate: undefined, whileInView: 'show', viewport: { once: true, margin: '0px 0px -60px 0px' } } : {}
  const exampleList = ok ? { variants: { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.55 } } } } : {}

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-page">
      <PageGlow />

      <div className="p-2 sm:p-3 lg:p-4">
        <NightPanel as="header" className="rounded-[24px] shadow-[0_40px_80px_-40px_rgb(7_13_31/0.8)] sm:rounded-[30px]">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -left-48 top-1/3 h-[460px] w-[460px] rounded-full bg-[radial-gradient(closest-side,rgb(79_123_255/0.22),transparent)]" />
            <Orbit className="-right-28 top-28 h-72 w-72 opacity-30 lg:hidden" />
            <Orbit className="right-[-120px] top-1/2 hidden h-[700px] w-[700px] -translate-y-[44%] opacity-70 lg:block xl:right-[-40px]" />
          </div>

          <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-5">
            <Logo light />
            <nav className="glass-dark hidden items-center gap-0.5 rounded-full p-1 text-sm font-medium md:flex" aria-label="Sections">
              <a href="#how" className="rounded-full px-4 py-1.5 text-side-text transition-colors hover:bg-white/10 hover:text-white">How it works</a>
              <a href="#roles" className="rounded-full px-4 py-1.5 text-side-text transition-colors hover:bg-white/10 hover:text-white">For students</a>
              <a href="#roles" className="rounded-full px-4 py-1.5 text-side-text transition-colors hover:bg-white/10 hover:text-white">For lab staff</a>
            </nav>
            <div className="flex items-center gap-2">
              {session && home ? (
                <Button to={home} variant="cyan" size="sm" className="group">Open the lab <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Button>
              ) : (
                <>
                  <Button to="/login" variant="dark" size="sm" icon={LogIn}>Login</Button>
                  <span className="hidden sm:block"><Button to="/register" variant="cyan" size="sm">Get started</Button></span>
                </>
              )}
            </div>
          </div>

          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-6 pt-6 sm:px-8 sm:pb-12 sm:pt-10 lg:grid-cols-[1.08fr_.92fr] lg:gap-14 lg:pb-24 lg:pt-14">
            <Stagger className="min-w-0">
              <StaggerItem>
                <p className="mb-6 inline-flex max-w-full items-center gap-2 rounded-2xl border border-white/15 bg-white/[.06] px-3.5 py-1.5 text-[12.5px] font-medium text-cyan-light backdrop-blur sm:rounded-full sm:text-[13px]">
                  <Sparkles className="h-4 w-4 flex-none" aria-hidden /> <span className="min-w-0">SRM Institute of Science and Technology <span className="whitespace-nowrap">· ISD Lab</span></span>
                </p>
              </StaggerItem>
              <StaggerItem>
                <h1 className="text-[34px] font-bold leading-[1.06] text-white min-[400px]:text-[38px] sm:text-6xl lg:text-[66px]">
                  Manage. Borrow.<br />
                  <span className="bg-gradient-to-r from-cyan via-cyan-light to-[#60A5FA] bg-clip-text text-transparent [filter:drop-shadow(0_0_24px_rgb(34_211_238/0.35))]">Build.</span> Innovate.
                </h1>
              </StaggerItem>
              <StaggerItem>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-[#B9C6DE] sm:text-[17px]">
                  See which components are available, find out what you can build with them, and borrow them. Every request is approved, tracked and returned in one place.
                </p>
              </StaggerItem>
              <StaggerItem>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button to={home || '/register'} variant="cyan" size="lg" className="group">
                    {home ? 'Open the lab' : 'Get started'} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  {!session && <Button to="/login" variant="dark" size="lg">Login</Button>}
                </div>
              </StaggerItem>
              <StaggerItem>
                <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-side-text">
                  {['Live stock counts', 'SRM account sign-in', 'Admin-verified returns'].map((t) => (
                    <li key={t} className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 flex-none text-cyan" aria-hidden />{t}</li>
                  ))}
                </ul>
              </StaggerItem>
            </Stagger>

            <Rise className="relative min-w-0" delay={0.3}>
              <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10 rounded-[48px] bg-[radial-gradient(closest-side,rgb(34_211_238/0.22),transparent)]" />
              <div className="glass-dark rounded-[26px] p-2.5 shadow-[0_40px_80px_-32px_rgb(0_0_0/0.75)] sm:p-3.5">
                <div className="flex items-center justify-between gap-3 px-2.5 pb-3 pt-2">
                  <p className="flex items-center gap-2.5 font-display text-lg font-semibold text-white">
                    <span className="h-2 w-2 flex-none rounded-full bg-cyan shadow-[0_0_10px_rgb(34_211_238/0.9)]" aria-hidden />
                    What can I build?
                  </p>
                  <Badge tone="dark" className="uppercase tracking-wider !text-[10.5px]">Example</Badge>
                </div>
                <SurfaceContext.Provider value="light">
                  <div className="rounded-[18px] bg-white p-4 text-ink shadow-[inset_0_1px_0_rgb(255_255_255),0_12px_32px_-16px_rgb(7_13_31/0.5)] sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-semibold leading-snug">Obstacle Avoiding Robot</p>
                        <p className="mt-0.5 text-sm text-muted"><span className="num font-medium text-ink">4</span> of <span className="num font-medium text-ink">5</span> components available</p>
                      </div>
                      <Badge tone="warn" className="!text-[13px]"><span className="num">80%</span> ready</Badge>
                    </div>
                    <ProgressBar value={80} tone="warn" className="mt-4" label="Obstacle Avoiding Robot" />
                    <Stagger as="ul" className="mt-3 divide-y divide-line text-sm" {...exampleList}>
                      {EXAMPLE.map(([n, free, inStock]) => (
                        <StaggerItem as="li" key={n} className="flex items-center gap-3 py-2.5">
                          {inStock ? <CheckCircle2 className="h-4 w-4 flex-none text-ok" aria-hidden /> : <XCircle className="h-4 w-4 flex-none text-bad" aria-hidden />}
                          <span className="min-w-0 flex-1">{n} × <span className="num">1</span></span>
                          <span className={cx('num flex-none rounded-full px-2 py-0.5 text-xs', inStock ? 'bg-neutral-pill text-muted' : 'bg-bad-bg font-semibold text-bad')}>{free} free</span>
                        </StaggerItem>
                      ))}
                    </Stagger>
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-info-bg px-3 py-2.5 text-[13px] leading-snug text-info">
                      <Sparkles className="mt-px h-4 w-4 flex-none" aria-hidden />
                      <span>Only one part missing. Request the other four in one go.</span>
                    </p>
                  </div>
                </SurfaceContext.Provider>
              </div>
            </Rise>
          </div>
        </NightPanel>
      </div>

      <main>
        <section id="how" className="mx-auto max-w-7xl scroll-mt-6 px-4 py-16 sm:px-8 sm:py-24">
          <Reveal className="grid gap-4 lg:grid-cols-[1.25fr_1fr] lg:items-end lg:gap-12">
            <div className="min-w-0">
              <Eyebrow>How the lab works</Eyebrow>
              <h2 className="mt-3 max-w-2xl text-[28px] font-bold leading-tight sm:text-4xl lg:text-[42px]">One loop, from the lab to your build and back again</h2>
            </div>
            <p className="max-w-xl text-[15px] leading-relaxed text-muted sm:text-base lg:pb-1.5">Inventory and projects share one database, so every project knows exactly which components are available today.</p>
          </Reveal>
          <Stagger as="ol" className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:mt-12 lg:grid-cols-3" {...onView}>
            {LOOP.map(([role, title, text, Icon], i) => (
              <StaggerItem as="li" key={title} className="h-full">
                <Card className="lift group relative h-full overflow-hidden">
                  <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="flex items-center gap-3">
                    <span className="num bg-gradient-to-br from-brand to-azure bg-clip-text text-[26px] font-semibold leading-none text-transparent">{String(i + 1).padStart(2, '0')}</span>
                    <Badge tone={ROLE_TONE[role][0]} className="uppercase tracking-wider !text-[10.5px]">{role}</Badge>
                    <IconTile icon={Icon} tone={ROLE_TONE[role][1]} size="sm" className="ml-auto" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold leading-snug">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        <section id="roles" className="mx-auto max-w-7xl scroll-mt-6 px-4 pb-16 sm:px-8 sm:pb-24">
          <Reveal>
            <Eyebrow>One product, two experiences</Eyebrow>
            <h2 className="mt-3 max-w-3xl text-[28px] font-bold leading-tight sm:text-4xl lg:text-[42px]">Built for the people who borrow, and the people who run the lab</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 lg:mt-12 lg:grid-cols-2">
            <Reveal className="h-full">
              <Card padded={false} className="relative isolate h-full overflow-hidden p-6 sm:p-8">
                <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.18),transparent)]" />
                <div className="flex items-center justify-between gap-3">
                  <Badge tone="cyan">Student</Badge>
                  <IconTile icon={GraduationCap} tone="cyan" size="lg" />
                </div>
                <h3 className="mt-5 text-2xl font-bold leading-tight">Find parts. Find projects. Build.</h3>
                <ul className="mt-5 space-y-3 text-[15px]">
                  {STUDENT_POINTS.map((t) => (
                    <li key={t} className="flex gap-3">
                      <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-cyan-soft text-brand ring-1 ring-inset ring-cyan/40" aria-hidden>
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span className="min-w-0">{t}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
            <Reveal className="h-full" delay={0.08}>
              <NightPanel as="div" className="h-full rounded-[22px] p-6 shadow-[0_28px_60px_-30px_rgb(7_13_31/0.75)] sm:p-8">
                <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                  <Orbit className="-bottom-36 -right-32 h-80 w-80 opacity-45" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Badge tone="dark">Admin &amp; Staff</Badge>
                  <IconTile icon={ShieldCheck} tone="dark" size="lg" />
                </div>
                <h3 className="mt-5 text-2xl font-bold leading-tight text-white">Stock, approvals and returns under control.</h3>
                <ul className="mt-5 space-y-3 text-[15px] text-side-text">
                  {STAFF_POINTS.map((t) => (
                    <li key={t} className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-cyan-light" aria-hidden /><span className="min-w-0">{t}</span></li>
                  ))}
                </ul>
              </NightPanel>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-8 sm:pb-20">
          <Reveal>
            <NightPanel as="div" className="rounded-[26px] px-6 py-10 shadow-[0_40px_80px_-40px_rgb(7_13_31/0.8)] sm:px-10 sm:py-12 lg:px-14">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                <Orbit className="-right-32 top-1/2 h-[360px] w-[360px] -translate-y-1/2 opacity-40 sm:h-[460px] sm:w-[460px] lg:right-[-170px] lg:opacity-60" />
              </div>
              <div className="flex flex-col items-start justify-between gap-7 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <h2 className="text-[28px] font-bold leading-tight text-white sm:text-4xl">Ready to build something?</h2>
                  <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-[#B9C6DE] sm:text-base">Sign in with your SRM account and see what the lab has today.</p>
                </div>
                <div className="flex flex-none flex-wrap gap-3">
                  <Button to={home || '/register'} variant="cyan" size="lg">Get started</Button>
                  {!session && <Button to="/login" variant="dark" size="lg">Login</Button>}
                </div>
              </div>
            </NightPanel>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line/80 bg-white/45 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-8 text-center sm:px-8 md:flex-row md:justify-between md:text-left">
          <div className="flex items-center gap-3 rounded-full bg-night py-1.5 pl-1.5 pr-5 shadow-[0_12px_28px_-14px_rgb(7_13_31/0.7)] ring-1 ring-inset ring-white/10">
            <IsdLabsLogo className="h-9 w-9" />
            <Wordmark className="text-[14px] text-white" />
          </div>
          <p className="text-sm text-muted">
            ISD Lab Management System · SRM Institute of Science and Technology · <Link to="/login" className="rounded font-medium text-brand transition-colors hover:text-brand-dark">Staff sign-in</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
