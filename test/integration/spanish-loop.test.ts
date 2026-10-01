/**
 * The Spanish end-to-end loop on the REAL adapters, importer and engines (evidence policy v2).
 *
 *  1 import reviewed CI material + a verified Scripture passage   6 accept a constrained correction grounded in
 *  2 read CI and ask for optional help                              encountered language
 *  3 legitimate encounters appear in shared learner history       7 assisted and independent production stay distinct
 *  4 Scripture: history affects preparation and assistance        8 save, reload, switch language, recover draft + version
 *  5 write a synthetic testimony                                  9 audio: honest unavailable state; fixtures never count
 *
 * "Reviewed CI material" here is a SYNTHETIC review of the machine-drafted seed story, made inside this test so
 * the published path can be exercised. The bundled story itself stays unreviewed and unpublished.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { AudioSegmentCompleted, DomainEvent, Sentence, Text } from '../../src/core';
import { ids } from '../../src/core';
import { importDocuments } from '../../src/ingest';
import { listeningEmitter } from '../../src/golisten';
import verified from '../../data/verified/scripture.json';
import { SyntheticSpeechProvider, bundled, bundledDoc, liveSentences, makeApp, makeClock, reader, seedUser, syntheticallyReviewed, tokensOf } from './harness';

const USER = 'learner-es';
const LANG = 'es' as const;
const sinForm = ids.form(LANG, 'pecado');

describe('Spanish end-to-end loop', () => {
  const clock = makeClock();
  let app = makeApp({ clock });
  let gotell = app.gotellAll.forUser(USER);
  let story: Text, bible: Text;
  let storySentences: Sentence[], bibleSentences: Sentence[];
  const prodEvents = async () => (await app.bus.history({ userId: USER, types: ['ProductionRecorded'] })) as Array<Extract<DomainEvent, { type: 'ProductionRecorded' }>>;

  beforeAll(async () => { await seedUser(app.store, USER, 'honduras-es'); });

  it('0 — with only the bundled corpus nothing unreviewed is offered: a new learner gets an honest note, not a story', async () => {
    const report = await importDocuments(app.store, app.adapters, bundled(LANG));
    expect(report.ok).toBe(true);
    const byId = Object.fromEntries(report.documents.map((d) => [d.id, d]));
    expect(byId['story-01'].published).toBe(false);
    expect(byId['story-01'].unpublishedReasons.join(' ')).toMatch(/review/i);
    expect(byId['bible-1john-1'].published).toBe(true); // source-verified RV1909
    const recs = await app.golearn.recommend(USER, { lang: LANG });
    expect(recs.every((r) => !r.textId || r.reason !== 'first-text')).toBe(true); // no unreviewed text is pushed at him
    const withPreview = await app.golearn.recommend(USER, { lang: LANG, includeUnpublished: true });
    // in preview the easiest unreviewed text is offered as a first text — and it is one of the unpublished ones
    const first = withPreview.find((r) => r.reason === 'first-text');
    expect(first?.textId).toBeDefined();
    expect((await app.store.texts.get(first!.textId!))?.published).toBe(false);
    expect(first!.explanation).toContain('in preview (not published)');
  });

  it('1 — import: reviewed CI material is published; Scripture is exact, verified and unchanged by import', async () => {
    const report = await importDocuments(app.store, app.adapters, [syntheticallyReviewed(bundledDoc(LANG, 'story-01'))]);
    expect(report.documents[0]).toMatchObject({ id: 'story-01', published: true });
    story = (await app.store.texts.get(ids.text(LANG, 'story-01')))!;
    bible = (await app.store.texts.get(ids.text(LANG, 'bible-1john-1')))!;
    expect(story.published).toBe(true);
    expect(story.generated).toBe(true); // still badged as machine-drafted
    expect(bible).toMatchObject({ kind: 'scripture', published: true, generated: false, reviewStatus: 'reviewed' });
    expect(bible.scripture?.translationId).toBe('spaRV1909');
    expect(bible.scripture?.verification?.method).toBe('byte-comparison');
    storySentences = await liveSentences(app.store, story.id);
    bibleSentences = await liveSentences(app.store, bible.id);
    const es = verified.translations.find((t) => t.lang === 'es')!;
    for (const s of bibleSentences) {
      const expected = (s.verseRefs ?? []).map((r) => (es.verses as Record<string, { text: string }>)[r].text).join(' ');
      expect(s.text).toBe(expected); // byte-identical to the verified source
      expect(/\d/.test(s.text)).toBe(false); // verse numbers are metadata
    }
    // Re-import is a no-op (no duplicate texts, no version bump).
    const again = await importDocuments(app.store, app.adapters, [syntheticallyReviewed(bundledDoc(LANG, 'story-01'))]);
    expect(again.documents[0].action).toBe('unchanged');
    expect((await app.store.texts.where('lang', LANG)).filter((t) => t.id === story.id).length).toBe(1);
    // A new learner is now offered the published story first.
    const recs = await app.golearn.recommend(USER, { lang: LANG });
    expect(recs[0]).toMatchObject({ reason: 'first-text', textId: story.id });
  });

  it('2–3 — reading is exposure; help is recorded as help; only reported understanding demonstrates comprehension', async () => {
    const r = reader(app, USER, LANG, 'sitting-1');
    await r.view(story, storySentences);
    const first = storySentences[0];
    const tapped = (await tokensOf(app.store, first.id)).filter((t) => t.isWord)[3]; // "no" / "entendía" … any word
    await r.tap(story, first, tapped);
    await r.complete(story);

    // Opening, viewing and completing established nothing beyond exposure.
    const seen = (await app.golearn.getItemState(USER, sinForm))!;
    expect(seen.reading.level).toBe('encountered');
    expect(seen.reading.evidence).toBe(0);
    expect(seen.reading.exposures).toBeGreaterThanOrEqual(3); // "pecado" occurs in three sentences
    expect((await app.golearn.coverage(USER, story.id)).knownLexicalCoverage).toBe(0);
    const progress = await app.golearn.readingProgress(USER, story.id);
    expect(progress).toMatchObject({ sentencesTotal: storySentences.length, sentencesSeen: storySentences.length });
    expect(progress.finishedAt).toBeDefined(); // explicit completion, separate from vocabulary coverage

    // A rerender (same dedupe keys) adds nothing.
    const before = (await app.store.encounters.where('userId', USER)).length;
    await r.view(story, storySentences);
    expect((await app.store.encounters.where('userId', USER)).length).toBe(before);

    // He reports that he understood all of it.
    await r.report(story, storySentences, 'all');
    const shown = (await app.golearn.getItemState(USER, sinForm))!;
    expect(shown.reading.evidence).toBeGreaterThan(0);
    expect(shown.reading.level).toBe('recognized'); // demonstrated in ≥ 2 distinct sentences
    expect(shown.listening.level).toBe('unseen');
    expect(shown.textIds).toEqual([story.id]);
    // The tapped word needed help: it is not "demonstrated" by the same report.
    const helped = (await app.golearn.getItemState(USER, tapped.formId))!;
    const helpedEnc = (await app.store.encounters.where('userId', USER)).filter((e) => e.itemId === tapped.formId && e.sentenceId === first.id);
    expect(helpedEnc.map((e) => e.evidenceKind)).toEqual(['assisted']);
    expect(helped.reading.assisted).toBeGreaterThanOrEqual(1);
    const explain = await app.golearn.explainItem(USER, sinForm);
    expect(explain.exposures + explain.demonstrated).toBeGreaterThan(0);
    expect(explain.summary.length).toBeGreaterThan(10);
    const cov = await app.golearn.coverage(USER, story.id);
    expect(cov.knownLexicalCoverage).toBeGreaterThan(0);
    expect(cov.knownLexicalCoverage + cov.estimatedFamiliarCoverage + cov.partialCoverage + cov.unseenCoverage).toBeCloseTo(1, 5);
    expect(cov.explanation.length).toBeGreaterThan(10);

    // Recommendations respond to state: no "first text" after a completed story.
    const recs = await app.golearn.recommend(USER, { lang: LANG });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some((x) => x.reason === 'first-text')).toBe(false);
    expect(recs.some((x) => x.reason === 'listen-to-read-text')).toBe(false); // no reviewed real speech exists
  });

  it('4 — Scripture: shared history shapes preparation and assistance; the text stays exact; English is rescue only', async () => {
    const readiness = await app.golearn.scriptureReadiness(USER, bible.id);
    expect(readiness.familiarItems.map((f) => f.surface)).toContain('pecado');
    expect(readiness.coverage.knownLexicalCoverage).toBeGreaterThan(0); // from the story, before reading any Scripture
    expect(readiness.gaps.length).toBeGreaterThan(0);
    expect(readiness.gaps.every((g) => ['unseen', 'exposed', 'needed-help'].includes(g.status))).toBe(true);
    for (const p of readiness.preparatoryTexts) {
      const t = (await app.store.texts.get(p.textId))!;
      expect(t.published).toBe(true);
      expect(t.kind).not.toBe('scripture');
      expect(p.covers.length).toBeGreaterThan(0); // it actually addresses gaps
    }
    if (!readiness.corpusCanPrepare) expect(readiness.limitation).toBeTruthy();
    const support = await app.golearn.sentenceSupport(USER, bibleSentences[0].id);
    expect(support.rescue).toBeUndefined();
    expect((await app.golearn.sentenceSupport(USER, bibleSentences[0].id, { withRescue: true })).rescue?.english).toBeTruthy();
    // Word help in Scripture reflects the story: "pecado" is highlighted as known, an unseen word is not.
    const toks = await tokensOf(app.store, bibleSentences[0].id);
    const sinTok = toks.find((t) => t.formId === sinForm)!;
    expect(support.highlight[sinTok.id]).toBe('known');
    const r = reader(app, USER, LANG, 'scripture-1');
    await r.view(bible, bibleSentences);
    await r.rescue(bible, bibleSentences[0]);
    const sin = (await app.golearn.getItemState(USER, sinForm))!;
    expect(sin.textIds).toEqual(expect.arrayContaining([story.id, bible.id])); // one record, two surfaces
    expect((await liveSentences(app.store, bible.id)).map((s) => s.text)).toEqual(bibleSentences.map((s) => s.text));
  });

  const DRAFT_OK = 'Cuando era joven, yo tenía pecado en mi corazón.';
  const DRAFT_ERR = 'Dios ama a el mundo.';
  let revisionId: string, revisionTextId: string;

  it('5–7 — testimony: autosaved draft, a constrained correction with real sources, assisted ≠ independent, no manufactured evidence', async () => {
    const testimony = await gotell.getOrCreateTestimony(USER, LANG);
    const draftText = `${DRAFT_OK} ${DRAFT_ERR}`;
    const d1 = await gotell.saveDraft(USER, LANG, draftText);
    expect(d1.seq).toBeGreaterThan(0);
    expect((await prodEvents()).length).toBe(0); // a draft is never evidence

    const analysis = await gotell.submitDraft(testimony.id, draftText);
    expect((await prodEvents()).length).toBe(0); // checking is never evidence
    const repair = analysis.suggestions.find((s) => s.suggested.includes('al mundo'))!;
    expect(repair, JSON.stringify(analysis.suggestions.map((s) => [s.kind, s.suggested]))).toBeDefined();
    expect(repair.kind).toBe('repair');
    expect(repair.newItems).toEqual([]);
    expect(repair.scope).toBe('fixes-all-detected');
    expect(repair.checkerCoverage.length).toBeGreaterThan(10); // says what the checker cannot verify
    expect(repair.sources.some((s) => s.excerpt === 'Dios ama al mundo.' && s.textId === story.id)).toBe(true);
    expect(repair.meaningChange).toBeUndefined();

    await gotell.acceptSuggestion(repair.id);
    const accepted = `${DRAFT_OK} ${repair.suggested}`;
    const rev = await gotell.acceptRevision(testimony.id, accepted);
    revisionId = rev.id; revisionTextId = rev.textId!;
    expect(rev.number).toBe(1);
    expect((await app.store.texts.get(revisionTextId))!.kind).toBe('testimony');

    const prod = await prodEvents();
    const kindOf = (itemId: string) => prod.filter((e) => e.itemId === itemId).map((e) => e.kind);
    expect(kindOf(sinForm)).toEqual(['independent']);
    expect(kindOf(ids.form(LANG, 'al'))).toEqual(['assisted']);
    expect(prod.every((e) => !!e.sentenceHash)).toBe(true);
    const sin = await app.golearn.queryItem(USER, { itemId: sinForm, lang: LANG });
    const al = await app.golearn.queryItem(USER, { itemId: ids.form(LANG, 'al'), lang: LANG });
    expect(sin.productionEvidence).toMatchObject({ independent: 1, assisted: 0 });
    expect(al.productionEvidence).toMatchObject({ independent: 0, assisted: 1 });
    expect(al.writing.evidence).toBeLessThan(sin.writing.evidence);
    expect(sin.writing.level).toBe('used_independently');
    expect(al.writing.level).toBe('used_with_assistance');
    expect(sin.speaking.level).toBe('unseen');

    // Re-checking and re-saving the same text manufactures nothing.
    const n = prod.length;
    await gotell.submitDraft(testimony.id, accepted);
    const same = await gotell.acceptRevision(testimony.id, accepted);
    expect(same.id).toBe(rev.id);
    expect((await prodEvents()).length).toBe(n);
    // The same sentences inside a later version add no evidence either; only the new sentence does.
    const rev2 = await gotell.acceptRevision(testimony.id, `${accepted} Ahora creo en Dios.`);
    expect(rev2.number).toBe(2);
    const added = (await prodEvents()).slice(n);
    expect(added.length).toBeGreaterThan(0);
    expect(new Set(added.map((e) => e.sentenceText))).toEqual(new Set(['Ahora creo en Dios.']));
    expect((await app.golearn.queryItem(USER, { itemId: sinForm, lang: LANG })).productionEvidence.independent).toBe(1);
    expect((await gotell.listRevisions(testimony.id)).map((r) => r.number)).toEqual([1, 2]);
  });

  it('GoTell stays honest: partial help is labelled; meaning help comes from encountered language or is refused', async () => {
    const testimony = await gotell.getOrCreateTestimony(USER, LANG);
    const a = await gotell.submitDraft(testimony.id, 'Yo creer en Dios. Yo tiene cinco año.');
    const s0 = a.suggestions.filter((s) => s.sentenceIndex === 0);
    const s1 = a.suggestions.filter((s) => s.sentenceIndex === 1);
    expect(s0.some((s) => s.suggested === 'Yo creo en Dios.')).toBe(true);
    expect(s1.length).toBeGreaterThan(0);
    for (const s of [...s0, ...s1]) {
      expect(s.checkerCoverage.length).toBeGreaterThan(10);
      if (s.scope === 'partial') expect(s.remainingIssues.length).toBeGreaterThan(0); // never a partial fix presented as complete
      else expect(s.remainingIssues).toEqual([]);
    }
    // No suggestion for sentence 2 leaves one of its two detected errors standing while claiming completeness.
    for (const s of s1) if (s.scope === 'fixes-all-detected') expect(s.suggested).toBe('Yo tengo cinco años.');

    const intent = await gotell.intent({ userId: USER, lang: LANG, english: 'I began to understand my sin' });
    expect(intent.supported).toBe(true);
    expect(intent.proposal).toBe('Empecé a entender mi pecado.');
    expect(intent.sources.map((s) => s.excerpt)).toContain('Un día empecé a entender mi pecado.');
    const revisions = await gotell.listRevisions(testimony.id);
    const draft = await gotell.getDraft(USER, LANG);
    for (const own of [draft?.text, ...revisions.map((r) => r.fullText)]) expect(intent.proposal).not.toBe(own); // never an existing draft
    expect(intent.sources.every((s) => s.surface !== 'testimony')).toBe(true);

    const refused = await gotell.intent({ userId: USER, lang: LANG, english: 'My grandmother baked bread every Sunday' });
    expect(refused).toMatchObject({ supported: false, insertable: false });
    expect(refused.proposal).toBeUndefined();
    expect(refused.limitation).toBeTruthy();
    expect(refused.unexpressed.length).toBeGreaterThan(0);
  });

  it('8 — reload, language switch and recovery: the draft and the versions survive', async () => {
    const before = await gotell.getDraft(USER, LANG);
    expect(before?.text).toContain(DRAFT_OK);
    // "Reload": brand-new engine instances over the same stored data.
    app = makeApp({ store: app.store, clock });
    gotell = app.gotellAll.forUser(USER);
    expect(await app.golearn.ensureCurrent(USER)).toBe(false); // state is already at the current policy
    expect(await gotell.getDraft(USER, LANG)).toEqual(before);
    // Switch to German and write there; the Spanish draft is untouched, and vice versa.
    await gotell.saveDraft(USER, 'de', 'Ich glaube an Gott.');
    expect((await gotell.getDraft(USER, LANG))?.text).toBe(before!.text);
    expect((await gotell.getDraft(USER, 'de'))?.text).toBe('Ich glaube an Gott.');
    // A stale tab cannot overwrite newer writing.
    const newer = await gotell.saveDraft(USER, LANG, `${before!.text} Ahora tengo paz.`, { expectedSeq: before!.seq });
    await expect(gotell.saveDraft(USER, LANG, 'stale tab text', { expectedSeq: before!.seq })).rejects.toMatchObject({ name: 'DraftConflict' });
    expect((await gotell.getDraft(USER, LANG))?.text).toBe(newer.text);
    // Recovery: bring version 1 back as the working draft; history is untouched.
    const restored = await gotell.restoreRevisionAsDraft(revisionId);
    expect(restored.text).toBe(`${DRAFT_OK} Dios ama al mundo.`);
    const testimony = await gotell.getOrCreateTestimony(USER, LANG);
    expect((await gotell.listRevisions(testimony.id)).map((r) => r.number)).toEqual([1, 2]);
    // Learner state is the same after the reload, and rebuildable from the log.
    const snap = JSON.stringify(await app.golearn.getItemState(USER, sinForm));
    await app.golearn.rebuild(USER);
    expect(JSON.stringify(await app.golearn.getItemState(USER, sinForm))).toBe(snap);
    // Another learner cannot read any of it.
    await expect(app.gotellAll.forUser('someone-else').listRevisions(testimony.id)).rejects.toThrow();
    await expect(app.gotellAll.forUser('someone-else').getDraft(USER, LANG)).rejects.toThrow();
  });

  it('9 — audio: with no speech provider the state is honestly unavailable and text learning continues', async () => {
    expect((await app.golisten.availability()).available).toBe(false);
    for (const textId of [story.id, revisionTextId]) {
      const st = await app.golisten.audioStatus(textId);
      expect(st).toMatchObject({ state: 'unavailable', evidenceEligible: false, isSpeech: false });
      expect(st.reason).toBeTruthy();
      await expect(app.golisten.ensureAudio(textId, { runNow: true })).rejects.toMatchObject({ name: 'AudioUnavailable' });
    }
    expect((await app.store.audioSegments.count())).toBe(0);
    expect((await app.golearn.getItemState(USER, sinForm))!.listening.level).toBe('unseen');
  });

  it('9b — fixture tones never become evidence, including legacy events; the audit names them', async () => {
    const dev = makeApp({ store: app.store, clock, allowFixture: true });
    const r = await dev.golisten.ensureAudio(story.id, { runNow: true });
    expect(r.manifest.complete).toBe(true);
    const st = await dev.golisten.audioStatus(story.id, { preview: true });
    expect(st).toMatchObject({ state: 'preview-only', isSpeech: false, evidenceEligible: false });
    const seg = (await dev.golisten.getSegment(r.manifest.segmentIds[1]))!;
    const emitter = listeningEmitter(dev.bus, { userId: USER, lang: LANG, session: 'fixture-listen', textId: story.id, store: dev.store });
    const view = { speed: 1, transcriptVisible: false };
    await emitter.played({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, view);
    const done = await emitter.completed({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, view);
    expect(done).toMatchObject({ type: 'AudioSegmentCompleted', speech: false });
    // A legacy-shaped event (no speech flag) for the same fixture segment.
    await dev.bus.emit<AudioSegmentCompleted>({ type: 'AudioSegmentCompleted', userId: USER, lang: LANG, surface: 'listen', session: 'legacy', dedupeKey: `legacy:${seg.id}`, textId: story.id, segmentId: seg.id, sentenceIds: seg.sentenceIds, speed: 1, transcriptVisible: false, replayCount: 0, revealedTranscript: false, revealedTranslation: false });
    const sin = (await dev.golearn.getItemState(USER, sinForm))!;
    expect(sin.listening.level).toBe('unseen');
    expect(sin.listening.exposures).toBe(0);
    const audit = await dev.golearn.auditEvidence(USER);
    expect(audit.excluded.length).toBe(2);
    expect(audit.excluded.every((e) => e.reason === 'non-speech-audio')).toBe(true);
    // Rebuilding keeps every legitimate reading/production fact and still ignores the fixture plays.
    const before = JSON.stringify([sin.reading, sin.writing]);
    await dev.golearn.auditEvidence(USER, { rebuild: true });
    const after = (await dev.golearn.getItemState(USER, sinForm))!;
    expect(JSON.stringify([after.reading, after.writing])).toBe(before);
    expect(after.listening.exposures).toBe(0);
    expect((await dev.bus.history({ userId: USER, types: ['AudioSegmentCompleted'] })).length).toBe(2); // nothing deleted
  });

  it('9c — reviewed real speech (synthetic stand-in, test only) plays the exact accepted version and counts as listening exposure only', async () => {
    const speech = new SyntheticSpeechProvider();
    const live = makeApp({ store: app.store, clock, providers: [speech] });
    const r = await live.golisten.ensureAudio(revisionTextId, { runNow: true });
    expect(r.manifest.complete).toBe(true);
    const revSentences = await liveSentences(live.store, revisionTextId);
    const segs = await Promise.all(r.manifest.segmentIds.map((id) => live.golisten.getSegment(id)));
    expect(segs.map((s) => s!.displayText)).toEqual(revSentences.map((s) => s.text)); // the exact saved version
    expect(await live.golisten.audioStatus(revisionTextId)).toMatchObject({ state: 'preview-only', evidenceEligible: false }); // voice not auditioned yet
    await live.golisten.setVoiceReview(r.manifest.voiceConfigId, 'reviewed', 'synthetic test review');
    expect(await live.golisten.audioStatus(revisionTextId)).toMatchObject({ state: 'ready', evidenceEligible: true, isSpeech: true });
    const seg = segs[0]!;
    const emitter = listeningEmitter(live.bus, { userId: USER, lang: LANG, session: 'rehearse-1', textId: revisionTextId, surface: 'testimony', store: live.store });
    const before = (await live.golearn.getItemState(USER, sinForm))!;
    await emitter.played({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, { speed: 1, transcriptVisible: false });
    const ev = await emitter.completed({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, { speed: 1, transcriptVisible: false });
    expect(ev).toMatchObject({ type: 'AudioSegmentCompleted', speech: true, voiceReviewed: true });
    const after = (await live.golearn.getItemState(USER, sinForm))!;
    expect(after.listening.exposures).toBe(before.listening.exposures + 1);
    expect(after.listening.level).toBe('encountered'); // heard ≠ understood by ear
    expect(after.listening.evidence).toBe(0);
    expect([after.reading, after.writing, after.speaking]).toEqual([before.reading, before.writing, before.speaking]);
  });
});
