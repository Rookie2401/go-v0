/**
 * Names, numerals and abbreviations in the running sentence (rule 2 of the sentence layer). What the written form of a
 * word says about it, which the context-free word-form engine cannot see because it reads lower-cased forms:
 *
 *   a capital letter inside the sentence      a name: Drita (not dritë), Mira (not i mirë), Luan (not luaj); a word the list does
 *                                             not know at all is read as an unconfirmed proper noun (Vjosa, Pogradec)
 *   a capital letter that opens a clause      says nothing, except for the cast names the list holds: a name with another reading
 *                                             before a verb or a comma is the name ("Drita është…", "Mira, ejani")
 *   capitals in the shape of a Roman numeral  a number (XIV, II): shek. XIV
 *   m after a figure                          the abbreviation of metër (3 m)
 *
 * This is the one place of the sentence layer that ADDS a reading: a guess for a word that had none, or only guesses, and
 * a Roman numeral. Both are marked `unconfirmed` or carry their rule, and none is above 0.7. Everything else here only
 * orders the readings the engine made, as the rest of the sentence layer does. Machine-drafted rules, not checked by a
 * native speaker.
 */
import type { AnalysisCandidate } from '../../core';
import { isFin, isNominal, nextWord, pick, type C, type Ctx } from './sentence-core';
import { SQ_SOURCE_IDS } from './version';

const CAPITAL_WHY = 'written with a capital letter inside the sentence: a name';
const CLAUSE_START_WHY = 'written with a capital letter before a verb or a comma, and the word list holds it as a name: a name';

/** Did the sentence layer decide that this token is a name because of its capital letter? */
export function nameDecided(cx: Ctx, i: number): boolean {
  const first = cx.cur[i][0];
  const why = first?.notes?.context;
  return first?.pos === 'PROPN' && typeof why === 'string' && why.includes('capital letter');
}

/** A word the engine could only guess at (or not read at all): no reading of the word list stands behind it. */
const unlisted = (list: readonly C[]): boolean => list.every((c) => c.unconfirmed === true);

// ───────────────────────────── Roman numerals ─────────────────────────────

const ROMAN = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/u;
const ROMAN_VALUE: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/** The value of a Roman numeral written in capitals (at least two letters, canonical form), else undefined. */
export function romanValue(surface: string): number | undefined {
  if (surface.length < 2 || !ROMAN.test(surface)) return undefined;
  let total = 0;
  for (let i = 0; i < surface.length; i++) {
    const v = ROMAN_VALUE[surface[i]];
    total += i + 1 < surface.length && v < ROMAN_VALUE[surface[i + 1]] ? -v : v;
  }
  return total;
}

function ruleReading(lemma: string, pos: C['pos'], gloss: string, confidence: number, rule: string, why: string, extra: Partial<AnalysisCandidate> = {}): C {
  return {
    lemma, pos, morph: {}, gloss, confidence, origin: 'rule', sourceId: SQ_SOURCE_IDS.rules,
    notes: { rule, source: 'rule', context: why },
    ...extra,
  };
}

// ───────────────────────────── the pass ─────────────────────────────

/** Is the capital at token i inside a sentence: right after a word, a comma or a semicolon? After a full stop, a dash or a quotation mark it says nothing. */
function insideSentence(cx: Ctx, i: number): boolean {
  const before = i > 0 ? cx.tokens[i - 1] : undefined;
  return before !== undefined && (before.isWord || /^[,;]$/u.test(before.surface.trim()));
}

/** A figure (or a number word) stands right before token i. */
function afterFigure(cx: Ctx, i: number): boolean {
  const before = i > 0 ? cx.tokens[i - 1] : undefined;
  if (!before) return false;
  if (!before.isWord) return /\d$/u.test(before.surface.trim());
  return cx.cur[i - 1].length > 0 && cx.cur[i - 1][0].pos === 'NUM';
}

export function names(cx: Ctx): void {
  const words = cx.tokens.map((_, i) => i).filter((i) => cx.tokens[i].isWord);
  // a heading in capitals says nothing about names
  if (words.length > 1 && words.every((i) => cx.tokens[i].surface === cx.tokens[i].surface.toLocaleUpperCase('sq'))) return;
  for (const i of words) {
    const list = cx.cur[i];
    const surface = cx.tokens[i].surface;
    const capital = /^\p{Lu}/u.test(surface);

    // m after a figure: the abbreviation of metër (3 m); a bare m is nothing
    if (surface === 'm' && afterFigure(cx, i) && (list.length === 0 || unlisted(list))) {
      cx.cur[i] = [ruleReading('m', 'X', 'm, metre(s)', 0.7, 'the letter m after a figure: the abbreviation of metër', 'after a figure: an abbreviation (metre)', { role: 'abbreviation' }), ...list];
      continue;
    }

    // capitals in the shape of a Roman numeral, for a word the list does not know (DI, MI and the like are words of the list and stay)
    const roman = capital && surface === surface.toLocaleUpperCase('sq') ? romanValue(surface) : undefined;
    if (roman !== undefined && (list.length === 0 || unlisted(list))) {
      cx.cur[i] = [ruleReading(surface, 'NUM', `Roman numeral ${roman}`, 0.7, `capital letters in the shape of a Roman numeral: ${surface} = ${roman}`, 'capital letters in the shape of a Roman numeral: a number')];
      continue;
    }

    if (capital) {
      if (insideSentence(cx, i)) {
        if (list.some((c) => c.pos === 'PROPN') && !list.every((c) => c.pos === 'PROPN')) {
          pick(cx, i, { pred: (c) => c.pos === 'PROPN', why: CAPITAL_WHY });
        } else if (list.length === 0 || unlisted(list)) {
          // not a word of the list, and a capital inside the sentence: a name, as a guess. The old guesses stay behind it.
          const guess = ruleReading(
            surface, 'PROPN', '', 0.4,
            'a word outside the list written with a capital letter inside the sentence: a name; the lemma is the written form (a guess)', CAPITAL_WHY,
            { unconfirmed: true },
          );
          guess.notes = { ...guess.notes, lemmaStatus: 'inferred by the rules' };
          delete guess.gloss;
          cx.cur[i] = [guess, ...list.map((c) => (c.confidence > 0.3 ? { ...c, confidence: 0.3 } : c))];
        }
      } else if (list.some((c) => c.pos === 'PROPN') && !list.every((c) => c.pos === 'PROPN') && nameBeforeVerb(cx, i)) {
        // a clause opens with a capital whatever the word: but a name of the list before a verb or a comma is the name
        pick(cx, i, { pred: (c) => c.pos === 'PROPN', why: CLAUSE_START_WHY });
      }
    } else if (/^\p{Ll}/u.test(surface) && list.some((c) => c.pos === 'PROPN') && !list.every((c) => c.pos === 'PROPN')) {
      pick(cx, i, { pred: (c) => c.pos !== 'PROPN', why: 'written with a small letter: not a name' });
    }
  }
}

/** The word after token i is a conjugated verb, or a comma follows: "Drita është …", "Mira, ejani". */
function nameBeforeVerb(cx: Ctx, i: number): boolean {
  const next = cx.tokens[i + 1];
  if (next && !next.isWord) return /^,$/u.test(next.surface.trim());
  const k = nextWord(cx, i);
  return k !== undefined && cx.base[k].some(isFin) && !cx.base[k].some(isNominal);
}
