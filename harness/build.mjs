// Bundles src/ for the harness: esbuild (JSX, code splitting) + Tailwind v4 compile API.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const TOOLS = '/opt/npm-tools/node_modules'
const req = createRequire(TOOLS + '/')
const esbuild = req('esbuild')
const { compile } = await import(path.join(TOOLS, 'tailwindcss/dist/lib.mjs'))
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OUT = path.join(ROOT, 'harness/out')
const API = process.env.HARNESS_API || 'http://localhost:5199'

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const shim = (name) => path.join(ROOT, 'harness/shims', name)

// esbuild needs real named exports, so generate ESM wrappers for every name the
// app imports from lucide-react / recharts, backed by the generic CJS factories.
function importedNames(pkg) {
  const names = new Set()
  const walkSrc = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walkSrc(p)
    const src = fs.readFileSync(p, 'utf8')
    for (const m of src.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${pkg}'`, 'g')))
      m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((n) => names.add(n))
  })
  walkSrc(path.join(ROOT, 'src'))
  return [...names]
}
for (const [pkg, file] of [['lucide-react', 'lucide-react.js'], ['recharts', 'recharts.js']]) {
  const gen = `import { make } from './${file}'\n` + importedNames(pkg).map((n) => `export const ${n} = make('${n}')`).join('\n') + '\n'
  fs.writeFileSync(shim(`_${file.replace('.js', '')}.gen.js`), gen)
}
// If REAL_MODULES points at a node_modules folder copied from a real `npm install`,
// bundle the genuine react / react-router / lucide-react / recharts packages and
// shim only the Supabase client (which must talk to server.mjs).
const REAL = process.env.REAL_MODULES
const alias = REAL
  ? {
      '@supabase/supabase-js': shim('supabase-js.js'),
      'lucide-react': path.join(REAL, 'lucide-react/dist/cjs/lucide-react.js'),
    }
  : {
      'react-router-dom': shim('react-router-dom.js'),
      '@supabase/supabase-js': shim('supabase-js.js'),
      'lucide-react': shim('_lucide-react.gen.js'),
      recharts: shim('_recharts.gen.js'),
    }
if (REAL) console.log('using real packages from', REAL)
const result = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.jsx')],
  bundle: true, splitting: true, format: 'esm', outdir: path.join(OUT, 'assets'),
  jsx: 'automatic', loader: { '.js': 'jsx', '.css': 'empty' }, sourcemap: true, logLevel: 'warning',
  nodePaths: REAL ? [REAL] : [TOOLS], metafile: true,
  alias,
  // CSS is compiled separately by Tailwind below.
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(API),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"harness-anon-key"',
    'process.env.NODE_ENV': '"development"',
  },
})

// Tailwind: candidates = every token in the source files.
const files = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(jsx?|html)$/.test(e.name) && files.push(path.join(d, e.name)))
walk(path.join(ROOT, 'src'))
const candidates = new Set()
for (const f of files) for (const t of fs.readFileSync(f, 'utf8').split(/[\s"'`{}<>;]+/)) if (t) candidates.add(t.replace(/^\$\{?/, ''))
const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8')
const compiler = await compile(css, {
  base: ROOT,
  loadStylesheet: async (id, base) => {
    const p = id === 'tailwindcss' ? path.join(TOOLS, 'tailwindcss/index.css') : path.resolve(base, id)
    return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') }
  },
})
fs.writeFileSync(path.join(OUT, 'app.css'), compiler.build([...candidates]))

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace('<script type="module" src="/src/main.jsx"></script>', '<link rel="stylesheet" href="/app.css" /><script type="module" src="/assets/main.js"></script>')
fs.writeFileSync(path.join(OUT, 'index.html'), html)
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true })
const kb = (n) => (n / 1024).toFixed(0) + ' kB'
const outs = Object.entries(result.metafile.outputs).filter(([k]) => k.endsWith('.js'))
console.log(`built ${outs.length} JS chunks (${kb(outs.reduce((s, [, v]) => s + v.bytes, 0))}), css ${kb(fs.statSync(path.join(OUT, 'app.css')).size)}`)
