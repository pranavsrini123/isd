-- =============================================================================
-- 0007: audited inventory import (source records, review, apply, revert)
--
-- An official stock audit is loaded as SOURCE RECORDS (one row per line of the
-- document, every original field kept). Loading them changes no stock. An
-- administrator then reviews each record in the app and applies it, which:
--   * links it to an existing inventory item (IDs and project links are kept)
--     or creates a new item,
--   * moves stock ONLY through adjust_inventory(), so every change is in the
--     activity log with a reason that names the audit row,
--   * never touches reserved, borrowed or lost stock,
--   * stores the before/after state so the change can be reverted.
--
-- Also adds:
--   * inventory_items.is_requestable: lab-use-only items stay visible but can
--     not be requested or approved (enforced in the database, not the UI);
--   * inventory_items.remarks: free-text notes (e.g. from the audit);
--   * admin_retire_demo_inventory(): archives (never deletes) demo items.
--
-- Safe to run once on a database that already has 0001-0006 applied.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Item columns
-- ---------------------------------------------------------------------------
alter table public.inventory_items
  add column if not exists is_requestable boolean not null default true,
  add column if not exists remarks text check (char_length(remarks) <= 1000);

-- Stock can never be promised for an item that is not borrowable. Approval is
-- the only path that increases reserved_qty, so this blocks approving old
-- pending requests for an item that was made lab-use only afterwards.
create or replace function public.guard_requestable_stock()
returns trigger
language plpgsql
as $$
begin
  if not new.is_requestable and new.reserved_qty > old.reserved_qty then
    raise exception '"%" is not available for borrowing', new.name using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists inventory_items_guard_requestable on public.inventory_items;
create trigger inventory_items_guard_requestable before update on public.inventory_items
  for each row execute function public.guard_requestable_stock();

-- Requests may only list borrowable items (request_items are written only by
-- create_borrow_request(); this keeps that function unchanged).
create or replace function public.guard_request_item_requestable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  it public.inventory_items;
begin
  select * into it from public.inventory_items where id = new.item_id;
  if found and not it.is_requestable then
    raise exception '"%" is for use in the lab only and cannot be requested', it.name using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists request_items_guard_requestable on public.request_items;
create trigger request_items_guard_requestable before insert on public.request_items
  for each row execute function public.guard_request_item_requestable();

-- ---------------------------------------------------------------------------
-- 2. Read models: expose the new columns, and count non-borrowable stock as 0
--    for project readiness (a student cannot get it through a request).
-- ---------------------------------------------------------------------------
create or replace view public.inventory_overview
with (security_invoker = true) as
select
  i.id, i.name, i.category_id, c.name as category_name, i.brand_model, i.description,
  i.specifications, i.asset_ids, i.total_qty, i.available_qty, i.reserved_qty,
  i.borrowed_qty, i.damaged_qty, i.lost_qty, i.low_stock_threshold, i.storage_location,
  i.condition, i.image_path, i.is_archived, i.is_demo, i.created_at, i.updated_at,
  case
    when i.available_qty = 0                          then 'out_of_stock'
    when i.available_qty <= i.low_stock_threshold     then 'low_stock'
    else 'in_stock'
  end as stock_status,
  (select count(*)
     from public.project_components pc
     join public.projects p on p.id = pc.project_id and p.status = 'published'
    where pc.item_id = i.id) as projects_using,
  i.is_requestable,
  i.remarks,
  case when i.is_requestable and not i.is_archived then i.available_qty else 0 end as requestable_qty
from public.inventory_items i
join public.inventory_categories c on c.id = i.category_id;

create or replace view public.project_component_status
with (security_invoker = true) as
select
  pc.project_id,
  pc.item_id,
  i.name                                           as item_name,
  i.image_path                                     as item_image_path,
  i.is_archived                                    as item_archived,
  pc.qty_required,
  pc.notes,
  case when i.is_archived or not i.is_requestable then 0 else i.available_qty end as available_qty,
  greatest(pc.qty_required - case when i.is_archived or not i.is_requestable then 0 else i.available_qty end, 0) as missing_qty,
  (case when i.is_archived or not i.is_requestable then 0 else i.available_qty end) >= pc.qty_required as satisfied
from public.project_components pc
join public.inventory_items i on i.id = pc.item_id;

-- ---------------------------------------------------------------------------
-- 3. Source records
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_source_records (
  id                     uuid primary key default gen_random_uuid(),
  batch_key              text not null check (char_length(batch_key) between 3 and 80),
  source_doc             text not null,
  source_section         text not null check (source_section in ('special_equipment', 'small_components')),
  source_page            int,
  source_row             int  not null check (source_row > 0),   -- position within the section
  source_serial          text,                                   -- "Sl No" exactly as printed
  original_name          text not null,                          -- exactly as printed
  display_name           text not null check (char_length(trim(display_name)) between 1 and 160),
  category_name          text not null,
  qty_reported           int check (qty_reported >= 0),           -- special equipment "Quantity"
  qty_isd_lab            int check (qty_isd_lab >= 0),            -- "Qty ISD LAB"
  qty_old_project        int check (qty_old_project >= 0),        -- "Qty From old Project"
  qty_available_reported int check (qty_available_reported >= 0), -- "Available"
  remarks                text,
  received_date          date,
  flags                  text[] not null default '{}',
  review_notes           text,
  proposed_available     int not null default 0 check (proposed_available >= 0),
  proposed_damaged       int not null default 0 check (proposed_damaged >= 0),
  proposed_requestable   boolean not null default true,
  status                 text not null default 'needs_review'
                           check (status in ('ready', 'needs_review', 'applied', 'skipped')),
  item_id                uuid references public.inventory_items (id) on delete restrict,
  applied_by             uuid references public.profiles (id) on delete set null,
  applied_at             timestamptz,
  applied_values         jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (batch_key, source_section, source_row)
);
create index if not exists inventory_source_records_item_idx on public.inventory_source_records (item_id);
create index if not exists inventory_source_records_batch_idx on public.inventory_source_records (batch_key, status);
drop trigger if exists inventory_source_records_set_updated_at on public.inventory_source_records;
create trigger inventory_source_records_set_updated_at before update on public.inventory_source_records
  for each row execute function public.set_updated_at();

alter table public.inventory_source_records enable row level security;
drop policy if exists source_records_admin_read on public.inventory_source_records;
create policy source_records_admin_read on public.inventory_source_records
  for select to authenticated using (public.is_admin());
-- No insert/update/delete policies or grants: writes happen only in the functions below.

-- ---------------------------------------------------------------------------
-- 4. Name matching (no extensions needed): word-overlap score 0..1
-- ---------------------------------------------------------------------------
create or replace function public._name_tokens(p text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct w order by w), '{}')
    from regexp_split_to_table(lower(coalesce(p, '')), '[^a-z0-9]+') w
   where char_length(w) >= 2 or w ~ '^[0-9]+$';
$$;

create or replace function public._name_similarity(a text, b text)
returns numeric
language sql
immutable
as $$
  with x as (select public._name_tokens(a) ta, public._name_tokens(b) tb)
  select case when cardinality(ta) = 0 or cardinality(tb) = 0 then 0
    else round(
      (select count(*) from unnest(ta) t where t = any(tb))::numeric
      / (select count(*) from (select unnest(ta) union select unnest(tb)) u), 2)
  end from x;
$$;

-- Review model: each record with its best existing-item match (if any) and the
-- linked item's live stock. Admin-only through the table's RLS.
create or replace view public.inventory_source_review
with (security_invoker = true) as
select
  r.*,
  m.id         as suggested_item_id,
  m.name       as suggested_item_name,
  m.score      as suggested_score,
  m.is_demo    as suggested_is_demo,
  li.name      as item_name,
  li.total_qty as item_total_qty, li.available_qty as item_available_qty,
  li.reserved_qty as item_reserved_qty, li.borrowed_qty as item_borrowed_qty,
  li.damaged_qty as item_damaged_qty, li.lost_qty as item_lost_qty,
  li.is_requestable as item_is_requestable, li.is_archived as item_is_archived
from public.inventory_source_records r
left join lateral (
  select i.id, i.name, i.is_demo, public._name_similarity(r.display_name, i.name) as score
    from public.inventory_items i
   where not i.is_archived
     and not exists (select 1 from public.inventory_source_records o
                      where o.item_id = i.id and o.id <> r.id and o.status = 'applied')
   order by 4 desc, i.is_demo, i.name
   limit 1
) m on m.score >= 0.4 and r.status <> 'applied'
left join public.inventory_items li on li.id = r.item_id;

-- ---------------------------------------------------------------------------
-- 5. Stock moves (internal): reach a target available/damaged count using only
--    adjust_inventory(). Reserved, borrowed and lost are never touched.
-- ---------------------------------------------------------------------------
create or replace function public._audit_set_stock(
  p_item_id uuid, p_available int, p_damaged int, p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  it public.inventory_items;
begin
  select * into it from public.inventory_items where id = p_item_id for update;
  if p_damaged > it.damaged_qty then
    -- Damaged units found in the lab: count them in, then mark them damaged.
    perform public.adjust_inventory(it.id, 'add_stock', p_damaged - it.damaged_qty, p_reason);
    perform public.adjust_inventory(it.id, 'mark_damaged', p_damaged - it.damaged_qty, p_reason);
  elsif p_damaged < it.damaged_qty then
    perform public.adjust_inventory(it.id, 'write_off_damaged', it.damaged_qty - p_damaged, p_reason);
  end if;
  select * into it from public.inventory_items where id = p_item_id;
  if p_available > it.available_qty then
    perform public.adjust_inventory(it.id, 'add_stock', p_available - it.available_qty, p_reason);
  elsif p_available < it.available_qty then
    perform public.adjust_inventory(it.id, 'remove_available', it.available_qty - p_available, p_reason);
  end if;
end;
$$;

create or replace function public._audit_category(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cid uuid;
begin
  select id into cid from public.inventory_categories where lower(name) = lower(trim(p_name));
  if cid is null then
    insert into public.inventory_categories (name, sort_order)
    values (trim(p_name), coalesce((select max(sort_order) + 1 from public.inventory_categories), 0))
    returning id into cid;
  end if;
  return cid;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Admin functions
-- ---------------------------------------------------------------------------

-- Apply one record. p_item_id = an existing item to update (keeps its id, name
-- and project links), or null to create a new item named p_name.
create or replace function public.admin_apply_source_record(
  p_record_id   uuid,
  p_item_id     uuid,
  p_available   int,
  p_damaged     int,
  p_requestable boolean,
  p_name        text default null,
  p_category    text default null,
  p_note        text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec     public.inventory_source_records;
  it      public.inventory_items;
  created boolean := false;
  item    uuid := p_item_id;
  reason  text;
  before_state jsonb;
  after_state  jsonb;
begin
  perform public._require_admin();

  select * into rec from public.inventory_source_records where id = p_record_id for update;
  if not found then
    raise exception 'Source record not found';
  end if;
  if rec.status = 'applied' then
    raise exception 'This audit row has already been applied (revert it first to change it)';
  end if;
  if p_available is null or p_available < 0 or p_damaged is null or p_damaged < 0 then
    raise exception 'Quantities must be zero or more';
  end if;
  if p_available > 100000 or p_damaged > 100000 then
    raise exception 'Quantity is too large';
  end if;
  if p_requestable is null then
    raise exception 'Choose whether the item can be borrowed';
  end if;

  reason := format('Audit import %s: %s row %s (No. %s, "%s")%s',
                   rec.batch_key, replace(rec.source_section, '_', ' '), rec.source_row,
                   coalesce(rec.source_serial, '-'), rec.original_name,
                   case when nullif(trim(coalesce(p_note, '')), '') is null then '' else ' - ' || trim(p_note) end);

  if item is null then
    if nullif(trim(coalesce(p_name, rec.display_name)), '') is null then
      raise exception 'A name is required';
    end if;
    insert into public.inventory_items (name, category_id, remarks, is_requestable)
    values (left(trim(coalesce(p_name, rec.display_name)), 160),
            public._audit_category(coalesce(nullif(trim(p_category), ''), rec.category_name)),
            left(rec.remarks, 1000), p_requestable)
    returning id into item;
    created := true;
    perform public._log_activity('import.item_created', 'inventory_item', item,
      format('Created "%s" from audit row %s', coalesce(p_name, rec.display_name), rec.source_row),
      jsonb_build_object('source_record_id', rec.id, 'batch', rec.batch_key));
  else
    if exists (select 1 from public.inventory_source_records
                where item_id = item and status = 'applied' and batch_key = rec.batch_key and id <> rec.id) then
      raise exception 'That item is already linked to another row of this audit';
    end if;
  end if;

  select * into it from public.inventory_items where id = item for update;
  if not found then
    raise exception 'Item not found';
  end if;
  if it.is_archived then
    raise exception 'That item is archived; restore it first or create a new item';
  end if;

  before_state := jsonb_build_object('total', it.total_qty, 'available', it.available_qty,
    'reserved', it.reserved_qty, 'borrowed', it.borrowed_qty, 'damaged', it.damaged_qty,
    'lost', it.lost_qty, 'is_requestable', it.is_requestable, 'remarks', it.remarks);
  if created then
    before_state := before_state || jsonb_build_object('is_requestable', null, 'remarks', null);
  end if;

  perform public._audit_set_stock(item, p_available, p_damaged, reason);

  update public.inventory_items
     set is_requestable = p_requestable,
         remarks = case when created then remarks
                        when rec.remarks is null then remarks
                        else left(rec.remarks, 1000) end
   where id = item
  returning * into it;

  after_state := jsonb_build_object('total', it.total_qty, 'available', it.available_qty,
    'reserved', it.reserved_qty, 'borrowed', it.borrowed_qty, 'damaged', it.damaged_qty,
    'lost', it.lost_qty, 'is_requestable', it.is_requestable, 'remarks', it.remarks);

  update public.inventory_source_records
     set status = 'applied', item_id = item, applied_by = auth.uid(), applied_at = now(),
         applied_values = jsonb_build_object('created_item', created, 'before', before_state,
                                             'after', after_state, 'note', nullif(trim(coalesce(p_note, '')), ''),
                                             'previous_status', rec.status)
   where id = rec.id;

  perform public._log_activity('import.applied', 'inventory_item', item,
    format('Applied audit row %s ("%s") to %s', rec.source_row, rec.original_name, it.name),
    jsonb_build_object('source_record_id', rec.id, 'batch', rec.batch_key, 'before', before_state, 'after', after_state));
  return item;
end;
$$;

-- Undo an applied record: puts stock back exactly as it was, provided nothing
-- else has changed the item since. An item that the import created is archived
-- (never deleted). Also re-opens a skipped record.
create or replace function public.admin_revert_source_record(p_record_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec  public.inventory_source_records;
  it   public.inventory_items;
  b    jsonb;
  a    jsonb;
  prev text;
begin
  perform public._require_admin();
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'A reason is required';
  end if;
  select * into rec from public.inventory_source_records where id = p_record_id for update;
  if not found then
    raise exception 'Source record not found';
  end if;
  prev := coalesce(rec.applied_values ->> 'previous_status', 'needs_review');
  if prev not in ('ready', 'needs_review') then prev := 'needs_review'; end if;

  if rec.status = 'skipped' then
    update public.inventory_source_records
       set status = prev, applied_by = null, applied_at = null, applied_values = null
     where id = rec.id;
    perform public._log_activity('import.reopened', 'inventory_source_record', rec.id,
      format('Re-opened audit row %s ("%s")', rec.source_row, rec.original_name),
      jsonb_build_object('reason', trim(p_reason)));
    return;
  end if;
  if rec.status <> 'applied' then
    raise exception 'Only applied or skipped rows can be reverted';
  end if;

  b := rec.applied_values -> 'before';
  a := rec.applied_values -> 'after';
  select * into it from public.inventory_items where id = rec.item_id for update;
  if it.available_qty <> (a ->> 'available')::int or it.damaged_qty <> (a ->> 'damaged')::int
     or it.reserved_qty <> (a ->> 'reserved')::int or it.borrowed_qty <> (a ->> 'borrowed')::int
     or it.lost_qty <> (a ->> 'lost')::int then
    raise exception 'Stock for "%" has changed since this row was applied; adjust it manually instead', it.name;
  end if;

  perform public._audit_set_stock(it.id, (b ->> 'available')::int, (b ->> 'damaged')::int,
    format('Revert audit import %s row %s: %s', rec.batch_key, rec.source_row, trim(p_reason)));

  if (rec.applied_values ->> 'created_item')::boolean then
    update public.inventory_items set is_archived = true where id = it.id;
  else
    update public.inventory_items
       set is_requestable = coalesce((b ->> 'is_requestable')::boolean, is_requestable),
           remarks = b ->> 'remarks'
     where id = it.id;
  end if;

  update public.inventory_source_records
     set status = prev, item_id = case when (rec.applied_values ->> 'created_item')::boolean then item_id else null end,
         applied_by = null, applied_at = null,
         applied_values = jsonb_build_object('reverted', rec.applied_values, 'reverted_at', now(),
                                             'reverted_by', auth.uid(), 'reason', trim(p_reason))
   where id = rec.id;

  perform public._log_activity('import.reverted', 'inventory_item', it.id,
    format('Reverted audit row %s ("%s")', rec.source_row, rec.original_name),
    jsonb_build_object('source_record_id', rec.id, 'reason', trim(p_reason)));
end;
$$;

create or replace function public.admin_skip_source_record(p_record_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec public.inventory_source_records;
begin
  perform public._require_admin();
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'A reason is required';
  end if;
  select * into rec from public.inventory_source_records where id = p_record_id for update;
  if not found then
    raise exception 'Source record not found';
  end if;
  if rec.status in ('applied', 'skipped') then
    raise exception 'This audit row is already %', rec.status;
  end if;
  update public.inventory_source_records
     set status = 'skipped', applied_by = auth.uid(), applied_at = now(),
         applied_values = jsonb_build_object('skip_reason', trim(p_reason), 'previous_status', rec.status)
   where id = rec.id;
  perform public._log_activity('import.skipped', 'inventory_source_record', rec.id,
    format('Skipped audit row %s ("%s")', rec.source_row, rec.original_name),
    jsonb_build_object('reason', trim(p_reason)));
end;
$$;

-- Apply every 'ready' row of a batch that has NO possible match with an
-- existing item (those need a person to choose). Creates new items with the
-- proposed values. Returns the number applied.
create or replace function public.admin_apply_ready_source_records(p_batch_key text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n int := 0;
begin
  perform public._require_admin();
  for r in
    select v.id, v.proposed_available, v.proposed_damaged, v.proposed_requestable
      from public.inventory_source_review v
     where v.batch_key = p_batch_key and v.status = 'ready' and v.suggested_item_id is null
     order by v.source_section, v.source_row
  loop
    perform public.admin_apply_source_record(r.id, null, r.proposed_available, r.proposed_damaged,
                                             r.proposed_requestable, null, null, 'bulk apply of reconciled rows');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Archive demo items that are not in use (no reserved or borrowed stock and not
-- linked to an applied audit row). Optionally archive demo projects as well.
-- Nothing is deleted; archived rows keep their history and can be restored.
create or replace function public.admin_retire_demo_inventory(p_include_projects boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n_items int := 0; n_busy int := 0; n_projects int := 0;
begin
  perform public._require_admin();

  select count(*) into n_busy from public.inventory_items i
   where i.is_demo and not i.is_archived and (i.reserved_qty > 0 or i.borrowed_qty > 0);

  with x as (
    update public.inventory_items i set is_archived = true
     where i.is_demo and not i.is_archived and i.reserved_qty = 0 and i.borrowed_qty = 0
       and not exists (select 1 from public.inventory_source_records r where r.item_id = i.id and r.status = 'applied')
    returning 1)
  select count(*) into n_items from x;

  if p_include_projects then
    with x as (
      update public.projects set status = 'archived'
       where is_demo and status <> 'archived'
      returning 1)
    select count(*) into n_projects from x;
  end if;

  perform public._log_activity('import.demo_retired', 'inventory_item', null,
    format('Archived %s demo items%s', n_items,
           case when p_include_projects then format(' and %s demo projects', n_projects) else '' end),
    jsonb_build_object('items_archived', n_items, 'items_still_in_use', n_busy, 'projects_archived', n_projects));
  return jsonb_build_object('items_archived', n_items, 'items_still_in_use', n_busy, 'projects_archived', n_projects);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Privileges
-- ---------------------------------------------------------------------------
revoke all on public.inventory_source_records, public.inventory_source_review from anon, authenticated;
grant select on public.inventory_source_records, public.inventory_source_review to authenticated;
grant select on public.inventory_overview, public.project_component_status to authenticated;

revoke execute on function
  public.guard_requestable_stock(), public.guard_request_item_requestable(),
  public._name_tokens(text), public._name_similarity(text, text),
  public._audit_set_stock(uuid, int, int, text), public._audit_category(text),
  public.admin_apply_source_record(uuid, uuid, int, int, boolean, text, text, text),
  public.admin_revert_source_record(uuid, text), public.admin_skip_source_record(uuid, text),
  public.admin_apply_ready_source_records(text), public.admin_retire_demo_inventory(boolean)
from public, anon, authenticated;

-- The review view calls the matching helpers under the caller's identity.
grant execute on function public._name_tokens(text), public._name_similarity(text, text) to authenticated;
grant execute on function
  public.admin_apply_source_record(uuid, uuid, int, int, boolean, text, text, text),
  public.admin_revert_source_record(uuid, text), public.admin_skip_source_record(uuid, text),
  public.admin_apply_ready_source_records(text), public.admin_retire_demo_inventory(boolean)
to authenticated;
