/**
 * Regressions for the two audited defects, on the real adapters, importer and GoLearn.
 *
 *  A. Progress shown as "Seen 0 of 10 · Finished" in one place and "Seen 4 of 10 · Finished" in another.
 *     There is ONE canonical record per (learner, language, text, content version); every reader of it gets the
 *     same answer, exposure against earlier versions is reported explicitly, and "finished" is scoped to a version.
 *  B. "likely familiar" swinging 24 % → 46 % → 3 % when Parallel English was toggled on a Scripture passage.
 *     Same evidence ⇒ same numbers on every read (also mid-fold and after a rebuild); a whole-passage English
 *     reveal never erases an estimate earned from help-free exposure elsewhere, and never touches other encounters.
 */
import { describe, expect, it } from 'vitest';
import type { EnglishRescueRevealed, PersonalizedCoverage } from '../../src/core';
import { ids } from '../../src/core';
import { importDocuments } from '../../src/ingest';
import { bundled, bundledDoc, liveSentences, makeApp, makeClock, reader, seedUser, tokensOf } from './harness';

const LANG = 'es' as const;
const storyId = ids.text(LANG, 'story-01');
const dialogueId = ids.text(LANG, 'dialogue-01');
const bibleId = ids.text(LANG, 'bible-1john-1');
const numbers = (c: PersonalizedCoverage) => [c.knownLexicalCoverage, c.estimatedFamiliarCoverage, c.partialCoverage, c.unseenCoverage];

describe('A — one canonical progress record', () => {
  it('every reader of the record agrees; versions and completion are scoped explicitly', async () => {
    const app = makeApp({ clock: makeClock() });
    await seedUser(app.store, 'ana', 'honduras-es');
    await importDocuments(app.store, app.adapters, bundled(LANG));
    const story = (await app.store.texts.get(storyId))!;
    const S = await liveSentences(app.store, storyId);
    const r = reader(app, 'ana', LANG, 's1');

    // Four sentences stayed on screen; then he marked the text finished.
    await r.view(story, S.slice(0, 4));
    await r.complete(story);
    const home = await app.golearn.readingProgress('ana', storyId); // "Home"
    const library = (await app.golearn.readingProgressMany('ana', [dialogueId, storyId])).get(storyId)!; // "library"
    const readerView = await app.golearn.readingProgress('ana', storyId); // "reader"
    expect(library).toEqual(home);
    expect(readerView).toEqual(home);
    expect(home).toMatchObject({ userId: 'ana', lang: LANG, textId: storyId, contentVersion: 1, sentencesTotal: 10, sentencesSeen: 4, sentencesUnderstood: 0 });
    expect(home.finishedAt).toBeDefined(); // finished ≠ every sentence seen: both facts are reported, independently
    expect(home.finishedEarlierVersion).toBeUndefined();
    expect(home.earlierVersions).toBeUndefined();
    expect(home.asOf).toBeDefined();

    // Finished with nothing recorded as seen is a legitimate state, reported as exactly that.
    const dialogue = (await app.store.texts.get(dialogueId))!;
    await r.complete(dialogue);
    const d = await app.golearn.readingProgress('ana', dialogueId);
    expect(d.sentencesSeen).toBe(0);
    expect(d.finishedAt).toBeDefined();

    // The text is revised: two of the four seen sentences are replaced.
    const revised = bundledDoc(LANG, 'story-01');
    const para = revised.sections[0].paragraphs[0] as { sentences: Array<{ text: string; english?: string }> };
    para.sentences[0] = { text: 'Cuando era joven, yo no entendía nada.', english: 'When I was young, I understood nothing.' };
    para.sentences[1] = { text: 'Yo tenía pecado en mi corazón.', english: 'I had sin in my heart.' };
    const rep = await importDocuments(app.store, app.adapters, [revised]);
    expect(rep.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesRetired: 2 });
    const v2 = await app.golearn.readingProgress('ana', storyId);
    expect(v2).toMatchObject({ contentVersion: 2, sentencesTotal: 10, sentencesSeen: 2 });
    expect(v2.earlierVersions).toMatchObject({ sentencesSeen: 2 }); // history kept and reported, not counted
    expect(v2.finishedAt).toBeUndefined(); // he has not finished THIS version
    expect(v2.finishedEarlierVersion).toMatchObject({ version: 1 });
    expect((await app.golearn.readingProgressMany('ana', [storyId])).get(storyId)).toEqual(v2);
    // The historical events are all still there.
    expect((await app.bus.history({ userId: 'ana', types: ['SentenceViewed'] })).length).toBe(4);

    // Finishing the new version is a new, explicit act.
    const story2 = (await app.store.texts.get(storyId))!;
    await reader(app, 'ana', LANG, 's1').complete(story2); // same sitting key ⇒ same dedupe key ⇒ ignored
    expect((await app.golearn.readingProgress('ana', storyId)).finishedAt).toBeUndefined();
    await reader(app, 'ana', LANG, 's2').complete(story2);
    expect((await app.golearn.readingProgress('ana', storyId)).finishedAt).toBeDefined();

    // Another learner, another language: untouched scope.
    await seedUser(app.store, 'ben', 'honduras-es');
    expect(await app.golearn.readingProgress('ben', storyId)).toMatchObject({ userId: 'ben', sentencesSeen: 0 });
    expect((await app.golearn.readingProgress('ben', storyId)).finishedAt).toBeUndefined();
  });
});

describe('B — familiarity is a function of the evidence, not of when or how often it is read', () => {
  it('a Parallel English reveal: deterministic, scoped to those sentences, and no veto of estimates earned elsewhere', async () => {
    const clock = makeClock();
    const app = makeApp({ clock });
    await seedUser(app.store, 'ana', 'honduras-es');
    await importDocuments(app.store, app.adapters, bundled(LANG));
    const story = (await app.store.texts.get(storyId))!, dialogue = (await app.store.texts.get(dialogueId))!, bible = (await app.store.texts.get(bibleId))!;
    const S = await liveSentences(app.store, storyId), D = await liveSentences(app.store, dialogueId), B = await liveSentences(app.store, bibleId);
    // Help-free reading of the two CI texts in three separate sittings ⇒ estimates (never "known").
    for (const session of ['a', 'b', 'c']) {
      const r = reader(app, 'ana', LANG, session);
      await r.view(story, S); await r.view(dialogue, D);
      clock.jumpMinutes(45);
    }
    const fromStoryOnly = await app.golearn.coverage('ana', bibleId); // estimates earned before Scripture was ever opened
    // Scripture: two of the three verses seen. No "Understood" is ever used.
    await reader(app, 'ana', LANG, 'd').view(bible, B.slice(0, 2));
    const before = await app.golearn.coverage('ana', bibleId);
    expect(before.estimatedFamiliarCoverage).toBeGreaterThan(0.1);
    expect(before.knownLexicalCoverage).toBe(0); // exposure is never demonstrated understanding
    const storyEnc = async () => JSON.stringify((await app.store.encounters.where('textId', storyId)).map((e) => [e.id, e.evidenceKind, e.assistance, e.weight]).sort());
    const storyBefore = await storyEnc();
    const dios = ids.form(LANG, 'dios');
    const diosBefore = JSON.stringify(await app.golearn.getItemState('ana', dios));

    // English on (ONE event). The UI does not await the emit: read immediately, repeatedly, then after it settled.
    const emit = () => app.bus.emit<EnglishRescueRevealed>({ type: 'EnglishRescueRevealed', userId: 'ana', lang: LANG, surface: 'scripture', session: 'd', dedupeKey: `rescue:ana:d:${bibleId}:parallel`, textId: bibleId, sentenceIds: B.map((s) => s.id), scope: 'parallel' });
    const pending = emit();
    const immediate = await app.golearn.coverage('ana', bibleId);
    const again = await app.golearn.coverage('ana', bibleId);
    await pending;
    await app.golearn.settled();
    const settled = await app.golearn.coverage('ana', bibleId);
    expect(numbers(immediate)).toEqual(numbers(settled)); // never a half-applied fold
    expect(numbers(again)).toEqual(numbers(settled));

    // The reveal changed what it should: the two seen verses' encounters in this sitting are assisted (English).
    const bibleEnc = (await app.store.encounters.where('textId', bibleId)).filter((e) => e.userId === 'ana' && e.modality === 'reading');
    expect(bibleEnc.length).toBeGreaterThan(0);
    expect(bibleEnc.every((e) => e.evidenceKind === 'assisted' && e.assistance === 5)).toBe(true);
    expect(new Set(bibleEnc.map((e) => e.sentenceId))).toEqual(new Set(B.slice(0, 2).map((s) => s.id))); // the unseen verse got no encounter
    // …and nothing else: story encounters and an item met only in the story + the unseen verse are untouched.
    expect(await storyEnc()).toBe(storyBefore);
    expect(JSON.stringify(await app.golearn.getItemState('ana', dios))).toBe(diosBefore);
    // Estimates earned from help-free exposure elsewhere survive a blanket English reveal. The two verses were then
    // read WITH the English shown, so they no longer count as help-free exposures: the estimate falls back to
    // exactly what the story had earned (words that only reached the threshold through these verses lose it), and
    // not below it. Before the fix one reveal vetoed almost every word of the passage.
    expect(settled.estimatedFamiliarCoverage).toBe(fromStoryOnly.estimatedFamiliarCoverage);
    expect(settled.estimatedFamiliarCoverage).toBeGreaterThan(0.1);
    expect(before.estimatedFamiliarCoverage).toBeGreaterThanOrEqual(settled.estimatedFamiliarCoverage);
    expect(settled.knownLexicalCoverage).toBe(0);
    expect(settled.unseenCoverage).toBe(before.unseenCoverage);

    // English off emits nothing; turning it on again after a remount (a second event) changes nothing either.
    expect(numbers(await app.golearn.coverage('ana', bibleId))).toEqual(numbers(settled));
    await app.bus.emit<EnglishRescueRevealed>({ type: 'EnglishRescueRevealed', userId: 'ana', lang: LANG, surface: 'scripture', session: 'd', dedupeKey: `rescue:ana:d:${bibleId}:parallel:again`, textId: bibleId, sentenceIds: B.map((s) => s.id), scope: 'parallel' });
    expect(numbers(await app.golearn.coverage('ana', bibleId))).toEqual(numbers(settled));
    expect((await app.store.encounters.where('textId', bibleId)).filter((e) => e.userId === 'ana' && e.modality === 'reading').length).toBe(bibleEnc.length);

    // Rebuilding from the log gives the same numbers.
    await app.golearn.rebuild('ana');
    expect(numbers(await app.golearn.coverage('ana', bibleId))).toEqual(numbers(settled));

    // Targeted help is different: asking about one word says he needed help with THAT word.
    const tok = (await tokensOf(app.store, B[0].id)).find((t) => t.formId === ids.form(LANG, 'pecado'))!;
    const sinBefore = (await app.golearn.getItemState('ana', tok.formId))!;
    expect(sinBefore.reading.estimatedFamiliar).toBe(true);
    await reader(app, 'ana', LANG, 'd').tap(bible, B[0], tok, 1);
    const sinAfter = (await app.golearn.getItemState('ana', tok.formId))!;
    expect(sinAfter.reading.estimatedFamiliar).toBe(false);
    expect((await app.golearn.coverage('ana', bibleId)).estimatedFamiliarCoverage).toBeLessThan(settled.estimatedFamiliarCoverage);
    const explain = await app.golearn.explainItem('ana', tok.formId);
    expect(explain.summary).toMatch(/help/i);
  });
});
