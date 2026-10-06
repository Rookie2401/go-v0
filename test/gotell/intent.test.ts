/**
 * intent(): built ONLY from the stated English meaning (+ an optional attempt) and from wording the learner has
 * already met. Never from a draft or a revision. When the meaning (or part of it) has no encountered wording the
 * answer is supported:false with no proposal - nothing to insert.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { intentTerms, stemEnglish } from '../../src/gotell';
import { buildFixtureText, makeWorld } from './fakes';
import { ES_LEXICON, ES_ROUGH, esAcceptAdapter, esScriptureIntent, esStoryA, esStoryC, sentence } from './fixtures';

const world = () => makeWorld([esAcceptAdapter()]);

describe('intent(): supported - wording the learner has met', () => {
  it('"I began to understand my sin" => the smallest verbatim span of the sentence he met, with that sentence as source', async () => {
    const w = await world();
    await esScriptureIntent(w, 'A');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I began to understand my sin' });
    expect(r.supported).toBe(true);
    expect(r.insertable).toBe(true);
    expect(r.limitation).toBeUndefined();
    expect(r.proposal).toBe('Empecé a entender mi pecado.'); // "Un día" is not part of what he asked for
    expect(r.unexpressed).toEqual([]);
    expect(r.newItems).toEqual([]);
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0]).toMatchObject({ textId: 'text:es:scripture-i', textTitle: 'Scripture I', excerpt: 'Un día empecé a entender mi pecado.', sentenceId: ids.sentence('text:es:scripture-i', 0), surface: 'scripture' });
    expect(r.familiar.map((f) => f.itemId)).toContain(ids.phrase('es', ['empecé', 'a', 'entender', '_']));
    expect(r.meaningNote).toMatch(/word for word from "Scripture I"/);
    expect(r.meaningNote).toMatch(/Person and tense/);
    expect(r.meaningNote).toMatch(/Key terms.*sin/);
  });

  it('negation is kept: "I did not understand my sin" takes the negative sentence, never the affirmative one', async () => {
    const w = await world();
    await esScriptureIntent(w, 'A');
    const neg = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I did not understand my sin' });
    expect(neg.supported).toBe(true);
    expect(neg.proposal).toBe('No entendía mi pecado.');
    expect(neg.sources[0].excerpt).toBe('Yo no entendía mi pecado.');
    // and "I understood my sin" must not come out negative
    const pos = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I understood my sin' });
    expect(pos.proposal).toBe('Empecé a entender mi pecado.'); // affirmative sentence; the negative one is set aside
    expect(pos.proposal).not.toMatch(/\bno\b/i);
  });

  it('the span never carries a key term he did not ask for', async () => {
    const w = await world();
    await buildFixtureText(w.store, { lang: 'es', slug: 'guilt', title: 'Guilt text', sentences: [sentence(ES_LEXICON, 'Sentí culpa y convicción .', { english: 'I felt guilt and conviction.' })] });
    await w.golearn.learnText('A', 'text:es:guilt');
    const ok = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I felt guilt' });
    expect(ok.supported).toBe(true);
    expect(ok.proposal).toBe('Sentí culpa.');
    const blocked = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I felt conviction' });
    expect(blocked.supported).toBe(false);
    expect(blocked.proposal).toBeUndefined();
    expect(blocked.limitation).toMatch(/also says guilt/);
  });
});

describe('intent(): not supported - nothing to insert', () => {
  it('part of the meaning has no encountered wording: supported:false, insertable:false, what is missing, no proposal', async () => {
    const w = await world();
    await esScriptureIntent(w, 'A');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I began to understand my sin and my guilt' });
    expect(r.supported).toBe(false);
    expect(r.insertable).toBe(false);
    expect(r.proposal).toBeUndefined();
    expect(r.unexpressed).toEqual(['guilt']);
    expect(r.limitation).toMatch(/not met any wording for "guilt"/);
    expect(r.limitation).toMatch(/"understand"/); // what WAS met is named
    expect(r.sources).toEqual([]);
    expect(r.familiar).toEqual([]);
    expect(r.newItems).toEqual([]);
  });

  it('wholly unsupported: every idea is listed', async () => {
    const w = await world();
    await esStoryA(w, 'A');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I like pizza' });
    expect(r.supported).toBe(false);
    expect(r.insertable).toBe(false);
    expect(r.proposal).toBeUndefined();
    expect(r.unexpressed).toEqual(['like', 'pizza']);
    expect(r.limitation).toMatch(/"like", "pizza"/);
  });

  it('a learner with no history gets the same honest refusal, not a word bank', async () => {
    const w = await world();
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'When I was young I knew about Jesus but I did not understand my sin' });
    expect(r.supported).toBe(false);
    expect(r.proposal).toBeUndefined();
    expect(r.unexpressed.length).toBeGreaterThan(0);
  });

  it('each idea met, but never together: no gluing of pieces from different sentences', async () => {
    const w = await world();
    await esStoryA(w, 'A'); // "Cuando yo era joven."
    await esScriptureIntent(w, 'A'); // "... no entendía mi pecado."
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'When I was young I did not understand my sin' });
    expect(r.supported).toBe(false);
    expect(r.proposal).toBeUndefined();
    expect(r.unexpressed).toEqual(['young']);
    expect(r.limitation).toMatch(/no single sentence/);
    expect(r.limitation).toMatch(/Story A/);
  });

  it('no content words in the English is reported, not guessed at', async () => {
    const w = await world();
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I am the' });
    expect(r.supported).toBe(false);
    expect(r.limitation).toMatch(/no content words/);
  });

  it('another learner\'s reading is not this learner\'s wording', async () => {
    const w = await world();
    await esScriptureIntent(w, 'B');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I began to understand my sin' });
    expect(r.supported).toBe(false);
  });
});

describe('intent(): never built from a draft or a revision', () => {
  it('his own saved draft, revision and its materialized Text are never returned as help', async () => {
    const w = await world();
    const t = await w.gotell.getOrCreateTestimony('A', 'es');
    const mine = 'Empecé a entender mi pecado.';
    await w.gotell.saveDraft('A', 'es', mine);
    const rev = await w.gotell.acceptRevision(t.id, mine);
    await w.golearn.learnText('A', rev.textId!); // even with encounters on his own testimony Text
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I began to understand my sin' });
    expect(r.supported).toBe(false);
    expect(r.proposal).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(mine);
    expect(r.sources).toEqual([]);
  });

  it('the draft is not an "attempt" unless the caller passes it as one', async () => {
    const w = await world();
    await esScriptureIntent(w, 'A');
    await w.gotell.saveDraft('A', 'es', 'Yo creer en Dios.');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I began to understand my sin' });
    expect(r.proposal).toBe('Empecé a entender mi pecado.');
    expect(JSON.stringify(r)).not.toMatch(/creer|creo/);
  });

  it('does not retrieve wording from testimony corpora, newly protected assessment text, or retired wording', async () => {
    const privateWorld = await world();
    await esScriptureIntent(privateWorld, 'A');
    const source = (await privateWorld.store.texts.get('text:es:scripture-i'))!;
    await privateWorld.store.corpora.put({ id: source.corpusId, lang: 'es', kind: 'testimony', title: 'Private' });
    expect((await privateWorld.gotell.intent({ userId: 'A', lang: 'es', english: 'I began to understand my sin' })).supported).toBe(false);

    const protectedWorld = await world();
    await esScriptureIntent(protectedWorld, 'A');
    const protectedText = (await protectedWorld.store.texts.get('text:es:scripture-i'))!;
    await protectedWorld.store.texts.put({ ...protectedText, listeningAssessmentId: 'protected-after-encounter' });
    expect((await protectedWorld.gotell.intent({ userId: 'A', lang: 'es', english: 'I began to understand my sin' })).supported).toBe(false);

    const revisedWorld = await world();
    await esScriptureIntent(revisedWorld, 'A');
    const sentence = (await revisedWorld.store.sentences.get('text:es:scripture-i/s0'))!;
    await revisedWorld.store.sentences.put({ ...sentence, retiredInVersion: 2 });
    expect((await revisedWorld.gotell.intent({ userId: 'A', lang: 'es', english: 'I began to understand my sin' })).supported).toBe(false);
  });
});

describe('intent(): with an attempt', () => {
  it('an attempt that already says everything is repaired by the checker, with sources, coverage and no expansion when met', async () => {
    const w = await world();
    await esStoryC(w, 'A');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I believe in God', attempt: 'Yo creer en Dios.' });
    expect(r.supported).toBe(true);
    expect(r.insertable).toBe(true);
    expect(r.proposal).toBe('Yo creo en Dios.');
    expect(r.newItems).toEqual([]);
    expect(r.sources[0]).toMatchObject({ textTitle: 'Story C', excerpt: 'Yo creo en Dios.' });
    expect(r.meaningNote).toMatch(/your own attempt/);
    expect(r.meaningNote).toMatch(/does not mean the sentence is now correct/);
  });

  it('unmet language in the fix is marked new, with a fallback that avoids it', async () => {
    const w = await world();
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I believe in God', attempt: 'Yo creer en Dios.' });
    expect(r.supported).toBe(true);
    expect(r.proposal).toBe('Yo creo en Dios.');
    expect(r.newItems).toEqual([expect.objectContaining({ itemId: ids.form('es', 'creo'), surface: 'creo' })]);
    expect(r.fallbackWithoutNew?.text).toBe('Yo creer en Dios.');
  });

  it('an attempt that lacks the key idea is never "repaired" into it', async () => {
    const w = await world();
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I believe in God', attempt: 'Yo sé en Dios.' });
    expect(r.proposal).toBeUndefined(); // "sé" -> "creo" would change a key term: not offered as the answer
    expect(r.supported).toBe(false);
    expect(r.limitation).toMatch(/Your attempt does not yet say: believe/);
  });

  it('an attempt that leaves an idea out falls back to encountered wording, and says what the attempt lacked', async () => {
    const w = await world();
    await esStoryC(w, 'A');
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I believe in God', attempt: 'Yo creer.' });
    expect(r.supported).toBe(true);
    expect(r.proposal).toBe('Creo en Dios.');
    expect(r.meaningNote).toMatch(/Your attempt does not yet say: god/);
    expect(r.sources[0].excerpt).toBe('Yo creo en Dios.');
  });

  it('an attempt whose polarity differs from what was said is not passed off as the meaning', async () => {
    const w = await world();
    const r = await w.gotell.intent({ userId: 'A', lang: 'es', english: 'I did not understand my sin', attempt: ES_ROUGH.replace('no ', '') });
    expect(r.supported).toBe(false);
    expect(r.limitation).toMatch(/not negative but what you said is/);
  });
});

describe('English -> terms', () => {
  it('content words are stemmed and negation is kept aside', () => {
    const { terms, negated } = intentTerms('I did not understand my sins, and I began to know');
    expect(negated).toBe(true);
    expect(terms.map((t) => t.key)).toEqual(['understand', 'sin', 'begin', 'know']);
    expect(terms.find((t) => t.key === 'understand')!.concepts).toEqual(['understand']);
    expect(terms.find((t) => t.key === 'know')!.concepts).toEqual(['know']);
  });

  it('irregular and inflected forms meet in the same stem', () => {
    expect(stemEnglish('began')).toBe(stemEnglish('begin'));
    expect(stemEnglish('understood')).toBe(stemEnglish('understanding'));
    expect(stemEnglish('believed')).toBe(stemEnglish('believe'));
    expect(stemEnglish('sins')).toBe('sin');
    expect(stemEnglish('guilt')).not.toBe(stemEnglish('guilty')); // the concept table, not the stemmer, relates these
  });
});
