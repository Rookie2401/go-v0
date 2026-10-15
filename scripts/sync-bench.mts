/**
 * Sync benchmark: measures what the GoLearn extension, the Repository service and the GoReview phone app cost each other,
 * against a running service. Reproduces the numbers in docs/ecosystem/SYNC.md.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/sync-bench.mts -- --account <file.json> [--base http://127.0.0.1:8790] [--events 300] [--distinct 97] [--no-gzip] [--bootstrap] [--legacy-client] [--link 150:5]
 *
 * `--account` is a JSON file { "email": "...", "password": "..." } (the password is never printed). `--bootstrap` creates that account and one
 * enrolment first (for a fresh, empty test service only). `--distinct` is how many different words the events name (the size of the vocabulary). The script signs in as two devices
 * ("desktop" and "phone", fresh device ids), pushes `--events` synthetic reading events from the desktop, and measures:
 *   1. push latency and bytes per 200-event batch (what the extension sends);
 *   2. a cold pull of the whole history at page sizes 200 (extension), 500 (sync-client default) and 1000 (server cap);
 *   3. an incremental pull at the head (the steady-state call: events 0, but how many bytes?);
 *   4. desktop push -> phone wake: the phone holds POST /sync/wait; the desktop pushes one event; time until the wait answers, until
 *      the phone's pull has the event;
 *   5. a GoReview cold start as the app makes it (sign-in, /me, /enrolments, /sync/status, catch-up pull, candidates, knowledge, vocabulary),
 *      request by request, serial as the app does it, and the same reads issued in parallel where they are independent;
 *   6. conditional reads: a repeat of /candidates and /vocabulary with If-None-Match (a 304 when the service supports it).
 * `--legacy-client` makes the app's cold start behave as it did before the sync work (pull pages of 500, documents requested, knowledge batches one by one).
 * `--link <rttMs>:<mbps>` simulates a phone's connection (each request waits one round trip, and the bytes of every response share one link of that speed),
 * so the elapsed times in the report are what a phone on, say, `--link 150:5` would see; without it the numbers are the local machine's, where bytes cost nothing.
 * Bytes are wire bytes (after gzip when the server compresses, which it does when the request says Accept-Encoding: gzip).
 * The events are real, immutable and stay in the account: use a test account.
 */
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { createRepositoryApi } from '../packages/repository-service/src/api';
import { albanianPack } from '../packages/repository-linguistics/src';
import { parseSelection } from '../packages/golearn-extension/src/parser';
import { buildSelectionEvent } from '../packages/golearn-extension/src/store';
import type { GoEvent } from '../packages/repository-contract/src';

interface Args { base: string; account: string; events: number; gzip: boolean; bootstrap: boolean; distinct: number; legacyClient: boolean; link?: { rttMs: number; mbps: number } }
function parseArgs(argv: readonly string[]): Args {
  const a: Args = { base: 'http://127.0.0.1:8790', account: '', events: 300, gzip: true, bootstrap: false, distinct: 97, legacyClient: false };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--base') a.base = argv[++i];
    else if (f === '--account') a.account = argv[++i];
    else if (f === '--events') a.events = Number(argv[++i]);
    else if (f === '--no-gzip') a.gzip = false;
    else if (f === '--bootstrap') a.bootstrap = true;
    else if (f === '--legacy-client') a.legacyClient = true;
    else if (f === '--link') { const [rtt, mbps] = argv[++i].split(':').map(Number); a.link = { rttMs: rtt, mbps }; }
    else if (f === '--distinct') a.distinct = Number(argv[++i]);
    else if (f === '--') continue;
    else throw new Error(`unknown argument ${f}`);
  }
  if (!a.account) throw new Error('--account <file.json> is required');
  return a;
}
const args = parseArgs(process.argv.slice(2));
const account = JSON.parse(readFileSync(args.account, 'utf8')) as { email: string; password: string };

// ── a fetch that counts wire bytes ──
interface Tally { requests: number; wireDown: number; wireUp: number; decodedDown: number; ms: number }
const newTally = (): Tally => ({ requests: 0, wireDown: 0, wireUp: 0, decodedDown: 0, ms: 0 });
let tally = newTally();
let linkFreeAt = 0;
const log: string[] = [];
const take = (): Tally => { const t = tally; tally = newTally(); return t; };

const countingFetch = ((input: string | URL | Request, init: RequestInit = {}): Promise<Response> => new Promise((resolve, reject) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const body = init.body === undefined ? undefined : String(init.body);
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (args.gzip) headers['Accept-Encoding'] = 'gzip';
  if (body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(body));
  const t0 = performance.now();
  const lib = url.protocol === 'https:' ? https : http;
  const req = lib.request(url, { method: init.method ?? 'GET', headers }, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => {
      const wire = Buffer.concat(chunks);
      const decoded = res.headers['content-encoding'] === 'gzip' ? gunzipSync(wire) : wire;
      const finish = (): void => {
      const ms = performance.now() - t0;
      tally.requests += 1; tally.wireDown += wire.length; tally.decodedDown += decoded.length; tally.wireUp += body ? Buffer.byteLength(body) : 0; tally.ms += ms;
      log.push(`${init.method ?? 'GET'} ${url.pathname}${url.search ? '?…' : ''} ${res.statusCode} ${ms.toFixed(0)}ms ${wire.length}B${wire.length !== decoded.length ? ` (${decoded.length}B decoded)` : ''}`);
      const hdrs = new Headers();
      for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) hdrs.set(k, Array.isArray(v) ? v.join(', ') : v);
      const status = res.statusCode ?? 0;
      resolve(new Response(status === 204 || status === 304 ? null : new Uint8Array(decoded), { status, headers: hdrs }));
      };
      if (!args.link) { finish(); return; }
      // a simulated link: the response's bytes take their turn on one shared line, and the request pays one round trip
      const transfer = ((wire.length + (body ? Buffer.byteLength(body) : 0) + 400) * 8) / (args.link.mbps * 1000);
      linkFreeAt = Math.max(performance.now(), linkFreeAt) + transfer;
      setTimeout(finish, Math.max(0, linkFreeAt + args.link.rttMs - performance.now()));
    });
  });
  req.on('error', reject);
  if (body !== undefined) req.write(body);
  req.end();
})) as typeof fetch;

const fmt = (t: Tally): string => `${t.requests} req, ${(t.wireDown / 1024).toFixed(1)} KB down${t.wireDown !== t.decodedDown ? ` (${(t.decodedDown / 1024).toFixed(1)} KB decoded)` : ''}, ${(t.wireUp / 1024).toFixed(1)} KB up, ${t.ms.toFixed(0)} ms in requests`;
const rows: Array<[string, string]> = [];
const report = (label: string, text: string): void => { rows.push([label, text]); console.log(`${label.padEnd(46)} ${text}`); };
const must = <T,>(r: { ok: true; data: T } | { ok: false; status: number; error: string; message: string }, what: string): T => { if (!r.ok) throw new Error(`${what}: ${r.status} ${r.error} ${r.message}`); return r.data; };

async function signIn(deviceId: string) {
  const anon = createRepositoryApi({ baseUrl: args.base, fetch: countingFetch });
  const s = must(await anon.createSession({ email: account.email, password: account.password, deviceId, platform: 'bench' }), 'sign-in');
  return { api: createRepositoryApi({ baseUrl: args.base, fetch: countingFetch, token: s.token }), learnerId: s.learnerId, token: s.token, deviceId };
}

async function bootstrap(): Promise<void> {
  const anon = createRepositoryApi({ baseUrl: args.base, fetch: countingFetch });
  const made = await anon.createAccount({ email: account.email, password: account.password });
  if (!made.ok && made.status !== 409) throw new Error(`create account: ${made.status} ${made.error} ${made.message}`);
  const s = must(await anon.createSession({ email: account.email, password: account.password, deviceId: 'bench-bootstrap', platform: 'bench' }), 'sign-in');
  const api = createRepositoryApi({ baseUrl: args.base, fetch: countingFetch, token: s.token });
  if (must(await api.listEnrolments(), 'enrolments').enrolments.length) return;
  const pack = albanianPack();
  must(await api.enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] }), 'enrol');
}

async function main(): Promise<void> {
  if (args.bootstrap) await bootstrap();
  const stamp = Date.now().toString(36);
  const desktop = await signIn(`bench-desktop-${stamp}`);
  const phone = await signIn(`bench-phone-${stamp}`);
  take();
  const enrolment = must(await desktop.api.listEnrolments(), 'enrolments').enrolments.find((e) => !e.endedAt);
  if (!enrolment) throw new Error('the account has no open enrolment');
  const identity = { learnerId: desktop.learnerId, enrolmentId: enrolment.enrolmentId, deviceId: desktop.deviceId };
  console.log(`service ${args.base} · gzip ${args.gzip ? 'requested' : 'not requested'} · language ${enrolment.languageId} · enrolment ${enrolment.enrolmentId.slice(0, 8)}…\n`);

  const makeEvent = (i: number, tag: string): GoEvent => {
    const sentence = `The bench sentence ${tag} number ${i} reads quietly.`;
    const word = `benchword${i % args.distinct}`;
    const at = sentence.length;
    const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence: `${sentence} ${word}`, selStart: at + 1, selEnd: at + 1 + word.length } });
    const ev = buildSelectionEvent({ card, readerId: 'web-generic', identity, version: 'bench', sessionId: `bench-${tag}-${i}`, now: new Date(Date.now() - Math.max(0, args.events - i) * 1000) });
    return { ...ev, id: `bench:${tag}:${i}:${ev.id}`, dedupeKey: `bench:${tag}:${i}` };
  };

  // 1. push
  const events = Array.from({ length: args.events }, (_, i) => makeEvent(i, stamp));
  const batches: Array<{ n: number; ms: number; bytes: number }> = [];
  for (let i = 0; i < events.length; i += 200) {
    const batch = events.slice(i, i + 200);
    const t0 = performance.now();
    const r = must(await desktop.api.syncPush({ deviceId: desktop.deviceId, events: batch, documents: [], clientTime: new Date().toISOString() }), 'push');
    batches.push({ n: batch.length, ms: performance.now() - t0, bytes: JSON.stringify(batch).length });
    if (r.outcomes.some((o) => !o.stored && !o.duplicateOf)) throw new Error('the service refused a bench event: ' + JSON.stringify(r.outcomes.find((o) => !o.stored && !o.duplicateOf)));
  }
  report('push, per 200-event batch', batches.map((b) => `${b.n} ev ${b.ms.toFixed(0)} ms (${(b.bytes / 1024).toFixed(0)} KB)`).join(' · '));
  report('push, one event (desktop debounce round)', await (async () => {
    const t0 = performance.now();
    must(await desktop.api.syncPush({ deviceId: desktop.deviceId, events: [makeEvent(9000, `${stamp}solo`)], documents: [], clientTime: new Date().toISOString() }), 'push');
    return `${(performance.now() - t0).toFixed(0)} ms`;
  })());
  take();

  // 2. cold pull of the whole history at three page sizes
  const head = must(await phone.api.syncPull({ deviceId: phone.deviceId, afterSeq: 0, limit: 1 }), 'head').head;
  for (const limit of [200, 500, 1000]) {
    take();
    let after = 0; let pages = 0; let got = 0; const t0 = performance.now();
    for (;;) {
      const r = must(await phone.api.syncPull({ deviceId: phone.deviceId, afterSeq: after, limit }), 'pull');
      pages += 1; got += r.events.length;
      if (!r.events.length) break;
      after = r.events[r.events.length - 1].seq;
      if (after >= r.head) break;
    }
    report(`cold pull of ${head} events, page ${limit}`, `${pages} pages, ${got} events, ${(performance.now() - t0).toFixed(0)} ms · ${fmt(take())}`);
  }

  // 3. incremental pull at the head
  {
    take();
    const t0 = performance.now();
    const r = must(await phone.api.syncPull({ deviceId: phone.deviceId, afterSeq: head, limit: 200 }), 'pull');
    report('incremental pull at head (nothing new)', `${r.events.length} events, ${r.documents.length} documents returned, ${(performance.now() - t0).toFixed(0)} ms · ${fmt(take())}`);
    const t1 = performance.now();
    const r2 = must(await phone.api.syncPull({ deviceId: phone.deviceId, afterSeq: head, limit: 200, documentsSince: new Date().toISOString() }), 'pull');
    report('  same with documentsSince = now', `${r2.documents.length} documents, ${(performance.now() - t1).toFixed(0)} ms · ${fmt(take())}`);
  }

  // 4. desktop push -> phone wake
  {
    take();
    const st = await (async () => { const raw = await countingFetch(`${args.base}/sync/status`, { headers: { Authorization: `Bearer ${phone.token}` } }); return (await raw.json()) as { cursor: string }; })();
    const waitBody = JSON.stringify({ learnerId: phone.learnerId, since: st.cursor, timeoutMs: 20_000 });
    const t0 = performance.now();
    const waiting = countingFetch(`${args.base}/sync/wait`, { method: 'POST', headers: { Authorization: `Bearer ${phone.token}`, 'Content-Type': 'application/json' }, body: waitBody })
      .then(async (r) => ({ at: performance.now(), body: (await r.json()) as { changed: boolean } }));
    await new Promise((r) => setTimeout(r, 300)); // the phone is already holding the request
    const pushAt = performance.now();
    must(await desktop.api.syncPush({ deviceId: desktop.deviceId, events: [makeEvent(9001, `${stamp}wake`)], documents: [], clientTime: new Date().toISOString() }), 'push');
    const pushDone = performance.now();
    const woke = await waiting;
    const pull = must(await phone.api.syncPull({ deviceId: phone.deviceId, afterSeq: Number(st.cursor), limit: 200 }), 'pull');
    const pulled = performance.now();
    report('desktop push -> phone wake (held /sync/wait)', `push ${(pushDone - pushAt).toFixed(0)} ms · wait answered ${(woke.at - pushAt).toFixed(0)} ms after the push began · phone has the event ${(pulled - pushAt).toFixed(0)} ms (changed=${woke.body.changed}, ${pull.events.length} event)`);
    void t0;
    take();
  }

  // 5. GoReview cold start, the requests loadReviewModel and the shell make
  {
    const startSerial = async (): Promise<void> => {
      const s = await signIn(`bench-app-${stamp}-${Math.random().toString(36).slice(2, 6)}`);
      const api = s.api;
      must(await api.me(), 'me');
      const enr = must(await api.listEnrolments(), 'enrolments').enrolments.find((e) => !e.endedAt)!;
      await countingFetch(`${args.base}/sync/status`, { headers: { Authorization: `Bearer ${s.token}` } });
      let after = 0;
      for (let g = 0; g < 100; g++) { const r = must(await api.syncPull({ deviceId: s.deviceId, afterSeq: after, limit: args.legacyClient ? 500 : 1000, ...(args.legacyClient ? {} : { documents: false }) }), 'pull'); if (!r.events.length) break; after = r.events[r.events.length - 1].seq; if (after >= r.head) break; }
      let cursor: string | undefined; const ids: string[] = [];
      do { const c = must(await api.candidates(enr.enrolmentId, 200, cursor), 'candidates'); ids.push(...c.candidates.map((x) => x.unitId)); cursor = c.nextCursor; } while (cursor);
      const batches: string[][] = [];
      for (let o = 0; o < ids.length; o += 200) batches.push(ids.slice(o, o + 200));
      if (args.legacyClient) for (const b of batches) must(await api.knowledge(b), 'knowledge');
      else await Promise.all(batches.map(async (b) => must(await api.knowledge(b), 'knowledge')));
      must(await api.vocabulary({ languageId: enr.languageId, limit: 50 }), 'vocabulary');
    };
    take();
    const t0 = performance.now();
    await startSerial();
    const ms = performance.now() - t0;
    const t = take();
    report('GoReview cold start (fresh install, serial)', `${(ms).toFixed(0)} ms wall · ${fmt(t)}`);
    const byPath = new Map<string, number>();
    for (const l of log.slice(-t.requests)) { const k = l.split(' ').slice(0, 2).join(' '); byPath.set(k, (byPath.get(k) ?? 0) + 1); }
    report('  requests by route', [...byPath].map(([k, n]) => `${k}×${n}`).join(' · '));
  }

  // 6. conditional reads
  {
    const auth = { Authorization: `Bearer ${phone.token}` };
    const enr = enrolment.enrolmentId;
    for (const [label, path] of [['/candidates', `/candidates?enrolmentId=${encodeURIComponent(enr)}&limit=200`], ['/vocabulary', `/vocabulary?languageId=${enrolment.languageId}&limit=50`]] as const) {
      take();
      const t0 = performance.now();
      const first = await countingFetch(`${args.base}${path}`, { headers: auth });
      const etag = first.headers.get('etag');
      await first.arrayBuffer();
      const firstMs = performance.now() - t0;
      const a = take();
      const t1 = performance.now();
      const second = await countingFetch(`${args.base}${path}`, { headers: etag ? { ...auth, 'If-None-Match': etag } : auth });
      await second.arrayBuffer();
      const secondMs = performance.now() - t1;
      const b = take();
      report(`GET ${label}`, `first ${firstMs.toFixed(0)} ms ${(a.wireDown / 1024).toFixed(1)} KB · repeat ${etag ? 'with If-None-Match' : '(no ETag offered)'}: ${second.status} ${secondMs.toFixed(0)} ms ${(b.wireDown / 1024).toFixed(1)} KB`);
    }
  }
  console.log('\nrequest log of the last cold start:\n' + log.slice(-40).join('\n'));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
