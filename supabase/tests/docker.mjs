// Runs the database suite (the same scripts as `npm run test:db`) inside the official postgres:16
// image, so it works on any machine with Docker, Windows included. The repository is mounted
// read-only and copied inside the container, where the shell scripts get LF line endings, so
// nothing on the host changes.
// Usage: npm run test:db:docker      (VERBOSE=1 lists every passing check; PG_IMAGE overrides the image)
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const image = process.env.PG_IMAGE || 'postgres:16'
const steps = [
  'mkdir -p /work',
  'tar -C /repo --exclude=./node_modules --exclude=./.git --exclude=./dist -cf - . | tar -C /work -xf -',
  "find /work -name '*.sh' -exec sed -i 's/\\r$//' {} +",
  'cd /work',
  'bash supabase/tests/run_tests.sh',
  'bash supabase/tests/concurrency.sh',
  'bash supabase/tests/run_catalogue_tests.sh',
]
const r = spawnSync('docker', ['run', '--rm', '-e', `VERBOSE=${process.env.VERBOSE || 0}`, '-v', `${root}:/repo:ro`,
  image, 'bash', '-c', steps.join(' && ')], { stdio: 'inherit' })
if (r.error) {
  console.error(`Could not run docker (${r.error.message}). Install Docker and make sure it is running.`)
  process.exit(1)
}
process.exit(r.status ?? 1)
