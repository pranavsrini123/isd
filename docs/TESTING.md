# Testing

## 1. Database suite: `supabase/tests/`

Runs the real migrations on a throwaway PostgreSQL 16 cluster. A small stub stands in for the parts of
Supabase the migrations depend on (`auth.users`, `auth.uid()`, the `anon`/`authenticated` roles and the
storage tables). Tests switch to the `authenticated` role with a given user id, exactly as PostgREST does,
so RLS, grants and guards are exercised for real.

```bash
npm run test:db       # or: bash supabase/tests/run_tests.sh && bash supabase/tests/concurrency.sh
```

`20_tests.sql`: **197 assertions** covering:
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
- **Overdue** derivation; **admin management**; **notifications** privacy; **dashboard figures**
  equal live sums; every report runs

`concurrency.sh`: 11 checks with two **simultaneous** sessions: competing approvals for the last
unit, double issuance, double return verification, and an adjustment racing an approval.

## 2. Unit tests: `src/**/*.test.js`

```bash
npm test
```

Date handling (local calendar dates, due and overdue wording), stock and readiness helpers,
sign-up, request and return validation (including look-alike domains such as `srmist.edu.in.evil.com`),
error-message mapping, the build-instruction parser and CSV escaping.

## 3. End-to-end: `harness/`

`harness/e2e.mjs` drives the real `src/` code in Chromium (Playwright) against the real migrated database.
It runs 29 scenarios: registration with domain rejection and verification gating, wrong-password
handling, student dashboard, inventory search and item details, ranked library, project details at 80%
with the missing L298N, a full request → approve → issue → verify (with damaged parts) → inventory
update round trip checked against database values, direct API attempts to self-approve or edit stock
(refused), admin inventory create, adjust and history, the project editor, users, reports, activity,
settings, notifications, the mobile layout (no horizontal overflow) and the 404 page. It fails on
any browser console error.

The harness exists because the environment this was built in could not install npm packages.
It bundles with esbuild and uses small stand-ins for the router, Supabase client, icons and charts
(see `harness/README.md`). Re-run the same flows against a real Supabase project before go-live,
using the checklist at the end of SETUP.md.
