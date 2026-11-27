/**
 * Arabic transliteration: a reading aid for the card (and the data of the alphabet deck), never sent to a voice and never an
 * identity. MACHINE-DRAFTED: not reviewed by a native speaker or an Arabist.
 *
 * CONVENTION (one, stated here and repeated in the notes a result carries): a scholarly scheme in the manner of DIN 31635 / ALA-LC,
 * with digraphs for the letters English has no single sign for, as the brief's table has them:
 *
 *   ا ā (long, see below)  ب b  ت t  ث th  ج j  ح ḥ  خ kh  د d  ذ dh  ر r  ز z  س s  ش sh  ص ṣ  ض ḍ  ط ṭ  ظ ẓ  ع ʿ  غ gh
 *   ف f  ق q  ك k  ل l  م m  ن n  ه h  و w  ي y  ء ʾ   (hamza on any seat أ إ ؤ ئ is ʾ too)
 *
 *   short vowels  fatḥa a, ḍamma u, kasra i;  tanwīn an / un / in;  sukūn nothing;  shadda: the consonant written twice
 *   long vowels   ا after fatḥa → ā, و after ḍamma → ū, ي after kasra → ī; ى after fatḥa → ā; the dagger alif → ā;
 *                 آ → ʾā (ā at the start of a word); لا → lā;  و with sukūn after fatḥa → aw, ي → ay (consonants: bayt, yawm)
 *   shadda        doubles the letter or its digraph (ʿallama, kashshāf, quwwa; the ي of ـِيّ is iyy: ʿarabiyya)
 *   article       ال is written al-, and with a sun letter the lām is assimilated and WRITTEN so: ash-shams, an-nūr, ar-raḥmān (the
 *                 spelling ال never changes; the transliteration shows the sound). After the one-letter prefixes و ف ب ك ل the alif
 *                 of the article is dropped as in speech: wa-l-qamar, bi-sh-shams, li-l-walad (hamzat al-waṣl). الله is Allāh and
 *                 الذي / التي and their relatives are alladhī, allatī (written fused).
 *   tāʾ marbūṭa   ة with a vowel or tanwīn is t + the ending (madrasatu, madrasatan); bare or with sukūn (the form in pause) it is not
 *                 written after a short vowel (madrasa) and is written h after ā (ṣalāh, ḥayāh) so that it is not mistaken for ى
 *   alif maqṣūra  ى is ā (ʿalā); ى after tanwīn fatḥ is an (hudan: no ā is added)
 *   hamza         written ʾ inside and at the end of a word; NOT written at the start of a word, or at the start of the stem after the
 *                 article, where it is only the support of the vowel (ana, ilā, islām, al-arḍ). An initial alif (ا, ٱ) that carries a vowel
 *                 is written as that vowel (istaghfara). The omission is a convention of this scheme, not a claim that the hamza is
 *                 not pronounced: the pronunciation notes say it is a catch in the throat.
 *   ambiguity     t/d/s/k followed by ه with no vowel between would read as a digraph (th dh sh kh): a prime ʹ is put between them.
 *   capital       none, except Allāh.
 *
 * WHAT IT WILL NOT DO: it never invents a vowel. A form with no vowel marks gets `undefined`. A form that is only partly vowelled (a
 * letter inside the word with no vowel, sukūn or shadda; a bare alif, wāw or yāʾ that cannot be told from a consonant) also gets
 * `undefined`, not a guess: the missing mark may be exactly the one that decides the reading. Only the final letter may be bare (a
 * form in pause). Silent letters outside the ones it knows (the alif of plural -ū after wāw, the alif after tanwīn fatḥ, the alif of
 * the article) are not guessed: عَمْرٌو, مِائَة and similar return undefined. Several words are transliterated one by one; the article
 * is the citation form (al-), not the elided form said after a vowel, and no case ending is added or dropped except by `pausal`.
 * Persian and Urdu letters are not transliterated.
 */
import { ALIF, arCanon, arKey, DAMMA, DAMMATAN, FATHA, FATHATAN, KASRA, KASRATAN, splitVocal, SUKUN, SUN_LETTERS, TA_MARBUTA } from './text';

/** The consonant letters and their transliteration (the 28 letters and the hamza seats). The vowel letters ا ى ة آ are handled in code. */
export const AR_TRANSLIT: Readonly<Record<string, string>> = {
  ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'ḥ', خ: 'kh', د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 'ṣ', ض: 'ḍ', ط: 'ṭ', ظ: 'ẓ',
  ع: 'ʿ', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w', ي: 'y', ء: 'ʾ', أ: 'ʾ', إ: 'ʾ', ؤ: 'ʾ', ئ: 'ʾ',
};

const VOW: Readonly<Record<string, string>> = { [FATHA]: 'a', [DAMMA]: 'u', [KASRA]: 'i' };
const TAN: Readonly<Record<string, string>> = { [FATHATAN]: 'an', [DAMMATAN]: 'un', [KASRATAN]: 'in' };
const HAMZAS = new Set([...'ءأإؤئ']);
const PREFIXES: Readonly<Record<string, readonly [vowel: string, text: string]>> = {
  و: [FATHA, 'wa'], ف: [FATHA, 'fa'], ب: [KASRA, 'bi'], ك: [FATHA, 'ka'], ل: [KASRA, 'li'],
};
/** The words whose article lām is written with a shadda and is part of the word (الَّذِي …), by key. */
/** The words whose wāw after أُ is not a sound: ulū, ulā, ulāʾika, ulī. Named, not a rule. */
const SILENT_WAW = new Set(['أولو', 'أولى', 'أولي', 'أولئك']);
const FUSED = new Set(['الذي', 'التي', 'الذين', 'اللذان', 'اللذين', 'اللتان', 'اللتين', 'اللاتي', 'اللائي', 'اللواتي', 'الذان']);

/** One letter of a vocalized word with its marks. */
export interface ArUnit { c: string; v: string; sh: boolean; dg: boolean; wasla: boolean }

/** The letters of a vocalized form with their marks (alif waṣla read as alif, with `wasla` set). */
export function arUnits(form: string): ArUnit[] {
  const { key, marks } = splitVocal(form);
  const waslas: boolean[] = [];
  for (const ch of arCanon(form)) if (arKey(ch) !== '') waslas.push(ch === 'ٱ');
  return [...key].map((c, i) => ({ c, v: marks[i].vowel, sh: marks[i].shadda, dg: marks[i].dagger, wasla: waslas.length === key.length ? waslas[i] : false }));
}

export interface ArFacts {
  /** 'sun' (assimilated), 'lunar', 'sun-unassimilated' (the page prints the lām before a sun letter with no shadda), 'fused' (الذي, الله …). */
  article?: 'sun' | 'lunar' | 'sun-unassimilated' | 'fused';
  /** A one-letter prefix written before the article (wa-, bi- …). */
  prefix?: string;
  /** The word begins with an alif that carries a vowel (hamzat al-waṣl or an unwritten hamza). */
  initialAlif?: 'wasla' | 'alif';
  /** A hamza at the start of the word or stem is not written in the transliteration. */
  initialHamzaOmitted?: boolean;
  /** tāʾ marbūṭa: read t before an ending, not read as t in pause. */
  taMarbuta?: 'ending' | 'pause';
  tanwin?: boolean;
  dagger?: boolean;
  madda?: boolean;
  /** The consonants that carry a shadda, as transliterated. */
  geminates: string[];
  /** The long vowels found: ā ū ī. */
  longVowels: string[];
  /** The final short vowel or tanwīn was dropped because the form was asked for in pause. */
  pausalApplied?: boolean;
  /** The letters of the word (the key). */
  key: string;
}

interface WordResult { text: string; facts: ArFacts }

const hasVowel = (u: ArUnit[]): boolean => u.some((x) => x.v in VOW || x.v in TAN || x.dg);

/** One word. Undefined when it cannot be transliterated without guessing (see the file comment). */
function word(form: string, pausal: boolean): WordResult | undefined {
  const u = arUnits(form);
  // named exceptions: the wāw of أُولُو, أُولَى, أُولَٰئِكَ is silent (it only distinguishes them from إِلَى …)
  if (SILENT_WAW.has(u.map((x) => x.c).join('')) && u[0].c === 'أ' && u[0].v === DAMMA && u[1]?.c === 'و' && !u[1].v && !u[1].sh) u.splice(1, 1);
  const n = u.length;
  if (!n || !hasVowel(u)) return undefined;
  for (const x of u) if (!(x.c in AR_TRANSLIT) && !'اىةآ'.includes(x.c)) return undefined;
  const facts: ArFacts = { geminates: [], longVowels: [], key: u.map((x) => x.c).join('') };
  const keyFrom = (from: number): string => u.slice(from).map((x) => x.c).join('');
  let out = '';
  let start = 0;
  let prefixed = false;

  // ── the prefix and the article ──
  const pre = PREFIXES[u[0].c];
  const asPrefix = !!pre && !u[0].sh && !u[0].dg && u[0].v === pre[0] && n >= 4;
  const articleAt = (p: number, afterPrefix: boolean): { stem: number; fused: boolean } | undefined => {
    const a = u[p], l = u[p + 1], s = u[p + 2];
    if (!a || !l || a.c !== ALIF || a.sh || a.dg) return undefined;
    if (!(a.v === '' || (a.v === FATHA && !afterPrefix))) return undefined;
    if (l.c !== 'ل' || l.dg) return undefined;
    if (!l.sh && (l.v === '' || l.v === SUKUN) && s) return { stem: p + 2, fused: false };
    if (l.sh && l.v === FATHA && FUSED.has(keyFrom(p))) return { stem: p + 1, fused: true };
    return undefined;
  };
  let art = articleAt(0, false);
  if (!art && asPrefix) {
    const l = u[1];
    if (pre[1] === 'li' && l.c === 'ل' && !l.sh && !l.dg && (l.v === '' || l.v === SUKUN)) {
      art = { stem: 2, fused: false }; // لِلْ: the prefix lām and the article's lām written together
      prefixed = true; facts.prefix = 'li'; out = 'li-';
    } else {
      const a = articleAt(1, true);
      if (a) { art = a; prefixed = true; facts.prefix = pre[1]; out = `${pre[1]}-`; }
    }
  }
  let first = true;
  if (art) {
    start = art.stem;
    const s = u[art.stem];
    if (art.fused) {
      facts.article = 'fused';
      first = false;
      if (!prefixed) out += 'a';
    } else if (s.c === 'ل' && s.sh && u[art.stem + 1]?.c === 'ه' && art.stem + 1 === n - 1) {
      facts.article = 'fused'; // الله: Allāh
      out += prefixed ? 'llā' : 'Allā';
      start = art.stem + 1;
      first = false;
    } else if (SUN_LETTERS.has(s.c) && s.sh) {
      facts.article = 'sun';
      out += `${prefixed ? '' : 'a'}${AR_TRANSLIT[s.c]}-`;
      u[art.stem] = { ...s, sh: false };
    } else if (SUN_LETTERS.has(s.c)) {
      facts.article = 'sun-unassimilated';
      out += prefixed ? 'l-' : 'al-';
    } else {
      facts.article = 'lunar';
      out += prefixed ? 'l-' : 'al-';
    }
  }

  // ── the letters ──
  const skip = new Set<number>();
  const bareLong = (m: ArUnit | undefined, c: string): boolean => !!m && m.c === c && !m.sh && !(m.v in VOW) && !(m.v in TAN);
  for (let k = start; k < n; k++) {
    if (skip.has(k)) continue;
    const x = u[k];
    const isFirst = first && k === start;
    const last = k === n - 1;
    const prev = k > 0 ? u[k - 1] : undefined;

    if (x.c === ALIF) {
      // reached only at the start (a vowelled alif) or as a long vowel the letter before did not take
      if (isFirst && !x.sh && x.v in VOW) {
        out += VOW[x.v];
        facts.initialAlif = x.wasla ? 'wasla' : 'alif';
        continue;
      }
      return undefined;
    }
    if (x.c === 'آ') {
      out += `${isFirst ? '' : 'ʾ'}ā`;
      facts.madda = true;
      facts.longVowels.push('ā');
      if (isFirst) facts.initialHamzaOmitted = true;
      continue;
    }
    if (x.c === 'ى') return undefined; // reached only when the letter before did not take it as a long vowel
    if (x.c === TA_MARBUTA) {
      if (!last) return undefined;
      const h = out.endsWith('ā') ? 'h' : '';
      if (pausal || x.v === '' || x.v === SUKUN) {
        out += h;
        facts.taMarbuta = 'pause';
        if (pausal && (x.v in VOW || x.v in TAN)) facts.pausalApplied = true;
      } else if (x.v in VOW) { out += `t${VOW[x.v]}`; facts.taMarbuta = 'ending'; }
      else if (x.v in TAN) { out += `t${TAN[x.v]}`; facts.taMarbuta = 'ending'; facts.tanwin = true; }
      else return undefined;
      continue;
    }

    // a consonant: also a consonantal و / ي and a hamza seat
    if ((x.c === 'و' || x.c === 'ي') && !x.sh && !(x.v in VOW) && !(x.v in TAN)) {
      // no vowel of its own: only a diphthong (after fatḥa, with sukūn, or final) is a consonant here; a long vowel was taken by the letter before
      if (!((prev?.v === FATHA && (x.v === SUKUN || last)) || (last && prev?.v === SUKUN))) return undefined; // ظَبْي, دَلْو: after a sukūn the final letter is a consonant
    }
    const base = AR_TRANSLIT[x.c];
    let s = x.sh ? base + base : base;
    if (x.sh) facts.geminates.push(base);
    if (HAMZAS.has(x.c) && isFirst) { s = ''; facts.initialHamzaOmitted = true; }
    if (s.startsWith('h') && /[tdsk]$/.test(out)) s = `ʹ${s}`;

    const nx = u[k + 1];
    let tail = '';
    if (x.dg) {
      tail = 'ā'; facts.dagger = true; facts.longVowels.push('ā');
    } else if (x.v in VOW) {
      if (x.v === FATHA && (bareLong(nx, ALIF) || bareLong(nx, 'ى'))) { tail = 'ā'; skip.add(k + 1); facts.longVowels.push('ā'); }
      else if (x.v === DAMMA && bareLong(nx, 'و')) {
        tail = 'ū'; skip.add(k + 1); facts.longVowels.push('ū');
        const a2 = u[k + 2];
        if (a2 && a2.c === ALIF && !a2.sh && !a2.v && !a2.wasla) skip.add(k + 2); // the silent alif of plural -ū
      } else if (x.v === KASRA && bareLong(nx, 'ي')) { tail = 'ī'; skip.add(k + 1); facts.longVowels.push('ī'); }
      else if (last && pausal) facts.pausalApplied = true;
      else tail = VOW[x.v];
    } else if (x.v in TAN) {
      facts.tanwin = true;
      if (x.v === FATHATAN) {
        // an alif or alif maqṣūra written after fatḥatān carries nothing more
        const extra = nx && (nx.c === ALIF || nx.c === 'ى') && !nx.sh && !(nx.v in VOW) && !(nx.v in TAN);
        if (extra) skip.add(k + 1);
        if (pausal && k + (extra ? 1 : 0) === n - 1) { tail = 'ā'; facts.pausalApplied = true; } else tail = 'an';
      } else if (pausal && last) facts.pausalApplied = true;
      else tail = TAN[x.v];
    } else if (x.v === SUKUN) {
      tail = '';
    } else if (!last) {
      return undefined; // a letter inside the word with no vowel, sukūn or shadda printed: the mark that decides the reading is missing
    }
    out += s + tail;
  }
  return { text: out, facts };
}

const EDGE = /^[\s.,;:!?؟،؛«»"'()[\]…\-–—]+|[\s.,;:!?؟،؛«»"'()[\]…\-–—]+$/gu;

/** The convention in plain words: said ONCE for the language (the adapter's support text, the tutorial), not on every word. */
export const AR_TRANSLIT_CONVENTION =
  'Scholarly transliteration (DIN 31635 / ALA-LC style): th ḥ kh dh sh ṣ ḍ ṭ ẓ ʿ gh q ʾ, long vowels ā ī ū, doubled letters for shadda; a hamza at the start of a word is not written.';
/** The machine-drafted statement, said ONCE for the language. */
export const AR_MACHINE_DISCLAIMER =
  'The transliteration and the pronunciation notes are a reading aid drafted by a machine, not a pronunciation guide, and have not been reviewed by a native speaker or an Arabist.';

export interface ArWordAnalysis extends WordResult { notes: string[] }

function notesFor(f: ArFacts, text: string): string[] {
  const out: string[] = [];
  if (f.article === 'sun') out.push('The lām of the article is assimilated to the sun letter that follows and is written so (ash-shams); the spelling ال does not change.');
  if (f.article === 'sun-unassimilated') out.push('The page prints the article’s lām before a sun letter without a shadda; the transliteration follows the page (al-).');
  if (f.initialAlif === 'wasla' || f.article) out.push('The alif of the article (hamzat al-waṣl) is said only at the start of speech; after another word it is dropped.');
  if (f.initialHamzaOmitted) out.push('A hamza at the start of a word is not written in this transliteration (convention).');
  if (f.taMarbuta === 'pause') out.push(`The final ة is not read as t in pause (${text}); with a case ending or a pronoun after it, it is t.`);
  if (f.taMarbuta === 'ending') out.push('tāʾ marbūṭa carries an ending here, so it is written t.');
  if (f.pausalApplied) out.push('Written as said in pause: the final short vowel or tanwīn is dropped.');
  return out;
}

/**
 * Analyse one vocalized word: the transliteration and the facts a pronunciation note needs. Undefined when the word has no vowels or
 * cannot be transliterated without guessing. `pausal` writes the form as said in pause: no final short vowel, no final tanwīn
 * (fatḥatān becomes ā), tāʾ marbūṭa not t.
 */
export function analyseArabicWord(vocalized: string, opts?: { pausal?: boolean }): ArWordAnalysis | undefined {
  const r = word(arCanon(vocalized).replace(EDGE, ''), !!opts?.pausal);
  return r ? { ...r, notes: notesFor(r.facts, r.text) } : undefined;
}

/**
 * The transliteration of a VOCALIZED form (a word or a few words), or undefined when the form has no vowel marks or would need a
 * guess. `notes` states the convention and the rules that applied.
 */
export function transliterateArabic(vocalized: string, opts?: { pausal?: boolean }): { text: string; notes: string[] } | undefined {
  const words = arCanon(vocalized).split(/\s+/u).map((w) => w.replace(EDGE, '')).filter(Boolean);
  if (!words.length) return undefined;
  const texts: string[] = [];
  const notes: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const r = analyseArabicWord(words[i], { pausal: !!opts?.pausal && i === words.length - 1 });
    if (!r) return undefined;
    texts.push(r.text);
    for (const nt of r.notes) if (!notes.includes(nt)) notes.push(nt);
  }
  return { text: texts.join(' '), notes };
}
