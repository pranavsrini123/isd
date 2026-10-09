export default function SetupRequired() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-6">
      <div className="max-w-lg rounded-[20px] border border-line bg-white p-8 shadow-card">
        <h1 className="text-2xl font-bold">Connect Supabase to continue</h1>
        <p className="mt-2 text-muted">This build has no Supabase project configured. Create <code className="font-mono text-sm">.env.local</code> (or set Vercel environment variables) with:</p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-navy p-4 font-mono text-[13px] text-cyan-light">VITE_SUPABASE_URL=https://xxxx.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=your-public-anon-key</pre>
        <p className="mt-4 text-sm text-muted">Use the public <strong>anon</strong> key only — never the service-role key. See <code className="font-mono">docs/SETUP.md</code>.</p>
      </div>
    </div>
  )
}
