/**
 * The keeper's command line for the GoRead whitelist (docs/goread/BACKEND.md, docs/goread/DEPLOY.md):
 *
 *   npx vite-node server/goread/admin.ts whitelist add --team honduras-es --name "Ana"
 *   npx vite-node server/goread/admin.ts whitelist list --team honduras-es
 *   npx vite-node server/goread/admin.ts whitelist revoke --team honduras-es --name "Ana"
 *
 * Add `--sql` to print SQL for the Cloudflare database instead of writing the local file. The logic is admin-lib.ts.
 */
import { runAdmin } from './admin-lib.ts';

runAdmin(process.argv.slice(2), { stdout: (t) => process.stdout.write(t), stderr: (t) => process.stderr.write(t) })
  .then((code) => { process.exitCode = code; })
  .catch((e: unknown) => { process.stderr.write(`goread admin: ${e instanceof Error ? e.message : String(e)}\n`); process.exitCode = 1; });
