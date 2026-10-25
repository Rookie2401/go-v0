import { readFile } from 'node:fs/promises';
import { validateAppIcons } from './validate-app-icon.mjs';

const app = JSON.parse(await readFile('app.json', 'utf8'));
const capacitor = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
const webConfig = JSON.parse(await readFile('web/config.json', 'utf8'));
const bundleId = app?.expo?.ios?.bundleIdentifier;
const buildNumber = app?.expo?.ios?.buildNumber;
const serviceUrl = webConfig?.serviceUrl;

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
let endpoint;
try { endpoint = new URL(serviceUrl); } catch { throw new Error('The bundled Repository service URL is missing or invalid.'); }
if (endpoint.protocol !== 'https:' || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  throw new Error('The bundled Repository service URL must be a public HTTPS URL without credentials, query, or fragment.');
}
const response = await fetch(`${serviceUrl.replace(/\/+$/, '')}/health`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
if (!response.ok) throw new Error(`Repository health check returned HTTP ${response.status}.`);
const health = await response.json();
if (health?.ok !== true || health?.service !== 'repository' || health?.contractVersion !== 3) {
  throw new Error('Repository health must return ok=true, service="repository", and contractVersion=3.');
}
console.log(`Validated staged GoReview app ${bundleId} against healthy Repository v3.`);
