// @vitest-environment node
/**
 * The Arabic form index built by scripts/ar-build-index.mts: the compiled core (src/adapters/arabic/generated/core.ts) keeps the
 * ArabicFormIndex invariants and reads ordinary words through the index store; when the sharded index has been built, its manifest and
 * a shard on disk honour the contract the shared loader enforces. Arabic strings are written as escapes so no mark hides in the file.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { AR_CORE } from '../../src/adapters/arabic/generated/core';
import { installArabicIndex, lookupArabicForm, resetArabicIndexes, type ArabicFormIndex } from '../../src/adapters/arabic/index-store';
import { applyVocal, arHeadForm, arKey, arLoose, arShardLetters, packVocal } from '../../src/adapters/arabic/text';

afterEach(() => resetArabicIndexes());

const POS = new Set(['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM', 'INTJ']);
const KATABA = 'كَتَبَ'; // كَتَبَ
const KITAB = 'كِتَاب'; // كِتَاب
const KUTUB = 'كُتُب'; // كُتُب
const KTB = 'كتب'; // كتب

/** The invariants of a (core or shard) index, as problems found; empty when the index is sound. */
function problems(idx: ArabicFormIndex): string[] {
  const out: string[] = [];
  const add = (s: string): void => { if (out.length < 20) out.push(s); };
  const used = new Set<number>();
  for (const [key, rows] of Object.entries(idx.forms)) {
    if (key !== arKey(key)) add(`key ${key} is not its own arKey`);
    if (!rows.length) add(`key ${key} has no rows`);
    for (const row of rows) {
      const id = idx.lemmaIds[row[0]];
      if (id === undefined) add(`${key}: lemma index ${row[0]} out of range`);
      else { used.add(row[0]); if (!idx.lemmas[id]) add(`${key}: lemma ${id} has no row`); }
      if (idx.codes[row[1]] === undefined) add(`${key}: code index ${row[1]} out of range`);
      if (row[2] !== undefined) {
        const v = applyVocal(key, row[2]);
        if (arKey(v) !== key) add(`${key}: vocal ${row[2]} changes the key`);
        else if (packVocal(v) !== row[2]) add(`${key}: vocal ${row[2]} does not round-trip`);
      }
    }
  }
  if (new Set(idx.lemmaIds).size !== idx.lemmaIds.length) add('lemma ids are not unique');
  for (const id of idx.lemmaIds) {
    const row = idx.lemmas[id];
    if (!row) { add(`lemma id ${id} has no row`); continue; }
    if (!POS.has(row[2])) add(`${id}: unknown part of speech ${row[2]}`);
    const [head, pos, nth] = id.split('|');
    if (pos !== row[2]) add(`${id}: id and part of speech disagree`);
    if (head !== row[0]) add(`${id}: id and head disagree`);
    if (nth !== undefined && !(Number(nth) >= 2)) add(`${id}: bad homonym number`);
    if (arHeadForm(row[0], row[2]) !== row[0]) add(`${id}: head is not in the lemma-string convention`);
    if (!(row[4] >= 0)) add(`${id}: bad count`);
  }
  if (used.size !== idx.lemmaIds.length) add(`${idx.lemmaIds.length - used.size} lemma ids are used by no row`);
  for (const [folded, ks] of Object.entries(idx.loose)) {
    for (const k of ks) {
      if (!idx.forms[k]) add(`loose ${folded}: ${k} is not a key`);
      if (arLoose(k) !== folded) add(`loose ${folded}: ${k} does not fold to it`);
      if (k === folded) add(`loose ${folded}: lists itself`);
    }
  }
  for (const k of Object.keys(idx.forms)) if (arLoose(k) !== k && !idx.loose[arLoose(k)]?.includes(k)) add(`${k} differs from its loose fold and has no loose entry`);
  return out;
}

describe('the compiled core (AR_CORE)', () => {
  it('is an ar-core index with figures and sources', () => {
    expect(AR_CORE.schema).toBe(1);
    expect(AR_CORE.id).toBe('ar-core');
    expect(AR_CORE.source.licence).toBe('CC BY-SA 4.0');
    expect(AR_CORE.source.url).toBe('https://kaikki.org/dictionary/Arabic/');
    expect(AR_CORE.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(AR_CORE.stats?.keys).toBe(Object.keys(AR_CORE.forms).length);
    expect(AR_CORE.stats?.lemmas).toBe(AR_CORE.lemmaIds.length);
    expect(AR_CORE.stats?.tokenCoverage).toBeGreaterThan(0.3);
    expect(Buffer.byteLength(JSON.stringify(AR_CORE))).toBeLessThanOrEqual(500_000);
  });

  it('keeps the ArabicFormIndex invariants (rows resolve, vowels apply, ids unique, every head in the lemma-string convention)', () => {
    expect(problems(AR_CORE)).toEqual([]);
    for (const id of AR_CORE.lemmaIds) expect(arHeadForm(AR_CORE.lemmas[id][0], AR_CORE.lemmas[id][2]), id).toBe(AR_CORE.lemmas[id][0]);
  });

  describe('through lookupArabicForm', () => {
    const read = (key: string) => { installArabicIndex(AR_CORE); return lookupArabicForm(key); };

    it('finds the verb and the plural noun under the one key كتب, with their lemma ids and vowels', () => {
      const hits = read(KTB);
      const verb = hits.find((h) => h.vocalized === KATABA && h.lemmaId === `${arHeadForm(KATABA, 'VERB')}|VERB`);
      expect(verb, 'كَتَبَ').toBeDefined();
      expect(verb!.code.split('|')).toEqual(expect.arrayContaining(['past', 'third-person', 'masculine', 'singular']));
      expect(verb!.lemma[2]).toBe('VERB');
      const plural = hits.find((h) => h.vocalized === KUTUB && h.lemmaId === `${arHeadForm(KITAB, 'NOUN')}|NOUN`);
      expect(plural, 'كُتُب of كِتَاب').toBeDefined();
      expect(plural!.code.split('|')).toContain('plural');
      expect(plural!.viaLoose).toBe(false);
    });

    it('holds a root for كَتَبَ, taken from the source', () => {
      const id = `${arHeadForm(KATABA, 'VERB')}|VERB`;
      expect(AR_CORE.lemmas[id]?.[5]).toBe('ك ت ب');
    });

    it('holds the commonest closed-class words', () => {
      for (const w of ['في', 'من', 'على', 'هذا']) expect(read(w).length, w).toBeGreaterThan(0);
    });

    it('reaches a hamza-bearing word from its spelling without the hamza (loose), marking the reading', () => {
      installArabicIndex(AR_CORE);
      // أكل if the core holds it, else the commonest core key that a loose spelling can reach
      const ate = 'أكل';
      const target = AR_CORE.forms[ate] ? ate : Object.keys(AR_CORE.forms).find((k) => arLoose(k) !== k && !AR_CORE.forms[arLoose(k)])!;
      expect(target).toBeDefined();
      const hits = lookupArabicForm(arLoose(target));
      expect(hits.some((h) => h.viaLoose && h.key === target)).toBe(true);
      const first = hits.findIndex((h) => h.viaLoose);
      expect(hits.slice(0, first < 0 ? 0 : first).every((h) => !h.viaLoose)).toBe(true);
    });

    it('a word the core does not hold has no reading', () => {
      expect(read('ككككككك')).toEqual([]);
    });
  });
});

const MANIFEST = path.resolve('public/lexicon/ar/standard/manifest.json');

describe.skipIf(!fs.existsSync(MANIFEST))('the sharded index on disk', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { schema: number; id: string; built: string; shards: Record<string, { file: string; bytes: number; keys: number }>; stats?: Record<string, number> };
  const dir = path.dirname(MANIFEST);
  const readShard = (prefix: string): ArabicFormIndex => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, manifest.shards[prefix].file))).toString('utf8')) as ArabicFormIndex;
  /** The longest listed prefix of the letters, else '_': what the shared loader does. */
  const shardFor = (key: string): string => {
    const letters = arShardLetters(key);
    for (let n = Math.min(3, letters.length); n >= 1; n--) if (manifest.shards[letters.slice(0, n)]) return letters.slice(0, n);
    return '_';
  };

  it('has a manifest the loader accepts', () => {
    expect(manifest.schema).toBe(1);
    expect(manifest.id).toBe('kaikki-ar-tables');
    expect(Object.keys(manifest.shards).length).toBeGreaterThan(50);
    for (const [, s] of Object.entries(manifest.shards)) expect(fs.statSync(path.join(dir, s.file)).size).toBe(s.bytes);
  });

  it('a shard says what the manifest says, keeps the index invariants and holds its keys', () => {
    const prefix = shardFor(KTB);
    const idx = readShard(prefix);
    expect(idx.id).toBe(manifest.id);
    expect(idx.shard).toBe(prefix);
    expect(Object.keys(idx.forms).length).toBe(manifest.shards[prefix].keys);
    expect(problems(idx)).toEqual([]);
    expect(idx.forms[KTB]?.length).toBeGreaterThan(5);
    for (const k of Object.keys(idx.forms)) expect(shardFor(k), k).toBe(prefix);
  });

  it('reads كتب through the shard installed beside the core, each reading once', () => {
    installArabicIndex(AR_CORE);
    installArabicIndex(readShard(shardFor(KTB)));
    const hits = lookupArabicForm(KTB);
    const sigs = hits.map((h) => `${h.key}\t${h.lemmaId}\t${h.code}\t${h.vocal}`);
    expect(new Set(sigs).size).toBe(sigs.length);
    expect(hits.some((h) => h.vocalized === KATABA)).toBe(true);
  });
});

describe.skipIf(!fs.existsSync(MANIFEST))('the core against the full index (partial keys)', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { shards: Record<string, { file: string }> };
  const dir = path.dirname(MANIFEST);
  const shardFor = (key: string): string => {
    const letters = arShardLetters(key);
    for (let n = Math.min(3, letters.length); n >= 1; n--) if (manifest.shards[letters.slice(0, n)]) return letters.slice(0, n);
    return '_';
  };
  const cache = new Map<string, ArabicFormIndex>();
  const full = (key: string): Set<string> => {
    const p = shardFor(key);
    let idx = cache.get(p);
    if (!idx) { idx = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, manifest.shards[p].file))).toString('utf8')) as ArabicFormIndex; cache.set(p, idx); }
    return new Set((idx.forms[key] ?? []).map((r) => idx!.lemmaIds[r[0]]));
  };

  it('holds, for every core key, every lexeme the full index has, or lists the key in partial; and lists no key needlessly', () => {
    const partial = new Set(AR_CORE.partial ?? []);
    expect([...partial]).toEqual([...(AR_CORE.partial ?? [])].sort());
    const bad: string[] = [];
    for (const [key, rows] of Object.entries(AR_CORE.forms)) {
      const inCore = new Set(rows.map((r) => AR_CORE.lemmaIds[r[0]]));
      const inFull = full(key);
      const same = inCore.size === inFull.size && [...inFull].every((id) => inCore.has(id));
      if (!same && !partial.has(key)) bad.push(`${key}: core lacks ${[...inFull].filter((id) => !inCore.has(id)).join(', ')} and does not flag it`);
      if (same && partial.has(key)) bad.push(`${key}: flagged partial although complete`);
      if (bad.length > 15) break;
    }
    for (const k of partial) if (!AR_CORE.forms[k]) bad.push(`${k}: flagged partial but not a core key`);
    expect(bad).toEqual([]);
  });
});
