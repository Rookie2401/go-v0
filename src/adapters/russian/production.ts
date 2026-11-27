/**
 * Spelling checks on a learner's own Russian (GoTell). MACHINE-DRAFTED, no Russian teacher has checked them. A small first set: each
 * check fires only on one unambiguous shape. An EMPTY RESULT MEANS NOTHING WAS FOUND, NEVER THAT THE RUSSIAN IS RIGHT: grammar,
 * case, aspect, word choice and style are not looked at.
 *
 * Checks (all category 'spelling'):
 *   1. жы / шы → жи / ши ("жызнь"): after ж and ш Russian writes и, not ы.
 *   2. чя / щя → ча / ща and чю / щю → чу / щу ("чясы"): after ч and щ Russian writes а and у, not я and ю.
 *      Checks 1 and 2 are skipped for a word the analyser's word list vouches for as spelled (a confident reading that is not a guess),
 *      for a reading that is a proper name, for a capitalised word that is not the first of the sentence (a name: Шымкент, Чюрлёнис)
 *      and for an all-capital word. Not checked at all: жю / шю (жюри, брошюра, парашют are spelled so) and ц + ы / и (too many
 *      exceptions to state).
 *   3. the preposition о before a word that begins with а, э, и, о or у ("о этом") → об ("об этом"). Only a lower-case о directly
 *      before that word, with nothing between (an interjection is written "О, как!" with a comma). Before е, ё, ю, я the form is о.
 *   4. "в мне", "с мной" / "с мною", "к мне" → "во мне", "со мной" / "со мною", "ко мне". These are the only three clusters listed: other
 *      -о forms of the prepositions (во вторник, во всём, со всеми …) are not looked at.
 * Not checked: не written together with a finite verb (too many words begin with не-).
 *
 * A suggestion (exact offsets in the sentence) is offered only where the fix is certain.
 */
import type { AnalyzedToken, ErrorCandidate, RawToken } from '../../core';

const SIBILANT_FIX: Readonly<Record<string, string>> = { ы: 'и', я: 'а', ю: 'у' };
const sentenceCase = (from: string, to: string): string => (from === from.toUpperCase() ? to.toUpperCase() : to);

/** The word with the sibilant spellings put right, and which rules fired. */
function fixSibilants(surface: string): { fixed: string; zhsh: boolean; chshch: boolean } {
  let zhsh = false;
  let chshch = false;
  const fixed = surface.replace(/([жшчщЖШЧЩ])([ыяюЫЯЮ])/gu, (m, c: string, v: string) => {
    const lc = c.toLowerCase();
    const lv = v.toLowerCase();
    if ((lc === 'ж' || lc === 'ш') && lv === 'ы') { zhsh = true; return c + sentenceCase(v, 'и'); }
    if ((lc === 'ч' || lc === 'щ') && (lv === 'я' || lv === 'ю')) { chshch = true; return c + sentenceCase(v, SIBILANT_FIX[lv]); }
    return m;
  });
  return { fixed, zhsh, chshch };
}

const CYRILLIC_WORD = /^[\p{Script=Cyrillic}]+$/u;
/** The next word after token i with only spaces between (no punctuation); undefined otherwise. */
function nextWord(tokens: RawToken[], i: number): number | undefined {
  for (let j = i + 1; j < tokens.length; j++) {
    if (tokens[j].isWord) return j;
    if (tokens[j].surface.trim()) return undefined;
  }
  return undefined;
}
const vouched = (a: AnalyzedToken | undefined): boolean => (a?.candidates ?? []).some((c) => !!c.lemma && !c.unconfirmed && c.confidence >= 0.5);
const isName = (a: AnalyzedToken | undefined): boolean => (a?.candidates ?? []).some((c) => c.pos === 'PROPN');
const firstWord = (tokens: RawToken[]): number => tokens.findIndex((t) => t.isWord);

const PREPOSITION_CLUSTERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  в: { мне: 'во' },
  с: { мной: 'со', мною: 'со' },
  к: { мне: 'ко' },
};

export function checkRuProduction(tokens: RawToken[], analyses: AnalyzedToken[], _sentence: string): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  const first = firstWord(tokens);
  tokens.forEach((t, i) => {
    if (!t.isWord || !CYRILLIC_WORD.test(t.surface)) return;
    const s = t.surface;
    const key = s.toLowerCase();

    // 1 and 2: the sibilant spellings
    const { fixed, zhsh, chshch } = fixSibilants(s);
    const skip = vouched(analyses[i]) || isName(analyses[i]) || (s.length > 1 && s === s.toUpperCase()) || (/^\p{Lu}/u.test(s) && i !== first);
    if (fixed !== s && !skip) {
      const parts: string[] = [];
      if (zhsh) parts.push('After ж and ш Russian writes и, not ы (жизнь, шить).');
      if (chshch) parts.push('After ч and щ Russian writes а and у, not я and ю (часы, чуть).');
      out.push({ category: 'spelling', tokenIndexes: [i], message: `${parts.join(' ')} Try ${fixed}.`, suggestion: { start: t.start, end: t.end, replacement: fixed }, confidence: 0.85, affectsMeaning: false });
    }

    // 3: о before a vowel sound → об
    if (s === 'о') {
      const j = nextWord(tokens, i);
      if (j !== undefined && CYRILLIC_WORD.test(tokens[j].surface) && /^[аэиоу]/iu.test(tokens[j].surface)) {
        out.push({ category: 'spelling', tokenIndexes: [i, j], message: `Before a word that begins with а, э, и, о or у the preposition о is об: об ${tokens[j].surface}.`, suggestion: { start: t.start, end: t.end, replacement: 'об' }, confidence: 0.85, affectsMeaning: false });
      }
    }

    // 4: в / с / к before мне / мной
    const clusters = PREPOSITION_CLUSTERS[key];
    if (clusters) {
      const j = nextWord(tokens, i);
      const fix = j === undefined ? undefined : clusters[tokens[j].surface.toLowerCase()];
      if (j !== undefined && fix) {
        out.push({ category: 'spelling', tokenIndexes: [i, j], message: `Before ${tokens[j].surface} the preposition is ${fix}: ${fix} ${tokens[j].surface}.`, suggestion: { start: t.start, end: t.end, replacement: s === 'В' || s === 'С' || s === 'К' ? fix[0].toUpperCase() + fix.slice(1) : fix }, confidence: 0.9, affectsMeaning: false });
      }
    }
  });
  return out;
}
