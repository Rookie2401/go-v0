// GoLearn stability probe: the real extension build in a throw-away headless Brave profile (never the owner's). It downloads
// languages through the setup page, switches the reading language through the popup, looks words up on pages, and repeats that
// after the service worker is stopped and after the extension is reloaded. Everything it sees is written to a JSON report.
//   node stress.mjs <dist> <outDir> [scenario,...]
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
const ONLY = (process.argv[4] ?? '').split(',').filter(Boolean);
const TMP = process.env.LOADCHECK_TMP ?? path.join(os.tmpdir(), 'loadcheck-golearn-stress');
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const PORT = 9341, WEB = 8771;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

// a throw-away view of the build with a host permission for the loopback test pages (so a script can inject without a click)
fs.rmSync(TMP, { recursive: true, force: true });
const EXT = path.join(TMP, 'ext');
fs.mkdirSync(EXT, { recursive: true });
for (const e of fs.readdirSync(DIST, { withFileTypes: true })) {
  if (e.isDirectory()) fs.symlinkSync(path.join(DIST, e.name), path.join(EXT, e.name), 'junction');
  else fs.copyFileSync(path.join(DIST, e.name), path.join(EXT, e.name));
}
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));

// language, setup name, sentence, word, a lemma the card should name
const LANGS = {
  sq: ['Albanian', 'Unë lexoj librin në shtëpi.', 'librin', 'libër'],
  es: ['Spanish', 'Los niños leyeron los libros en casa.', 'libros', 'libro'],
  de: ['German', 'Die Kinder lasen die Bücher zu Hause.', 'Bücher', 'Buch'],
  el: ['Greek', 'ὁ δὲ λόγον εἶπεν πρὸς αὐτούς.', 'λόγον', 'λόγος'],
  he: ['Hebrew', 'בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ.', 'הַשָּׁמַיִם', 'שָׁמַיִם'],
};
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const lang = u.searchParams.get('lang') ?? 'sq';
  const declare = u.searchParams.get('declare') !== '0';
  const c = LANGS[lang] ?? LANGS.sq;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html${declare ? ` lang="${lang}"` : ''}><head><title>${lang}</title></head><body><p id="p">${c[1]}</p><p>${c[1]}</p><p>${c[1]}</p></body></html>`);
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
      if (d.method === 'Runtime.exceptionThrown') consoleLog.push({ at: Date.now(), who, kind: 'exception', text: (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? '').slice(0, 600) });
      if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) consoleLog.push({ at: Date.now(), who, kind: d.params.type, text: d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 600) });
      if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level)) consoleLog.push({ at: Date.now(), who, kind: 'log-' + d.params.entry.level, text: `${d.params.entry.text} ${d.params.entry.url ?? ''}`.slice(0, 600) });
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId) { const id = ++seq; return new Promise((res) => { this.wait.set(id, res); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); res({ error: { message: `timeout ${method}` } }); } }, 60000); }); }
}
const report = { steps: [], console: consoleLog };
const log = (...a) => { console.log(...a); };
const step = (name, ok, detail) => { report.steps.push({ name, ok, detail }); log(ok ? 'PASS' : 'FAIL', name, typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 400)); };

let c, id, swS;
const targets = async () => (await c.send('Target.getTargets')).result.targetInfos;
const attach = async (targetId, name) => { const s = (await c.send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId; c.names.set(s, name); await c.send('Runtime.enable', {}, s); await c.send('Log.enable', {}, s); return s; };
const evalIn = async (s, expression) => { const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s); if (r.error) return { error: r.error.message }; if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }; return r.result?.result?.value; };
const findSw = async () => { for (let i = 0; i < 40; i++) { const sw = (await targets()).find((t) => t.type === 'service_worker' && t.url.includes('background.js')); if (sw) return sw; await sleep(250); } return undefined; };
const swAttach = async () => { const sw = await findSw(); if (!sw) return undefined; swS = await attach(sw.targetId, 'worker'); return swS; };
/** Wakes the worker (any extension page message does) and attaches to it again. */
const swWake = async (pageS) => { await evalIn(pageS, `chrome.runtime.sendMessage({ type: 'golearn:get-state' }).then(() => 1, () => 0)`); return swAttach(); };

/** The text of every shadow root on a page: where the card lives (a closed root, read through the protocol). */
async function shadowText(s) {
  const doc = await c.send('DOM.getDocument', { depth: -1, pierce: true }, s);
  const out = [];
  const walk = (n, inShadow) => {
    if (inShadow && n.nodeType === 3 && n.nodeValue?.trim()) out.push(n.nodeValue.trim());
    for (const ch of n.children ?? []) walk(ch, inShadow);
    for (const sr of n.shadowRoots ?? []) walk(sr, true);
  };
  if (doc.result) walk(doc.result.root, false);
  return out.join(' | ');
}

let pageSeq = 0;
/** Opens a page in `lang` (declared or not), selects the word, injects the content script as a gesture would, asks for a lookup. */
async function lookup(lang, { declare = true, inject = true, reuse } = {}) {
  const [, , word, lemma] = LANGS[lang];
  let s = reuse?.s, tabUrl = reuse?.url;
  if (!s) {
    tabUrl = `http://127.0.0.1:${WEB}/?lang=${lang}&declare=${declare ? 1 : 0}&n=${++pageSeq}`;
    const t = (await c.send('Target.createTarget', { url: tabUrl })).result.targetId;
    s = await attach(t, `page:${lang}`);
    await c.send('DOM.enable', {}, s);
    await sleep(900);
  }
  await evalIn(s, `(() => { const n = document.getElementById('p').firstChild; const i = n.data.indexOf(${JSON.stringify(word)}); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + ${word.length}); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return sel.toString(); })()`);
  const t0 = Date.now();
  if (!swS) await swAttach();
  const reply = await evalIn(swS, `(async () => {
    const t = (await chrome.tabs.query({})).find((x) => x.url === ${JSON.stringify(tabUrl)});
    if (!t) return { err: 'no tab' };
    await chrome.tabs.update(t.id, { active: true });
    ${inject ? "try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); } catch (e) { return { err: 'inject: ' + e }; }" : ''}
    await new Promise((r) => setTimeout(r, 300));
    return await chrome.tabs.sendMessage(t.id, { type: 'golearn:lookup', trigger: 'command', focus: true }).catch((e) => ({ err: String(e) }));
  })()`);
  let text = '';
  for (let i = 0; i < 24; i++) { await sleep(500); text = await shadowText(s); if (text && !/Loading|looking up/i.test(text)) break; }
  const ms = Date.now() - t0;
  const ok = !!text && text.includes(lemma);
  return { ok, ms, reply, text: text.slice(0, 260), s, url: tabUrl };
}

async function popupSwitch(lang) {
  const t = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/action/popup.html` })).result.targetId;
  const s = await attach(t, 'popup');
  await sleep(1200);
  const before = await evalIn(s, `(() => ({ value: document.getElementById('language-select')?.value, options: [...(document.getElementById('language-select')?.options ?? [])].map((o) => o.value), line: document.getElementById('language')?.textContent }))()`);
  const res = await evalIn(s, `(async () => { const sel = document.getElementById('language-select'); if (!sel) return { err: 'no select' }; if (![...sel.options].some((o) => o.value === '${lang}')) return { err: 'not offered', options: [...sel.options].map((o) => o.value) }; sel.value = '${lang}'; sel.dispatchEvent(new Event('change')); for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); const l = document.getElementById('language').textContent; if (!/Switching/.test(l)) return { line: l }; } return { line: document.getElementById('language').textContent, stuck: true }; })()`);
  const state = await evalIn(s, `chrome.runtime.sendMessage({ type: 'golearn:get-state' }).then((r) => ({ languageId: r?.languageId, chosen: r?.chosenLanguages }), (e) => ({ err: String(e) }))`);
  await c.send('Target.closeTarget', { targetId: t });
  return { before, res, state };
}

async function main() {
  let version;
  for (let i = 0; i < 40 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); } }
  if (!version) throw new Error('brave did not start');
  log('browser', version.Browser);
  c = new Conn(version.webSocketDebuggerUrl); await c.open();
  const sw = await findSw();
  if (!sw) throw new Error('the extension did not load');
  id = new URL(sw.url).host;
  await swAttach();
  log('extension', id);

  // 1. downloads, as a learner does them, on the setup page
  const setupT = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/app/index.html#/languages` })).result.targetId;
  const setS = await attach(setupT, 'setup');
  await sleep(3000);
  const toDownload = ['es', 'de', 'el', 'he'];
  for (const lang of toDownload) {
    const name = LANGS[lang][0];
    const t0 = Date.now();
    const clicked = await evalIn(setS, `(() => { const d = document.getElementById('language-section') ?? document.querySelector('details#language'); document.querySelectorAll('details').forEach((x) => x.open = true); const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Download ${name}')); if (!b) return 'no button: ' + [...document.querySelectorAll('button')].map((x)=>x.textContent.trim()).filter(Boolean).slice(0,20).join(' | '); b.click(); return 'clicked'; })()`);
    let done = '';
    for (let i = 0; i < 120; i++) {
      done = await evalIn(setS, `(() => [...document.querySelectorAll('li.mine')].filter((l) => l.dataset.language === '${lang}').map((l) => l.textContent.replace(/\\s+/g, ' ').slice(0, 90)).join('|'))()`);
      if (done && /ready|not verify/.test(done)) break;
      await sleep(1000);
    }
    step(`download ${lang}`, /ready/.test(done ?? ''), { clicked, state: done, seconds: Math.round((Date.now() - t0) / 1000) });
  }
  const setupText = await evalIn(setS, `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 600)`);
  report.setupAfterDownloads = setupText;

  // 2. switch through the popup, then look up a word on a page that does NOT declare its language (the switch must decide)
  for (const lang of ['es', 'de', 'el', 'he', 'sq', 'es']) {
    const sw1 = await popupSwitch(lang);
    step(`popup switch -> ${lang}`, sw1.state?.languageId === lang, sw1);
    const r = await lookup(lang, { declare: false });
    step(`lookup ${lang} (undeclared page) after switch`, r.ok, { ms: r.ms, reply: r.reply, text: r.text });
  }

  // 3. pages that declare their language, whatever the switch says (currently es)
  for (const lang of ['de', 'el', 'he']) {
    const r = await lookup(lang, { declare: true });
    step(`lookup ${lang} (declared page) while reading es`, r.ok, { ms: r.ms, reply: r.reply, text: r.text });
  }

  // 4. the worker stopped (the browser does this after 30 s idle): a lookup on a tab that already has the content script
  const keep = await lookup('es', { declare: false });
  step('lookup es before the worker stops', keep.ok, { ms: keep.ms, text: keep.text });
  await c.send('ServiceWorker.enable', {}, keep.s).catch(() => {});
  const stopped = await c.send('ServiceWorker.stopAllWorkers', {}, keep.s);
  await sleep(1500);
  swS = undefined;
  const after = await lookup('es', { reuse: keep, inject: false });
  step('lookup es after the worker stopped (same tab, no new injection)', after.ok, { stopped: stopped.error ?? 'ok', ms: after.ms, reply: after.reply, text: after.text });
  const after2 = await lookup('de', { declare: false });
  step('lookup de (undeclared) after the worker stopped: is the language still es?', after2.text.includes('Buch') || after2.text.length > 0, { ms: after2.ms, reply: after2.reply, text: after2.text });
  const sw2 = await popupSwitch('de');
  step('popup switch -> de after the worker stopped', sw2.state?.languageId === 'de', sw2);
  const after3 = await lookup('de', { declare: false });
  step('lookup de (undeclared) after the worker stopped and a switch', after3.ok, { ms: after3.ms, reply: after3.reply, text: after3.text });

  // 5. rapid switching
  const pT = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/action/popup.html` })).result.targetId;
  const pS = await attach(pT, 'popup-rapid');
  await sleep(1200);
  const rapid = await evalIn(pS, `(async () => { const sel = document.getElementById('language-select'); for (const l of ['es','el','he','de']) { sel.value = l; sel.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 120)); } for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); if (!/Switching/.test(document.getElementById('language').textContent)) break; } return { line: document.getElementById('language').textContent, select: sel.value }; })()`);
  const rapidState = await evalIn(pS, `chrome.runtime.sendMessage({ type: 'golearn:get-state' }).then((r) => r?.languageId)`);
  step('rapid switching ends on the last choice (de)', rapidState === 'de', { rapid, state: rapidState });
  await c.send('Target.closeTarget', { targetId: pT });
  const afterRapid = await lookup('de', { declare: false });
  step('lookup de after rapid switching', afterRapid.ok, { ms: afterRapid.ms, reply: afterRapid.reply, text: afterRapid.text });

  // 6. the extension reloaded (an update, or the learner pressing reload): a page with the old content script, injected again
  const old = await lookup('de', { declare: false });
  step('lookup de before the extension reloads', old.ok, { text: old.text });
  await evalIn(swS, `chrome.runtime.reload()`);
  await sleep(4000);
  swS = undefined;
  await swAttach();
  const re = await lookup('de', { reuse: old, inject: true });
  step('lookup de on the same tab after the extension reloaded (injected again)', re.ok, { ms: re.ms, reply: re.reply, text: re.text });
  const fresh = await lookup('de', { declare: false });
  step('lookup de on a new tab after the extension reloaded', fresh.ok, { ms: fresh.ms, reply: fresh.reply, text: fresh.text });

  // 7. the setup page's own switch ("Use for reading")
  const setT2 = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/app/index.html#/languages` })).result.targetId;
  const setS2 = await attach(setT2, 'setup2');
  await sleep(3000);
  const used = await evalIn(setS2, `(async () => { document.querySelectorAll('details').forEach((x) => x.open = true); const b = [...document.querySelectorAll('li.mine[data-language="el"] button')].find((x) => /Use for reading/.test(x.textContent)); if (!b) return 'no button: ' + [...document.querySelectorAll('li.mine')].map((l) => l.dataset.language + ':' + l.textContent.replace(/\\s+/g,' ').slice(0,60)).join(' || '); b.click(); await new Promise((r) => setTimeout(r, 1500)); return 'clicked'; })()`);
  const st = await evalIn(setS2, `chrome.runtime.sendMessage({ type: 'golearn:get-state' }).then((r) => r?.languageId)`);
  step('setup "Use for reading" -> el', st === 'el', { used, state: st });
  const elr = await lookup('el', { declare: false });
  step('lookup el (undeclared) after the setup switch', elr.ok, { ms: elr.ms, reply: elr.reply, text: elr.text });
}

try { await main(); } catch (e) { step('harness', false, String(e?.stack ?? e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  server.close(); browser.kill();
  await sleep(1500);
  process.exit(0);
}
