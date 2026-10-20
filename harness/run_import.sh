#!/usr/bin/env bash
# Fresh DB + seed, build, start server, run the audit-import E2E checks.
set -euo pipefail
cd "$(dirname "$0")/.."
supabase/tests/pg_up.sh >/dev/null
supabase/tests/reset_db.sh --seed >/dev/null
node harness/build.mjs
[ -f /tmp/isdlab-harness.pid ] && kill "$(cat /tmp/isdlab-harness.pid)" 2>/dev/null || true
node harness/server.mjs > harness/out/server.log 2>&1 &
echo $! > /tmp/isdlab-harness.pid
sleep 1
node harness/import_e2e.mjs
