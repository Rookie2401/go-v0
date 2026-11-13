// What happens to a page's GoLearn after the extension reloads (an update, or the learner pressing reload): is the old content
// script's isolated world reused by the next injection, and does a lookup then work? Throw-away headless Brave profile.
//   node reload.mjs <dist>
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
const TMP = process.env.LOADCHECK_TMP ?? path.join(os.tmpdir(), 'loadcheck-golearn-reload');
const BRAVE = need('LOADCHECK_BRAVE', 'path of brave.exe (the Brave Browser application binary)');
const PORT = 9345, WEB = 8775;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(TMP, { recursive: true, force: true });
const EXT = path.join(TMP, 'ext');
fs.mkdirSync(EXT, { recursive: true });
for (const e of fs.readdirSync(DIST, { withFileTypes: true })) {
  if (e.name === 'translation.local.json') continue;
  if (e.isDirectory()) fs.symlinkSync(path.join(DIST, e.name), path.join(EXT, e.name), 'junction');
  else fs.copyFileSync(path.join(DIST, e.name), path.join(EXT, e.name));
}
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://127.0.0.1/*'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(manifest));
const server = createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="sq"><body><p id="p">Unë lexoj librin në shtëpi.</p></body></html>'); }).listen(WEB, '127.0.0.1');
const browser = spawn(BRAVE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'profile').replace(/\//g, '\\')}`,
  `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', 'about:blank'], { stdio: 'ignore' });

let seq = 0;
class Conn {
  constructor(url) { this.ws = new WebSocket(url); this.wait = new Map(); this.ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); } }; }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId) { const id = ++seq; return new Promise((res) => { this.wait.set(id, res); this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); res({ error: { message: 'timeout ' + method } }); } }, 30000); }); }
}
let c;
const targets = async () => (await c.send('Target.getTargets')).result.targetInfos;
const attach = async (targetId) => (await c.send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
const evalIn = async (s, expression, contextId) => { const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) }, s); if (r.error) return { error: r.error.message }; if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }; return r.result?.result?.value; };
async function shadowText(s) {
  const doc = await c.send('DOM.getDocument', { depth: -1, pierce: true }, s);
  const out = [];
  const walk = (n, inShadow) => { if (inShadow && n.nodeType === 3 && n.nodeValue?.trim()) out.push(n.nodeValue.trim()); for (const ch of n.children ?? []) walk(ch, inShadow); for (const sr of n.shadowRoots ?? []) walk(sr, true); };
  if (doc.result) walk(doc.result.root, false);
  return out.join(' | ');
}
const findSw = async () => { for (let i = 0; i < 60; i++) { const sw = (await targets()).find((t) => t.type === 'service_worker' && t.url.includes('background.js')); if (sw) return sw; await sleep(250); } return undefined; };

try {
  let version; for (let i = 0; i < 40 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(500); } }
  c = new Conn(version.webSocketDebuggerUrl); await c.open();
  let sw = await findSw(); const id = new URL(sw.url).host;
  let swS = await attach(sw.targetId);
  const pageT = (await c.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/` })).result.targetId;
  const pS = await attach(pageT);
  const contexts = [];
  c.ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.sessionId === pS && d.method === 'Runtime.executionContextCreated') contexts.push(d.params.context); });
  await c.send('Runtime.enable', {}, pS); await c.send('DOM.enable', {}, pS);
  await sleep(800);
  const select = () => evalIn(pS, `(() => { const n = document.getElementById('p').firstChild; const i = n.data.indexOf('librin'); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 6); getSelection().removeAllRanges(); getSelection().addRange(r); return 1; })()`);
  const lookupFromWorker = (s) => evalIn(s, `(async () => { const [t] = await chrome.tabs.query({ url: 'http://127.0.0.1:${WEB}/*' }); await chrome.tabs.update(t.id, { active: true }); try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); } catch (e) { return 'inject: ' + e; } await new Promise((r) => setTimeout(r, 300)); return await chrome.tabs.sendMessage(t.id, { type: 'golearn:lookup', trigger: 'command', focus: true }).then((r) => JSON.stringify(r), (e) => 'send: ' + e); })()`);
  await select();
  console.log('1st lookup:', await lookupFromWorker(swS));
  await sleep(2500);
  console.log('card:', (await shadowText(pS)).slice(0, 120));
  const iso = contexts.filter((x) => x.origin?.startsWith('chrome-extension://') || x.auxData?.type === 'isolated');
  console.log('isolated worlds after 1st injection:', iso.map((x) => `${x.id}:${x.name}:${x.auxData?.type}`).join(', '));

  // reload the extension
  await evalIn(swS, 'chrome.runtime.reload()');
  await sleep(5000);
  sw = await findSw();
  console.log('worker after reload:', sw ? sw.url : 'none', 'same id:', sw ? new URL(sw.url).host === id : false);
  if (!sw) {
    // try waking it through an extension page
    const t = (await c.send('Target.createTarget', { url: `chrome-extension://${id}/action/popup.html` })).result.targetId;
    await sleep(2000); sw = await findSw();
    console.log('worker after opening a page:', sw ? sw.url : 'none', (await targets()).map((x) => x.type + ' ' + x.url.slice(0, 60)).join(' || '));
  }
  if (sw) {
    swS = await attach(sw.targetId);
    await c.send('Runtime.evaluate', { expression: 'document.querySelectorAll("[data-golearn-host]").forEach((h) => h.remove())' }, pS);
    await select();
    console.log('2nd lookup (after reload):', await lookupFromWorker(swS));
    await sleep(2500);
    console.log('card:', (await shadowText(pS)).slice(0, 120) || '(none)');
    const iso2 = contexts.filter((x) => x.origin?.startsWith('chrome-extension://') || x.auxData?.type === 'isolated');
    console.log('isolated worlds now:', iso2.map((x) => `${x.id}:${x.name}:${x.auxData?.type}`).join(', '));
    for (const x of iso2) console.log('  world', x.id, 'marker:', JSON.stringify(await evalIn(pS, `(() => { const m = globalThis.__goLearnExtension; let alive; try { alive = !!chrome.runtime?.id; } catch (e) { alive = 'throws ' + e; } return { marker: !!m, runtimeId: alive }; })()`, x.id)));
  }
} catch (e) { console.log('FAILED', e?.stack ?? e); }
finally { server.close(); browser.kill(); await sleep(1000); process.exit(0); }
