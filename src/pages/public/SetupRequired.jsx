import { KeyRound, PlugZap } from 'lucide-react'
import { LogoMark } from '../../components/layout/Logo'
import { IconTile, NightPanel } from '../../components/ui/primitives'
import { EASE_OUT, Stagger, StaggerItem, m, useMotionOK } from '../../components/ui/motion'
import { Orbit } from '../../components/ui/decor'

// App renders this before the auth and toast providers exist (no Supabase project yet),
// so it only uses plain UI pieces: no data, no toasts, no auth.

function Code({ children }) {
  return <code className="num whitespace-nowrap rounded-md bg-cyan-soft/80 px-1.5 py-px text-[0.88em] text-brand ring-1 ring-inset ring-brand/10">{children}</code>
}

function EnvLine({ name, value }) {
  return <><span className="text-cyan-light">{name}</span><span className="text-subtle">=</span><span className="text-[#D6E0F0]">{value}</span></>
}

export default function SetupRequired() {
  const ok = useMotionOK()
  const Rise = ok ? m.div : 'div'
  const rise = ok ? { initial: { opacity: 0, y: 18, scale: 0.985 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.6, ease: EASE_OUT } } : {}

  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-page px-4 py-10 sm:px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[42%] h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(34_211_238/0.18),transparent)]" />
        <div className="absolute -bottom-48 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgb(79_123_255/0.12),transparent)]" />
        <div className="tex-dots absolute inset-0 [mask-image:radial-gradient(closest-side,#000,transparent)]" />
      </div>

      <LogoMark size={44} />

      <Rise className="mt-7 w-full max-w-[600px]" {...rise}>
        <main className="glass overflow-hidden rounded-[24px]">
          <NightPanel as="div" className="px-5 pb-7 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              <Orbit className="-right-24 -top-28 h-72 w-72 opacity-60 sm:-right-16" />
            </div>
            <IconTile icon={PlugZap} tone="dark" size="lg" className="shadow-[0_0_30px_-6px_rgb(34_211_238/0.7)]" />
            <h1 className="mt-5 text-balance text-[26px] font-bold leading-[1.15] text-white sm:text-[30px]">Connect Supabase to continue</h1>
          </NightPanel>

          <Stagger className="space-y-5 px-5 py-6 sm:px-8 sm:py-7">
            <StaggerItem as="p" className="text-[15px] leading-relaxed text-muted">
              This build has no Supabase project configured. Create <Code>.env.local</Code> (or set Vercel environment variables) with:
            </StaggerItem>

            {/* Edge to edge on phones so both lines fit without scrolling sideways. */}
            <StaggerItem className="-mx-5 sm:mx-0">
              <NightPanel as="div" className="shadow-[0_18px_40px_-22px_rgb(7_13_31/0.7)] sm:rounded-2xl">
                <div aria-hidden className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan shadow-[0_0_8px_rgb(34_211_238/0.8)]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                </div>
                <pre className="num overflow-x-auto px-4 py-3.5 text-[11.5px] leading-[1.9] min-[375px]:text-[12px] sm:px-5 sm:text-[13px]">
                  <EnvLine name="VITE_SUPABASE_URL" value="https://xxxx.supabase.co" />{'\n'}
                  <EnvLine name="VITE_SUPABASE_ANON_KEY" value="your-public-anon-key" />
                </pre>
              </NightPanel>
            </StaggerItem>

            <StaggerItem className="flex items-start gap-3 rounded-2xl border border-warn-solid/25 bg-warn-bg/60 px-4 py-3.5">
              <KeyRound className="mt-0.5 h-4 w-4 flex-none text-warn" aria-hidden />
              <p className="min-w-0 text-pretty text-sm leading-relaxed text-ink/80">
                Use the public <strong className="font-semibold text-ink">anon</strong> key only — never the service-role key. See <Code>docs/SETUP.md</Code>.
              </p>
            </StaggerItem>
          </Stagger>
        </main>
      </Rise>
    </div>
  )
}
