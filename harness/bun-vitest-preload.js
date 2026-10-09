// Lets `bun test` run the vitest-style unit tests in this sandbox (vitest itself
// could not be installed here). In a normal checkout use `npm test`.
// Run `node harness/build.mjs` once first so the generated icon/chart shims exist.
import { plugin } from 'bun'
import * as bunTest from 'bun:test'

const T = '/opt/npm-tools/node_modules/'
const H = import.meta.dir + '/shims/'
plugin({
  name: 'harness-aliases',
  setup(build) {
    build.module('vitest', () => ({ exports: bunTest, loader: 'object' }))
    for (const pkg of ['react', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'react-dom']) {
      build.module(pkg, () => { const m = require(T + pkg); return { exports: { default: m, ...m }, loader: 'object' } })
    }
    const map = {
      'lucide-react': '_lucide-react.gen.js', recharts: '_recharts.gen.js',
      'react-router-dom': 'react-router-dom.js', '@supabase/supabase-js': 'supabase-js.js',
    }
    for (const [pkg, file] of Object.entries(map)) {
      build.module(pkg, () => ({ exports: require(H + file), loader: 'object' }))
    }
  },
})
