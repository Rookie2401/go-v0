/**
 * The pack runtime: what an application does with a manifest once it has one.
 *
 *   createPackRuntime   the analyser, dictionary glosses, grammar explanations and honest coverage notes
 *   installPack         proves a pack works on this device (dictionary reachable, shard readable, every validation case
 *                       run through the real analyser) and records the result; refuses a planned or invalid pack
 *   verifyInstalled     reads that record back
 *
 * Nothing here throws on a missing dictionary or a bad network: an absent gloss is `undefined`, a failed install is
 * `{ ok: false, reason, detail }`.
 */
import type { AnalyzedToken, LanguageAdapter, RawToken, Span } from '../../../src/core';
import { createFetchLexiconSource } from '../../../src/dict';
import type { ShardCacheOptions } from '../../../src/dict';
import { runCase, type CaseResult } from './analysis';
import { builtInAdapter } from './builtins';
import { validateManifest, type PackManifest } from './manifest';

// ───────────────────────────── analyser ─────────────────────────────

export interface PackAnalyzer {
  /** e.g. 'adapter-sq@9' for a real adapter; 'intl-tokenize@1' for the fallback. */
  id: string;
  kind: 'adapter' | 'tokenize-only';
  tokenize(sentence: string): RawToken[];
  analyze(tokens: RawToken[]): AnalyzedToken[];
  segmentSentences(text: string): Span[];
  /** The real adapter, when there is one (the fallback has none). */
  adapter?: LanguageAdapter;
  /** What this analyser does not do, in a sentence; present on the fallback. */
  limitation?: string;
}

const FALLBACK_ID = 'intl-tokenize@1';

/** Words and sentences by Intl.Segmenter alone: no lemma, no morphology, no gloss. It says so. */
export function intlAnalyzer(languageId: string): PackAnalyzer {
  const seg = (granularity: 'word' | 'sentence'): Intl.Segmenter => {
    try { return new Intl.Segmenter(languageId, { granularity }); } catch { return new Intl.Segmenter(undefined, { granularity }); }
  };
  return {
    id: FALLBACK_ID,
    kind: 'tokenize-only',
    limitation: 'No analyser for this language is installed: words and sentences are split by the browser’s segmenter only, with no lemma, no morphology and no gloss.',
    tokenize: (sentence) =>
      [...seg('word').segment(sentence)].map((s) => ({
        surface: s.segment, start: s.index, end: s.index + s.segment.length, isWord: s.isWordLike === true, normalized: s.segment.normalize('NFC').toLowerCase(),
      })),
    analyze: (tokens) => tokens.map((token) => ({ token, candidates: [], analyzer: FALLBACK_ID })),
    segmentSentences: (text) => [...seg('sentence').segment(text)].map((s) => ({ start: s.index, end: s.index + s.segment.length, text: s.segment })),
  };
}

function adapterAnalyzer(adapter: LanguageAdapter): PackAnalyzer {
  return {
    id: `adapter-${adapter.lang}@${adapter.version}`,
    kind: 'adapter',
    adapter,
    tokenize: (s) => adapter.tokenize(s),
    analyze: (t) => adapter.analyze(t),
    segmentSentences: (t) => adapter.segmentSentences(t),
  };
}

// The analysers a runtime uses without being handed one come from ./builtins (the extension builds swap that module for a lean one).
export { builtInAdapter };

// ───────────────────────────── helpers ─────────────────────────────

export const joinUrl = (base: string, rel: string): string => `${base.replace(/\/+$/u, '')}/${rel.replace(/^\/+/u, '')}`;

/** The directory that holds `<lang>/manifest.json`, from the manifest's own relative path ('dict/sq/' → 'dict'). */
function dictionaryRoot(m: PackManifest): string | undefined {
  const rel = m.lexical.dictionary?.baseUrl.replace(/\/+$/u, '');
  if (!rel || !rel.endsWith(m.languageId)) return undefined;
  return rel.slice(0, rel.length - m.languageId.length).replace(/\/+$/u, '');
}

// ───────────────────────────── runtime ─────────────────────────────

export interface PackRuntimeDeps {
  fetch: typeof fetch;
  /** Where `dict/` lives: the application's asset base ('/', 'https://example.org/app/'). */
  baseUrl: string;
  /** Shard cache options of the dictionary reader (how many parsed shards to keep …). */
  cache?: ShardCacheOptions;
  /** The analyser for a language this build does not bundle (a planned pack becoming installable). */
  adapter?: LanguageAdapter;
}

export interface GlossSense { gloss: string; pos: string; tags?: string[] }
export interface GlossResult {
  senses: GlossSense[];
  /** Must be shown wherever a gloss is shown. */
  attribution: string;
  frequencyRank?: number;
}

export interface PackRuntime {
  readonly manifest: PackManifest;
  analyzer(): PackAnalyzer;
  /** Dictionary senses of a lemma; `pos` is a preference (matching senses first), not a filter. Never throws. */
  gloss(lemma: string, pos?: string, forms?: readonly string[]): Promise<GlossResult | undefined>;
  explainFeature(key: string, value: string): string | undefined;
  explainConstruction(id: string): string | undefined;
  coverageNotes(): string[];
}

const MAX_SENSES = 12;

export function createPackRuntime(manifest: PackManifest, deps: PackRuntimeDeps): PackRuntime {
  let analyzerCache: PackAnalyzer | undefined;
  const analyzer = (): PackAnalyzer => {
    if (!analyzerCache) {
      const adapter = deps.adapter ?? builtInAdapter(manifest.languageId);
      analyzerCache = adapter ? adapterAnalyzer(adapter) : intlAnalyzer(manifest.languageId);
    }
    return analyzerCache;
  };

  let lexicon: ReturnType<typeof createFetchLexiconSource> | undefined;
  const source = (): ReturnType<typeof createFetchLexiconSource> | undefined => {
    if (lexicon) return lexicon;
    const root = dictionaryRoot(manifest);
    if (root === undefined) return undefined;
    lexicon = createFetchLexiconSource(manifest.languageId as Parameters<typeof createFetchLexiconSource>[0], {
      baseUrl: root ? joinUrl(deps.baseUrl, root) : deps.baseUrl.replace(/\/+$/u, ''),
      fetch: deps.fetch,
      ...(deps.cache ? { cache: deps.cache } : {}),
    });
    return lexicon;
  };

  const featureOf = (key: string) => manifest.grammar.features.find((f) => f.key === key);

  return {
    manifest,
    analyzer,

    async gloss(lemma, pos, given) {
      try {
        const src = source();
        if (!src || !lemma) return undefined;
        const adapter = analyzer().adapter;
        const norm = (s: string): string => (adapter ? adapter.normalize(s) : s.normalize('NFC').toLowerCase());
        // `given`: the dictionary forms a caller that holds the analyser already worked out (the extension worker has no German, Hindi, Thai or Spanish analyser of its own)
        const forms = given?.length ? [...new Set(given.map(norm))] : [...new Set([norm(lemma), ...(adapter?.lemmaVariants?.(lemma) ?? []).map(norm)])];
        const found = await src.lookup(forms);
        const senses: GlossSense[] = [];
        let rank: number | undefined;
        for (const form of forms) {
          // an entry that is only an inflected form of another word is not a gloss of this lemma
          const entries = (found.get(form) ?? []).filter((e) => !e.formOf?.length);
          const ordered = pos ? [...entries.filter((e) => e.pos === pos), ...entries.filter((e) => e.pos !== pos)] : entries;
          for (const e of ordered) {
            if (e.frequencyRank !== undefined) rank = rank === undefined ? e.frequencyRank : Math.min(rank, e.frequencyRank);
            const list = e.senses?.length ? e.senses : e.glosses.map((gloss) => ({ gloss }));
            for (const s of list) {
              if (!s.gloss || senses.some((x) => x.gloss === s.gloss && x.pos === (e.pos ?? 'X'))) continue;
              const tags = 'tags' in s && Array.isArray(s.tags) && s.tags.length ? [...s.tags] : undefined;
              senses.push({ gloss: s.gloss, pos: e.pos ?? 'X', ...(tags ? { tags } : {}) });
            }
          }
          if (senses.length) break; // the lemma's own headword wins over a variant spelling
        }
        if (!senses.length) return undefined;
        const info = await src.info();
        if (!info) return undefined;
        try { const f = await src.frequency?.(lemma); if (f) rank = f.rank; } catch { /* no frequency: the rank above, if any, stands */ }
        return { senses: senses.slice(0, MAX_SENSES), attribution: info.attribution || manifest.lexical.dictionary?.attribution || '', ...(rank !== undefined ? { frequencyRank: rank } : {}) };
      } catch {
        return undefined;
      }
    },

    explainFeature(key, value) {
      const f = featureOf(key);
      if (!f) return undefined;
      const names = String(value).split(',').map((v) => v.trim()).filter(Boolean).map((v) => f.values[v]).filter((n): n is string => !!n);
      const named = names.length ? `${f.label}: ${names.join(' or ')}. ` : `${f.label}. `;
      return `${named}${f.explain}`;
    },

    explainConstruction(id) {
      const c = manifest.grammar.constructions.find((x) => x.id === id);
      return c ? `${c.label}. ${c.explain}` : undefined;
    },

    coverageNotes() {
      const notes: string[] = [];
      if (manifest.status === 'planned') notes.push('This pack is planned and cannot be installed yet.');
      const a = analyzer();
      if (a.kind === 'tokenize-only') notes.push(a.limitation ?? 'Words and sentences are split only.');
      else if (a.adapter) {
        const s = a.adapter.support;
        notes.push(`Analyser ${a.id}: lemmatization ${s.lemmatization}, morphology ${s.morphology}, phrases ${s.phraseDetection}.`);
        notes.push(...s.limitations);
      }
      notes.push(`Review status: ${manifest.rights.reviewStatus}${manifest.rights.reviewStatus === 'reviewed' ? '' : '; no native speaker has checked this pack'}.`);
      const d = manifest.lexical.dictionary;
      notes.push(d ? `Dictionary ${d.id}: ${d.entries.toLocaleString('en')} entries, ${d.licence}. Required attribution: ${d.attribution}` : 'No dictionary is declared for this pack: there are no dictionary glosses.');
      notes.push(manifest.pronunciation.recordings === 'none' ? 'There are no recordings; pronunciation help is written notes only, and any spoken voice is remote and needs your consent and key.' : 'Some recordings are included.');
      for (const v of manifest.varieties.filter((x) => !x.analysed)) notes.push(`${v.label}: not analysed as a variety of its own${v.note ? `. ${v.note}` : '.'}`);
      return notes;
    },
  };
}

// ───────────────────────────── install ─────────────────────────────

export interface PackStorage {
  get(key: string): unknown | Promise<unknown>;
  set(key: string, value: unknown): void | Promise<void>;
}

export interface InstallProgress { step: 'check' | 'dictionary-manifest' | 'sample-shard' | 'validation' | 'record'; index: number; total: number; message: string }

export interface InstallDeps {
  fetch: typeof fetch;
  baseUrl: string;
  storage: PackStorage;
  onProgress?: (p: InstallProgress) => void;
  adapter?: LanguageAdapter;
  /** Clock for tests. */
  now?: () => string;
}

export interface InstallVerified { dictionaryManifest: boolean; sampleShard: boolean; validation: CaseResult[] }

export type InstallFailure =
  | 'planned' | 'invalid-manifest' | 'no-analyser' | 'dictionary-unreachable' | 'dictionary-invalid' | 'dictionary-mismatch' | 'shard-unreachable' | 'storage-failed';

export type InstallResult =
  | { ok: true; verified: InstallVerified; installedAt: string; validationFailures: number }
  | { ok: false; reason: InstallFailure; detail: string };

export interface InstalledRecord { version: string; installedAt: string; verified: InstallVerified }

export const installedKey = (packId: string): string => `pack:installed:${packId}`;

async function fetchText(doFetch: typeof fetch, url: string): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  try {
    const res = await doFetch(url);
    if (!res.ok) return { ok: false, detail: `${url} answered HTTP ${res.status}` };
    return { ok: true, text: await res.text() };
  } catch (e) {
    return { ok: false, detail: `${url} could not be fetched: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function installPack(manifest: PackManifest, deps: InstallDeps): Promise<InstallResult> {
  const total = 4;
  const say = (step: InstallProgress['step'], index: number, message: string): void => { try { deps.onProgress?.({ step, index, total, message }); } catch { /* a progress listener never stops an install */ } };

  say('check', 0, 'Checking the pack description');
  if (manifest.status !== 'installable') return { ok: false, reason: 'planned', detail: `${manifest.packId} is planned, not installable: ${manifest.rights.provenance[0] ?? 'nothing is built yet'}` };
  const issues = validateManifest(manifest);
  if (issues.length) return { ok: false, reason: 'invalid-manifest', detail: issues.map((i) => `${i.path}: ${i.message}`).join('; ') };
  const adapter = deps.adapter ?? builtInAdapter(manifest.languageId);
  if (!adapter) return { ok: false, reason: 'no-analyser', detail: `no analyser for ${manifest.languageId} is available to this build` };
  const dict = manifest.lexical.dictionary!;
  const root = dictionaryRoot(manifest);
  if (root === undefined) return { ok: false, reason: 'invalid-manifest', detail: 'lexical.dictionary.baseUrl does not end with the language code' };
  const dictBase = joinUrl(deps.baseUrl, `${root ? `${root}/` : ''}${manifest.languageId}`);

  // 1. the dictionary's own manifest
  say('dictionary-manifest', 1, 'Reading the dictionary description');
  const mres = await fetchText(deps.fetch, `${dictBase}/manifest.json`);
  if (!mres.ok) return { ok: false, reason: 'dictionary-unreachable', detail: mres.detail };
  let dm: Record<string, unknown>;
  try { dm = JSON.parse(mres.text) as Record<string, unknown>; } catch { return { ok: false, reason: 'dictionary-invalid', detail: 'the dictionary manifest is not JSON' }; }
  if (!dm || typeof dm !== 'object') return { ok: false, reason: 'dictionary-invalid', detail: 'the dictionary manifest is not an object' };
  if (dm.lang !== manifest.languageId) return { ok: false, reason: 'dictionary-mismatch', detail: `the dictionary is for ${String(dm.lang)}, not ${manifest.languageId}` };
  if (typeof dm.entries !== 'number' || !(dm.entries > 0)) return { ok: false, reason: 'dictionary-invalid', detail: 'the dictionary manifest states no entries' };
  if (dm.entries !== dict.entries || dm.id !== dict.id) return { ok: false, reason: 'dictionary-mismatch', detail: `the pack expects ${dict.id} with ${dict.entries} entries; the device has ${String(dm.id)} with ${dm.entries}` };

  // 2. one shard, to prove the files are reachable and readable
  say('sample-shard', 2, 'Fetching one dictionary shard');
  const shardFiles = Array.isArray(dm.shardFiles) ? (dm.shardFiles as unknown[]).filter((f): f is string => typeof f === 'string') : [];
  const shardName = shardFiles[0] ?? 's-00.json';
  const sres = await fetchText(deps.fetch, `${dictBase}/${shardName}`);
  if (!sres.ok) return { ok: false, reason: 'shard-unreachable', detail: sres.detail };
  try { JSON.parse(sres.text); } catch { return { ok: false, reason: 'shard-unreachable', detail: `${shardName} is not readable JSON` }; }

  // 3. every validation case through the real analyser; a failing case is reported, never hidden
  say('validation', 3, `Running ${manifest.validation.length} validation cases`);
  const validation = manifest.validation.map((c) => runCase(adapter, c));
  const verified: InstallVerified = { dictionaryManifest: true, sampleShard: true, validation };

  // 4. the record
  say('record', 4, 'Recording the installation');
  const installedAt = (deps.now ?? (() => new Date().toISOString()))();
  const record: InstalledRecord = { version: manifest.version, installedAt, verified };
  try { await deps.storage.set(installedKey(manifest.packId), record); } catch (e) {
    return { ok: false, reason: 'storage-failed', detail: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, verified, installedAt, validationFailures: validation.filter((v) => !v.pass).length };
}

export type VerifyResult =
  | { installed: false; detail: string }
  | { installed: true; current: boolean; record: InstalledRecord; validationFailures: number };

/** Reads the installation record back: whether it exists, and whether it is for this version of the pack. */
export async function verifyInstalled(manifest: PackManifest, storage: Pick<PackStorage, 'get'>): Promise<VerifyResult> {
  let raw: unknown;
  try { raw = await storage.get(installedKey(manifest.packId)); } catch (e) { return { installed: false, detail: `storage could not be read: ${e instanceof Error ? e.message : String(e)}` }; }
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = undefined; } }
  if (!raw || typeof raw !== 'object') return { installed: false, detail: 'no installation record' };
  const r = raw as Partial<InstalledRecord>;
  if (typeof r.version !== 'string' || typeof r.installedAt !== 'string' || !r.verified || !Array.isArray(r.verified.validation)) return { installed: false, detail: 'the installation record is malformed' };
  const record = r as InstalledRecord;
  return { installed: true, current: record.version === manifest.version, record, validationFailures: record.verified.validation.filter((v) => !v.pass).length };
}
