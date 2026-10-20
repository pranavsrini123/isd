# ISD Lab Management System

Inventory, project readiness, borrowing and returns for the ISD Lab at SRM Institute of
Science and Technology.

**Students** can browse live stock, see which projects they can build right now, request
components and track requests and loans. **Administrators** manage inventory, approve and
issue requests, verify returns (good, damaged or missing), manage projects and users, and
view reports and the activity log.

The whole product follows one loop: Inventory → Availability → Projects → Required components →
Request → Approval → Borrow → Return → Inventory update.

## Stack

React 19 + Vite · Tailwind CSS v4 · React Router · Supabase (Postgres, Auth, RLS, Storage,
Realtime) · Lucide icons · Recharts · Vercel. There are no paid services and no server code
of our own: every rule lives in the database.

## Quick start

```bash
npm install
cp .env.example .env.local      # fill in your Supabase URL and anon key
npm run dev
```

You need a Supabase project with the migrations applied first. See **[docs/SETUP.md](docs/SETUP.md)**:
it covers the database, auth email settings, the first administrator, storage and deploying
to Vercel.

## How it is put together

| Area | Where |
| --- | --- |
| Schema, stock invariant, guards, sign-up triggers | `supabase/migrations/0001_schema.sql` |
| Readiness and recommendation engine (views + `get_ranked_projects`) | `supabase/migrations/0002_views_and_readiness.sql` |
| Workflow functions (request, approve, issue, return, adjust), reports | `supabase/migrations/0003_functions.sql` |
| Row level security and grants | `supabase/migrations/0004_rls_and_grants.sql` |
| Image bucket and Realtime | `supabase/migrations/0005_storage_realtime.sql` |
| Loan extension requests (student asks, admin approves) | `supabase/migrations/0006_loan_extensions.sql` |
| Audited inventory import (source records, review, apply/revert, lab-use-only items) | `supabase/migrations/0007_inventory_audit_import.sql`, `0008_components_audit_2026_10_12_data.sql`, admin page `/admin/import` |
| Project catalogue: 40 projects with project illustrations, live availability status and detail pages | `supabase/migrations/0009_project_catalogue.sql`, `supabase/import/project_catalogue_2026-10/` |
| Demo data (flagged `is_demo`) | `supabase/seed.sql` |
| Data access (the only module that calls Supabase) | `src/lib/api.js` |
| Student pages / admin pages | `src/pages/student`, `src/pages/admin` |

Read more:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the stock model, readiness engine and request lifecycle
- [docs/SECURITY.md](docs/SECURITY.md): every RLS policy and why it exists
- [docs/TESTING.md](docs/TESTING.md): what is tested and how to run it
- [docs/DEMO_DATA.md](docs/DEMO_DATA.md): replacing the demo inventory with the lab's real stock

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` / `npm run preview` | Production build and local preview |
| `npm test` | Unit tests (Vitest) for formatting, validation, parsers and error mapping |
| `npm run test:db` | Rebuilds a throwaway local Postgres from the migrations and runs the SQL suite and the concurrency tests (needs PostgreSQL 16 binaries) |
