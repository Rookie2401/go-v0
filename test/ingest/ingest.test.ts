import { beforeAll, describe, expect, it } from 'vitest';
import {
  createMemoryStore, hash, ids, LANGUAGES, type AppStore, type LanguageCode, type Sentence, type TokenAnalysis,
} from '../../src/core';
import {
  CorpusValidationError, applyReview, computePublished, contentSignatureOf, importDocuments, validateDocument, ingestAll, ingestDocument, loadBundledCorpus, testimonyDocument, testimonyDocumentId,
  type CorpusDocument,
} from '../../src/ingest';
import { baseDoc, clock, countWrites, registry, scriptureDoc, snapshot } from './helpers';

const docs = loadBundledCorpus();
const clone = <T,>(x: T): T => structuredClone(x);
const sentencesOf = (d: CorpusDocument): string[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [p.text])));
const liveSentences = async (store: AppStore, textId: string) =>
  (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
const allSentences = async (store: AppStore, textId: string) => (await store.sentences.where('textId', textId)).sort((a, b) => a.index - b.index);
const emptySnapshot = { sources: [], corpora: [], texts: [], sections: [], paragraphs: [], sentences: [], tokens: [], lemmas: [], analyses: [], phrases: [], phraseOccurrences: [], patterns: [], patternOccurrences: [], rescues: [], meta: [] };

const story = (texts: Array<string | { text: string; id?: string }>, id = 'ver'): CorpusDocument => {
  const d = baseDoc();
  d.id = id;
  d.source = { ...d.source, id: `src:${id}` };
  d.sections = [{ paragraphs: [{ sentences: texts.map((t) => (typeof t === 'string' ? { text: t } : t)) }] }];
  delete d.english;
  return d;
};
const setText = (d: CorpusDocument, i: number, text: string) => { (d.sections[0].paragraphs[0] as { sentences: Array<{ text: string }> }).sentences[i].text = text; };

describe('import of the bundled corpus', () => {
  let store: AppStore;
  let report: Awaited<ReturnType<typeof importDocuments>>;
  beforeAll(async () => {
    store = createMemoryStore();
    report = await importDocuments(store, registry, docs, { clock });
  });

  it('imports all fifteen documents as created, with a per-document report', async () => {
    expect(report.ok).toBe(true);
    expect(report.documents).toHaveLength(15);
    for (const r of report.documents) {
      expect(r.action).toBe('created');
      expect(r.contentVersion).toBe(1);
      expect(r.sentencesAdded).toBeGreaterThan(0);
      expect(r.sentencesRetired).toBe(0);
      expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(r.analysisCoverage.coverage, r.id).toBeGreaterThanOrEqual(0.95);
      const t = (await store.texts.get(r.textId!))!;
      expect(t.published).toBe(r.published);
      expect(t.unpublishedReasons).toEqual(r.unpublishedReasons);
    }
    expect(await store.texts.count()).toBe(15);
    expect(await store.sources.count()).toBe(15);
    for (const lang of LANGUAGES) expect((await store.texts.where('lang', lang)).map((t) => t.id).sort()).toEqual(
      ['bible-1john-1', 'dialogue-01', 'story-01'].map((s) => ids.text(lang, s)).sort());
  });

  it('the publication gate on the stored texts: only verified es / de Scripture is published', async () => {
    const published = (await store.texts.all()).filter((t) => t.published).map((t) => t.id).sort();
    expect(published).toEqual([ids.text('de', 'bible-1john-1'), ids.text('es', 'bible-1john-1')]);
    for (const t of await store.texts.all()) {
      if (t.published) { expect(t.unpublishedReasons).toEqual([]); expect(['reviewed', 'approved']).toContain(t.reviewStatus); }
      else expect(t.unpublishedReasons.length).toBeGreaterThan(0);
      expect(t.schemaVersion).toBe(2);
    }
    const es = (await store.texts.get(ids.text('es', 'story-01')))!;
    expect(es).toMatchObject({ reviewStatus: 'unreviewed', generated: true, tags: ['mission', 'testimony'], prepTargets: ['JHN.3.16', '1JN.1.8', '1JN.1.9'] });
    expect(es.editorialTags).toEqual(['needs-native-review', 'machine-drafted']);
    const hi = (await store.texts.get(ids.text('hi', 'bible-1john-1')))!;
    expect(hi.unpublishedReasons.join(' ')).toMatch(/unverified/);
  });

  it('stores sentence text exactly as authored; ids come from stable keys; offsets and paragraphs round-trip', async () => {
    for (const d of docs) {
      const textId = ids.text(d.lang, d.id);
      const stored = await liveSentences(store, textId);
      expect(stored.map((s) => s.text), textId).toEqual(sentencesOf(d));
      const paragraphs = new Map((await store.paragraphs.where('textId', textId)).map((p) => [p.id, p]));
      const seen = new Map<string, number>();
      for (const s of stored) {
        const repeat = seen.get(s.text) ?? 0; seen.set(s.text, repeat + 1);
        expect(s.key).toBe(ids.sentenceKey(s.text, repeat));
        expect(s.id).toBe(ids.sentence(textId, s.key));
        expect(s.textHash).toBe(hash(s.text));
        expect(s.versionAdded).toBe(1);
        expect(s.retiredInVersion).toBeUndefined();
        const para = paragraphs.get(s.paragraphId)!;
        expect(para.originalText!.slice(s.paraStart, s.paraEnd)).toBe(s.text);
        const toks = (await store.tokens.where('sentenceId', s.id)).sort((a, b) => a.index - b.index);
        expect(toks.length).toBeGreaterThan(0);
        for (const t of toks) {
          expect(s.text.slice(t.start, t.end)).toBe(t.surface);
          expect(t.formId).toBe(ids.form(d.lang, t.normalized));
        }
      }
    }
  });

  it('keeps scripture text unchanged and carries verse references (and translation identity) as metadata', async () => {
    const bibles = docs.filter((d) => d.contentType === 'scripture');
    expect(bibles).toHaveLength(5);
    for (const d of bibles) {
      const textId = ids.text(d.lang, d.id);
      const text = (await store.texts.get(textId))!;
      expect(text.kind).toBe('scripture');
      expect(text.generated).toBe(false);
      expect(text.version).toBe(d.scripture!.translationName);
      expect(text.scripture).toMatchObject({ book: '1JN', chapter: 1, translationId: d.scripture!.translationId, edition: d.scripture!.edition });
      expect(!!text.scripture!.verification).toBe(d.lang === 'es' || d.lang === 'de');
      const stored = await liveSentences(store, textId);
      expect(stored.map((s) => s.verseRefs)).toEqual([['1JN.1.8'], ['1JN.1.9'], ['JHN.3.16']]);
      for (const s of stored) {
        expect(s.text).not.toMatch(/\d/);
        expect(s.text).not.toMatch(/[²³¹⁰⁴-⁹\[\]]/u);
      }
      const secs = (await store.sections.where('textId', textId)).sort((a, b) => a.index - b.index);
      expect(secs.map((s) => s.chapter)).toEqual([1, 3]);
    }
    expect((await store.texts.get(ids.text('es', 'bible-1john-1')))!.version).toBe('Reina-Valera 1909');
    expect((await store.texts.get(ids.text('de', 'bible-1john-1')))!.version).toBe('Lutherbibel 1912');
    expect((await store.texts.get(ids.text('sq', 'bible-1john-1')))!.version).toBe('unverified sample');
  });

  it('stores English rescue for every sentence with the declared source', async () => {
    for (const d of docs) {
      const textId = ids.text(d.lang, d.id);
      const sentences = await liveSentences(store, textId);
      const rescues = await store.rescues.where('textId', textId);
      expect(rescues).toHaveLength(sentences.length);
      for (const r of rescues) { expect(r.english.length).toBeGreaterThan(5); expect(r.sourceNote).toBe(d.english!.source); }
    }
    const es = (await liveSentences(store, ids.text('es', 'bible-1john-1')))[2];
    const web = await store.rescues.get(ids.rescue(es.id));
    expect(web?.english).toMatch(/^For God so loved the world/);
    expect(web?.sourceNote).toMatch(/World English Bible/);
  });

  it('is honest about rights and provenance', async () => {
    const source = async (lang: LanguageCode, slug: string) => (await store.sources.get(`src:${lang}:${slug}`))!;
    for (const lang of LANGUAGES) {
      for (const slug of ['story-01', 'dialogue-01']) {
        const s = await source(lang, slug);
        expect(s.rights).toBe('owner-authored');
        expect(s.provenance).toMatch(/native speaker/);
        expect(s.attribution).toBeTruthy();
      }
    }
    for (const lang of ['es', 'de'] as const) {
      const s = await source(lang, 'bible-1john-1');
      expect(s.rights).toBe('public-domain');
      expect(s.provenance).toMatch(/byte for byte/);
      expect(s.provenance).toMatch(/verify-scripture/);
    }
    for (const lang of ['sq', 'th', 'hi'] as const) {
      const s = await source(lang, 'bible-1john-1');
      expect(s.rights).toBe('unverified');
      expect(s.provenance).toMatch(/replaced|replace/i);
    }
  });

  it('gives the same form in story and Bible the same formId, yet distinct tokens', async () => {
    const sharedContent: Record<LanguageCode, string[]> = {
      es: ['pecado', 'dios'], de: ['sünde', 'gott'], sq: ['mëkat', 'perëndia'], th: ['บาป', 'พระเจ้า'], hi: ['पाप', 'परमेश्वर'],
    };
    for (const lang of LANGUAGES) {
      for (const word of sharedContent[lang]) {
        const toks = await store.tokens.where('formId', ids.form(lang, word));
        const inStory = toks.filter((t) => t.textId === ids.text(lang, 'story-01'));
        const inBible = toks.filter((t) => t.textId === ids.text(lang, 'bible-1john-1'));
        expect(inStory.length, `${lang} ${word} in story`).toBeGreaterThan(0);
        expect(inBible.length, `${lang} ${word} in Bible`).toBeGreaterThan(0);
        expect(new Set([...inStory, ...inBible].map((t) => t.id)).size).toBe(inStory.length + inBible.length);
      }
    }
  });

  it('shares lemmas between story and Bible (the overlap the learner loop relies on)', async () => {
    const lemmasIn = async (lang: LanguageCode, slug: string) => {
      const out = new Set<string>();
      for (const t of await store.tokens.where('textId', ids.text(lang, slug))) {
        for (const a of await store.analyses.where('tokenId', t.id)) {
          if (a.lemmaId) out.add(a.lemmaId);
          for (const alt of a.alternatives ?? []) if (alt.lemmaId) out.add(alt.lemmaId);
        }
      }
      return out;
    };
    for (const lang of LANGUAGES) {
      const story = await lemmasIn(lang, 'story-01');
      const bible = await lemmasIn(lang, 'bible-1john-1');
      const shared = [...story].filter((l) => bible.has(l) && /:(NOUN|VERB|PROPN)$/.test(l));
      expect(shared.length, `${lang}: ${shared.join(' ')}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('covers the required concepts in each story', async () => {
    const concepts: Record<LanguageCode, string[]> = {
      es: ['pecado', 'perdonar', 'entender', 'corazón', 'creer'],
      de: ['Sünde', 'vergeben', 'verstehen', 'Herz', 'glauben'],
      sq: ['mëkat', 'fal', 'kuptoj', 'zemër', 'besoj'],
      th: ['บาป', 'ยก', 'เข้าใจ', 'หัวใจ', 'เชื่อ'],
      hi: ['पाप', 'क्षमा', 'समझना', 'दिल', 'विश्वास'],
    };
    for (const lang of LANGUAGES) {
      const lemmas = await store.lemmas.where('lang', lang);
      const used = new Set<string>();
      for (const t of await store.tokens.where('textId', ids.text(lang, 'story-01'))) for (const a of await store.analyses.where('tokenId', t.id)) if (a.lemmaId) used.add(a.lemmaId);
      for (const c of concepts[lang]) {
        const l = lemmas.find((x) => x.lemma === c);
        expect(l, `${lang}: lemma ${c}`).toBeTruthy();
        expect(used.has(l!.id), `${lang}: story uses ${c}`).toBe(true);
        expect(l!.gloss).toBeTruthy();
      }
    }
  });

  it('marks the three target phrases in every story, and "believe in" also in every Bible text', async () => {
    const P: Record<LanguageCode, { young: string[]; began: string[]; believe: string[] }> = {
      es: { young: ['cuando', 'ser', 'joven'], began: ['empezar', 'a', 'entender'], believe: ['creer', 'en', '_'] },
      de: { young: ['als', '_', 'jung', 'sein'], began: ['anfangen', 'zu', 'verstehen'], believe: ['glauben', 'an', '_'] },
      sq: { young: ['kur', 'jam', 'i', 'ri'], began: ['filloj', 'të', 'kuptoj'], believe: ['besoj', 'te', '_'] },
      th: { young: ['ตอน', 'เด็ก'], began: ['เริ่ม', 'เข้าใจ'], believe: ['เชื่อ', 'ใน', '_'] },
      hi: { young: ['जब', '_', 'छोटा', 'होना'], began: ['समझना', 'लगना'], believe: ['_', 'पर', 'विश्वास'] },
    };
    for (const lang of LANGUAGES) {
      const occIn = async (slug: string, pattern: string[]) =>
        (await store.phraseOccurrences.where('phraseId', ids.phrase(lang, pattern))).filter((o) => o.textId === ids.text(lang, slug));
      for (const key of ['young', 'began', 'believe'] as const) expect((await occIn('story-01', P[lang][key])).length, `${lang} story ${key}`).toBeGreaterThan(0);
      expect((await occIn('bible-1john-1', P[lang].believe)).length, `${lang} Bible believe-in`).toBe(1);
      expect((await occIn('dialogue-01', P[lang].believe)).length, `${lang} dialogue believe-in`).toBeGreaterThan(0);
      const phrase = await store.phrases.get(ids.phrase(lang, P[lang].believe));
      expect(phrase?.kind).toBe('frame');
      expect(phrase?.gloss).toMatch(/believe|faith/);
    }
  });

  it('writes analyses with analyzer, provenance and confidence; ambiguous tokens keep alternatives', async () => {
    const rows = await store.analyses.all();
    expect(rows.length).toBeGreaterThan(500);
    for (const a of rows) {
      expect(a.analyzer).toMatch(/^adapter-(es|sq|th|hi|de)@\d+$/);
      expect(['lexicon', 'machine']).toContain(a.provenance);
      expect(a.confidence).toBeGreaterThan(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
    expect(rows.some((a) => (a.alternatives?.length ?? 0) > 0)).toBe(true);
    const tokenIds = new Set((await store.tokens.all()).map((t) => t.id));
    for (const a of rows) expect(tokenIds.has(a.tokenId)).toBe(true);
  });

  it('records a transformation log on every text (import, analyzer, review)', async () => {
    for (const t of await store.texts.all()) {
      const tools = t.transformations.map((x) => x.tool);
      expect(tools).toContain('ingest@2');
      expect(tools).toContain(`adapter-${t.lang}@${registry.get(t.lang).version}`);
      expect(tools).toContain('review');
      expect(t.contentVersion).toBe(1);
      expect(t.importedAt).toBe(clock());
      expect(t.transformations.find((x) => x.tool === 'ingest@2')!.description).toMatch(/stored exactly as supplied/);
    }
  });
});

describe('exact text preservation (no NFC, no trimming, no whitespace changes)', () => {
  const exact = (): CorpusDocument => {
    const d = baseDoc();
    d.id = 'exact';
    d.source = { ...d.source, id: 'src:exact' };
    delete d.english;
    d.sections = [{ paragraphs: [
      { sentences: [{ text: 'Dios ama á todos.' }, { text: '  Hola.  ' }, { text: 'Uno dos   tres.' }], separator: '\n' },
      { text: '  Gracias.  Hola.\n\nNo  pasa nada. ' },
    ] }];
    return d;
  };

  it('stores non-NFC, padded and irregular-whitespace sentences and paragraphs byte for byte', async () => {
    const store = createMemoryStore();
    const r = await importDocuments(store, registry, [exact()], { clock });
    expect(r.ok).toBe(true);
    // one warning for the padded declared sentence, one for the padded raw paragraph (found by corpus:prove), one for the non-NFC sentence
    expect(r.documents[0].issues.map((i) => `${i.code}@${i.path}`).sort()).toEqual([
      'edge-whitespace@sections[0].paragraphs[0].sentences[1].text',
      'edge-whitespace@sections[0].paragraphs[1].text',
      'not-nfc@sections[0].paragraphs[0].sentences[0].text',
    ]);
    const textId = ids.text('es', 'exact');
    const s = await liveSentences(store, textId);
    expect(s.map((x) => x.text)).toEqual(['Dios ama á todos.', '  Hola.  ', 'Uno dos   tres.', 'Gracias.', 'Hola.', 'No  pasa nada.']);
    const paras = (await store.paragraphs.where('textId', textId)).sort((a, b) => a.index - b.index);
    expect(paras[0].originalText).toBe('Dios ama á todos.\n  Hola.  \nUno dos   tres.');
    expect(paras[1].originalText).toBe('  Gracias.  Hola.\n\nNo  pasa nada. ');
    for (const x of s) {
      const para = paras.find((p) => p.id === x.paragraphId)!;
      expect(para.originalText!.slice(x.paraStart, x.paraEnd)).toBe(x.text);
      for (const t of await store.tokens.where('sentenceId', x.id)) expect(x.text.slice(t.start, t.end)).toBe(t.surface);
    }
    // matching uses the normalized forms only
    expect(s[0].normalizedText).toBe('dios ama á todos.');
    const toks = (await store.tokens.where('sentenceId', s[0].id)).sort((a, b) => a.index - b.index);
    const a = toks.find((t) => t.normalized === 'á')!;
    expect(a.surface).toBe('á');
    expect(a.formId).toBe('form:es:á');
    expect(s[0].textHash).toBe(hash('Dios ama á todos.')); // the hash is of the exact text
    // and the log says so
    expect((await store.texts.get(textId))!.transformations[0].description).toMatch(/3 block\(s\) not in NFC|1 block\(s\) not in NFC/);
  });

  it('a decomposed and a composed spelling are different sentences (different keys) that share token forms', async () => {
    const store = createMemoryStore();
    const d = baseDoc(); d.id = 'nfc2'; delete d.english;
    d.sections = [{ paragraphs: [{ sentences: [{ text: 'Dios ama á.' }, { text: 'Dios ama á.' }] }] }];
    await importDocuments(store, registry, [d], { clock });
    const s = await liveSentences(store, ids.text('es', 'nfc2'));
    expect(s).toHaveLength(2);
    expect(s[0].key).not.toBe(s[1].key);
    expect(s[0].normalizedText).toBe(s[1].normalizedText);
  });

  it('round-trips Thai, Hindi and German text exactly (including combining marks and ordinals)', async () => {
    const store = createMemoryStore();
    const mk = (lang: LanguageCode, id: string, text: string): CorpusDocument => {
      const d = baseDoc(); d.lang = lang; d.id = id; d.source = { ...d.source, id: `src:${id}` }; delete d.english;
      d.sections = [{ paragraphs: [{ sentences: [{ text }] }] }];
      return d;
    };
    const cases: Array<[LanguageCode, string]> = [['th', 'พระเจ้าทรงรักโลก'], ['hi', 'क़ुरबानी क्षमा नहीं है।'], ['de', 'Am 3. Mai sagte Anna: „Gott liebt die Welt“.']];
    const r = await importDocuments(store, registry, cases.map(([l, t], i) => mk(l, `rt-${i}`, t)), { clock });
    expect(r.ok).toBe(true);
    for (const [l, t] of cases) {
      const i = cases.findIndex((c) => c[0] === l);
      const s = (await liveSentences(store, ids.text(l, `rt-${i}`)))[0];
      expect(s.text).toBe(t);
      for (const tok of await store.tokens.where('sentenceId', s.id)) expect(t.slice(tok.start, tok.end)).toBe(tok.surface);
    }
  });
});

describe('atomic import', () => {
  it('a batch with one bad document imports nothing', async () => {
    const store = createMemoryStore();
    const good = story(['Dios ama al mundo.'], 'good-one');
    const bad = story(['Yo creo en Dios.'], 'bad-one');
    bad.review = { status: 'reviewed' }; // no reviewer
    const r = await importDocuments(store, registry, [good, bad], { clock });
    expect(r.ok).toBe(false);
    expect(r.documents.map((d) => d.action)).toEqual(['rejected', 'rejected']);
    expect(r.documents[0].issues).toEqual([]);
    expect(r.documents[0].note).toMatch(/all or nothing/);
    expect(r.documents[1].issues.map((i) => i.code)).toEqual(['review-missing-reviewer']);
    expect(await snapshot(store)).toEqual(emptySnapshot);
  });

  it('an injected write failure leaves no Text row, and the retry is identical to a clean import', async () => {
    const d = story(['Dios ama al mundo.', 'Yo creo en Dios.', 'Ahora tengo paz.']);
    const store = createMemoryStore();
    const orig = store.tokens.bulkPut.bind(store.tokens);
    let calls = 0;
    store.tokens.bulkPut = async (rows) => { if (++calls === 2) throw new Error('disk full'); return orig(rows); };
    await expect(importDocuments(store, registry, [d], { clock })).rejects.toThrow('disk full');
    expect(await store.texts.count()).toBe(0); // the Text row is written last
    expect(await store.meta.count()).toBe(0);
    expect(await store.sentences.count()).toBeGreaterThan(0); // partial rows exist (a memory store has no rollback)…
    store.tokens.bulkPut = orig;
    const r = await importDocuments(store, registry, [d], { clock });
    expect(r.documents[0].action).toBe('created'); // …and are cleaned by the next attempt
    const clean = createMemoryStore();
    await importDocuments(clean, registry, [d], { clock });
    expect(await snapshot(store)).toEqual(await snapshot(clean));
  });

  it('a failure while re-importing an edited text leaves the old Text row and recovers on retry', async () => {
    const d1 = story(['Dios ama al mundo.', 'Yo creo en Dios.']);
    const store = createMemoryStore();
    await importDocuments(store, registry, [d1], { clock });
    const before = await store.texts.get(ids.text('es', 'ver'));
    const d2 = clone(d1); setText(d2, 1, 'Yo no creo en Dios.');
    const orig = store.analyses.bulkPut.bind(store.analyses);
    store.analyses.bulkPut = async () => { throw new Error('quota exceeded'); };
    await expect(importDocuments(store, registry, [d2], { clock: () => '2026-02-02T00:00:00.000Z' })).rejects.toThrow('quota');
    expect(await store.texts.get(ids.text('es', 'ver'))).toEqual(before); // still version 1, still the old row
    store.analyses.bulkPut = orig;
    const r = await importDocuments(store, registry, [d2], { clock: () => '2026-02-02T00:00:00.000Z' });
    expect(r.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesAdded: 1, sentencesRetired: 1 });
    const clean = createMemoryStore();
    await importDocuments(clean, registry, [d1], { clock });
    await importDocuments(clean, registry, [d2], { clock: () => '2026-02-02T00:00:00.000Z' });
    expect(await snapshot(store)).toEqual(await snapshot(clean));
  });
});

describe('repeatable import', () => {
  it('three imports of the bundled corpus give identical rows and ids; the repeats write nothing', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, docs, { clock });
    const first = await snapshot(store);
    const textsFirst = await store.texts.all();
    const spy = countWrites(store);
    for (const at of ['2027-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z']) {
      const r = await importDocuments(store, registry, docs, { clock: () => at });
      expect(r.ok).toBe(true);
      expect(r.documents.every((d) => d.action === 'unchanged')).toBe(true);
      expect(r.documents.every((d) => d.contentVersion === 1 && d.sentencesAdded === 0 && d.sentencesRetired === 0)).toBe(true);
    }
    expect(spy.count()).toBe(0);
    expect(await snapshot(store)).toEqual(first);
    expect(await store.texts.all()).toEqual(textsFirst); // importedAt, transformations, versions untouched
  });

  it('metadata-only changes update the Text but never the content version or the sentences', async () => {
    const store = createMemoryStore();
    const d = story(['Dios ama al mundo.', 'Yo creo en Dios.']);
    await importDocuments(store, registry, [d], { clock });
    const sentences = await liveSentences(store, ids.text('es', 'ver'));
    const meta = clone(d); meta.title = 'Renamed'; meta.topics = ['mission']; meta.review = { status: 'reviewed', reviewedBy: 'Ana Ruiz', reviewedAt: '2026-03-01', contentSignature: contentSignatureOf(d) };
    const r = await importDocuments(store, registry, [meta], { clock: () => '2026-03-02T00:00:00.000Z' });
    expect(r.documents[0]).toMatchObject({ action: 'updated', contentVersion: 1, sentencesAdded: 0, sentencesRetired: 0, published: true });
    const t = (await store.texts.get(ids.text('es', 'ver')))!;
    expect(t).toMatchObject({ title: 'Renamed', tags: ['mission'], reviewStatus: 'reviewed', published: true, contentVersion: 1 });
    expect(t.transformations.filter((x) => x.tool === 'review')).toHaveLength(2);
    expect(await liveSentences(store, t.id)).toEqual(sentences);
  });
});

describe('review binding at import', () => {
  it('a revision of a reviewed text is unpublished until it is reviewed again', async () => {
    const store = createMemoryStore();
    const d = story(['Dios ama al mundo.', 'Yo creo en Dios.']);
    const reviewed = applyReview(d, { by: 'Ana Ruiz', date: '2026-03-01' });
    if (!reviewed.ok) throw new Error('refused');
    expect((await importDocuments(store, registry, [reviewed.doc], { clock })).documents[0]).toMatchObject({ action: 'created', published: true });

    const revised = clone(reviewed.doc);
    (revised.sections[0].paragraphs[0] as { sentences: Array<{ text: string }> }).sentences[1].text = 'Yo creo en Jesús.';
    const warn = validateDocument(revised, { registry }).find((i) => i.code === 'review-signature-mismatch');
    expect(warn).toMatchObject({ severity: 'warning', path: 'review.contentSignature' });
    expect(warn!.hint).toMatch(/corpus:review/);
    const r2 = (await importDocuments(store, registry, [revised], { clock })).documents[0];
    expect(r2).toMatchObject({ action: 'updated', contentVersion: 2, published: false });
    expect(r2.unpublishedReasons).toEqual(['the text changed after it was reviewed — record a new review (npm run corpus:review)']);
    expect((await store.texts.get(ids.text('es', 'ver')))!.published).toBe(false);

    const again = applyReview(revised, { by: 'Ana Ruiz', date: '2026-03-02' });
    if (!again.ok) throw new Error('refused');
    expect(validateDocument(again.doc, { registry }).some((i) => i.code === 'review-signature-mismatch')).toBe(false);
    expect((await importDocuments(store, registry, [again.doc], { clock })).documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, published: true });
  });

  it('a metadata-only edit (title, English, topics) keeps the review valid', () => {
    const d = story(['Dios ama al mundo.']);
    const reviewed = applyReview(d, { by: 'Ana Ruiz', date: '2026-03-01' });
    if (!reviewed.ok) throw new Error('refused');
    const meta = clone(reviewed.doc); meta.title = 'Another title'; meta.topics = ['mission'];
    expect(computePublished(meta).published).toBe(true);
    expect(validateDocument(meta, { registry }).some((i) => i.code === 'review-signature-mismatch')).toBe(false);
  });
});

describe('content versioning', () => {
  const base = () => story(['Dios ama al mundo.', 'Yo creo en Dios.', 'Ahora tengo paz.']);

  it('an edit retires the old sentence, bumps the version, keeps unchanged sentences, human corrections and encounters', async () => {
    const store = createMemoryStore();
    const textId = ids.text('es', 'ver');
    const d1 = base(); (d1.sections[0].paragraphs[0] as { sentences: Array<{ english?: string }> }).sentences.forEach((s, i) => { s.english = `en ${i}`; });
    d1.english = { source: 'test' };
    await importDocuments(store, registry, [d1], { clock });
    const [a0, b0, c0] = await liveSentences(store, textId);
    const tokensA = (await store.tokens.where('sentenceId', a0.id)).sort((x, y) => x.index - y.index);

    const human = async (sentenceId: string, n: number): Promise<TokenAnalysis> => {
      const tokenId = ids.token(sentenceId, n);
      const row: TokenAnalysis = { id: `human:${tokenId}`, tokenId, lang: 'es', morph: {}, confidence: 1, provenance: 'human', analyzer: 'human:cj', createdAt: clock(), supersedes: ids.analysis(tokenId, 'adapter-es@1') };
      await store.analyses.put(row);
      return row;
    };
    const hA = await human(a0.id, 0);
    const hB = await human(b0.id, 0);
    const encounter = { id: 'enc-1', userId: 'u1', lang: 'es', itemId: 'form:es:creo', sentenceId: b0.id, textId, evidenceKind: 'exposure' };
    await store.encounters.put(encounter as never);
    await store.events.put({ id: 'ev-1', type: 'SentenceViewed', userId: 'u1', sentenceId: b0.id } as never);

    const d2 = base(); setText(d2, 1, 'Yo no creo en Dios.');
    (d2.sections[0].paragraphs[0] as { sentences: Array<{ english?: string }> }).sentences.forEach((s, i) => { s.english = `en ${i}`; });
    d2.english = { source: 'test' };
    const r = await importDocuments(store, registry, [d2], { clock: () => '2026-02-01T00:00:00.000Z' });
    expect(r.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesAdded: 1, sentencesRetired: 1 });

    const text = (await store.texts.get(textId))!;
    expect(text.contentVersion).toBe(2);
    expect(text.transformations.some((x) => /sentence text changed/.test(x.description))).toBe(true);
    const all = await allSentences(store, textId);
    expect(all).toHaveLength(4);
    const live = await liveSentences(store, textId);
    expect(live.map((s) => s.text)).toEqual(['Dios ama al mundo.', 'Yo no creo en Dios.', 'Ahora tengo paz.']);
    // unchanged sentences keep their ids, version and tokens
    expect(live[0]).toEqual(a0);
    expect(live[2].id).toBe(c0.id);
    expect(live[2].index).toBe(2);
    expect((await store.tokens.where('sentenceId', a0.id)).sort((x, y) => x.index - y.index)).toEqual(tokensA);
    // the edited sentence is a new sentence; the old one is retired, not deleted, and keeps its last index
    expect(live[1].id).not.toBe(b0.id);
    expect(live[1].versionAdded).toBe(2);
    const retired = (await store.sentences.get(b0.id))!;
    expect(retired.retiredInVersion).toBe(2);
    expect(retired.index).toBe(1);
    expect(retired.text).toBe('Yo creo en Dios.');
    expect((await store.tokens.where('sentenceId', b0.id)).length).toBeGreaterThan(0); // history stays interpretable
    expect(await store.rescues.get(ids.rescue(b0.id))).toBeUndefined(); // nothing retired is offered to a learner
    expect((await store.rescues.get(ids.rescue(live[1].id)))?.english).toBe('en 1');
    expect((await store.tokens.where('sentenceId', live[1].id)).map((t) => t.surface)).toEqual(['Yo', 'no', 'creo', 'en', 'Dios', '.']);
    // human corrections survive on the unchanged sentence; the retired sentence's stay as history; the new one starts clean
    expect(await store.analyses.get(hA.id)).toEqual(hA);
    expect(await store.analyses.get(hB.id)).toEqual(hB);
    expect((await store.analyses.where('tokenId', ids.token(live[1].id, 0))).filter((x) => x.provenance === 'human')).toEqual([]);
    // machine rows of the unchanged sentence were not duplicated
    expect((await store.analyses.where('tokenId', ids.token(a0.id, 0))).filter((x) => x.provenance !== 'human')).toHaveLength(1);
    // encounters and events are never touched
    expect(await store.encounters.get('enc-1')).toEqual(encounter);
    expect((await store.events.get('ev-1'))!.id).toBe('ev-1');
    // the same edited document again is a no-op
    const spy = countWrites(store);
    const again = await importDocuments(store, registry, [d2], { clock: () => '2026-03-01T00:00:00.000Z' });
    expect(again.documents[0].action).toBe('unchanged');
    expect(spy.count()).toBe(0);
    expect((await store.texts.get(textId))!.contentVersion).toBe(2);
  });

  it('reordering bumps the version without creating or retiring sentences; reverting an edit revives the retired sentence', async () => {
    const store = createMemoryStore();
    const textId = ids.text('es', 'ver');
    await importDocuments(store, registry, [base()], { clock });
    const [a, b, c] = await liveSentences(store, textId);
    const swapped = story(['Ahora tengo paz.', 'Yo creo en Dios.', 'Dios ama al mundo.']);
    const r1 = await importDocuments(store, registry, [swapped], { clock });
    expect(r1.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesAdded: 0, sentencesRetired: 0 });
    expect((await liveSentences(store, textId)).map((s) => s.id)).toEqual([c.id, b.id, a.id]);
    expect(await store.sentences.count()).toBe(3);

    const edited = base(); setText(edited, 1, 'Yo no creo en Dios.');
    await importDocuments(store, registry, [edited], { clock });
    const r3 = await importDocuments(store, registry, [base()], { clock });
    expect(r3.documents[0]).toMatchObject({ action: 'updated', sentencesAdded: 1, sentencesRetired: 1 });
    const live = await liveSentences(store, textId);
    expect(live.map((s) => s.id)).toEqual([a.id, b.id, c.id]); // the original sentence came back under its own id
    expect(live[1].retiredInVersion).toBeUndefined();
    expect(await store.sentences.count()).toBe(4); // plus the retired "no creo" sentence
  });

  it('duplicate sentences get distinct keys (~n) and stay stable', async () => {
    const store = createMemoryStore();
    const d = story(['Hola.', 'Hola.', 'Hola.']);
    await importDocuments(store, registry, [d], { clock });
    const s = await liveSentences(store, ids.text('es', 'ver'));
    expect(s.map((x) => x.key)).toEqual([ids.sentenceKey('Hola.', 0), ids.sentenceKey('Hola.', 1), ids.sentenceKey('Hola.', 2)]);
    expect(new Set(s.map((x) => x.id)).size).toBe(3);
    const r = await importDocuments(store, registry, [d], { clock });
    expect(r.documents[0].action).toBe('unchanged');
  });

  it('author sentence ids are the stable keys; an edit keeps the id family (id@version) and retires the old one', async () => {
    const store = createMemoryStore();
    const textId = ids.text('es', 'ver');
    const mk = (t2: string) => story([{ id: 's1', text: 'Dios ama al mundo.' }, { id: 's2', text: t2 }]);
    await importDocuments(store, registry, [mk('Yo creo en Dios.')], { clock });
    expect((await liveSentences(store, textId)).map((s) => s.id)).toEqual([ids.sentence(textId, 's1'), ids.sentence(textId, 's2')]);

    await importDocuments(store, registry, [mk('Yo no creo en Dios.')], { clock });
    let live = await liveSentences(store, textId);
    expect(live.map((s) => s.key)).toEqual(['s1', 's2@2']);
    expect((await store.sentences.get(ids.sentence(textId, 's2')))!.retiredInVersion).toBe(2);

    await importDocuments(store, registry, [mk('Ahora creo en Dios.')], { clock });
    live = await liveSentences(store, textId);
    expect(live.map((s) => s.key)).toEqual(['s1', 's2@3']);
    // reverting to the original wording revives the original sentence
    await importDocuments(store, registry, [mk('Yo creo en Dios.')], { clock });
    live = await liveSentences(store, textId);
    expect(live.map((s) => s.key)).toEqual(['s1', 's2']);
    expect(live[1].retiredInVersion).toBeUndefined();
    expect((await store.texts.get(textId))!.contentVersion).toBe(4);
  });

  it('legacy rows from contract v1 (no key) are retired and replaced on the first re-import', async () => {
    const store = createMemoryStore();
    const textId = ids.text('es', 'ver');
    await store.texts.put({
      id: textId, corpusId: 'ci-es', lang: 'es', kind: 'story', title: 'T', sourceId: 'src:ver', importedAt: '2025-01-01T00:00:00.000Z', tags: [], editorialTags: [],
      prepTargets: [], reviewStatus: 'unreviewed', published: false, unpublishedReasons: [], schemaVersion: 1, generated: false, transformations: [], contentVersion: 1,
    });
    await store.sentences.put({ id: `${textId}/s0`, textId, paragraphId: `${textId}/p0`, lang: 'es', index: 0, text: 'Hola.', normalizedText: 'hola.', textHash: hash('Hola.') } as unknown as Sentence);
    await store.tokens.put({ id: `${textId}/s0/t0`, sentenceId: `${textId}/s0`, textId, lang: 'es', index: 0, surface: 'Hola', start: 0, end: 4, normalized: 'hola', formId: 'form:es:hola', isWord: true });
    const r = await importDocuments(store, registry, [story(['Hola.'])], { clock });
    expect(r.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesAdded: 1, sentencesRetired: 1 });
    const legacy = (await store.sentences.get(`${textId}/s0`))!;
    expect(legacy.retiredInVersion).toBe(2);
    expect(legacy.versionAdded).toBe(1);
    const live = await liveSentences(store, textId);
    expect(live).toHaveLength(1);
    expect(live[0].key).toBe(ids.sentenceKey('Hola.'));
    expect((await store.texts.get(textId))!.schemaVersion).toBe(2);
  });
});

describe('author analysis: spans and corrections', () => {
  const withSpans = (extra: { spans?: unknown[]; corrections?: unknown[] }): CorpusDocument =>
    story([{ text: 'Dios ama al mundo.', ...extra } as never], 'spans');

  it('spans are stored as lexicon analyses by import@2 (replacing the adapter row); corrections as human rows superseding', async () => {
    const store = createMemoryStore();
    const textId = ids.text('es', 'spans');
    const d = withSpans({
      spans: [{ start: 0, end: 4, lemma: 'Dios', pos: 'PROPN', gloss: 'God the Father' }],
      corrections: [{ start: 5, end: 8, lemma: 'amar', pos: 'VERB', gloss: 'loves', by: 'Ana Ruiz', at: '2026-02-01' }],
    });
    const r = await importDocuments(store, registry, [d], { clock });
    expect(r.ok).toBe(true);
    const s = (await liveSentences(store, textId))[0];
    const t0 = (await store.analyses.where('tokenId', ids.token(s.id, 0)));
    expect(t0).toHaveLength(1);
    expect(t0[0]).toMatchObject({ analyzer: 'import@2', provenance: 'lexicon', confidence: 1, gloss: 'God the Father', pos: 'PROPN' });
    const t1 = await store.analyses.where('tokenId', ids.token(s.id, 1));
    const human = t1.find((x) => x.provenance === 'human')!;
    const machine = t1.find((x) => x.provenance !== 'human')!;
    expect(human).toMatchObject({ analyzer: 'human:Ana Ruiz', createdAt: '2026-02-01', gloss: 'loves', supersedes: machine.id, lemmaId: ids.lemma('es', 'amar', 'VERB') });
    expect((await store.lemmas.get(ids.lemma('es', 'Dios', 'PROPN')))!.gloss).toBeUndefined(); // the contextual gloss never becomes the lemma's dictionary gloss
    // unchanged → no writes
    const spy = countWrites(store);
    expect((await importDocuments(store, registry, [d], { clock })).documents[0].action).toBe('unchanged');
    expect(spy.count()).toBe(0);
    // removing the span restores the adapter analysis; the human correction is never deleted by an import
    const d2 = withSpans({ corrections: d.sections[0].paragraphs[0] && (d.sections[0].paragraphs[0] as { sentences: Array<{ corrections: unknown[] }> }).sentences[0].corrections });
    const r2 = await importDocuments(store, registry, [d2], { clock });
    expect(r2.documents[0].action).toBe('updated');
    expect(r2.documents[0].contentVersion).toBe(1);
    const back = await store.analyses.where('tokenId', ids.token(s.id, 0));
    expect(back.map((x) => x.analyzer)).toEqual(['adapter-es@1']);
    const d3 = withSpans({});
    await importDocuments(store, registry, [d3], { clock });
    expect((await store.analyses.get(human.id))?.provenance).toBe('human');
  });
});

describe('verse ↔ sentence is many-to-many', () => {
  it('a sentence may carry several verses and several sentences may share one', async () => {
    const store = createMemoryStore();
    const d = scriptureDoc();
    d.id = 'm2m';
    d.source = { ...d.source, id: 'src:m2m' };
    d.sections = [{ chapter: 3, paragraphs: [{ sentences: [
      { text: 'Porque de tal manera amó Dios al mundo.', verseRefs: ['JHN.3.16', 'JHN.3.17'] },
      { text: 'Dios no envió a su Hijo.', verseRefs: ['JHN.3.17'] },
      { text: 'Para que el mundo sea salvo.', verseRefs: ['JHN.3.17'] },
    ] }] }];
    const r = await importDocuments(store, registry, [d], { clock });
    expect(r.ok).toBe(true);
    const s = await liveSentences(store, ids.text('es', 'm2m'));
    expect(s.map((x) => x.verseRefs)).toEqual([['JHN.3.16', 'JHN.3.17'], ['JHN.3.17'], ['JHN.3.17']]);
    const forVerse = (ref: string) => s.filter((x) => x.verseRefs?.includes(ref)).length;
    expect(forVerse('JHN.3.16')).toBe(1);
    expect(forVerse('JHN.3.17')).toBe(3);
  });
});

describe('paragraph modes and the wrappers', () => {
  it('segments a raw paragraph with the adapter, aligns English per sentence and records offsets', async () => {
    const store = createMemoryStore();
    const d = baseDoc(); d.lang = 'de'; d.id = 'raw'; d.contentType = 'nonfiction';
    d.corpus = { id: 'ci-de', kind: 'comprehensible-input', title: 'CI' };
    d.source = { ...d.source, id: 'src:raw' };
    d.sections = [{ paragraphs: [{ text: 'Gott liebt die Welt. Ich liebe Gott auch!', english: ['God loves the world.', 'I love God too!'] }] }];
    const t = await ingestDocument(store, registry, d, { clock });
    const s = await liveSentences(store, t.id);
    expect(s.map((x) => x.text)).toEqual(['Gott liebt die Welt.', 'Ich liebe Gott auch!']);
    expect(s.map((x) => [x.paraStart, x.paraEnd])).toEqual([[0, 20], [21, 41]]);
    expect(await store.paragraphs.where('textId', t.id)).toHaveLength(1);
    expect((await store.rescues.where('textId', t.id)).map((r) => r.english).sort()).toEqual(['God loves the world.', 'I love God too!']);
  });

  it('ingestDocument / ingestAll reject an invalid document with a CorpusValidationError and write nothing', async () => {
    const store = createMemoryStore();
    const bad = { ...baseDoc(), review: { status: 'reviewed' as const } };
    const err = await ingestDocument(store, registry, bad, { clock }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CorpusValidationError);
    expect((err as CorpusValidationError).issues.map((i) => i.code)).toEqual(['review-missing-reviewer']);
    expect((err as CorpusValidationError).problems[0]).toMatch(/review.reviewedBy/);
    await expect(ingestAll(store, registry, [baseDoc(), bad], { clock })).rejects.toBeInstanceOf(CorpusValidationError);
    expect(await snapshot(store)).toEqual(emptySnapshot);
    // the old one-document-per-ingest contract: the stored Text comes back
    const ok = await ingestAll(store, registry, [baseDoc()], { clock });
    expect(ok.map((t) => t.id)).toEqual(['text:es:test-doc']);
  });

  it('refuses to overwrite a text that belongs to another source', async () => {
    const store = createMemoryStore();
    await ingestDocument(store, registry, baseDoc(), { clock });
    const other = baseDoc(); other.source = { ...other.source, id: 'src:someone-else' };
    const r = await importDocuments(store, registry, [other], { clock });
    expect(r.ok).toBe(false);
    expect(r.documents[0].issues.map((i) => i.code)).toEqual(['text-id-conflict']);
  });

  it('unknown words keep a token but no analysis', async () => {
    const store = createMemoryStore();
    const t = await ingestDocument(store, registry, story(['Dios ama á.', 'Zzyzx ama.'], 'unk'), { clock });
    const s = await liveSentences(store, t.id);
    const zz = (await store.tokens.where('sentenceId', s[1].id)).find((x) => x.surface === 'Zzyzx')!;
    expect(zz.isWord).toBe(true);
    expect(await store.analyses.where('tokenId', zz.id)).toEqual([]);
  });
});

describe('testimonyDocument (the private Text GoTell materializes)', () => {
  it('ingests through the normal pipeline: kind testimony, user-private, published, sentences exact', async () => {
    const store = createMemoryStore();
    const sentences = ['Yo creo en Dios.', 'Dios me perdonó.'];
    const t = await ingestDocument(store, registry, testimonyDocument({ userId: 'u1', lang: 'es', n: 1, sentences, acceptedAt: '2026-01-01T00:00:00.000Z' }), { clock });
    expect(t.id).toBe(ids.text('es', testimonyDocumentId('u1', 1)));
    expect(t.id).toBe('text:es:testimony-u1-r1');
    expect(t).toMatchObject({ kind: 'testimony', corpusId: 'testimony:u1', published: true, reviewStatus: 'approved', generated: false, schemaVersion: 2 });
    expect((await liveSentences(store, t.id)).map((s) => s.text)).toEqual(sentences);
    expect(await store.sources.get('src:testimony:u1')).toMatchObject({ rights: 'user-private', authorship: 'learner' });
    expect(await store.corpora.get('testimony:u1')).toMatchObject({ kind: 'testimony' });
    // accepting the same revision again is a no-op; another revision is another Text
    const again = await importDocuments(store, registry, [testimonyDocument({ userId: 'u1', lang: 'es', n: 1, sentences, acceptedAt: '2026-01-01T00:00:00.000Z' })], { clock });
    expect(again.documents[0].action).toBe('unchanged');
    const t2 = await ingestDocument(store, registry, testimonyDocument({ userId: 'u1', lang: 'es', n: 2, sentences: [...sentences, 'Ahora tengo paz.'] }), { clock });
    expect(t2.id).toBe('text:es:testimony-u1-r2');
    expect(await store.texts.count()).toBe(2);
  });

  it('never rejects a learner draft: odd user ids, mixed languages and repeated sentences all import', async () => {
    const store = createMemoryStore();
    const t = await ingestDocument(store, registry, testimonyDocument({ userId: 'User Name!', lang: 'th', n: 3, sentences: ['Hello world', 'Hello world', 'ฉันเชื่อในพระเจ้า'] }), { clock });
    expect(t.id).toMatch(/^text:th:testimony-user-name-[0-9a-f]{6}-r3$/);
    expect(await liveSentences(store, t.id)).toHaveLength(3);
    expect(t.kind).toBe('testimony');
  });
});
