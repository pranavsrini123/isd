-- =============================================================================
-- 0004: row level security and privileges
--
-- Layers of defence, outermost first:
--   1. GRANTs   - anon gets nothing; authenticated gets only what the app needs.
--   2. RLS      - which rows an authenticated user may see / touch.
--   3. Guards   - triggers (0001) that stop client roles changing stock, roles
--                 or account status even where RLS would allow the row.
--   4. Functions- every state transition (request, approve, issue, return,
--                 stock adjust, role change) is a SECURITY DEFINER function that
--                 re-checks the caller's identity and role itself.
--
-- Students have NO direct write access to requests, borrowings, returns, stock,
-- notifications or settings. They can only edit their own profile's
-- non-privileged columns.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Privileges: start from zero, then grant explicitly.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Read access for signed-in users (rows are then filtered by RLS / view invoker).
grant select on
  public.profiles, public.inventory_categories, public.inventory_items,
  public.projects, public.project_components, public.borrow_requests,
  public.request_items, public.borrowings, public.borrowing_items,
  public.return_records, public.notifications, public.activity_logs,
  public.app_settings,
  public.inventory_overview, public.project_component_status, public.project_readiness,
  public.request_overview, public.borrowing_lines, public.activity_overview
to authenticated;

-- Admin-managed catalogue tables: writes are allowed by grant but gated to admins by RLS.
grant insert, update, delete on public.inventory_categories to authenticated;
grant insert, update         on public.inventory_items      to authenticated;  -- no delete: archive instead
grant insert, update, delete on public.projects             to authenticated;
grant insert, update, delete on public.project_components   to authenticated;

-- Students (and admins) may edit only these profile columns of their own row.
grant update (full_name, srm_id, department, preferred_difficulty, interests)
  on public.profiles to authenticated;

-- Helpers that policies and views call under the caller's identity.
grant execute on function public.is_admin(), public.lab_today(), public.is_client_session()
  to anon, authenticated;

-- Public settings (e.g. which email domains may register) are shown before login.
grant execute on function public.get_public_settings() to anon, authenticated;

-- Student-facing and admin-facing RPCs. Each one re-checks auth.uid()/role inside.
grant execute on function
  public.get_ranked_projects(text, text, public.project_difficulty, boolean, text, int, int),
  public.create_borrow_request(uuid, text, text, date, date, jsonb),
  public.cancel_borrow_request(uuid),
  public.request_return(uuid),
  public.mark_notifications_read(uuid[]),
  public.approve_request(uuid),
  public.reject_request(uuid, text),
  public.issue_request(uuid, date),
  public.verify_return(uuid, int, int, int, text),
  public.adjust_inventory(uuid, text, int, text),
  public.admin_set_user_role(uuid, public.user_role),
  public.admin_set_user_status(uuid, public.account_status),
  public.admin_update_setting(text, jsonb),
  public.admin_dashboard_stats(),
  public.report_inventory_by_category(),
  public.report_most_borrowed(int, int),
  public.report_frequently_requested(int, int),
  public.report_damaged_lost(),
  public.report_popular_projects(int, int),
  public.report_most_active_users(int, int),
  public.report_usage_over_time(int),
  public.report_request_history(int)
to authenticated;
-- Internal helpers (_require_admin, _log_activity, _notify, ...), trigger
-- functions and handle_new_user stay un-granted: only the function owner and
-- other SECURITY DEFINER code can reach them.

-- Make sure future objects are not silently exposed to the API roles.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Row level security
-- ---------------------------------------------------------------------------
alter table public.app_settings         enable row level security;
alter table public.profiles             enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.inventory_items      enable row level security;
alter table public.projects             enable row level security;
alter table public.project_components   enable row level security;
alter table public.borrow_requests      enable row level security;
alter table public.request_items        enable row level security;
alter table public.borrowings           enable row level security;
alter table public.borrowing_items      enable row level security;
alter table public.return_records       enable row level security;
alter table public.notifications        enable row level security;
alter table public.activity_logs        enable row level security;

-- app_settings: admins read the raw table; everyone else uses get_public_settings().
create policy app_settings_admin_read on public.app_settings
  for select to authenticated using (public.is_admin());

-- profiles: you see yourself; admins see everyone. You may update your own row
-- (privileged columns are blocked by column grants AND the guard_profiles trigger).
-- No INSERT policy: rows are created only by the auth.users trigger.
-- No DELETE policy: accounts are suspended, not deleted, to keep history intact.
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Admins may not edit other people's profile columns directly either; role and
-- status changes go through admin_set_user_role / admin_set_user_status, which
-- log the change and refuse to demote the last active admin.

-- inventory_categories: everyone signed in reads; admins manage.
create policy categories_read on public.inventory_categories
  for select to authenticated using (true);
create policy categories_admin_write on public.inventory_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- inventory_items: students see only non-archived items; admins see all and
-- may create/edit descriptive fields (quantities are blocked by guard trigger).
create policy items_read on public.inventory_items
  for select to authenticated using (not is_archived or public.is_admin());
create policy items_admin_insert on public.inventory_items
  for insert to authenticated with check (public.is_admin());
create policy items_admin_update on public.inventory_items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- projects: students see published projects; admins see everything.
create policy projects_read on public.projects
  for select to authenticated using (status = 'published' or public.is_admin());
create policy projects_admin_write on public.projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- project_components: visible when the parent project is visible.
create policy components_read on public.project_components
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.projects p
               where p.id = project_id and p.status = 'published'));
create policy components_admin_write on public.project_components
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- borrow_requests / request_items: owner or admin may read; nobody writes directly.
create policy requests_read on public.borrow_requests
  for select to authenticated using (requester_id = auth.uid() or public.is_admin());
create policy request_items_read on public.request_items
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.borrow_requests r
               where r.id = request_id and r.requester_id = auth.uid()));

-- borrowings and their lines / return records: borrower or admin may read.
create policy borrowings_read on public.borrowings
  for select to authenticated using (borrower_id = auth.uid() or public.is_admin());
create policy borrowing_items_read on public.borrowing_items
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.borrowings b
               where b.id = borrowing_id and b.borrower_id = auth.uid()));
create policy return_records_read on public.return_records
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.borrowing_items bi
               join public.borrowings b on b.id = bi.borrowing_id
               where bi.id = borrowing_item_id and b.borrower_id = auth.uid()));

-- notifications: strictly private to the recipient (read-marking via RPC).
create policy notifications_read on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- activity_logs: admin-only.
create policy activity_admin_read on public.activity_logs
  for select to authenticated using (public.is_admin());
