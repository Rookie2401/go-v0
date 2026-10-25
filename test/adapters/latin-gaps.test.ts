// @vitest-environment node
/**
 * The gap work of 2026-10-25 (docs/latin/ADAPTER.md, "The gap work of 2026-10-25"): the Vulgate's names as a lexicon backstop, the
 * capitalised-name weight, the hand-written Vulgate form priors, three medieval spelling habits, and the three-gender table row.
 * Needs the full lexicon (loaded once here; the chunk is read from the source tree, no build).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { laAdapter } from '../../src/adapters/la';
import { loadLatinLexicon } from '../../src/adapters/latin/lexicon-load';
import { spellingAlternatives, tokenizeLatin } from '../../src/adapters/latin/orthography';
import { latinTableRow } from '../../src/adapters/latin/tags';
import { NAMES_LEXICON } from '../../src/adapters/latin/lexicon-names-data';
import { VULGATE_FORM_PRIORS } from '../../src/adapters/latin/priors-vulgate';

interface First { surface: string; lemma?: string; pos?: string; gloss?: string }

async function first(text: string): Promise<First[]> {
  const out = await laAdapter.analyze(tokenizeLatin(text));
  return out.filter((t) => t.token.isWord).map((t) => ({ surface: t.token.surface, lemma: t.candidates[0]?.lemma, pos: t.candidates[0]?.pos, gloss: t.candidates[0]?.gloss }));
}
const of = (list: First[], surface: string): First => list.find((x) => x.surface === surface) as First;

describe('the Vulgate names backstop (lexicon-names-data.ts)', () => {
  beforeAll(async () => { await loadLatinLexicon(); });

  it('is a small generated file of noun rows: lemma, genitive, gender, weight, gloss', () => {
    const rows = NAMES_LEXICON.split('\n');
    expect(rows.length).toBeGreaterThan(120);
    expect(rows.length).toBeLessThan(400);
    for (const r of rows) {
      const f = r.split('\t');
      expect(f[0]).toBe('N');
      expect(f[1]).toMatch(/^\p{Lu}[A-Za-z]+$/u);
      expect(f[3]).toMatch(/^[mfn][pGIK]*$/);
      expect(Number(f[4])).toBeGreaterThan(0);
    }
    const lemma = (l: string): string | undefined => rows.find((r) => r.startsWith(`N\t${l}\t`));
    expect(lemma('Iordanis')).toContain('\tIordanis\tm\t');
    expect(lemma('Ioppe')).toContain('\tIoppae\tf\t');
    expect(lemma('Sodoma')).toContain('\tSodomi\tnp\t');
    expect(lemma('Edom')).toMatch(/^N\tEdom\t\tm\t\d+\tEdom, Esau$/);
    expect(lemma('Sina')).toContain('Sinai');
    // the pages that are another bearer of the name stay out
    for (const junk of ['Uria', 'Tyro', 'Noemus', 'Sale', 'Deo', 'Ubus', 'Tecum']) expect(lemma(junk)).toBeUndefined();
  });

  it('reads the Clementine spellings of the names as names, with their gloss', async () => {
    const r = await first('Et venit Maria ad Jordanis ripam in Joppen; filii Edom et Sodomorum et Lachis in monte Sina.');
    expect(of(r, 'Jordanis')).toMatchObject({ lemma: 'Iordanis', pos: 'PROPN' });
    expect(of(r, 'Jordanis').gloss).toContain('Jordan');
    expect(of(r, 'Joppen')).toMatchObject({ lemma: 'Ioppe', pos: 'PROPN' });
    expect(of(r, 'Edom')).toMatchObject({ lemma: 'Edom', pos: 'PROPN' });
    expect(of(r, 'Sodomorum')).toMatchObject({ lemma: 'Sodoma', pos: 'PROPN' });
    expect(of(r, 'Lachis')).toMatchObject({ lemma: 'Lachis', pos: 'PROPN' });
    expect(of(r, 'Sina')).toMatchObject({ lemma: 'Sina', pos: 'PROPN' });
  });

  it('a capitalised word inside a sentence is the name when it can be one: Maria, not the plural of mare', async () => {
    const r = await first('Et venit Maria ad Jordanis ripam.');
    expect(of(r, 'Maria')).toMatchObject({ lemma: 'Maria', pos: 'PROPN' });
    // the common word keeps its reading when written in lower case
    const r2 = await first('et super maria magna');
    expect(of(r2, 'maria')).toMatchObject({ lemma: 'mare', pos: 'NOUN' });
  });
});

describe('the Vulgate form priors (priors-vulgate.ts)', () => {
  beforeAll(async () => { await loadLatinLexicon(); });

  it('are written in the lexicon spelling and folded to the lookup one', () => {
    expect(VULGATE_FORM_PRIORS).not.toMatch(/v/);
    expect(VULGATE_FORM_PRIORS).toContain('uasa\t10\tuas:N:10');
    expect(VULGATE_FORM_PRIORS.split('\n').length).toBeGreaterThan(30);
  });

  it('settle the noun / verb homographs the Vulgate reads as nouns', async () => {
    const r = await first('et scribis dixit laudem legi, et vasa et loca et praecepta.');
    expect(of(r, 'scribis')).toMatchObject({ lemma: 'scriba', pos: 'NOUN' });
    expect(of(r, 'laudem')).toMatchObject({ lemma: 'laus', pos: 'NOUN' });
    expect(of(r, 'legi')).toMatchObject({ lemma: 'lex', pos: 'NOUN' });
    expect(of(r, 'vasa')).toMatchObject({ lemma: 'vas', pos: 'NOUN' });
    expect(of(r, 'loca')).toMatchObject({ lemma: 'locus', pos: 'NOUN' });
    expect(of(r, 'praecepta')).toMatchObject({ lemma: 'praeceptum', pos: 'NOUN' });
  });
});

describe('medieval spellings and the three-gender table row', () => {
  it('mpn for mn, k for c and a final t for d are tried for an unknown written form', () => {
    const keys = (w: string): string[] => spellingAlternatives(w).map((a) => a.key);
    expect(keys('dampnum')).toContain('damnum');
    expect(keys('columpna')).toContain('columna');
    expect(keys('karissimus')).toContain('carissimus');
    expect(keys('set')).toContain('sed');
    expect(keys('aput')).toContain('apud');
    expect(keys('quot')).toContain('quod');
  });

  it('the Vulgate nouns Whitaker lacks are in the seed additions', async () => {
    const r = await first('Fecit superhumerale et tetrarcha venit.');
    expect(of(r, 'superhumerale')).toMatchObject({ lemma: 'superhumerale', pos: 'NOUN' });
    expect(of(r, 'tetrarcha')).toMatchObject({ lemma: 'tetrarcha', pos: 'NOUN' });
  });

  it('a Wiktionary table row for two or three genders carries the union, which the cell selection splits into every cell', () => {
    const row = latinTableRow(['dative', 'plural', 'masculine', 'feminine', 'neuter'], 'ADJ');
    expect(row).toEqual({ features: { Case: 'Dat', Number: 'Plur', Gender: 'Fem,Masc,Neut' } });
    const two = latinTableRow(['nominative', 'singular', 'masculine', 'feminine'], 'ADJ');
    expect(two).toEqual({ features: { Case: 'Nom', Number: 'Sing', Gender: 'Fem,Masc' } });
    const one = latinTableRow(['nominative', 'singular', 'neuter'], 'ADJ');
    expect(one).toEqual({ features: { Case: 'Nom', Number: 'Sing', Gender: 'Neut' } });
  });
});
