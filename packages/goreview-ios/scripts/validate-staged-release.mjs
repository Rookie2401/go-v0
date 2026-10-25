import { readFile } from 'node:fs/promises';
import { validateAppIcons } from './validate-app-icon.mjs';
import { resolveProjectId, validateBundledAssets } from './release-inputs.mjs';

const app = JSON.parse(await readFile('app.json', 'utf8'));
const capacitor = JSON.parse(await readFile('capacitor.config.json', 'utf8'));
const webConfig = JSON.parse(await readFile('web/config.json', 'utf8'));
const nativeConfig = JSON.parse(await readFile('ios/App/App/public/config.json', 'utf8'));
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
if (nativeConfig.serviceUrl !== serviceUrl) throw new Error('The native bundle and web bundle must use the same Repository endpoint.');
if (!resolveProjectId({ tracked: app?.expo?.extra?.eas?.projectId })) throw new Error('The stage is not linked to the existing GoReview Expo project.');
const languages = app?.expo?.extra?.goreviewRelease?.dictionaryLanguages;
if (!Array.isArray(languages) || languages.some((v) => typeof v !== 'string')) throw new Error('The staged app must record its selected dictionary languages.');
await validateBundledAssets('web', languages);
await validateBundledAssets('ios/App/App/public', languages);
for (const project of ['ios/App/App.xcodeproj/project.pbxproj', 'ios/GoReview.xcodeproj/project.pbxproj']) {
  const text = await readFile(project, 'utf8');
  for (const [key, expected] of [['CURRENT_PROJECT_VERSION', buildNumber], ['MARKETING_VERSION', app.expo.version], ['PRODUCT_BUNDLE_IDENTIFIER', bundleId]]) {
    const values = [...text.matchAll(new RegExp(`^\\s*${key}\\s*=\\s*([^;]+);`, 'gm'))].map((m) => m[1].trim().replace(/^"|"$/g, ''));
    if (values.length < 2 || values.some((v) => v !== expected)) throw new Error(`${project} does not consistently use staged ${key}=${expected}.`);
  }
}
let endpoint;
try { endpoint = new URL(serviceUrl); } catch { throw new Error('The bundled Repository service URL is missing or invalid.'); }
if (endpoint.protocol !== 'https:' || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  throw new Error('The bundled Repository service URL must be a public HTTPS URL without credentials, query, or fragment.');
}
// REPOSITORY_HEALTH_CHECK_URL: where THIS machine reaches the same service when the public name is filtered here (the owner's router);
// the bundle still carries serviceUrl. The same rule as prepare-web.mjs (2026-10-25).
const probe = process.env.REPOSITORY_HEALTH_CHECK_URL ? new URL(process.env.REPOSITORY_HEALTH_CHECK_URL) : undefined;
if (probe && !/^https?:$/.test(probe.protocol)) throw new Error('REPOSITORY_HEALTH_CHECK_URL must be an http(s) URL.');
const healthBase = probe ? probe.origin + probe.pathname.replace(/\/+$/, '') : serviceUrl.replace(/\/+$/, '');
if (probe) console.warn(`validate-staged-release: health check sent to ${healthBase} instead of ${serviceUrl} (REPOSITORY_HEALTH_CHECK_URL); the bundle still uses ${serviceUrl}`);
const response = await fetch(`${healthBase}/health`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
if (!response.ok) throw new Error(`Repository health check returned HTTP ${response.status}.`);
const health = await response.json();
if (health?.ok !== true || health?.service !== 'repository' || health?.contractVersion !== 3) {
  throw new Error('Repository health must return ok=true, service="repository", and contractVersion=3.');
}
console.log(`Validated staged GoReview app ${bundleId} against healthy Repository v3.`);
