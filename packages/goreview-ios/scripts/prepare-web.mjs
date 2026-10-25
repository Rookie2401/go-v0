import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isIP } from 'node:net';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const repo = path.resolve(pkg, '../..');
const web = path.join(pkg, 'web');
const release = process.argv.includes('--release');

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
    throw new Error('GOREVIEW_BUNDLE_ID must be the real reverse-DNS Bundle ID registered in your Apple Developer account.');
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
if (release) bundleId(process.env.GOREVIEW_BUNDLE_ID);
// REPOSITORY_HEALTH_CHECK_URL: where THIS machine reaches the same service for the pre-build check when the public name is not
// reachable from here (2026-10-19: the build PC's router filter blocks the new domain while the hostname answers from outside).
// The bundle still carries REPOSITORY_SERVICE_URL; only the check is redirected, and the redirection is printed.
const healthCheckUrl = release && process.env.REPOSITORY_HEALTH_CHECK_URL ? new URL(process.env.REPOSITORY_HEALTH_CHECK_URL) : undefined;
if (healthCheckUrl && !/^https?:$/.test(healthCheckUrl.protocol)) throw new Error('REPOSITORY_HEALTH_CHECK_URL must be an http(s) URL.');
if (healthCheckUrl) console.warn(`prepare-web: health check sent to ${healthCheckUrl.origin} instead of ${releaseServiceUrl} (REPOSITORY_HEALTH_CHECK_URL); the bundle still uses ${releaseServiceUrl}`);
if (release) await verifyRepositoryEndpoint(healthCheckUrl ? healthCheckUrl.origin + healthCheckUrl.pathname.replace(/\/+$/, '') : releaseServiceUrl);

const vite = path.join(repo, 'node_modules', 'vite', 'bin', 'vite.js');
const build = spawnSync(process.execPath, [vite, 'build', '-c', 'packages/gopractice/vite.config.ts', '--mode', 'review'], {
  cwd: repo,
  env: { ...process.env, GOPRACTICE_OUT: path.join(pkg, '.review-build') },
  stdio: 'inherit',
});
if (build.status !== 0) throw new Error(`GoReview review build failed (exit ${build.status ?? 'unknown'}).`);

const source = path.join(pkg, '.review-build');
await rm(web, { recursive: true, force: true });
await mkdir(web, { recursive: true });
await cp(source, web, { recursive: true });
await rm(source, { recursive: true, force: true });

// Biblia (packages/biblia): the Hebrew Bible and the Greek New Testament on GoLearn, as a page of the app at web/biblia/ (its texts and
// sharded indexes come with it, about 50 MB); the app's home links to it and Biblia records into the app's account
const biblia = spawnSync(process.execPath, [vite, 'build', '-c', 'packages/biblia/vite.config.ts'], {
  cwd: repo,
  env: { ...process.env, BIBLIA_OUT: path.join(web, 'biblia') },
  stdio: 'inherit',
});
if (biblia.status !== 0) throw new Error(`Biblia build failed (exit ${biblia.status ?? 'unknown'}).`);

const configPath = path.join(web, 'config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (release) config.serviceUrl = releaseServiceUrl;
config.bibliaUrl = './biblia/index.html';
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

// The PWA worker is for the browser edition. Capacitor packages immutable app assets, so remove its registration and files.
const htmlPath = path.join(web, 'index.html');
let html = await readFile(htmlPath, 'utf8');
html = html.replace(/<script>\s*[\s\S]*?serviceWorker\.register\(['"]\.\/sw\.js['"]\)[\s\S]*?<\/script>\s*/i, '');
html = html.replace(/<link\s+rel="manifest"[^>]*>\s*/i, '');
html = html.replace(/<meta\s+name="(?:apple-mobile-web-app-capable|mobile-web-app-capable|apple-mobile-web-app-status-bar-style|apple-mobile-web-app-title)"[^>]*>\s*/gi, '');
html = html.replace(/<link\s+rel="apple-touch-icon"[^>]*>\s*/i, '');
await writeFile(htmlPath, html);
await rm(path.join(web, 'sw.js'), { force: true });
await rm(path.join(web, 'manifest.webmanifest'), { force: true });

console.log(`Prepared bundled GoReview web assets at ${path.relative(pkg, web)}${release ? ' with validated Bundle ID and healthy HTTPS Repository URL' : ''}.`);
