/**
 * evidence@6 — help has a SCOPE. Item-targeted help (word / phrase / grammar: assistance 1–3) vetoes an item's estimate while it
 * is among its last two reading encounters. Sentence-level help (explanation / English: 4–5) makes that encounter assisted
 * (never demonstrates, not a help-free exposure) but does not veto an estimate earned help-free elsewhere, and it never touches
 * the encounters of other sentences or other sittings. This is the audited "Parallel English" scenario, on the real fold.
 */
import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { DomainEvent, EventInput } from '../../src/core';
import type { StoredEncounter } from '../../src/golearn/state';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const BIBLE = 'text:es:verses';
const tk = (surface: string, lemma: string, pos: 'NOUN' | 'VERB' | 'PRON' | 'DET' | 'ADP' | 'PROPN') => ({ surface, lemma, pos });

/** Three verses; "yo creo en Dios" / "Dios perdona el pecado" reuse story words, the third is entirely new. */
async function buildVerses(h: Harness) {
  await buildFixtureText(h.store, {
    lang: 'es', slug: 'verses', kind: 'scripture', title: 'Versos', version: 'fixture', scripture: { book: 'JHN', chapter: 3 },
    sentences: [
      { verseRefs: ['JHN.3.1'], tokens: [tk('Yo', 'yo', 'PRON'), tk('creo', 'creer', 'VERB'), tk('en', 'en', 'ADP'), tk('Dios', 'Dios', 'PROPN')], english: 'I believe in God.' },
      { verseRefs: ['JHN.3.2'], tokens: [tk('Dios', 'Dios', 'PROPN'), tk('perdona', 'perdonar', 'VERB'), tk('el', 'el', 'DET'), tk('pecado', 'pecado', 'NOUN')], english: 'God forgives the sin.' },
      { verseRefs: ['JHN.3.3'], tokens: [tk('Jesús', 'Jesús', 'PROPN'), tk('ama', 'amar', 'VERB'), tk('la', 'la', 'DET'), tk('luz', 'luz', 'NOUN')], english: 'Jesus loves the light.' },
    ],
  });
}

/** The story read help-free in three sittings, then two of the three verses seen in a fourth. */
async function audited(h: Harness) {
  await buildSpanish(h.store);
  await buildVerses(h);
  for (const s of ['s1', 's2', 's3']) await h.viewAll(U, 'es', ES_STORY, 4, s);
  await h.view(U, 'es', BIBLE, 0, 's4', 'scripture');
  await h.view(U, 'es', BIBLE, 1, 's4', 'scripture');
}

/** One whole-passage English reveal, as the reader's Parallel English toggle emits it. */
const parallel = (h: Harness, key: string, sentenceIds = [0, 1, 2].map((i) => `${BIBLE}/s${i}`)) =>
  h.bus.emit({
    type: 'EnglishRescueRevealed', userId: U, lang: 'es', surface: 'scripture', session: 's4', dedupeKey: key,
    textId: BIBLE, sentenceIds, scope: 'parallel',
  } as EventInput<DomainEvent>);

const estimated = async (h: Harness, w: string) => (await h.golearn.getItemState(U, F(w)))!.reading.estimatedFamiliar;
const encountersOf = async (h: Harness, textId: string): Promise<StoredEncounter[]> => (await h.store.encounters.where('textId', textId)).filter((e) => e.userId === U).sort((a, b) => (a.id < b.id ? -1 : 1));
/** Everything derived from the evidence. `asOf` (the time of the latest event) is left out unless asked for: a new event is new evidence. */
const snapshot = async (h: Harness, withAsOf = false) => {
  const { asOf, ...numbers } = await h.golearn.coverage(U, BIBLE);
  return JSON.stringify({
    enc: (await h.store.encounters.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
    items: (await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
    coverage: withAsOf ? { ...numbers, asOf } : numbers,
  });
};

describe('sentence-level help: the audited Parallel English scenario', () => {
  it('one whole-passage English reveal assists the seen verses and nothing else; story-earned estimates survive', async () => {
    const h = createHarness();
    await audited(h);
    // Before: yo / creo / en / dios / el were met help-free twice per story sitting; perdona / pecado three times + the verse = four.
    for (const w of ['yo', 'creo', 'en', 'dios', 'el', 'perdona', 'pecado']) expect(await estimated(h, w), w).toBe(true);
    expect(await estimated(h, 'jesús')).toBe(false); // story only, three sittings, once each
    const before = await h.golearn.coverage(U, BIBLE);
    expect(before.estimatedFamiliarCoverage).toBeCloseTo(8 / 12, 10); // 4 + 4 of 12 words
    const storyBefore = JSON.stringify(await encountersOf(h, ES_STORY));
    expect((await encountersOf(h, BIBLE)).every((e) => e.evidenceKind === 'exposure')).toBe(true);

    await parallel(h, 'rescue:parallel-1');

    // the story is byte-identical; the two seen verses are assisted:5; the unseen verse has no encounters at all
    expect(JSON.stringify(await encountersOf(h, ES_STORY))).toBe(storyBefore);
    const verses = await encountersOf(h, BIBLE);
    expect(verses.length).toBeGreaterThan(8);
    expect(verses.every((e) => e.sentenceId !== `${BIBLE}/s2`)).toBe(true);
    for (const e of verses) {
      expect({ kind: e.evidenceKind, assistance: e.assistance, weight: e.weight, itemHelp: e.itemHelp }).toEqual({ kind: 'assisted', assistance: 5, weight: 0, itemHelp: undefined });
    }

    // estimates earned from the story are NOT withdrawn…
    for (const w of ['yo', 'creo', 'en', 'dios', 'el']) expect(await estimated(h, w), w).toBe(true);
    // …but an assisted encounter is not a help-free exposure: the two words whose fourth exposure was the verse lose theirs.
    for (const w of ['perdona', 'pecado']) expect(await estimated(h, w), w).toBe(false);
    const after = await h.golearn.coverage(U, BIBLE);
    expect(after.estimatedFamiliarCoverage).toBeCloseTo(6 / 12, 10);
    expect(after.estimatedFamiliarCoverage).toBeGreaterThan(before.estimatedFamiliarCoverage * 0.7); // it does not collapse
    expect(after.knownLexicalCoverage).toBe(0); // and nothing was demonstrated
  });

  it('a second reveal event (a remount, a toggle back on) changes nothing; so does a rebuild', async () => {
    const h = createHarness();
    await audited(h);
    await parallel(h, 'rescue:parallel-1');
    const once = await snapshot(h);
    await parallel(h, 'rescue:parallel-2'); // another event, same sitting, same sentences
    expect(await snapshot(h)).toBe(once);
    await parallel(h, 'rescue:parallel-3', [`${BIBLE}/s0`]);
    expect(await snapshot(h)).toBe(once);
    const full = await snapshot(h, true);
    await h.golearn.rebuild(U);
    expect(await snapshot(h, true)).toBe(full); // a rebuild is byte-identical, asOf included
    expect(await snapshot(h, true)).toBe(full); // and so is every further read
    expect(await snapshot(h)).toBe(once);
  });

  it('never reaches another sentence, another sitting, or an item\'s encounters elsewhere', async () => {
    const h = createHarness();
    await audited(h);
    await h.view(U, 'es', BIBLE, 2, 's4', 'scripture'); // the third verse is seen in the same sitting, AFTER nothing was revealed
    const before = JSON.stringify(await encountersOf(h, BIBLE).then((l) => l.filter((e) => e.sentenceId !== `${BIBLE}/s1`)));
    await parallel(h, 'rescue:only-verse-1', [`${BIBLE}/s1`]); // English for ONE verse
    const after = await encountersOf(h, BIBLE);
    expect(JSON.stringify(after.filter((e) => e.sentenceId !== `${BIBLE}/s1`))).toBe(before);
    expect(after.filter((e) => e.sentenceId === `${BIBLE}/s1`).every((e) => e.assistance === 5)).toBe(true);
    // a LATER sitting is untouched by an earlier sitting's reveal: reading verse 1 again help-free is a plain exposure
    await h.view(U, 'es', BIBLE, 1, 's5', 'scripture');
    const again = (await encountersOf(h, BIBLE)).filter((e) => e.sentenceId === `${BIBLE}/s1` && e.itemId === F('dios'));
    expect(again.map((e) => e.evidenceKind).sort()).toEqual(['assisted', 'exposure']);
    expect(await estimated(h, 'perdona')).toBe(true); // 3 story + the new help-free view = 4 plain, tail not vetoed
  });

  it('sentence explanation behaves like the English: assisted, never a veto, never a help-free exposure', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    for (const s of ['s1', 's2', 's3', 's4']) await h.viewAll(U, 'es', ES_STORY, 4, s);
    expect(await estimated(h, 'creo')).toBe(true);
    await h.view(U, 'es', ES_STORY, 0, 's5');
    await h.bus.emit({ type: 'SentenceExplanationRevealed', userId: U, lang: 'es', surface: 'corpus', session: 's5', dedupeKey: 'expl:1', sentenceId: `${ES_STORY}/s0` } as EventInput<DomainEvent>);
    const enc = (await encountersOf(h, ES_STORY)).filter((e) => e.itemId === F('creo') && e.assistance > 0);
    expect(enc).toHaveLength(1);
    expect(enc[0]).toMatchObject({ evidenceKind: 'assisted', assistance: 4 });
    expect(enc[0].itemHelp).toBeUndefined();
    expect(await estimated(h, 'creo')).toBe(true);
    const st = (await h.golearn.getItemState(U, F('creo')))!.reading;
    expect(st.exposures).toBe(8); // 4 sittings × 2 sentences; the s5 view was assisted
    expect(st.assisted).toBe(1);
  });
});

describe('item-targeted help still vetoes', () => {
  it('a word tapped in Scripture loses its estimate; two clean encounters restore it; other words are untouched', async () => {
    const h = createHarness();
    await audited(h);
    expect(await estimated(h, 'creo')).toBe(true);
    await h.help(U, 'es', BIBLE, 0, 1, F('creo'), 1, 's4'); // a gloss on "creo" in verse 0
    expect(await estimated(h, 'creo')).toBe(false);
    expect(await estimated(h, 'en')).toBe(true); // only the tapped word (and its lemma)
    expect(await estimated(h, 'yo')).toBe(true);
    const enc = (await encountersOf(h, BIBLE)).find((e) => e.sentenceId === `${BIBLE}/s0` && e.itemId === F('creo'))!;
    expect(enc).toMatchObject({ evidenceKind: 'assisted', assistance: 1, itemHelp: 1 });
    const tapped = await h.golearn.coverage(U, BIBLE);
    await h.view(U, 'es', ES_STORY, 0, 's5'); // two help-free encounters of "creo" push the tap out of the last two
    await h.view(U, 'es', ES_STORY, 2, 's5');
    expect(await estimated(h, 'creo')).toBe(true);
    expect((await h.golearn.coverage(U, BIBLE)).estimatedFamiliarCoverage).toBeGreaterThan(tapped.estimatedFamiliarCoverage);
  });

  it('word help AND the English on the same encounter keep the word-level veto (the max level does not hide it)', async () => {
    const h = createHarness();
    await audited(h);
    await h.help(U, 'es', BIBLE, 0, 1, F('creo'), 2, 's4');
    await parallel(h, 'rescue:after-tap');
    const enc = (await encountersOf(h, BIBLE)).find((e) => e.sentenceId === `${BIBLE}/s0` && e.itemId === F('creo'))!;
    expect(enc).toMatchObject({ assistance: 5, itemHelp: 2, evidenceKind: 'assisted' });
    expect(await estimated(h, 'creo')).toBe(false);
    expect(await estimated(h, 'en')).toBe(true);
    const why = await h.golearn.explainItem(U, F('creo'));
    expect(why.summary).toContain('needed help with this word once');
    expect(why.summary).toContain('read once with the English shown');
  });

  it('help given BEFORE the view of a sentence is remembered and scoped the same way; replay agrees', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildVerses(h);
    for (const s of ['s1', 's2', 's3']) await h.viewAll(U, 'es', ES_STORY, 4, s);
    await h.help(U, 'es', BIBLE, 0, 1, F('creo'), 3, 's4'); // tap first…
    await h.view(U, 'es', BIBLE, 0, 's4', 'scripture'); // …then the view arrives
    expect(await estimated(h, 'creo')).toBe(false);
    const live = await snapshot(h);
    await h.golearn.rebuild(U);
    expect(await snapshot(h)).toBe(live);
  });
});

describe('explainItem tells the two kinds of help apart', () => {
  it('"needed help with this word N times" vs "read N times with the English shown"', async () => {
    const h = createHarness();
    await audited(h);
    await parallel(h, 'rescue:parallel-1');
    await h.view(U, 'es', ES_STORY, 0, 's5');
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 1, 's5');
    const dios = await h.golearn.explainItem(U, F('dios'));
    expect(dios.summary).toContain('read twice with the English shown'); // verse 0 and verse 1
    expect(dios.summary).not.toContain('needed help');
    expect(dios.summary).toContain('Likely familiar');
    expect(dios.assisted).toBe(2);
    const creo = await h.golearn.explainItem(U, F('creo'));
    expect(creo.summary).toContain('needed help with this word once');
    expect(creo.summary).toContain('read once with the English shown');
  });
});

describe('coverage asOf and determinism', () => {
  it('carries asOf (the latest evidence event of the learner in that language) and is byte-identical on every call and after rebuild', async () => {
    const h = createHarness();
    await audited(h);
    const last = (await h.bus.history({ userId: U, types: ['SentenceViewed'] })).at(-1)!.at;
    const a = await h.golearn.coverage(U, BIBLE);
    expect(a.asOf).toBe(last);
    await parallel(h, 'rescue:parallel-1');
    const rescueAt = (await h.bus.history({ userId: U, types: ['EnglishRescueRevealed'] }))[0].at;
    const b = await h.golearn.coverage(U, BIBLE);
    expect(b.asOf).toBe(rescueAt);
    const calls = await Promise.all([1, 2, 3, 4].map(() => h.golearn.coverage(U, BIBLE)));
    for (const c of calls) expect(JSON.stringify(c)).toBe(JSON.stringify(b));
    await h.golearn.rebuild(U);
    expect(JSON.stringify(await h.golearn.coverage(U, BIBLE))).toBe(JSON.stringify(b));
    expect((await h.golearn.coverage('nobody', BIBLE)).asOf).toBeUndefined(); // no evidence ⇒ no asOf
  });

  it('the explanation says that the English shown does not withdraw an estimate', async () => {
    const h = createHarness();
    await audited(h);
    const c = await h.golearn.coverage(U, BIBLE);
    expect(c.explanation).toContain('help with the word itself withdraws it');
    expect(c.explanation).toContain('English shown for a sentence does not');
  });
});
