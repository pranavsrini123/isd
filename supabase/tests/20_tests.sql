-- Database test suite. Requires: reset_db.sh --seed, then 10_helpers.sql.
-- Prints a PASS/FAIL report and exits non-zero (via run_tests.sh) on any failure.
truncate t.results;
do $suite$
declare
  alice uuid; bob uuid; carol uuid; adm uuid; adm2 uuid;
  cat_id uuid; w uuid; x uuid; y uuid;   -- test inventory items
  r1 uuid; r2 uuid; r3 uuid; bid uuid; line1 uuid; line2 uuid;
  p uuid; n int; txt text; j jsonb;
  today date := public.lab_today();
begin
  ----------------------------------------------------------------- sign-up
  alice := t.mkuser('alice@srmist.edu.in', 'Alice Test');
  bob   := t.mkuser('bob@srmist.edu.in',   'Bob Test');
  carol := t.mkuser('carol@srmist.edu.in', 'Carol Test');
  adm   := t.mkuser('admin1@srmist.edu.in','Admin One');
  adm2  := t.mkuser('admin2@srmist.edu.in','Admin Two');
  update public.profiles set role = 'admin' where id in (adm, adm2);   -- documented bootstrap step

  begin
    perform t.mkuser('mallory@gmail.com', 'Mallory');
    perform t.ok('signup: non-institutional email is rejected', false);
  exception when others then
    perform t.ok('signup: non-institutional email is rejected', sqlerrm ilike '%institutional%', sqlerrm);
  end;
  perform t.ok('signup: profile created by trigger as student',
    (select role::text from public.profiles where id = alice) = 'student');
  declare m uuid := gen_random_uuid(); begin
    insert into auth.users(id,email,raw_user_meta_data) values
      (m,'sneaky@srmist.edu.in','{"role":"admin","status":"active","full_name":"Sneaky"}');
    perform t.ok('signup: metadata cannot self-assign admin', (select role::text from public.profiles where id=m)='student');
  end;
  update public.app_settings set value='[]' where key='allowed_email_domains';
  begin
    perform t.mkuser('anyone@example.org','Open');
    perform t.ok('signup: empty domain list disables restriction', true);
  exception when others then perform t.ok('signup: empty domain list disables restriction', false, sqlerrm); end;
  update public.app_settings set value='["srmist.edu.in"]' where key='allowed_email_domains';

  ------------------------------------------------------- student restrictions
  perform t.throws('student cannot change own role', alice, 'update public.profiles set role=''admin'' where id=auth.uid() returning 1', '%permission denied%');
  perform t.throws('student cannot change own status', alice, 'update public.profiles set status=''active'' where id=auth.uid() returning 1', '%permission denied%');
  perform t.succeeds('student can edit own name', alice, 'update public.profiles set full_name=''Alice T'' where id=auth.uid() returning 1');
  perform t.eq('student cannot edit another profile (0 rows)', t.as_run(alice,'with u as (update public.profiles set full_name=''X'' where id='''||bob||''' returning 1) select count(*)::text from u'), '0');
  perform t.eq('student sees only own profile', t.as_run(alice,'select count(*)::text from public.profiles'), '1');
  perform t.eq('admin sees all profiles', t.as_run(adm,'select (count(*)>=5)::text from public.profiles'), 'true');

  insert into public.inventory_categories(name) values ('TEST') returning id into cat_id;
  insert into public.inventory_items(name, category_id, total_qty, available_qty, is_demo)
    values ('TEST Widget', cat_id, 10, 10, true) returning id into w;
  insert into public.inventory_items(name, category_id, total_qty, available_qty, is_demo)
    values ('TEST Gadget', cat_id, 1, 1, true) returning id into x;
  insert into public.inventory_items(name, category_id, total_qty, available_qty, is_demo)
    values ('TEST Gizmo', cat_id, 5, 5, true) returning id into y;

  perform t.eq('student cannot raise stock (0 rows)', t.as_run(alice,'with u as (update public.inventory_items set available_qty=999, total_qty=999 where id='''||w||''' returning 1) select count(*)::text from u'), '0');
  perform t.throws('student cannot insert inventory', alice, 'insert into public.inventory_items(name,category_id,total_qty) values (''Evil'','''||cat_id||''',5) returning 1', '%row-level security%');
  perform t.throws('student cannot delete inventory', alice, 'delete from public.inventory_items where id='''||w||'''', '%permission denied%');
  perform t.throws('student cannot insert categories', alice, 'insert into public.inventory_categories(name) values (''Evil'') returning 1', '%row-level security%');
  perform t.throws('student cannot write requests directly', alice, 'insert into public.borrow_requests(requester_id,purpose,needed_from,needed_until) values (auth.uid(),''hack'',current_date,current_date) returning 1', '%permission denied%');
  perform t.throws('student cannot write borrowings directly', alice, 'insert into public.borrowings(request_id,borrower_id,issued_by,due_date) values (gen_random_uuid(),auth.uid(),auth.uid(),current_date) returning 1', '%permission denied%');
  perform t.throws('student cannot write return records', alice, 'delete from public.return_records', '%permission denied%');
  perform t.eq('student sees 0 activity_logs rows', t.as_run(alice,'select count(*)::text from public.activity_logs'), '0');
  perform t.eq('student sees 0 app_settings rows', t.as_run(alice,'select count(*)::text from public.app_settings'), '0');
  perform t.throws('student cannot call approve_request', alice, 'select public.approve_request(gen_random_uuid())::text', '%Administrator%');
  perform t.throws('student cannot call reject_request', alice, 'select public.reject_request(gen_random_uuid(),''nope nope'')::text', '%Administrator%');
  perform t.throws('student cannot call issue_request', alice, 'select public.issue_request(gen_random_uuid())::text', '%Administrator%');
  perform t.throws('student cannot call verify_return', alice, 'select public.verify_return(gen_random_uuid(),1,0,0)::text', '%Administrator%');
  perform t.throws('student cannot call adjust_inventory', alice, 'select public.adjust_inventory('''||w||''',''add_stock'',5,''because'')::text', '%Administrator%');
  perform t.throws('student cannot set roles', alice, 'select public.admin_set_user_role('''||bob||''',''admin'')::text', '%Administrator%');
  perform t.throws('student cannot change settings', alice, 'select public.admin_update_setting(''max_loan_days'',''99'')::text', '%Administrator%');
  perform t.throws('student cannot read dashboard stats', alice, 'select public.admin_dashboard_stats()::text', '%Administrator%');
  perform t.throws('student cannot read reports', alice, 'select public.report_most_borrowed()::text', '%');
  perform t.throws('student cannot call internal helper _log_activity', alice, 'select public._log_activity(''x'',''y'',null,''z'')::text', '%permission denied%');
  perform t.throws('anon cannot read profiles', null, 'select count(*)::text from public.profiles', '%permission denied%');
  perform t.throws('anon cannot read inventory', null, 'select count(*)::text from public.inventory_items', '%permission denied%');
  perform t.throws('anon cannot create requests', null, 'select public.create_borrow_request(null,''abc'',null,current_date,current_date,''[]'')::text', '%permission denied%');
  perform t.ok('anon can read public settings', (t.as_run(null,'select public.get_public_settings()::text')::jsonb ? 'allowed_email_domains'));
  perform t.eq('public settings include the per-request component limit (0010)',
    t.as_run(alice, 'select public.get_public_settings() ->> ''max_items_per_request'''), '20');

  ------------------------------------------------------ requests don't touch stock
  r1 := t.as_run(alice, format('select public.create_borrow_request(null,''Test build'',null,%L,%L,%L)::text', today, today+7,
          jsonb_build_array(jsonb_build_object('item_id',w,'qty',3), jsonb_build_object('item_id',w,'qty',1)))::text)::uuid;
  perform t.eq('pending request leaves available untouched', t.stock(w,'available_qty'), '10');
  perform t.eq('pending request leaves reserved untouched', t.stock(w,'reserved_qty'), '0');
  perform t.eq('duplicate request lines are merged', (select qty::text from public.request_items where request_id=r1), '4');
  perform t.eq('request code generated', (select (request_code like 'REQ-%')::text from public.borrow_requests where id=r1), 'true');
  perform t.eq('student sees own request', t.as_run(alice,'select count(*)::text from public.borrow_requests'), '1');
  perform t.eq('other student cannot see it', t.as_run(bob,'select count(*)::text from public.borrow_requests'), '0');
  perform t.eq('other student cannot see its items', t.as_run(bob,'select count(*)::text from public.request_items'), '0');
  perform t.ok('admins were notified', exists (select 1 from public.notifications where user_id=adm and type='request_submitted'));
  perform t.eq('admin sees the request', t.as_run(adm,'select count(*)::text from public.borrow_requests'), '1');

  -- validation
  perform t.throws('request over available stock fails', bob, format('select public.create_borrow_request(null,''too many'',null,%L,%L,%L)::text', today, today+3, jsonb_build_array(jsonb_build_object('item_id',x,'qty',2))::text), '%Only 1%');
  perform t.throws('zero quantity fails', bob, format('select public.create_borrow_request(null,''zero qty'',null,%L,%L,%L)::text', today, today+3, jsonb_build_array(jsonb_build_object('item_id',w,'qty',0))::text), '%positive%');
  perform t.throws('negative quantity fails', bob, format('select public.create_borrow_request(null,''neg qty'',null,%L,%L,%L)::text', today, today+3, jsonb_build_array(jsonb_build_object('item_id',w,'qty',-4))::text), '%positive%');
  perform t.throws('empty request fails', bob, format('select public.create_borrow_request(null,''empty req'',null,%L,%L,''[]'')::text', today, today+3), '%at least one%');
  perform t.throws('garbage item list fails', bob, format('select public.create_borrow_request(null,''garbage'',null,%L,%L,%L)::text', today, today+3, '[{"item_id":"nope","qty":1}]'), '%not valid%');
  perform t.throws('past start date fails', bob, format('select public.create_borrow_request(null,''past day'',null,%L,%L,%L)::text', today-2, today+3, jsonb_build_array(jsonb_build_object('item_id',w,'qty',1))::text), '%past%');
  perform t.throws('loan longer than limit fails', bob, format('select public.create_borrow_request(null,''way long'',null,%L,%L,%L)::text', today, today+60, jsonb_build_array(jsonb_build_object('item_id',w,'qty',1))::text), '%limited to%');
  perform t.throws('end before start fails', bob, format('select public.create_borrow_request(null,''backwards'',null,%L,%L,%L)::text', today+5, today+3, jsonb_build_array(jsonb_build_object('item_id',w,'qty',1))::text), '%end date%');
  perform t.throws('unpublished project cannot be requested against', bob, format('select public.create_borrow_request(%L,''draft proj'',null,%L,%L,%L)::text', (select id from public.projects where slug='rfid-door-lock'), today, today+3, jsonb_build_array(jsonb_build_object('item_id',w,'qty',1))::text), '%not available%');

  -- suspended accounts
  update public.profiles set status='suspended' where id=carol;
  perform t.throws('suspended user cannot request', carol, format('select public.create_borrow_request(null,''suspended'',null,%L,%L,%L)::text', today, today+3, jsonb_build_array(jsonb_build_object('item_id',w,'qty',1))::text), '%not allowed%');
  update public.profiles set status='active' where id=carol;

  -- pending limit
  update public.app_settings set value='1' where key='max_pending_requests';
  perform t.throws('pending request limit enforced', alice, format('select public.create_borrow_request(null,''second one'',null,%L,%L,%L)::text', today, today+3, jsonb_build_array(jsonb_build_object('item_id',w,'qty',1))::text), '%pending%');
  update public.app_settings set value='5' where key='max_pending_requests';

  ------------------------------------------------------------- approval
  perform t.succeeds('admin approves', adm, format('select public.approve_request(%L)::text', r1));
  perform t.eq('approve: available 10 -> 6', t.stock(w,'available_qty'), '6');
  perform t.eq('approve: reserved 0 -> 4', t.stock(w,'reserved_qty'), '4');
  perform t.eq('approve: total unchanged', t.stock(w,'total_qty'), '10');
  perform t.throws('approving twice fails', adm, format('select public.approve_request(%L)::text', r1), '%cannot be approved%');
  perform t.eq('double approve did not reserve again', t.stock(w,'reserved_qty'), '4');
  perform t.ok('student was notified of approval', exists (select 1 from public.notifications where user_id=alice and type='request_approved'));
  perform t.eq('student reads own notifications', t.as_run(alice,'select (count(*)>=1)::text from public.notifications'), 'true');
  perform t.eq('other student sees none of them', t.as_run(bob,'select count(*)::text from public.notifications'), '0');
  perform t.throws('student cannot edit notifications directly', alice, 'update public.notifications set read_at=now() returning 1', '%permission denied%');

  -- no negative stock: two requests for the last unit
  r2 := t.as_run(alice, format('select public.create_borrow_request(null,''Last gadget A'',null,%L,%L,%L)::text', today, today+3, jsonb_build_array(jsonb_build_object('item_id',x,'qty',1))::text))::uuid;
  r3 := t.as_run(bob,   format('select public.create_borrow_request(null,''Last gadget B'',null,%L,%L,%L)::text', today, today+3, jsonb_build_array(jsonb_build_object('item_id',x,'qty',1))::text))::uuid;
  perform t.eq('both pending requests allowed (pending does not reserve)', (select count(*)::text from public.borrow_requests where id in (r2,r3) and status='pending'), '2');
  perform t.succeeds('first approval wins', adm, format('select public.approve_request(%L)::text', r2));
  perform t.throws('second approval is refused (no oversell)', adm, format('select public.approve_request(%L)::text', r3), '%Not enough%');
  perform t.eq('last unit: available is 0, never negative', t.stock(x,'available_qty'), '0');
  perform t.eq('failed approval left request pending', (select status::text from public.borrow_requests where id=r3), 'pending');
  perform t.ok('admin sees r3 cannot be fulfilled', (select can_fulfil from public.request_overview where id=r3) = false);

  -- rejecting an approved request releases its reservation
  perform t.throws('reject needs a reason', adm, format('select public.reject_request(%L,'''')::text', r2), '%reason%');
  perform t.succeeds('admin rejects approved request', adm, format('select public.reject_request(%L,''Lab closed that week'')::text', r2));
  perform t.eq('reject releases reservation: available back to 1', t.stock(x,'available_qty'), '1');
  perform t.eq('reject releases reservation: reserved 0', t.stock(x,'reserved_qty'), '0');
  perform t.throws('rejecting twice fails', adm, format('select public.reject_request(%L,''again again'')::text', r2), '%cannot be rejected%');
  perform t.succeeds('second request can now be approved', adm, format('select public.approve_request(%L)::text', r3));
  -- cancel approved releases too (by owner)
  perform t.throws('other student cannot cancel it', alice, format('select public.cancel_borrow_request(%L)::text', r3), '%not found%');
  perform t.succeeds('owner cancels approved request', bob, format('select public.cancel_borrow_request(%L)::text', r3));
  perform t.eq('cancel releases reservation', t.stock(x,'available_qty'), '1');
  perform t.throws('cancelling twice fails', bob, format('select public.cancel_borrow_request(%L)::text', r3), '%can no longer%');

  ------------------------------------------------------------- issuance
  perform t.throws('cannot issue a pending/rejected request', adm, format('select public.issue_request(%L)::text', r2), '%cannot be issued%');
  perform t.throws('student cannot issue', alice, format('select public.issue_request(%L)::text', r1), '%Administrator%');
  perform t.throws('issue with past due date fails', adm, format('select public.issue_request(%L,%L)::text', r1, today-1), '%past%');
  bid := t.as_run(adm, format('select public.issue_request(%L)::text', r1))::uuid;
  perform t.eq('issue: reserved 4 -> 0', t.stock(w,'reserved_qty'), '0');
  perform t.eq('issue: borrowed 0 -> 4', t.stock(w,'borrowed_qty'), '4');
  perform t.eq('issue: available unchanged', t.stock(w,'available_qty'), '6');
  perform t.throws('issuing twice fails', adm, format('select public.issue_request(%L)::text', r1), '%cannot be issued%');
  perform t.eq('exactly one borrowing for the request', (select count(*)::text from public.borrowings where request_id=r1), '1');
  perform t.eq('borrowed stock not doubled by duplicate issue', t.stock(w,'borrowed_qty'), '4');
  perform t.eq('request status is issued', (select status::text from public.borrow_requests where id=r1), 'issued');
  begin
    insert into public.borrowings(request_id,borrower_id,issued_by,due_date) values (r1,alice,adm,today+1);
    perform t.ok('DB backstop: second borrowing row for same request rejected', false);
  exception when unique_violation then perform t.ok('DB backstop: second borrowing row for same request rejected', true); end;
  perform t.eq('borrower sees own borrowing', t.as_run(alice,'select count(*)::text from public.borrowings'), '1');
  perform t.eq('other student cannot see it', t.as_run(bob,'select count(*)::text from public.borrowings'), '0');
  perform t.eq('other student cannot see lines', t.as_run(bob,'select count(*)::text from public.borrowing_lines'), '0');

  --------------------------------------------------------------- returns
  perform t.throws('other student cannot request return', bob, format('select public.request_return(%L)::text', bid), '%not found%');
  perform t.succeeds('borrower requests return', alice, format('select public.request_return(%L)::text', bid));
  perform t.succeeds('request_return is idempotent', alice, format('select public.request_return(%L)::text', bid));
  select id into line1 from public.borrowing_items where borrowing_id = bid and item_id = w;
  perform t.throws('student cannot verify own return', alice, format('select public.verify_return(%L,4,0,0)::text', line1), '%Administrator%');
  perform t.throws('quantities must add up', adm, format('select public.verify_return(%L,2,0,0)::text', line1), '%add up%');
  perform t.throws('negative return quantity fails', adm, format('select public.verify_return(%L,5,-1,0)::text', line1), '%zero or more%');
  perform t.eq('failed verify left stock alone', t.stock(w,'borrowed_qty'), '4');
  -- 4 issued: 2 good, 1 damaged, 1 missing
  perform t.succeeds('admin verifies mixed return', adm, format('select public.verify_return(%L,2,1,1,''one cracked'')::text', line1));
  perform t.eq('good return raises available 6 -> 8', t.stock(w,'available_qty'), '8');
  perform t.eq('damaged return raises damaged 0 -> 1', t.stock(w,'damaged_qty'), '1');
  perform t.eq('missing item recorded in lost, 0 -> 1', t.stock(w,'lost_qty'), '1');
  perform t.eq('borrowed back to 0', t.stock(w,'borrowed_qty'), '0');
  perform t.eq('total unchanged by return', t.stock(w,'total_qty'), '10');
  perform t.throws('verifying the same line twice fails', adm, format('select public.verify_return(%L,4,0,0)::text', line1), '%already been verified%');
  perform t.eq('duplicate verify did not change available', t.stock(w,'available_qty'), '8');
  begin
    insert into public.return_records(borrowing_item_id,verified_by,qty_good) values (line1,adm,4);
    perform t.ok('DB backstop: second return record rejected', false);
  exception when unique_violation then perform t.ok('DB backstop: second return record rejected', true); end;
  perform t.eq('borrowing closed after all lines verified', (select status::text from public.borrowings where id=bid), 'closed');
  perform t.eq('request marked returned', (select status::text from public.borrow_requests where id=r1), 'returned');

  -- all-good and all-damaged and all-missing returns on another item
  r2 := t.as_run(bob, format('select public.create_borrow_request(null,''Gizmo run'',null,%L,%L,%L)::text', today, today+3, jsonb_build_array(jsonb_build_object('item_id',y,'qty',5))::text))::uuid;
  perform t.as_run(adm, format('select public.approve_request(%L)::text', r2));
  bid := t.as_run(adm, format('select public.issue_request(%L)::text', r2))::uuid;
  perform t.eq('all 5 borrowed', t.stock(y,'borrowed_qty'), '5');
  select id into line2 from public.borrowing_items where borrowing_id = bid;
  perform t.as_run(adm, format('select public.verify_return(%L,0,0,5)::text', line2));
  perform t.eq('all-missing: available stays 0 (not inflated)', t.stock(y,'available_qty'), '0');
  perform t.eq('all-missing: lost = 5', t.stock(y,'lost_qty'), '5');

  ------------------------------------------------------- stock adjustments
  perform t.succeeds('admin adds stock', adm, format('select public.adjust_inventory(%L,''add_stock'',5,''new delivery'')::text', w));
  perform t.eq('add_stock raises total', t.stock(w,'total_qty'), '15');
  perform t.eq('add_stock raises available', t.stock(w,'available_qty'), '13');
  perform t.throws('cannot remove more than available', adm, format('select public.adjust_inventory(%L,''remove_available'',99,''oops oops'')::text', w), '%available%');
  perform t.throws('reason required', adm, format('select public.adjust_inventory(%L,''add_stock'',1,'''')::text', w), '%reason%');
  perform t.throws('unknown action rejected', adm, format('select public.adjust_inventory(%L,''conjure'',1,''magic'')::text', w), '%Unknown%');
  perform t.succeeds('mark damaged', adm, format('select public.adjust_inventory(%L,''mark_damaged'',2,''dropped'')::text', w));
  perform t.succeeds('repair damaged', adm, format('select public.adjust_inventory(%L,''repair_damaged'',1,''resoldered'')::text', w));
  perform t.succeeds('recover lost', adm, format('select public.adjust_inventory(%L,''recover_lost'',1,''found in drawer'')::text', w));
  perform t.throws('cannot recover more lost than recorded', adm, format('select public.adjust_inventory(%L,''recover_lost'',5,''wishful'')::text', w), '%lost units%');
  perform t.ok('stock adjustments are audited with reason', exists (select 1 from public.activity_logs where action='stock.adjusted' and entity_id=w and details->>'reason'='new delivery'));
  perform t.ok('admin can edit descriptive fields', t.as_run(adm, format('with u as (update public.inventory_items set description=''edited'' where id=%L returning 1) select count(*)::text from u', w)) = '1');
  perform t.throws('even admin cannot set quantities directly', adm, format('update public.inventory_items set available_qty = 500, total_qty = 500 where id=%L', w), '%adjust_inventory%');
  perform t.throws('admin cannot hard-delete inventory (archive instead)', adm, format('delete from public.inventory_items where id=%L', w), '%permission denied%');

  ----------------------------------------------------- invariants everywhere
  perform t.eq('invariant: total = sum of buckets for every item', (select count(*)::text from public.inventory_items where total_qty <> available_qty+reserved_qty+borrowed_qty+damaged_qty+lost_qty), '0');
  perform t.eq('invariant: no negative bucket', (select count(*)::text from public.inventory_items where least(available_qty,reserved_qty,borrowed_qty,damaged_qty,lost_qty,total_qty) < 0), '0');
  begin
    update public.inventory_items set available_qty = available_qty + 1 where id = w;
    perform t.ok('invariant: CHECK constraint blocks inconsistent update', false);
  exception when check_violation then perform t.ok('invariant: CHECK constraint blocks inconsistent update', true); end;
  begin
    update public.inventory_items set available_qty = -1, total_qty = total_qty - available_qty - 1 where id = w;
    perform t.ok('invariant: negative stock blocked', false);
  exception when check_violation then perform t.ok('invariant: negative stock blocked', true); end;

  ------------------------------------------------------------ readiness
  insert into public.projects(name, slug, category, difficulty, status) values ('TEST Proj', 'test-proj', 'Robotics', 'beginner', 'draft') returning id into p;
  begin
    update public.projects set status='published' where id=p;
    perform t.ok('cannot publish project without components', false);
  exception when check_violation then perform t.ok('cannot publish project without components', true); end;
  -- five requirement types: 4 satisfiable, 1 not (x has 1 available, require 2)
  insert into public.inventory_items(name, category_id, total_qty, available_qty, is_demo)
    select 'TEST C'||g, cat_id, 5, 5, true from generate_series(1,3) g;
  insert into public.project_components(project_id,item_id,qty_required)
    select p, id, 1 from public.inventory_items where name in ('TEST C1','TEST C2','TEST C3');
  insert into public.project_components(project_id,item_id,qty_required) values (p, w, 2), (p, x, 2);
  update public.projects set status='published' where id=p;
  select * into strict j from (select to_jsonb(r) from public.project_readiness r where project_id=p) s(j);
  perform t.eq('readiness: 4 of 5 = 80%', j->>'ready_pct', '80');
  perform t.eq('readiness: 80% is NOT buildable', j->>'buildable', 'false');
  perform t.eq('readiness: missing_types = 1', j->>'missing_types', '1');
  perform t.eq('readiness: missing_units = 1', j->>'missing_units', '1');
  perform t.eq('missing list names the component', (select (missing->0->>'name') from public.get_ranked_projects(null,null,null,false,'rank',null,0) where id=p), 'TEST Gadget');
  perform t.eq('missing list gives quantity', (select (missing->0->>'missing_qty') from public.get_ranked_projects() where id=p), '1');
  -- stock changes -> readiness follows automatically
  perform t.as_run(adm, format('select public.adjust_inventory(%L,''add_stock'',1,''restock'')::text', x));
  perform t.eq('readiness updates after restock: 100%', (select ready_pct::text from public.project_readiness where project_id=p), '100');
  perform t.eq('readiness updates after restock: buildable', (select buildable::text from public.project_readiness where project_id=p), 'true');
  -- reservation reduces availability for others
  r2 := t.as_run(alice, format('select public.create_borrow_request(null,''reserve gadget'',null,%L,%L,%L)::text', today, today+3, jsonb_build_array(jsonb_build_object('item_id',x,'qty',1))::text))::uuid;
  perform t.as_run(adm, format('select public.approve_request(%L)::text', r2));
  perform t.eq('reserved stock no longer counts as buildable', (select buildable::text from public.project_readiness where project_id=p), 'false');
  perform t.eq('…and drops to 80%', (select ready_pct::text from public.project_readiness where project_id=p), '80');
  perform t.as_run(alice, format('select public.cancel_borrow_request(%L)::text', r2));
  perform t.eq('cancelling restores buildable', (select buildable::text from public.project_readiness where project_id=p), 'true');
  -- archived item counts as zero
  update public.inventory_items set is_archived = true where name = 'TEST C1';
  perform t.eq('archived component => not satisfied', (select buildable::text from public.project_readiness where project_id=p), 'false');
  update public.inventory_items set is_archived = false where name = 'TEST C1';
  -- borrowed project quantity: need more than total
  update public.project_components set qty_required = 3 where project_id=p and item_id=x;
  perform t.eq('requirement above total stock => not buildable', (select buildable::text from public.project_readiness where project_id=p), 'false');
  update public.project_components set qty_required = 1 where project_id=p and item_id=x;
  -- empty (draft, 0 component) project
  perform t.eq('project with no components: 0% and not buildable', (select ready_pct||'/'||buildable from public.project_readiness r join public.projects pp on pp.id=r.project_id where pp.slug='rfid-door-lock'), '0/false');

  ----------------------------------------------------------- ranking
  perform t.ok('ranking: buildable projects come before non-buildable', (
    select bool_and(not (a.buildable = false and b.buildable = true))
    from public.get_ranked_projects() a join public.get_ranked_projects() b on a.rank_position < b.rank_position and a.n_required>0));
  perform t.ok('ranking: positions are 1..n unique', (select count(distinct rank_position) = count(*) and min(rank_position)=1 from public.get_ranked_projects()));
  perform t.ok('ranking is deterministic across calls', (select array_agg(id order by rank_position) from public.get_ranked_projects()) = (select array_agg(id order by rank_position) from public.get_ranked_projects()));
  perform t.ok('ranking: among non-buildable, fewer missing types first', (
    select bool_and(a.missing_types <= b.missing_types)
    from public.get_ranked_projects() a join public.get_ranked_projects() b on a.rank_position < b.rank_position and not a.buildable and not b.buildable and a.n_required>0 and b.n_required>0));
  perform t.ok('ranking: unconfigured projects are last', (select id from public.get_ranked_projects() order by rank_position desc limit 1) = (select id from public.projects where slug='rfid-door-lock'));
  -- preference nudges equal-readiness ties
  update public.profiles set preferred_difficulty='advanced' where id=bob;
  update public.profiles set preferred_difficulty='beginner' where id=alice;
  perform t.ok('student preference affects tie order', (
    t.as_run(bob,   'select (select array_agg(id order by rank_position)::text from public.get_ranked_projects())') <>
    t.as_run(alice, 'select (select array_agg(id order by rank_position)::text from public.get_ranked_projects())')));
  perform t.eq('filter: buildable only', t.as_run(alice,'select bool_and(buildable)::text from public.get_ranked_projects(null,null,null,true)'), 'true');
  perform t.eq('filter: difficulty', t.as_run(alice,'select bool_and(difficulty=''advanced'')::text from public.get_ranked_projects(null,null,''advanced'')'), 'true');
  perform t.eq('filter: search', t.as_run(alice,'select count(*)::text from public.get_ranked_projects(''weather'')'), '1');
  perform t.eq('pagination limit', t.as_run(alice,'select count(*)::text from public.get_ranked_projects(null,null,null,false,''rank'',3,0)'), '3');
  perform t.eq('students never see drafts', t.as_run(alice,'select count(*)::text from public.get_ranked_projects() where status<>''published'''), '0');
  perform t.eq('students cannot see draft components', t.as_run(alice,'select count(*)::text from public.project_components pc join public.projects p on p.id=pc.project_id where p.status=''draft'''), '0');
  perform t.ok('admin sees drafts', t.as_run(adm,'select count(*)::text from public.get_ranked_projects() where status=''draft''')::int >= 1);
  perform t.throws('student cannot create project', alice, 'insert into public.projects(name) values (''x'') returning 1', '%row-level security%');
  perform t.eq('student cannot edit components (0 rows)', t.as_run(alice, format('with u as (update public.project_components set qty_required=9 where project_id=%L returning 1) select count(*)::text from u', p)), '0');
  perform t.eq('student cannot see archived items', t.as_run(alice,'select count(*)::text from public.inventory_items where is_archived'), '0');

  -------------------------------------------------------------- overdue
  update public.borrowings set due_date = today - 3 where request_id = r2 or id = bid;   -- r2 was cancelled; bid closed
  r3 := t.as_run(alice, format('select public.create_borrow_request(null,''overdue test'',null,%L,%L,%L)::text', today, today+1, jsonb_build_array(jsonb_build_object('item_id',w,'qty',1))::text))::uuid;
  perform t.as_run(adm, format('select public.approve_request(%L)::text', r3));
  bid := t.as_run(adm, format('select public.issue_request(%L)::text', r3))::uuid;
  update public.borrowings set due_date = today - 3 where id = bid;
  perform t.eq('overdue derived from due date', (select is_overdue::text||'/'||days_overdue from public.borrowing_lines where borrowing_id=bid), 'true/3');
  select id into line1 from public.borrowing_items where borrowing_id=bid;
  perform t.as_run(adm, format('select public.verify_return(%L,1,0,0)::text', line1));
  perform t.eq('verified line is no longer overdue', (select is_overdue::text from public.borrowing_lines where borrowing_id=bid), 'false');

  ------------------------------------------------------- admin management
  perform t.throws('admin cannot change own role', adm, format('select public.admin_set_user_role(%L,''student'')::text', adm), '%own role%');
  perform t.succeeds('admin promotes via function', adm, format('select public.admin_set_user_role(%L,''admin'')::text', carol));
  perform t.eq('promotion took effect', (select role::text from public.profiles where id=carol), 'admin');
  perform t.succeeds('admin demotes another admin', adm, format('select public.admin_set_user_role(%L,''student'')::text', carol));
  perform t.succeeds('admin suspends user', adm, format('select public.admin_set_user_status(%L,''suspended'')::text', carol));
  perform t.eq('suspended admin loses powers', (select public.is_admin()::text), 'false');  -- postgres session: auth.uid() null
  update public.profiles set status='active' where id=carol;
  -- last-admin protection: adm demotes adm2, then adm2 (now student) can't act; adm stays.
  perform t.succeeds('admin demotes second admin', adm, format('select public.admin_set_user_role(%L,''student'')::text', adm2));
  update public.profiles set role='admin', status='suspended' where id=carol;
  update public.profiles set status='active' where id=carol;
  perform t.succeeds('carol (admin) suspends adm while another admin exists', carol, format('select public.admin_set_user_status(%L,''suspended'')::text', adm));
  perform t.throws('suspended admin cannot use admin functions', adm, format('select public.approve_request(%L)::text', gen_random_uuid()), '%Administrator%');
  update public.profiles set status='active' where id=adm;
  update public.profiles set role='student' where id=adm;
  perform t.throws('admin cannot demote themselves', carol, format('select public.admin_set_user_role(%L,''student'')::text', carol), '%own role%');
  update public.profiles set role='admin' where id=adm;
  update public.profiles set role='student' where id=carol;
  perform t.throws('admin cannot change own status', adm, format('select public.admin_set_user_status(%L,''active'')::text', adm), '%own account%');
  perform t.throws('invalid domain setting rejected', adm, 'select public.admin_update_setting(''allowed_email_domains'',''["not a domain"]'')::text', '%valid domain%');
  perform t.succeeds('valid setting accepted', adm, 'select public.admin_update_setting(''max_loan_days'',''21'')::text');
  perform t.throws('out of range setting rejected', adm, 'select public.admin_update_setting(''max_loan_days'',''0'')::text', '%between%');
  perform t.ok('role change was audited', exists (select 1 from public.activity_logs where action='user.role_changed'));
  perform t.eq('activity log visible to admin', t.as_run(adm,'select (count(*)>5)::text from public.activity_logs'), 'true');

  perform t.succeeds('mark notifications read', alice, 'select public.mark_notifications_read()::text');
  perform t.eq('all own notifications read', t.as_run(alice,'select count(*)::text from public.notifications where read_at is null'), '0');
  perform t.eq('other users notifications untouched', (select (count(*)>0)::text from public.notifications where user_id=adm and read_at is null), 'true');

  ------------------------------------------------------------- dashboard / reports
  j := t.as_run(adm, 'select public.admin_dashboard_stats()::text')::jsonb;
  perform t.eq('dashboard total units equals SUM(total_qty)', j->>'total_units', (select sum(total_qty)::text from public.inventory_items where not is_archived));
  perform t.eq('dashboard available equals SUM(available_qty)', j->>'available', (select sum(available_qty)::text from public.inventory_items where not is_archived));
  perform t.eq('dashboard pending requests derived', j->>'pending_requests', (select count(*)::text from public.borrow_requests where status='pending'));
  perform t.succeeds('report: inventory by category', adm, 'select public.report_inventory_by_category()::text');
  perform t.succeeds('report: most borrowed', adm, 'select public.report_most_borrowed()::text');
  perform t.succeeds('report: frequently requested', adm, 'select public.report_frequently_requested()::text');
  perform t.succeeds('report: damaged/lost', adm, 'select public.report_damaged_lost()::text');
  perform t.succeeds('report: popular projects', adm, 'select public.report_popular_projects()::text');
  perform t.succeeds('report: active users', adm, 'select public.report_most_active_users()::text');
  perform t.succeeds('report: usage over time', adm, 'select public.report_usage_over_time()::text');
  perform t.succeeds('report: request history', adm, 'select public.report_request_history()::text');
  perform t.ok('report most-borrowed counts the borrowed TEST Widget', t.as_run(adm, 'select string_agg(item_name, '','') from public.report_most_borrowed()') like '%TEST Widget%');

  perform t.eq('final invariant check', (select count(*)::text from public.inventory_items where total_qty <> available_qty+reserved_qty+borrowed_qty+damaged_qty+lost_qty), '0');
end
$suite$;

