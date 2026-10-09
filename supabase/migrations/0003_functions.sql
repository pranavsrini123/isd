-- =============================================================================
-- 0003: business functions
--
-- Every stock-changing operation lives here as a SECURITY DEFINER function:
--   * the caller's role is checked inside the function (never trusted from UI)
--   * the rows involved are locked (SELECT ... FOR UPDATE, in a stable order to
--     avoid deadlocks) before they are read for validation
--   * all changes for one operation commit or roll back together
--   * state checks make a repeated call fail instead of changing stock twice
-- Grants are applied in 0004; nothing here is callable by anon.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public._require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._setting_int(p_key text, p_default int)
returns int
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default);
$$;

create or replace function public._lab_tz()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((select value #>> '{}' from public.app_settings where key = 'lab_timezone'), 'Asia/Kolkata');
$$;

create or replace function public._log_activity(
  p_action text, p_entity_type text, p_entity_id uuid, p_summary text, p_details jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.activity_logs (actor_id, action, entity_type, entity_id, summary, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public._notify(
  p_user_id uuid, p_type text, p_title text, p_body text default null, p_link text default null
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link);
$$;

create or replace function public._notify_admins(
  p_type text, p_title text, p_body text default null, p_link text default null
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select id, p_type, p_title, p_body, p_link
  from public.profiles where role = 'admin' and status = 'active';
$$;

-- Releases the stock reserved for an approved request (reject / cancel).
create or replace function public._release_reservation(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  li record;
begin
  perform 1 from public.inventory_items i
   where i.id in (select item_id from public.request_items where request_id = p_request_id)
   order by i.id
   for update;

  for li in
    select item_id, qty from public.request_items where request_id = p_request_id order by item_id
  loop
    update public.inventory_items
       set available_qty = available_qty + li.qty,
           reserved_qty  = reserved_qty  - li.qty
     where id = li.item_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public settings (callable before login, e.g. by the registration form)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'allowed_email_domains',
      coalesce((select value from public.app_settings where key = 'allowed_email_domains'), '[]'::jsonb),
    'max_loan_days', public._setting_int('max_loan_days', 14)
  );
$$;

-- ---------------------------------------------------------------------------
-- Student: create / cancel requests
-- ---------------------------------------------------------------------------
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

  -- Merge duplicate lines, then validate each against live stock. Nothing is
  -- reserved here: a pending request does not hold stock.
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
  perform public._notify_admins('request_submitted', 'New request ' || req_code,
    prof.full_name || ' requested ' || n_items || ' component(s)', '/admin/requests');
  return req_id;

exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'The item list is not valid';
end;
$$;

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
  if not found or (req.requester_id <> uid and not public.is_admin()) then
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

-- ---------------------------------------------------------------------------
-- Admin: approve / reject / issue
-- ---------------------------------------------------------------------------
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
  perform public._require_admin();

  select * into req from public.borrow_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'Request % is % and cannot be approved', req.request_code, req.status;
  end if;

  -- Lock every stock row this request touches, in id order.
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
end;
$$;

create or replace function public.reject_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  req public.borrow_requests;
begin
  perform public._require_admin();
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

-- Hands the reserved components to the student: reserved -> borrowed.
create or replace function public.issue_request(p_request_id uuid, p_due_date date default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  req public.borrow_requests;
  due date;
  bid uuid;
  li  record;
begin
  perform public._require_admin();

  select * into req from public.borrow_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if req.status <> 'approved' then
    raise exception 'Request % is % and cannot be issued', req.request_code, req.status;
  end if;

  due := coalesce(p_due_date, req.needed_until);
  if due < public.lab_today() then
    raise exception 'The due date cannot be in the past';
  end if;

  perform 1 from public.inventory_items i
   where i.id in (select item_id from public.request_items where request_id = req.id)
   order by i.id
   for update;

  for li in
    select item_id, qty from public.request_items where request_id = req.id order by item_id
  loop
    update public.inventory_items
       set reserved_qty = reserved_qty - li.qty,
           borrowed_qty = borrowed_qty + li.qty
     where id = li.item_id;
  end loop;

  insert into public.borrowings (request_id, borrower_id, issued_by, due_date)
  values (req.id, req.requester_id, auth.uid(), due)
  returning id into bid;

  insert into public.borrowing_items (borrowing_id, item_id, qty_issued)
  select bid, item_id, qty from public.request_items where request_id = req.id;

  update public.borrow_requests set status = 'issued' where id = req.id;

  perform public._log_activity('request.issued', 'borrow_request', req.id,
    format('Issued components for request %s (due %s)', req.request_code, due));
  perform public._notify(req.requester_id, 'request_issued',
    'Components issued for ' || req.request_code, 'Due back on ' || to_char(due, 'DD Mon YYYY'),
    '/student/borrowings');
  return bid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Returns
-- ---------------------------------------------------------------------------
create or replace function public.request_return(p_borrowing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.borrowings;
  code text;
begin
  select * into b from public.borrowings where id = p_borrowing_id for update;
  if not found or b.borrower_id <> auth.uid() then
    raise exception 'Borrowing not found' using errcode = '42501';
  end if;
  if b.status <> 'active' then
    raise exception 'This borrowing is already closed';
  end if;
  if b.return_requested_at is not null then
    return;                                   -- idempotent
  end if;
  update public.borrowings set return_requested_at = now() where id = b.id;
  select request_code into code from public.borrow_requests where id = b.request_id;
  perform public._log_activity('return.requested', 'borrowing', b.id,
    format('Return requested for %s', code));
  perform public._notify_admins('return_requested', 'Return requested for ' || code,
    'A student is bringing components back for verification.', '/admin/issuance');
end;
$$;

-- Verifies one borrowed line. good + damaged + missing must equal the quantity
-- issued. Stock moves only here, and only once per line.
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
  end if;

  perform public._log_activity('return.verified', 'borrowing', line.borrowing_id,
    format('Verified return for %s: %s good, %s damaged, %s missing', code, p_good, p_damaged, p_missing),
    jsonb_build_object('item_id', line.item_id, 'good', p_good, 'damaged', p_damaged, 'missing', p_missing));
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin stock adjustments (always audited, always with a reason)
-- ---------------------------------------------------------------------------
create or replace function public.adjust_inventory(
  p_item_id uuid, p_action text, p_qty int, p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  it public.inventory_items;
  d_total int := 0; d_avail int := 0; d_dam int := 0; d_lost int := 0;
  before_state jsonb;
begin
  perform public._require_admin();
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'A reason is required for stock adjustments';
  end if;

  select * into it from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found';
  end if;

  case p_action
    when 'add_stock'         then d_total :=  p_qty; d_avail :=  p_qty;
    when 'remove_available'  then d_total := -p_qty; d_avail := -p_qty;
    when 'mark_damaged'      then d_avail := -p_qty; d_dam :=  p_qty;
    when 'repair_damaged'    then d_dam := -p_qty;   d_avail :=  p_qty;
    when 'write_off_damaged' then d_dam := -p_qty;   d_total := -p_qty;
    when 'recover_lost'      then d_lost := -p_qty;  d_avail :=  p_qty;
    when 'write_off_lost'    then d_lost := -p_qty;  d_total := -p_qty;
    else raise exception 'Unknown adjustment: %', p_action;
  end case;

  if it.available_qty + d_avail < 0 then
    raise exception 'Only % available — cannot take % out of available stock', it.available_qty, p_qty;
  end if;
  if it.damaged_qty + d_dam < 0 then
    raise exception 'Only % damaged units on record', it.damaged_qty;
  end if;
  if it.lost_qty + d_lost < 0 then
    raise exception 'Only % lost units on record', it.lost_qty;
  end if;

  before_state := jsonb_build_object('total', it.total_qty, 'available', it.available_qty,
                                     'damaged', it.damaged_qty, 'lost', it.lost_qty);

  update public.inventory_items
     set total_qty     = total_qty     + d_total,
         available_qty = available_qty + d_avail,
         damaged_qty   = damaged_qty   + d_dam,
         lost_qty      = lost_qty      + d_lost
   where id = it.id;

  perform public._log_activity('stock.adjusted', 'inventory_item', it.id,
    format('%s: %s × %s', p_action, p_qty, it.name),
    jsonb_build_object('action', p_action, 'qty', p_qty, 'reason', trim(p_reason), 'before', before_state));
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: users and settings
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
  perform public._require_admin();
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  select * into target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found';
  end if;
  if target.role = 'admin' and target.status = 'active' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin' and status = 'active') <= 1 then
    raise exception 'At least one active administrator must remain';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  perform public._log_activity('user.role_changed', 'profile', p_user_id,
    format('%s: role %s → %s', target.email, target.role, p_role),
    jsonb_build_object('from', target.role, 'to', p_role));
end;
$$;

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
  if target.role = 'admin' and target.status = 'active' and p_status <> 'active'
     and (select count(*) from public.profiles where role = 'admin' and status = 'active') <= 1 then
    raise exception 'At least one active administrator must remain';
  end if;
  update public.profiles set status = p_status where id = p_user_id;
  perform public._log_activity('user.status_changed', 'profile', p_user_id,
    format('%s: status %s → %s', target.email, target.status, p_status),
    jsonb_build_object('from', target.status, 'to', p_status));
end;
$$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d text;
begin
  perform public._require_admin();
  if not exists (select 1 from public.app_settings where key = p_key) then
    raise exception 'Unknown setting %', p_key;
  end if;

  if p_key = 'allowed_email_domains' then
    if jsonb_typeof(p_value) <> 'array' then
      raise exception 'Provide a list of domains';
    end if;
    for d in select jsonb_array_elements_text(p_value) loop
      if d !~* '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
        raise exception '"%" is not a valid domain', d;
      end if;
    end loop;
  elsif p_key in ('max_loan_days', 'max_items_per_request', 'max_pending_requests') then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
       or (p_value #>> '{}')::numeric < 1 or (p_value #>> '{}')::numeric > 365 then
      raise exception '% must be a whole number between 1 and 365', p_key;
    end if;
  elsif p_key = 'lab_timezone' then
    if jsonb_typeof(p_value) <> 'string'
       or not exists (select 1 from pg_timezone_names where name = p_value #>> '{}') then
      raise exception 'Unknown time zone';
    end if;
  end if;

  update public.app_settings
     set value = p_value, updated_by = auth.uid(), updated_at = now()
   where key = p_key;
  perform public._log_activity('setting.updated', 'app_setting', null,
    format('Setting %s updated', p_key), jsonb_build_object('key', p_key, 'value', p_value));
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------------------
-- Dashboard and reports (admin only; derived from live data)
-- ---------------------------------------------------------------------------
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
    'pending_requests',     (select count(*) from public.borrow_requests where status = 'pending'),
    'approved_awaiting',    (select count(*) from public.borrow_requests where status = 'approved'),
    'active_borrowings',    (select count(*) from public.borrowings where status = 'active'),
    'overdue_lines',        (select count(*) from public.borrowing_lines where is_overdue),
    'overdue_units',        (select coalesce(sum(qty_issued), 0) from public.borrowing_lines where is_overdue),
    'returns_to_verify',    (select count(*) from public.borrowing_lines l
                              where not l.is_verified and l.return_requested_at is not null)
  ) into ops;

  return inv || ops;
end;
$$;

create or replace function public.report_inventory_by_category()
returns table (category text, item_types bigint, total bigint, available bigint,
               reserved bigint, borrowed bigint, damaged bigint, lost bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  return query
    select c.name, count(i.id), coalesce(sum(i.total_qty), 0)::bigint, coalesce(sum(i.available_qty), 0)::bigint,
           coalesce(sum(i.reserved_qty), 0)::bigint, coalesce(sum(i.borrowed_qty), 0)::bigint,
           coalesce(sum(i.damaged_qty), 0)::bigint, coalesce(sum(i.lost_qty), 0)::bigint
      from public.inventory_categories c
      left join public.inventory_items i on i.category_id = c.id and not i.is_archived
     group by c.id, c.name, c.sort_order
     order by c.sort_order, c.name;
end;
$$;

create or replace function public.report_most_borrowed(p_days int default 90, p_limit int default 10)
returns table (item_id uuid, item_name text, units bigint, loans bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  return query
    select i.id, i.name, sum(bi.qty_issued)::bigint, count(*)::bigint
      from public.borrowing_items bi
      join public.borrowings b on b.id = bi.borrowing_id
      join public.inventory_items i on i.id = bi.item_id
     where b.issued_at >= now() - make_interval(days => greatest(p_days, 1))
     group by i.id, i.name
     order by 3 desc, i.name
     limit greatest(p_limit, 1);
end;
$$;

create or replace function public.report_frequently_requested(p_days int default 90, p_limit int default 10)
returns table (item_id uuid, item_name text, units_requested bigint, requests bigint, available_now int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  return query
    select i.id, i.name, sum(ri.qty)::bigint, count(*)::bigint, i.available_qty
      from public.request_items ri
      join public.borrow_requests r on r.id = ri.request_id
      join public.inventory_items i on i.id = ri.item_id
     where r.created_at >= now() - make_interval(days => greatest(p_days, 1))
     group by i.id, i.name, i.available_qty
     order by 3 desc, i.name
     limit greatest(p_limit, 1);
end;
$$;

create or replace function public.report_damaged_lost()
returns table (item_id uuid, item_name text, damaged int, lost int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  return query
    select i.id, i.name, i.damaged_qty, i.lost_qty
      from public.inventory_items i
     where i.damaged_qty > 0 or i.lost_qty > 0
     order by (i.damaged_qty + i.lost_qty) desc, i.name;
end;
$$;

create or replace function public.report_popular_projects(p_days int default 90, p_limit int default 10)
returns table (project_id uuid, project_name text, requests bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  return query
    select p.id, p.name, count(*)::bigint
      from public.borrow_requests r
      join public.projects p on p.id = r.project_id
     where r.created_at >= now() - make_interval(days => greatest(p_days, 1))
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
     group by p.id, p.full_name, p.email
     order by 4 desc, p.full_name
     limit greatest(p_limit, 1);
end;
$$;

-- Units on loan at the end of each of the last p_weeks weeks (7-day steps back
-- from today). A unit counts from issue until its return is verified.
create or replace function public.report_usage_over_time(p_weeks int default 12)
returns table (week_end date, units_on_loan int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  tz text := public._lab_tz();
begin
  perform public._require_admin();
  return query
    select w.d,
           coalesce((
             select sum(bi.qty_issued)
               from public.borrowing_items bi
               join public.borrowings b on b.id = bi.borrowing_id
               left join public.return_records rr on rr.borrowing_item_id = bi.id
              where (b.issued_at at time zone tz)::date <= w.d
                and (rr.id is null or (rr.verified_at at time zone tz)::date > w.d)
           ), 0)::int
      from (select (public.lab_today() - (n * 7))::date as d
              from generate_series(0, greatest(p_weeks, 1) - 1) n) w
     order by w.d;
end;
$$;

create or replace function public.report_request_history(p_weeks int default 12)
returns table (week_start date, approved bigint, rejected bigint, cancelled bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  tz text := public._lab_tz();
begin
  perform public._require_admin();
  return query
    select date_trunc('week', a.created_at at time zone tz)::date,
           count(*) filter (where a.action = 'request.approved'),
           count(*) filter (where a.action = 'request.rejected'),
           count(*) filter (where a.action = 'request.cancelled')
      from public.activity_logs a
     where a.action in ('request.approved', 'request.rejected', 'request.cancelled')
       and a.created_at >= now() - make_interval(weeks => greatest(p_weeks, 1))
     group by 1
     order by 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit triggers for direct admin edits (items, projects, components,
-- categories). Quantity changes are logged by adjust_inventory() and the
-- workflow functions instead, so they are ignored here. Changes made with no
-- signed-in user (seeds, migrations) are not logged.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ent       text := tg_argv[0];
  id_col    text := coalesce(tg_argv[1], 'id');
  strip     text[] := array['updated_at','total_qty','available_qty','reserved_qty',
                            'borrowed_qty','damaged_qty','lost_qty'];
  old_j     jsonb;
  new_j     jsonb;
  rec       jsonb;
  diff      jsonb;
  label     text;
  verb      text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    rec := to_jsonb(old);
  else
    rec := to_jsonb(new);
  end if;
  label := coalesce(rec ->> 'name', rec ->> 'item_id', '');

  if tg_op = 'UPDATE' then
    old_j := to_jsonb(old) - strip;
    new_j := to_jsonb(new) - strip;
    if old_j = new_j then
      return new;
    end if;
    select jsonb_object_agg(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k))
      into diff
      from jsonb_object_keys(new_j) k
     where old_j -> k is distinct from new_j -> k;
  end if;

  verb := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  insert into public.activity_logs (actor_id, action, entity_type, entity_id, summary, details)
  values (auth.uid(), ent || '.' || verb, ent, (rec ->> id_col)::uuid,
          initcap(replace(ent, '_', ' ')) || ' ' || verb || case when label <> '' then ': ' || label else '' end,
          coalesce(diff, '{}'::jsonb));
  return coalesce(new, old);
end;
$$;

create trigger inventory_items_audit after insert or update or delete on public.inventory_items
  for each row execute function public.audit_row_change('inventory_item');
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function public.audit_row_change('project');
create trigger project_components_audit after insert or update or delete on public.project_components
  for each row execute function public.audit_row_change('project_component', 'project_id');
create trigger inventory_categories_audit after insert or update or delete on public.inventory_categories
  for each row execute function public.audit_row_change('category');
