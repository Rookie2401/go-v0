/**
 * Two flags on a whole sentence, decided before any rule of the sentence layer reads it:
 *
 *   arDialectSignals    the sentence is written in a spoken variety (Egyptian, Levantine, Gulf, Maghrebi, Iraqi), not Modern Standard.
 *   arForeignScript     the sentence is not Arabic at all: its words carry letters Arabic never uses (Persian, Urdu, Pashto, Kurdish …).
 *
 * Both are a closed list and a count, no model. A flagged sentence is not read as Standard Arabic: sentence.ts caps every reading at
 * 0.45 (dialect) or marks every reading unconfirmed and keeps it at 0.35 or below (foreign script), so nothing is credited.
 *
 * Dialect rule. A marker is a word Modern Standard cannot produce or does not use ("strong": مش، عايز، دلوقتي، شو، هلق، بتاع …) or
 * one that is also a Standard word or a clitic chain ("weak": ليش، وين، ليه، كمان، بدي …). ONE strong marker, or TWO different
 * markers of any strength, flag the sentence; a weak marker alone never does. A بـ-prefixed imperfect (بيكتب، بتروح) is a weak
 * marker, counted only when the caller can say that the whole spelling is not a Standard word and what follows the بـ is an imperfect.
 *
 * MACHINE-DRAFTED word lists, from general knowledge of the varieties. Not reviewed by a native speaker or an Arabist; a variety
 * name is the majority of the markers found and may be wrong for words the varieties share.
 */
import type { RawToken } from '../../core/adapters';
import { arKey, arLoose, NOT_ARABIC_LETTERS } from './text';

export type ArDialect = 'egyptian' | 'levantine' | 'gulf' | 'maghrebi' | 'iraqi' | 'unknown-dialect';

interface Marker { variety: ArDialect; strong: boolean }
const MARKERS = new Map<string, Marker>();
const norm = (w: string): string => arLoose(arKey(w));
function add(variety: ArDialect, strong: boolean, words: string): void {
  for (const w of words.split(' ')) if (w && !MARKERS.has(norm(w))) MARKERS.set(norm(w), { variety, strong });
}

// the first list to name a word gives its variety
add('egyptian', true, 'مش عايز عايزه عايزة عايزين عاوز عاوزة عاوزين دلوقتي دلوقت ازاي إزاي إزيك ازيك بتاع بتاعت بتاعة بتوع كده كدا ايوه أيوه لسه لسا برضه برضو مفيش ايوا');
add('egyptian', false, 'فين ليه ايه مين ده دي دا اوي');
add('levantine', true, 'شو هلق هلأ كتير منيح هيك هيدا هيدي هيدول كيفك');
add('levantine', false, 'بدي بدك بدنا بدها بدو بدكم ليش وين عم هاد هاي');
add('gulf', true, 'وايد شلونك ايش');
add('gulf', false, 'الحين ابغى أبغى يبغى يبي ابي مو هواية');
add('maghrebi', true, 'ديال ديالي ديالك ديالو ديالنا بزاف واش دابا علاش بغيت');
add('maghrebi', false, 'كاين غادي ماشي');
add('iraqi', true, 'اكو أكو ماكو شكو شلون');
add('unknown-dialect', true, 'اللي شنو شنهو اشي');

export interface ArDialectOptions {
  /** True when the whole spelling is a Standard word the index knows (بيت، بنت: not a dialect verb with the بـ prefix). */
  isStandardKey?: (key: string) => boolean;
  /** True when the key is an imperfect verb form of Standard Arabic (يكتب، تروح). */
  isImperfectKey?: (key: string) => boolean;
}

export interface ArDialectSignal {
  variety: ArDialect;
  /** The printed marker words. */
  markers: string[];
  /** Their positions in the token list that was given. */
  indexes: number[];
}

/**
 * The dialect flag of one sentence: the variety and the printed markers that raised it; undefined when the sentence is not flagged
 * (no marker, or one weak marker).
 */
export function arDialectSignals(tokens: readonly RawToken[], opts: ArDialectOptions = {}): ArDialectSignal | undefined {
  const found: Array<{ surface: string; index: number; marker: Marker }> = [];
  const words = tokens.filter((t) => t.isWord);
  const seen = new Set<string>();
  let at = 0;
  const push = (surface: string, n: string, marker: Marker): void => { if (!seen.has(n)) { seen.add(n); found.push({ surface, index: at, marker }); } };
  words.forEach((t, wi) => {
    at = tokens.indexOf(t);
    const k = norm(t.surface);
    const m = MARKERS.get(k);
    if (m) { push(t.surface, k, m); return; }
    // the Egyptian negation ما … ـش: a ما and, within three words, a verb-like word ending in ش (ما كتبتش), or one written word (ماعرفتش)
    if (/^ما\S{3,}ش$/.test(k) && k.length >= 7) push(t.surface, k, { variety: 'egyptian', strong: false });
    else if (k.length >= 5 && /[تنايوكه]ش$/.test(k) && words.slice(Math.max(0, wi - 3), wi).some((p) => norm(p.surface) === 'ما')) push(t.surface, k, { variety: 'egyptian', strong: false });
    // a بـ-prefixed imperfect: بيكتب، بتروح، بنكتب
    const bi = /^ب([يتن])(\S{2,})$/.exec(k);
    if (bi && opts.isStandardKey && opts.isImperfectKey && !opts.isStandardKey(arKey(t.surface)) && opts.isImperfectKey(`${bi[1]}${bi[2]}`)) push(t.surface, k, { variety: 'unknown-dialect', strong: false });
  });
  const strong = found.filter((f) => f.marker.strong).length;
  if (strong < 1 && found.length < 2) return undefined;
  const tally = new Map<ArDialect, number>();
  for (const f of found) if (f.marker.variety !== 'unknown-dialect') tally.set(f.marker.variety, (tally.get(f.marker.variety) ?? 0) + (f.marker.strong ? 2 : 1));
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return { variety: ranked.length ? ranked[0][0] : 'unknown-dialect', markers: found.map((f) => f.surface), indexes: found.map((f) => f.index) };
}

// ───────────────────────────── text that is not Arabic ─────────────────────────────

/** Letters of Persian that Arabic may borrow for foreign sounds (پاريس، چيلي، گوگل، ژ): one of them is not enough to call a text not Arabic. */
const BORROWABLE = /[پچژگ]/u;
/** Letters Arabic never uses (ٹ ڈ ڑ ں ہ ھ ے ۆ ێ …): NOT_ARABIC_LETTERS minus the borrowable four. */
const NEVER_ARABIC = new RegExp(`(?![پچژگ])(?:${NOT_ARABIC_LETTERS.source})`, 'u');
const PERSIAN_KEYS = /[کی]/u;
/** Signs of Arabic, not Persian: ة ى ي ك and the hamza seats. */
const ARABIC_ONLY_SIGNS = /[ةىيكأإؤئ]/u;
const HAS_ARABIC_SCRIPT = /[؀-ۿ]/u;

/**
 * The reason a sentence is not Arabic, or undefined. It is judged on the PRINTED words (the lookup key folds ک and ی into ك and ي, which
 * Arabic text typed on a Persian keyboard also carries). A sentence is flagged when
 *   - a letter Arabic never has (ٹ ڈ ڑ ں ہ ھ ے ۆ ێ …) stands in two words, in a quarter of three or more words, or in the only word(s) of
 *     a text of fewer than three; or
 *   - letters Arabic only borrows (پ چ ژ گ) together with those stand in two words and in a third of three or more words; or
 *   - at least half of three or more words carry ک or ی AND the sentence has no Arabic-only sign (ة ى ي ك أ إ ؤ ئ) and no word with the
 *     article ال: a Persian sentence typed with Persian letters only.
 * One ک or ی typed in an Arabic sentence, one پ in a place name, never flags it.
 */
export function arForeignScript(tokens: readonly RawToken[]): string | undefined {
  const words = tokens.filter((t) => t.isWord && HAS_ARABIC_SCRIPT.test(t.surface));
  const n = words.length;
  if (!n) return undefined;
  const never = words.filter((t) => NEVER_ARABIC.test(t.surface));
  const odd = words.filter((t) => NEVER_ARABIC.test(t.surface) || BORROWABLE.test(t.surface));
  const keyed = words.filter((t) => PERSIAN_KEYS.test(t.surface));
  const letters = (list: readonly RawToken[]): string => [...new Set(list.flatMap((t) => [...t.surface].filter((ch) => NOT_ARABIC_LETTERS.test(ch))))].slice(0, 5).join(' ');
  const say = (l: string): string => `Persian, Urdu, Pashto or Kurdish letters ${l}`.trim();
  if (never.length >= 2 || (n >= 3 && never.length / n >= 0.25) || (n < 3 && never.length === n)) return say(letters(odd));
  if (odd.length >= 2 && (n < 3 || odd.length / n >= 0.3)) return say(letters(odd));
  const arabicSign = words.some((t) => ARABIC_ONLY_SIGNS.test(t.surface));
  const article = words.some((t) => /^(?:[وفبكل])?ال/u.test(t.surface.replace(/[ً-ْـ]/g, '')));
  if (n >= 3 && keyed.length / n >= 0.5 && !arabicSign && !article) return say('ک ی');
  return undefined;
}
