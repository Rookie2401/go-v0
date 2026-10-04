import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { Text } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import {
  ES_GEN, ES_JOHN, ES_PREP, ES_STORY, TH_STORY, buildSpanish, buildSpanishPrep, buildSpanishScripture, buildThai,
} from './fixtures';

const U = 'u1';

/** Read all four sentences of story-01; `report` is the text-level self-report (if any); completes the text. */
async function readStory(h: Harness, o: { report?: 'all' | 'most' | 'some' | 'little'; session?: string; user?: string } = {}) {
  const user = o.user ?? U;
  const session = o.session ?? 's1';
  await h.viewAll(user, 'es', ES_STORY, 4, session);
  if (o.report) await h.report(user, 'es', ES_STORY, [0, 1, 2, 3], { session, scope: 'text', degree: o.report });
  await h.complete(user, 'es', ES_STORY, session);
  // "all" means understood all of it; a second demonstration elsewhere makes the words recognized (2 distinct sessions)
  if (o.report === 'all') await h.understood(user, 'es', ES_STORY, [0, 1, 2, 3], `${session}-again`);
}

/** Read and fully understand story-02 (two sentences). */
async function readPrep(h: Harness, session = 's1') {
  await h.viewAll(U, 'es', ES_PREP, 2, session);
  await h.report(U, 'es', ES_PREP, [0, 1], { session, scope: 'text' });
  await h.complete(U, 'es', ES_PREP, session);
  await h.understood(U, 'es', ES_PREP, [0, 1], `${session}-again`);
}

async function setup(opts: Parameters<typeof createHarness>[0] = {}) {
  const h = createHarness(opts);
  await h.seed(U, 'honduras-es');
  await buildSpanish(h.store);
  await buildSpanishScripture(h.store);
  await buildSpanishPrep(h.store);
  return h;
}

const setLevel = async (h: Harness, textId: string, patch: Partial<Text>) => h.store.texts.put({ ...(await h.store.texts.get(textId))!, ...patch });
const reasons = (recs: Array<{ reason: string }>) => recs.map((r) => r.reason);

async function addText(h: Harness, slug: string, words: string[], extra: { tags?: string[]; published?: boolean } = {}) {
  await buildFixtureText(h.store, {
    lang: 'es', slug, tags: extra.tags, published: extra.published,
    sentences: [{ tokens: words.map((w) => ({ surface: w, lemma: w, pos: 'NOUN' as const })) }],
  });
  return `text:es:${slug}`;
}

describe('recommend() — a new learner', () => {
  it('gets exactly one first-text: the easiest PUBLISHED input text; nothing is invented', async () => {
    const h = await setup();
    await setLevel(h, ES_STORY, { staticLevel: 'A1' });
    await setLevel(h, ES_PREP, { staticLevel: 'A0' });
    const hidden = await addText(h, 'story-00', ['uno'], { published: false });
    await setLevel(h, hidden, { staticLevel: 'A0' });
    const texts = await h.store.texts.count();
    const sentences = await h.store.sentences.count();
    const recs = await h.golearn.recommend(U);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ reason: 'first-text', textId: ES_PREP });
    expect(recs[0].explanation).toContain('easiest');
    expect(await h.store.texts.count()).toBe(texts);
    expect(await h.store.sentences.count()).toBe(sentences); // recommend never generates text
  });

  it('with only unpublished texts, says what is awaited instead of offering them (preview shows them)', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildFixtureText(h.store, { lang: 'es', slug: 'draft', published: false, sentences: [{ tokens: [{ surface: 'uno' }] }] });
    const recs = await h.golearn.recommend(U);
    expect(recs).toHaveLength(1);
    expect(recs[0].reason).toBe('first-text');
    expect(recs[0].textId).toBeUndefined();
    expect(recs[0].explanation).toMatch(/No Spanish text is published yet/);
    expect(recs[0].explanation).toContain('fixture: marked unpublished'); // the reason it is waiting
    const preview = await h.golearn.recommend(U, { includeUnpublished: true });
    expect(preview[0]).toMatchObject({ reason: 'first-text', textId: 'text:es:draft' });
  });

  it('with only unpublished stories but PUBLISHED Scripture, does not say that no text is published (found in the German browser audit)', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildFixtureText(h.store, { lang: 'es', slug: 'draft', published: false, sentences: [{ tokens: [{ surface: 'uno' }] }] });
    await buildSpanishScripture(h.store);
    const recs = await h.golearn.recommend(U);
    const note = recs.find((r) => r.reason === 'first-text' && !r.textId)!;
    expect(note.explanation).toMatch(/No Spanish story or dialogue is published yet: 1 imported text is waiting/);
    expect(note.explanation).toContain('Scripture is published: open it under Scripture.');
    expect(note.explanation).not.toMatch(/No Spanish text is published/);
  });

  it('with no text at all, says so', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    const recs = await h.golearn.recommend(U);
    expect(recs).toHaveLength(1);
    expect(recs[0].textId).toBeUndefined();
    expect(recs[0].explanation).toMatch(/No Spanish text has been imported/);
  });

  it('a testimony is offered only after the first text', async () => {
    const h = await setup();
    await h.store.testimonies.put({ id: 'tst1', userId: U, lang: 'es', title: 'Mi historia', createdAt: '2026-01-01T00:00:00.000Z', currentRevisionId: 'tst1/r1' });
    await h.store.testimonies.put({ id: 'tst2', userId: U, lang: 'es', title: 'Borrador', createdAt: '2026-01-01T00:00:00.000Z' });
    const recs = await h.golearn.recommend(U);
    expect(reasons(recs)).toEqual(['first-text', 'rehearse-testimony']);
    expect(recs[1]).toMatchObject({ testimonyId: 'tst1' });
    expect(recs[1].textId).toBeUndefined();
  });

  it('returns nothing for a user whose language cannot be determined', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    expect(await h.golearn.recommend('ghost')).toEqual([]);
  });
});

describe('recommend() — after reading', () => {
  it('after a completion: the next unread text, never "first-text" again and never an empty list', async () => {
    const h = await setup();
    await readStory(h, { report: 'all' });
    const recs = await h.golearn.recommend(U);
    expect(recs.length).toBeGreaterThan(0);
    expect(reasons(recs)).not.toContain('first-text');
    expect(recs.find((r) => r.textId === ES_PREP)).toMatchObject({ reason: 'next-input' });
    expect(recs.find((r) => r.textId === ES_STORY)?.reason).not.toBe('reread'); // understood all of it
  });

  it('even a hard unread text is offered while it is the only unread published input', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    const hard = await addText(h, 'story-hard', ['xa', 'xb', 'xc', 'xd', 'xe']);
    await readStory(h, { report: 'all' });
    const recs = await h.golearn.recommend(U);
    expect(recs.find((r) => r.textId === hard)).toMatchObject({ reason: 'next-input', band: 'stretch' });
  });

  it('suggests a reread when the last self-report was below "all" — and stops once it is "all"', async () => {
    const h = await setup();
    await readStory(h, { report: 'some' });
    let recs = await h.golearn.recommend(U, { limit: 10 });
    const re = recs.find((r) => r.textId === ES_STORY);
    expect(re?.reason).toBe('reread');
    expect(re?.explanation).toContain('some');
    await h.report(U, 'es', ES_STORY, [0, 1, 2, 3], { session: 's2', scope: 'text', degree: 'all' });
    recs = await h.golearn.recommend(U, { limit: 10 });
    expect(recs.find((r) => r.textId === ES_STORY)?.reason).not.toBe('reread');
    await h.report(U, 'es', ES_STORY, [0, 1, 2, 3], { session: 's3', scope: 'text', degree: 'little' });
    recs = await h.golearn.recommend(U, { limit: 10 });
    const little = recs.find((r) => r.textId === ES_STORY)!;
    expect(little.reason).toBe('reread');
    expect(little.score).toBeGreaterThan(re!.score); // understood less → more urgent
  });

  it('suggests a reread when the latest session needed heavy help', async () => {
    const h = await setup();
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    await h.rescue(U, 'es', ES_STORY, [0, 1, 2], 's1'); // English on most of it
    await h.complete(U, 'es', ES_STORY, 's1');
    let recs = await h.golearn.recommend(U, { limit: 10 });
    expect(recs.find((r) => r.textId === ES_STORY)?.reason).toBe('reread');
    await h.viewAll(U, 'es', ES_STORY, 4, 's2'); // a clean second session: the latest session is what counts
    await h.complete(U, 'es', ES_STORY, 's2');
    recs = await h.golearn.recommend(U, { limit: 10 });
    expect(recs.find((r) => r.textId === ES_STORY)?.reason).not.toBe('reread');
  });

  it('a started text is offered for continuing', async () => {
    const h = await setup();
    await h.view(U, 'es', ES_STORY, 0);
    const recs = await h.golearn.recommend(U, { limit: 10 });
    const rec = recs.find((r) => r.textId === ES_STORY)!;
    expect(rec.reason).toBe('next-input');
    expect(rec.explanation).toContain('1 of 4');
  });

  it('band decides among unread texts, and interests boost', async () => {
    const h = await setup();
    await readStory(h, { report: 'all' });
    await h.understood(U, 'es', ES_STORY, [0, 1, 2, 3], 's2');
    const easy = await addText(h, 'story-03', ['dios', 'creo', 'en'], { tags: ['daily-life'] });
    const hard = await addText(h, 'story-04', ['qa', 'qb', 'qc'], { tags: ['mission'] });
    const plain = await h.golearn.recommend(U, { limit: 10 });
    const score = (list: typeof plain, id: string) => list.find((r) => r.textId === id)!.score;
    expect(plain.find((r) => r.textId === easy)?.band).not.toBe('stretch');
    expect(score(plain, easy)).toBeGreaterThan(score(plain, hard));
    const boosted = await h.golearn.recommend(U, { limit: 10, interests: ['daily-life'] });
    expect(score(boosted, easy)).toBeGreaterThan(score(plain, easy));
    const scores = plain.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(await h.golearn.recommend(U, { limit: 1 })).toHaveLength(1);
  });

  it('texts read only by exposure are offered as "reinforces weak items", not as understood', async () => {
    const h = await setup();
    await readStory(h); // viewed and completed, but never reported understood
    const recs = await h.golearn.recommend(U, { limit: 10 });
    expect(recs.find((r) => r.textId === ES_STORY)?.reason).toBe('reinforces-weak-items');
  });

  it('never offers unpublished texts unless asked', async () => {
    const h = await setup();
    await readStory(h, { report: 'all' });
    const draft = await addText(h, 'story-draft', ['dios', 'creo'], { published: false });
    expect((await h.golearn.recommend(U, { limit: 10 })).some((r) => r.textId === draft)).toBe(false);
    expect((await h.golearn.recommend(U, { limit: 10, includeUnpublished: true })).some((r) => r.textId === draft)).toBe(true);
  });

  it('says so honestly when everything published has been read', async () => {
    const h = await setup();
    await readStory(h, { report: 'all' });
    await readPrep(h);
    const recs = await h.golearn.recommend(U, { limit: 10 });
    expect(recs).toHaveLength(1);
    expect(recs[0].textId).toBeUndefined();
    expect(recs[0].explanation).toMatch(/read every published Spanish text/);
  });
});

describe('recommend() — listening only when reviewed real speech exists', () => {
  it('never recommends listening without audioEligible, or when it says no', async () => {
    for (const eligible of [undefined, async () => false]) {
      const h = await setup({ audioEligible: eligible });
      await readStory(h, { report: 'all' });
      expect(reasons(await h.golearn.recommend(U, { limit: 10 }))).not.toContain('listen-to-read-text');
    }
  });

  it('recommends listening to a read text when audioEligible says so, until every sentence has been heard', async () => {
    const h = await setup({ audioEligible: async (id) => id === ES_STORY });
    await h.seedAudio('rec-human', { speech: true, textId: ES_STORY, sentenceIds: [0, 1, 2, 3].map((i) => `${ES_STORY}/s${i}`) }); // a reviewed HUMAN recording (the harness default)
    await readStory(h, { report: 'all' });
    let recs = await h.golearn.recommend(U, { limit: 10 });
    const rec = recs.find((r) => r.reason === 'listen-to-read-text');
    expect(rec?.textId).toBe(ES_STORY);
    expect(recs.find((r) => r.textId === ES_PREP)?.reason).toBe('next-input'); // other text: not eligible, so not listen
    await h.listen(U, 'es', ES_STORY, [0, 1, 2, 3], { session: 'l1' });
    recs = await h.golearn.recommend(U, { limit: 10 });
    expect(recs.find((r) => r.reason === 'listen-to-read-text')).toBeUndefined();
  });

  it('a text voiced only by synthetic speech is never recommended for listening, even when audioEligible says yes (evidence@8)', async () => {
    const h = await setup({ audioEligible: async () => true });
    await h.seedAudio('rec-synth', { speech: true, kind: 'synthetic', textId: ES_STORY, sentenceIds: [0, 1, 2, 3].map((i) => `${ES_STORY}/s${i}`) });
    await readStory(h, { report: 'all' });
    expect(reasons(await h.golearn.recommend(U, { limit: 10 }))).not.toContain('listen-to-read-text');
  });

  it('fixture audio that is ignored does not count as heard', async () => {
    const h = await setup({ audioEligible: async () => true });
    await h.seedAudio('rec-human', { speech: true, textId: ES_STORY, sentenceIds: [0, 1, 2, 3].map((i) => `${ES_STORY}/s${i}`) }); // a reviewed HUMAN recording (the harness default)
    await readStory(h, { report: 'all' });
    await h.listen(U, 'es', ES_STORY, [0, 1, 2, 3], { session: 'l1', speech: false });
    expect((await h.golearn.recommend(U, { limit: 10 })).find((r) => r.reason === 'listen-to-read-text')?.textId).toBe(ES_STORY);
  });
});

describe('recommend() — input before testimony rehearsal', () => {
  it('input items always sort before rehearse-testimony, whatever the limit', async () => {
    const h = await setup();
    await readStory(h, { report: 'all' });
    await h.store.testimonies.put({ id: 'tst1', userId: U, lang: 'es', title: 'Mi historia', createdAt: '2026-01-01T00:00:00.000Z', currentRevisionId: 'tst1/r1' });
    const recs = await h.golearn.recommend(U, { limit: 10 });
    const last = recs.length - 1;
    expect(recs[last].reason).toBe('rehearse-testimony');
    expect(recs.slice(0, last).every((r) => r.reason !== 'rehearse-testimony')).toBe(true);
    expect(recs[0].reason).not.toBe('rehearse-testimony');
    expect((await h.golearn.recommend(U, { limit: 1 }))[0].reason).not.toBe('rehearse-testimony');
  });

  it('with nothing left to read, testimony rehearsal still appears', async () => {
    const h = await setup();
    await readStory(h, { report: 'all' });
    await readPrep(h);
    await h.store.testimonies.put({ id: 'tst1', userId: U, lang: 'es', title: 'Mi historia', createdAt: '2026-01-01T00:00:00.000Z', currentRevisionId: 'tst1/r1' });
    const recs = await h.golearn.recommend(U, { limit: 10 });
    expect(reasons(recs).at(-1)).toBe('rehearse-testimony');
    expect(recs.some((r) => r.textId)).toBe(false);
  });
});

describe('recommend() — scripture', () => {
  it('with a scripture target, recommends published texts that really contain its gaps (generated ones flagged, never created)', async () => {
    const h = await setup();
    await buildSpanishPrep(h.store, true, 'prep-generated');
    await readStory(h, { report: 'all' });
    const before = await h.store.texts.count();
    const recs = await h.golearn.recommend(U, { targetTextId: ES_JOHN, limit: 10 });
    const prep = recs.filter((r) => r.reason === 'prepares-scripture').map((r) => r.textId);
    expect(prep).toContain(ES_PREP);
    expect(prep).toContain(ES_GEN);
    expect(prep).not.toContain(ES_STORY); // contains no gap of John 3
    const top = recs.find((r) => r.textId === ES_PREP)!;
    expect(top.reinforces).toContain(ids.lemma('es', 'amar', 'VERB'));
    expect(top.score).toBeGreaterThan(0.5);
    expect(await h.store.texts.count()).toBe(before);
  });

  it('does not use unpublished preparatory texts unless asked', async () => {
    const h = await setup();
    await setLevel(h, ES_PREP, { published: false, unpublishedReasons: ['awaiting native review'] });
    await readStory(h, { report: 'all' });
    expect((await h.golearn.recommend(U, { targetTextId: ES_JOHN, limit: 10 })).some((r) => r.reason === 'prepares-scripture')).toBe(false);
    expect((await h.golearn.recommend(U, { targetTextId: ES_JOHN, limit: 10, includeUnpublished: true })).some((r) => r.textId === ES_PREP && r.reason === 'prepares-scripture')).toBe(true);
  });

  it('suggests revisiting scripture once it is reachable and was read with help', async () => {
    const h = await setup();
    for (const s of ['s1', 's2', 's3']) await h.understood(U, 'es', ES_STORY, [0, 1, 2, 3], s);
    await readStory(h, { report: 'all' });
    await h.view(U, 'es', ES_JOHN, 0, 'j1', 'scripture');
    await h.view(U, 'es', ES_JOHN, 1, 'j1', 'scripture');
    await h.rescue(U, 'es', ES_JOHN, [0, 1], 'j1');
    // learn the missing words from story-02 and by marking, so the passage becomes workable
    for (const s of ['p1', 'p2', 'p3', 'p4']) await h.understood(U, 'es', ES_PREP, [0, 1], s);
    for (const w of ['todo', 'aquel', 'que', 'él']) await h.mark(U, 'es', ids.form('es', w), 'known');
    const john = await h.golearn.coverage(U, ES_JOHN);
    expect(['comfortable', 'productive-challenge']).toContain(john.band);
    const rec = (await h.golearn.recommend(U, { limit: 10 })).find((r) => r.textId === ES_JOHN);
    expect(rec?.reason).toBe('revisit-scripture');
  });
});

describe('recommend() — isolation', () => {
  it('one learner\'s reading never changes another\'s recommendations', async () => {
    const h = await setup();
    await h.seed('u2', 'honduras-es');
    const before = await h.golearn.recommend('u2', { limit: 10 });
    await readStory(h, { report: 'all' });
    expect(await h.golearn.recommend('u2', { limit: 10 })).toEqual(before);
    expect(before[0].reason).toBe('first-text');
  });

  it('language: Thai state and Spanish state are separate, and switching back restores each', async () => {
    const h = await setup();
    await buildThai(h.store);
    await readStory(h, { report: 'all' });
    const es1 = await h.golearn.recommend(U, { limit: 10 });
    expect(es1.every((r) => !r.textId || r.textId.startsWith('text:es:'))).toBe(true);
    const th = await h.golearn.recommend(U, { lang: 'th', limit: 10 });
    expect(th[0]).toMatchObject({ reason: 'first-text' }); // nothing read in Thai yet, in spite of the Spanish progress
    expect(th[0].textId).toBe(TH_STORY);
    await h.viewAll(U, 'th', TH_STORY, 2);
    const th2 = await h.golearn.recommend(U, { lang: 'th', limit: 10 });
    expect(th2[0].reason).not.toBe('first-text');
    expect(await h.golearn.recommend(U, { limit: 10 })).toEqual(es1); // Spanish untouched by the Thai reading
  });
});
