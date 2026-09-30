/**
 * D2: honest scope, real sources, the encountered-language gate, and meaning preservation.
 * Acceptance: "Yo creer en Dios. Yo tiene cinco año."
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { SuggestionProvider } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { checkerCoverage } from '../../src/gotell';
import { makeFakeAdapter, makeWorld } from './fakes';
import { ES_ACCEPT_DRAFT, ES_ACCEPT_RULES, ES_LEXICON, ES_ROUGH, PLACEHOLDER_HONESTY, esAcceptAdapter, esLearnerB, esStoryC } from './fixtures';

describe('acceptance with the REAL Spanish adapter: "Yo creer en Dios. Yo tiene cinco año."', () => {
  it('sentence 1 => "Yo creo en Dios."; sentence 2 => ONE combined "Yo tengo cinco años."; coverage comes from the adapter own support record', async () => {
    const adapter = createAdapterRegistry().get('es');
    const w = await makeWorld([adapter]);
    await esStoryC(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, ES_ACCEPT_DRAFT);
    expect(a.suggestions.map((s) => [s.sentenceIndex, s.suggested, s.scope, s.kind])).toEqual([
      [0, 'Yo creo en Dios.', 'fixes-all-detected', 'repair'],
      [1, 'Yo tengo cinco años.', 'fixes-all-detected', 'repair'],
    ]);
    expect(a.suggestions[1].categories.sort()).toEqual(['agreement', 'conjugation']);
    expect(a.suggestions[0].sources[0]).toMatchObject({ textTitle: 'Story C', excerpt: 'Yo creo en Dios.' });
    for (const s of a.suggestions) {
      expect(s.checkerCoverage).toContain("GoTell's Spanish checker has limited coverage");
      expect(s.checkerCoverage).toContain(adapter.support.limitations[0]); // the adapter's own stated limits
      expect(s.checkerCoverage).toMatch(/does not mean the sentence is now correct/);
    }
  });

  it('a learner who has met none of it: the same combined fixes are expansions, no sources', async () => {
    const w = await makeWorld([createAdapterRegistry().get('es')]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, ES_ACCEPT_DRAFT);
    expect(a.suggestions.map((s) => [s.suggested, s.kind, s.sources.length])).toEqual([['Yo creo en Dios.', 'expansion', 0], ['Yo tengo cinco años.', 'expansion', 0]]);
  });
});

describe('acceptance (fake adapter with the same three rules, for the partial / deterministic cases)', () => {
  it('a learner who has met the language: sentence 1 = "Yo creo en Dios.", sentence 2 = ONE combined fix, each with its source', async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    await esStoryC(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, ES_ACCEPT_DRAFT);
    expect(a.sentences.map((s) => s.text)).toEqual(['Yo creer en Dios.', 'Yo tiene cinco año.']);
    expect(a.sentences[1].errors.map((e) => e.category).sort()).toEqual(['agreement', 'conjugation']);

    expect(a.suggestions.map((s) => [s.sentenceIndex, s.suggested])).toEqual([[0, 'Yo creo en Dios.'], [1, 'Yo tengo cinco años.']]);
    const [s1, s2] = a.suggestions;
    expect(s1.kind).toBe('repair');
    expect(s1.scope).toBe('fixes-all-detected');
    expect(s1.remainingIssues).toEqual([]);
    expect(s1.newItems).toEqual([]);
    expect(s1.sources).toEqual([expect.objectContaining({ textTitle: 'Story C', excerpt: 'Yo creo en Dios.', sentenceId: ids.sentence('text:es:story-c', 0), surface: 'corpus' })]);
    expect(s1.sources[0].itemId).toBe(ids.form('es', 'creo'));

    expect(s2.kind).toBe('repair');
    expect(s2.scope).toBe('fixes-all-detected');
    expect(s2.categories.sort()).toEqual(['agreement', 'conjugation']);
    expect(s2.explanation).toContain('tengo');
    expect(s2.explanation).toContain('años');
    expect(s2.sources.map((x) => x.excerpt)).toEqual(['Yo tengo cinco años.']); // both tengo and años come from one sentence
    expect(s2.sources[0].textTitle).toBe('Story C');
    // never implies the sentence is now correct
    for (const s of a.suggestions) {
      expect(s.checkerCoverage).toMatch(/does not mean the sentence is now correct/);
      expect(s.checkerCoverage).toMatch(/Known limits: Test adapter/);
    }
  });

  it('a learner who has met none of it: the same fixes are expansions with new items and NO sources', async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, ES_ACCEPT_DRAFT);
    expect(a.suggestions.map((s) => s.kind)).toEqual(['expansion', 'expansion']);
    expect(a.suggestions[0].newItems.map((n) => n.itemId)).toContain(ids.form('es', 'creo'));
    expect(a.suggestions[1].newItems.map((n) => n.itemId)).toEqual(expect.arrayContaining([ids.form('es', 'tengo'), ids.form('es', 'años')]));
    for (const s of a.suggestions) {
      expect(s.sources).toEqual([]);
      expect(s.familiar).toEqual([]);
      expect(s.explanation).toMatch(/not met yet/);
    }
  });

  it('only some rules fire: the suggestion is partial and names what is still standing', async () => {
    // the checker DETECTS "yo tiene" but has no replacement for it
    const rules = [
      { ...ES_ACCEPT_RULES[1], detectOnly: true },
      ES_ACCEPT_RULES[2],
    ];
    const w = await makeWorld([esAcceptAdapter(rules)]);
    await esStoryC(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo tiene cinco año.');
    expect(a.suggestions).toHaveLength(1);
    const s = a.suggestions[0];
    expect(s.suggested).toBe('Yo tiene cinco años.');
    expect(s.scope).toBe('partial');
    expect(s.remainingIssues).toEqual(['"yo" goes with "tengo", not "tiene".']);
    expect(s.checkerCoverage).toMatch(/not mean the sentence is now correct/);
  });

  it('every suggestion says what the checker cannot verify, from adapter.support', async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo creer en Dios.');
    const s = a.suggestions[0];
    expect(s.checkerCoverage).toContain('fake-es');
    expect(s.checkerCoverage).toContain('very small');
    expect(s.checkerCoverage).toMatch(/may still contain mistakes/);
  });
});

describe('checkerCoverage(adapter.support)', () => {
  const adapter = (support: Parameters<typeof makeFakeAdapter>[0]['support']) => makeFakeAdapter({ lang: 'es', lexicon: {}, support });
  it('none: says GoTell cannot tell whether the sentence is correct', () => {
    const c = checkerCoverage(adapter({ productionChecks: 'none', limitations: [] }));
    expect(c).toMatch(/no automatic writing checks/);
    expect(c).toMatch(/cannot tell whether this sentence is correct/);
  });
  it('limited / seed-only / dependable: levels and limitations are stated, never "correct"', () => {
    expect(checkerCoverage(adapter({ productionChecks: 'limited', limitations: ['Only agreement is checked.'] }))).toMatch(/limited coverage[\s\S]*Only agreement is checked/);
    expect(checkerCoverage(adapter({ productionChecks: 'seed-only', limitations: [] }))).toMatch(/very small/);
    expect(checkerCoverage(adapter({ productionChecks: 'dependable', limitations: [] }))).toMatch(/broad coverage/);
  });
  it('an adapter that does not declare support is reported as undeclared, not as good', () => {
    const a = adapter({}) as unknown as { support?: unknown };
    delete a.support;
    expect(checkerCoverage(a as never)).toMatch(/has not been told what its/);
  });
});

describe('gate: ENCOUNTERED language, with a source, is familiar', () => {
  it('language met once without being understood still counts as met (not an expansion), with its source', async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    await esStoryC(w, 'A', 'encountered'); // exposure only - never "recognized"
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo creer en Dios.');
    expect(a.suggestions[0].kind).toBe('repair');
    expect(a.suggestions[0].newItems).toEqual([]);
    expect(a.suggestions[0].sources[0].excerpt).toBe('Yo creo en Dios.');
    expect(a.sentences[0].familiarity).toBeGreaterThan(0);
  });

  it('no source sentence => new => expansion, even if GoLearn has a row for the item', async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    w.golearn.learn('A', 'es', ids.form('es', 'creo'), { level: 'recognized', count: 3 }); // a row, but no encounter rows
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo creer en Dios.');
    expect(a.suggestions[0].kind).toBe('expansion');
    expect(a.suggestions[0].sources).toEqual([]);
    expect(a.suggestions[0].newItems.map((n) => n.itemId)).toContain(ids.form('es', 'creo'));
  });

  it("another learner's encounters are never this learner's sources", async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    await esStoryC(w, 'B');
    w.golearn.learn('A', 'es', ids.form('es', 'creo'), { level: 'recognized', count: 3 });
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo creer en Dios.');
    expect(a.suggestions[0].kind).toBe('expansion');
    expect(a.suggestions[0].sources).toEqual([]);
  });

  it('a lemma the learner met stands in for an unseen inflection, and its source is the lemma\'s sentence', async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    await esStoryC(w, 'A'); // met "tengo" (lemma tener) but never "tiene" / "tenía"
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo tiene.');
    expect(a.suggestions[0].suggested).toBe('Yo tengo.');
    expect(a.suggestions[0].sources[0]).toMatchObject({ textTitle: 'Story C', excerpt: 'Yo tengo cinco años.' });
  });
});

describe('meaning preservation: negation, time words, key terms are flagged, never silent', () => {
  const swap = (suggested: string): SuggestionProvider => ({
    id: 'rewriter',
    async propose({ sentence }) {
      return [{ sentenceIndex: sentence.index, kind: 'repair', original: sentence.text, suggested, explanation: 'rewrite', categories: ['clarity'], priority: 3, itemIds: [], ...PLACEHOLDER_HONESTY }];
    },
  });
  const run = async (draft: string, suggested: string) => {
    const w = await makeWorld([esAcceptAdapter()], { providers: [swap(suggested)] });
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, draft);
    return { w, t, s: a.suggestions.find((x) => x.suggested === suggested) };
  };

  it('dropping a negation flags it (the sentence would say the opposite), priority 1', async () => {
    const { s } = await run('Yo no sé.', 'Yo sé.');
    expect(s).toBeDefined();
    expect(s!.meaningChange).toMatch(/Removes the negation "no"/);
    expect(s!.meaningChange).toMatch(/opposite/);
    expect(s!.priority).toBe(1);
  });

  it('adding a negation is flagged too', async () => {
    const { s } = await run('Yo sé.', 'Yo no sé.');
    expect(s!.meaningChange).toMatch(/Adds a negation "no"/);
  });

  it('"cuando era joven": dropping the time frame is flagged', async () => {
    const { s } = await run(ES_ROUGH, 'Yo conocía de Jesús pero yo no entendía mi pecado.');
    expect(s).toBeDefined();
    expect(s!.meaningChange).toMatch(/Drops the time word "cuando"/);
    expect(s!.meaningChange).toMatch(/"joven"/);
    expect(s!.priority).toBe(1);
  });

  it('believing <-> knowing is flagged in both directions; the same concept is not', async () => {
    const a = await run('Yo creo en Dios.', 'Yo sé en Dios.');
    expect(a.s!.meaningChange).toMatch(/Changes a key term: "creo" \(believe\) becomes "sé" \(know\)/);
    const b = await run('Yo sé en Dios.', 'Yo creo en Dios.');
    expect(b.s!.meaningChange).toContain('(know)');
    expect(b.s!.meaningChange).toContain('(believe)');
    const same = await run('Yo creo en Dios.', 'Yo creer en Dios.');
    expect(same.s?.meaningChange).toBeUndefined();
  });

  it('a checker repair that keeps negation and time words carries no meaning flag', async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, ES_ROUGH);
    const rep = a.suggestions.find((s) => s.suggested.endsWith('no entendía mi pecado.'))!;
    expect(rep).toBeDefined();
    expect(rep.meaningChange).toBeUndefined();
    expect(rep.suggested).toContain('Cuando yo era joven');
  });

  it('nothing is applied automatically: checking changes neither the draft nor the versions', async () => {
    const w = await makeWorld([esAcceptAdapter()], { providers: [swap('Yo sé.')] });
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    await w.gotell.saveDraft('A', 'es', 'Yo no sé.');
    const a = await w.gotell.submitDraft(t.id, 'Yo no sé.');
    expect(a.suggestions.every((s) => s.status === 'shown')).toBe(true);
    expect((await w.gotell.getDraft('A', 'es'))!.text).toBe('Yo no sé.');
    expect(await w.gotell.listRevisions(t.id)).toEqual([]);
    expect(await w.bus.history({ userId: 'A', types: ['ProductionRecorded'] })).toEqual([]);
  });
});

describe('scope is measured on the suggested text', () => {
  it('a recombination that leaves another detected error standing is partial and names it', async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    await esLearnerB(w, 'B');
    const t = await w.gotell.getOrCreateTestimony('B', 'es');
    const a = await w.gotell.submitDraft(t.id, 'El casa y yo no entender mi pecado.');
    const rec = a.suggestions.find((s) => s.kind === 'recombination')!;
    expect(rec.suggested).toBe('El casa y yo no empecé a entender mi pecado.');
    expect(rec.scope).toBe('partial');
    expect(rec.remainingIssues).toEqual(['"casa" is feminine: use "la".']);
    // both detected issues have replacements, so the repair is ONE combined suggestion that fixes everything detected
    const repairs = a.suggestions.filter((s) => s.kind === 'repair');
    expect(repairs).toHaveLength(1);
    expect(repairs[0].suggested).toBe('la casa y yo no entendía mi pecado.');
    expect(repairs[0].scope).toBe('fixes-all-detected');
  });

  it('a recombination that removes the only detected error is honestly fixes-all-detected', async () => {
    const w = await makeWorld([esAcceptAdapter()]);
    await esLearnerB(w, 'B');
    const t = await w.gotell.getOrCreateTestimony('B', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo no entender mi pecado.');
    const rec = a.suggestions.find((s) => s.kind === 'recombination')!;
    expect(rec.scope).toBe('fixes-all-detected');
    expect(rec.meaningChange).toMatch(/negates/); // ... but it changes what the learner said, and says so
  });

  it('an ES_LEXICON sanity check: fixtures still tokenize "años" as an inflection of "año"', () => {
    expect(ES_LEXICON['años'].lemma).toBe(ES_LEXICON['año'].lemma);
  });
});
