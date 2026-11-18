// Reading Analysis, the real-browser acceptance run. The real extension build in a throw-away headless Brave profile, a throw-away local
// Repository service behind a fault proxy, a generated test account, and a second "device" (this script, signed in to the same account
// with its own session) that plays GoReview on a phone. Never the owner's profile, service or account; the test password is generated
// here and never printed.
//
//   npx vite-node scripts/loadcheck/golearn/reading.mts <dist> <outDir>
//
// What a step asserts is stated in its name; every expected number is worked out HERE from the page's own text (letter runs counted with a
// regular expression, occurrences of the marked words counted by hand below), never taken from the code under test.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT_VERSION, type GoEvent } from '../../../packages/repository-contract/src';
import { createRepositoryApi } from '../../../packages/repository-service/src/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIST = process.argv[2];
const OUT = process.argv[3];
if (!DIST || !OUT) throw new Error('usage: reading.mts <dist> <outDir>');
const BRAVE = process.env.LOADCHECK_BRAVE;
if (!BRAVE) throw new Error('Set LOADCHECK_BRAVE to the path of brave.exe');
const TMP = process.env.LOADCHECK_TMP ?? path.join(os.tmpdir(), 'loadcheck-golearn-reading');
const CDP = 9351, WEB = 8781, SVC = 8806, PROXY = 8807;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

// ───────────── the pages ─────────────
const SQ = ['Unë po lexoj një libër të bukur në shtëpinë time.', 'Beni shkon në shtëpinë e Anës.', 'Beni shkon në shtëpi dhe lexon një libër.'];
const WORDS = (s: string): number => (s.match(/[\p{L}\p{M}]+/gu) ?? []).length;
const COUNT = (s: string, word: string): number => (s.match(/[\p{L}\p{M}]+/gu) ?? []).filter((w) => w === word).length;
const article = (repeat: number, title: string): { html: string; main: string } => {
  const paragraphs = Array.from({ length: repeat }, () => SQ).flat();
  const main = [title, ...paragraphs].join(' ');
  const html = `<!doctype html><html lang="sq"><head><meta charset="utf-8"><title>${title}</title><style>.mobile{display:none}</style></head><body>
<nav><a href="#">Kreu</a> <a href="#">Lajme nga bota</a> <a href="#">Libra të rinj</a></nav>
<header><p>Gazeta e qytetit</p></header>
<main><h1>${title}</h1>
${paragraphs.map((p, i) => `<p${i === 0 ? ' id="p"' : i === 1 ? ' id="q"' : ''}>${p}</p>`).join('\n')}
<p class="mobile">${SQ[0]}</p>
<blockquote lang="en"><p>This quotation is in English and is not Albanian text.</p></blockquote>
</main>
<aside><p>Lexo edhe libra të tjerë të bukur.</p></aside>
<form><label>Emri <input value="Beni shkon"></label><button>Dërgo</button></form>
<footer><p>Të gjitha të drejtat e rezervuara.</p></footer>
</body></html>`;
  return { html, main };
};
const PAGES: Record<string, { html: string; main: string }> = {
  article: article(20, 'Libri i Benit'),
  book: article(8000, 'Libri i gjatë'), // about 200,000 words in one document: the long-text case
  greek: { html: '<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Greek</title></head><body><main><p>ὁ δὲ λόγον εἶπεν πρὸς αὐτούς.</p></main></body></html>', main: '' },
};
// a single-page reader: the chapter is swapped in place by a script, the address stays
PAGES.spa = { html: PAGES.article.html.replace('</body>', '<script>window.swap = () => { document.querySelectorAll("main p").forEach((p, i) => { if (i > 2) p.remove(); }); document.querySelector("h1").textContent = "Kapitulli tjetër"; };</script></body>'), main: '' };

const web = createServer((req, res) => {
  const name = new URL(req.url ?? '/', 'http://x').pathname.slice(1);
  const page = PAGES[name];
  if (!page) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(page.html);
}).listen(WEB, '127.0.0.1');
const urlOf = (name: string): string => `http://127.0.0.1:${WEB}/${name}`;

// ───────────── the service, behind a fault proxy ─────────────
let mode: 'ok' | 'down' | 'hang' = 'ok';
const proxy = createServer((req, res) => {
  if (mode === 'down') { req.socket.destroy(); return; }
  if (mode === 'hang') return; // accepts, never answers
  const up = httpRequest({ host: '127.0.0.1', port: SVC, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
  up.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(up);
}).listen(PROXY, '127.0.0.1');

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(path.join(TMP, 'service'), { recursive: true });
// a service already answering on the port is used as it is (start one by hand with a fresh --data folder: it takes about half a minute to come up);
// otherwise one is started here and stopped at the end
const alreadyUp = await fetch(`http://127.0.0.1:${SVC}/health`).then((r) => r.ok, () => false);
const service: ChildProcess | undefined = alreadyUp ? undefined : spawn('npx', ['vite-node', 'packages/repository-service/src/main.ts', '--port', String(SVC), '--data', path.join(TMP, 'service'), '--host', '127.0.0.1'], { cwd: ROOT, shell: true, stdio: 'ignore' });

// a throw-away view of the build: the service address is the proxy, and the loopback pages may be scripted without a click
const EXT = path.join(TMP, 'ext');
fs.mkdirSync(EXT, { recursive: true });
for (const e of fs.readdirSync(DIST, { withFileTypes: true })) {
  if (e.name === 'translation.local.json') continue; // never copied, never read
  // copied, not linked: this browser does not load an extension whose folders are junctions to somewhere else
  if (e.isDirectory()) fs.cpSync(path.join(DIST, e.name), path.join(EXT, e.name), { recursive: true });
  else fs.copyFileSync(path.join(DIST, e.name), path.join(EXT, e.name));
}
const cfgPath = path.join(EXT, 'app', 'config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
cfg.serviceUrl = `http://127.0.0.1:${PROXY}`;
fs.writeFileSync(cfgPath, JSON.stringify(cfg));
const manifestPath = path.join(EXT, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
const build = JSON.parse(fs.readFileSync(path.join(DIST, 'build.json'), 'utf8')) as { id: string };

const launch = (): ChildProcess => spawn(BRAVE, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(TMP, 'profile')}`,
  `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
let browser = launch();
async function connect(): Promise<any> {
  let version: any;
  for (let i = 0; i < 60 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); } catch { await sleep(500); } }
  if (!version) throw new Error('the browser did not start');
  c = new Conn(version.webSocketDebuggerUrl); await c.open();
  return version;
}

// ───────────── the DevTools connection ─────────────
let seq = 0;
const consoleLog: Array<{ who: string; kind: string; text: string }> = [];
class Conn {
  ws: WebSocket; wait = new Map<number, (d: any) => void>(); names = new Map<string, string>();
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)!(d); this.wait.delete(d.id); return; }
      const who = this.names.get(d.sessionId) ?? d.sessionId ?? 'browser';
      if (d.method === 'Runtime.exceptionThrown') consoleLog.push({ who, kind: 'exception', text: String(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? '').slice(0, 500) });
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleLog.push({ who, kind: 'error', text: d.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ').slice(0, 500) });
    };
  }
  open(): Promise<void> { return new Promise((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = () => rej(new Error('websocket')); }); }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string, ms = 120_000): Promise<any> {
    const id = ++seq;
    return new Promise((res) => {
      this.wait.set(id, res);
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); res({ error: { message: `timeout ${method}` } }); } }, ms);
    });
  }
}
const report: { build: string; steps: Array<{ name: string; ok: boolean; detail: unknown }>; console: typeof consoleLog } = { build: build.id, steps: [], console: consoleLog };
const step = (name: string, ok: boolean, detail?: unknown): void => { report.steps.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, (JSON.stringify(detail) ?? '').slice(0, 600)); };

let c: Conn, extId: string, ctl: string;
const targets = async (): Promise<any[]> => (await c.send('Target.getTargets')).result.targetInfos;
const attach = async (targetId: string, name: string): Promise<string> => { const s = (await c.send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId; c.names.set(s, name); await c.send('Runtime.enable', {}, s); return s; };
const evalIn = async (s: string, expression: string, ms?: number): Promise<any> => {
  const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s, ms);
  if (r.error) return { error: r.error.message };
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
const openPage = async (name: string): Promise<{ target: string; session: string }> => {
  const target = (await c.send('Target.createTarget', { url: urlOf(name) })).result.targetId;
  const session = await attach(target, `page:${name}`);
  await c.send('DOM.enable', {}, session);
  await sleep(700);
  return { target, session };
};
/** The control page: an extension page that stays open and sends what the popup sends. */
async function openControl(): Promise<void> {
  // the id is read once, from the worker the browser starts at launch; after a reload the worker may be asleep (no target), and opening a page of the extension wakes it
  if (!extId) {
    let sw: any;
    for (let i = 0; i < 80 && !sw; i++) { sw = (await targets()).find((t) => t.type === 'service_worker' && t.url.includes('background.js')); if (!sw) await sleep(250); }
    if (!sw) throw new Error('the extension worker did not start');
    extId = new URL(sw.url).host;
  }
  const t = (await c.send('Target.createTarget', { url: `chrome-extension://${extId}/app/index.html` })).result.targetId;
  ctl = await attach(t, 'setup');
  await sleep(2000);
}
const bg = (message: Record<string, unknown>, ms = 60_000): Promise<any> => evalIn(ctl, `chrome.runtime.sendMessage(${JSON.stringify(message)}).catch((e) => ({ err: String(e) }))`, ms);

/** Exactly what the popup's button does (action/reading.ts): the page's script if it is not there, the grant, the start, then the status until the run ends. */
async function analyse(name: string, extra: Record<string, unknown> = {}): Promise<{ ms: number; injected: boolean; s: any }> {
  return evalIn(ctl, `(async () => {
    const t = (await chrome.tabs.query({})).find((x) => x.url === ${JSON.stringify(urlOf(name))});
    if (!t) return { s: { stage: 'no-tab' } };
    await chrome.tabs.update(t.id, { active: true });
    const send = (op, more = {}) => chrome.tabs.sendMessage(t.id, { type: 'golearn:reading-analysis', op, ...more }, { frameId: 0 }).catch(() => undefined);
    let injected = false;
    if (!(await send('status'))) { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); injected = true; }
    const g = await chrome.runtime.sendMessage({ type: 'golearn:reading-knowledge', op: 'grant', tabId: t.id });
    if (!g || !g.ok) return { s: { stage: 'no-grant', g } };
    const t0 = performance.now();
    let s = await send('start', ${JSON.stringify({ languageId: 'sq', ...extra })});
    while (s && ['extracting', 'resolving', 'verifying', 'calculating'].includes(s.stage)) { await new Promise((r) => setTimeout(r, 150)); s = await send('status'); }
    return { ms: Math.round(performance.now() - t0), injected, s };
  })()`, 900_000);
}
const statusOf = (name: string): Promise<any> => evalIn(ctl, `(async () => { const t = (await chrome.tabs.query({})).find((x) => x.url === ${JSON.stringify(urlOf(name))}); return chrome.tabs.sendMessage(t.id, { type: 'golearn:reading-analysis', op: 'status' }, { frameId: 0 }).catch((e) => ({ err: String(e) })); })()`);

/** A node inside the card's (closed) shadow root, found through the DevTools DOM and clicked. */
async function clickInCard(session: string, match: (attrs: Record<string, string>) => boolean): Promise<boolean> {
  const doc = await c.send('DOM.getDocument', { depth: -1, pierce: true }, session);
  let found: any;
  const walk = (n: any, inShadow: boolean): void => {
    if (found) return;
    if (inShadow && n.nodeType === 1) { const a: Record<string, string> = {}; for (let i = 0; i < (n.attributes ?? []).length; i += 2) a[n.attributes[i]] = n.attributes[i + 1]; if (match(a)) { found = n; return; } }
    for (const ch of n.children ?? []) walk(ch, inShadow);
    for (const sr of n.shadowRoots ?? []) walk(sr, true);
  };
  if (doc.result) walk(doc.result.root, false);
  if (!found) return false;
  const obj = await c.send('DOM.resolveNode', { nodeId: found.nodeId }, session);
  if (!obj.result?.object?.objectId) return false;
  await c.send('Runtime.callFunctionOn', { objectId: obj.result.object.objectId, functionDeclaration: 'function () { this.click(); }' }, session);
  return true;
}
/** The learner marks a word Known with GoLearn's own control: select it, open its card (the keyboard command's path), press Known. */
async function markKnownOnCard(name: string, session: string, elementId: string, word: string): Promise<{ selected: string; pressed: boolean }> {
  const selected = await evalIn(session, `(() => { const n = document.getElementById(${JSON.stringify(elementId)}).firstChild; const i = n.data.indexOf(${JSON.stringify(word)}); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + ${word.length}); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return sel.toString(); })()`);
  await evalIn(ctl, `(async () => { const t = (await chrome.tabs.query({})).find((x) => x.url === ${JSON.stringify(urlOf(name))}); await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); chrome.tabs.sendMessage(t.id, { type: 'golearn:lookup', trigger: 'command', focus: true }).catch(() => {}); return t.id; })()`, 30_000);
  let pressed = false;
  for (let i = 0; i < 60 && !pressed; i++) { await sleep(500); pressed = await clickInCard(session, (a) => (a.class ?? '').split(/\s+/).includes('rateBtn') && a['data-mark'] === 'known'); }
  await sleep(1500);
  return { selected, pressed };
}
const deviceRow = async (unitId: string): Promise<any> => ((await bg({ type: 'golearn:local-repo', op: 'knowledge', unitIds: [unitId], languageId: 'sq' })).knowledge ?? [])[0];
const deviceEventCount = async (): Promise<number> => (await bg({ type: 'golearn:local-repo', op: 'status' })).events;
const pct = (part: number, total: number): string => { const t = Math.floor((part * 2000 + total) / (2 * total)); return `${Math.floor(t / 10)}.${t % 10}%`; };

async function main(): Promise<void> {
  let healthy = false;
  for (let i = 0; i < 480 && !healthy; i++) { try { healthy = (await fetch(`http://127.0.0.1:${SVC}/health`)).ok; } catch { await sleep(500); } }
  if (!healthy) throw new Error('the throw-away service did not start');
  const version = await connect();
  await openControl();
  step('the built extension is loaded in a real browser', !!extId, { browser: version.Browser, build: build.id });

  const A = PAGES.article.main;
  const total = WORDS(A);
  const shkon = COUNT(A, 'shkon');
  // every form of the word libër in the text: "libër" in the paragraphs and "Libri" (the definite form) in the heading. Knowledge is of the word, so both count.
  const liber = COUNT(A, 'libër') + COUNT(A, 'Libri');
  // 20 x (10 + 6 + 8 words) + the 3 words of the heading; the navigation, banner, hidden mobile copy, English quotation, sidebar, form and footer are not in it
  step('the expected numbers, worked out from the page text here', total === 20 * 24 + 3 && shkon === 40 && liber === 41, { total, shkon, liber });

  // ── A. no account: this device's own record ──
  const article = await openPage('article');
  const a1 = await analyse('article');
  const r1 = a1.s?.result;
  step('A1 local-only: the whole main content is counted (offscreen included), nothing known yet, the device is the authority', a1.s?.stage === 'done' && r1.coverage.counts.total === total && r1.coverage.knownOccurrences === 0 && r1.snapshot.authority === 'device' && r1.snapshot.state === 'verified' && r1.scope.kind === 'main' && r1.scope.complete === true && r1.scope.foreignBlocks === 1 && r1.lookups.asked === r1.lookups.answered && r1.lookups.asked > 0,
    { ms: a1.ms, injected: a1.injected, stage: a1.s?.stage, error: a1.s?.error, counts: r1?.coverage.counts, scope: r1?.scope, snapshot: r1?.snapshot, lookups: r1?.lookups });
  const events0 = await deviceEventCount();
  step('A2 the analysis recorded nothing on the device', events0 === 0, { events: events0 });

  const m1 = await markKnownOnCard('article', article.session, 'q', 'shkon');
  const rowShkoj = await deviceRow('lemma:sq:shkoj:VERB');
  step('A3 the learner marks "shkon" Known on its card; the device projection has it', m1.pressed && rowShkoj?.level === 'known' && rowShkoj?.selfMark?.mark === 'known', { m1, level: rowShkoj?.level, selfMark: rowShkoj?.selfMark });
  const eventsAfterMark = await deviceEventCount();
  const a2 = await analyse('article');
  const r2 = a2.s?.result;
  step(`A4 analysed again: Known is exactly the ${shkon} occurrences of that word (${pct(shkon, total)}), the text was not read twice`, a2.s?.stage === 'done' && r2.coverage.knownOccurrences === shkon && r2.coverage.counts.total === total && r2.reusedText === true && Math.abs(r2.coverage.knownPercent - (shkon / total) * 100) < 1e-9,
    { ms: a2.ms, known: r2?.coverage.knownOccurrences, percent: r2?.coverage.knownPercent, expected: (shkon / total) * 100, reusedText: r2?.reusedText });
  step('A5 the second analysis recorded nothing either', (await deviceEventCount()) === eventsAfterMark, { before: eventsAfterMark, after: await deviceEventCount() });

  // ── B. signed in: the account is the authority ──
  const email = `reading-${crypto.randomUUID().slice(0, 8)}@example.test`, password = crypto.randomBytes(18).toString('base64url');
  const made = await evalIn(ctl, `chrome.runtime.sendMessage({ type: 'golearn:create-account', baseUrl: 'http://127.0.0.1:${PROXY}', email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }).then((r) => ({ ok: r?.ok, message: r?.message }), (e) => ({ err: String(e) }))`, 90_000);
  step('B1 a test account is created and signed in', made?.ok === true, made);
  // what GoLearn setup sends when the learner chooses a language while signed in: the account gets its Albanian enrolment
  const enrolled = await bg({ type: 'golearn:enrol', languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] }, 90_000);
  step('B1b the account is enrolled in Albanian (the message GoLearn setup sends)', enrolled?.ok === true, { ok: enrolled?.ok, message: enrolled?.message });
  const used = await bg({ type: 'golearn:use-language', languageId: 'sq' }, 90_000);
  step('B2 Albanian is the reading language on the device and the account', used?.ok === true, used);
  await bg({ type: 'golearn:local-repo', op: 'upload' }, 120_000); // what waited for an enrolment goes up now (the setup page's sync screen has this button)
  await sleep(6000); // the sync round runs

  // the second device: the same account, its own session (GoReview on a phone)
  const phone = createRepositoryApi({ baseUrl: `http://127.0.0.1:${SVC}`, fetch });
  const phoneDevice = `phone-${crypto.randomUUID().slice(0, 8)}`;
  const signedIn = await phone.createSession({ email, password, deviceId: phoneDevice, platform: 'test-phone' });
  if (!signedIn.ok) throw new Error(`the second device could not sign in: ${signedIn.error}`);
  const me = await phone.me();
  const enrolment = me.ok ? (me.data.enrolments ?? []).find((e) => e.languageId === 'sq' && !e.endedAt) : undefined;
  step('B3 the second device signs in to the same account and finds the Albanian enrolment', !!enrolment, { enrolments: me.ok ? (me.data.enrolments ?? []).map((e) => e.languageId) : me.error });

  let accountShkoj: any;
  for (let i = 0; i < 40; i++) { const k = await phone.knowledge(['lemma:sq:shkoj:VERB']); accountShkoj = k.ok ? k.data.knowledge[0] : undefined; if (accountShkoj?.level === 'known') break; await sleep(1000); }
  step('B4 the mark made on this device reached the account: the authoritative projection says Known', accountShkoj?.level === 'known', { level: accountShkoj?.level, selfMark: accountShkoj?.selfMark });

  const a3 = await analyse('article');
  const r3 = a3.s?.result;
  step('B5 signed in: the same figure, now checked against the account (device brought level, verified)', a3.s?.stage === 'done' && r3.coverage.knownOccurrences === shkon && r3.snapshot.authority === 'account' && r3.snapshot.state === 'verified',
    { ms: a3.ms, known: r3?.coverage.knownOccurrences, snapshot: r3?.snapshot });

  // ── C. another device changes the learner's knowledge ──
  const headBefore = await phone.listEvents({ afterSeq: 0, limit: 1 });
  const mark: GoEvent = {
    id: `phone:${crypto.randomUUID()}`, v: CONTRACT_VERSION, learnerId: signedIn.data.learnerId, enrolmentId: enrolment!.enrolmentId, languageId: 'sq', at: new Date().toISOString(),
    producer: { app: 'gopractice-review', version: '0.0.0', deviceId: phoneDevice }, kind: 'ItemMarked', subject: { itemIds: ['lemma:sq:libër:NOUN', 'form:sq:libër'] }, payload: { mark: 'known' }, dedupeKey: `phone:mark:${crypto.randomUUID()}`,
  } as GoEvent;
  const appended = await phone.appendEvents([mark]);
  step('C1 the second device marks "libër" Known on the account', appended.ok === true, appended.ok ? appended.data.outcomes : appended);
  const a4 = await analyse('article');
  const r4 = a4.s?.result;
  const deviceLiber = await deviceRow('lemma:sq:libër:NOUN');
  const accountLiber = await phone.knowledge(['lemma:sq:libër:NOUN', 'lemma:sq:shkoj:VERB']);
  step(`C2 the next analysis has it without signing out and in: Known is now ${shkon + liber} of ${total} (${pct(shkon + liber, total)}), verified, and the device row equals the account row`,
    a4.s?.stage === 'done' && r4.coverage.knownOccurrences === shkon + liber && r4.snapshot.state === 'verified' && deviceLiber?.level === 'known' && accountLiber.ok && accountLiber.data.knowledge.every((k) => k.level === 'known'),
    { ms: a4.ms, known: r4?.coverage.knownOccurrences, snapshot: r4?.snapshot, device: deviceLiber?.level, account: accountLiber.ok ? accountLiber.data.knowledge.map((k) => [k.unitId, k.level]) : accountLiber.error });
  const headAfter = await phone.listEvents({ afterSeq: 0, limit: 1 });
  step('C3 analysing appended nothing to the account: its head moved by the second device\'s one event only', headBefore.ok && headAfter.ok && headAfter.data.head === headBefore.data.head + 1, { before: headBefore.ok ? headBefore.data.head : undefined, after: headAfter.ok ? headAfter.data.head : undefined });

  // ── D. the service cannot be reached: an honest result, not a silent one ──
  mode = 'down';
  const a5 = await analyse('article');
  const r5 = a5.s?.result;
  step('D1 service down: the figure comes from the device and is marked not verified, with the reason and the last verified time', a5.s?.stage === 'done' && r5.snapshot.state === 'unverified' && ['unreachable', 'offline', 'incomplete'].includes(r5.snapshot.reason) && typeof r5.snapshot.lastVerifiedAt === 'number' && r5.coverage.knownOccurrences === shkon + liber,
    { ms: a5.ms, snapshot: r5?.snapshot, known: r5?.coverage.knownOccurrences });
  mode = 'hang';
  const a6 = await analyse('article');
  const r6 = a6.s?.result;
  step('D2 service hanging: the analysis does not hang with it; not verified, reason given', a6.s?.stage === 'done' && r6.snapshot.state === 'unverified' && a6.ms < 60_000, { ms: a6.ms, snapshot: r6?.snapshot });
  mode = 'ok';
  await sleep(1500);
  const a7 = await analyse('article');
  step('D3 service back: verified again, same figure', a7.s?.stage === 'done' && a7.s.result.snapshot.state === 'verified' && a7.s.result.coverage.knownOccurrences === shkon + liber, { ms: a7.ms, snapshot: a7.s?.result?.snapshot });

  // ── E. a reader that swaps its chapter in place ──
  const spa = await openPage('spa');
  const s1 = await analyse('spa');
  await evalIn(spa.session, 'window.swap()');
  await sleep(2500);
  const stale = await statusOf('spa');
  const s2 = await analyse('spa');
  step('E1 the text changed in place at the same address: the old figure is flagged stale, and a new analysis counts the new text', s1.s?.stage === 'done' && stale?.stale === true && s2.s?.stage === 'done' && s2.s.result.reusedText === false && s2.s.result.coverage.counts.total === WORDS('Kapitulli tjetër ' + SQ.join(' ')),
    { first: s1.s?.result?.coverage.counts.total, stale: stale?.stale, second: s2.s?.result?.coverage.counts.total, expected: WORDS('Kapitulli tjetër ' + SQ.join(' ')) });
  await c.send('Target.closeTarget', { targetId: spa.target });

  // ── F. a long text ──
  const B = PAGES.book.main;
  const bookTotal = WORDS(B);
  await openPage('book');
  await sleep(2000);
  const b1 = await analyse('book');
  const rb = b1.s?.result;
  step(`F1 a document of ${bookTotal.toLocaleString('en')} words is read whole and counted exactly`, b1.s?.stage === 'done' && rb.coverage.counts.total === bookTotal && rb.scope.complete === true && rb.coverage.knownOccurrences === COUNT(B, 'shkon') + COUNT(B, 'libër') + COUNT(B, 'Libri') && rb.lookups.asked === rb.lookups.answered,
    { ms: b1.ms, total: rb?.coverage.counts.total, expectedTotal: bookTotal, known: rb?.coverage.knownOccurrences, expectedKnown: COUNT(B, 'shkon') + COUNT(B, 'libër') + COUNT(B, 'Libri'), distinct: rb?.coverage.distinctWords, characters: rb?.scope.characters, error: b1.s?.error });
  const b2 = await analyse('book');
  step('F2 analysed again: the text is not read a second time', b2.s?.stage === 'done' && b2.s.result.reusedText === true && b2.s.result.coverage.counts.total === bookTotal, { firstMs: b1.ms, secondMs: b2.ms });

  // ── G. Greek needs the variety of the text ──
  await openPage('greek');
  const g1 = await analyse('greek', { languageId: 'el' });
  step('G1 a Greek page with no variety stated: the run stops and asks which, with nothing counted', g1.s?.stage === 'failed' && ['variety-required', 'unsupported-language'].includes(g1.s.error?.code), { stage: g1.s?.stage, error: g1.s?.error });

  // ── H. the popup page itself ──
  const popT = (await c.send('Target.createTarget', { url: `chrome-extension://${extId}/action/popup.html` })).result.targetId;
  const pop = await attach(popT, 'popup');
  await sleep(2500);
  const popup = await evalIn(pop, `({ name: document.getElementById('reading-name')?.textContent, button: document.getElementById('reading-run')?.textContent, buttons: [...document.querySelectorAll('#reading button')].length })`);
  step('H1 the popup carries the Reading Analysis part: its name and its one button', popup?.name === 'Reading Analysis' && popup?.button === 'Analyse this page' && popup?.buttons === 1, popup);
  await c.send('Target.closeTarget', { targetId: popT });

  // ── I. the browser is closed and started again on the same profile: a new worker, new page scripts, everything read back from disk ──
  // (chrome.runtime.reload() is not used: this headless browser does not bring a command-line extension back after it)
  browser.kill();
  await sleep(4000);
  browser = launch();
  await connect();
  await sleep(1500);
  const idBefore = extId;
  extId = '';
  await openControl();
  step('I0 the browser restarted with the same profile and the same extension', extId === idBefore, { before: idBefore, after: extId });
  await openPage('article');
  const reloaded = await analyse('article');
  const rr = reloaded.s?.result;
  step('I1 after the restart: the knowledge and the sign-in persisted, the page is read afresh, the figure is the same and verified', reloaded.s?.stage === 'done' && rr.coverage.knownOccurrences === shkon + liber && rr.coverage.counts.total === total && rr.snapshot.state === 'verified',
    { ms: reloaded.ms, injected: reloaded.injected, known: rr?.coverage.knownOccurrences, total: rr?.coverage.counts.total, snapshot: rr?.snapshot, error: reloaded.s?.error });
  const stamp = await bg({ type: 'golearn:status' });
  step('I2 the worker that answered is the build under test', stamp?.build?.id === build.id, { running: stamp?.build?.id, expected: build.id });

  const bad = consoleLog.filter((l) => /reading|Reading/.test(l.text));
  step('no error or exception from Reading Analysis in any console', bad.length === 0, bad.slice(0, 5));
}

try { await main(); } catch (e) { step('harness', false, String((e as Error)?.stack ?? e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'reading-report.json'), JSON.stringify(report, null, 2));
  web.close(); proxy.close(); browser.kill();
  if (service?.pid) spawn('taskkill', ['/pid', String(service.pid), '/T', '/F'], { stdio: 'ignore' });
  await sleep(1500);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the profile may still be held for a moment */ }
  const failed = report.steps.filter((s) => !s.ok).length;
  console.log(`${report.steps.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
