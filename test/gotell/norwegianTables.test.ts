/**
 * Norwegian GoTell tables (nb, nn): the concept tables, negator / subject sets and model wordings are checked against the REAL
 * Norwegian analyzer (src/adapters/norwegian), so a lemma-convention drift on either side fails here. Machine-drafted, pending
 * native review.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { LanguageCode } from '../../src/core';
import { CATALOG_GOALS, NEGATORS, SUBJECT_PRONOUNS, assessLanguage, assessMeaning, catalogGoals, catalogModel, conceptsForToken } from '../../src/gotell';
import { bestCandidate, parse, wordIndexes } from '../../src/gotell/text';

const reg = createAdapterRegistry();
const NO: LanguageCode[] = ['nb', 'nn'];

function conceptsOf(lang: LanguageCode, text: string): Set<string> {
  const a = reg.get(lang);
  const p = parse(a, text);
  const out = new Set<string>();
  for (const i of wordIndexes(p)) for (const c of conceptsForToken(lang, p.tokens[i].normalized, bestCandidate(p.analyses[i])?.lemma)) out.add(c);
  return out;
}

describe('Norwegian model wordings (nb, nn)', () => {
  it('each model wording carries its goal and the real checker finds nothing in it', () => {
    for (const lang of NO) {
      const a = reg.get(lang);
      expect(catalogGoals(lang).length).toBe(15);
      for (const g of catalogGoals(lang)) {
        const m = catalogModel(g.id, lang)!;
        expect(m.review).toBe('unreviewed');
        const meaning = assessMeaning(a, lang, g, m.text);
        expect({ lang, goal: g.id, success: meaning.success, missing: meaning.missing }).toEqual({ lang, goal: g.id, success: true, missing: [] });
        expect({ lang, goal: g.id, findings: assessLanguage(a, m.text).findings.map((f) => f.message) }).toEqual({ lang, goal: g.id, findings: [] });
      }
    }
  });

  it('the negated goal keeps its negator (ikke / ikkje) and no other goal has one', () => {
    for (const lang of NO) {
      const negators = new Set(NEGATORS[lang]);
      for (const g of CATALOG_GOALS) {
        const m = catalogModel(g.id, lang);
        if (!m) continue;
        const hasNeg = m.text.toLowerCase().match(/[\p{L}]+/gu)!.some((w) => negators.has(w));
        expect({ goal: g.id, hasNeg }).toEqual({ goal: g.id, hasNeg: g.negated });
      }
    }
  });
});

describe('Norwegian concept tables follow the analyzer\'s lemma conventions', () => {
  it('belief and faith are told apart where the shared lemma allows (tro / tru)', () => {
    expect([...conceptsOf('nb', 'Jeg tror på Jesus.')]).toContain('believe');
    expect(conceptsOf('nb', 'Jeg tror på Jesus.').has('faith')).toBe(false); // the verb is not "faith"
    expect(conceptsOf('nn', 'Eg trur på Jesus.').has('faith')).toBe(false);
    expect(conceptsOf('nb', 'Troen min er sterk.').has('faith')).toBe(true);
    expect(conceptsOf('nn', 'Trua mi er sterk.').has('faith')).toBe(true);
  });

  it('prefix stems do not catch unrelated words (angrep, skulder, Ungarn)', () => {
    expect(conceptsOf('nb', 'Angrepet kom i går.').has('repent')).toBe(false);
    expect(conceptsOf('nb', 'Han angrer.').has('repent')).toBe(true);
    expect(conceptsOf('nn', 'Han angrar.').has('repent')).toBe(true);
    expect(conceptsOf('nn', 'Skuldrene hans var breie.').has('guilt')).toBe(false);
    expect(conceptsOf('nn', 'Ho kjende seg skuldig.').has('guilt')).toBe(true);
    expect(conceptsOf('nb', 'Hun følte seg skyldig.').has('guilt')).toBe(true);
    expect(conceptsOf('nb', 'Vi reiste til Ungarn.').has('young')).toBe(false);
    expect(conceptsOf('nb', 'Da jeg var ung.').has('young')).toBe(true);
  });

  it('standard-specific spellings are in the table of their own standard', () => {
    expect(conceptsOf('nn', 'Menigheita er familien min.')).toContain('jesus');
    expect(conceptsOf('nn', 'Han tilgjev meg.')).toContain('forgive');
    expect(conceptsOf('nn', 'Eg kjende han.')).toContain('know');
    expect(conceptsOf('nb', 'Jeg kjente ham.')).toContain('know');
    expect(conceptsOf('nb', 'Gud tilgav meg.')).toContain('forgive');
  });

  it('subject pronouns and negators are the analyzer\'s own forms (ikke is an ADV, jeg / eg are different words)', () => {
    for (const lang of NO) {
      const a = reg.get(lang);
      for (const pron of SUBJECT_PRONOUNS[lang]) {
        const p = parse(a, pron);
        expect({ lang, pron, pos: bestCandidate(p.analyses[wordIndexes(p)[0]])?.pos }).toMatchObject({ pos: 'PRON' });
      }
      expect(NEGATORS[lang]).toContain(lang === 'nb' ? 'ikke' : 'ikkje');
    }
    expect(a('nb', 'ikke')).toBe('ADV');
    expect(a('nn', 'ikkje')).toBe('ADV');
    expect(reg.get('nb').relate('jeg', 'eg')).toBe('none');
    expect(reg.get('nb').relate('en', 'ei')).not.toBe('none'); // en / ei / et share the lemma "en"
  });
});

function a(lang: LanguageCode, word: string) {
  const ad = reg.get(lang);
  const p = parse(ad, word);
  return bestCandidate(p.analyses[wordIndexes(p)[0]])?.pos;
}
