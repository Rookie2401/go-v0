/**
 * Phonetic and phonological detail GoListen can offer WITHOUT audio. It is rule-based and says so: it lists what the
 * orthography of the letters present stands for in standard Albanian, it does not transcribe the word, it predicts no
 * stress, and no native reviewer has checked it. A learner-facing surface must show `source` beside it.
 */
import type { PhoneticDetail } from './contracts';

const SQ_RULES: Array<{ unit: string; ipa: string; note: string }> = [
  // digraphs first (longest match wins)
  { unit: 'sh', ipa: 'ʃ', note: '"sh" is one sound, as in English "ship"' },
  { unit: 'zh', ipa: 'ʒ', note: '"zh" is one sound, as in "measure"' },
  { unit: 'xh', ipa: 'dʒ', note: '"xh" is one sound, as in "judge"' },
  { unit: 'th', ipa: 'θ', note: '"th" is as in English "thin"' },
  { unit: 'dh', ipa: 'ð', note: '"dh" is as in English "this"' },
  { unit: 'gj', ipa: 'ɟ', note: '"gj" is a palatal stop, close to a "dy" sound' },
  { unit: 'nj', ipa: 'ɲ', note: '"nj" is one sound, like Spanish "ñ"' },
  { unit: 'll', ipa: 'ɫ', note: '"ll" is a dark (velarised) l, unlike single "l"' },
  { unit: 'rr', ipa: 'r', note: '"rr" is a trilled r; single "r" is a tap [ɾ]' },
  // single letters whose value is not the English one
  { unit: 'ë', ipa: 'ə', note: '"ë" is a mid central vowel, like the "a" of English "about"' },
  { unit: 'ç', ipa: 'tʃ', note: '"ç" is as in English "church"' },
  { unit: 'q', ipa: 'c', note: '"q" is a palatal stop, close to a "ty" sound (not English "k")' },
  { unit: 'y', ipa: 'y', note: '"y" is a front rounded vowel, as in French "tu" or German "ü"' },
  { unit: 'x', ipa: 'dz', note: '"x" is "dz" (not English "ks")' },
  { unit: 'c', ipa: 'ts', note: '"c" is "ts", as in "cats" (not English "k" or "s")' },
  { unit: 'j', ipa: 'j', note: '"j" is as English "y" in "yes"' },
];

const UNITS = SQ_RULES.map((r) => r.unit).sort((a, b) => b.length - a.length);
const SQ_SOURCE = 'GoListen sq orthography notes: rule-based letter values of standard Albanian, derived from the spelling alone. Not a transcription of the word, no stress predicted, not from a recording, not reviewed by a native speaker.';

/** Letter and digraph notes for an Albanian word, phrase or sentence. `undefined` when nothing needs noting. */
export function albanianPhonetics(text: string): PhoneticDetail | undefined {
  const s = text.normalize('NFC').toLocaleLowerCase();
  const seen = new Set<string>();
  const notes: string[] = [];
  for (let i = 0; i < s.length;) {
    const unit = UNITS.find((u) => s.startsWith(u, i));
    if (!unit) { i += 1; continue; }
    i += unit.length;
    if (seen.has(unit)) continue;
    seen.add(unit);
    const r = SQ_RULES.find((x) => x.unit === unit)!;
    notes.push(`${r.note} (IPA /${r.ipa}/).`);
  }
  if (notes.length === 0) return undefined;
  return { notes, source: SQ_SOURCE };
}
