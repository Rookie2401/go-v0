import { describe, expect, it } from 'vitest';
import { createMemoryStore, type AdapterRegistry, type AnalyzedToken, type DictionaryEntry, type LexiconSource, type RawToken } from '../../src/core';
import { importDocuments, previewDocuments, validateDocument, type CorpusDocument } from '../../src/ingest';
import { clock } from './helpers';
import { CAT, SCHOOL, bareAdapter, lexiconOf, memoryLexicon, registry as realRegistry } from './book';

// Five words: ฉัน | ไป | โรงเรียน | แมว | นั่ง
const FIVE = ['ฉันไปโรงเรียน', 'แมวนั่ง'];
const words = FIVE.flatMap((t) => bareAdapter.tokenize(t).filter((t2) => t2.isWord).map((t2) => t2.normalized));
const [W1, W2, W3, W4] = words;

/** A Thai adapter whose own word list knows only the given words. */
const adapterKnowing = (known: string[]): AdapterRegistry => ({
  get: (lang) => (lang === 'th' ? {
    ...bareAdapter,
    analyze: (tokens: RawToken[]): AnalyzedToken[] => tokens.map((token) => ({
      token, analyzer: `adapter-th@${bareAdapter.version}`,
      candidates: token.isWord && known.includes(token.normalized) ? [{ lemma: token.normalized, pos: 'NOUN' as const, morph: {}, gloss: 'hand', confidence: 1 }] : [],
    })),
  } : realRegistry.get(lang)),
  all: () => realRegistry.all(),
});

const doc = (over: Partial<CorpusDocument> = {}): CorpusDocument => ({
  schemaVersion: 2, id: 'five', lang: 'th', title: 'Five words', contentType: 'story',
  corpus: { id: 'personal-th', kind: 'comprehensible-input', title: 'Your books' },
  source: { id: 'src:th:five', title: 'Five', attribution: 'x', provenance: 'a personal copy; transcription not checked.', rights: 'personal-copy', authorship: 'published' },
  review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false,
  sections: [{ paragraphs: FIVE.map((text) => ({ text })) }],
  ...over,
});
const entry = (form: string, over: Partial<DictionaryEntry> = {}): DictionaryEntry => ({ form, lang: 'th', glosses: ['x'], pos: 'NOUN', ...over });
const warning = (issues: Array<{ code: string; message: string; hint: string; severity: string }>) => issues.filter((i) => i.code === 'low-analysis-coverage');

/** Preview and result of the same document: they must agree on the figure, the counts and the warning. */
async function both(d: CorpusDocument, reg: AdapterRegistry, lexicon?: ReturnType<typeof lexiconOf>) {
  const preview = (await previewDocuments(createMemoryStore(), reg, [d], { clock, lexicon }))[0];
  const result = (await importDocuments(createMemoryStore(), reg, [d], { clock, lexicon })).documents[0];
  expect(result.analysisCoverage).toEqual(preview.analysisCoverage);
  expect(result.issues).toEqual(preview.issues);
  return { preview, result };
}

describe('premise', () => {
  it('the five words are the five words', () => {
    expect(words).toHaveLength(5);
    expect(SCHOOL + CAT).toBeTruthy();
  });
});

describe('one coverage basis: the figure and the low-coverage warning come from the same final analysis', () => {
  it('the audited case: one of five words known only to the dictionary — preview and result both say 20 %, in the figure and in the warning', async () => {
    const reg = adapterKnowing([]);
    const lexicon = lexiconOf(memoryLexicon([entry(W4)], 'kaikki-th@2026-09-28'));
    const { preview, result } = await both(doc(), reg, lexicon);
    for (const r of [preview, result]) {
      expect(r.analysisCoverage).toMatchObject({ words: 5, analysed: 1, coverage: 0.2, bySource: { adapter: 0, dictionary: 1, supplied: 0, corrected: 0 } });
      const [w] = warning(r.issues!);
      expect(w.severity).toBe('warning');
      expect(w.message).toBe("only 20% of the words have an analysis (1 of 5): 0 from the language's word list, 1 from the dictionary kaikki-th@2026-09-28, 0 supplied with the text, 0 corrected by a reviewer");
      expect(w.message).not.toMatch(/only 0%/);
      expect(w.hint).toMatch(/spans/);
      expect(w.hint).toMatch(/correction/);
      expect(w.hint).not.toMatch(/install/i); // a dictionary is installed: that remedy does not apply
      expect(warning(r.issues!)).toHaveLength(1);
    }
    expect(result.action).toBe('created'); // a warning never blocks
  });

  it('without a plan the diagnostic stays but names its scope', () => {
    const issues = validateDocument(doc(), { registry: adapterKnowing([]) }).filter((i) => i.code === 'low-analysis-coverage');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe("only 0% of the words can be analysed by the language's own word list alone (0/5; no dictionary consulted)");
  });

  it('mixed adapter + dictionary: counted by source; at 60 % or more there is no warning', async () => {
    const reg = adapterKnowing([W1]);
    const lexicon = lexiconOf(memoryLexicon([entry(W2), entry(W3), entry(W1, { pos: 'PRON' })], 'd1')); // W1 is in both: the word list counts it
    const { preview } = await both(doc(), reg, lexicon);
    expect(preview.analysisCoverage).toMatchObject({ analysed: 3, coverage: 0.6, bySource: { adapter: 1, dictionary: 2, supplied: 0, corrected: 0 } });
    expect(warning(preview.issues!)).toEqual([]);

    const less = await both(doc(), reg, lexiconOf(memoryLexicon([entry(W2)], 'd1')));
    expect(less.preview.analysisCoverage).toMatchObject({ analysed: 2, bySource: { adapter: 1, dictionary: 1, supplied: 0, corrected: 0 } });
    expect(warning(less.preview.issues!)[0].message).toBe("only 40% of the words have an analysis (2 of 5): 1 from the language's word list, 1 from the dictionary d1, 0 supplied with the text, 0 corrected by a reviewer");
  });

  it('spans supplied with the text count as analysed (and say so)', async () => {
    const t0 = bareAdapter.tokenize(FIVE[0]);
    const d = doc({ sections: [{ paragraphs: [{ sentences: [{ id: 'a', text: FIVE[0], spans: [{ start: t0[0].start, end: t0[0].end, lemma: W1, pos: 'PRON' }] }] }, { text: FIVE[1] }] }] });
    const { preview } = await both(d, adapterKnowing([]));
    expect(preview.analysisCoverage).toMatchObject({ analysed: 1, bySource: { adapter: 0, dictionary: 0, supplied: 1, corrected: 0 } });
    expect(warning(preview.issues!)[0].message).toMatch(/only 20% .*\(1 of 5\): 0 from the language's word list, 0 from the dictionary \(none installed\), 1 supplied with the text, 0 corrected/);
  });

  it('a token with a human correction counts as analysed — in the figure and in the warning', async () => {
    const t0 = bareAdapter.tokenize(FIVE[0]);
    const d = doc({ sections: [{ paragraphs: [{ sentences: [{ id: 'a', text: FIVE[0], corrections: [{ start: t0[1].start, end: t0[1].end, lemma: W2, pos: 'VERB', by: 'Khun Somchai', at: '2026-02-01' }] }] }, { text: FIVE[1] }] }] });
    const { preview } = await both(d, adapterKnowing([]));
    expect(preview.analysisCoverage).toMatchObject({ words: 5, analysed: 1, coverage: 0.2, bySource: { adapter: 0, dictionary: 0, supplied: 0, corrected: 1 } });
    expect(warning(preview.issues!)[0].message).toMatch(/only 20% .*\(1 of 5\).* 1 corrected by a reviewer/);
    // and the validator, which has no plan, agrees on the basis
    const v = validateDocument(d, { registry: adapterKnowing([]) }).find((i) => i.code === 'low-analysis-coverage')!;
    expect(v.message).toMatch(/only 20%/);
  });

  it('no dictionary installed: the hint names the dictionary among the remedies', async () => {
    const { preview } = await both(doc(), adapterKnowing([]));
    const [w] = warning(preview.issues!);
    expect(preview.analysisCoverage).toMatchObject({ analysed: 0, coverage: 0, bySource: { adapter: 0, dictionary: 0, supplied: 0, corrected: 0 } });
    expect(w.message).toBe("only 0% of the words have an analysis (0 of 5): 0 from the language's word list, 0 from the dictionary (none installed), 0 supplied with the text, 0 corrected by a reviewer");
    expect(w.hint).toMatch(/dictionary/i);
    expect(w.hint).toMatch(/spans/);
  });

  it('a dictionary that cannot be read: the text imports, coverage and warning reflect what is stored, and the report says why', async () => {
    const broken: LexiconSource = {
      lang: 'th', info: async () => ({ id: 'd1', lang: 'th', attribution: '', licence: '', entries: 1, builtAt: '', hasFrequency: false }),
      lookup: async () => { throw new Error('shard missing'); },
    };
    const { preview, result } = await both(doc(), adapterKnowing([]), lexiconOf(broken));
    for (const r of [preview, result]) {
      expect(r.note).toBe('dictionary not used: shard missing');
      expect(r.analysisCoverage).toMatchObject({ analysed: 0, coverage: 0 });
      const [w] = warning(r.issues!);
      expect(w.message).toMatch(/only 0% of the words have an analysis \(0 of 5\)/);
      expect(w.hint).toMatch(/could not be read/);
    }
    expect(result.action).toBe('created');
  });

  it('full coverage: no warning; an error still blocks the whole batch and the plan-based warning is not added to rejected documents', async () => {
    const all = adapterKnowing(words);
    const ok = await both(doc(), all);
    expect(ok.preview.analysisCoverage).toMatchObject({ coverage: 1, bySource: { adapter: 5, dictionary: 0, supplied: 0, corrected: 0 } });
    expect(warning(ok.preview.issues!)).toEqual([]);

    const bad = doc({ id: 'bad', lang: 'th', title: '' });
    const store = createMemoryStore();
    const r = await importDocuments(store, adapterKnowing([]), [doc(), bad], { clock });
    expect(r.ok).toBe(false);
    expect(await store.texts.all()).toEqual([]);
    const valid = r.documents[0];
    expect(valid.action).toBe('rejected');
    expect(warning(valid.issues)[0].message).toMatch(/by the language's own word list alone/); // no plan was made: the scope is named
  });

  it('non-Thai documents are unaffected: coverage is the same figure as before, with a source breakdown', async () => {
    const es: CorpusDocument = {
      schemaVersion: 2, id: 'es-doc', lang: 'es', title: 'T', contentType: 'story', corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'CI' },
      source: { id: 'src:t', title: 'S', attribution: 'Test', provenance: 'written for tests', rights: 'owner-authored', authorship: 'human' },
      review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false,
      sections: [{ paragraphs: [{ text: 'Hola. Gracias.' }] }],
    };
    const { preview } = await both(es, realRegistry);
    expect(preview.analysisCoverage!.analysed).toBe(preview.analysisCoverage!.words);
    expect(preview.analysisCoverage!.bySource).toMatchObject({ adapter: preview.analysisCoverage!.analysed, dictionary: 0, supplied: 0, corrected: 0 });
  });
});
