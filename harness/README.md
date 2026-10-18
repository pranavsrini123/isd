# Local preview harness (development aid, not shipped)

The build sandbox used to write this project could not reach the npm registry, so
`vite`, `react-router-dom`, `@supabase/supabase-js`, `lucide-react` and `recharts`
could not be installed there. To still *run* the real `src/` code end to end, this
folder contains:

- `build.mjs` – bundles `src/` with esbuild + Tailwind's compile API.
- `shims/` – small stand-ins for the four unavailable packages (a mini router,
  a Supabase client that talks to `server.mjs`, placeholder icons and charts).
- `server.mjs` – serves the bundle and executes the client's queries against the
  real migrated Postgres **as the `authenticated` role with the user's id**, so
  row level security and every SQL function behave exactly as on Supabase.
- `e2e.mjs` – Playwright script that drives the student and admin flows and
  saves screenshots.

None of this is used by `npm run dev` / `npm run build` / Vercel. In a normal
environment just run `npm install && npm run dev` against a Supabase project.

## Running against the real packages

Copy a `node_modules` folder from a real `npm install` (the JavaScript packages
only) and point the build at it:

```bash
REAL_MODULES=/path/to/node_modules node harness/build.mjs
```

The bundle then uses the genuine React, React Router, lucide-react and Recharts;
only `@supabase/supabase-js` is still replaced, because the harness server is not
a Supabase instance.
