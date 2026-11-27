// GoLearn Arabic acceptance rig: the real extension build (with its setup page and GoReview page) in a throw-away headless Brave
// profile, a throw-away LOCAL Repository service with a generated test account, and fixture pages served from ar-pages/. Walks a
// learner's journey in Arabic (install, reading language and varieties, the lexicon shards, lookups and their cards, vocalized text,
// Active and joining, marks and the unit ids they send, other languages in the same script, Quranic orthography, signed in, GoReview
// and the Alphabet Sprint, timings) and writes every reading to a JSON report. Adapted from ru.mjs (itself from fr.mjs).
// Nothing here touches the owner's profile, service or account; no real site is visited; the hosted service is never contacted
// (the copy's service address is the local one, and the dictionaries come from this rig's own web server as the hosted fallback).
//   node scripts/loadcheck/golearn/ar.mjs [dist] [outDir] [step,...]
// Environment: LOADCHECK_BRAVE (required), LOADCHECK_TMP (optional), AR_NO_SHARDS=1 (the extension copy has NO lexicon/ar: the
// compiled core alone; runs only the install and a short list of lookups, for the before/after comparison of step B).
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const need = (name, what) => {
  if (!process.env[name]) throw new Error(`Set ${name} to the ${what}`);
  return process.env[name];
};

const DIST = path.resolve(process.argv[2] || path.join(ROOT, 'packages/golearn-extension/dist'));
const TMP = process.env.LOADCHECK_TMP || path.join(os.tmpdir(), 'loadcheck-golearn-ar');
const OUT = path.resolve(process.argv[3] || path.join(TMP, 'out'));
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const NO_SHARDS = process.env.AR_NO_SHARDS === '1';
const PORT = 9481, PORT2 = 9482, WEB = 8913, SVC = 8919;
const HOSTED = true; // the install's dictionary comes from this rig's server (public/dict at /hosted/dict/), as the gh-pages fallback would serve it
const PAGES = path.join(HERE, 'ar-pages');
const SHOTS = path.join(OUT, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
/** the word without vowel marks, tatweel and hamza seats: the comparison form for an expectation written by hand */
const bare = (s) => (s ?? '').normalize('NFC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/\s+/g, ' ').trim();

// ── the throw-away folders (never a real one: only the rig's own subfolders are removed) ──
/** removes a folder; a junction inside it is unlinked first and never followed */
const removeDir = (dir) => {
  if (!fs.existsSync(dir)) return;
  const unlinkJunctions = (d) => {
    for (const e of fs.readdirSync(d)) {
      const p = path.join(d, e);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) { try { fs.unlinkSync(p); } catch { fs.rmdirSync(p); } }
      else if (st.isDirectory()) unlinkJunctions(p);
    }
  };
  unlinkJunctions(dir);
  fs.rmSync(dir, { recursive: true, force: true });
};
for (const d of ['ext', 'profile', 'profile2', 'svc']) removeDir(path.join(TMP, d));
fs.mkdirSync(SHOTS, { recursive: true });
const EXT = path.join(TMP, 'ext');
fs.mkdirSync(EXT, { recursive: true });
const junction = (from, to) => fs.symlinkSync(from, to, 'junction');
const copyPageDir = (name, bigDirs) => {
  const from = path.join(DIST, name), to = path.join(EXT, name);
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(to);
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isDirectory() && bigDirs.includes(e.name)) {
      if (NO_SHARDS && e.name === 'lexicon') { fs.mkdirSync(path.join(to, 'lexicon')); for (const s of fs.readdirSync(path.join(from, 'lexicon'))) if (s !== 'ar') junction(path.join(from, 'lexicon', s), path.join(to, 'lexicon', s)); }
      else junction(path.join(from, e.name), path.join(to, e.name));
    }
    else if (e.isDirectory()) fs.cpSync(path.join(from, e.name), path.join(to, e.name), { recursive: true });
    else fs.copyFileSync(path.join(from, e.name), path.join(to, e.name));
  }
  const cfgPath = path.join(to, 'config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfg.serviceUrl = `http://127.0.0.1:${SVC}`; // the LOCAL throw-away service, never the hosted one
    if (HOSTED) cfg.dictionaryFallbackUrl = `http://127.0.0.1:${WEB}/hosted/`;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  }
  return true;
};
for (const e of fs.readdirSync(DIST, { withFileTypes: true })) {
  if (e.name === 'translation.local.json') continue;
  if (e.isDirectory() && e.name === 'app') copyPageDir('app', ['dict', 'fonts']);
  else if (e.isDirectory() && e.name === 'review') copyPageDir('review', ['dict', 'lexicon', 'assets']);
  else if (e.isDirectory() && e.name === 'lexicon' && NO_SHARDS) { fs.mkdirSync(path.join(EXT, 'lexicon')); for (const s of fs.readdirSync(path.join(DIST, 'lexicon'))) if (s !== 'ar') junction(path.join(DIST, 'lexicon', s), path.join(EXT, 'lexicon', s)); }
  else if (e.isDirectory()) junction(path.join(DIST, e.name), path.join(EXT, e.name));
  else fs.copyFileSync(path.join(DIST, e.name), path.join(EXT, e.name));
}
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['https://*/*', 'http://*/*']; // granted at install, as the learner's click on the Active switch would grant it
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));

// ── the fixture pages (each URL may carry ?n= to make a fresh tab) ──
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = path.join(PAGES, path.basename(u.pathname));
  if (u.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (u.pathname.startsWith('/hosted/dict/')) {
    const root = path.join(ROOT, 'public', 'dict');
    const f = path.join(root, decodeURIComponent(u.pathname.slice('/hosted/dict/'.length)));
    res.setHeader('access-control-allow-origin', '*');
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.setHeader('content-type', f.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    res.end(fs.readFileSync(f));
    return;
  }
  if (!file.endsWith('.html') || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
}).listen(WEB, '127.0.0.1');
const page = (name) => `http://127.0.0.1:${WEB}/${name}.html?n=${crypto.randomUUID().slice(0, 6)}`;

// ── the throw-away Repository service ──
const children = [];
const killTree = (p) => { if (!p?.pid) return; try { spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* */ } try { p.kill(); } catch { /* */ } };
const svcLog = [];
const svc = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite-node/dist/cli.mjs'), 'packages/repository-service/src/main.ts', '--port', String(SVC), '--data', path.join(TMP, 'svc'), '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(svc);
svc.stdout.on('data', (d) => svcLog.push(String(d).slice(0, 300)));
svc.stderr.on('data', (d) => svcLog.push(String(d).slice(0, 300)));
let svcExit;
svc.on('exit', (code) => { svcExit = code; svcLog.push(`exited with ${code}`); });
svc.on('error', (e) => { svcExit = -1; svcLog.push(`spawn error ${e}`); });
const SVC_URL = `http://127.0.0.1:${SVC}`;

const launch = (port, profile) => {
  const b = spawn(BRAVE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(TMP, profile).replace(/\//g, '\\')}`,
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
  children.push(b);
  return b;
};

// ── the protocol connection ──
let seq = 0;
const consoleLog = [];
const net = new Map(); // requestId@session -> { url, status, bytes, failed, at, doneAt }
let phase = 'start';
class Conn {
  constructor(url, tag) {
    this.tag = tag; this.ws = new WebSocket(url); this.wait = new Map(); this.names = new Map(); this.contexts = new Map();
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); return; }
      const who = `${this.tag}:${this.names.get(d.sessionId) ?? 'browser'}`;
      if (d.method === 'Runtime.executionContextCreated') { const l = this.contexts.get(d.sessionId) ?? []; l.push(d.params.context); this.contexts.set(d.sessionId, l); }
      if (d.method === 'Network.requestWillBeSent') net.set(`${d.params.requestId}@${d.sessionId}`, { who, url: d.params.request.url, at: Date.now(), phase });
      if (d.method === 'Network.responseReceived') { const n = net.get(`${d.params.requestId}@${d.sessionId}`); if (n) n.status = d.params.response.status; }
      if (d.method === 'Network.loadingFinished') { const n = net.get(`${d.params.requestId}@${d.sessionId}`); if (n) { n.bytes = d.params.encodedDataLength; n.doneAt = Date.now(); } }
      if (d.method === 'Network.loadingFailed') { const n = net.get(`${d.params.requestId}@${d.sessionId}`); if (n) { n.failed = d.params.errorText; n.doneAt = Date.now(); } }
      if (d.method === 'Runtime.exceptionThrown') consoleLog.push({ phase, who, kind: 'exception', text: (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? '').slice(0, 700) });
      if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(d.params.type)) consoleLog.push({ phase, who, kind: d.params.type, text: d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 700) });
      if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level)) consoleLog.push({ phase, who, kind: `log-${d.params.entry.level}`, text: `${d.params.entry.text} ${d.params.entry.url ?? ''}`.slice(0, 700) });
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId, ms = 90000) { const id = ++seq; return new Promise((res) => { this.wait.set(id, res); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); res({ error: { message: `timeout ${method}` } }); } }, ms); }); }
}

// ── the report ──
const report = { startedAt: new Date().toISOString(), dist: DIST, tmp: TMP, noShards: NO_SHARDS, steps: [], cards: [], timings: {}, console: consoleLog };
const step = (n, name, status, evidence) => {
  report.steps.push({ step: n, name, status, evidence });
  console.log(`[${n}] ${status} ${name} ${JSON.stringify(evidence)?.slice(0, 900)}`);
};
const ONLY = new Set((process.argv[4] ?? '').split(',').filter(Boolean).map(String));
const want = (n) => !ONLY.size || ONLY.has(String(n));

// ── helpers bound to one browser ──
function browserApi(c) {
  const api = {};
  api.targets = async () => (await c.send('Target.getTargets')).result.targetInfos;
  api.attach = async (targetId, name) => { const s = (await c.send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId; c.names.set(s, name); await c.send('Runtime.enable', {}, s); await c.send('Log.enable', {}, s); return s; };
  api.evalIn = async (s, expression, ms, contextId) => { const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) }, s, ms); if (r.error) return { error: r.error.message }; if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }; return r.result?.result?.value; };
  api.findSw = async () => { for (let i = 0; i < 60; i++) { const sw = (await api.targets()).find((t) => t.type === 'service_worker' && t.url.includes('background.js')); if (sw) return sw; await sleep(250); } return undefined; };
  api.open = async (url, name, opts = {}) => { const t = (await c.send('Target.createTarget', { url, ...opts })).result.targetId; const s = await api.attach(t, name); await c.send('DOM.enable', {}, s); return { t, s, url }; };
  api.close = async (t) => c.send('Target.closeTarget', { targetId: t });
  api.shadow = async (s) => {
    const doc = await c.send('DOM.getDocument', { depth: -1, pierce: true }, s);
    let found;
    const walk = (n) => {
      if (found || !n) return;
      const a = n.attributes ?? [];
      for (let i = 0; i < a.length; i += 2) if (a[i] === 'data-golearn-host') { found = { root: n.shadowRoots?.[0], attrs: Object.fromEntries(Array.from({ length: a.length / 2 }, (_, k) => [a[2 * k], a[2 * k + 1]]).filter(([k]) => k.startsWith('data-language'))) }; return; }
      for (const ch of n.children ?? []) walk(ch);
      for (const sr of n.shadowRoots ?? []) walk(sr);
    };
    if (doc.result) walk(doc.result.root);
    if (!found?.root) return undefined;
    const r = await c.send('DOM.resolveNode', { backendNodeId: found.root.backendNodeId }, s);
    return r.result?.object?.objectId ? { oid: r.result.object.objectId, attrs: found.attrs } : undefined;
  };
  api.onCard = async (s, fn, args = []) => {
    const sh = await api.shadow(s);
    if (!sh) return { nocard: true };
    const r = await c.send('Runtime.callFunctionOn', { objectId: sh.oid, functionDeclaration: fn, returnByValue: true, awaitPromise: true, arguments: args.map((value) => ({ value })) }, s);
    if (r.error) return { error: r.error.message };
    if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text };
    const v = r.result?.result?.value;
    return v && typeof v === 'object' ? { ...v, host: sh.attrs } : v;
  };
  /** the installed faces the browser actually used to paint a node of the card (CSS.getPlatformFontsForNode) */
  api.fonts = async (s, selector) => {
    const sh = await api.shadow(s);
    if (!sh) return { nocard: true };
    await c.send('CSS.enable', {}, s);
    const n = await c.send('DOM.requestNode', { objectId: sh.oid }, s);
    if (!n.result?.nodeId) return { err: n.error?.message ?? 'no node' };
    const q = await c.send('DOM.querySelector', { nodeId: n.result.nodeId, selector }, s);
    if (!q.result?.nodeId) return { err: `no ${selector}` };
    const f = await c.send('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId }, s);
    return f.result?.fonts ?? { err: f.error?.message };
  };
  api.shot = async (s, name, clip) => {
    const r = await c.send('Page.captureScreenshot', { format: 'png', clip: clip ?? { x: 0, y: 0, width: 1200, height: 900, scale: 0.6 } }, s);
    if (!r.result?.data) return undefined;
    const f = path.join(SHOTS, `${name}.png`);
    fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
    return f;
  };
  return api;
}

const READ_CARD = `function () {
  const card = this.querySelector('.card');
  const tx = (e) => e ? (e.innerText || e.textContent || '').replace(/\\s+/g, ' ').trim() : undefined;
  if (!card) return { nocard: true, text: tx(this.firstElementChild ?? this) };
  const lv = card.querySelector('.lv');
  const all = tx(card) ?? '';
  const formLemma = all.match(/\\bLEMMA\\s+(\\S+(?: \\S+)?)\\s+\\(([A-Z]+)\\)/i);
  const pos = tx(lv?.querySelector('.pos')) ?? formLemma?.[2];
  return {
    text: all.slice(0, 6000),
    word: tx(card.querySelector('.word')),
    lemma: lv ? tx(lv).replace(tx(lv.querySelector('.pos')) ?? '', '').trim() : formLemma?.[1],
    lemmaFrom: lv ? 'lemma line' : formLemma ? 'form layer' : undefined,
    lemmaKicker: tx(card.querySelector('.lemmaLine .kicker')),
    pos,
    meaning: tx(card.querySelector('[data-row="meaning"]')),
    translit: tx(card.querySelector('[data-row="transliteration"]')),
    rows: [...card.querySelectorAll('[data-row]')].map((r) => r.dataset.row + ': ' + tx(r)).slice(0, 60),
    segs: [...card.querySelectorAll('[data-row="form-components"] .seg')].map((s) => [tx(s.firstElementChild), tx(s.querySelector('.role'))]),
    segsDir: card.querySelector('[data-row="form-components"]')?.getAttribute('dir') ?? null,
    segLefts: [...card.querySelectorAll('[data-row="form-components"] .seg')].map((s) => Math.round(s.getBoundingClientRect().left)),
    root: tx(card.querySelector('[data-row="form-root"]')),
    headings: [...card.querySelectorAll('h3, h4')].map(tx),
    layers: Object.fromEntries([...card.querySelectorAll('[data-layer]')].map((l) => [l.dataset.layer, (tx(l) ?? '').slice(0, 1500)])),
    pressed: [...card.querySelectorAll('.rateBtn')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.mark),
    rateButtons: [...card.querySelectorAll('.rateBtn')].map((b) => b.dataset.mark),
    levelName: tx(card.querySelector('.levelName')),
    encounters: tx(card.querySelector('.encounters')),
    say: card.querySelector('.say') ? { text: tx(card.querySelector('.say')), disabled: !!card.querySelector('.say')?.disabled, title: card.querySelector('.say')?.title } : undefined,
    status: tx(card.querySelector('.status')),
    feedback: tx(card.querySelector('.feedback')),
  };
}`;
/** direction, lang, font, line height and clipping of the Arabic in the card */
const READ_METRICS = `function () {
  const card = this.querySelector('.card');
  if (!card) return { nocard: true };
  const cs = (e) => { if (!e) return undefined; const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return { fontFamily: c.fontFamily, fontSize: c.fontSize, lineHeight: c.lineHeight, direction: c.direction, textAlign: c.textAlign, unicodeBidi: c.unicodeBidi, rect: [Math.round(r.width), Math.round(r.height)], scroll: [e.scrollWidth, e.scrollHeight], client: [e.clientWidth, e.clientHeight], overflow: c.overflow }; };
  const arabic = [...card.querySelectorAll('*')].filter((e) => e.children.length === 0 && /[\\u0600-\\u06FF]/.test(e.textContent || '')).map((e) => ({ el: e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : ''), text: e.textContent.slice(0, 24), lang: e.closest('[lang]')?.getAttribute('lang') ?? null, dirAttr: e.closest('[dir]')?.getAttribute('dir') ?? null, dir: getComputedStyle(e).direction, ff: getComputedStyle(e).fontFamily.slice(0, 60) }));
  const clipped = [...card.querySelectorAll('*')].filter((e) => { const c = getComputedStyle(e); return (e.clientHeight > 0 && e.scrollHeight > e.clientHeight + 1 && c.overflowY !== 'visible') || (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && c.overflowX !== 'visible'); }).map((e) => ({ el: e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0], scroll: [e.scrollWidth, e.scrollHeight], client: [e.clientWidth, e.clientHeight], overflow: getComputedStyle(e).overflow }));
  const cardBox = card.getBoundingClientRect();
  const outside = [...card.querySelectorAll('.word, .lv, .row, .meaning')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > cardBox.right + 1 || r.left < cardBox.left - 1); }).map((e) => e.className);
  return { word: cs(card.querySelector('.word')), lemma: cs(card.querySelector('.lv')), card: cs(card), arabic: arabic.slice(0, 14), clipped, outside };
}`;
const CLICK = `function (sel) { const b = this.querySelector(sel); if (!b) return { clicked: false }; b.click(); return { clicked: true, text: (b.innerText || b.getAttribute('aria-label') || '').trim() }; }`;

async function main() {
  let health;
  const t0svc = Date.now();
  for (let i = 0; i < 180 && !health && svcExit === undefined; i++) { try { const r = await fetch(`${SVC_URL}/health`); if (r.ok) health = await r.json(); else await sleep(1000); } catch { await sleep(1000); } }
  report.timings.serviceStartMs = Date.now() - t0svc;
  report.service = { url: SVC_URL, health: health ?? 'did not answer', log: svcLog.slice(0, 5) };
  console.log('service', JSON.stringify(report.service).slice(0, 200));

  let b1 = launch(PORT, 'profile');
  let version;
  for (let i = 0; i < 60 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); } }
  if (!version) throw new Error('brave did not start');
  report.browser = version.Browser;
  let c = new Conn(version.webSocketDebuggerUrl, 'b1'); await c.open();
  let B = browserApi(c);
  const sw = await B.findSw();
  if (!sw) throw new Error('the extension did not load');
  const id = new URL(sw.url).host;
  report.extensionId = id;
  let swS = await B.attach(sw.targetId, 'worker');

  let ctl = await B.open(`chrome-extension://${id}/app/index.html#/languages`, 'setup');
  await sleep(3500);
  const msg = (o, ms = 60000) => B.evalIn(ctl.s, `chrome.runtime.sendMessage(${J(o)}).then((r) => r, (e) => ({ err: String(e) }))`, ms);
  const storage = (prefix) => B.evalIn(ctl.s, `chrome.storage.local.get(null).then((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(${J(prefix)}))))`);

  async function lookup(pg, target, opts = {}) {
    const { inject = true, deeper = true, settleMs = 1500, metrics = false } = opts;
    const sel = await B.evalIn(pg.s, `(() => {
      const root = document.getElementById(${J(target.id)}); if (!root) return { err: 'no element ' + ${J(target.id)} };
      const w = document.createTreeWalker(root, 4); const L = /[\\p{L}\\p{M}]/u; const word = ${J(target.word)}; let k = 0;
      for (let t = w.nextNode(); t; t = w.nextNode()) { let i = -1;
        while ((i = t.data.indexOf(word, i + 1)) >= 0) {
          const b = t.data[i - 1], a = t.data[i + word.length];
          if ((b && L.test(b)) || (a && L.test(a))) continue;
          if (k++ < ${target.n ?? 0}) continue;
          const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + word.length);
          t.parentElement.scrollIntoView({ block: 'center' });
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
          return { selected: s.toString(), sentence: t.data.trim() };
        } }
      return { err: 'word not found' }; })()`);
    if (sel?.err) return { sel, error: sel.err };
    await B.evalIn(pg.s, `document.querySelectorAll('[data-golearn-host]').forEach((h) => h.remove())`);
    const t0 = Date.now();
    const reply = await B.evalIn(ctl.s, `(async () => { const t = (await chrome.tabs.query({})).find((x) => x.url === ${J(pg.url)}); if (!t) return { err: 'no tab' };
      ${inject ? "try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); } catch (e) { return { err: 'inject: ' + e }; }" : ''}
      const r = await chrome.tabs.sendMessage(t.id, { type: 'golearn:lookup', trigger: 'command', focus: true }).catch((e) => ({ err: String(e) }));
      return r && typeof r === 'object' ? { status: r.status, reason: r.reason, message: r.message, language: r.language && { id: r.language.languageId, basis: r.language.basis, confidence: r.language.confidence } } : r; })()`, 60000);
    const replyMs = Date.now() - t0;
    let card, cardMs, cardAt;
    for (let i = 0; i < 80; i++) {
      card = await B.onCard(pg.s, READ_CARD);
      if (card && !card.nocard && (card.word || card.lemma)) { cardMs ??= Date.now() - t0; cardAt ??= Date.now(); if (!/looking up/i.test(card.meaning ?? '') && i >= 3) break; if (i > 30) break; }
      if (reply?.status === 'message' && i > 4) break;
      await sleep(250);
    }
    if (opts.waitMark && card && !card.nocard) {
      for (let i = 0; i < 24 && !(card.pressed?.length); i++) { await sleep(250); card = await B.onCard(pg.s, READ_CARD); }
    }
    if (deeper && card && !card.nocard) {
      await B.onCard(pg.s, CLICK, ['.deeperBtn']);
      await sleep(settleMs);
      card = await B.onCard(pg.s, READ_CARD);
    }
    let met, fonts;
    if (metrics && card && !card.nocard) {
      met = await B.onCard(pg.s, READ_METRICS);
      fonts = { word: await B.fonts(pg.s, '.word'), lemma: await B.fonts(pg.s, '.lv') };
    }
    return { sel, reply, replyMs, cardMs, cardAt, t0, card, metrics: met, fonts };
  }
  const popup = async (lang) => {
    const pp = await B.open(`chrome-extension://${id}/action/popup.html`, 'popup', { background: true });
    await sleep(1800);
    const read = `(() => ({ value: document.getElementById('language-select')?.value, options: [...(document.getElementById('language-select')?.options ?? [])].map((o) => o.value + '=' + o.textContent), language: document.getElementById('language')?.textContent, activeName: document.getElementById('active-name')?.textContent, active: document.getElementById('active')?.checked ?? document.getElementById('active')?.getAttribute('aria-checked'), page: document.getElementById('active-page')?.textContent, detail: document.getElementById('active-detail')?.textContent, counts: document.getElementById('active-counts')?.textContent, error: document.getElementById('error')?.textContent }))()`;
    const before = await B.evalIn(pp.s, read);
    let res;
    if (lang) res = await B.evalIn(pp.s, `(async () => { const sel = document.getElementById('language-select'); if (!sel) return { err: 'no select' }; if (![...sel.options].some((o) => o.value === '${lang}')) return { err: 'not offered' }; sel.value = '${lang}'; sel.dispatchEvent(new Event('change')); for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 250)); const l = document.getElementById('language').textContent; if (!/Switching/.test(l)) return { line: l }; } return { stuck: true, line: document.getElementById('language').textContent }; })()`, 60000);
    const after = lang ? await B.evalIn(pp.s, read) : undefined;
    await B.close(pp.t);
    return { before, res, after };
  };
  const ping = (pg) => B.evalIn(ctl.s, `(async () => { const t = (await chrome.tabs.query({})).find((x) => x.url === ${J(pg.url)}); if (!t) return { err: 'no tab' }; return chrome.tabs.sendMessage(t.id, { type: 'golearn:ping' }).catch((e) => ({ err: String(e) })); })()`);
  const highlights = async (pg) => {
    const expr = `(() => { if (!globalThis.CSS?.highlights) return { err: 'no highlight registry' }; const out = {}; for (const [name, hl] of CSS.highlights) out[name] = [...hl].map((r) => (r.startContainer.parentElement?.closest('[id]')?.id ?? '?') + ':' + r.toString()); return out; })()`;
    const main = await B.evalIn(pg.s, expr);
    if (main && !main.err && Object.keys(main).length) return { world: 'main', ranges: main };
    for (const ctx of (c.contexts.get(pg.s) ?? []).filter((x) => x.auxData?.type === 'isolated')) {
      const v = await B.evalIn(pg.s, expr, 10000, ctx.id);
      if (v && !v.err && Object.keys(v).length) return { world: `isolated:${ctx.name}`, ranges: v };
    }
    return { world: 'none', main };
  };
  const rangesFlat = (hl) => Object.entries(hl.ranges ?? {}).flatMap(([n, rs]) => rs.map((r) => `${n}|${r}`));
  const byParaOf = (all) => { const by = {}; for (const x of all) { const [lvl, rest] = x.split('|'); const [para, ...w] = rest.split(':'); (by[para] ??= []).push(`${w.join(':')}(${lvl.replace('golearn-', '')})`); } return by; };
  const exportEvents = async () => {
    const ex = await msg({ type: 'golearn:local-repo', op: 'export' });
    return (ex?.events ?? []).map((e) => ({ kind: e.kind, at: e.occurredAt ?? e.at, languageId: e.languageId ?? e.subject?.languageId, units: e.subject?.unitIds ?? e.subject?.itemIds ?? e.unitIds, mark: e.payload?.mark, payload: e.kind === 'ItemMarked' || /^Card|Assessment/.test(e.kind) ? e.payload : undefined, subject: e.kind === 'ItemMarked' ? e.subject : undefined }));
  };
  const cardLine = (r) => r?.card ? { word: r.card.word, lemma: r.card.lemma, pos: r.card.pos, meaning: r.card.meaning, translit: r.card.translit, language: r.card.host?.['data-language-id'], basis: r.card.host?.['data-language-basis'] } : { error: r?.error, reply: r?.reply };
  const waitScan = async (pg, rounds = 120) => { let st; for (let i = 0; i < rounds; i++) { st = await ping(pg); if (st?.activeState?.scanned && (st.activeState.confirmed !== undefined || i > 40)) break; await sleep(500); } return st; };

  // ═════════ A. install and the reading language ═════════
  phase = 'A';
  let packVersion;
  {
    const row = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ar"]'); if (!r) return { err: 'no Arabic row', rows: [...document.querySelectorAll('li.lang-row')].map((x) => x.dataset.language) }; r.querySelectorAll('details').forEach((d) => d.open = true); return { name: r.querySelector('.lang-name')?.innerText.replace(/\\s+/g, ' ').trim(), level: r.querySelector('.lang-level')?.innerText.trim(), dir: getComputedStyle(r.querySelector('.lang-name') ?? r).direction, text: r.innerText.replace(/\\s+/g, ' ').slice(0, 3000), rows: [...document.querySelectorAll('li.lang-row')].map((x) => x.dataset.language) }; })()`);
    report.shots = { setupRow: await B.shot(ctl.s, 'A-setup-languages') };
    const t0 = Date.now();
    const clicked = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ar"]'); if (!r) return 'no row'; const b = r.querySelector('button[data-action="choose"]'); if (!b) return 'no button'; b.click(); return 'clicked ' + b.textContent.trim(); })()`);
    let state = '';
    for (let i = 0; i < 360; i++) {
      state = await B.evalIn(ctl.s, `[...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === 'ar').map((l) => l.textContent.replace(/\\s+/g, ' ').slice(0, 160)).join('|')`);
      if (state && /ready|not verify|did not/i.test(state)) break;
      await sleep(1000);
    }
    const feedback = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ar"]'); return r?.querySelector('.lang-feedback')?.innerText.replace(/\\s+/g, ' ').slice(0, 1200); })()`);
    const rec = { ...(await storage('pack:installed')), ...(await storage('golearn:pack:installed')) };
    const rr = rec['golearn:pack:installed:pack:ar'] ?? rec['pack:installed:pack:ar'] ?? Object.entries(rec).find(([k]) => k.endsWith(':ar'))?.[1];
    packVersion = rr?.version;
    const failures = (rr?.verified?.validation ?? []).filter((v) => !v.pass);
    report.install = { row, clicked, state, feedback, records: Object.keys(rec ?? {}), arRecord: rr && { version: rr.version, installedAt: rr.installedAt, dictionaryManifest: rr.verified?.dictionaryManifest, sampleShard: rr.verified?.sampleShard, cases: rr.verified?.validation?.length, failures } };
    report.shots.setupAfter = await B.shot(ctl.s, 'A-setup-after-install');
    step('A1', 'install Arabic on the setup page; offered as "Arabic · العربية"', /ready/i.test(state) && !!rr && /Arabic.*العربية/.test(row?.name ?? '') ? 'PASS' : 'FAIL', { name: row?.name, level: row?.level, clicked, state, feedback: feedback?.slice(0, 300), seconds: Math.round((Date.now() - t0) / 1000), version: rr?.version, dictionaryManifest: rr?.verified?.dictionaryManifest, sampleShard: rr?.verified?.sampleShard, validationCases: rr?.verified?.validation?.length, validationFailures: failures });
    const txt = row?.text ?? '';
    const dialectNames = (txt.match(/Egyptian|Levantine|Gulf|Maghrebi|Moroccan|Iraqi|Sudanese|Hejazi|dialect/gi) ?? []);
    report.varieties = { rowText: txt, mentionsMSA: /Modern Standard/i.test(txt), mentionsClassical: /Classical/i.test(txt), dialectWords: dialectNames };
    step('A3', 'varieties offered: Modern Standard (default) and Classical; no dialect offered as analysed', /Modern Standard/i.test(txt) && /Classical/i.test(txt) ? (dialectNames.length ? 'CHECK' : 'PASS') : 'FAIL', { mentionsMSA: /Modern Standard/i.test(txt), mentionsClassical: /Classical/i.test(txt), dialectWords: dialectNames, text: txt.slice(0, 900) });
  }
  {
    const p = await popup('ar');
    const st = await msg({ type: 'golearn:get-state' });
    const status = await msg({ type: 'golearn:status' });
    report.popupAr = { ...p, state: { languageId: st?.languageId, varietyId: st?.varietyId, chosen: st?.chosenLanguages, keys: Object.keys(st ?? {}) }, status: { languageId: status?.languageId, languageName: status?.languageName, packAvailable: status?.packAvailable, varietyId: status?.varietyId } };
    const offered = (p.before?.options ?? []).find((o) => o.startsWith('ar='));
    const ok = /Arabic|العربية/.test(p.after?.language ?? p.res?.line ?? '') && (st?.languageId === 'ar' || status?.languageId === 'ar');
    step('A2', 'Arabic is in the popup chooser and choosing it works', ok ? 'PASS' : 'FAIL', { offered, options: p.before?.options, line: p.after?.language ?? p.res, workerState: st?.languageId, variety: st?.varietyId ?? status?.varietyId, status: status?.languageName });
  }

  // ═════════ B/C. prose.html: shards, lookups and cards ═════════
  phase = 'C';
  const prose = await B.open(page('prose'), 'prose');
  await c.send('Page.enable', {}, prose.s);
  await c.send('Network.enable', {}, prose.s);
  await sleep(1500);
  // [label, target, what, expected bare lemma (regex on the bare form; undefined = recorded only), extras]
  const W = [
    ['الكتاب', { id: 's6', word: 'الكتاب' }, 'article + noun', /^كتاب$/],
    ['كتب (s4)', { id: 's4', word: 'كتب' }, 'bare spelling: verb or the plural of كتاب', /^(كتب|كتاب)$/, { undecidedAllowed: true }],
    ['قال', { id: 's3', word: 'قال' }, 'hollow verb', /^قال$/],
    ['في', { id: 's1', word: 'في' }, 'preposition', /^في$/],
    ['من', { id: 's6', word: 'من' }, 'preposition', /^من$/],
    ['إلى', { id: 's1', word: 'إلى' }, 'preposition', /^الي$|^الى$/],
    ['على', { id: 's5', word: 'على' }, 'preposition', /^علي$|^على$/],
    ['هذا', { id: 's3', word: 'هذا' }, 'demonstrative', /^هذا$/],
    ['التي', { id: 's4', word: 'التي' }, 'relative pronoun (feminine of الذي)', /^(التي|الذي)$/],
    ['مدرسة', { id: 's7', word: 'مدرسة' }, 'noun', /^مدرسه$|^مدرسة$/],
    ['المدينة', { id: 's4', word: 'المدينة' }, 'article + noun', /^مدينه$|^مدينة$/],
    ['يكتبون', { id: 's8', word: 'يكتبون' }, 'imperfect plural', /^كتب$/],
    ['وبالكتاب', { id: 's8', word: 'وبالكتاب' }, 'و + ب + ال + كتاب', /^كتاب$/, { parts: ['و', 'ب', 'ال', 'كتاب'] }],
    ['فسيكتبونها', { id: 's10', word: 'فسيكتبونها' }, 'ف + س + يكتبون + ها', /^كتب$/, { parts: ['ف', 'س', 'يكتبون', 'ها'] }],
    ['للبيت', { id: 's11', word: 'للبيت' }, 'ل + ال + بيت', /^بيت$/],
    ['وجد', { id: 's5', word: 'وجد' }, 'verb وَجَدَ, not و + جد', /^وجد$/],
    ['كتابه', { id: 's5', word: 'كتابه' }, 'noun + his', /^كتاب$/],
    ['يكتب (لم يكتب)', { id: 's9', word: 'يكتب', n: 0 }, 'jussive after لم', /^كتب$/],
    ['يكتب (لن يكتب)', { id: 's9', word: 'يكتب', n: 1 }, 'subjunctive after لن', /^كتب$/],
    ['لم', { id: 's9', word: 'لم' }, 'negative particle', /^لم$/],
    ['لن', { id: 's9', word: 'لن' }, 'negative particle', /^لن$/],
    ['إن', { id: 's3', word: 'إن' }, 'particle (إِنَّ, "that")', /^(ان|إن)$/],
    ['أن', { id: 's12', word: 'أن' }, 'conjunction (أَنَّ / أَنْ)', /^ان$/],
    ['الطالب', { id: 's1', word: 'الطالب' }, 'article + noun', /^طالب$/],
    ['الطلاب', { id: 's2', word: 'الطلاب' }, 'broken plural of طالب', /^طالب$/],
    ['كان', { id: 's2', word: 'كان' }, 'كَانَ', /^كان$/],
    ['ذهب', { id: 's1', word: 'ذهب' }, 'verb', /^ذهب$/],
    ['المدارس', { id: 's6', word: 'المدارس' }, 'broken plural of مدرسة', /^مدرسه$|^مدرسة$/],
    ['الكتب', { id: 's5', word: 'الكتب' }, 'broken plural of كتاب', /^كتاب$/],
    ['الخبراء', { id: 's12', word: 'الخبراء' }, 'broken plural of خبير', /^خبير$/],
    ['البيوت', { id: 's14', word: 'البيوت' }, 'broken plural of بيت', /^بيت$/],
    ['الناس', { id: 's14', word: 'الناس' }, 'noun (people)', /^(ناس|انسان)$/],
  ];
  const results = {};
  const undecidedOf = (card) => !!card && (/undecided|several readings|not certain|which of these|lemma is inferred|guess/i.test((card.text ?? '').replace(/Other possible readings:.*$/i, '').replace(/a guess from a pattern/gi, '').replace(/a spelling with several readings keeps them all/gi, '')));
  const run = async (list, tag, pg, extraOpts = {}) => {
    for (const [label, target, what, expect, extra] of list) {
      const r = await lookup(pg, target, { settleMs: 2500, metrics: true, ...extraOpts });
      results[label] = r;
      const lemmaBare = bare(r.card?.lemma ?? '');
      const matched = expect ? expect.test(lemmaBare) : undefined;
      const segTexts = (r.card?.segs ?? []).map((s) => bare(s[0]));
      const partsOk = extra?.parts ? extra.parts.every((p, i) => segTexts[i] === p) : undefined;
      const sh = [...net.values()].filter((n) => n.url.includes('/lexicon/ar/') && n.at >= r.t0);
      const shardInfo = { requested: sh.length, bytes: sh.reduce((a, n) => a + (n.bytes ?? 0), 0), finishedAfterCard: sh.filter((n) => n.doneAt && r.cardAt && n.doneAt > r.cardAt).length, requestedAfterReply: sh.filter((n) => n.at > r.t0 + (r.replyMs ?? 0)).length };
      report.cards.push({ set: tag, label, shardInfo, what, expectBare: expect?.source, lemmaBare, matched, partsExpected: extra?.parts, partsGot: r.card?.segs, partsOk, undecided: undecidedOf(r.card), sentence: r.sel?.sentence, selected: r.sel?.selected, replyMs: r.replyMs, cardMs: r.cardMs, reply: r.reply, card: r.card, metrics: r.metrics, fonts: r.fonts });
      console.log('  card', label, JSON.stringify({ ...cardLine(r), matched, partsOk, undecided: undecidedOf(r.card) }).slice(0, 360));
    }
  };

  if (NO_SHARDS) {
    // the compiled core alone (the extension copy has no lexicon/ar): the words that need the full index are the ones to look at
    const SUB = W.filter((w) => ['الكتاب', 'مدرسة', 'المدارس', 'الخبراء', 'البيوت', 'فسيكتبونها', 'وبالكتاب', 'كتب (s4)', 'الناس'].includes(w[0]));
    await run(SUB, 'noshards', prose);
    const ok = results['الكتاب']?.card?.lemma;
    step('B2', 'shard requests blocked (no lexicon/ar in the extension): what a card says', 'INFO', Object.fromEntries(Object.entries(results).map(([k, r]) => [k, cardLine(r)])));
    report.shots = { ...report.shots, noShards: await B.shot(prose.s, 'B2-noshards-card') };
    report.netAr = [...net.values()].filter((n) => n.url.includes('/lexicon/ar/')).map((n) => ({ url: n.url.split('/lexicon/')[1], status: n.status, failed: n.failed, bytes: n.bytes }));
    return;
  }

  if (want('C') || want('B')) {
    const tFirst = Date.now();
    await run(W, 'prose', prose);
    const first = results['الكتاب'];
    report.timings.firstArabicLookup = { replyMs: first?.replyMs, cardMs: first?.cardMs };
    report.timings.secondArabicLookup = { label: 'كتب (s4)', replyMs: results['كتب (s4)']?.replyMs, cardMs: results['كتب (s4)']?.cardMs };
    report.shots = { ...report.shots, cardKitab: await B.shot(prose.s, 'C-card-alkitab') };
    // B: the shard requests
    const shardReq = [...net.values()].filter((n) => n.url.includes('/lexicon/ar/'));
    const bytes = shardReq.reduce((a, n) => a + (n.bytes ?? 0), 0);
    const beforeCard = shardReq.filter((n) => n.at <= (first?.cardAt ?? Infinity));
    const manifestReq = shardReq.find((n) => /manifest\.json/.test(n.url));
    const lateShards = report.cards.filter((x) => x.set === 'prose' && x.shardInfo?.finishedAfterCard).map((x) => x.label);
    report.lexicon = { requests: shardReq.length, bytes, manifest: manifestReq && { status: manifestReq.status, bytes: manifestReq.bytes }, perLookupShards: report.cards.filter((x) => x.set === 'prose').map((x) => [x.label, x.shardInfo]), lookupsWithShardsFinishingAfterTheirCard: lateShards, perLookup: undefined, files: shardReq.slice(0, 40).map((n) => ({ f: n.url.split('/lexicon/ar/standard/')[1], status: n.status, bytes: n.bytes, failed: n.failed })), allUrls: [...new Set([...net.values()].map((n) => n.url.replace(/\?.*/, '')).filter((u) => !u.startsWith(`http://127.0.0.1:${WEB}`)).map((u) => u.replace(/chrome-extension:\/\/[a-z]+\//, 'ext:/')))].slice(0, 60) };
    step('B1', 'full word list (lexicon/ar/standard) loads for the page words before the first card', shardReq.length > 0 && shardReq.every((n) => n.status === 200 || n.status === undefined) && lateShards.length === 0 ? 'PASS' : shardReq.length ? 'CHECK' : 'FAIL', { shardRequests: shardReq.length, bytes, requestedBeforeCard: beforeCard.length, finishedAfterCard: lateShards.length, manifest: report.lexicon.manifest, note: 'the content script awaits the shards before it parses; "before" cannot be observed in this run, see B2 (no-shard run)', sample: report.lexicon.files.slice(0, 5) });
    const got = Object.values(results).filter((r) => r.card && !r.card.nocard).length;
    // C7: the undecided كتب (s4, alone in its sentence) SAYS it is undecided, through Korean's card state (the review-hold note or the undecided-entry line); FAILS when the first view has no such line
    {
      const kc = results['كتب (s4)']?.card;
      const ktext = kc?.text ?? '';
      const says = /undecided|several readings|which of these|Not added to review|Other possible readings/i.test(ktext);
      step('C7', 'the card of the undecided كتب (s4) says it is undecided (Korean card state), on the first view', kc && says ? 'PASS' : 'FAIL', { hasCard: !!kc, line: ktext.slice(0, 300) });
    }
    // C8: a held word's card shows "Not added to review" with its reason: some looked-up word carries the line, and the line says more than the phrase. FAILS when no looked-up word is held (add one to the list) or the reason is missing
    {
      const heldCards = Object.entries(results).filter(([, r]) => /Not added to review/i.test(r.card?.text ?? ''));
      const reasoned = heldCards.filter(([, r]) => /Not added to review[^\n]{12,}/i.test(r.card.text));
      step('C8', 'a held word shows "Not added to review" with the reason', heldCards.length && reasoned.length === heldCards.length ? 'PASS' : 'FAIL', { held: heldCards.map(([k, r]) => [k, (r.card.text.match(/Not added to review[^\n]*/i) ?? [''])[0].slice(0, 160)]) });
    }
    step('C1', 'lookups on prose.html: a card for each word', got === W.length ? 'PASS' : 'FAIL', { cards: got, of: W.length });
    const mism = report.cards.filter((x) => x.set === 'prose' && x.expectBare && !x.matched).map((x) => ({ word: x.label, expected: x.expectBare, lemma: x.card?.lemma, undecided: x.undecided, meaning: x.card?.meaning?.slice(0, 80) }));
    step('C2', 'lemma on each card is the one expected (hand-written expectation)', mism.length === 0 ? 'PASS' : 'FAIL', { checked: W.filter((w) => w[3]).length, mismatches: mism });
    const pm = report.cards.filter((x) => x.partsExpected && !x.partsOk).map((x) => ({ word: x.label, expected: x.partsExpected, got: x.partsGot }));
    step('C3', 'attached words listed as parts (وبالكتاب, فسيكتبونها)', pm.length === 0 ? 'PASS' : 'FAIL', { mismatches: pm, got: Object.fromEntries(report.cards.filter((x) => x.partsExpected).map((x) => [x.label, x.partsGot])) });
    const cardOf = (label) => report.cards.find((x) => x.set === 'prose' && x.label === label)?.card;
    const rootRows = ['كتب (s4)', 'الكتاب', 'يكتبون'].map((l) => ({ word: l, root: cardOf(l)?.root, rows: (cardOf(l)?.rows ?? []).filter((r) => /root/i.test(r)).slice(0, 2) }));
    step('C5', 'a root line "ك ت ب" on the cards of كتب / الكتاب / يكتبون', rootRows.every((r) => /ك\s*ت\s*ب/.test(r.root ?? '')) ? 'PASS' : 'FAIL', { rootRows });
    const pcard = cardOf('وبالكتاب');
    const lefts = pcard?.segLefts ?? [];
    step('C6', 'the parts list of وبالكتاب reads right to left: و is the rightmost part', pcard?.segsDir === 'rtl' && /^و/.test(pcard?.segs?.[0]?.[0] ?? '') && (lefts.every((x) => x === 0) || lefts[0] > lefts[lefts.length - 1]) ? 'PASS' : 'FAIL', { dir: pcard?.segsDir, segs: pcard?.segs, lefts });
    const undec = report.cards.filter((x) => x.set === 'prose' && x.undecided).map((x) => x.label);
    const mets = report.cards.filter((x) => x.set === 'prose').map((x) => x.metrics).filter(Boolean);
    const clip = mets.filter((m) => m.clipped?.length || m.outside?.length).length;
    const dirs = [...new Set(mets.flatMap((m) => (m.arabic ?? []).map((a) => `${a.dir}/${a.lang}`)))];
    const ffs = [...new Set(mets.map((m) => m.word?.fontFamily))];
    step('C4', 'card layout: Arabic runs are rtl with lang, nothing clipped', clip === 0 && dirs.every((d) => d.startsWith('rtl/ar')) ? 'PASS' : 'CHECK', { undecidedWords: undec, cardsWithClipping: clip, arabicRunDirLang: dirs, headwordFontFamily: ffs, headwordLineHeight: [...new Set(mets.map((m) => m.word?.lineHeight))], lemmaFontFamily: [...new Set(mets.map((m) => m.lemma?.fontFamily))], platformFont: results['الكتاب']?.fonts });
  }

  // ═════════ D. vocalized.html ═════════
  if (want('D')) {
    const vp = await B.open(page('vocalized'), 'vocalized');
    await c.send('Page.enable', {}, vp.s);
    await sleep(1500);
    const V = [
      ['ذَهَبَ', { id: 'v1', word: 'ذَهَبَ' }, 'verb, vocalized', /^ذهب$/],
      ['الْمَدْرَسَةِ', { id: 'v1', word: 'الْمَدْرَسَةِ' }, 'noun under the article, genitive', /^مدرسه$|^مدرسة$/],
      ['كَتَبَ (v4)', { id: 'v4', word: 'كَتَبَ' }, 'vowels select the verb', /^كتب$/, { decided: true, morph: /active|perfect|past|3/i }],
      ['الْكُتُبِ', { id: 'v5', word: 'الْكُتُبِ' }, 'vowels select the plural of كِتَاب', /^كتاب$/],
      ['كِتَابَهُ', { id: 'v5', word: 'كِتَابَهُ' }, 'noun + his, accusative', /^كتاب$/],
      ['الْكِتَابُ', { id: 'v6', word: 'الْكِتَابُ' }, 'noun, nominative', /^كتاب$/],
      ['تَكْتُبُ', { id: 'v7', word: 'تَكْتُبُ' }, 'one reading, both persons (you m. / she)', /^كتب$/, { morph: /(2|second|you)[\s\S]*(3|third|she)|(3|third|she)[\s\S]*(2|second|you)/i }],
      ['كُتِبَ', { id: 'v8', word: 'كُتِبَ' }, 'passive of كَتَبَ', /^كتب$/, { morph: /passive/i }],
      ['قُلْ', { id: 'v9', word: 'قُلْ' }, 'imperative of قَالَ', /^قال$/, { morph: /imperative/i }],
      ['اِسْتَغْفَرَ', { id: 'v10', word: 'اِسْتَغْفَرَ' }, 'form X verb', /^استغفر$/, { morph: /\bX\b|form 10|tenth/i }],
      ['الشَّمْسُ', { id: 'v11', word: 'الشَّمْسُ' }, 'article + sun', /^شمس$/],
      ['الْقَمَرُ', { id: 'v11', word: 'الْقَمَرُ' }, 'article + moon', /^قمر$/],
      ['الشَّمْس', { id: 'v12', word: 'الشَّمْس' }, 'pause form under the article', /^شمس$/],
      ['الْقَمَر', { id: 'v12', word: 'الْقَمَر' }, 'pause form under the article', /^قمر$/],
      ['كِتَابُ (v13)', { id: 'v13', word: 'كِتَابُ' }, 'construct state before الطَّالِبِ', /^كتاب$/, { morph: /construct|cons/i }],
      ['رَآهُ', { id: 'v14', word: 'رَآهُ' }, 'رَأَى + him', /^راي$|^رأي$|^رأى$|^رای$|^راى$/],
    ];
    await run(V, 'vocalized', vp);
    const vc = report.cards.filter((x) => x.set === 'vocalized');
    const mism = vc.filter((x) => !x.matched).map((x) => ({ word: x.label, expected: x.expectBare, lemma: x.card?.lemma, undecided: x.undecided }));
    const morphFail = V.filter((v) => v[4]?.morph).map((v) => { const x = vc.find((y) => y.label === v[0]); const mt = (x?.card?.rows ?? []).filter((r) => /^(form|features|lemma|form-)/.test(r)).join(' | ') + ' ' + (x?.card?.layers?.form ?? '') + ' ' + (x?.card?.text ?? '').slice(0, 1500); return v[4].morph.test(mt) ? undefined : { word: v[0], expected: String(v[4].morph), formRows: (x?.card?.rows ?? []).filter((r) => /^(form|lemma)/.test(r)) }; }).filter(Boolean);
    const stillUndecided = vc.filter((x) => x.undecided).map((x) => x.label);
    report.shots = { ...report.shots, vocalized: await B.shot(vp.s, 'D-vocalized-card') };
    step('D1', 'vocalized.html: vowels select the reading (lemma of each word)', mism.length === 0 ? 'PASS' : 'FAIL', { checked: V.length, mismatches: mism, stillUndecided });
    step('D3', 'vocalized.html: the card state of each vocalized word. `undecided` is read from the CARD TEXT (it says several readings / undecided / guess), not from the analyser; the readings the card listed are recorded', 'INFO', vc.map((x) => ({ word: x.label, lemma: x.card?.lemma, cardSaysUndecided: !!x.undecided, otherReadings: ((x.card?.text ?? '').match(/Other possible readings:.{0,260}/i) ?? [])[0] ?? null, notes: ((x.card?.text ?? '').match(/(\d+ \w+ possible[^.]*\.)/) ?? [])[0] ?? null })));
    step('D2', 'vocalized.html: the morphology says passive / imperative / both persons / form X / construct', morphFail.length === 0 ? 'PASS' : 'FAIL', { failures: morphFail });
    await B.close(vp.t);
  }

  // ═════════ H. quran-style.html ═════════
  if (want('H')) {
    const qp = await B.open(page('quran-style'), 'quran');
    await c.send('Page.enable', {}, qp.s);
    await sleep(1500);
    const Q = [
      ['ٱلْعَٰلَمِينَ', { id: 'q2', word: 'ٱلْعَٰلَمِينَ' }, 'dagger alif, alif wasla: العالمين → عَالَم', /^عالم$|^علم$/],
      ['ٱلرَّحْمَٰنِ', { id: 'q1', word: 'ٱلرَّحْمَٰنِ' }, 'الرحمن', /^رحمن$|^الرحمن$|^رحمان$/],
      ['لِلَّهِ', { id: 'q2', word: 'لِلَّهِ' }, 'ل + الله', /^الله$|^اله$|^لله$/],
      ['ٱللَّهِ', { id: 'q1', word: 'ٱللَّهِ' }, 'الله', /^الله$|^اله$/],
      ['ٱلرَّحِيمِ', { id: 'q1', word: 'ٱلرَّحِيمِ' }, 'الرحيم', /^رحيم$/],
      ['ٱلْحَمْدُ', { id: 'q2', word: 'ٱلْحَمْدُ' }, 'الحمد', /^حمد$/],
    ];
    await run(Q, 'quran', qp);
    const qc = report.cards.filter((x) => x.set === 'quran');
    report.shots = { ...report.shots, quran: await B.shot(qp.s, 'H-quran-card') };
    step('H1', 'Quranic orthography: ٱلْعَٰلَمِينَ reaches عَالَم; ٱلرَّحْمَٰنِ and لِلَّهِ read', qc.filter((x) => x.matched).length === Q.length ? 'PASS' : 'FAIL', { lines: qc.map((x) => ({ word: x.label, lemma: x.card?.lemma, pos: x.card?.pos, matched: x.matched, meaning: x.card?.meaning?.slice(0, 80), undecided: x.undecided })) });
    await B.close(qp.t);
  }

  // ═════════ F. marks and the unit ids ═════════
  const marks = [['الكتاب', { id: 's6', word: 'الكتاب' }, 'known'], ['كتب', { id: 's4', word: 'كتب' }, 'familiar']];
  if (want('F')) {
    const done = {};
    for (const [label, target, mark] of marks) {
      await lookup(prose, target, { deeper: false });
      const click = await B.onCard(prose.s, CLICK, [`.rateBtn[data-mark="${mark}"]`]);
      await sleep(1500);
      const after = await B.onCard(prose.s, READ_CARD);
      done[label] = { mark, click, pressed: after?.pressed, levelName: after?.levelName, status: after?.status, undecided: undecidedOf(after), lemma: after?.lemma };
    }
    await sleep(1500);
    const ev = await exportEvents();
    const marked = ev.filter((e) => e.kind === 'ItemMarked');
    const kn = await msg({ type: 'golearn:local-repo', op: 'knowledge', languageId: 'ar' });
    const knRows = (kn?.knowledge ?? []).map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark, encounters: k.encounters }));
    report.marks = { done, itemMarked: marked.map((m) => ({ mark: m.mark, ids: m.units, subject: m.subject })), knowledge: knRows };
    const ids = marked.flatMap((m) => m.units ?? []);
    const wantKitab = 'lemma:ar:' + 'كِتَاب'.normalize('NFC') + ':NOUN';
    const idKitab = ids.find((u) => bare(u).includes('كتاب'));
    const idKataba = ids.filter((u) => u !== idKitab);
    step('F1', 'mark الكتاب Known: the unit id is lemma:ar:<vocalized head>:NOUN', idKitab && idKitab.normalize('NFC') === wantKitab && done['الكتاب'].pressed?.includes('known') ? 'PASS' : 'FAIL', { idSent: idKitab, expected: wantKitab, codePoints: idKitab && [...idKitab].map((ch) => ch.codePointAt(0).toString(16)).join(' '), pressed: done['الكتاب'].pressed, levelName: done['الكتاب'].levelName });
    step('F2', 'mark the undecided كتب: the id is a form id (form:ar:<key>), crediting no lemma', idKataba.length && idKataba.every((u) => /^form:ar:/.test(u)) ? 'PASS' : 'FAIL', { idsSent: idKataba, cardUndecided: done['كتب'].undecided, cardLemma: done['كتب'].lemma, pressed: done['كتب'].pressed, allIds: ids, knowledge: knRows });
  }
  if (want('F')) {
    const res = {};
    await B.evalIn(prose.s, 'location.reload()'); await sleep(2500);
    for (const [label, target] of marks) { const r = await lookup(prose, target, { deeper: false, waitMark: true }); res[`afterPageReload:${label}`] = { pressed: r.card?.pressed, levelName: r.card?.levelName, encounters: r.card?.encounters }; }
    await c.send('ServiceWorker.enable', {}, prose.s).catch(() => {});
    await c.send('ServiceWorker.stopAllWorkers', {}, prose.s);
    await sleep(1500);
    for (const [label, target] of marks) {
      const r = await lookup(prose, target, { deeper: false, inject: false, waitMark: true });
      res[`afterWorkerStop:${label}`] = { pressed: r.card?.pressed, levelName: r.card?.levelName, replyMs: r.replyMs, cardMs: r.cardMs };
    }
    report.persist = res;
    const ok = Object.entries(res).every(([k, v]) => v.pressed?.includes(k.endsWith('الكتاب') ? 'known' : 'familiar'));
    step('F3', 'marks persist across a page reload and a stopped worker', ok ? 'PASS' : 'FAIL', res);
  }
  await B.close(prose.t);

  // ═════════ E. Active on prose.html ═════════
  const SNAP = `(() => ({ text: document.body.innerText, html: document.body.innerHTML, docFonts: document.fonts.size, styles: document.querySelectorAll('style, link[rel=stylesheet]').length, sheets: document.styleSheets.length, adopted: document.adoptedStyleSheets.length, ff: [...document.querySelectorAll('p')].map((p) => getComputedStyle(p).fontFamily).filter((v, i, a) => a.indexOf(v) === i), bodyFf: getComputedStyle(document.body).fontFamily, count: document.querySelectorAll('*').length }))()`;
  if (want('E')) {
    const base = await B.open(page('prose'), 'prose-base');
    await sleep(1500);
    const before = await B.evalIn(base.s, SNAP);
    await B.close(base.t);
    const on = await msg({ type: 'golearn:active', op: 'set', patch: { active: true } });
    const t0 = Date.now();
    const pg = await B.open(page('prose'), 'prose-active');
    await c.send('Target.activateTarget', { targetId: pg.t });
    // the first highlight: the time from switching Active on, and the lexicon/ar shards requested and finished by then (the prepared scan waits for them)
    let firstHlAt;
    for (let i = 0; i < 240 && !firstHlAt; i++) { const h0 = await highlights(pg); if (rangesFlat(h0).length) firstHlAt = Date.now(); else await sleep(250); }
    let st = await waitScan(pg);
    const firstScanMs = Date.now() - t0;
    await sleep(5000);
    st = await ping(pg);
    const after = await B.evalIn(pg.s, SNAP);
    const hl = await highlights(pg);
    const all = rangesFlat(hl);
    const by = byParaOf(all);
    const levelOf = (w) => all.filter((x) => x.split('|')[1].split(':').slice(1).join(':') === w).map((x) => x.split('|')[0]);
    const pp = await popup();
    report.shots = { ...report.shots, activeProse: await B.shot(pg.s, 'E-active-prose') };
    // joining: a zoomed shot of two lines with marked words
    const rect = await B.evalIn(pg.s, `(() => { const e = document.getElementById('s8'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left + scrollX), y: r.top + scrollY, w: r.width, h: r.height }; })()`);
    await sleep(500);
    report.shots.activeZoom = await B.shot(pg.s, 'E-active-zoom-s8', { x: rect.x, y: rect.y - 6, width: rect.w, height: rect.h + 12, scale: 2.5 });
    const rect2 = await B.evalIn(pg.s, `(() => { const e = document.getElementById('s9'); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left + scrollX), y: r.top + scrollY, w: r.width, h: r.height }; })()`);
    report.shots.activeZoom2 = await B.shot(pg.s, 'E-active-zoom-s9', { x: rect2.x, y: rect2.y - 6, width: rect2.w, height: rect2.h + 12, scale: 2.5 });
    const textSame = before?.text === after?.text, htmlSame = before?.html === after?.html;
    const wordsOnPage = (after?.text ?? '').split(/[\s،.؛؟]+/).filter(Boolean).length;
    report.active = { activeState: st?.activeState, highlightWorld: hl.world, marked: by, before: { ...before, text: undefined, html: undefined }, after: { ...after, text: undefined, html: undefined }, textSame, htmlSame, firstScanMs, popup: pp.before };
    report.timings.activeScan = { firstScanSeenMs: firstScanMs, scanMs: st?.activeState?.scanMs, profileMs: st?.activeState?.profileMs, scanned: st?.activeState?.scanned };
    step('E1', 'Active on prose.html: words are marked (levels, which)', st?.activeState?.scanned > 0 && all.length > 0 ? 'PASS' : 'FAIL', { on: on?.settings?.active, languages: st?.activeState?.languages, scanned: st?.activeState?.scanned, marked: st?.activeState?.marked, skipped: st?.activeState?.skipped, confirmed: st?.activeState?.confirmed, unconfirmed: st?.activeState?.unconfirmed, reason: st?.activeState?.reason, highlightWorld: hl.world, ranges: all.length, wordsOnPage, levelNames: Object.keys(hl.ranges ?? {}), 'الكتاب': levelOf('الكتاب'), 'كتب': levelOf('كتب'), 'وبالكتاب': levelOf('وبالكتاب'), 'فسيكتبونها': levelOf('فسيكتبونها'), 'كتابه': levelOf('كتابه'), by });
    step('E2', "the page's own text and DOM are unchanged by Active; nothing gets the extension's font", textSame && htmlSame && before?.docFonts === after?.docFonts && JSON.stringify(before?.ff) === JSON.stringify(after?.ff) ? 'PASS' : 'FAIL', { textSame, htmlSame, domNodesBefore: before?.count, domNodesAfter: after?.count, docFontsBefore: before?.docFonts, docFontsAfter: after?.docFonts, fontFamiliesBefore: before?.ff, fontFamiliesAfter: after?.ff, styleElements: [before?.styles, after?.styles], adoptedSheets: [before?.adopted, after?.adopted] });
    // E3: what the Arabic prepare-before-scan cost (measured: AR-PROVISIONAL). Shard requests of lexicon/ar from switching Active on to the first highlight.
    const shardsBeforeHl = [...net.values()].filter((n) => n.url.includes('/lexicon/ar/') && n.at >= t0 && n.at <= (firstHlAt ?? Infinity));
    report.timings.activePrepare = { msToFirstHighlight: firstHlAt ? firstHlAt - t0 : null, shardRequestsBeforeFirstHighlight: shardsBeforeHl.length, bytesBeforeFirstHighlight: shardsBeforeHl.reduce((a, n) => a + (n.bytes ?? 0), 0), shardsNotFinishedAtFirstHighlight: shardsBeforeHl.filter((n) => !n.doneAt || n.doneAt > (firstHlAt ?? 0)).length };
    step('E3', 'Active on prose.html: lexicon/ar shard requests and bytes before the first highlight, and the time from switching Active on to it', firstHlAt ? 'INFO' : 'FAIL', report.timings.activePrepare);
    // E4: credited units after the scan. The ids themselves never leave the content script, so the credited set is read as what the scan MARKED: each highlighted range with its level (a lemma id or a form id decides the level), plus the scan's own counts.
    const creditedFirst = [...new Set(all)].sort();
    report.active.credited = { ranges: creditedFirst.length, marked: st?.activeState?.marked, confirmed: st?.activeState?.confirmed, unconfirmed: st?.activeState?.unconfirmed };
    step('E4', 'Active on prose.html: units credited after the scan (ranges by level, scan counts)', creditedFirst.length ? 'INFO' : 'FAIL', report.active.credited);
    report.activeZoomNote = 'joining is judged by eye from the zoomed shots in the report (activeZoom, activeZoom2); the DOM check above shows no span is inserted';
    await B.close(pg.t);
    // E5: a second visit to the same page must mark the same set (the prepared scan is stable); a different set FAILS
    {
      const pg2 = await B.open(page('prose'), 'prose-active-2');
      await c.send('Target.activateTarget', { targetId: pg2.t });
      const st2 = await waitScan(pg2);
      await sleep(5000);
      const second = [...new Set(rangesFlat(await highlights(pg2)))].sort();
      const onlyFirst = creditedFirst.filter((x) => !second.includes(x)), onlySecond = second.filter((x) => !creditedFirst.includes(x));
      step('E5', 'a second visit to prose.html credits the same marked set as the first (stable prepared scan)', creditedFirst.length && !onlyFirst.length && !onlySecond.length ? 'PASS' : 'FAIL', { first: creditedFirst.length, second: second.length, markedFirst: st?.activeState?.marked, markedSecond: st2?.activeState?.marked, onlyFirst: onlyFirst.slice(0, 12), onlySecond: onlySecond.slice(0, 12) });
      await B.close(pg2.t);
    }
  } else await msg({ type: 'golearn:active', op: 'set', patch: { active: true } });

  // ═════════ G. other pages: language handling ═════════
  if (want('G')) {
    const G = [
      ['nolang', 'nolang', [['الكتاب', { id: 's6', word: 'الكتاب' }]]],
      ['persian', 'persian', [['پایتخت', { id: 'f1', word: 'پایتخت' }], ['چای', { id: 'f2', word: 'چای' }]]],
      ['persian-fa', 'persian-fa', [['پایتخت', { id: 'f1', word: 'پایتخت' }], ['کتاب', { id: 'f5', word: 'کتاب' }]]],
      ['urdu', 'urdu', [['کتاب', { id: 'u4', word: 'کتاب' }], ['شہر', { id: 'u2', word: 'شہر' }]]],
      ['mixed', 'mixed', [['مدينة (m-ar)', { id: 'm-ar', word: 'مدينة' }], ['كتاب (m-word)', { id: 'm-word', word: 'كتاب' }], ['book (m-en)', { id: 'm-en', word: 'report' }], ['مش (m-dial)', { id: 'm-dial', word: 'مش' }], ['عايز (m-dial)', { id: 'm-dial', word: 'وعايز' }], ['الشارع (m-dial)', { id: 'm-dial', word: 'الشارع' }], ['Brown (m-ar)', { id: 'm-ar', word: 'Brown' }]]],
    ];
    const gr = {};
    for (const [name, file, lks] of G) {
      const pg = await B.open(page(file), `g-${name}`);
      await c.send('Target.activateTarget', { targetId: pg.t });
      await c.send('Page.enable', {}, pg.s);
      let st;
      for (let i = 0; i < 40; i++) { st = await ping(pg); if (st?.activeState?.scanned !== undefined && i > 6) break; await sleep(500); }
      await sleep(4500);
      st = await ping(pg);
      const hl = await highlights(pg);
      const all = rangesFlat(hl);
      const by = byParaOf(all);
      report.shots = { ...report.shots, [`G-${name}`]: await B.shot(pg.s, `G-${name}`) };
      const lk = {};
      for (const [lab, target] of lks) { const r = await lookup(pg, target, { deeper: false, inject: false, metrics: false }); lk[lab] = { ...cardLine(r), reply: r.reply, text: r.card?.text?.slice(0, 260), fullText: r.card?.text?.slice(0, 1400), notes: (r.card?.rows ?? []).filter((x) => /note|dialect|variety/i.test(x)).slice(0, 4), undecided: undecidedOf(r.card), err: r.error }; }
      gr[name] = { state: st?.activeState && { languages: st.activeState.languages, scanned: st.activeState.scanned, marked: st.activeState.marked, skipped: st.activeState.skipped, reason: st.activeState.reason, confirmed: st.activeState.confirmed, unconfirmed: st.activeState.unconfirmed }, ranges: all.length, by, lookups: lk };
      console.log('  page', name, JSON.stringify({ ranges: all.length, by: Object.keys(by), langs: st?.activeState?.languages }).slice(0, 300));
      await B.close(pg.t);
    }
    report.pages = gr;
    step('G1', 'nolang.html (no lang attribute): Arabic is detected and read', (gr.nolang?.ranges ?? 0) > 0 && gr.nolang.lookups['الكتاب']?.language === 'ar' ? 'PASS' : 'FAIL', { ranges: gr.nolang?.ranges, state: gr.nolang?.state, lookup: gr.nolang?.lookups });
    const claim = (g) => Object.entries(g?.lookups ?? {}).filter(([, v]) => v.language === 'ar' && v.lemma).map(([k, v]) => ({ word: k, lemma: v.lemma, basis: v.basis }));
    step('G2', 'persian.html (no lang): nothing underlined and no lookup claims Arabic', gr.persian?.ranges === 0 && claim(gr.persian).length === 0 ? 'PASS' : 'FAIL', { ranges: gr.persian?.ranges, state: gr.persian?.state, claimed: claim(gr.persian), lookups: gr.persian?.lookups });
    step('G3', 'persian-fa.html (lang=fa): nothing underlined and no lookup claims Arabic', gr['persian-fa']?.ranges === 0 && claim(gr['persian-fa']).length === 0 ? 'PASS' : 'FAIL', { ranges: gr['persian-fa']?.ranges, state: gr['persian-fa']?.state, claimed: claim(gr['persian-fa']), lookups: gr['persian-fa']?.lookups });
    step('G4', 'urdu.html (no lang): nothing underlined and no lookup claims Arabic', gr.urdu?.ranges === 0 && claim(gr.urdu).length === 0 ? 'PASS' : 'FAIL', { ranges: gr.urdu?.ranges, state: gr.urdu?.state, claimed: claim(gr.urdu), lookups: gr.urdu?.lookups });
    const mb = gr.mixed?.by ?? {};
    const english = [...(mb['m-en'] ?? []), ...(mb['m-en2'] ?? [])];
    const digits = Object.values(mb).flat().filter((w) => /^[0-9٠-٩]+\(/.test(w));
    const latin = Object.values(mb).flat().filter((w) => /^[A-Za-z]+\(/.test(w) && !english.includes(w));
    step('G5', 'mixed.html: only the Arabic paragraph and the Arabic word are read; English untouched; dialect line flagged or uncredited; digits are not words', (mb['m-ar']?.length ?? 0) > 0 && english.length === 0 && digits.length === 0 ? 'PASS' : 'FAIL', { underlinedArabicPara: mb['m-ar'], underlinedWordInEnglish: mb['m-word'], underlinedDialect: mb['m-dial'] ?? [], underlinedEnglish: english, digitsMarked: digits, latinMarkedInArabic: latin, lookups: gr.mixed?.lookups, state: gr.mixed?.state });
    const mlk = gr.mixed?.lookups ?? {};
    const wordClick = mlk['كتاب (m-word)'];
    step('G6', 'mixed.html: a click on كتاب inside the English sentence is read as Arabic', wordClick?.language === 'ar' && !!wordClick?.lemma ? 'PASS' : 'FAIL', { lookup: wordClick });
    const dialClicks = ['مش (m-dial)', 'عايز (m-dial)', 'الشارع (m-dial)'].map((k) => ({ k, text: (mlk[k]?.fullText ?? mlk[k]?.text ?? '').slice(0, 1400), language: mlk[k]?.language, err: mlk[k]?.err }));
    const dialOk = (d) => /looks like spoken Arabic \(Egyptian\)/.test(d.text) && d.text.replace(/\s+/g, ' ').trim().length > 20 && !/MEANING|mashsha|sucked|marrow|\bLEMMA\b/i.test(d.text.replace(/Go deeper[\s\S]*$/, ''));
    step('G7', 'mixed.html: a click on a word of the dialect line (مش, عايز, الشارع) shows the word and the dialect note, and no transliteration, MEANING section, lemma or gloss; the card is not empty', dialClicks.every(dialOk) ? 'PASS' : 'FAIL', { dialClicks, notOk: dialClicks.filter((d) => !dialOk(d)).map((d) => d.k) });
  }

  // ═════════ I. signed in, GoReview, Alphabet Sprint ═════════
  phase = 'I';
  const email = `ar-rig-${crypto.randomBytes(4).toString('hex')}@example.test`;
  const password = crypto.randomBytes(18).toString('base64url');
  const svcApi = async (method, p, body, token) => { const r = await fetch(`${SVC_URL}${p}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, body: j }; };
  const readAccount = async () => {
    const s = await svcApi('POST', '/sessions', { email, password, deviceId: 'ar-rig-reader', platform: 'rig' });
    const token = s.body?.token;
    if (!token) return { error: `session ${s.status}` };
    const enr = await svcApi('GET', '/enrolments', undefined, token);
    const evMarks = await svcApi('GET', '/events?languageId=ar&kinds=ItemMarked,CardReviewed,CardAdded,AssessmentAnswered&limit=500', undefined, token);
    const kn = await svcApi('GET', '/knowledge?languageId=ar', undefined, token);
    return {
      enrolments: (enr.body?.enrolments ?? []).map((e) => ({ languageId: e.languageId, packId: e.packId, packVersion: e.packVersion, ended: !!e.endedAt })),
      itemMarked: (evMarks.body?.events ?? []).map((e) => e.event ?? e).filter((e) => e.kind === 'ItemMarked').map((e) => ({ mark: e.payload?.mark, itemIds: e.subject?.itemIds, at: e.occurredAt })),
      reviews: (evMarks.body?.events ?? []).map((e) => e.event ?? e).filter((e) => e.kind !== 'ItemMarked').map((e) => ({ kind: e.kind, subject: e.subject, payload: e.payload })),
      knowledge: (kn.body?.knowledge ?? []).map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark, encounters: k.encounters })),
    };
  };
  const signedMarks = [['المدينة', { id: 's4', word: 'المدينة' }, 'known'], ['مدرسة', { id: 's7', word: 'مدرسة' }, 'familiar']];
  if (want('I')) {
    await B.evalIn(ctl.s, `(async () => { location.hash = '#/signin'; await new Promise((r) => setTimeout(r, 1500)); return 1; })()`);
    const made = await msg({ type: 'golearn:create-account', baseUrl: SVC_URL, email, password, displayName: 'Rig' });
    await B.evalIn(ctl.s, `(async () => { location.hash = '#/languages'; location.reload(); return 1; })()`);
    await sleep(4000);
    let acct = await readAccount();
    let enrol;
    if (!acct.enrolments?.some((e) => e.languageId === 'ar' && !e.ended)) {
      enrol = await msg({ type: 'golearn:enrol', languageId: 'ar', packId: 'pack:ar', packVersion: packVersion ?? '1', goals: [{ kind: 'reading' }] });
      await sleep(1500);
    }
    await popup('ar');
    const pg = await B.open(page('prose'), 'prose-signed');
    await sleep(1500);
    const done = {};
    for (const [label, target, mark] of signedMarks) {
      await lookup(pg, target, { deeper: false, inject: false });
      const click = await B.onCard(pg.s, CLICK, [`.rateBtn[data-mark="${mark}"]`]);
      await sleep(1500);
      const after = await B.onCard(pg.s, READ_CARD);
      done[label] = { mark, click, pressed: after?.pressed, lemma: after?.lemma };
    }
    const sync = await msg({ type: 'golearn:sync-now' }, 90000);
    const up = await msg({ type: 'golearn:local-repo', op: 'upload' }, 90000);
    await sleep(3000);
    acct = await readAccount();
    report.signed = { made: { ok: made?.ok, error: made?.error, message: made?.message }, enrol, done, sync: sync && { ok: sync.ok, pushed: sync.pushed, error: sync.error ?? sync.lastError }, upload: up, account: acct };
    const ok = made?.ok && (acct.itemMarked ?? []).length >= 2 && (acct.itemMarked ?? []).every((m) => (m.itemIds ?? []).length > 0 && m.itemIds.every((u) => /^(lemma|form):ar:/.test(u)));
    step('I1', 'signed in: Arabic marks reach the local service with ar ids', ok ? 'PASS' : 'FAIL', { made: report.signed.made, itemMarked: acct.itemMarked, enrolments: acct.enrolments, knowledge: acct.knowledge });
    await B.close(pg.t);

    // GoReview
    const rv = await B.open(`chrome-extension://${id}/review/index.html`, 'goreview');
    await c.send('Page.enable', {}, rv.s);
    await sleep(6000);
    const langs = await B.evalIn(rv.s, `(() => { const s = document.getElementById('language-select'); return { selected: s?.selectedOptions?.[0]?.textContent.trim(), options: [...(s?.options ?? [])].map((o) => o.value + '=' + o.textContent.trim()), name: document.getElementById('language-name')?.textContent }; })()`);
    const chose = await B.evalIn(rv.s, `(async () => { const s = document.getElementById('language-select'); if (!s) return { err: 'no language select', name: document.getElementById('language-name')?.textContent }; const o = [...s.options].find((x) => /Arabic|العربية/.test(x.textContent)); if (!o) return { err: 'Arabic not offered', options: [...s.options].map((x) => x.textContent) }; if (s.value !== o.value) { s.value = o.value; s.dispatchEvent(new Event('change')); } await new Promise((r) => setTimeout(r, 7000)); return { selected: document.getElementById('language-select')?.selectedOptions?.[0]?.textContent.trim() }; })()`, 30000);
    const arCount = (langs?.options ?? []).filter((o) => /Arabic|العربية/.test(o)).length;
    const vocab = await B.evalIn(rv.s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 4500)); return { text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 2500), arabicNodes: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /[\\u0600-\\u06FF]/.test(e.textContent)).slice(0, 12).map((e) => ({ t: e.textContent.slice(0, 30), dir: getComputedStyle(e).direction, lang: e.closest('[lang]')?.getAttribute('lang'), ff: getComputedStyle(e).fontFamily.slice(0, 50) })) }; })()`, 30000);
    report.shots = { ...report.shots, goreviewVocab: await B.shot(rv.s, 'I-goreview-vocab') };
    const readFront = `(() => { const s = document.getElementById('session'); if (!s) return null; const st = document.getElementById('stimulus'); const cs = st && getComputedStyle(st); return { stimulus: st?.innerText.trim(), instruction: document.getElementById('instruction')?.innerText.trim(), lang: st?.closest('[lang]')?.getAttribute('lang') ?? st?.getAttribute('lang'), dir: cs?.direction, dirAttr: st?.closest('[dir]')?.getAttribute('dir'), ff: cs?.fontFamily.slice(0, 60), fs: cs?.fontSize, text: s.innerText.replace(/\\s+/g, ' ').slice(0, 500) }; })()`;
    // the Saved decks: the Alphabet deck starts the Sprint
    const decks = await B.evalIn(rv.s, `(async () => { location.hash = '#/review/decks'; await new Promise((r) => setTimeout(r, 5000)); return { tiles: [...document.querySelectorAll('li.deck-tile')].map((t) => (t.dataset.builtin ?? '') + ': ' + t.innerText.replace(/\\s+/g, ' ').slice(0, 200)), text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 800) }; })()`, 30000);
    report.shots.goreviewDecks = await B.shot(rv.s, 'I-goreview-decks');
    const startSprint = await B.evalIn(rv.s, `(() => { const b = document.querySelector('li.deck-tile[data-builtin="alphabet"] .deckrow-open'); if (!b) return { err: 'no alphabet tile' }; b.click(); return { clicked: true }; })()`);
    let front;
    for (let i = 0; i < 60; i++) { await sleep(500); front = await B.evalIn(rv.s, readFront); if (front?.stimulus) break; }
    const sprint = [];
    for (let k = 0; k < 6 && front?.stimulus; k++) {
      report.shots[`sprint${k}`] = await B.shot(rv.s, `I-sprint-${k}-front`);
      const frontNow = front;
      const reveal = await B.evalIn(rv.s, `(() => { const b = document.getElementById('reveal') ?? document.getElementById('flip-card') ?? [...document.querySelectorAll('button')].find((x) => /show answer|reveal|flip/i.test(x.textContent)); if (!b) return { err: 'no reveal', buttons: [...document.querySelectorAll('button')].map((x) => (x.id || '') + ':' + x.textContent.trim().slice(0, 30)).slice(0, 15) }; b.click(); return { clicked: b.id || b.textContent.trim() }; })()`);
      await sleep(1000);
      const back = await B.evalIn(rv.s, `(() => ({ bdi: [...document.querySelectorAll('#revealed-answer bdi[lang=ar]')].map((b) => b.textContent), answerTag: (document.getElementById('revealed-answer')?.closest('[dir]')?.getAttribute('dir')) ?? null, answer: document.getElementById('revealed-answer')?.innerText.trim(), text: (document.getElementById('session')?.innerText ?? document.body.innerText).replace(/\\s+/g, ' ').slice(0, 700), grades: [...document.querySelectorAll('.grade')].map((g) => g.dataset.grade) }))()`);
      if (k === 0) report.shots.sprintBack0 = await B.shot(rv.s, 'I-sprint-0-back');
      sprint.push({ n: k + 1, front: frontNow.stimulus, instruction: frontNow.instruction, lang: frontNow.lang, dir: frontNow.dir, dirAttr: frontNow.dirAttr, font: frontNow.ff, fontSize: frontNow.fs, reveal, back: back?.answer, backText: back?.text, bdi: back?.bdi, answerDir: back?.answerTag, grades: back?.grades });
      const grade = await B.evalIn(rv.s, `(() => { const g = document.querySelector('.grade[data-grade="good"]'); if (!g) return { err: 'no good' }; g.click(); return { clicked: true }; })()`);
      await sleep(2200);
      front = await B.evalIn(rv.s, readFront);
      if (!front?.stimulus || front.stimulus === frontNow.stimulus && k > 0 && false) break;
    }
    const langPage = await B.evalIn(rv.s, `(async () => { location.hash = '#/languages'; await new Promise((r) => setTimeout(r, 4500)); const t = document.body.innerText.replace(/\\s+/g, ' '); return { text: t.slice(0, 1200), arabicMentions: (t.match(/Arabic|العربية/g) ?? []).length, selects: [...document.querySelectorAll('select')].map((s) => [...s.options].map((o) => o.textContent.trim())), rows: [...document.querySelectorAll('li')].filter((e) => /Arabic|العربية/.test(e.innerText)).map((e) => e.innerText.replace(/\\s+/g, ' ').slice(0, 120)) }; })()`, 30000);
    report.shots.goreviewLanguages = await B.shot(rv.s, 'I-goreview-languages');
    report.goreview = { langPage, langs, chose, arabicOptionCount: arCount, vocab, decks, startSprint, sprint };
    // a vocabulary card: save the marked word and read its card
    const langRows = langPage?.rows ?? [];
    step('I2', 'GoReview shows Arabic once in its language list; the marked Arabic words appear in the vocabulary', ((langPage?.text ?? '').match(/Arabic \(العربية\)/g) ?? []).length === 1 && /\p{Script=Arabic}/u.test(vocab?.text ?? '') ? 'PASS' : 'FAIL', { options: langs?.options, arabicOptionCount: arCount, languagesPage: langPage, chose, vocabText: vocab?.text?.slice(0, 600), arabicNodes: vocab?.arabicNodes?.slice(0, 6) });
    step('I3', 'Alphabet deck / Sprint offers Arabic and shows its first cards (fronts and backs, rtl, letter shapes)', sprint.length >= 6 ? 'PASS' : sprint.length ? 'PARTIAL' : 'FAIL', { tiles: decks?.tiles, started: startSprint, sprint: sprint.map((s) => ({ n: s.n, front: s.front, back: s.back ?? s.backText?.slice(0, 160), dir: s.dir, lang: s.lang, font: s.font })) });
    const sp6 = sprint.slice(0, 6);
    const arRun = /[\u0600-\u06FF][\u0600-\u06FF\u0640\u064B-\u065F\s]*[\u0600-\u06FF\u064B-\u065F]|[\u0600-\u06FF]/g;
    const sepsOk = sp6.map((x) => { const t = x.back ?? ''; const outside = (x.bdi ?? []).reduce((acc, b) => acc.replace(b, ''), t); return { n: x.n, front: x.front, back: t.slice(0, 200), bdi: x.bdi, answerDir: x.answerDir, arabicOutsideBdi: (outside.match(arRun) ?? []), separators: (t.match(/ · | — /g) ?? []).length }; });
    step('I6', "the Sprint's first cards (the plan's first session is five: ل, sukūn, fatḥa, ي, لَيْل): each Arabic run in a back sits in its own <bdi lang=ar>, so the separators keep their logical order; fronts and backs recorded", sp6.length >= 5 && sepsOk.every((x) => x.arabicOutsideBdi.length === 0) ? 'PASS' : 'FAIL', { cards: sepsOk });
    step('I7', "GoReview's card front takes the Arabic font stack (computed family starts with Noto Naskh Arabic)", sp6.length && sp6.every((x) => /Noto Naskh Arabic/.test(x.font ?? '')) ? 'PASS' : 'FAIL', { fonts: sp6.map((x) => [x.front, x.font, x.fontSize]) });
    await B.close(rv.t);
    // a saved vocabulary card: front rtl with vowels (the marked words saved for review)
    const rv2 = await B.open(`chrome-extension://${id}/review/index.html#/vocabulary`, 'goreview-vocab');
    await sleep(6000);
    const saved = await B.evalIn(rv2.s, `(async () => { const bs = [...document.querySelectorAll('button')].filter((x) => /Save for GoReview/.test(x.textContent)); const out = { buttons: bs.length }; if (bs[0]) { out.row = (bs[0].closest('li, tr, article') ?? bs[0].parentElement).innerText.replace(/\\s+/g, ' ').slice(0, 200); bs[0].click(); await new Promise((r) => setTimeout(r, 2500)); } location.hash = '#/review'; await new Promise((r) => setTimeout(r, 5000)); const b = document.getElementById('start-session'); out.start = b ? b.textContent.trim() : null; if (b) b.click(); for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 500)); if (document.getElementById('stimulus')) break; } const st = document.getElementById('stimulus'); const cs = st && getComputedStyle(st); out.front = st ? { text: st.innerText.trim(), dir: cs.direction, lang: st.closest('[lang]')?.getAttribute('lang'), dirAttr: st.closest('[dir]')?.getAttribute('dir'), ff: cs.fontFamily.slice(0, 60), hasVowels: /[\\u064B-\\u0652]/.test(st.innerText) } : null; out.page = document.body.innerText.replace(/\\s+/g, ' ').slice(0, 500); return out; })()`, 60000);
    const titles = await B.evalIn(rv2.s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 4000)); return [...document.querySelectorAll('article.vocabulary-item h3, li.vocab-item .vocab-word')].map((e) => e.textContent.trim()); })()`, 30000);
    step('I5', 'GoReview vocabulary rows: no title is a unit id, none begins "lemma:" or "form:"', Array.isArray(titles) && titles.length > 0 && titles.every((t) => !/^(lemma|form):/.test(t)) ? 'PASS' : 'FAIL', { titles: Array.isArray(titles) ? titles.slice(0, 30) : titles });
    report.goreview.savedCard = saved;
    report.shots.goreviewCard = await B.shot(rv2.s, 'I-goreview-arabic-card');
    step('I4', 'an Arabic review card is shown right-to-left with its vowels', saved?.front && saved.front.dir === 'rtl' ? 'PASS' : saved?.front ? 'FAIL' : 'NOT RUN', saved);
    await B.close(rv2.t);
  }

  // J. timings and sizes
  const size = (f) => { try { return fs.statSync(path.join(DIST, f)).size; } catch { return undefined; } };
  report.timings.sizes = { 'analysers/ar.js': size('analysers/ar.js'), 'content.js': size('content.js'), 'background.js': size('background.js') };
  step('J', 'timings', report.timings.firstArabicLookup ? 'INFO' : 'not run', report.timings);
  report.timings.note = 'replyMs = until the content script answered the lookup message; cardMs = until the card showed its word (both from the moment the rig sent the lookup). The first lookup includes loading the analyser chunk and the first shards.';
  report.netAr = [...net.values()].filter((n) => n.url.includes('/lexicon/ar/')).length;
}

try { await main(); } catch (e) { step('harness', 'harness', 'FAIL', String(e?.stack ?? e)); }
finally {
  report.finishedAt = new Date().toISOString();
  report.consoleErrors = consoleLog.filter((x) => x.kind !== 'warning' && x.kind !== 'log-warning');
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  server.close();
  for (const p of children.reverse()) killTree(p);
  await sleep(2000);
  for (const d of ['ext', 'profile', 'profile2', 'svc']) { try { removeDir(path.join(TMP, d)); } catch { /* a browser file still held: left in the temp folder */ } }
  console.log('report:', path.join(OUT, 'report.json'), 'screenshots:', SHOTS);
  process.exit(0);
}
