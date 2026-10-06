/**
 * Noun inflection: every case, number and definiteness form of a noun from its three stated forms (lemma = indefinite
 * nominative singular, `def` = definite nominative singular, `plural` = indefinite nominative plural), and readings by
 * ending for a noun the word list does not hold. Package Q1. Machine-drafted rules, not yet checked by a native speaker.
 *
 * The declension types, told apart by the definite nominative singular (the plural is read from the stated plural):
 *   masculine -i / -u          libri  → librin · librit · indefinite genitive = libri
 *   masculine -ai              vëllai → vëllanë · vëllait · vëllai   (baba, babai, babanë)
 *   feminine  consonant + -a   vajza  → vajzën · vajzës · vajze      (lemma in -e: pasdita → pasditen · pasdites)
 *   feminine  -ia              shtëpia → shtëpinë · shtëpisë · shtëpie
 *   feminine  consonant + -ja  lulja  → lulen · lules · luleje        (lemma in -e: the lemma + n / s / je)
 *   feminine  -eja / -ëja      kafeja → kafenë · kafesë · kafeje      (the vowel stays: fe, gjë, re)
 * A definite form of any other shape (gruaja) gets only what `forms` states. Plural: definite = plural + t / të / it
 * (by its last sound), genitive/dative = plural + ve (-a → -ave), indefinite ablative = plural + sh (-ër / -s: + ish).
 *
 * `forms` on a lexeme ("form: tags", read with `sqMorph`) ADD readings or REPLACE: an explicit form replaces the
 * generated reading with the same Case / Number / Definite; the form "-" ("-: abl pl indef") removes the generated
 * reading with those features and adds nothing. A Gender the explicit form leaves out is the lexeme's.
 */
import type { SqForm, SqLexeme, SqReading } from './types';
import { sqMorph } from './types';

const GENDER = { m: 'Masc', f: 'Fem', n: 'Neut' } as const;
const CASE_WORD: Record<string, string> = { Nom: 'nominative', Acc: 'accusative', Gen: 'genitive', Dat: 'dative', Abl: 'ablative' };

const keyOf = (m: Record<string, string>): string => `${m.Case ?? ''}|${m.Number ?? ''}|${m.Definite ?? ''}`;

/** Plain-words description of a feature bundle: "definite accusative singular". */
function describe(m: Record<string, string>): string {
  const list = (vs: string[]) => (vs.length < 2 ? vs.join('') : `${vs.slice(0, -1).join(', ')} or ${vs[vs.length - 1]}`);
  const def = m.Definite ? list(m.Definite.split(',').map((x) => (x === 'Def' ? 'definite' : 'indefinite'))) : '';
  const cs = m.Case ? list(m.Case.split(',').map((c) => CASE_WORD[c] ?? c)) : '';
  const num = m.Number ? list(m.Number.split(',').map((n) => (n === 'Sing' ? 'singular' : 'plural'))) : '';
  return [def, cs, num].filter(Boolean).join(' ');
}

// ───────────────────────────── singular ─────────────────────────────

interface SgSet { acc?: string; gen?: string; indGen?: string }

/** Definite accusative, definite genitive/dative/ablative and indefinite genitive/dative/ablative singular. */
function singularSet(lemma: string, def: string): SgSet {
  const d = def.toLowerCase();
  const l = lemma.toLowerCase();
  if (d.endsWith('ai')) return { acc: `${def.slice(0, -1)}në`, gen: `${def}t`, indGen: def };
  if (/[iu]$/.test(d)) return { acc: `${def}n`, gen: `${def}t`, indGen: def };
  if (!d.endsWith('a')) return {};
  if (/[eë]ja$/.test(d)) {
    const b = def.slice(0, -2);
    return { acc: `${b}në`, gen: `${b}së`, indGen: `${b}je` };
  }
  if (d.endsWith('ia')) {
    const b = def.slice(0, -1);
    return { acc: `${b}në`, gen: `${b}së`, indGen: `${b}e` };
  }
  if (d.endsWith('ja')) {
    // lulja / familja / mendja: a lemma in -e that drops its -e before the article
    const stem = l.slice(0, -1);
    if (l.endsWith('e') && (d === `${stem}ja` || d === `${stem}a`)) {
      return { acc: `${lemma}n`, gen: `${lemma}s`, ...(l.endsWith('je') ? {} : { indGen: `${lemma}je` }) };
    }
    // fëmijë → fëmija: a lemma in -jë whose j belongs to the stem
    if (l.endsWith('jë') && d === `${stem}a`) return { acc: `${lemma}n`, gen: `${lemma}s`, indGen: `${lemma.slice(0, -1)}e` };
    return {};
  }
  const b = def.slice(0, -1);
  if (!/[^aeiouyë]$/i.test(b)) return {};
  const e = l.endsWith('e') ? 'e' : 'ë';
  return { acc: `${b}${e}n`, gen: `${b}${e}s`, indGen: `${b}e` };
}

// ───────────────────────────── plural ─────────────────────────────

/** Definite nominative/accusative plural from the indefinite plural. */
function definitePlural(pl: string, defSg: string): string {
  const p = pl.toLowerCase();
  const d = defSg.toLowerCase();
  if (/[aë]$/.test(p)) return `${pl}t`;
  if (p.endsWith('e')) return `${pl}${/[eë]ja$/.test(d) ? 'të' : 't'}`; // lulet, malet · kafetë, retë
  if (/o$/.test(p)) return `${pl}t`; // palltot, teatrot, eurot
  if (/[iuy]$/.test(p)) return `${pl}të`; // shtëpitë, sytë
  if (/ër$/.test(p) || /[zs]$/.test(p)) return `${pl}it`; // vëllezërit, njerëzit, mësuesit
  if (/[aeouëy]j$/.test(p)) return `${pl}t`; // muajt, kuajt, apostujt
  return `${pl}të`; // djemtë, miqtë, zogjtë, lumenjtë
}

const genitivePlural = (pl: string): string => (/a$/i.test(pl) ? `${pl.slice(0, -1)}ave` : `${pl}ve`);
const ablativePlural = (pl: string): string => (/ër$/i.test(pl) || /[zs]$/i.test(pl) ? `${pl}ish` : `${pl}sh`);

// ───────────────────────────── the paradigm ─────────────────────────────

/** Every form of a noun (each written form once per distinct reading; undecided features as unions). */
export function nounForms(lex: SqLexeme): SqForm[] {
  const gender = lex.gender ? GENDER[lex.gender] : undefined;
  const gen: Record<string, string> = gender ? { Gender: gender } : {};
  const out: SqForm[] = [];
  const seen = new Set<string>();
  const cell = (form: string | undefined, Case: string, Number: string, Definite: string, rule: string): void => {
    if (!form) return;
    const morph = { Case, Number, Definite, ...gen };
    const id = `${form}|${keyOf(morph)}`;
    if (seen.has(id)) return; // identical feature bundles are never duplicated
    seen.add(id);
    out.push({ form: form.normalize('NFC'), morph, rule });
  };

  if (lex.def) {
    const sg = singularSet(lex.lemma, lex.def);
    // a personal name (Beni, Ana) is already the definite form: Beni · Benin · Benit
    const nameMode = lex.pos === 'PROPN' && lex.def === lex.lemma;
    cell(lex.def, 'Nom', 'Sing', 'Def', 'definite nominative singular');
    cell(sg.acc, 'Acc', 'Sing', 'Def', 'definite accusative singular');
    cell(sg.gen, 'Gen,Dat,Abl', 'Sing', 'Def', 'definite genitive, dative or ablative singular');
    if (!nameMode) {
      cell(lex.lemma, 'Nom,Acc', 'Sing', 'Ind', 'indefinite nominative or accusative singular');
      cell(sg.indGen, 'Gen,Dat,Abl', 'Sing', 'Ind', 'indefinite genitive, dative or ablative singular');
      if (lex.plural) {
        const pl = lex.plural;
        cell(pl, 'Nom,Acc', 'Plur', 'Ind', 'indefinite nominative or accusative plural');
        cell(definitePlural(pl, lex.def), 'Nom,Acc', 'Plur', 'Def', 'definite nominative or accusative plural');
        cell(genitivePlural(pl), 'Gen,Dat,Abl', 'Plur', 'Def,Ind', 'genitive, dative or ablative plural (definite or indefinite)');
        cell(ablativePlural(pl), 'Abl', 'Plur', 'Ind', 'indefinite ablative plural');
      }
    }
  }

  // explicit forms: replace the generated reading with the same Case / Number / Definite, remove it ("-"), or add
  for (const row of lex.forms ?? []) {
    const at = row.indexOf(':');
    if (at < 0) continue;
    const form = row.slice(0, at).trim();
    const morph = { ...gen, ...sqMorph(row.slice(at + 1)) };
    const k = keyOf(morph);
    for (let i = out.length - 1; i >= 0; i--) if (keyOf(out[i].morph) === k) out.splice(i, 1);
    if (form === '-') continue;
    out.push({ form: form.normalize('NFC'), morph, rule: `${describe(morph)} (listed in the word list)` });
  }
  return out;
}

// ───────────────────────────── a word outside the list ─────────────────────────────

interface Ending { suffix: string; add?: string; Gender?: string; Case: string; Number: string; Definite: string; text: string }

const SG_DEF_GEN = 'definite genitive, dative or ablative singular';
const SG_DEF_ACC = 'definite accusative singular';
const PL_DEF = 'definite nominative or accusative plural';
const PL_GEN = 'plural, genitive or dative';
const PL_ABL = 'indefinite ablative plural';

const GUESSES: Ending[] = [
  { suffix: 'in', Gender: 'Masc', Case: 'Acc', Number: 'Sing', Definite: 'Def', text: SG_DEF_ACC },
  { suffix: 'un', Gender: 'Masc', Case: 'Acc', Number: 'Sing', Definite: 'Def', text: SG_DEF_ACC },
  { suffix: 'it', Gender: 'Masc', Case: 'Gen,Dat,Abl', Number: 'Sing', Definite: 'Def', text: SG_DEF_GEN },
  { suffix: 'it', Case: 'Nom,Acc', Number: 'Plur', Definite: 'Def', text: PL_DEF },
  { suffix: 'ut', Gender: 'Masc', Case: 'Gen,Dat,Abl', Number: 'Sing', Definite: 'Def', text: SG_DEF_GEN },
  { suffix: 'ën', add: 'ë', Gender: 'Fem', Case: 'Acc', Number: 'Sing', Definite: 'Def', text: SG_DEF_ACC },
  { suffix: 'ës', add: 'ë', Gender: 'Fem', Case: 'Gen,Dat,Abl', Number: 'Sing', Definite: 'Def', text: SG_DEF_GEN },
  { suffix: 'at', Case: 'Nom,Acc', Number: 'Plur', Definite: 'Def', text: PL_DEF },
  { suffix: 'et', Case: 'Nom,Acc', Number: 'Plur', Definite: 'Def', text: PL_DEF },
  { suffix: 'ët', Case: 'Nom,Acc', Number: 'Plur', Definite: 'Def', text: PL_DEF },
  { suffix: 'ave', Case: 'Gen,Dat,Abl', Number: 'Plur', Definite: 'Def,Ind', text: PL_GEN },
  { suffix: 'ëve', Case: 'Gen,Dat,Abl', Number: 'Plur', Definite: 'Def,Ind', text: PL_GEN },
  { suffix: 'eve', Case: 'Gen,Dat,Abl', Number: 'Plur', Definite: 'Def,Ind', text: PL_GEN },
  { suffix: 've', Case: 'Gen,Dat,Abl', Number: 'Plur', Definite: 'Def,Ind', text: PL_GEN }, // only when no longer -ve ending fits
  { suffix: 'ash', Case: 'Abl', Number: 'Plur', Definite: 'Ind', text: PL_ABL },
  { suffix: 'ësh', Case: 'Abl', Number: 'Plur', Definite: 'Ind', text: PL_ABL },
  { suffix: 'esh', Case: 'Abl', Number: 'Plur', Definite: 'Ind', text: PL_ABL },
  { suffix: 'ish', Case: 'Abl', Number: 'Plur', Definite: 'Ind', text: PL_ABL },
];

/**
 * Readings by ending for a form outside the word list: `lemmaKnown: false`, confidence 0.4 or less, no gloss, at most
 * three (in practice two), none when the ending says nothing. The lemma is the written form minus the ending: a guess.
 */
export function guessNoun(form: string): SqReading[] {
  const f = form.normalize('NFC').toLowerCase();
  const out: SqReading[] = [];
  for (const g of GUESSES) {
    if (!f.endsWith(g.suffix)) continue;
    if (g.suffix === 've' && out.some((r) => r.morph.Case === 'Gen,Dat,Abl' && r.morph.Number === 'Plur')) continue;
    const base = f.slice(0, f.length - g.suffix.length);
    if (base.length < 2) continue;
    out.push({
      lemma: base + (g.add ?? ''),
      pos: 'NOUN',
      morph: { Case: g.Case, Number: g.Number, Definite: g.Definite, ...(g.Gender ? { Gender: g.Gender } : {}) },
      confidence: out.length === 0 ? 0.4 : 0.35,
      lemmaKnown: false,
      rule: `by its ending -${g.suffix}: ${g.text}; the lemma is a guess`,
      origin: 'rule',
    });
  }
  return out.slice(0, 3);
}
