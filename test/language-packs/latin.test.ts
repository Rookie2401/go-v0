// @vitest-environment node
/**
 * The Latin pack (packages/language-packs/src/packs/la.ts), the app-wiring half of adding Latin: what the manifest, the
 * tutorial and the catalogue say, and (when the adapter lane's analyser and the dictionary lane's files are on disk) that the
 * pack's claims are true of the real analyser and the real dictionary. The checks that need the analyser or the dictionary are
 * skipped, not failed, while those files do not exist; they run as soon as they do.
 */
import { describe, expect, it } from 'vitest';
import {
  KAIKKI_ATTRIBUTION, LANGUAGE_CATALOGUE, LA_DICTIONARY, LA_TUTORIAL, LA_VALIDATION, LA_VERSION, LEVEL_LABEL, MIN_VALIDATION_CASES, PACKS, TUTORIALS, catalogueEntry, createPackRuntime,
  installPack, installablePacks, levelOf, packCapabilities, packFor, readSelection, runCase, validateManifest, validationOf, verifyInstalled,
} from '../../packages/language-packs/src';
import { laAdapter, laDictionaryOnDisk } from '../support/latin';
import { BASE, diskFetch, memoryStorage } from './helpers';

const la = PACKS.la;

describe('the Latin manifest', () => {
  it('is in the registry, validates, and is installable at the experimental level with the honest note', () => {
    expect(packFor('la')).toBe(la);
    expect(la).toMatchObject({ packId: 'pack:la', languageId: 'la', scriptId: 'Latn', status: 'installable', level: 'experimental', version: LA_VERSION });
    expect(validateManifest(la)).toEqual([]);
    expect(levelOf(la)).toBe('experimental');
    expect(LEVEL_LABEL[levelOf(la)]).toBe('experimental, seed-only lemmatisation, unreviewed');
    expect(validationOf(la)).toBe('experimental');
    expect(installablePacks().map((p) => p.packId)).toContain('pack:la');
    expect(la.analyzer.id).toBe(`adapter-la@${LA_VERSION}`);
    expect(la.rights.provenance.join('\n')).toContain('Latin: ported analyser, Clementine-Vulgate orthography, unreviewed.');
  });

  it('does not claim production readiness: machine-drafted, unreviewed by a Latinist, no recordings, a remote voice only with consent and a key', () => {
    expect(la.rights.reviewStatus).toBe('machine-drafted');
    expect(la.lexical.handLexicon.reviewStatus).toBe('machine-drafted');
    const text = la.rights.provenance.join('\n');
    expect(text).toMatch(/^Experimental, installable at a deliberately minimal level and not production-ready/);
    expect(text).toMatch(/Thin: /);
    expect(text).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
    expect(text).toMatch(/no native speaker to review this pack\. The review it needs is a Latinist/);
    expect(text).not.toMatch(/(?<!Nothing in this pack )has been reviewed by a (native speaker|Latinist)/);
    expect(la.pronunciation).toMatchObject({ recordings: 'none', deviceVoiceExpected: false });
    expect(la.pronunciation.remoteVoice.requiresConsentAndKey).toBe(true);
    expect(la.pronunciation.remoteVoice.voices).toEqual([]); // no Latin voice is offered by any provider the project uses
  });

  it('has at least the required number of validation cases, each naming a word of its sentence, and the sentences are Clementine Vulgate verses', () => {
    expect(la.validation).toEqual(LA_VALIDATION);
    expect(la.validation.length).toBeGreaterThanOrEqual(MIN_VALIDATION_CASES);
    for (const c of la.validation) {
      expect(c.sentence, c.id).toBeTruthy();
      expect(c.sentence, c.id).toContain(c.surface);
    }
  });

  it('lists one analysed variety (Ecclesiastical, Clementine spelling) and Classical as a variety that is read beside it, not analysed', () => {
    expect(la.varietyId).toBe('la-ecclesiastical');
    expect(la.varieties.filter((v) => v.analysed).map((v) => v.varietyId)).toEqual(['la-ecclesiastical']);
    expect(la.varieties.map((v) => v.varietyId)).toEqual(['la-ecclesiastical', 'la-classical']);
  });

  it('declares the shared kaikki dictionary at dict/la/ with the attribution the installer insists on', () => {
    expect(la.lexical.dictionary).toMatchObject({ ...LA_DICTIONARY, baseUrl: 'dict/la/', attribution: KAIKKI_ATTRIBUTION });
    expect(la.rights.licences.some((l) => l.resource.includes(LA_DICTIONARY.id))).toBe(true);
  });

  it('declares only capabilities the manifest can explain: no phrase or construction tables it does not have', () => {
    expect(la.analyzer.capabilities).toEqual(expect.arrayContaining(['tokenization', 'sentence-segmentation', 'lemma']));
    if (la.analyzer.capabilities.includes('constructions')) expect(la.grammar.constructions.length).toBeGreaterThan(0);
    expect(la.grammar.features.map((f) => f.key)).toContain('Case');
  });
});

describe('the Latin orientation and the catalogue entry', () => {
  it('has a minimal orientation that the manifest points at, marked machine-drafted and unreviewed', () => {
    expect(TUTORIALS.la).toBe(LA_TUTORIAL);
    expect(la.tutorial).toEqual({ ref: 'tutorial/la', estimatedMinutes: LA_TUTORIAL.estimatedMinutes, skippable: true });
    expect(LA_TUTORIAL).toMatchObject({ languageId: 'la', authorship: 'machine-drafted', reviewed: false, skippable: true });
    expect(LA_TUTORIAL.notice).toMatch(/drafted by an AI model and has not been checked by a native speaker/);
    expect(LA_TUTORIAL.steps.map((s) => s.id).slice(0, 3)).toEqual(['select-a-word', 'what-the-card-shows', 'practice-lookup']);
    expect(LA_TUTORIAL.steps.find((s) => s.id === 'alphabet-latin')!.body).toMatch(/Clementine Vulgate/);
  });

  it('is the seventh entry of the language catalogue, named Latin, in Latin script, one pack', () => {
    const e = catalogueEntry('la')!;
    expect(e).toBe(LANGUAGE_CATALOGUE[6]);
    expect(e).toMatchObject({ languageId: 'la', name: 'Latin', nativeName: 'Latina', scriptId: 'Latn', scriptName: 'Latin', packIds: ['pack:la'], level: 'experimental', validation: 'experimental', tutorialAvailable: true });
    expect(e.writtenStandards).toBeUndefined();
    expect(e.varieties).toBeUndefined();
  });
});

describe.skipIf(!laAdapter)('the Latin pack against the real analyser', () => {
  it('names the real adapter, its version and its script; every declared capability is one the adapter has', () => {
    const a = laAdapter!;
    expect(la.version).toBe(String(a.version));
    expect(la.analyzer.id).toBe(`adapter-la@${a.version}`);
    expect(la.scriptId).toBe(a.script);
    const caps = la.analyzer.capabilities;
    if (a.support.lemmatization === 'none') expect(caps).not.toContain('lemma');
    if (a.support.morphology === 'none') expect(caps).not.toContain('morphology');
    if (a.support.phraseDetection === 'none') expect(caps).not.toContain('phrases');
  });

  it('every validation case is read exactly as the pack states it', () => {
    for (const c of la.validation) {
      const r = runCase(laAdapter!, c);
      expect(r.pass, `${c.id}: ${r.pass ? '' : r.got}`).toBe(true);
    }
  });

  it('the orientation’s practice target and every example word are read by the analyser, none of them a guess', () => {
    const p = LA_TUTORIAL.steps.find((s) => s.practice)!.practice!;
    expect(la.validation.some((c) => c.sentence === p.sentence && c.surface === p.target)).toBe(true);
    const r = readSelection(laAdapter!, p.target, p.sentence);
    expect(r.top!.unconfirmed).not.toBe(true);
    for (const s of LA_TUTORIAL.steps) for (const e of s.examples ?? []) {
      const x = readSelection(laAdapter!, e.surface);
      expect(x.top, e.surface).toBeDefined();
      expect(x.top!.confidence, e.surface).toBeGreaterThanOrEqual(0.5);
      expect(x.top!.unconfirmed, `${e.surface} is a guess`).not.toBe(true);
    }
  });

  it('the capability report is built from this adapter and the catalogue sentence says what it really does', () => {
    const c = packCapabilities('la');
    expect(c).toBeDefined();
    if (packCapabilities('la')!.analyzer === 'adapter') {
      expect(c!.analyzerId).toBe(la.analyzer.id);
      expect(c!.reviewStatus).toBe('machine-drafted');
    }
    expect(catalogueEntry('la')!.whatDoesNot).toMatch(/no native speaker has reviewed the pack/);
  });
});

describe.skipIf(!laDictionaryOnDisk())('the Latin pack against the built dictionary', () => {
  it('declares the dictionary that is on disk: the same id and entry count, so the installer’s check passes', () => {
    const disk = laDictionaryOnDisk()!;
    expect(la.lexical.dictionary!.id).toBe(disk.id);
    expect(la.lexical.dictionary!.entries).toBe(disk.entries);
  });

  it.skipIf(!laAdapter)('installs from the files on disk with the real analyser: dictionary, a shard, and every validation case; the record reads back as current', async () => {
    const storage = memoryStorage();
    const r = await installPack(la, { fetch: diskFetch(), baseUrl: BASE, storage, adapter: laAdapter!, now: () => '2026-10-17T08:00:00.000Z' });
    if (!r.ok) throw new Error(`${r.reason}: ${r.detail}`);
    expect(r.verified.validation).toHaveLength(la.validation.length);
    expect(r.validationFailures).toBe(0);
    expect(await verifyInstalled(la, storage)).toMatchObject({ installed: true, current: true, validationFailures: 0 });
  });

  it('glosses a Vulgate word from the dictionary with the Wiktionary attribution', async () => {
    const rt = createPackRuntime(la, { fetch: diskFetch(), baseUrl: BASE, ...(laAdapter ? { adapter: laAdapter } : {}) });
    const g = await rt.gloss('verbum');
    expect(g).toBeDefined();
    expect(g!.attribution).toBe(KAIKKI_ATTRIBUTION);
  });
});
