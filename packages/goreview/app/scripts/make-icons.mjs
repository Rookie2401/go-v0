/** Synchronize the shared Go G-and-globe brand (the brown mark, packages/shared-brand); replaces the retired serif G generator. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const result = spawnSync(process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
  ['-NoProfile', '-File', path.join(root, 'scripts/sync-go-brand.ps1')], { stdio: 'inherit' });
if (result.error) { console.error('Run scripts/sync-go-brand.ps1 on Windows to regenerate the shared Go icons.'); throw result.error; }
process.exit(result.status ?? 1);
