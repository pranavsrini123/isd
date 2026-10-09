#!/usr/bin/env bash
# Real concurrency tests: two database sessions race for the same stock / line.
# Session A takes its locks and holds the transaction open; session B must wait,
# then see A's committed result and fail cleanly instead of double-counting.
set -uo pipefail
cd "$(dirname "$0")"
./pg_up.sh >/dev/null && ./reset_db.sh --seed >/dev/null
P="psql -h 127.0.0.1 -p ${PGTEST_PORT:-54329} -U postgres -d isdtest -X -q -At"
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected $3, got $2)"; fail=1; fi; }

$P -v ON_ERROR_STOP=1 -f 10_helpers.sql >/dev/null
read -r ADM S1 S2 ITEM <<<"$($P -c "
  select t.mkuser('cadmin@srmist.edu.in','C Admin')::text || ' ' ||
         t.mkuser('cs1@srmist.edu.in','C One')::text || ' ' ||
         t.mkuser('cs2@srmist.edu.in','C Two')::text || ' ' ||
         (select id from public.inventory_items where name='Piezo Buzzer')::text")"
$P -c "update public.profiles set role='admin' where id='$ADM'" >/dev/null
# Leave exactly one buzzer available (as superuser, keeping the invariant).
$P -c "update public.inventory_items set total_qty=1, available_qty=1 where id='$ITEM'" >/dev/null
TODAY=$($P -c "select public.lab_today()")
mkreq() { $P -c "select t.as_run('$1', format('select public.create_borrow_request(null,%L,null,%L,%L,%L)::text','race', '$TODAY'::date, '$TODAY'::date+2, '[{\"item_id\":\"$ITEM\",\"qty\":1}]'))"; }
R1=$(mkreq "$S1"); R2=$(mkreq "$S2")

as_admin() { echo "begin; select set_config('request.jwt.claim.sub','$ADM',true); set local role authenticated; $1 select pg_sleep(${2:-0}); commit;"; }

# 1. Two admins approve two different requests for the last unit at the same time.
( echo "$(as_admin "select public.approve_request('$R1');" 1.5)" | $P 2>&1 ) > /tmp/isd_a.out &
sleep 0.3
( echo "$(as_admin "select public.approve_request('$R2');")" | $P 2>&1 ) > /tmp/isd_b.out &
wait
approved=$($P -c "select count(*) from public.borrow_requests where id in ('$R1','$R2') and status='approved'")
check "race approve: exactly one of two approvals succeeds" "$approved" "1"
check "race approve: loser got a stock error" "$(grep -c 'Not enough' /tmp/isd_b.out)" "1"
check "race approve: available is 0, reserved is 1" "$($P -c "select available_qty||'/'||reserved_qty from public.inventory_items where id='$ITEM'")" "0/1"

# 2. Two admins issue the same approved request at the same time.
( echo "$(as_admin "select public.issue_request('$R1');" 1.5)" | $P 2>&1 ) > /tmp/isd_a.out &
sleep 0.3
( echo "$(as_admin "select public.issue_request('$R1');")" | $P 2>&1 ) > /tmp/isd_b.out &
wait
check "race issue: one borrowing row" "$($P -c "select count(*) from public.borrowings where request_id='$R1'")" "1"
check "race issue: borrowed=1, reserved=0" "$($P -c "select borrowed_qty||'/'||reserved_qty from public.inventory_items where id='$ITEM'")" "1/0"
check "race issue: second issue refused" "$(grep -c 'cannot be issued' /tmp/isd_b.out)" "1"

# 3. Two admins verify the same returned line at the same time.
LINE=$($P -c "select bi.id from public.borrowing_items bi join public.borrowings b on b.id=bi.borrowing_id where b.request_id='$R1'")
( echo "$(as_admin "select public.verify_return('$LINE',1,0,0);" 1.5)" | $P 2>&1 ) > /tmp/isd_a.out &
sleep 0.3
( echo "$(as_admin "select public.verify_return('$LINE',1,0,0);")" | $P 2>&1 ) > /tmp/isd_b.out &
wait
check "race verify: one return record" "$($P -c "select count(*) from public.return_records where borrowing_item_id='$LINE'")" "1"
check "race verify: available back to exactly 1" "$($P -c "select available_qty||'/'||borrowed_qty from public.inventory_items where id='$ITEM'")" "1/0"
check "race verify: second verify refused" "$(grep -c 'already been verified' /tmp/isd_b.out)" "1"

# 4. Stock adjustment racing an approval on the same item never goes negative.
R3=$(mkreq "$S2")
( echo "$(as_admin "select public.adjust_inventory('$ITEM','remove_available',1,'sold off');" 1.5)" | $P 2>&1 ) > /tmp/isd_a.out &
sleep 0.3
( echo "$(as_admin "select public.approve_request('$R3');")" | $P 2>&1 ) > /tmp/isd_b.out &
wait
check "race adjust vs approve: approval refused after stock removed" "$(grep -c 'Not enough' /tmp/isd_b.out)" "1"
check "race adjust vs approve: invariant holds, nothing negative" "$($P -c "select count(*) from public.inventory_items where total_qty<>available_qty+reserved_qty+borrowed_qty+damaged_qty+lost_qty or available_qty<0")" "0"
exit $fail
