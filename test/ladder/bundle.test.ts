/**
 * The browser-side ladder bundle (src/ladder/bundle.ts): units with text ids in order, in-place references resolved to the bundled
 * corpus document by path, the unit documents the bundled import adds, and the real committed ladders.
 */
import { describe, expect, it } from 'vitest';
import { bundledLadder, bundledLadderLanguages, documentWords, ladderUnitDocuments, makeLadderSource, resolveRepoPath } from '../../src/ladder/bundle';
import { loadBundledCorpus } from '../../src/ingest';

const doc = (id: string, over: Record<string, unknown> = {}) => ({
  schemaVersion: 2, id, lang: 'es', title: `T ${id}`, contentType: 'story',
  sections: [{ paragraphs: [{ sentences: [{ text: 'Hola, me llamo Sam.' }, { text: '¿Y tú?' }] }] }], ...over,
});

const ladderJson = {
  lang: 'es', version: 1, after: 'stage0',
  units: [
    { id: 'es-a1-1-01', stage: 'a1-1', kind: 'controlled', document: 'units/es-a1-1-01.json', domain: 'conversation', title: 'Meeting' },
    { id: 'es-a1-1-02', stage: 'a1-1', kind: 'controlled', document: '../../corpus/es/inplace-01.json', domain: 'narrative' },
    { id: 'es-a1-2-01', stage: 'a1-2', kind: 'controlled', document: 'units/es-a1-2-01.json', domain: 'practical' },
    { id: 'es-b1-01', stage: 'b1-bridge', kind: 'authentic', textId: 'text:es:palma-ch04', domain: 'narrative' },
    { id: 'es-a2-1-01', stage: 'a2-1', kind: 'controlled', document: '../../corpus/es/cleared-away.json', domain: 'narrative' },
  ],
};

const source = () => makeLadderSource({
  ladders: { '../../data/ladder/es/ladder.json': ladderJson, '/data/ladder/de/ladder.json': { lang: 'de', version: 1, units: [] } },
  units: {
    '../../data/ladder/es/units/es-a1-1-01.json': doc('es-a1-1-01'),
    '/data/ladder/es/units/es-a1-2-01.json': doc('es-a1-2-01'),
  },
  corpus: { '../../data/corpus/es/inplace-01.json': doc('inplace-01'), '../../data/corpus/es/cleared-away.json': null },
});

describe('bundledLadder (injected source)', () => {
  it('returns the units in ladder order with the text id of each', () => {
    const l = bundledLadder('es', source())!;
    expect(l.after).toBe('stage0');
    expect(l.units.map((u) => u.unit.id)).toEqual(['es-a1-1-01', 'es-a1-1-02', 'es-a1-2-01', 'es-b1-01', 'es-a2-1-01']);
    expect(l.units.map((u) => u.index)).toEqual([0, 1, 2, 3, 4]);
    expect(l.units[0]).toMatchObject({ textId: 'text:es:es-a1-1-01', inPlace: false });
    expect(l.units[2]).toMatchObject({ textId: 'text:es:es-a1-2-01', inPlace: false }); // glob keys with a leading slash work too
  });

  it('resolves an in-place reference to the bundled corpus document, by path', () => {
    const u = bundledLadder('es', source())!.units[1]!;
    expect(u).toMatchObject({ textId: 'text:es:inplace-01', inPlace: true });
    expect(u.doc?.id).toBe('inplace-01');
  });

  it('takes an authentic unit\'s text id from the unit itself', () => {
    expect(bundledLadder('es', source())!.units[3]).toMatchObject({ textId: 'text:es:palma-ch04', inPlace: false });
  });

  it('keeps a unit whose document is not in the bundle (a removed corpus document), without a text id and with the reason', () => {
    const u = bundledLadder('es', source())!.units[4]!;
    expect(u.textId).toBeUndefined();
    expect(u.problem).toMatch(/not in the bundle/);
  });

  it('has no ladder for a language without a file, or with a malformed one', () => {
    expect(bundledLadder('th', source())).toBeUndefined();
    expect(bundledLadder('es', makeLadderSource({ ladders: { 'data/ladder/es/ladder.json': { lang: 'de', units: [] } } }))).toBeUndefined();
    expect(bundledLadderLanguages(source())).toEqual(['de', 'es']);
  });

  it('refuses a document path that leaves the repository', () => {
    const l = bundledLadder('es', makeLadderSource({ ladders: { 'data/ladder/es/ladder.json': { lang: 'es', version: 1, units: [
      { id: 'x', stage: 'a1-1', kind: 'controlled', document: '../../../../etc/passwd', domain: 'd' },
    ] } } }))!;
    expect(l.units[0]!.textId).toBeUndefined();
    expect(l.units[0]!.problem).toMatch(/leaves the repository/);
  });
});

describe('ladderUnitDocuments (what the bundled import adds)', () => {
  it('returns the documents under units/ only, sorted, and never an in-place corpus document', () => {
    expect(ladderUnitDocuments('es', source()).map((d) => d.id)).toEqual(['es-a1-1-01', 'es-a1-2-01']);
    expect(ladderUnitDocuments('de', source())).toEqual([]);
  });

  it('does not return a document the corpus already has, a null, or a document of another language', () => {
    const s = makeLadderSource({ units: {
      'data/ladder/es/units/a.json': doc('a'), 'data/ladder/es/units/b.json': null, 'data/ladder/es/units/c.json': doc('c', { lang: 'de' }), 'data/ladder/es/units/d.json': doc('d'),
    } });
    expect(ladderUnitDocuments('es', s, [doc('a') as never]).map((d) => d.id)).toEqual(['d']);
  });
});

describe('helpers', () => {
  it('resolves paths against the ladder folder', () => {
    expect(resolveRepoPath('data/ladder/sq', '../../corpus/sq/x.json')).toBe('data/corpus/sq/x.json');
    expect(resolveRepoPath('data/ladder/sq', 'units/./a.json')).toBe('data/ladder/sq/units/a.json');
    expect(resolveRepoPath('data/ladder/sq', '../../../../x')).toBeUndefined();
    expect(resolveRepoPath('data/ladder/sq', '/etc/x')).toBeUndefined();
  });

  it('counts running words, not punctuation', () => {
    expect(documentWords(doc('x') as never)).toBe(6);
  });
});

describe('the committed ladders', () => {
  it('every language with a ladder file is found, in order, and its unit documents are not also corpus documents', () => {
    const corpus = loadBundledCorpus();
    for (const lang of bundledLadderLanguages()) {
      const l = bundledLadder(lang);
      expect(l, lang).toBeDefined();
      expect(l!.units.length).toBeGreaterThan(0);
      const own = ladderUnitDocuments(lang, undefined, corpus.filter((d) => d.lang === lang));
      const ownIds = new Set(own.map((d) => d.id));
      expect(corpus.filter((d) => d.lang === lang && ownIds.has(d.id)), `${lang}: a unit document must not also be a corpus document`).toEqual([]);
      for (const u of l!.units) if (u.textId) expect(u.textId.startsWith(`text:${lang}:`), u.unit.id).toBe(true);
      for (const d of own) expect(l!.units.some((u) => u.textId === `text:${lang}:${d.id}`), `${lang}: ${d.id} is a unit document no unit points to`).toBe(true);
    }
  });

  it('the Albanian ladder reaches the browser: its first unit is the unit file, and its Udha units are the corpus documents in place', () => {
    const l = bundledLadder('sq');
    if (!l) return; // (an Albanian ladder is not guaranteed to stay)
    const own = l.units.filter((u) => u.doc && !u.inPlace);
    expect(own.length).toBeGreaterThan(0);
    expect(own[0]!.textId).toBe(`text:sq:${own[0]!.doc!.id}`);
    for (const u of l.units.filter((x) => x.inPlace && x.doc)) {
      expect(loadBundledCorpus().some((d) => d.lang === 'sq' && d.id === u.doc!.id), u.unit.id).toBe(true);
    }
  });
});
