-- =============================================================================
-- 0012: Super Admin / Admin separation, mandatory department, enquiries and
--       component take-away permissions
--
-- Requires 0011 (the super_admin enum value) to have been run and committed.
--
-- ROLES
--   student      unchanged.
--   admin        lab operations: issue approved requests, verify returns, loan
--                extensions, inventory, projects, enquiries, reports. Cannot see
--                PENDING borrow requests at all (RLS), cannot approve or reject
--                requests, cannot approve take-away requests, cannot change roles.
--   super_admin  everything an admin can do, plus: the approval queue (approve /
--                reject borrow requests), take-away approvals, role changes, and a
--                notification whenever an admin finishes verifying a return.
--
--   is_admin() now means "active staff" (admin OR super_admin), so every
--   existing staff policy keeps working for both roles. is_super_admin() is new.
--
-- MIGRATION OF EXISTING ACCOUNTS
--   Every existing active admin becomes a super_admin, so nobody loses access
--   and the approval queue keeps working the moment this runs. A super admin
--   then changes operational staff to "Admin" from Admin -> Users.
--
-- DEPARTMENT
--   profiles.department is validated (2-100 characters, "CTech" normalised),
--   new sign-ups store the department chosen on the form, and once set a user
--   cannot clear it. Existing users without one are asked to add it in the app.
--
-- ENQUIRIES
--   enquiries + enquiry_events (status history with internal notes). Students
--   create them and see their own; staff (admin and super_admin) see and manage
--   all of them. Internal notes live in enquiry_events, which students cannot
--   read. Nothing is ever deleted.
--
-- COMPONENT TAKE-AWAY
--   takeaway_requests + takeaway_items (inventory foreign keys) + takeaway_events.
--   Lifecycle: pending -> approved | rejected | cancelled; approved -> submitted
--   (an admin records that the signed paper letter was handed in). Only a super
--   admin can approve or reject. The permission letter data is served only for
--   approved/submitted requests (get_takeaway_letter).
--   STOCK: a take-away permission is a permission record, not a stock movement.
--   No quantity changes on submit or approval. If components must be issued from
--   lab stock, that happens through the normal borrowing flow
--   (request -> approval -> issue), so stock accounting keeps one write path.
--
-- No existing rows are deleted. Safe to run once on a database with 0001-0011.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Role helpers
-- ---------------------------------------------------------------------------

-- Active staff: admin or super_admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin') and p.status = 'active'
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'active'
  );
$$;

create or replace function public._require_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Super Admin privileges required' using errcode = '42501';
  end if;
end;
$$;

-- Staff notifications now reach both admin roles.
create or replace function public._notify_admins(
  p_type text, p_title text, p_body text default null, p_link text default null
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select id, p_type, p_title, p_body, p_link
  from public.profiles where role in ('admin', 'super_admin') and status = 'active';
$$;

create or replace function public._notify_super_admins(
  p_type text, p_title text, p_body text default null, p_link text default null
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select id, p_type, p_title, p_body, p_link
  from public.profiles where role = 'super_admin' and status = 'active';
$$;

-- Existing administrators keep full authority (see header).
update public.profiles set role = 'super_admin' where role = 'admin';

-- ---------------------------------------------------------------------------
-- 2. Borrow requests: pending requests are visible to the requester and super
--    admins only. request_items, request_overview and the activity log follow
--    automatically because they read borrow_requests under the caller's RLS.
-- ---------------------------------------------------------------------------
drop policy if exists requests_read on public.borrow_requests;
create policy requests_read on public.borrow_requests
  for select to authenticated using (
    requester_id = auth.uid()
    or public.is_super_admin()
    or (public.is_admin() and status <> 'pending'));

drop policy if exists request_items_read on public.request_items;
create policy request_items_read on public.request_items
  for select to authenticated using (
    exists (select 1 from public.borrow_requests r where r.id = request_id));

-- Admins see the whole log except entries about requests they cannot see.
drop policy if exists activity_admin_read on public.activity_logs;
create policy activity_admin_read on public.activity_logs
  for select to authenticated using (
    public.is_super_admin()
    or (public.is_admin()
        and (entity_type <> 'borrow_request'
             or exists (select 1 from public.borrow_requests r where r.id = entity_id))));

-- Submitting: same rules as 0003; the notification now goes to super admins only.
create or replace function public.create_borrow_request(
  p_project_id   uuid,
  p_purpose      text,
  p_note         text,
  p_needed_from  date,
  p_needed_until date,
  p_items        jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid         uuid := auth.uid();
  prof        public.profiles;
  req_id      uuid;
  rec         record;
  it          public.inventory_items;
  n_items     int := 0;
  max_days    int := public._setting_int('max_loan_days', 14);
  max_items   int := public._setting_int('max_items_per_request', 20);
  max_pending int := public._setting_int('max_pending_requests', 5);
  req_code    text;
begin
  if uid is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;
  select * into prof from public.profiles where id = uid;
  if not found or prof.status <> 'active' then
    raise exception 'Your account is not allowed to make requests' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one component';
  end if;
  if p_purpose is null or char_length(trim(p_purpose)) < 3 then
    raise exception 'Describe the purpose of the request';
  end if;
  if p_needed_from is null or p_needed_until is null then
    raise exception 'Both dates are required';
  end if;
  if p_needed_from < public.lab_today() then
    raise exception 'The start date cannot be in the past';
  end if;
  if p_needed_until < p_needed_from then
    raise exception 'The end date must be on or after the start date';
  end if;
  if (p_needed_until - p_needed_from) > max_days then
    raise exception 'Loans are limited to % days', max_days;
  end if;
  if (select count(*) from public.borrow_requests
       where requester_id = uid and status = 'pending') >= max_pending then
    raise exception 'You already have % pending requests. Wait for a decision or cancel one.', max_pending;
  end if;
  if p_project_id is not null and not exists (
       select 1 from public.projects where id = p_project_id and status = 'published') then
    raise exception 'That project is not available';
  end if;

  insert into public.borrow_requests
    (requester_id, project_id, purpose, note, needed_from, needed_until)
  values
    (uid, p_project_id, trim(p_purpose), nullif(trim(coalesce(p_note, '')), ''), p_needed_from, p_needed_until)
  returning id, request_code into req_id, req_code;

  for rec in
    select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'qty')::int)::int as qty
      from jsonb_array_elements(p_items) e
     group by 1
     order by 1
  loop
    if rec.item_id is null or rec.qty is null or rec.qty <= 0 then
      raise exception 'Quantities must be positive whole numbers';
    end if;
    select * into it from public.inventory_items where id = rec.item_id;
    if not found or it.is_archived then
      raise exception 'One of the selected components is no longer available';
    end if;
    if rec.qty > it.available_qty then
      raise exception 'Only % of "%" available (you asked for %)', it.available_qty, it.name, rec.qty;
    end if;
    insert into public.request_items (request_id, item_id, qty) values (req_id, rec.item_id, rec.qty);
    n_items := n_items + 1;
  end loop;

  if n_items > max_items then
    raise exception 'A request can include at most % different components', max_items;
  end if;

  perform public._log_activity('request.created', 'borrow_request', req_id,
    format('%s submitted request %s (%s components)', prof.full_name, req_code, n_items));
  perform public._notify_super_admins('request_submitted', 'New request ' || req_code,
    prof.full_name || ' requested ' || n_items || ' component(s)', '/admin/requests');
  return req_id;

exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'The item list is not valid';
end;
$$;

-- Cancelling: the requester, a super admin, or an admin for an APPROVED request
-- (admins never act on pending requests).
create or replace function public.cancel_borrow_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  req public.borrow_requests;
  uid uuid := auth.uid();
begin
  select * into req from public.borrow_requests where id = p_request_id for update;
  if not found
     or (req.requester_id is distinct from uid
         and not public.is_super_admin()
         and not (public.is_admin() and req.status = 'approved')) then
    raise exception 'Request not found' using errcode = '42501';
  end if;
  if req.status not in ('pending', 'approved') then
    raise exception 'Request % is % and can no longer be cancelled', req.request_code, req.status;
  end if;
  if req.status = 'approved' then
    perform public._release_reservation(req.id);
  end if;
  update public.borrow_requests set status = 'cancelled' where id = req.id;
  perform public._log_activity('request.cancelled', 'borrow_request', req.id,
    format('Request %s cancelled', req.request_code));
end;
$$;

-- Approving: super admin only. Otherwise identical to 0003.
create or replace function public.approve_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  req public.borrow_requests;
  li  record;
begin
  perform public._require_super_admin();

  select * into req from public.borrow_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'Request % is % and cannot be approved', req.request_code, req.status;
  end if;

  perform 1 from public.inventory_items i
   where i.id in (select item_id from public.request_items where request_id = req.id)
   order by i.id
   for update;

  for li in
    select ri.item_id, ri.qty, i.name, i.available_qty, i.is_archived
      from public.request_items ri
      join public.inventory_items i on i.id = ri.item_id
     where ri.request_id = req.id
     order by ri.item_id
  loop
    if li.is_archived or li.available_qty < li.qty then
      raise exception 'Not enough "%" in stock: % needed, % available', li.name, li.qty, li.available_qty;
    end if;
    update public.inventory_items
       set available_qty = available_qty - li.qty,
           reserved_qty  = reserved_qty  + li.qty
     where id = li.item_id;
  end loop;

  update public.borrow_requests
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
   where id = req.id;

  perform public._log_activity('request.approved', 'borrow_request', req.id,
    format('Approved request %s', req.request_code));
  perform public._notify(req.requester_id, 'request_approved',
    'Request ' || req.request_code || ' approved',
    'Your components are reserved. Collect them from the lab.', '/student/requests');
  -- Admins learn about the request only now, when it is theirs to issue.
  perform public._notify_admins('request_ready_to_issue', 'Ready to issue: ' || req.request_code,
    'Approved and reserved. Hand the components over from Issuance.', '/admin/issuance');
end;
$$;

-- Rejecting: super admin only. Otherwise identical to 0003.
create or replace function public.reject_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  req public.borrow_requests;
begin
  perform public._require_super_admin();
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'A rejection reason is required';
  end if;

  select * into req from public.borrow_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if req.status not in ('pending', 'approved') then
    raise exception 'Request % is % and cannot be rejected', req.request_code, req.status;
  end if;
  if req.status = 'approved' then
    perform public._release_reservation(req.id);
  end if;

  update public.borrow_requests
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = trim(p_reason)
   where id = req.id;

  perform public._log_activity('request.rejected', 'borrow_request', req.id,
    format('Rejected request %s', req.request_code), jsonb_build_object('reason', trim(p_reason)));
  perform public._notify(req.requester_id, 'request_rejected',
    'Request ' || req.request_code || ' rejected', trim(p_reason), '/student/requests');
end;
$$;

-- Verifying a return: unchanged stock logic from 0003; when the last line of a
-- loan is verified, every super admin is notified.
create or replace function public.verify_return(
  p_line_id uuid, p_good int, p_damaged int, p_missing int, p_notes text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  line record;
  code text;
  tot  record;
  actor text;
begin
  perform public._require_admin();
  if p_good is null or p_damaged is null or p_missing is null
     or p_good < 0 or p_damaged < 0 or p_missing < 0 then
    raise exception 'Quantities must be zero or more';
  end if;

  select bi.id, bi.borrowing_id, bi.item_id, bi.qty_issued, b.request_id, b.borrower_id
    into line
    from public.borrowing_items bi
    join public.borrowings b on b.id = bi.borrowing_id
   where bi.id = p_line_id
   for update of bi;
  if not found then
    raise exception 'Borrowed line not found';
  end if;

  if exists (select 1 from public.return_records where borrowing_item_id = line.id) then
    raise exception 'This line has already been verified';
  end if;
  if p_good + p_damaged + p_missing <> line.qty_issued then
    raise exception 'Returned quantities must add up to the % issued', line.qty_issued;
  end if;

  perform 1 from public.inventory_items where id = line.item_id for update;

  update public.inventory_items
     set borrowed_qty  = borrowed_qty  - line.qty_issued,
         available_qty = available_qty + p_good,
         damaged_qty   = damaged_qty   + p_damaged,
         lost_qty      = lost_qty      + p_missing
   where id = line.item_id;

  insert into public.return_records
    (borrowing_item_id, verified_by, qty_good, qty_damaged, qty_missing, notes)
  values (line.id, auth.uid(), p_good, p_damaged, p_missing, nullif(trim(coalesce(p_notes, '')), ''));

  select request_code into code from public.borrow_requests where id = line.request_id;

  if not exists (
       select 1 from public.borrowing_items bi2
        where bi2.borrowing_id = line.borrowing_id
          and not exists (select 1 from public.return_records rr where rr.borrowing_item_id = bi2.id)) then
    update public.borrowings set status = 'closed', closed_at = now() where id = line.borrowing_id;
    update public.borrow_requests set status = 'returned' where id = line.request_id;
    perform public._notify(line.borrower_id, 'return_verified',
      'Return verified for ' || code, 'Thank you for returning your components.', '/student/requests');

    select coalesce(sum(rr.qty_good), 0) as good, coalesce(sum(rr.qty_damaged), 0) as damaged,
           coalesce(sum(rr.qty_missing), 0) as missing
      into tot
      from public.return_records rr
      join public.borrowing_items bi3 on bi3.id = rr.borrowing_item_id
     where bi3.borrowing_id = line.borrowing_id;
    select full_name into actor from public.profiles where id = auth.uid();
    perform public._notify_super_admins('return_verified_by_admin',
      'Return verified for ' || code,
      format('%s verified the return: %s good, %s damaged, %s missing.',
             coalesce(nullif(actor, ''), 'An admin'), tot.good, tot.damaged, tot.missing),
      '/admin/issuance');
  end if;

  perform public._log_activity('return.verified', 'borrowing', line.borrowing_id,
    format('Verified return for %s: %s good, %s damaged, %s missing', code, p_good, p_damaged, p_missing),
    jsonb_build_object('item_id', line.item_id, 'good', p_good, 'damaged', p_damaged, 'missing', p_missing));
end;
$$;

-- Dashboard: admins get null for the pending count (the queue is not theirs).
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  inv jsonb;
  ops jsonb;
  sup boolean := public.is_super_admin();
begin
  perform public._require_admin();

  select jsonb_build_object(
    'item_types',  count(*),
    'total_units', coalesce(sum(total_qty), 0),
    'available',   coalesce(sum(available_qty), 0),
    'reserved',    coalesce(sum(reserved_qty), 0),
    'borrowed',    coalesce(sum(borrowed_qty), 0),
    'damaged',     coalesce(sum(damaged_qty), 0),
    'lost',        coalesce(sum(lost_qty), 0),
    'low_stock',   count(*) filter (where available_qty <= low_stock_threshold)
  ) into inv
  from public.inventory_items where not is_archived;

  select jsonb_build_object(
    'pending_requests',     case when sup then (select count(*) from public.borrow_requests where status = 'pending') end,
    'approved_awaiting',    (select count(*) from public.borrow_requests where status = 'approved'),
    'active_borrowings',    (select count(*) from public.borrowings where status = 'active'),
    'overdue_lines',        (select count(*) from public.borrowing_lines where is_overdue),
    'overdue_units',        (select coalesce(sum(qty_issued), 0) from public.borrowing_lines where is_overdue),
    'returns_to_verify',    (select count(*) from public.borrowing_lines l
                              where not l.is_verified and l.return_requested_at is not null),
    'open_enquiries',       (select count(*) from public.enquiries where status in ('open', 'in_progress')),
    'pending_takeaways',    case when sup then (select count(*) from public.takeaway_requests where status = 'pending') end,
    'takeaways_awaiting_document', (select count(*) from public.takeaway_requests where status = 'approved')
  ) into ops;

  return inv || ops;
end;
$$;

-- Reports that count requests leave out pending ones for admins.
create or replace function public.report_frequently_requested(p_days int default 90, p_limit int default 10)
returns table (item_id uuid, item_name text, units_requested bigint, requests bigint, available_now int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  sup boolean := public.is_super_admin();
begin
  perform public._require_admin();
  return query
    select i.id, i.name, sum(ri.qty)::bigint, count(*)::bigint, i.available_qty
      from public.request_items ri
      join public.borrow_requests r on r.id = ri.request_id
      join public.inventory_items i on i.id = ri.item_id
     where r.created_at >= now() - make_interval(days => greatest(p_days, 1))
       and (sup or r.status <> 'pending')
     group by i.id, i.name, i.available_qty
     order by 3 desc, i.name
     limit greatest(p_limit, 1);
end;
$$;

create or replace function public.report_popular_projects(p_days int default 90, p_limit int default 10)
returns table (project_id uuid, project_name text, requests bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  sup boolean := public.is_super_admin();
begin
  perform public._require_admin();
  return query
    select p.id, p.name, count(*)::bigint
      from public.borrow_requests r
      join public.projects p on p.id = r.project_id
     where r.created_at >= now() - make_interval(days => greatest(p_days, 1))
       and (sup or r.status <> 'pending')
     group by p.id, p.name
     order by 3 desc, p.name
     limit greatest(p_limit, 1);
end;
$$;

create or replace function public.report_most_active_users(p_days int default 90, p_limit int default 10)
returns table (user_id uuid, full_name text, email text, requests bigint, loans bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  sup boolean := public.is_super_admin();
begin
  perform public._require_admin();
  return query
    select p.id, p.full_name, p.email,
           count(r.id)::bigint,
           count(b.id)::bigint
      from public.borrow_requests r
      join public.profiles p on p.id = r.requester_id
      left join public.borrowings b on b.request_id = r.id
     where r.created_at >= now() - make_interval(days => greatest(p_days, 1))
       and (sup or r.status <> 'pending')
     group by p.id, p.full_name, p.email
     order by 4 desc, p.full_name
     limit greatest(p_limit, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Role and status changes
--    Only a super admin changes roles. Nobody changes their own role or status.
--    At least one active super admin always remains.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.profiles;
begin
  perform public._require_super_admin();
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  select * into target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found';
  end if;
  if target.role = 'super_admin' and target.status = 'active' and p_role <> 'super_admin'
     and (select count(*) from public.profiles where role = 'super_admin' and status = 'active') <= 1 then
    raise exception 'At least one active Super Admin must remain';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  perform public._log_activity('user.role_changed', 'profile', p_user_id,
    format('%s: role %s → %s', target.email, target.role, p_role),
    jsonb_build_object('from', target.role, 'to', p_role));
end;
$$;

-- Admins may restrict or suspend students; only a super admin may change the
-- status of a staff account.
create or replace function public.admin_set_user_status(p_user_id uuid, p_status public.account_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.profiles;
begin
  perform public._require_admin();
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own account status';
  end if;
  select * into target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found';
  end if;
  if target.role in ('admin', 'super_admin') and not public.is_super_admin() then
    raise exception 'Only a Super Admin can change the status of a staff account' using errcode = '42501';
  end if;
  if target.role = 'super_admin' and target.status = 'active' and p_status <> 'active'
     and (select count(*) from public.profiles where role = 'super_admin' and status = 'active') <= 1 then
    raise exception 'At least one active Super Admin must remain';
  end if;
  update public.profiles set status = p_status where id = p_user_id;
  perform public._log_activity('user.status_changed', 'profile', p_user_id,
    format('%s: status %s → %s', target.email, target.status, p_status),
    jsonb_build_object('from', target.status, 'to', p_status));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Department
-- ---------------------------------------------------------------------------
create or replace function public._clean_department(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p is null or char_length(trim(p)) = 0 then null
    when lower(trim(p)) = 'ctech' then 'CTech'
    else left(regexp_replace(trim(p), '\s+', ' ', 'g'), 100)
  end;
$$;

update public.profiles
   set department = public._clean_department(department)
 where department is distinct from public._clean_department(department);
update public.profiles set department = null where char_length(department) < 2;

alter table public.profiles
  add constraint profiles_department_len
  check (department is null or char_length(department) between 2 and 100);

-- Normalise on every write, and do not let a user clear a department once set.
create or replace function public.guard_profile_department()
returns trigger
language plpgsql
as $$
begin
  new.department := public._clean_department(new.department);
  if tg_op = 'UPDATE' and public.is_client_session()
     and old.department is not null and new.department is null then
    raise exception 'Department is required' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_department_guard on public.profiles;
create trigger profiles_department_guard before insert or update of department on public.profiles
  for each row execute function public.guard_profile_department();

-- Sign-up keeps the department chosen on the form (the form requires it).
-- Role and status still come only from the column defaults.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  raw_id text := nullif(trim(meta ->> 'srm_id'), '');
  dept text := public._clean_department(meta ->> 'department');
begin
  insert into public.profiles (id, email, full_name, srm_id, department)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(new.email, '@', 1)), 120),
    case when raw_id ~ '^[A-Za-z0-9]{6,20}$' then upper(raw_id) else null end,
    case when char_length(dept) between 2 and 100 then dept else null end
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Enquiries
-- ---------------------------------------------------------------------------
create type public.enquiry_status as enum ('open', 'in_progress', 'resolved', 'closed');
create sequence public.enquiry_code_seq start with 1001;

create table public.enquiries (
  id                  uuid primary key default gen_random_uuid(),
  enquiry_code        text not null unique default ('ENQ-' || nextval('public.enquiry_code_seq')::text),
  student_id          uuid not null references public.profiles (id),
  student_name        text not null check (char_length(trim(student_name)) between 2 and 120),
  registration_number text not null check (registration_number ~ '^[A-Z0-9]{6,20}$'),
  email               text not null check (char_length(email) <= 254),
  department          text not null check (char_length(department) between 2 and 100),
  description         text not null check (char_length(trim(description)) between 10 and 2000),
  status              public.enquiry_status not null default 'open',
  handled_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index enquiries_student_idx on public.enquiries (student_id, created_at desc);
create index enquiries_status_idx  on public.enquiries (status, created_at desc);
create trigger enquiries_set_updated_at before update on public.enquiries
  for each row execute function public.set_updated_at();

-- Status history. note = internal staff note (students cannot read this table).
create table public.enquiry_events (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated always as identity unique,   -- stable order within one transaction
  enquiry_id  uuid not null references public.enquiries (id),
  from_status public.enquiry_status,
  to_status   public.enquiry_status not null,
  note        text check (char_length(note) <= 1000),
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index enquiry_events_enquiry_idx on public.enquiry_events (enquiry_id, seq);

alter table public.enquiries      enable row level security;
alter table public.enquiry_events enable row level security;
create policy enquiries_read on public.enquiries
  for select to authenticated using (student_id = auth.uid() or public.is_admin());
create policy enquiry_events_read on public.enquiry_events
  for select to authenticated using (public.is_admin());
-- No write policies: all writes go through the functions below.

-- Staff view: one row per enquiry with the latest note, the handler and the history.
create view public.enquiry_overview
with (security_invoker = true) as
select
  e.*,
  h.full_name as handled_by_name,
  ev.resolution_note,
  ev.history
from public.enquiries e
left join public.profiles h on h.id = e.handled_by
left join lateral (
  select
    (select x.note from public.enquiry_events x
      where x.enquiry_id = e.id and x.note is not null
      order by x.seq desc limit 1) as resolution_note,
    coalesce(jsonb_agg(jsonb_build_object(
      'from', y.from_status, 'to', y.to_status, 'note', y.note,
      'at', y.created_at, 'by', pa.full_name) order by y.seq)
      filter (where y.id is not null), '[]'::jsonb) as history
  from public.enquiry_events y
  left join public.profiles pa on pa.id = y.actor_id
  where y.enquiry_id = e.id
) ev on true;

create or replace function public.create_enquiry(
  p_name text, p_registration_number text, p_department text, p_description text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  prof public.profiles;
  eid  uuid;
  code text;
  reg  text := upper(trim(coalesce(p_registration_number, '')));
  dept text := public._clean_department(p_department);
begin
  if uid is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;
  select * into prof from public.profiles where id = uid;
  if not found or prof.status = 'suspended' then
    raise exception 'Your account cannot send enquiries' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'Enter your name';
  end if;
  if reg !~ '^[A-Z0-9]{6,20}$' then
    raise exception 'Enter a valid registration number (6-20 letters and digits)';
  end if;
  if dept is null or char_length(dept) < 2 then
    raise exception 'Enter your department';
  end if;
  if p_description is null or char_length(trim(p_description)) < 10 then
    raise exception 'Describe your enquiry in at least 10 characters';
  end if;
  if char_length(trim(p_description)) > 2000 then
    raise exception 'Keep the enquiry under 2000 characters';
  end if;
  if (select count(*) from public.enquiries
       where student_id = uid and status in ('open', 'in_progress')) >= 5 then
    raise exception 'You already have 5 open enquiries. Wait for a reply before sending another.';
  end if;

  insert into public.enquiries (student_id, student_name, registration_number, email, department, description)
  values (uid, left(trim(p_name), 120), reg, prof.email, dept, trim(p_description))
  returning id, enquiry_code into eid, code;

  insert into public.enquiry_events (enquiry_id, from_status, to_status, actor_id)
  values (eid, null, 'open', uid);

  perform public._log_activity('enquiry.created', 'enquiry', eid,
    format('%s sent enquiry %s', trim(p_name), code));
  perform public._notify_admins('enquiry_submitted', 'New enquiry ' || code,
    left(trim(p_name) || ': ' || trim(p_description), 140), '/admin/enquiries');
  return eid;
end;
$$;

-- Staff: change status and/or add an internal note. Closed is final.
create or replace function public.update_enquiry_status(
  p_enquiry_id uuid, p_status public.enquiry_status, p_note text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e    public.enquiries;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform public._require_admin();
  if p_status is null then
    raise exception 'Choose a status';
  end if;
  if char_length(note) > 1000 then
    raise exception 'Keep the note under 1000 characters';
  end if;
  select * into e from public.enquiries where id = p_enquiry_id for update;
  if not found then
    raise exception 'Enquiry not found';
  end if;
  if e.status = 'closed' then
    raise exception 'Enquiry % is closed and cannot be changed', e.enquiry_code;
  end if;
  if p_status = e.status and note is null then
    raise exception 'Choose a different status or add a note';
  end if;

  update public.enquiries set status = p_status, handled_by = auth.uid() where id = e.id;
  insert into public.enquiry_events (enquiry_id, from_status, to_status, note, actor_id)
  values (e.id, e.status, p_status, note, auth.uid());

  perform public._log_activity('enquiry.updated', 'enquiry', e.id,
    format('Enquiry %s: %s → %s', e.enquiry_code, e.status, p_status));
  if p_status <> e.status then
    perform public._notify(e.student_id, 'enquiry_updated',
      'Enquiry ' || e.enquiry_code || ': ' || replace(initcap(replace(p_status::text, '_', ' ')), 'In Progress', 'In progress'),
      'The lab team updated your enquiry.', '/student/enquiries');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Component take-away permissions
-- ---------------------------------------------------------------------------
create type public.takeaway_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'submitted');
create sequence public.takeaway_code_seq start with 1001;

create table public.takeaway_requests (
  id                   uuid primary key default gen_random_uuid(),
  request_code         text not null unique default ('TKA-' || nextval('public.takeaway_code_seq')::text),
  student_id           uuid not null references public.profiles (id),
  student_name         text not null check (char_length(trim(student_name)) between 2 and 120),
  registration_number  text not null check (registration_number ~ '^[A-Z0-9]{6,20}$'),
  email                text not null check (char_length(email) <= 254),
  department           text not null check (char_length(department) between 2 and 100),
  purpose              text not null check (char_length(trim(purpose)) between 10 and 1000),
  takeaway_date        date not null,
  expected_return_date date,
  additional_info      text check (char_length(additional_info) <= 1000),
  status               public.takeaway_status not null default 'pending',
  decided_by           uuid references public.profiles (id) on delete set null,
  decided_by_name      text,
  decided_at           timestamptz,
  decision_note        text check (char_length(decision_note) <= 500),
  document_received_by uuid references public.profiles (id) on delete set null,
  document_received_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint takeaway_return_after_takeaway
    check (expected_return_date is null or expected_return_date >= takeaway_date),
  constraint takeaway_decision_recorded
    check (status in ('pending', 'cancelled') or (decided_by_name is not null and decided_at is not null)),
  constraint takeaway_document_recorded
    check (status <> 'submitted' or document_received_at is not null)
);
create index takeaway_requests_student_idx on public.takeaway_requests (student_id, created_at desc);
create index takeaway_requests_status_idx  on public.takeaway_requests (status, created_at);
create trigger takeaway_requests_set_updated_at before update on public.takeaway_requests
  for each row execute function public.set_updated_at();

create table public.takeaway_items (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.takeaway_requests (id),
  item_id    uuid not null references public.inventory_items (id),
  quantity   int  not null check (quantity > 0 and quantity <= 1000),
  unique (request_id, item_id)
);
create index takeaway_items_item_idx on public.takeaway_items (item_id);

create table public.takeaway_events (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated always as identity unique,
  request_id  uuid not null references public.takeaway_requests (id),
  from_status public.takeaway_status,
  to_status   public.takeaway_status not null,
  note        text check (char_length(note) <= 500),
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index takeaway_events_request_idx on public.takeaway_events (request_id, seq);

alter table public.takeaway_requests enable row level security;
alter table public.takeaway_items    enable row level security;
alter table public.takeaway_events   enable row level security;
-- Same shape as borrow requests: the queue (pending) belongs to super admins.
create policy takeaway_read on public.takeaway_requests
  for select to authenticated using (
    student_id = auth.uid()
    or public.is_super_admin()
    or (public.is_admin() and status <> 'pending'));
create policy takeaway_items_read on public.takeaway_items
  for select to authenticated using (
    exists (select 1 from public.takeaway_requests r where r.id = request_id));
create policy takeaway_events_read on public.takeaway_events
  for select to authenticated using (
    exists (select 1 from public.takeaway_requests r where r.id = request_id));

create view public.takeaway_overview
with (security_invoker = true) as
select
  t.*,
  rc.full_name as document_received_by_name,
  li.items,
  li.item_count,
  li.total_units,
  ev.history
from public.takeaway_requests t
left join public.profiles rc on rc.id = t.document_received_by
cross join lateral (
  select
    coalesce(jsonb_agg(jsonb_build_object('item_id', ti.item_id, 'name', i.name,
             'brand_model', i.brand_model, 'qty', ti.quantity) order by i.name), '[]'::jsonb) as items,
    count(ti.id)::int as item_count,
    coalesce(sum(ti.quantity), 0)::int as total_units
  from public.takeaway_items ti
  join public.inventory_items i on i.id = ti.item_id
  where ti.request_id = t.id
) li
cross join lateral (
  select coalesce(jsonb_agg(jsonb_build_object(
           'from', y.from_status, 'to', y.to_status, 'note', y.note,
           'at', y.created_at, 'by', pa.full_name) order by y.seq), '[]'::jsonb) as history
  from public.takeaway_events y
  left join public.profiles pa on pa.id = y.actor_id
  where y.request_id = t.id
) ev;

create or replace function public.create_takeaway_request(
  p_name text, p_registration_number text, p_department text, p_purpose text,
  p_takeaway_date date, p_expected_return_date date, p_additional_info text, p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid    uuid := auth.uid();
  prof   public.profiles;
  rid    uuid;
  code   text;
  rec    record;
  it     public.inventory_items;
  n      int := 0;
  reg    text := upper(trim(coalesce(p_registration_number, '')));
  dept   text := public._clean_department(p_department);
  max_items int := public._setting_int('max_items_per_request', 20);
begin
  if uid is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;
  select * into prof from public.profiles where id = uid;
  if not found or prof.status <> 'active' then
    raise exception 'Your account is not allowed to make requests' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'Enter your name';
  end if;
  if reg !~ '^[A-Z0-9]{6,20}$' then
    raise exception 'Enter a valid registration number (6-20 letters and digits)';
  end if;
  if dept is null or char_length(dept) < 2 then
    raise exception 'Enter your department';
  end if;
  if p_purpose is null or char_length(trim(p_purpose)) < 10 then
    raise exception 'Explain the purpose in at least 10 characters';
  end if;
  if char_length(trim(p_purpose)) > 1000 then
    raise exception 'Keep the purpose under 1000 characters';
  end if;
  if char_length(trim(coalesce(p_additional_info, ''))) > 1000 then
    raise exception 'Keep the additional information under 1000 characters';
  end if;
  if p_takeaway_date is null then
    raise exception 'Choose the take-away date';
  end if;
  if p_takeaway_date < public.lab_today() then
    raise exception 'The take-away date cannot be in the past';
  end if;
  if p_expected_return_date is not null and p_expected_return_date < p_takeaway_date then
    raise exception 'The return date must be on or after the take-away date';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one component';
  end if;
  if (select count(*) from public.takeaway_requests where student_id = uid and status = 'pending') >= 5 then
    raise exception 'You already have 5 take-away requests waiting for a decision';
  end if;

  insert into public.takeaway_requests
    (student_id, student_name, registration_number, email, department, purpose,
     takeaway_date, expected_return_date, additional_info)
  values
    (uid, left(trim(p_name), 120), reg, prof.email, dept, trim(p_purpose),
     p_takeaway_date, p_expected_return_date, nullif(trim(coalesce(p_additional_info, '')), ''))
  returning id, request_code into rid, code;

  for rec in
    select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'qty')::int)::int as qty
      from jsonb_array_elements(p_items) e
     group by 1
     order by 1
  loop
    if rec.item_id is null or rec.qty is null or rec.qty <= 0 then
      raise exception 'Quantities must be positive whole numbers';
    end if;
    select * into it from public.inventory_items where id = rec.item_id;
    if not found or it.is_archived then
      raise exception 'One of the selected components is not in the lab inventory';
    end if;
    if rec.qty > it.total_qty then
      raise exception 'The lab has % of "%" in total (you asked for %)', it.total_qty, it.name, rec.qty;
    end if;
    insert into public.takeaway_items (request_id, item_id, quantity) values (rid, rec.item_id, rec.qty);
    n := n + 1;
  end loop;
  if n > max_items then
    raise exception 'A request can include at most % different components', max_items;
  end if;

  insert into public.takeaway_events (request_id, from_status, to_status, actor_id)
  values (rid, null, 'pending', uid);
  perform public._log_activity('takeaway.created', 'takeaway_request', rid,
    format('%s submitted take-away request %s (%s components)', trim(p_name), code, n));
  perform public._notify_super_admins('takeaway_submitted', 'Take-away request ' || code,
    trim(p_name) || ' asks to take ' || n || ' component(s) outside the lab', '/admin/takeaway');
  return rid;

exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'The component list is not valid';
end;
$$;

create or replace function public.cancel_takeaway_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.takeaway_requests;
begin
  select * into r from public.takeaway_requests where id = p_request_id for update;
  if not found or r.student_id is distinct from auth.uid() then
    raise exception 'Request not found' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'Request % is % and can no longer be cancelled', r.request_code, r.status;
  end if;
  update public.takeaway_requests set status = 'cancelled' where id = r.id;
  insert into public.takeaway_events (request_id, from_status, to_status, actor_id)
  values (r.id, 'pending', 'cancelled', auth.uid());
  perform public._log_activity('takeaway.cancelled', 'takeaway_request', r.id,
    format('Take-away request %s cancelled', r.request_code));
end;
$$;

-- Super admin only. A rejection needs a reason.
create or replace function public.decide_takeaway_request(
  p_request_id uuid, p_approve boolean, p_note text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r     public.takeaway_requests;
  note  text := nullif(trim(coalesce(p_note, '')), '');
  me    text;
  new_s public.takeaway_status;
begin
  perform public._require_super_admin();
  if p_approve is null then
    raise exception 'Choose approve or reject';
  end if;
  if not p_approve and (note is null or char_length(note) < 3) then
    raise exception 'A rejection reason is required';
  end if;
  if char_length(note) > 500 then
    raise exception 'Keep the note under 500 characters';
  end if;
  select * into r from public.takeaway_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'Request % is % and cannot be decided again', r.request_code, r.status;
  end if;

  select coalesce(nullif(full_name, ''), email) into me from public.profiles where id = auth.uid();
  new_s := case when p_approve then 'approved' else 'rejected' end;
  update public.takeaway_requests
     set status = new_s, decided_by = auth.uid(), decided_by_name = me,
         decided_at = now(), decision_note = note
   where id = r.id;
  insert into public.takeaway_events (request_id, from_status, to_status, note, actor_id)
  values (r.id, 'pending', new_s, note, auth.uid());

  perform public._log_activity('takeaway.' || new_s::text, 'takeaway_request', r.id,
    format('%s take-away request %s', initcap(new_s::text), r.request_code),
    jsonb_build_object('note', note));
  perform public._notify(r.student_id, 'takeaway_' || new_s::text,
    'Take-away request ' || r.request_code || ' ' || new_s::text,
    case when p_approve
         then 'Download the permission letter, get it signed and hand it to the lab admin.'
         else note end,
    '/student/takeaway');
end;
$$;

-- Staff: the signed paper letter was handed in.
create or replace function public.mark_takeaway_document_received(p_request_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r    public.takeaway_requests;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform public._require_admin();
  if char_length(note) > 500 then
    raise exception 'Keep the note under 500 characters';
  end if;
  select * into r from public.takeaway_requests where id = p_request_id for update;
  if not found or (r.status = 'pending' and not public.is_super_admin()) then
    raise exception 'Request not found';
  end if;
  if r.status <> 'approved' then
    raise exception 'Request % is % — only approved requests can be marked as submitted', r.request_code, r.status;
  end if;
  update public.takeaway_requests
     set status = 'submitted', document_received_by = auth.uid(), document_received_at = now()
   where id = r.id;
  insert into public.takeaway_events (request_id, from_status, to_status, note, actor_id)
  values (r.id, 'approved', 'submitted', note, auth.uid());
  perform public._log_activity('takeaway.submitted', 'takeaway_request', r.id,
    format('Signed letter received for %s', r.request_code));
  perform public._notify(r.student_id, 'takeaway_submitted',
    'Signed letter received for ' || r.request_code,
    'The lab has your signed permission letter.', '/student/takeaway');
end;
$$;

-- The only source of permission-letter data. Refuses anything not approved.
create or replace function public.get_takeaway_letter(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r     public.takeaway_requests;
  items jsonb;
begin
  select * into r from public.takeaway_requests where id = p_request_id;
  if not found or (r.student_id is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'Request not found' using errcode = '42501';
  end if;
  if r.status not in ('approved', 'submitted') then
    raise exception 'Request % is %: a permission letter is only available after Super Admin approval',
      r.request_code, r.status;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'brand_model', i.brand_model,
           'qty', ti.quantity) order by i.name), '[]'::jsonb)
    into items
    from public.takeaway_items ti
    join public.inventory_items i on i.id = ti.item_id
   where ti.request_id = r.id;
  return jsonb_build_object(
    'request_code', r.request_code,
    'status', r.status,
    'student_name', r.student_name,
    'registration_number', r.registration_number,
    'email', r.email,
    'department', r.department,
    'purpose', r.purpose,
    'takeaway_date', r.takeaway_date,
    'expected_return_date', r.expected_return_date,
    'additional_info', r.additional_info,
    'submitted_at', r.created_at,
    'approved_by', r.decided_by_name,
    'approved_at', r.decided_at,
    'approval_note', r.decision_note,
    'items', items,
    'generated_at', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Privileges and realtime
-- ---------------------------------------------------------------------------
revoke all on public.enquiries, public.enquiry_events, public.enquiry_overview,
  public.takeaway_requests, public.takeaway_items, public.takeaway_events, public.takeaway_overview
  from anon, authenticated;
grant select on public.enquiries, public.enquiry_events, public.enquiry_overview,
  public.takeaway_requests, public.takeaway_items, public.takeaway_events, public.takeaway_overview
  to authenticated;
revoke all on sequence public.enquiry_code_seq, public.takeaway_code_seq from anon, authenticated;

revoke execute on function
  public.is_super_admin(), public._require_super_admin(), public._notify_super_admins(text, text, text, text),
  public._clean_department(text), public.guard_profile_department(),
  public.create_enquiry(text, text, text, text),
  public.update_enquiry_status(uuid, public.enquiry_status, text),
  public.create_takeaway_request(text, text, text, text, date, date, text, jsonb),
  public.cancel_takeaway_request(uuid),
  public.decide_takeaway_request(uuid, boolean, text),
  public.mark_takeaway_document_received(uuid, text),
  public.get_takeaway_letter(uuid)
  from public, anon, authenticated;

grant execute on function public.is_super_admin() to anon, authenticated;
-- Called by the department guard trigger, which runs as the signed-in user.
grant execute on function public._clean_department(text) to authenticated;
grant execute on function
  public.create_enquiry(text, text, text, text),
  public.update_enquiry_status(uuid, public.enquiry_status, text),
  public.create_takeaway_request(text, text, text, text, date, date, text, jsonb),
  public.cancel_takeaway_request(uuid),
  public.decide_takeaway_request(uuid, boolean, text),
  public.mark_takeaway_document_received(uuid, text),
  public.get_takeaway_letter(uuid)
  to authenticated;

alter publication supabase_realtime add table public.enquiries, public.takeaway_requests;
