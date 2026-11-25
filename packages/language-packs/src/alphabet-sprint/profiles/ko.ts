/**
 * Korean (Hangul) for an English reader: the owner's seven stages (brief XIX, 2026-11-25), as script units in this order:
 *   1 essential consonants · 2 essential vowels · 3 syllable composition (block layout and ten worked syllables) · 4 the other basic
 *   consonants and vowels · 5 final consonants (받침, the seven final sounds, neutralisation, compound finals) · 6 double consonants
 *   and compound vowels · 7 real-word reading, with the sound changes real words show (linking, nasalisation, liquid assimilation,
 *   aspiration, tensing, palatalisation).
 *
 * Hangul is an alphabet written in syllable blocks, so a letter is a unit, a block is not (all 11,172 are made by the three rules of stage 3
 * and 5); ten blocks (가 나 다 라 마 바 사 아 자 하) are cards of their own as worked examples; no word needs one to be read, and the course requires all ten before it offers a stage-4 word.
 * Everything a program can derive comes from the Korean adapter through ../letters-ko.ts: the jamo, the Revised Romanization of each letter
 * (shown as an aid and never as the spelling), the block layout, the final sounds, and which sound change a word shows. Unit keys are the
 * Alphabet deck's own glyphs (the jamo as the deck shows them), so cards already practised there carry over; the ten blocks, the seven
 * final-sound cards (`ㄱ받침` …) and the rules have keys of their own.
 *
 * The engine picks units by the words they unlock, not by stage number; the starter words are weighted so that it follows the stages
 * closely, and test/language-packs/ko-alphabet.test.ts measures how closely. MACHINE-DRAFTED: no Korean teacher or native speaker has
 * checked it.
 */
import { LEADS, NEUTRAL_FINAL, RR_FINAL, VOWELS, decompose } from '../../../../../src/adapters/korean/hangul';
import { koRomanizeWord } from '../../../../../src/adapters/korean/translit';
import {
  KO_FINAL_EXAMPLES, KO_FINAL_SOUNDS, KO_LETTER_NOTE, KO_LETTERS, KO_RULES, KO_STAGES, KO_ROMANIZATION_LABEL, koDependencies, koFinalKey, koLetterRomanization, koUnitStage, type KoLetter,
} from '../letters-ko';
import { PHRASES, WORDS } from '../words/ko';
import type { ScriptProfile, ScriptUnit } from '../types';

const letterOf = (g: string): KoLetter => KO_LETTERS.find((l) => l.glyph === g)!;

function letterUnit(g: string): ScriptUnit {
  const l = letterOf(g);
  const hard = ['ㄹ', 'ㅇ', 'ㅡ', 'ㅓ'].includes(g) ? 2 : l.stage === 1 || l.stage === 2 ? 1 : l.stage === 4 ? 2 : 3;
  return {
    key: g, kind: 'letter', display: g, sound: `${l.hint} · ${KO_ROMANIZATION_LABEL}, an aid: ${koLetterRomanization(l)}`,
    note: [`name: ${l.name} (${koRomanizeWord(l.name)})`, KO_LETTER_NOTE[g]].filter(Boolean).join(` · `), difficulty: hard as 1 | 2 | 3,
  };
}

function syllableUnit(s: string): ScriptUnit {
  const d = decompose(s)!;
  return {
    key: s, kind: 'cluster', display: s, difficulty: 1,
    sound: `${koRomanizeWord(s)} (${KO_ROMANIZATION_LABEL}, an aid): ${LEADS[d.l]} + ${VOWELS[d.v]}${d.l === LEADS.indexOf('ㅇ') ? ' (the ㅇ is silent, only a place-holder)' : ''}`,
    note: 'a worked example of how two letters make one block',
  };
}

function finalUnit(j: string): ScriptUnit {
  const same = Object.entries(NEUTRAL_FINAL).filter(([k, v]) => v === j && k !== j).map(([k]) => k);
  const ex = KO_FINAL_EXAMPLES[j];
  return {
    key: koFinalKey(j), kind: 'final-form', display: `${j} 받침`, difficulty: j === 'ㄷ' ? 3 : 2,
    sound: `${j} at the bottom of a block is said ${RR_FINAL[j]}${same.length ? `; the letters ${same.join(' ')} are said the same way when they end a syllable` : ''}`,
    example: { form: ex[0], gloss: ex[2] },
  };
}

const ruleUnit = (key: string): ScriptUnit => {
  const r = KO_RULES.find((x) => x.key === key)!;
  const ex = r.examples[0];
  return {
    key, kind: 'rule', display: r.display, sound: `${r.name}: ${r.sound}`, difficulty: r.difficulty,
    example: { form: ex[0], gloss: `${ex[2]}${ex[0] !== ex[1] ? ` [${ex[1]}]` : ''}` },
    note: r.examples.slice(1).map((e) => `${e[0]}${e[0] !== e[1] ? ` [${e[1]}]` : ''} ${e[2]}`).join(' · ') || undefined,
  };
};

const stage = (n: number) => KO_STAGES[n - 1];
const units: ScriptUnit[] = [
  ...stage(1).letters.map(letterUnit),
  ...stage(2).letters.map(letterUnit),
  ruleUnit('rule-block'),
  ...stage(3).syllables.map(syllableUnit),
  ...stage(4).letters.map(letterUnit),
  ruleUnit('rule-batchim'),
  ...KO_FINAL_SOUNDS.map(finalUnit),
  ruleUnit('rule-batchim-neutral'), ruleUnit('rule-batchim-compound'),
  ...stage(6).letters.map(letterUnit),
  ...['rule-linking', 'rule-nasal', 'rule-liquid', 'rule-aspirate', 'rule-tense', 'rule-palatal'].map(ruleUnit),
];

/** One example per unit: the most useful starter word that needs it, preferring a word with few units (WORDS is sorted by usefulness). */
function exampleFor(u: ScriptUnit): ScriptUnit['example'] | undefined {
  if (u.example) return u.example;
  let best: { form: string; gloss: string; n: number } | undefined;
  for (const w of WORDS) {
    const deps = koDependencies(w.form);
    if (!deps || !deps.includes(u.key)) continue;
    if (!best || deps.length < best.n) best = { form: w.form, gloss: w.gloss, n: deps.length };
    if (best.n <= 3) break;
  }
  return best ? { form: best.form, gloss: best.gloss } : undefined;
}

const UNITS: ScriptUnit[] = units.map((u) => { const example = exampleFor(u); return example ? { ...u, example } : u; });

/**
 * The course keeps the owner's stage order (brief XIX) by one rule the engine can read: for a STARTER word or phrase (the cards the Sprint
 * asks), every unit of the stages BEFORE the word's own stage is listed as needed besides the units the word really contains, so a word that
 * has a stage-4 letter is offered only once stages 1 to 3 are ready, a word with a final consonant only once stage 4 is ready, and so on.
 * Stages 1 and 2 are one step (no syllable can be read with consonants alone, so the first words come as soon as a few of both are known), and
 * the block rule, which every word needs, does not count toward a word's stage. A form that is not a starter word (anything on a page) gets
 * the honest list only, so a page's readiness is measured by the letters its words contain. KO_GATE_STARTER_WORDS = false gives the honest
 * list everywhere; the engine then teaches by utility and does not follow the stages.
 */
export const KO_GATE_STARTER_WORDS = true;
const STARTER_FORMS: ReadonlySet<string> = new Set([...WORDS.map((w) => w.form), ...PHRASES.map((p) => p.form)]);
/** Stages 1 and 2 are one step of the course. */
const stepOf = (key: string): number => { const st = koUnitStage(key) ?? 1; return st <= 2 ? 1 : st - 1; };

export function koCourseDependencies(form: string): readonly string[] | undefined {
  const honest = koDependencies(form);
  if (!honest || !KO_GATE_STARTER_WORDS || !STARTER_FORMS.has(form.normalize('NFC'))) return honest;
  const step = Math.max(1, ...honest.filter((k) => k !== 'rule-block').map(stepOf));
  const gate = UNITS.filter((u) => stepOf(u.key) < step).map((u) => u.key);
  return [...new Set([...honest, ...gate])];
}

const tell = (a: string, b: string, t: string): { a: string; b: string; tell: string } => ({ a, b, tell: t });

export const KO_PROFILE: ScriptProfile = {
  languageId: 'ko', scriptId: 'Hang', firstBatch: 4, laterBatch: 3,
  units: UNITS, words: WORDS, phrases: PHRASES,
  confusions: [
    tell('ㅏ', 'ㅓ', 'ㅏ has its short stroke on the right of the stem (a); ㅓ has it on the left (eo, “uh”)'),
    tell('ㅗ', 'ㅜ', 'ㅗ has its short stroke pointing up (o); ㅜ has it pointing down (u, “oo”)'),
    tell('ㅑ', 'ㅕ', 'ㅑ has two strokes on the right (ya); ㅕ has two on the left (yeo)'),
    tell('ㅛ', 'ㅠ', 'ㅛ has two strokes pointing up (yo); ㅠ has two pointing down (yu)'),
    tell('ㅡ', 'ㅣ', 'ㅡ is a flat line (eu, lips spread); ㅣ is a standing line (ee)'),
    tell('ㄱ', 'ㅋ', 'ㅋ is ㄱ with one more stroke through it, and is said with a strong puff of air'),
    tell('ㄷ', 'ㅌ', 'ㅌ is ㄷ with one more stroke, and is said with a strong puff of air'),
    tell('ㅂ', 'ㅍ', 'ㅂ is a closed box on a stem; ㅍ has a bar at the top and bottom with two legs, and is said with a puff of air'),
    tell('ㅈ', 'ㅊ', 'ㅊ is ㅈ with a short stroke on top, and is said with a puff of air'),
    tell('ㅅ', 'ㅈ', 'ㅈ is ㅅ with a flat bar on top (s against j)'),
    tell('ㅇ', 'ㅎ', 'ㅎ is ㅇ with a hat and a bar on top (h); ㅇ is the plain circle (silent at the start of a block)'),
    tell('ㅁ', 'ㅇ', 'ㅁ is a square (m); ㅇ is a circle (silent or ng)'),
    tell('ㅁ', 'ㅂ', 'ㅁ is a closed square (m); ㅂ has a stem standing on a box and is open at the top (b, p)'),
    tell('ㅐ', 'ㅔ', 'ㅐ is ㅏ with a ㅣ (stem on the right); ㅔ is ㅓ with a ㅣ; today most speakers say both about the same'),
    tell('ㅅ', 'ㅆ', 'ㅆ is two ㅅ: the tense s'),
    tell('ㄱ', 'ㄲ', 'ㄲ is two ㄱ: the tense k, with no puff of air (not ㅋ)'),
  ],
  dependencies: koCourseDependencies,
  notes: `Machine-drafted from the Korean adapter (src/adapters/korean: Hangul arithmetic, standard pronunciation, Revised Romanization) and the pack's compiled lexicon; not checked by a Korean teacher or native speaker. The seven stages are the owner's (brief XIX). A word card shows ${KO_ROMANIZATION_LABEL} as an aid while the learner is early, none from stage 6, and a Hangul respelling in brackets only where the sound differs from the spelling. Not modelled, so such words are never offered: ㅎ said between vowels or before ㄴ ㅁ (좋은, 놓는), ㅢ said ㅣ or ㅔ (희, 무늬), ㄴ inserted in compounds (꽃잎), tensing after ㄴ ㅁ of verb stems, and the sound changes of whole sentences. Hanja are not taught.`,
};
