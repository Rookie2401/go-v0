import { spawn } from 'node:child_process';
import path from 'node:path';

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
  out: string;
}

export interface RunNodeOptions {
  cwd?: string;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
  input?: string;
}

/**
 * Asynchronous stand-in for `spawnSync(process.execPath, args, …)`.
 * Never rejects for a non-zero exit code or a timeout (status is null on timeout
 * or when the child is killed by a signal), mirroring spawnSync.
 */
export function runNode(args: string[], opts: RunNodeOptions = {}): Promise<CliResult> {
  const cliPath = args[0]?.replace(/\\/g, '/');
  const entry = args[1]?.replace(/\\/g, '/');
  const runsViteScript = cliPath?.includes('/vite-node/dist/cli.mjs') && entry && /(?:^|\/)scripts\/.*\.(?:mjs|mts|js|ts)$/.test(entry);
  // CLI scripts are standalone tools; loading the browser app's Vite plugins adds significant cold-start cost and
  // does not participate in their rights/schema checks. Keep explicitly supplied runner configs intact.
  const childArgs = runsViteScript && !args.includes('--config')
    ? [args[0], '--config', path.resolve(opts.cwd ?? process.cwd(), 'scripts/vite.config.ts'), ...args.slice(1)]
    : args;
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (status: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, out: stdout + stderr });
    };

    const child = spawn(process.execPath, childArgs, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
    });

    if (opts.timeout !== undefined && opts.timeout > 0) {
      timer = setTimeout(() => {
        child.kill();
        finish(null);
      }, opts.timeout);
    }

    child.on('error', (err) => {
      stderr += String(err);
      finish(null);
    });
    child.on('close', (code) => finish(code));

    child.stdin.on('error', () => {
      /* child closed stdin early (EPIPE); ignore */
    });
    if (opts.input !== undefined) child.stdin.end(opts.input, 'utf8');
    else child.stdin.end();
  });
}
