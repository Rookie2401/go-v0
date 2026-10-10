/**
 * Thai "paradigm" (GoLearn Linguistic Engine V2, Stage 3). Thai words do not inflect, so there is no table and no cell:
 * `paradigm()` returns `kind: 'none'` with the CONSTRUCTIONS that matter for the word's part of speech (ids of
 * `constructions.ts` and its five first-seed detectors) and, for a counted noun, the classifier the word list records.
 * The card shows those constructions in the Forms section instead of an empty table (docs/ecosystem/linguistics/PARADIGMS-th.md).
 *
 * Nothing here is generated or invented: every id is a construction the adapter's own `detectPatterns` can report
 * (the test checks the vocabulary in both directions), and a noun's classifier is named only when the classifier's recorded
 * `counts` text (classifiers.ts, function-words.ts) names the noun's gloss. The adapter has no noun -> classifier table.
 *
 * Imports no value from the adapter (th.ts passes a context in), so there is no import cycle and nothing from core's index.
 */
import type { GeneratedParadigm } from '../../core/paradigm';
import type { PartOfSpeech } from '../../core/model';

export interface ThaiClassifierInfo { lemma: string; counts: string }

/** What the paradigm needs from the adapter's word list (th.ts builds it; kept out of this file so it does not import th.ts). */
export interface ThaiParadigmContext {
  /** The word list's gloss of the lemma for the part of speech, if it has the word. */
  glossOf(lemma: string, pos: PartOfSpeech): string | undefined;
  /** The word counts itself (วัน, ครั้ง ...): a number may follow it without a classifier. */
  isUnit(lemma: string): boolean;
  /** The classifiers of the word list, each with the plain-words `counts` text (what it counts). */
  classifiers(): readonly ThaiClassifierInfo[];
}

/**
 * Every construction id `detectPatterns` can report: the five first-seed detectors (constructions.ts `baseConstructions`)
 * and the keys of `THAI_CONSTRUCTIONS`. The test compares this list with the detectors.
 */
export const THAI_CONSTRUCTION_IDS: readonly string[] = [
  'royal-verb', 'negation-mai', 'classifier-phrase', 'final-particle', 'nominalizer-khwam',
  'progressive-kamlang', 'continuing-yu', 'future-ja', 'experience-khoey', 'completed-laeo', 'not-yet-yang-mai',
  'did-not-mai-dai', 'ability-dai', 'dai-before-verb', 'modal-before-verb', 'passive-thuk', 'causative-hai',
  'benefactive-hai', 'relative-thi', 'complement-wa', 'comparative-kwa', 'superlative-thisut', 'classifier-demonstrative',
  'reduplication-mai-yamok', 'directional-after-verb', 'conditional-tha-ko', 'cause-result-phro-chung', 'nominalizer-kan',
  'yes-no-question', 'question-word-in-place', 'ordinal-thi', 'prohibition-ya', 'not-at-all-mai-loei',
];

const QUESTION_WORDS = ['อะไร', 'ใคร', 'ไหน', 'กี่', 'ทำไม', 'เมื่อไร', 'อย่างไร', 'ที่ไหน', 'เท่าไร', 'ยังไง', 'ไง', 'ไร'];
/** Verbs after which ว่า introduces what was said, thought or known (the same set as the `complement-wa` detector). */
const SAYING = ['พูด', 'บอก', 'คิด', 'รู้', 'เชื่อ', 'เห็น', 'เข้าใจ', 'กลัว', 'หวัง', 'ถาม', 'ตอบ', 'รู้สึก', 'จำ', 'ลืม', 'ได้ยิน'];

/** The constructions a word itself heads or marks, by lemma. They come first in a word's list. */
const BY_LEMMA: Record<string, readonly string[]> = {
  'กำลัง': ['progressive-kamlang'],
  'อยู่': ['continuing-yu', 'progressive-kamlang'],
  'จะ': ['future-ja'],
  'เคย': ['experience-khoey'],
  'แล้ว': ['completed-laeo'],
  'ยัง': ['not-yet-yang-mai'],
  'ไม่': ['negation-mai', 'did-not-mai-dai', 'not-yet-yang-mai', 'not-at-all-mai-loei'],
  'ไม่มี': ['not-at-all-mai-loei'],
  'ได้': ['ability-dai', 'dai-before-verb', 'did-not-mai-dai'],
  'ต้อง': ['modal-before-verb'], 'ควร': ['modal-before-verb'], 'อยาก': ['modal-before-verb'],
  'อาจ': ['modal-before-verb'], 'น่าจะ': ['modal-before-verb'], 'คง': ['modal-before-verb'],
  'ถูก': ['passive-thuk'], 'โดน': ['passive-thuk'],
  'ให้': ['causative-hai', 'benefactive-hai'], 'ทำให้': ['causative-hai'],
  'ที่': ['relative-thi', 'ordinal-thi'],
  'ว่า': ['complement-wa'],
  'กว่า': ['comparative-kwa'], 'ที่สุด': ['superlative-thisut'],
  'นี้': ['classifier-demonstrative'], 'นั้น': ['classifier-demonstrative'], 'โน้น': ['classifier-demonstrative'],
  'ๆ': ['reduplication-mai-yamok'],
  'ถ้า': ['conditional-tha-ko'], 'ก็': ['conditional-tha-ko'],
  'เพราะ': ['cause-result-phro-chung'], 'จึง': ['cause-result-phro-chung'],
  'การ': ['nominalizer-kan'], 'ความ': ['nominalizer-khwam'],
  'ไหม': ['yes-no-question', 'final-particle'], 'มั้ย': ['yes-no-question', 'final-particle'], 'เหรอ': ['yes-no-question', 'final-particle'],
  'ครับ': ['final-particle'], 'ค่ะ': ['final-particle'], 'คะ': ['final-particle'], 'นะ': ['final-particle'], 'ฮะ': ['final-particle'],
  'จ้ะ': ['final-particle'], 'จ๊ะ': ['final-particle'], 'ล่ะ': ['final-particle'], 'สิ': ['final-particle'], 'เถอะ': ['final-particle'],
  'อย่า': ['prohibition-ya'],
  'เลย': ['not-at-all-mai-loei'],
  'ทรง': ['royal-verb'],
  'ไป': ['directional-after-verb'], 'มา': ['directional-after-verb'], 'ขึ้น': ['directional-after-verb'],
  'ลง': ['directional-after-verb'], 'เข้า': ['directional-after-verb'], 'ออก': ['directional-after-verb'],
  ...Object.fromEntries(QUESTION_WORDS.map((w) => [w, ['question-word-in-place']])),
  ...Object.fromEntries(SAYING.map((w) => [w, ['complement-wa']])),
};

/** What every word of a part of speech takes part in, listed after the constructions of its own lemma. */
const BY_POS: Partial<Record<PartOfSpeech, readonly string[]>> = {
  VERB: ['progressive-kamlang', 'continuing-yu', 'future-ja', 'experience-khoey', 'completed-laeo', 'negation-mai', 'did-not-mai-dai',
    'not-yet-yang-mai', 'not-at-all-mai-loei', 'ability-dai', 'modal-before-verb', 'prohibition-ya', 'passive-thuk', 'causative-hai',
    'benefactive-hai', 'directional-after-verb', 'nominalizer-kan'],
  ADJ: ['negation-mai', 'future-ja', 'completed-laeo', 'comparative-kwa', 'superlative-thisut', 'not-at-all-mai-loei', 'nominalizer-khwam', 'reduplication-mai-yamok'],
  NOUN: ['classifier-phrase', 'classifier-demonstrative', 'reduplication-mai-yamok', 'relative-thi'],
  CLF: ['classifier-phrase', 'classifier-demonstrative'],
  NUM: ['classifier-phrase', 'ordinal-thi'],
  DET: ['classifier-demonstrative'],
  PART: ['final-particle'],
};

const NO_INFLECTION = 'Thai words never change form: there is no conjugation, declension, gender or number marking, so there is no table, and what a word does is shown by the words around it.';

const POS_NOTES: Partial<Record<PartOfSpeech, string[]>> = {
  VERB: [
    'Tense, aspect and negation are separate words placed beside the verb (กำลัง, จะ, เคย, แล้ว, อยู่, ไม่), never changes to the verb itself.',
    'Verbs are often strung together with no linking word (serial verbs, ไปซื้อ "go and buy"); the card shows each verb as its own word.',
  ],
  AUX: ['An auxiliary is a separate word before or after the verb; it marks aspect, mood or voice.'],
  ADJ: ['An adjective follows its noun and is used without a linking verb (บ้านใหญ่ "the house is big"); it does not agree with the noun.'],
  NOUN: ['A noun has no plural form: number comes from the context, from a number + classifier, or sometimes from repeating the word with ๆ.'],
  CLF: ['A classifier stands between a number (or a demonstrative) and the thing counted: noun + number + classifier.'],
  NUM: ['A number goes after the noun it counts and before the classifier.'],
  PART: ['A particle closes a sentence or softens it; it adds politeness, mood or a question, and does not change.'],
  PRON: ['A pronoun has no case or number forms; the same word serves as subject and object.'],
};

/** Spellings under which a plural or singular English gloss term can meet the other ("leaves" / "leaf", "knives" / "knife"). */
function termVariants(term: string): string[] {
  const t = term.trim().toLowerCase();
  const out = new Set<string>([t, `${t}s`]);
  if (t.endsWith('ies')) out.add(`${t.slice(0, -3)}y`);
  if (t.endsWith('ves')) { out.add(`${t.slice(0, -3)}f`); out.add(`${t.slice(0, -3)}fe`); }
  if (t.endsWith('es')) out.add(t.slice(0, -2));
  if (t.endsWith('s')) out.add(t.slice(0, -1));
  if (t.endsWith('y')) out.add(`${t.slice(0, -1)}ies`);
  if (t.endsWith('f')) out.add(`${t.slice(0, -1)}ves`);
  if (t.endsWith('fe')) out.add(`${t.slice(0, -2)}ves`);
  return [...out];
}

/** The terms of a gloss ("pig; pork" -> pig, pork; "glass (for drinking)" -> glass; "to love" -> love). */
function glossTerms(gloss: string): string[] {
  return gloss.replace(/\([^)]*\)/gu, ' ').split(/[;,]/u)
    .map((s) => s.trim().toLowerCase().replace(/^(?:to|the|a|an)\s+/u, '').trim()).filter(Boolean);
}

/** The terms of a classifier's `counts` text ("bottles, and what is in them" -> bottles; "glasses of drink" -> glasses). */
function countTerms(counts: string): string[] {
  return counts.replace(/,?\s*and what is in them/u, '').split(/[;,]/u).map((s) => s.trim().toLowerCase().split(/\s+of\s+/u)[0]).filter(Boolean);
}

/** The classifiers whose recorded `counts` text names this gloss (a plain-words match: the word list has no noun -> classifier table). */
export function classifiersFor(gloss: string, classifiers: readonly ThaiClassifierInfo[]): ThaiClassifierInfo[] {
  const wanted = new Set(glossTerms(gloss).flatMap(termVariants));
  const out: ThaiClassifierInfo[] = [];
  for (const c of classifiers) {
    if (out.some((o) => o.lemma === c.lemma)) continue;
    if (countTerms(c.counts).some((t) => termVariants(t).some((v) => wanted.has(v)))) out.push({ lemma: c.lemma, counts: c.counts });
  }
  return out;
}

/** The construction ids that matter for the lemma and part of speech: its own first, then its part of speech's, without repeats. */
export function thaiConstructionsFor(lemma: string, pos: PartOfSpeech): string[] {
  return [...new Set([...(BY_LEMMA[lemma] ?? []), ...(BY_POS[pos] ?? [])])];
}

/**
 * The Thai "paradigm": no cells, the note that Thai does not inflect, and the constructions to show instead. Never `undefined`:
 * "this word does not inflect" is true of every Thai word, listed or not.
 */
export function makeThaiParadigm(ctx: ThaiParadigmContext): (lemma: string, pos: PartOfSpeech) => GeneratedParadigm {
  return (lemma, pos) => {
    const notes = [NO_INFLECTION, ...(POS_NOTES[pos] ?? [])];
    if (pos === 'NOUN') {
      const gloss = ctx.glossOf(lemma, pos);
      if (ctx.isUnit(lemma)) {
        notes.push(`${lemma} counts itself: a number follows it without a classifier.`);
      } else if (gloss) {
        const found = classifiersFor(gloss, ctx.classifiers());
        notes.push(found.length
          ? `Classifier: ${found.map((c) => `${c.lemma} (counts ${c.counts})`).join('; ')}. The word list names it by what the classifier counts, not by a rule for this noun.`
          : 'The word list records no classifier for this noun; a dictionary entry may name one.');
      }
    }
    return { kind: 'none', cells: [], template: 'does not inflect', notes, constructions: thaiConstructionsFor(lemma, pos) };
  };
}
