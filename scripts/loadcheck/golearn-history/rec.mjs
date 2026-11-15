// GoLearn recording probe: the real extension build in a throw-away headless Brave profile, signed in to a throw-away account on a LOCAL
// service (behind a proxy with Render-like delay) that already holds a large history. Looks words up on a page and reads what the card says
// about recording ("Encounter recorded" / "not recorded" / "Could not save"), warm and after the worker was stopped (as the browser does when idle).
//   node rec.mjs <dist> <outFile> <pageUrl>
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

const [DIST, OUT, PAGE] = process.argv.slice(2);
const BASE = process.env.LOADCHECK_TMP ?? path.join(os.tmpdir(), 'loadcheck-golearn-history');
const TMP = path.join(BASE, 'run');
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const PORT = 9345, SVC = 8796, PROXY = 8797, DELAY = Number(process.env.DELAY ?? 250);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cred = JSON.parse(fs.readFileSync(path.join(BASE, 'cred.json'), 'utf8'));

fs.rmSync(TMP, { recursive: true, force: true });
const EXT = path.join(TMP, 'ext');
fs.mkdirSync(EXT, { recursive: true });
for (const e of fs.readdirSync(DIST, { withFileTypes: true })) {
  if (e.isDirectory() && e.name === 'app') fs.cpSync(path.join(DIST, e.name), path.join(EXT, e.name), { recursive: true });
  else if (e.isDirectory()) fs.symlinkSync(path.join(DIST, e.name), path.join(EXT, e.name), 'junction');
  else if (e.name !== 'translation.local.json') fs.copyFileSync(path.join(DIST, e.name), path.join(EXT, e.name));
}
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['https://*/*', 'http://*/*'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));
const cfgPath = path.join(EXT, 'app', 'config.json');
fs.writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')), serviceUrl: `http://127.0.0.1:${PROXY}` }));

const svcCalls = [];
const proxy = createServer((req, res) => {
  const t0 = Date.now();
  setTimeout(() => {
    const up = httpRequest({ host: '127.0.0.1', port: SVC, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); r.on('end', () => svcCalls.push({ m: req.method, p: req.url.split('?')[0], s: r.statusCode, ms: Date.now() - t0, at: t0 })); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  }, req.method === 'OPTIONS' ? DELAY / 2 : DELAY);
}).listen(PROXY, '127.0.0.1');

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
      if (d.method === 'Runtime.exceptionThrown') consoleLog.push({ who, kind: 'exception', text: (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? '').slice(0, 400) });
      if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) consoleLog.push({ who, kind: d.params.type, text: d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400) });
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId, ms = 120000) { const id = ++seq; return new Promise((res) => { this.wait.set(id, res); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); res({ error: { message: `timeout ${method}` } }); } }, ms); }); }
}
const report = { steps: [], console: consoleLog };
const step = (name, ok, detail) => { report.steps.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(detail)?.slice(0, 500)); };
let c, id, swS;
const targets = async () => (await c.send('Target.getTargets')).result.targetInfos;
const attach = async (targetId, name) => { const s = (await c.send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId; c.names.set(s, name); await c.send('Runtime.enable', {}, s); return s; };
const evalIn = async (s, expression, ms) => { const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s, ms); if (r.error) return { error: r.error.message }; if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }; return r.result?.result?.value; };
const findSw = async () => { for (let i = 0; i < 60; i++) { const sw = (await targets()).find((t) => t.type === 'service_worker' && t.url.includes('background.js')); if (sw) return sw; await sleep(250); } return undefined; };
const swAttach = async () => { const sw = await findSw(); if (!sw) return undefined; swS = await attach(sw.targetId, 'worker'); return swS; };

async function shadowText(s) {
  const doc = await c.send('DOM.getDocument', { depth: -1, pierce: true }, s);
  const out = [];
  const walk = (n, inShadow) => { if (inShadow && n.nodeType === 3 && n.nodeValue?.trim()) out.push(n.nodeValue.trim()); for (const ch of n.children ?? []) walk(ch, inShadow); for (const sr of n.shadowRoots ?? []) walk(sr, true); };
  if (doc.result) walk(doc.result.root, false);
  return out.join(' | ');
}

async function lookupOnPage(pageS, nth, label) {
  // the nth Hebrew word of the page, selected as a learner's double-click would
  const picked = await evalIn(pageS, `(() => { const w = document.createTreeWalker(document.body, 4); const words = []; for (let n = w.nextNode(); n; n = w.nextNode()) { const re = /[\\u05D0-\\u05EA][\\u0591-\\u05C7\\u05D0-\\u05EA]*/g; let m; while ((m = re.exec(n.data))) words.push([n, m.index, m[0]]); } const [n, i, word] = words[${nth}] ?? []; if (!n) return null; const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return word; })()`);
  if (!swS) await swAttach();
  const t0 = Date.now();
  const reply = await evalIn(swS, `(async () => { const t = (await chrome.tabs.query({})).find((x) => (x.url ?? '').startsWith(${JSON.stringify(PAGE.slice(0, 30))})); if (!t) return { err: 'no tab' }; return chrome.tabs.sendMessage(t.id, { type: 'golearn:lookup', trigger: 'command', focus: true }).catch((e) => ({ err: String(e) })); })()`);
  let text = '';
  for (let i = 0; i < 40; i++) { await sleep(250); text = await shadowText(pageS); if (/Encounter recorded|Encounter not recorded|Could not save|already recorded/.test(text)) break; }
  const recorded = /Encounter recorded|already recorded/.test(text);
  step(`${label}: lookup of word #${nth}`, recorded, { word: picked, ms: Date.now() - t0, reply, status: (text.match(/(Encounter[^|]*|Could not save[^|]*)/g) ?? []).join(' / ') });
  // close the card
  await evalIn(pageS, `getSelection().removeAllRanges(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
}

async function main() {
  let version;
  for (let i = 0; i < 40 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); } }
  c = new Conn(version.webSocketDebuggerUrl); await c.open();
  const sw = await findSw();
  id = new URL(sw.url).host;
  await swAttach();

  const setupT = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/app/index.html#/languages` })).result.targetId;
  const setS = await attach(setupT, 'setup');
  await sleep(3000);
  for (const [lang, name] of [['he', 'Hebrew'], ['sq', 'Albanian']]) {
    await evalIn(setS, `(() => { document.querySelectorAll('details').forEach((x) => x.open = true); const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Download ${name}')); if (b) b.click(); return !!b; })()`);
    for (let i = 0; i < 60; i++) { const d = await evalIn(setS, `[...document.querySelectorAll('li.mine')].some((l) => l.dataset.language === '${lang}' && /ready/i.test(l.textContent))`); if (d === true) break; await sleep(1000); }
  }
  const t0 = Date.now();
  const conn = await evalIn(setS, `chrome.runtime.sendMessage({ type: 'golearn:connect', baseUrl: 'http://127.0.0.1:${PROXY}', email: ${JSON.stringify(cred.email)}, password: ${JSON.stringify(cred.password)} }).then((r) => ({ ok: r?.ok, error: r?.error }))`);
  step('signed in to the account with a large history', conn?.ok === true, { ...conn, ms: Date.now() - t0 });
  let st;
  for (let i = 0; i < 120; i++) { st = await evalIn(setS, `chrome.runtime.sendMessage({ type: 'golearn:local-repo', op: 'status' })`); if (st?.fromAccount > 0) break; await sleep(1000); }
  step('the account history came down to this device', (st?.fromAccount ?? 0) > 0, { events: st?.events, fromAccount: st?.fromAccount, pendingUpload: st?.pendingUpload, storedChars: st?.storedChars, writeFailures: st?.writeFailures, lastWriteError: st?.lastWriteError, seconds: Math.round((Date.now() - t0) / 1000) });
  const on = await evalIn(setS, `chrome.runtime.sendMessage({ type: 'golearn:active', op: 'set', patch: { active: true } })`);
  step('Active on', on?.settings?.active === true, { ok: on?.ok });
  await evalIn(setS, `chrome.runtime.sendMessage({ type: 'golearn:use-language', languageId: 'he' })`);

  const pageT = (await c.send('Target.createTarget', { url: PAGE })).result.targetId;
  const pageS = await attach(pageT, 'page');
  await c.send('DOM.enable', {}, pageS);
  await c.send('Target.activateTarget', { targetId: pageT });
  await sleep(4000);
  for (let i = 0; i < 4; i++) { await lookupOnPage(pageS, 3 + i * 5, 'warm'); await sleep(1500); }
  // the browser stops an idle worker after ~30 s; stop it now, as it would be when the learner comes back to the page
  await c.send('ServiceWorker.enable', {}, pageS).catch(() => {});
  await c.send('ServiceWorker.stopAllWorkers', {}, pageS);
  swS = undefined;
  await sleep(1500);
  for (let i = 0; i < 3; i++) { await lookupOnPage(pageS, 30 + i * 5, i === 0 ? 'after the worker stopped (cold)' : 'cold, then'); await sleep(1500); }
  const after = await evalIn(setS, `chrome.runtime.sendMessage({ type: 'golearn:local-repo', op: 'status' })`);
  step('device state at the end', true, { events: after?.events, pendingUpload: after?.pendingUpload, storedChars: after?.storedChars, writeFailures: after?.writeFailures, lastWriteError: after?.lastWriteError });
  report.svc = svcCalls.slice(-80);
}

main().catch((e) => { console.log('FAILED', e?.stack ?? e); report.error = String(e?.stack ?? e); })
  .finally(async () => { fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); proxy.close(); browser.kill(); await sleep(1500); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(0); });
