-- =============================================================================
-- 0009: richer project catalogue
--
--   * Project detail fields: objectives, prerequisites, hardware/software,
--     expected outcome, testing, safety, extensions, image alt text, items the
--     lab does not stock, and a compatibility-verification note.
--   * catalogue_key identifies projects loaded from a catalogue file, so a
--     catalogue load is idempotent (no duplicates when re-run).
--   * Availability status per project (computed, never stored):
--       available                - every listed component is free right now
--       requires_external        - every listed component is free, but some
--                                  hardware is not stocked by the lab
--       partially_available      - some components are free, some are short
--       temporarily_unavailable  - none of the listed components is free
--       requires_verification    - compatibility must be confirmed by staff
--   * Readiness counts lab-use-only equipment (e.g. Jetson Nano, Smorphi) as
--     usable, because such projects are built inside the lab. Those items still
--     cannot be borrowed (enforced in 0007); the UI marks them "use in lab".
--   * component_demand: for admins, how many active projects need each item.
--
-- No stock is changed. Safe to run on a database with 0001-0008 applied.
-- =============================================================================

alter table public.projects
  add column if not exists catalogue_key         text unique,
  add column if not exists objectives            text[] not null default '{}',
  add column if not exists prerequisites         text[] not null default '{}',
  add column if not exists hardware_software     text[] not null default '{}',
  add column if not exists expected_outcome      text check (char_length(expected_outcome) <= 2000),
  add column if not exists testing_steps         text[] not null default '{}',
  add column if not exists safety_notes          text[] not null default '{}',
  add column if not exists extensions            text[] not null default '{}',
  add column if not exists external_requirements text[] not null default '{}',
  add column if not exists verification_note     text check (char_length(verification_note) <= 1000),
  add column if not exists image_alt             text check (char_length(image_alt) <= 300);

-- Remembers each project's status before a catalogue replacement, so the
-- replacement can be undone (see import/project_catalogue_2026-10/).
create table if not exists public.project_status_backup (
  batch_key       text not null,
  project_id      uuid not null references public.projects (id) on delete cascade,
  previous_status public.project_status not null,
  saved_at        timestamptz not null default now(),
  primary key (batch_key, project_id)
);
alter table public.project_status_backup enable row level security;
drop policy if exists project_status_backup_admin_read on public.project_status_backup;
create policy project_status_backup_admin_read on public.project_status_backup
  for select to authenticated using (public.is_admin());
revoke all on public.project_status_backup from anon, authenticated;
grant select on public.project_status_backup to authenticated;

-- ---------------------------------------------------------------------------
-- Readiness: lab-use-only items count (built in the lab); archived items do not.
-- Damaged and reserved units are already excluded from available_qty.
-- ---------------------------------------------------------------------------
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
  case when i.is_archived then 0 else i.available_qty end as available_qty,
  greatest(pc.qty_required - case when i.is_archived then 0 else i.available_qty end, 0) as missing_qty,
  (case when i.is_archived then 0 else i.available_qty end) >= pc.qty_required as satisfied,
  i.is_requestable                                 as item_requestable
from public.project_components pc
join public.inventory_items i on i.id = pc.item_id;

create or replace function public._project_availability(
  p_n_required int, p_n_satisfied int, p_external text[], p_verification text
) returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_verification, '')), '') is not null then 'requires_verification'
    when p_n_required > 0 and p_n_satisfied = p_n_required
         and cardinality(coalesce(p_external, '{}')) > 0             then 'requires_external'
    when p_n_required > 0 and p_n_satisfied = p_n_required          then 'available'
    when p_n_satisfied > 0                                          then 'partially_available'
    when p_n_required = 0 and cardinality(coalesce(p_external, '{}')) > 0 then 'requires_external'
    else 'temporarily_unavailable'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Ranked feed, now with availability status and the new card fields.
-- (Return type changes, so the function is dropped and re-created.)
-- ---------------------------------------------------------------------------
drop function if exists public.get_ranked_projects(text, text, public.project_difficulty, boolean, text, int, int);
create function public.get_ranked_projects(
  p_search         text default null,
  p_category       text default null,
  p_difficulty     public.project_difficulty default null,
  p_buildable_only boolean default false,
  p_sort           text default 'rank',
  p_limit          int default null,
  p_offset         int default 0
)
returns table (
  id                  uuid,
  name                text,
  slug                text,
  description         text,
  image_path          text,
  category            text,
  difficulty          public.project_difficulty,
  est_hours_min       numeric,
  est_hours_max       numeric,
  status              public.project_status,
  is_demo             boolean,
  n_required          int,
  n_satisfied         int,
  ready_pct           int,
  buildable           boolean,
  missing_types       int,
  missing_units       int,
  missing             jsonb,
  rank_position       bigint,
  availability_status text,
  image_alt           text,
  n_external          int,
  catalogue_key       text
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
      public._project_availability(r.n_required, r.n_satisfied, p.external_requirements, p.verification_note) as availability_status,
      p.image_alt, cardinality(p.external_requirements) as n_external, p.catalogue_key
    from public.projects p
    join public.project_readiness r on r.project_id = p.id
    where (p_search is null
           or p.name ilike '%' || p_search || '%'
           or p.description ilike '%' || p_search || '%'
           or p.category ilike '%' || p_search || '%')
      and (p_category is null or p.category = p_category)
      and (p_difficulty is null or p.difficulty = p_difficulty)
      and (not coalesce(p_buildable_only, false) or r.buildable)
  ),
  ranked as (
    select b.*,
      row_number() over (
        order by
          (b.n_required > 0) desc,
          (b.availability_status = 'available') desc,
          b.buildable desc,
          b.missing_types asc,
          b.ready_pct desc,
          coalesce(b.difficulty = (select d from pref), false) desc,
          coalesce(b.category = any (coalesce((select i from pref), '{}'::text[])), false) desc,
          b.name asc,
          b.id asc
      ) as rank_position
    from base b
  )
  select b.id, b.name, b.slug, b.description, b.image_path, b.category, b.difficulty,
         b.est_hours_min, b.est_hours_max, b.status, b.is_demo,
         b.n_required, b.n_satisfied, b.ready_pct, b.buildable, b.missing_types, b.missing_units,
         b.missing, b.rank_position, b.availability_status, b.image_alt, b.n_external, b.catalogue_key
  from ranked b
  order by
    case when p_sort = 'name'      then b.name end asc,
    case when p_sort = 'readiness' then b.ready_pct end desc,
    case when p_sort = 'time'      then coalesce(b.est_hours_max, b.est_hours_min) end asc,
    b.rank_position asc
  limit p_limit offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Component demand across active (published) projects, for admins.
-- ---------------------------------------------------------------------------
create or replace view public.component_demand
with (security_invoker = true) as
select
  i.id as item_id, i.name as item_name, i.available_qty, i.total_qty, i.damaged_qty,
  i.is_requestable, i.is_archived,
  count(*)::int                    as projects_count,
  sum(pc.qty_required)::int        as total_required,
  max(pc.qty_required)::int        as max_required,
  count(*) filter (where pc.qty_required > (case when i.is_archived then 0 else i.available_qty end))::int as projects_short,
  array_agg(p.name order by p.name) as project_names
from public.project_components pc
join public.projects p        on p.id = pc.project_id and p.status = 'published'
join public.inventory_items i on i.id = pc.item_id
where public.is_admin()
group by i.id;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.component_demand from anon, authenticated;
grant select on public.component_demand, public.project_component_status to authenticated;
revoke execute on function public._project_availability(int, int, text[], text) from public, anon;
grant execute on function public._project_availability(int, int, text[], text) to authenticated;
revoke execute on function public.get_ranked_projects(text, text, public.project_difficulty, boolean, text, int, int) from public, anon;
grant execute on function public.get_ranked_projects(text, text, public.project_difficulty, boolean, text, int, int) to authenticated;
