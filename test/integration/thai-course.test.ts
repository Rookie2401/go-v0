/**
 * Thai course, end to end on the real adapters, importer, catalogue and engines (memory store):
 * ladder → a learner's own copy of a book (synthetic test text, see fixtures/README.md) → dictionary analysis →
 * reading with script decoding → forecast, history, readiness → Scripture as a parallel corpus on the same model.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTANCE, decodeFor, ids } from '../../src/core';
import type { DecodingRevealed, DictionaryEntry, Sentence, Text, Work } from '../../src/core';
import { THAI_COURSE_ID, createCourseCatalog } from '../../src/course';
import { createMemoryLexiconSource } from '../../src/dict';
import { importDocuments, plainTextToDocuments } from '../../src/ingest';
import { bundledDoc, liveSentences, makeApp, reader, seedUser, tokensOf, type App } from './harness';
import { withoutHeadCache } from '../golearn/harness';

const U = 'thai-learner';
const BOOK = readFileSync(fileURLToPath(new URL('./fixtures/thai-synthetic-book.txt', import.meta.url)), 'utf8');
const BOOK_LINES = BOOK.split(/\r?\n/).filter((l) => l.trim() !== '');

/** A work that exists only in this test's store: the synthetic text is never filed under a real book. */
const TEST_WORK: Work = {
  id: ids.work(THAI_COURSE_ID, 'synthetic-test-book'), courseId: THAI_COURSE_ID, lang: 'th', stageId: ids.stage(THAI_COURSE_ID, 'g1'),
  role: 'subsidiary', order: 9999, title: 'Synthetic test text (not a book)', purpose: ['integration test'],
  rights: { copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true, audiobook: 'none', verified: false },
  bibliographyVerified: false,
};

/** A tiny stand-in dictionary (test data in the DictionaryEntry shape; no dictionary file is installed). */
const DICT: DictionaryEntry[] = [
  { form: 'ชิ้น', lang: 'th', pos: 'CLF', glosses: ['piece (classifier)'] },
  { form: 'อร่อย', lang: 'th', pos: 'ADJ', glosses: ['delicious', 'tasty'], respelling: 'อะ-หฺร่อย', ipa: '/ʔa˨˩.rɔj˨˩/' },
  { form: 'ขนม', lang: 'th', pos: 'NOUN', glosses: ['sweets; dessert', 'snack'], respelling: 'ขะ-หฺนม', ipa: '/kʰa˨˩.nom˩˩˦/' },
];

let app: App;
let catalog: ReturnType<typeof createCourseCatalog>;
let chapters: Text[];
let s1: Sentence[];
let s2: Sentence[];

beforeAll(async () => {
  app = makeApp();
  await seedUser(app.store, U, THAI_COURSE_ID);
  catalog = createCourseCatalog({ store: app.store, golearn: app.golearn });
  await catalog.install(THAI_COURSE_ID);
  await app.store.works.put(TEST_WORK);

  const { documents } = plainTextToDocuments(BOOK, { lang: 'th', work: TEST_WORK, copyNote: 'integration test fixture' });
  const report = await importDocuments(app.store, app.adapters, documents, {
    clock: app.clock.now, lexicon: (lang) => (lang === 'th' ? createMemoryLexiconSource('th', DICT, { id: 'test-dict@1' }) : undefined),
  });
  expect(report.ok, JSON.stringify(report.documents.map((d) => d.issues))).toBe(true);
  chapters = await catalog.textsOf(TEST_WORK.id);
  s1 = await liveSentences(app.store, chapters[0].id);
  s2 = await liveSentences(app.store, chapters[1].id);
});

describe('the ladder', () => {
  it('installs once, idempotently, and keeps a person\'s verified rights', async () => {
    const stages = await catalog.stages(THAI_COURSE_ID);
    expect(stages.map((s) => s.key)).toEqual(['0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'open']);
    const before = (await catalog.works(THAI_COURSE_ID)).length;
    const kaeo = (await catalog.work(ids.work(THAI_COURSE_ID, 'kaeo-chom-kaen')))!;
    await app.store.works.put({ ...kaeo, rights: { ...kaeo.rights, verified: true, permission: 'granted', basis: 'checked by a person (test)' } });
    await catalog.install(THAI_COURSE_ID);
    expect((await catalog.works(THAI_COURSE_ID)).length).toBe(before);
    expect((await catalog.work(kaeo.id))!.rights).toMatchObject({ verified: true, permission: 'granted' });
    await app.store.works.put(kaeo);
  });

  it('a course without a ladder has no stages and the reader keeps its usual profile', async () => {
    expect(await catalog.stages('honduras-es')).toEqual([]);
    expect(await catalog.assistanceFor({ courseId: 'honduras-es' })).toEqual(DEFAULT_ASSISTANCE);
  });
});

describe('a learner\'s own copy of a book', () => {
  it('becomes one readable text per chapter, filed under its work, labelled as a personal copy', () => {
    expect(chapters.map((t) => t.chapter?.index)).toEqual([1, 2]);
    for (const t of chapters) {
      expect(t.workId).toBe(TEST_WORK.id);
      expect(t.personalCopy).toBe(true);
      expect(t.published).toBe(true);
      expect(t.reviewStatus).toBe('unreviewed'); // readable because it is a published native work, not because anyone reviewed the transcription
    }
  });

  it('keeps the text exactly: every line of the file is a paragraph, byte for byte, with no spaces added', async () => {
    const paragraphs = (await Promise.all(chapters.map((t) => app.store.paragraphs.where('textId', t.id))))
      .map((rows) => rows.sort((a, b) => a.index - b.index).map((p) => p.originalText));
    const body = BOOK_LINES.filter((l) => !l.startsWith('บทที่'));
    expect(paragraphs.flat()).toEqual(body);
    for (const s of [...s1, ...s2]) {
      const toks = await tokensOf(app.store, s.id);
      expect(toks.map((t) => t.surface).join('')).toBe(s.text);
      for (const t of toks) expect(s.text.slice(t.start, t.end)).toBe(t.surface);
    }
  });

  it('takes its stage from its work, and its assistance profile from that stage', async () => {
    expect((await catalog.stageOfText(chapters[0].id))?.key).toBe('g1');
    const p = await catalog.assistanceFor({ courseId: THAI_COURSE_ID, textId: chapters[0].id });
    expect(p.romanization).toBe('never');
    expect(p.layers).toContain('english');
  });

  it('analyses words the adapter does not know from the dictionary, as dictionary meanings with lower confidence', async () => {
    const toks = (await Promise.all(s2.map((s) => tokensOf(app.store, s.id)))).flat();
    const khanom = toks.find((t) => t.surface === 'ขนม')!;
    const a = await app.golearn.resolveAnalysis(khanom.id);
    expect(a).toBeDefined();
    if (a!.analyzer.startsWith('dict:')) {
      expect(a!.confidence).toBeLessThan(1);
      expect(a!.notes?.respelling).toBe('ขะ-หฺนม');
      // the irregular reading comes from the dictionary pronunciation, not from a guess
      const syl = decodeFor(app.adapters.get('th'), khanom.surface, a);
      expect(syl.map((x) => x.tone)).toEqual(['low', 'rising']);
    } else {
      // the adapter's own lexicon knows the word: it wins over the dictionary
      expect(a!.provenance === 'lexicon' || a!.provenance === 'human').toBe(true);
    }
    expect(a!.syllables).toBeUndefined(); // decodings are computed on demand, never stored per token
  });
});

describe('reading with script decoding', () => {
  it('a seen sentence yields writing-system items, which never count as words', async () => {
    const r = reader(app, U, 'th', 'sit-1');
    await r.view(chapters[0], s1);
    await app.golearn.settled();
    const items = await app.store.learnerItems.where('userId', U);
    const orth = items.filter((i) => i.itemKind === 'orth');
    expect(orth.length).toBeGreaterThan(5);
    expect(orth.some((i) => i.itemId.startsWith('orth:th:class:'))).toBe(true);
    expect(orth.some((i) => i.itemId.startsWith('orth:th:rule:'))).toBe(true);
    const cov = await app.golearn.coverage(U, chapters[0].id);
    expect(cov.newItems.some((n) => n.itemKind === 'orth')).toBe(false);
    const known = await app.golearn.listKnown(U, 'th', 'reading', 'encountered');
    expect(known.some((k) => k.itemKind === 'orth')).toBe(false);
  });

  it('opening the decoding of a word is help with the written form; the romanization rescue is recorded', async () => {
    const sentence = s1[0];
    const token = (await tokensOf(app.store, sentence.id)).find((t) => t.isWord)!;
    const adapter = app.adapters.get('th');
    const features = adapter.orthFeatures!(decodeFor(adapter, token.surface));
    expect(features.length).toBeGreaterThan(0);
    await app.bus.emit<DecodingRevealed>({
      type: 'DecodingRevealed', userId: U, lang: 'th', surface: 'corpus', session: 'sit-1', dedupeKey: `decode:${U}:sit-1:${token.id}:rom`,
      sentenceId: sentence.id, tokenId: token.id, itemId: token.formId, features, romanization: true,
    });
    await app.golearn.settled();
    const why = await app.golearn.explainItem(U, token.formId);
    expect(JSON.stringify(why)).toMatch(/help/i);
    const state = await app.golearn.getItemState(U, ids.orth('th', features[0]));
    expect(state?.itemKind).toBe('orth');
    // derived state (orth items, decoding help) rebuilds identically from the log
    const snapshot = async () => JSON.stringify(withoutHeadCache((await app.store.learnerItems.where('userId', U)).sort((a, b) => (a.itemId < b.itemId ? -1 : 1))));
    const before = await snapshot();
    await app.golearn.rebuild(U);
    await app.golearn.settled();
    expect(await snapshot()).toBe(before);
  });
});

describe('the learner model across the course', () => {
  it('forecasts a chapter before it is read, says what it cannot know, and never changes by being asked', async () => {
    const before = await app.store.events.count();
    const f = await app.golearn.predictDifficulty(U, chapters[1].id);
    expect(await app.golearn.predictDifficulty(U, chapters[1].id)).toEqual(f);
    expect(await app.store.events.count()).toBe(before);
    expect(f.predictedCoverage).toBeGreaterThanOrEqual(0);
    expect(f.predictedCoverage).toBeLessThanOrEqual(1);
    expect(f.limits.join(' ')).toMatch(/No frequency data/);
    expect(f.summary).toMatch(/estimate/);
    // ขนม occurs three times in the chapter and has not been met: new and useful, not rare
    expect(f.newUsefulWords.some((w) => w.surface === 'ขนม' && w.count === 3)).toBe(true);
    expect(f.rareWords.some((w) => w.surface === 'ขนม')).toBe(false);
  });

  it('remembers where a word was first met, across texts, and does not claim to measure pronunciation', async () => {
    const r = reader(app, U, 'th', 'sit-1');
    await r.view(chapters[1], s2);
    await app.golearn.settled();
    const h = await app.golearn.itemHistory(U, ids.form('th', 'บ้าน'));
    expect(h.first?.textId).toBe(chapters[0].id);
    expect(h.first?.workId).toBe(TEST_WORK.id);
    expect(h.first?.chapter).toBe(1);
    expect(h.byText.map((b) => b.textId).sort()).toEqual([chapters[0].id, chapters[1].id].sort());
    expect(h.pronunciation).toBe('not measured');
    expect(h.lines.join(' ')).toMatch(/chapter 1/);
    expect(h.lines.join(' ')).toMatch(/Pronunciation: not measured/);
  });

  it('never advises advancing because the texts were finished', async () => {
    const r = reader(app, U, 'th', 'sit-1');
    for (const t of chapters) await r.complete(t);
    await app.golearn.settled();
    const ready = await app.golearn.stageReadiness(U, THAI_COURSE_ID, TEST_WORK.stageId);
    expect(ready.verdict).not.toBe('ready-to-advance');
    expect(ready.signals.find((s) => s.key === 'listening')?.status).toBe('not-available');
    expect(ready.explanation.length).toBeGreaterThan(10);
    // with nothing stored, the learner works at the first stage that is not ready to leave
    expect((await catalog.currentStage(U, THAI_COURSE_ID))?.key).toBe('0');
    await catalog.setCurrentStage(U, THAI_COURSE_ID, TEST_WORK.stageId);
    expect((await catalog.currentStage(U, THAI_COURSE_ID))?.key).toBe('g1');
  });

  it('reading pace is a quiet measure with its basis stated', async () => {
    const pace = await app.golearn.readingPace(U, { lang: 'th' });
    expect(pace.basis).toBe('sentence-dwell');
    expect(pace.sentences).toBe(s1.length + s2.length);
    expect(pace.wordsPerMinute).toBeUndefined(); // ten timed sentences are too few to state a figure
    expect(pace.trend).toBe('insufficient-data');
  });
});

describe('Scripture is a parallel corpus on the same learner model', () => {
  it('sits outside the ladder, borrows the profile of the stage the learner works at, and shares word history', async () => {
    const report = await importDocuments(app.store, app.adapters, [bundledDoc('th', 'bible-1john-1')], { clock: app.clock.now });
    expect(report.ok).toBe(true);
    const scripture = (await app.store.texts.get(ids.text('th', 'bible-1john-1')))!;
    expect(scripture.published).toBe(false); // still blocked: no identified, verified Thai translation
    expect(await catalog.stageOfText(scripture.id)).toBeUndefined();
    const g1 = (await catalog.stages(THAI_COURSE_ID)).find((s) => s.key === 'g1')!;
    expect(await catalog.assistanceFor({ courseId: THAI_COURSE_ID, textId: scripture.id, currentStageId: g1.id })).toEqual(g1.assistance);

    const we = ids.form('th', 'เรา');
    const sentences = await liveSentences(app.store, scripture.id);
    const withWe: Sentence[] = [];
    for (const s of sentences) if ((await tokensOf(app.store, s.id)).some((t) => t.formId === we)) withWe.push(s);
    expect(withWe.length).toBeGreaterThan(0);
    await reader(app, U, 'th', 'sit-1').view(scripture, withWe.slice(0, 1));
    await app.golearn.settled();
    const h = await app.golearn.itemHistory(U, we);
    expect(h.byText.map((b) => b.textId)).toEqual(expect.arrayContaining([chapters[1].id, scripture.id]));
  });
});

describe('provenance: every analysis says where it came from', () => {
  it('the hand word list stays first and is named as hand-written; the dictionary stands beside it, never over it', async () => {
    const toks = (await Promise.all(s2.map((s) => tokensOf(app.store, s.id)))).flat();
    const khanom = toks.find((t) => t.surface === 'ขนม')!;
    const a = (await app.golearn.resolveAnalysis(khanom.id))!;
    expect(a.origin).toBe('hand');
    expect(a.sourceId).toMatch(/^adapter-th@\d+:hand$/);
    const adapter = app.adapters.get('th');
    expect(adapter.sources?.[a.sourceId!]).toMatchObject({ origin: 'hand', reviewStatus: 'machine-drafted' });
    // the dictionary is not copied onto every occurrence: the analysis only notes that the dictionary has this word,
    // and the reader asks the installed dictionary when the sheet opens
    expect(a.notes?.dictionary).toBe('test-dict@1');
    expect((a.alternatives ?? []).some((x) => x.origin === 'dictionary')).toBe(false);
    expect(a.gloss ?? '').not.toMatch(/dessert/); // nothing of the dictionary's wording has replaced the hand entry
  });

  it('a word only the dictionary knows is dictionary-derived, below certainty; its reading names its source', async () => {
    const adapter = app.adapters.get('th');
    const text = 'ฉันเห็นกิ้งก่าบนต้นไม้';
    const tokens = adapter.tokenize(text);
    const analysed = adapter.analyze(tokens);
    const unknown = tokens.filter((t, i) => t.isWord && analysed[i].candidates.length === 0);
    expect(unknown.length, 'the test needs a word outside the hand list').toBeGreaterThan(0);
    const entries: DictionaryEntry[] = unknown.map((t) => ({ form: t.normalized, lang: 'th', pos: 'NOUN', glosses: ['test gloss'] }));
    const { documents } = plainTextToDocuments(text, { lang: 'th', title: 'Provenance test (synthetic)', idPrefix: 'provenance-test' });
    const report = await importDocuments(app.store, app.adapters, documents, {
      clock: app.clock.now, lexicon: () => createMemoryLexiconSource('th', entries, { id: 'test-dict@2' }),
    });
    expect(report.ok).toBe(true);
    const sentences = await liveSentences(app.store, ids.text('th', documents[0].id));
    const toks = (await Promise.all(sentences.map((s) => tokensOf(app.store, s.id)))).flat();
    const tok = toks.find((t) => t.normalized === unknown[0].normalized)!;
    const a = (await app.golearn.resolveAnalysis(tok.id))!;
    expect(a).toMatchObject({ origin: 'dictionary', sourceId: 'test-dict@2', provenance: 'lexicon' });
    expect(a.confidence).toBeLessThan(1);

    // a named person's correction supersedes it and the dictionary row is kept as history
    const fixed = await app.golearn.overrideAnalysis(tok.id, { pos: 'NOUN', notes: { reviewed: 'yes' } }, 'Test Reviewer');
    expect(fixed).toMatchObject({ origin: 'reviewed', sourceId: 'human:Test Reviewer' });
    const rows = await app.store.analyses.where('tokenId', tok.id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r.origin === 'dictionary')).toBe(true);
    expect((await app.golearn.resolveAnalysis(tok.id))!.id).toBe(fixed.id);
  });

  it('a decoded reading carries its source, and a dictionary reading keeps the rule\'s own answer when they differ', () => {
    const adapter = app.adapters.get('th');
    const byRule = adapter.decode!('บ้าน');
    expect(byRule.every((s) => s.source === 'rule')).toBe(true);
    const fromDict = adapter.decodeWithPronunciation!('ขนม', { respelling: 'ขะ-หฺนม', ipa: '/kʰa˨˩.nom˩˩˦/' }, 'test-dict@1');
    expect(fromDict.map((s) => s.tone)).toEqual(['low', 'rising']);
    expect(fromDict.every((s) => s.source === 'dictionary' && s.sourceId === 'test-dict@1')).toBe(true);
    // a deliberately false "dictionary" reading against a word the rules read confidently: the rule's tone is kept beside it
    const contested = adapter.decodeWithPronunciation!('มา', { respelling: 'ม้า', ipa: '/maː˦˥/' }, 'test-dict@1');
    expect(contested.map((s) => s.tone)).toEqual(['high']);
    expect(contested[0].ruleTone).toBe('mid');
  });

  it('a language that declares its sources labels each one; one that declares none shows no provenance line', () => {
    // Spanish, German and Hindi declare their sources since their courses were built; a course without its own engine declares none
    for (const lang of ['es', 'de', 'sq', 'hi'] as const) {
      const sources = app.adapters.get(lang).sources;
      if (!sources) continue;
      for (const [id, src] of Object.entries(sources)) {
        expect(src.id, `${lang} ${id}`).toBe(id);
        expect(src.label.length, `${lang} ${id}`).toBeGreaterThan(0);
        expect(['machine-drafted', 'native-reviewed', 'external'], `${lang} ${id}`).toContain(src.reviewStatus);
      }
    }
    // nothing in Spanish or Hindi has been read by a native speaker yet, and the labels say so
    for (const lang of ['es', 'hi'] as const) {
      expect(Object.values(app.adapters.get(lang).sources ?? {}).every((x) => x.origin === 'rule' || x.reviewStatus === 'machine-drafted'), lang).toBe(true);
    }
  });
});
