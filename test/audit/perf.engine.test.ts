// @vitest-environment node
/**
 * PERFORMANCE audit, lane 1 of 3 (docs/ecosystem/audit/PERFORMANCE.md): the pure engines, no network.
 *   PF-M01..M06   pack runtime (dictionary shards), selection parse
 *   PF-M20..M31   projection fold (1k, 10k), memory 20-25 and SQLite 26-31
 *   PF-M60..M62   GoListen start-up with a recorded clip and a device voice (fakes for the browser ports)
 *   PF-M40..M41   GoTell `analyzeDraft`
 *   PF-M50        built artefact sizes
 * Bounds asserted are LOOSE sanity limits; the figures are written to the console (and PERF_ROWS_DIR) for the report.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createMemoryStore, openSqliteStore } from '../../packages/repository-store/src';
import { createProjectionEngine, foldObservations, observationsFromEvents, MODEL_VERSION } from '../../packages/repository-engine/src';
import type { GoEvent, RepositoryStore } from '../../packages/repository-contract/src';
import { CONTRACT_VERSION } from '../../packages/repository-contract/src';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { createPackRuntime, packFor } from '../../packages/language-packs/src';
import { buildWriterProfile, createAnalyzer } from '../../packages/gotell/src';
import { createGoListen, demoGermanRegistry, deviceRegistry } from '../../packages/golisten/src';
import type { AudioClip, AudioPort, SpeechLike, SpeechUtteranceLike, SpeechVoiceLike } from '../../packages/golisten/src';
import {
  ALBANIAN_10, ALBANIAN_2, MIGRATIONS, PHRASE_4, REPO, SENTENCE, SENTENCE_40, WORD, fileFetch, flushRowsAfterAll, now, once, record, recordValue, sample,
} from './perf.support';

flushRowsAfterAll('perf.engine', 'PERFORMANCE lane 1 (engines)');

const manifest = packFor('sq')!;
const ctxOf = (sentence: string, surface: string) => { const at = sentence.indexOf(surface); return { kind: 'sentence' as const, confidence: 0.9, sentence, selStart: at, selEnd: at + surface.length }; };

describe('pack runtime and selection parse', () => {
  it('PF-M01..M03: a fresh runtime reads its dictionary from disk (manifest + shard) on the first gloss', async () => {
    // the module (adapter) is already loaded by the import above; what is cold here is the runtime's shard cache
    const lemmas = ['libër', 'shtëpi', 'nënë', 'kuzhinë', 'çaj', 'bukë', 'shkollë', 'qytet', 'mik', 'rrugë', 'ditë', 'mëngjes'];
    const creation = await sample(50, () => createPackRuntime(manifest, { fetch: fileFetch, baseUrl: 'http://assets.local/' }), 3);
    record('PF-M01', 'createPackRuntime (sq)', 'construct only, no I/O', creation);

    const first: number[] = [];
    const second: number[] = [];
    for (let i = 0; i < 20; i++) {
      const rt = createPackRuntime(manifest, { fetch: fileFetch, baseUrl: 'http://assets.local/' });
      first.push(await once(() => rt.gloss(lemmas[i % lemmas.length], 'NOUN')));
      second.push(await once(() => rt.gloss(lemmas[(i + 5) % lemmas.length], 'NOUN')));
    }
    record('PF-M02', 'first gloss on a fresh runtime (cold shard cache)', 'manifest.json + one shard read from disk, parsed, entry found', first, 'disk-backed fetch, not a network');
    record('PF-M03', 'a second gloss on the same runtime (another lemma)', 'shard cache warm for the manifest, other shard cold or warm', second);
    expect(stats0(first)).toBeLessThan(2000);
  });

  it('PF-M04..M06: parseSelection for one word, a 4-word phrase and a 40-word sentence (warm)', () => {
    const word = timeSync(50, () => parseSelection({ surface: WORD, context: ctxOf(SENTENCE, WORD) }), 10);
    const phrase = timeSync(50, () => parseSelection({ surface: PHRASE_4, context: ctxOf(SENTENCE, PHRASE_4) }), 10);
    expect(SENTENCE_40.split(/\s+/u)).toHaveLength(40);
    const long = timeSync(50, () => parseSelection({ surface: SENTENCE_40, context: { kind: 'sentence', confidence: 0.9, sentence: SENTENCE_40, selStart: 0, selEnd: SENTENCE_40.length } }), 10);
    record('PF-M04', 'parseSelection "librin" (1 word, sentence context)', 'adapter tokenize + analyze + card model, warm, N=50', word);
    record('PF-M05', 'parseSelection 4-word phrase', 'same, 4 words selected', phrase);
    record('PF-M06', 'parseSelection 40-word sentence', 'same, 40 words selected and as the context', long);
    expect(stats0(word)).toBeLessThan(500);
    expect(stats0(long)).toBeLessThan(5000);
    const card = parseSelection({ surface: WORD, context: ctxOf(SENTENCE, WORD) });
    expect(card.lemma).toBeTruthy();
  });
});

// ───────────────────────────── projection ─────────────────────────────

const LEARNER = 'perf-learner';
const ENROL = 'perf-enrol-sq';
let freq: string[] | undefined;
function lemmaIds(count: number): string[] {
  if (!freq) {
    const f = JSON.parse(fs.readFileSync(path.join(REPO, 'public/dict/sq/frequency.json'), 'utf8')) as { lemmas: Array<[string, number]> };
    freq = f.lemmas.map(([l]) => l).filter((l) => l.length > 2 && /^[\p{L}]+$/u.test(l)).slice(0, 400);
  }
  return freq.slice(0, count).map((l) => `lemma:sq:${l}:NOUN`);
}

let seqNo = 0;
function mixedEvents(count: number, units: string[]): GoEvent[] {
  const base = Date.UTC(2026, 8, 1, 8, 0, 0);
  const out: GoEvent[] = [];
  for (let i = 0; i < count; i++) {
    seqNo++;
    const unit = units[(i * 7) % units.length];
    const common = {
      id: `pj-${seqNo}`, v: CONTRACT_VERSION, learnerId: LEARNER, enrolmentId: ENROL, languageId: 'sq', at: new Date(base + i * 45_000).toISOString(),
    };
    if (i % 5 < 3) {
      out.push({ ...common, producer: { app: 'golearn-ext', version: 'perf', deviceId: 'dev-A' }, kind: 'SelectionLookedUp', subject: { itemIds: [unit], sentenceKey: `k${i % 211}` },
        payload: { surface: unit.split(':')[2], tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'web-generic', helpShown: ['lemma'] } });
    } else {
      const ok = i % 3 !== 0;
      out.push({ ...common, producer: { app: 'gopractice-review', version: 'perf', deviceId: 'dev-A' }, kind: 'CardReviewed', subject: { itemIds: [unit], cardId: `card:${unit}` },
        payload: { cardKind: i % 2 ? 'recognition' : 'recall', grade: ok ? 'good' : 'again', correct: ok, hinted: false } });
    }
  }
  return out;
}

async function seed(kind: 'memory' | 'sqlite', count: number): Promise<{ store: RepositoryStore; engine: ReturnType<typeof createProjectionEngine>; events: GoEvent[] }> {
  const clock = (): string => '2026-10-09T12:00:00.000Z';
  const store: RepositoryStore = kind === 'memory' ? createMemoryStore({ now: clock }) : openSqliteStore(':memory:', { now: clock, migrationsDir: MIGRATIONS });
  await store.putLearner({ learnerId: LEARNER, createdAt: '2026-01-01T00:00:00.000Z' });
  await store.putEnrolment({ enrolmentId: ENROL, learnerId: LEARNER, languageId: 'sq', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading' }], startedAt: '2026-01-01T00:00:00.000Z' });
  const events = mixedEvents(count, lemmaIds(300));
  for (let i = 0; i < events.length; i += 500) {
    const outcomes = await store.append(LEARNER, events.slice(i, i + 500));
    if (outcomes.some((o) => !o.stored)) throw new Error(`seed refused: ${JSON.stringify(outcomes.find((o) => !o.stored))}`);
  }
  return { store, engine: createProjectionEngine({ store, now: clock }), events };
}

describe.each([['memory'], ['sqlite']] as const)('projection fold on the %s store (projection@2)', (kind) => {
  it.each([[1000, 7], [10000, 5]] as const)('PF-M2x: %i events, full rebuild + pure fold + one-event increment', async (count, runs) => {
    expect(MODEL_VERSION).toBe('projection@4');
    const { store, engine } = await seed(kind, count);
    const tag = `${kind} ${count >= 1000 ? `${count / 1000}k` : count}`;
    const idBase = kind === 'memory' ? 20 : 26;
    const slot = count === 1000 ? 0 : 1;

    // full rebuild: read every event, resolve aliases, fold, write rows + cursor
    const rebuild = await sample(runs, () => engine.rebuild(LEARNER), 1);
    record(`PF-M${idBase + slot}`, `projection rebuild, ${tag} events`, 'engine.rebuild: read log + fold + write rows', rebuild);

    // the pure fold alone (no store I/O)
    const stored = [] as Awaited<ReturnType<typeof store.list>>;
    for (let after = 0; ;) { const page = await store.list({ learnerId: LEARNER, afterSeq: after, limit: 500 }); if (!page.length) break; stored.push(...page); after = page[page.length - 1].seq; }
    expect(stored.length).toBe(count);
    const fold = await sample(runs, () => foldObservations(observationsFromEvents(stored, []), MODEL_VERSION), 1);
    record(`PF-M${idBase + 2 + slot}`, `pure fold of ${tag} events`, 'observationsFromEvents + foldObservations, events already in memory', fold);

    // the incremental step: ONE new event appended, then engine.project (cursor behind by 1)
    const inc: number[] = [];
    const units = lemmaIds(300);
    for (let i = 0; i < 20; i++) {
      const [e] = mixedEvents(1, [units[i % units.length]]);
      e.at = new Date(Date.UTC(2026, 9, 9, 9, 0, 0) + i * 1000).toISOString();
      await store.append(LEARNER, [e]);
      inc.push(await once(() => engine.project(LEARNER)));
    }
    record(`PF-M${idBase + 4 + slot}`, `incremental project of 1 new event on a ${tag} log`, 'engine.project after one append (re-reads the log once: O(N), see engine.ts)', inc);

    const rows = await engine.knowledge(LEARNER);
    expect(rows.length).toBeGreaterThan(100);
    expect(stats0(rebuild)).toBeLessThan(count === 1000 ? 5000 : 30000);
    await store.close();
  }, 120_000);
});

// ───────────────────────────── GoListen start-up ─────────────────────────────

function fakeAudioPort(): AudioPort & { plays: number; lastPlayAt: number } {
  const port = {
    plays: 0, lastPlayAt: 0,
    open(): AudioClip {
      return { play: () => { port.plays++; port.lastPlayAt = now(); return Promise.resolve(); }, pause() {}, stop() {}, setRate() {}, onEnded() {}, onError() {}, durationMs: () => 900, release() {} };
    },
  };
  return port;
}
const voice = (name: string, lang: string): SpeechVoiceLike => ({ name, lang, voiceURI: name, localService: true });
function fakeSpeech(voices: SpeechVoiceLike[]): SpeechLike & { spokenAt: number; spoken: number } {
  const s = {
    spokenAt: 0, spoken: 0, getVoices: () => voices, speak(_u: SpeechSynthesisUtterance | SpeechUtteranceLike) { s.spoken++; s.spokenAt = now(); }, cancel() {}, pause() {}, resume() {},
  };
  return s as unknown as SpeechLike & { spokenAt: number; spoken: number };
}
const utterance = (text: string): SpeechUtteranceLike => ({ text, lang: '', rate: 1, voice: null, onend: null, onerror: null });

describe('GoListen start-up with fakes for the browser audio ports', () => {
  it('PF-M60..M61: recorded clip: pronounce(autoplay) until the clip\'s play() is called; and until play() has resolved', async () => {
    const audio = fakeAudioPort();
    const g = createGoListen({ registries: [demoGermanRegistry({ url: 'test://de/guten-tag.wav' })], consent: () => ({ remoteSpeech: false }), speech: fakeSpeech([]), audio, utterance, voiceWaitMs: 0 });
    const toPlayCall: number[] = [];
    const toResolved: number[] = [];
    for (let i = -3; i < 50; i++) {
      const before = audio.plays;
      const t0 = now();
      const r = await g.pronounce({ languageId: 'de', text: 'Guten Tag!', kind: 'phrase', autoplay: true });
      const t1 = now();
      if (!r.ok) throw new Error(`pronounce: ${r.reason}`);
      expect(audio.plays).toBe(before + 1);
      await Promise.resolve(); // the clip's play() promise resolves
      const t2 = now();
      if (i >= 0) { toPlayCall.push(audio.lastPlayAt - t0); toResolved.push(t2 - t0); }
      void t1;
      r.playback.dispose();
    }
    record('PF-M60', 'recorded clip: request to clip.play() called', 'GoListen.pronounce(autoplay) → AudioPort.clip.play(); fake AudioPort (no decoding, no device)', toPlayCall, 'real HTMLAudioElement start-up cannot be measured in node');
    record('PF-M61', 'recorded clip: request to play() promise resolved', 'as M60 plus one microtask turn', toResolved);
    expect(stats0(toResolved)).toBeLessThan(500);
  });

  it('PF-M62: device voice: pronounce(autoplay) until speechSynthesis.speak() is called', async () => {
    const speech = fakeSpeech([voice('Fake Albanian', 'sq-AL')]);
    const g = createGoListen({ registries: [deviceRegistry('sq', ['sq-AL', 'sq'], 'Albanian')], consent: () => ({ remoteSpeech: false }), speech, audio: fakeAudioPort(), utterance, voiceWaitMs: 0 });
    const samples: number[] = [];
    for (let i = -3; i < 50; i++) {
      const before = speech.spoken;
      const t0 = now();
      const r = await g.pronounce({ languageId: 'sq', text: 'mirëdita', kind: 'word', autoplay: true });
      if (!r.ok) throw new Error(`pronounce: ${r.reason}`);
      expect(speech.spoken).toBe(before + 1);
      if (i >= 0) samples.push(speech.spokenAt - t0);
    }
    record('PF-M62', 'device voice: request to speechSynthesis.speak() called', 'GoListen.pronounce(autoplay) with a fake speechSynthesis; the real voice engine\'s latency is NOT included', samples, 'device TTS cannot be measured in node');
    expect(stats0(samples)).toBeLessThan(500);
  });
});

// ───────────────────────────── GoTell ─────────────────────────────

describe('GoTell analyzeDraft (Albanian, warm)', () => {
  it('PF-M40..M41: a 2-sentence and a 10-sentence draft', async () => {
    const runtime = createPackRuntime(manifest, { fetch: fileFetch, baseUrl: 'http://assets.local/' });
    const nowIso = (): string => '2026-10-09T10:00:00.000Z';
    const analyzer = createAnalyzer({ languageId: 'sq', runtime, manifest, now: nowIso });
    const profile = await buildWriterProfile({ knowledge: async () => [], events: async () => [], preferences: async () => undefined }, { learnerId: LEARNER, languageId: 'sq' }, nowIso());
    const two = analyzer.analyzeDraft('d2', ALBANIAN_2, profile);
    const ten = analyzer.analyzeDraft('d10', ALBANIAN_10, profile);
    expect(two.sentences).toHaveLength(2);
    expect(ten.sentences).toHaveLength(10);
    const s2 = timeSync(20, () => analyzer.analyzeDraft('d2', ALBANIAN_2, profile), 3);
    const s10 = timeSync(20, () => analyzer.analyzeDraft('d10', ALBANIAN_10, profile), 3);
    record('PF-M40', 'analyzeDraft, 2 sentences', 'createAnalyzer().analyzeDraft: detect + corrections + validation, warm, N=20', s2);
    record('PF-M41', 'analyzeDraft, 10 sentences', 'same, 10 sentences', s10);
    expect(stats0(s10)).toBeLessThan(5000);
  });
});

// ───────────────────────────── artefact sizes ─────────────────────────────

function walk(dir: string): Array<{ rel: string; bytes: number; gzip: number }> {
  const out: Array<{ rel: string; bytes: number; gzip: number }> = [];
  const go = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) go(p);
      else { const buf = fs.readFileSync(p); out.push({ rel: path.relative(dir, p).replace(/\\/g, '/'), bytes: buf.length, gzip: zlib.gzipSync(buf).length }); }
    }
  };
  go(dir);
  return out;
}

describe('built artefacts (not built here: read as they stand)', () => {
  const targets: Array<[string, string]> = [
    ['PF-M50', 'packages/golearn-extension/dist'], ['PF-M51', 'packages/golearn-extension/dist-web'], ['PF-M52', 'packages/gopractice/dist'],
  ];
  it.each(targets)('%s %s', (id, rel) => {
    const dir = path.join(REPO, rel);
    if (!fs.existsSync(dir)) {
      console.log(`${id}: ${rel} is absent: not measured`);
      return;
    }
    const files = walk(dir);
    const total = files.reduce((a, f) => a + f.bytes, 0);
    const gz = files.reduce((a, f) => a + f.gzip, 0);
    recordValue(id, `${rel}: total (${files.length} files)`, 'sum of file sizes on disk', total / 1024, 'KB', `gzip ${(gz / 1024).toFixed(1)} KB`);
    for (const f of files.filter((x) => x.bytes > 20 * 1024).sort((a, b) => b.bytes - a.bytes).slice(0, 8)) {
      recordValue(`${id}:${f.rel}`, `  ${f.rel}`, 'file', f.bytes / 1024, 'KB', `gzip ${(f.gzip / 1024).toFixed(1)} KB`);
    }
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(200 * 1024 * 1024);
  });
});

// ───────────────────────────── helpers ─────────────────────────────

function timeSync(n: number, fn: () => unknown, warm = 0): number[] {
  for (let i = 0; i < warm; i++) fn();
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const t0 = now(); fn(); out.push(now() - t0); }
  return out;
}
/** The median of a list, for the loose bounds. */
function stats0(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; }
