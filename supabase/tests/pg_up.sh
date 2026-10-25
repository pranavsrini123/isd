#!/usr/bin/env bash
# Starts a throwaway local Postgres 16 cluster for the database tests.
# Usage: supabase/tests/pg_up.sh   (prints the connection string)
# PG_BIN points at another initdb/pg_ctl folder (e.g. $(pg_config --bindir)). Run as root, the
# cluster runs as the postgres user; otherwise as the current user.
set -euo pipefail
BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
DIR=${PGTEST_DIR:-/tmp/isdlab-pg}
PORT=${PGTEST_PORT:-54329}
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$1"; else bash -c "$1"; fi; }
if [ ! -d "$DIR" ]; then
  mkdir -p "$DIR"
  if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; fi
  as_pg "$BIN/initdb -D $DIR -A trust -U postgres >/dev/null"
fi
if ! "$BIN/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
  as_pg "$BIN/pg_ctl -D $DIR -o '-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp' -l $DIR/log -w start" >/dev/null
fi
echo "postgresql://postgres@127.0.0.1:$PORT/postgres"
