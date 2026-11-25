/**
 * Spelling checks on a learner's own Arabic (GoTell). MACHINE-DRAFTED, no Arabic teacher or Arabist has checked them. A small first
 * set: each check fires only on one whole written word from a CLOSED LIST, never on a pattern. AN EMPTY RESULT MEANS NOTHING WAS
 * FOUND, NEVER THAT THE ARABIC IS RIGHT: grammar, case endings, agreement, word choice and style are not looked at, and nothing is
 * said about vowel marks (a learner who writes none has made no error).
 *
 * Why so few: Arabic spelling errors of the kind a rule could catch are mostly ones where the wrong form is ALSO a real word (علي is a
 * name and على + ي; مدرسه can be "his teacher"; ان is أن, إن or آن; الا is إلا or ألا), and a check that fires on a real word is
 * wrong. So every word below is a form that, written this way, is (almost) never the intended word.
 *
 * Checks (all category 'spelling'; each skips a token the analyser reads as a proper name, a token with any vowel mark or tatweel, and
 * a token that is not exactly the listed word: prefixed forms such as وإلى are not examined):
 *   1. The hamza of a very common word written bare: الى → إلى, اذا → إذا, انا → أنا, اين → أين, اكثر → أكثر, اقل → أقل, احد → أحد,
 *      اول → أول. A suggestion is offered.
 *   2. ي and ى exchanged in a closed list: فى → في, هى → هي, الذى → الذي, التى → التي (the ى of Egyptian handwriting and some print;
 *      Modern Standard prints ي), and حتي → حتى, متي → متى (the ى is kept in these two). A suggestion is offered.
 *   3. هذة → هذه, اللة → الله (ة for ه). A suggestion is offered.
 *   4. ه for ة in a few very common feminine nouns (مدينه, جامعه, حكومه, وزاره, حياه, صلاه, مدرسه): the message says the word is
 *      normally written with ة and names the other reading («his …») it cannot rule out. NO suggestion and a lower confidence.
 */
import type { AnalyzedToken, ErrorCandidate, RawToken } from '../../core';
import { arKey } from './text';

const HAMZA: Readonly<Record<string, string>> = {
  الى: 'إلى', اذا: 'إذا', انا: 'أنا', اين: 'أين', اكثر: 'أكثر', اقل: 'أقل', احد: 'أحد', اول: 'أول',
};
const YA: Readonly<Record<string, string>> = { فى: 'في', هى: 'هي', الذى: 'الذي', التى: 'التي', حتي: 'حتى', متي: 'متى' };
const TA_FOR_HA: Readonly<Record<string, string>> = { هذة: 'هذه', اللة: 'الله' };
const HA_FOR_TA: Readonly<Record<string, readonly [correct: string, other: string]>> = {
  مدينه: ['مدينة', 'مدين + ه "his debtor"'],
  جامعه: ['جامعة', 'جامع + ه "his mosque / his collection"'],
  حكومه: ['حكومة', ''],
  وزاره: ['وزارة', ''],
  حياه: ['حياة', 'حيا + ه "his modesty"'],
  صلاه: ['صلاة', ''],
  مدرسه: ['مدرسة', 'مدرس + ه "his teacher"'],
};

const isName = (a: AnalyzedToken | undefined): boolean => (a?.candidates ?? []).some((c) => c.pos === 'PROPN');

export function checkArProduction(tokens: RawToken[], analyses: AnalyzedToken[], _sentence: string): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  tokens.forEach((t, i) => {
    if (!t.isWord) return;
    const s = t.surface;
    if (arKey(s) !== s || /[^ء-ي]/u.test(s)) return; // a vowel mark, tatweel, another script, a digit: not examined
    if (isName(analyses[i])) return;
    const fix = (replacement: string, message: string, confidence: number, suggest = true): void => {
      out.push({
        category: 'spelling', tokenIndexes: [i], message, confidence, affectsMeaning: false,
        ...(suggest ? { suggestion: { start: t.start, end: t.end, replacement } } : {}),
      });
    };
    const h = HAMZA[s];
    if (h) return fix(h, `Standard spelling writes the hamza on the alif in this word: ${h}.`, 0.8);
    const y = YA[s];
    if (y) {
      const kept = y === 'حتى' || y === 'متى';
      return fix(y, kept ? `This word ends in alif maqṣūra (ى), not yāʾ: ${y}.` : `Modern Standard Arabic writes this word with a dotted ي: ${y}.`, 0.8);
    }
    const ta = TA_FOR_HA[s];
    if (ta) return fix(ta, `This word is written with ه, not ة: ${ta}.`, 0.85);
    const ha = HA_FOR_TA[s];
    if (ha) {
      return fix(ha[0], `This word is normally written with tāʾ marbūṭa: ${ha[0]}.${ha[1] ? ` If you meant ${ha[1]}, leave it as it is.` : ''}`, 0.5, false);
    }
  });
  return out;
}
