// GoLearn Russian acceptance rig: the real extension build (with its setup page and GoReview page) in a throw-away headless Brave
// profile, a throw-away LOCAL Repository service with a generated test account, and fixture pages served from ru-pages/. Walks a
// learner's journey in Russian (install, reading language, lookups and their cards, marks, a reload and a stopped worker, Active, a
// mixed Russian / Ukrainian / English page with no lang, signed in, GoReview, timings) and writes every reading to a JSON report. Adapted
// from fr.mjs (steps 1-4, 7-10, 13, 15, 16; 4b checks each card's lemma against an expectation). Nothing here touches the
// owner's profile, service or account; the hosted service is never contacted (the copy's service address is the local one).
//   node scripts/loadcheck/golearn/ru.mjs [dist] [outDir] [step,...]
// Environment: LOADCHECK_BRAVE (required), LOADCHECK_TMP (optional; default <temp>/loadcheck-golearn-ru), no real sites are visited.
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
const TMP = process.env.LOADCHECK_TMP || path.join(os.tmpdir(), 'loadcheck-golearn-ru');
const OUT = path.resolve(process.argv[3] || path.join(TMP, 'out'));
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const PORT = 9371, PORT2 = 9372, WEB = 8793, SVC = 8809;
const PAGES = path.join(HERE, 'ru-pages');
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
  // 1. install Russian on the setup page
  let packVersion;
  {
    const row = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ru"]'); if (!r) return { err: 'no Russian row', rows: [...document.querySelectorAll('li.lang-row')].map((x) => x.dataset.language) }; return { name: r.querySelector('.lang-name')?.innerText.replace(/\\s+/g, ' ').trim(), level: r.querySelector('.lang-level')?.innerText.trim(), text: r.innerText.replace(/\\s+/g, ' ').slice(0, 400), rows: [...document.querySelectorAll('li.lang-row')].map((x) => x.dataset.language) }; })()`);
    const t0 = Date.now();
    const clicked = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ru"]'); if (!r) return 'no row'; r.querySelectorAll('details').forEach((d) => d.open = true); const b = r.querySelector('button[data-action="choose"]'); if (!b) return 'no button'; b.click(); return 'clicked ' + b.textContent.trim(); })()`);
    let state = '';
    for (let i = 0; i < 360; i++) {
      state = await B.evalIn(ctl.s, `[...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === 'ru').map((l) => l.textContent.replace(/\\s+/g, ' ').slice(0, 160)).join('|')`);
      if (state && /ready|not verify|did not/i.test(state)) break;
      await sleep(1000);
    }
    const feedback = await B.evalIn(ctl.s, `(() => { const r = document.querySelector('li.lang-row[data-language="ru"]'); return r?.querySelector('.lang-feedback')?.innerText.replace(/\\s+/g, ' ').slice(0, 1200); })()`);
    const rec = { ...(await storage('pack:installed')), ...(await storage('golearn:pack:installed')) };
    const ruRec = rec['golearn:pack:installed:pack:ru'] ?? rec['pack:installed:pack:ru'] ?? Object.entries(rec).find(([k]) => k.endsWith(':ru'))?.[1];
    packVersion = ruRec?.version;
    const failures = (ruRec?.verified?.validation ?? []).filter((v) => !v.pass);
    report.install = { row, clicked, state, feedback, records: Object.keys(rec ?? {}), ruRecord: ruRec && { version: ruRec.version, installedAt: ruRec.installedAt, dictionaryManifest: ruRec.verified?.dictionaryManifest, sampleShard: ruRec.verified?.sampleShard, cases: ruRec.verified?.validation?.length, failures } };
    step(1, 'install Russian on the setup page', /ready/i.test(state) && !!ruRec ? 'PASS' : 'FAIL', { row: row?.name ?? row, level: row?.level, clicked, state, feedback: feedback?.slice(0, 300), seconds: Math.round((Date.now() - t0) / 1000), recordKey: Object.keys(rec ?? {}), version: ruRec?.version, dictionaryManifest: ruRec?.verified?.dictionaryManifest, sampleShard: ruRec?.verified?.sampleShard, validationCases: ruRec?.verified?.validation?.length, validationFailures: failures });
  }

  // 2. Russian as the reading language, through the popup
  {
    const p = await popup('ru');
    const st = await msg({ type: 'golearn:get-state' });
    const status = await msg({ type: 'golearn:status' });
    report.popupRu = { ...p, state: { languageId: st?.languageId, chosen: st?.chosenLanguages }, status: { languageId: status?.languageId, languageName: status?.languageName, packAvailable: status?.packAvailable } };
    const ok = /Russian|русск/i.test(p.after?.language ?? p.res?.line ?? '') && (st?.languageId === 'ru' || status?.languageId === 'ru');
    step(2, 'Russian is the reading language (popup switch)', ok ? 'PASS' : 'FAIL', { options: p.before?.options, line: p.after?.language ?? p.res, workerState: st?.languageId, status: status?.languageName });
  }

  // 3-4. the prose page: language and lookups
  const prose = await B.open(page('prose'), 'prose');
  await c.send('Page.enable', {}, prose.s);
  await sleep(1500);
  // [label, target, what, expected lemma (a regex the card's lemma must match; undefined = reading recorded only)]
  const W4 = [
    ['прочитала', { id: 'p1', word: 'прочитала' }, 'perfective past feminine', /^прочитать$/],
    ['книгу', { id: 'p1', word: 'книгу' }, 'accusative singular', /^книга$/],
    ['стали (из стали)', { id: 'p3', word: 'стали', n: 0 }, 'genitive of the noun сталь', /^сталь$/],
    ['стали (стали дешевле)', { id: 'p3', word: 'стали', n: 1 }, 'past plural of стать', /^стать$/],
    ['шел', { id: 'p4', word: 'шел' }, 'ё restored: шёл of идти', /^(идти|шёл)$/],
    ['идут', { id: 'p2', word: 'идут' }, 'present plural of идти', /^идти$/],
    ['школу', { id: 'p2', word: 'школу' }, 'accusative singular', /^школа$/],
    ['дома', { id: 'p2', word: 'дома' }, 'adverb (at home), not a plural of дом', undefined],
    ['работает', { id: 'p2', word: 'работает' }, 'present singular', /^работать$/],
    ['мать', { id: 'p2', word: 'мать' }, 'noun', /^мать$/],
    ['ходит', { id: 'p5', word: 'ходит' }, 'multidirectional motion verb', /^ходить$/],
    ['ехали', { id: 'p5', word: 'ехали' }, 'past plural of ехать', /^ехать$/],
  ];
  const results = {};
  if (want(3) || want(4)) {
    for (const [label, target, what, expect] of W4) {
      const r = await lookup(prose, target, { settleMs: 2500 });
      results[label] = r;
      report.cards.push({ step: 4, label, what, expect: expect?.source, sentence: r.sel?.sentence, selected: r.sel?.selected, replyMs: r.replyMs, cardMs: r.cardMs, reply: r.reply, card: r.card });
      console.log('  card', label, JSON.stringify(cardLine(r)).slice(0, 300));
      if (label === 'прочитала') { report.timings.firstRussianLookup = { replyMs: r.replyMs, cardMs: r.cardMs }; report.shots = { ...(report.shots ?? {}), cardProchitala: await B.shot(prose.s, 'card-prochitala') }; }
      if (label === 'книгу') report.timings.secondRussianLookup = { replyMs: r.replyMs, cardMs: r.cardMs };
      if (label === 'стали (из стали)') report.shots = { ...(report.shots ?? {}), cardStali: await B.shot(prose.s, 'card-stali') };
    }
    const first = results['прочитала'];
    step(3, 'the prose page resolves to Russian', first?.card?.host?.['data-language-id'] === 'ru' ? 'PASS' : 'FAIL', { host: first?.card?.host, reply: first?.reply, popup: (await popup()).before });
    const got = Object.values(results).filter((r) => r.card?.lemma).length;
    step(4, 'lookups by selection on the prose page: a card for each word', got === W4.length ? 'PASS' : 'FAIL', { cardsWithLemma: got, of: W4.length, lines: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, cardLine(r)])) });
    const mism = W4.filter(([l, , , e]) => e && !e.test((results[l]?.card?.lemma ?? '').trim())).map(([l, , , e]) => ({ word: l, expected: String(e), got: cardLine(results[l]) }));
    step('4b', 'the lemma on each card is the expected one (words with an expectation)', mism.length === 0 ? 'PASS' : 'FAIL', { checked: W4.filter((w) => w[3]).length, mismatches: mism });
  }

  // 7. marks: книгу Known, школу Familiar
  const marks = [['книгу', { id: 'p1', word: 'книгу' }, 'known'], ['школу', { id: 'p2', word: 'школу' }, 'familiar']];
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
    const kn = await msg({ type: 'golearn:local-repo', op: 'knowledge', languageId: 'ru' });
    const knRows = (kn?.knowledge ?? []).filter((k) => /книг|школ/.test(k.unitId)).map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark, encounters: k.encounters }));
    report.marks = { done, itemMarked: marked, knowledge: knRows, eventKinds: ev.reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] ?? 0) + 1 }), {}) };
    const idsOk = marked.length >= 2 && marked.every((m) => JSON.stringify(m.subject ?? m.units ?? '').includes(':ru:'));
    step(7, 'mark книгу Known and школу Familiar from the card', idsOk && done['книгу'].pressed?.includes('known') && done['школу'].pressed?.includes('familiar') ? 'PASS' : 'FAIL', report.marks);
  }

  // 8. reload the page, stop the worker: the marks persist
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
    }
    report.persist = res;
    const ok = Object.entries(res).every(([k, v]) => v.pressed?.includes(k.endsWith('книгу') ? 'known' : 'familiar'));
    step(8, 'marks persist across a page reload and a stopped worker (extension reload is the known headless limitation, not run)', ok ? 'PASS' : 'FAIL', res);
  }

  // 9. GoLearn Active on the prose page
  if (want(9) || want(10)) {
    const on = await msg({ type: 'golearn:active', op: 'set', patch: { active: true } });
    report.activeOn = on;
    if (want(9)) {
      const t0 = Date.now();
      const pg = await B.open(page('prose'), 'prose-active');
      await c.send('Target.activateTarget', { targetId: pg.t });
      let st;
      for (let i = 0; i < 120; i++) { st = await ping(pg); if (st?.activeState?.scanned && (st.activeState.confirmed !== undefined || i > 40)) break; await sleep(500); }
      const firstScanMs = Date.now() - t0;
      await sleep(5000);
      st = await ping(pg);
      const hl = await highlights(pg);
      const pp = await popup();
      report.shots = { ...(report.shots ?? {}), activeProse: await B.shot(pg.s, 'active-prose') };
      const all = Object.entries(hl.ranges ?? {}).flatMap(([n, rs]) => rs.map((r) => `${n}|${r}`));
      const levelOf = (w) => all.filter((x) => x.split('|')[1].split(':').slice(1).join(':') === w).map((x) => x.split('|')[0]);
      const kn = levelOf('книгу'), fam = levelOf('школу'), pr = levelOf('прочитала');
      report.active9 = { activeState: st?.activeState, highlights: hl, popup: pp.before, firstScanMs };
      report.timings.activeScan = { firstScanSeenMs: firstScanMs, scanMs: st?.activeState?.scanMs, profileMs: st?.activeState?.profileMs, scanned: st?.activeState?.scanned };
      step(9, 'Active on the Russian prose page', st?.activeState?.scanned > 0 && all.length > 0 ? 'PASS' : 'FAIL', { on: on?.settings?.active, languages: st?.activeState?.languages, scanned: st?.activeState?.scanned, marked: st?.activeState?.marked, skipped: st?.activeState?.skipped, confirmed: st?.activeState?.confirmed, unconfirmed: st?.activeState?.unconfirmed, reason: st?.activeState?.reason, highlightWorld: hl.world, ranges: all.length, 'книгу': kn, 'школу': fam, 'прочитала': pr, popupPage: pp.before?.page, popupCounts: pp.before?.counts, popupDetail: pp.before?.detail });
      await B.close(pg.t);
    }
    // 10. a page with no lang attribute: Russian, Ukrainian, English paragraphs
    if (want(10)) {
      const pg = await B.open(page('mixed'), 'mixed');
      await c.send('Target.activateTarget', { targetId: pg.t });
      let st;
      for (let i = 0; i < 80; i++) { st = await ping(pg); if (st?.activeState?.scanned) break; await sleep(500); }
      await sleep(5000);
      st = await ping(pg);
      const hl = await highlights(pg);
      const all = Object.entries(hl.ranges ?? {}).flatMap(([n, rs]) => rs.map((r) => `${n}|${r}`));
      const byPara = {};
      for (const x of all) { const [lvl, rest] = x.split('|'); const [para, ...w] = rest.split(':'); (byPara[para] ??= []).push(`${w.join(':')}(${lvl.replace('golearn-', '')})`); }
      const other = [...(byPara['m-uk'] ?? []), ...(byPara['m-en'] ?? [])];
      const pp = await popup();
      report.shots = { ...(report.shots ?? {}), activeMixed: await B.shot(pg.s, 'active-mixed') };
      const lk = {};
      for (const [para, word] of [['m-ru', 'соседка'], ['m-uk', 'столицею'], ['m-en', 'neighbour']]) { const r = await lookup(pg, { id: para, word }, { deeper: false, inject: false }); lk[para] = { word, ...cardLine(r), reply: r.reply, text: r.card?.text?.slice(0, 300) }; }
      report.mixed = { activeState: st?.activeState, byPara, highlights: hl, popup: pp.before, lookups: lk };
      step(10, 'mixed page with no lang: only the Russian paragraph is read as Russian', (byPara['m-ru']?.length ?? 0) > 0 && other.length === 0 ? 'PASS' : 'FAIL', { languages: st?.activeState?.languages, scanned: st?.activeState?.scanned, skipped: st?.activeState?.skipped, marked: st?.activeState?.marked, reason: st?.activeState?.reason, underlinedRu: byPara['m-ru']?.length ?? 0, underlinedUk: byPara['m-uk'] ?? [], underlinedEn: byPara['m-en'] ?? [], popupPage: pp.before?.page, lookups: lk });
      await B.close(pg.t);
    }
  }

  // ═════════ B. signed in to a throw-away LOCAL service ═════════
  phase = 'B';
  const email = `ru-rig-${crypto.randomBytes(4).toString('hex')}@example.test`;
  const password = crypto.randomBytes(18).toString('base64url');
  const svcApi = async (method, p, body, token) => { const r = await fetch(`${SVC_URL}${p}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, body: j }; };
  const readAccount = async () => {
    const s = await svcApi('POST', '/sessions', { email, password, deviceId: 'ru-rig-reader', platform: 'rig' });
    const token = s.body?.token;
    if (!token) return { error: `session ${s.status}` };
    const enr = await svcApi('GET', '/enrolments', undefined, token);
    const ev = await svcApi('GET', '/events?languageId=ru&limit=1000', undefined, token);
    const evMarks = await svcApi('GET', '/events?languageId=ru&kinds=ItemMarked,CardReviewed,CardAdded,AssessmentAnswered&limit=500', undefined, token);
    const kn = await svcApi('GET', '/knowledge?languageId=ru', undefined, token);
    const events = ev.body?.events ?? [];
    return {
      enrolments: (enr.body?.enrolments ?? []).map((e) => ({ languageId: e.languageId, packId: e.packId, packVersion: e.packVersion, ended: !!e.endedAt })),
      eventCount: events.length, eventKinds: events.reduce((a, e) => ({ ...a, [(e.event ?? e).kind]: (a[(e.event ?? e).kind] ?? 0) + 1 }), {}),
      itemMarked: (evMarks.body?.events ?? []).map((e) => e.event ?? e).filter((e) => e.kind === 'ItemMarked').map((e) => ({ mark: e.payload?.mark, itemIds: e.subject?.itemIds, at: e.occurredAt })),
      reviews: (evMarks.body?.events ?? []).map((e) => e.event ?? e).filter((e) => e.kind !== 'ItemMarked').map((e) => ({ kind: e.kind, subject: e.subject, payload: e.payload })),
      eventsByKindStatus: evMarks.status,
      knowledge: (kn.body?.knowledge ?? []).map((k) => ({ unitId: k.unitId, level: k.level, selfMark: k.selfMark, encounters: k.encounters })),
      knowledgeStatus: kn.status,
    };
  };
  const signedMarks = [['мать', { id: 'p2', word: 'мать' }, 'known'], ['дома', { id: 'p2', word: 'дома' }, 'familiar']];
  if (want(13) || want(15)) {
    await B.evalIn(ctl.s, `(async () => { location.hash = '#/signin'; await new Promise((r) => setTimeout(r, 1500)); return 1; })()`);
    const made = await msg({ type: 'golearn:create-account', baseUrl: SVC_URL, email, password, displayName: 'Rig' });
    await B.evalIn(ctl.s, `(async () => { location.hash = '#/languages'; location.reload(); return 1; })()`);
    await sleep(4000);
    const page13 = await B.evalIn(ctl.s, `document.getElementById('account-line')?.innerText ?? document.body.innerText.slice(0, 300)`);
    let acct = await readAccount();
    let enrol;
    if (!acct.enrolments?.some((e) => e.languageId === 'ru' && !e.ended)) {
      enrol = await msg({ type: 'golearn:enrol', languageId: 'ru', packId: 'pack:ru', packVersion: packVersion ?? '1', goals: [{ kind: 'reading' }] });
      await sleep(1500);
    }
    await popup('ru');
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
    const ok = made?.ok && /мать/.test(units) && (acct.itemMarked ?? []).every((m) => (m.itemIds ?? []).length > 0 && m.itemIds.every((u) => /^(lemma|form):ru:/.test(u)));
    step(13, 'signed in: Russian marks reach the local service with ru ids', ok ? 'PASS' : 'FAIL', report.signed);
    await B.close(pg.t);

    // 15. GoReview, the extension's review page
    if (want(15)) {
      const rv = await B.open(`chrome-extension://${id}/review/index.html`, 'goreview');
      await sleep(6000);
      const home = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500)`);
      const langs = await B.evalIn(rv.s, `(() => { const s = document.getElementById('language-select'); return { selected: s?.selectedOptions?.[0]?.textContent.trim(), options: [...(s?.options ?? [])].map((o) => o.textContent.trim()), name: document.getElementById('language-name')?.textContent }; })()`);
      const chose = await B.evalIn(rv.s, `(async () => { const s = document.getElementById('language-select'); if (!s) return { err: 'no language select', name: document.getElementById('language-name')?.textContent }; const o = [...s.options].find((x) => /Russian|русск/i.test(x.textContent)); if (!o) return { err: 'Russian not offered', options: [...s.options].map((x) => x.textContent) }; if (s.value !== o.value) { s.value = o.value; s.dispatchEvent(new Event('change')); } await new Promise((r) => setTimeout(r, 7000)); return { selected: document.getElementById('language-select')?.selectedOptions?.[0]?.textContent.trim() }; })()`, 30000);
      const homeRu = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500)`);
      const vocab = await B.evalIn(rv.s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 4000)); const t = document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1500); location.hash = '#/review'; await new Promise((r) => setTimeout(r, 4000)); return t; })()`, 30000);
      const readFront = `(() => { const s = document.getElementById('session'); if (!s) return null; return { stimulus: document.getElementById('stimulus')?.innerText.trim(), instruction: document.getElementById('instruction')?.innerText.trim(), lang: document.getElementById('stimulus')?.closest('[lang]')?.getAttribute('lang') ?? document.getElementById('stimulus')?.getAttribute('lang'), text: s.innerText.replace(/\\s+/g, ' ').slice(0, 800) }; })()`;
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
        probe = {};
        for (const lang of ['ru']) { const r = await msg({ type: 'golearn:local-repo', op: 'candidates', languageId: lang, limit: 5 }); probe[lang] = r?.ok ? { ok: true, count: r.candidates?.length, first: r.candidates?.slice(0, 3).map((x) => x.unitId ?? x.itemId ?? JSON.stringify(x).slice(0, 120)) } : r; }
        saved = await B.evalIn(rv.s, `(async () => { location.hash = '#/vocabulary'; await new Promise((r) => setTimeout(r, 4000)); const b = [...document.querySelectorAll('button')].find((x) => /Save for GoReview/.test(x.textContent)); if (!b) return { err: 'no Save for GoReview button' }; const row = (b.closest('li, tr, article') ?? b.parentElement).innerText.replace(/\\s+/g, ' ').slice(0, 200); b.click(); await new Promise((r) => setTimeout(r, 2500)); const after = (b.closest('li, tr, article') ?? b.parentElement)?.innerText.replace(/\\s+/g, ' ').slice(0, 200); location.hash = '#/review'; await new Promise((r) => setTimeout(r, 5000)); return { row, after, home: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600) }; })()`, 40000);
        const again = await B.evalIn(rv.s, `(() => { const b = document.getElementById('start-session'); if (!b) return { err: 'no #start-session' }; b.click(); return { clicked: b.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200) }; })()`);
        for (let i = 0; i < 30; i++) { await sleep(500); front = await B.evalIn(rv.s, readFront); if (front?.stimulus) break; }
        saved.again = again;
        if (!front?.stimulus) saved.page = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 1000)`);
      }
      start = { ...start, chose, homeRu, vocab, startNew, probe, saved };
      const reveal = await B.evalIn(rv.s, `(() => { const b = document.getElementById('reveal') ?? document.getElementById('flip-card'); if (!b) return { err: 'no reveal' }; b.click(); return { clicked: b.id }; })()`);
      await sleep(1200);
      const back = await B.evalIn(rv.s, `(() => ({ answer: document.getElementById('revealed-answer')?.innerText.trim(), text: (document.getElementById('session')?.innerText ?? document.body.innerText).replace(/\\s+/g, ' ').slice(0, 1200), grades: [...document.querySelectorAll('.grade')].map((g) => g.dataset.grade) }))()`);
      report.shots = { ...(report.shots ?? {}), goreviewBack: await B.shot(rv.s, 'goreview-back') };
      const grade = await B.evalIn(rv.s, `(() => { const g = document.querySelector('.grade[data-grade="good"]'); if (!g) return { err: 'no Good grade button', grades: [...document.querySelectorAll('.grade')].map((x) => x.dataset.grade) }; g.click(); return { clicked: g.dataset.grade }; })()`);
      await sleep(3000);
      const next = await B.evalIn(rv.s, readFront);
      const afterGrade = await B.evalIn(rv.s, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600)`);
      report.shots = { ...(report.shots ?? {}), goreview: await B.shot(rv.s, 'goreview') };
      const ev = await exportEvents();
      const reviewEvents = ev.filter((e) => /^Card|Assessment/.test(e.kind));
      await msg({ type: 'golearn:sync-now' }, 60000); await msg({ type: 'golearn:local-repo', op: 'upload' }, 60000); await sleep(2000);
      const acct2 = await readAccount();
      report.goreview = { home, langs, start, front, reveal, back, grade, next, afterGrade, reviewEventsOnDevice: reviewEvents, accountReviews: acct2.reviews };
      const ok = !!front?.stimulus && !!back?.answer && grade?.clicked === 'good' && reviewEvents.some((e) => e.kind === 'CardReviewed') && (acct2.reviews ?? []).some((e) => e.kind === 'CardReviewed');
      step(15, 'GoReview offers Russian, builds a card and accepts a grade', ok ? 'PASS' : 'FAIL', { options: langs?.options, chose, front, answer: back?.answer, grades: back?.grades, grade, nextCard: next?.stimulus, deviceEvents: reviewEvents.map((e) => ({ kind: e.kind, units: e.units, subject: e.subject, payload: e.payload })), accountEvents: acct2.reviews });
    }
  }

  // 16. timings and sizes
  if (want(16)) {
    const size = (f) => { try { return fs.statSync(path.join(DIST, 'analysers', f)).size; } catch { return undefined; } };
    const ruJs = fs.readFileSync(path.join(DIST, 'analysers', 'ru.js'), 'utf8');
    const lazy = [...ruJs.matchAll(/import\(`?\.\/(shared-[\w-]+\.js)/g)].map((m) => m[1]);
    report.timings.sizes = { 'ru.js': size('ru.js'), lazy: Object.fromEntries(lazy.map((f) => [f, size(f)])), 'content.js': fs.statSync(path.join(DIST, 'content.js')).size, 'background.js': fs.statSync(path.join(DIST, 'background.js')).size };
    step(16, 'timings and sizes', report.timings.firstRussianLookup ? 'INFO' : 'not run', report.timings);
  }
  report.timings.note = 'replyMs = until the content script answered the lookup message; cardMs = until the card showed a lemma (both from the moment the rig sent the lookup).';
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
