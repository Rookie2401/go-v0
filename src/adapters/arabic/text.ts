/**
 * Arabic text: the marks, the views of one written word, the tokenizer and the sentence splitter. Shared by the adapter at run time
 * and by the build scripts (scripts/ar-*.mts), so a form is keyed the same way in the generated index and at lookup.
 *
 * Five views of one written word (docs/arabic/PLAN.md):
 *   printed     exactly as the page has it. Never changed, never written back.
 *   canonical   `arCanon`: NFC (so marks stand in one order), presentation forms and ligatures turned back into letters, a
 *               fatḥatān printed after its alif moved before it. Every letter and every mark is kept.
 *   key         `arKey`: canonical with every mark and the tatweel removed, alif waṣla read as alif and the Persian kāf / yeh that
 *               copied text carries read as the Arabic letters. The dictionary and the form index are keyed by it. The hamza seats
 *               (أ إ آ ؤ ئ ء), ة and ى are KEPT: they distinguish words.
 *   loose       `arLoose`: the key with what careless print confuses folded (أ إ آ → ا, ى → ي, ة → ه, and the borrowed letters
 *               ڤ پ چ گ as ف ب ج ك). Used only to FIND candidates; a reading reached this way says so and is never an identity.
 *   vocalized   a dictionary form with its vowels, stored per reading as `packVocal` beside the key and shown with `applyVocal`.
 * A lexeme's identity is its vocalized headword in ONE spelling convention (`arHeadForm`): عِلْم is not عَلَم; see index-store.ts.
 *
 * Every mark and invisible character below is written as an escape, so nothing hides in this file.
 */
import type { RawToken, Span } from '../../core';
import { makeWordTokenizer, splitSentences } from '../shared';

export const FATHATAN = '\u064B', DAMMATAN = '\u064C', KASRATAN = '\u064D', FATHA = '\u064E', DAMMA = '\u064F', KASRA = '\u0650';
export const SHADDA = '\u0651', SUKUN = '\u0652', DAGGER_ALIF = '\u0670', TATWEEL = '\u0640';
export const ALIF = '\u0627', ALIF_WASLA = '\u0671', ALIF_MAQSURA = '\u0649', TA_MARBUTA = '\u0629', HAMZA = '\u0621';
const ALIF_MADDA = '\u0622', WAW = '\u0648', YA = '\u064A', LAM = '\u0644', MADDA_ABOVE = '\u0653';

/** Every combining mark of Arabic print: tashkīl, Quranic annotation signs, the extended marks. (Hamza and madda marks compose in NFC.) */
const MARK_CLASS = '\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u08D3-\u08FF';
const MARK = new RegExp(`[${MARK_CLASS}]`);
const MARKS_G = new RegExp(`[${MARK_CLASS}]`, 'g');
/** Format characters that are not part of a word: tatweel, zero-width joiners, direction marks, soft hyphen, the byte-order mark. */
const FILLER_CLASS = '\u0640\u200C\u200D\u200E\u200F\u061C\u00AD\uFEFF';
const FILLER = new RegExp(`[${FILLER_CLASS}]`);
const FILLER_G = new RegExp(`[${FILLER_CLASS}]`, 'g');
/** Arabic presentation forms (ligatures and positional shapes copied from PDFs). */
const PRESENTATION_G = /[\uFB50-\uFDFF\uFE70-\uFEFC]/g;
/** Ligatures that stand for several words (ﷺ, ﷻ, the basmala) and the rial sign: symbols, never expanded into a "word" with spaces. */
const PHRASE_LIGATURE = /[\uFDFA-\uFDFD]/;
/** An Arabic letter (the basic block's letters and the few extended ones the key folds or the loose fold reads). */
export const ARABIC_LETTER = /[\u0621-\u063A\u0641-\u064A\u0671\u06A9\u06CC\u06A4\u067E\u0686\u06AF]/u;
const ARABIC_LETTERS_G = /[\u0621-\u063A\u0641-\u064A]/gu;
/** The 28 letters in alphabet order (hamza and the seats, ة and ى are spellings, not letters of the alphabet). */
export const ARABIC_ALPHABET = [...'\u0627\u0628\u062A\u062B\u062C\u062D\u062E\u062F\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063A\u0641\u0642\u0643\u0644\u0645\u0646\u0647\u0648\u064A'];
/** The letters that do not join the letter after them: ا د ذ ر ز و and the spellings built on them, with ء, ة and ى. */
export const NON_JOINING = new Set([...'\u0627\u062F\u0630\u0631\u0632\u0648', '\u0623', '\u0625', '\u0622', '\u0624', '\u0621', '\u0629', '\u0649']);
/** The sun letters: the article's lām is assimilated to them in speech (the spelling ال never changes). */
export const SUN_LETTERS = new Set([...'\u062A\u062B\u062F\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0644\u0646']);
/**
 * Letters Arabic does not use but Persian, Urdu, Pashto, Kurdish, Uyghur and Sindhi do. The key FOLDS ک and ی (copied Arabic text
 * carries them), so a check for another language's text must look at the PRINTED text, before any folding (docs/arabic/PLAN.md).
 */
export const NOT_ARABIC_LETTERS = /[\u067E\u0686\u0698\u06AF\u0679\u0688\u0691\u06BA\u06C1\u06BE\u06D2\u06C6\u06CE\u06D5\u06C7\u06C8\u06C9\u06CB\u06D0\u0672-\u0678\u067A-\u067D\u067F-\u0685\u0687\u0689-\u0690\u0692-\u0697\u0699-\u06A3\u06A5-\u06A8\u06AA-\u06AE\u06B0-\u06B9\u06BB-\u06BD\u06BF\u06C0\u06C2-\u06C5\u06CA\u06CD\u06CF\u06D1\u06D3]/u;

/** The canonical form of printed text: see the file comment. Letters and marks are all kept. */
export function arCanon(text: string): string {
  let s = text.replace(PRESENTATION_G, (c) => {
    if (PHRASE_LIGATURE.test(c)) return c;
    const n = c.normalize('NFKC');
    // the spacing vowel signs (U+FE70 …) decompose to a SPACE and the mark: the space is not part of the text
    return c >= '\uFE70' && c <= '\uFE7F' ? n.replace(/ /g, '') : n;
  }).normalize('NFC');
  // كتاباً (the tanwīn typed after the alif) is the same word as كتابًا: the mark belongs to the letter before the alif
  s = s.replace(/([\u0627\u0649])\u064B/g, `${FATHATAN}$1`);
  return s.normalize('NFC');
}

const fold = (s: string): string => s.replace(/\u0671/g, ALIF).replace(/\u06A9/g, '\u0643').replace(/\u06CC/g, YA);

/** The lookup key of a written form: see the file comment. */
export function arKey(form: string): string {
  return fold(arCanon(form).replace(MARKS_G, '').replace(FILLER_G, ''));
}

/**
 * The loose fold of a key (candidate retrieval only): hamza on or under alif and madda dropped, ى as ي, ة as ه, and the letters
 * Arabic print borrows for foreign sounds read as the nearest Arabic one (ڤ ف, پ ب, چ ج, گ ك). Same length as the key.
 */
export function arLoose(key: string): string {
  return key.replace(/[\u0623\u0625\u0622\u0671]/g, ALIF).replace(/\u0649/g, YA).replace(/\u0629/g, '\u0647')
    .replace(/\u06A4/g, '\u0641').replace(/\u067E/g, '\u0628').replace(/\u0686/g, '\u062C').replace(/\u06AF/g, '\u0643');
}
/** True when the key holds a borrowed letter (ڤ پ چ گ): the dictionary spells the word with an Arabic letter, so the fold itself is looked up. */
export const hasBorrowedLetter = (key: string): boolean => /[\u06A4\u067E\u0686\u06AF]/.test(key);

/** True when the printed word ends in the Persian yeh ی: in Arabic text it stands for ي and, as often, for ى (علی is على). */
export const endsInFarsiYeh = (surface: string): boolean => new RegExp(`\u06CC[${MARK_CLASS}${FILLER_CLASS}]*$`).test(surface);

/** What a search box matches on. */
export const arSearchNormalize = (q: string): string => arLoose(arKey(q)).trim();

// ───────────────────────────── vocalization ─────────────────────────────

/** Quranic print: the sukūn written as a small head of khāʾ, and the "open" tanwīn (standard and the King Fahd font's own code points). */
const QURANIC_SUKUN = '\u06E1';
const OPEN_TANWIN: Record<string, string> = { '\u08F0': FATHATAN, '\u08F1': DAMMATAN, '\u08F2': KASRATAN };
/** These three mean an open tanwīn only at the end of a word (elsewhere they are other signs). */
const OPEN_TANWIN_FINAL: Record<string, string> = { '\u0657': FATHATAN, '\u065E': DAMMATAN, '\u0656': KASRATAN };

/** True when the form carries any vowel mark, shadda, sukūn or dagger alif (the Quranic sukūn and open tanwīn included). */
export const hasTashkil = (form: string): boolean => /[\u064B-\u0652\u0670\u06E1\u08F0-\u08F2]/.test(form);

const VOWELS = ['', FATHA, KASRA, DAMMA, SUKUN, FATHATAN, KASRATAN, DAMMATAN] as const;
const B32 = '0123456789abcdefghijklmnopqrstuv';

/** The marks of one letter: its vowel sign (or sukūn or tanwīn), whether it is doubled, whether a dagger alif follows. */
export interface LetterMarks { vowel: string; shadda: boolean; dagger: boolean }
const NO_MARKS: LetterMarks = { vowel: '', shadda: false, dagger: false };

/** A written form as its key and the marks on each key letter (same length). Marks before the first letter are dropped. */
export function splitVocal(form: string): { key: string; marks: LetterMarks[] } {
  const s = fold(arCanon(form).replace(FILLER_G, ''));
  let key = '';
  const marks: LetterMarks[] = [];
  const late: Array<[number, string]> = [];
  for (const ch of s) {
    if (!MARK.test(ch)) { key += ch; for (let i = 0; i < ch.length; i++) marks.push({ ...NO_MARKS }); continue; }
    const m = marks[marks.length - 1];
    if (!m) continue;
    if (ch === SHADDA) m.shadda = true;
    else if (ch === DAGGER_ALIF) m.dagger = true;
    else if (ch === QURANIC_SUKUN) m.vowel = SUKUN;
    else if (OPEN_TANWIN[ch]) m.vowel = OPEN_TANWIN[ch];
    else if (OPEN_TANWIN_FINAL[ch]) late.push([marks.length - 1, OPEN_TANWIN_FINAL[ch]]);
    else if ((VOWELS as readonly string[]).includes(ch)) m.vowel = ch;
  }
  // the font-specific open tanwīn counts only on the last letter, or on the letter before a final ا / ى
  for (const [i, v] of late) {
    const last = i === key.length - 1 || (i === key.length - 2 && (key[i + 1] === ALIF || key[i + 1] === ALIF_MAQSURA));
    if (last && !marks[i].vowel) marks[i].vowel = v;
  }
  return { key, marks };
}

const packMarks = (marks: LetterMarks[]): string => {
  let out = '';
  for (const m of marks) out += B32[(VOWELS as readonly string[]).indexOf(m.vowel) + (m.shadda ? 8 : 0) + (m.dagger ? 16 : 0)];
  return out.replace(/0+$/, '');
};

/**
 * The vocalization of a form, packed: one character a key letter (vowel 0–7, +8 when doubled, +16 with a dagger alif, in base 32),
 * trailing unmarked letters trimmed. "" for an unvocalized form. `applyVocal(arKey(form), packVocal(form))` gives the form back.
 */
export function packVocal(form: string): string { return packMarks(splitVocal(form).marks); }

/** The marks a packed vocalization puts on each letter of a key. */
export function unpackVocal(key: string, packed: string | undefined): LetterMarks[] {
  const out: LetterMarks[] = [];
  for (let i = 0; i < key.length; i++) {
    const n = packed && i < packed.length ? B32.indexOf(packed[i]) : 0;
    out.push(n <= 0 ? { ...NO_MARKS } : { vowel: VOWELS[n & 7], shadda: (n & 8) !== 0, dagger: (n & 16) !== 0 });
  }
  return out;
}

/** The key with its vowels written on it (NFC). */
export function applyVocal(key: string, packed: string | undefined): string {
  if (!packed) return key;
  const marks = unpackVocal(key, packed);
  let out = '';
  for (let i = 0; i < key.length; i++) out += key[i] + marks[i].vowel + (marks[i].shadda ? SHADDA : '') + (marks[i].dagger ? DAGGER_ALIF : '');
  return out.normalize('NFC');
}

/** How much of a printed word is vocalized: none, part, or (nearly) every letter that can carry a vowel. */
export function tashkilLevel(surface: string): 'none' | 'partial' | 'full' {
  const { key, marks } = splitVocal(surface);
  let can = 0, has = 0, any = false;
  for (let i = 0; i < key.length; i++) {
    const marked = !!marks[i].vowel || marks[i].shadda || marks[i].dagger;
    if (marked) any = true;
    // not counted: the last letter (a pausal form leaves it bare) and a bare long-vowel letter (it needs no mark)
    if (i === key.length - 1) continue;
    if (!marked && (key[i] === ALIF || key[i] === ALIF_MAQSURA || key[i] === WAW || key[i] === YA)) continue;
    can++;
    if (marked) has++;
  }
  if (!any) return 'none';
  return can === 0 || has / can >= 0.7 ? 'full' : 'partial';
}

const bare = (m: LetterMarks | undefined): boolean => !!m && !m.vowel && !m.shadda;

/**
 * What a vocalized form says about the vowel of letter i, for comparison with print. Sources and pages both leave IMPLIED vowels
 * off (the fatḥa before an alif, an alif maqṣūra or a dagger alif; the kasra before a long ī; the ḍamma before a long ū), so:
 *   { vowel }            the form states or implies this vowel
 *   { long: true }       the letter is itself a long vowel (a bare ا, ى, or a bare و / ي after its vowel): it carries no vowel
 *   {}                   the form says nothing about this letter (a bare letter is not evidence)
 */
function saidOf(key: string, m: LetterMarks[], i: number): { vowel?: string; soft?: string; long?: boolean } {
  const me = m[i];
  if (me.vowel) return { vowel: me.vowel };
  if (me.dagger) return { vowel: FATHA };
  const next = key[i + 1];
  const prev = m[i - 1];
  // is this letter itself a long vowel?
  if (!me.shadda && i > 0) {
    if (key[i] === ALIF || key[i] === ALIF_MAQSURA) return { long: true };
    if (key[i] === WAW && (prev.vowel === DAMMA || (!prev.vowel && !prev.dagger))) return { long: true };
    if (key[i] === YA && (prev.vowel === KASRA || (!prev.vowel && !prev.dagger))) return { long: true };
  }
  if (next !== undefined && bare(m[i + 1])) {
    // the fatḥa before a long ā is certain (an alif after another vowel always carries a hamza or its own mark)
    if ((next === ALIF && !(i === 0 && key[0] === ALIF)) || next === ALIF_MAQSURA) return { vowel: FATHA };
    // before a bare و / ي the vowel is only LIKELY the matching one: it supports print that agrees and never contradicts print that does not
    if (next === WAW) return { soft: DAMMA };
    if (next === YA) return { soft: KASRA };
  }
  return {};
}

export interface VocalMatch {
  /** No printed mark contradicts the candidate. */
  compatible: boolean;
  /** How many printed marks the candidate agrees with (evidence FOR it). */
  agreed: number;
  /** The first contradiction: the letter's position in the key and what was printed against what the candidate has. */
  conflict?: { at: number; printed: string; candidate: string };
  /** True when the only disagreement is the vowel of the last letter (the case or mood ending). */
  endingOnly?: boolean;
}

/**
 * Does a printed (fully, partly or not at all vocalized) word agree with a vocalized candidate of the same length of key? Only what
 * is PRINTED is compared, and only against what the candidate actually SAYS: a letter printed bare constrains nothing, and a letter
 * the candidate leaves bare is not evidence against a printed vowel (sources leave implied vowels and final endings off). Implied
 * vowels count as said (`saidOf`): printed هَٰذَا agrees with a source هٰذَا, printed كِتَاب with كِتاب. A printed vowel on a letter the
 * candidate reads as a long vowel contradicts it; a printed shadda needs the candidate's. The keys may differ by the loose fold.
 * `afterArticle`: the candidate is a stem printed after ال, whose first letter print doubles when it is a sun letter (الشَّمْس):
 * that shadda belongs to the article and is not compared.
 */
export function vocalMatch(printed: string, candidateKey: string, candidatePacked: string | undefined, opts?: { afterArticle?: boolean }): VocalMatch {
  const p = splitVocal(printed);
  if (p.key.length !== candidateKey.length) return { compatible: false, agreed: 0 };
  if (!candidatePacked) return { compatible: true, agreed: 0 };
  const c = unpackVocal(candidateKey, candidatePacked);
  let agreed = 0;
  let conflict: VocalMatch['conflict'];
  let conflicts = 0;
  let lastOnly = true;
  for (let i = 0; i < p.key.length; i++) {
    const a = p.marks[i], b = c[i];
    const said = saidOf(candidateKey, c, i);
    let bad: string | undefined;
    if (a.vowel) {
      if (said.vowel !== undefined) {
        if (a.vowel === said.vowel) agreed++;
        else bad = a.vowel;
      } else if (said.long) {
        if (a.vowel !== SUKUN) bad = a.vowel;
      } else if (a.vowel === SUKUN || a.vowel === said.soft) agreed++;
    } else if (a.dagger && (b.dagger || said.vowel === FATHA)) agreed++;
    const articleShadda = opts?.afterArticle && i === 0 && SUN_LETTERS.has(candidateKey[0]);
    if (a.shadda && !articleShadda) { if (b.shadda) agreed++; else bad = bad ?? SHADDA; }
    if (bad !== undefined) {
      conflicts++;
      if (i !== p.key.length - 1) lastOnly = false;
      conflict ??= { at: i, printed: bad, candidate: (said.vowel ?? '') + (b.shadda ? SHADDA : '') };
    }
  }
  return { compatible: conflicts === 0, agreed, ...(conflict ? { conflict, endingOnly: lastOnly && conflicts === 1 } : {}) };
}

/**
 * The ONE spelling of a lexeme's headword (its identity): sources write the same word in several ways, and two spellings would be
 * two vocabulary items. Applied to every lemma at build time and to every hand-written headword:
 *   - an implied fatḥa before a plain alif is WRITTEN (كِتاب → كِتَاب);
 *   - a fatḥa on a letter that carries a dagger alif is NOT written (هَٰذَا → هٰذَا);
 *   - the kasra of an initial hamzat al-waṣl is written on a verb, and on a noun whose second letter is doubled or vowelless and is
 *     not a lām (اجْتَمَعَ → اِجْتَمَعَ, اسْم → اِسْم; the article is left alone);
 *   - the nominative ending of a single-word noun, adjective or name is dropped (كِتَابٌ → كِتَاب); the kasratān of قَاضٍ, the fatḥatān
 *     of هُدًى and a final fatḥa (كَتَبَ, بَعْدَ) are part of the citation form and stay.
 * Idempotent. Words of a multi-word headword are normalized one by one (their internal endings stay).
 */
export function arHeadForm(head: string, pos: string): string {
  const words = arCanon(head).trim().split(/\s+/).filter(Boolean);
  const nominal = pos === 'NOUN' || pos === 'ADJ' || pos === 'PROPN';
  return words.map((w, wi) => {
    const { key, marks } = splitVocal(w);
    const n = key.length;
    if (!n || !marks.some((m) => m.vowel || m.shadda || m.dagger)) return key;
    for (let i = 0; i < n; i++) {
      const m = marks[i];
      if (m.dagger && m.vowel === FATHA) m.vowel = '';
      const articleLam = i === 1 && key[0] === ALIF && key[1] === LAM && marks[2]?.vowel !== undefined && (marks[2].vowel === SUKUN || marks[2].shadda);
      if (!m.vowel && !m.dagger && i < n - 1 && key[i + 1] === ALIF && bare(marks[i + 1]) && key[i] !== ALIF && !articleLam
        && !(key[i] === WAW && i > 0 && marks[i - 1].vowel === DAMMA && i + 1 === n - 1)) m.vowel = FATHA;
    }
    if (wi === 0 && key[0] === ALIF && !marks[0].vowel && n > 1) {
      const second = marks[1];
      if (pos === 'VERB' || (nominal && key[1] !== LAM && (second.vowel === SUKUN || second.shadda))) marks[0].vowel = KASRA;
    }
    // the article is written bare (no fatḥa on its alif), and a final alif maqṣūra carries no dagger alif
    if (key[0] === ALIF && key[1] === LAM && marks[0].vowel === FATHA && n > 2 && (marks[1].vowel === SUKUN || marks[1].shadda || (!marks[1].vowel && marks[2].shadda))) marks[0].vowel = '';
    if (key[n - 1] === ALIF_MAQSURA && marks[n - 1].dagger && !marks[n - 1].vowel) marks[n - 1].dagger = false;
    if (nominal && words.length === 1 && (marks[n - 1].vowel === DAMMA || marks[n - 1].vowel === DAMMATAN)) marks[n - 1].vowel = '';
    return applyVocal(key, packMarks(marks));
  }).join(' ');
}

/**
 * Quranic (ʿUthmānī) spelling rewritten in the ordinary one, so the word can be looked up: the dagger alif that stands for a written
 * ā becomes ا (ٱلۡعَٰلَمِينَ → العالمين, ٱلصَّلَوٰةَ → الصلاة, يَٰٓأَيُّهَا → ياأيها), a madda that only marks length is dropped
 * (ٱلضَّآلِّينَ → الضالين) and ءَا at the start of a word is آ. `at[i]` is the offset in `surface` of the character that produced
 * `text[i]` (and `at[text.length]` is `surface.length`), so parts found in the rewritten word can be pointed at in the printed one.
 * Undefined when nothing changes. This is an ALTERNATIVE reading of the spelling: هٰذَا and ذٰلِكَ are found as they stand, and the
 * analyser tries both and lets the printed vowels decide. Limited: the small waw and yāʾ of the Quran text and its pause signs are
 * simply marks here.
 */
export function arQuranicSpelling(surface: string, opts?: { daggers?: boolean }): { text: string; at: number[] } | undefined {
  const daggers = opts?.daggers !== false;
  type Cluster = { base: string; marks: string; at: number };
  const clusters: Cluster[] = [];
  let i = 0;
  for (const ch of surface) {
    const at = i;
    i += ch.length;
    if ((MARK.test(ch) || (FILLER.test(ch) && ch !== TATWEEL)) && clusters.length) clusters[clusters.length - 1].marks += ch;
    else clusters.push({ base: ch, marks: '', at });
  }
  let text = '';
  const at: number[] = [];
  let changed = false;
  const put = (s: string, from: number): void => { for (let k = 0; k < s.length; k++) at.push(from); text += s; };
  const isLetter = (c: Cluster | undefined): boolean => !!c && ARABIC_LETTER.test(c.base);
  for (let c = 0; c < clusters.length; c++) {
    const cl = clusters[c];
    const prev = clusters[c - 1], next = clusters[c + 1];
    const startOfWord = !isLetter(prev) && prev?.base !== TATWEEL;
    const dagger = cl.marks.includes(DAGGER_ALIF);
    const rest = cl.marks.replace(new RegExp(`[${DAGGER_ALIF}${MADDA_ABOVE}]`, 'g'), '');
    // ـٰ : a dagger alif carried by a tatweel is a written ā
    if (cl.base === TATWEEL) {
      if (dagger && daggers) { put(ALIF, cl.at); changed = true; }
      else put(cl.base + cl.marks, cl.at);
      continue;
    }
    // ءَا at the start of a word is آ
    if (startOfWord && cl.base === HAMZA && cl.marks.includes(FATHA) && next?.base === ALIF && !/[\u064B-\u0652]/.test(next.marks)) {
      put(ALIF_MADDA, cl.at); c++; changed = true; continue;
    }
    // a madda on (or composed with) an alif after a vowelled letter only marks length: ضَآ → ضَا
    if (!startOfWord && (cl.base === ALIF_MADDA || (cl.base === ALIF && cl.marks.includes(MADDA_ABOVE))) && isLetter(prev)) {
      put(ALIF + rest, cl.at); changed = true; continue;
    }
    if (dagger && daggers && isLetter(cl)) {
      const wordFinal = !isLetter(next) && next?.base !== TATWEEL;
      // و or ى under a dagger alif is the seat of an ā (الصلوٰة, التورىٰة); a final ىٰ is the ordinary alif maqṣūra
      if ((cl.base === WAW || cl.base === ALIF_MAQSURA || cl.base === '\u06CC') && !/[\u064B-\u0652]/.test(rest)) {
        if (cl.base === WAW || !wordFinal) {
          put(ALIF + rest, cl.at); changed = true;
          // the silent alif after such a wāw (ٱلرِّبَوٰاْ) is not written in the ordinary spelling
          if (cl.base === WAW && next?.base === ALIF && !isLetter(clusters[c + 2])) c++;
          continue;
        }
        put(cl.base + cl.marks, cl.at); continue;
      }
      // any other letter: the ā is written after it, unless an alif already follows
      if (next?.base !== ALIF && next?.base !== ALIF_MAQSURA && cl.base !== ALIF) { put(cl.base + rest + ALIF, cl.at); changed = true; continue; }
    }
    put(cl.base + cl.marks, cl.at);
  }
  at.push(surface.length);
  return changed ? { text, at } : undefined;
}

/**
 * Every ordinary spelling a Quranic spelling may stand for, most thorough first: with the dagger alifs written as alifs, and with
 * only the lengthening maddas removed (the demonstratives keep their dagger in ordinary print too: هَـٰٓؤُلَآءِ is هؤلاء, not هاؤلاء).
 * Empty when the word has nothing Quranic about it. The analyser tries the word as it stands first, then these.
 */
export function arQuranicSpellings(surface: string): Array<{ text: string; at: number[] }> {
  const out: Array<{ text: string; at: number[] }> = [];
  const seen = new Set<string>([arKey(surface)]);
  for (const v of [arQuranicSpelling(surface), arQuranicSpelling(surface, { daggers: false })]) {
    if (!v) continue;
    const k = arKey(v.text);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/**
 * The key of a printed word with, for each key character, its offset in the printed string (UTF-16), so a part of the key (a
 * clitic, the stem) can be pointed at in the original text. `ends[i]` is the offset just after the letter AND its marks. A letter and
 * the marks typed after it are read together, so decomposed text (ا + a combining madda, و + a combining hamza) keys as `arKey` does.
 */
export function arKeyMap(surface: string): { key: string; starts: number[]; ends: number[] } {
  let key = '';
  const starts: number[] = [];
  const ends: number[] = [];
  const flush = (cluster: string, at: number, end: number): void => {
    // a presentation-form ligature expands to several key letters, all pointing at the one printed cluster
    const k = arKey(cluster);
    for (let j = 0; j < k.length; j++) { key += k[j]; starts.push(at); ends.push(end); }
  };
  let cluster = '', at = 0, i = 0;
  for (const ch of surface) {
    const here = i;
    i += ch.length;
    if (MARK.test(ch) || FILLER.test(ch)) {
      if (cluster) cluster += ch;
      else if (ends.length) ends[ends.length - 1] = i;
      continue;
    }
    if (cluster) flush(cluster, at, here);
    cluster = ch;
    at = here;
  }
  if (cluster) flush(cluster, at, i);
  return { key, starts, ends };
}

/** The radicals of a root as the sources write it ("ك ت ب"), in order. */
export const rootRadicals = (root: string | undefined): string[] => (root ?? '').split(/\s+/).filter(Boolean);

/** The letters a shard prefix is matched against: the loose fold of the key, Arabic letters only (so أكل and اكل share a shard). */
export const arShardLetters = (key: string): string => (arLoose(arKey(key)).match(ARABIC_LETTERS_G) ?? []).join('');

// ───────────────────────────── digits ─────────────────────────────

/** Arabic-Indic (٠–٩) and extended Arabic-Indic (۰–۹) digits as ASCII digits; other characters unchanged. */
export const asciiDigits = (s: string): string => s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

// ───────────────────────────── tokens and sentences ─────────────────────────────

const base = makeWordTokenizer({ locale: 'ar', normalize: arKey });
const DIGITS = '\\d\u0660-\u0669\u06F0-\u06F9';
const NUMBER_ONLY = new RegExp(`^[${DIGITS}.,\u066B\u066C]+$`);
/** One to three Arabic letters (with their marks) written onto a number: و٢٠٢٤, بـ15, لـ٣. */
const LETTERS_THEN_NUMBER = new RegExp(`^((?:[\u0621-\u064A][${MARK_CLASS}]*){1,3})(\u0640?)([${DIGITS}][${DIGITS}.,\u066B\u066C]*)$`);

/**
 * Tokens: Intl.Segmenter('ar') keeps an orthographic word whole with its marks and tatweel. A word is NOT cut into clitics here:
 * وبالكتاب is one token, and the analyser gives its parts (arabic/clitics.ts). Offsets always slice the input exactly. A token that
 * is only digits (ASCII, Arabic-Indic or extended) is not a word; a conjunction or preposition written onto a number is a word of
 * its own before the number; a ligature that stands for a whole phrase (ﷺ) is a symbol, not a word.
 */
export function arTokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  for (const t of base(text)) {
    if (!t.isWord) { out.push(t); continue; }
    if (NUMBER_ONLY.test(t.surface) || /^[\uFDFA-\uFDFD]+$/.test(t.surface)) { out.push({ ...t, isWord: false }); continue; }
    const m = LETTERS_THEN_NUMBER.exec(t.surface);
    if (m) {
      const cut = t.start + m[1].length + m[2].length;
      out.push({ surface: text.slice(t.start, cut), start: t.start, end: cut, isWord: true, normalized: arKey(m[1]) });
      out.push({ surface: text.slice(cut, t.end), start: cut, end: t.end, isWord: false, normalized: m[3] });
      continue;
    }
    out.push(t);
  }
  return out;
}

/** A single letter and a full stop is an abbreviation (د. أحمد, م. خالد, ص. ٣), not the end of a sentence. */
const LETTER_ABBREVIATIONS = [...'\u0627\u0623\u0628\u062A\u062B\u062C\u062D\u062E\u062F\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063A\u0641\u0642\u0643\u0644\u0645\u0646\u0647\u0648\u064A'];

/** Sentences end at . ! ? ؟ … (and the Urdu-style ۔ some pages use); a line break always ends one. The Arabic comma ، and semicolon ؛ do not. */
export function arSegmentSentences(text: string): Span[] {
  return splitSentences(text, { terminators: '.!?\u061F\u2026\u06D4', abbreviations: LETTER_ABBREVIATIONS });
}
