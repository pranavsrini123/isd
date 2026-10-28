#!/usr/bin/env bash
# Rebuild the DB with demo data, replace the inventory with the audit, load the project catalogue,
# check stock was untouched by the catalogue load, then run 50_catalogue.sql and the re-run / rollback
# cycle in 55_catalogue_rerun.sql. Exit 1 on any failure.
set -euo pipefail
cd "$(dirname "$0")"
./pg_up.sh >/dev/null
./reset_db.sh --seed >/dev/null
P="psql -h 127.0.0.1 -p ${PGTEST_PORT:-54329} -U postgres -d isdtest -v ON_ERROR_STOP=1 -q -X"
$P -f 10_helpers.sql
$P -At -c "select t.mkuser('cat.admin@srmist.edu.in', 'Catalogue Admin')" >/dev/null
$P -c "update public.profiles set role = 'super_admin' where email = 'cat.admin@srmist.edu.in'"
$P -f ../import/components_audit_2026-10-12/replace_inventory_with_audit.sql >/dev/null 2>&1
stock() { $P -At -c "select md5(string_agg(id || ':' || total_qty || '/' || available_qty || '/' || damaged_qty, ',' order by id)) || ' ' || count(*) from public.inventory_items"; }
before=$(stock)
$P -f ../import/project_catalogue_2026-10/load_catalogue.sql >/dev/null 2>&1
$P -f ../import/project_catalogue_2026-10/load_catalogue.sql >/dev/null 2>&1   # idempotent re-run
after=$(stock)
$P -c "select t.ok('catalogue: loading created no inventory items and changed no stock', '$before' = '$after')"
$P -c "select t.ok('catalogue: re-running the load adds no duplicates', (select count(*) from public.projects where catalogue_key is not null) = 40)"
out=$($P -v verbose="${VERBOSE:-0}" -f 50_catalogue.sql -f 55_catalogue_rerun.sql -f 99_report.sql)
echo "$out"
echo "$out" | grep -qE '^\s*[0-9]+ \|\s+0$' || exit 1
