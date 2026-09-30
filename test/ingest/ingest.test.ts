import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryStore, ids, LANGUAGES, type AppStore, type LanguageCode, type TokenAnalysis } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { CorpusValidationError, ingestAll, ingestDocument, loadBundledCorpus, type CorpusDocument } from '../../src/ingest';

const registry = createAdapterRegistry();
const clock = () => '2026-01-01T00:00:00.000Z';
const docs = loadBundledCorpus();

const sentenceTexts = (d: CorpusDocument): string[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [p.text])));

describe('ingest of the bundled corpus', () => {
  let store: AppStore;
  beforeAll(async () => {
    store = createMemoryStore();
    await ingestAll(store, registry, docs, { clock });
  });

  it('ingests all fifteen documents', async () => {
    expect(docs).toHaveLength(15);
    expect(await store.texts.count()).toBe(15);
    expect(await store.sources.count()).toBe(15);
    for (const lang of LANGUAGES) expect((await store.texts.where('lang', lang)).map((t) => t.id).sort()).toEqual(
      ['bible-1john-1', 'dialogue-01', 'story-01'].map((s) => ids.text(lang, s)).sort());
  });

  it('stores canonical sentence text exactly as authored, with offsets that round-trip', async () => {
    for (const d of docs) {
      const textId = ids.text(d.lang, d.slug);
      const stored = (await store.sentences.where('textId', textId)).sort((a, b) => a.index - b.index);
      expect(stored.map((s) => s.text), textId).toEqual(sentenceTexts(d));
      for (const s of stored) {
        expect(s.id).toBe(ids.sentence(textId, s.index));
        const toks = (await store.tokens.where('sentenceId', s.id)).sort((a, b) => a.index - b.index);
        expect(toks.length).toBeGreaterThan(0);
        for (const t of toks) {
          expect(s.text.slice(t.start, t.end)).toBe(t.surface);
          expect(t.formId).toBe(ids.form(d.lang, t.normalized));
        }
      }
    }
  });

  it('keeps scripture text unchanged and carries verse references as metadata only', async () => {
    const bibles = docs.filter((d) => d.kind === 'scripture');
    expect(bibles).toHaveLength(5);
    for (const d of bibles) {
      const textId = ids.text(d.lang, d.slug);
      const text = (await store.texts.get(textId))!;
      expect(text.kind).toBe('scripture');
      expect(text.generated).toBe(false);
      expect(text.version).toBeTruthy();
      expect(text.scripture).toEqual({ book: '1JN', chapter: 1 });
      const stored = (await store.sentences.where('textId', textId)).sort((a, b) => a.index - b.index);
      expect(stored.map((s) => s.verseRefs)).toEqual([['1JN.1.8'], ['1JN.1.9'], ['JHN.3.16']]);
      for (const s of stored) {
        expect(s.text).not.toMatch(/\d/);
        expect(s.text).not.toMatch(/[²³¹⁰⁴-⁹\[\]]/u);
      }
      const secs = (await store.sections.where('textId', textId)).sort((a, b) => a.index - b.index);
      expect(secs.map((s) => s.chapter)).toEqual([1, 3]);
    }
  });

  it('stores English rescue for every sentence with its source note', async () => {
    for (const d of docs) {
      const textId = ids.text(d.lang, d.slug);
      const sentences = await store.sentences.where('textId', textId);
      const rescues = await store.rescues.where('textId', textId);
      expect(rescues).toHaveLength(sentences.length);
      for (const r of rescues) { expect(r.english.length).toBeGreaterThan(5); expect(r.sourceNote).toBe(d.englishSource); }
    }
    const web = await store.rescues.get(ids.rescue(ids.sentence(ids.text('es', 'bible-1john-1'), 2)));
    expect(web?.english).toMatch(/^For God so loved the world/);
    expect(web?.sourceNote).toMatch(/World English Bible/);
  });

  it('is honest about rights', async () => {
    const rights = async (lang: LanguageCode, slug: string) => (await store.sources.get(`src:${lang}:${slug}`))!;
    for (const lang of LANGUAGES) {
      for (const slug of ['story-01', 'dialogue-01']) {
        const s = await rights(lang, slug);
        expect(s.rights).toBe('owner-authored');
        expect(s.licenseNote).toMatch(/native speaker/);
      }
    }
    for (const lang of ['es', 'de'] as const) {
      const s = await rights(lang, 'bible-1john-1');
      expect(s.rights).toBe('public-domain');
      expect(s.licenseNote).toMatch(/proof-checked|verify/i);
    }
    for (const lang of ['sq', 'th', 'hi'] as const) {
      const s = await rights(lang, 'bible-1john-1');
      expect(s.rights).toBe('unverified');
      expect(s.licenseNote).toMatch(/replaced|replace/i);
      expect((await store.texts.get(ids.text(lang, 'bible-1john-1')))!.version).toBe('unverified sample');
    }
    expect((await store.texts.get(ids.text('es', 'bible-1john-1')))!.version).toBe('Reina-Valera 1909');
    expect((await store.texts.get(ids.text('de', 'bible-1john-1')))!.version).toBe('Luther 1912');
  });

  it('gives the same form in story and Bible the same formId, yet distinct tokens', async () => {
    const sharedContent: Record<LanguageCode, string[]> = {
      es: ['pecado', 'dios'], de: ['sünde', 'gott'], sq: ['mëkat', 'perëndia'], th: ['บาป', 'พระเจ้า'], hi: ['पाप', 'परमेश्वर'],
    };
    for (const lang of LANGUAGES) {
      for (const word of sharedContent[lang]) {
        const formId = ids.form(lang, word);
        const toks = await store.tokens.where('formId', formId);
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
      const textId = ids.text(lang, slug);
      const out = new Set<string>();
      for (const t of await store.tokens.where('textId', textId)) {
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
      const textId = ids.text(lang, 'story-01');
      const used = new Set<string>();
      for (const t of await store.tokens.where('textId', textId)) for (const a of await store.analyses.where('tokenId', t.id)) if (a.lemmaId) used.add(a.lemmaId);
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

  it('writes analyses with analyzer, provenance and confidence; unknown words get none', async () => {
    const rows = await store.analyses.all();
    expect(rows.length).toBeGreaterThan(500);
    for (const a of rows.slice(0, 400)) {
      expect(a.analyzer).toMatch(/^adapter-(es|sq|th|hi|de)@1$/);
      expect(['lexicon', 'machine']).toContain(a.provenance);
      expect(a.confidence).toBeGreaterThan(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    }
    // ambiguous tokens keep their alternatives
    expect(rows.some((a) => (a.alternatives?.length ?? 0) > 0)).toBe(true);
    // token ids of analyses resolve to stored tokens
    const tokenIds = new Set((await store.tokens.all()).map((t) => t.id));
    for (const a of rows) expect(tokenIds.has(a.tokenId)).toBe(true);
  });

  it('records a transformation log on every text', async () => {
    for (const t of await store.texts.all()) {
      const tools = t.transformations.map((x) => x.tool);
      expect(tools).toContain('ingest@1');
      expect(tools).toContain(`adapter-${t.lang}@1`);
      expect(t.contentVersion).toBe(1);
      expect(t.importedAt).toBe(clock());
    }
  });
});

describe('re-ingest', () => {
  const doc = (): CorpusDocument => ({
    formatVersion: 1, lang: 'es', slug: 're', title: 'Re', kind: 'story',
    corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'CI' },
    source: { id: 'src:es:re', title: 'S', rights: 'owner-authored', authorship: 'human' },
    sourceNote: 'test', tags: ['t'],
    sections: [{ paragraphs: [{ sentences: [{ text: 'Dios ama al mundo.', english: 'God loves the world.' }, { text: 'Yo creo en Dios.', english: 'I believe in God.' }] }] }],
  });

  it('is idempotent: unchanged content keeps contentVersion, rows and log', async () => {
    const store = createMemoryStore();
    const a = await ingestDocument(store, registry, doc(), { clock });
    const tokens = await store.tokens.count();
    const analyses = await store.analyses.count();
    const b = await ingestDocument(store, registry, doc(), { clock: () => '2027-01-01T00:00:00.000Z' });
    expect(b.contentVersion).toBe(1);
    expect(b.importedAt).toBe(a.importedAt);
    expect(b.transformations).toEqual(a.transformations);
    expect(await store.tokens.count()).toBe(tokens);
    expect(await store.analyses.count()).toBe(analyses);
    expect(await store.texts.count()).toBe(1);
  });

  it('bumps contentVersion only when sentence text changed, and logs it', async () => {
    const store = createMemoryStore();
    await ingestDocument(store, registry, doc(), { clock });
    const meta = doc();
    meta.title = 'Renamed'; meta.tags = ['other'];
    expect((await ingestDocument(store, registry, meta, { clock })).contentVersion).toBe(1);

    const edited = doc();
    (edited.sections[0].paragraphs[0] as { sentences: { text: string }[] }).sentences[1].text = 'Yo creo en Jesús.';
    const t = await ingestDocument(store, registry, edited, { clock });
    expect(t.contentVersion).toBe(2);
    expect(t.transformations.some((x) => /sentence text changed/.test(x.description))).toBe(true);
    const s = (await store.sentences.where('textId', t.id)).sort((x, y) => x.index - y.index);
    expect(s.map((x) => x.text)).toEqual(['Dios ama al mundo.', 'Yo creo en Jesús.']);
    // stale tokens of the replaced sentence are gone
    const toks = await store.tokens.where('textId', t.id);
    expect(toks.some((x) => x.surface === 'Jesús')).toBe(true);
    expect(toks.filter((x) => x.sentenceId === s[1].id).map((x) => x.surface)).toEqual(['Yo', 'creo', 'en', 'Jesús', '.']);
    // and a second identical re-ingest does not bump again
    expect((await ingestDocument(store, registry, edited, { clock })).contentVersion).toBe(2);
  });

  it('keeps human analyses on unchanged sentences and drops them on changed ones', async () => {
    const store = createMemoryStore();
    const t0 = await ingestDocument(store, registry, doc(), { clock });
    const s0 = ids.sentence(t0.id, 0);
    const s1 = ids.sentence(t0.id, 1);
    const human = async (sentenceId: string, n: number): Promise<TokenAnalysis> => {
      const tokenId = ids.token(sentenceId, n);
      const row: TokenAnalysis = { id: `human:${tokenId}`, tokenId, lang: 'es', morph: {}, confidence: 1, provenance: 'human', analyzer: 'human:cj', createdAt: clock(), supersedes: ids.analysis(tokenId, 'adapter-es@1') };
      await store.analyses.put(row);
      return row;
    };
    const h0 = await human(s0, 0);
    const h1 = await human(s1, 0);
    const edited = doc();
    (edited.sections[0].paragraphs[0] as { sentences: { text: string }[] }).sentences[1].text = 'Yo no creo en Dios.';
    await ingestDocument(store, registry, edited, { clock });
    expect(await store.analyses.get(h0.id)).toBeTruthy();
    expect(await store.analyses.get(h1.id)).toBeUndefined();
    // machine/lexicon rows were rebuilt, not duplicated
    const forToken = await store.analyses.where('tokenId', ids.token(s0, 0));
    expect(forToken.filter((a) => a.provenance !== 'human')).toHaveLength(1);
  });
});

describe('ingest validation and paragraph modes', () => {
  it('throws CorpusValidationError and writes nothing for an invalid document', async () => {
    const store = createMemoryStore();
    const bad = { ...docs[0], sourceNote: '' } as CorpusDocument;
    await expect(ingestDocument(store, registry, bad, { clock })).rejects.toBeInstanceOf(CorpusValidationError);
    expect(await store.texts.count()).toBe(0);
    expect(await store.sentences.count()).toBe(0);
    expect(await store.sources.count()).toBe(0);
  });

  it('segments a raw paragraph with the adapter and aligns English per sentence', async () => {
    const store = createMemoryStore();
    const doc: CorpusDocument = {
      formatVersion: 1, lang: 'de', slug: 'raw', title: 'Raw', kind: 'nonfiction',
      corpus: { id: 'ci-de', kind: 'comprehensible-input', title: 'CI' },
      source: { id: 'src:de:raw', title: 'S', rights: 'owner-authored', authorship: 'human' }, sourceNote: 'test', tags: [],
      sections: [{ paragraphs: [{ text: 'Gott liebt die Welt. Ich liebe Gott auch!', english: ['God loves the world.', 'I love God too!'] }] }],
    };
    const t = await ingestDocument(store, registry, doc, { clock });
    const s = (await store.sentences.where('textId', t.id)).sort((a, b) => a.index - b.index);
    expect(s.map((x) => x.text)).toEqual(['Gott liebt die Welt.', 'Ich liebe Gott auch!']);
    expect((await store.paragraphs.where('textId', t.id))).toHaveLength(1);
    expect((await store.rescues.where('textId', t.id)).map((r) => r.english).sort()).toEqual(['God loves the world.', 'I love God too!']);

    const mismatch = structuredClone(doc);
    (mismatch.sections[0].paragraphs[0] as { english: string[] }).english = ['only one'];
    await expect(ingestDocument(createMemoryStore(), registry, mismatch, { clock })).rejects.toThrow(/adapter split/);
  });

  it('canonicalises non-NFC text and says so in the log; unknown words keep a token but no analysis', async () => {
    const store = createMemoryStore();
    const decomposed = 'Dios ama al mundo á.'; // a + combining acute → "á"
    const doc: CorpusDocument = {
      formatVersion: 1, lang: 'es', slug: 'nfc', title: 'N', kind: 'story',
      corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'CI' },
      source: { id: 'src:es:nfc', title: 'S', rights: 'owner-authored', authorship: 'human' }, sourceNote: 'test', tags: [],
      sections: [{ paragraphs: [{ sentences: [{ text: decomposed }, { text: 'Zzyzx ama.' }] }] }],
    };
    const t = await ingestDocument(store, registry, doc, { clock });
    const s = (await store.sentences.where('textId', t.id)).sort((a, b) => a.index - b.index);
    expect(s[0].text).toBe(decomposed.normalize('NFC'));
    expect(t.transformations.some((x) => /canonicalised 1/.test(x.description))).toBe(true);
    const toks = await store.tokens.where('sentenceId', s[1].id);
    const zz = toks.find((x) => x.surface === 'Zzyzx')!;
    expect(zz.isWord).toBe(true);
    expect(await store.analyses.where('tokenId', zz.id)).toEqual([]);
  });
});
