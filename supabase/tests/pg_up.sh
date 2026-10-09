#!/usr/bin/env bash
# Starts a throwaway local Postgres 16 cluster for the database tests.
# Usage: supabase/tests/pg_up.sh   (prints the connection string)
set -euo pipefail
BIN=/usr/lib/postgresql/16/bin
DIR=${PGTEST_DIR:-/tmp/isdlab-pg}
PORT=${PGTEST_PORT:-54329}
if [ ! -d "$DIR" ]; then
  mkdir -p "$DIR"; chown postgres "$DIR"
  su postgres -c "$BIN/initdb -D $DIR -A trust -U postgres >/dev/null"
fi
if ! "$BIN/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
  su postgres -c "$BIN/pg_ctl -D $DIR -o '-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp' -l $DIR/log -w start" >/dev/null
fi
echo "postgresql://postgres@127.0.0.1:$PORT/postgres"
