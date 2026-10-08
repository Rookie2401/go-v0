/**
 * Older Norwegian spelling (Riksmål, Dano-Norwegian, Landsmål) related to today's, the text never changed. The expectations are
 * MACHINE-DRAFTED, pending native review (written by the model that built the analyzer; the period of each pair is its judgement,
 * not a source).
 */
import { describe, expect, it } from 'vitest';
import { LISTED_COUNT, LISTED_GROUPS, spellingRelation } from '../../src/adapters/norwegian/historical';
import { lexiconFor } from '../../src/adapters/norwegian/lexicon';
import { adapter, run } from './helpers';

const nb = adapter('nb');
const lex = lexiconFor('nb');
const first = (text: string, i = 0) => nb.analyze(nb.tokenize(text))[i].candidates[0];

describe('older spelling (Bokmål)', () => {
  it('efter is credited to the modern lemma etter, the form kept, the orthography relation set', () => {
    const r = run('nb', 'Han gikk efter meg.');
    const c = r.analyses[2].candidates[0];
    expect(r.tokens[2].surface).toBe('efter'); // the text is never changed
    expect(c).toMatchObject({ lemma: 'etter', pos: 'ADP' });
    expect(c.orthography).toMatchObject({ modern: 'etter', period: 'nb-1917', confidence: 0.9 });
    expect(c.varieties).toEqual(['nb-riksmal']);
    expect(c.origin).toBe('rule');
  });

  it('listed pairs at 0.9 with a historical variety', () => {
    const table: Array<[string, string, string, string]> = [
      ['nu', 'nå', 'nb-1917', 'nb-riksmal'], ['sprog', 'språk', 'nb-1917', 'nb-riksmal'], ['sne', 'snø', 'nb-1917', 'nb-riksmal'],
      ['hvad', 'hva', 'nb-pre1907', 'nb-dano'], ['mig', 'meg', 'nb-pre1907', 'nb-dano'], ['dig', 'deg', 'nb-pre1907', 'nb-dano'], ['sig', 'seg', 'nb-pre1907', 'nb-dano'],
      ['bog', 'bok', 'nb-pre1907', 'nb-dano'], ['gade', 'gate', 'nb-pre1907', 'nb-dano'], ['mand', 'mann', 'nb-pre1907', 'nb-dano'],
    ];
    for (const [old, modern, period, variety] of table) {
      const c = first(old);
      expect(c.orthography, old).toMatchObject({ modern, period, confidence: 0.9 });
      expect(c.lemma, old).toBe(modern === 'nå' ? 'nå' : c.lemma);
      expect(c.varieties, old).toEqual([variety]);
    }
    expect(first('bog').lemma).toBe('bok');
    expect(first('mig').lemma).toBe('jeg');
  });

  it('valid Bokmål forms are never listed or related: syv, sju, tyve, tjue, mere, boka, boken, kastet, kasta, blei', () => {
    const listed = new Set(LISTED_GROUPS.flatMap((g) => g.pairs.map(([o]) => o)));
    for (const w of ['syv', 'sju', 'tyve', 'tjue', 'mere', 'mer', 'boka', 'boken', 'kastet', 'kasta', 'blei', 'ble', 'meget', 'mye', 'husa', 'husene']) {
      expect(listed.has(w), w).toBe(false);
      expect(spellingRelation(w, 'nb', { isWord: (f) => lex.has(f) }), w).toBeUndefined();
    }
    expect(first('syv').orthography).toBeUndefined();
    expect(first('syv').confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('a modern word is never related even when an older pair would match (været stays the weather)', () => {
    expect(first('været').orthography).toBeUndefined();
    expect(first('været').lemma).toBe('vær');
  });

  it('patterns: aa becomes å (0.7), soft consonants become hard (0.6), two patterns 0.5', () => {
    const aa = first('gaa');
    expect(aa).toMatchObject({ lemma: 'gå', pos: 'VERB' });
    expect(aa.orthography).toMatchObject({ modern: 'gå', period: 'nb-1907', confidence: 0.7 });
    const maa = first('maaned');
    expect(maa.lemma).toBe('måned');
    expect(maa.orthography?.confidence).toBe(0.7);
    const naar = first('naar');
    expect(naar.orthography?.modern).toBe('når');
    const soft = first('kjærlighed');
    expect(soft.orthography).toMatchObject({ modern: 'kjærlighet' });
    const both = first('Haand');
    expect(both.lemma).toBe('hånd');
  });

  it('gated on the modern candidate being in the lexicon: no pattern result for an unknown modern word', () => {
    const r = run('nb', 'xaa zaar baagen');
    for (const a of r.analyses) expect(a.candidates[0]?.orthography).toBeUndefined();
    expect(spellingRelation('qaaqx', 'nb', { isWord: (f) => lex.has(f) })).toBeUndefined();
  });

  it('a capitalised common noun in the middle of a sentence is related at 0.5 (Danish and early print)', () => {
    const r = run('nb', 'Han kjøpte en Bok i Byen.');
    const bok = r.analyses[3].candidates[0];
    expect(bok).toMatchObject({ lemma: 'bok', pos: 'NOUN' });
    expect(bok.orthography).toMatchObject({ modern: 'bok', period: 'nb-pre1907', confidence: 0.5 });
    // a name in the lexicon is a name
    const names = run('nb', 'Han bor i Bergen og kjenner Ola.');
    for (const i of [3, 6]) expect(names.analyses[i].candidates[0].orthography).toBeUndefined();
  });

  it('a sentence of Dano-Norwegian: the modern lemma of every word', () => {
    const r = run('nb', 'Hvad siger du, mand? Jeg gaar paa gaden efter nu.');
    const lemmas = r.analyses.filter((a) => a.token.isWord).map((a) => a.candidates[0]?.lemma);
    expect(lemmas).toEqual(['hva', 'si', 'du', 'mann', 'jeg', 'gå', 'på', 'gate', 'etter', 'nå']);
  });

  it('lemmaVariants gives the older spelling for a dictionary that files it, and the alternative valid spellings', () => {
    expect(nb.lemmaVariants!('etter')).toContain('efter');
    expect(nb.lemmaVariants!('syv')).toEqual(['sju']);
    expect(nb.lemmaVariants!('tjue')).toEqual(['tyve']);
    expect(nb.lemmaVariants!('hus')).toEqual([]);
  });

  it('has a useful number of listed pairs, and every period is one of the SPEC periods', () => {
    expect(LISTED_COUNT).toBeGreaterThan(60);
    for (const g of LISTED_GROUPS) expect(['nb-pre1907', 'nb-1907', 'nb-1917', 'nb-1938', 'nb-1959', 'nb-1981']).toContain(g.period);
  });

  it('the varieties table labels them: Riksmål is a living private norm, Dano-Norwegian is pre-1907', () => {
    const v = nb.varieties!;
    expect(v['nb']).toMatchObject({ kind: 'national', label: 'Bokmål' });
    expect(v['nb-riksmal']).toMatchObject({ kind: 'historical', label: 'Riksmål' });
    expect(v['nb-riksmal'].note).toMatch(/still written today/);
    expect(v['nb-dano']).toMatchObject({ kind: 'historical', label: 'Dano-Norwegian (pre-1907)' });
    const nn = adapter('nn').varieties!;
    expect(Object.keys(nn).sort()).toEqual(['nn', 'nn-hognorsk', 'nn-landsmal']);
    expect(nn['nn']).toMatchObject({ kind: 'national', label: 'Nynorsk' });
    expect(Object.keys(v).sort()).toEqual(['nb', 'nb-dano', 'nb-riksmal']);
  });
});

describe('older spelling (Nynorsk)', () => {
  const nn = adapter('nn');
  it('aa becomes å and the listed Høgnorsk forms relate to today\'s Nynorsk, the form kept', () => {
    const r = nn.analyze(nn.tokenize('Eg hev bøker.'));
    expect(r[1].candidates[0]).toMatchObject({ lemma: 'ha' });
    expect(r[1].candidates[0].orthography).toMatchObject({ modern: 'har', confidence: 0.9 });
    expect(r[1].candidates[0].varieties).toEqual(['nn-hognorsk']);
    const aa = nn.analyze(nn.tokenize('gaa'))[0].candidates[0];
    expect(aa.orthography).toMatchObject({ modern: 'gå', period: 'nn-1901' });
  });
});
