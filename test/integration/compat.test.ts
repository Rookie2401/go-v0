/**
 * Five-language compatibility and the readiness regressions, on the real adapters / importer / engines:
 * import validation and repeatability, Unicode + span integrity, content-version invalidation (analysis, audio,
 * history), duplicate-evidence guards, the publication gate, learner + language isolation, draft safety, backup.
 */
import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '../../src/core';
import { ids } from '../../src/core';
import { importDocuments, validateBatch } from '../../src/ingest';
import { exportLearner, restoreLearner, validateBackup } from '../../src/backup';
import { bundled, bundledDoc, liveSentences, makeApp, makeClock, reader, seedUser, tokensOf } from './harness';

const COURSES: Record<LanguageCode, string> = { es: 'honduras-es', sq: 'albania-sq', th: 'thailand-th', hi: 'india-hi', de: 'germany-de' };
const LANGS = Object.keys(COURSES) as LanguageCode[];
const SCRIPTURE_PUBLISHED: Record<LanguageCode, boolean> = { es: true, de: true, sq: false, th: false, hi: false };

function graphemeBoundaries(text: string, lang: string): Set<number> {
  const out = new Set<number>([0, text.length]);
  for (const g of new Intl.Segmenter(lang, { granularity: 'grapheme' }).segment(text)) out.add(g.index);
  return out;
}

for (const lang of LANGS) {
  describe(`compatibility — ${lang}`, () => {
    const app = makeApp({ clock: makeClock(), allowFixture: true }); // fixture audio: pipeline checks only, never evidence
    const user = `u-${lang}`;
    const storyId = ids.text(lang, 'story-01');
    const bibleId = ids.text(lang, 'bible-1john-1');

    it('imports the bundled documents exactly, repeatably, with honest publication', async () => {
      await seedUser(app.store, user, COURSES[lang]);
      const docs = bundled(lang);
      expect(validateBatch(docs, { registry: app.adapters }).ok).toBe(true);
      const report = await importDocuments(app.store, app.adapters, docs);
      expect(report.ok).toBe(true);
      expect(report.documents.map((d) => d.action)).toEqual(['created', 'created', 'created']);
      const counts = async () => Promise.all([app.store.texts.count(), app.store.sentences.count(), app.store.tokens.count(), app.store.analyses.count(), app.store.rescues.count()]);
      const before = await counts();
      const again = await importDocuments(app.store, app.adapters, docs);
      expect(again.documents.every((d) => d.action === 'unchanged')).toBe(true);
      expect(await counts()).toEqual(before);

      const byId = Object.fromEntries(report.documents.map((d) => [d.id, d]));
      expect(byId['story-01'].published).toBe(false); // machine-drafted, unreviewed
      expect(byId['dialogue-01'].published).toBe(false);
      expect(byId['bible-1john-1'].published).toBe(SCRIPTURE_PUBLISHED[lang]);
      if (!SCRIPTURE_PUBLISHED[lang]) expect(byId['bible-1john-1'].unpublishedReasons.length).toBeGreaterThan(0);

      // Exactness: stored text is the supplied text; every span is an exact, grapheme-safe slice.
      for (const doc of docs) {
        const textId = ids.text(lang, doc.id);
        const supplied = doc.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [])));
        const sentences = await liveSentences(app.store, textId);
        expect(sentences.map((s) => s.text)).toEqual(supplied);
        for (const s of sentences) {
          const para = (await app.store.paragraphs.get(s.paragraphId))!;
          expect(para.originalText!.slice(s.paraStart, s.paraEnd)).toBe(s.text);
          const bounds = graphemeBoundaries(s.text, lang);
          for (const t of await tokensOf(app.store, s.id)) {
            expect(s.text.slice(t.start, t.end)).toBe(t.surface);
            expect(bounds.has(t.start) && bounds.has(t.end), `${lang} token "${t.surface}" splits a grapheme`).toBe(true);
            if (lang === 'th' && t.isWord) expect(/\s/.test(t.surface)).toBe(false);
          }
        }
      }
    });

    it('language-specific analysis holds, and its limits are declared', async () => {
      const adapter = app.adapters.get(lang);
      expect(adapter.support.lemmatization).toBe('seed-only');
      expect(adapter.support.limitations.length).toBeGreaterThan(0);
      const story = await liveSentences(app.store, storyId);
      if (lang === 'th') {
        const s = story.find((x) => x.text === 'พระเจ้าทรงรักโลก')!;
        expect((await tokensOf(app.store, s.id)).filter((t) => t.isWord).length).toBeGreaterThanOrEqual(4);
        expect(adapter.support.tokenization).toBe('limited');
      }
      if (lang === 'hi') {
        expect(story.every((s) => s.text.endsWith('।'))).toBe(true); // danda kept in the canonical text
        const forms = (await app.store.tokens.where('textId', storyId)).map((t) => t.surface);
        expect(forms).toContain('क्षमा'); // conjunct + matra stays one token
      }
      if (lang === 'de') {
        const s = story.find((x) => x.text.startsWith('Eines Tages fing ich an'))!;
        const toks = await tokensOf(app.store, s.id);
        const fing = toks.find((t) => t.surface === 'fing')!;
        expect((await app.golearn.resolveAnalysis(fing.id))?.lemmaId).toBe(ids.lemma('de', 'anfangen', 'VERB'));
        expect(adapter.relate('sünde', 'sünden')).toBe('inflection');
      }
      if (lang === 'sq') {
        const forms = new Set((await app.store.tokens.where('textId', storyId)).map((t) => t.normalized));
        expect(forms.has('mëkat') && forms.has('mëkatin')).toBe(true); // diacritics kept, forms distinct
        expect(adapter.relate('mëkat', 'mëkatin')).toBe('inflection');
      }
      if (lang === 'es') {
        const bible = await liveSentences(app.store, bibleId);
        const toks = (await Promise.all(bible.map((s) => tokensOf(app.store, s.id)))).flat();
        expect(toks.some((t) => t.surface === 'á')).toBe(true); // historical accented preposition preserved
        const dij = toks.find((t) => t.surface === 'dijéremos')!;
        expect((await app.golearn.resolveAnalysis(dij.id))?.lemmaId).toBe(ids.lemma('es', 'decir', 'VERB'));
        expect(adapter.relate('pecado', 'pecados')).toBe('inflection');
      }
    });

    it('reading creates evidence once: rerenders and re-imports add nothing', async () => {
      const story = (await app.store.texts.get(storyId))!;
      const sentences = await liveSentences(app.store, storyId);
      const r = reader(app, user, lang, 's1');
      await r.view(story, sentences);
      const n = (await app.store.encounters.where('userId', user)).length;
      expect(n).toBeGreaterThan(0);
      await r.view(story, sentences);
      await importDocuments(app.store, app.adapters, bundled(lang));
      expect((await app.store.encounters.where('userId', user)).length).toBe(n);
      expect((await app.store.encounters.where('userId', user)).every((e) => e.evidenceKind === 'exposure')).toBe(true);
    });

    it('an edit bumps the content version, retires only that sentence, keeps history, and makes only its audio stale', async () => {
      const before = await liveSentences(app.store, storyId);
      const audio1 = await app.golisten.ensureAudio(storyId, { runNow: true });
      expect(audio1.manifest.complete).toBe(true);
      expect(audio1.created).toBe(before.length);

      const edited = bundledDoc(lang, 'story-01');
      const replacement = (bundledDoc(lang, 'dialogue-01').sections[0].paragraphs[0] as { sentences: Array<{ text: string; english?: string }> }).sentences[0];
      const para = edited.sections.flatMap((s) => s.paragraphs).find((p) => 'sentences' in p && p.sentences.some((x) => x.text === before[2].text)) as { sentences: Array<{ text: string; english?: string }> };
      const at = para.sentences.findIndex((x) => x.text === before[2].text);
      para.sentences[at] = { text: replacement.text, english: replacement.english };
      const report = await importDocuments(app.store, app.adapters, [edited]);
      expect(report.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesAdded: 1, sentencesRetired: 1 });

      const after = await liveSentences(app.store, storyId);
      expect(after.length).toBe(before.length);
      expect(after.map((s) => s.id).filter((id) => !before.some((b) => b.id === id)).length).toBe(1); // exactly one new id
      expect(after[2].text).toBe(replacement.text);
      const retired = (await app.store.sentences.get(before[2].id))!;
      expect(retired.retiredInVersion).toBe(2);
      expect(retired.text).toBe(before[2].text); // history is intact
      expect((await app.store.encounters.where('sentenceId', retired.id)).length).toBeGreaterThan(0);
      const cov = await app.golearn.coverage(user, storyId);
      expect(cov.sentenceIds).toEqual(after.map((s) => s.id)); // coverage is about the current version

      expect((await app.golisten.audioStatus(storyId, { preview: true })).state).toBe('stale');
      const audio2 = await app.golisten.ensureAudio(storyId, { runNow: true });
      expect(audio2.created).toBe(1); // only the edited sentence
      expect(audio2.reused).toBe(before.length - 1);
      expect((await app.golisten.audioStatus(storyId, { preview: true })).state).toBe('preview-only'); // fixture: never 'ready'
    });

    it('the publication gate holds in recommendations and Scripture preparation', async () => {
      const recs = await app.golearn.recommend(user, { lang });
      for (const r of recs) if (r.textId) expect((await app.store.texts.get(r.textId))!.published).toBe(true);
      const ready = await app.golearn.scriptureReadiness(user, bibleId);
      for (const p of ready.preparatoryTexts) expect((await app.store.texts.get(p.textId))!.published).toBe(true);
      expect(ready.corpusCanPrepare).toBe(false); // no published CI text exists for any language yet
      expect(ready.limitation).toBeTruthy();
      const preview = await app.golearn.scriptureReadiness(user, bibleId, undefined, { includeUnpublished: true });
      expect(preview.preparatoryTexts.length).toBeGreaterThan(0);
    });

    it('GoTell works on this language without whitespace assumptions and keeps drafts per learner + language', async () => {
      const gotell = app.gotellAll.forUser(user);
      const story = await liveSentences(app.store, storyId);
      const text = story[1].text;
      const draft = await gotell.saveDraft(user, lang, text);
      const other = LANGS.find((l) => l !== lang)!;
      expect(await gotell.getDraft(user, other)).toBeUndefined();
      const testimony = await gotell.getOrCreateTestimony(user, lang);
      const analysis = await gotell.submitDraft(testimony.id, text);
      expect(analysis.sentences.length).toBe(1);
      expect(analysis.sentences[0].tokenSurfaces.length).toBeGreaterThan(2);
      if (lang === 'th') expect(analysis.sentences[0].tokenSurfaces.every((s) => !/\s/.test(s) || s.trim() === '')).toBe(true);
      expect(analysis.sentences[0].familiarity).toBeGreaterThan(0.5); // he has met these words
      const rev = await gotell.acceptRevision(testimony.id, text);
      expect((await liveSentences(app.store, rev.textId!)).map((s) => s.text)).toEqual([text]);
      expect((await gotell.getDraft(user, lang))?.text).toBe(draft.text); // saving a version does not eat the draft
    });
  });
}

describe('learner and language isolation', () => {
  it('two learners and two languages never leak into each other; switching back restores everything', async () => {
    const app = makeApp({ clock: makeClock() });
    await seedUser(app.store, 'ana', 'honduras-es');
    await seedUser(app.store, 'ben', 'honduras-es');
    await importDocuments(app.store, app.adapters, [...bundled('es'), ...bundled('th')]);
    const esStory = (await app.store.texts.get(ids.text('es', 'story-01')))!;
    const thStory = (await app.store.texts.get(ids.text('th', 'story-01')))!;
    const esS = await liveSentences(app.store, esStory.id);
    const thS = await liveSentences(app.store, thStory.id);

    const anaEs = reader(app, 'ana', 'es', 'a1');
    await anaEs.view(esStory, esS);
    await anaEs.report(esStory, esS, 'all');
    const sin = ids.form('es', 'pecado');
    const snapshot = JSON.stringify(await app.golearn.getItemState('ana', sin));
    expect(await app.golearn.getItemState('ben', sin)).toBeUndefined();
    expect((await app.golearn.coverage('ben', esStory.id)).unseenCoverage).toBe(1);

    // Ana switches to the Thailand team, reads and writes there, then comes back.
    await reader(app, 'ana', 'th', 'a2').view(thStory, thS);
    await app.gotellAll.forUser('ana').saveDraft('ana', 'es', 'Ahora creo en Dios.');
    await app.gotellAll.forUser('ana').saveDraft('ana', 'th', thS[2].text);
    expect(JSON.stringify(await app.golearn.getItemState('ana', sin))).toBe(snapshot);
    expect((await app.golearn.coverage('ana', esStory.id)).knownLexicalCoverage).toBeGreaterThan(0);
    const thItems = await app.golearn.listKnown('ana', 'th', 'reading', 'encountered');
    const esItems = await app.golearn.listKnown('ana', 'es', 'reading', 'encountered');
    expect(thItems.length).toBeGreaterThan(0);
    expect(thItems.every((i) => i.lang === 'th') && esItems.every((i) => i.lang === 'es')).toBe(true);
    for (const r of await app.golearn.recommend('ana', { lang: 'th', includeUnpublished: true })) if (r.textId) expect((await app.store.texts.get(r.textId))!.lang).toBe('th');
    expect((await app.gotellAll.forUser('ana').getDraft('ana', 'es'))?.text).toBe('Ahora creo en Dios.');
    expect((await app.gotellAll.forUser('ana').getDraft('ana', 'th'))?.text).toBe(thS[2].text);
    expect(await app.gotellAll.forUser('ben').getDraft('ben', 'es')).toBeUndefined();
    await expect(app.gotellAll.forUser('ben').getDraft('ana', 'es')).rejects.toThrow();
  });
});

describe('backup and restore', () => {
  it('a learner exported from one device is restored on another with identical history and rebuilt state', async () => {
    const a = makeApp({ clock: makeClock() });
    await seedUser(a.store, 'ana', 'honduras-es');
    await importDocuments(a.store, a.adapters, bundled('es'));
    const story = (await a.store.texts.get(ids.text('es', 'story-01')))!;
    const sentences = await liveSentences(a.store, story.id);
    const r = reader(a, 'ana', 'es', 'a1');
    await r.view(story, sentences);
    await r.report(story, sentences, 'all');
    const gotell = a.gotellAll.forUser('ana');
    const t = await gotell.getOrCreateTestimony('ana', 'es');
    await gotell.acceptRevision(t.id, 'Ahora creo en Dios.');
    await gotell.saveDraft('ana', 'es', 'Ahora creo en Dios. Ahora tengo paz.');

    const file = await exportLearner(a.store, 'ana');
    const json = JSON.stringify(file);
    expect(validateBackup(json).filter((i) => i.severity === 'error')).toEqual([]);
    expect(json).not.toContain('"encounters"'); // derived state is not in a backup

    const b = makeApp({ clock: makeClock('2026-11-01T08:00:00.000Z') });
    await importDocuments(b.store, b.adapters, bundled('es')); // the corpus comes from the app, not the backup
    const report = await restoreLearner(b.store, json);
    expect(report.needsRebuild).toBe(true);
    await b.golearn.ensureCurrent('ana');
    const items = async (app: typeof a) => (await app.store.learnerItems.where('userId', 'ana')).sort((x, y) => x.itemId.localeCompare(y.itemId)).map((i) => [i.itemId, i.reading, i.writing, i.textIds]);
    expect(await items(b)).toEqual(await items(a));
    const gb = b.gotellAll.forUser('ana');
    const tb = await gb.getOrCreateTestimony('ana', 'es');
    expect((await gb.listRevisions(tb.id)).map((x) => x.fullText)).toEqual(['Ahora creo en Dios.']);
    expect((await gb.getDraft('ana', 'es'))?.text).toBe('Ahora creo en Dios. Ahora tengo paz.');
    // Restoring twice changes nothing; a corrupted file is refused before any write.
    expect((await restoreLearner(b.store, json)).changed).toBe(false);
    await expect(restoreLearner(makeApp().store, json.replace('Ahora creo', 'Ahora cree'))).rejects.toThrow();
  });
});

describe('import validation is actionable and atomic', () => {
  it('rejects a bad batch without writing anything, and says exactly what to fix', async () => {
    const app = makeApp();
    const good = bundledDoc('es', 'dialogue-01');
    const bad = bundledDoc('es', 'story-01') as unknown as Record<string, unknown>;
    bad.schemaVersion = 1;
    const wrongLang = bundledDoc('th', 'story-01');
    wrongLang.lang = 'es';
    const report = await importDocuments(app.store, app.adapters, [good, bad, wrongLang]);
    expect(report.ok).toBe(false);
    expect(await app.store.texts.count()).toBe(0); // nothing published from a failed batch
    expect(await app.store.sentences.count()).toBe(0);
    const codes = report.documents.flatMap((d) => d.issues.filter((i) => i.severity === 'error').map((i) => i.code));
    expect(codes).toEqual(expect.arrayContaining(['unsupported-schema-version', 'language-mismatch']));
    for (const d of report.documents) for (const i of d.issues) { expect(i.path).toBeDefined(); expect(i.hint.length).toBeGreaterThan(5); }
    expect(report.documents.find((d) => d.id === 'dialogue-01')!.action).toBe('rejected'); // the valid one waits too
    // Generated or unverified Scripture can never be published.
    const fake = bundledDoc('es', 'bible-1john-1');
    fake.generated = true;
    const r2 = await importDocuments(app.store, app.adapters, [fake]);
    expect(r2.ok).toBe(false);
    expect(r2.documents[0].issues.map((i) => i.code)).toContain('scripture-generated');
    const unverified = bundledDoc('es', 'bible-1john-1');
    delete unverified.scripture!.verification;
    const r3 = await importDocuments(app.store, app.adapters, [unverified]);
    expect(r3.documents[0].published).toBe(false);
    expect(r3.documents[0].unpublishedReasons.join(' ')).toMatch(/verif/i);
  });
});
