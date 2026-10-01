/**
 * Learner history must survive a revision AND a later rebuild from the event log (a rebuild happens whenever the
 * evidence policy version changes). Evidence earned on a sentence that a revision retired — including the phrase
 * and grammar-pattern items it carried — must be the same after a rebuild as it was before.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { importDocuments } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import { bundledDoc, liveSentences, makeApp, reader, seedUser, syntheticallyReviewed } from './harness';

const U = 'rebuild';

describe('a revision followed by a rebuild keeps the learner\'s history', () => {
  it('items earned on a retired sentence (words, phrases, patterns) are identical before and after the rebuild', async () => {
    const app = makeApp();
    await seedUser(app.store, U, 'honduras-es');
    const v1 = syntheticallyReviewed(bundledDoc('es', 'story-01'));
    expect((await importDocuments(app.store, app.adapters, [v1], { clock: app.clock.now })).ok).toBe(true);
    const textId = ids.text('es', 'story-01');
    const text = (await app.store.texts.get(textId))!;
    const sentences = await liveSentences(app.store, textId);

    // a sentence that carries a phrase or a pattern occurrence: the one the revision will retire
    const phraseOcc = await app.store.phraseOccurrences.where('textId', textId);
    const patternOcc = await app.store.patternOccurrences.where('textId', textId);
    const carrier = sentences.find((s) => phraseOcc.some((o) => o.sentenceId === s.id) || patternOcc.some((o) => o.sentenceId === s.id));
    expect(carrier, 'the seed story has a sentence with a phrase or pattern').toBeDefined();

    await reader(app, U, 'es', 's1').view(text, sentences);
    await app.golearn.settled();

    // revise exactly that sentence
    const revised = structuredClone(v1) as CorpusDocument;
    let changed = false;
    for (const sec of revised.sections) for (const par of sec.paragraphs) {
      if ('sentences' in par) for (const s of par.sentences) if (s.text === carrier!.text) { s.text = 'Esta frase es nueva.'; delete s.spans; delete s.corrections; changed = true; }
    }
    expect(changed, 'the carrier sentence is declared in the document').toBe(true);
    const r = await importDocuments(app.store, app.adapters, [syntheticallyReviewed({ ...revised, review: { status: 'unreviewed' } })], { clock: app.clock.now });
    expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
    expect(r.documents[0].sentencesRetired).toBe(1);

    const snapshot = async () => {
      const rows = (await app.store.learnerItems.where('userId', U)).sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
      return rows.map((x) => `${x.itemId}|${x.itemKind}|${x.encounterCount}`);
    };
    const before = await snapshot();
    expect(before.some((l) => l.includes('|phrase|') || l.includes('|pattern|'))).toBe(true);
    await app.golearn.rebuild(U);
    await app.golearn.settled();
    expect(await snapshot()).toEqual(before);

    // and nothing retired is offered to the learner: the retired sentence is not part of the live text
    expect((await liveSentences(app.store, textId)).some((s) => s.id === carrier!.id)).toBe(false);
  });
});
