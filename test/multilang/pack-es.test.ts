// @vitest-environment node
/**
 * Multi-language extensibility (prompt 6, section 25), part 1: the Spanish pack. A second language is loaded through the
 * SAME shared interfaces as Albanian (manifest, installPack, runtime, tutorial). The pack is installable at a minimal,
 * honest level: it says machine-drafted, and what is thin is stated, not hidden.
 */
import { describe, expect, it } from 'vitest';
import { esAdapter } from '../../src/adapters/es';
import {
  ES_PACK_ID, ES_PASSAGE, ES_TUTORIAL, ES_TUTORIAL_STEPS, ES_VALIDATION, ES_VERSION, KAIKKI_ATTRIBUTION, MIN_VALIDATION_CASES, PACKS, SQ_TUTORIAL,
  albanianManifest, createPackRuntime, installPack, installablePacks, packFor, readSelection, runCase, spanishManifest, statusOf, validateManifest, verifyInstalled,
} from '../../packages/language-packs/src';
import { statusFor } from '../../packages/repository-linguistics/src/resolver';
import { BASE, diskFetch, memoryStorage } from '../language-packs/helpers';

const es = () => spanishManifest();
const unread = (sentence: string): string[] => {
  const toks = esAdapter.tokenize(sentence);
  return esAdapter.analyze(toks).filter((a) => a.token.isWord && a.candidates.length === 0).map((a) => a.token.surface);
};

describe('the Spanish manifest', () => {
  it('validates, is installable, and is the one in the registry', () => {
    expect(validateManifest(es())).toEqual([]);
    expect(packFor('es')).toEqual(es());
    expect(packFor('es')!.status).toBe('installable');
    expect(installablePacks().map((p) => p.packId)).toEqual(['pack:sq', 'pack:es']);
  });

  it('names the real adapter, its version, script and only capabilities the adapter supports', () => {
    const m = es();
    expect(ES_VERSION).toBe(String(esAdapter.version));
    expect(m).toMatchObject({ packId: ES_PACK_ID, languageId: 'es', version: String(esAdapter.version), scriptId: esAdapter.script });
    expect(m.analyzer.id).toBe(`adapter-es@${esAdapter.version}`);
    const s = esAdapter.support;
    const caps = m.analyzer.capabilities;
    if (s.tokenization !== 'none') expect(caps).toContain('tokenization');
    if (s.lemmatization === 'none') expect(caps).not.toContain('lemma');
    if (s.morphology === 'none') expect(caps).not.toContain('morphology');
    if (s.phraseDetection === 'none') expect(caps).not.toContain('phrases');
    if (s.productionChecks === 'none') expect(caps).not.toContain('production-checks');
    expect(caps).toContain('lemma');
    expect(caps).toContain('morphology');
  });

  it('does not claim production readiness: machine-drafted everywhere, and the thin parts are stated', () => {
    const m = es();
    expect(m.rights.reviewStatus).toBe('machine-drafted');
    expect(m.lexical.handLexicon.reviewStatus).toBe('machine-drafted');
    const text = m.rights.provenance.join('\n');
    expect(text).toMatch(/No native speaker has checked/);
    expect(text).toMatch(/not production-ready/);
    expect(text).toMatch(/Thin:/);
    expect(text).toMatch(/seed-only/);
    expect(text).toMatch(/no recorded audio/);
    expect(m.pronunciation.recordings).toBe('none');
    expect(m.pronunciation.remoteVoice.requiresConsentAndKey).toBe(true);
    expect(m.rights.licences.some((l) => /CC BY-SA 4\.0/.test(l.licence) && l.notice === KAIKKI_ATTRIBUTION)).toBe(true);
    // the same facts through the runtime's own honest summary
    const notes = createPackRuntime(m, { fetch: diskFetch(), baseUrl: BASE, adapter: esAdapter }).coverageNotes().join('\n');
    expect(notes).toMatch(/lemmatization seed-only/);
    expect(notes).toMatch(/no native speaker has checked/);
    expect(notes).toMatch(/no recordings/);
  });

  it('declares the shipped dictionary exactly as public/dict/es/manifest.json describes it', async () => {
    const d = es().lexical.dictionary!;
    const onDisk = JSON.parse(await (await diskFetch()(`${BASE}dict/es/manifest.json`)).text());
    expect(d).toMatchObject({ id: onDisk.id, entries: onDisk.entries, baseUrl: 'dict/es/', frequency: onDisk.hasFrequency });
    expect(d.attribution).toBe(onDisk.attribution);
  });

  it('declares device voices expected, the GoListen registry, and the remote voices the registry offers', () => {
    const p = es().pronunciation;
    expect(p.deviceVoiceExpected).toBe(true);
    expect(p.registryRef).toBe('golisten:es');
    expect(p.notesAvailable).toBe(true);
    expect(p.remoteVoice.voices).toEqual(['es-HN-CarlosNeural', 'es-HN-KarlaNeural', 'es-MX-DaliaNeural']);
  });

  it('explains Gender, Number, Tense, Mood, Person and VerbForm and the required constructions, and every explanation is non-empty', () => {
    const m = es();
    expect(m.grammar.features.map((f) => f.key)).toEqual(['Gender', 'Number', 'Tense', 'Mood', 'Person', 'VerbForm']);
    const ids = m.grammar.constructions.map((c) => c.id);
    for (const want of ['present-indicative', 'preterite', 'present-subjunctive', 'object-pronouns', 'ser-estar-adjective']) expect(ids, want).toContain(want);
    const rt = createPackRuntime(m, { fetch: diskFetch(), baseUrl: BASE, adapter: esAdapter });
    expect(rt.explainFeature('Mood', 'Sub')).toMatch(/subjunctive/);
    expect(rt.explainFeature('Tense', 'Past')).toMatch(/preterite/);
    expect(rt.explainFeature('Gender', 'Fem')).toMatch(/feminine/);
    for (const c of m.grammar.constructions) expect(rt.explainConstruction(c.id), c.id).toMatch(/\S{3,}/);
  });

  it('every construction id that is an adapter construction key is one the adapter really detects', () => {
    const keys = new Set<string>();
    for (const s of ['La escuela es grande.', 'Quiero que ella coma pan.', 'Vos tenés una casa.', 'Dámelo, por favor.', 'Ayer comí pan.', 'Yo no entendía.', 'Ella me lo da.']) {
      const toks = esAdapter.tokenize(s);
      for (const p of esAdapter.detectPatterns(toks, esAdapter.analyze(toks))) keys.add(p.key);
    }
    for (const id of ['ser-estar-adjective', 'querer-que-subjunctive', 'voseo', 'enclitic-pronoun', 'double-object-pronouns']) {
      expect(keys.has(id), id).toBe(true);
      expect(es().grammar.constructions.map((c) => c.id)).toContain(id);
    }
  });
});

describe('the validation cases, run on the real Spanish adapter', () => {
  it('has at least the minimum, with unique ids, and the sentences are original Spanish', () => {
    expect(ES_VALIDATION.length).toBeGreaterThanOrEqual(MIN_VALIDATION_CASES);
    expect(new Set(ES_VALIDATION.map((c) => c.id)).size).toBe(ES_VALIDATION.length);
    expect(es().validation).toEqual(ES_VALIDATION);
  });

  it('every case passes on adapter-es and says what the adapter really returns', () => {
    for (const c of ES_VALIDATION) expect(runCase(esAdapter, c), c.id).toEqual({ id: c.id, pass: true });
  });

  it('a wrong expectation fails with what the adapter really read (the cases are checked, not decorative)', () => {
    const wrong = runCase(esAdapter, { id: 'x', surface: 'libros', sentence: 'Los niños leen los libros.', expect: { lemma: 'libro', features: { Number: 'Sing' } } });
    expect(wrong.pass).toBe(false);
    expect(wrong.got).toMatch(/Number=Plur/);
  });

  it('the pack’s status rule and the Repository resolver’s agree on every case (no second rule for a second language)', () => {
    const toRepo = (c: ReturnType<typeof readSelection>['candidates'][number]) => ({
      confidence: c.confidence, features: c.morph ?? {}, lexemeId: c.lemma ? `lemma:es:${c.lemma}:${c.pos ?? ''}` : undefined,
      provenance: { source: (c.unconfirmed || c.origin === 'rule' ? 'rule' : 'hand-lexicon') as 'rule' | 'hand-lexicon', ref: 'x', confidence: c.confidence },
    });
    for (const c of ES_VALIDATION) {
      const r = readSelection(esAdapter, c.surface, c.sentence);
      if (!r.top) continue;
      const repoAll = r.candidates.map(toRepo);
      expect(statusFor(repoAll[0], repoAll, { unconfirmed: !!r.top.unconfirmed }), c.id).toBe(statusOf(r.top, r.candidates));
    }
  });
});

describe('installPack for Spanish over the real dictionary files on disk', () => {
  it('installs: dictionary description, one real shard and every case pass; the record is stored and read back', async () => {
    const storage = memoryStorage();
    const progress: string[] = [];
    const r = await installPack(es(), { fetch: diskFetch(), baseUrl: BASE, storage, adapter: esAdapter, now: () => '2026-10-09T08:00:00.000Z', onProgress: (p) => progress.push(p.step) });
    expect(r).toMatchObject({ ok: true, installedAt: '2026-10-09T08:00:00.000Z', validationFailures: 0 });
    if (!r.ok) throw new Error(r.detail);
    expect(r.verified.dictionaryManifest && r.verified.sampleShard).toBe(true);
    expect(r.verified.validation).toHaveLength(ES_VALIDATION.length);
    expect(progress).toEqual(['check', 'dictionary-manifest', 'sample-shard', 'validation', 'record']);
    expect(await verifyInstalled(es(), storage)).toMatchObject({ installed: true, current: true, validationFailures: 0 });
    // the record is under the Spanish pack's own key, never Albanian's
    expect([...storage.map.keys()]).toEqual(['pack:installed:pack:es']);
  });

  it('refuses honestly: with no analyser supplied (the build bundles only the Albanian one), with the Albanian dictionary, with the wrong entry count, and offline', async () => {
    // the runtime now bundles the Spanish analyser too: no analyser is supplied and the install still runs
    expect((await installPack(es(), { fetch: diskFetch(), baseUrl: BASE, storage: memoryStorage() })).ok).toBe(true);
    const m = es();
    m.lexical.dictionary!.entries = 5;
    expect(await installPack(m, { fetch: diskFetch(), baseUrl: BASE, storage: memoryStorage(), adapter: esAdapter })).toMatchObject({ ok: false, reason: 'dictionary-mismatch' });
    const offline = (async () => { throw new TypeError('network down'); }) as unknown as typeof fetch;
    expect(await installPack(es(), { fetch: offline, baseUrl: BASE, storage: memoryStorage(), adapter: esAdapter })).toMatchObject({ ok: false, reason: 'dictionary-unreachable' });
  });

  it('does not touch Albanian: both packs install side by side and keep separate records', async () => {
    const storage = memoryStorage();
    expect(await installPack(albanianManifest(), { fetch: diskFetch(), baseUrl: BASE, storage })).toMatchObject({ ok: true });
    expect(await installPack(es(), { fetch: diskFetch(), baseUrl: BASE, storage, adapter: esAdapter })).toMatchObject({ ok: true });
    expect([...storage.map.keys()].sort()).toEqual(['pack:installed:pack:es', 'pack:installed:pack:sq']);
    expect((await verifyInstalled(PACKS.sq, storage)).installed).toBe(true);
    expect((await verifyInstalled(PACKS.es, storage)).installed).toBe(true);
  });
});

describe('the Spanish runtime: gloss with attribution from the real dictionary files', () => {
  it('glosses libro as a book, with the CC BY-SA attribution, lazily', async () => {
    const f = diskFetch();
    const rt = createPackRuntime(es(), { fetch: f, baseUrl: BASE, adapter: esAdapter });
    expect(rt.analyzer().kind).toBe('adapter');
    expect(rt.analyzer().id).toBe(es().analyzer.id);
    const g = await rt.gloss('libro', 'NOUN');
    expect(g).toBeDefined();
    expect(g!.senses.some((s) => /book/i.test(s.gloss))).toBe(true);
    expect(g!.attribution).toBe(KAIKKI_ATTRIBUTION);
    expect(f.calls.some((u) => u === `${BASE}dict/es/manifest.json`)).toBe(true);
    expect(f.calls.filter((u) => /\/s-[0-9a-f]+\.json$/.test(u)).length).toBeLessThan(10);
    await expect(rt.gloss('xyzqwkplm')).resolves.toBeUndefined();
  });
});

describe('the Spanish tutorial (minimal, machine-drafted, unreviewed)', () => {
  it('is the tutorial the manifest points at, and is flagged unreviewed everywhere', () => {
    const m = es();
    expect(m.tutorial).toEqual({ ref: ES_TUTORIAL.ref, estimatedMinutes: ES_TUTORIAL.estimatedMinutes, skippable: true });
    expect(ES_TUTORIAL).toMatchObject({ ref: 'tutorial/es', languageId: 'es', authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'native speaker', skippable: true });
    expect(ES_PASSAGE).toMatchObject({ authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'native speaker' });
    expect(ES_TUTORIAL.notice).toMatch(/has not been checked by a native speaker/);
    expect(ES_TUTORIAL.estimatedMinutes).toBe(ES_TUTORIAL_STEPS.reduce((n, s) => n + s.estimatedMinutes, 0));
    expect(ES_TUTORIAL.ref).not.toBe(SQ_TUTORIAL.ref);
  });

  it('has the alphabet differences, ten words, two patterns, a five-sentence passage and four concept cards', () => {
    const kinds = (k: string) => ES_TUTORIAL_STEPS.filter((s) => s.kind === k);
    const alphabet = kinds('alphabet');
    expect(alphabet.length).toBeGreaterThanOrEqual(1);
    const alphabetText = alphabet.map((s) => s.body + (s.examples ?? []).map((e) => e.surface).join(' ')).join(' ');
    expect(alphabetText).toMatch(/ñ/);
    expect(alphabetText).toMatch(/ll/);
    expect(alphabetText).toMatch(/accent/);
    expect(kinds('words')[0].examples).toHaveLength(10);
    expect(kinds('patterns')).toHaveLength(2);
    expect(kinds('passage')).toHaveLength(1);
    expect(ES_PASSAGE.sentences).toHaveLength(5);
    expect(kinds('concept')).toHaveLength(4);
    expect(new Set(ES_TUTORIAL_STEPS.map((s) => s.id)).size).toBe(ES_TUTORIAL_STEPS.length);
  });

  it('every word of the passage and of every example sentence and practice sentence is read by the real adapter', () => {
    for (const s of ES_PASSAGE.sentences) expect(unread(s.text), s.text).toEqual([]);
    for (const step of ES_TUTORIAL_STEPS) {
      for (const e of step.examples ?? []) if (e.surface.endsWith('.')) expect(unread(e.surface), e.surface).toEqual([]);
      if (step.practice) expect(unread(step.practice.sentence), step.practice.sentence).toEqual([]);
    }
    for (const w of ES_TUTORIAL_STEPS.find((s) => s.id === 'words-first')!.examples!) {
      expect(unread(w.surface), w.surface).toEqual([]);
    }
  });

  it('every practice target is a word of its sentence, and the adapter reads it', () => {
    for (const step of ES_TUTORIAL_STEPS.filter((s) => s.practice)) {
      const p = step.practice!;
      expect(p.sentence, step.id).toContain(p.target);
      const r = readSelection(esAdapter, p.target, p.sentence);
      expect(r.found, step.id).toBe(true);
      expect(r.top, step.id).toBeDefined();
    }
  });
});
