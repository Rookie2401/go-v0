/**
 * The register rule (docs/norway/SPEC.md §3): a recombination built on a phrase whose EVERY recorded occurrence is in a text of a
 * historical variety of the adapter's `varieties` table is dropped, so the learner is not nudged to write "efter" or "sprog".
 * Generic (any language), and inert where a text carries no historical variety: golden outputs for Spanish and German pin that.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { NB_VARIETIES } from '../../src/adapters/norwegian/varieties';
import type { FixtureToken, LanguageAdapter, LanguageCode } from '../../src/core';
import { buildFixtureText, makeFakeAdapter, makeWorld } from './fakes';
import type { FakeLex, World } from './fakes';
import { esAdapter, esLearnerB, sentence } from './fixtures';

const L = (lemma: string, pos: FakeLex['pos'], gloss?: string): FakeLex => ({ lemma, pos, gloss });

// a Norwegian fake: Bokmål words, with the real variety table so 'nb-dano' is historical
const NB_LEXICON: Record<string, FakeLex> = {
  jeg: L('jeg', 'PRON', 'I'), begynte: L('begynne', 'VERB', 'began'), 'å': L('å', 'PART'), 'forstå': L('forstå', 'VERB', 'understand'),
  synden: L('synd', 'NOUN', 'the sin'), efter: L('etter', 'ADV', 'after'),
};
const NB_PHRASE = ['begynte', 'å', 'forstå', '_'];
const nbAdapter = (): LanguageAdapter => ({ ...makeFakeAdapter({ lang: 'nb', lexicon: NB_LEXICON, phrases: [NB_PHRASE] }), varieties: NB_VARIETIES });

async function nbText(w: World, slug: string, variety?: string) {
  const t = await buildFixtureText(w.store, {
    lang: 'nb', slug, kind: 'story', sentences: [
      sentence(NB_LEXICON, 'Jeg begynte å forstå synden .', { phrases: [{ pattern: NB_PHRASE, display: 'begynte å forstå …', tokenIndexes: [1, 2, 3] }] }),
    ],
  });
  if (variety) await w.store.texts.put({ ...t, variety });
  await w.golearn.learnText('A', t.id);
  return t;
}

const DRAFT = 'Jeg forstå synden.';

describe('register rule: recombination from historical-only phrases is dropped', () => {
  it('a phrase met only in a Dano-Norwegian text is not offered back (nb-dano)', async () => {
    const w = await makeWorld([nbAdapter()]);
    await nbText(w, 'dano-1', 'nb-dano');
    const t = await w.gotell.getOrCreateTestimony('A', 'nb');
    const a = await w.gotell.submitDraft(t.id, DRAFT);
    expect(a.suggestions).toEqual([]);
  });

  it('the same phrase met in an untagged (modern) text IS offered - the rule is the variety, nothing else', async () => {
    const w = await makeWorld([nbAdapter()]);
    await nbText(w, 'modern-1');
    const t = await w.gotell.getOrCreateTestimony('A', 'nb');
    const a = await w.gotell.submitDraft(t.id, DRAFT);
    expect(a.suggestions).toHaveLength(1);
    expect(a.suggestions[0].kind).toBe('recombination');
    expect(a.suggestions[0].suggested).toBe('Jeg begynte å forstå synden.');
  });

  it('"every occurrence": one modern text among the historical ones keeps the suggestion; Riksmål counts as historical too', async () => {
    const w = await makeWorld([nbAdapter()]);
    await nbText(w, 'riks-1', 'nb-riksmal');
    await nbText(w, 'dano-2', 'nb-dano');
    const t = await w.gotell.getOrCreateTestimony('A', 'nb');
    expect((await w.gotell.submitDraft(t.id, DRAFT)).suggestions).toEqual([]);
    await nbText(w, 'modern-2', 'nb');
    const again = await w.gotell.submitDraft(t.id, DRAFT + ' ');
    expect(again.suggestions.map((s) => s.kind)).toEqual(['recombination']);
  });

  it('a repair is never dropped by the rule (only wording taken from a phrase is)', async () => {
    const adapter = makeFakeAdapter({
      lang: 'nb', lexicon: NB_LEXICON, phrases: [NB_PHRASE],
      rules: [{ match: ['efter'], replace: ['etter'], category: 'register', message: '"efter" is an older spelling: write "etter".' }],
    });
    const w = await makeWorld([{ ...adapter, varieties: NB_VARIETIES }]);
    await nbText(w, 'dano-3', 'nb-dano');
    const t = await w.gotell.getOrCreateTestimony('A', 'nb');
    const a = await w.gotell.submitDraft(t.id, 'efter');
    // labelled 'expansion' by the service because "etter" is new to this learner; the point is that it is not dropped
    expect(a.suggestions.map((s) => s.suggested)).toEqual(['etter']);
    expect(a.suggestions[0].categories).toEqual(['register']);
  });

  it('an adapter with no variety table is untouched even if a text carries a variety string', async () => {
    const w = await makeWorld([{ ...nbAdapter(), varieties: undefined }]);
    await nbText(w, 'dano-4', 'nb-dano');
    const t = await w.gotell.getOrCreateTestimony('A', 'nb');
    expect((await w.gotell.submitDraft(t.id, DRAFT)).suggestions.map((s) => s.kind)).toEqual(['recombination']);
  });
});

describe('register rule: golden - existing Spanish and German output is unchanged for texts without a historical variety', () => {
  it('Spanish (fake adapter): the recombination is exactly what it was', async () => {
    const w = await makeWorld([esAdapter()]);
    await esLearnerB(w, 'A');
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const a = await w.gotell.submitDraft(t.id, 'Yo entender la verdad.');
    expect(a.suggestions).toHaveLength(1);
    const s = a.suggestions[0];
    expect({ kind: s.kind, suggested: s.suggested, categories: s.categories, priority: s.priority, scope: s.scope, newItems: s.newItems }).toMatchInlineSnapshot(`
      {
        "categories": [
          "collocation",
        ],
        "kind": "recombination",
        "newItems": [],
        "priority": 1,
        "scope": "fixes-all-detected",
        "suggested": "Yo empecé a entender la verdad.",
      }
    `);
    expect(s.explanation).toMatchInlineSnapshot(`"You wrote "entender la verdad". You have met the phrase "empecé a entender …" - here it is with your own words in it: "empecé a entender la verdad"."`);
    expect(s.meaningChange).toMatchInlineSnapshot(`"The phrase "empecé a entender …" says more than you wrote (adds: empecé). Check it still says what you mean."`);
  });

  it('Spanish: the same text tagged es-hist (historical) drops it - the variety is the only difference', async () => {
    const w = await makeWorld([{ ...esAdapter(), varieties: createAdapterRegistry().get('es').varieties }]);
    const scripture = await esLearnerB(w, 'A'); // the phrase lives only in this text
    await w.store.texts.put({ ...scripture, variety: 'es-hist' });
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    expect((await w.gotell.submitDraft(t.id, 'Yo entender la verdad.')).suggestions).toEqual([]);
  });

  it('German (real adapter): the recombination is exactly what it was; de-1901 texts drop it; a living variety does not', async () => {
    const de = createAdapterRegistry().get('de');
    const phrase = ['glaube', 'an', '_'];
    const run = async (variety?: string) => {
      const w = await makeWorld([de]);
      const text = 'Ich glaube an Gott.';
      const toks = de.tokenize(text);
      const an = de.analyze(toks);
      const tokens: FixtureToken[] = toks.map((tk, i) => (tk.isWord
        ? { surface: tk.surface, lemma: an[i].candidates[0]?.lemma, pos: an[i].candidates[0]?.pos, gloss: an[i].candidates[0]?.gloss }
        : { surface: tk.surface, isWord: false }));
      const built = await buildFixtureText(w.store, { lang: 'de', slug: 'de-text', sentences: [{ tokens, text, phrases: [{ pattern: phrase, display: 'glaube an …', tokenIndexes: [1, 2] }] }] });
      if (variety) await w.store.texts.put({ ...built, variety });
      await w.golearn.learnText('A', built.id);
      const t = await w.gotell.getOrCreateTestimony('A', 'de' as LanguageCode);
      return (await w.gotell.submitDraft(t.id, 'Ich glaube Gott.')).suggestions;
    };
    const plain = await run();
    expect(plain.map((s) => ({ kind: s.kind, suggested: s.suggested, categories: s.categories, priority: s.priority, scope: s.scope }))).toMatchInlineSnapshot(`
      [
        {
          "categories": [
            "collocation",
          ],
          "kind": "recombination",
          "priority": 3,
          "scope": "fixes-all-detected",
          "suggested": "Ich glaube an Gott.",
        },
      ]
    `);
    expect(await run('de-1901')).toEqual([]);
    expect(await run('de-DE')).toHaveLength(plain.length);
  });
});
