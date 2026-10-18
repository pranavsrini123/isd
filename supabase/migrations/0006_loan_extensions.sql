-- =============================================================================
-- 0006: loan extension requests
--
-- A student with an issued loan can ask for a later due date. The request is
-- only a request: the due date changes when an administrator approves it, inside
-- the same transaction that records the decision. Stock is never touched.
--
-- Rules
--   * only the borrower, only for an active (not yet returned) loan
--   * the new date must be later than the current due date
--   * the whole loan (issue date → new due date) must stay within max_loan_days
--   * one pending extension per loan at a time (unique partial index)
-- =============================================================================

create type public.extension_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.loan_extension_requests (
  id                 uuid primary key default gen_random_uuid(),
  borrowing_id       uuid not null references public.borrowings (id) on delete cascade,
  requested_by       uuid not null references public.profiles (id),
  current_due_date   date not null,
  requested_due_date date not null,
  reason             text not null check (char_length(trim(reason)) between 3 and 500),
  status             public.extension_status not null default 'pending',
  reviewed_by        uuid references public.profiles (id) on delete set null,
  reviewed_at        timestamptz,
  review_note        text check (char_length(review_note) <= 500),
  created_at         timestamptz not null default now(),
  constraint loan_extension_dates check (requested_due_date > current_due_date)
);
create unique index loan_extension_one_pending
  on public.loan_extension_requests (borrowing_id) where status = 'pending';
create index loan_extension_requests_status_idx on public.loan_extension_requests (status, created_at);

-- Read model with the request code and borrower, for both portals (RLS applies).
create view public.loan_extension_overview
with (security_invoker = true) as
select e.*, b.request_id, r.request_code, b.borrower_id,
       pr.full_name as borrower_name, pr.email as borrower_email,
       b.issued_at, b.due_date as loan_due_date, b.status as loan_status
from public.loan_extension_requests e
join public.borrowings b      on b.id = e.borrowing_id
join public.borrow_requests r on r.id = b.request_id
join public.profiles pr       on pr.id = b.borrower_id;

alter table public.loan_extension_requests enable row level security;
create policy extensions_read on public.loan_extension_requests
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.borrowings b where b.id = borrowing_id and b.borrower_id = auth.uid()));
-- No insert/update/delete policies: all writes go through the functions below.

-- ---------------------------------------------------------------------------
create or replace function public.request_loan_extension(
  p_borrowing_id uuid, p_new_due_date date, p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b        public.borrowings;
  prof     public.profiles;
  code     text;
  max_days int := public._setting_int('max_loan_days', 14);
  issued   date;
  ext_id   uuid;
begin
  select * into prof from public.profiles where id = auth.uid();
  if not found or prof.status <> 'active' then
    raise exception 'Your account is not allowed to request extensions' using errcode = '42501';
  end if;

  select * into b from public.borrowings where id = p_borrowing_id for update;
  if not found or b.borrower_id <> auth.uid() then
    raise exception 'Loan not found' using errcode = '42501';
  end if;
  if b.status <> 'active' then
    raise exception 'This loan has already been returned';
  end if;
  if b.return_requested_at is not null then
    raise exception 'You have already asked to return these components';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Give a short reason for the extension';
  end if;
  if p_new_due_date is null or p_new_due_date <= b.due_date then
    raise exception 'Choose a date after the current due date (%)', to_char(b.due_date, 'DD Mon YYYY');
  end if;
  if p_new_due_date < public.lab_today() then
    raise exception 'The new due date cannot be in the past';
  end if;
  issued := (b.issued_at at time zone public._lab_tz())::date;
  if p_new_due_date - issued > max_days then
    raise exception 'Loans are limited to % days in total; the latest possible due date is %',
      max_days, to_char(issued + max_days, 'DD Mon YYYY');
  end if;
  if exists (select 1 from public.loan_extension_requests
              where borrowing_id = b.id and status = 'pending') then
    raise exception 'An extension request for this loan is already waiting for review';
  end if;

  insert into public.loan_extension_requests (borrowing_id, requested_by, current_due_date, requested_due_date, reason)
  values (b.id, auth.uid(), b.due_date, p_new_due_date, trim(p_reason))
  returning id into ext_id;

  select request_code into code from public.borrow_requests where id = b.request_id;
  perform public._log_activity('extension.requested', 'borrowing', b.id,
    format('%s asked to extend %s to %s', prof.full_name, code, to_char(p_new_due_date, 'DD Mon YYYY')),
    jsonb_build_object('extension_id', ext_id, 'from', b.due_date, 'to', p_new_due_date, 'reason', trim(p_reason)));
  perform public._notify_admins('extension_requested', 'Extension requested for ' || code,
    prof.full_name || ' asked for ' || to_char(p_new_due_date, 'DD Mon YYYY'), '/admin/issuance?tab=extensions');
  return ext_id;
end;
$$;

create or replace function public.cancel_loan_extension(p_extension_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e public.loan_extension_requests;
begin
  select * into e from public.loan_extension_requests where id = p_extension_id for update;
  if not found or e.requested_by <> auth.uid() then
    raise exception 'Extension request not found' using errcode = '42501';
  end if;
  if e.status <> 'pending' then
    raise exception 'This extension request has already been %', e.status;
  end if;
  update public.loan_extension_requests set status = 'cancelled' where id = e.id;
end;
$$;

create or replace function public.review_loan_extension(p_extension_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e    public.loan_extension_requests;
  b    public.borrowings;
  code text;
begin
  perform public._require_admin();
  select * into e from public.loan_extension_requests where id = p_extension_id for update;
  if not found then
    raise exception 'Extension request not found';
  end if;
  if e.status <> 'pending' then
    raise exception 'This extension request has already been %', e.status;
  end if;
  select * into b from public.borrowings where id = e.borrowing_id for update;
  select request_code into code from public.borrow_requests where id = b.request_id;

  if p_approve then
    if b.status <> 'active' then
      raise exception 'The loan has already been returned';
    end if;
    if b.due_date <> e.current_due_date then
      raise exception 'The due date has changed since this was requested; ask the student to request again';
    end if;
    update public.borrowings set due_date = e.requested_due_date where id = b.id;
    update public.loan_extension_requests
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(coalesce(p_note, '')), '')
     where id = e.id;
    perform public._log_activity('extension.approved', 'borrowing', b.id,
      format('Extended %s from %s to %s', code, to_char(e.current_due_date, 'DD Mon YYYY'), to_char(e.requested_due_date, 'DD Mon YYYY')));
    perform public._notify(b.borrower_id, 'extension_approved', 'Extension approved for ' || code,
      'New due date: ' || to_char(e.requested_due_date, 'DD Mon YYYY'), '/student/requests');
  else
    if p_note is null or char_length(trim(p_note)) < 3 then
      raise exception 'Give the student a short reason';
    end if;
    update public.loan_extension_requests
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = trim(p_note)
     where id = e.id;
    perform public._log_activity('extension.rejected', 'borrowing', b.id,
      format('Declined extension for %s', code), jsonb_build_object('reason', trim(p_note)));
    perform public._notify(b.borrower_id, 'extension_rejected', 'Extension declined for ' || code, trim(p_note), '/student/requests');
  end if;
end;
$$;

-- Asking to return a loan closes any extension request still waiting.
create or replace function public._close_pending_extensions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.return_requested_at is not null and old.return_requested_at is null) or new.status = 'closed' then
    update public.loan_extension_requests set status = 'cancelled'
     where borrowing_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
create trigger borrowings_close_extensions after update on public.borrowings
  for each row execute function public._close_pending_extensions();

-- Privileges
revoke all on public.loan_extension_requests, public.loan_extension_overview from anon, authenticated;
grant select on public.loan_extension_requests, public.loan_extension_overview to authenticated;
revoke execute on function public.request_loan_extension(uuid, date, text), public.cancel_loan_extension(uuid),
  public.review_loan_extension(uuid, boolean, text), public._close_pending_extensions() from public, anon, authenticated;
grant execute on function public.request_loan_extension(uuid, date, text), public.cancel_loan_extension(uuid),
  public.review_loan_extension(uuid, boolean, text) to authenticated;

alter publication supabase_realtime add table public.loan_extension_requests;
