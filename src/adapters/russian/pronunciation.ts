/**
 * Russian pronunciation notes for the word sheet. MACHINE-DRAFTED, not reviewed by a native speaker.
 *
 * What this module gives: a transliteration (translit.ts, with the stressed vowel marked when the stress is known) and short
 * learner-facing NOTES, each stating one real rule that applies to THIS word. It gives NO `ipa`. A rule-derived IPA for a whole word
 * would need vowel reduction in three degrees, the softness of every consonant, assimilation across clusters and a long list of
 * loanword exceptions; the rules below are each safe on their own shape, but their sum is not a transcription, and a wrong IPA on a
 * card is worse than none. The dictionary's own IPA (Wiktionary, shown by the word sheet) is the authority for the whole word.
 *
 * Stress: `stress` (positions of the stressed vowels in `ruKey(surface)`) when a source knows them; otherwise the acute the text
 * itself writes; otherwise what the spelling implies (ё, or the only vowel). Never a guess: with none of these the note says that
 * Russian does not write stress, and no rule that depends on the stress is stated.
 *
 * Notes fire only on the shape they describe, and each carries its example from the word itself. Rules with exceptions the module
 * cannot list are not implemented; where a short exception list is certain, it is in the code:
 *   - the г of -ого / -его is said в (not in много, строго, дорого, убого … and the city names Диего, Лего; Того the country)
 *   - г in сегодня; ч said ш in что, чтобы, ничто, нечто, конечно, скучно, нарочно, яичница only (in точно, ночной it is ч)
 *   - silent consonants in the stems of здравствуй-, солнц-, сердц-, лестниц-, поздн-, чувств-, праздник
 *   - final voiced consonants are said voiceless, except in the short proclitics (без, из, над, под, об, перед, через …), which are
 *     said together with the next word and take its voicing
 *   - voicing assimilation across a cluster, with в only a target (it never makes a voiceless consonant voiced) and г left out
 *     (легко is said with х, not к), and the clusters inside the silent-letter stems left out
 *   - the softness note names its exceptions in the text and is not given for кафе, кофе, отель, тест, текст, темп, модель, бизнес, интернет (their softness varies)
 *   - unstressed vowel reduction is described only when the stress is known and exactly one vowel is stressed
 */
import type { PronunciationSupport } from '../../core';
import { impliedStress, ruKey, stressPositions, vowelCount, withStress } from './text';
import { ruTransliterate } from './translit';


const VOWELS = 'аеёиоуыэюя';
const isVowel = (c: string | undefined): boolean => !!c && VOWELS.includes(c);
const HARD_ONLY = 'жшц';
const SOFT_ONLY = 'чщй';

/** Voiced consonant letters and their voiceless partners. г is in the table but never used for assimilation. */
const DEVOICE: Readonly<Record<string, string>> = { б: 'п', в: 'ф', г: 'к', д: 'т', ж: 'ш', з: 'с' };
const VOICE: Readonly<Record<string, string>> = { п: 'б', ф: 'в', к: 'г', т: 'д', с: 'з', ш: 'ж' };
const VOICELESS_TRIGGER = new Set([...'пфктсшхцчщ']);
const VOICED_TRIGGER = new Set([...'бгджз']); // в does not trigger: it is a sonorant for this purpose
const OBSTRUENT = new Set([...'бвгджзпфктсшхцчщ']);

/** Short words said together with the next word, with no stress of their own. */
const CLITICS = new Set(['в', 'во', 'к', 'ко', 'с', 'со', 'у', 'о', 'об', 'обо', 'на', 'за', 'по', 'до', 'от', 'из', 'под', 'над', 'без', 'не', 'ни', 'бы', 'ли', 'же']);
/** Proclitics that end in a voiced consonant: it takes the voicing of the next word, so no final devoicing is stated. */
const VOICED_PROCLITICS = new Set(['без', 'из', 'над', 'под', 'об', 'перед', 'пред', 'через', 'раз', 'меж']);

const SILENT: ReadonlyArray<readonly [stem: string, what: string]> = [
  ['здравствуй', 'the first в'], ['солнц', 'the л'], ['сердц', 'the д'], ['лестниц', 'the т'], ['поздн', 'the д'], ['чувств', 'the в'], ['праздник', 'the з'],
];
const CH_AS_SH = new Set(['что', 'чтобы', 'чтоб', 'ничто', 'нечто', 'конечно', 'скучно', 'нарочно', 'яичница']);
const GEN_G_EXCEPTIONS = new Set(['много', 'намного', 'немного', 'строго', 'нестрого', 'убого', 'дорого', 'недорого', 'полого', 'ого', 'эго', 'лого', 'лего', 'диего']);
const HARD_BEFORE_E = new Set(['кафе', 'отель', 'тест', 'текст', 'темп', 'модель', 'бизнес', 'интернет', 'кофе']);

const ORDINAL = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]}`;
const IOTATED: Readonly<Record<string, string>> = { е: 'ye', ё: 'yo', ю: 'yu', я: 'ya' };

/** The vowel positions of a part, as syllable numbers (1-based) of those listed. */
const syllableOf = (part: string, pos: number): number => vowelCount(part.slice(0, pos + 1));
const listSyllables = (nums: number[]): string => (nums.length === 1 ? `syllable ${nums[0]}` : `syllables ${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`);

interface Part { text: string; offset: number; local: number[]; known: boolean; clitic: boolean }

/** Notes that depend on the spelling alone. Returns them in priority order. */
function spellingNotes(p: Part): string[] {
  const w = p.text;
  const shown = vowelCount(w) >= 2 ? withStress(w, p.local) : w; // a one-vowel word needs no accent
  const out: string[] = [];

  // silent letters (stem match)
  const silent = SILENT.find(([stem]) => w.includes(stem));
  if (silent) out.push(`In ${shown} ${silent[1]} is not pronounced.`);
  // ч said ш
  if (CH_AS_SH.has(w)) out.push(`In ${w} the ч is said like ш: ${w} sounds like ${w.replace('ч', 'ш')}.`);
  // -тся / -ться
  const refl = w.length > 3 ? /т?ь?ся$/u.exec(w) : null;
  if (refl && /^(ться|тся)$/u.test(refl[0])) {
    const cut = refl.index;
    out.push(`The ending -${refl[0]} is said like ца: ${shown} sounds like ${withStress(w.slice(0, cut) + 'ца', p.local.filter((i) => i < cut))}.`);
  }
  // г said в
  if (/^сегодня/u.test(w)) out.push('The г of сегодня is said like в: сегодня sounds like севодня.');
  else if (w.length >= 3 && /[ое]го$/u.test(w) && !GEN_G_EXCEPTIONS.has(w) && !(w === 'того' && p.local[0] === 1)) {
    out.push(`The г of the ending -ого / -его is said like в: ${shown} sounds like ${shown.replace(/г(?=[ое]\u0301?$)/u, 'в')}.`);
  }
  // final devoicing
  const last = w[w.length - 1];
  if (w === 'бог') out.push('The final г of бог is said like х: бог sounds like бох.');
  else if (vowelCount(w) > 0 && !VOICED_PROCLITICS.has(w) && last in DEVOICE) {
    let i = w.length;
    while (i > 0 && OBSTRUENT.has(w[i - 1])) i--;
    const tail = [...w.slice(i)].map((c) => DEVOICE[c] ?? c).join('');
    out.push(`A voiced consonant at the end of a word is said voiceless (б like п, в like ф, г like к, д like т, ж like ш, з like с): ${w} sounds like ${w.slice(0, i)}${tail}.`);
  }
  // iotated vowels
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    if (!(c in IOTATED)) continue;
    const prev = w[i - 1];
    if (i === 0 || isVowel(prev) || prev === 'ь' || prev === 'ъ') {
      out.push(`At the start of a word, after a vowel, or after ь or ъ, the letter ${c} begins with a y-sound: in ${shown} the ${c} is said ${IOTATED[c]}.`);
      break;
    }
  }
  // ь
  const soft = w.indexOf('ь');
  if (soft > 0) {
    const before = w[soft - 1];
    const next = w[soft + 1];
    if (next && 'еёиоюя'.includes(next)) out.push(`ь before ${next} keeps the consonant before it soft and adds a y-sound: in ${shown} the ${next} after ь is said ${IOTATED[next] ?? (next === 'и' ? 'yi' : 'yo')}.`);
    else if (HARD_ONLY.includes(before) || before === 'ч' || before === 'щ') out.push(`After ж, ш, ч, щ the ь is only a spelling mark (it tells the grammar, as in ночь, мышь, читаешь): it is not a sound.`);
    else if (!isVowel(before)) out.push(`The ь is not a sound: it makes the consonant before it soft. In ${shown} the ${before} is soft.`);
  }
  // ъ
  const hard = w.indexOf('ъ');
  if (hard > 0 && 'еёюя'.includes(w[hard + 1] ?? '')) out.push(`The ъ is not a sound: it keeps the consonant before it hard, and the ${w[hard + 1]} after it begins with a y-sound (${IOTATED[w[hard + 1]]}), as in ${shown}.`);
  // ж ш ц are always hard
  const hardI = w.match(/[жшц]и/u);
  if (hardI) out.push(`ж, ш and ц are always hard, so ${hardI[0]} is said like ${hardI[0][0]}ы.`);
  const hardYo = w.match(/[жш]ё/u);
  if (hardYo) out.push(`After the hard ж and ш the letter ё is said like о: ${hardYo[0]} sounds like ${hardYo[0][0]}о.`);
  const hardE = [...w.matchAll(/[жшц]е/gu)];
  if (hardE.length) {
    const at = (hardE[0].index as number) + 1;
    if (p.known && p.local.length === 1) {
      const stressed = p.local[0] === at;
      out.push(stressed
        ? `ж, ш and ц are always hard, so the stressed е in ${hardE[0][0]} is said like э.`
        : `ж, ш and ц are always hard, so the unstressed е in ${hardE[0][0]} is said like ы.`);
    } else out.push(`ж, ш and ц are always hard: е after them is said like э when stressed and like ы when not (${hardE[0][0]}).`);
  }
  return out;
}

/** Notes about the unstressed vowels; only when exactly one vowel of the part is stressed and known. */
function reductionNotes(p: Part): string[] {
  const w = p.text;
  if (!p.known || p.local.length !== 1 || vowelCount(w) < 2) return [];
  const s = p.local[0];
  const shown = withStress(w, p.local);
  const oSyl: number[] = [];
  const aSyl: number[] = [];
  const eSyl: number[] = [];
  for (let i = 0; i < w.length; i++) {
    if (i === s) continue;
    const c = w[i];
    const afterCh = w[i - 1] === 'ч' || w[i - 1] === 'щ';
    if (c === 'о' && !afterCh) oSyl.push(syllableOf(w, i));
    else if (c === 'а' && !afterCh) aSyl.push(syllableOf(w, i));
    else if (c === 'я' || (c === 'е' && !HARD_ONLY.includes(w[i - 1] ?? ''))) eSyl.push(syllableOf(w, i));
  }
  const out: string[] = [];
  if (oSyl.length) out.push(`An unstressed о is said like а (a few foreign words, such as шоссе, keep о): in ${shown} the о in ${listSyllables(oSyl)} sounds like а.`);
  if (aSyl.length) out.push(`An unstressed а is shorter and weaker than a stressed one: in ${shown} the а in ${listSyllables(aSyl)}.`);
  if (eSyl.length) out.push(`An unstressed е or я is weak and usually sounds like a short и (weaker still at the end of a word): in ${shown}, ${listSyllables(eSyl)}.`);
  return out;
}

/** Voicing assimilation and softness: pair-based notes on the first matching shape. */
function clusterNotes(p: Part): string[] {
  const w = p.text;
  const out: string[] = [];
  if (SILENT.some(([stem]) => w.includes(stem))) return out;
  const seen = new Set<string>();
  for (let i = 0; i + 1 < w.length && seen.size < 2; i++) {
    const a = w[i];
    const b = w[i + 1];
    if (a !== 'г' && a in DEVOICE && VOICELESS_TRIGGER.has(b) && !seen.has('d')) {
      seen.add('d');
      out.push(`Before a voiceless consonant a voiced one is said voiceless: in ${w} the ${a} before ${b} is said like ${DEVOICE[a]}.`);
    } else if (a in VOICE && VOICED_TRIGGER.has(b) && !seen.has('v')) {
      seen.add('v');
      out.push(`Before a voiced consonant a voiceless one is said voiced: in ${w} the ${a} before ${b} is said like ${VOICE[a]}.`);
    }
  }
  if (!HARD_BEFORE_E.has(w)) {
    for (let i = 0; i + 1 < w.length; i++) {
      const c = w[i];
      if (!isVowel(c) && !HARD_ONLY.includes(c) && !SOFT_ONLY.includes(c) && 'ьъ'.indexOf(c) < 0 && 'еёиюя'.includes(w[i + 1])) {
        out.push(`A consonant before е, ё, и, ю or я is usually said soft (a few foreign words, such as кафе, keep it hard): in ${w} the ${c} in ${c}${w[i + 1]} is soft.`);
        break;
      }
    }
  }
  if (/[чщ]/u.test(w)) out.push('ч and щ are always soft, whatever letter follows them.');
  return out;
}

/** The stress note for one word (or all parts of a hyphenated word). */
function stressNote(parts: Part[], key: string, positions: number[]): string | undefined {
  if (parts.length === 1) {
    const p = parts[0];
    const vowels = vowelCount(p.text);
    if (vowels === 0) return 'A word with no vowel (like в, к, с) is said together with the next word.';
    if (vowels === 1 && CLITICS.has(p.text)) return 'A short word like this has no stress of its own: it is said together with the next word.';
    if (vowels === 1) return undefined;
    if (p.local.length === 0) return 'Russian does not write stress; a dictionary gives it.';
    if (p.local.length > 1) return `More than one stress is recorded for this form: ${withStress(p.text, p.local)}.`;
    const n = syllableOf(p.text, p.local[0]);
    return `Stress on the ${ORDINAL(n)} syllable: ${withStress(p.text, p.local)}${p.text[p.local[0]] === 'ё' ? ' (ё is always stressed)' : ''}.`;
  }
  const multi = parts.filter((p) => vowelCount(p.text) >= 2);
  if (multi.some((p) => p.local.length === 0)) return 'Russian does not write stress; a dictionary gives it.';
  if (positions.length) return `Stress: ${withStress(key, positions)}.`;
  return undefined;
}

/**
 * Pronunciation support for one written word: the transliteration with the stress marked when it is known, and notes. `stress` are
 * positions in `ruKey(surface)`; positions that are not vowel letters are ignored. Text with no Russian letter gets an empty result.
 */
export function ruPronunciation(surface: string, stress?: readonly number[]): PronunciationSupport {
  const key = ruKey(surface);
  if (!/[а-яё]/u.test(key)) return {};
  let positions = (stress ? [...stress] : stressPositions(surface)).filter((i) => i >= 0 && i < key.length && isVowel(key[i]));
  if (!positions.length) positions = impliedStress(key);
  const parts: Part[] = [];
  let offset = 0;
  for (const text of key.split(/[-‐‑]/u)) {
    if (!text) { offset += 1; continue; }
    const local = positions.filter((i) => i >= offset && i < offset + text.length).map((i) => i - offset);
    const implied = local.length ? local : impliedStress(text);
    const clitic = vowelCount(text) <= 1 && CLITICS.has(text);
    parts.push({ text, offset, local: clitic ? [] : implied, known: !clitic && implied.length > 0, clitic });
    offset += text.length + 1;
  }
  const notes: string[] = [];
  const add = (n: string | undefined): void => { if (n && !notes.includes(n)) notes.push(n); };
  add(stressNote(parts, key, positions));
  for (const p of parts) for (const n of spellingNotes(p)) add(n);
  for (const p of parts) for (const n of reductionNotes(p)) add(n);
  for (const p of parts) for (const n of clusterNotes(p)) add(n);
  // the transliteration marks only the stress a source gave or the spelling implies, never inside a word said with its neighbour
  const known = positions.filter((i) => !parts.some((p) => p.clitic && i >= p.offset && i < p.offset + p.text.length));
  const out: PronunciationSupport = { transliteration: ruTransliterate(key, known) };
  if (notes.length) out.notes = notes.slice(0, 8);
  return out;
}
