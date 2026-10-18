# Architecture

## Principles

1. **The database is the authority.** Every rule that matters (who may do what, how stock moves,
   what counts as available) is enforced in Postgres. The React app is a client and is never
   trusted for security.
2. **One write path per state change.** Requests, approvals, issuance, returns, stock adjustments,
   role and status changes are `SECURITY DEFINER` functions that check the caller, lock the rows
   they touch and update everything in one transaction.
3. **Derived numbers are computed, not stored.** Readiness, stock status, overdue state and
   dashboard figures come from views and functions over live data.

## Stock model

For every inventory item:

```
total = available + reserved + borrowed + damaged + lost
```

A `CHECK` constraint enforces this, and every bucket has a `>= 0` check, so negative or
inconsistent stock cannot be stored, whatever code runs.

| Bucket | Meaning |
| --- | --- |
| available | In the lab, usable and not promised to anyone. This is the only number readiness uses. |
| reserved | Promised to an **approved** request but not yet handed over. |
| borrowed | Issued and not yet verified as returned. |
| damaged | In the lab but unusable (awaiting repair or write-off). |
| lost | Reported missing. Kept in the total so the loss stays visible until an admin writes it off. |

### Request lifecycle and stock movement

| Step | Function | Status | Stock |
| --- | --- | --- | --- |
| Student submits | `create_borrow_request` | pending | **no change** (validated against available only) |
| Admin approves | `approve_request` | approved | available → reserved (fails if not enough) |
| Admin rejects / anyone cancels an approved request | `reject_request` / `cancel_borrow_request` | rejected / cancelled | reserved → available |
| Admin issues | `issue_request` | issued | reserved → borrowed; creates the borrowing and its lines |
| Student asks to return | `request_return` | issued | none (flags the loan for verification) |
| Student asks for more time | `request_loan_extension` | issued | none; due date changes only when an admin approves (`review_loan_extension`). Total loan ≤ `max_loan_days`, one pending request per loan |
| Admin verifies each line | `verify_return(good, damaged, missing)` | returned once every line is verified | borrowed → available / damaged / lost |
| Admin adjusts | `adjust_inventory(action, qty, reason)` | | add stock, remove, mark damaged, repair, write off, recover lost |

Why approval and issuance are separate: approval **reserves** the parts, so two approvals can
never promise the same unit, and the student can still collect later. Issuance records the
hand-over and starts the due-date clock.

### Concurrency and duplicates

- Each function locks the request row and then the affected inventory rows with
  `SELECT … FOR UPDATE`, **always in item-id order**, so concurrent operations queue instead of
  deadlocking or overselling. The losing operation re-reads the committed stock and fails with a
  clear message.
- Status checks make repeated calls fail safely ("Request REQ-1004 is approved and cannot be approved").
- Two unique constraints back this up even if function logic were bypassed:
  `borrowings.request_id` (one issuance per request) and `return_records.borrowing_item_id`
  (one verification per borrowed line).
- `supabase/tests/concurrency.sh` races two real database sessions for the last unit, the same
  issuance, the same return line, and an adjustment against an approval.

## Readiness and recommendation engine

Defined in `0002_views_and_readiness.sql` and reused by every screen.

- `project_components` links each project to **inventory rows** (foreign keys, never names).
- `project_component_status`: one row per requirement with `available_qty`, `missing_qty` and
  `satisfied`. Archived items count as 0 available.
- `project_readiness`: one row per project:
  - `ready_pct = round(100 × satisfied requirement types / required types)`
  - `buildable = every requirement is satisfied` (a separate flag: 80% ready is **not** buildable)
  - `missing_types`, `missing_units`
- `get_ranked_projects(search, category, difficulty, buildable_only, sort, limit, offset)`
  returns readiness, the list of missing components with quantities, and a deterministic rank:
  1. projects with at least one requirement before unconfigured ones
  2. buildable first
  3. fewest unmet requirement types
  4. highest readiness percentage
  5. matches the student's preferred difficulty, then one of their interests (from their profile)
  6. name, then id (a stable tie-break, so order never flickers)

Because readiness reads `available_qty`, it reacts to everything automatically: approvals
(stock becomes reserved), returns, damage, archiving and adjustments. Screens subscribe to
Realtime and refetch, so open pages update within about a second.

A project's requirements are distinct inventory rows, so checking each requirement against
available stock is also the check that the whole project can be supplied at once.

## Frontend

- `src/lib/api.js` is the only module that calls Supabase. Pages call named functions such as
  `approveRequest(id)` and never build queries themselves.
- `src/hooks/useQuery.js` handles loading, error, retry and refetch without flicker;
  `useRealtime.js` refetches when relevant tables change; `useSearchState.js` keeps filters in the URL.
- `AuthContext` handles the session, profile, email verification, password reset and sign-out.
  Route guards (`RequireAuth`, `RequireAdmin`) only shape navigation. The database enforces the
  same rules on every call.
- Portal pages are code-split. Student and admin share components but differ in density
  (`PortalContext`).

## Notifications and audit

- `notifications`: one row per recipient, written by the workflow functions (submitted, approved,
  rejected, issued, return requested, return verified). Read-only to the recipient, except
  marking items read via `mark_notifications_read`.
- `activity_logs`: append-only. Written by workflow functions (with reasons) and by audit triggers
  on direct admin edits of items, projects, components and categories (with a field-level diff).
  Admins read it through `activity_overview`.

## Preparing for an AI assistant (optional, later)

The deterministic engine comes first and stays the source of truth. A later assistant (e.g.
"what can I build with what's available?") should:
- run as a Supabase Edge Function holding the model API key server-side;
- call `get_ranked_projects` and the views **with the student's own JWT**, so RLS still applies;
- only explain or summarise those results, never invent stock levels or take actions;
  any request it drafts goes through `create_borrow_request` like any other.

No AI code is shipped yet. Nothing in the current design needs to change to add it.
