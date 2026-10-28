# Testing

## 1. Database suite: `supabase/tests/`

Runs the real migrations on a throwaway PostgreSQL 16 cluster. A small stub stands in for the parts of
Supabase the migrations depend on (`auth.users`, `auth.uid()`, the `anon`/`authenticated` roles and the
storage tables). Tests switch to the `authenticated` role with a given user id, exactly as PostgREST does,
so RLS, grants and guards are exercised for real.

```bash
npm run test:db       # or: bash supabase/tests/run_tests.sh && bash supabase/tests/concurrency.sh
npm run test:db:docker   # same suite in the postgres:16 image: any OS with Docker, no local Postgres needed
```

`test:db` needs bash and the PostgreSQL 16 binaries (`PG_BIN` overrides `/usr/lib/postgresql/16/bin`).
`test:db:docker` mounts the repository read-only into the container and runs the same scripts there.

`run_catalogue_tests.sh` replaces the inventory with the audit, loads the project catalogue and runs
`50_catalogue.sql` (content, inventory links, live availability, permissions) and `55_catalogue_rerun.sql`:
re-running the load leaves admin edits alone, and rollback followed by a re-load restores every status.

`20_tests.sql` + `30_extensions.sql`: **222 assertions** covering:
- **Sign-up**: domain restriction, empty allow-list, profile creation, metadata cannot grant admin
- **Student restrictions**: cannot change own role or status, edit others, write stock, insert or
  delete items, write requests, borrowings or returns directly, read the activity log or settings,
  or call any admin function or internal helper. Anonymous users cannot read data.
- **Requests**: a pending request never touches stock; duplicate lines are merged; validation
  (over stock, zero or negative, empty, malformed, past date, too long, reversed dates,
  unpublished project, suspended account, pending limit)
- **Approval**: available → reserved; double approval refused; the last unit cannot be promised
  twice; reject and cancel release reservations
- **Issuance**: reserved → borrowed; double issue refused; unique-constraint backstop
- **Returns**: good / damaged / missing accounting; counts must add up; double verification refused
  (with a constraint backstop); all-missing never inflates availability; the loan closes and the request
  becomes "returned"
- **Adjustments**: each action, limits, a reason is required, audit log entry, quantities
  cannot be set directly even by admins, no hard deletes
- **Invariants**: total = sum of buckets and no negative bucket, checked after everything
- **Readiness**: 4 of 5 = 80% and not buildable; missing names and quantities; updates after a
  restock; a reservation drops readiness and cancelling restores it; archived items count as 0;
  a requirement above total stock; projects without components
- **Ranking**: buildable first, fewer missing first, unconfigured last, unique positions,
  deterministic, preference tie-breaks, filters, pagination; students never see drafts
- **Loan extensions**: only the borrower, only active loans, later date, total ≤ max loan days, one pending at a time, due date unchanged until an admin approves, reject/withdraw paths, closed when a return is requested, no direct table writes
- **Overdue** derivation; **admin management**; **notifications** privacy; **dashboard figures**
  equal live sums; every report runs

`60_roles_enquiry_takeaway.sql` (migration 0012): **133 assertions** covering:
- **Roles**: `is_admin()` / `is_super_admin()`, nobody can promote themselves (direct update, sign-up
  metadata or the role function), only a Super Admin changes roles or staff accounts
- **Approval separation**: an Admin cannot see pending requests, their items, their `request_overview` rows,
  their activity-log entries or the pending dashboard count, and cannot approve, reject or cancel them through the API;
  the Super Admin approves and rejects; Admins then see the approved request and issue it; returns are verified
  by the Admin and every Super Admin is notified (Admins are not)
- **Department**: sign-up stores CTech (normalised) or a typed name, accounts without one still work and can add it,
  a department cannot be cleared once set, length rules
- **Enquiries**: validation, email taken from the account, no borrow request or reservation created, staff notified,
  students see only their own, internal notes hidden from students, status history in order, closed is final, nothing deleted
- **Take-away**: validation (dates, quantities against what the lab owns, components required), no stock change on submit
  or approval, pending requests hidden from Admins, only a Super Admin decides (once), rejection needs a reason,
  no letter data before approval or for rejected / cancelled requests or for other students, the letter data matches the
  request, the Admin records the signed letter, history persisted, restricted accounts cannot request

`concurrency.sh`: 14 checks with two **simultaneous** sessions: competing approvals for the last
unit, double issuance, double return verification, an adjustment racing an approval, and two
Super Admins deciding the same take-away request.

## 2. Unit tests: `src/**/*.test.js`

```bash
npm test
```

Date handling (local calendar dates, due and overdue wording), stock and readiness helpers,
sign-up, request and return validation (including look-alike domains such as `srmist.edu.in.evil.com`),
error-message mapping, the build-instruction parser and CSV escaping. Since 0012 also: role helpers,
the department picker rules, the My requests status dropdown (options, counts, URL fallback), the
enquiry and take-away form validation, the enquiry log CSV (columns, history, formula neutralising) and the
PDF writer and permission letter (valid PDF structure, A4, escaping, wrapping, request details and both
signature sections present, refused for anything not approved).

## 3. End-to-end: `harness/`

`harness/e2e.mjs` drives the real `src/` code in Chromium (Playwright) against the real migrated database.
It runs 41 scenarios: registration with domain rejection and verification gating, wrong-password
handling, student dashboard, inventory search and item details, ranked library, project details at 80%
with the missing L298N, a full request → approve → issue → verify (with damaged parts) → inventory
update round trip checked against database values, direct API attempts to self-approve or edit stock
(refused), admin inventory create, adjust and history, the project editor, users, reports, activity,
settings, notifications, the mobile layout (no horizontal overflow) and the 404 page. It also covers the dashboard without banner or quick actions, continuous inventory scrolling past one batch, toggle geometry in both states on desktop and mobile, multi-component requests with quantity changes saved exactly, My requests without the Cancelled tab or timeline (also after refresh and a new request), and the status → action mapping (Cancel / Return + Extend / Request again / Request return) with each action checked against the database. It fails on
any browser console error.

`harness/features_e2e.mjs` (`bash harness/run_features.sh`) covers the 0012 features in the browser: registration
with the mandatory department (CTech / Other + name), the missing-department banner for older accounts, Admin vs
Super Admin screens and API refusals, approve → issue → verify with the Super Admin notification, the My requests
dropdown (counts, filtering, URL), enquiries end to end including the downloaded CSV log, and take-away end to end
including the downloaded PDF letter (checked with `pdftotext`/`pdfinfo`), plus phone layouts at 390 px.

The harness exists because the environment this was built in could not install npm packages.
It bundles with esbuild. With `REAL_MODULES=<path to a real node_modules>` it uses the genuine React,
React Router, lucide-react and Recharts packages and replaces only the Supabase client (see `harness/README.md`). Re-run the same flows against a real Supabase project before go-live,
using the checklist at the end of SETUP.md.
