-- 0012: Super Admin / Admin separation, department, enquiries, component take-away.
-- Requires: reset_db.sh --seed, then 10_helpers.sql. Appends to t.results.
do $suite$
declare
  stu uuid; stu2 uuid; adm uuid; sup uuid; sup2 uuid; newbie uuid;
  item uuid; item2 uuid;
  req uuid; req2 uuid; bid uuid; line uuid;
  enq uuid; enq2 uuid; tka uuid; tka2 uuid;
  j jsonb; txt text; n int;
  today date := public.lab_today();
begin
  stu  := t.mkuser('r.student@srmist.edu.in', 'Role Student');
  stu2 := t.mkuser('r.other@srmist.edu.in',   'Other Student');
  adm  := t.mkuser('r.admin@srmist.edu.in',   'Lab Admin');
  sup  := t.mkuser('r.super@srmist.edu.in',   'Super Admin');
  sup2 := t.mkuser('r.super2@srmist.edu.in',  'Second Super');
  update public.profiles set role = 'admin'       where id = adm;
  update public.profiles set role = 'super_admin' where id in (sup, sup2);
  update public.profiles set srm_id = 'RA2311003010001', department = 'CTech' where id = stu;
  select id into item  from public.inventory_items where name = 'Piezo Buzzer';
  select id into item2 from public.inventory_items where not is_archived and id <> item and total_qty >= 2 order by name limit 1;

  ---------------------------------------------------------------- role helpers
  perform t.eq('roles: is_admin() is true for an admin', t.as_run(adm, 'select public.is_admin()::text'), 'true');
  perform t.eq('roles: is_admin() is true for a super admin', t.as_run(sup, 'select public.is_admin()::text'), 'true');
  perform t.eq('roles: admin is not a super admin', t.as_run(adm, 'select public.is_super_admin()::text'), 'false');
  perform t.eq('roles: super admin is a super admin', t.as_run(sup, 'select public.is_super_admin()::text'), 'true');
  perform t.eq('roles: student is neither', t.as_run(stu, 'select (public.is_admin() or public.is_super_admin())::text'), 'false');
  perform t.throws('roles: student cannot make themselves super admin', stu,
    'update public.profiles set role=''super_admin'' where id=auth.uid() returning 1', '%permission denied%');
  perform t.throws('roles: admin cannot make themselves super admin', adm,
    'update public.profiles set role=''super_admin'' where id=auth.uid() returning 1', '%permission denied%');
  declare m uuid := gen_random_uuid(); begin
    insert into auth.users(id,email,raw_user_meta_data) values
      (m,'sneaky2@srmist.edu.in','{"role":"super_admin","full_name":"Sneaky","department":"CTech"}');
    perform t.eq('roles: sign-up metadata cannot grant super admin', (select role::text from public.profiles where id=m), 'student');
  end;
  perform t.throws('roles: admin cannot change roles', adm,
    format('select public.admin_set_user_role(%L,''admin'')::text', stu), '%Super Admin privileges required%');
  perform t.throws('roles: admin cannot promote themselves through the function', adm,
    format('select public.admin_set_user_role(%L,''super_admin'')::text', adm), '%Super Admin privileges required%');
  perform t.succeeds('roles: super admin can make someone an admin', sup,
    format('select public.admin_set_user_role(%L,''admin'')::text', stu2));
  perform t.succeeds('roles: super admin can turn them back into a student', sup,
    format('select public.admin_set_user_role(%L,''student'')::text', stu2));
  perform t.throws('roles: admin cannot suspend a super admin', adm,
    format('select public.admin_set_user_status(%L,''suspended'')::text', sup), '%Only a Super Admin%');
  perform t.succeeds('roles: admin can still restrict a student', adm,
    format('select public.admin_set_user_status(%L,''restricted'')::text', stu2));
  perform t.succeeds('roles: and lift it again', adm,
    format('select public.admin_set_user_status(%L,''active'')::text', stu2));
  perform t.succeeds('roles: one super admin may demote another while one remains', sup,
    format('select public.admin_set_user_role(%L,''admin'')::text', sup2));
  perform t.throws('roles: a demoted admin cannot suspend a super admin', sup2,
    format('select public.admin_set_user_status(%L,''suspended'')::text', sup), '%Only a Super Admin%');
  update public.profiles set role = 'super_admin' where id = sup2;

  ------------------------------------------------- borrow approval separation
  req := t.as_run(stu, format('select public.create_borrow_request(null,''Role test'',null,%L,%L,%L)::text',
           today, today + 3, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 1))::text))::uuid;
  perform t.eq('approval: super admin sees the pending request', t.as_run(sup, format('select count(*)::text from public.borrow_requests where id=%L', req)), '1');
  perform t.eq('approval: admin cannot see the pending request', t.as_run(adm, format('select count(*)::text from public.borrow_requests where id=%L', req)), '0');
  perform t.eq('approval: admin sees no pending requests at all', t.as_run(adm, 'select count(*)::text from public.borrow_requests where status=''pending'''), '0');
  perform t.eq('approval: admin cannot read the pending request''s items', t.as_run(adm, format('select count(*)::text from public.request_items where request_id=%L', req)), '0');
  perform t.eq('approval: admin cannot see it in request_overview', t.as_run(adm, format('select count(*)::text from public.request_overview where id=%L', req)), '0');
  perform t.eq('approval: admin cannot see its activity-log entry', t.as_run(adm, format('select count(*)::text from public.activity_logs where entity_id=%L', req)), '0');
  perform t.eq('approval: super admin sees its activity-log entry', t.as_run(sup, format('select count(*)::text from public.activity_logs where entity_id=%L', req)), '1');
  perform t.eq('approval: student still sees own pending request', t.as_run(stu, format('select count(*)::text from public.borrow_requests where id=%L', req)), '1');
  perform t.ok('approval: new-request notification went to super admins',
    exists (select 1 from public.notifications where user_id = sup and type = 'request_submitted'));
  perform t.ok('approval: and not to admins',
    not exists (select 1 from public.notifications where user_id = adm and type = 'request_submitted'));
  j := t.as_run(adm, 'select public.admin_dashboard_stats()::text')::jsonb;
  perform t.ok('approval: admin dashboard hides the pending count', j -> 'pending_requests' = 'null'::jsonb, j::text);
  j := t.as_run(sup, 'select public.admin_dashboard_stats()::text')::jsonb;
  perform t.eq('approval: super admin dashboard shows the pending count', j ->> 'pending_requests',
    (select count(*)::text from public.borrow_requests where status = 'pending'));
  perform t.throws('approval: admin cannot approve via the API', adm, format('select public.approve_request(%L)::text', req), '%Super Admin privileges required%');
  perform t.throws('approval: admin cannot reject via the API', adm, format('select public.reject_request(%L,''not allowed'')::text', req), '%Super Admin privileges required%');
  perform t.throws('approval: admin cannot cancel a pending request', adm, format('select public.cancel_borrow_request(%L)::text', req), '%not found%');
  perform t.eq('approval: request still pending after admin attempts', (select status::text from public.borrow_requests where id = req), 'pending');
  perform t.succeeds('approval: super admin approves', sup, format('select public.approve_request(%L)::text', req));
  perform t.ok('approval: approval reserved stock', t.stock(item, 'reserved_qty')::int >= 1);
  perform t.eq('approval: admin now sees the approved request', t.as_run(adm, format('select status::text from public.borrow_requests where id=%L', req)), 'approved');
  perform t.eq('approval: and its items', t.as_run(adm, format('select count(*)::text from public.request_items where request_id=%L', req)), '1');
  perform t.ok('approval: admins were told it is ready to issue',
    exists (select 1 from public.notifications where user_id = adm and type = 'request_ready_to_issue'));

  req2 := t.as_run(stu, format('select public.create_borrow_request(null,''Reject test'',null,%L,%L,%L)::text',
           today, today + 1, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 1))::text))::uuid;
  perform t.succeeds('approval: super admin rejects', sup, format('select public.reject_request(%L,''Not this week'')::text', req2));
  perform t.eq('approval: rejected', (select status::text from public.borrow_requests where id = req2), 'rejected');

  ------------------------------------------------------- issue and return
  n := t.stock(item, 'borrowed_qty')::int;
  bid := t.as_run(adm, format('select public.issue_request(%L)::text', req))::uuid;
  perform t.ok('issue: admin issues the approved request', bid is not null);
  perform t.eq('issue: reserved -> borrowed', t.stock(item, 'borrowed_qty') || '/' || t.stock(item, 'reserved_qty'), (n + 1)::text || '/0');
  perform t.succeeds('return: student requests the return', stu, format('select public.request_return(%L)::text', bid));
  perform t.ok('return: admins are told', exists (select 1 from public.notifications where user_id = adm and type = 'return_requested'));
  select id into line from public.borrowing_items where borrowing_id = bid;
  perform t.ok('return: no super admin verification notice yet',
    not exists (select 1 from public.notifications where user_id = sup and type = 'return_verified_by_admin'));
  perform t.succeeds('return: admin verifies the line', adm, format('select public.verify_return(%L,1,0,0)::text', line));
  perform t.eq('return: request is returned', (select status::text from public.borrow_requests where id = req), 'returned');
  perform t.eq('return: stock back to available', t.stock(item, 'borrowed_qty'), n::text);
  perform t.ok('return: every super admin is notified after verification',
    (select count(distinct user_id) from public.notifications where type = 'return_verified_by_admin'
       and user_id in (sup, sup2) and title like '%' || (select request_code from public.borrow_requests where id = req)) = 2);
  perform t.ok('return: the notice names the verifying admin',
    exists (select 1 from public.notifications where user_id = sup and type = 'return_verified_by_admin' and body like 'Lab Admin verified%'));
  perform t.ok('return: admins do not get the super admin notice',
    not exists (select 1 from public.notifications where user_id = adm and type = 'return_verified_by_admin'));
  perform t.eq('stock invariant holds', (select count(*)::text from public.inventory_items
    where total_qty <> available_qty + reserved_qty + borrowed_qty + damaged_qty + lost_qty), '0');

  ---------------------------------------------------------------- department
  newbie := gen_random_uuid();
  insert into auth.users(id, email, raw_user_meta_data, email_confirmed_at)
  values (newbie, 'dept.new@srmist.edu.in', '{"full_name":"Dept New","department":"  ctech "}', now());
  perform t.eq('department: sign-up stores CTech (normalised)', (select department from public.profiles where id = newbie), 'CTech');
  declare d uuid := gen_random_uuid(); begin
    insert into auth.users(id, email, raw_user_meta_data, email_confirmed_at)
    values (d, 'dept.other@srmist.edu.in', '{"full_name":"Dept Other","department":"Electronics   and Communication"}', now());
    perform t.eq('department: sign-up stores a custom department', (select department from public.profiles where id = d), 'Electronics and Communication');
  end;
  declare d uuid := gen_random_uuid(); begin
    insert into auth.users(id, email, raw_user_meta_data, email_confirmed_at)
    values (d, 'dept.none@srmist.edu.in', '{"full_name":"No Dept"}', now());
    perform t.ok('department: an account without one is still created (asked to complete it in the app)',
      (select department is null from public.profiles where id = d));
    perform t.succeeds('department: user can add it later', d, 'update public.profiles set department=''Mechanical'' where id=auth.uid() returning 1');
    perform t.throws('department: user cannot clear it once set', d, 'update public.profiles set department=null where id=auth.uid() returning 1', '%Department is required%');
    perform t.throws('department: blank counts as cleared', d, 'update public.profiles set department=''   '' where id=auth.uid() returning 1', '%Department is required%');
    perform t.throws('department: one character is too short', d, 'update public.profiles set department=''X'' where id=auth.uid() returning 1', '%profiles_department_len%');
  end;

  ---------------------------------------------------------------- enquiries
  enq := t.as_run(stu, 'select public.create_enquiry(''Role Student'',''ra2311003010001'',''CTech'',''Is a second Jetson Nano available for project work?'')::text')::uuid;
  perform t.ok('enquiry: student submits', enq is not null);
  perform t.eq('enquiry: email comes from the account, registration number upper-cased',
    (select email || ' ' || registration_number from public.enquiries where id = enq), 'r.student@srmist.edu.in RA2311003010001');
  perform t.eq('enquiry: starts open with one history event',
    (select status::text || '/' || (select count(*) from public.enquiry_events where enquiry_id = enq) from public.enquiries where id = enq), 'open/1');
  perform t.ok('enquiry: no borrow request or reservation was created',
    (select count(*) from public.borrow_requests where requester_id = stu and status in ('pending', 'approved')) = 0);
  perform t.ok('enquiry: admins and super admins are notified',
    exists (select 1 from public.notifications where user_id = adm and type = 'enquiry_submitted')
    and exists (select 1 from public.notifications where user_id = sup and type = 'enquiry_submitted'));
  perform t.throws('enquiry: description too short', stu, 'select public.create_enquiry(''Role Student'',''RA2311003010001'',''CTech'',''short'')::text', '%at least 10%');
  perform t.throws('enquiry: invalid registration number', stu, 'select public.create_enquiry(''Role Student'',''12'',''CTech'',''A long enough question here'')::text', '%registration number%');
  perform t.throws('enquiry: department required', stu, 'select public.create_enquiry(''Role Student'',''RA2311003010001'','' '',''A long enough question here'')::text', '%department%');
  perform t.throws('enquiry: anonymous users cannot submit', null, 'select public.create_enquiry(''X Y'',''RA2311003010001'',''CTech'',''A long enough question here'')::text', '%permission denied%');
  perform t.throws('enquiry: students cannot insert directly', stu,
    'insert into public.enquiries(student_id,student_name,registration_number,email,department,description) values (auth.uid(),''A B'',''RA2311003010001'',''x@y.z'',''CTech'',''direct insert attempt'') returning 1', '%permission denied%');
  perform t.eq('enquiry: student sees own enquiry', t.as_run(stu, 'select count(*)::text from public.enquiries'), '1');
  perform t.eq('enquiry: other students see none', t.as_run(stu2, 'select count(*)::text from public.enquiries'), '0');
  perform t.eq('enquiry: admin sees it', t.as_run(adm, format('select count(*)::text from public.enquiries where id=%L', enq)), '1');
  perform t.eq('enquiry: super admin sees it', t.as_run(sup, format('select count(*)::text from public.enquiries where id=%L', enq)), '1');
  perform t.throws('enquiry: student cannot change status', stu, format('select public.update_enquiry_status(%L,''resolved'')::text', enq), '%Administrator%');
  perform t.succeeds('enquiry: admin moves it to in progress', adm, format('select public.update_enquiry_status(%L,''in_progress'',''Checking the cupboard'')::text', enq));
  perform t.succeeds('enquiry: super admin resolves it with a note', sup, format('select public.update_enquiry_status(%L,''resolved'',''One unit free from Monday'')::text', enq));
  perform t.ok('enquiry: student is told about status changes',
    (select count(*) from public.notifications where user_id = stu and type = 'enquiry_updated') = 2);
  perform t.eq('enquiry: history persisted in order',
    (select string_agg(coalesce(from_status::text, '-') || '>' || to_status::text, ',' order by seq) from public.enquiry_events where enquiry_id = enq),
    '->open,open>in_progress,in_progress>resolved');
  perform t.eq('enquiry: staff view shows the latest note', t.as_run(adm, format('select resolution_note from public.enquiry_overview where id=%L', enq)), 'One unit free from Monday');
  perform t.eq('enquiry: staff view has the full history', t.as_run(adm, format('select jsonb_array_length(history)::text from public.enquiry_overview where id=%L', enq)), '3');
  perform t.eq('enquiry: internal notes are hidden from the student', t.as_run(stu, format('select coalesce(resolution_note, ''hidden'') from public.enquiry_overview where id=%L', enq)), 'hidden');
  perform t.eq('enquiry: student cannot read the event table', t.as_run(stu, 'select count(*)::text from public.enquiry_events'), '0');
  perform t.succeeds('enquiry: closing is allowed', adm, format('select public.update_enquiry_status(%L,''closed'')::text', enq));
  perform t.throws('enquiry: closed is final', adm, format('select public.update_enquiry_status(%L,''open'')::text', enq), '%closed%');
  perform t.throws('enquiry: same status needs a note', adm,
    format('select public.update_enquiry_status(%L,''open'')::text',
      t.as_run(stu, 'select public.create_enquiry(''Role Student'',''RA2311003010001'',''CTech'',''Second question for the lab team'')::text')), '%different status%');
  perform t.throws('enquiry: students cannot delete enquiries', stu, format('delete from public.enquiries where id=%L', enq), '%permission denied%');
  perform t.eq('enquiry: closed enquiry is kept', (select count(*)::text from public.enquiries where id = enq), '1');

  ---------------------------------------------------------------- take-away
  perform t.throws('takeaway: date in the past refused', stu, format(
    'select public.create_takeaway_request(''Role Student'',''RA2311003010001'',''CTech'',''Field test of the sensor rig'',%L,null,null,%L)::text',
    today - 1, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 1))::text), '%past%');
  perform t.throws('takeaway: more than the lab owns refused', stu, format(
    'select public.create_takeaway_request(''Role Student'',''RA2311003010001'',''CTech'',''Field test of the sensor rig'',%L,null,null,%L)::text',
    today, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 100000))::text), '%in total%');
  perform t.throws('takeaway: return before take-away refused', stu, format(
    'select public.create_takeaway_request(''Role Student'',''RA2311003010001'',''CTech'',''Field test of the sensor rig'',%L,%L,null,%L)::text',
    today + 2, today + 1, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 1))::text), '%on or after%');
  perform t.throws('takeaway: needs at least one component', stu, format(
    'select public.create_takeaway_request(''Role Student'',''RA2311003010001'',''CTech'',''Field test of the sensor rig'',%L,null,null,''[]'')::text', today), '%at least one%');

  n := (select sum(available_qty) from public.inventory_items);
  tka := t.as_run(stu, format(
    'select public.create_takeaway_request(''Role Student'',''RA2311003010001'',''CTech'',''Field test of the sensor rig at the campus pond'',%L,%L,''Faculty guide: Dr. Rao'',%L)::text',
    today + 1, today + 5, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 1), jsonb_build_object('item_id', item2, 'qty', 2))::text))::uuid;
  perform t.ok('takeaway: student submits', tka is not null);
  perform t.eq('takeaway: pending with two component lines',
    (select status::text || '/' || (select count(*) from public.takeaway_items where request_id = tka) from public.takeaway_requests where id = tka), 'pending/2');
  perform t.eq('takeaway: submitting changes no stock', (select sum(available_qty)::text from public.inventory_items), n::text);
  perform t.ok('takeaway: super admins are notified, admins are not',
    exists (select 1 from public.notifications where user_id = sup and type = 'takeaway_submitted')
    and not exists (select 1 from public.notifications where user_id = adm and type = 'takeaway_submitted'));
  perform t.eq('takeaway: admin cannot see the pending request', t.as_run(adm, format('select count(*)::text from public.takeaway_requests where id=%L', tka)), '0');
  perform t.eq('takeaway: admin cannot see its items either', t.as_run(adm, format('select count(*)::text from public.takeaway_items where request_id=%L', tka)), '0');
  perform t.eq('takeaway: super admin sees it', t.as_run(sup, format('select count(*)::text from public.takeaway_overview where id=%L', tka)), '1');
  perform t.eq('takeaway: other students cannot see it', t.as_run(stu2, 'select count(*)::text from public.takeaway_requests'), '0');
  perform t.throws('takeaway: no letter before approval', stu, format('select public.get_takeaway_letter(%L)::text', tka), '%only available after Super Admin approval%');
  perform t.throws('takeaway: student cannot approve', stu, format('select public.decide_takeaway_request(%L,true)::text', tka), '%Super Admin privileges required%');
  perform t.throws('takeaway: admin cannot approve', adm, format('select public.decide_takeaway_request(%L,true)::text', tka), '%Super Admin privileges required%');
  perform t.throws('takeaway: student cannot edit the request directly', stu,
    format('update public.takeaway_requests set status=''approved'' where id=%L returning 1', tka), '%permission denied%');
  perform t.throws('takeaway: rejection needs a reason', sup, format('select public.decide_takeaway_request(%L,false)::text', tka), '%reason%');
  perform t.throws('takeaway: cannot mark a pending request as submitted', sup, format('select public.mark_takeaway_document_received(%L)::text', tka), '%only approved%');
  perform t.succeeds('takeaway: super admin approves', sup, format('select public.decide_takeaway_request(%L,true,''Return by Friday'')::text', tka));
  perform t.eq('takeaway: approval records who and when',
    (select status::text || '/' || decided_by_name || '/' || (decided_at is not null)::text from public.takeaway_requests where id = tka), 'approved/Super Admin/true');
  perform t.eq('takeaway: approving changes no stock', (select sum(available_qty)::text from public.inventory_items), n::text);
  perform t.ok('takeaway: student is notified of the approval', exists (select 1 from public.notifications where user_id = stu and type = 'takeaway_approved'));
  perform t.throws('takeaway: cannot be decided twice', sup, format('select public.decide_takeaway_request(%L,false,''Changed mind'')::text', tka), '%cannot be decided again%');
  perform t.throws('takeaway: student cannot cancel after approval', stu, format('select public.cancel_takeaway_request(%L)::text', tka), '%no longer be cancelled%');

  j := t.as_run(stu, format('select public.get_takeaway_letter(%L)::text', tka))::jsonb;
  perform t.eq('letter: has the request code', j ->> 'request_code', (select request_code from public.takeaway_requests where id = tka));
  perform t.eq('letter: has the student details', (j ->> 'student_name') || '|' || (j ->> 'registration_number') || '|' || (j ->> 'email') || '|' || (j ->> 'department'),
    'Role Student|RA2311003010001|r.student@srmist.edu.in|CTech');
  perform t.eq('letter: has both components with quantities', (select string_agg(x ->> 'qty', ',' order by x ->> 'name') from jsonb_array_elements(j -> 'items') x),
    (select string_agg(quantity::text, ',' order by i.name) from public.takeaway_items ti join public.inventory_items i on i.id = ti.item_id where ti.request_id = tka));
  perform t.eq('letter: has the dates', (j ->> 'takeaway_date') || '/' || (j ->> 'expected_return_date'), (today + 1)::text || '/' || (today + 5)::text);
  perform t.eq('letter: has the approver', j ->> 'approved_by', 'Super Admin');
  perform t.throws('letter: another student cannot fetch it', stu2, format('select public.get_takeaway_letter(%L)::text', tka), '%not found%');
  perform t.succeeds('letter: staff can fetch it', adm, format('select public.get_takeaway_letter(%L)::text', tka));

  perform t.eq('takeaway: admin now sees the approved request', t.as_run(adm, format('select status::text from public.takeaway_requests where id=%L', tka)), 'approved');
  perform t.throws('takeaway: student cannot mark the letter as handed in', stu, format('select public.mark_takeaway_document_received(%L)::text', tka), '%Administrator%');
  perform t.succeeds('takeaway: admin records the signed letter', adm, format('select public.mark_takeaway_document_received(%L,''Signed by both'')::text', tka));
  perform t.eq('takeaway: now submitted to admin', (select status::text || '/' || (document_received_at is not null)::text from public.takeaway_requests where id = tka), 'submitted/true');
  perform t.eq('takeaway: history persisted', (select string_agg(coalesce(from_status::text, '-') || '>' || to_status::text, ',' order by seq) from public.takeaway_events where request_id = tka),
    '->pending,pending>approved,approved>submitted');
  perform t.succeeds('letter: still downloadable after submission', stu, format('select public.get_takeaway_letter(%L)::text', tka));

  tka2 := t.as_run(stu, format(
    'select public.create_takeaway_request(''Role Student'',''RA2311003010001'',''CTech'',''Weekend demo at the robotics expo'',%L,null,null,%L)::text',
    today, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 1))::text))::uuid;
  perform t.succeeds('takeaway: super admin rejects with a reason', sup, format('select public.decide_takeaway_request(%L,false,''Not for external events'')::text', tka2));
  perform t.throws('letter: never available for a rejected request', stu, format('select public.get_takeaway_letter(%L)::text', tka2), '%only available after Super Admin approval%');
  tka2 := t.as_run(stu, format(
    'select public.create_takeaway_request(''Role Student'',''RA2311003010001'',''CTech'',''Weekend demo at the robotics expo'',%L,null,null,%L)::text',
    today, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 1))::text))::uuid;
  perform t.succeeds('takeaway: student cancels a pending request', stu, format('select public.cancel_takeaway_request(%L)::text', tka2));
  perform t.throws('letter: never available for a cancelled request', stu, format('select public.get_takeaway_letter(%L)::text', tka2), '%only available%');
  perform t.throws('takeaway: other students cannot cancel it', stu2, format('select public.cancel_takeaway_request(%L)::text', tka), '%not found%');
  update public.profiles set status = 'restricted' where id = stu2;
  perform t.throws('takeaway: restricted accounts cannot request', stu2, format(
    'select public.create_takeaway_request(''Other Student'',''RA2311003010002'',''CTech'',''Restricted account attempt'',%L,null,null,%L)::text',
    today, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 1))::text), '%not allowed%');
  perform t.succeeds('enquiry: restricted accounts can still ask questions', stu2,
    'select public.create_enquiry(''Other Student'',''RA2311003010002'',''Mechanical'',''Can restricted accounts borrow again?'')::text');
  update public.profiles set status = 'active' where id = stu2;
  perform t.throws('takeaway: anonymous users cannot call anything', null, format('select public.get_takeaway_letter(%L)::text', tka), '%permission denied%');

  perform t.eq('final stock invariant', (select count(*)::text from public.inventory_items
    where total_qty <> available_qty + reserved_qty + borrowed_qty + damaged_qty + lost_qty), '0');
end
$suite$;
