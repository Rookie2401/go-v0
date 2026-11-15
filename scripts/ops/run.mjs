#!/usr/bin/env node
/**
 * Runs one of the ops scripts (scripts/ops/*.mts) compiled by esbuild and started with plain Node, without Vite in the process. This is the way to run them
 * in the Render Shell: under vite-node an ops script took about 300 MB beside the running service, on a 512 MB instance, and running the corrections list
 * there ran the service out of memory (2026-11-12).
 *
 *   node scripts/ops/run.mjs corrections list --data /var/data/repository
 *   node scripts/ops/run.mjs scrub-web-sources --data /var/data/repository [--apply]
 *
 * Everything after the script's name is passed to it unchanged. The exit status is the script's.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '../../infra/repository/bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [name, ...args] = process.argv.slice(2);
if (!name || !/^[a-z0-9-]+$/.test(name) || !existsSync(resolve(root, `scripts/ops/${name}.mts`))) {
  console.error('usage: node scripts/ops/run.mjs <script> [arguments]   (a script in scripts/ops, without .mts: corrections, scrub-web-sources, backup, restore, purge …)');
  process.exit(2);
}
const file = await bundle({ entry: `scripts/ops/${name}.mts`, outfile: `infra/repository/.build/ops-${name}.mjs`, root });
const child = spawn(process.execPath, [file, ...args], { stdio: 'inherit', cwd: process.cwd() });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
