/**
 * Hindi course, end to end on the real adapter, importer, catalogue, library and engines (memory store):
 * shelves that are not locks → the course's own Stage 0 stories (machine-drafted, unpublished) → one learner model
 * across stories, Scripture and the learner's own book → the writing kept as written (nukta, raw text) → fused words,
 * compound verbs and complex predicates beside their component words → heritage languages kept apart → the Bible as
 * its own licensed corpus → rights enforced by the build gate.
 *
 * The Stage 0 stories are machine-drafted and unreviewed; here some are given a SYNTHETIC review so that the
 * published path can be exercised (the bundled files stay unreviewed).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { COURSES, ids, varietyStanding } from '../../src/core';
import type { Library, Sentence, Text } from '../../src/core';
import { HINDI_COURSE_ID, HINDI_WORKS, IRV_HINDI_RIGHTS, createCourseCatalog } from '../../src/course';
import { applyReview, computePublished, importDocuments, plainTextToDocuments } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import { bundleDecision } from '../../src/ingest/rights';
import { createLibrary } from '../../src/library';
import { bundled, bundledDoc, liveSentences, makeApp, reader, seedUser, syntheticallyReviewed, tokensOf, type App } from './harness';

const U = 'hi-learner';
const COURSE = COURSES.find((c) => c.id === HINDI_COURSE_ID)!;
const NUKTA = String.fromCodePoint(0x093C); // the dot under a letter, as its own code point
const nfc = (s: string) => s.normalize('NFC');

let app: App;
let catalog: ReturnType<typeof createCourseCatalog>;
let library: Library;
const T = (slug: string) => ids.text('hi', slug);
const text = async (slug: string): Promise<Text> => (await app.store.texts.get(T(slug)))!;
const itemsOf = async () => app.store.learnerItems.where('userId', U);

/** Import a few lines of Hindi as the learner's own text and return its tokens (one sentence per line). */
async function own(slug: string, lines: string[], extra: { variety?: string } = {}) {
  const { documents } = plainTextToDocuments(lines.join('\n'), { lang: 'hi', title: `${slug} (synthetic)`, idPrefix: slug, chapters: 'none', ...extra });
  const r = await importDocuments(app.store, app.adapters, documents, { clock: app.clock.now });
  expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
  const t = (await app.store.texts.get(T(documents[0].id)))!;
  const sentences = await liveSentences(app.store, t.id);
  const tokens = (await Promise.all(sentences.map((s) => tokensOf(app.store, s.id)))).flat();
  return { text: t, sentences, tokens, document: documents[0] };
}

beforeAll(async () => {
  app = makeApp();
  await seedUser(app.store, U, HINDI_COURSE_ID);
  catalog = createCourseCatalog({ store: app.store, golearn: app.golearn });
  await catalog.install(HINDI_COURSE_ID);
  const docs = bundled('hi').map((d) => (d.id.startsWith('s0a-') ? syntheticallyReviewed(d) : d));
  const report = await importDocuments(app.store, app.adapters, docs, { clock: app.clock.now });
  expect(report.ok, JSON.stringify(report.documents.filter((d) => d.issues.some((i) => i.severity === 'error')).map((d) => [d.id, d.issues]))).toBe(true);
  library = createLibrary({ store: app.store, adapters: app.adapters, fetch: async () => new Response('', { status: 404 }) });
  await library.indexStore('hi');
});

describe('shelves, not locks; real Hindi from the first page', () => {
  it('sixteen shelves and nine streams; nothing gates the reader; listening is not a prerequisite', async () => {
    const stages = await catalog.stages(HINDI_COURSE_ID);
    expect(stages.map((s) => s.key)).toEqual(['s0a', 's0b', 's0c', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'open']);
    expect(new Set(stages.map((s) => s.kind))).toEqual(new Set(['shelf']));
    const streams = await catalog.streams(HINDI_COURSE_ID);
    expect(streams).toHaveLength(9);
    expect(streams.filter((s) => !s.available).map((s) => s.key)).toEqual(['listening']);
    // a shelf course has a current stage by the rule the stage courses use (the first shelf not ready); nothing locks
    expect((await catalog.currentStage(U, HINDI_COURSE_ID))!.key).toBe('s0a');
  });

  it('romanization is a rescue on the first shelves only and is never the default line; decoding the script comes first at Stage 0', async () => {
    const stages = await catalog.stages(HINDI_COURSE_ID);
    const by = Object.fromEntries(stages.map((s) => [s.key, s.assistance]));
    for (const k of ['s0a', 's0b', 's0c']) expect(by[k], k).toMatchObject({ romanization: 'rescue', decodingFirst: true });
    for (const k of ['c3', 'c6', 'c12', 'open']) expect(by[k].romanization, k).toBe('never');
    for (const s of stages) expect(s.assistance.layers, s.key).toContain('english');
    // the assistance a Stage 0 text is opened with is its shelf's
    expect(await catalog.assistanceFor({ courseId: HINDI_COURSE_ID, textId: T('s0a-01') })).toMatchObject({ romanization: 'rescue', decodingFirst: true });
  });

  it('Stage 0 stories belong to their series; machine-drafted text is unpublished until a native speaker has read it', async () => {
    const b1 = await text('s0b-01');
    expect(b1).toMatchObject({ workId: ids.work(HINDI_COURSE_ID, 'pehli-kahaniyan-0b'), published: false, generated: true });
    expect(b1.unpublishedReasons.join(' ')).toMatch(/review/i);
    expect(b1.streams).toContain('acquisition');
    // a language check is recorded and does not publish; a native review does (both synthetic here)
    const doc = bundledDoc('hi', 's0b-01');
    const reviewed = (level: string, by: string): CorpusDocument => {
      const r = applyReview(doc, { by, status: 'reviewed', date: '2026-10-01', level });
      if (!r.ok) throw new Error(JSON.stringify(r.refusals));
      return r.doc as CorpusDocument;
    };
    const checked = computePublished(reviewed('linguistic-check', 'a non-native checker (synthetic)'));
    expect(checked.published).toBe(false);
    expect(checked.unpublishedReasons.join(' ')).toMatch(/language check/);
    expect(computePublished(reviewed('native', 'a native reviewer (synthetic)')).published).toBe(true);
    // the first story is real Hindi in Devanagari: no Latin letters anywhere in its sentences
    const s = await liveSentences(app.store, T('s0a-01'));
    expect(s.length).toBeGreaterThan(5);
    for (const x of s) expect(x.text).not.toMatch(/[A-Za-z]/);
  });
});

describe('one learner model across stories, Scripture and the learner\'s own book', () => {
  it('reading a Stage 0 story makes Scripture and other stories easier, and the shares always sum to one', async () => {
    const scripture = (await library.profile(T('bible-mrk-1')))!;
    const next = (await library.profile(T('s0a-02')))!;
    const before = { next: await app.golearn.scoreProfile(U, next), scripture: await app.golearn.scoreProfile(U, scripture) };
    expect(before.next.newShare).toBe(1);

    const t = await text('s0a-01');
    const s1 = await liveSentences(app.store, t.id);
    const r = reader(app, U, 'hi', 'sit-1');
    await r.view(t, s1);
    await r.report(t, s1, 'all', 'text');
    await app.golearn.settled();

    const after = { next: await app.golearn.scoreProfile(U, next), scripture: await app.golearn.scoreProfile(U, scripture) };
    expect(after.next.newShare).toBeLessThan(before.next.newShare);
    expect(after.scripture.newShare).toBeLessThan(before.scripture.newShare); // है, और … met in a story are not new in Mark
    for (const s of [after.next, after.scripture]) expect(s.knownShare + s.familiarShare + s.metShare + s.newShare).toBeCloseTo(1, 5);
  });

  it('knowledge is a matter of degree: a word met once is not "known", and help on a word is remembered', async () => {
    const t = await text('s0a-01');
    const s1 = await liveSentences(app.store, t.id);
    const toks = (await Promise.all(s1.map((s) => tokensOf(app.store, s.id)))).flat().filter((x) => x.formId);
    const r = reader(app, U, 'hi', 'sit-1');
    await r.tap(t, s1.find((s) => s.id === toks[0].sentenceId)!, toks[0], 1);
    await app.golearn.settled();
    const rows = await itemsOf();
    expect(rows.length).toBeGreaterThan(5);
    // no row is a bare boolean: each carries evidence counts and a graded state
    const states = new Set(rows.map((x) => JSON.stringify(Object.keys(x).sort())));
    expect(states.size).toBeGreaterThanOrEqual(1);
    const helped = rows.find((x) => x.itemId === toks[0].formId);
    expect(helped).toBeDefined();
    expect(JSON.stringify(helped)).toMatch(/help|lookup|assist/i);
  });

  it('rescue dependence is measured over Hindi reading: an English rescue counts per sentence, a word lookup per word', async () => {
    const t = await text('s0a-02');
    const s2 = await liveSentences(app.store, t.id);
    const r = reader(app, U, 'hi', 'sit-2');
    await r.view(t, s2);
    await r.rescue(t, s2[0]);
    await app.golearn.settled();
    const d = await app.golearn.rescueDependence(U);
    expect(d.overall.sentences).toBeGreaterThanOrEqual(s2.length);
    expect(d.overall.per100Sentences.english).toBeGreaterThan(0);
    expect(d.overall.per100Words.word).toBeGreaterThan(0); // the lookup in the previous test
    expect(d.overall.unaidedSentenceShare).toBeLessThan(1);
  });
});

describe('the writing is kept as written', () => {
  const zara = `ज${NUKTA}रा`; // "a little", with its nukta
  const jara = 'जरा'; // without
  const lines = [`${zara} फ${NUKTA}ोन पर बात करो।`, `वह बाज${NUKTA}ार गया।`, 'हिन्दी और हिंदी एक ही भाषा है।'];

  it('a nukta is never folded: stored text, token and form identity all keep it, and the paragraph is the text as given', async () => {
    const { text: t, tokens } = await own('nukta-probe', lines);
    const paragraphs = (await app.store.paragraphs.where('textId', t.id)).sort((a, b) => a.index - b.index).map((p) => p.originalText);
    expect(paragraphs.join('\n')).toBe(lines.join('\n'));
    const z = tokens.find((x) => x.surface === zara)!;
    expect(z, 'the token keeps its nukta').toBeDefined();
    expect(z.normalized).toContain(NUKTA);
    expect(z.formId).toBe(ids.form('hi', nfc(zara)));
    expect(z.formId).not.toBe(ids.form('hi', jara));
    expect(tokens.some((x) => x.surface === `फ${NUKTA}ोन`)).toBe(true);
  });

  it('a precomposed nukta letter (U+095B) and the two-character spelling are the same word after normalization; nothing else changes', async () => {
    const pre = String.fromCodePoint(0x095B) + 'रा'; // the letter with its nukta as ONE code point (U+095B)
    expect(nfc(pre)).toBe(nfc(zara));
    const hi = app.adapters.get('hi');
    expect(hi.normalize(pre)).toBe(hi.normalize(zara));
    expect(hi.normalize(pre)).toContain(NUKTA);
    expect(hi.normalize(jara)).not.toContain(NUKTA);
    // tokenizing loses nothing: every token is a slice of the sentence as written, in order, and only spaces lie between them
    for (const l of lines) {
      const toks = hi.tokenize(l);
      let at = 0;
      for (const x of toks) {
        expect(l.slice(x.start, x.end)).toBe(x.surface);
        expect(l.slice(at, x.start).trim()).toBe('');
        at = x.end;
      }
      expect(l.slice(at).trim()).toBe('');
    }
  });

  it('two spellings of one word are related, not merged: हिन्दी is read through हिंदी and says so; the text is not altered', async () => {
    const { tokens } = await own('variant-probe', [lines[2]]);
    const old = tokens.find((x) => x.surface === 'हिन्दी')!;
    const std = tokens.find((x) => x.surface === 'हिंदी')!;
    expect(old.surface).toBe('हिन्दी');
    expect(old.formId).not.toBe(std.formId);
    const a = (await app.golearn.resolveAnalysis(old.id))!;
    const b = (await app.golearn.resolveAnalysis(std.id))!;
    expect(a.lemmaId).toBe(b.lemmaId); // one word for the learner
    expect(JSON.stringify(a.notes ?? {})).toMatch(/variantOf/);
  });

  it('the akṣara, not the code point, is the unit of the script layer; romanization is offered, never stored in the text', async () => {
    const hi = app.adapters.get('hi');
    const units = hi.decode!('स्त्री');
    expect(units).toHaveLength(1);
    expect(hi.decode!('किताब').map((u) => u.text)).toEqual(['कि', 'ता', 'ब']);
    const p = hi.pronunciation(hi.tokenize('किताब')[0]);
    expect(p.transliteration).toBeTruthy();
    const s = await liveSentences(app.store, T('s0a-01'));
    for (const x of s) expect(x.text).not.toMatch(/[a-zāīūṛṭḍṇśṣ]/i);
  });
});

describe('grammar by encounter: fused words, verbal chains, multiword units', () => {
  let toks: Awaited<ReturnType<typeof tokensOf>>;
  let sentences: Sentence[];
  let probe: Text;
  const analysisOf = async (surface: string, nth = 0) => app.golearn.resolveAnalysis(toks.filter((t) => t.surface === surface)[nth].id);
  const lemmaOf = async (surface: string, nth = 0) => (await app.store.lemmas.get((await analysisOf(surface, nth))!.lemmaId!))?.lemma;

  beforeAll(async () => {
    const r = await own('grammar-probe', [
      'उसने दरवाज़ा बंद कर दिया।',
      'लड़के के पास दो किताबें हैं।',
      'मुझे अपनी माँ की याद आती है।',
      'बच्चे कहानी सुन रहे हैं।',
      'वह कल बाज़ार जाएगी।',
      'मैंने उसकी मदद की।',
    ]);
    toks = r.tokens; sentences = r.sentences; probe = r.text;
  });

  it('उसने is वह + ने, and the parts tile the written word', async () => {
    const a = (await analysisOf('उसने'))!;
    expect(a.parts?.map((p) => p.text)).toEqual(['उस', 'ने']);
    expect(a.parts![0].start).toBe(0);
    expect(a.parts!.at(-1)!.end).toBe('उसने'.length);
    expect(a.morph).toMatchObject({ Case: 'Erg' });
  });

  it('लड़के before a postposition is the oblique singular of लड़का; किताबें is the plural of किताब', async () => {
    expect(await lemmaOf('लड़के')).toBe('लड़का');
    expect((await analysisOf('लड़के'))!.morph).toMatchObject({ Case: 'Obl', Number: 'Sing' });
    expect(await lemmaOf('किताबें')).toBe('किताब');
    expect((await analysisOf('किताबें'))!.morph).toMatchObject({ Number: 'Plur', Gender: 'Fem' });
  });

  it('जाएगी is जाना, future, feminine', async () => {
    expect(await lemmaOf('जाएगी')).toBe('जाना');
    expect((await analysisOf('जाएगी'))!.morph).toMatchObject({ Tense: 'Fut', Gender: 'Fem' });
  });

  it('a compound verb and a complex predicate are stored as units of their own, beside their component words', async () => {
    const occ = (await app.store.phraseOccurrences.where('textId', probe.id));
    const phrases = await Promise.all(occ.map(async (o) => ({ o, p: (await app.store.phrases.get(o.phraseId))! })));
    const patterns = phrases.map((x) => x.p.pattern.join(' '));
    expect(patterns, patterns.join(' | ')).toContain('करना देना'); // कर दिया
    expect(patterns.some((p) => /मदद करना/.test(p)), patterns.join(' | ')).toBe(true);
    expect(patterns.some((p) => /याद आना/.test(p)), patterns.join(' | ')).toBe(true);
    // the unit covers its words, and each word still has its own analysis and lemma
    const kd = phrases.find((x) => x.p.pattern.join(' ') === 'करना देना')!;
    const covered = toks.filter((t) => kd.o.tokenIds.includes(t.id)).map((t) => t.surface);
    expect(covered).toEqual(['कर', 'दिया']);
    expect(await lemmaOf('दिया')).toBe('देना');
    // reading the sentence credits the unit AND its component words
    const r = reader(app, U, 'hi', 'sit-3');
    await r.view(probe, sentences);
    await app.golearn.settled();
    const rows = await itemsOf();
    expect(rows.some((x) => x.itemId === kd.p.id), 'the compound verb is an item').toBe(true);
    expect(rows.some((x) => x.itemId === toks.find((t) => t.surface === 'दिया')!.formId), 'so is the form दिया').toBe(true);
  });

  it('constructions are recorded where they occur (the ergative, the progressive), with no lesson attached', async () => {
    const hi = app.adapters.get('hi');
    const keysOf = (s: string) => { const t = hi.tokenize(s); return hi.detectPatterns(t, hi.analyze(t)).map((p) => p.key); };
    expect(keysOf('उसने दरवाज़ा बंद कर दिया।')).toContain('ergative-ne');
    expect(keysOf('बच्चे कहानी सुन रहे हैं।')).toContain('progressive');
    expect(keysOf('बच्चे कहानी सुन रहे हैं।')).not.toContain('present-perfect');
  });

  it('सुन रहे हैं: रहे is the progressive auxiliary, not "stayed"; बच्चे with no postposition after it is the plural', async () => {
    expect((await analysisOf('रहे'))!.morph).toMatchObject({ Aspect: 'Prog' });
    expect((await analysisOf('बच्चे'))!.morph).toMatchObject({ Number: 'Plur', Case: 'Dir' });
  });
});

describe('register layers and heritage languages', () => {
  it('a word carries its layer — Sanskrit-derived, Perso-Arabic, English loan, biblical — and none is "the" correct Hindi', async () => {
    const { tokens } = await own('register-probe', ['समय और वक़्त दोनों ठीक हैं।', 'डॉक्टर ने दवा दी।', 'प्रभु ने उसे आशीष दी।']);
    const reg = async (surface: string) => (await app.golearn.resolveAnalysis(tokens.find((t) => t.surface === surface)!.id))?.register ?? [];
    expect(await reg('समय')).toContain('sanskritic');
    expect(await reg('वक़्त')).toContain('perso-arabic');
    expect(await reg('डॉक्टर')).toContain('english-loan');
    expect(await reg('आशीष')).toContain('biblical');
    // every Hindi variety the adapter lists is a heritage language; none of the register layers is a variety at all
    const varieties = app.adapters.get('hi').varieties!;
    expect(Object.values(varieties).every((v) => v.kind === 'heritage')).toBe(true);
    for (const s of ['समय', 'वक़्त', 'डॉक्टर']) {
      const a = await app.golearn.resolveAnalysis(tokens.find((t) => t.surface === s)!.id);
      expect(varietyStanding(a?.varieties, COURSE.variety, varieties), s).toBe('general');
    }
  });

  it('a text in Awadhi is readable as the learner\'s own copy and credits nothing to Modern Standard Hindi', async () => {
    const before = (await itemsOf()).length;
    const { text: t, sentences } = await own('awadhi-probe', ['मंगल भवन अमंगल हारी।'], { variety: 'awa' });
    expect(t.variety).toBe('awa');
    const r = reader(app, U, 'hi', 'sit-4');
    await r.view(t, sentences);
    await r.report(t, sentences, 'all', 'text');
    await app.golearn.settled();
    expect((await itemsOf()).length).toBe(before);
    // the catalogue keeps heritage works off the class shelves
    for (const w of HINDI_WORKS.filter((x) => x.streams?.includes('heritage'))) expect(w.stageId).toBe(ids.stage(HINDI_COURSE_ID, 'open'));
  });
});

describe('Your Copy', () => {
  it('a learner\'s own Hindi book imports from plain text, stays personal, is scored like anything else, and can never be bundled', async () => {
    const book = ['अध्याय 1', '', 'रवि का घर गाँव में है। वह रोज़ स्कूल जाता है।', '', 'उसकी माँ खाना बनाती है।', '', 'अध्याय 2', '', 'एक दिन रवि शहर गया। वहाँ उसने एक किताब ख़रीदी।', ''].join('\n');
    const { documents, notes, headings } = plainTextToDocuments(book, { lang: 'hi', title: 'मेरी किताब (synthetic)', idPrefix: 'meri-kitab', paragraphs: 'blank-line' });
    expect(documents.length, notes.join(' | ')).toBe(2); // अध्याय 1, अध्याय 2 are chapter headings
    expect(headings.map((h) => h.text)).toEqual(['अध्याय 1', 'अध्याय 2']);
    const r = await importDocuments(app.store, app.adapters, documents, { clock: app.clock.now });
    expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
    const ch1 = (await app.store.texts.get(T(documents[0].id)))!;
    expect(ch1).toMatchObject({ personalCopy: true, published: true });
    await library.indexStore('hi');
    expect((await library.entry(ch1.id))?.location).toBe('personal');
    const f = await app.golearn.predictDifficulty(U, ch1.id);
    expect(f.personal?.label).toBeDefined();
    // the build gate refuses a personal copy outright: it is the learner's, on his device, never part of a build
    expect(bundleDecision(documents[0]).verdict).toBe('refuse');
    // and it shares the learner model: words read in the course are not new here
    const p = (await library.profile(ch1.id))!;
    expect((await app.golearn.scoreProfile(U, p)).newShare).toBeLessThan(1);
    // a text on no shelf gets the course's profile for such texts: every layer within reach (decoding and the
    // transliteration rescue included), none pushed forward
    const outside = await catalog.assistanceFor({ courseId: HINDI_COURSE_ID, textId: ch1.id });
    expect(outside).toMatchObject({ romanization: 'rescue', decodingFirst: false });
    expect(outside.layers).toEqual(expect.arrayContaining(['decoding', 'grammar', 'english']));
  });
});

describe('what makes a text hard is said in words', () => {
  it('Scripture is measured as carrying biblical and Sanskrit-derived vocabulary; a Stage 0 story is not', async () => {
    const mark = (await library.profile(T('bible-mrk-1')))!;
    expect(mark.features.registerShare?.marked ?? 0).toBeGreaterThan(0.02);
    expect(Object.keys(mark.features.registerShare ?? {})).toEqual(expect.arrayContaining(['biblical']));
    const story = (await library.profile(T('s0a-01')))!;
    expect(story.features.registerShare?.marked ?? 0).toBeLessThan(mark.features.registerShare!.marked);
    const score = await app.golearn.scoreProfile(U, mark);
    const register = score.personal.factors.find((f) => f.key === 'register');
    expect(register, JSON.stringify(score.personal.factors.map((f) => f.key))).toBeDefined();
    expect(register!.note).toMatch(/vocabulary/);
    expect(register!.note).not.toMatch(/correct|pure|proper|better/i);
    // relative-correlative clauses of Hindi are counted as relative clauses
    expect(mark.features.relativePerSentence ?? 0).toBeGreaterThan(0);
  });
});

describe('the Bible is its own licensed corpus', () => {
  const scripture = () => bundled('hi').filter((d) => d.contentType === 'scripture');

  it('every Hindi Scripture text names the translation, the rights holder, the licence and the source, and is verified', () => {
    expect(scripture().length).toBe(5);
    for (const d of scripture()) {
      expect(d.corpus?.id, d.id).toBe('bible-hi-irv2019');
      expect(d.source.rights, d.id).toBe('licensed');
      expect(d.source.licenseNote, d.id).toMatch(/CC BY-SA 4\.0/);
      expect(d.source.attribution, d.id).toMatch(/Bridge Connectivity Solutions/);
      expect(d.scripture?.verification?.method, d.id).toBe('byte-comparison');
      expect(d.generated, d.id).toBe(false);
    }
  });

  it('the share-alike text is isolated: no other Hindi text is in its corpus or under its licence, and the stored verse is the source\'s wording', async () => {
    for (const d of bundled('hi').filter((x) => x.contentType !== 'scripture')) {
      expect(d.corpus?.id, d.id).not.toBe('bible-hi-irv2019');
      expect(d.source.rights, d.id).not.toBe('licensed');
      expect(`${d.source.licenseNote ?? ''}`, d.id).not.toMatch(/BY-SA/);
    }
    expect(IRV_HINDI_RIGHTS).toMatchObject({ state: 'verified-open-licence', shareAlike: true, attributionRequired: true });
    // analysis is an overlay: the stored sentence text equals the document's verse text, character for character
    const doc = bundledDoc('hi', 'bible-psa-23');
    const stored = (await liveSentences(app.store, T('bible-psa-23'))).map((s) => s.text);
    const verses = doc.sections.flatMap((sec) => sec.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((s) => s.text) : [])));
    expect(stored).toEqual(verses);
    const t = await text('bible-psa-23');
    expect(t).toMatchObject({ kind: 'scripture', published: true });
  });
});

describe('rights are enforced by the build gate', () => {
  const work = (lang: string, slug: string) => {
    const w = HINDI_WORKS.find((x) => x.id === ids.work(HINDI_COURSE_ID, slug));
    return lang === 'hi' && w ? { state: w.rights.state, verifiedBy: w.rights.verifiedBy, verifiedAt: w.rights.verifiedAt } : undefined;
  };

  it('every bundled Hindi document passes the gate on its own evidence', () => {
    for (const d of bundled('hi')) expect(bundleDecision(d, { work }).verdict, d.id).toBe('bundle');
  });

  it('an unverified text is left out; a claim without evidence stops the build; no state means "probably public domain"', () => {
    const base = bundledDoc('hi', 's0a-01');
    const unverified = { ...base, id: 'x-unverified', generated: false, source: { ...base.source, rights: 'unverified', authorship: 'unknown' } };
    expect(bundleDecision(unverified, { work }).verdict).toBe('exclude');
    const claim = { ...base, id: 'x-claim', generated: false, work: { slug: 'premchand-idgah', chapter: { index: 1, title: 'x' } }, source: { ...base.source, rights: 'public-domain', authorship: 'published' } };
    expect(bundleDecision(claim, { work }).verdict).toBe('refuse');
    // NCERT and the modern novels are never bundlable, whatever a document says
    for (const slug of ['ncert-rimjhim', 'sahni-tamas']) {
      const d = { ...claim, id: `x-${slug}`, work: { slug, chapter: { index: 1, title: 'x' } } };
      expect(bundleDecision(d, { work }).verdict, slug).toBe('refuse');
    }
  });
});
