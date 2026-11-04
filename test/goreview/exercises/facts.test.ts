import { describe, expect, it } from 'vitest';
import { sqAdapter } from '../../../src/adapters/sq';
import { KAIKKI_ATTRIBUTION, albanianManifest, packFor } from '../../../packages/language-packs/src';
import { unitIds } from '../../../packages/repository-contract/src';
import { createFactsProvider } from '../../../packages/goreview/src/facts';
import type { ReviewFacts } from '../../../packages/goreview/src/facts';
import { IDS, NOW, SENT, makeWorld } from './support';

const ALLOWED = ['pack-validation', 'pack-tutorial', 'original'];

describe('facts provider: lemma', () => {
  it('reads the lemma, the word-list gloss, the sibling forms, the sentences and the constructions', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.liber);
    expect(f.unit.unitId).toBe(IDS.liber);
    expect(f.lemma).toBe('libër');
    expect(f.pos).toBe('NOUN');
    expect(f.status).toBe('high-confidence');
    expect(f.glosses[0]).toBe('book');
    expect(f.lexiconGlossCount).toBe(1);
    expect(f.lemmaInWordList).toBe(true);
    // the dictionary sense "book" repeats the word-list gloss: nothing new, so no attribution is owed
    expect(f.glosses).toEqual(['book']);
    expect(f.glossAttribution).toBeUndefined();
    expect(f.siblingForms.map((s) => s.surface).sort()).toEqual(['librin', 'libër']);
    const librin = f.siblingForms.find((s) => s.surface === 'librin');
    expect(librin?.features).toEqual({ Case: 'Acc', Definite: 'Def', Gender: 'Masc', Number: 'Sing' });
    expect(f.constructionIds).toContain(unitIds.morph('sq', 'NOUN', unitIds.featureKey(librin!.features)));
    expect(f.pronunciationNotes.length).toBeGreaterThan(0);
  });

  it('example sentences come only from the pack, and each holds its surface at its offsets', async () => {
    const w = makeWorld();
    for (const id of [IDS.liber, IDS.librin, IDS.shkolle, IDS.shkolleLemma, IDS.construction, IDS.phrase]) {
      const f = await w.facts(id);
      expect(f.exampleSentences.length, id).toBeGreaterThan(0);
      for (const s of f.exampleSentences) {
        expect(ALLOWED).toContain(s.source);
        expect(s.text.slice(s.start, s.end), `${id}: ${s.text}`).toBe(s.surface);
      }
      expect(f.exampleReadings?.length).toBe(f.exampleSentences.length);
    }
    const f = await w.facts(IDS.liber);
    expect(f.exampleSentences.map((s) => s.text)).toEqual([SENT.librin, SENT.liber]);
    expect(f.exampleSentences.map((s) => s.source)).toEqual(['pack-validation', 'pack-tutorial']);
  });

  it('takes dictionary senses of the right part of speech only, with the attribution', async () => {
    const w = makeWorld();
    const caj = await w.facts('lemma:sq:çaj:NOUN');
    expect(caj.glosses[0]).toBe('tea');
    expect(caj.glosses.some((g) => /split|cleave|slaughter/.test(g))).toBe(false); // çaj the verb is another word
    expect(caj.glossAttribution).toBe(KAIKKI_ATTRIBUTION);
    expect(caj.lexiconGlossCount).toBe(1);
    expect(caj.glosses.length).toBeGreaterThan(1);
  });

  it('without a dictionary the word-list gloss stands alone', async () => {
    const w = makeWorld({ noDictionary: true });
    const caj = await w.facts('lemma:sq:çaj:NOUN');
    expect(caj.glosses).toEqual(['tea']);
    expect(caj.glossAttribution).toBeUndefined();
  });

  it('a lemma the Repository has not stored is derived from the pack and says so', async () => {
    const w = makeWorld();
    const f = await w.facts('lemma:sq:shtëpi:NOUN');
    expect(f.derivedFromPack).toBe(true);
    expect(f.unit.provenance.ref).toContain('pack-derived');
    expect(f.glosses[0]).toBe('house, home');
    expect(f.glossAttribution).toBe(KAIKKI_ATTRIBUTION);
    expect(['verified', 'high-confidence', 'provisional', 'conflicted']).toContain(f.status);
    expect(f.unit.createdAt).toBe(NOW);
  });

  it('never fabricates: an unknown lemma, a wrong language, another unit kind and a failing lookup give nothing invented', async () => {
    const w = makeWorld();
    expect(await w.provider.factsFor('lemma:sq:zzzzqq:NOUN', 'sq')).toBeUndefined();
    expect(await w.provider.factsFor('form:sq:xyzqwk', 'sq')).toBeUndefined();
    expect(await w.provider.factsFor(IDS.liber, 'de')).toBeUndefined();
    expect(await w.provider.factsFor('sense:sq:libër:NOUN:1', 'sq')).toBeUndefined();
    expect(await w.provider.factsFor('garbage', 'sq')).toBeUndefined();
    const failing = createFactsProvider({
      unit: async () => { throw new Error('offline'); },
      pack: { manifest: albanianManifest(), runtime: { gloss: async () => { throw new Error('no dictionary'); } } },
      adapter: sqAdapter,
      now: () => NOW,
    });
    const f = await failing.factsFor(IDS.liber, 'sq') as ReviewFacts | undefined;
    expect(f?.derivedFromPack).toBe(true);
    expect(f?.glosses).toEqual(['book']);
    expect(await failing.factsFor('lemma:sq:zzzzqq:NOUN', 'sq')).toBeUndefined();
  });

  it('the Repository status is used as it is, never recomputed', async () => {
    const w = makeWorld();
    const real = await w.repo.unit(IDS.liber);
    const provider = createFactsProvider({
      unit: async () => ({ ...real!, unit: { ...real!.unit, status: 'verified' as const } }),
      pack: { manifest: w.manifest, runtime: { gloss: async () => undefined } },
      adapter: sqAdapter,
    });
    expect((await provider.factsFor(IDS.liber, 'sq'))?.status).toBe('verified');
    const invalidated = createFactsProvider({
      unit: async () => ({ ...real!, unit: { ...real!.unit, status: 'invalidated' as const } }),
      pack: { manifest: w.manifest, runtime: { gloss: async () => undefined } },
      adapter: sqAdapter,
    });
    expect((await invalidated.factsFor(IDS.liber, 'sq'))?.status).toBe('invalidated');
  });
});

describe('facts provider: form', () => {
  it('librin: features, lemma, the Repository construction id, the pack explanations, the sibling forms', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.librin);
    expect(f.status).toBe('provisional');
    expect(f.source).toBe('rule');
    expect(f.unit.provenance.source).toBe('rule');
    expect(f.lemma).toBe('libër');
    expect(f.lemmaInWordList).toBe(true);
    expect(f.features).toEqual({ Case: 'Acc', Definite: 'Def', Gender: 'Masc', Number: 'Sing' });
    expect(f.constructionIds).toEqual(['morph:sq:NOUN:Case=Acc|Definite=Def|Gender=Masc|Number=Sing']);
    expect(f.constructionIds[0]).toBe(unitIds.morph('sq', 'NOUN', unitIds.featureKey(f.features!)));
    expect(f.featureExplanations['Case=Acc']).toMatch(/^Case: accusative\. A noun changes its ending/);
    expect(f.featureExplanations['Definite=Def']).toMatch(/^Definiteness: definite/);
    expect(Object.keys(f.featureExplanations).sort()).toEqual(['Case=Acc', 'Definite=Def', 'Gender=Masc', 'Number=Sing']);
    expect(f.constructionLabel).toBe('Definite accusative singular');
    expect(f.constructionExplanation).toContain('The -in/-n ending marks a definite masculine noun as the direct object');
    expect(f.morphDescription).toBe('definite masculine accusative singular');
    expect(f.glosses).toEqual([]); // a form answer needs evidence for this form, not only its lemma
    expect(f.siblingForms.map((s) => s.surface)).toEqual(['libër']);
    expect(f.exampleSentences).toHaveLength(1);
    expect(f.exampleSentences[0]).toMatchObject({ text: SENT.librin, surface: 'librin', source: 'pack-validation' });
  });

  it('looks up exact-form dictionary meanings while preserving the word-list lemma gloss and stored review analysis', async () => {
    const repo = makeWorld().repo;
    const before = await repo.unit(IDS.librin);
    const calls: Array<{ lemma: string; pos?: string; forms?: readonly string[] }> = [];
    const provider = createFactsProvider({
      unit: (id) => repo.unit(id),
      pack: { manifest: albanianManifest(), runtime: { gloss: async (lemma, pos, forms) => {
        calls.push({ lemma, pos, forms });
        return { senses: [{ gloss: 'the particular book form', pos: 'NOUN' }], attribution: 'test dictionary' };
      } } },
      adapter: sqAdapter,
      now: () => NOW,
    });
    const f = await provider.factsFor(IDS.librin, 'sq') as ReviewFacts;
    expect(calls[0]).toMatchObject({ lemma: 'libër', pos: 'NOUN', forms: ['librin'] });
    expect(f.glosses).toEqual(['the particular book form']);
    expect(f.wordAnalysis?.lexicalMeaning?.text).toBe('book');
    expect(f.wordAnalysis?.inflectedMeaning?.text).toBe('the particular book form');
    expect(f.lexiconGlossCount).toBe(0);
    expect(f.glossAttribution).toBe('test dictionary');
    expect(await repo.unit(IDS.librin)).toEqual(before);
  });

  it('does not turn a lemma gloss into a Greek form answer, and rejects a first-person gloss for a second-person verb', async () => {
    const surface = 'ἀγαπήσεις';
    const lemma = 'ἀγαπάω';
    const candidate = { lemma, pos: 'VERB' as const, morph: { VerbForm: 'Fin', Person: '2', Number: 'Sing', Tense: 'Fut', Voice: 'Act', Mood: 'Ind' }, gloss: 'I love', confidence: 0.96, origin: 'dictionary' as const, sourceId: 'morphgnt-sblgnt' };
    const tokens = (text: string) => [...text.matchAll(/[^\s]+/gu)].map((m) => {
      const start = m.index!; const word = m[0];
      return { surface: word, normalized: word.normalize('NFC'), start, end: start + word.length, isWord: /\p{L}/u.test(word) };
    });
    const adapter = {
      tokenize: tokens,
      normalize: (text: string) => text.normalize('NFC'),
      analyze: (ts: ReturnType<typeof tokens>) => ts.map((token) => ({ token, analyzer: 'test-greek', candidates: token.surface === surface || token.surface === lemma ? [candidate] : [] })),
      describeMorph: () => 'second person singular future indicative',
    };
    const unit = { unitId: `form:el:${surface}`, kind: 'form' as const, languageId: 'el', label: surface, pos: 'VERB', features: candidate.morph, packId: 'pack:el', packVersion: '1', provenance: { source: 'dictionary' as const, ref: 'test', confidence: 0.96 }, status: 'high-confidence' as const, createdAt: NOW };
    const makeProvider = (gloss: string) => createFactsProvider({
      unit: async () => ({ unit, relations: [], analyses: [] }),
      pack: { manifest: packFor('el')!, runtime: { gloss: async () => ({ senses: [{ gloss, pos: 'VERB' }], attribution: 'test dictionary' }) } },
      adapter,
      now: () => NOW,
    });
    const wrong = await makeProvider('I love').factsFor(unit.unitId, 'el') as ReviewFacts;
    expect(wrong.glosses).toEqual(['You will love']);
    expect(wrong.wordAnalysis?.lexicalMeaning?.text).toBe('to love');
    expect(wrong.wordAnalysis?.inflectedMeaning?.text).toBe('You will love');
    expect(wrong.wordAnalysis?.contextualMeaning).toBeNull();
    expect(wrong.glossAttribution).toBeUndefined(); // the selected answer came from the form analysis, not the dictionary
    const supported = await makeProvider('you will love').factsFor(unit.unitId, 'el') as ReviewFacts;
    expect(supported.glosses).toEqual(['You will love']);
    expect(supported.wordAnalysis?.inflectedMeaning?.text).toBe('You will love');
  });

  it('shkollë: high-confidence from the word list, both of its pack sentences, no other form to offer', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.shkolle);
    expect(f.status).toBe('high-confidence');
    expect(f.source).toBe('hand-lexicon');
    expect(f.features).toEqual({ Case: 'Acc', Definite: 'Ind', Gender: 'Fem', Number: 'Sing' });
    expect(f.exampleSentences.map((s) => s.source)).toEqual(['pack-validation', 'pack-tutorial']);
    expect(f.siblingForms).toEqual([]); // "Shkolla" is read as conflicted in its sentence, so it is left out
    expect(f.constructionLabel).toBeUndefined(); // no manifest construction names the indefinite accusative
  });

  it('a conflicted form keeps its status and offers nothing to build on', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.nena);
    expect(f.status).toBe('conflicted');
  });
});

describe('facts provider: construction and phrase', () => {
  it('a morphological construction: the manifest label and explanation, and the forms realising it in the pack sentences', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.construction);
    expect(f.unit.kind).toBe('morph-construction');
    expect(f.constructionLabel).toBe('Definite accusative singular');
    expect(f.constructionExplanation).toMatch(/^Definite accusative singular\. /);
    expect(f.siblingForms.map((s) => s.surface).sort()).toEqual(['librin', 'çajin']);
    expect(f.exampleSentences.map((s) => s.surface).sort()).toEqual(['librin', 'çajin']);
    expect(f.formGroups?.map((g) => g.lemma).sort()).toEqual(['libër', 'çaj']);
    expect(f.lemma).toBeUndefined();
    expect(f.glosses).toEqual([]);
  });

  it('a construction the manifest does not name keeps the Repository label and no explanation', async () => {
    const w = makeWorld();
    const f = await w.facts('morph:sq:NOUN:Case=Nom,Acc|Definite=Ind|Gender=Masc|Number=Sing');
    expect(f.constructionExplanation).toBeUndefined();
    expect(f.constructionLabel).toBe(f.unit.label);
    expect(f.siblingForms.map((s) => s.surface)).toContain('libër');
  });

  it('a phrase: display and gloss from the phrase rules, found in its pack sentence', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.phrase);
    expect(f.unit.kind).toBe('multiword');
    expect(f.status).toBe('high-confidence');
    expect(f.phrase).toEqual({ display: 'quhem …', gloss: 'to be called …; my name is …', kind: 'frame' });
    expect(f.exampleSentences).toHaveLength(1);
    expect(f.exampleSentences[0]).toMatchObject({ text: SENT.quhem, surface: 'quhem Sam', source: 'pack-validation' });
    expect(f.glosses).toEqual(['to be called …; my name is …']);
  });
});
