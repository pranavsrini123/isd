-- Audited inventory import (migrations 0007 + 0008). Runs after 30_extensions.sql.
do $imp$
declare
  stu uuid; adm uuid;
  batch text := 'components-audit-2026-10-12';
  r_glue uuid; r_soil uuid; r_lm uuid; r_skip uuid;
  glue uuid; soil uuid; soil_before public.inventory_items; soil_after public.inventory_items;
  req uuid; req2 uuid; n int; n_ready int; n_items_before int; plant uuid;
  piezo uuid;
begin
  stu := t.mkuser('imp.student@srmist.edu.in', 'Import Student');
  adm := t.mkuser('imp.admin@srmist.edu.in', 'Import Admin');
  update public.profiles set role = 'super_admin' where id = adm;

  -- ---- loaded data
  perform t.eq('import: 103 source rows loaded', (select count(*)::text from public.inventory_source_records where batch_key = batch), '103');
  perform t.eq('import: 15 special-equipment rows', (select count(*)::text from public.inventory_source_records where batch_key = batch and source_section = 'special_equipment'), '15');
  perform t.eq('import: 88 small-component rows', (select count(*)::text from public.inventory_source_records where batch_key = batch and source_section = 'small_components'), '88');
  perform t.eq('import: duplicate serials 51 and 58 kept as separate rows',
    (select string_agg(source_serial || 'x' || c, ',' order by source_serial) from (
       select source_serial, count(*) c from public.inventory_source_records
        where batch_key = batch and source_section = 'small_components' group by 1 having count(*) > 1) d), '51x2,58x2');
  perform t.eq('import: original names kept verbatim',
    (select original_name from public.inventory_source_records where batch_key = batch and source_section = 'small_components' and source_serial = '66'),
    'Soldering ' || chr(64258) || 'ux');
  perform t.eq('import: received date parsed as 11 May 2026',
    (select received_date::text from public.inventory_source_records where batch_key = batch and source_serial = '14' and source_section = 'special_equipment'), '2026-05-11');
  perform t.ok('import: loading changed no stock',
    not exists (select 1 from public.inventory_source_records where status = 'applied' or item_id is not null)
    and not exists (select 1 from public.activity_logs where action like 'import.%'));
  perform t.eq('import: L298N mismatch (12 recorded, 13 available) flagged, not corrected',
    (select qty_isd_lab + qty_old_project || '/' || qty_available_reported || '/' || ('quantity_mismatch' = any(flags))::text
       from public.inventory_source_records where batch_key = batch and original_name = 'L298N Driver'), '12/13/true');

  -- ---- access control
  perform t.eq('import: students cannot read source records', t.as_run(stu, 'select count(*)::text from public.inventory_source_review'), '0');
  perform t.eq('import: admins can read source records', t.as_run(adm, 'select count(*)::text from public.inventory_source_review'), '103');
  perform t.throws('import: students cannot apply rows', stu,
    format('select public.admin_apply_source_record(%L,null,1,0,true)::text',
           (select id from public.inventory_source_records limit 1)), '%Administrator%');
  perform t.throws('import: admins cannot write source records directly', adm,
    'update public.inventory_source_records set status = ''applied'' returning 1', '%permission denied%');
  perform t.throws('import: students cannot retire demo inventory', stu, 'select public.admin_retire_demo_inventory()::text', '%Administrator%');

  -- ---- apply as a new item: damaged + lab-use only
  select id into r_glue from public.inventory_source_records where batch_key = batch and original_name = 'Gluegun-60W';
  glue := t.as_run(adm, format('select public.admin_apply_source_record(%L,null,1,1,false,null,null,''counted 12/10'')::text', r_glue))::uuid;
  perform t.eq('import: new item stock (total/available/damaged)',
    (select total_qty || '/' || available_qty || '/' || damaged_qty from public.inventory_items where id = glue), '2/1/1');
  perform t.eq('import: new item is lab-use only with source remark',
    (select is_requestable::text || '/' || remarks from public.inventory_items where id = glue), 'false/Damaged');
  perform t.eq('import: new item category from dataset',
    (select c.name from public.inventory_items i join public.inventory_categories c on c.id = i.category_id where i.id = glue), 'Tools');
  perform t.ok('import: stock moved through adjust_inventory with an audit reason',
    (select count(*) from public.activity_logs where entity_id = glue and action = 'stock.adjusted'
       and details ->> 'reason' like 'Audit import components-audit-2026-10-12: small components row 30 (No. 30, "Gluegun-60W") - counted 12/10') = 3);
  perform t.eq('import: record marked applied and linked',
    (select status || '/' || (item_id = glue)::text from public.inventory_source_records where id = r_glue), 'applied/true');
  perform t.throws('import: a row cannot be applied twice', adm,
    format('select public.admin_apply_source_record(%L,null,1,1,false)::text', r_glue), '%already been applied%');
  perform t.eq('import: lab-use item shows 0 requestable', t.as_run(stu, format('select requestable_qty::text from public.inventory_overview where id = %L', glue)), '0');
  perform t.throws('import: students cannot request a lab-use-only item', stu,
    format('select public.create_borrow_request(null,''Need a glue gun'',null,%L,%L,%L)::text', public.lab_today(), public.lab_today() + 2,
           jsonb_build_array(jsonb_build_object('item_id', glue, 'qty', 1))::text), '%lab only%');
  perform t.throws('import: negative quantities rejected', adm,
    format('select public.admin_apply_source_record(%L,null,-1,0,true)::text',
           (select id from public.inventory_source_records where batch_key = batch and original_name = 'Flame Sensor')), '%zero or more%');

  -- ---- apply onto an existing item that has reserved stock
  select * into soil_before from public.inventory_items where name = 'Soil Moisture Sensor';
  soil := soil_before.id;
  req := t.as_run(stu, format('select public.create_borrow_request(null,''Plant monitor build'',null,%L,%L,%L)::text',
           public.lab_today(), public.lab_today() + 3, jsonb_build_array(jsonb_build_object('item_id', soil, 'qty', 2))::text))::uuid;
  perform t.as_run(adm, format('select public.approve_request(%L)::text', req));
  select id into r_soil from public.inventory_source_records where batch_key = batch and original_name = 'Soil sensor';
  perform t.eq('import: review suggests the existing item',
    t.as_run(adm, format('select suggested_item_id::text from public.inventory_source_review where id = %L', r_soil)), soil::text);
  perform t.succeeds('import: apply to existing item', adm,
    format('select public.admin_apply_source_record(%L,%L,3,0,true)::text', r_soil, soil));
  select * into soil_after from public.inventory_items where id = soil;
  perform t.eq('import: existing item keeps its id and reserved stock (available/reserved/borrowed)',
    soil_after.available_qty || '/' || soil_after.reserved_qty || '/' || soil_after.borrowed_qty, '3/2/0');
  perform t.eq('import: total = available + reserved after apply', soil_after.total_qty::text, '5');
  perform t.ok('import: project link kept', exists (select 1 from public.project_components where item_id = soil));
  perform t.throws('import: one item cannot take two rows of the same audit', adm,
    format('select public.admin_apply_source_record(%L,%L,1,0,true)::text',
           (select id from public.inventory_source_records where batch_key = batch and original_name = 'Rain Sensor'), soil), '%already linked%');

  -- revert puts it back; reserved untouched
  perform t.succeeds('import: revert an applied row', adm, format('select public.admin_revert_source_record(%L,''linked wrong item'')::text', r_soil));
  perform t.eq('import: revert restores available, keeps reserved',
    (select available_qty || '/' || reserved_qty from public.inventory_items where id = soil), (soil_before.available_qty - 2) || '/2');
  perform t.eq('import: reverted row returns to its previous status', (select status from public.inventory_source_records where id = r_soil), 'ready');
  perform t.succeeds('import: re-apply after revert', adm, format('select public.admin_apply_source_record(%L,%L,3,0,true)::text', r_soil, soil));
  perform t.as_run(adm, format('select public.adjust_inventory(%L,''add_stock'',1,''found one more'')::text', soil));
  perform t.throws('import: revert refused after later stock changes', adm,
    format('select public.admin_revert_source_record(%L,''undo'')::text', r_soil), '%changed since%');

  -- making an item lab-use only blocks approving older pending requests
  select id into piezo from public.inventory_items where name = 'Piezo Buzzer';
  req2 := t.as_run(stu, format('select public.create_borrow_request(null,''Alarm build'',null,%L,%L,%L)::text',
           public.lab_today(), public.lab_today() + 3, jsonb_build_array(jsonb_build_object('item_id', piezo, 'qty', 1))::text))::uuid;
  perform t.as_run(adm, format('update public.inventory_items set is_requestable = false where id = %L returning 1', piezo));
  perform t.throws('import: cannot approve a request for a lab-use-only item', adm,
    format('select public.approve_request(%L)::text', req2), '%not available for borrowing%');
  perform t.as_run(stu, format('update public.inventory_items set is_requestable = true where id = %L returning 1', piezo));
  perform t.eq('import: students cannot change is_requestable', (select is_requestable::text from public.inventory_items where id = piezo), 'false');
  perform t.as_run(adm, format('update public.inventory_items set is_requestable = true where id = %L returning 1', piezo));

  -- readiness (0009): lab-use-only stock counts for in-lab builds, but is flagged as not borrowable
  select pc.project_id into plant from public.project_components pc where pc.item_id = soil limit 1;
  perform t.as_run(adm, format('update public.inventory_items set is_requestable = false where id = %L returning 1', soil));
  perform t.eq('import: lab-use-only item still counts toward readiness, flagged not borrowable',
    (select (available_qty = (select available_qty from public.inventory_items where id = soil))::text || '/' || item_requestable::text
       from public.project_component_status where project_id = plant and item_id = soil), 'true/false');
  perform t.as_run(adm, format('update public.inventory_items set is_requestable = true where id = %L returning 1', soil));

  -- ---- skip and reopen
  select id into r_skip from public.inventory_source_records where batch_key = batch and original_name = 'Walking Stick';
  perform t.throws('import: skipping needs a reason', adm, format('select public.admin_skip_source_record(%L,'''')::text', r_skip), '%reason%');
  perform t.succeeds('import: skip a row', adm, format('select public.admin_skip_source_record(%L,''project prototype, not stock'')::text', r_skip));
  perform t.succeeds('import: reopen a skipped row', adm, format('select public.admin_revert_source_record(%L,''changed my mind'')::text', r_skip));
  perform t.eq('import: reopened row back to review', (select status from public.inventory_source_records where id = r_skip), 'needs_review');

  -- ---- bulk apply of reconciled rows (only rows with no possible match)
  n_ready := (select count(*) from public.inventory_source_review where batch_key = batch and status = 'ready' and suggested_item_id is null);
  perform t.eq('import: bulk apply count', t.as_run(adm, format('select public.admin_apply_ready_source_records(%L)::text', batch)), n_ready::text);
  perform t.ok('import: rows with a possible match left for review',
    exists (select 1 from public.inventory_source_records where batch_key = batch and status = 'ready'));
  perform t.eq('import: bulk apply is idempotent', t.as_run(adm, format('select public.admin_apply_ready_source_records(%L)::text', batch)), '0');
  perform t.ok('import: bulk-applied stock matches source available',
    not exists (select 1 from public.inventory_source_records r join public.inventory_items i on i.id = r.item_id
                 where r.status = 'applied' and r.applied_values ->> 'note' = 'bulk apply of reconciled rows'
                   and (i.available_qty <> r.qty_available_reported or i.damaged_qty <> 0)));

  -- ---- retire demo inventory: archive, never delete; busy items stay
  n_items_before := (select count(*) from public.inventory_items);
  perform t.as_run(adm, 'select public.admin_retire_demo_inventory(false)::text');
  perform t.eq('import: no item rows deleted', (select count(*)::text from public.inventory_items), n_items_before::text);
  perform t.ok('import: demo item with reserved stock not archived', not (select is_archived from public.inventory_items where id = soil));
  perform t.ok('import: idle demo items archived',
    not exists (select 1 from public.inventory_items where is_demo and not is_archived and reserved_qty = 0 and borrowed_qty = 0
                 and id not in (select item_id from public.inventory_source_records where status = 'applied' and item_id is not null)));
  perform t.ok('import: imported items untouched by retire', not (select is_archived from public.inventory_items where id = glue));

  -- ---- invariants
  perform t.ok('import: stock invariant holds everywhere',
    not exists (select 1 from public.inventory_items
                 where total_qty <> available_qty + reserved_qty + borrowed_qty + damaged_qty + lost_qty));
end
$imp$;
