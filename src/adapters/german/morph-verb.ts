/**
 * Verb conjugation. Weak verbs from the infinitive; strong and mixed verbs from the principal parts the lexicon lists
 * (third person singular present, preterite, participle, all WITHOUT a separable prefix); the irregular verbs from
 * their own tables. Separable verbs are conjugated as their base and the prefix is attached afterwards.
 */
import type { DeVerb } from './types';
import { umlaut } from './types';
import { forms as F, isSibilant, needsEInsertion, type Form } from './morph-util';
import { IRREGULAR, type Paradigm } from './morph-irregular';
import { hasInseparablePrefix, isPrefixText } from './morph-verbprep';

/** Forms by key ("pres.3s", "subj2.1p", "imp.2s", "inf", "inf.zu", "part.past", "part.pres"); the first form of a key is the usual one. */
export type VerbForms = Record<string, Form[]>;

export interface Conjugation {
  forms: VerbForms;
  /** Main-clause pieces of a separable verb's finite forms: [base form, prefix]. */
  split: Record<string, [string, string]>;
  /** A separable verb's finite forms of the BASE verb alone (steht), for the readings with the prefix detached. */
  detached: VerbForms;
  prefix?: string;
  /** The verb without its separable prefix. */
  head: string;
  tier: 'irregular' | 'strong' | 'mixed' | 'weak';
}

const SIX = ['1s', '2s', '3s', '1p', '2p', '3p'] as const;
export const FINITE_TENSES = ['pres', 'pret', 'subj1', 'subj2'] as const;

const stemOf = (inf: string): string => (inf.endsWith('en') ? inf.slice(0, -2) : inf.endsWith('n') ? inf.slice(0, -1) : inf);

/** Forms of the pret / subj2 slots for a stem ending in -e (machte, käme): the endings are -, -st, -, -n, -t, -n. */
function sixAfterE(p1: string): Form[][] {
  return [F(p1), F(`${p1}st`), F(p1), F(`${p1}n`), F(`${p1}t`), F(`${p1}n`)];
}

/** Strong preterite endings on a stem without -e: -, -st, -, -en, -t, -en, with -e- after d / t and -t after s ß z x. */
function strongPreteriteSix(p1: string): Form[][] {
  if (p1.endsWith('e')) return sixAfterE(p1);
  const dt = /[dt]$/.test(p1);
  const du = isSibilant(p1) ? F(`${p1}t`, `${p1}est`) : F(dt ? `${p1}est` : `${p1}st`);
  return [F(p1), du, F(p1), F(`${p1}en`), F(dt ? `${p1}et` : `${p1}t`), F(`${p1}en`)];
}

/** The du form from the third person singular: fährt → fährst, liest → liest, hält → hältst, findet → findest. */
function strongDu(stem: string, third: string): string {
  if (/t$/.test(stem) && third.endsWith('t') && !third.endsWith('et')) return `${third}st`;
  const base = third.endsWith('t') ? third.slice(0, -1) : third;
  return isSibilant(base) ? `${base}t` : `${base}st`;
}

function presentSix(inf: string, stem: string, third?: string): Form[][] {
  const eln = inf.endsWith('eln');
  const ern = inf.endsWith('ern');
  const e = needsEInsertion(stem) ? 'e' : '';
  const first = eln ? F(`${stem.slice(0, -2)}le`) : ern ? F(`${stem}e`, `${stem.slice(0, -2)}re`) : F(`${stem}e`);
  const du = third ? strongDu(stem, third) : isSibilant(stem) ? `${stem}t` : `${stem}${e}st`;
  return [first, F(du), F(third ?? `${stem}${e}t`), F(inf), F(`${stem}${e}t`), F(inf)];
}

function subjunctive1Six(inf: string, stem: string): Form[][] {
  if (inf.endsWith('eln')) {
    const first = `${stem.slice(0, -2)}le`;
    return [F(first), F(`${stem}st`, `${stem.slice(0, -2)}lest`), F(first), F(inf), F(`${stem}t`, `${stem.slice(0, -2)}let`), F(inf)];
  }
  if (inf.endsWith('ern')) {
    return [F(`${stem}e`, `${stem.slice(0, -2)}re`), F(`${stem}st`, `${stem}est`), F(`${stem}e`, `${stem.slice(0, -2)}re`), F(inf), F(`${stem}t`, `${stem}et`), F(inf)];
  }
  return [F(`${stem}e`), F(`${stem}est`), F(`${stem}e`), F(inf), F(`${stem}et`), F(inf)];
}

/** Konjunktiv II stems that the plain umlaut rule does not give (stünde, hülfe, stürbe, würfe, begönne …). */
const SUBJ2_OVERRIDES: Array<[string, string]> = [
  ['stand', 'stünde'], ['half', 'hülfe'], ['starb', 'stürbe'], ['warf', 'würfe'], ['warb', 'würbe'], ['darb', 'dürbe'],
  ['gann', 'gönne'], ['wann', 'wönne'],
];

function subjunctive2Stem(verb: DeVerb, stem: string, pret: string): string {
  const needsE = needsEInsertion(stem);
  if (verb.cls === 'mixed' || pret.endsWith('te')) {
    // kennen / nennen / rennen / brennen / senden / wenden: the preterite vowel goes back to e (kennte, sendete)
    if (pret.replace('a', 'e') === `${stem}te` || pret.replace('a', 'e') === `${stem}ete`) return `${stem}${needsE ? 'ete' : 'te'}`;
    return verb.cls === 'weak' ? pret : umlaut(pret);
  }
  const hit = SUBJ2_OVERRIDES.find(([end]) => pret.endsWith(end));
  if (hit) return pret.slice(0, pret.length - hit[0].length) + hit[1];
  const u = umlaut(pret);
  return u.endsWith('e') ? u : `${u}e`;
}

/** Imperative singular: gib, nimm, lies, sieh (e → i), tritt; else the stem, with -e where the spelling needs it (arbeite, öffne). */
function imperativeSingular(inf: string, stem: string, third?: string): Form[] {
  if (third) {
    const bare = /t$/.test(stem) && third.endsWith('t') && !third.endsWith('et') ? third : third.endsWith('t') ? third.slice(0, -1) : third;
    if (bare !== stem && bare !== `${stem}e` && !/[äöü]/.test(bare)) return F(bare);
  }
  if (inf.endsWith('eln')) return F(`${stem.slice(0, -2)}le`, `${stem}e`);
  if (inf.endsWith('ern')) return F(`${stem}e`, `${stem.slice(0, -2)}re`);
  if (!needsEInsertion(stem)) return F(stem, `${stem}e`);
  return /[dt]$/.test(stem) ? F(`${stem}e`, stem) : F(`${stem}e`); // wart! / find! are spoken, never primary
}

/** The past participle of a verb with no listed one: ge- + stem + (e)t, no ge- after an inseparable prefix or in -ieren. */
function derivedParticiple(head: string, stem: string, dual: boolean): string {
  const core = `${stem}${needsEInsertion(stem) ? 'e' : ''}t`;
  return hasInseparablePrefix(head, dual) || /ieren$/.test(head) ? core : `ge${core}`;
}

/** Forms of a regular (weak) or listed-principal-parts (strong, mixed) verb, without any separable prefix. */
function regularForms(head: string, verb: DeVerb): VerbForms {
  const stem = stemOf(head);
  const third = verb.pres3;
  const out: VerbForms = {};
  const put = (tense: string, rows: Form[][]): void => rows.forEach((r, i) => { out[`${tense}.${SIX[i]}`] = r; });

  put('pres', presentSix(head, stem, third));
  put('subj1', subjunctive1Six(head, stem));
  if (verb.pret) {
    put('pret', strongPreteriteSix(verb.pret));
    put('subj2', sixAfterE(subjunctive2Stem(verb, stem, verb.pret)));
  } else {
    const p1 = `${stem}${needsEInsertion(stem) ? 'ete' : 'te'}`;
    put('pret', sixAfterE(p1));
    put('subj2', sixAfterE(p1));
  }
  const sg = imperativeSingular(head, stem, third);
  out['imp.2s'] = sg;
  out['imp.2p'] = out['pres.2p'];
  out.inf = F(head);
  out['inf.zu'] = F(`zu ${head}`);
  out['part.past'] = F(verb.part ?? derivedParticiple(head, stem, !verb.prefix));
  out['part.pres'] = F(`${head}d`);
  return out;
}

/** An irregular verb's forms from its table; `front` is an inseparable prefix of a compound (vermögen → ver). */
function paradigmForms(p: Paradigm, front: string): VerbForms {
  const out: VerbForms = {};
  const put = (tense: string, row: readonly string[]): void => row.forEach((f, i) => { out[`${tense}.${SIX[i]}`] = F(front + f); });
  put('pres', p.pres);
  put('pret', p.pret);
  put('subj1', p.subj1);
  put('subj2', p.subj2);
  if (p.imp) { out['imp.2s'] = F(front + p.imp[0]); out['imp.2p'] = F(front + p.imp[1]); }
  out.inf = F(front + p.inf);
  out['inf.zu'] = F(`zu ${front}${p.inf}`);
  out['part.past'] = F(front && p.part.startsWith('ge') ? front + p.part.slice(2) : front + p.part);
  if (p.presPart) out['part.pres'] = F(front + p.presPart);
  for (const [key, list] of Object.entries(p.alt ?? {})) {
    (out[key] ??= []).push(...list.map((x) => ({ ...x, form: front + x.form })));
  }
  return out;
}

function findParadigm(head: string, verb: DeVerb): { p: Paradigm; front: string } | undefined {
  const exact = IRREGULAR[head];
  if (exact) return { p: exact, front: '' };
  if (verb.cls !== 'irregular') return undefined;
  for (const [key, p] of Object.entries(IRREGULAR)) {
    if (head.length > key.length && head.endsWith(key) && isPrefixText(head.slice(0, -key.length))) return { p, front: head.slice(0, -key.length) };
  }
  return undefined;
}

const FINITE = /^(?:pres|pret|subj1|subj2|imp)\./;

/** The verb's lemma as written without a bar or a reflexive sich. */
export function plainLemma(verb: DeVerb): string {
  return verb.lemma.replace('|', '').replace(/^sich /, '');
}

/** The verb without its separable prefix. */
export function headOf(verb: DeVerb): string {
  const lemma = plainLemma(verb);
  if (!verb.prefix) return lemma;
  const base = verb.base?.replace(/^sich /, '');
  return base ?? (lemma.startsWith(verb.prefix) ? lemma.slice(verb.prefix.length) : lemma);
}

/** Every form of a verb, with alternates and the main-clause split of a separable verb. */
export function conjugateFull(verb: DeVerb): Conjugation {
  const head = headOf(verb);
  const hit = findParadigm(head, verb);
  const base = hit ? paradigmForms(hit.p, hit.front) : regularForms(head, verb);
  const tier: Conjugation['tier'] = hit ? 'irregular' : verb.cls === 'strong' || verb.cls === 'mixed' ? (verb.pret ? verb.cls : 'weak') : 'weak';
  const prefix = verb.prefix;
  if (!prefix) return { forms: base, split: {}, detached: {}, head, tier };

  const forms: VerbForms = {};
  const split: Record<string, [string, string]> = {};
  const detached: VerbForms = {};
  for (const [key, list] of Object.entries(base)) {
    const zu = key === 'inf.zu';
    forms[key] = list.map((x) => ({ ...x, form: zu ? `${prefix}zu${x.form.slice(3)}` : prefix + x.form }));
    if (FINITE.test(key)) {
      detached[key] = list;
      split[key] = [list[0].form, prefix];
    }
  }
  return { forms, split, detached, prefix, head, tier };
}
