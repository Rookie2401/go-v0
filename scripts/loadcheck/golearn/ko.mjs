// GoLearn Korean real-browser run (package B, 2026-11-25): the real built extension (with its setup page and GoReview page) in a throw-away
// headless Brave profile, a throw-away LOCAL Repository service with a generated test account, and three ordinary Korean pages (plus an English
// one) served from ko-pages/, written for this run and not from the pack's tests. Walks the sixteen steps of the brief's section XXII and
// writes every reading to a JSON report. Adapted from ru.mjs. Nothing here touches the owner's profile, service or account; the hosted
// service is never contacted (the copy's service address is the local one). The account's credentials are generated at run time, kept in
// memory and never printed.
//   node scripts/loadcheck/golearn/ko.mjs [dist] [outDir] [gate|reading]
// "gate" runs only step 12 (the review-gate cards and what GoReview makes of them), which uses a second throw-away profile with no account;
// its report is report-gate.json. "reading" runs only the setup (step 1) and Reading Analysis (step 9) with Active on; report-reading.json.
// Environment: LOADCHECK_BRAVE (required), LOADCHECK_TMP (optional; default <temp>/loadcheck-golearn-ko). No real site is visited.
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
const TMP = process.env.LOADCHECK_TMP || path.join(os.tmpdir(), 'loadcheck-golearn-ko');
const OUT = path.resolve(process.argv[3] || path.join(TMP, 'out'));
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const PORT = 9381, PORT2 = 9382, WEB = 8795, SVC = 8811;
/** HOSTED_DICT=1: the dictionaries come from this rig's web server as the hosted fallback (public/dict served at /hosted/dict/), as on gh-pages. */
const HOSTED = process.env.HOSTED_DICT === '1';
const PAGES = path.join(HERE, 'ko-pages');
const SHOTS = path.join(OUT, 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

// ── the throw-away folders (never a real one: only the rig's own subfolders are removed) ──
/** removes a folder; a junction inside it (into dist/) is unlinked first and never followed */
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
/** a copy of a page folder whose small files are copied (config.json is edited) and whose big folders are junctions */
const copyPageDir = (name, bigDirs) => {
  const from = path.join(DIST, name), to = path.join(EXT, name);
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(to);
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isDirectory() && bigDirs.includes(e.name)) junction(path.join(from, e.name), path.join(to, e.name));
    else if (e.isDirectory()) fs.cpSync(path.join(from, e.name), path.join(to, e.name), { recursive: true });
    else fs.copyFileSync(path.join(from, e.name), path.join(to, e.name));
  }
  const cfgPath = path.join(to, 'config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfg.serviceUrl = `http://127.0.0.1:${SVC}`; // the LOCAL throw-away service, never the hosted one
    if (HOSTED) cfg.dictionaryFallbackUrl = `http://127.0.0.1:${WEB}/hosted/`; // the stand-in for https://rookie2401.github.io/go-v0/
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  }
  return true;
};
for (const e of fs.readdirSync(DIST, { withFileTypes: true })) {
  if (e.name === 'translation.local.json') continue;
  if (e.isDirectory() && e.name === 'app') copyPageDir('app', ['dict', 'fonts']);
  else if (e.isDirectory() && e.name === 'review') copyPageDir('review', ['dict', 'lexicon', 'assets']);
  else if (e.isDirectory()) junction(path.join(DIST, e.name), path.join(EXT, e.name));
  else fs.copyFileSync(path.join(DIST, e.name), path.join(EXT, e.name));
}
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
// granted at install, as the learner's click on the Active switch would grant it (he.mjs does the same)
manifest.host_permissions = ['https://*/*', 'http://*/*'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));

// ── the fixture pages (each URL may carry ?n= to make a fresh tab) ──
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = path.join(PAGES, path.basename(u.pathname));
  if (u.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (HOSTED && u.pathname.startsWith('/hosted/dict/')) {
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
let svc, svcExit;
const startSvc = () => {
  svcExit = undefined;
  svc = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite-node/dist/cli.mjs'), 'packages/repository-service/src/main.ts', '--port', String(SVC), '--data', path.join(TMP, 'svc'), '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(svc);
  svc.stdout.on('data', (d) => svcLog.push(String(d).slice(0, 300)));
  svc.stderr.on('data', (d) => svcLog.push(String(d).slice(0, 300)));
  svc.on('exit', (code) => { svcExit = code; svcLog.push('exited with ' + code); });
  svc.on('error', (e) => { svcExit = -1; svcLog.push('spawn error ' + e); });
};
startSvc();
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
let phase = 'start';
const net = [];
class Conn {
  constructor(url, tag) {
    this.tag = tag; this.ws = new WebSocket(url); this.wait = new Map(); this.names = new Map(); this.contexts = new Map();
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); return; }
      const who = `${this.tag}:${this.names.get(d.sessionId) ?? 'browser'}`;
      if (d.method === 'Network.requestWillBeSent') net.push({ who, url: d.params.request.url, at: Date.now() });
      if (d.method === 'Runtime.executionContextCreated') { const l = this.contexts.get(d.sessionId) ?? []; l.push(d.params.context); this.contexts.set(d.sessionId, l); }
      if (d.method === 'Runtime.exceptionThrown') consoleLog.push({ phase, who, kind: 'exception', text: (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? '').slice(0, 700) });
      if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(d.params.type)) consoleLog.push({ phase, who, kind: d.params.type, text: d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 700) });
      if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level)) consoleLog.push({ phase, who, kind: `log-${d.params.entry.level}`, text: `${d.params.entry.text} ${d.params.entry.url ?? ''}`.slice(0, 700) });
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId, ms = 90000) { const id = ++seq; return new Promise((res) => { this.wait.set(id, res); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); res({ error: { message: `timeout ${method}` } }); } }, ms); }); }
}

// ── the report ──
const report = { startedAt: new Date().toISOString(), dist: DIST, tmp: TMP, steps: [], cards: [], timings: {}, console: consoleLog };
const step = (n, name, status, evidence) => {
  report.steps.push({ step: n, name, status, evidence });
  console.log(`[${n}] ${status} ${name} ${JSON.stringify(evidence)?.slice(0, 700)}`);
};
const MODE = process.argv[4] ?? '';
const GATE_ONLY = MODE === 'gate';
const REPORT = MODE ? `report-${MODE}.json` : 'report.json';

// ── helpers bound to one browser ──
function browserApi(c) {
  const api = {};
  api.targets = async () => (await c.send('Target.getTargets')).result.targetInfos;
  api.attach = async (targetId, name) => { const s = (await c.send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId; c.names.set(s, name); await c.send('Runtime.enable', {}, s); await c.send('Log.enable', {}, s); await c.send('Network.enable', {}, s); return s; };
  api.evalIn = async (s, expression, ms, contextId) => { const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) }, s, ms); if (r.error) return { error: r.error.message }; if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }; return r.result?.result?.value; };
  api.findSw = async () => { for (let i = 0; i < 60; i++) { const sw = (await api.targets()).find((t) => t.type === 'service_worker' && t.url.includes('background.js')); if (sw) return sw; await sleep(250); } return undefined; };
  api.open = async (url, name, opts = {}) => { const t = (await c.send('Target.createTarget', { url, ...opts })).result.targetId; const s = await api.attach(t, name); await c.send('DOM.enable', {}, s); return { t, s, url }; };
  api.close = async (t) => c.send('Target.closeTarget', { targetId: t });
  /** the card's closed shadow root, as a remote object (read through the protocol, as a test can; the page cannot) */
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
  api.shot = async (s, name) => {
    const r = await c.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1200, height: 900, scale: 0.6 } }, s);
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
  // the lemma line is left out when the lemma is the selected form: the Form layer still names it ("LEMMA maison (NOUN)")
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
    rows: [...card.querySelectorAll('[data-row]')].map((r) => r.dataset.row + ': ' + tx(r)).slice(0, 60),
    headings: [...card.querySelectorAll('h3, h4')].map(tx),
    layers: Object.fromEntries([...card.querySelectorAll('[data-layer]')].map((l) => [l.dataset.layer, (tx(l) ?? '').slice(0, 1500)])),
    pressed: [...card.querySelectorAll('.rateBtn')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.mark),
    rateButtons: [...card.querySelectorAll('.rateBtn')].map((b) => b.dataset.mark),
    levelName: tx(card.querySelector('.levelName')),
    translit: (() => { const e = card.querySelector('[data-row="transliteration"]'); return e ? { text: tx(e), title: e.getAttribute('title'), aria: e.getAttribute('aria-label') } : undefined; })(),
    soundRow: (() => { const e = card.querySelector('[data-row="sound"]'); return e ? { text: tx(e), title: e.getAttribute('title'), aria: e.getAttribute('aria-label') } : undefined; })(),
    sourceLinks: [...card.querySelectorAll('a[href], [data-row="source"], .source')].map((a) => (tx(a) ?? '') + ' ' + (a.getAttribute('href') ?? '')).slice(0, 8),
    encounters: tx(card.querySelector('.encounters')),
    say: card.querySelector('.say') ? { text: tx(card.querySelector('.say')), disabled: !!card.querySelector('.say')?.disabled, title: card.querySelector('.say')?.title } : undefined,
    status: tx(card.querySelector('.status')),
    feedback: tx(card.querySelector('.feedback')),
  };
}`;
const CLICK = `function (sel) { const b = this.querySelector(sel); if (!b) return { clicked: false }; b.click(); return { clicked: true, text: (b.innerText || b.getAttribute('aria-label') || '').trim() }; }`;

async function main() {
  // the service first
  let health;
  const t0svc = Date.now();
  for (const end = Date.now() + 900000; Date.now() < end && !health && svcExit === undefined;) { try { const r = await fetch(`${SVC_URL}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) health = await r.json(); else await sleep(1000); } catch { await sleep(1000); } }
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

  /** select `word` (the nth whole-word occurrence inside element #id) and ask for a lookup as the keyboard command does; read the card */
  async function lookup(pg, target, opts = {}) {
    const { inject = true, deeper = true, settleMs = 1500 } = opts;
    const sel = await B.evalIn(pg.s, `(() => {
      const root = document.getElementById(${J(target.id)}); if (!root) return { err: 'no element ' + ${J(target.id)} };
      const w = document.createTreeWalker(root, 4); const L = /[\\p{L}\\p{M}]/u; const word = ${J(target.word)}; const elided = /[’']$/.test(word); let k = 0;
      for (let t = w.nextNode(); t; t = w.nextNode()) { let i = -1;
        while ((i = t.data.indexOf(word, i + 1)) >= 0) {
          const b = t.data[i - 1], a = t.data[i + word.length];
          if ((b && L.test(b)) || (!elided && a && L.test(a))) continue;
          if (k++ < ${target.n ?? 0}) continue;
          const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + word.length);
          t.parentElement.scrollIntoView({ block: 'center' });
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
          return { selected: s.toString(), sentence: t.data.slice(Math.max(0, t.data.lastIndexOf('.', i - 1) + 1), Math.min(t.data.length, (t.data.indexOf('.', i) + 1) || t.data.length)).trim() };
        } }
      return { err: 'word not found' }; })()`);
    if (sel?.err) return { sel, error: sel.err };
    // the previous card goes, so the one read below is this lookup's (the content script makes a new host when its own is gone)
    await B.evalIn(pg.s, `document.querySelectorAll('[data-golearn-host]').forEach((h) => h.remove())`);
    const t0 = Date.now();
    const reply = await B.evalIn(ctl.s, `(async () => { const t = (await chrome.tabs.query({})).find((x) => x.url === ${J(pg.url)}); if (!t) return { err: 'no tab' };
      ${inject ? "try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); } catch (e) { return { err: 'inject: ' + e }; }" : ''}
      const r = await chrome.tabs.sendMessage(t.id, { type: 'golearn:lookup', trigger: 'command', focus: true }).catch((e) => ({ err: String(e) }));
      return r && typeof r === 'object' ? { status: r.status, reason: r.reason, message: r.message, language: r.language && { id: r.language.languageId, basis: r.language.basis, confidence: r.language.confidence } } : r; })()`, 60000);
    const replyMs = Date.now() - t0;
    let card, cardMs;
    for (let i = 0; i < 80; i++) {
      card = await B.onCard(pg.s, READ_CARD);
      if (card && !card.nocard && (card.lemma || card.word)) { cardMs ??= Date.now() - t0; if (!/looking up/i.test(card.meaning ?? '') || i > 30) break; }
      if (reply?.status === 'message' && i > 4) break;
      await sleep(250);
    }
    // the learner's own mark arrives with the learner model, after the card: wait for it when asked
    if (opts.waitMark && card && !card.nocard) {
      for (let i = 0; i < 24 && !(card.pressed?.length); i++) { await sleep(250); card = await B.onCard(pg.s, READ_CARD); }
    }
    if (deeper && card && !card.nocard) {
      await B.onCard(pg.s, CLICK, ['.deeperBtn']);
      await sleep(settleMs);
      card = await B.onCard(pg.s, READ_CARD);
    }
    return { sel, reply, replyMs, cardMs, card };
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
  const exportEvents = async () => {
    const ex = await msg({ type: 'golearn:local-repo', op: 'export' });
    return (ex?.events ?? []).map((e) => ({ kind: e.kind, at: e.occurredAt ?? e.at, languageId: e.languageId ?? e.subject?.languageId, units: e.subject?.unitIds ?? e.subject?.itemIds ?? e.unitIds, mark: e.payload?.mark, payload: e.kind === 'ItemMarked' || /^Card|Assessment/.test(e.kind) ? e.payload : undefined, subject: e.kind === 'ItemMarked' ? e.subject : undefined }));
  };
  const cardLine = (r) => r?.card ? { lemma: r.card.lemma, pos: r.card.pos, kicker: r.card.lemmaKicker, meaning: r.card.meaning, language: r.card.host?.['data-language-id'], basis: r.card.host?.['data-language-basis'] } : { error: r?.error, reply: r?.reply };

  // ───────────────────────── Korean-specific helpers ─────────────────────────
  const extUrl = (p) => `chrome-extension://${id}/${p}`;
  const kb = (n) => (n === undefined ? undefined : Math.round(n / 1024 * 10) / 10 + ' KB');
  const sizeOf = (url) => { const m = String(url).match(/^chrome-extension:\/\/[a-p]{32}\/(.+?)(?:\?.*)?$/); if (!m) return undefined; try { return fs.statSync(path.join(DIST, decodeURIComponent(m[1]))).size; } catch { return undefined; } };
  /** requests the page's own session made since `since` (the protocol's own Network events; the content script's fetches and imports are among them) */
  const netOf = (name, since = 0) => net.filter((n) => n.who === `b1:${name}` && n.at >= since).map((n) => n.url);
  const koRequests = (urls) => {
    const out = { analyser: {}, lexicon: {}, dict: {}, others: [] };
    for (const u of urls) {
      if (/\/analysers\/[^/]*ko\.js/.test(u)) out.analyser[u] = (out.analyser[u] ?? 0) + 1;
      else if (/\/lexicon\/ko\//.test(u)) out.lexicon[u] = (out.lexicon[u] ?? 0) + 1;
      else if (/\/dict\/ko\//.test(u)) out.dict[u] = (out.dict[u] ?? 0) + 1;
    }
    return out;
  };
  const resourcesOf = (pg) => B.evalIn(pg.s, `performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /extension|lexicon|analyser|dict/i.test(n))`);
  const heap = (pg) => B.evalIn(pg.s, `performance.memory ? { usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10, totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576 * 10) / 10 } : null`);
  /** every Hangul word (a run of non-space characters holding Hangul) on the page, with the highlight(s) over it */
  const AUDIT = `(() => {
    const reg = globalThis.CSS?.highlights; if (!reg) return { err: 'no highlight registry' };
    const ranges = []; for (const [name, hl] of reg) for (const r of hl) ranges.push({ name: name.replace('golearn-', ''), r });
    if (!ranges.length) return { empty: true, ranges: 0 };
    const out = []; const w = document.createTreeWalker(document.body, 4);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const re = /\\S+/g; let m;
      while ((m = re.exec(t.data))) {
        let s = m.index, e = s + m[0].length;
        while (s < e && !/[\\p{L}\\p{N}]/u.test(t.data[s])) s++;
        while (e > s && !/[\\p{L}\\p{N}]/u.test(t.data[e - 1])) e--;
        const word = t.data.slice(s, e);
        if (!/[\\uAC00-\\uD7A3]/.test(word)) continue;
        const hits = ranges.filter(({ r }) => r.startContainer === t && r.endContainer === t && r.startOffset < e && r.endOffset > s).map((x) => x.name + ':' + t.data.slice(x.r.startOffset, x.r.endOffset));
        out.push({ id: t.parentElement.closest('[id]')?.id ?? '', w: word, hits });
      }
    }
    return { ranges: ranges.length, tokens: out };
  })()`;
  const audit = async (pg) => {
    const main = await B.evalIn(pg.s, AUDIT);
    if (main && main.tokens) return { world: 'main', ...main };
    for (const ctx of (c.contexts.get(pg.s) ?? []).filter((x) => x.auxData?.type === 'isolated')) {
      const v = await B.evalIn(pg.s, AUDIT, 10000, ctx.id);
      if (v && v.tokens) return { world: `isolated:${ctx.name}`, ...v };
    }
    return { world: 'none', main };
  };
  const summarise = (a) => {
    const toks = a.tokens ?? [];
    const levels = {};
    for (const t of toks) { const lv = t.hits.length ? t.hits[0].split(':')[0] : 'none'; levels[lv] = (levels[lv] ?? 0) + 1; }
    return { eojeol: toks.length, levels, blank: toks.filter((t) => !t.hits.length).map((t) => t.w), marked: toks.filter((t) => t.hits.length).map((t) => `${t.w}=${t.hits.join('+')}`) };
  };
  const lagProbe = (pg) => B.evalIn(pg.s, `(() => { window.__lag = []; let last = performance.now(); window.__lagTimer = setInterval(() => { const n = performance.now(); window.__lag.push(Math.round(n - last - 50)); last = n; }, 50); return 1; })()`);
  const lagRead = (pg) => B.evalIn(pg.s, `(() => { clearInterval(window.__lagTimer); const l = window.__lag ?? []; return { samples: l.length, maxGapMs: Math.max(0, ...l), over100ms: l.filter((x) => x > 100).length }; })()`);
  /** open a page with Active on and wait until the marks stop changing; time to the last mark */
  async function activate(name, label) {
    const url = page(name);
    const t0 = Date.now();
    const pg = await B.open(url, label);
    await c.send('Target.activateTarget', { targetId: pg.t });
    await lagProbe(pg);
    let last, lastKey = '', lastChange = t0, firstScanAt, seenScan = false;
    for (let i = 0; i < 400; i++) {
      const st = await ping(pg);
      const a = st?.activeState;
      if (a?.scanned > 0) { seenScan = true; firstScanAt ??= Date.now(); }
      const key = a ? `${a.scanned}|${Object.values(a.marked ?? {}).join(',')}|${a.confirmed}|${a.unconfirmed}|${a.skipped}` : '';
      if (key !== lastKey) { lastKey = key; lastChange = Date.now(); }
      last = a;
      if (seenScan && Date.now() - lastChange > 3500) break;
      await sleep(120);
    }
    const lag = await lagRead(pg);
    const au = await audit(pg);
    return { pg, url, activeState: last, firstScanMs: firstScanAt && firstScanAt - t0, lastMarkMs: lastChange - t0, lag, audit: au, summary: summarise(au) };
  }
  const markOnCard = async (pg, target, mark, opts = {}) => {
    const r = await lookup(pg, target, { deeper: false, inject: opts.inject ?? false, waitMark: true });
    const click = await B.onCard(pg.s, CLICK, [`.rateBtn[data-mark="${mark}"]`]);
    await sleep(1500);
    const after = await B.onCard(pg.s, READ_CARD);
    return { before: r.card?.pressed, click, pressed: after?.pressed, levelName: after?.levelName, status: after?.status, lemma: r.card?.lemma ?? r.card?.word };
  };

  /** GoReview's language, as it shows it now: the kicker in the header, and the names on its Languages page */
  async function reviewLanguages(rv) {
    return B.evalIn(rv.s, `(async () => { const header = document.getElementById('language-name')?.textContent.trim(); location.hash = '#/languages'; await new Promise((r) => setTimeout(r, 4000)); const listed = [...document.querySelectorAll('.account-language-name, .deck-title')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60)); location.hash = '#/review'; await new Promise((r) => setTimeout(r, 4000)); return { header, listed }; })()`, 30000);
  }

  /** where the card and one of its rows stand, and anything that sticks out of the card or scrolls sideways */
  const GEOMETRY = `function (sel) {
    const card = this.querySelector('.card'); const row = card.querySelector(sel);
    const box = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const inView = (e) => { const b = e.getBoundingClientRect(), r = card.getBoundingClientRect(); return b.top >= Math.max(0, r.top) - 1 && b.bottom <= Math.min(innerHeight, r.bottom) + 1; };
    const visibleBefore = row ? inView(row) : undefined;
    row?.scrollIntoView({ block: 'nearest' });
    const r = card.getBoundingClientRect(); const sideways = [];
    for (const e of [card, ...card.querySelectorAll('*')]) {
      if (!e.getClientRects().length || e.closest('.sr, [hidden]')) continue;
      const b = e.getBoundingClientRect(); const name = e.tagName.toLowerCase() + '.' + String(e.getAttribute('class') ?? '');
      if (b.width > 1 && (b.right > r.right + 1 || b.left < r.left - 1)) sideways.push(name + ' outside the card by ' + Math.round(Math.max(b.right - r.right, r.left - b.left)) + 'px');
      if (e.clientWidth > 1 && e.scrollWidth > e.clientWidth + 1) sideways.push(name + ' scrollWidth ' + e.scrollWidth + ' > ' + e.clientWidth);
    }
    return { card: box(card), row: row && box(row), rowVisibleWithoutScrolling: visibleBefore, rowVisibleNow: row && inView(row), cardScrolls: card.scrollHeight > card.clientHeight + 1, viewport: { w: innerWidth, h: innerHeight }, scroll: { x: scrollX, y: scrollY }, insideViewport: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, sideways: sideways.slice(0, 12) };
  }`;
  /** the card with a margin round it (so that anything spilling out of it shows) */
  const cardShot = async (pg, geo, name) => {
    const m = 24, k = geo.card;
    const r = await c.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, k.x + geo.scroll.x - m), y: Math.max(0, k.y + geo.scroll.y - m), width: k.w + 2 * m, height: k.h + 2 * m, scale: 1.5 } }, pg.s);
    if (!r.result?.data) return undefined;
    const f = path.join(OUT, name + '.png');
    fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
    return f;
  };

  // ═════════ 12. the review gate: two words, a held word, 겁니다; then what GoReview makes of them (a second profile, no account) ═════════
  async function gatePhase() {
    phase = 'gate';
    const out = (report.gate = {});
    killTree(b1);
    await sleep(3000);
    b1 = launch(PORT2, 'profile2');
    version = undefined;
    for (let i = 0; i < 60 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT2}/json/version`)).json(); } catch { await sleep(500); } }
    if (!version) throw new Error('brave did not start (second profile)');
    report.browser = version.Browser;
    c = new Conn(version.webSocketDebuggerUrl, 'b2'); await c.open();
    B = browserApi(c);
    const sw3 = await B.findSw();
    if (!sw3) throw new Error('the extension did not load (second profile)');
    await B.attach(sw3.targetId, 'worker');
    out.sameExtensionId = new URL(sw3.url).host === id;
    ctl = await B.open(extUrl('app/index.html#/languages'), 'setup');
    await sleep(3500);
    const clicked = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ko"]'); if (!r) return 'no row'; r.querySelectorAll('details').forEach((d) => d.open = true); const b = r.querySelector('button[data-action="choose"]'); if (!b) return 'no button'; b.click(); return 'clicked ' + b.textContent.trim(); })()`);
    let feedback = '';
    for (let i = 0; i < 360; i++) {
      feedback = await B.evalIn(ctl.s, `document.querySelector('li.lang-row[data-language="ko"] .lang-feedback')?.innerText.replace(/\\s+/g, ' ').slice(0, 400) ?? ''`);
      if (/is ready|did not|not pass/i.test(feedback)) break;
      await sleep(1000);
    }
    await popup('ko');
    await msg({ type: 'golearn:active', op: 'set', patch: { active: false } });
    out.install = { clicked, feedback, ok: /Korean is ready/i.test(feedback) };
    step('12-install', 'second profile, no account: Korean installed on the setup page', out.install.ok ? 'PASS' : 'FAIL', out.install);

    const pg = await B.open(page('gate'), 'gate');
    await sleep(2000);
    let first = true;
    const look = async (target) => {
      const r = await lookup(pg, target, { inject: first, deeper: false });
      first = false;
      await sleep(2000);
      r.card = await B.onCard(pg.s, READ_CARD);
      return r;
    };
    const rowOf = (r, name) => (r.card?.rows ?? []).find((x) => x.startsWith(name + ': '))?.slice(name.length + 2);
    const brief = (r) => ({ word: r.card?.word, lemma: r.card?.lemma, pos: r.card?.pos, meaning: r.card?.meaning, rows: r.card?.rows, text: r.card?.text?.slice(0, 900), error: r.error });
    const markIt = async () => { const click = await B.onCard(pg.s, CLICK, ['.rateBtn[data-mark="recognized"]']); await sleep(1500); return click; };

    // (a) 피는: no one word is the headline
    let r = await look({ id: 'g1', word: '피는' });
    const two = rowOf(r, 'two-words');
    const items = (r.card?.rows ?? []).filter((x) => x.startsWith('two-words-item: ')).map((x) => x.slice(16));
    let geo = r.card && !r.card.nocard ? await B.onCard(pg.s, GEOMETRY, ['[data-row="two-words"]']) : undefined;
    out.twoWords = { ...brief(r), block: two, items, hold: rowOf(r, 'review-hold'), geometry: geo, shot: geo?.card && (await cardShot(pg, geo, 'shot-two-words')) };
    step('12a', '피는: the card shows the two-words block naming 피 and 피다', two?.startsWith('The sentence does not decide which of these words this is:') && items.some((x) => /^피(?![가-힣])/.test(x)) && items.some((x) => /^피다/.test(x)) ? 'PASS' : 'FAIL', { block: two, items, hold: out.twoWords.hold, geometry: geo });
    out.twoWords.mark = await markIt();

    // (b) 눈이 예뻐요: held from review, and the card says so
    r = await look({ id: 'g2', word: '눈이' });
    const hold = rowOf(r, 'review-hold');
    geo = r.card && !r.card.nocard ? await B.onCard(pg.s, GEOMETRY, ['[data-row="review-hold"]']) : undefined;
    out.held = { ...brief(r), line: hold, geometry: geo, shot: geo?.card && (await cardShot(pg, geo, 'shot-held')) };
    step('12b', '눈이 예뻐요: the card shows "Not added to review:"', hold?.startsWith('Not added to review:') ? 'PASS' : 'FAIL', { line: hold, lemma: r.card?.lemma, meaning: r.card?.meaning, geometry: geo });
    out.held.mark = await markIt();

    // (c) 겁니다 is 거, not 걸다
    r = await look({ id: 'g3', word: '겁니다' });
    out.geopnida = brief(r);
    const head = [r.card?.lemma, r.card?.meaning, ...(r.card?.rows ?? []).filter((x) => /^(meaning|lemma-gloss|two-words)/.test(x))].join(' | ');
    out.geopnida.shot = await B.shot(pg.s, 'card-geopnida');
    step('12c', '내일 갈 겁니다: the card for 겁니다 shows 거 (thing), not 걸다 "to hang"', /^거(?![가-힣])/.test(r.card?.lemma ?? '') && /thing/i.test(r.card?.meaning ?? '') && !/걸다|to hang/i.test(head) ? 'PASS' : 'FAIL', { lemma: r.card?.lemma, pos: r.card?.pos, meaning: r.card?.meaning, rows: r.card?.rows });

    // two ordinary words, marked
    out.marked = {};
    for (const word of ['친구가', '책을']) {
      r = await look({ id: 'g4', word });
      out.marked[word] = { ...brief(r), hold: rowOf(r, 'review-hold'), click: await markIt() };
    }
    await B.close(pg.t);
    const rawEvents = async () => (await msg({ type: 'golearn:local-repo', op: 'export' }))?.events ?? [];
    out.itemMarked = (await rawEvents()).filter((e) => e.kind === 'ItemMarked').map((e) => ({ mark: e.payload?.mark, itemIds: e.subject?.itemIds }));
    const cand = await msg({ type: 'golearn:local-repo', op: 'candidates', languageId: 'ko', limit: 50 });
    out.candidates = cand?.candidates ? cand.candidates.map((x) => x.unitId ?? x.itemId ?? J(x).slice(0, 120)) : cand;

    // (d) GoReview: Korean offered; every card of the session is read and answered Easy, until it ends
    const rv = await B.open(extUrl('review/index.html'), 'goreview-gate');
    await sleep(7000);
    const langs = await reviewLanguages(rv);
    out.review = { languages: langs, home: await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 700)`), cards: [] };
    step('12d', 'GoReview offers Korean', langs?.header === 'Korean' && (langs?.listed ?? []).some((n) => /Korean/.test(n)) ? 'PASS' : 'FAIL', { ...langs, home: out.review.home.slice(0, 300) });
    const readFront = `(() => { const s = document.getElementById('session'); if (!s) return null; return { stimulus: document.getElementById('stimulus')?.innerText.trim(), instruction: document.getElementById('instruction')?.innerText.trim(), reveal: !!(document.getElementById('reveal') ?? document.getElementById('flip-card')), text: s.innerText.replace(/\\s+/g, ' ').slice(0, 400) }; })()`;
    out.review.start = await B.evalIn(rv.s, `(() => { const b = document.getElementById('start-session') ?? document.getElementById('start-new'); if (!b) return { err: 'no start button', page: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 700) }; b.click(); return { clicked: b.id, text: b.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200) }; })()`);
    let stopped = 'card limit';
    for (let k = 0; k < 40; k++) {
      let front;
      for (let i = 0; i < 24; i++) { await sleep(500); front = await B.evalIn(rv.s, readFront); if (front?.stimulus && front.reveal) break; }
      if (!front?.stimulus || !front.reveal) { stopped = front?.stimulus ? 'a card without a reveal button: ' + front.text : 'no further card'; break; }
      await B.evalIn(rv.s, `(document.getElementById('reveal') ?? document.getElementById('flip-card')).click()`);
      await sleep(900);
      const answer = await B.evalIn(rv.s, `document.getElementById('revealed-answer')?.innerText.replace(/\\s+/g, ' ').trim()`);
      if (!out.review.cards.length) out.review.shot = await B.shot(rv.s, 'gate-goreview-first-card');
      const grade = await B.evalIn(rv.s, `(() => { const g = document.querySelector('.grade[data-grade="easy"]') ?? document.querySelector('.grade[data-grade="good"]'); if (!g) return 'no grade button'; g.click(); return g.dataset.grade; })()`);
      out.review.cards.push({ front: front.stimulus, instruction: front.instruction, answer, grade });
      await sleep(1500);
    }
    out.review.stopped = stopped;
    out.review.end = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 900)`);
    out.review.endShot = await B.shot(rv.s, 'gate-goreview-end');
    out.review.homeAfter = await B.evalIn(rv.s, `(async () => { location.hash = '#/review'; await new Promise((r) => setTimeout(r, 5000)); return document.body.innerText.replace(/\\s+/g, ' ').slice(0, 700); })()`, 20000);
    out.review.vocabulary = await B.evalIn(rv.s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 5000)); return (document.getElementById('vocabulary-results')?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 2500); })()`, 20000);
    const added = (await rawEvents()).filter((e) => e.kind === 'CardAdded');
    out.review.cardsAdded = added.map((e) => ({ subject: e.subject, payload: e.payload }));
    const addedText = J(added);
    const heldAdded = addedText.match(/(lemma|form):ko:(눈[¹²³⁴⁵⁶⁷⁸⁹]*이?|피(다|는)?[¹²³⁴⁵⁶⁷⁸⁹]*)(?![가-힣¹²³⁴⁵⁶⁷⁸⁹])/g) ?? [];
    const heldShown = out.review.cards.filter((x) => /^(눈이?|피|피다|피는)$/.test(x.front));
    const fromMarked = addedText.match(/lemma:ko:(친구|책)[¹²³⁴⁵⁶⁷⁸⁹]*:[A-Z]+/g) ?? [];
    step('12e', 'GoReview builds at least one card from a marked word', fromMarked.length ? 'PASS' : 'FAIL', { start: out.review.start, fromMarked: [...new Set(fromMarked)], cards: out.review.cards, marked: out.itemMarked });
    step('12f', 'GoReview builds no card from the held words (눈이, 피는)', out.review.cards.length && !heldAdded.length && !heldShown.length ? 'PASS' : 'FAIL', { cards: out.review.cards.map((x) => x.front), stopped, heldAdded, heldShown, cardsAdded: out.review.cardsAdded.length, candidates: out.candidates, end: out.review.end.slice(0, 300) });
    out.nonLocalRequests = [...new Set(net.map((n) => n.url).filter((u) => /^(https?|wss?):/.test(u) && !/^(https?|wss?):\/\/127\.0\.0\.1[:/]/.test(u)))].slice(0, 20);
    await B.close(rv.t);
  }

  const email = `ko-rig-${crypto.randomBytes(4).toString('hex')}@example.test`;
  const password = crypto.randomBytes(18).toString('base64url');
  const svcApi = async (method, p, body, token) => { const r = await fetch(`${SVC_URL}${p}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, body: j }; };
  const readAccount = async () => {
    try {
      const s = await svcApi('POST', '/sessions', { email, password, deviceId: 'ko-rig-reader', platform: 'rig' });
      const token = s.body?.token;
      if (!token) return { error: `session ${s.status}` };
      const enr = await svcApi('GET', '/enrolments', undefined, token);
      const ev = await svcApi('GET', '/events?languageId=ko&limit=1000', undefined, token);
      const kn = await svcApi('GET', '/knowledge?languageId=ko', undefined, token);
      const events = (ev.body?.events ?? []).map((e) => e.event ?? e);
      return {
        enrolments: (enr.body?.enrolments ?? []).map((e) => ({ languageId: e.languageId, packId: e.packId, packVersion: e.packVersion, ended: !!e.endedAt })),
        eventCount: events.length, eventKinds: events.reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] ?? 0) + 1 }), {}),
        itemMarked: events.filter((e) => e.kind === 'ItemMarked').map((e) => ({ languageId: e.languageId ?? e.subject?.languageId, mark: e.payload?.mark, itemIds: e.subject?.itemIds, at: e.occurredAt, payloadKeys: Object.keys(e.payload ?? {}), subjectKeys: Object.keys(e.subject ?? {}) })),
        reviews: events.filter((e) => /^Card|Assessment/.test(e.kind)).map((e) => ({ kind: e.kind, subject: e.subject, payload: e.payload })),
        knowledge: (kn.body?.knowledge ?? []).map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark, encounters: k.encounters })),
      };
    } catch (e) { return { error: String(e) }; }
  };
  const syncNow = async () => { const sy = await msg({ type: 'golearn:sync-now' }, 90000); const up = await msg({ type: 'golearn:local-repo', op: 'upload' }, 90000); await sleep(2500); return { sync: sy && { ok: sy.ok, pushed: sy.pushed, error: sy.error ?? sy.lastError, keys: Object.keys(sy) }, upload: up && JSON.stringify(up).slice(0, 200) }; };
  const cardBrief = (r) => r?.card && !r.card.nocard ? { word: r.card.word, lemma: r.card.lemma, pos: r.card.pos, kicker: r.card.lemmaKicker, meaning: r.card.meaning, rows: r.card.rows, translit: r.card.translit, soundRow: r.card.soundRow, sourceLinks: r.card.sourceLinks, headings: r.card.headings, layers: r.card.layers, text: r.card.text, language: r.card.host?.['data-language-id'], basis: r.card.host?.['data-language-basis'], sentence: r.sel?.sentence, replyMs: r.replyMs, cardMs: r.cardMs } : { error: r?.error, reply: r?.reply, sel: r?.sel, card: r?.card && { nocard: r.card.nocard, text: r.card.text?.slice(0, 600) } };

  if (GATE_ONLY) { await gatePhase(); return; }
  // ═════════ 1. account, then Korean through the setup page ═════════
  phase = 'setup';
  let packVersion;
  {
    await B.evalIn(ctl.s, `(async () => { location.hash = '#/signin'; await new Promise((r) => setTimeout(r, 1500)); return 1; })()`);
    let made;
    for (let attempt = 0; attempt < 5; attempt++) { made = await msg({ type: 'golearn:create-account', baseUrl: SVC_URL, email, password, displayName: 'Rig' }); if (made?.ok !== false) break; await sleep(8000); }
    await B.evalIn(ctl.s, `(async () => { location.hash = '#/languages'; location.reload(); return 1; })()`);
    await sleep(4000);
    report.account = { ok: made?.ok, error: made?.error, message: made?.message, line: await B.evalIn(ctl.s, `document.getElementById('account-link')?.getAttribute('aria-label') ?? document.body.innerText.slice(0, 200)`) };
    const netBefore = net.length;
    const row = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ko"]'); if (!r) return { err: 'no Korean row', rows: [...document.querySelectorAll('li.lang-row')].map((x) => x.dataset.language) }; return { name: r.querySelector('.lang-name')?.innerText.replace(/\\s+/g, ' ').trim(), level: r.querySelector('.lang-level')?.innerText.trim(), text: r.innerText.replace(/\\s+/g, ' ').slice(0, 500), rows: [...document.querySelectorAll('li.lang-row')].map((x) => x.dataset.language) }; })()`);
    const t0 = Date.now();
    const clicked = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ko"]'); if (!r) return 'no row'; r.querySelectorAll('details').forEach((d) => d.open = true); const b = r.querySelector('button[data-action="choose"]'); if (!b) return 'no button'; b.click(); return 'clicked ' + b.textContent.trim(); })()`);
    let state = '';
    for (let i = 0; i < 360; i++) {
      state = await B.evalIn(ctl.s, `[...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === 'ko').map((l) => l.textContent.replace(/\\s+/g, ' ').slice(0, 200)).join('|')`);
      if (state && /ready|not verify|did not/i.test(state)) break;
      await sleep(1000);
    }
    const feedback = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ko"]'); return r?.querySelector('.lang-feedback')?.innerText.replace(/\\s+/g, ' ').slice(0, 1200); })()`);
    const rec = { ...(await storage('pack:installed')), ...(await storage('golearn:pack:installed')) };
    const koRec = rec['golearn:pack:installed:pack:ko'] ?? rec['pack:installed:pack:ko'] ?? Object.entries(rec).find(([k]) => k.endsWith(':ko'))?.[1];
    packVersion = koRec?.version;
    const failures = (koRec?.verified?.validation ?? []).filter((v) => !v.pass);
    const dictReqs = net.slice(netBefore).filter((n) => n.who === 'b1:setup' && /dict\/ko|lexicon\/ko/.test(n.url)).map((n) => n.url.replace(/^chrome-extension:\/\/[a-p]{32}/, '<ext>'));
    const cfg = JSON.parse(fs.readFileSync(path.join(EXT, 'app', 'config.json'), 'utf8'));
    report.install = { row, clicked, state, feedback, records: Object.keys(rec ?? {}), config: cfg, dictRequests: dictReqs.length, dictRequestSample: [...new Set(dictReqs)].slice(0, 12), koRecord: koRec && { version: koRec.version, installedAt: koRec.installedAt, dictionaryManifest: koRec.verified?.dictionaryManifest, sampleShard: koRec.verified?.sampleShard, cases: koRec.verified?.validation?.length, failures } };
    step(1, 'account on the local service; Korean offered on the setup page and installed', report.account.ok !== false && /ready/i.test(state) && !!koRec ? 'PASS' : 'FAIL', { account: report.account, row: row?.name ?? row, level: row?.level, clicked, state, feedback: feedback?.slice(0, 400), seconds: Math.round((Date.now() - t0) / 1000), version: koRec?.version, dictionaryManifest: koRec?.verified?.dictionaryManifest, sampleShard: koRec?.verified?.sampleShard, validationCases: koRec?.verified?.validation?.length, validationFailures: failures, dictRequests: dictReqs.length, dictServedFrom: [...new Set(dictReqs.map((u) => u.replace(/[^/]*$/, '')))] });
  }
  {
    // the reading language through the popup, and the enrolment on the account
    const p = await popup('ko');
    let acct = await readAccount();
    if (!acct.enrolments?.some((e) => e.languageId === 'ko' && !e.ended)) {
      const enrol = await msg({ type: 'golearn:enrol', languageId: 'ko', packId: 'pack:ko', packVersion: packVersion ?? '1', goals: [{ kind: 'reading' }] });
      await sleep(1500);
      acct = await readAccount();
      report.enrol = enrol;
    }
    const st = await msg({ type: 'golearn:get-state' });
    report.popupKo = { ...p, state: { languageId: st?.languageId, chosen: st?.chosenLanguages }, enrolments: acct.enrolments };
  }

  if (MODE === 'reading') { await msg({ type: 'golearn:active', op: 'set', patch: { active: true } }); await readingStep(); return; }

  // ═════════ 2. Korean in the extension's own lists, once each ═════════
  {
    const pp = await popup();
    const koOpts = (pp.before?.options ?? []).filter((o) => o.startsWith('ko='));
    const setupCounts = await B.evalIn(ctl.s, `(async () => { location.hash = '#/languages'; await new Promise((r) => setTimeout(r, 1500)); return { rows: document.querySelectorAll('li.lang-row[data-language="ko"]').length, mine: document.querySelectorAll('li.mine[data-language="ko"]').length, allMine: [...document.querySelectorAll('li.mine')].map((l) => l.dataset.language) }; })()`);
    const rv = await B.open(extUrl('review/index.html'), 'goreview-lists');
    await sleep(6000);
    const langs = await B.evalIn(rv.s, `(async () => { const nm = document.getElementById('language-name'); const header = { name: nm?.textContent.trim(), title: nm?.getAttribute('title'), kickers: document.querySelectorAll('#language-name').length, select: !!document.getElementById('language-select') }; location.hash = '#/languages'; await new Promise((r) => setTimeout(r, 3500)); const t = document.body.innerText.replace(/\s+/g, ' '); const names = [...document.querySelectorAll('.account-language-name, .deck-title')].map((e) => e.textContent.trim().slice(0, 60)); return { header, languagesPageNames: names, koreanMentions: (t.match(/Korean/g) ?? []).length, text: t.slice(0, 700) }; })()`, 30000);
    const koReview = langs?.header?.name === 'Korean' && langs?.header?.kickers === 1 && (langs?.languagesPageNames ?? []).filter((n) => /Korean/.test(n)).length <= 1 ? ['header:Korean'] : [];
    await B.close(rv.t);
    report.lists = { popupOptions: pp.before?.options, setupCounts, reviewLanguages: langs };
    step(2, 'Korean appears once in the popup, the setup page lists and GoReview\'s selector', koOpts.length === 1 && setupCounts?.rows === 1 && setupCounts?.mine === 1 && koReview.length === 1 ? 'PASS' : 'FAIL', { popup: koOpts, setupRows: setupCounts?.rows, setupMine: setupCounts?.mine, review: koReview, goreview: langs });
  }

  // ═════════ 4a. an English page: no Korean chunk, no Korean lexicon ═════════
  phase = 'english';
  await msg({ type: 'golearn:active', op: 'set', patch: { active: false } });
  const netEnglish = {};
  {
    const t0 = Date.now();
    const pg = await B.open(page('english'), 'english');
    await sleep(4000);
    const r = await lookup(pg, { id: 'e1', word: 'baker' }, { deeper: false, settleMs: 800 });
    await sleep(1500);
    netEnglish.activeOff = { reqs: koRequests(netOf('english', t0)), resources: (await resourcesOf(pg)).filter((u) => /ko\b|\/ko\//.test(u)), lookup: cardLine(r) };
    await B.close(pg.t);
    await msg({ type: 'golearn:active', op: 'set', patch: { active: true } });
    const t1 = Date.now();
    const pg2 = await B.open(page('english'), 'english-active');
    await c.send('Target.activateTarget', { targetId: pg2.t });
    await sleep(7000);
    const st = await ping(pg2);
    netEnglish.activeOn = { reqs: koRequests(netOf('english-active', t1)), resources: (await resourcesOf(pg2)).filter((u) => /ko\b|\/ko\//.test(u)), activeState: st?.activeState && { languages: st.activeState.languages, scanned: st.activeState.scanned, reason: st.activeState.reason } };
    await B.close(pg2.t);
    await msg({ type: 'golearn:active', op: 'set', patch: { active: false } });
  }
  const noKo = (x) => !Object.keys(x.reqs.analyser).length && !Object.keys(x.reqs.lexicon).length && !x.resources.length;

  // ═════════ 5 (and the first-lookup timings): lookups on the narrative page, Active off ═════════
  phase = 'cards';
  const narr = await B.open(page('narrative'), 'narr');
  const tNarr = Date.now();
  await sleep(1500);
  const W5 = [
    ['갔어요', { id: 'n1', word: '갔어요' }, 'past polite verb (the first, cold lookup)'],
    ['샀어요', { id: 'n2', word: '샀어요' }, 'past polite verb (warm)'],
    ['시장에는', { id: 'n2', word: '시장에는' }, 'noun with two particles'],
    ['눈이 (snow)', { id: 'n6', word: '눈이', n: 0 }, 'balanced homonym, decided by 온다'],
    ['눈이 (eye)', { id: 'n6', word: '눈이', n: 1 }, 'balanced homonym, decided by 아파서'],
    ['배를 (pear)', { id: 'n2', word: '배를', n: 0 }, 'homonym after 사과와'],
    ['배가 (belly)', { id: 'n6', word: '배가' }, 'homonym, 고파서'],
    ['배를 (ship)', { id: 'n6', word: '배를' }, 'homonym, 큰 배를 보았다'],
    ['오셨다', { id: 'n5', word: '오셨다' }, 'honorific past plain'],
    ['먹은', { id: 'n5', word: '먹은' }, 'adnominal past'],
    ['읽고', { id: 'n4', word: '읽고' }, 'connective'],
    ['올 거예요', { id: 'n4', word: '올' }, 'adnominal future (올), with 거예요 after it'],
  ];
  const cards = {};
  for (const [label, target, what] of W5) {
    const r = await lookup(narr, target, { inject: label === '갔어요', settleMs: 2500 });
    cards[label] = r;
    report.cards.push({ step: 5, label, what, ...cardBrief(r) });
    console.log('  card', label, JSON.stringify(cardLine(r)).slice(0, 260));
    if (label === '갔어요') report.timings.firstKoreanLookup = { replyMs: r.replyMs, cardMs: r.cardMs, injectedFresh: true };
    if (label === '샀어요') report.timings.warmKoreanLookup = { replyMs: r.replyMs, cardMs: r.cardMs };
    if (['시장에는', '눈이 (snow)', '눈이 (eye)', '배를 (pear)', '배가 (belly)', '배를 (ship)', '오셨다'].includes(label)) report.shots = { ...(report.shots ?? {}), [label]: await B.shot(narr.s, 'card-' + label.replace(/[^\w가-힣]+/g, '_')) };
  }
  report.timings.narrativeHeap = await heap(narr);
  const netNarr = { reqs: koRequests(netOf('narr', tNarr)), resources: await resourcesOf(narr) };
  report.networkKorean = { english: netEnglish, narrative: netNarr };
  {
    const a = netNarr.reqs;
    const dups = [...Object.entries(a.lexicon), ...Object.entries(a.analyser)].filter(([, n]) => n > 1);
    const asked = Object.keys(a.analyser).length + Object.keys(a.lexicon).length;
    step(4, 'Korean chunk and lexicon: not requested on English pages; requested once on the Korean page', noKo(netEnglish.activeOn) && !Object.keys(netEnglish.activeOff.reqs.lexicon).length && Object.keys(a.analyser).length === 1 && Object.keys(a.lexicon).length > 0 && !dups.length ? 'PASS' : 'FAIL', {
      englishActiveOff: { koRequests: koRequests([]) && netEnglish.activeOff.reqs, resources: netEnglish.activeOff.resources },
      englishActiveOn: netEnglish.activeOn,
      koreanPage: { analyserRequests: Object.entries(a.analyser).map(([u, n]) => `${u.replace(/^chrome-extension:\/\/[a-p]{32}/, '<ext>')} x${n} (${kb(sizeOf(u))})`), lexiconShards: Object.entries(a.lexicon).map(([u, n]) => `${u.replace(/^chrome-extension:\/\/[a-p]{32}/, '<ext>')} x${n} (${kb(sizeOf(u))})`), dictRequests: Object.keys(a.dict).length, duplicates: dups.map(([u]) => u), totalAsked: asked, networkEventsSeenForKorean: asked },
      resourceTimingKoreanEntries: netNarr.resources.filter((u) => /ko\b|\/ko\//.test(u)).map((u) => u.replace(/^chrome-extension:\/\/[a-p]{32}/, '<ext>')),
    });
    const got = Object.values(cards).filter((r) => r.card && !r.card.nocard && (r.card.lemma || r.card.word)).length;
    step('5', 'cards for twelve selected words (headline, class, forms, parts, meaning, sound, All forms: read in the report and the record)', got === W5.length ? 'PASS' : 'FAIL', { cards: got, of: W5.length, lines: Object.fromEntries(Object.entries(cards).map(([k, r]) => [k, cardLine(r)])) });
  }
  await B.close(narr.t);
  // ═════════ 5b. the news page's words that Active leaves unmarked: what a selection shows ═════════
  {
    const nw = await B.open(page('news'), 'news-cards');
    await sleep(1500);
    report.newsCards = {};
    let first = true;
    for (const [label, target] of [['서울시는', { id: 'w1', word: '서울시는' }], ['연구팀은 (1)', { id: 'w4', word: '연구팀은', n: 0 }], ['김민수', { id: 'w4', word: '김민수' }], ['주최', { id: 'w5', word: '주최' }], ['기상청은', { id: 'w5', word: '기상청은' }], ['시장은 (seen one)', { id: 'w2', word: '시장은' }]]) {
      const r = await lookup(nw, target, { inject: first, settleMs: 2000 });
      first = false;
      report.newsCards[label] = cardBrief(r);
      console.log('  newscard', label, JSON.stringify(cardLine(r)).slice(0, 240), r.card?.nocard ? 'NOCARD ' + JSON.stringify(r.reply) : '');
    }
    await B.close(nw.t);
  }

  // ═════════ 3. Active on the three pages ═════════
  phase = 'active';
  await msg({ type: 'golearn:active', op: 'set', patch: { active: true } });
  const act = {};
  for (const [name, label] of [['narrative', 'narr-active'], ['news', 'news-active'], ['devotion', 'devo-active']]) {
    const r = await activate(name, label);
    act[name] = r;
    const a = r.activeState ?? {};
    report.shots = { ...(report.shots ?? {}), ['active-' + name]: await B.shot(r.pg.s, 'active-' + name) };
    report.timings[`active-${name}`] = { firstScanMs: r.firstScanMs, lastMarkMs: r.lastMarkMs, scanMs: a.scanMs, profileMs: a.profileMs, lag: r.lag, heap: await heap(r.pg) };
    report.active ??= {};
    report.active[name] = { activeState: a, summary: r.summary, tokens: r.audit.tokens, world: r.audit.world };
    console.log('  active', name, JSON.stringify({ scanned: a.scanned, marked: a.marked, skipped: a.skipped, confirmed: a.confirmed, unconfirmed: a.unconfirmed, eojeol: r.summary.eojeol, levels: r.summary.levels, firstScanMs: r.firstScanMs, lastMarkMs: r.lastMarkMs }));
    if (name !== 'narrative') await B.close(r.pg.t);
  }
  {
    const a = act.narrative.activeState ?? {};
    const sum = Object.values(a.marked ?? {}).reduce((x, y) => x + y, 0);
    step(3, 'Active on the narrative page (counts for all three pages are in the record)', a.scanned > 0 && sum > 0 ? 'PASS' : 'FAIL', Object.fromEntries(Object.entries(act).map(([k, r]) => [k, { scanned: r.activeState?.scanned, marked: r.activeState?.marked, skipped: r.activeState?.skipped, confirmed: r.activeState?.confirmed, unconfirmed: r.activeState?.unconfirmed, languages: r.activeState?.languages, reason: r.activeState?.reason, eojeol: r.summary.eojeol, levels: r.summary.levels, blank: r.summary.blank.length, firstScanMs: r.firstScanMs, lastMarkMs: r.lastMarkMs, lag: r.lag }])));
  }

  // ═════════ 6 + 7. mark a word on the Active page, the event, sync, a reload ═════════
  phase = 'mark';
  const narrA = act.narrative.pg;
  const before = summarise(await audit(narrA));
  const markRes = await markOnCard(narrA, { id: 'n3', word: '먹었어요' }, 'known');
  await sleep(1000);
  const dev = (await exportEvents()).filter((e) => e.kind === 'ItemMarked');
  const knDev = await msg({ type: 'golearn:local-repo', op: 'knowledge', languageId: 'ko' });
  const knRows = (knDev?.knowledge ?? []).filter((k) => /먹/.test(k.unitId)).map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark, encounters: k.encounters }));
  report.mark = { markRes, deviceItemMarked: dev, deviceKnowledge: knRows };
  step(6, 'mark 먹었어요 Known on the card: the ItemMarked event on the device, language ko, a lemma unit id, no page text', markRes.pressed?.includes('known') && dev.some((e) => JSON.stringify(e.subject ?? e.units ?? '').includes('lemma:ko:')) ? 'PASS' : 'FAIL', { markRes, events: dev.map((e) => ({ mark: e.mark, subject: e.subject, units: e.units, languageId: e.languageId, payload: e.payload })), knowledge: knRows });
  const sy = await syncNow();
  const acct1 = await readAccount();
  const oursMarked = (acct1.itemMarked ?? []).filter((m) => (m.itemIds ?? []).some((u) => /먹/.test(u)));
  await B.close(narrA.t);
  // reload = a new tab on the same page
  const re = await activate('narrative', 'narr-reloaded');
  const afterAud = re.audit;
  const eat = (afterAud.tokens ?? []).filter((t) => /^먹/.test(t.w)).map((t) => `${t.w}=${t.hits.join('+') || 'none'}`);
  const eatBefore = (act.narrative.audit.tokens ?? []).filter((t) => /^먹/.test(t.w)).map((t) => `${t.w}=${t.hits.join('+') || 'none'}`);
  const stillNew = (afterAud.tokens ?? []).filter((t) => /^먹/.test(t.w) && t.hits.some((h) => h.startsWith('new:')));
  const after = summarise(afterAud);
  report.reload = { eatBefore, eatAfter: eat, levelsBefore: before.levels, levelsAfter: after.levels, activeStateAfter: re.activeState, sync: sy, accountMarked: oursMarked, eventKinds: acct1.eventKinds };
  step(7, 'sync: the service holds the event once; after a reload the word and its other forms are no longer new', oursMarked.length === 1 && eat.length >= 2 && !stillNew.length ? 'PASS' : 'FAIL', { sync: sy, serviceItemMarked: oursMarked, serviceEventKinds: acct1.eventKinds, eatBefore, eatAfter: eat, newBefore: before.levels, newAfter: after.levels });
  await B.close(re.pg.t);

  // ═════════ 7b. the browser is closed and started again on the same profile ═════════
  phase = 'restart';
  {
    killTree(b1);
    await sleep(5000);
    b1 = launch(PORT, 'profile');
    version = undefined;
    for (let i = 0; i < 60 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); } }
    let out = { started: !!version };
    if (version) {
      c = new Conn(version.webSocketDebuggerUrl, 'b1'); await c.open();
      B = browserApi(c);
      const sw2 = await B.findSw();
      out.worker = !!sw2;
      if (sw2) {
        out.sameExtensionId = new URL(sw2.url).host === id;
        swS = await B.attach(sw2.targetId, 'worker');
        ctl = await B.open(extUrl('app/index.html#/languages'), 'setup');
        await sleep(3500);
        const kn = await msg({ type: 'golearn:local-repo', op: 'knowledge', languageId: 'ko' });
        out.knowledge = (kn?.knowledge ?? []).filter((k) => k.unitId === 'lemma:ko:먹다:VERB').map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark }));
        out.active = (await msg({ type: 'golearn:get-state' }))?.active;
        const re2 = await activate('narrative', 'narr-restart');
        out.eat = (re2.audit.tokens ?? []).filter((t) => /^먹/.test(t.w)).map((t) => `${t.w}=${t.hits.join('+') || 'none'}`);
        out.levels = re2.summary.levels;
        out.shot = await B.shot(re2.pg.s, 'after-restart-narrative');
        await B.close(re2.pg.t);
      }
    }
    report.restart = out;
    step('7b', 'a new browser on the same profile: the mark is still there (device knowledge and the page)', out.knowledge?.[0]?.level === 'known' && out.eat?.length >= 2 && out.eat.every((e) => /=known:/.test(e)) ? 'PASS' : 'FAIL', out);
  }

  // ═════════ 8. GoReview ═════════
  phase = 'goreview';
  {
    const rv = await B.open(extUrl('review/index.html'), 'goreview');
    await sleep(6000);
    const home = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500)`);
    const langs = await reviewLanguages(rv);
    const chose = { header: langs?.header };
    const homeKo = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500)`);
    const vocab = await B.evalIn(rv.s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 4000)); const t = document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500); location.hash = '#/review'; await new Promise((r) => setTimeout(r, 4000)); return t; })()`, 30000);
    const readFront = `(() => { const s = document.getElementById('session'); if (!s) return null; return { stimulus: document.getElementById('stimulus')?.innerText.trim(), instruction: document.getElementById('instruction')?.innerText.trim(), text: s.innerText.replace(/\\s+/g, ' ').slice(0, 800) }; })()`;
    let start = await B.evalIn(rv.s, `(() => { const b = document.getElementById('start-session'); if (!b) return { err: 'no #start-session', buttons: [...document.querySelectorAll('button, a.btn')].map((x) => (x.id || '') + ':' + x.textContent.trim().slice(0, 40)).slice(0, 30) }; b.click(); return { clicked: b.textContent.replace(/\\s+/g, ' ').trim() }; })()`);
    let front;
    for (let i = 0; i < 60; i++) { await sleep(500); front = await B.evalIn(rv.s, readFront); if (front?.stimulus) break; }
    let startNew, saved, probe;
    if (!front?.stimulus) {
      startNew = await B.evalIn(rv.s, `(() => { const b = document.getElementById('start-new'); if (!b) return { err: 'no #start-new' }; b.click(); return { clicked: true }; })()`);
      for (let i = 0; i < 40; i++) { await sleep(500); front = await B.evalIn(rv.s, readFront); if (front?.stimulus) break; }
      if (!front?.stimulus) startNew.page = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1200)`);
    }
    if (!front?.stimulus) {
      const r = await msg({ type: 'golearn:local-repo', op: 'candidates', languageId: 'ko', limit: 5 });
      probe = r?.ok ? { ok: true, count: r.candidates?.length, first: r.candidates?.slice(0, 3).map((x) => x.unitId ?? x.itemId ?? JSON.stringify(x).slice(0, 120)) } : r;
      saved = await B.evalIn(rv.s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 4000)); const b = [...document.querySelectorAll('button')].find((x) => /Save for GoReview/.test(x.textContent)); if (!b) return { err: 'no Save for GoReview button', page: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 700) }; const row = (b.closest('li, tr, article') ?? b.parentElement).innerText.replace(/\\s+/g, ' ').slice(0, 200); b.click(); await new Promise((r) => setTimeout(r, 2500)); const after = (b.closest('li, tr, article') ?? b.parentElement)?.innerText.replace(/\\s+/g, ' ').slice(0, 200); location.hash = '#/review'; await new Promise((r) => setTimeout(r, 5000)); return { row, after, home: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600) }; })()`, 40000);
      const again = await B.evalIn(rv.s, `(() => { const b = document.getElementById('start-session'); if (!b) return { err: 'no #start-session' }; b.click(); return { clicked: b.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200) }; })()`);
      for (let i = 0; i < 30; i++) { await sleep(500); front = await B.evalIn(rv.s, readFront); if (front?.stimulus) break; }
      saved.again = again;
      if (!front?.stimulus) saved.page = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1000)`);
    }
    start = { ...start, chose, homeKo, vocab, startNew, probe, saved };
    const homeBefore = await B.evalIn(rv.s, `document.body.innerText.replace(/\s+/g, ' ').slice(0, 900)`);
    const reveal = await B.evalIn(rv.s, `(() => { const b = document.getElementById('reveal') ?? document.getElementById('flip-card'); if (!b) return { err: 'no reveal' }; b.click(); return { clicked: b.id }; })()`);
    await sleep(1200);
    const back = await B.evalIn(rv.s, `(() => ({ answer: document.getElementById('revealed-answer')?.innerText.trim(), text: (document.getElementById('session')?.innerText ?? document.body.innerText).replace(/\\s+/g, ' ').slice(0, 1200), grades: [...document.querySelectorAll('.grade')].map((g) => g.dataset.grade) }))()`);
    report.shots = { ...(report.shots ?? {}), goreviewBack: await B.shot(rv.s, 'goreview-back') };
    const grade = await B.evalIn(rv.s, `(() => { const g = document.querySelector('.grade[data-grade="good"]'); if (!g) return { err: 'no Good grade button', grades: [...document.querySelectorAll('.grade')].map((x) => x.dataset.grade) }; g.click(); return { clicked: g.dataset.grade }; })()`);
    await sleep(3000);
    const next = await B.evalIn(rv.s, readFront);
    const afterGrade = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 800)`);
    report.shots = { ...(report.shots ?? {}), goreview: await B.shot(rv.s, 'goreview') };
    // the second card (눈): its front, its back, an answer; then the session is finished and the summary read for the next review time
    const front2 = next;
    const reveal2 = await B.evalIn(rv.s, `(() => { const b = document.getElementById('reveal') ?? document.getElementById('flip-card'); if (!b) return { err: 'no reveal' }; b.click(); return { clicked: b.id }; })()`);
    await sleep(1200);
    const back2 = await B.evalIn(rv.s, `(() => ({ answer: document.getElementById('revealed-answer')?.innerText.trim(), instruction: document.getElementById('instruction')?.innerText.trim(), text: (document.getElementById('session')?.innerText ?? document.body.innerText).replace(/\s+/g, ' ').slice(0, 1200) }))()`);
    report.shots = { ...(report.shots ?? {}), goreviewBack2: await B.shot(rv.s, 'goreview-back2') };
    const grade2 = await B.evalIn(rv.s, `(() => { const g = document.querySelector('.grade[data-grade="good"]'); if (!g) return { err: 'no Good' }; g.click(); return { clicked: 'good' }; })()`);
    await sleep(2500);
    const fin = await B.evalIn(rv.s, `(() => { const b = document.getElementById('finish-early'); if (!b) return { err: 'no #finish-early', text: document.body.innerText.slice(0, 300) }; b.click(); return { clicked: true }; })()`);
    await sleep(4000);
    const summaryText = await B.evalIn(rv.s, `document.body.innerText.replace(/\s+/g, ' ').slice(0, 1600)`);
    report.shots = { ...(report.shots ?? {}), goreviewSummary: await B.shot(rv.s, 'goreview-summary') };
    report.goreviewSecond = { front2, reveal2, back2, grade2, fin, summaryText };
    await B.evalIn(rv.s, `(async () => { location.hash = '#/'; await new Promise((r) => setTimeout(r, 3500)); return 1; })()`, 20000);
    const homeAfter = await B.evalIn(rv.s, `document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200)`);
    report.shots = { ...(report.shots ?? {}), goreviewHomeAfter: await B.shot(rv.s, 'goreview-home-after') };
    const ev = await exportEvents();
    const reviewEvents = ev.filter((e) => /^Card|Assessment/.test(e.kind));
    await syncNow();
    const acct2 = await readAccount();
    // the schedule: what the device holds for the reviewed card (FSRS fields) and what the screen says
    const exp = await msg({ type: 'golearn:local-repo', op: 'export' });
    const sched = (exp?.events ?? []).filter((e) => e.kind === 'CardReviewed').map((e) => ({ subject: e.subject, payload: e.payload }));
    report.goreview = { homeBefore, homeAfter, home, langs, start, front, reveal, back, grade, next, afterGrade, reviewEventsOnDevice: reviewEvents, accountReviews: acct2.reviews, sched };
    const ok = !!front?.stimulus && !!back?.answer && grade?.clicked === 'good' && reviewEvents.some((e) => e.kind === 'CardReviewed');
    step(8, 'GoReview: Korean selected, an eligible card, one answer, the schedule moved', ok ? 'PASS' : 'FAIL', { listed: langs?.listed, chose, front, answer: back?.answer, grades: back?.grades, grade, nextCard: next?.stimulus, afterGradeScreen: afterGrade?.slice(0, 400), deviceEvents: reviewEvents.map((e) => ({ kind: e.kind, units: e.units, subject: e.subject, payload: e.payload })), accountEvents: acct2.reviews, sched });
    await B.close(rv.t);
  }

  // ═════════ 9. Reading Analysis on the news page ═════════
  await readingStep();
  async function readingStep() {
    phase = 'reading';
    const pg = await B.open(page('news'), 'news-reading');
    await c.send('Target.activateTarget', { targetId: pg.t });
    await sleep(2500);
    const analyse = () => B.evalIn(ctl.s, `(async () => {
      const t = (await chrome.tabs.query({})).find((x) => x.url === ${J(pg.url)});
      if (!t) return { s: { stage: 'no-tab' } };
      await chrome.tabs.update(t.id, { active: true });
      const send = (op, more = {}) => chrome.tabs.sendMessage(t.id, { type: 'golearn:reading-analysis', op, ...more }, { frameId: 0 }).catch(() => undefined);
      let injected = false;
      if (!(await send('status'))) { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); injected = true; }
      const g = await chrome.runtime.sendMessage({ type: 'golearn:reading-knowledge', op: 'grant', tabId: t.id });
      if (!g || !g.ok) return { s: { stage: 'no-grant', g } };
      const t0 = performance.now();
      let s = await send('start', { languageId: 'ko' });
      while (s && ['extracting', 'resolving', 'verifying', 'calculating'].includes(s.stage)) { await new Promise((r) => setTimeout(r, 150)); s = await send('status'); }
      return { ms: Math.round(performance.now() - t0), injected, s };
    })()`, 300000);
    const attempts = [];
    let res;
    for (let i = 0; i < 3; i++) {
      res = await analyse();
      attempts.push({ ms: res?.ms, stage: res?.s?.stage, code: res?.s?.error?.code });
      if (res?.s?.error?.code !== 'knowledge-changing') break;
      await sleep(8000);
    }
    const cov = res?.s?.result?.coverage;
    report.reading = res;
    step(9, 'Reading Analysis on the news page', res?.s?.stage === 'done' && cov ? 'PASS' : 'FAIL', { attempts, stage: res?.s?.stage, ms: res?.ms, error: res?.s?.error ?? res?.s?.message, coverage: cov && { knownPercent: cov.knownPercent, knownOccurrences: cov.knownOccurrences, counts: cov.counts }, keys: Object.keys(res?.s?.result ?? {}), languageId: res?.s?.result?.languageId });
    await B.close(pg.t);
  }

  // ═════════ 10. offline: the service stopped ═════════
  phase = 'offline';
  {
    await msg({ type: 'golearn:active', op: 'set', patch: { active: false } });
    killTree(svc);
    for (let i = 0; i < 20 && svcExit === undefined; i++) await sleep(500);
    let down = false;
    try { await fetch(`${SVC_URL}/health`, { signal: AbortSignal.timeout(3000) }); } catch { down = true; }
    const pg = await B.open(page('devotion'), 'devo-offline');
    await sleep(1500);
    const lk = await lookup(pg, { id: 'd4', word: '드렸습니다' }, { settleMs: 2500 });
    report.shots = { ...(report.shots ?? {}), cardOffline: await B.shot(pg.s, 'card-offline-드렸습니다') };
    report.cards.push({ step: 5, label: '드렸습니다 (service stopped)', what: 'past formal verb', ...cardBrief(lk) });
    const mk = await markOnCard(pg, { id: 'd2', word: '은혜로' }, 'familiar');
    const evOff = (await exportEvents()).filter((e) => e.kind === 'ItemMarked' && JSON.stringify(e.subject ?? '').includes('은혜'));
    const syncDown = await syncNow();
    const accountDown = down ? undefined : await readAccount();
    startSvc();
    let health2;
    for (const end = Date.now() + 900000; Date.now() < end && !health2 && svcExit === undefined;) { try { const r = await fetch(`${SVC_URL}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) health2 = await r.json(); else await sleep(1000); } catch { await sleep(1000); } }
    const syncUp = await syncNow();
    const acct3 = await readAccount();
    const grace = (acct3.itemMarked ?? []).filter((m) => (m.itemIds ?? []).some((u) => /은혜/.test(u)));
    const syncTwice = await syncNow();
    const acct4 = await readAccount();
    const grace2 = (acct4.itemMarked ?? []).filter((m) => (m.itemIds ?? []).some((u) => /은혜/.test(u)));
    report.offline = { serviceDown: down, lookup: cardBrief(lk), mark: mk, deviceEvents: evOff, syncWhileDown: syncDown, accountWhileDown: accountDown, restarted: !!health2, syncAfter: syncUp, serviceMarks: grace, afterSecondSync: grace2 };
    step(10, 'offline: card from local files, mark queued; the service back: it syncs once', down && !!(lk.card && (lk.card.lemma || lk.card.word)) && mk.pressed?.includes('familiar') && evOff.length >= 1 && grace.length === 1 && grace2.length === 1 ? 'PASS' : 'FAIL', { serviceDown: down, card: cardLine(lk), mark: { pressed: mk.pressed, click: mk.click, status: mk.status }, queuedOnDevice: evOff.length, syncWhileDown: syncDown, restarted: !!health2, serviceHoldsAfterSync: grace.length, afterSecondSync: grace2.length, ids: grace.map((m) => m.itemIds) });
    await B.close(pg.t);
  }

  // ═════════ 11. timings, sizes, memory ═════════
  {
    const ls = (d) => { try { return fs.readdirSync(d).map((f) => ({ f, size: fs.statSync(path.join(d, f)).size })); } catch { return []; } };
    const koJs = fs.readFileSync(path.join(DIST, 'analysers', 'ko.js'), 'utf8');
    const lazy = [...koJs.matchAll(/import\(`?\.\/(shared-[\w-]+\.js)/g)].map((m) => m[1]);
    const lexFiles = ls(path.join(DIST, 'lexicon', 'ko', 'standard'));
    const fetchedLex = Object.entries(netNarr.reqs.lexicon).map(([u, n]) => ({ file: u.replace(/^.*\/lexicon\//, 'lexicon/'), times: n, bytes: sizeOf(u) }));
    report.timings.sizes = {
      'ko.js': fs.statSync(path.join(DIST, 'analysers', 'ko.js')).size,
      lazyChunksNamedInKoJs: Object.fromEntries(lazy.map((f) => [f, fs.statSync(path.join(DIST, 'analysers', f)).size])),
      analyserRequestsOnNarrative: Object.keys(netNarr.reqs.analyser).map((u) => ({ file: u.replace(/^.*\/analysers\//, ''), bytes: sizeOf(u) })),
      lexiconShardsFetchedOnNarrative: fetchedLex, lexiconBytesFetched: fetchedLex.reduce((a, x) => a + (x.bytes ?? 0), 0),
      lexiconWholeSet: { files: lexFiles.length, bytes: lexFiles.reduce((a, x) => a + x.size, 0) },
      'content.js': fs.statSync(path.join(DIST, 'content.js')).size, 'background.js': fs.statSync(path.join(DIST, 'background.js')).size,
    };
    let mem;
    try {
      const ps = spawnSync('powershell', ['-NoProfile', '-Command', `$p = Get-CimInstance Win32_Process -Filter "Name='brave.exe'" | Where-Object { $_.CommandLine -like '*${path.join(TMP, 'profile').replace(/\\/g, '\\\\').replace(/'/g, "''")}*' } ; $ids = $p.ProcessId; $w = Get-Process -Id $ids -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum; "$($w.Count) $([math]::Round($w.Sum/1MB))"`], { encoding: 'utf8' });
      mem = ps.stdout.trim();
    } catch (e) { mem = String(e); }
    report.timings.browserMemory = mem && mem !== '' ? `processes and MB working set (processes whose command line names the profile; the renderer/GPU children carry other command lines, so this is a floor): ${mem}` : 'not read';
    step(11, 'timings, sizes, memory', 'INFO', report.timings);
  }
  await gatePhase();
  report.timings.note = 'replyMs = until the content script answered the lookup message; cardMs = until the card showed a lemma/word (both from the moment the rig sent the lookup; the first lookup also includes the content script injection).';
}

try { await main(); } catch (e) { step('harness', 'harness', 'FAIL', String(e?.stack ?? e)); }
finally {
  report.finishedAt = new Date().toISOString();
  report.consoleErrors = consoleLog.filter((x) => x.kind !== 'warning' && x.kind !== 'log-warning');
  fs.writeFileSync(path.join(OUT, REPORT), JSON.stringify(report, null, 1));
  server.close();
  for (const p of children.reverse()) killTree(p);
  await sleep(2000);
  for (const d of ['ext', 'profile', 'profile2', 'svc']) { try { removeDir(path.join(TMP, d)); } catch { /* a browser file still held: left in the temp folder */ } }
  console.log('report:', path.join(OUT, REPORT), 'screenshots:', SHOTS);
  process.exit(0);
}
