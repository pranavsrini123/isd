# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ISD Lab Management System ("INVENTRA"): inventory, project readiness, borrowing and returns for the SRM ISD Lab. React 19 + Vite 7 + Tailwind v4 + React Router 7 on the frontend, Supabase (Postgres, Auth, RLS, Storage, Realtime) as the entire backend, deployed to Vercel. There is no server code of our own: every business rule lives in the database.

## Commands

```bash
npm run dev                         # Vite dev server (http://localhost:5173)
npm run build && npm run preview    # production build + local preview
npm test                            # Vitest unit tests (src/**/*.test.js, node environment)
npx vitest run src/lib/csv.test.js  # a single test file
npx vitest run -t "parser"          # tests whose name matches
npm run test:db:docker              # full SQL suite in postgres:16 via Docker (works on Windows)
npm run test:db                     # same, against local PostgreSQL 16 binaries + bash (PG_BIN, PGTEST_PORT=54329)
```

There is no linter configured. `VERBOSE=1` makes the DB suite list every passing check.

The app needs `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`); without them `App.jsx` renders `SetupRequired`. Only the anon key may ever go in a `VITE_` variable.

## Architecture

**The database is the authority.** The React app is an untrusted client. Read `docs/ARCHITECTURE.md` (stock model, lifecycle, readiness engine) and `docs/SECURITY.md` (every RLS policy) before changing workflow or permission behaviour.

- **Stock invariant**: each inventory item has `total = available + reserved + borrowed + damaged + lost`, enforced by a CHECK constraint, each bucket `>= 0`. Quantities are never set directly (not even by admins); they only move through `SECURITY DEFINER` functions.
- **One write path per state change**: `create_borrow_request` (no stock change) → `approve_request` (available→reserved) → `issue_request` (reserved→borrowed) → `request_return` → `verify_return(good, damaged, missing)` (borrowed→available/damaged/lost); plus `reject_request`/`cancel_borrow_request`, `adjust_inventory`, loan extensions. These functions check the caller, lock the request row then inventory rows `FOR UPDATE` **in item-id order** (to avoid deadlocks), and write notifications and `activity_logs` in the same transaction. Unique constraints (`borrowings.request_id`, `return_records.borrowing_item_id`) back up idempotency.
- **Roles** (0012): `student`, `admin`, `super_admin`. `is_admin()` means active staff (either admin role); `is_super_admin()` gates approvals (`approve_request`, `reject_request`, `decide_takeaway_request`) and role changes. RLS hides `pending` borrow and take-away requests from plain admins. Use `isStaff` / `isSuperAdmin` / `homePath` from `src/lib/roles.js` in the UI, never `role === 'admin'`.
- **Enquiries and take-away** (0012): `create_enquiry` / `update_enquiry_status` (internal notes live in `enquiry_events`, hidden from students); `create_takeaway_request` → `decide_takeaway_request` (super admin) → `mark_takeaway_document_received`. Take-away moves no stock. The permission letter is built in the browser by `src/lib/takeawayLetter.js` (dependency-free PDF writer in `src/lib/pdf.js`) from `get_takeaway_letter`, which refuses unapproved requests.
- **Derived values are computed, not stored**: readiness (`project_component_status`, `project_readiness` views, `get_ranked_projects` RPC), stock status, overdue state and dashboard figures all read live data. Readiness uses only `available_qty`; `buildable` (all requirements met) is distinct from `ready_pct`. `project_components` links projects to inventory rows by foreign key, never by name.
- **Migrations** (`supabase/migrations/0001`–`0012`; run `0011` on its own before `0012`) are applied in order via the Supabase SQL editor or `supabase db push`. Add new numbered migrations rather than editing applied ones. Data migrations (e.g. `0008`) must be idempotent: the test runner re-applies `0008` and asserts row counts. `supabase/seed.sql` is demo data flagged `is_demo`. `supabase/import/*` holds the Python generators and SQL for the 2026-10 component audit and the 40-project catalogue (with load/rollback scripts).

### Frontend

- `src/lib/api.js` is the **only** module that calls Supabase. Pages call named functions (`approveRequest(id)`, `listInventory({...})`); writes go through `rpc(...)` to DB functions. Add new data access here, not in pages.
- `src/lib/errors.js`: `unwrap()` normalises Supabase responses; `friendlyError()` passes through human-written messages raised by our SQL functions (they start with a capital letter) and translates low-level Postgres/PostgREST codes. When writing SQL `raise exception` messages, write them as user-facing sentences.
- Data loading: `useQuery` (keeps last good data while refetching, ignores stale responses) + `useRealtime(tables, refetch)` (debounced refetch on Postgres changes; Realtime respects RLS) + `useSearchState` (filters in the URL).
- Routing in `src/App.jsx`: public auth pages, `/student/*` under `RequireAuth`, `/admin/*` under `RequireAdmin`; portal pages are lazy-loaded. Guards only shape navigation; the DB enforces the same rules.
- Contexts: `AuthContext` (session, profile, verification, reset), `CartContext` (request basket), `ToastContext`.
- Some pure helpers are exported from page modules and unit-tested there (e.g. `parseSteps`/`availabilityOf` in `pages/student/ProjectDetails.jsx`, `discrepancyCsv` in `pages/admin/Import.jsx`; tests in `src/pages/helpers.test.js`).

### Tests

- `supabase/tests/`: `reset_db.sh` builds a throwaway `isdtest` DB from `00_supabase_stub.sql` (stands in for `auth.users`, `auth.uid()`, roles, storage) + all migrations + seed. SQL tests switch to the `authenticated` role with a given user id, so RLS and grants are exercised for real. Suites: `20_tests.sql`, `30_extensions.sql`, `40_import.sql`, `50`/`55_catalogue*.sql`; `concurrency.sh` races two real sessions. New DB behaviour should get assertions here.
- `harness/` is a development aid, not shipped: an esbuild bundle of `src/` with shims for npm packages, a server that runs queries against the migrated Postgres as `authenticated`, and a Playwright e2e script (`harness/e2e.mjs`). It exists because the original build environment had no npm access; it is not used by `npm run dev`/`build`/Vercel.

## Deployment notes

`vercel.json` sets the SPA rewrite and security headers. Auth setup (email confirmation, redirect URLs, SMTP), the first-admin SQL, the `lab-images` storage bucket and Realtime publication are covered in `docs/SETUP.md`. Sign-up is restricted to allowed email domains (default `@srmist.edu.in`) by a trigger on `auth.users`; everyone registers as a student, with a mandatory department (CTech or a typed name). The first Super Admin is appointed with owner SQL (see `docs/SETUP.md`).
