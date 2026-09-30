import { describe, expect, it } from 'vitest';
import { hash, ids } from '../../src/core';
import type { SuggestionProvider } from '../../src/core';
import { MAX_SUGGESTIONS_PER_DRAFT, MAX_SUGGESTIONS_PER_SENTENCE } from '../../src/gotell';
import { buildFixtureText, makeFakeAdapter, makeWorld } from './fakes';
import { ES_LEXICON, ES_ROUGH, PLACEHOLDER_HONESTY, esAdapter, esLearnerB, esStoryA, hiAdapter, hiLearner, sentence, thAdapter, thStoryA, TH_ROUGH, TH_ROUGH_TOKENS } from './fixtures';

async function agreeLearner(w: Awaited<ReturnType<typeof makeWorld>>, userId: string) {
  const t = await buildFixtureText(w.store, { lang: 'es', slug: `agree-${userId}`, sentences: [sentence(ES_LEXICON, 'El y la casa .')] });
  await w.golearn.learnText(userId, t.id);
}

describe('analyzeProduction: repair', () => {
  it('a known-word agreement error yields exactly one repair, no expansion, no recombination', async () => {
    const w = await makeWorld([esAdapter()]);
    await agreeLearner(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    expect(a.suggestions).toHaveLength(1);
    const s = a.suggestions[0];
    expect(s.kind).toBe('repair');
    expect(s.suggested).toBe('la casa.');
    expect(s.original).toBe('El casa.');
    expect(s.newItems).toEqual([]);
    expect(s.familiar.map((f) => f.itemId)).toContain(ids.form('es', 'la'));
    expect(s.categories).toEqual(['agreement']);
    expect(s.priority).toBe(2);
    expect(s.status).toBe('shown');
    expect(s.meaningChange).toBeUndefined();
    const types = (await w.bus.history({ userId: 'A' })).map((e) => e.type);
    expect(types).toContain('GoTellSuggestionShown');
    expect(types).toContain('TestimonyTextSubmitted');
  });

  it('an unseen function word does not turn a repair into an expansion', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    expect(a.suggestions).toHaveLength(1);
    expect(a.suggestions[0].kind).toBe('repair');
    expect(a.suggestions[0].newItems).toEqual([]);
  });

  it('an unseen content word makes it an expansion with newItems + gloss', async () => {
    const w = await makeWorld([esAdapter()]);
    await esStoryA(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo no entender.');
    expect(a.suggestions).toHaveLength(1);
    expect(a.suggestions[0].kind).toBe('expansion');
    expect(a.suggestions[0].newItems).toEqual([{ itemId: ids.form('es', 'entendía'), itemKind: 'form', gloss: 'understood' }]);
    expect(a.suggestions[0].explanation).toContain('entendía (understood)');
  });

  it('a known inflection of the same lemma is not new language', async () => {
    const w = await makeWorld([esAdapter()]);
    const t0 = await buildFixtureText(w.store, { lang: 'es', slug: 'lemma-known', sentences: [sentence(ES_LEXICON, 'Yo entender .')] });
    await w.golearn.learnText('A', t0.id); // met "entender" (form + lemma) but not "entendía"
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo no entender.');
    expect(a.suggestions[0].kind).toBe('repair');
    expect(a.suggestions[0].newItems).toEqual([]);
    expect(a.suggestions[0].familiar.map((f) => f.itemId)).toContain(ids.lemma('es', 'entender', 'VERB'));
  });
});

describe('analyzeProduction: analysis shape', () => {
  it('splits, tokenizes, queries GoLearn per form/lemma/phrase and reports familiarity, errors, independent items', async () => {
    const w = await makeWorld([esAdapter()]);
    await esStoryA(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo no sé. El casa.');
    expect(a.lang).toBe('es');
    expect(a.draftHash).toMatch(/^[0-9a-f]{16}$/);
    expect(a.sentences).toHaveLength(2);
    const [s0, s1] = a.sentences;
    expect(s0.tokenSurfaces).toEqual(['Yo', 'no', 'sé', '.']);
    expect(s0.itemIds).toEqual([ids.form('es', 'yo'), ids.form('es', 'no'), ids.form('es', 'sé')]);
    expect(s0.familiarity).toBe(1);
    expect(s1.familiarity).toBe(0.5); // "casa" met, "el" not
    expect(s0.knowledge.map((k) => k.itemId)).toContain(ids.lemma('es', 'yo', 'PRON')); // lemma queried too
    expect(s1.errors).toHaveLength(1);
    expect(s1.errors[0]).toMatchObject({ category: 'agreement', affectsMeaning: false, span: [0, 7] });
    expect(a.independentItemIds).toEqual([ids.form('es', 'yo'), ids.form('es', 'no'), ids.form('es', 'sé')]);
    expect(w.golearn.queries).toBeGreaterThan(0);
  });

  it('queries detected phrases and writes nothing when the learner already used the known phrase', async () => {
    const w = await makeWorld([esAdapter()]);
    await esLearnerB(w, 'B');
    const t = await w.gotell.getOrCreateTestimony('B', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Empecé a entender la verdad.');
    const phraseId = ids.phrase('es', ['empecé', 'a', 'entender', '_']);
    expect(a.sentences[0].itemIds).toContain(phraseId);
    expect(a.sentences[0].knowledge.find((k) => k.itemId === phraseId)?.exists).toBe(true);
    expect(a.suggestions).toEqual([]);
    expect(a.sentences[0].familiarity).toBe(1);
  });

  it('empty draft yields nothing', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, '   ');
    expect(a.sentences).toEqual([]);
    expect(a.suggestions).toEqual([]);
  });

  it('semantic sections are tagged per sentence as metadata with a recorded confidence', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Me arrepentí. Sentí culpa. Cuando yo era joven. La casa.');
    expect(a.sentences.map((s) => s.section)).toEqual(['repentance', 'conviction', 'childhood', undefined]);
    const rough = await w.gotell.submitDraft(t.id, ES_ROUGH);
    expect(rough.sentences[0].section).toBe('understanding-of-sin');
    const conf = (rough.sentences[0] as { sectionConfidence?: number }).sectionConfidence!;
    expect(conf).toBeGreaterThan(0);
    expect(conf).toBeLessThanOrEqual(1);
    // metadata only: the suggestion text never mentions a section
    expect(JSON.stringify(rough.suggestions)).not.toMatch(/understanding-of-sin/);
  });

  it('re-submitting the same draft keeps ids and the learner decision', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const first = await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.acceptSuggestion(first.suggestions[0].id);
    const again = await w.gotell.submitDraft(t.id, 'El casa.');
    expect(again.suggestions[0].id).toBe(first.suggestions[0].id);
    expect(again.suggestions[0].status).toBe('accepted');
    expect(await w.store.suggestions.count()).toBe(1);
  });
});

describe('suggestion caps and priority order', () => {
  const capAdapter = () => {
    const lexicon: Record<string, { lemma: string; pos: 'DET' }> = {};
    for (let i = 1; i <= 5; i++) { lexicon[`a${i}`] = { lemma: `a${i}`, pos: 'DET' }; lexicon[`b${i}`] = { lemma: `b${i}`, pos: 'DET' }; }
    return makeFakeAdapter({
      lang: 'es', lexicon, rules: [
        { match: ['a1'], replace: ['b1'], category: 'spelling', message: 'spelling' },
        { match: ['a2'], replace: ['b2'], category: 'agreement', message: 'agreement' },
        { match: ['a3'], replace: ['b3'], category: 'word-order', message: 'order' },
        { match: ['a4'], replace: ['b4'], category: 'agreement', message: 'meaning', affectsMeaning: true },
        { match: ['a5'], replace: ['b5'], category: 'register', message: 'register' },
        // the checker sees this problem but has no replacement for it: no combined fix is possible, so fixes are partial
        { match: ['a6'], replace: [], category: 'syntax', message: 'a6 cannot be fixed automatically', detectOnly: true },
      ],
    });
  };

  it('max 3 per sentence, meaning first, minor categories dropped first', async () => {
    const w = await makeWorld([capAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'a1 a2 a3 a4 a5 a6.');
    expect(MAX_SUGGESTIONS_PER_SENTENCE).toBe(3);
    expect(a.suggestions).toHaveLength(3);
    expect(a.suggestions.map((s) => s.priority)).toEqual([1, 2, 2]);
    expect(a.suggestions[0].suggested).toBe('a1 a2 a3 b4 a5 a6.');
    // every one is partial: the unfixable a6 (and the other fixes) still stand
    expect(a.suggestions.every((s) => s.scope === 'partial')).toBe(true);
    expect(a.suggestions[0].remainingIssues).toContain('a6 cannot be fixed automatically');
    expect(a.suggestions.some((s) => s.categories[0] === 'spelling' || s.categories[0] === 'register')).toBe(false);
  });

  it('max 6 per draft; priority order is global', async () => {
    const w = await makeWorld([capAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'a1 a2 a3 a4 a5 a6. a1 a2 a3 a4 a5 a6. a1 a2 a3 a4 a5 a6. a1 a2 a3 a4 a5 a6.');
    expect(MAX_SUGGESTIONS_PER_DRAFT).toBe(6);
    expect(a.suggestions).toHaveLength(6);
    const p = a.suggestions.map((s) => s.priority);
    expect([...p].sort()).toEqual(p);
    expect(p.filter((x) => x === 1)).toHaveLength(4);
    expect(new Set(a.suggestions.map((s) => s.id)).size).toBe(6);
  });
});

describe('scope: one combined suggestion when every detected issue has a replacement', () => {
  const adapter = () => makeFakeAdapter({
    lang: 'es', lexicon: {}, rules: [
      { match: ['a1'], replace: ['b1'], category: 'spelling', message: 'spelling' },
      { match: ['a2'], replace: ['b2'], category: 'agreement', message: 'agreement' },
      { match: ['a4'], replace: ['b4'], category: 'agreement', message: 'meaning', affectsMeaning: true },
    ],
  });

  it('three fixable issues => ONE suggestion, scope fixes-all-detected, priority of the most serious', async () => {
    const w = await makeWorld([adapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'a1 a2 a3 a4.');
    expect(a.suggestions).toHaveLength(1);
    const s = a.suggestions[0];
    expect(s.suggested).toBe('b1 b2 a3 b4.');
    expect(s.scope).toBe('fixes-all-detected');
    expect(s.remainingIssues).toEqual([]);
    expect(s.priority).toBe(1);
    expect([...s.categories].sort()).toEqual(['agreement', 'spelling']);
    expect(s.explanation).toContain('spelling');
    expect(s.explanation).toContain('meaning');
    expect(s.checkerCoverage).toMatch(/does not mean the sentence is now correct/);
  });
});

describe('meaningChange: key terms are never swapped silently', () => {
  it('know -> believe is flagged and surfaced first, even when the learner knows both words', async () => {
    const w = await makeWorld([esAdapter()]);
    const t0 = await buildFixtureText(w.store, { lang: 'es', slug: 'believer', sentences: [sentence(ES_LEXICON, 'Yo creo en Jesús .')] });
    await w.golearn.learnText('A', t0.id);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo sé en Jesús.');
    expect(a.suggestions).toHaveLength(1);
    const s = a.suggestions[0];
    expect(s.kind).toBe('repair');
    expect(s.priority).toBe(1);
    expect(s.meaningChange).toMatch(/key term/i);
    expect(s.meaningChange).toContain('(know)');
    expect(s.meaningChange).toContain('(believe)');
  });

  it('a swap within the same concept is not flagged', async () => {
    const w = await makeWorld([esAdapter()]);
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo conocía en Jesús.');
    expect(a.suggestions).toHaveLength(1);
    expect(a.suggestions[0].suggested).toBe('Yo sabía en Jesús.');
    expect(a.suggestions[0].meaningChange).toBeUndefined();
  });
});

describe('never add content', () => {
  it('drops suggestions that add nouns/verbs about events; keeps inflection/replacement; survives a throwing provider', async () => {
    const adds: SuggestionProvider = {
      id: 'llm-ish',
      async propose({ sentence }) {
        const base = { sentenceIndex: sentence.index, original: sentence.text, categories: ['clarity' as const], priority: 3 as const, itemIds: [] as string[], ...PLACEHOLDER_HONESTY };
        return [
          { ...base, kind: 'repair', suggested: `${sentence.text} Ayer fui a la iglesia y vi a mi madre.`, explanation: 'adds an event' },
          { ...base, kind: 'repair', suggested: 'Yo no sé casa.', explanation: 'adds a noun' },
          { ...base, kind: 'repair', suggested: sentence.text, explanation: 'no-op' },
          { ...base, kind: 'repair', suggested: 'Yo no sabía.', explanation: 'inflects the learner verb' },
        ];
      },
    };
    const throws: SuggestionProvider = { id: 'broken', async propose() { throw new Error('boom'); } };
    const w = await makeWorld([esAdapter()], { providers: [adds, throws] });
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo no sé.');
    expect(a.suggestions.map((s) => s.suggested)).toEqual(['Yo no sabía.']);
  });

  it('a content-word swap by another provider is allowed but flagged when it changes a key term', async () => {
    const swap: SuggestionProvider = {
      id: 'swapper',
      async propose({ sentence }) {
        return [{ sentenceIndex: sentence.index, kind: 'repair', original: sentence.text, suggested: 'Yo no creo.', explanation: 'swap', categories: ['lexical-choice'], priority: 2, itemIds: [], ...PLACEHOLDER_HONESTY }];
      },
    };
    const w = await makeWorld([esAdapter()], { providers: [swap] });
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo no sé.');
    const s = a.suggestions.find((x) => x.suggested === 'Yo no creo.')!;
    expect(s).toBeDefined();
    expect(s.meaningChange).toContain('(believe)');
    expect(s.kind).toBe('expansion'); // "creo" is unseen
    expect(s.priority).toBe(1);
  });
});

describe('other languages', () => {
  it('Hindi agreement rule: a known-word fix is a plain repair', async () => {
    const w = await makeWorld([hiAdapter()]);
    await hiLearner(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'hi');
    const a = await w.gotell.submitDraft(t.id, 'जब मैं छोटी थी मैं स्कूल गया।');
    expect(a.suggestions).toHaveLength(1);
    const s = a.suggestions[0];
    expect(s.kind).toBe('repair');
    expect(s.suggested).toBe('जब मैं छोटी थी मैं स्कूल गई।');
    expect(s.categories).toEqual(['agreement']);
    expect(s.newItems).toEqual([]);
    expect(s.familiar.map((f) => f.itemId)).toContain(ids.form('hi', 'गई'));
    // without the feminine context the rule does not fire
    const b = await w.gotell.submitDraft(t.id, 'जब मैं छोटा था मैं स्कूल गया।');
    expect(b.suggestions).toEqual([]);
  });

  it('Hindi recombination with the slot BEFORE the anchor (SOV frame)', async () => {
    const w = await makeWorld([hiAdapter()]);
    await hiLearner(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'hi');
    const a = await w.gotell.submitDraft(t.id, 'मैं अपना पाप समझ।');
    expect(a.suggestions).toHaveLength(1);
    const s = a.suggestions[0];
    expect(s.kind).toBe('recombination');
    expect(s.suggested).toBe('मैं अपना पाप समझने लगा।');
    expect(s.familiar.map((f) => f.itemId)).toContain(ids.phrase('hi', ['_', 'समझने', 'लगा']));
    expect(s.meaningChange).toBeUndefined(); // only an inflection of the learner's own verb + an auxiliary
  });

  it('Hindi: negation inside the affected region blocks recombination (conservative)', async () => {
    const w = await makeWorld([hiAdapter()]);
    await hiLearner(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'hi');
    const a = await w.gotell.submitDraft(t.id, 'मैं अपना पाप नहीं समझ।');
    expect(a.suggestions).toEqual([]);
  });

  it('Thai draft is tokenized without spaces', async () => {
    const w = await makeWorld([thAdapter()]);
    await thStoryA(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'th');
    const a = await w.gotell.submitDraft(t.id, TH_ROUGH);
    expect(TH_ROUGH).not.toMatch(/\s/);
    expect(a.sentences).toHaveLength(1);
    expect(a.sentences[0].tokenSurfaces).toEqual(TH_ROUGH_TOKENS);
    expect(a.sentences[0].tokenSurfaces.every((s) => !/\s/.test(s))).toBe(true);
    expect(a.sentences[0].itemIds).toContain(ids.form('th', 'พระเยซู'));
    expect(a.sentences[0].familiarity).toBeGreaterThan(0.5);
    // two sentences separated by a space
    const two = await w.gotell.submitDraft(t.id, 'ฉันรู้จักพระเยซู ฉันไม่เข้าใจบาป');
    expect(two.sentences.map((s) => s.text)).toEqual(['ฉันรู้จักพระเยซู', 'ฉันไม่เข้าใจบาป']);
  });
});

describe('determinism', () => {
  it('same learner + same draft => same suggestion ids and text', async () => {
    const w = await makeWorld([esAdapter()]);
    await esLearnerB(w, 'B');
    const t = await w.gotell.getOrCreateTestimony('B', 'es');
    const a1 = await w.gotell.submitDraft(t.id, ES_ROUGH);
    const a2 = await w.gotell.submitDraft(t.id, ES_ROUGH);
    expect(a2.suggestions.map((s) => [s.id, s.suggested])).toEqual(a1.suggestions.map((s) => [s.id, s.suggested]));
    expect(a1.draftHash).toBe(hash(`B|${t.id}|${ES_ROUGH}`));
  });
});

