import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isIP } from 'node:net';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const repo = path.resolve(pkg, '../..');
const web = path.join(pkg, 'web');
const release = process.argv.includes('--release');
const buildDir = path.join(pkg, '.standalone-build');

function serviceUrl(value) {
  if (!value) throw new Error('REPOSITORY_SERVICE_URL is required for release preparation. Set it to the public HTTPS Repository service URL.');
  let url;
  try { url = new URL(value); } catch { throw new Error('REPOSITORY_SERVICE_URL must be a valid absolute HTTPS URL.'); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blockedSuffixes = ['.localhost', '.local', '.test', '.example', '.invalid'];
  const placeholder = ['example.com', 'example.org', 'example.net'].includes(host) || blockedSuffixes.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
  const ipv4 = isIP(host) === 4 ? host.split('.').map(Number) : null;
  const [a, b, c] = ipv4 ?? [];
  const reservedIpv4 = !!ipv4 && (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2)
    || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113));
  const reservedIpv6 = isIP(host) === 6 && (host === '::' || host === '::1' || /^f[cd][0-9a-f]{2}:/i.test(host)
    || /^fe[89ab][0-9a-f]:/i.test(host) || /^ff/i.test(host) || /^2001:db8:/i.test(host));
  if (url.protocol !== 'https:' || host === 'localhost' || host.endsWith('.localhost') || reservedIpv4 || reservedIpv6 || placeholder || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('REPOSITORY_SERVICE_URL must be a public HTTPS URL without credentials, query, or fragment; loopback, private-network, and placeholder domains are refused.');
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

function bundleId(value) {
  if (!value || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value) || /(^|\.)(example|invalid|test|localhost)(\.|$)/i.test(value)) {
    throw new Error('BIBLIA_BUNDLE_ID must be the real reverse-DNS Bundle ID registered in your Apple Developer account.');
  }
  return value;
}

async function verifyRepositoryEndpoint(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Repository health check returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload?.ok !== true || payload?.service !== 'repository' || payload?.contractVersion !== 3) {
      throw new Error('Repository health check must return ok=true, service="repository", and contractVersion=3.');
    }
  } catch (error) {
    throw new Error(`Repository health check failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

const releaseServiceUrl = release ? serviceUrl(process.env.REPOSITORY_SERVICE_URL) : undefined;
if (release) bundleId(process.env.BIBLIA_BUNDLE_ID);
// REPOSITORY_HEALTH_CHECK_URL: where THIS machine reaches the same service for the pre-build check when the public name is not
// reachable from here (2026-10-19: the build PC's router filter blocks the new domain while the hostname answers from outside).
// The bundle still carries REPOSITORY_SERVICE_URL; only the check is redirected, and the redirection is printed.
const healthCheckUrl = release && process.env.REPOSITORY_HEALTH_CHECK_URL ? new URL(process.env.REPOSITORY_HEALTH_CHECK_URL) : undefined;
if (healthCheckUrl && !/^https?:$/.test(healthCheckUrl.protocol)) throw new Error('REPOSITORY_HEALTH_CHECK_URL must be an http(s) URL.');
if (healthCheckUrl) console.warn(`prepare-web: health check sent to ${healthCheckUrl.origin} instead of ${releaseServiceUrl} (REPOSITORY_HEALTH_CHECK_URL); the bundle still uses ${releaseServiceUrl}`);
if (release) await verifyRepositoryEndpoint(healthCheckUrl ? healthCheckUrl.origin + healthCheckUrl.pathname.replace(/\/+$/, '') : releaseServiceUrl);

const vite = path.join(repo, 'node_modules', 'vite', 'bin', 'vite.js');
// Biblia's standalone edition (docs/ecosystem/BIBLIA-STANDALONE.md) is the whole web content of this app: nothing else is bundled.
// A release build names the public address; a development preparation keeps the source config.json address (127.0.0.1:8790) and warns.
const env = { ...process.env, BIBLIA_OUT: buildDir };
if (release) env.BIBLIA_SERVICE_URL = releaseServiceUrl;
await rm(buildDir, { recursive: true, force: true });
const build = spawnSync(process.execPath, [vite, 'build', '-c', 'packages/biblia/vite.config.ts', '--mode', 'standalone'], { cwd: repo, env, stdio: 'inherit' });
if (build.status !== 0) throw new Error(`Biblia standalone build failed (exit ${build.status ?? 'unknown'}).`);

await rm(web, { recursive: true, force: true });
await mkdir(web, { recursive: true });
await cp(buildDir, web, { recursive: true });
await rm(buildDir, { recursive: true, force: true });

// The edition marker is what makes packages/biblia/main.ts connect to the service in config.json (its own sign-in) inside this shell.
const html = await readFile(path.join(web, 'index.html'), 'utf8');
if (!/<meta name="biblia-edition" content="standalone">/.test(html)) throw new Error('The built index.html has no standalone edition marker.');
const config = JSON.parse(await readFile(path.join(web, 'config.json'), 'utf8'));
if (release && config.serviceUrl !== releaseServiceUrl) throw new Error('The built config.json does not carry the validated release service address.');
// The edition's service worker registration is left as built: inside the Capacitor web view it either does not register or is harmless.

console.log(`Prepared bundled Biblia standalone web assets at ${path.relative(pkg, web)}${release ? ' with validated Bundle ID and healthy HTTPS Repository URL' : ''}.`);
