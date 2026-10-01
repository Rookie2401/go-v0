/**
 * Older Spanish spelling, recognised without altering the text. The source is never normalised: this module only
 * proposes the MODERN spelling of a written form, so that the adapter can return the modern lemma tagged `es-hist`
 * with the modern spelling in `notes.modern` and a lower confidence.
 *
 * Two layers. A short exact table (á é ó for a e o, fué dió vió, agora, ansí, mesmo …): spellings that are certain.
 * Then spelling rewrites (-ss-, ç, x for j, f- for h-, u / v and i / j / y interchange, qua- for cua-, chr-, nct, ipt,
 * nn) applied to a form that has no modern reading: a rewrite counts only if its result is something the adapter can
 * analyse (the caller says so through `accepts`), and a result that differs from a lexicon form only by accents is
 * accepted through `foldLookup` only after a rewrite has applied, so an unaccented modern word is never taken for old.
 * Machine-drafted, not native-reviewed.
 */

/** Spellings that are only found in older texts, with the modern spelling. */
export const HISTORICAL_EXACT: Readonly<Record<string, string>> = {
  á: 'a', é: 'e', ó: 'o',
  fué: 'fue', fuí: 'fui', dió: 'dio', dí: 'di', vió: 'vio', ví: 'vi', fé: 'fe', pié: 'pie',
  agora: 'ahora', ansí: 'así', ansi: 'así', assí: 'así', assi: 'así',
  mesmo: 'mismo', mesma: 'misma', mesmos: 'mismos', mesmas: 'mismas',
  aquesto: 'esto', aquesta: 'esta', aqueste: 'este', aquestos: 'estos', aquestas: 'estas',
  fasta: 'hasta',
};

/** Old contractions of de with a pronoun or demonstrative: deste = de este. [written, pronoun surface, lemma, gloss] */
export const OLD_CONTRACTIONS: Readonly<Record<string, { rest: string; lemma: string; modern: string; gloss: string }>> = {
  dél: { rest: 'l', lemma: 'él', modern: 'de él', gloss: 'of him (de él)' },
  della: { rest: 'lla', lemma: 'ella', modern: 'de ella', gloss: 'of her (de ella)' },
  dellos: { rest: 'llos', lemma: 'ellos', modern: 'de ellos', gloss: 'of them (de ellos)' },
  dellas: { rest: 'llas', lemma: 'ellas', modern: 'de ellas', gloss: 'of them (de ellas)' },
  dello: { rest: 'llo', lemma: 'ello', modern: 'de ello', gloss: 'of it (de ello)' },
  deste: { rest: 'ste', lemma: 'este', modern: 'de este', gloss: 'of this (de este)' },
  desta: { rest: 'sta', lemma: 'este', modern: 'de esta', gloss: 'of this (de esta)' },
  desto: { rest: 'sto', lemma: 'este', modern: 'de esto', gloss: 'of this (de esto)' },
  destos: { rest: 'stos', lemma: 'este', modern: 'de estos', gloss: 'of these (de estos)' },
  destas: { rest: 'stas', lemma: 'este', modern: 'de estas', gloss: 'of these (de estas)' },
};

interface Rewrite { label: string; apply(s: string): string[] }

const VOWEL = '[aeiouáéíóú]';

const REWRITES: Rewrite[] = [
  { label: 'long s for s', apply: (s) => (s.includes('ſ') ? [s.replace(/ſ/gu, 's')] : []) },
  { label: '-ss- for -s-', apply: (s) => (s.includes('ss') ? [s.replace(/ss/gu, 's')] : []) },
  { label: 'ç for z or c', apply: (s) => (s.includes('ç') ? [s.replace(/ç(?=[aouáóú]|$)/gu, 'z').replace(/ç/gu, 'c')] : []) },
  { label: 'x for j', apply: (s) => (s.includes('x') ? [s.replace(/x/gu, 'j')] : []) },
  // f- for h- (fazer): 'fij-' and 'fall-' are ordinary modern words (fijo, fallar), so they are never rewritten
  { label: 'f- for h-', apply: (s) => (/^f[aeiouáéíóú]/u.test(s) && !/^(fij|fall)/u.test(s) ? [`h${s.slice(1)}`] : []) },
  { label: 'z before e or i for c', apply: (s) => (/z[eiéí]/u.test(s) ? [s.replace(/z(?=[eiéí])/gu, 'c')] : []) },
  { label: 'v- for u- (vn, vna)', apply: (s) => (/^v[^aeiouáéíóú]/u.test(s) ? [`u${s.slice(1)}`] : []) },
  { label: 'u for v between vowels', apply: (s) => (new RegExp(`(^|${VOWEL})u(?=${VOWEL})`, 'u').test(s) ? [s.replace(new RegExp(`(^|${VOWEL})u(?=${VOWEL})`, 'gu'), '$1v')] : []) },
  { label: 'qua-, quo- for cua-, cuo-', apply: (s) => (/qu[aoáó]/u.test(s) ? [s.replace(/qu(?=[aoáó])/gu, 'cu')] : []) },
  { label: 'i- for j-', apply: (s) => (/^i[aeou]/u.test(s) ? [`j${s.slice(1)}`] : []) },
  { label: 'i- for y-', apply: (s) => (/^i[aeou]/u.test(s) ? [`y${s.slice(1)}`] : []) },
  { label: 'y- for i-', apply: (s) => (/^y[^aeiouáéíóú]/u.test(s) ? [`i${s.slice(1)}`] : []) },
  { label: 'chr for cr', apply: (s) => (s.includes('chr') ? [s.replace(/chr/gu, 'cr')] : []) },
  { label: 'ph for f', apply: (s) => (s.includes('ph') ? [s.replace(/ph/gu, 'f')] : []) },
  { label: 'th for t', apply: (s) => (s.includes('th') ? [s.replace(/th/gu, 't')] : []) },
  { label: '-nct- for -nt-', apply: (s) => (s.includes('nct') ? [s.replace(/nct/gu, 'nt')] : []) },
  { label: '-ipt- for -it-', apply: (s) => (s.includes('ipt') ? [s.replace(/ipt/gu, 'it')] : []) },
  { label: 'nn for ñ', apply: (s) => (s.includes('nn') ? [s.replace(/nn/gu, 'ñ')] : []) },
];

export interface HistoricalReading {
  /** The modern spelling (NFC, lower case). */
  modern: string;
  /** What changed, in plain words ("x for j", "á for a"). */
  rules: string[];
}

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');

/**
 * Modern spellings of a written form, best (fewest changes) first. `form` is normalised (NFC, lower case).
 * `accepts(modern)`: can the adapter analyse that spelling as a known word? `foldLookup(folded)`: the accented
 * lexicon spellings that lose their accents to give `folded` (used only after at least one rewrite applied).
 */
export function historicalSpellings(
  form: string,
  accepts: (modern: string) => boolean,
  foldLookup?: (folded: string) => readonly string[],
): HistoricalReading[] {
  const exact = HISTORICAL_EXACT[form];
  if (exact) return [{ modern: exact, rules: [`${form} for ${exact}`] }];

  const out: HistoricalReading[] = [];
  const seen = new Set<string>([form]);
  const add = (modern: string, rules: string[]) => {
    if (out.some((r) => r.modern === modern)) return;
    out.push({ modern, rules });
  };
  let frontier: Array<{ s: string; rules: string[] }> = [{ s: form, rules: [] }];
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next: Array<{ s: string; rules: string[] }> = [];
    for (const { s, rules } of frontier) {
      for (const rw of REWRITES) {
        for (const t of rw.apply(s)) {
          if (t === s || seen.has(t)) continue;
          seen.add(t);
          const r = [...rules, rw.label];
          if (accepts(t)) add(t, r);
          else if (foldLookup) for (const m of foldLookup(fold(t))) if (accepts(m)) add(m, [...r, 'accent restored']);
          if (seen.size < 60) next.push({ s: t, rules: r });
        }
      }
    }
    if (out.length) break; // the fewest rewrites that give a word
    frontier = next;
  }
  return out.sort((a, b) => a.rules.length - b.rules.length).slice(0, 3);
}
