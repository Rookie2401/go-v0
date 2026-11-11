// GoLearn Hebrew + Active probe: the real extension build in a throw-away headless Brave profile. Downloads Hebrew (and Albanian) on the
// setup page, switches Active on, opens Psalm 110 laid out like Mechon Mamre's page (vowels, no cantillation, "--" for maqaf), and times
// the popup's language switch while that page is open; reports what Active found on the page.
//   node he.mjs <dist> <outFile>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const need = (name, what) => {
  if (!process.env[name]) throw new Error(`Set ${name} to the ${what}`);
  return process.env[name];
};

const DIST = process.argv[2];
const OUT = process.argv[3];
const TMP = process.env.LOADCHECK_TMP ?? path.join(os.tmpdir(), 'loadcheck-golearn-he-signed');
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const PORT = 9343, WEB = 8773;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(TMP, { recursive: true, force: true });
const EXT = path.join(TMP, 'ext');
fs.mkdirSync(EXT, { recursive: true });
for (const e of fs.readdirSync(DIST, { withFileTypes: true })) {
  if (e.isDirectory() && e.name === 'app') fs.cpSync(path.join(DIST, e.name), path.join(EXT, e.name), { recursive: true });
  else if (e.isDirectory()) fs.symlinkSync(path.join(DIST, e.name), path.join(EXT, e.name), 'junction');
  else fs.copyFileSync(path.join(DIST, e.name), path.join(EXT, e.name));
}
// the shipped service address points at a proxy in front of a LOCAL throw-away service: its delay and outage are set per phase below
const SVC = 8796, PROXY = 8797;
const cfgPath = path.join(EXT, 'app', 'config.json');
fs.writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')), serviceUrl: `http://127.0.0.1:${PROXY}` }));
const svcMode = { delay: 200, down: false };
const svcCalls = [];
const { request: httpRequest } = await import('node:http');
const proxy = createServer((req, res) => {
  const t0 = Date.now();
  if (svcMode.down) { svcCalls.push({ p: req.url.split('?')[0], m: req.method, down: true, at: t0 }); return; } // a hung connection, as a blocked network gives
  setTimeout(() => {
    const up = httpRequest({ host: '127.0.0.1', port: SVC, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); r.on('end', () => svcCalls.push({ p: req.url.split('?')[0], m: req.method, s: r.statusCode, ms: Date.now() - t0, at: t0 })); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  }, svcMode.delay);
}).listen(PROXY, '127.0.0.1');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
// granted at install, as the learner's click on the Active switch would grant it
manifest.host_permissions = ['https://*/*', 'http://*/*'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));

// Psalm 110 from Biblia's MAM data: cantillation removed (U+0591-U+05AF, U+05BD meteg, paseq), maqaf as "--", like Mechon Mamre
const ps = JSON.parse(fs.readFileSync(need('LOADCHECK_PSALMS_JSON', 'path of biblia-v0 public/data/he/Ps.json'), 'utf8')).chapters[109];
const plain = (t) => t.replace(/[\u0591-\u05AF\u05BD\u05C0]/g, '').replace(/\u05BE/g, '--').replace(/\u05C3/g, ':').replace(/\s+/g, ' ').trim();
const verses = ps.verses.map((v) => `<tr><td class="h">${plain(v.t)}</td><td>${v.n} English line ${v.n} of the psalm.</td></tr>`).join('');
const html = `<!doctype html><html dir="ltr"><head><meta charset="utf-8"><title>Psalms 110 / Hebrew - English</title></head><body><h1>Psalms Chapter 110 תְּהִלִּים</h1><table>${verses}</table></body></html>`;
const server = createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(req.url.startsWith('/other') ? '<!doctype html><title>Other</title><p>An English page about the weather today.</p>' : html); }).listen(WEB, '127.0.0.1');

const browser = spawn(BRAVE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'profile').replace(/\//g, '\\')}`,
  `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });

let seq = 0;
const consoleLog = [];
class Conn {
  constructor(url) {
    this.ws = new WebSocket(url); this.wait = new Map(); this.names = new Map();
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); return; }
      const who = this.names.get(d.sessionId) ?? 'browser';
      if (d.method === 'Runtime.exceptionThrown') consoleLog.push({ who, kind: 'exception', text: (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? '').slice(0, 500) });
      if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) consoleLog.push({ who, kind: d.params.type, text: d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500) });
      if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level)) consoleLog.push({ who, kind: 'log', text: `${d.params.entry.text} ${d.params.entry.url ?? ''}`.slice(0, 500) });
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId, ms = 90000) { const id = ++seq; return new Promise((res) => { this.wait.set(id, res); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); res({ error: { message: `timeout ${method}` } }); } }, ms); }); }
}
const report = { steps: [], console: consoleLog };
const step = (name, ok, detail) => { report.steps.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(detail)?.slice(0, 600)); };
let c, id;
const targets = async () => (await c.send('Target.getTargets')).result.targetInfos;
const attach = async (targetId, name) => { const s = (await c.send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId; c.names.set(s, name); await c.send('Runtime.enable', {}, s); await c.send('Log.enable', {}, s); return s; };
const evalIn = async (s, expression, ms) => { const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s, ms); if (r.error) return { error: r.error.message }; if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }; return r.result?.result?.value; };
const findSw = async () => { for (let i = 0; i < 40; i++) { const sw = (await targets()).find((t) => t.type === 'service_worker' && t.url.includes('background.js')); if (sw) return sw; await sleep(250); } return undefined; };

async function popupSwitch(lang) {
  const t = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/action/popup.html` })).result.targetId;
  const s = await attach(t, 'popup');
  await sleep(1500);
  const before = await evalIn(s, `(() => ({ value: document.getElementById('language-select')?.value, options: [...(document.getElementById('language-select')?.options ?? [])].map((o) => o.value), line: document.getElementById('language')?.textContent, page: document.getElementById('active-page')?.textContent }))()`);
  const t0 = Date.now();
  const res = await evalIn(s, `(async () => { const sel = document.getElementById('language-select'); if (![...sel.options].some((o) => o.value === '${lang}')) return { err: 'not offered' }; sel.value = '${lang}'; sel.dispatchEvent(new Event('change')); for (let i = 0; i < 240; i++) { await new Promise((r) => setTimeout(r, 250)); const l = document.getElementById('language').textContent; if (!/Switching/.test(l)) return { line: l, page: document.getElementById('active-page')?.textContent }; } return { line: document.getElementById('language').textContent, stuck: true }; })()`, 120000);
  const ms = Date.now() - t0;
  await c.send('Target.closeTarget', { targetId: t });
  return { ms, before, res };
}

async function main() {
  let version;
  for (let i = 0; i < 40 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); } }
  c = new Conn(version.webSocketDebuggerUrl); await c.open();
  const sw = await findSw();
  if (!sw) throw new Error('the extension did not load');
  id = new URL(sw.url).host;
  const swS = await attach(sw.targetId, 'worker');

  // a throw-away account on the LOCAL service (never printed), signed in as the learner is
  const setupT = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/app/index.html#/languages` })).result.targetId;
  const setS = await attach(setupT, 'setup');
  await sleep(3000);
  const email = `he-${Date.now().toString(36)}@example.test`;
  const password = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
  const made = await evalIn(setS, `chrome.runtime.sendMessage({ type: 'golearn:create-account', baseUrl: 'http://127.0.0.1:${PROXY}', email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)}, displayName: 'Probe' }).then((r) => ({ ok: r?.ok, error: r?.error, message: r?.message }))`);
  step('signed in (new local account)', made?.ok === true, made);
  await evalIn(setS, `location.reload()`); await sleep(3000);
  for (const [lang, name] of [['he', 'Hebrew'], ['sq', 'Albanian']]) {
    const t0 = Date.now();
    const clicked = await evalIn(setS, `(() => { document.querySelectorAll('details').forEach((x) => x.open = true); const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Download ${name}')); if (!b) return 'no button: ' + [...document.querySelectorAll('button')].map((x)=>x.textContent.trim()).filter(Boolean).slice(0,30).join(' | '); b.click(); return 'clicked'; })()`);
    let done = '';
    for (let i = 0; i < 180; i++) {
      done = await evalIn(setS, `(() => [...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === '${lang}').map((l) => l.textContent.replace(/\\s+/g, ' ').slice(0, 120)).join('|'))()`);
      if (done && /ready|not verify|already/i.test(done)) break;
      await sleep(1000);
    }
    step(`download ${lang}`, /ready/i.test(done ?? ''), { clicked, state: done, seconds: Math.round((Date.now() - t0) / 1000) });
  }

  // Active on (the permission is already granted in this throw-away copy)
  const on = await evalIn(setS, `chrome.runtime.sendMessage({ type: 'golearn:active', op: 'set', patch: { active: true } })`);
  step('Active on', on?.settings?.active === true, on);

  // the Psalm page, and a few other tabs as a learner has open
  const others = [];
  for (let i = 0; i < 3; i++) others.push((await c.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/other${i}` })).result.targetId);
  const pageT = (await c.send('Target.createTarget', { url: process.env.PAGE_URL ?? `http://127.0.0.1:${WEB}/psalm110` })).result.targetId;
  const pageS = await attach(pageT, 'psalm');
  await c.send('Target.activateTarget', { targetId: pageT });
  const pageState = async () => evalIn(swS, `(async () => { const t = (await chrome.tabs.query({})).find((x) => (x.url ?? x.pendingUrl ?? '').endsWith('/psalm110') || (x.url ?? x.pendingUrl ?? '').includes('pt26b0')); if (!t) return { err: 'no tab' }; return chrome.tabs.sendMessage(t.id, { type: 'golearn:ping' }).catch((e) => ({ err: String(e) })); })()`);
  let st;
  for (let i = 0; i < 60; i++) { st = await pageState(); if (st?.activeState?.scanned) break; await sleep(500); }
  step('psalm page scanned on load (reading language as set by the downloads)', !!st?.activeState?.scanned, st);
  report.marksOnLoad = await evalIn(pageS, `document.querySelectorAll('[data-golearn-level], golearn-mark, .golearn-mark').length`);

  for (const [phase, delay, down] of [['service quick', 200, false], ['service slow (6 s a request)', 6000, false], ['service unreachable (hangs)', 0, true]]) {
    svcMode.delay = delay; svcMode.down = down;
    for (const lang of ['he', 'sq', 'he']) {
      const from = svcCalls.length;
      const r = await popupSwitch(lang);
      step(`[${phase}] popup switch -> ${lang} (${r.ms} ms)`, !r.res?.stuck && r.ms < 5000, { ...r, svc: svcCalls.slice(from).map((x) => `${x.m} ${x.p} ${x.down ? 'HUNG' : x.ms}`) });
      await sleep(1500);
      const after = await pageState();
      step(`[${phase}] psalm page after switch -> ${lang}`, !!after?.activeState && after.activeState.languageId === lang, after?.activeState ? { lang: after.activeState.languageId, scanned: after.activeState.scanned, marked: after.activeState.marked } : after);
    }
  }
  report.svc = svcCalls.slice(-60);
}

main().catch((e) => { console.log('FAILED', e?.stack ?? e); report.error = String(e?.stack ?? e); })
  .finally(async () => { fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); server.close(); proxy.close(); browser.kill(); await sleep(1500); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(0); });
