/**
 * THE DECK AUDIT, for any language (owner, 2026-11-25/26: "Make sure that there are no false words or unknown words that appear in the GoReview deck";
 * "Enforce the same rule for all the other languages").
 *
 * It walks the REAL path a word takes to a GoReview card, with only the account stubbed:
 *   a sentence, then the page scan's own naming of its words (`wordsOfText`: the function GoLearn Active and Reading Analysis call; the word card's
 *   `itemIds` name the same units), then knowledge rows folded from EncounterRecorded events (`foldEvents`), then the engine's candidate RECOVERY
 *   (`engine.recoverCandidates`: the unit is absent from the account's catalogue, so the pack facts decide), then INTAKE (`engine.intake`), then
 *   ADMISSION (`engine.exerciseReadiness`: the written-recognition builder must build and validate), then the exercise itself, from which the card's
 *   shown meaning ("X means ...", the correct choice) and its accepted answers are read.
 * The pack facts are `packFactsFor`, the provider the app's main.ts makes, reading the dictionaries and lexicon shards from public/ on disk.
 *
 * What it reports per admitted card: the headword, its class, the first meaning shown, the accepted answers, the written forms and one sentence it came
 * from; and machine findings: `listed` false (the headword is neither a confirmed word-list reading nor a dictionary entry), `xref` (the shown
 * meaning is only a cross-reference: "alternative spelling of ..."), `fragment` (a headword with no letter in it).
 * Whether a card is FALSE (the wrong word for the sentence, or the right word with a wrong first meaning) is a judgement by reading; the verdict files
 * under data/deck-audit/<lang>/ record it, and the tests fail on any admitted card that has no verdict.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { CONTRACT_VERSION, type GoEvent, type ReviewCandidate } from '../../packages/repository-contract/src';
import { foldEvents } from '../../packages/repository-engine/src';
import type { RepositoryApi, VocabularyItem } from '../../packages/repository-service/src/api';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { gzipHebrewFormFrequency } from '../../packages/goreview/app/hebrewFrequencyAssets';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { DEFAULT_PREFERENCES } from '../../packages/goreview/app/state';
import { evidenceFor, ratingFor, registry, resolveBuilder } from '../../packages/goreview/src';
import { wordsOfText } from '../../packages/golearn-extension/src/active/scan';
import { LEXICON_SETS } from '../../packages/golearn-extension/src/lexicon/prepare';
import { createPackRuntime, packFor } from '../../packages/language-packs/src';
import { loadBuiltInAdapter } from '../../packages/language-packs/src/builtins';
import { installedGreekIndexes, resetGreekIndexes } from '../../src/adapters/greek/index-store';
import { installedHebrewIndexes, resetHebrewIndexes } from '../../src/adapters/hebrew/index-store';
import { installedRussianIndexes, resetRussianIndexes } from '../../src/adapters/russian/index-store';
import { createGreekShardLoader } from '../../src/adapters/greek/shards';
import { createHebrewShardLoader } from '../../src/adapters/hebrew/shards';
import { createRussianShardLoader } from '../../src/adapters/russian/shards';
import { createArabicShardLoader } from '../../src/adapters/arabic/shards';
import { installedArabicIndexes, resetArabicIndexes } from '../../src/adapters/arabic/index-store';
import type { ShardSource } from '../../src/adapters/shared/shards';
import type { LanguageAdapter } from '../../src/core';
import { isCrossReferenceOnly } from '../../src/core/review-meaning';
import { applyReviewGate } from '../../src/core/review-gate';

export const ROOT = path.resolve(__dirname, '../..');
export const PUBLIC = path.join(ROOT, 'public');
const NOW = '2026-11-01T12:00:00.000Z';

let hebrewFrequency: Uint8Array | undefined;
export const diskFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  // the per-language frequency file is counted from the course's own texts and is not part of a card's meaning: left out so the audit reads the same on every machine
  if (/\/frequency\.json$/u.test(url.pathname)) return new Response('not found', { status: 404 });
  const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
  if (/^\/dict\/[^/]+\/manifest\.json$/u.test(url.pathname) && fs.existsSync(file)) return new Response(JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), hasFrequency: false }));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return new Response(fs.readFileSync(file));
  // the Hebrew form-frequency file is made at build time from the Biblical index (lexicon:shard); a checkout makes it here the same way
  if (url.pathname === '/lexicon/he/biblical/form-frequency.json.gz' && fs.existsSync(path.join(PUBLIC, 'lexicon/he/biblical-index.json'))) {
    hebrewFrequency ??= gzipHebrewFormFrequency(JSON.parse(fs.readFileSync(path.join(PUBLIC, 'lexicon/he/biblical-index.json'), 'utf8')));
    return new Response(hebrewFrequency as unknown as BodyInit);
  }
  // a published build gzips the large indexes (koine-index.json.gz, form-frequency.json.gz); a checkout holds them plain
  if (file.endsWith('.gz') && fs.existsSync(file.slice(0, -3))) return new Response(gzipSync(fs.readFileSync(file.slice(0, -3))));
  return new Response('not found', { status: 404 });
}) as typeof fetch;

/** True when the dictionaries and lexicon shards the language reads are on this machine (they are build outputs, not in git). */
export function dataPresent(lang: string): boolean {
  const manifest = packFor(lang);
  const dict = manifest?.lexical.dictionary?.baseUrl;
  if (dict && !fs.existsSync(path.join(PUBLIC, dict, 'manifest.json'))) return false;
  for (const set of LEXICON_SETS[lang] ?? []) if (!fs.existsSync(path.join(PUBLIC, 'lexicon', set))) return false;
  return true;
}

const shardSource: ShardSource = {
  async fetchJson(p) { return JSON.parse(fs.readFileSync(path.join(PUBLIC, decodeURIComponent(p)), 'utf8')); },
  async fetchBytes(p) { return new Uint8Array(fs.readFileSync(path.join(PUBLIC, decodeURIComponent(p)))); },
};
type Ensurer = { ensure(keys: string[]): Promise<unknown> };
const shardLoaders = new Map<string, Promise<Ensurer>>();
/** What the extension's lexicon preparer does before a page is scanned: the shards the text's words live in are installed first. */
export async function prepareLexicon(lang: string, adapter: LanguageAdapter, text: string): Promise<void> {
  const keys = [...new Set(adapter.tokenize(text.normalize('NFC')).filter((t) => t.isWord).map((t) => t.normalized))];
  for (const set of LEXICON_SETS[lang] ?? []) {
    let job = shardLoaders.get(set);
    if (!job) {
      const make = set.startsWith('el/') ? createGreekShardLoader : set.startsWith('ru/') ? createRussianShardLoader : set.startsWith('ar/') ? createArabicShardLoader : createHebrewShardLoader;
      job = make(shardSource, { base: `lexicon/${set}`, maxLoaded: 4096 }) as unknown as Promise<Ensurer>;
      shardLoaders.set(set, job);
    }
    const loader = await job;
    for (let i = 0; i < keys.length; i += 200) await loader.ensure(keys.slice(i, i + 200));
  }
}

/**
 * The sharded indexes (Greek, Hebrew, Russian) are installed into stores that live as long as the process. Each audit run starts from the stores as the
 * analysers' own modules leave them (the compiled cores), so that a run reads the same whatever ran before it in the same process: what an earlier text
 * installed is taken out again.
 */
const STORES: Record<string, { installed(): Array<{ id: string; shard?: string }>; reset(keep: (id: string, shard?: string) => boolean): void }> = {
  el: { installed: installedGreekIndexes, reset: resetGreekIndexes }, he: { installed: installedHebrewIndexes, reset: resetHebrewIndexes }, ru: { installed: installedRussianIndexes, reset: resetRussianIndexes }, ar: { installed: installedArabicIndexes, reset: resetArabicIndexes },
};
const baseline = new Map<string, Set<string>>();
const storeKey = (id: string, shard?: string): string => id + '|' + (shard ?? '');
function resetStores(lang: string): void {
  const name = lang === 'arc' ? 'he' : lang;
  const store = STORES[name];
  if (!store) return;
  let keep = baseline.get(name);
  if (!keep) { keep = new Set(store.installed().map((i) => storeKey(i.id, i.shard))); baseline.set(name, keep); }
  const kept = keep;
  store.reset((id, shard) => kept.has(storeKey(id, shard)));
  for (const set of [...shardLoaders.keys()]) if (set.startsWith(name + '/')) shardLoaders.delete(set);
}

export interface AuditCard {
  unitId: string; kind: 'lemma' | 'form';
  /** what the card shows as the word: the lemma of a lemma card, the written form of a form card */
  headword: string; pos?: string;
  /** the lemma the facts name (a form card's lemma, when it has one) */
  lemma?: string;
  /** the first meaning shown ("X means ..."; the correct option of a choice) */
  shown: string;
  accepted: string[];
  /** a form card that asks only for the base meaning of its lemma (lexicalRecognition) */
  baseMeaning: boolean;
  status: string;
  /** the written forms of the text that credit this unit, the first sentence it came from, and how often it occurred */
  surfaces: string[]; sentence: string; occurrences: number;
  /** machine findings */
  listed: boolean; xref: boolean; fragment: boolean;
}
export interface AuditHeld { unitId: string; surface: string; sentence: string; occurrences: number; stage: 'no-facts' | 'facts-status' | 'intake' | 'build'; reason: string; kind?: string }
export interface AuditResult {
  lang: string; varietyId?: string; sentences: number; words: number; unknownWords: number;
  /** with `strictReadings`: the word occurrences whose lemma was not credited */
  strictHeldOccurrences?: number;
  /** distinct units the scan credits */
  lemmaUnits: number; formUnits: number;
  cards: AuditCard[]; held: AuditHeld[];
}

export interface AuditOptions {
  /** MEASURED ONLY, the stricter rule put to the owner: the reading gate (src/core/review-gate.ts) on every word of the text, so that a word whose sentence leaves two headwords within 0.15 of each other credits its written form only, never a lemma. */
  strictReadings?: boolean;
  varietyId?: string; /** false: measure WITHOUT the deck gate (the state before it) */ gate?: boolean; /** also audit the form units (form:<lang>:...) every scanned word carries; default true */ forms?: boolean }

const unitOf = (id: string, lang: string): { kind: 'lemma' | 'form'; body: string; pos?: string } => {
  if (id.startsWith(`form:${lang}:`)) return { kind: 'form', body: id.slice(`form:${lang}:`.length) };
  const rest = id.slice(`lemma:${lang}:`.length);
  const m = /^(.*):([A-Z]+)$/u.exec(rest);
  return m ? { kind: 'lemma', body: m[1], pos: m[2] } : { kind: 'lemma', body: rest };
};

export async function runDeckAudit(lang: string, sentences: string[], opts: AuditOptions = {}): Promise<AuditResult> {
  const manifest = packFor(lang);
  if (!manifest) throw new Error(`no pack ${lang}`);
  const adapter = await loadBuiltInAdapter(lang) as LanguageAdapter | undefined;
  if (!adapter) throw new Error(`no analyser for ${lang}`);
  const varietyId = opts.varietyId ?? manifest.varietyId;
  const texts = sentences.map((s) => s.normalize('NFC').trim()).filter(Boolean);
  resetStores(lang);
  await prepareLexicon(lang, adapter, texts.join('\n'));

  // the scan: which unit every word credits
  const seen = new Map<string, { surfaces: Set<string>; sentence: string; n: number }>();
  let words = 0; let unknownWords = 0; let strictHeld = 0;
  for (const text of texts) {
    const heldStarts = new Set<number>();
    if (opts.strictReadings) {
      const tokens = adapter.tokenize(text);
      adapter.analyze(tokens).forEach((a, i) => {
        const candidates = a.candidates.map((c) => ({ ...c, notes: { ...(c.notes ?? {}) } }));
        if (!candidates.length) return;
        applyReviewGate(candidates, { listed: (c) => !c.unconfirmed, band: 0.15, floor: 0.5, surface: tokens[i].surface });
        const best = candidates.reduce((m, c) => (c.confidence > m.confidence ? c : m), candidates[0]);
        if (best.notes?.reviewGate === 'yes') heldStarts.add(tokens[i].start);
      });
    }
    for (const w of wordsOfText(text, adapter, lang)) {
      words += 1; if (!w.known) unknownWords += 1;
      for (const id of w.ids) {
        if (id.startsWith('lemma:') && heldStarts.has(w.start)) { strictHeld += 1; continue; }
        if (opts.forms === false && id.startsWith('form:')) continue;
        const e = seen.get(id) ?? seen.set(id, { surfaces: new Set(), sentence: text, n: 0 }).get(id)!;
        e.surfaces.add(w.surface); e.n += 1;
      }
    }
  }
  const unitIds = [...seen.keys()];

  // the account: three recent encounters of every unit, none of them in the catalogue
  const ENROLMENT = `audit-${lang}`; const LEARNER = `audit-learner-${lang}`;
  const events: GoEvent[] = unitIds.flatMap((unitId, k) => [0, 1, 2].map((n) => ({
    id: `event:${k}:${n}`, v: CONTRACT_VERSION, learnerId: LEARNER, enrolmentId: ENROLMENT, languageId: lang, at: new Date(Date.parse(NOW) - (2 - n) * 60_000).toISOString(),
    producer: { app: 'golearn-ext', version: '0.1.0', deviceId: 'audit-device', surface: 'page' },
    kind: 'EncounterRecorded', subject: { itemIds: [unitId] },
    payload: { tokenCount: 5, contextKind: 'sentence', contextConfidence: 1, language: { languageId: lang, ...(varietyId ? { varietyId } : {}), basis: 'override', confidence: 1, source: 'deck-audit', override: true } },
    dedupeKey: `audit:${k}:${n}`,
  }) as unknown as GoEvent));
  const knowledge = foldEvents(events, { modelVersion: 'projection@7' });
  const unresolved: VocabularyItem[] = knowledge.map((k) => ({ knowledge: k, surfaceForms: [...(seen.get(k.unitId)?.surfaces ?? [])], sources: [] }));
  const placeholders: ReviewCandidate[] = unitIds.map((unitId) => ({ unitId, kind: 'unknown', score: 0, reasons: [], targetDimension: 'readingRecognition', eligibility: { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' }, cost: 0.2 }) as ReviewCandidate);
  const api = {
    async units(ids: string[]) { return { ok: true, status: 200, data: { units: {}, missing: ids } }; },
    async unit() { return { ok: false, status: 404, error: 'not-found', message: 'not found', body: {} }; },
    async listEnrolments() { return { ok: true, status: 200, data: { enrolments: [{ enrolmentId: ENROLMENT, learnerId: LEARNER, languageId: lang, ...(varietyId ? { varietyId } : {}), packId: manifest.packId, packVersion: manifest.version, goals: [{ kind: 'reading' }], startedAt: NOW }] } }; },
  } as unknown as RepositoryApi;
  const facts = packFactsFor({ fetch: diskFetch, baseUrl: 'http://assets.local/', ...(opts.gate === false ? { deckGate: false } : {}) });
  const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, now: () => NOW, random: () => 0, factsFor: facts });
  const prefs = { ...DEFAULT_PREFERENCES(lang), ...(varietyId ? { varietyId } : {}), maxNew: 100_000, dailyNewLimit: 100_000, practiceGoals: ['recognition' as const], includeListening: false };
  const audio = { available: false, eligibleForEvidence: false, reason: 'no audio' };

  const held: AuditHeld[] = [];
  const hold = (unitId: string, stage: AuditHeld['stage'], reason: string, kind?: string): void => {
    const e = seen.get(unitId)!;
    held.push({ unitId, surface: [...e.surfaces][0], sentence: e.sentence, occurrences: e.n, stage, reason, ...(kind ? { kind } : {}) });
  };

  // recovery
  const recovered = await engine.recoverCandidates!({ api, enrolmentId: ENROLMENT, languageId: lang, ...(varietyId ? { varietyId } : {}), prefs, events, deck: [], knowledge, unresolvedVocabulary: unresolved, existingCandidates: placeholders, now: NOW });
  const recoveredIds = new Set(recovered.candidates.map((c) => c.unitId));
  const provider = facts(lang, api)!;
  for (const id of unitIds) {
    if (recoveredIds.has(id)) continue;
    const f = await provider.factsFor(id, lang, varietyId).catch(() => undefined);
    if (!f) hold(id, 'no-facts', 'the pack has no facts for this unit');
    else hold(id, 'facts-status', `facts ${f.status}`, (f as { reviewHold?: { kind?: string } }).reviewHold?.kind);
  }

  // intake (one pass over every recovered candidate), then admission
  const outcomes = await engine.intake({ api, candidates: recovered.candidates, knowledge, deck: [], saved: new Set(), prefs, audio, now: NOW, events });
  const runtime = createPackRuntime(manifest, { fetch: diskFetch, baseUrl: 'http://assets.local/' });
  const builder = resolveBuilder(registry, 'written-recognition')!;
  const cards: AuditCard[] = [];
  for (const o of outcomes) {
    const id = o.unitId;
    if (!o.proposed || !['test-now', 'test-later', 'low-priority'].includes(o.decision)) { hold(id, 'intake', `${o.decision}: ${o.reasons[0] ?? ''}`); continue; }
    const u = unitOf(id, lang);
    const unitKind = u.kind === 'form' ? 'form' : 'lexeme';
    const ready = await engine.exerciseReadiness!({ unitId: id, unitKind, languageId: lang, ...(varietyId ? { varietyId } : {}), dimension: 'written-recognition', family: 'written-recognition', api, now: NOW });
    if (!ready.available) { hold(id, 'build', ready.reason ?? 'not built'); continue; }
    const f = (await provider.factsFor(id, lang, varietyId))!;
    const target = { unitId: id, unitKind, languageId: lang, dimension: 'written-recognition' as const, ...(varietyId ? { varietyId } : {}) };
    const built = await builder.build(target as never, f, { now: NOW, random: () => 0 });
    if ('unavailable' in built) { hold(id, 'build', built.reason); continue; }
    const baseMeaning = (built.builtFrom?.facts ?? []).includes('meaning:lexical-base');
    const explanation = built.answerKey.explanation ?? '';
    const explained = /(?:means|base meaning) [“"]([^”"]+)[”"]/u.exec(explanation)?.[1];
    const shown = explained ?? built.answerKey.accepted[0] ?? '';
    const headword = u.kind === 'form' ? f.unit.label : f.lemma ?? f.unit.label;
    const lemma = baseMeaning ? f.lexicalRecognition?.lemma : f.lemma;
    const pos = f.pos ?? u.pos;
    let listed = (f as { lemmaInWordList?: boolean }).lemmaInWordList === true;
    if (!listed) {
      try { const d = await runtime.gloss(lemma ?? headword, pos); listed = !!d && d.senses.length > 0 && !d.via; } catch { listed = false; }
    }
    // a language with no pack dictionary (Greek, Aramaic): a base meaning read off an attested form source is the lexicon's own entry
    if (!listed && baseMeaning && f.lexicalRecognition?.evidence === 'attested-form-reading') listed = true;
    if (!listed && u.kind === 'form') {
      try { const d = await runtime.gloss(headword, pos, [headword]); listed = !!d && d.senses.length > 0; } catch { /* stays unlisted */ }
    }
    const e = seen.get(id)!;
    cards.push({ unitId: id, kind: u.kind, headword, ...(pos ? { pos } : {}), ...(lemma ? { lemma } : {}), shown, accepted: built.answerKey.accepted, baseMeaning, status: f.status,
      surfaces: [...e.surfaces], sentence: e.sentence, occurrences: e.n, listed, xref: isCrossReferenceOnly(shown), fragment: !/\p{L}/u.test(headword) });
  }
  cards.sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
  return { lang, ...(varietyId ? { varietyId } : {}), sentences: texts.length, words, unknownWords, ...(opts.strictReadings ? { strictHeldOccurrences: strictHeld } : {}),
    lemmaUnits: unitIds.filter((i) => i.startsWith('lemma:')).length, formUnits: unitIds.filter((i) => i.startsWith('form:')).length, cards, held };
}

/** The audited sets: a language, or one period variety of it, each with its own two texts under data/deck-audit/<id>/ (dev.txt, heldout.txt). */
export interface AuditSet { id: string; lang: string; varietyId?: string; name: string }
export const AUDIT_SETS: readonly AuditSet[] = [
  { id: 'sq', lang: 'sq', name: 'Albanian' }, { id: 'es', lang: 'es', name: 'Spanish' }, { id: 'de', lang: 'de', name: 'German' }, { id: 'hi', lang: 'hi', name: 'Hindi' },
  { id: 'th', lang: 'th', name: 'Thai' }, { id: 'nb', lang: 'nb', name: 'Norwegian Bokmål' }, { id: 'nn', lang: 'nn', name: 'Norwegian Nynorsk' }, { id: 'la', lang: 'la', name: 'Latin' },
  { id: 'ru', lang: 'ru', name: 'Russian' }, { id: 'fr', lang: 'fr', name: 'French' },
  { id: 'el', lang: 'el', varietyId: 'el-mod', name: 'Modern Greek' }, { id: 'el-koi', lang: 'el', varietyId: 'el-koi', name: 'Koine Greek' },
  { id: 'he', lang: 'he', varietyId: 'he-mod', name: 'Modern Hebrew' }, { id: 'he-bib', lang: 'he', varietyId: 'he-bib', name: 'Biblical Hebrew' },
  { id: 'arc', lang: 'arc', varietyId: 'arc-bib', name: 'Biblical Aramaic' },
  { id: 'ar', lang: 'ar', name: 'Arabic' },
];
export const auditSet = (id: string): AuditSet => { const s = AUDIT_SETS.find((x) => x.id === id); if (!s) throw new Error(`no audit set ${id}`); return s; };
export const auditText = (id: string, part: 'dev' | 'heldout'): string => path.join(ROOT, 'data/deck-audit', id, `${part}.txt`);

/** The sentences of an audit text file: one per line; blank lines and lines starting with # are not sentences. */
export function readSentences(file: string): string[] {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/u).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}
