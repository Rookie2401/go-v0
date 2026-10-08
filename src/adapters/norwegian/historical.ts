/**
 * Older Norwegian spelling related to today's (efter → etter, nu → nå, bog → bok, hvad → hva, gaa → gå). The text is NEVER
 * changed: this module says what today's spelling of a written form is, so that the adapter can credit the modern lemma, tag
 * the word with a historical variety and keep the written form on the page (German precedent: german/historical.ts).
 *
 * Layers, best first. (1) A LISTED pair: an exact word whose modern spelling is certain, confidence 0.9. (2) A PATTERN:
 * tried only when the written form is itself no modern word, and counted only when the modern candidate is a word of the
 * lexicon (the gate): 0.7 for one rule (aa → å), 0.6 for a consonant rule, 0.5 for two rules together or for a capitalised
 * common noun in the middle of a sentence.
 *
 * Periods (SPEC §2): nb-pre1907 (Danish-based spelling: soft consonants, hvad, mig, dig, sig), nb-1907 (the reform of 1907:
 * hard consonants, but aa still written), nb-1917 (Riksmål spellings kept after å replaced aa: efter, nu, sprog, sne).
 * The assignment of a pair to a period is the author's judgement, not a source: machine-drafted and unreviewed, and the
 * single largest open question for a native or historical reviewer. Riksmål is a living private norm: a form in nb-1917 can
 * still be written today by Riksmål writers; it is not valid Bokmål.
 *
 * A valid Bokmål form is never listed: syv/sju, tyve/tjue, mere/mer, boka/boken, kastet/kasta, blei/ble are all today's spelling.
 * Nynorsk: the only relations are aa → å and a few Landsmål / Høgnorsk forms (hev → har).
 */
import type { NoStandard } from './types';

export type NoPeriod = 'nb-pre1907' | 'nb-1907' | 'nb-1917' | 'nn-1901' | 'nn-1917';

export interface NoSpellingRelation { modern: string; period: NoPeriod; confidence: number; rule: string; variety: string }

interface Group { period: NoPeriod; variety: string; rule: string; pairs: ReadonlyArray<readonly [string, string]> }

export const LISTED_GROUPS: readonly Group[] = [
  {
    period: 'nb-pre1907', variety: 'nb-dano', rule: 'Danish-based spelling: soft consonants and Danish forms, written differently since 1907',
    pairs: [
      ['bog', 'bok'], ['gik', 'gikk'], ['bøger', 'bøker'], ['gade', 'gate'], ['gader', 'gater'], ['hvad', 'hva'], ['mig', 'meg'], ['dig', 'deg'], ['sig', 'seg'],
      ['mand', 'mann'], ['mænd', 'menn'], ['kvinde', 'kvinne'], ['kvinder', 'kvinner'], ['børn', 'barn'], ['nogen', 'noen'], ['noget', 'noe'],
      ['nogle', 'noen'], ['kjøbe', 'kjøpe'], ['købe', 'kjøpe'], ['kjøbt', 'kjøpt'], ['kjøbmand', 'kjøpmann'], ['øje', 'øye'], ['øjne', 'øyne'],
      ['næse', 'nese'], ['bruge', 'bruke'], ['tage', 'ta'], ['give', 'gi'], ['sige', 'si'], ['siger', 'sier'], ['sagde', 'sa'], ['blive', 'bli'],
      ['bliver', 'blir'], ['blev', 'ble'], ['været', 'vært'], ['forældre', 'foreldre'], ['moder', 'mor'], ['fader', 'far'], ['broder', 'bror'],
      ['søn', 'sønn'], ['hænder', 'hender'], ['fod', 'fot'], ['fødder', 'føtter'], ['hoved', 'hode'], ['ansigt', 'ansikt'], ['mund', 'munn'],
      ['tand', 'tann'], ['ryg', 'rygg'], ['nat', 'natt'], ['uge', 'uke'], ['vand', 'vann'], ['skov', 'skog'], ['vej', 'vei'], ['præst', 'prest'],
      ['kjærlighed', 'kjærlighet'], ['frihed', 'frihet'], ['sandhed', 'sannhet'], ['glæde', 'glede'], ['imellem', 'mellom'],
      ['vindue', 'vindu'], ['bedste', 'beste'], ['hjælpe', 'hjelpe'], ['hjælp', 'hjelp'],
      ['sæt', 'sett'], ['sætte', 'sette'], ['læse', 'lese'], ['læser', 'leser'], ['skrive', 'skrive'],
      ['pige', 'pike'], ['spørge', 'spørre'], ['spørger', 'spør'],
      ['tænke', 'tenke'], ['tænker', 'tenker'], ['længe', 'lenge'], ['længer', 'lenger'], ['lidt', 'litt'],
    ],
  },
  {
    period: 'nb-1917', variety: 'nb-riksmal', rule: 'Riksmål spelling kept after 1917 (still written by Riksmål writers; not valid Bokmål today)',
    pairs: [
      ['efter', 'etter'], ['nu', 'nå'], ['sprog', 'språk'], ['sne', 'snø'], ['sneen', 'snøen'], ['saadan', 'sånn'], ['aldrig', 'aldri'], ['gjennem', 'gjennom'],
    ],
  },
];

/** The nynorsk relations: Landsmål / Høgnorsk forms that today's Nynorsk writes otherwise. */
export const NN_LISTED_GROUPS: readonly Group[] = [
  {
    period: 'nn-1917', variety: 'nn-hognorsk', rule: 'Høgnorsk or older Nynorsk form, written otherwise in the standard of 2012',
    pairs: [['hev', 'har'], ['segjer', 'seier'], ['so', 'så'], ['sanningi', 'sanninga'], ['verdi', 'verda'], ['synderne', 'syndene'], ['elska', 'elskar'], ['hava', 'ha']],
  },
];

const LISTED = new Map<string, Array<{ modern: string; period: NoPeriod; rule: string; variety: string }>>();
for (const g of [...LISTED_GROUPS, ...NN_LISTED_GROUPS]) {
  for (const [old, modern] of g.pairs) {
    const list = LISTED.get(old) ?? [];
    list.push({ modern, period: g.period, rule: g.rule, variety: g.variety });
    LISTED.set(old, list);
  }
}

export const LISTED_COUNT = [...LISTED.values()].reduce((n, l) => n + l.length, 0);

/** Modern spelling → the older spellings the list pairs with it. */
export function olderSpellings(modern: string): string[] {
  const out: string[] = [];
  for (const [old, list] of LISTED) if (list.some((x) => x.modern === modern)) out.push(old);
  return out;
}

const V = 'aeiouyæøå';

interface Edit { id: string; period: NoPeriod; variety: string; rule: string; confidence: number; apply(s: string): string[] }

const PATTERNS_NB: readonly Edit[] = [
  { id: 'aa', period: 'nb-1907', variety: 'nb-riksmal', rule: 'aa was written for å before 1917', confidence: 0.7, apply: (s) => (s.includes('aa') ? [s.replace(/aa/g, 'å')] : []) },
  { id: 'hed', period: 'nb-pre1907', variety: 'nb-dano', rule: '-hed was written for -het', confidence: 0.7, apply: (s) => (/hed(en|er|erne)?$/.test(s) ? [s.replace(/hed(en|er|erne)?$/, (_m, e) => `het${e ?? ''}`)] : []) },
  {
    id: 'soft', period: 'nb-pre1907', variety: 'nb-dano', rule: 'a soft consonant (b, d, g after a vowel) was written where hard p, t, k are written since 1907', confidence: 0.6,
    apply: (s) => {
      const out: string[] = [];
      const hard: Record<string, string> = { b: 'p', d: 't', g: 'k' };
      for (const m of s.matchAll(new RegExp(`([${V}])([bdg])(?=$|e$|er$|en$|et$|ene$)`, 'g'))) {
        const i = (m.index as number) + 1;
        out.push(s.slice(0, i) + hard[m[2]] + s.slice(i + 1));
      }
      return out;
    },
  },
  { id: 'ae', period: 'nb-pre1907', variety: 'nb-dano', rule: 'æ before a consonant cluster was written where e is written since 1907', confidence: 0.6, apply: (s) => (/æ[a-z]/.test(s) ? [s.replace(/æ(?=[bcdfgklmnprstv])/g, 'e')] : []) },
];

const PATTERNS_NN: readonly Edit[] = [
  { id: 'aa', period: 'nn-1901', variety: 'nn-landsmal', rule: 'aa was written for å before 1917', confidence: 0.7, apply: (s) => (s.includes('aa') ? [s.replace(/aa/g, 'å')] : []) },
];

export interface SpellingContext {
  /** True when this exact normalized form is a word of the standard's lexicon. */
  isWord(form: string): boolean;
}

/**
 * The modern spelling of a written form, or undefined. `surface` is the form as written; capitalisation matters only for the
 * capitalised-common-noun pattern, which needs `midSentence` (a capital letter that is not a sentence start).
 */
export function spellingRelation(surface: string, std: NoStandard, ctx: SpellingContext, opts: { midSentence?: boolean; isCommonNoun?(form: string): boolean } = {}): NoSpellingRelation | undefined {
  const written = surface.normalize('NFC');
  if (!/^\p{L}+$/u.test(written)) return undefined;
  const lower = written.toLocaleLowerCase('nb');
  if (ctx.isWord(lower)) {
    return undefined; // a modern word is never related (sne is not modern, but mere, syv, sju, boka are)
  }
  const listed = LISTED.get(lower);
  if (listed) {
    const pick = listed.find((l) => (std === 'nb' ? l.period.startsWith('nb') : l.period.startsWith('nn')) && l.modern.split(' ').every((w) => ctx.isWord(w)));
    if (pick) return { modern: pick.modern, period: pick.period, confidence: 0.9, rule: pick.rule, variety: pick.variety };
  }
  const patterns = std === 'nb' ? PATTERNS_NB : PATTERNS_NN;
  // single rules
  const singles: NoSpellingRelation[] = [];
  for (const p of patterns) for (const cand of p.apply(lower)) if (cand !== lower && ctx.isWord(cand)) singles.push({ modern: cand, period: p.period, confidence: p.confidence, rule: p.rule, variety: p.variety });
  if (singles.length) return singles.sort((a, b) => b.confidence - a.confidence)[0];
  // two rules together: aa → å first, then one more
  if (patterns.length > 1) {
    const base = patterns[0].apply(lower)[0] ?? lower;
    if (base !== lower) {
      for (const p of patterns.slice(1)) for (const cand of p.apply(base)) if (cand !== base && ctx.isWord(cand)) return { modern: cand, period: p.period, confidence: 0.5, rule: `${patterns[0].rule}; ${p.rule}`, variety: p.variety };
    }
  }
  // a capitalised common noun in the middle of a sentence (Danish and early Norwegian print capitalised nouns)
  if (std === 'nb' && opts.midSentence && /^\p{Lu}/u.test(written) && written.slice(1) === written.slice(1).toLocaleLowerCase('nb') && opts.isCommonNoun?.(lower)) {
    return { modern: lower, period: 'nb-pre1907', confidence: 0.5, rule: 'a common noun written with a capital letter (the custom of Danish and early Norwegian print)', variety: 'nb-dano' };
  }
  return undefined;
}
