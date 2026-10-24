import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { validateAppIcons } from './validate-app-icon.mjs';

const app = JSON.parse(await readFile('app.json', 'utf8'));
const capacitor = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
const bundleId = app?.expo?.ios?.bundleIdentifier;
const buildNumber = app?.expo?.ios?.buildNumber;

await validateAppIcons(process.cwd());

if (!bundleId || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId) || /(^|\.)(example|invalid|test|localhost)(\.|$)/i.test(bundleId)) {
  throw new Error('The staged app.json must contain the real registered reverse-DNS Bundle ID.');
}
if (!buildNumber || !/^[1-9][0-9]*$/.test(buildNumber)) {
  throw new Error('The staged app.json must contain a positive App Store build number.');
}
if (capacitor.appId !== bundleId || capacitor.server?.url) {
  throw new Error('Capacitor appId must match the Bundle ID and server.url must be absent.');
}

// The web content Capacitor packages: the file `cap sync` leaves in the native project (ios/App/App/public), checked after the sync.
const publicDir = path.join('ios', 'App', 'App', 'public');
const html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
if (!/<meta\s+name="biblia-edition"\s+content="standalone"\s*>/.test(html)) {
  throw new Error('public/index.html must carry <meta name="biblia-edition" content="standalone">: this app is the standalone Biblia edition.');
}
for (const required of ['data/canon.json', 'lexicon/he/biblical-index.json']) {
  let info;
  try { info = await stat(path.join(publicDir, ...required.split('/'))); } catch { throw new Error(`The bundled web content is missing public/${required}.`); }
  if (!info.isFile() || info.size < 1000) throw new Error(`public/${required} is empty or not a file.`);
}
const webConfig = JSON.parse(await readFile(path.join(publicDir, 'config.json'), 'utf8'));
const serviceUrl = webConfig?.serviceUrl;
let endpoint;
try { endpoint = new URL(serviceUrl); } catch { throw new Error('The bundled Repository service URL (public/config.json serviceUrl) is missing or invalid.'); }
if (endpoint.protocol !== 'https:' || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  throw new Error('The bundled Repository service URL must be a public HTTPS URL without credentials, query, or fragment.');
}

// REPOSITORY_HEALTH_CHECK_URL redirects only the reachability check (this PC's network blocks the public name); the bundle keeps serviceUrl.
const healthBase = process.env.REPOSITORY_HEALTH_CHECK_URL ? new URL(process.env.REPOSITORY_HEALTH_CHECK_URL) : undefined;
if (healthBase && !/^https?:$/.test(healthBase.protocol)) throw new Error('REPOSITORY_HEALTH_CHECK_URL must be an http(s) URL.');
const healthRoot = healthBase ? healthBase.origin + healthBase.pathname.replace(/\/+$/, '') : serviceUrl.replace(/\/+$/, '');
if (healthBase) console.warn(`validate-staged-release: health check sent to ${healthBase.origin} instead of ${serviceUrl} (REPOSITORY_HEALTH_CHECK_URL)`);
const response = await fetch(`${healthRoot}/health`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
if (!response.ok) throw new Error(`Repository health check returned HTTP ${response.status}.`);
const health = await response.json();
if (health?.ok !== true || health?.service !== 'repository' || health?.contractVersion !== 3) {
  throw new Error('Repository health must return ok=true, service="repository", and contractVersion=3.');
}
console.log(`Validated staged Biblia standalone app ${bundleId} (${buildNumber}) against healthy Repository v3 at ${serviceUrl}.`);
