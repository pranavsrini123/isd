import { ArrowLeft } from 'lucide-react'
import { Logo } from '../../components/layout/Logo'
import { Button, NightPanel } from '../../components/ui/primitives'
import { EASE_OUT, Stagger, StaggerItem, m, useMotionOK } from '../../components/ui/motion'
import { Orbit } from '../../components/ui/decor'

const DIGIT = 'inline-block bg-gradient-to-b from-white via-cyan-light to-cyan bg-clip-text text-transparent'

/** Any unknown address: the softly lit page with a glowing night panel, like the guard screens. */
export default function NotFound() {
  const ok = useMotionOK()
  const Rise = ok ? m.div : 'div'
  const Drift = ok ? m.div : 'div'
  const rise = ok ? { initial: { opacity: 0, y: 18, scale: 0.985 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.6, ease: EASE_OUT } } : {}
  const drift = ok ? { animate: { rotate: 360 }, transition: { duration: 140, ease: 'linear', repeat: Infinity } } : {}

  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-page px-4 py-10 text-center sm:px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[46%] h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.2),transparent)]" />
        <div className="absolute -bottom-48 -right-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(79_123_255/0.12),transparent)]" />
        <div className="tex-dots absolute inset-0 [mask-image:radial-gradient(closest-side,#000,transparent)]" />
      </div>

      <Logo />

      <Rise className="mt-8 w-full max-w-[520px] sm:mt-10" {...rise}>
        <NightPanel as="main" className="rounded-[28px] px-6 pb-9 pt-7 shadow-[0_32px_70px_-30px_rgb(7_13_31/0.8)] sm:px-12 sm:pb-12 sm:pt-9">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-2 h-56 w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.2),transparent)]" />
            <Drift className="absolute -right-28 -top-28 h-72 w-72 opacity-55 sm:-right-24 sm:h-80 sm:w-80" {...drift}>
              <Orbit className="inset-0 h-full w-full" />
            </Drift>
            <Orbit className="-bottom-32 -left-32 h-72 w-72 opacity-25" />
          </div>

          <Stagger className="relative flex flex-col items-center">
            <Stagger as="p" className="font-mono text-[92px] font-semibold leading-none tracking-tight drop-shadow-[0_0_26px_rgb(34_211_238/0.35)] sm:text-[124px]">
              <StaggerItem as="span" className={DIGIT}>4</StaggerItem>
              <StaggerItem as="span" className={DIGIT}>0</StaggerItem>
              <StaggerItem as="span" className={DIGIT}>4</StaggerItem>
            </Stagger>
            <StaggerItem aria-hidden className="mt-4 flex items-center gap-2">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-cyan/70" />
              <span className="h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_10px_rgb(34_211_238/0.9)]" />
              <span className="h-px w-12 bg-gradient-to-l from-transparent to-cyan/70" />
            </StaggerItem>
            <StaggerItem as="h1" className="mt-5 text-balance text-[26px] font-bold leading-tight text-white sm:text-[32px]">We couldn't find that page</StaggerItem>
            <StaggerItem as="p" className="mt-2.5 max-w-sm text-balance text-[15px] leading-relaxed text-[#B9C6DE]">The link may be old, or the page has moved.</StaggerItem>
            <StaggerItem className="mt-7">
              <Button to="/" size="lg" icon={ArrowLeft}>Back to home</Button>
            </StaggerItem>
          </Stagger>
        </NightPanel>
      </Rise>
    </div>
  )
}
