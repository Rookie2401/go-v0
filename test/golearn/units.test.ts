/**
 * One encounter per lexical unit (contract v9): a unit written as several words ("steht … auf" = aufstehen) carries the
 * unit's lemma on every piece, but only the HEAD piece credits it; a piece's FORM still counts as met; help on any piece is
 * help on the unit's lemma. The rule reads the stored `unit` field and never the language, so these tests build the text by
 * hand (the fixture builder cannot write `unit`) and a text without `unit` behaves exactly as before.
 *
 * Also: search across spellings (`findOccurrences` on a form also finds the tokens whose analysis relates their older
 * spelling to it), which reads the stored `orthography` field the same way.
 */
import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { AppStore, DomainEvent, EventInput, TokenAnalysis, UnitLink } from '../../src/core';
import { AnalysisCache, askedLemmaId, creditableLemmaId } from '../../src/golearn/analysis';
import { profileOfStoredText } from '../../src/library';
import { createHarness } from './harness';
import type { Harness } from './harness';

const U = 'u1';
const TEXT = ids.text('de', 'einheit');
const S0 = ids.sentence(TEXT, 0);
const S1 = ids.sentence(TEXT, 1);
const AUFSTEHEN = ids.lemma('de', 'aufstehen', 'VERB');
const F = (w: string) => ids.form('de', w);

/** "Er steht früh auf ." / "Sie steht spät auf ." — steht and auf are the two pieces of aufstehen in each. */
async function buildUnitText(store: AppStore) {
  await buildFixtureText(store, {
    lang: 'de', slug: 'einheit', title: 'Einheit',
    sentences: [
      { tokens: [
        { surface: 'Er', lemma: 'er', pos: 'PRON' },
        { surface: 'steht', lemma: 'aufstehen', pos: 'VERB', gloss: 'to get up' },
        { surface: 'früh', lemma: 'früh', pos: 'ADV' },
        { surface: 'auf', lemma: 'aufstehen', pos: 'VERB', gloss: 'to get up' },
        { surface: '.', isWord: false },
      ] },
      { tokens: [
        { surface: 'Sie', lemma: 'sie', pos: 'PRON' },
        { surface: 'steht', lemma: 'aufstehen', pos: 'VERB', gloss: 'to get up' },
        { surface: 'spät', lemma: 'spät', pos: 'ADV' },
        { surface: 'auf', lemma: 'aufstehen', pos: 'VERB', gloss: 'to get up' },
        { surface: '.', isWord: false },
      ] },
    ],
  });
}

/** Write the `unit` link onto the analyses of the two pieces of one sentence (head = token 1, particle = token 3). */
export async function linkUnit(store: AppStore, sentenceId: string, head = 1, piece = 3) {
  const headId = ids.token(sentenceId, head);
  const pieceId = ids.token(sentenceId, piece);
  const link = (role: string): UnitLink => ({ headTokenId: headId, pieceTokenIds: [headId, pieceId], role, display: 'aufstehen' });
  for (const [tokenId, role] of [[headId, 'head'], [pieceId, 'separable prefix']] as const) {
    const row = (await store.analyses.where('tokenId', tokenId))[0];
    await store.analyses.put({ ...row, unit: link(role) });
  }
}

async function world(): Promise<Harness> {
  const h = createHarness();
  await buildUnitText(h.store);
  await linkUnit(h.store, S0);
  await linkUnit(h.store, S1);
  return h;
}

const analysisOf = async (store: AppStore, tokenId: string): Promise<TokenAnalysis> => (await store.analyses.where('tokenId', tokenId))[0];

describe('the rule on one analysis', () => {
  it('the head credits the unit lemma, a non-head piece credits none, an ordinary word credits as ever', async () => {
    const h = await world();
    const head = await analysisOf(h.store, ids.token(S0, 1));
    const piece = await analysisOf(h.store, ids.token(S0, 3));
    const plain = await analysisOf(h.store, ids.token(S0, 2));
    expect(creditableLemmaId(head)).toBe(AUFSTEHEN);
    expect(creditableLemmaId(piece)).toBeUndefined();
    expect(creditableLemmaId(plain)).toBe(ids.lemma('de', 'früh', 'ADV'));
    // the piece is still ABOUT the unit: a question about it is a question about aufstehen
    expect(askedLemmaId(piece)).toBe(AUFSTEHEN);
    expect(askedLemmaId(head)).toBe(AUFSTEHEN);
  });

  it('a unit that names no head of its own piece is read the same way for the cache', async () => {
    const h = await world();
    const cache = new AnalysisCache(h.store);
    expect(await cache.lemmaIdOf(ids.token(S0, 1))).toBe(AUFSTEHEN);
    expect(await cache.lemmaIdOf(ids.token(S0, 3))).toBeUndefined();
    expect(await cache.askedLemmaIdOf(ids.token(S0, 3))).toBe(AUFSTEHEN);
  });

  it('a low-confidence analysis is still not credited, head or not (the unit does not lift the confidence floor)', async () => {
    const h = await world();
    const head = await analysisOf(h.store, ids.token(S0, 1));
    expect(creditableLemmaId({ ...head, provenance: 'machine', confidence: 0.2 })).toBeUndefined();
    expect(askedLemmaId({ ...head, provenance: 'machine', confidence: 0.2 })).toBeUndefined();
    expect(creditableLemmaId({ ...head, provenance: 'human', confidence: 0.2 })).toBe(AUFSTEHEN);
  });
});

describe('encounters: a separated unit is one word', () => {
  it('a sentence is one lemma encounter, and both written pieces are met as forms', async () => {
    const h = await world();
    await h.view(U, 'de', TEXT, 0);
    expect((await h.golearn.getItemState(U, AUFSTEHEN))?.encounterCount).toBe(1);
    for (const w of ['steht', 'auf', 'früh', 'er']) expect((await h.golearn.getItemState(U, F(w)))?.encounterCount, w).toBe(1);
  });

  it('the stranded particle alone (the learner saw only that token) is met as a form and credits no lemma', async () => {
    const h = await world();
    await h.bus.emit({
      type: 'SentenceViewed', userId: U, lang: 'de', session: 's1', surface: 'corpus', dedupeKey: 'view:u1:s1:particle',
      textId: TEXT, sentenceId: S0, tokenIds: [ids.token(S0, 3)],
    } as EventInput<DomainEvent>);
    expect((await h.golearn.getItemState(U, F('auf')))?.encounterCount).toBe(1);
    expect(await h.golearn.getItemState(U, AUFSTEHEN)).toBeUndefined();
    // the head alone credits it
    await h.bus.emit({
      type: 'SentenceViewed', userId: U, lang: 'de', session: 's1', surface: 'corpus', dedupeKey: 'view:u1:s1:head',
      textId: TEXT, sentenceId: S1, tokenIds: [ids.token(S1, 1)],
    } as EventInput<DomainEvent>);
    expect((await h.golearn.getItemState(U, AUFSTEHEN))?.encounterCount).toBe(1);
  });

  it('a text with no `unit` on any analysis credits every piece with the lemma, exactly as before', async () => {
    const h = createHarness();
    await buildUnitText(h.store); // no linkUnit
    const cache = new AnalysisCache(h.store);
    expect(await cache.lemmaIdOf(ids.token(S0, 3))).toBe(AUFSTEHEN);
    expect(await cache.lemmaIdOf(ids.token(S0, 1))).toBe(AUFSTEHEN);
  });
});

describe('help on any piece is help on the unit', () => {
  it('help on the stranded "auf" lands on aufstehen exactly as help on "steht" does', async () => {
    const onPiece = await world();
    await onPiece.view(U, 'de', TEXT, 0);
    await onPiece.help(U, 'de', TEXT, 0, 3, F('auf'), 3);
    const viaPiece = await onPiece.golearn.getItemState(U, AUFSTEHEN);

    const onHead = await world();
    await onHead.view(U, 'de', TEXT, 0);
    await onHead.help(U, 'de', TEXT, 0, 1, F('steht'), 3);
    const viaHead = await onHead.golearn.getItemState(U, AUFSTEHEN);

    expect(viaPiece?.reading.assisted).toBe(1);
    expect(viaPiece?.reading.unassisted).toBe(0);
    expect(viaPiece?.reading).toEqual(viaHead?.reading);
    // help on one piece's FORM does not touch the other piece's form
    expect((await onPiece.golearn.getItemState(U, F('steht')))?.reading.assisted).toBe(0);
    expect((await onPiece.golearn.getItemState(U, F('auf')))?.reading.assisted).toBe(1);
  });

  it('help on an ordinary word never reaches the unit', async () => {
    const h = await world();
    await h.view(U, 'de', TEXT, 0);
    await h.help(U, 'de', TEXT, 0, 2, F('früh'), 3);
    expect((await h.golearn.getItemState(U, AUFSTEHEN))?.reading.assisted).toBe(0);
    expect((await h.golearn.getItemState(U, AUFSTEHEN))?.reading.unassisted).toBe(1);
  });
});

describe('coverage and the profile read the same rule', () => {
  it('a known unit: the stranded particle is known too, as its head is (by the unit lemma), though its own form was never met', async () => {
    const h = await world();
    for (const w of ['er', 'früh']) await h.mark(U, 'de', F(w), 'known');
    await h.mark(U, 'de', AUFSTEHEN, 'known', 'lemma');
    const cov = await h.golearn.coverage(U, TEXT, [S0]);
    expect(cov.wordTokens).toBe(4);
    expect(cov.knownLexicalCoverage).toBeCloseTo(1, 10); // er, früh, steht AND auf
    expect(cov.unseenCoverage).toBe(0);
    expect(await h.golearn.getItemState(U, F('auf'))).toBeUndefined(); // judged by the unit, not by its own form
    const support = await h.golearn.sentenceSupport(U, S0);
    expect(support.highlight[ids.token(S0, 3)]).toBe(support.highlight[ids.token(S0, 1)]);
  });

  it('an unknown unit: both pieces count as unseen in the coverage, but the unit is one entry in the unfamiliar words and the gaps, not two', async () => {
    const h = await world();
    for (const w of ['er', 'früh']) await h.mark(U, 'de', F(w), 'known');
    const cov = await h.golearn.coverage(U, TEXT, [S0]);
    expect(cov.knownLexicalCoverage).toBeCloseTo(0.5, 10);
    expect(cov.unseenCoverage).toBeCloseTo(0.5, 10); // steht and auf
    const support = await h.golearn.sentenceSupport(U, S0);
    expect(support.highlight[ids.token(S0, 3)]).toBe(support.highlight[ids.token(S0, 1)]);
    const readiness = await h.golearn.scriptureReadiness(U, TEXT, [S0]);
    expect(readiness.unfamiliarForms.map((u) => u.itemId)).toEqual([F('steht')]); // the particle is listed with its head, never on its own
    expect(readiness.gaps.filter((g) => g.itemId === AUFSTEHEN || g.itemId === F('auf')).map((g) => [g.itemId, g.count])).toEqual([[AUFSTEHEN, 1]]);
  });

  it('the forecast lists a new unit once, under its lemma, and not its two pieces', async () => {
    const h = await world();
    const f = await h.golearn.predictDifficulty(U, TEXT);
    const listed = [...f.newUsefulWords, ...f.rareWords];
    expect(listed.filter((i) => i.itemId === AUFSTEHEN)).toEqual([
      { itemId: AUFSTEHEN, itemKind: 'lemma', surface: 'aufstehen', count: 2, gloss: 'to get up' }, // two sentences, one unit each
    ]);
    for (const w of ['steht', 'auf']) expect(listed.some((i) => i.itemId === F(w)), w).toBe(false);
    expect(listed.filter((i) => i.itemKind === 'form').map((i) => i.surface).sort()).toEqual(['Er', 'Sie', 'früh', 'spät']);
  });

  it('a known unit is not in the forecast at all, neither as a unit nor as a stranded "auf"', async () => {
    const h = await world();
    await h.mark(U, 'de', AUFSTEHEN, 'known', 'lemma');
    const f = await h.golearn.predictDifficulty(U, TEXT);
    const listed = [...f.newUsefulWords, ...f.rareWords, ...f.properNouns];
    expect(listed.some((i) => i.itemId === AUFSTEHEN || i.itemId === F('auf') || i.itemId === F('steht'))).toBe(false);
  });

  it('a text with no `unit` is classified exactly as before: each token by its own form and its credited lemma', async () => {
    const h = createHarness();
    await buildUnitText(h.store); // no linkUnit
    await h.mark(U, 'de', AUFSTEHEN, 'known', 'lemma');
    const cov = await h.golearn.coverage(U, TEXT, [S0]);
    expect(cov.knownLexicalCoverage).toBeCloseTo(0.5, 10); // steht and auf through the lemma; er and früh not marked here
    const f = await h.golearn.predictDifficulty(U, TEXT, { sentenceIds: [S0] });
    expect([...f.newUsefulWords, ...f.rareWords].every((i) => i.itemKind === 'form')).toBe(true);
  });

  it('the profile counts the unit lemma once per unit, and the forms of both pieces', async () => {
    const h = await world();
    const p = (await profileOfStoredText(h.store, TEXT))!;
    expect(p.lemmas.find(([l]) => l === AUFSTEHEN)).toEqual([AUFSTEHEN, 2]); // two sentences, one unit each (not four)
    expect(p.forms.find(([f]) => f === 'steht')).toEqual(['steht', 2]);
    expect(p.forms.find(([f]) => f === 'auf')).toEqual(['auf', 2]);
    expect(p.words).toBe(8);
  });
});

describe('search across spellings', () => {
  const MODERN = ids.text('de', 'modern');
  const OLD = ids.text('de', 'alt');

  async function spellings(h: Harness, fillers = 0, withModern = true) {
    if (withModern) {
      await buildFixtureText(h.store, { lang: 'de', slug: 'modern', sentences: [{ tokens: [
        { surface: 'Er', lemma: 'er', pos: 'PRON' }, { surface: 'sagt', lemma: 'sagen', pos: 'VERB' }, { surface: 'dass', lemma: 'dass', pos: 'SCONJ' }, { surface: 'es', lemma: 'es', pos: 'PRON' },
      ] }] });
    }
    await buildFixtureText(h.store, { lang: 'de', slug: 'alt', sentences: [{ tokens: [
      { surface: 'Er', lemma: 'er', pos: 'PRON' }, { surface: 'sagt', lemma: 'sagen', pos: 'VERB' }, { surface: 'daß', lemma: 'dass', pos: 'SCONJ' }, { surface: 'es', lemma: 'es', pos: 'PRON' },
    ] }] });
    const row = (await h.store.analyses.where('tokenId', ids.token(ids.sentence(OLD, 0), 2)))[0];
    await h.store.analyses.put({ ...row, orthography: { modern: 'dass', period: 'de-1901', confidence: 0.95 } });
    for (let i = 0; i < fillers; i++) {
      await buildFixtureText(h.store, { lang: 'de', slug: `fuell${i}`, sentences: [{ tokens: [{ surface: 'Wir', lemma: 'wir', pos: 'PRON' }, { surface: 'gehen', lemma: 'gehen', pos: 'VERB' }, { surface: 'heim', lemma: 'heim', pos: 'ADV' }] }] });
    }
  }

  it('"dass" finds "daß", says which spelling it is written in, and leaves an ordinary result as it was', async () => {
    const h = createHarness();
    await spellings(h);
    const r = await h.golearn.findOccurrences({ lang: 'de', itemId: F('dass') });
    expect(r).toEqual([
      { sentenceId: ids.sentence(OLD, 0), textId: OLD, tokenIds: [ids.token(ids.sentence(OLD, 0), 2)], spellings: [{ tokenId: ids.token(ids.sentence(OLD, 0), 2), written: 'daß', modern: 'dass', period: 'de-1901' }] },
      { sentenceId: ids.sentence(MODERN, 0), textId: MODERN, tokenIds: [ids.token(ids.sentence(MODERN, 0), 2)] }, // exactly three fields
    ]);
  });

  it('searching the older spelling finds only what is written that way', async () => {
    const h = createHarness();
    await spellings(h);
    const r = await h.golearn.findOccurrences({ lang: 'de', itemId: F('daß') });
    expect(r.map((x) => x.textId)).toEqual([OLD]);
    expect(r[0]).toEqual({ sentenceId: ids.sentence(OLD, 0), textId: OLD, tokenIds: [ids.token(ids.sentence(OLD, 0), 2)] });
  });

  it('a query by lemma returns both spellings, as it always did', async () => {
    const h = createHarness();
    await spellings(h);
    const r = await h.golearn.findOccurrences({ lang: 'de', itemId: ids.lemma('de', 'dass', 'SCONJ') });
    expect(new Set(r.map((x) => x.textId))).toEqual(new Set([OLD, MODERN]));
  });

  it('when no token has the modern form, the adapter says which lemma it is and the older text is still found', async () => {
    const h = createHarness();
    await spellings(h, 0, false);
    expect(await h.golearn.findOccurrences({ lang: 'de', itemId: F('dass') })).toEqual([]); // nothing links the form to a lemma yet
    const de = h.adapters.get('de');
    de.analyze = (tokens) => tokens.map((token) => ({
      token, analyzer: 'test@1', candidates: token.normalized === 'dass' ? [{ lemma: 'dass', pos: 'SCONJ' as const, morph: {}, confidence: 0.9 }] : [],
    }));
    expect((await h.golearn.findOccurrences({ lang: 'de', itemId: F('dass') })).map((x) => x.textId)).toEqual([OLD]);
  });

  it('respects limit, textIds and live / visible sentences like every other search', async () => {
    const h = createHarness();
    await spellings(h);
    expect((await h.golearn.findOccurrences({ lang: 'de', itemId: F('dass'), textIds: [MODERN] })).map((x) => x.textId)).toEqual([MODERN]);
    expect(await h.golearn.findOccurrences({ lang: 'de', itemId: F('dass'), limit: 1 })).toHaveLength(1);
    const s = (await h.store.sentences.get(ids.sentence(OLD, 0)))!;
    await h.store.sentences.put({ ...s, retiredInVersion: 2 });
    expect((await h.golearn.findOccurrences({ lang: 'de', itemId: F('dass') })).map((x) => x.textId)).toEqual([MODERN]);
  });

  it('does not scan: the reads it makes are the same with 5 or with 60 unrelated sentences, and never an `all()`', async () => {
    const reads = async (fillers: number) => {
      const h = createHarness();
      await spellings(h, fillers);
      const calls: string[] = [];
      for (const name of ['analyses', 'tokens'] as const) {
        const table = h.store[name] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
        for (const m of ['where', 'all']) {
          const original = table[m].bind(table);
          table[m] = (...a: unknown[]) => { calls.push(`${name}.${m}`); return original(...a); };
        }
      }
      const r = await h.golearn.findOccurrences({ lang: 'de', itemId: F('dass') });
      expect(r.map((x) => x.textId)).toEqual([OLD, MODERN]);
      return calls;
    };
    const few = await reads(5);
    const many = await reads(60);
    expect(many).toEqual(few);
    expect(many.filter((c) => /\.all$/.test(c))).toEqual([]);
  });
});
