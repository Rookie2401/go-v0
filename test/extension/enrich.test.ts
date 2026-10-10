/** Level 2 enrichment (Linguistic Engine V2): paradigm merge with statuses, etymology never invented, pronunciation and relations from the record only. */
import { describe, expect, it } from 'vitest';
import type { LanguageAdapter } from '../../src/core';
import { cellOf, cellsWithForm, featureKey, mergeParadigm, paradigmSummary } from '../../src/core/paradigm';
import { buildParadigm, etymologyOf, pickRecord, pronunciationOf, relationsOf, sensesOf, type LexicalRecord } from '../../packages/golearn-extension/src/content/enrich';
import { sqAdapter } from '../../src/adapters/sq';

/** libër as the kaikki extract gives it (sampled 2026-10-10), cut to the keys the full record keeps. */
const LIBER: LexicalRecord = {
  w: 'libër', p: 'NOUN', s: [{ g: 'book' }],
  f: [
    { f: 'libër', t: ['indefinite', 'nominative', 'singular'], s: 'declension' }, { f: 'libri', t: ['definite', 'nominative', 'singular'], s: 'declension' },
    { f: 'libra', t: ['indefinite', 'nominative', 'plural'], s: 'declension' }, { f: 'librat', t: ['definite', 'nominative', 'plural'], s: 'declension' },
    { f: 'libër', t: ['accusative', 'indefinite', 'singular'], s: 'declension' }, { f: 'librin', t: ['accusative', 'definite', 'singular'], s: 'declension' },
  ],
  tpl: ['sq-noun-m'],
  ipa: [{ i: '/ˈlibəɾ/' }, { i: '[ˈlibəɹ]' }],
  audio: [{ u: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/85/LL-Q8748_%28sqi%29-Katerinadedej-liber.wav/LL-Q8748_%28sqi%29-Katerinadedej-liber.wav.ogg', n: 'LL-Q8748 (sqi)-Katerinadedej-liber.wav' }],
  ety: { text: 'Borrowed through Late Vulgar Latin (or Old Italian) from Latin liber.', tpl: [{ k: 'bor', lang: 'la', form: 'liber' }] },
  rel: { d: ['librari', 'librari'], r: ['letër'] },
};

/** A tag map standing in for the adapter's (the Albanian adapter gets its own in Stage 3). */
const tagMap: NonNullable<LanguageAdapter['featuresFromTableTags']> = (tags) => {
  const f: Record<string, string> = {};
  for (const t of tags) {
    if (t === 'indefinite') f.Definite = 'Ind'; if (t === 'definite') f.Definite = 'Def';
    if (t === 'nominative') f.Case = 'Nom'; if (t === 'accusative') f.Case = 'Acc';
    if (t === 'singular') f.Number = 'Sing'; if (t === 'plural') f.Number = 'Plur';
  }
  return Object.keys(f).length ? f : undefined;
};

describe('mergeParadigm', () => {
  const base = { languageId: 'sq', lemma: 'libër', pos: 'NOUN' as const, kind: 'noun-declension' as const, notes: [], sources: [] };
  it('cells both sides agree on are verified; dictionary-only are supported; rule-only are generated; a disagreement is conflicted and keeps both forms', () => {
    const p = mergeParadigm(base,
      [{ features: { Case: 'Nom', Definite: 'Def', Number: 'Sing' }, form: 'libri' }, { features: { Case: 'Acc', Definite: 'Def', Number: 'Sing' }, form: 'librin' }, { features: { Case: 'Dat', Definite: 'Def', Number: 'Sing' }, form: 'librit' }, { features: { Case: 'Nom', Definite: 'Def', Number: 'Plur' }, form: 'libërat' }],
      [{ features: { Case: 'Nom', Definite: 'Def', Number: 'Sing' }, form: 'libri' }, { features: { Case: 'Acc', Definite: 'Def', Number: 'Sing' }, form: 'librin' }, { features: { Case: 'Nom', Definite: 'Ind', Number: 'Plur' }, form: 'libra' }, { features: { Case: 'Nom', Definite: 'Def', Number: 'Plur' }, form: 'librat' }]);
    expect(paradigmSummary(p)).toEqual({ verified: 2, supported: 1, generated: 1, conflicted: 1 });
    expect(p.status).toBe('conflicted');
    const bad = cellOf(p, { Case: 'Nom', Definite: 'Def', Number: 'Plur' })!;
    expect(bad.form).toBe('librat'); // the dictionary's form is shown first
    expect(bad.alternatives).toEqual(['libërat']);
    expect(cellOf(p, { Case: 'Dat', Definite: 'Def', Number: 'Sing' })?.status).toBe('generated');
    expect(cellsWithForm(p, 'Librin').map((c) => featureKey(c.features))).toEqual(['Case=Acc|Definite=Def|Number=Sing']);
  });
});

describe('buildParadigm', () => {
  it('with no generation and a dictionary table: every cell is supported, with the note that the rules did not check it', () => {
    const adapter = { ...sqAdapter, paradigm: undefined, featuresFromTableTags: tagMap } as unknown as LanguageAdapter;
    const p = buildParadigm(adapter, 'sq', 'libër', 'NOUN', LIBER)!;
    expect(p.kind).toBe('noun-declension');
    expect(p.cells.map((c) => c.form)).toEqual(['libër', 'libri', 'libra', 'librat', 'libër', 'librin']);
    expect(p.cells.every((c) => c.status === 'supported')).toBe(true);
    expect(p.template).toBe('sq-noun-m');
    expect(p.notes.join(' ')).toMatch(/unverified by the rules/);
    expect(p.sources.map((s) => s.id)).toEqual(['wiktionary']);
  });

  it('with nothing on either side there is no paradigm (nothing is invented)', () => {
    const adapter = { ...sqAdapter, paradigm: undefined, featuresFromTableTags: undefined } as unknown as LanguageAdapter;
    expect(buildParadigm(adapter, 'sq', 'xyzzy', 'NOUN', undefined)).toBeUndefined();
    expect(buildParadigm(undefined, 'sq', 'libër', 'NOUN', LIBER)).toBeUndefined();
  });

  it('a non-inflecting language returns kind none with its constructions, no cells', () => {
    const adapter = { ...sqAdapter, paradigm: () => ({ kind: 'none' as const, cells: [], notes: ['Thai words do not inflect.'], constructions: ['aspect-particle'] }), featuresFromTableTags: undefined } as unknown as LanguageAdapter;
    const p = buildParadigm(adapter, 'th', 'กิน', 'VERB', undefined)!;
    expect(p).toMatchObject({ kind: 'none', cells: [], status: 'none', constructions: ['aspect-particle'] });
  });
});

describe('etymologyOf', () => {
  it('comes from the dictionary with its licence; the template chain is structured', () => {
    const e = etymologyOf(LIBER);
    expect(e.status).toBe('supported-by-source');
    expect(e.text).toMatch(/^Borrowed through Late Vulgar Latin/);
    expect(e.chain).toEqual([{ relation: 'borrowed', language: 'la', form: 'liber' }]);
    expect(e.source).toEqual({ label: 'Wiktionary (kaikki.org extract)', licence: 'CC BY-SA 4.0' });
  });
  it('is unknown when the record has none, and conflicted when the source itself says uncertain', () => {
    expect(etymologyOf(undefined)).toMatchObject({ status: 'unknown', chain: [] });
    expect(etymologyOf({ w: 'x', p: 'NOUN' })).toMatchObject({ status: 'unknown' });
    expect(etymologyOf({ w: 'x', p: 'NOUN', ety: { text: 'Origin uncertain; perhaps from Latin.', tpl: [{ k: 'unc' }] } })).toMatchObject({ status: 'conflicted' });
  });
});

describe('pronunciationOf and relationsOf', () => {
  it('keeps the dictionary IPA, only Wikimedia recordings, and the analyser notes, with the source named', () => {
    const p = pronunciationOf(LIBER, ['ë is a short, relaxed vowel']);
    expect(p.status).toBe('supported-by-source');
    expect(p.ipa.map((x) => x.ipa)).toEqual(['/ˈlibəɾ/', '[ˈlibəɹ]']);
    expect(p.recordings).toHaveLength(1);
    expect(p.notes).toEqual(['ë is a short, relaxed vowel']);
    expect(pronunciationOf({ w: 'x', p: 'NOUN', audio: [{ u: 'https://evil.example/a.ogg' }] }).recordings).toEqual([]);
    expect(pronunciationOf(undefined).status).toBe('unknown');
    expect(pronunciationOf(undefined, [], '/aˈblaɾ/')).toMatchObject({ status: 'provisional', ipa: [{ ipa: '/aˈblaɾ/', tags: ['from the analyser\'s rules'] }] });
  });
  it('relations and senses come from the record only', () => {
    expect(relationsOf(LIBER)).toMatchObject({ derived: ['librari', 'librari'], related: ['letër'], synonyms: [], antonyms: [] });
    expect(relationsOf(undefined).source).toBeUndefined();
    expect(sensesOf(LIBER)).toEqual([{ gloss: 'book', tags: [], examples: [] }]);
    expect(pickRecord([{ w: 'a', p: 'VERB' }, { w: 'a', p: 'NOUN' }], 'NOUN')?.p).toBe('NOUN');
  });
});
