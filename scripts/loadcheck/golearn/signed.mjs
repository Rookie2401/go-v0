// GoLearn signed in, with the service behind a fault proxy: ok / slow / hanging / down. The real extension build, a throw-away headless
// Brave profile, a throw-away local Repository service and a generated test account (never the owner's profile, service or account).
//   node signed.mjs <dist> <outDir> <servicePort>
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import crypto from 'node:crypto';
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
const SVC = Number(process.argv[4] ?? 8796);
const TMP = process.env.LOADCHECK_TMP ?? path.join(os.tmpdir(), 'loadcheck-golearn-signed');
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const PORT = 9343, WEB = 8773, PROXY = 8797;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

// the fault proxy in front of the service
let mode = 'ok';
const proxy = createServer((req, res) => {
  if (mode === 'down') { req.socket.destroy(); return; }
  if (mode === 'hang') return; // accepts, never answers
  const go = () => {
    const up = httpRequest({ host: '127.0.0.1', port: SVC, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  };
  if (mode === 'slow') setTimeout(go, 6000); else go();
}).listen(PROXY, '127.0.0.1');

// a throw-away view of the build: the service address points at the proxy, and the loopback pages may be scripted without a click
fs.rmSync(TMP, { recursive: true, force: true });
const EXT = path.join(TMP, 'ext');
fs.mkdirSync(EXT, { recursive: true });
for (const e of fs.readdirSync(DIST, { withFileTypes: true })) {
  if (e.name === 'translation.local.json') continue; // never copied, never read
  if (e.isDirectory() && e.name !== 'app') fs.symlinkSync(path.join(DIST, e.name), path.join(EXT, e.name), 'junction');
  else if (e.isDirectory()) fs.cpSync(path.join(DIST, e.name), path.join(EXT, e.name), { recursive: true });
  else fs.copyFileSync(path.join(DIST, e.name), path.join(EXT, e.name));
}
const cfg = JSON.parse(fs.readFileSync(path.join(EXT, 'app', 'config.json'), 'utf8'));
cfg.serviceUrl = `http://127.0.0.1:${PROXY}`;
fs.writeFileSync(path.join(EXT, 'app', 'config.json'), JSON.stringify(cfg));
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));

const LANGS = {
  sq: ['Albanian', 'Unë lexoj librin në shtëpi.', 'librin', 'libër'],
  es: ['Spanish', 'Los niños leyeron los libros en casa.', 'libros', 'libro'],
  de: ['German', 'Die Kinder lasen die Bücher zu Hause.', 'Bücher', 'Buch'],
  el: ['Greek', 'ὁ δὲ λόγον εἶπεν πρὸς αὐτούς.', 'λόγον', 'λόγος'],
};
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const lang = u.searchParams.get('lang') ?? 'sq';
  const declare = u.searchParams.get('declare') !== '0';
  const c = LANGS[lang] ?? LANGS.sq;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html${declare ? ` lang="${lang}"` : ''}><head><title>${lang}</title></head><body><p id="p">${c[1]}</p><p>${c[1]}</p></body></html>`);
}).listen(WEB, '127.0.0.1');

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
      const who = this.names.get(d.sessionId) ?? d.sessionId ?? 'browser';
      if (d.method === 'Runtime.exceptionThrown') consoleLog.push({ at: Date.now(), mode, who, kind: 'exception', text: (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? '').slice(0, 500) });
      if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) consoleLog.push({ at: Date.now(), mode, who, kind: d.params.type, text: d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500) });
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId, ms = 90000) { const id = ++seq; return new Promise((res) => { this.wait.set(id, res); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); res({ error: { message: `timeout ${method}` } }); } }, ms); }); }
}
const report = { steps: [], console: consoleLog };
const step = (name, ok, detail) => { report.steps.push({ mode, name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', `[${mode}]`, name, JSON.stringify(detail)?.slice(0, 420)); };

let c, id;
const targets = async () => (await c.send('Target.getTargets')).result.targetInfos;
const attach = async (targetId, name) => { const s = (await c.send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId; c.names.set(s, name); await c.send('Runtime.enable', {}, s); return s; };
const evalIn = async (s, expression, ms) => { const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s, ms); if (r.error) return { error: r.error.message }; if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }; return r.result?.result?.value; };
async function shadowText(s) {
  const doc = await c.send('DOM.getDocument', { depth: -1, pierce: true }, s);
  const out = [];
  const walk = (n, inShadow) => { if (inShadow && n.nodeType === 3 && n.nodeValue?.trim()) out.push(n.nodeValue.trim()); for (const ch of n.children ?? []) walk(ch, inShadow); for (const sr of n.shadowRoots ?? []) walk(sr, true); };
  if (doc.result) walk(doc.result.root, false);
  return out.join(' | ');
}
/** An extension page that stays open: it is how the harness asks the worker things and starts lookups (as the keyboard command would). */
let ctl;
async function lookup(lang, { declare = false } = {}) {
  const [, , word, lemma] = LANGS[lang];
  const url = `http://127.0.0.1:${WEB}/?lang=${lang}&declare=${declare ? 1 : 0}&n=${crypto.randomUUID().slice(0, 6)}`;
  const t = (await c.send('Target.createTarget', { url })).result.targetId;
  const s = await attach(t, `page:${lang}`);
  await c.send('DOM.enable', {}, s);
  await sleep(800);
  await evalIn(s, `(() => { const n = document.getElementById('p').firstChild; const i = n.data.indexOf(${JSON.stringify(word)}); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + ${word.length}); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return sel.toString(); })()`);
  const t0 = Date.now();
  // the background's own path for the keyboard command: inject, then ask the page to look up (no reply awaited here)
  const started = await evalIn(ctl, `(async () => { const t = (await chrome.tabs.query({})).find((x) => x.url === ${JSON.stringify(url)}); await chrome.tabs.update(t.id, { active: true }); await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); chrome.tabs.sendMessage(t.id, { type: 'golearn:lookup', trigger: 'command', focus: true }).catch(() => {}); return t.id; })()`, 30000);
  const seen = [];
  let text = '', firstAt;
  for (let i = 0; i < 90; i++) {
    await sleep(500);
    text = await shadowText(s);
    if (text && !firstAt) firstAt = Date.now() - t0;
    const head = text.slice(0, 80);
    if (head && seen[seen.length - 1] !== head) seen.push(head);
    if (text.includes(lemma) || /could not|not in the word list|no meaning/i.test(text)) break;
  }
  const ms = Date.now() - t0;
  await c.send('Target.closeTarget', { targetId: t });
  return { ok: text.includes(lemma), ms, firstVisibleMs: firstAt, sequence: seen.slice(0, 6), text: text.slice(0, 200), started };
}
async function popupSwitch(lang) {
  const t = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/action/popup.html` })).result.targetId;
  const s = await attach(t, 'popup');
  const t0 = Date.now();
  let opened;
  for (let i = 0; i < 240; i++) { await sleep(250); opened = await evalIn(s, `(() => { const sel = document.getElementById('language-select'); const v = sel ? [...sel.options].map((o) => o.value).filter(Boolean) : []; return v.length ? v : null; })()`); if (opened && !opened.error) break; }
  const openMs = Date.now() - t0;
  const t1 = Date.now();
  const res = await evalIn(s, `(async () => { const sel = document.getElementById('language-select'); if (!sel) return { err: 'no select' }; if (![...sel.options].some((o) => o.value === '${lang}')) return { err: 'not offered', options: [...sel.options].map((o) => o.value) }; sel.value = '${lang}'; sel.dispatchEvent(new Event('change')); for (let i = 0; i < 240; i++) { await new Promise((r) => setTimeout(r, 250)); const l = document.getElementById('language').textContent; if (!/Switching/.test(l)) return { line: l }; } return { line: document.getElementById('language').textContent, stuck: true }; })()`, 90000);
  const switchMs = Date.now() - t1;
  await c.send('Target.closeTarget', { targetId: t });
  const st = await evalIn(ctl, `chrome.runtime.sendMessage({ type: 'golearn:get-state' }).then((r) => JSON.stringify(r).slice(0, 300), (e) => 'err ' + e)`, 60000);
  return { openMs, switchMs, options: opened, res, state: st };
}

async function main() {
  let version;
  for (let i = 0; i < 40 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); } }
  if (!version) throw new Error('brave did not start');
  c = new Conn(version.webSocketDebuggerUrl); await c.open();
  let sw; for (let i = 0; i < 40 && !sw; i++) { sw = (await targets()).find((t) => t.type === 'service_worker' && t.url.includes('background.js')); if (!sw) await sleep(250); }
  id = new URL(sw.url).host;
  const ctlT = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/app/index.html#/signin` })).result.targetId;
  ctl = await attach(ctlT, 'setup');
  await sleep(2500);

  // sign in: a new test account on the throw-away service (credentials generated here, never printed)
  const email = `stress-${crypto.randomUUID().slice(0, 8)}@example.test`, password = crypto.randomBytes(18).toString('base64url');
  const made = await evalIn(ctl, `chrome.runtime.sendMessage({ type: 'golearn:create-account', baseUrl: 'http://127.0.0.1:${PROXY}', email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }).then(async (r) => { const st = await chrome.runtime.sendMessage({ type: 'golearn:get-state' }); return { ok: r?.ok, message: r?.message, connected: st?.connected ?? st?.status?.connected, keys: Object.keys(st ?? {}).slice(0, 12) }; }, (e) => ({ err: String(e) }))`, 60000);
  step('create a test account and sign in', made?.ok === true, made);

  // downloads while signed in
  await evalIn(ctl, `(async () => { location.hash = '#/languages'; await new Promise((r) => setTimeout(r, 2000)); return 1; })()`);
  for (const lang of ['es', 'de', 'el']) {
    const name = LANGS[lang][0], t0 = Date.now();
    const clicked = await evalIn(ctl, `(() => { document.querySelectorAll('details').forEach((x) => x.open = true); const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Download ${name}')); if (!b) return 'no button'; b.click(); return 'clicked'; })()`);
    let done = '';
    for (let i = 0; i < 120; i++) { done = await evalIn(ctl, `[...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === '${lang}').map((l) => l.textContent.replace(/\\s+/g, ' ').slice(0, 90)).join('|')`); if (done && /ready|not verify/.test(done)) break; await sleep(1000); }
    step(`download ${lang} (signed in)`, /ready/.test(done ?? ''), { clicked, state: done, seconds: Math.round((Date.now() - t0) / 1000) });
  }

  for (const m of ['ok', 'slow', 'hang', 'down', 'ok']) {
    mode = m;
    console.log(`--- service ${m} ---`);
    for (const lang of ['es', 'de']) {
      const sw1 = await popupSwitch(lang);
      step(`popup opens and switches -> ${lang}`, !!sw1.res?.line && !sw1.res.stuck && !sw1.res.err && sw1.res.line.startsWith(LANGS[lang][0]), sw1);
      const r = await lookup(lang, { declare: false });
      step(`lookup ${lang} on a page that does not declare its language`, r.ok, r);
    }
    const r2 = await lookup('el', { declare: true });
    step('lookup el on a page that declares Greek', r2.ok, r2);
  }
}

try { await main(); } catch (e) { step('harness', false, String(e?.stack ?? e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  server.close(); proxy.close(); browser.kill();
  await sleep(1500);
  process.exit(0);
}
