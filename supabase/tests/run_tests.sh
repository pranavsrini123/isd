#!/usr/bin/env bash
# Rebuild the DB, load the demo seed, run the SQL suite. Exit 1 on any failure.
set -euo pipefail
cd "$(dirname "$0")"
./pg_up.sh >/dev/null
./reset_db.sh --seed
P="psql -h 127.0.0.1 -p ${PGTEST_PORT:-54329} -U postgres -d isdtest -v ON_ERROR_STOP=1 -q"
$P -f 10_helpers.sql
out=$($P -v verbose="${VERBOSE:-0}" -f 20_tests.sql -f 30_extensions.sql -f 99_report.sql)
echo "$out"
echo "$out" | grep -qE '^\s*[0-9]+ \|\s+0$' || exit 1
