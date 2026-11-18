// @vitest-environment node
/**
 * The Russian form index built by scripts/ru-build-index.mts: the compiled core (src/adapters/russian/generated/core.ts) keeps the
 * RussianFormIndex invariants and reads ordinary words through the index store; when the sharded index has been built, a shard on disk
 * honours the manifest contract the shared loader enforces.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { RU_CORE } from '../../src/adapters/russian/generated/core';
import { RU_FORM_PRIORS } from '../../src/adapters/russian/generated/form-priors';
import { RU_PRIORS } from '../../src/adapters/russian/generated/priors';
import { installRussianIndex, lookupRussianForm, resetRussianIndexes, type RussianFormIndex } from '../../src/adapters/russian/index-store';
import { ruKey, ruShardLetters, stressPositions, unpackStress, vowelCount, yoFold, RU_VOWELS } from '../../src/adapters/russian/text';

afterEach(() => resetRussianIndexes());

const POS = new Set(['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM', 'INTJ']);

/** The invariants of a (core or shard) index, as problems found; empty when the index is sound. */
function problems(idx: RussianFormIndex): string[] {
  const out: string[] = [];
  const add = (s: string): void => { if (out.length < 20) out.push(s); };
  const used = new Set<number>();
  for (const [key, rows] of Object.entries(idx.forms)) {
    if (key !== ruKey(key)) add(`key ${key} is not its own ruKey`);
    if (!rows.length) add(`key ${key} has no rows`);
    for (const row of rows) {
      const id = idx.lemmaIds[row[0]];
      if (id === undefined) add(`${key}: lemma index ${row[0]} out of range`);
      else { used.add(row[0]); if (!idx.lemmas[id]) add(`${key}: lemma ${id} has no row`); }
      if (idx.codes[row[1]] === undefined) add(`${key}: code index ${row[1]} out of range`);
      for (const p of unpackStress(row[2])) {
        if (!Number.isInteger(p) || p < 0 || p >= key.length || !RU_VOWELS.includes(key[p])) add(`${key}: stress position ${p} is not a vowel`);
      }
    }
  }
  for (const id of idx.lemmaIds) {
    const row = idx.lemmas[id];
    if (!row) { add(`lemma id ${id} has no row`); continue; }
    if (!POS.has(row[2])) add(`${id}: unknown part of speech ${row[2]}`);
    if (id.split('|')[1] !== row[2]) add(`${id}: id and part of speech disagree`);
    if (stressPositions(row[0]).length && vowelCount(ruKey(row[0])) === 0) add(`${id}: stress on a word with no vowel`);
    if (!(row[4] >= 0)) add(`${id}: bad count`);
  }
  if (used.size !== idx.lemmaIds.length) add(`${idx.lemmaIds.length - used.size} lemma ids are used by no row`);
  for (const [folded, keys] of Object.entries(idx.yo)) {
    for (const k of keys) {
      if (!idx.forms[k]) add(`yo ${folded}: ${k} is not a key`);
      if (yoFold(k) !== folded) add(`yo ${folded}: ${k} does not fold to it`);
      if (!k.includes('ё')) add(`yo ${folded}: ${k} has no ё`);
    }
  }
  for (const k of Object.keys(idx.forms)) if (k.includes('ё') && !idx.yo[yoFold(k)]?.includes(k)) add(`${k} has ё and no yo entry`);
  return out;
}

describe('the feature priors (RU_PRIORS)', () => {
  it('counts feature bundles of the treebank per part of speech', () => {
    expect(RU_PRIORS.licence).toMatch(/CC BY-SA 4.0/);
    expect(RU_PRIORS.tokens).toBeGreaterThan(50_000);
    expect(Object.keys(RU_PRIORS.nominal)).toEqual(['ADJ', 'DET', 'NOUN', 'NUM', 'PRON', 'PROPN']);
    for (const [upos, m] of Object.entries(RU_PRIORS.nominal)) {
      expect(Object.keys(m), upos).toEqual([...Object.keys(m)].sort());
      for (const [k, n] of Object.entries(m)) {
        expect(Number.isInteger(n) && n > 0, `${upos} ${k}`).toBe(true);
        expect(k, upos).toMatch(/^(?:(?:Nom|Gen|Dat|Acc|Ins|Prep|Par|Voc|-)[|](?:Sing|Plur|-)|Short[|](?:Sing|Plur|-)|Cmp[|]-)$/);
      }
    }
    expect(RU_PRIORS.nominal.NOUN['Gen|Sing']).toBeGreaterThan(RU_PRIORS.nominal.NOUN['Gen|Plur']);
    expect(Object.keys(RU_PRIORS.verbal)).toEqual([...Object.keys(RU_PRIORS.verbal)].sort());
    for (const [k, n] of Object.entries(RU_PRIORS.verbal)) {
      expect(Number.isInteger(n) && n > 0, k).toBe(true);
      expect(k.split('|')).toHaveLength(5);
    }
    expect(RU_PRIORS.verbal['Inf|-|-|-|-']).toBeGreaterThan(100);
  });
});

describe('the form priors (RU_FORM_PRIORS)', () => {
  it('lists, for ambiguous forms, the treebank readings commonest first', () => {
    expect(RU_FORM_PRIORS.licence).toMatch(/CC BY-SA 4.0/);
    const keys = Object.keys(RU_FORM_PRIORS.forms);
    expect(keys.length).toBeGreaterThan(300);
    expect(keys).toEqual([...keys].sort());
    for (const [k, rows] of Object.entries(RU_FORM_PRIORS.forms)) {
      expect(k).toBe(ruKey(k));
      expect(rows.length).toBeGreaterThan(0);
      let total = 0;
      for (let i = 0; i < rows.length; i++) {
        const [lemma, upos, n] = rows[i];
        expect(Number.isInteger(n) && n > 0, k).toBe(true);
        expect(lemma, k).toBe(ruKey(lemma));
        expect(upos, k).toMatch(/^[A-Z]+$/);
        expect(['AUX', 'CCONJ'], k).not.toContain(upos);
        total += n;
        if (i > 0) expect(rows[i - 1][2] >= n, k).toBe(true);
      }
      expect(total, k).toBeGreaterThanOrEqual(3);
    }
    expect(RU_FORM_PRIORS.forms['это'][0].slice(0, 2)).toEqual(['это', 'PRON']);
  });
});

describe('the compiled core (RU_CORE)', () => {
  it('is a ru-core index with figures and sources', () => {
    expect(RU_CORE.schema).toBe(1);
    expect(RU_CORE.id).toBe('ru-core');
    expect(RU_CORE.source.licence).toMatch(/CC BY-SA 4\.0/);
    expect(RU_CORE.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(RU_CORE.stats?.keys).toBe(Object.keys(RU_CORE.forms).length);
    expect(RU_CORE.stats?.lemmas).toBe(RU_CORE.lemmaIds.length);
    expect(RU_CORE.stats?.tokenCoverage).toBeGreaterThan(0.3);
    expect(Buffer.byteLength(JSON.stringify(RU_CORE))).toBeLessThanOrEqual(760_000);
  });

  it('keeps the RussianFormIndex invariants', () => {
    expect(problems(RU_CORE)).toEqual([]);
  });

  it('holds no empty code, no case on an adverb, no dated row beside an undated one, no participle declension', () => {
    for (const [key, rows] of Object.entries(RU_CORE.forms)) {
      const undated = new Set<string>();
      for (const r of rows) if (!RU_CORE.codes[r[1]].split('|').includes('dated')) undated.add(RU_CORE.lemmaIds[r[0]]);
      for (const r of rows) {
        const tags = RU_CORE.codes[r[1]].split('|');
        const id = RU_CORE.lemmaIds[r[0]];
        expect(tags.join('|'), key).not.toBe('');
        expect(tags.includes('2'), key).toBe(false);
        if (id.split('|')[1] === 'ADV') expect(tags.some((t) => ['nominative', 'genitive', 'dative', 'accusative', 'instrumental', 'prepositional'].includes(t)), `${key} ${id}`).toBe(false);
        if (tags.includes('dated')) expect(undated.has(id), `${key} ${id}`).toBe(false);
        if (tags.includes('past') && tags.includes('plural')) expect(tags.some((t) => ['masculine', 'feminine', 'neuter'].includes(t)), `${key} ${id}`).toBe(false);
        expect(id.startsWith('годъ'), id).toBe(false);
      }
    }
  });

  it('reads everyday words on its own (the core seed)', () => {
    installRussianIndex(RU_CORE);
    for (const w of ['читает', 'читаю', 'прочитала', 'знаю', 'знает', 'стол', 'столе', 'спасибо', 'говорю', 'хочу', 'книгу', 'дома', 'идёт', 'пошёл', 'по-русски', 'пожалуйста']) {
      // по-русски is a headword of its own when the index holds it whole; the test needs it only if the core has the key
      if (w === 'по-русски' && !RU_CORE.forms[ruKey(w)]) continue;
      expect(lookupRussianForm(ruKey(w)).length, w).toBeGreaterThan(0);
    }
  });

  it('has the closed classes whole and the commonest lemmas', () => {
    const ids = new Set(RU_CORE.lemmaIds);
    for (const id of ['и|CONJ', 'не|PART', 'в|ADP', 'он|PRON', 'этот|DET', 'быть|VERB', 'книга|NOUN']) expect(ids.has(id), id).toBe(true);
    expect((RU_CORE.stats?.closedLemmas ?? 0)).toBeGreaterThan(150);
  });

  describe('through lookupRussianForm', () => {
    const read = (w: string): Array<{ lemma: string; pos: string; code: string; stress: number[]; viaYo: boolean }> => {
      installRussianIndex(RU_CORE);
      return lookupRussianForm(ruKey(w)).map((h) => ({ lemma: h.lemmaId.split('|')[0], pos: h.lemma[2], code: h.code, stress: h.stress, viaYo: h.viaYo }));
    };
    const has = (w: string, lemma: string, pos: string, codePart?: string): boolean => read(w).some((r) => r.lemma === lemma && r.pos === pos && (!codePart || r.code.split('|').includes(codePart)));

    it('reads the headword of a closed-class word with no table', () => {
      expect(has('и', 'и', 'CONJ')).toBe(true);
      expect(has('не', 'не', 'PART')).toBe(true);
      expect(has('в', 'в', 'ADP')).toBe(true);
    });
    it('reads the forms of a noun with the stress of the form', () => {
      const hits = read('книгу').filter((r) => r.lemma === 'книга');
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.some((r) => r.code === 'accusative|singular')).toBe(true);
      expect(hits[0].stress).toEqual([2]); // кни́гу: the vowel at index 2 ("и")
      expect(has('книги', 'книга', 'NOUN', 'genitive')).toBe(true);
    });
    it('reads the personal pronoun and its genitive', () => {
      expect(has('он', 'он', 'PRON', 'nominative')).toBe(true);
      expect(has('его', 'он', 'PRON', 'genitive')).toBe(true);
    });
    it('reads the forms of быть', () => {
      expect(has('был', 'быть', 'VERB', 'past')).toBe(true);
      expect(has('была', 'быть', 'VERB', 'feminine')).toBe(true);
      expect(has('буду', 'быть', 'VERB', 'future')).toBe(true);
    });
    it('reads the demonstrative', () => {
      expect(has('этот', 'этот', 'DET')).toBe(true);
      expect(has('этого', 'этот', 'DET', 'genitive')).toBe(true);
    });
    it('a form written with е reaches the ё-form through the yo map, and both readings are kept', () => {
      const hits = read('все');
      expect(hits.some((r) => !r.viaYo)).toBe(true);
      expect(hits.some((r) => r.viaYo)).toBe(true);
      const direct = hits.findIndex((r) => !r.viaYo);
      const restored = hits.findIndex((r) => r.viaYo);
      expect(direct).toBeLessThan(restored);
    });
    it('a word the core does not hold has no reading', () => {
      expect(read('вхкгцзжх')).toEqual([]);
    });
  });
});

const MANIFEST = path.resolve('public/lexicon/ru/standard/manifest.json');

describe.skipIf(!fs.existsSync(MANIFEST))('the sharded index on disk', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { schema: number; id: string; built: string; shards: Record<string, { file: string; bytes: number; keys: number }>; stats?: Record<string, number> };
  const dir = path.dirname(MANIFEST);
  const readShard = (prefix: string): RussianFormIndex => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, manifest.shards[prefix].file))).toString('utf8')) as RussianFormIndex;
  /** The longest listed prefix of the letters, else '_': what the shared loader does. */
  const shardFor = (key: string): string => {
    const letters = ruShardLetters(key);
    for (let n = Math.min(3, letters.length); n >= 1; n--) if (manifest.shards[letters.slice(0, n)]) return letters.slice(0, n);
    return '_';
  };

  it('has a manifest the loader accepts', () => {
    expect(manifest.schema).toBe(1);
    expect(manifest.id).toBe('kaikki-ru-tables');
    expect(Object.keys(manifest.shards).length).toBeGreaterThan(20);
    for (const [prefix, s] of Object.entries(manifest.shards)) {
      expect(s.file).toBe(`${prefix}.json.gz`);
      expect(fs.statSync(path.join(dir, s.file)).size).toBe(s.bytes);
    }
  });

  it('a shard says what the manifest says and keeps the index invariants', () => {
    const prefix = shardFor('книгу');
    const idx = readShard(prefix);
    expect(idx.id).toBe(manifest.id);
    expect(idx.shard).toBe(prefix);
    expect(Object.keys(idx.forms).length).toBe(manifest.shards[prefix].keys);
    expect(problems(idx)).toEqual([]);
    for (const k of Object.keys(idx.forms)) {
      const letters = ruShardLetters(k);
      expect(prefix === '_' ? letters === '' : letters.startsWith(prefix), `${k} in shard ${prefix}`).toBe(true);
      expect(shardFor(k), `${k} routes to its own shard`).toBe(prefix);
    }
  });

  it('a shard installed beside the core gives the readings of a key', () => {
    installRussianIndex(RU_CORE);
    installRussianIndex(readShard(shardFor('прочитала')));
    const hits = lookupRussianForm('прочитала');
    expect(hits.some((h) => h.lemmaId === 'прочитать|VERB' && h.code === 'feminine|past|singular' && h.lemma[3].includes('Aspect=Perf'))).toBe(true);
    // the same reading from the core and from the shard is listed once
    const sigs = hits.map((h) => `${h.lemmaId}\t${h.code}\t${h.stress.join(',')}`);
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it('the yo map of a shard reaches ё-forms of the same shard', () => {
    const idx = readShard(shardFor('шел'));
    expect(idx.yo['шел']).toContain('шёл');
    expect(shardFor('шёл')).toBe(shardFor('шел'));
  });
});
