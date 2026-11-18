// @vitest-environment node
/**
 * The Russian pack (packages/language-packs/src/packs/ru.ts): what the manifest, the tutorial and the catalogue say, and that the pack's
 * claims are true of the real analyser (with its compiled core alone, as a validation case must hold) and, when the built dictionary is
 * on disk, of the real dictionary. The dictionary checks are skipped, not failed, on a machine without the generated data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KAIKKI_ATTRIBUTION, LANGUAGE_CATALOGUE, LEVEL_LABEL, MIN_VALIDATION_CASES, PACKS, PACK_EVIDENCE, RU_DICTIONARY, RU_TUTORIAL, RU_VALIDATION, RU_VERSION, TUTORIALS,
  catalogueEntry, createPackRuntime, installPack, installablePacks, levelOf, packCapabilities, packFor, runCase, validateManifest, validationOf, verifyInstalled,
} from '../../packages/language-packs/src';
import { RU_GRAMMAR_CONSTRUCTIONS, RU_GRAMMAR_FEATURES } from '../../packages/language-packs/src/packs/ru-grammar';
import { ruAdapter, RU_ANALYZER_VERSION } from '../../src/adapters/ru';
import { RU_FEATURES } from '../../src/adapters/russian/tags';
import { RU_CONSTRUCTIONS } from '../../src/adapters/russian/constructions';
import { RU_CORE } from '../../src/adapters/russian/generated/core';
import { alphabetDeckRows, RU_ALPHABET } from '../../src/adapters/russian/alphabet';
import { HAND_LETTERS } from '../../packages/goreview/app/alphabetLetters';
import { BASE, diskFetch, memoryStorage } from './helpers';

const ru = PACKS.ru;
const DICT = path.resolve(__dirname, '../../public/dict/ru/manifest.json');
const LEXICON = path.resolve(__dirname, '../../public/lexicon/ru/standard/manifest.json');

describe('the Russian manifest', () => {
  it('is in the registry, validates, and is installable at the experimental level', () => {
    expect(packFor('ru')).toBe(ru);
    expect(ru).toMatchObject({ packId: 'pack:ru', languageId: 'ru', scriptId: 'Cyrl', varietyId: 'ru-RU', status: 'installable', level: 'experimental', version: RU_VERSION });
    expect(validateManifest(ru)).toEqual([]);
    expect(levelOf(ru)).toBe('experimental');
    expect(LEVEL_LABEL[levelOf(ru)]).toBe('experimental, unreviewed');
    expect(validationOf(ru)).toBe('experimental');
    expect(installablePacks().map((p) => p.packId)).toContain('pack:ru');
    expect(ru.identity).toMatchObject({ name: 'Russian', nativeName: 'Русский', direction: 'ltr' });
  });

  it('names the analyser it was written for, and the analyser has that version', () => {
    expect(ru.analyzer.id).toBe(`adapter-ru@${RU_VERSION}`);
    expect(RU_ANALYZER_VERSION).toBe(RU_VERSION);
    expect(ruAdapter.version).toBe(RU_VERSION);
    expect(ruAdapter).toMatchObject({ lang: 'ru', script: 'Cyrl' });
  });

  it('does not claim production readiness: machine-drafted, unreviewed, no recordings, a remote voice only with consent and a key', () => {
    expect(ru.rights.reviewStatus).toBe('machine-drafted');
    const text = ru.rights.provenance.join('\n');
    expect(text).toMatch(/^Experimental, installable at a deliberately minimal level and not production-ready/);
    expect(text).toMatch(/Thin: /);
    expect(text).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
    expect(text).toContain('The orientation (tutorial/ru) is minimal and AI-drafted for this pack and is not reviewed');
    expect(text).not.toMatch(/(?<!Nothing in this pack |nothing )has been reviewed by a (native speaker|Russianist)/);
    expect(text).toContain('CC BY-SA 4.0');
    expect(ru.pronunciation).toMatchObject({ recordings: 'none' });
    expect(ru.pronunciation.remoteVoice.requiresConsentAndKey).toBe(true);
  });

  it('lists one variety, Modern Standard Russian, and says what is not Russian here', () => {
    expect(ru.varieties.map((v) => [v.varietyId, v.analysed])).toEqual([['ru-RU', true]]);
    expect(ru.varieties[0].note).toMatch(/Ukrainian, Belarusian, Bulgarian and Serbian are other languages/);
  });

  it('declares the shared kaikki dictionary at dict/ru/ with the attribution the installer insists on', () => {
    expect(ru.lexical.dictionary).toMatchObject({ id: RU_DICTIONARY.id, baseUrl: 'dict/ru/', entries: RU_DICTIONARY.entries, attribution: KAIKKI_ATTRIBUTION });
  });

  it.skipIf(!fs.existsSync(DICT))('declares exactly the dictionary that is built (public/dict/ru/manifest.json)', () => {
    const built = JSON.parse(fs.readFileSync(DICT, 'utf8')) as { id: string; lang: string; entries: number; hasFrequency: boolean; attribution: string };
    expect({ id: built.id, entries: built.entries, frequency: built.hasFrequency }).toEqual(RU_DICTIONARY);
    expect(built.lang).toBe('ru');
    expect(built.attribution).toBe(KAIKKI_ATTRIBUTION);
  });

  it.skipIf(!fs.existsSync(LEXICON))('the sharded form index on disk is the one the compiled core was cut from', () => {
    const built = JSON.parse(fs.readFileSync(LEXICON, 'utf8')) as { id: string; built: string; source: { url: string; licence: string } };
    expect(built.id).toBe('kaikki-ru-tables');
    expect(built.built).toBe(RU_CORE.built);
    expect(built.source.url).toBe(RU_CORE.source.url);
    expect(built.source.licence).toMatch(/CC BY-SA 4\.0/);
  });
});

// The pack runtime as the extension's worker and GoReview use it, over the dictionary files on disk (public/dict/ru).
describe.skipIf(!fs.existsSync(DICT))('installing the pack and reading the real dictionary', () => {
  it('installs from the files on disk with the real analyser: the dictionary, a shard, and every validation case', async () => {
    const storage = memoryStorage();
    const r = await installPack(ru, { fetch: diskFetch(), baseUrl: BASE, storage, adapter: ruAdapter, now: () => '2026-11-18T08:00:00.000Z' });
    if (!r.ok) throw new Error(`${r.reason}: ${r.detail}`);
    expect(r.verified.validation).toHaveLength(ru.validation.length);
    expect(r.validationFailures).toBe(0);
    expect(await verifyInstalled(ru, storage)).toMatchObject({ installed: true, current: true, validationFailures: 0 });
  });

  it('glosses a headword, and an inflected form through its form-of relation, with the Wiktionary attribution', async () => {
    const rt = createPackRuntime(ru, { fetch: diskFetch(), baseUrl: BASE, adapter: ruAdapter });
    const book = await rt.gloss('книга', 'NOUN');
    expect(book?.attribution).toBe(KAIKKI_ATTRIBUTION);
    expect(book?.senses.map((s) => s.gloss)).toContain('book');
    // книгу is filed as "accusative singular of книга": one hop to the headword, and the result says through which form
    const form = await rt.gloss('книгу', 'NOUN');
    expect(form?.senses.map((s) => s.gloss)).toContain('book');
    expect(form?.via).toMatchObject({ lemma: 'книга' });
    // a verb form whose page names its lemma with an aspect label ("стать pf") still reaches the headword
    const became = await rt.gloss('стали', 'VERB');
    expect(became?.via).toMatchObject({ lemma: 'стать' });
    expect(became?.senses.length ?? 0).toBeGreaterThan(0);
  });

  it('without the analyser (the extension’s worker holds none) a form as a page writes it still finds its entry', async () => {
    // the worker normalises with NFC + lower case; the dictionary keys are the Russian key, which is the same on text without stress marks
    const rt = createPackRuntime(ru, { fetch: diskFetch(), baseUrl: BASE });
    const g = await rt.gloss('прочитать', 'VERB', ['прочитала', 'Прочитала']);
    expect(g?.senses.map((s) => s.gloss).join(' | ')).toMatch(/to read/);
    const yo = await rt.gloss('ещё', 'ADV');
    expect(yo?.senses.length ?? 0).toBeGreaterThan(0);
  });
});

describe('the Russian validation cases are what the analyser really reads, with its compiled core alone', () => {
  it('has at least the required number of cases, each naming a word of its sentence', () => {
    expect(ru.validation).toEqual(RU_VALIDATION);
    expect(ru.validation.length).toBeGreaterThanOrEqual(MIN_VALIDATION_CASES);
    expect(new Set(ru.validation.map((c) => c.id)).size).toBe(ru.validation.length);
    for (const c of ru.validation) {
      expect(c.sentence, c.id).toBeTruthy();
      expect(c.sentence, c.id).toContain(c.surface);
    }
  });

  it.each(RU_VALIDATION.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const r = runCase(ruAdapter, c);
    expect(r.got ?? 'as stated', `${c.surface} in «${c.sentence}»`).toBe('as stated');
    expect(r.pass).toBe(true);
  });

  it('states the three honest outcomes: a sure reading, readings that compete, and no reading at all', () => {
    const statuses = new Set(RU_VALIDATION.map((c) => (c.expect.readings === 'none' ? 'none' : c.expect.status)));
    expect([...statuses].sort()).toEqual(['conflicted', 'high-confidence', 'none', 'provisional']);
  });
});

describe('the grammar tables of the manifest are the analyser’s own', () => {
  it('ru-grammar.ts is a faithful copy of RU_FEATURES and RU_CONSTRUCTIONS (run scripts/ru-pack-grammar.mts after changing them)', () => {
    expect(RU_GRAMMAR_FEATURES).toEqual(RU_FEATURES);
    expect(RU_GRAMMAR_CONSTRUCTIONS).toEqual(RU_CONSTRUCTIONS);
    expect(ru.grammar.features).toEqual(RU_GRAMMAR_FEATURES);
    expect(ru.grammar.constructions).toEqual(RU_GRAMMAR_CONSTRUCTIONS);
  });

  it('explains the six cases, and does not teach that perfective means finished', () => {
    const cases = ru.grammar.features.find((f) => f.key === 'Case')!;
    expect(Object.keys(cases.values)).toEqual(expect.arrayContaining(['Nom', 'Gen', 'Dat', 'Acc', 'Ins', 'Prep']));
    const aspect = ru.grammar.features.find((f) => f.key === 'Aspect')!;
    expect(Object.keys(aspect.values).sort()).toEqual(['Imp', 'Perf']);
    expect(aspect.explain).toMatch(/whole/);
    expect(aspect.explain).not.toMatch(/perfective (verbs? )?(means?|is|are) (a )?(finished|completed) action/i);
  });

  it('every feature key the validation cases expect is one the manifest explains', () => {
    const explained = new Set(ru.grammar.features.map((f) => f.key));
    for (const c of RU_VALIDATION) for (const k of Object.keys(c.expect.features ?? {})) expect(explained.has(k), `${c.id}: ${k}`).toBe(true);
  });
});

describe('the Alphabet deck', () => {
  it('GoReview’s Russian letters are the analyser’s letter table: all 33, in alphabet order (run scripts/ru-alphabet-deck.mts after changing it)', () => {
    expect(HAND_LETTERS.ru).toEqual(alphabetDeckRows());
    expect(HAND_LETTERS.ru).toHaveLength(33);
    expect(HAND_LETTERS.ru.map(([glyph]) => glyph)).toEqual(RU_ALPHABET.map((l) => `${l.upper} ${l.lower}`));
    expect(HAND_LETTERS.ru.map(([glyph]) => glyph.slice(-1)).join('')).toBe('абвгдеёжзийклмнопрстуфхцчшщъыьэюя');
    for (const [glyph, back] of HAND_LETTERS.ru) expect(back.length, glyph).toBeLessThanOrEqual(140);
  });
});

describe('the tutorial, the catalogue and the capability report', () => {
  it('the orientation is registered and the manifest states its length', () => {
    expect(TUTORIALS.ru).toBe(RU_TUTORIAL);
    expect(RU_TUTORIAL).toMatchObject({ ref: 'tutorial/ru', languageId: 'ru', reviewed: false, skippable: true });
    expect(ru.tutorial).toEqual({ ref: RU_TUTORIAL.ref, estimatedMinutes: RU_TUTORIAL.estimatedMinutes, skippable: true });
    expect(RU_TUTORIAL.estimatedMinutes).toBe(RU_TUTORIAL.steps.reduce((n, s) => n + s.estimatedMinutes, 0));
  });

  it('the practice lookup of the orientation is a word the compiled core reads with confidence', () => {
    const practice = RU_TUTORIAL.steps.flatMap((s) => (s.practice ? [s.practice] : []));
    expect(practice.length).toBeGreaterThan(0);
    for (const p of practice) {
      const tokens = ruAdapter.tokenize(p.sentence);
      const hit = ruAdapter.analyze(tokens).find((a) => a.token.surface === p.target);
      expect(hit?.candidates[0]?.confidence ?? 0, `${p.target} in «${p.sentence}»`).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('is offered in the language picker as Russian, written in Cyrillic', () => {
    const entry = catalogueEntry('ru');
    expect(entry).toMatchObject({ languageId: 'ru', name: 'Russian', nativeName: 'Русский', scriptId: 'Cyrl', scriptName: 'Cyrillic' });
    expect(LANGUAGE_CATALOGUE.map((e) => e.languageId)).toContain('ru');
  });

  it('the measured figures in the evidence table are the committed report’s own (docs/russian/eval.json), strict, on held-out human gold', () => {
    const report = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../docs/russian/eval.json'), 'utf8')) as { analyzer: string; treebanks: Record<string, { tally: { n: number; lemma1Strict: number } }> };
    expect(report.analyzer).toBe(`adapter-ru@${RU_VERSION}`);
    const rows = PACK_EVIDENCE.ru.lemmaMeasurements;
    expect(rows.map((m) => m.id)).toEqual(['ud-gsd-test', 'ud-taiga-test', 'ud-pud']);
    for (const [id, key] of [['ud-gsd-test', 'gsd-test'], ['ud-taiga-test', 'taiga-test'], ['ud-pud', 'pud']] as const) {
      const m = rows.find((r) => r.id === id)!;
      const t = report.treebanks[key].tally;
      expect(m, id).toMatchObject({ goldKind: 'human-treebank', heldOut: true, items: t.n, source: 'docs/russian/eval.json' });
      expect(m.lemmaAccuracy, id).toBe(Math.round((t.lemma1Strict / t.n) * 10000) / 100);
    }
    // measured, and below the bar for "dependable" on every corpus: the report says limited, and says why
    const lemma = packCapabilities('ru')!.lemma;
    expect(lemma.quality).toBe('limited');
    expect(lemma.note).toContain('Wiktionary’s Russian inflection tables and form-of pages (923,009 forms)');
    expect(lemma.note).toMatch(/The first reading had the right lemma 88\.4% on Russian Wikipedia, blog and news sentences against the UD Russian-GSD treebank \(test split\) \(8,578 words\)/);
  });

  it.skipIf(!fs.existsSync(LEXICON))('the form count in the evidence table is the built index’s', () => {
    const built = JSON.parse(fs.readFileSync(LEXICON, 'utf8')) as { stats: { keys: number } };
    expect(PACK_EVIDENCE.ru.lemmaSources.find((s) => s.id === 'kaikki-ru-tables')?.size?.count).toBe(built.stats.keys);
  });

  it('the capability report says what is supported and that pronunciation notes exist', () => {
    const c = packCapabilities('ru')!;
    expect(c.languageId).toBe('ru');
    expect(c.lemma.analyserLevel).toBe('seed-only');
    expect(c.dictionary).toMatchObject({ declared: true, id: RU_DICTIONARY.id, entries: RU_DICTIONARY.entries });
    expect(ruAdapter.pronunciation(ruAdapter.tokenize('книгу')[0]).notes?.length ?? 0).toBeGreaterThan(0);
  });
});
