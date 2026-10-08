/**
 * Concept families (nb <-> nn): one shared table, each member from its own adapter, members never share an item id, relate() never
 * merges the standards. The table is MACHINE-DRAFTED (recon 1, B10 and the strong-verb table B4), pending native review.
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { ConceptFamily, LanguageAdapter } from '../../src/core';
import { FAMILY_ROW_COUNT, familyRows } from '../../src/adapters/norwegian/families';
import { adapter } from './helpers';

const nb = adapter('nb');
const nn = adapter('nn');
const fam = (ad: LanguageAdapter, lemma: string, pos?: Parameters<NonNullable<LanguageAdapter['family']>>[1]): ConceptFamily | undefined => ad.family?.(lemma, pos);

describe('concept families', () => {
  it('jeg and eg are one family; each member keeps its own language and lemma', () => {
    const f = fam(nb, 'jeg', 'PRON')!;
    expect(f.members).toEqual(expect.arrayContaining([{ lang: 'nb', lemma: 'jeg', pos: 'PRON' }, { lang: 'nn', lemma: 'eg', pos: 'PRON' }]));
    const g = fam(nn, 'eg', 'PRON')!;
    expect(g.id).toBe(f.id);
    expect(g.members).toEqual(f.members);
    expect(f.meaning).toBeTruthy();
  });

  it('members never share an item id', () => {
    const f = fam(nb, 'ikke')!;
    const lemmaIds = f.members.map((m) => ids.lemma(m.lang, m.lemma, m.pos));
    expect(new Set(lemmaIds).size).toBe(lemmaIds.length);
    const formIds = f.members.map((m) => ids.form(m.lang, m.lemma));
    expect(new Set(formIds).size).toBe(formIds.length);
    // even a word spelled the same in both standards (hus) is two items
    const h = fam(nb, 'hus', 'NOUN')!;
    expect(h.members.map((m) => m.lang).sort()).toEqual(['nb', 'nn']);
    expect(new Set(h.members.map((m) => ids.lemma(m.lang, m.lemma, m.pos))).size).toBe(2);
  });

  it('the table of recon B10: the main Bokmål / Nynorsk pairs', () => {
    const pairs: Array<[string, string, string]> = [
      ['ikke', 'ikkje', 'ADV'], ['hun', 'ho', 'PRON'], ['hva', 'kva', 'PRON'], ['hvem', 'kven', 'PRON'], ['hvorfor', 'kvifor', 'ADV'], ['hvordan', 'korleis', 'ADV'],
      ['noen', 'nokon', 'DET'], ['noe', 'noko', 'PRON'], ['mye', 'mykje', 'ADV'], ['bare', 'berre', 'ADV'], ['fra', 'frå', 'ADP'], ['mens', 'medan', 'SCONJ'],
      ['uke', 'veke', 'NOUN'], ['måned', 'månad', 'NOUN'], ['gang', 'gong', 'NOUN'], ['øye', 'auge', 'NOUN'], ['hode', 'hovud', 'NOUN'], ['gutt', 'gut', 'NOUN'],
      ['melk', 'mjølk', 'NOUN'], ['vei', 'veg', 'NOUN'], ['gammel', 'gammal', 'ADJ'], ['dårlig', 'dårleg', 'ADJ'], ['være', 'vere', 'AUX'], ['gjøre', 'gjere', 'VERB'], ['komme', 'kome', 'VERB'],
      ['se', 'sjå', 'VERB'], ['si', 'seie', 'VERB'], ['høre', 'høyre', 'VERB'], ['spørre', 'spørje', 'VERB'], ['bo', 'bu', 'VERB'], ['tro', 'tru', 'VERB'], ['la', 'late', 'VERB'], ['kjøre', 'køyre', 'VERB'],
    ];
    for (const [b, n, pos] of pairs) {
      const f = fam(nb, b, pos as never);
      expect(f, b).toBeDefined();
      expect(f!.members.some((m) => m.lang === 'nn' && m.lemma === n), `${b} <-> ${n}`).toBe(true);
      const back = fam(nn, n, pos as never);
      expect(back?.id, `${n} back`).toBe(f!.id);
    }
  });

  it('several Nynorsk members for one Bokmål word (hvis: viss, dersom)', () => {
    const f = fam(nb, 'hvis', 'SCONJ')!;
    expect(f.members.filter((m) => m.lang === 'nn').map((m) => m.lemma).sort()).toEqual(['dersom', 'viss']);
  });

  it('a word that is in only one list, or in neither, has no family', () => {
    expect(fam(nb, 'xyzzy')).toBeUndefined();
    expect(fam(nn, 'xyzzy')).toBeUndefined();
  });

  it('relate() never merges the standards: jeg / eg is none; boka / boken and kastet / kasta are inflections', () => {
    expect(nb.relate('jeg', 'eg')).toBe('none');
    expect(nn.relate('jeg', 'eg')).toBe('none');
    expect(nb.relate('ikke', 'ikkje')).toBe('none');
    expect(nb.relate('boka', 'boken')).toBe('inflection');
    expect(nb.relate('kastet', 'kasta')).toBe('inflection');
    expect(nb.relate('husene', 'husa')).toBe('inflection');
    expect(nn.relate('kasta', 'kastar')).toBe('inflection');
    expect(nb.relate('bil', 'bil')).toBe('same');
    expect(nb.relate('bil', 'hus')).toBe('none');
  });

  it('every family row names a Bokmål and a Nynorsk lemma and a meaning, and the table is large enough', () => {
    expect(FAMILY_ROW_COUNT).toBeGreaterThan(150);
    for (const r of familyRows()) {
      expect(r.nb, JSON.stringify(r)).toBeTruthy();
      expect(r.nn.length, r.nb).toBeGreaterThan(0);
      expect(r.meaning, r.nb).toBeTruthy();
    }
  });

  it('the production check uses the same table: the Nynorsk member is replaced by the Bokmål one', () => {
    const t = 'Eg har ikkje tid.';
    const toks = nb.tokenize(t);
    const errs = nb.checkProduction(toks, nb.analyze(toks), t);
    const rep = errs.map((e) => [t.slice(e.suggestion!.start, e.suggestion!.end), e.suggestion!.replacement]);
    expect(rep).toEqual([['Eg', 'Jeg'], ['ikkje', 'ikke']]);
  });
});
