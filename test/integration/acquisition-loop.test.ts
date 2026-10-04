/**
 * ONE COMPLETE ACQUISITION LOOP (Spanish) on the real adapters, importer and engines — the twelve steps:
 *
 *   1 import + validate a CI text        5 verified Scripture with overlap     9 assisted ≠ independent
 *   2 publish only after review          6 shared history → assistance + prep  10 save / reload / switch / recover
 *   3 read with word, phrase, grammar,   7 synthetic testimony                 11 speech for the accepted version
 *     English help                       8 restrained, grounded suggestion        (or the honest unavailable state)
 *   4 accurate, non-duplicated evidence                                        12 revise the text: history, analysis, audio
 *
 * The "review" in step 2 is a SYNTHETIC review recorded inside this test with the real review function; the
 * bundled seed story itself stays unreviewed. No real speech exists in this repository: step 11 proves the
 * unavailable state and, with a test-only stand-in provider, the reviewed-speech code path.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { DomainEvent, GrammarHelpOpened, PhraseHelpOpened, Sentence, Text, TextViewed } from '../../src/core';
import type { AudioGenerationAuthorization, EnsureAudioOptions } from '../../src/core/contracts/golisten';
import { ids } from '../../src/core';
import { applyReview, contentHistory, importDocuments, validateBatch } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import { canonicalTextSha256, editionIdOf, listeningEmitter, releaseIdOf } from '../../src/golisten';
import { SyntheticSpeechProvider, bundled, bundledDoc, liveSentences, makeApp, makeClock, reader, seedUser, tokensOf } from './harness';

const USER = 'loop-es';
const LANG = 'es' as const;
const form = (s: string) => ids.form(LANG, s);

/** Test-only grant for the mocked speech provider; it records exact release scope and no retention. */
async function ensureAuthorizedTestSpeech(app: ReturnType<typeof makeApp>, textId: string, options: EnsureAudioOptions = {}) {
  const text = await app.store.texts.get(textId);
  if (!text) throw new Error(`Missing test text ${textId}`);
  const live = (await app.store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const voice = options.voiceConfigId ? await app.store.voices.get(options.voiceConfigId) : await app.golisten.resolveVoice(text.lang);
  if (!voice) throw new Error('The test speech provider did not resolve a voice');
  const rights: AudioGenerationAuthorization['rights'] = {
    id: `test-only:${voice.providerId}:${text.id}`, status: 'approved', recordingOwner: 'test-only mock provider', recordingBasis: 'explicit integration-test authorization',
    performanceOwner: voice.providerId, performancePermission: 'Mock output only; no external retention', playInApp: true, stream: true, offline: false,
    redistribute: false, segment: true, transform: false, textDerivative: 'allowed', providerRetention: 'none', providerId: voice.providerId,
    providerTerms: 'Test mock only; no retention or redistribution',
  };
  const generationAuthorization: AudioGenerationAuthorization = { rights, textBinding: {
    textId, contentVersion: text.contentVersion, textSha256: await canonicalTextSha256(textId, text.contentVersion, live),
    releaseId: releaseIdOf(text), editionId: editionIdOf(text),
  } };
  const result = await app.golisten.ensureAudio(textId, { ...options, generationAuthorization });
  // The mocked WAV passes technical validation; this remains test-only metadata, not an acoustic review.
  for (const segmentId of result.manifest.segmentIds) {
    const segment = await app.golisten.getSegment(segmentId);
    const asset = segment?.assetId ? await app.golisten.getAsset(segment.assetId) : undefined;
    if (asset) await app.store.audioAssets.put({ ...asset, qualityState: 'machine_checked' });
  }
  return result;
}

describe('one complete acquisition loop — Spanish', () => {
  const clock = makeClock();
  const speech = new SyntheticSpeechProvider(); // TEST-ONLY stand-in; never speech
  let app = makeApp({ clock });
  let gotell = app.gotellAll.forUser(USER);
  const storyId = ids.text(LANG, 'story-01');
  const bibleId = ids.text(LANG, 'bible-1john-1');
  let supplied: CorpusDocument; // the file as a contributor would supply it (unreviewed)
  let reviewed: CorpusDocument; // the same file after the review step
  let story: Text, bible: Text;
  let S: Sentence[]; // live story sentences
  const encounters = async () => (await app.store.encounters.where('userId', USER));
  const state = (itemId: string) => app.golearn.getItemState(USER, itemId);
  const prod = async () => (await app.bus.history({ userId: USER, types: ['ProductionRecorded'] })) as Array<Extract<DomainEvent, { type: 'ProductionRecorded' }>>;

  beforeAll(async () => {
    await seedUser(app.store, USER, 'honduras-es');
    await importDocuments(app.store, app.adapters, bundled(LANG).filter((d) => d.id !== 'story-01')); // Scripture + dialogue already on the device
    supplied = bundledDoc(LANG, 'story-01');
  });

  it('1 — the supplied text validates, imports exactly, and is NOT published without a review', async () => {
    const v = validateBatch([supplied], { registry: app.adapters });
    expect(v.ok).toBe(true);
    const report = await importDocuments(app.store, app.adapters, [supplied]);
    expect(report.documents[0]).toMatchObject({ id: 'story-01', action: 'created', contentVersion: 1, published: false });
    expect(report.documents[0].unpublishedReasons.join(' ')).toMatch(/review/i);
    expect(report.documents[0].analysisCoverage.coverage).toBeGreaterThan(0.9);
    S = await liveSentences(app.store, storyId);
    const suppliedTexts = supplied.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [])));
    expect(S.map((s) => s.text)).toEqual(suppliedTexts);
    // Not offered to the learner, not usable as Scripture preparation.
    expect((await app.golearn.recommend(USER, { lang: LANG })).some((r) => r.textId === storyId)).toBe(false);
    expect((await app.golearn.scriptureReadiness(USER, bibleId)).preparatoryTexts.some((p) => p.textId === storyId)).toBe(false);
  });

  it('2 — recording a review (and only that) publishes it; the text and its sentence ids are untouched', async () => {
    const refused = applyReview(supplied, { by: '' }); // a review needs a named reviewer
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.refusals.map((x) => x.code)).toContain('missing-reviewer');
    const done = applyReview(supplied, { by: 'Acceptance run (synthetic review, not a native-speaker review)', status: 'reviewed', date: '2026-10-01' });
    if (!done.ok) throw new Error(JSON.stringify(done.refusals));
    expect(done.decision.published).toBe(true);
    reviewed = done.doc as CorpusDocument;
    expect(JSON.stringify(reviewed.sections)).toBe(JSON.stringify(supplied.sections)); // not one byte of text changed
    const report = await importDocuments(app.store, app.adapters, [reviewed]);
    expect(report.documents[0]).toMatchObject({ published: true, contentVersion: 1 });
    expect((await liveSentences(app.store, storyId)).map((s) => s.id)).toEqual(S.map((s) => s.id));
    story = (await app.store.texts.get(storyId))!;
    bible = (await app.store.texts.get(bibleId))!;
    expect(story).toMatchObject({ published: true, reviewStatus: 'reviewed', generated: true });
    expect((await app.golearn.recommend(USER, { lang: LANG }))[0]).toMatchObject({ reason: 'first-text', textId: storyId });
  });

  const WORD_SENTENCE = 0; // "Cuando era joven, yo no entendía mi corazón."  → tap "corazón"
  const PHRASE_SENTENCE = 3; // "Un día empecé a entender mi pecado."         → phrase help "empezar a entender"
  const RESCUE_SENTENCE = 2; // "Yo no creía en Dios."                        → English rescue

  it('3–4 — reading with word / phrase / grammar / English help yields accurate evidence, counted once', async () => {
    const r = reader(app, USER, LANG, 'sitting-A');
    // Opening the text, or previewing it from a preparation panel, counts nothing.
    await app.bus.emit<TextViewed>({ type: 'TextViewed', userId: USER, lang: LANG, surface: 'corpus', session: 'sitting-A', dedupeKey: `open:${storyId}`, textId: storyId, mode: 'open', contentVersion: 1 });
    await app.bus.emit<TextViewed>({ type: 'TextViewed', userId: USER, lang: LANG, surface: 'scripture', session: 'sitting-A', dedupeKey: `preview:${storyId}`, textId: storyId, mode: 'preview', contentVersion: 1 });
    expect((await encounters()).length).toBe(0);
    expect(await app.golearn.readingProgress(USER, storyId)).toMatchObject({ sentencesSeen: 0, sentencesUnderstood: 0, sittings: 0 });

    await r.view(story, S);
    // word help
    const w = (await tokensOf(app.store, S[WORD_SENTENCE].id)).find((t) => t.normalized === 'corazón')!;
    const word = await app.golearn.tokenSupport(USER, w.id, 1);
    expect(word.gloss).toBe('heart');
    await r.tap(story, S[WORD_SENTENCE], w, 1);
    // phrase help
    const po = (await app.store.phraseOccurrences.where('sentenceId', S[PHRASE_SENTENCE].id))[0];
    expect(po).toBeDefined();
    const phraseTok = (await app.store.tokens.get(po.tokenIds[0]))!;
    expect((await app.golearn.tokenSupport(USER, phraseTok.id, 2)).phrases.map((p) => p.phrase.id)).toContain(po.phraseId);
    await app.bus.emit<PhraseHelpOpened>({ type: 'PhraseHelpOpened', userId: USER, lang: LANG, surface: 'corpus', session: 'sitting-A', dedupeKey: `phrase:${po.id}`, sentenceId: S[PHRASE_SENTENCE].id, phraseOccurrenceId: po.id, phraseId: po.phraseId });
    // grammar / morphology help (level 3): the resolved analysis with its provenance and confidence
    const g = await app.golearn.tokenSupport(USER, phraseTok.id, 3);
    expect(g.analysis?.analyzer).toMatch(/adapter-es@|import@/);
    expect(g.analysis?.confidence).toBeGreaterThan(0);
    expect(g.morphologyLine).toBeTruthy();
    const pat = (await app.store.patternOccurrences.where('textId', storyId))[0];
    if (pat) await app.bus.emit<GrammarHelpOpened>({ type: 'GrammarHelpOpened', userId: USER, lang: LANG, surface: 'corpus', session: 'sitting-A', dedupeKey: `grammar:${pat.id}`, sentenceId: pat.sentenceId, patternId: pat.patternId, tokenIds: pat.tokenIds });
    // English rescue
    expect((await app.golearn.sentenceSupport(USER, S[RESCUE_SENTENCE].id)).rescue).toBeUndefined();
    expect((await app.golearn.sentenceSupport(USER, S[RESCUE_SENTENCE].id, { withRescue: true })).rescue?.english).toBe('I did not believe in God.');
    await r.rescue(story, S[RESCUE_SENTENCE]);

    const all = await encounters();
    const kindsIn = (sentence: Sentence) => all.filter((e) => e.sentenceId === sentence.id && e.itemKind === 'form').map((e) => [e.itemId, e.evidenceKind, e.assistance] as const);
    // the tapped word: assisted at level 1; its neighbours: plain exposure
    expect(kindsIn(S[WORD_SENTENCE]).find(([id]) => id === w.formId)).toEqual([w.formId, 'assisted', 1]);
    // grammar help marks exactly the words of that construction as assisted (level 3), wherever it occurs
    const grammarForms = new Set<string>();
    if (pat) for (const tid of pat.tokenIds) grammarForms.add((await app.store.tokens.get(tid))!.formId);
    if (pat) for (const f of grammarForms) expect(all.find((e) => e.sentenceId === pat.sentenceId && e.itemId === f)).toMatchObject({ evidenceKind: 'assisted', assistance: 3 });
    const untouched = kindsIn(S[WORD_SENTENCE]).filter(([id]) => id !== w.formId && !(pat?.sentenceId === S[WORD_SENTENCE].id && grammarForms.has(id)));
    expect(untouched.length).toBeGreaterThan(0);
    expect(untouched.every(([, k, a]) => k === 'exposure' && a === 0)).toBe(true);
    // the phrase's words: assisted at level 2; the rescued sentence: everything assisted at level 5
    for (const tid of po.tokenIds) { const t = (await app.store.tokens.get(tid))!; expect(kindsIn(S[PHRASE_SENTENCE]).find(([id]) => id === t.formId)?.[1]).toBe('assisted'); }
    expect(kindsIn(S[RESCUE_SENTENCE]).every(([, k, a]) => k === 'assisted' && a === 5)).toBe(true);
    expect(all.every((e) => e.contentVersion === 1)).toBe(true); // evidence is pinned to the version read

    // Seen ≠ finished ≠ understood.
    let p = await app.golearn.readingProgress(USER, storyId);
    expect(p).toMatchObject({ contentVersion: 1, sentencesTotal: S.length, sentencesSeen: S.length, sentencesUnderstood: 0, sittings: 1 });
    expect(p.finishedAt).toBeUndefined();
    const sin = (await state(form('pecado')))!;
    expect(sin.reading).toMatchObject({ level: 'encountered', evidence: 0 }); // seen three times, helped never: still only met
  });

  it('4b — duplicates: rerender, scroll, route revisit and reload add nothing; exposure never becomes knowledge', async () => {
    const before = (await encounters()).length;
    const exposures = (await state(form('dios')))!.reading.exposures;
    const r = reader(app, USER, LANG, 'sitting-A');
    await r.view(story, S); // rerender / scroll back: same session, same keys
    // route revisit + full reload: the UI may come back with ANOTHER session id inside the same sitting
    clock.jumpMinutes(5);
    await reader(app, USER, LANG, 'sitting-A-after-reload').view(story, S);
    await importDocuments(app.store, app.adapters, [reviewed]); // re-import of unchanged content
    expect((await encounters()).length).toBe(before);
    expect((await state(form('dios')))!.reading.exposures).toBe(exposures);
    expect((await app.golearn.readingProgress(USER, storyId)).sittings).toBe(1);

    // A genuinely later sitting is a new exposure — and still only exposure.
    clock.jumpMinutes(45);
    await reader(app, USER, LANG, 'sitting-B').view(story, S);
    const dios = (await state(form('dios')))!;
    expect(dios.reading.exposures).toBeGreaterThan(exposures);
    expect(dios.reading.level).toBe('encountered');
    expect(dios.reading.evidence).toBe(0);
    expect((await app.golearn.readingProgress(USER, storyId)).sittings).toBe(2);
    expect((await app.golearn.coverage(USER, storyId)).knownLexicalCoverage).toBe(0); // nothing demonstrated yet

    // Explicit completion and an honest report.
    const rB = reader(app, USER, LANG, 'sitting-B');
    await rB.complete(story);
    const understood = S.filter((_, i) => i !== 2); // every sentence except one he was unsure of
    await rB.report(story, understood, 'all', 'sentence');
    const p = await app.golearn.readingProgress(USER, storyId);
    expect(p.finishedAt).toBeDefined();
    expect(p.sentencesSeen).toBe(S.length);
    expect(p.sentencesUnderstood).toBe(understood.length);
    expect((await state(form('pecado')))!.reading.level).toBe('recognized'); // demonstrated in several sentences
    expect((await app.golearn.coverage(USER, storyId)).knownLexicalCoverage).toBeGreaterThan(0);
  });

  it('5–6 — verified Scripture: shared history changes its assistance and its preparation', async () => {
    expect(bible).toMatchObject({ published: true, kind: 'scripture', generated: false });
    expect(bible.scripture?.verification?.against).toMatch(/eBible/);
    const B = await liveSentences(app.store, bibleId);
    const storyForms = new Set((await app.store.tokens.where('textId', storyId)).filter((t) => t.isWord).map((t) => t.formId));
    const overlap = (await app.store.tokens.where('textId', bibleId)).filter((t) => t.isWord && storyForms.has(t.formId)).map((t) => t.normalized);
    expect(overlap).toEqual(expect.arrayContaining(['pecado', 'dios', 'mundo']));
    const support = await app.golearn.sentenceSupport(USER, B[0].id);
    const sinTok = (await tokensOf(app.store, B[0].id)).find((t) => t.formId === form('pecado'))!;
    expect(support.highlight[sinTok.id]).toBe('known'); // known from the story, before any Scripture reading
    const ready = await app.golearn.scriptureReadiness(USER, bibleId);
    expect(ready.familiarItems.map((f) => f.surface)).toContain('pecado');
    expect(ready.coverage.knownLexicalCoverage).toBeGreaterThan(0);
    expect(ready.gaps.length).toBeGreaterThan(0);
    expect(ready.gaps.some((x) => x.surface === 'pecado')).toBe(false); // demonstrated ⇒ no longer a gap
    expect(ready.preparatoryTexts.every((x) => x.covers.length > 0)).toBe(true);
    // Preparation is a preview: computing it and showing the passage in a panel is not reading Scripture.
    expect(await app.golearn.readingProgress(USER, bibleId)).toMatchObject({ sentencesSeen: 0, sentencesUnderstood: 0 });
    expect((await state(form('pecado')))!.textIds).toEqual([storyId]);
    clock.jumpMinutes(40);
    await reader(app, USER, LANG, 'sitting-C').view(bible, B);
    expect((await state(form('pecado')))!.textIds).toEqual(expect.arrayContaining([storyId, bibleId]));
    expect((await liveSentences(app.store, bibleId)).map((s) => s.text)).toEqual(B.map((s) => s.text)); // exact, unchanged
  });

  const OWN = 'Cuando era joven, yo no entendía mi pecado.';
  let revisionId: string, revisionTextId: string;

  it('7–9 — testimony: a restrained, grounded suggestion; accepted help stays distinct from independent writing', async () => {
    const t = await gotell.getOrCreateTestimony(USER, LANG);
    const draft = `${OWN} Dios ama a el mundo.`;
    await gotell.saveDraft(USER, LANG, draft);
    const a = await gotell.submitDraft(t.id, draft);
    expect((await prod()).length).toBe(0);
    // Restraint: his own correct sentence (with its negation and its chronology) is left alone.
    expect(a.suggestions.filter((s) => s.sentenceIndex === 0)).toEqual([]);
    const fix = a.suggestions.find((s) => s.sentenceIndex === 1)!;
    expect(fix).toMatchObject({ kind: 'repair', suggested: 'Dios ama al mundo.', scope: 'fixes-all-detected', newItems: [] });
    expect(fix.meaningChange).toBeUndefined();
    expect(fix.sources.some((s) => s.excerpt === 'Dios ama al mundo.' && s.textId === storyId)).toBe(true);
    // Meaning help: grounded when the language was encountered, refused when it was not, never an existing draft.
    const ok = await gotell.intent({ userId: USER, lang: LANG, english: 'I began to understand my sin' });
    expect(ok).toMatchObject({ supported: true, proposal: 'Empecé a entender mi pecado.' });
    const neg = await gotell.intent({ userId: USER, lang: LANG, english: 'I did not believe in God' });
    if (neg.supported) expect(neg.proposal).toMatch(/\bno\b/i); // negation survives
    const no = await gotell.intent({ userId: USER, lang: LANG, english: 'My uncle repaired motorcycles in the mountains' });
    expect(no).toMatchObject({ supported: false, insertable: false });
    expect(no.proposal).toBeUndefined();

    await gotell.acceptSuggestion(fix.id);
    const rev = await gotell.acceptRevision(t.id, `${OWN} ${fix.suggested}`);
    revisionId = rev.id; revisionTextId = rev.textId!;
    const p = await prod();
    expect(p.filter((e) => e.itemId === form('pecado')).map((e) => e.kind)).toEqual(['independent']);
    expect(p.filter((e) => e.itemId === form('al')).map((e) => e.kind)).toEqual(['assisted']);
    const n = p.length;
    await gotell.submitDraft(t.id, rev.fullText);
    expect((await gotell.acceptRevision(t.id, rev.fullText)).id).toBe(rev.id);
    expect((await prod()).length).toBe(n); // re-check + re-save: nothing manufactured
    const al = await app.golearn.queryItem(USER, { itemId: form('al'), lang: LANG });
    const sin = await app.golearn.queryItem(USER, { itemId: form('pecado'), lang: LANG });
    expect([al.writing.level, sin.writing.level]).toEqual(['used_with_assistance', 'used_independently']);
    expect(sin.reading.level).toBe('recognized'); // writing never rewrote reading evidence
  });

  it('10 — save, leave, reload, switch language, recover the draft and the version', async () => {
    const draft = await gotell.saveDraft(USER, LANG, `${OWN} Dios ama al mundo. Ahora creo en Dios.`);
    app = makeApp({ store: app.store, clock }); // reload: new engine instances over the stored data
    gotell = app.gotellAll.forUser(USER);
    expect(await app.golearn.ensureCurrent(USER)).toBe(false);
    expect(await gotell.getDraft(USER, LANG)).toEqual(draft);
    await gotell.saveDraft(USER, 'de', 'Jetzt glaube ich an Gott.');
    expect((await gotell.getDraft(USER, LANG))?.text).toBe(draft.text);
    const restored = await gotell.restoreRevisionAsDraft(revisionId);
    expect(restored.text).toBe(`${OWN} Dios ama al mundo.`);
    const t = await gotell.getOrCreateTestimony(USER, LANG);
    expect((await gotell.listRevisions(t.id)).map((r) => r.number)).toEqual([1]);
    expect((await gotell.getDraft(USER, 'de'))?.text).toBe('Jetzt glaube ich an Gott.');
  });

  it('11 — speech for the accepted version: unavailable without a provider; synthetic speech plays as practice and is never listening evidence', async () => {
    expect((await app.golisten.availability()).available).toBe(false);
    expect(await app.golisten.audioStatus(revisionTextId)).toMatchObject({ state: 'unavailable', evidenceEligible: false });
    await expect(app.golisten.ensureAudio(revisionTextId, { runNow: true })).rejects.toMatchObject({ name: 'AudioUnavailable' });

    const live = makeApp({ store: app.store, clock, providers: [speech] }); // TEST-ONLY stand-in for a configured provider
    const r = await ensureAuthorizedTestSpeech(live, revisionTextId, { runNow: true });
    const segs = await Promise.all(r.manifest.segmentIds.map((id) => live.golisten.getSegment(id)));
    expect(segs.map((s) => s!.displayText)).toEqual([OWN, 'Dios ama al mundo.']); // the exact saved version
    expect((await live.golisten.audioStatus(revisionTextId)).state).toBe('preview-only'); // voice not auditioned
    await live.golisten.setVoiceReview(r.manifest.voiceConfigId, 'reviewed', 'synthetic');
    expect(await live.golisten.audioStatus(revisionTextId)).toMatchObject({ evidenceEligible: false }); // synthetic: practice, never evidence (changed in evidence@8)
    const before = (await live.golearn.getItemState(USER, form('pecado')))!;
    const em = listeningEmitter(live.bus, { userId: USER, lang: LANG, session: 'rehearse', textId: revisionTextId, surface: 'testimony', store: live.store });
    const seg = segs[0]!;
    await em.played({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, { speed: 0.9, transcriptVisible: false });
    await em.replayed({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, { speed: 0.9, transcriptVisible: false });
    await em.completed({ segmentId: seg.id, sentenceIds: seg.sentenceIds }, { speed: 0.9, transcriptVisible: false }, { heardCoverageRatio: 1 });
    await live.golearn.settled();
    const after = (await live.golearn.getItemState(USER, form('pecado')))!;
    expect(after.listening).toEqual(before.listening); // synthetic speech heard: no listening encounter at all
    expect((await live.golearn.auditEvidence(USER)).excluded.map((x) => x.reason)).toContain('synthetic-audio');
    expect([after.reading, after.writing]).toEqual([before.reading, before.writing]);
  });

  it('12 — revising the imported text: version history, analysis and audio follow; learner history stays', async () => {
    const live = makeApp({ store: app.store, clock, providers: [speech] });
    const a1 = await ensureAuthorizedTestSpeech(live, storyId, { runNow: true });
    await live.golisten.setVoiceReview(a1.manifest.voiceConfigId, 'reviewed', 'synthetic');
    expect((await live.golisten.audioStatus(storyId)).state).toBe('ready');
    const target = S.find((s) => s.text === 'Dios ama al mundo.')!;
    const untouched = S.find((s) => s.text === 'Ahora creo en Dios.')!;
    const analysesBefore = (await Promise.all((await tokensOf(app.store, untouched.id)).map((t) => app.store.analyses.where('tokenId', t.id)))).flat().map((x) => x.id).sort();
    const encBefore = (await encounters()).filter((e) => e.sentenceId === target.id).length;
    expect(encBefore).toBeGreaterThan(0);

    const revised = structuredClone(reviewed);
    for (const sec of revised.sections) for (const p of sec.paragraphs) if ('sentences' in p) for (const s of p.sentences) if (s.text === target.text) { s.text = 'Dios ama a todo el mundo.'; s.english = 'God loves the whole world.'; }
    // A review covers the wording it was given. The revised wording is imported, versioned — and HELD until it is reviewed.
    const held = await importDocuments(live.store, live.adapters, [revised]);
    expect(held.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesAdded: 1, sentencesRetired: 1, published: false });
    expect(held.documents[0].unpublishedReasons.join(' ')).toMatch(/changed after it was reviewed/);
    expect((await live.golearn.recommend(USER, { lang: LANG })).some((x) => x.textId === storyId)).toBe(false);
    const rereview = applyReview(revised, { by: 'Acceptance run (synthetic review, not a native-speaker review)', status: 'reviewed', date: '2026-10-02' });
    if (!rereview.ok) throw new Error(JSON.stringify(rereview.refusals));
    const rep = await importDocuments(live.store, live.adapters, [rereview.doc]);
    expect(rep.documents[0]).toMatchObject({ contentVersion: 2, published: true }); // a review is not a content change
    const text2 = (await live.store.texts.get(storyId))!;
    expect(contentHistory(text2).map((h) => h.version)).toEqual([1, 2]);

    // The old sentence is history, with the learner's evidence still attached to version 1.
    const old = (await live.store.sentences.get(target.id))!;
    expect(old).toMatchObject({ retiredInVersion: 2, text: 'Dios ama al mundo.' });
    const oldEnc = (await encounters()).filter((e) => e.sentenceId === target.id);
    expect(oldEnc.length).toBe(encBefore);
    expect(oldEnc.every((e) => e.contentVersion === 1)).toBe(true);
    // Analysis: the new sentence was analysed; an untouched sentence kept the very same analysis rows.
    const S2 = await liveSentences(live.store, storyId);
    const fresh = S2.find((s) => s.text === 'Dios ama a todo el mundo.')!;
    expect(fresh.versionAdded).toBe(2);
    expect((await tokensOf(live.store, fresh.id)).filter((t) => t.isWord).map((t) => t.surface)).toEqual(['Dios', 'ama', 'a', 'todo', 'el', 'mundo']);
    const analysesAfter = (await Promise.all((await tokensOf(live.store, untouched.id)).map((t) => live.store.analyses.where('tokenId', t.id)))).flat().map((x) => x.id).sort();
    expect(analysesAfter).toEqual(analysesBefore);
    // Progress describes the current version: the new sentence has not been seen.
    expect(await live.golearn.readingProgress(USER, storyId)).toMatchObject({ contentVersion: 2, sentencesTotal: S.length, sentencesSeen: S.length - 1 });
    // Audio: stale until regenerated; only the changed sentence is synthesized again.
    expect((await live.golisten.audioStatus(storyId)).state).toBe('stale');
    const a2 = await ensureAuthorizedTestSpeech(live, storyId, { runNow: true });
    expect([a2.created, a2.reused]).toEqual([1, S.length - 1]);
    expect((await live.golisten.audioStatus(storyId)).state).toBe('ready');
    // What he learned from the retired sentence is still his: "al" remains sourced to the sentence he actually read.
    const k = await live.golearn.queryItem(USER, { itemId: form('al'), lang: LANG });
    expect(k.exists).toBe(true);
    // Reverting to the original wording revives the original sentence instead of minting a new one.
    const back = await importDocuments(live.store, live.adapters, [reviewed]);
    expect(back.documents[0]).toMatchObject({ action: 'updated', contentVersion: 3 });
    expect((await liveSentences(live.store, storyId)).map((s) => s.id)).toEqual(S.map((s) => s.id));
    expect(contentHistory((await live.store.texts.get(storyId))!).map((h) => h.version)).toEqual([1, 2, 3]);
    // Derived state is still exactly rebuildable from the log.
    const snap = JSON.stringify(await live.golearn.getItemState(USER, form('pecado')));
    await live.golearn.rebuild(USER);
    expect(JSON.stringify(await live.golearn.getItemState(USER, form('pecado')))).toBe(snap);
  });
});
