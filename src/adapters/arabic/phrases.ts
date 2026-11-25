/**
 * Fixed expressions of Arabic that are headwords of the dictionary (من أجل, على الرغم, كيف حالك, نظام تشغيل …), found as an EXTRA layer over
 * the words of a sentence: each word keeps its own readings; the phrase says that these words belong together.
 *
 * SOURCE RULE. An expression is listed only if it is a multi-word headword with a sense of its own in the Wiktionary Arabic extract
 * (kaikki.org, CC BY-SA 4.0), and its gloss is that sense's own, shortened. generated/phrases.ts is written by scripts/ar-build-phrases.mts
 * (about 58 KB: the shortest and most useful first); nothing here is a list of this adapter's own.
 *
 * Matching: the words of a headword must stand next to each other, in this order, in one clause. Words are compared by `arKey` through the
 * loose fold (a hamza or ى typed plainly still matches). The FIRST word of the sentence's match may carry a conjunction, preposition or
 * article written onto it (وَمِنْ أَجْلِ, لِمِنْ …: و ف ب ل ك ال and their chains); the other words must stand as the headword has them (a
 * pronoun suffix or an article on a later word is a different phrase).
 *
 * MACHINE-DRAFTED matching rules; the headwords and glosses are the dictionary's, not reviewed by a native speaker or an Arabist.
 */
import type { AnalyzedToken, PhraseCandidate, RawToken } from '../../core/adapters';
import { AR_PHRASES } from './generated/phrases';
import { arKey, arLoose } from './text';

interface Entry { words: string[]; text: string; pos: string; gloss: string }

const norm = (w: string): string => arLoose(arKey(w));
const ENTRIES: Entry[] = AR_PHRASES.map(([text, pos, gloss]) => ({ words: text.split(' ').map(norm), text, pos, gloss }));
const BY_FIRST = new Map<string, Entry[]>();
for (const e of ENTRIES) {
  const l = BY_FIRST.get(e.words[0]);
  if (l) l.push(e); else BY_FIRST.set(e.words[0], [e]);
}
for (const l of BY_FIRST.values()) l.sort((a, b) => b.words.length - a.words.length);

/** The letters that may be written onto the first word: و ف (a conjunction), ب ك ل (a preposition), ال, and the chains the clitic grammar allows. */
const PREFIXES = new Set(['', 'و', 'ف', 'ب', 'ك', 'ل', 'ال', 'وب', 'ول', 'وك', 'فب', 'فل', 'فك', 'وال', 'فال', 'بال', 'كال', 'لل', 'وبال', 'ولل', 'وكال', 'فبال', 'فلل']);

/** The first words of a headword a written word may stand for: itself, and itself with the letters of a clitic chain cut off (للطالب = ل + الطالب). */
function firstWords(w: string): Array<{ first: string; prefixed: boolean }> {
  const out: Array<{ first: string; prefixed: boolean }> = [];
  for (let cut = 0; cut <= Math.min(4, w.length - 1); cut++) {
    const p = w.slice(0, cut);
    if (!PREFIXES.has(p)) continue;
    const rest = w.slice(cut);
    out.push({ first: rest, prefixed: cut > 0 });
    // لل is ل + ال: the article's alif is not written after the lām
    if (p.endsWith('ل') && rest.startsWith('ل')) out.push({ first: `ا${rest}`, prefixed: true });
  }
  return out;
}

const KIND: Record<string, PhraseCandidate['kind']> = { phrase: 'formula', intj: 'formula', proverb: 'idiom', prep: 'collocation', prep_phrase: 'collocation', conj: 'collocation', adv: 'collocation' };

/** The dictionary's fixed expressions in one sentence; the longest match at a place wins, matches never overlap. */
export function detectArPhrases(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[] {
  void analyses;
  // the next word of the same clause with only spaces between (a word with no reading is still a word)
  const nextWord = (i: number): number => {
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].isWord) return j;
      if (!/^s*$/.test(tokens[j].surface)) return -1;
    }
    return -1;
  };
  const out: PhraseCandidate[] = [];
  let free = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (i < free || !tokens[i].isWord) continue;
    const w = norm(tokens[i].surface);
    // the whole word first, then the words with a clitic chain cut off the front
    let best: { e: Entry; idx: number[]; prefixed: boolean } | undefined;
    const tried = new Set<string>();
    for (const { first, prefixed } of firstWords(w)) {
      for (const e of BY_FIRST.get(first) ?? []) {
        if (tried.has(e.text)) continue;
        tried.add(e.text);
        const idx = [i];
        let ok = true;
        for (let k = 1; k < e.words.length; k++) {
          const nx = nextWord(idx[idx.length - 1]);
          if (nx < 0 || norm(tokens[nx].surface) !== e.words[k]) { ok = false; break; }
          idx.push(nx);
        }
        if (ok && (!best || e.words.length > best.e.words.length || (e.words.length === best.e.words.length && !prefixed && best.prefixed))) best = { e, idx, prefixed };
      }
    }
    if (!best) continue;
    out.push({
      pattern: best.e.words, display: best.e.text, kind: KIND[best.e.pos] ?? 'collocation', tokenIndexes: best.idx,
      confidence: best.prefixed ? 0.65 : 0.7, gloss: best.e.gloss,
    });
    free = best.idx[best.idx.length - 1] + 1;
  }
  return out;
}
