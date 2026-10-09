-- =============================================================================
-- 0002: read models, including the project readiness / recommendation engine
--
-- All views are SECURITY INVOKER, so row level security on the underlying
-- tables decides what each caller sees (students see published projects only).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Inventory list model: stock status is derived once, here.
-- ---------------------------------------------------------------------------
create view public.inventory_overview
with (security_invoker = true) as
select
  i.id,
  i.name,
  i.category_id,
  c.name as category_name,
  i.brand_model,
  i.description,
  i.specifications,
  i.asset_ids,
  i.total_qty,
  i.available_qty,
  i.reserved_qty,
  i.borrowed_qty,
  i.damaged_qty,
  i.lost_qty,
  i.low_stock_threshold,
  i.storage_location,
  i.condition,
  i.image_path,
  i.is_archived,
  i.is_demo,
  i.created_at,
  i.updated_at,
  case
    when i.available_qty = 0                          then 'out_of_stock'
    when i.available_qty <= i.low_stock_threshold     then 'low_stock'
    else 'in_stock'
  end as stock_status,
  (select count(*)
     from public.project_components pc
     join public.projects p on p.id = pc.project_id and p.status = 'published'
    where pc.item_id = i.id) as projects_using
from public.inventory_items i
join public.inventory_categories c on c.id = i.category_id;

-- ---------------------------------------------------------------------------
-- Per-component readiness: one row per (project, required component).
--
-- usable_qty is what can be allocated right now. Archived items count as 0.
-- Reserved stock is already excluded from available_qty, so two projects can
-- never both "use" the unit that has been promised to an approved request.
-- ---------------------------------------------------------------------------
create view public.project_component_status
with (security_invoker = true) as
select
  pc.project_id,
  pc.item_id,
  i.name                                           as item_name,
  i.image_path                                     as item_image_path,
  i.is_archived                                    as item_archived,
  pc.qty_required,
  pc.notes,
  case when i.is_archived then 0 else i.available_qty end as available_qty,
  greatest(pc.qty_required - case when i.is_archived then 0 else i.available_qty end, 0) as missing_qty,
  (case when i.is_archived then 0 else i.available_qty end) >= pc.qty_required as satisfied
from public.project_components pc
join public.inventory_items i on i.id = pc.item_id;

-- ---------------------------------------------------------------------------
-- Per-project readiness.
--
--   ready_pct = satisfied requirement types / required types * 100  (rounded)
--   buildable = EVERY requirement type is satisfied (and there is at least one)
--
-- Percentage and buildability are separate on purpose: 4 of 5 satisfied is
-- 80% ready, but not buildable. A project's components are distinct inventory
-- rows (primary key project_id + item_id), so a per-row comparison is also the
-- simultaneous-allocation check for that project.
-- ---------------------------------------------------------------------------
create view public.project_readiness
with (security_invoker = true) as
select
  p.id as project_id,
  count(s.item_id)::int                                         as n_required,
  count(s.item_id) filter (where s.satisfied)::int              as n_satisfied,
  case when count(s.item_id) = 0 then 0
       else round(100.0 * count(s.item_id) filter (where s.satisfied) / count(s.item_id))::int
  end                                                           as ready_pct,
  (count(s.item_id) > 0 and bool_and(coalesce(s.satisfied, false))) as buildable,
  (count(s.item_id) - count(s.item_id) filter (where s.satisfied))::int as missing_types,
  coalesce(sum(s.missing_qty), 0)::int                          as missing_units
from public.projects p
left join public.project_component_status s on s.project_id = p.id
group by p.id;

-- ---------------------------------------------------------------------------
-- Ranked project feed. One query serves the student dashboard, project
-- library, and admin project list, without fetching inventory per project.
--
-- Ranking (deterministic):
--   0. projects with no components are listed last (they are not configured)
--   1. fully buildable projects first
--   2. fewest unmet requirement types
--   3. highest readiness percentage
--   4. matches the caller's preferred difficulty, then one of their interests
--   5. name, then id (stable tie-break so ordering does not flicker)
--
-- p_sort lets the UI re-order the same rows: 'rank' (default), 'readiness',
-- 'name' or 'time'.
-- ---------------------------------------------------------------------------
create or replace function public.get_ranked_projects(
  p_search         text default null,
  p_category       text default null,
  p_difficulty     public.project_difficulty default null,
  p_buildable_only boolean default false,
  p_sort           text default 'rank',
  p_limit          int default null,
  p_offset         int default 0
)
returns table (
  id            uuid,
  name          text,
  slug          text,
  description   text,
  image_path    text,
  category      text,
  difficulty    public.project_difficulty,
  est_hours_min numeric,
  est_hours_max numeric,
  status        public.project_status,
  is_demo       boolean,
  n_required    int,
  n_satisfied   int,
  ready_pct     int,
  buildable     boolean,
  missing_types int,
  missing_units int,
  missing       jsonb,
  rank_position bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with pref as (
    select pr.preferred_difficulty as d, pr.interests as i
    from public.profiles pr
    where pr.id = auth.uid()
  ),
  base as (
    select
      p.id, p.name, p.slug, p.description, p.image_path, p.category, p.difficulty,
      p.est_hours_min, p.est_hours_max, p.status, p.is_demo,
      r.n_required, r.n_satisfied, r.ready_pct, r.buildable, r.missing_types, r.missing_units,
      (select coalesce(jsonb_agg(jsonb_build_object(
                'item_id', s.item_id,
                'name', s.item_name,
                'required_qty', s.qty_required,
                'available_qty', s.available_qty,
                'missing_qty', s.missing_qty) order by s.item_name), '[]'::jsonb)
         from public.project_component_status s
        where s.project_id = p.id and not s.satisfied) as missing,
      row_number() over (
        order by
          (r.n_required > 0) desc,
          r.buildable desc,
          r.missing_types asc,
          r.ready_pct desc,
          coalesce(p.difficulty = (select d from pref), false) desc,
          coalesce(p.category = any (coalesce((select i from pref), '{}'::text[])), false) desc,
          p.name asc,
          p.id asc
      ) as rank_position
    from public.projects p
    join public.project_readiness r on r.project_id = p.id
    where (p_search is null
           or p.name ilike '%' || p_search || '%'
           or p.description ilike '%' || p_search || '%')
      and (p_category is null or p.category = p_category)
      and (p_difficulty is null or p.difficulty = p_difficulty)
      and (not coalesce(p_buildable_only, false) or r.buildable)
  )
  select b.id, b.name, b.slug, b.description, b.image_path, b.category, b.difficulty,
         b.est_hours_min, b.est_hours_max, b.status, b.is_demo,
         b.n_required, b.n_satisfied, b.ready_pct, b.buildable, b.missing_types, b.missing_units,
         b.missing, b.rank_position
  from base b
  order by
    case when p_sort = 'name'      then b.name end asc,
    case when p_sort = 'readiness' then b.ready_pct end desc,
    case when p_sort = 'time'      then coalesce(b.est_hours_max, b.est_hours_min) end asc,
    b.rank_position asc
  limit p_limit offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Request list model: items aggregated, plus a live stock check for pending
-- requests so admins can see at a glance whether they can be approved.
-- ---------------------------------------------------------------------------
create view public.request_overview
with (security_invoker = true) as
select
  r.id,
  r.request_code,
  r.requester_id,
  pr.full_name   as requester_name,
  pr.email       as requester_email,
  pr.srm_id      as requester_srm_id,
  r.project_id,
  p.name         as project_name,
  r.purpose,
  r.note,
  r.needed_from,
  r.needed_until,
  r.status,
  r.reviewed_by,
  r.reviewed_at,
  r.rejection_reason,
  r.created_at,
  b.id           as borrowing_id,
  b.due_date,
  b.issued_at,
  li.items,
  li.item_count,
  li.total_units,
  li.can_fulfil
from public.borrow_requests r
join public.profiles pr on pr.id = r.requester_id
left join public.projects p on p.id = r.project_id
left join public.borrowings b on b.request_id = r.id
cross join lateral (
  select
    jsonb_agg(jsonb_build_object(
      'item_id', ri.item_id,
      'name', i.name,
      'qty', ri.qty,
      'available_qty', i.available_qty) order by i.name) as items,
    count(*)::int  as item_count,
    sum(ri.qty)::int as total_units,
    bool_and(i.available_qty >= ri.qty) as can_fulfil
  from public.request_items ri
  join public.inventory_items i on i.id = ri.item_id
  where ri.request_id = r.id
) li;

-- ---------------------------------------------------------------------------
-- One row per borrowed line, with derived return/overdue state.
-- ---------------------------------------------------------------------------
create view public.borrowing_lines
with (security_invoker = true) as
select
  bi.id            as line_id,
  bi.borrowing_id,
  b.request_id,
  r.request_code,
  b.borrower_id,
  pr.full_name     as borrower_name,
  pr.email         as borrower_email,
  pr.srm_id        as borrower_srm_id,
  bi.item_id,
  i.name           as item_name,
  i.image_path     as item_image_path,
  bi.qty_issued,
  b.issued_at,
  b.due_date,
  b.return_requested_at,
  (rr.id is not null) as is_verified,
  rr.verified_at,
  rr.qty_good,
  rr.qty_damaged,
  rr.qty_missing,
  (rr.id is null and b.due_date < public.lab_today()) as is_overdue,
  case when rr.id is null and b.due_date < public.lab_today()
       then public.lab_today() - b.due_date else 0 end as days_overdue
from public.borrowing_items bi
join public.borrowings b      on b.id = bi.borrowing_id
join public.borrow_requests r on r.id = b.request_id
join public.profiles pr       on pr.id = b.borrower_id
join public.inventory_items i on i.id = bi.item_id
left join public.return_records rr on rr.borrowing_item_id = bi.id;

-- ---------------------------------------------------------------------------
-- Activity log with the actor's name (RLS on activity_logs keeps it admin-only).
-- ---------------------------------------------------------------------------
create view public.activity_overview
with (security_invoker = true) as
select a.*, pr.full_name as actor_name, pr.email as actor_email
from public.activity_logs a
left join public.profiles pr on pr.id = a.actor_id;
