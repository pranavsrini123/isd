-- =============================================================================
-- ISD Lab Management System — 0001: core schema
--
-- STOCK ACCOUNTING MODEL (per inventory item)
--
--   total_qty = available_qty + reserved_qty + borrowed_qty + damaged_qty + lost_qty
--
--   available_qty : in the lab, usable, and not promised to anyone.
--   reserved_qty  : promised to an APPROVED request but not yet handed over.
--   borrowed_qty  : issued to a student and not yet verified as returned.
--   damaged_qty   : in the lab but unusable (broken, awaiting repair/write-off).
--   lost_qty      : missing / written off. Still counted in total_qty so the
--                   loss stays visible until an admin explicitly adjusts it.
--
-- A pending request never touches stock. Approval moves available -> reserved,
-- issuance moves reserved -> borrowed, and return verification moves borrowed
-- -> available | damaged | lost. Every move happens inside a security-definer
-- function (see 0003) so the invariant, enforced by a CHECK constraint, holds.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type public.user_role         as enum ('student', 'admin');
create type public.account_status    as enum ('active', 'restricted', 'suspended');
create type public.item_condition    as enum ('new', 'good', 'fair', 'needs_repair');
create type public.project_difficulty as enum ('beginner', 'intermediate', 'advanced');
create type public.project_status    as enum ('draft', 'published', 'archived');
create type public.request_status    as enum ('pending', 'approved', 'rejected', 'cancelled', 'issued', 'returned');
create type public.borrowing_status  as enum ('active', 'closed');

-- ---------------------------------------------------------------------------
-- Application settings (key/value). Read through get_public_settings() or by
-- admins; written only through admin_update_setting().
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('allowed_email_domains', '["srmist.edu.in"]',
     'Email domains allowed to register. An empty list disables the restriction.'),
  ('max_loan_days',         '14',   'Longest loan period (days) a student may request.'),
  ('max_items_per_request', '20',   'Maximum distinct components in one request.'),
  ('max_pending_requests',  '5',    'Maximum simultaneous pending requests per student.'),
  ('lab_timezone',          '"Asia/Kolkata"', 'IANA time zone used for due dates and overdue checks.');

-- "Today" in the lab's time zone. Used for due dates and overdue checks so that
-- they do not flip at 05:30 IST because the database server runs in UTC.
create or replace function public.lab_today()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone coalesce(
            (select value #>> '{}' from public.app_settings where key = 'lab_timezone'),
            'Asia/Kolkata'))::date;
$$;

-- Generic updated_at trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: application data for each auth.users row
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null,
  full_name            text not null default '',
  srm_id               text,
  department           text,
  role                 public.user_role not null default 'student',
  status               public.account_status not null default 'active',
  preferred_difficulty public.project_difficulty,
  interests            text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_full_name_len check (char_length(full_name) <= 120),
  constraint profiles_srm_id_format check (srm_id is null or srm_id ~ '^[A-Za-z0-9]{6,20}$'),
  constraint profiles_interests_len check (coalesce(array_length(interests, 1), 0) <= 12)
);
create unique index profiles_email_key  on public.profiles (lower(email));
create unique index profiles_srm_id_key on public.profiles (upper(srm_id)) where srm_id is not null;
create index profiles_role_idx on public.profiles (role);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- True when the current session user is an active administrator. SECURITY
-- DEFINER so policies on profiles can call it without recursing into RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------
create table public.inventory_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(trim(name)) between 1 and 80),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(trim(name)) between 1 and 160),
  category_id         uuid not null references public.inventory_categories (id),
  brand_model         text check (char_length(brand_model) <= 160),
  description         text check (char_length(description) <= 4000),
  specifications      jsonb not null default '{}'::jsonb,
  asset_ids           text check (char_length(asset_ids) <= 200),   -- e.g. "ISD-MCU-0001..0010"
  total_qty           int not null default 0 check (total_qty >= 0),
  available_qty       int not null default 0 check (available_qty >= 0),
  reserved_qty        int not null default 0 check (reserved_qty >= 0),
  borrowed_qty        int not null default 0 check (borrowed_qty >= 0),
  damaged_qty         int not null default 0 check (damaged_qty >= 0),
  lost_qty            int not null default 0 check (lost_qty >= 0),
  low_stock_threshold int not null default 2 check (low_stock_threshold >= 0),
  storage_location    text check (char_length(storage_location) <= 80),
  condition           public.item_condition not null default 'good',
  image_path          text,
  is_archived         boolean not null default false,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint inventory_stock_invariant check (
    total_qty = available_qty + reserved_qty + borrowed_qty + damaged_qty + lost_qty
  )
);
create index inventory_items_category_idx on public.inventory_items (category_id);
create index inventory_items_name_idx     on public.inventory_items (lower(name));
create index inventory_items_active_idx   on public.inventory_items (is_archived) where not is_archived;
create trigger inventory_items_set_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Project library
-- ---------------------------------------------------------------------------
create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(trim(name)) between 1 and 160),
  slug              text unique,
  description       text check (char_length(description) <= 4000),
  image_path        text,
  category          text not null default 'General' check (char_length(category) <= 60),
  difficulty        public.project_difficulty not null default 'beginner',
  est_hours_min     numeric(4,1) check (est_hours_min >= 0),
  est_hours_max     numeric(4,1) check (est_hours_max >= 0),
  instructions      text,
  documentation_url text,
  github_url        text,
  video_url         text,
  learning_outcomes text[] not null default '{}',
  status            public.project_status not null default 'draft',
  is_demo           boolean not null default false,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint projects_hours_order check (est_hours_max is null or est_hours_min is null or est_hours_max >= est_hours_min)
);
create index projects_status_idx   on public.projects (status);
create index projects_category_idx on public.projects (category);
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- Requirements reference real inventory rows (never display-name strings).
create table public.project_components (
  project_id   uuid not null references public.projects (id) on delete cascade,
  item_id      uuid not null references public.inventory_items (id) on delete restrict,
  qty_required int  not null check (qty_required > 0 and qty_required <= 1000),
  notes        text check (char_length(notes) <= 300),
  primary key (project_id, item_id)
);
create index project_components_item_idx on public.project_components (item_id);

-- ---------------------------------------------------------------------------
-- Requests and borrowings
-- ---------------------------------------------------------------------------
create sequence public.request_code_seq start with 1001;

create table public.borrow_requests (
  id               uuid primary key default gen_random_uuid(),
  request_code     text not null unique default ('REQ-' || nextval('public.request_code_seq')::text),
  requester_id     uuid not null references public.profiles (id),
  project_id       uuid references public.projects (id) on delete set null,
  purpose          text not null check (char_length(trim(purpose)) between 3 and 300),
  note             text check (char_length(note) <= 1000),
  needed_from      date not null,
  needed_until     date not null,
  status           public.request_status not null default 'pending',
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason text check (char_length(rejection_reason) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint borrow_requests_dates check (needed_until >= needed_from)
);
create index borrow_requests_requester_idx on public.borrow_requests (requester_id, created_at desc);
create index borrow_requests_status_idx    on public.borrow_requests (status, created_at);
create trigger borrow_requests_set_updated_at before update on public.borrow_requests
  for each row execute function public.set_updated_at();

create table public.request_items (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.borrow_requests (id) on delete cascade,
  item_id    uuid not null references public.inventory_items (id),
  qty        int  not null check (qty > 0),
  unique (request_id, item_id)
);
create index request_items_item_idx on public.request_items (item_id);

-- One borrowing per request. UNIQUE (request_id) makes a second issuance of the
-- same request impossible even if application logic were bypassed.
create table public.borrowings (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null unique references public.borrow_requests (id),
  borrower_id         uuid not null references public.profiles (id),
  issued_by           uuid not null references public.profiles (id),
  issued_at           timestamptz not null default now(),
  due_date            date not null,
  return_requested_at timestamptz,
  status              public.borrowing_status not null default 'active',
  closed_at           timestamptz
);
create index borrowings_borrower_idx on public.borrowings (borrower_id, issued_at desc);
create index borrowings_open_idx     on public.borrowings (due_date) where status = 'active';

create table public.borrowing_items (
  id           uuid primary key default gen_random_uuid(),
  borrowing_id uuid not null references public.borrowings (id) on delete cascade,
  item_id      uuid not null references public.inventory_items (id),
  qty_issued   int  not null check (qty_issued > 0),
  unique (borrowing_id, item_id)
);
create index borrowing_items_item_idx on public.borrowing_items (item_id);

-- Exactly one verification record per borrowed line (UNIQUE borrowing_item_id).
-- Its existence is what marks a line as returned/verified.
create table public.return_records (
  id                uuid primary key default gen_random_uuid(),
  borrowing_item_id uuid not null unique references public.borrowing_items (id),
  verified_by       uuid not null references public.profiles (id),
  qty_good          int not null default 0 check (qty_good >= 0),
  qty_damaged       int not null default 0 check (qty_damaged >= 0),
  qty_missing       int not null default 0 check (qty_missing >= 0),
  notes             text check (char_length(notes) <= 500),
  verified_at       timestamptz not null default now()
);
create index return_records_time_idx on public.return_records (verified_at);

-- ---------------------------------------------------------------------------
-- Notifications and audit log
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  summary     text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activity_logs_time_idx   on public.activity_logs (created_at desc);
create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Guard triggers
--
-- PostgREST runs client requests as the 'authenticated' or 'anon' database
-- role. Those roles may never write privileged columns directly: quantities,
-- roles and account status change only through security-definer functions,
-- where current_user is the function owner (not a client role).
-- ---------------------------------------------------------------------------
create or replace function public.is_client_session()
returns boolean
language sql
stable
as $$
  select current_user in ('authenticated', 'anon');
$$;

create or replace function public.guard_inventory_items()
returns trigger
language plpgsql
as $$
begin
  if public.is_client_session() then
    if tg_op = 'INSERT' then
      -- New items start with all stock available; no other bucket may be set.
      new.available_qty := new.total_qty;
      new.reserved_qty := 0;
      new.borrowed_qty := 0;
      new.damaged_qty := 0;
      new.lost_qty := 0;
      new.is_demo := false;
    else
      if new.total_qty     is distinct from old.total_qty
         or new.available_qty is distinct from old.available_qty
         or new.reserved_qty  is distinct from old.reserved_qty
         or new.borrowed_qty  is distinct from old.borrowed_qty
         or new.damaged_qty   is distinct from old.damaged_qty
         or new.lost_qty      is distinct from old.lost_qty then
        raise exception 'Stock quantities can only be changed through adjust_inventory()'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger inventory_items_guard before insert or update on public.inventory_items
  for each row execute function public.guard_inventory_items();

create or replace function public.guard_profiles()
returns trigger
language plpgsql
as $$
begin
  if public.is_client_session() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.id is distinct from old.id
       or lower(new.email) is distinct from lower(old.email) then
      raise exception 'Role, status and email cannot be changed directly'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profiles();

-- Publishing a project requires at least one component, so a "published"
-- project can never silently report 0 requirements as buildable.
create or replace function public.guard_project_publish()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if tg_op = 'INSERT'
       or not exists (select 1 from public.project_components pc where pc.project_id = new.id) then
      raise exception 'A project needs at least one required component before it can be published'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger projects_guard_publish before insert or update on public.projects
  for each row execute function public.guard_project_publish();

-- ---------------------------------------------------------------------------
-- Sign-up: domain restriction and profile creation
-- ---------------------------------------------------------------------------
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed jsonb;
  dom text;
begin
  select value into allowed from public.app_settings where key = 'allowed_email_domains';
  if allowed is null or jsonb_typeof(allowed) <> 'array' or jsonb_array_length(allowed) = 0 then
    return new;                              -- restriction disabled by an admin
  end if;
  dom := lower(split_part(coalesce(new.email, ''), '@', 2));
  if not exists (select 1 from jsonb_array_elements_text(allowed) a(d) where lower(a.d) = dom) then
    raise exception 'Registration is limited to approved institutional email addresses'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Profiles are always created as plain students. Nothing in the sign-up
-- metadata (which the client controls) can influence role or status.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  raw_id text := nullif(trim(meta ->> 'srm_id'), '');
begin
  insert into public.profiles (id, email, full_name, srm_id)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(new.email, '@', 1)), 120),
    case when raw_id ~ '^[A-Za-z0-9]{6,20}$' then upper(raw_id) else null end
  );
  return new;
end;
$$;

create trigger on_auth_user_domain_check
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
