-- Project catalogue (0009 + import/project_catalogue_2026-10). Run by run_catalogue_tests.sh after the
-- audit inventory has been applied and load_catalogue.sql has run.
do $cat$
declare
  stu uuid; adm uuid; b text := 'project-catalogue-2026-10';
  flame_proj uuid; flame uuid; smorphi_proj uuid; smorphi uuid; req uuid; p1 uuid; st text;
begin
  stu := t.mkuser('cat.student@srmist.edu.in', 'Catalogue Student');
  select id into adm from public.profiles where role = 'admin' order by created_at limit 1;

  -- ---- catalogue replaced
  perform t.eq('catalogue: 40 published catalogue projects',
    (select count(*)::text from public.projects where catalogue_key like b || ':%' and status = 'published'), '40');
  perform t.eq('catalogue: no other active projects',
    (select count(*)::text from public.projects where catalogue_key is null and status <> 'archived'), '0');
  perform t.eq('catalogue: old projects archived, not deleted (9 demo rows kept)',
    (select count(*)::text from public.projects where catalogue_key is null), '9');
  perform t.ok('catalogue: previous statuses saved for rollback',
    (select count(*) from public.project_status_backup where batch_key = b) = 9
    and exists (select 1 from public.project_status_backup where batch_key = b and previous_status = 'published'));
  perform t.eq('catalogue: unique slugs', (select count(distinct slug)::text from public.projects), (select count(*)::text from public.projects));

  -- ---- content and images
  perform t.ok('catalogue: every project has image, alt text, description, objectives, steps, testing and safety',
    not exists (select 1 from public.projects where catalogue_key like b || ':%' and (
      image_path is null or image_path !~ '^/projects/[a-z0-9-]+\.svg$' or coalesce(image_alt, '') = ''
      or coalesce(description, '') = '' or cardinality(objectives) = 0 or coalesce(instructions, '') = ''
      or cardinality(testing_steps) = 0 or cardinality(safety_notes) = 0 or cardinality(prerequisites) = 0
      or cardinality(hardware_software) = 0 or coalesce(expected_outcome, '') = '' or est_hours_min is null)));
  perform t.eq('catalogue: every project has a different image',
    (select count(distinct image_path)::text from public.projects where catalogue_key like b || ':%'), '40');

  -- ---- inventory mapping
  perform t.eq('catalogue: 183 requirement lines linked', (select count(*)::text from public.project_components pc
     join public.projects p on p.id = pc.project_id where p.catalogue_key like b || ':%'), '183');
  perform t.ok('catalogue: every requirement points at an active audited inventory item',
    not exists (select 1 from public.project_components pc join public.projects p on p.id = pc.project_id
                 join public.inventory_items i on i.id = pc.item_id
                 where p.catalogue_key like b || ':%'
                   and (i.is_archived or not exists (select 1 from public.inventory_source_records s where s.item_id = i.id and s.status = 'applied'))));
  perform t.eq('catalogue: availability statuses at audit stock (20 available, 10 external, 10 verification)',
    (select string_agg(availability_status || '=' || n, ',' order by availability_status) from (
       select availability_status, count(*) n from public.get_ranked_projects() where status = 'published' group by 1) x),
    'available=20,requires_external=10,requires_verification=10');

  -- ---- live availability: reserved and damaged units are not available
  select p.id into flame_proj from public.projects p where p.catalogue_key = b || ':12';
  select id into flame from public.inventory_items where name = 'Flame Sensor' and not is_archived;
  req := t.as_run(stu, format('select public.create_borrow_request(null,''Fire alarm build'',null,%L,%L,%L)::text',
           public.lab_today(), public.lab_today() + 3, jsonb_build_array(jsonb_build_object('item_id', flame, 'qty', 1))::text))::uuid;
  perform t.eq('catalogue: pending request does not change availability',
    (select availability_status from public.get_ranked_projects() where id = flame_proj), 'available');
  perform t.as_run(adm, format('select public.approve_request(%L)::text', req));
  perform t.eq('catalogue: reserved unit makes the project partially available',
    (select availability_status from public.get_ranked_projects() where id = flame_proj), 'partially_available');
  perform t.as_run(adm, format('select public.cancel_borrow_request(%L)::text', req));
  perform t.as_run(adm, format('select public.adjust_inventory(%L,''mark_damaged'',1,''sensor cracked'')::text', flame));
  perform t.eq('catalogue: damaged unit is not counted as available',
    (select availability_status from public.get_ranked_projects() where id = flame_proj), 'partially_available');
  perform t.as_run(adm, format('select public.adjust_inventory(%L,''repair_damaged'',1,''repaired'')::text', flame));
  perform t.eq('catalogue: repaired unit makes it available again',
    (select availability_status from public.get_ranked_projects() where id = flame_proj), 'available');

  -- ---- lab-use equipment: counts for in-lab builds, still cannot be borrowed
  select p.id into smorphi_proj from public.projects p where p.catalogue_key = b || ':05';
  select pc.item_id into smorphi from public.project_components pc where pc.project_id = smorphi_proj;
  perform t.eq('catalogue: lab-use platform project is available to build in the lab',
    (select availability_status from public.get_ranked_projects() where id = smorphi_proj), 'available');
  perform t.eq('catalogue: component flagged as not borrowable',
    (select item_requestable::text from public.project_component_status where project_id = smorphi_proj), 'false');
  perform t.throws('catalogue: students still cannot request lab-use equipment', stu,
    format('select public.create_borrow_request(null,''Smorphi please'',null,%L,%L,%L)::text', public.lab_today(), public.lab_today() + 2,
           jsonb_build_array(jsonb_build_object('item_id', smorphi, 'qty', 1))::text), '%lab only%');

  -- ---- permissions
  perform t.eq('catalogue: students see the 40 published projects', t.as_run(stu, 'select count(*)::text from public.get_ranked_projects()'), '40');
  perform t.eq('catalogue: students cannot see archived projects',
    t.as_run(stu, 'select count(*)::text from public.projects where status = ''archived'''), '0');
  select id into p1 from public.projects where catalogue_key = b || ':01';
  perform t.as_run(stu, format('update public.projects set name = ''hacked'' where id = %L returning 1', p1));
  perform t.eq('catalogue: students cannot edit projects', (select name from public.projects where id = p1), 'Obstacle-Avoiding Robot');
  perform t.throws('catalogue: students cannot change requirements', stu,
    format('insert into public.project_components (project_id, item_id, qty_required) values (%L, %L, 1) returning 1', p1, flame), '%row-level security%');
  perform t.eq('catalogue: students cannot read the rollback backup', t.as_run(stu, 'select count(*)::text from public.project_status_backup'), '0');
  perform t.eq('catalogue: students get nothing from component demand', t.as_run(stu, 'select count(*)::text from public.component_demand'), '0');
  perform t.ok('catalogue: admins see shared components (Arduino Uno in many projects)',
    t.as_run(adm, 'select max(projects_count)::text from public.component_demand')::int >= 20);

  -- ---- requirement changes never touch stock
  st := (select string_agg(id || ':' || total_qty || '/' || available_qty, ',' order by id) from public.inventory_items);
  perform t.as_run(adm, format('update public.project_components set qty_required = 9 where project_id = %L and item_id = (select item_id from public.project_components where project_id = %L limit 1) returning 1', p1, p1));
  perform t.eq('catalogue: editing requirements does not change stock',
    (select string_agg(id || ':' || total_qty || '/' || available_qty, ',' order by id) from public.inventory_items), st);

  -- ---- archive / restore
  perform t.as_run(adm, format('update public.projects set status = ''archived'' where id = %L returning 1', p1));
  perform t.eq('catalogue: archived project hidden from students', t.as_run(stu, format('select count(*)::text from public.get_ranked_projects() where id = %L', p1)), '0');
  perform t.as_run(adm, format('update public.projects set status = ''published'' where id = %L returning 1', p1));
  perform t.eq('catalogue: restored project visible again', t.as_run(stu, format('select count(*)::text from public.get_ranked_projects() where id = %L', p1)), '1');
end
$cat$;
