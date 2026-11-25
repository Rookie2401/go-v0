/**
 * Thai for an English reader. Consonants, vowel patterns and tone marks are the Alphabet deck's own glyphs (alphabetLetters.thhi.ts), so
 * cards already practised there carry over. On top of them the Sprint teaches the rules a shape alone cannot give: the tone (consonant
 * class + live or dead syllable + tone mark), the final-consonant sounds, true clusters, the silent leading ห, and the unwritten vowel.
 *
 * Dependencies are read with the pack's own decoder (src/adapters/thai/orthography.ts): initial letters, the vowel pattern, the final
 * letter, the tone mark and the rules that word needs. A word the decoder cannot analyse with confidence, or whose pieces match no unit,
 * is not modelled (undefined). Machine-drafted from the reader's decoder and lexicons; NOT checked by a Thai teacher or native speaker.
 */
import { TH_LETTERS } from '../letters-thhi';
import { decodeThai } from '../../../../../src/adapters/thai/orthography';
import { PHRASES, WORDS } from '../words/th';
import type { ScriptProfile, ScriptUnit } from '../types';

/** Consonants that are rare or obsolete in everyday words: taught last. */
const RARE = new Set('ฃฅฆฌฎฏฐฑฒณษฬฮ');
/** Consonants whose sound or class needs care. */
const MEDIUM = new Set('ศธภญฝคชซทพฟผถขฉ');
const EASY_VOWELS = new Set(['◌ะ', '◌า', '◌ิ', '◌ี', '◌ุ', '◌ู', '◌อ', 'เ◌', 'แ◌', 'โ◌', 'ไ◌', 'ใ◌']);

/** Letters whose final sound is their own initial sound (ก k, ม, น, ง, ว, ย); every other final letter collapses onto another sound. */
const SAME_FINAL = 'กมนงวย';
/** The sound a consonant letter makes at the end of a syllable (the decoder's finalSound values). */
const FINAL_OF: Record<string, string> = {};
for (const [letters, snd] of [
  ['กขฃคฅฆ', 'k'], ['จชซฎฏฐฑฒดตถทธศษสฌ', 't'], ['บปพฟภ', 'p'], ['ม', 'm'], ['นณญรลฬ', 'n'], ['ง', 'ŋ'], ['ย', 'j'], ['ว', 'w'],
] as const) for (const ch of letters) FINAL_OF[ch] = snd;

const units: ScriptUnit[] = [];
for (const [glyph, back, kind] of TH_LETTERS) {
  if (kind === 'consonant') {
    const parts = back.split(' · ');
    const fin = FINAL_OF[glyph];
    const sound = parts[0] + (fin && !SAME_FINAL.includes(glyph) ? ` · at the end of a syllable: ${fin}` : '');
    units.push({
      key: glyph, kind: 'letter', display: glyph, sound,
      note: parts.slice(1).join(' · ') || undefined, // name, picture word and class
      difficulty: RARE.has(glyph) ? 3 : MEDIUM.has(glyph) ? 2 : 1,
    });
  } else if (kind === 'vowel') {
    units.push({ key: glyph, kind: 'vowel-sign', display: glyph, sound: back, difficulty: EASY_VOWELS.has(glyph) ? 1 : 2 });
  } else if (kind === 'tone-mark') {
    units.push({ key: glyph, kind: 'tone-mark', display: glyph, sound: back.replace(/: a tone mark$/, '') + ': changes the tone; which tone depends on the consonant class', difficulty: 2 });
  }
}
units.push(
  { key: 'rule-tone', kind: 'rule', display: 'ก ข ค + ่ ้', sound: "the tone comes from the first consonant's class (mid, high, low), live or dead syllable, and the tone mark: mid, low, falling, high or rising", difficulty: 3, note: 'A live syllable ends in a long vowel or m, n, ng, y, w; a dead one in a short vowel or k, p, t. Shapes alone never give the tone.' },
  { key: 'rule-final', kind: 'rule', display: 'ด ส จ → t', sound: 'a final consonant says only one of k, t, p, m, n, ng, y, w (ด ส จ ช say t; บ พ say p; ข ค say k; ร ล ญ say n)', difficulty: 2 },
  { key: 'rule-cluster', kind: 'rule', display: 'กร กล คร ปล', sound: 'a true cluster: two consonants at the start of one syllable, both said (กร gr-, ปล pl-)', difficulty: 2 },
  { key: 'rule-ho-nam', kind: 'rule', display: 'หน หม หล', sound: 'a silent ห in front of a low consonant: not said, but it makes the syllable high class (the tone changes)', difficulty: 3 },
  { key: 'rule-o-nam', kind: 'rule', display: 'อย', sound: 'อ before ย in อย่า อยู่ อย่าง อยาก: not said, it makes the syllable mid class', difficulty: 3 },
  { key: 'rule-implicit-vowel', kind: 'rule', display: 'ก ด น', sound: 'no vowel written: say a short o between two consonants (นม nom), or a short a on a lone consonant', difficulty: 2 },
);

const KEYS = new Set(units.map((u) => u.key));
const MARKS = new Set(['่', '้', '๊', '๋']);

/** The unit keys a written form needs; undefined when the decoder fails or a piece matches no unit. */
export function thaiDependencies(form: string): readonly string[] | undefined {
  const text = form.normalize('NFC');
  if (!text || !/^[ก-๋]+$/u.test(text)) return undefined;
  // ็ ์ ๆ ฯ ฺ ํ ๎ ฤ ฦ are not units here
  if (/[็์ๆฯฺํ๎ฤฦ]/u.test(text)) return undefined;
  let syl;
  try { syl = decodeThai(text); } catch { return undefined; }
  if (!syl.length) return undefined;
  const out: string[] = [];
  const add = (k: string): boolean => { if (!KEYS.has(k)) return false; if (!out.includes(k)) out.push(k); return true; };
  for (const s of syl) {
    if (s.confidence < 0.6 || !s.initial || !s.vowel || !s.tone) return undefined;
    for (const ch of s.initial) if (!add(ch)) return undefined;
    if (s.cluster) {
      const c0 = s.cluster.charAt(0);
      const rule = c0 === 'ห' && s.initial.length > 1 ? 'rule-ho-nam' : c0 === 'อ' && s.initial.length > 1 ? 'rule-o-nam' : 'rule-cluster';
      if (!add(rule)) return undefined;
    }
    const vowel = s.vowel === 'ไ◌ย' ? 'ไ◌' : s.vowel;
    if (!add(vowel === '◌' ? 'rule-implicit-vowel' : vowel)) return undefined;
    if (s.final) {
      for (const ch of s.final) if (!add(ch)) return undefined;
      const last = s.final.charAt(s.final.length - 1);
      if (!s.finalSound || FINAL_OF[last] === undefined) return undefined;
      if (!SAME_FINAL.includes(last)) add('rule-final');
    }
    if (s.toneMark && (!MARKS.has(s.toneMark) || !add('◌' + s.toneMark))) return undefined;
    // rule-tone is required where a mark's tone depends on the consonant class (low class); a mid or high class mark gives one tone whatever the rest.
    // Unmarked tones (live/dead rules) are NOT claimed as a dependency: counting them put the whole rule before the first word (the Sprint's "a word within three cards" gate).
    if (s.toneMark && s.initialClass === 'low') add('rule-tone');
  }
  return out;
}

/** One example per unit: the most useful starter word that needs it, preferring a word with few units (WORDS is sorted by usefulness). */
function exampleFor(key: string): ScriptUnit['example'] | undefined {
  let best: { form: string; gloss: string; n: number } | undefined;
  for (const w of WORDS) {
    const deps = thaiDependencies(w.form);
    if (!deps || !deps.includes(key)) continue;
    if (!best || deps.length < best.n) best = { form: w.form, gloss: w.gloss, n: deps.length };
    if (best.n <= 3) break;
  }
  return best ? { form: best.form, gloss: best.gloss } : undefined;
}

const UNITS: ScriptUnit[] = units.map((u) => {
  const example = exampleFor(u.key);
  return example ? { ...u, example } : u;
});

export const TH_PROFILE: ScriptProfile = {
  languageId: 'th', scriptId: 'Thai', firstBatch: 4, laterBatch: 3,
  units: UNITS, words: WORDS, phrases: PHRASES,
  confusions: [
    { a: 'บ', b: 'ป', tell: 'บ is a closed loop with a flat top (b); ป has a tail that rises above the loop (p)' },
    { a: 'ด', b: 'ต', tell: 'ด has a small loop on top and an open curl; ต has a taller left stem with a pinched top (d vs t)' },
    { a: 'ข', b: 'ช', tell: 'ข has a loop on the left and a flat top; ช has a tail on the right and curls over (kh, high vs low class)' },
    { a: 'ผ', b: 'พ', tell: 'ผ has a plain stem with no loop on the top left; พ has a small loop at the top left (high vs low class ph)' },
    { a: 'ฝ', b: 'ฟ', tell: 'ฝ has a bare stem; ฟ has a little loop at the bottom of the stem (f, high vs low class)' },
    { a: 'ถ', b: 'ภ', tell: 'ถ has a small loop and a plain base; ภ has a sharper hook on the left and a tail on the right (th vs ph)' },
    { a: 'ม', b: 'น', tell: 'ม has a loop at the top left and a hook on the right (m); น is plain and smaller (n)' },
  ],
  dependencies: thaiDependencies,
  notes: "Machine-drafted from the Thai reader's decoder (src/adapters/thai/orthography.ts) and lexicons; not checked by a Thai teacher or native speaker. Shapes alone never give the tone: it needs the rules (consonant class, live or dead syllable, tone mark); the card back of a word shows the tone the decoder gives, but only a low-class consonant with a tone mark lists rule-tone as a required unit. Not modelled: thanthakhat (silenced letters), mai yamok, ฤ ฦ, loan-word and Pali spellings with silent letters, and words the decoder is not confident about.",
};
