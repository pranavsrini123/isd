-- =============================================================================
-- Make the COMPONENTS Audit (12/10/2026) list THE inventory, in one step.
--
--   1. Every audit row that is not yet applied becomes a NEW inventory item,
--      with the audit's available / damaged numbers and the proposed
--      borrowing setting (special equipment + tools = lab use only).
--      Stock is added through adjust_inventory(), so it is all in the
--      activity log with the audit row as the reason.
--   2. Every other inventory item (demo items, anything added by hand) is
--      ARCHIVED: hidden from students and from the picker. Nothing is deleted,
--      so past requests, loans and history stay intact and items can be
--      restored from Admin -> Inventory -> Archived.
--
-- Run once in the Supabase SQL editor (after 0007 and 0008). Running it again
-- does nothing new. It acts as the first active admin account.
-- =============================================================================
begin;

select set_config('request.jwt.claim.sub',
  (select id::text from public.profiles where role = 'admin' and status = 'active' order by created_at limit 1), true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('request.jwt.claim.sub', true), 'role', 'authenticated')::text, true);

do $$
declare
  r record;
  n_new int := 0;
  n_archived int := 0;
begin
  if nullif(current_setting('request.jwt.claim.sub', true), '') is null then
    raise exception 'No active admin account found. Make your account an admin first.';
  end if;

  for r in
    select id, proposed_available, proposed_damaged, proposed_requestable
      from public.inventory_source_records
     where batch_key = 'components-audit-2026-10-12' and status in ('ready', 'needs_review')
     order by source_section desc, source_row
  loop
    perform public.admin_apply_source_record(r.id, null, r.proposed_available, r.proposed_damaged,
      r.proposed_requestable, null, null, 'Inventory replaced with audit list');
    n_new := n_new + 1;
  end loop;

  update public.inventory_items i set is_archived = true
   where not i.is_archived
     and not exists (select 1 from public.inventory_source_records s
                      where s.item_id = i.id and s.status = 'applied');
  get diagnostics n_archived = row_count;

  raise notice 'Created % items from the audit; archived % other items.', n_new, n_archived;
end $$;

commit;

-- Check: should list 103 items from the audit and 0 others.
select (s.id is not null) as from_audit, count(*) as active_items
  from public.inventory_items i
  left join public.inventory_source_records s on s.item_id = i.id and s.status = 'applied'
 where not i.is_archived
 group by 1;
