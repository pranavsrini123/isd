#!/usr/bin/env bash
# Rebuild the isdtest database from scratch: stub + all migrations (+ seed with --seed).
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p ${PGTEST_PORT:-54329} -U postgres"
$P -d postgres -c "drop database if exists isdtest with (force)" -c "create database isdtest"
for f in tests/00_supabase_stub.sql migrations/*.sql; do $P -d isdtest -f "$f" 2>&1 | grep -v -e wal_level -e 'Set wal_level' || true; done
if [ "${1:-}" = "--seed" ]; then $P -d isdtest -f seed.sql; fi
echo "isdtest ready"
