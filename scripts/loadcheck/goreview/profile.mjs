// GoReview load profile: the built review site served like GitHub Pages (gzip, /go-v0/review + /go-v0/dict), the LOCAL throw-away service behind
// a proxy that adds Render-like latency, a throw-away headless Brave profile on a phone-like connection. Signs in with the generated test
// account (cred.json, never printed), then times: cold sign-in screen, sign-in -> home ready, warm reload -> home ready, and each main screen.
//   npx vite-node scripts/loadcheck/goreview/profile.mjs <siteDir> <dictDir> <servicePort> <outFile> [label]
// Each step reports two times: ready (the page's controls are present) and visible (ready, and the goreview-splash element is gone or hidden).
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const need = (name, what) => {
  if (!process.env[name]) throw new Error(`Set ${name} to the ${what}`);
  return process.env[name];
};
import zlib from 'node:zlib';

const [SITE, DICT, SVC_S, OUT, LABEL = 'run'] = process.argv.slice(2);
const SVC = Number(SVC_S);
const BASE = process.env.LOADCHECK_TMP ?? path.join(os.tmpdir(), 'loadcheck-goreview');
const TMP = path.join(BASE, 'profile-' + LABEL);
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const PORT = 9351, WEB = 8898, PROXY = 8899, SVC_DELAY = Number(process.env.SVC_DELAY ?? 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cred = JSON.parse(fs.readFileSync(path.join(BASE, 'cred.json'), 'utf8'));
fs.rmSync(TMP, { recursive: true, force: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.gz': 'application/gzip', '.txt': 'text/plain', '.md': 'text/plain' };
const served = [];
const web = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let file;
  if (u.pathname.startsWith('/go-v0/review/')) file = path.join(SITE, decodeURIComponent(u.pathname.slice('/go-v0/review/'.length)) || 'index.html');
  else if (u.pathname.startsWith('/go-v0/dict/')) file = path.join(DICT, decodeURIComponent(u.pathname.slice('/go-v0/dict/'.length)));
  if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); served.push({ p: u.pathname, s: 404 }); return; }
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  const headers = { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'max-age=600' };
  if (/text|javascript|json|svg|manifest/.test(headers['content-type']) && /gzip/.test(req.headers['accept-encoding'] ?? '')) { body = zlib.gzipSync(body, { level: 6 }); headers['content-encoding'] = 'gzip'; }
  res.writeHead(200, headers); res.end(body);
  served.push({ p: u.pathname, s: 200, b: body.length });
}).listen(WEB, '127.0.0.1');
const svcCalls = [];
const proxy = createServer((req, res) => {
  const t0 = Date.now();
  const go = () => {
    const up = httpRequest({ host: '127.0.0.1', port: SVC, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); r.on('end', () => svcCalls.push({ m: req.method, p: req.url.split('?')[0], s: r.statusCode, ms: Date.now() - t0, at: t0 })); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  };
  setTimeout(go, req.method === 'OPTIONS' ? SVC_DELAY / 2 : SVC_DELAY);
}).listen(PROXY, '127.0.0.1');

const browser = spawn(BRAVE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'profile').replace(/\//g, '\\')}`,
  '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });

let seq = 0;
class Conn {
  constructor(url) { this.ws = new WebSocket(url); this.wait = new Map(); this.handlers = []; this.ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); } else for (const h of this.handlers) h(d); }; }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId) { const id = ++seq; return new Promise((res) => { this.wait.set(id, res); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); res({ error: { message: 'timeout ' + method } }); } }, 90000); }); }
}
let c;
const evalIn = async (s, expression) => { const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s); if (r.error) return { error: r.error.message }; if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }; return r.result?.result?.value; };
const STATE = `(() => { const m = document.querySelector('main') || document.getElementById('app'); const loading = document.querySelectorAll('.go-loading').length; const splash = !!document.querySelector('#splash, .splash, [data-splash]');
  const ready = !!document.querySelector('#resume-session, [data-action="begin-new-deck"], [data-action="start-session"], #signin-email, #signin-password');
  const g = document.getElementById('goreview-splash');
  const splashGone = !g || (() => { const cs = getComputedStyle(g); return cs.display === 'none' || cs.opacity === '0' || g.hasAttribute('hidden'); })();
  return { route: m?.getAttribute('data-route') ?? '', loading, splash, text: (m?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 160),
    ready, visible: ready && splashGone }; })()`;
const report = { label: LABEL, svcDelayMs: SVC_DELAY, steps: [] };
const VISIBLE_GRACE = 10000; // after 'ready', how long to wait for the GoReview splash to clear before reporting visible as not reached
async function until(s, name, test, ms = 90000) {
  const t0 = Date.now(); const trail = []; let last = '';
  const svcFrom = svcCalls.length, webFrom = served.length;
  let readyMs = null, visibleMs = null, atReady = null;
  while (Date.now() - t0 < ms) {
    const st = await evalIn(s, STATE);
    const key = st && !st.error ? `${st.route}|${st.loading}|${st.text.slice(0, 60)}` : JSON.stringify(st);
    if (key !== last) { trail.push({ t: Date.now() - t0, ...st }); last = key; }
    if (st && !st.error && readyMs === null && test(st)) {
      readyMs = Date.now() - t0;
      atReady = { svc: svcCalls.slice(svcFrom).map((x) => ({ ...x, at: x.at - t0 })), web: served.slice(webFrom).length, webBytes: served.slice(webFrom).reduce((a, b) => a + (b.b ?? 0), 0), webList: served.slice(webFrom).map((x) => x.p.replace('/go-v0/', '') + (x.s === 404 ? ' 404' : '')) };
    }
    if (readyMs !== null && st && !st.error && st.visible && test(st)) { visibleMs = Date.now() - t0; break; }
    if (readyMs !== null && Date.now() - t0 - readyMs > VISIBLE_GRACE) break;
    await sleep(100);
  }
  if (readyMs === null) { report.steps.push({ name, ms, ok: false, trail, svc: svcCalls.slice(svcFrom) }); console.log(`${name}: TIMEOUT`); return undefined; }
  const step = { name, ms: readyMs, visibleMs, ok: true, trail, ...atReady };
  report.steps.push(step);
  console.log(`${name}: ready ${readyMs} ms, visible ${visibleMs === null ? 'not reached' : visibleMs + ' ms'} (svc calls ${step.svc.length}, web files ${step.web}, ${Math.round(step.webBytes / 1024)} KB)`);
  return step;
}
const homeReady = (st) => st.route.startsWith('review') && st.loading === 0 && st.ready;

try {
  let version; for (let i = 0; i < 40 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); } }
  c = new Conn(version.webSocketDebuggerUrl); await c.open();
  const pageT = (await c.send('Target.createTarget', { url: 'about:blank' })).result.targetId;
  const s = (await c.send('Target.attachToTarget', { targetId: pageT, flatten: true })).result.sessionId;
  await c.send('Network.enable', {}, s); await c.send('Runtime.enable', {}, s);
  // a phone on a good 4G connection: 100 ms round trip, 12 Mbit/s down, 4 Mbit/s up; CPU slowed 2x
  await c.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 1.5e6, uploadThroughput: 0.5e6 }, s);
  await c.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU ?? 2) }, s);
  const URL0 = `http://127.0.0.1:${WEB}/go-v0/review/`;
  await c.send('Page.navigate', { url: URL0 + '#/review' }, s);
  await until(s, 'cold open -> sign-in form', (st) => st.route.startsWith('signin') && st.loading === 0 && st.text.length > 0);
  await evalIn(s, `(() => { const e = document.getElementById('signin-email'), p = document.getElementById('signin-password'); const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }; set(e, ${JSON.stringify(cred.email)}); set(p, ${JSON.stringify(cred.password)}); (p.form?.querySelector('button[type=submit]') ?? p.form)?.click?.() ?? p.form.requestSubmit(); return 1; })()`);
  await until(s, 'sign in -> home ready', homeReady);
  await sleep(4000); // let the first sync settle as a learner would
  await c.send('Page.reload', {}, s);
  await until(s, 'warm reload -> home ready', homeReady);
  for (const r of ['vocabulary', 'decks', 'history', 'settings', 'review']) {
    await evalIn(s, `location.hash = '#/${r}'`);
    await until(s, `go to ${r}`, (st) => st.route.startsWith(r) && st.loading === 0 && st.text.length > 20);
  }
  // starting the deck
  const started = await evalIn(s, `(() => { const b = document.querySelector('#resume-session, [data-action="begin-new-deck"], [data-action="start-session"]'); if (!b) return 'none'; b.click(); return b.id || b.getAttribute('data-action'); })()`);
  console.log('start button:', started);
  await until(s, 'start deck -> first card', (st) => st.route.startsWith('review/session') && st.loading === 0 && st.text.length > 20, 60000);
} catch (e) { console.log('FAILED', e?.stack ?? e); }
finally { fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); web.close(); proxy.close(); browser.kill(); await sleep(1000); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(0); }
