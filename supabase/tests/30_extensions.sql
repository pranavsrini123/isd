-- Loan extension requests (migration 0006). Runs after 20_tests.sql.
do $ext$
declare
  stu uuid; other uuid; adm uuid; item uuid; req uuid; bid uuid; e1 uuid; e2 uuid;
  today date := public.lab_today();
  issued date;
begin
  stu   := t.mkuser('ext.student@srmist.edu.in', 'Ext Student');
  other := t.mkuser('ext.other@srmist.edu.in', 'Ext Other');
  adm   := t.mkuser('ext.admin@srmist.edu.in', 'Ext Admin');
  update public.profiles set role = 'admin' where id = adm;
  select id into item from public.inventory_items where name = 'Piezo Buzzer';

  req := t.as_run(stu, format('select public.create_borrow_request(null,''Extension test'',null,%L,%L,%L)::text',
           today, today + 3, jsonb_build_array(jsonb_build_object('item_id', item, 'qty', 1))::text))::uuid;
  perform t.as_run(adm, format('select public.approve_request(%L)::text', req));
  bid := t.as_run(adm, format('select public.issue_request(%L,%L)::text', req, today + 3))::uuid;
  issued := (select (issued_at at time zone 'Asia/Kolkata')::date from public.borrowings where id = bid);

  -- validation
  perform t.throws('extension: other student cannot extend someone else''s loan', other,
    format('select public.request_loan_extension(%L,%L,''need more time'')::text', bid, today + 5), '%not found%');
  perform t.throws('extension: date must be after current due date', stu,
    format('select public.request_loan_extension(%L,%L,''need more time'')::text', bid, today + 3), '%after the current due date%');
  perform t.throws('extension: total loan cannot exceed max_loan_days', stu,
    format('select public.request_loan_extension(%L,%L,''need more time'')::text', bid, issued + 60), '%limited to%');
  perform t.throws('extension: reason required', stu,
    format('select public.request_loan_extension(%L,%L,'''')::text', bid, today + 6), '%reason%');
  perform t.throws('extension: student cannot write the table directly', stu,
    format('insert into public.loan_extension_requests(borrowing_id,requested_by,current_due_date,requested_due_date,reason) values (%L,auth.uid(),%L,%L,''hack hack'') returning 1', bid, today + 3, today + 9), '%permission denied%');
  perform t.throws('extension: student cannot move the due date directly', stu,
    format('update public.borrowings set due_date = %L where id = %L returning 1', today + 9, bid), '%permission denied%');

  -- request → pending, due date unchanged
  e1 := t.as_run(stu, format('select public.request_loan_extension(%L,%L,''Project demo moved'')::text', bid, today + 7))::uuid;
  perform t.eq('extension: request is pending', (select status::text from public.loan_extension_requests where id = e1), 'pending');
  perform t.eq('extension: due date not changed before approval', (select due_date::text from public.borrowings where id = bid), (today + 3)::text);
  perform t.throws('extension: only one pending request per loan', stu,
    format('select public.request_loan_extension(%L,%L,''another one'')::text', bid, today + 8), '%already waiting%');
  perform t.ok('extension: admins notified', exists (select 1 from public.notifications where user_id = adm and type = 'extension_requested'));
  perform t.eq('extension: student sees own request', t.as_run(stu, 'select count(*)::text from public.loan_extension_overview'), '1');
  perform t.eq('extension: other student sees nothing', t.as_run(other, 'select count(*)::text from public.loan_extension_overview'), '0');

  -- review
  perform t.throws('extension: student cannot approve', stu, format('select public.review_loan_extension(%L,true)::text', e1), '%Administrator%');
  perform t.throws('extension: rejection needs a reason', adm, format('select public.review_loan_extension(%L,false,'''')::text', e1), '%reason%');
  perform t.succeeds('extension: admin approves', adm, format('select public.review_loan_extension(%L,true,''ok'')::text', e1));
  perform t.eq('extension: due date moved on approval', (select due_date::text from public.borrowings where id = bid), (today + 7)::text);
  perform t.throws('extension: cannot review twice', adm, format('select public.review_loan_extension(%L,true)::text', e1), '%already been approved%');
  perform t.ok('extension: student notified', exists (select 1 from public.notifications where user_id = stu and type = 'extension_approved'));
  perform t.eq('extension: stock untouched', (select reserved_qty || '/' || borrowed_qty from public.inventory_items where id = item), '0/1');

  -- reject path, then cancel path
  e2 := t.as_run(stu, format('select public.request_loan_extension(%L,%L,''one more day'')::text', bid, today + 8))::uuid;
  perform t.succeeds('extension: admin rejects with reason', adm, format('select public.review_loan_extension(%L,false,''Needed for a workshop'')::text', e2));
  perform t.eq('extension: rejected leaves due date', (select due_date::text from public.borrowings where id = bid), (today + 7)::text);
  e2 := t.as_run(stu, format('select public.request_loan_extension(%L,%L,''one more day'')::text', bid, today + 8))::uuid;
  perform t.succeeds('extension: student cancels own pending request', stu, format('select public.cancel_loan_extension(%L)::text', e2));

  -- requesting a return closes a pending extension and blocks new ones
  e2 := t.as_run(stu, format('select public.request_loan_extension(%L,%L,''one more day'')::text', bid, today + 8))::uuid;
  perform t.as_run(stu, format('select public.request_return(%L)::text', bid));
  perform t.eq('extension: pending request cancelled when return requested', (select status::text from public.loan_extension_requests where id = e2), 'cancelled');
  perform t.throws('extension: none after return requested', stu,
    format('select public.request_loan_extension(%L,%L,''late'')::text', bid, today + 9), '%already asked to return%');

  perform t.eq('extension: stock invariant still holds', (select count(*)::text from public.inventory_items
    where total_qty <> available_qty + reserved_qty + borrowed_qty + damaged_qty + lost_qty), '0');
end
$ext$;
