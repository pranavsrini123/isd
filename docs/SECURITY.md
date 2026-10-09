# Security model

Defence in layers. Each layer assumes the one above it can be bypassed: the UI can be edited,
and any signed-in user can call the Supabase API directly with their own token.

1. **Grants**: `anon` reads no tables at all. It can call `get_public_settings()` (the allowed
   email domains for the sign-up form) and three helpers that return no data (`is_admin`,
   `lab_today`, `is_client_session`). `authenticated` gets `SELECT` on the tables and views it needs, write grants only
   on admin-managed catalogue tables, and column-limited `UPDATE` on `profiles`. Default privileges
   are revoked, so tables added later are not exposed by accident.
2. **Row level security** decides which rows each user sees or changes.
3. **Guard triggers** stop client sessions changing stock quantities, roles, account status or
   email, even on rows RLS would allow.
4. **SECURITY DEFINER functions** are the only way to change workflow state. Each one checks
   `auth.uid()` and the caller's role and status itself, and runs with `search_path` pinned.

The browser only ever holds the public anon key and the user's own session.

## Policies, table by table

| Table | Who can read | Who can write directly | Why |
| --- | --- | --- | --- |
| `profiles` | yourself; admins read all | yourself, only `full_name`, `srm_id`, `department`, `preferred_difficulty`, `interests` (column grant) | Role, status and email are blocked by the column grant **and** by `guard_profiles`. Rows are created only by the sign-up trigger; nobody can delete them, so history stays intact. |
| `app_settings` | admins | nobody (use `admin_update_setting`, which validates values) | Students see only what `get_public_settings()` exposes. |
| `inventory_categories` | signed-in users | admins | |
| `inventory_items` | signed-in users (students: non-archived only) | admins may insert and edit descriptive fields; nobody may delete | Quantities are blocked by `guard_inventory_items` for every client session (admins too) and change only through `adjust_inventory` and the workflow functions, so every movement is audited and atomic. Items are archived, never deleted, to keep history. |
| `projects` | students: published only; admins: all | admins | Publishing requires at least one component (trigger). |
| `project_components` | when the parent project is visible | admins | |
| `borrow_requests`, `request_items` | the requester; admins | nobody | Created by `create_borrow_request`; status changes only through the workflow functions. |
| `borrowings`, `borrowing_items`, `return_records` | the borrower; admins | nobody | Created only by `issue_request` and `verify_return`. |
| `notifications` | the recipient only | nobody (`mark_notifications_read` for read state) | |
| `activity_logs` | admins | nobody | Append-only, written by functions and audit triggers. |
| `storage.objects` (`lab-images`) | public read | admins only | Images are not sensitive. Bucket limits: 2 MB, JPG/PNG/WebP. |

Views (`inventory_overview`, `project_readiness`, `request_overview`, `borrowing_lines`,
`activity_overview` and others) are `security_invoker`, so they apply the caller's RLS.

## Functions

| Function | Caller | Checks |
| --- | --- | --- |
| `create_borrow_request` | student/admin | signed in; account `active`; items exist, are not archived, are in stock; quantities positive; start date not in the past; loan ≤ `max_loan_days`; ≤ `max_items_per_request`; < `max_pending_requests` pending; project is published |
| `cancel_borrow_request` | owner or admin | only pending/approved; releases a reservation |
| `request_return` | borrower | own active loan; idempotent |
| `approve_request`, `reject_request`, `issue_request`, `verify_return`, `adjust_inventory` | admin | `_require_admin()` = role `admin` **and** status `active`; status preconditions; row locks; quantity checks |
| `admin_set_user_role`, `admin_set_user_status` | admin | cannot change yourself; logged |
| `admin_update_setting` | admin | validates domains, numbers and time zones |
| `report_*`, `admin_dashboard_stats` | admin | admin only |
| `get_ranked_projects` | signed-in | `security invoker`: RLS applies |
| `_log_activity`, `_notify`, `handle_new_user`, … | nobody | not granted to any client role |

## Accounts

- New accounts are always `student`. `handle_new_user` ignores any role in sign-up metadata.
- Sign-up is limited to the allowed domains by a trigger on `auth.users`. Email verification is
  required (Supabase setting) and also checked by the UI before entering the app.
- **A verified SRM email never grants admin rights.** The first admin is appointed with owner SQL
  (see SETUP.md). After that, admins appoint admins and every change is logged.
- A `suspended` user is locked out of the app and cannot use admin functions. A `restricted` user
  can browse but cannot create requests.

## Secrets

- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used by the frontend.
- The `service_role` key is not used anywhere in this project and must never be added to it.
- `.env*` files are git-ignored.

## Other measures

- Security headers in `vercel.json` (`nosniff`, `DENY` framing, a strict referrer policy and a
  permissions policy).
- CSV exports neutralise spreadsheet formula injection.
- External project links are validated as `https://` and opened with `noopener`.
- Free-text lengths are limited by database `CHECK` constraints.
