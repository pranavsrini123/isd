#!/usr/bin/env bash
# Runs harness/run.sh fully detached; output in /tmp/isd_e2e.log
cd "$(dirname "$0")"
[ -f /tmp/isdlab-harness.pid ] && kill "$(cat /tmp/isdlab-harness.pid)" 2>/dev/null
setsid nohup bash -c './run.sh > /tmp/isd_e2e.log 2>&1; echo EXIT $? >> /tmp/isd_e2e.log' < /dev/null > /dev/null 2>&1 &
