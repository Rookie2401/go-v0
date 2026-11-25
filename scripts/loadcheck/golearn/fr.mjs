// GoLearn French acceptance rig: the real extension build (with its setup page and GoReview page) in a throw-away headless Brave
// profile, a throw-away LOCAL Repository service with a generated test account, and fixture pages served from fr-pages/. Walks a
// learner's journey in French (install, reading language, lookups and their cards, marks, reloads, Active, mixed pages, real sites,
// signed in, a second device, GoReview, timings, other languages) and writes every reading to a JSON report. Nothing here touches the
// owner's profile, service or account; the hosted service is never contacted (the copy's service address is the local one).
//   node scripts/loadcheck/golearn/fr.mjs [dist] [outDir] [step,...]
// Environment: LOADCHECK_BRAVE (required), LOADCHECK_TMP (optional; default <temp>/loadcheck-golearn-fr), FR_NO_WEB=1 skips step 12.
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
const TMP = process.env.LOADCHECK_TMP || path.join(os.tmpdir(), 'loadcheck-golearn-fr');
const OUT = path.resolve(process.argv[3] || path.join(TMP, 'out'));
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const PORT = 9361, PORT2 = 9362, WEB = 8783, SVC = 8799;
/** HOSTED_DICT=1: the dictionaries come from this rig's web server as the hosted fallback (public/dict served at /hosted/dict/), as on gh-pages. */
const HOSTED = process.env.HOSTED_DICT === '1';
const PAGES = path.join(HERE, 'fr-pages');
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
let phase = 'start';
class Conn {
  constructor(url, tag) {
    this.tag = tag; this.ws = new WebSocket(url); this.wait = new Map(); this.names = new Map(); this.contexts = new Map();
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); return; }
      const who = `${this.tag}:${this.names.get(d.sessionId) ?? 'browser'}`;
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
      if (card && !card.nocard && card.lemma) { cardMs ??= Date.now() - t0; if (!/looking up/i.test(card.meaning ?? '') || i > 30) break; }
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
  const exportEvents = async () => {
    const ex = await msg({ type: 'golearn:local-repo', op: 'export' });
    return (ex?.events ?? []).map((e) => ({ kind: e.kind, at: e.occurredAt ?? e.at, languageId: e.languageId ?? e.subject?.languageId, units: e.subject?.unitIds ?? e.subject?.itemIds ?? e.unitIds, mark: e.payload?.mark, payload: e.kind === 'ItemMarked' || /^Card|Assessment/.test(e.kind) ? e.payload : undefined, subject: e.kind === 'ItemMarked' ? e.subject : undefined }));
  };
  const cardLine = (r) => r?.card ? { lemma: r.card.lemma, pos: r.card.pos, kicker: r.card.lemmaKicker, meaning: r.card.meaning, language: r.card.host?.['data-language-id'], basis: r.card.host?.['data-language-basis'] } : { error: r?.error, reply: r?.reply };

  // ═════════ A. signed out, this device only ═════════
  phase = 'A';
  // 1. install French on the setup page
  let packVersion;
  {
    const row = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="fr"]'); if (!r) return { err: 'no French row', rows: [...document.querySelectorAll('li.lang-row')].map((x) => x.dataset.language) }; return { name: r.querySelector('.lang-name')?.innerText.replace(/\\s+/g, ' ').trim(), level: r.querySelector('.lang-level')?.innerText.trim(), text: r.innerText.replace(/\\s+/g, ' ').slice(0, 400), rows: [...document.querySelectorAll('li.lang-row')].map((x) => x.dataset.language) }; })()`);
    const t0 = Date.now();
    const clicked = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="fr"]'); if (!r) return 'no row'; r.querySelectorAll('details').forEach((d) => d.open = true); const b = r.querySelector('button[data-action="choose"]'); if (!b) return 'no button'; b.click(); return 'clicked ' + b.textContent.trim(); })()`);
    let state = '';
    for (let i = 0; i < 240; i++) {
      state = await B.evalIn(ctl.s, `[...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === 'fr').map((l) => l.textContent.replace(/\\s+/g, ' ').slice(0, 160)).join('|')`);
      if (state && /ready|not verify|did not/i.test(state)) break;
      await sleep(1000);
    }
    const feedback = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="fr"]'); return r?.querySelector('.lang-feedback')?.innerText.replace(/\\s+/g, ' ').slice(0, 1200); })()`);
    const rec = { ...(await storage('pack:installed')), ...(await storage('golearn:pack:installed')) };
    const rec2 = await storage('golearn:pack');
    const frRec = rec['golearn:pack:installed:pack:fr'] ?? rec['pack:installed:pack:fr'] ?? Object.entries(rec).find(([k]) => k.endsWith(':fr'))?.[1];
    packVersion = frRec?.version;
    const failures = (frRec?.verified?.validation ?? []).filter((v) => !v.pass);
    report.install = { row, clicked, state, feedback, records: Object.keys(rec ?? {}), progressRecords: rec2, frRecord: frRec && { version: frRec.version, installedAt: frRec.installedAt, dictionaryManifest: frRec.verified?.dictionaryManifest, sampleShard: frRec.verified?.sampleShard, cases: frRec.verified?.validation?.length, failures } };
    step(1, 'install French on the setup page', /ready/i.test(state) && !!frRec && (!HOSTED || /hosted copy/i.test(feedback ?? '')) ? 'PASS' : 'FAIL', { row: row?.name ?? row, level: row?.level, clicked, state, seconds: Math.round((Date.now() - t0) / 1000), recordKey: Object.keys(rec ?? {}), version: frRec?.version, dictionaryManifest: frRec?.verified?.dictionaryManifest, sampleShard: frRec?.verified?.sampleShard, validationCases: frRec?.verified?.validation?.length, validationFailures: failures });
  }

  // 2. French as the reading language, through the popup
  {
    const p = await popup('fr');
    const st = await msg({ type: 'golearn:get-state' });
    const status = await msg({ type: 'golearn:status' });
    report.popupFr = { ...p, state: { languageId: st?.languageId, chosen: st?.chosenLanguages }, status: { languageId: status?.languageId, languageName: status?.languageName, packAvailable: status?.packAvailable } };
    const ok = /French|français/i.test(p.after?.language ?? p.res?.line ?? '') && (st?.languageId === 'fr' || status?.languageId === 'fr');
    step(2, 'French is the reading language (popup switch)', ok ? 'PASS' : 'FAIL', { options: p.before?.options, line: p.after?.language ?? p.res, workerState: st?.languageId, status: status?.languageName });
  }

  // 3-4. the prose page: language and lookups
  const prose = await B.open(page('prose'), 'prose');
  await c.send('Page.enable', {}, prose.s);
  await sleep(1500);
  const W4 = [
    ['maison', { id: 'p1', word: 'maison' }, 'regular noun'],
    ['chevaux', { id: 'p2', word: 'chevaux' }, 'irregular plural'],
    ['belle', { id: 'p2', word: 'belle' }, 'irregular feminine adjective'],
    ['vieille', { id: 'p2', word: 'vieille' }, 'irregular feminine adjective'],
    ['au', { id: 'p1', word: 'au' }, 'contraction à + le'],
    ['du', { id: 'p1', word: 'du' }, 'contraction de + le'],
    ['l’ (l’eau)', { id: 'p2', word: 'l’' }, 'elided article'],
    ['faisons', { id: 'p2', word: 'faisons' }, 'present of faire'],
    ['arrivée', { id: 'p1', word: 'arrivée' }, 'passé composé with être, feminine agreement'],
    ['est (est arrivée)', { id: 'p1', word: 'est' }, 'auxiliary être'],
    ['écrites', { id: 'p3', word: 'écrites' }, 'preceding direct object agreement'],
    ['le (je le vois)', { id: 'p3', word: 'le' }, 'direct object clitic'],
    ['lui (je lui parle)', { id: 'p3', word: 'lui' }, 'indirect object clitic'],
    ['y (j’y vais)', { id: 'p4', word: 'y' }, 'pronoun y'],
    ['en (j’en prends)', { id: 'p4', word: 'en' }, 'pronoun en'],
    ['ne (ne … que)', { id: 'p4', word: 'ne', n: 0 }, 'restrictive ne … que'],
    ['que (ne … que)', { id: 'p4', word: 'que' }, 'restrictive ne … que'],
    ['dont', { id: 'p5', word: 'dont' }, 'relative dont'],
    ['le (donne-le-moi)', { id: 'p5', word: 'le', n: 1 }, 'imperative clitic'],
    ['vienne', { id: 'p5', word: 'vienne' }, 'subjunctive after il faut que'],
    ['porte (noun)', { id: 'p6', word: 'porte', n: 0 }, 'homograph: noun'],
    ['porte (verb)', { id: 'p6', word: 'porte', n: 1 }, 'homograph: verb'],
    ['livre (noun)', { id: 'p5', word: 'livre' }, 'homograph: noun'],
    ['livre (verb)', { id: 'p6', word: 'livre' }, 'homograph: verb'],
    ['a (a-t-il)', { id: 'p5', word: 'A' }, 'inversion a-t-il'],
    ['peut-être', { id: 'p5', word: 'Peut-être' }, 'hyphenated adverb'],
    ['aujourd’hui', { id: 'p1', word: 'Aujourd’hui' }, 'typographic apostrophe inside a word'],
    ['cœur', { id: 'p1', word: 'cœur' }, 'ligature'],
  ];
  const results = {};
  if (want(3) || want(4)) {
    for (const [label, target, what] of W4) {
      const r = await lookup(prose, target);
      results[label] = r;
      report.cards.push({ step: 4, label, what, sentence: r.sel?.sentence, selected: r.sel?.selected, replyMs: r.replyMs, cardMs: r.cardMs, reply: r.reply, card: r.card });
      console.log('  card', label, JSON.stringify(cardLine(r)).slice(0, 300));
      if (label === 'maison') report.timings.firstFrenchLookup = { replyMs: r.replyMs, cardMs: r.cardMs };
      if (label === 'chevaux') report.timings.secondFrenchLookup = { replyMs: r.replyMs, cardMs: r.cardMs };
      if (label === 'écrites') report.shots = { ...(report.shots ?? {}), cardEcrites: await B.shot(prose.s, 'card-ecrites') };
    }
    const first = results.maison;
    step(3, 'the prose page resolves to French', first?.card?.host?.['data-language-id'] === 'fr' ? 'PASS' : 'FAIL', { host: first?.card?.host, reply: first?.reply, popup: (await popup()).before });
    const got = Object.values(results).filter((r) => r.card?.lemma).length;
    step(4, 'lookups by selection on the prose page (readings judged in BROWSER-RUN.md)', got === W4.length ? 'PASS' : 'FAIL', { cardsWithLemma: got, of: W4.length, lines: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, cardLine(r)])) });
  }

  // 5. the literary page
  if (want(5)) {
    const lit = await B.open(page('literary'), 'literary');
    await sleep(1500);
    const W5 = [
      ['entra', { id: 'l1', word: 'entra' }], ['vit', { id: 'l1', word: 'vit' }], ['fut (il fut saisi)', { id: 'l1', word: 'fut' }], ['prirent', { id: 'l1', word: 'prirent' }],
      ['répondit', { id: 'l2', word: 'répondit' }], ['fût', { id: 'l2', word: 'fût' }], ['point', { id: 'l2', word: 'point' }], ['trouva', { id: 'l3', word: 'trouva' }],
      ['dépourvue', { id: 'l3', word: 'dépourvue' }], ['fut (fut venue)', { id: 'l3', word: 'fut' }], ['cherra', { id: 'l4', word: 'cherra' }],
    ];
    let got = 0;
    for (const [label, target] of W5) {
      const r = await lookup(lit, target);
      if (r.card?.lemma) got++;
      report.cards.push({ step: 5, label, sentence: r.sel?.sentence, selected: r.sel?.selected, replyMs: r.replyMs, cardMs: r.cardMs, reply: r.reply, card: r.card });
      console.log('  card', label, JSON.stringify(cardLine(r)).slice(0, 300));
      if (label === 'entra') report.shots = { ...(report.shots ?? {}), cardEntra: await B.shot(lit.s, 'card-entra') };
    }
    step(5, 'lookups on the literary page (readings judged in BROWSER-RUN.md)', got === W5.length ? 'PASS' : 'FAIL', { cardsWithLemma: got, of: W5.length });
    await B.close(lit.t);
  }

  // 6. pronunciation on a card (maison: the hand list; jument: the dictionary only)
  if (want(6)) {
    const out = {};
    for (const [label, target] of [['maison', { id: 'p1', word: 'maison' }], ['jument', { id: 'p2', word: 'jument' }]]) {
      const r = await lookup(prose, target, { settleMs: 2500 });
      const before = r.card;
      const click = await B.onCard(prose.s, CLICK, ['.say']);
      await sleep(2500);
      const after = await B.onCard(prose.s, READ_CARD);
      const info = await msg({ type: 'golearn:pronounce-info', languageId: 'fr' });
      const both = (after?.text ?? '') + ' ' + (before?.text ?? '');
      const ipa = [...new Set([...(both.match(/[\/\[][^\/\]\s][^\/\]]{0,40}[\/\]]/g) ?? []), ...(both.match(/\S*[ɑɛɔəøœʁʒʃɲŋɥ̃]\S*/g) ?? [])])];
      const pronText = (both.match(/(PRONUNCIATION|SOUNDS?|SPELLING|SAY IT|IPA)[^|]{0,400}/gi) ?? []).slice(0, 4);
      out[label] = { say: before?.say, click, afterSay: after?.say, pronText, pronRows: (after?.rows ?? []).filter((x) => /pron|ipa|sound|voice|say/i.test(x)), feedback: after?.feedback, status: after?.status, ipaLike: ipa, pronounceInfo: info, textAfter: after?.text?.slice(0, 1500) };
      report.cards.push({ step: 6, label, card: after });
    }
    report.pronunciation = out;
    // the card says it on the pronunciation control itself (disabled, with the reason as its title) or in its feedback line
    const said = Object.values(out).map((o) => `${o.say?.title ?? ''} ${o.afterSay?.title ?? ''} ${o.feedback ?? ''} ${o.status ?? ''} ${o.textAfter ?? ''}`).join(' ');
    const noVoice = /No French voice/i.test(said);
    step(6, 'pronunciation control on a French card (headless: no voices)', noVoice ? 'PASS' : (Object.values(out).some((o) => o.click?.clicked) ? 'FAIL' : 'not run'), { maison: { say: out.maison.say, afterClick: out.maison.afterSay, feedback: out.maison.feedback, ipaLike: out.maison.ipaLike, pronText: out.maison.pronText, pronounceInfo: out.maison.pronounceInfo }, jument: { say: out.jument.say, ipaLike: out.jument.ipaLike, pronText: out.jument.pronText } });
  }

  // 7. marks: maison Known, chevaux Familiar
  const marks = [['maison', { id: 'p1', word: 'maison' }, 'known'], ['chevaux', { id: 'p2', word: 'chevaux' }, 'familiar']];
  if (want(7) || want(8)) {
    const done = {};
    for (const [label, target, mark] of marks) {
      await lookup(prose, target, { deeper: false });
      const click = await B.onCard(prose.s, CLICK, [`.rateBtn[data-mark="${mark}"]`]);
      await sleep(1500);
      const after = await B.onCard(prose.s, READ_CARD);
      done[label] = { mark, click, pressed: after?.pressed, levelName: after?.levelName, status: after?.status };
    }
    await sleep(1500);
    const ev = await exportEvents();
    const marked = ev.filter((e) => e.kind === 'ItemMarked');
    const kn = await msg({ type: 'golearn:local-repo', op: 'knowledge', languageId: 'fr' });
    const knRows = (kn?.knowledge ?? []).filter((k) => /maison|cheva/.test(k.unitId)).map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark, encounters: k.encounters }));
    report.marks = { done, itemMarked: marked, knowledge: knRows, eventKinds: ev.reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] ?? 0) + 1 }), {}) };
    const idsOk = marked.length >= 2 && marked.every((m) => JSON.stringify(m.subject ?? m.units ?? '').includes(':fr:'));
    step(7, 'mark maison Known and chevaux Familiar from the card', idsOk && done.maison.pressed?.includes('known') && done.chevaux.pressed?.includes('familiar') ? 'PASS' : 'FAIL', report.marks);
  }

  // 8. reload the page, stop the worker, reload the extension: the marks persist
  if (want(8)) {
    const res = {};
    await B.evalIn(prose.s, 'location.reload()'); await sleep(2500);
    for (const [label, target] of marks) { const r = await lookup(prose, target, { deeper: false, waitMark: true }); res[`afterPageReload:${label}`] = { pressed: r.card?.pressed, levelName: r.card?.levelName, encounters: r.card?.encounters }; }
    await c.send('ServiceWorker.enable', {}, prose.s).catch(() => {});
    await c.send('ServiceWorker.stopAllWorkers', {}, prose.s);
    await sleep(1500);
    for (const [label, target] of marks) {
      const r = await lookup(prose, target, { deeper: false, inject: false, waitMark: true });
      res[`afterWorkerStop:${label}`] = { pressed: r.card?.pressed, levelName: r.card?.levelName, replyMs: r.replyMs, cardMs: r.cardMs };
      if (label === 'maison') report.timings.lookupAfterWorkerStop = { replyMs: r.replyMs, cardMs: r.cardMs };
    }
    report.persist = res;
    const ok = Object.entries(res).every(([k, v]) => v.pressed?.includes(k.endsWith('maison') ? 'known' : 'familiar'));
    step(8, 'marks persist across a page reload and a stopped worker (the extension reload is step 8b, at the end of the run)', ok ? 'PASS' : 'FAIL', res);
  }
  /** 8b. the extension reloaded (chrome.runtime.reload, as reload.mjs does from the worker): run last, because the extension may not come back */
  const extensionReload = async () => {
    const res = {};
    const sw1 = await B.findSw();
    if (sw1) { swS = await B.attach(sw1.targetId, 'worker'); res.reloadCall = await B.evalIn(swS, 'chrome.runtime.reload()', 5000); }
    await sleep(6000);
    const sw2 = await B.findSw();
    res.workerAfterReload = sw2?.url ?? 'no worker within 15 s';
    res.targetsAfterReload = (await B.targets()).map((t) => `${t.type} ${t.url.slice(0, 80)}`);
    let back;
    for (let i = 0; i < 6; i++) {
      ctl = await B.open(`chrome-extension://${id}/app/index.html#/languages`, `setup-after-reload-${i}`); await sleep(3000);
      back = await B.evalIn(ctl.s, `({ tabs: typeof chrome?.tabs?.query, href: location.href })`);
      (res.setupPageTries ??= []).push(back);
      if (back?.tabs === 'function') break;
      await sleep(2000);
    }
    if (back?.tabs === 'function') {
      const pg = await B.open(page('prose'), 'prose-after-ext-reload'); await sleep(2500);
      for (const [label, target] of marks) { const r = await lookup(pg, target, { deeper: false, waitMark: true }); res[`afterExtensionReload:${label}`] = { pressed: r.card?.pressed, levelName: r.card?.levelName, lemma: r.card?.lemma, error: r.error, reply: r.reply }; }
    }
    report.extensionReload = res;
    const ok = marks.every(([label, , mark]) => res[`afterExtensionReload:${label}`]?.pressed?.includes(mark));
    step('8b', 'marks persist after the extension reloads (chrome.runtime.reload)', ok ? 'PASS' : 'FAIL', res);
    // 8c. the browser closed and started again on the same profile (the extension loaded afresh, as after a reload)
    const res2 = {};
    try { c.ws.close(); } catch { /* */ }
    killTree(b1); await sleep(3000);
    b1 = launch(PORT, 'profile');
    let v;
    for (let i = 0; i < 60 && !v; i++) { try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); } }
    if (!v) { step('8c', 'marks persist after the browser restarts on the same profile', 'not run', 'brave did not start again'); return; }
    c = new Conn(v.webSocketDebuggerUrl, 'b1-restarted'); await c.open();
    B = browserApi(c);
    const sw3 = await B.findSw();
    res2.worker = sw3?.url ?? 'no worker';
    ctl = await B.open(`chrome-extension://${id}/app/index.html#/languages`, 'setup-restarted'); await sleep(3500);
    res2.setupPage = await B.evalIn(ctl.s, `({ tabs: typeof chrome?.tabs?.query, href: location.href })`);
    if (res2.setupPage?.tabs === 'function') {
      const pg = await B.open(page('prose'), 'prose-restarted'); await sleep(2500);
      for (const [label, target] of marks) { const r = await lookup(pg, target, { deeper: false, waitMark: true }); res2[label] = { pressed: r.card?.pressed, levelName: r.card?.levelName, lemma: r.card?.lemma, error: r.error, reply: r.reply }; }
    }
    report.browserRestart = res2;
    step('8c', 'marks persist after the browser restarts on the same profile (the extension loads afresh)', marks.every(([label, , mark]) => res2[label]?.pressed?.includes(mark)) ? 'PASS' : 'FAIL', res2);
  };

  // 9. GoLearn Active on the prose page
  if (want(9) || want(10) || want(11) || want(12)) {
    const on = await msg({ type: 'golearn:active', op: 'set', patch: { active: true } });
    report.activeOn = on;
    if (want(9)) {
      const t0 = Date.now();
      const pg = await B.open(page('prose'), 'prose-active');
      await c.send('Target.activateTarget', { targetId: pg.t });
      let st;
      for (let i = 0; i < 80; i++) { st = await ping(pg); if (st?.activeState?.scanned && (st.activeState.confirmed !== undefined || i > 20)) break; await sleep(500); }
      const firstScanMs = Date.now() - t0;
      await sleep(4000); // the forms-index confirmation and the learner model come after the first scan
      st = await ping(pg);
      const hl = await highlights(pg);
      const pp = await popup();
      report.shots = { ...(report.shots ?? {}), activeProse: await B.shot(pg.s, 'active-prose') };
      const all = Object.entries(hl.ranges ?? {}).flatMap(([n, rs]) => rs.map((r) => `${n}|${r}`));
      const dictOnly = ['jument', 'boulangerie', 'réverbère', 'brume'].map((w) => [w, all.filter((x) => x.split(':').slice(1).join(':') === w).map((x) => x.split('|')[0])]);
      const maisonLevel = all.filter((x) => x.endsWith(':maison')).map((x) => x.split('|')[0]);
      const chevauxLevel = all.filter((x) => x.endsWith(':chevaux')).map((x) => x.split('|')[0]);
      report.active9 = { activeState: st?.activeState, highlights: hl, popup: pp.before, firstScanMs, dictOnly, maisonLevel, chevauxLevel };
      report.timings.activeScan = { firstScanSeenMs: firstScanMs, scanMs: st?.activeState?.scanMs, profileMs: st?.activeState?.profileMs, scanned: st?.activeState?.scanned };
      step(9, 'Active on the French prose page', st?.activeState?.scanned > 0 && all.length > 0 ? 'PASS' : 'FAIL', { on: on?.settings?.active, languages: st?.activeState?.languages, scanned: st?.activeState?.scanned, marked: st?.activeState?.marked, skipped: st?.activeState?.skipped, confirmed: st?.activeState?.confirmed, unconfirmed: st?.activeState?.unconfirmed, reason: st?.activeState?.reason, highlightWorld: hl.world, ranges: all.length, maisonLevel, chevauxLevel, dictOnly, popupPage: pp.before?.page, popupCounts: pp.before?.counts, popupDetail: pp.before?.detail });
      await B.close(pg.t);
    }
    // 10. a page with no lang attribute: French, English, Spanish paragraphs
    if (want(10)) {
      const pg = await B.open(page('mixed'), 'mixed');
      await c.send('Target.activateTarget', { targetId: pg.t });
      let st;
      for (let i = 0; i < 60; i++) { st = await ping(pg); if (st?.activeState?.scanned) break; await sleep(500); }
      await sleep(4000);
      st = await ping(pg);
      const hl = await highlights(pg);
      const all = Object.entries(hl.ranges ?? {}).flatMap(([n, rs]) => rs.map((r) => `${n}|${r}`));
      const byPara = {};
      for (const x of all) { const [lvl, rest] = x.split('|'); const [para, ...w] = rest.split(':'); (byPara[para] ??= []).push(`${w.join(':')}(${lvl.replace('golearn-', '')})`); }
      const enEs = [...(byPara['m-en'] ?? []), ...(byPara['m-es'] ?? [])];
      const pp = await popup();
      report.shots = { ...(report.shots ?? {}), activeMixed: await B.shot(pg.s, 'active-mixed') };
      // a lookup in each paragraph: which language does the card say?
      const lk = {};
      for (const [para, word] of [['m-fr', 'voisine'], ['m-en', 'neighbour'], ['m-es', 'vecina']]) { const r = await lookup(pg, { id: para, word }, { deeper: false, inject: false }); lk[para] = { word, ...cardLine(r), reply: r.reply }; }
      report.mixed = { activeState: st?.activeState, byPara, highlights: hl, popup: pp.before, lookups: lk };
      step(10, 'mixed page with no lang: only the French paragraph is read as French', (byPara['m-fr']?.length ?? 0) > 0 && enEs.length === 0 ? 'PASS' : 'FAIL', { languages: st?.activeState?.languages, scanned: st?.activeState?.scanned, skipped: st?.activeState?.skipped, marked: st?.activeState?.marked, reason: st?.activeState?.reason, underlinedFr: byPara['m-fr']?.length ?? 0, underlinedEn: byPara['m-en'] ?? [], underlinedEs: byPara['m-es'] ?? [], popupPage: pp.before?.page, lookups: lk });
      await B.close(pg.t);
    }
    // 11. lang="en" with one <p lang="fr">
    if (want(11)) {
      const pg = await B.open(page('en-with-fr'), 'en-with-fr');
      await c.send('Target.activateTarget', { targetId: pg.t });
      let st;
      for (let i = 0; i < 60; i++) { st = await ping(pg); if (st?.activeState?.scanned) break; await sleep(500); }
      await sleep(3000);
      st = await ping(pg);
      const hl = await highlights(pg);
      const all = Object.entries(hl.ranges ?? {}).flatMap(([n, rs]) => rs.map((r) => `${n}|${r}`));
      const byPara = {};
      for (const x of all) { const [lvl, rest] = x.split('|'); const [para, ...w] = rest.split(':'); (byPara[para] ??= []).push(`${w.join(':')}(${lvl.replace('golearn-', '')})`); }
      const fr = await lookup(pg, { id: 'e2', word: 'acheté' }, { deeper: false, inject: false });
      const en = await lookup(pg, { id: 'e1', word: 'walking' }, { deeper: false, inject: false });
      report.enWithFr = { activeState: st?.activeState, byPara, lookups: { fr: cardLine(fr), en: { ...cardLine(en), text: en.card?.text?.slice(0, 300) } } };
      const enUnder = [...(byPara.e1 ?? []), ...(byPara.e3 ?? [])];
      step(11, 'lang="en" page with one <p lang="fr">: the French sentence is read, the English is not', (byPara.e2?.length ?? 0) > 0 && enUnder.length === 0 ? 'PASS' : 'FAIL', { languages: st?.activeState?.languages, scanned: st?.activeState?.scanned, skipped: st?.activeState?.skipped, underlinedFr: byPara.e2 ?? [], underlinedEn: enUnder, lookupFr: cardLine(fr), lookupEn: report.enWithFr.lookups.en });
      await B.close(pg.t);
    }
    // 12. real websites (read-only GET)
    if (want(12)) {
      if (process.env.FR_NO_WEB) step(12, 'real French websites', 'not run', 'FR_NO_WEB is set');
      else {
        const sites = {};
        for (const url of ['https://fr.wikipedia.org/wiki/Paris', 'https://fr.wikisource.org/wiki/Contes_de_Perrault_(%C3%A9d._1902)/Le_petit_Chaperon_rouge']) {
          const pg = await B.open(url, 'web');
          await c.send('Target.activateTarget', { targetId: pg.t });
          let loaded;
          for (let i = 0; i < 60; i++) { loaded = await B.evalIn(pg.s, `({ ready: document.readyState, lang: document.documentElement.lang, title: document.title, href: location.href })`, 5000); if (loaded?.ready === 'complete' && loaded.href !== 'about:blank') break; await sleep(500); }
          if (loaded?.href && loaded.href !== url) pg.url = loaded.href;
          let st;
          for (let i = 0; i < 40; i++) { st = await ping(pg); if (st?.activeState?.scanned) break; await sleep(500); }
          await sleep(3000); st = await ping(pg);
          // a conjugated verb in the first real paragraph of the article
          const verb = await B.evalIn(pg.s, `(() => { const ps = [...document.querySelectorAll('#mw-content-text p, #mw-content-text div, #mw-content-text span')].filter((p) => !p.querySelector('p, div') && p.innerText.trim().length > 80 && !p.closest('table, .ws-noexport, .navbox, #headertemplate, .headertemplate')); const cands = ['était', 'est', 'fut', 'avait', 'sont', 'alla', 'dit', 'fit', 'compte', 'devient']; for (const [k, p] of ps.slice(0, 4).entries()) { for (const w of cands) { if (new RegExp('(^|[^\\\\p{L}])' + w + '($|[^\\\\p{L}])', 'u').test(p.innerText)) { p.id ||= 'golearn-rig-p' + k; return { id: p.id, word: w, text: p.innerText.slice(0, 200) }; } } } return { err: 'no paragraph', count: ps.length }; })()`);
          let lk;
          if (verb?.id) lk = await lookup(pg, { id: verb.id, word: verb.word }, { deeper: false, inject: false });
          const pp = await popup();
          sites[url] = { loaded, activeState: st?.activeState && { languages: st.activeState.languages, scanned: st.activeState.scanned, marked: st.activeState.marked, skipped: st.activeState.skipped, reason: st.activeState.reason, scanMs: st.activeState.scanMs }, verb, lookup: lk && { ...cardLine(lk), reply: lk.reply, sentence: lk.sel?.sentence, features: lk.card?.text?.slice(0, 500) }, popupPage: pp.before?.page };
          await B.close(pg.t);
        }
        report.web = sites;
        const ok = Object.values(sites).every((s) => s.loaded?.ready === 'complete' && s.lookup?.lemma);
        const unreachable = Object.values(sites).every((s) => !s.loaded || s.loaded.error || !s.loaded.title);
        step(12, 'real French websites (Wikipedia Paris, Wikisource Perrault)', unreachable ? 'not run' : ok ? 'PASS' : 'FAIL', sites);
      }
    }
  }

  // ═════════ C (signed out). other languages, timings ═════════
  phase = 'C';
  if (want(16) || want(17)) {
    // 17. Albanian (the built-in pack): install it on the setup page as he.mjs does, then a lookup on an Albanian page
    const installLang = async (lang, name) => {
      await B.evalIn(ctl.s, `(async () => { location.hash = '#/languages'; await new Promise((r) => setTimeout(r, 1500)); return 1; })()`);
      const t0 = Date.now();
      const clicked = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="${lang}"]'); if (!r) return 'no row'; r.querySelectorAll('details').forEach((d) => d.open = true); const b = r.querySelector('button[data-action="choose"]'); if (!b) return 'no button'; b.click(); return 'clicked ' + b.textContent.trim(); })()`);
      let state = '';
      for (let i = 0; i < 120; i++) { state = await B.evalIn(ctl.s, `[...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === '${lang}').map((l) => l.textContent.replace(/\\s+/g, ' ').slice(0, 160)).join('|')`); if (state && /ready|not verify|did not/i.test(state)) break; await sleep(1000); }
      const feedback = await B.evalIn(ctl.s, `document.querySelector('li.lang-row[data-language="${lang}"] .lang-feedback')?.innerText.replace(/\\s+/g, ' ').slice(0, 600)`);
      return { clicked, state, feedback, seconds: Math.round((Date.now() - t0) / 1000) };
    };
    if (want(17)) {
      const ins = await installLang('sq', 'Albanian');
      await popup('fr'); // French stays the reading language: the Albanian page declares its own language
      const pg = await B.open(page('sq'), 'sq');
      await sleep(1500);
      const r = await lookup(pg, { id: 'q1', word: 'librin' }, { deeper: false });
      step(17, 'Albanian still works with French installed (lookup of librin)', /libër/.test(r.card?.lemma ?? '') ? 'PASS' : 'FAIL', { install: ins, ...cardLine(r), reply: r.reply });
      await B.close(pg.t);
    }
    if (want(16)) {
      const ins = await installLang('es', 'Spanish');
      await popup('fr');
      const pg = await B.open(page('es'), 'es');
      await sleep(1500);
      const r1 = await lookup(pg, { id: 's1', word: 'libros' }, { deeper: false });
      const r2 = await lookup(pg, { id: 's1', word: 'niños' }, { deeper: false });
      report.timings.spanish = { install: ins, first: { replyMs: r1.replyMs, cardMs: r1.cardMs, ...cardLine(r1) }, second: { replyMs: r2.replyMs, cardMs: r2.cardMs, ...cardLine(r2) } };
      await B.close(pg.t);
      const size = (f) => { try { return fs.statSync(path.join(DIST, 'analysers', f)).size; } catch { return undefined; } };
      const frJs = fs.readFileSync(path.join(DIST, 'analysers', 'fr.js'), 'utf8');
      const lazy = [...frJs.matchAll(/import\(`?\.\/(shared-[\w-]+\.js)/g)].map((m) => m[1]);
      const staticImports = [...frJs.matchAll(/from"\.\/(shared-[\w-]+\.js)"/g)].map((m) => m[1]);
      report.timings.sizes = { 'fr.js': size('fr.js'), lazy: Object.fromEntries(lazy.map((f) => [f, size(f)])), static: Object.fromEntries(staticImports.map((f) => [f, size(f)])), 'es.js': size('es.js'), 'content.js': fs.statSync(path.join(DIST, 'content.js')).size, 'background.js': fs.statSync(path.join(DIST, 'background.js')).size };
      step(16, 'timings and sizes', report.timings.firstFrenchLookup ? 'PASS' : 'not run', report.timings);
    }
  }

  // ═════════ B. signed in to a throw-away LOCAL service ═════════
  phase = 'B';
  const email = `fr-rig-${crypto.randomBytes(4).toString('hex')}@example.test`;
  const password = crypto.randomBytes(18).toString('base64url');
  const svcApi = async (method, p, body, token) => { const r = await fetch(`${SVC_URL}${p}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, body: j }; };
  const readAccount = async () => {
    const s = await svcApi('POST', '/sessions', { email, password, deviceId: 'fr-rig-reader', platform: 'rig' });
    const token = s.body?.token;
    if (!token) return { error: `session ${s.status}` };
    const enr = await svcApi('GET', '/enrolments', undefined, token);
    const ev = await svcApi('GET', '/events?languageId=fr&limit=1000', undefined, token);
    // the marks and reviews asked for by kind, so a long history does not push them past the page limit
    const evMarks = await svcApi('GET', '/events?languageId=fr&kinds=ItemMarked,CardReviewed,CardAdded,AssessmentAnswered&limit=500', undefined, token);
    const kn = await svcApi('GET', '/knowledge?languageId=fr', undefined, token);
    const events = ev.body?.events ?? [];
    return {
      enrolments: (enr.body?.enrolments ?? []).map((e) => ({ languageId: e.languageId, packId: e.packId, packVersion: e.packVersion, ended: !!e.endedAt })),
      eventCount: events.length, eventKinds: events.reduce((a, e) => ({ ...a, [(e.event ?? e).kind]: (a[(e.event ?? e).kind] ?? 0) + 1 }), {}),
      itemMarked: (evMarks.body?.events ?? []).map((e) => e.event ?? e).filter((e) => e.kind === 'ItemMarked').map((e) => ({ mark: e.payload?.mark, itemIds: e.subject?.itemIds, at: e.occurredAt })),
      reviews: (evMarks.body?.events ?? []).map((e) => e.event ?? e).filter((e) => e.kind !== 'ItemMarked').map((e) => ({ kind: e.kind, subject: e.subject, payload: e.payload })),
      eventsByKindStatus: evMarks.status,
      knowledge: (kn.body?.knowledge ?? []).filter((k) => /maison|cheva|jument|réverbère|brume|boulang/.test(k.unitId)).map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark, encounters: k.encounters })),
      knowledgeStatus: kn.status,
    };
  };
  const signedMarks = [['jument', { id: 'p2', word: 'jument' }, 'known'], ['réverbère', { id: 'p7', word: 'réverbère' }, 'familiar']];
  if (want(13) || want(14) || want(15)) {
    await B.evalIn(ctl.s, `(async () => { location.hash = '#/signin'; await new Promise((r) => setTimeout(r, 1500)); return 1; })()`);
    const made = await msg({ type: 'golearn:create-account', baseUrl: SVC_URL, email, password, displayName: 'Rig' });
    await B.evalIn(ctl.s, `(async () => { location.hash = '#/languages'; location.reload(); return 1; })()`);
    await sleep(4000);
    const page13 = await B.evalIn(ctl.s, `document.getElementById('account-line')?.innerText ?? document.body.innerText.slice(0, 300)`);
    let acct = await readAccount();
    let enrol;
    if (!acct.enrolments?.some((e) => e.languageId === 'fr' && !e.ended)) {
      enrol = await msg({ type: 'golearn:enrol', languageId: 'fr', packId: 'pack:fr', packVersion: packVersion ?? '0.1.0', goals: [{ kind: 'reading' }] });
      await sleep(1500);
    }
    await popup('fr');
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
    report.signed = { made: { ok: made?.ok, error: made?.error, message: made?.message }, accountLine: page13, enrol, done, sync: sync && { ok: sync.ok, pushed: sync.pushed, error: sync.error ?? sync.lastError }, upload: up, account: acct };
    const units = JSON.stringify(acct.itemMarked ?? []);
    const ok = made?.ok && /jument/.test(units) && /r[ée]verb/.test(units) && (acct.itemMarked ?? []).every((m) => (m.itemIds ?? []).length > 0 && m.itemIds.every((u) => /^(lemma|form):fr:/.test(u)));
    step(13, 'signed in: French marks reach the local service with fr ids', ok ? 'PASS' : 'FAIL', report.signed);
    await B.close(pg.t);

    // 14. a fresh profile signs in to the same account
    if (want(14)) {
      launch(PORT2, 'profile2');
      let v2;
      for (let i = 0; i < 60 && !v2; i++) { try { v2 = await (await fetch(`http://127.0.0.1:${PORT2}/json/version`)).json(); } catch { await sleep(500); } }
      const c2 = new Conn(v2.webSocketDebuggerUrl, 'b2'); await c2.open();
      const B2 = browserApi(c2);
      await B2.findSw();
      const ctl2 = await B2.open(`chrome-extension://${id}/app/index.html#/signin`, 'setup2');
      await sleep(3000);
      const t0 = Date.now();
      const conn = await B2.evalIn(ctl2.s, `chrome.runtime.sendMessage({ type: 'golearn:connect', baseUrl: ${J(SVC_URL)}, email: ${J(email)}, password: ${J(password)} }).then((r) => ({ ok: r?.ok, error: r?.error }))`, 60000);
      await B2.evalIn(ctl2.s, `(async () => { location.hash = '#/languages'; location.reload(); return 1; })()`);
      let st;
      for (let i = 0; i < 90; i++) { st = await B2.evalIn(ctl2.s, `chrome.runtime.sendMessage({ type: 'golearn:local-repo', op: 'status' })`); if (st?.fromAccount > 0) break; await sleep(1000); }
      let fr2 = '';
      for (let i = 0; i < 90; i++) { fr2 = await B2.evalIn(ctl2.s, `[...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === 'fr').map((l) => l.textContent.replace(/\\s+/g, ' ').slice(0, 160)).join('|')`); if (/ready|not verify|did not/i.test(fr2 ?? '')) break; await sleep(1000); }
      const kn = await B2.evalIn(ctl2.s, `chrome.runtime.sendMessage({ type: 'golearn:local-repo', op: 'knowledge', languageId: 'fr' }).then((r) => (r?.knowledge ?? []).filter((k) => /maison|cheva|jument|r.verb/.test(k.unitId)).map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark })))`);
      report.secondDevice = { conn, seconds: Math.round((Date.now() - t0) / 1000), status: st && { events: st.events, fromAccount: st.fromAccount, languageId: st.languageId, enrolments: st.enrolments?.map((e) => e.languageId) }, frenchRow: fr2, knowledge: kn };
      const marksBack = Array.isArray(kn) && ['maison', 'jument'].every((w) => kn.some((k) => k.unitId.includes(w) && /known/.test(JSON.stringify(k))));
      step(14, 'a fresh profile signed in to the same account gets the French marks back', conn?.ok && marksBack ? 'PASS' : 'FAIL', report.secondDevice);
      c2.ws.close();
    }

    // 15. GoReview, the extension's review page
    if (want(15)) {
      const rv = await B.open(`chrome-extension://${id}/review/index.html`, 'goreview');
      await sleep(6000);
      const home = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500)`);
      const langs = await B.evalIn(rv.s, `(() => { const s = document.getElementById('language-select'); return { selected: s?.selectedOptions?.[0]?.textContent.trim(), options: [...(s?.options ?? [])].map((o) => o.textContent.trim()), name: document.getElementById('language-name')?.textContent }; })()`);
      // French chosen in GoReview's own language switch (as a learner would), then its home read again
      const chose = await B.evalIn(rv.s, `(async () => { const s = document.getElementById('language-select'); if (!s) return { err: 'no language select', name: document.getElementById('language-name')?.textContent }; const o = [...s.options].find((x) => /French|fran/i.test(x.textContent)); if (!o) return { err: 'French not offered', options: [...s.options].map((x) => x.textContent) }; if (s.value !== o.value) { s.value = o.value; s.dispatchEvent(new Event('change')); } await new Promise((r) => setTimeout(r, 6000)); return { selected: document.getElementById('language-select')?.selectedOptions?.[0]?.textContent.trim() }; })()`, 30000);
      const homeFr = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500)`);
      const vocab = await B.evalIn(rv.s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 4000)); const t = document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500); location.hash = '#/review'; await new Promise((r) => setTimeout(r, 4000)); return t; })()`, 30000);
      let start = await B.evalIn(rv.s, `(() => { const b = document.getElementById('start-session'); if (!b) return { err: 'no #start-session', buttons: [...document.querySelectorAll('button, a.btn')].map((x) => (x.id || '') + ':' + x.textContent.trim().slice(0, 40)).slice(0, 30) }; b.click(); return { clicked: b.textContent.replace(/\\s+/g, ' ').trim() }; })()`);
      let front;
      for (let i = 0; i < 40; i++) { await sleep(500); front = await B.evalIn(rv.s, `(() => { const s = document.getElementById('session'); if (!s) return null; return { stimulus: document.getElementById('stimulus')?.innerText.trim(), instruction: document.getElementById('instruction')?.innerText.trim(), lang: document.getElementById('stimulus')?.closest('[lang]')?.getAttribute('lang') ?? document.getElementById('stimulus')?.getAttribute('lang'), text: s.innerText.replace(/\\s+/g, ' ').slice(0, 800) }; })()`); if (front?.stimulus) break; }
      let startNew;
      if (!front?.stimulus) {
        // "Current Deck" had no card: the learner's other way in is "New deck"
        startNew = await B.evalIn(rv.s, `(() => { const b = document.getElementById('start-new'); if (!b) return { err: 'no #start-new' }; b.click(); return { clicked: true }; })()`);
        for (let i = 0; i < 40; i++) { await sleep(500); front = await B.evalIn(rv.s, `(() => { const s = document.getElementById('session'); if (!s) return null; return { stimulus: document.getElementById('stimulus')?.innerText.trim(), lang: document.getElementById('stimulus')?.closest('[lang]')?.getAttribute('lang'), text: s.innerText.replace(/\\s+/g, ' ').slice(0, 800) }; })()`); if (front?.stimulus) break; }
        if (!front?.stimulus) startNew.page = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1200)`);
      }
      let saved, probe;
      if (!front?.stimulus) {
        // why: the device Repository's own candidate list for French and for Albanian (the page GoReview reads in the extension)
        probe = {};
        for (const lang of ['fr', 'sq']) { const r = await msg({ type: 'golearn:local-repo', op: 'candidates', languageId: lang, limit: 5 }); probe[lang] = r?.ok ? { ok: true, count: r.candidates?.length, first: r.candidates?.slice(0, 3).map((x) => x.unitId ?? x.itemId ?? JSON.stringify(x).slice(0, 120)) } : r; }
        const api = await msg({ type: 'golearn:local-repo', op: 'api', method: 'candidates', args: [] });
        probe.apiCandidatesNoArgs = JSON.stringify(api).slice(0, 400);
        // the learner's own way to give GoReview a word: My Vocabulary, "Save for GoReview" on maison, then Current Deck again
        saved = await B.evalIn(rv.s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 4000)); const search = document.querySelector('input[type="search"], input[name="search"]'); if (search) { search.value = 'maison'; search.dispatchEvent(new Event('input', { bubbles: true })); const apply = [...document.querySelectorAll('button')].find((b) => /Apply filters/.test(b.textContent)); apply?.click(); await new Promise((r) => setTimeout(r, 3000)); } const b = [...document.querySelectorAll('button')].find((x) => /Save for GoReview/.test(x.textContent) && /maison/.test(x.closest('li, tr, article, div')?.innerText ?? '')) ?? [...document.querySelectorAll('button')].find((x) => /Save for GoReview/.test(x.textContent)); if (!b) return { err: 'no Save for GoReview button' }; const row = (b.closest('li, tr, article') ?? b.parentElement).innerText.replace(/\\s+/g, ' ').slice(0, 200); b.click(); await new Promise((r) => setTimeout(r, 2500)); const after = (b.closest('li, tr, article') ?? b.parentElement)?.innerText.replace(/\\s+/g, ' ').slice(0, 200); location.hash = '#/review'; await new Promise((r) => setTimeout(r, 5000)); return { row, after, home: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600) }; })()`, 40000);
        const again = await B.evalIn(rv.s, `(() => { const b = document.getElementById('start-session'); if (!b) return { err: 'no #start-session' }; b.click(); return { clicked: b.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200) }; })()`);
        for (let i = 0; i < 30; i++) { await sleep(500); front = await B.evalIn(rv.s, `(() => { const s = document.getElementById('session'); if (!s) return null; return { stimulus: document.getElementById('stimulus')?.innerText.trim(), lang: document.getElementById('stimulus')?.closest('[lang]')?.getAttribute('lang'), text: s.innerText.replace(/\\s+/g, ' ').slice(0, 800) }; })()`); if (front?.stimulus) break; }
        saved.again = again;
        if (!front?.stimulus) saved.page = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1000)`);
      }
      start = { ...start, chose, homeFr, vocab, startNew, probe, saved };
      const reveal = await B.evalIn(rv.s, `(() => { const b = document.getElementById('reveal') ?? document.getElementById('flip-card'); if (!b) return { err: 'no reveal' }; b.click(); return { clicked: b.id }; })()`);
      await sleep(1200);
      const back = await B.evalIn(rv.s, `(() => ({ answer: document.getElementById('revealed-answer')?.innerText.trim(), text: (document.getElementById('session')?.innerText ?? document.body.innerText).replace(/\\s+/g, ' ').slice(0, 1200), grades: [...document.querySelectorAll('.grade')].map((g) => g.dataset.grade) }))()`);
      const grade = await B.evalIn(rv.s, `(() => { const g = document.querySelector('.grade[data-grade="good"]') ?? document.querySelector('.grade'); if (!g) return { err: 'no grade buttons' }; g.click(); return { clicked: g.dataset.grade }; })()`);
      await sleep(3000);
      const afterGrade = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600)`);
      report.shots = { ...(report.shots ?? {}), goreview: await B.shot(rv.s, 'goreview') };
      const ev = await exportEvents();
      const reviewEvents = ev.filter((e) => /^Card|Assessment/.test(e.kind));
      await msg({ type: 'golearn:sync-now' }, 60000); await msg({ type: 'golearn:local-repo', op: 'upload' }, 60000); await sleep(2000);
      const acct2 = await readAccount();
      report.goreview = { home, langs, start, front, reveal, back, grade, afterGrade, reviewEventsOnDevice: reviewEvents, accountReviews: acct2.reviews };
      const ok = !!front?.stimulus && !!grade?.clicked && (reviewEvents.length > 0 || acct2.reviews?.length > 0);
      step(15, 'GoReview offers French, builds a card and accepts a grade', ok ? 'PASS' : (start?.err ? 'FAIL' : 'FAIL'), report.goreview);
    }
  }
  // ═════════ 15g. the device Repository's candidates call as GoReview makes it, through the worker message (node fr.mjs "" "" 1,2,15g) ═════════
  if (ONLY.has('15g')) {
    const pg = await B.open(page('prose'), 'g-prose'); await sleep(1500);
    for (const w of ['maison', 'chevaux', 'jument']) await lookup(pg, { id: w === 'maison' ? 'p1' : 'p2', word: w }, { deeper: false });
    await sleep(1500);
    const enr = (await msg({ type: 'golearn:local-repo', op: 'enrolments' }))?.enrolments?.find((e) => e.languageId === 'fr');
    // the message is built in the setup page, as GoReview builds it in its page: an array holding undefined goes through chrome.runtime messaging
    const call = (argsExpr) => B.evalIn(ctl.s, `chrome.runtime.sendMessage({ type: 'golearn:local-repo', op: 'api', method: 'candidates', args: ${argsExpr} }).then((r) => r?.result?.ok ? { ok: true, count: r.result.data?.candidates?.length, first: r.result.data?.candidates?.slice(0, 3).map((x) => x.unitId) } : { ok: false, status: r?.result?.status, message: r?.result?.message ?? r?.error })`);
    const E = J(enr?.enrolmentId);
    const g = {
      enrolmentId: enr?.enrolmentId,
      twoArgs: await call(`[${E}, 200]`),
      cursorUndefined: await call(`[${E}, 200, undefined]`),
      cursorNull: await call(`[${E}, 200, null]`),
      asGoReview: await call(`[${E}, 200, undefined, ['productiveRetrieval', 'grammaticalUnderstanding', 'contextualProduction', 'listeningRecognition', 'readingRecognition'], undefined]`),
      opCandidates: await msg({ type: 'golearn:local-repo', op: 'candidates', languageId: 'fr', limit: 5 }).then((r) => ({ ok: r?.ok, count: r?.candidates?.length })),
    };
    report.candidatesProbe = g;
    step('15g', 'device candidates through the worker message: does an undefined cursor arrive as null?', 'INFO', g);
  }
  // ═════════ 15f. GoReview follow-up: why no French card? (run only when asked: node fr.mjs "" "" 1,2,15f) ═════════
  if (ONLY.has('15f')) {
    phase = '15f';
    const fu = { reviewConfig: JSON.parse(fs.readFileSync(path.join(EXT, 'review', 'config.json'), 'utf8')), analysersFrJs: fs.statSync(path.join(DIST, 'analysers', 'fr.js')).size };
    report.followUp = fu;
    // Albanian downloaded on the setup page, as a learner does
    await B.evalIn(ctl.s, `(async () => { location.hash = '#/languages'; await new Promise((r) => setTimeout(r, 1500)); return 1; })()`);
    await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="sq"]'); r?.querySelectorAll('details').forEach((d) => d.open = true); r?.querySelector('button[data-action="choose"]')?.click(); return 1; })()`);
    for (let i = 0; i < 60; i++) { const s = await B.evalIn(ctl.s, `[...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === 'sq').map((l) => l.textContent).join('|')`); if (/ready|not verify/i.test(s ?? '')) { fu.sqInstall = s.replace(/\s+/g, ' ').slice(0, 120); break; } await sleep(1000); }
    await popup('fr');
    // four words in each language, looked up on their pages; the first two marked
    const WORDS = {
      fr: { page: 'prose', words: [['p1', 'maison', 'known'], ['p2', 'chevaux', 'familiar'], ['p2', 'jument'], ['p7', 'réverbère']] },
      sq: { page: 'sq', words: [['q1', 'librin', 'known'], ['q1', 'lexoj', 'familiar'], ['q1', 'shtëpi'], ['q1', 'Unë']] },
    };
    const lookAndMark = async (lang) => {
      const pg = await B.open(page(WORDS[lang].page), `fu-${lang}`); await sleep(1500);
      const out = [];
      for (const [pid, word, mark] of WORDS[lang].words) {
        const r = await lookup(pg, { id: pid, word }, { deeper: false });
        let click;
        if (mark) { click = await B.onCard(pg.s, CLICK, [`.rateBtn[data-mark="${mark}"]`]); await sleep(1200); }
        out.push({ word, lemma: r.card?.lemma, pos: r.card?.pos, language: r.card?.host?.['data-language-id'], mark, marked: click?.clicked });
      }
      await B.close(pg.t);
      return out;
    };
    /** GoReview opened fresh with `lang` chosen: its start traffic (worker messages and network), home, why-no-new, details and developer pages; a card if one comes */
    const MSG_TRACE = `(() => { const r = globalThis.chrome?.runtime; if (!r?.sendMessage || r.__rigWrapped) return; const orig = r.sendMessage.bind(r); globalThis.__rigMsgs = []; const wrap = (...a) => { const m = a.find((x) => x && typeof x === 'object'); const rec = { t: Math.round(performance.now()), type: m?.type, op: m?.op, method: m?.method, args: JSON.stringify(m?.args ?? m?.languageId ?? '').slice(0, 240) }; globalThis.__rigMsgs.push(rec); const p = orig(...a); if (p && typeof p.then === 'function') p.then((v) => { rec.reply = JSON.stringify(v).slice(0, 500); }, (e) => { rec.err = String(e); }); return p; }; try { r.sendMessage = wrap; r.__rigWrapped = true; } catch (e) { globalThis.__rigMsgs.push({ wrapFailed: String(e) }); } })()`;
    const probeReview = async (lang, label, { tryCard = true, save = false } = {}) => {
      const t = (await c.send('Target.createTarget', { url: 'about:blank' })).result.targetId;
      const s = await B.attach(t, `goreview-${label}`);
      const net = [];
      const reqs = new Map();
      const onNet = (m) => { const d = JSON.parse(m.data); if (d.sessionId !== s) return;
        if (d.method === 'Network.requestWillBeSent') { const u = d.params.request.url; if (/\.(js|css|woff2?|png|svg|ico)(\?|$)/.test(u)) return; const rec = { url: u.slice(0, 160), method: d.params.request.method }; reqs.set(d.params.requestId, rec); net.push(rec); }
        if (d.method === 'Network.responseReceived' && reqs.has(d.params.requestId)) reqs.get(d.params.requestId).status = d.params.response.status;
        if (d.method === 'Network.loadingFailed' && reqs.has(d.params.requestId)) reqs.get(d.params.requestId).failed = d.params.errorText; };
      c.ws.addEventListener('message', onNet);
      await c.send('Network.enable', {}, s);
      await c.send('Page.enable', {}, s);
      await c.send('Page.addScriptToEvaluateOnNewDocument', { source: MSG_TRACE }, s);
      await c.send('Page.navigate', { url: `chrome-extension://${id}/review/index.html#/review` }, s);
      await sleep(6000);
      const res = { label, lang };
      const name = lang === 'fr' ? 'French' : 'Albanian';
      res.chose = await B.evalIn(s, `(async () => { const sel = document.getElementById('language-select'); if (!sel) return { name: document.getElementById('language-name')?.textContent ?? 'no language control' }; const o = [...sel.options].find((x) => x.textContent.trim() === ${J(name)}); if (!o) return { err: 'not offered', options: [...sel.options].map((x) => x.textContent.trim()) }; if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 7000)); } return { selected: document.getElementById('language-select')?.selectedOptions?.[0]?.textContent.trim(), options: [...sel.options].map((x) => x.textContent.trim()) }; })()`, 30000);
      res.home = await B.evalIn(s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1200)`);
      res.whyNoNew = await B.evalIn(s, `document.getElementById('why-no-new')?.innerText.replace(/\\s+/g, ' ') ?? '(no #why-no-new element)'`);
      if (save) {
        res.saved = await B.evalIn(s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 5000)); const btns = [...document.querySelectorAll('button')].filter((x) => /^Save for GoReview$/.test(x.textContent.trim())).slice(0, 4); const out = []; for (const b of btns) { const row = (b.closest('li, tr, article') ?? b.parentElement).innerText.replace(/\\s+/g, ' ').slice(0, 80); b.click(); await new Promise((r) => setTimeout(r, 1500)); out.push(row + ' => ' + b.textContent.trim()); } location.hash = '#/review'; await new Promise((r) => setTimeout(r, 6000)); return out; })()`, 60000);
        res.homeAfterSave = await B.evalIn(s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 800)`);
        res.whyNoNewAfterSave = await B.evalIn(s, `document.getElementById('why-no-new')?.innerText.replace(/\\s+/g, ' ') ?? '(no #why-no-new element)'`);
      }
      if (tryCard) {
        res.start = await B.evalIn(s, `(() => { const b = document.getElementById('start-session'); if (!b) return { err: 'no #start-session' }; b.click(); return { clicked: b.innerText.replace(/\\s+/g, ' ').trim().slice(0, 160) }; })()`);
        let front;
        for (let i = 0; i < 30; i++) { await sleep(500); front = await B.evalIn(s, `(() => { const ss = document.getElementById('session'); if (!ss) return null; return { stimulus: document.getElementById('stimulus')?.innerText.trim(), instruction: document.getElementById('instruction')?.innerText.trim(), meaning: document.getElementById('meaning')?.innerText.trim(), lang: document.getElementById('stimulus')?.closest('[lang]')?.getAttribute('lang'), text: ss.innerText.replace(/\\s+/g, ' ').slice(0, 900) }; })()`); if (front?.stimulus) break; }
        res.front = front;
        if (front?.stimulus) {
          res.reveal = await B.evalIn(s, `(() => { const b = document.getElementById('reveal') ?? document.getElementById('flip-card'); if (!b) return { err: 'no reveal' }; b.click(); return { clicked: b.id }; })()`);
          await sleep(1500);
          res.back = await B.evalIn(s, `(() => ({ answer: document.getElementById('revealed-answer')?.innerText.trim(), text: (document.getElementById('session')?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 1500), grades: [...document.querySelectorAll('.grade')].map((g) => g.dataset.grade + ':' + g.innerText.replace(/\\s+/g, ' ').trim()) }))()`);
          res.shot = await B.shot(s, `goreview-card-${label}`);
          res.grade = await B.evalIn(s, `(() => { const g = document.querySelector('.grade[data-grade="good"]') ?? document.querySelector('.grade'); if (!g) return { err: 'no grade buttons' }; g.click(); return { clicked: g.dataset.grade }; })()`);
          await sleep(3000);
          res.afterGrade = await B.evalIn(s, `(document.getElementById('session') ?? document.body).innerText.replace(/\\s+/g, ' ').slice(0, 800)`);
          const ev = await msg({ type: 'golearn:local-repo', op: 'export' });
          res.reviewEvents = (ev?.events ?? []).filter((e) => /^Card|Assessment/.test(e.kind)).slice(-4).map((e) => ({ kind: e.kind, subject: e.subject, payload: e.payload, at: e.occurredAt }));
        } else {
          res.afterStart = await B.evalIn(s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600)`);
        }
      }
      res.details = await B.evalIn(s, `(async () => { location.hash = '#/review/details'; await new Promise((r) => setTimeout(r, 7000)); return { candidates: document.getElementById('candidates')?.innerText.replace(/\\s+/g, ' ').slice(0, 3000), whys: [...document.querySelectorAll('#candidates li.candidate')].slice(0, 12).map((li) => li.dataset.unit + ' [' + li.dataset.decision + '] ' + li.innerText.replace(/\\s+/g, ' ').slice(0, 300)), page: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 5000) }; })()`, 30000);
      res.developer = await B.evalIn(s, `(async () => { location.hash = '#/developer'; await new Promise((r) => setTimeout(r, 5000)); return document.body.innerText.replace(/\\s+/g, ' ').slice(0, 4000); })()`, 30000);
      res.messages = await B.evalIn(s, `globalThis.__rigMsgs ?? 'no trace'`);
      res.network = net.slice(0, 60);
      c.ws.removeEventListener('message', onNet);
      await B.close(t);
      console.log(`  [15f] ${label}: front=${JSON.stringify(res.front?.stimulus)} why=${JSON.stringify(res.whyNoNew)?.slice(0, 200)}`);
      return res;
    };
    // signed out (device only)
    fu.outLookups = { fr: await lookAndMark('fr'), sq: await lookAndMark('sq') };
    fu.outEnrolments = (await msg({ type: 'golearn:local-repo', op: 'enrolments' }))?.enrolments;
    fu.outCandidates = {};
    for (const l of ['fr', 'sq']) { const r = await msg({ type: 'golearn:local-repo', op: 'candidates', languageId: l, limit: 10 }); fu.outCandidates[l] = r?.ok ? r.candidates.map((x) => x.unitId) : r; }
    fu.out = { fr: await probeReview('fr', 'out-fr'), sq: await probeReview('sq', 'out-sq') };
    if (!fu.out.fr.front?.stimulus || !fu.out.sq.front?.stimulus) fu.outSaved = { fr: await probeReview('fr', 'out-fr-saved', { save: true }), sq: await probeReview('sq', 'out-sq-saved', { save: true }) };
    // signed in (a generated account on the local service); French and Albanian enrolled on the account
    const made = await msg({ type: 'golearn:create-account', baseUrl: SVC_URL, email, password, displayName: 'Rig' });
    for (const l of ['fr', 'sq']) fu[`enrol_${l}`] = await msg({ type: 'golearn:enrol', languageId: l, packId: `pack:${l}`, packVersion: '1', goals: [{ kind: 'reading' }] });
    await popup('fr');
    fu.inLookups = { fr: await lookAndMark('fr'), sq: await lookAndMark('sq') };
    fu.sync = await msg({ type: 'golearn:sync-now' }, 90000); fu.upload = await msg({ type: 'golearn:local-repo', op: 'upload' }, 90000); await sleep(2000);
    fu.made = { ok: made?.ok, error: made?.error };
    fu.inEnrolments = (await msg({ type: 'golearn:local-repo', op: 'enrolments' }))?.enrolments;
    fu.inCandidates = {};
    for (const l of ['fr', 'sq']) { const r = await msg({ type: 'golearn:local-repo', op: 'candidates', languageId: l, limit: 10 }); fu.inCandidates[l] = r?.ok ? r.candidates.map((x) => x.unitId) : r; }
    fu.account = await readAccount();
    fu.in = { fr: await probeReview('fr', 'in-fr', { save: true }), sq: await probeReview('sq', 'in-sq', { save: true }) };
    const card = (x) => x.front?.stimulus ? `card "${x.front.stimulus}"` : 'no card';
    step('15f', 'GoReview follow-up: French vs Albanian, signed out and signed in', 'INFO', {
      signedOut: { fr: card(fu.out.fr), sq: card(fu.out.sq), frAfterSave: fu.outSaved && card(fu.outSaved.fr), sqAfterSave: fu.outSaved && card(fu.outSaved.sq) },
      signedIn: { fr: card(fu.in.fr), sq: card(fu.in.sq) }, reviewConfig: fu.reviewConfig,
    });
  }
  phase = '8b';
  if (want(8) || want('8b')) await extensionReload();
  report.timings.note ='replyMs = until the content script answered the lookup message; cardMs = until the card showed a lemma (both from the moment the rig sent the lookup).';
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
