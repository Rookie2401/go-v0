// @vitest-environment node
/**
 * The Arabic pack (packages/language-packs/src/packs/ar.ts): what the manifest, the tutorial and the catalogue say, and that the pack's
 * claims are true of the real analyser (with its compiled core alone, as a validation case must hold) and, when the built dictionary is
 * on disk, of the real dictionary. The dictionary checks are skipped, not failed, on a machine without the generated data.
 * One key of the Arabic dictionary holds several words written alike (عِلْم, عَلَم, عَلِمَ are all "علم"): the second half of this file checks that a
 * vocalized lemma is read with ITS entry (the adapter's `headMatches`, used by the pack runtime and by the card's and GoReview's `pickRecord`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AR_DICTIONARY, AR_TUTORIAL, AR_VALIDATION, AR_VERSION, KAIKKI_ATTRIBUTION, LANGUAGE_CATALOGUE, LEVEL_LABEL, MIN_VALIDATION_CASES, PACKS, PACK_EVIDENCE, TUTORIALS,
  catalogueEntry, createPackRuntime, installPack, installablePacks, levelOf, packCapabilities, packFor, runCase, validateManifest, validationOf, verifyInstalled,
} from '../../packages/language-packs/src';
import { AR_GRAMMAR_CONSTRUCTIONS, AR_GRAMMAR_FEATURES } from '../../packages/language-packs/src/packs/ar-grammar';
import { arAdapter } from '../../src/adapters/ar';
import { AR_FEATURES } from '../../src/adapters/arabic/tags';
import { AR_CONSTRUCTIONS } from '../../src/adapters/arabic/constructions';
import { AR_ALPHABET } from '../../src/adapters/arabic/alphabet';
import { HAND_LETTERS } from '../../packages/goreview/app/alphabetLetters';
import { headTest, pickRecord } from '../../packages/golearn-extension/src/content/enrich';
import { pickRecord as goreviewPick, headTest as goreviewHead } from '../../packages/goreview/src/facts/paradigm-table';
import { learningVarietiesOf, lexicalFamilyKey, selectableVarietiesOf } from '../../packages/repository-contract/src/varieties';
import { BASE, diskFetch, memoryStorage } from './helpers';

const ar = PACKS.ar;
const DICT = path.resolve(__dirname, '../../public/dict/ar/manifest.json');

describe('the Arabic manifest', () => {
  it('is in the registry, validates, and is installable at the experimental level', () => {
    expect(packFor('ar')).toBe(ar);
    expect(ar).toMatchObject({ packId: 'pack:ar', languageId: 'ar', scriptId: 'Arab', varietyId: 'ar-msa', status: 'installable', level: 'experimental', version: AR_VERSION });
    expect(validateManifest(ar)).toEqual([]);
    expect(levelOf(ar)).toBe('experimental');
    expect(LEVEL_LABEL[levelOf(ar)]).toBe('experimental, unreviewed');
    expect(validationOf(ar)).toBe('experimental');
    expect(installablePacks().map((p) => p.packId)).toContain('pack:ar');
    expect(ar.identity).toMatchObject({ name: 'Arabic', nativeName: 'العربية', direction: 'rtl' });
  });

  it('names the analyser it was written for, and the analyser has that version', () => {
    expect(ar.analyzer.id).toBe(`adapter-ar@${AR_VERSION}`);
    expect(AR_VERSION).toBe(arAdapter.version);
    expect(arAdapter.lang).toBe('ar');
    expect(arAdapter.script).toBe('Arab');
  });

  it('does not claim production readiness: machine-drafted, unreviewed, no recordings, a remote voice only with consent and a key', () => {
    expect(ar.rights.reviewStatus).toBe('machine-drafted');
    expect(ar.pronunciation.recordings).toBe('none');
    expect(ar.pronunciation.remoteVoice).toMatchObject({ provider: 'azure', requiresConsentAndKey: true });
    const text = ar.rights.provenance.join(' ');
    expect(text).toMatch(/not production-ready/);
    expect(text).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
    expect(text).toMatch(/Quranic Arabic Corpus morphology is not shipped/);
    expect(text).toMatch(/CAMeL Tools data, the Universal Dependencies Arabic PADT treebank and Lane’s Lexicon are not used/);
  });

  it('lists the two learning varieties as analysed, Modern Standard first, and the six dialects as recognised only', () => {
    expect(ar.varieties.filter((v) => v.analysed).map((v) => v.varietyId)).toEqual(['ar-msa', 'ar-cla']);
    expect(ar.varieties.filter((v) => !v.analysed).map((v) => v.varietyId)).toEqual(['arz', 'apc', 'afb', 'acm', 'ary', 'apd']);
    // the same ids and the same default as the Repository's variety registry (varieties.ts)
    expect(learningVarietiesOf('ar').map((v) => v.id)).toEqual(ar.varieties.map((v) => v.varietyId));
    expect(selectableVarietiesOf('ar').map((v) => v.id)).toEqual(['ar-msa', 'ar-cla']);
    expect(ar.varieties[0].varietyId).toBe(ar.varietyId);
  });

  it('declares the shared kaikki dictionary at dict/ar/ with the attribution the installer insists on', () => {
    expect(ar.lexical.dictionary).toMatchObject({ id: AR_DICTIONARY.id, baseUrl: 'dict/ar/', entries: AR_DICTIONARY.entries, frequency: false, attribution: KAIKKI_ATTRIBUTION });
  });
});

describe.skipIf(!fs.existsSync(DICT))('the manifest and the built dictionary agree', () => {
  it('the dictionary id and entry count in the pack are the built dictionary’s own', () => {
    const built = JSON.parse(fs.readFileSync(DICT, 'utf8')) as { id: string; entries: number; hasFrequency: boolean };
    expect(AR_DICTIONARY).toEqual({ id: built.id, entries: built.entries, frequency: built.hasFrequency });
  });

  it('installs from the files on disk with the real analyser: the dictionary and every validation case', async () => {
    const storage = memoryStorage();
    const r = await installPack(ar, { fetch: diskFetch(), baseUrl: BASE, storage, adapter: arAdapter, now: () => '2026-11-25T08:00:00.000Z' });
    if (!r.ok) throw new Error(`${r.reason}: ${r.detail}`);
    expect(r.verified.validation).toHaveLength(ar.validation.length);
    expect(r.validationFailures).toBe(0);
    expect(await verifyInstalled(ar, storage)).toMatchObject({ installed: true, current: true, validationFailures: 0 });
  });
});

describe('the Arabic validation cases are what the analyser really reads, with its compiled core alone', () => {
  it('has at least the required number of cases, each naming a word of its sentence', () => {
    expect(AR_VALIDATION.length).toBeGreaterThanOrEqual(MIN_VALIDATION_CASES);
    expect(new Set(AR_VALIDATION.map((c) => c.id)).size).toBe(AR_VALIDATION.length);
    for (const c of AR_VALIDATION) if (c.sentence) expect(c.sentence, c.id).toContain(c.surface);
    for (const c of AR_VALIDATION) {
      const r = runCase(arAdapter, c);
      expect(r.pass, `${c.id}: ${r.got}`).toBe(true);
    }
  });

  it('states the three honest outcomes: a sure reading, readings that compete, and no reading at all', () => {
    const statuses = new Set(AR_VALIDATION.map((c) => c.expect.status ?? (c.expect.readings === 'none' ? 'none' : 'unstated')));
    expect(statuses.has('high-confidence')).toBe(true);
    expect(statuses.has('conflicted')).toBe(true);
    expect(statuses.has('none')).toBe(true);
  });

  it('the tutorial’s practice lookup is one of the pack’s own validation sentences, and its word is read with confidence', () => {
    const practice = AR_TUTORIAL.steps.find((s) => s.id === 'practice-lookup')!.practice!;
    const mine = AR_VALIDATION.find((c) => c.surface === practice.target && c.sentence === practice.sentence);
    expect(mine, 'the practice sentence is a validation sentence').toBeDefined();
    expect(mine!.expect.status).toBe('high-confidence');
  });
});

describe('the grammar tables of the manifest are the analyser’s own', () => {
  it('ar-grammar.ts is a faithful copy of AR_FEATURES and AR_CONSTRUCTIONS (run scripts/ar-pack-grammar.mts after changing them)', () => {
    expect(AR_GRAMMAR_FEATURES.map((f) => [f.key, f.label, f.values])).toEqual(AR_FEATURES.map((f) => [f.key, f.label, f.values]));
    expect(AR_GRAMMAR_CONSTRUCTIONS.map((c) => [c.id, c.label, c.explain])).toEqual(AR_CONSTRUCTIONS.map((c) => [c.id, c.label, c.explain]));
    expect(ar.grammar.features).toBe(AR_GRAMMAR_FEATURES);
    expect(AR_GRAMMAR_FEATURES.every((f) => f.explain.length > 40)).toBe(true);
  });

  it('every feature key the validation cases expect is one the manifest explains', () => {
    const keys = new Set(AR_GRAMMAR_FEATURES.map((f) => f.key));
    for (const c of AR_VALIDATION) for (const k of Object.keys(c.expect.features ?? {})) expect(keys.has(k), `${c.id}: ${k}`).toBe(true);
  });
});

describe('the Alphabet deck', () => {
  it('GoReview’s Arabic letters are the analyser’s letter table: the 28 bare letters in order, the back saying the name and then the sound (run scripts/ar-alphabet-deck.mts after changing it)', () => {
    const rows = HAND_LETTERS.ar;
    expect(rows.map((r) => r[0])).toEqual(AR_ALPHABET.map((l) => l.letter));
    expect(rows).toHaveLength(28);
    for (const [i, l] of AR_ALPHABET.entries()) {
      expect(rows[i][1].startsWith(`${l.name} (${l.nameTranslit}): ${l.sound}`), l.letter).toBe(true);
      expect(rows[i][1].length, l.letter).toBeLessThanOrEqual(140);
    }
  });
});

describe('the tutorial, the catalogue and the capability report', () => {
  it('the orientation is registered and the manifest states its length', () => {
    expect(TUTORIALS.ar).toBe(AR_TUTORIAL);
    expect(ar.tutorial).toEqual({ ref: AR_TUTORIAL.ref, estimatedMinutes: AR_TUTORIAL.estimatedMinutes, skippable: true });
  });

  it('is offered in the language picker as Arabic, written in the Arabic script, with its two varieties', () => {
    const e = catalogueEntry('ar')!;
    expect(LANGUAGE_CATALOGUE.map((x) => x.languageId)).toContain('ar');
    expect(e).toMatchObject({ name: 'Arabic', nativeName: 'العربية', scriptId: 'Arab', scriptName: 'Arabic', packIds: ['pack:ar'] });
    expect(e.varieties?.map((v) => v.id)).toEqual(['ar-msa', 'ar-cla']);
  });

  it('the evidence says what the figures are: a machine-annotated development set, not held out, not a treebank', () => {
    const ev = PACK_EVIDENCE.ar;
    expect(ev.lemmaMeasurements.length).toBeGreaterThan(0);
    for (const m of ev.lemmaMeasurements) {
      expect(m.goldKind, m.id).toBe('ai-labelled');
      expect(m.heldOut, m.id).toBe(false);
      expect(m.gold, m.id).toMatch(/machine/);
      expect(m.source, m.id).toBe('docs/arabic/EVAL.md');
    }
    // the figures are the ones docs/arabic/EVAL.md prints for the adapter
    const eval_ = fs.readFileSync(path.resolve(__dirname, '../../docs/arabic/EVAL.md'), 'utf8');
    expect(eval_).toContain('91.5%');
    expect(eval_).toContain('96.6%');
  });

  it('the capability report says what is supported and does not lift the level on a machine-annotated set', () => {
    const c = packCapabilities('ar')!;
    expect(c).toMatchObject({ languageId: 'ar', analyzer: 'adapter', analyzerId: `adapter-ar@${AR_VERSION}` });
    expect(c.lemma.quality).toBe('limited');
    expect(c.lemma.analyserLevel).toBe('seed-only');
    expect(ar.pronunciation.notesAvailable).toBe(true);
    expect(arAdapter.pronunciation(arAdapter.tokenize('كَتَبَ')[0]).notes?.length ?? 0).toBeGreaterThan(0);
  });
});

// ───────────────────────────── one key, several words ─────────────────────────────

describe('the Repository’s family key for an Arabic lemma', () => {
  it('ignores the vowel marks, shadda, the dagger alif and the tatweel; and changes no other language', () => {
    expect(lexicalFamilyKey('ar', 'lemma:ar:عِلْم:NOUN')).toBe('ar:علم:NOUN');
    expect(lexicalFamilyKey('ar', 'lemma:ar:عَلَّمَ:VERB')).toBe('ar:علم:VERB');
    expect(lexicalFamilyKey('ar', 'lemma:ar:كِتَاب:NOUN')).toBe(lexicalFamilyKey('ar', 'lemma:ar:كتاب:NOUN'));
    // a hamza seat keeps its hamza
    expect(lexicalFamilyKey('ar', 'lemma:ar:أَسَد:NOUN')).toBe('ar:أسد:NOUN');
    // Hebrew and Greek are exactly as they were
    expect(lexicalFamilyKey('he', 'lemma:he:מֶלֶךְ:NOUN')).toBe('he:מלך:NOUN');
    expect(lexicalFamilyKey('el', 'lemma:el:λόγος:NOUN')).toBe('el:λογοσ:NOUN');
    expect(lexicalFamilyKey('el', 'form:el:Λόγος')).toBe('el:λογοσ');
  });
});

describe('a vocalized lemma is read with its own dictionary entry', () => {
  it('the adapter says which word of one key a lemma is, and cannot tell for a lemma without vowels', () => {
    const h = arAdapter.headMatches!;
    expect(h('عِلْم', { vocalized: 'عِلْم' }, 'NOUN')).toBe(true);
    expect(h('عِلْم', { vocalized: 'عَلَم' }, 'NOUN')).toBe(false);
    expect(h('عِلْم', { romanization: 'ʕilm' }, 'NOUN')).toBe(true);
    expect(h('عِلْم', { romanization: 'ʕalam' }, 'NOUN')).toBe(false);
    expect(h('عَلِمَ', { romanization: 'ʕalima' }, 'VERB')).toBe(true);
    expect(h('علم', { vocalized: 'عِلْم' }, 'NOUN')).toBeUndefined();
    expect(h('عِلْم', {}, 'NOUN')).toBeUndefined();
  });

  it('the card’s and GoReview’s pickRecord take the record whose canonical form is the lemma, and the first one for any other language', () => {
    const rec = (head: string, p: string) => ({ w: 'علم', p, f: [{ f: head, t: ['canonical'] }] });
    const records = [rec('عَلِمَ', 'VERB'), rec('عَلَم', 'NOUN'), rec('عِلْم', 'NOUN')];
    expect(pickRecord(records, 'NOUN')?.f?.[0].f).toBe('عَلَم'); // before: the first noun, whatever the lemma
    expect(pickRecord(records, 'NOUN', headTest(arAdapter, 'عِلْم'))?.f?.[0].f).toBe('عِلْم');
    expect(goreviewPick(records, 'NOUN', goreviewHead(arAdapter, 'عِلْم'))?.f?.[0].f).toBe('عِلْم');
    expect(pickRecord(records, 'VERB', headTest(arAdapter, 'عَلِمَ'))?.f?.[0].f).toBe('عَلِمَ');
    // a lemma no record has: nothing is set aside, the old choice stands
    expect(pickRecord(records, 'NOUN', headTest(arAdapter, 'عُلْم'))?.f?.[0].f).toBe('عَلَم');
    // a language whose adapter has no `headMatches` is chosen exactly as before
    expect(headTest({}, 'عِلْم')).toBeUndefined();
    expect(pickRecord(records, 'NOUN', undefined)?.f?.[0].f).toBe('عَلَم');
  });
});

describe.skipIf(!fs.existsSync(DICT))('the pack runtime over the real Arabic dictionary', () => {
  const rt = () => createPackRuntime(ar, { fetch: diskFetch(), baseUrl: BASE, adapter: arAdapter });

  it('gloss(عِلْم) is knowledge, not the senses of عَلَم (flag) or of the verbs written alike', async () => {
    const g = await rt().gloss('عِلْم', 'NOUN');
    const glosses = g!.senses.map((s) => s.gloss);
    expect(glosses.join(' | ')).toMatch(/^knowledge/);
    expect(glosses.join(' | ')).not.toMatch(/flag|harelip|sign, token/);
    const flag = (await rt().gloss('عَلَم', 'NOUN'))!.senses.map((s) => s.gloss).join(' | ');
    expect(flag).toMatch(/flag/);
    expect(flag).not.toMatch(/^knowledge/);
    const verb = (await rt().gloss('عَلِمَ', 'VERB'))!.senses.map((s) => s.gloss).join(' | ');
    expect(verb).toMatch(/to know/);
    expect(verb).not.toMatch(/to teach/);
  });

  it('the bare key is still every word written alike: a lemma without vowels cannot be told apart, and nothing is hidden', async () => {
    const g = await rt().gloss('علم', 'NOUN');
    const glosses = g!.senses.map((s) => s.gloss).join(' | ');
    expect(glosses).toMatch(/knowledge/);
    expect(glosses).toMatch(/flag/);
  });

  it('entry(كَتَبَ) is the verb’s own record, with the verb’s table', async () => {
    const e = await rt().entry('كَتَبَ', 'VERB');
    expect(e!.records.length).toBeGreaterThan(0);
    for (const r of e!.records) expect(r.f!.find((f) => f.t.includes('canonical'))?.f).toBe('كَتَبَ');
    const rows = e!.records[0].f!.map((f) => f.f);
    expect(rows).toContain('يَكْتُبُ');
    const noun = await rt().entry('كِتَاب', 'NOUN');
    for (const r of noun!.records) expect(r.f!.find((f) => f.t.includes('canonical'))?.f).toBe('كِتَاب');
  });

  it('entry(عِلْم) is the noun knowledge alone; the key’s other words come back for the bare key', async () => {
    const mine = await rt().entry('عِلْم', 'NOUN');
    expect(mine!.records.map((r) => r.f!.find((f) => f.t.includes('canonical'))?.f)).toEqual(['عِلْم']);
    const all = await rt().entry('علم', 'NOUN');
    expect(all!.records.length).toBeGreaterThan(3);
  });
});
