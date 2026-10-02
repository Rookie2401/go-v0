/**
 * Short object pronouns and what they fuse into: ma = më + e, t'i = të + i, s'jam = s' + jam, jepma = jep + më + e.
 * One written token, several grammatical words. Package Q3. Machine-drafted, not checked by a native speaker.
 *
 * What is built here:
 *  - SQ_CLITICS: the seven short pronouns (i appears twice: to him / her, and them).
 *  - SQ_CLUSTERS: the fused forms with their components in order. A form with two possible make-ups has two entries
 *    (ia = i + e and i + i; ta = të "to you" + e and the particle të + e). Every entry says it is unverified.
 *  - cliticReadings: a bare clitic; a cluster; an apostrophe form (s'jam, ç'ke); an imperative with attached pronouns.
 *
 * The fusion rule (tested): in a pair "first + second", a first që ends in -ë (më, të) loses it when the second is i or u,
 * and the pair is written with an apostrophe (m'i, t'i, m'u, t'u); when the second is the object pronoun e it is written -a
 * (më + e = ma, të + e = ta); after i / ju / u the second pronoun, e OR i, is written -a (i + e = ia, i + i = ia, ju + e =
 * jua, u + i = ua); i + u = iu with no change. A particle të before a fused pair is written t' + the pair (t'ia, t'ua).
 */
import type { PartOfSpeech, WordPart } from '../../core';
import type { SqClitic, SqCluster, SqReading } from './types';

export const SQ_CLITICS: SqClitic[] = [
  { form: 'më', person: '1', number: 'Sing', cases: ['Acc', 'Dat'], gloss: 'me, to me' },
  { form: 'të', person: '2', number: 'Sing', cases: ['Acc', 'Dat'], gloss: 'you, to you (singular)' },
  { form: 'e', person: '3', number: 'Sing', cases: ['Acc'], gloss: 'him, her, it' },
  { form: 'i', person: '3', number: 'Sing', cases: ['Dat'], gloss: 'to him, to her' },
  { form: 'i', person: '3', number: 'Plur', cases: ['Acc'], gloss: 'them' },
  { form: 'na', person: '1', number: 'Plur', cases: ['Acc', 'Dat'], gloss: 'us, to us' },
  { form: 'ju', person: '2', number: 'Plur', cases: ['Acc', 'Dat'], gloss: 'you, to you (plural)' },
  { form: 'u', person: '3', number: 'Plur', cases: ['Dat'], gloss: 'to them' },
];

const ATTESTED = "drafter's knowledge — not yet checked against a treebank or a grammar";

// ───────────────────────────── the grammatical words inside a token ─────────────────────────────

interface Atom {
  word: string; // the component word, normalized (të, e, i, u, ia …)
  lemma: string;
  pos: PartOfSpeech;
  kind: 'clitic' | 'contracted';
  role: string;
  morph: Record<string, string>;
}

const PRS = { PronType: 'Prs', Clitic: 'Yes' };
const pron = (word: string, lemma: string, person: string, number: string, cas: string, role: string): Atom =>
  ({ word, lemma, pos: 'PRON', kind: 'clitic', role, morph: { ...PRS, Person: person, Number: number, Case: cas } });

const A = {
  meDat: pron('më', 'unë', '1', 'Sing', 'Dat', 'to me (indirect object pronoun)'),
  teDat: pron('të', 'ti', '2', 'Sing', 'Dat', 'to you, singular (indirect object pronoun)'),
  iDat: pron('i', 'ai', '3', 'Sing', 'Dat', 'to him / to her (indirect object pronoun)'),
  juDat: pron('ju', 'ju', '2', 'Plur', 'Dat', 'to you, plural (indirect object pronoun)'),
  uDat: pron('u', 'ai', '3', 'Plur', 'Dat', 'to them (indirect object pronoun)'),
  eAcc: pron('e', 'ai', '3', 'Sing', 'Acc', 'it / him / her (direct object pronoun)'),
  iAcc: pron('i', 'ai', '3', 'Plur', 'Acc', 'them (direct object pronoun)'),
  iAny: { ...pron('i', 'ai', '3', 'Sing,Plur', 'Acc,Dat', 'the pronoun i: to him / to her (indirect object), or them (direct object)') },
  iaPair: pron('ia', 'ai', '3', 'Sing,Plur', 'Acc,Dat', 'the two pronouns i + e or i + i fused: to him / to her, it or them'),
  uaPair: pron('ua', 'ai', '3', 'Plur', 'Acc,Dat', 'the two pronouns u + e or u + i fused: to them, it or them'),
  teParticle: { word: 'të', lemma: 'të', pos: 'PART' as PartOfSpeech, kind: 'contracted' as const, role: 'subjunctive particle (të)', morph: {} },
  uNonActive: { word: 'u', lemma: 'u', pos: 'PART' as PartOfSpeech, kind: 'contracted' as const, role: 'non-active particle (u)', morph: {} },
};

interface ClusterDef {
  form: string;
  /** The written form cut into one piece per component (the pieces concatenate to the form). */
  segs: string[];
  atoms: Atom[];
  gloss: string;
}

const C = (form: string, segs: string[], atoms: Atom[], gloss: string): ClusterDef => ({ form, segs, atoms, gloss });

const CLUSTER_DEFS: ClusterDef[] = [
  C('ma', ['m', 'a'], [A.meDat, A.eAcc], 'to me, it / him / her'),
  C('ta', ['t', 'a'], [A.teDat, A.eAcc], 'to you, it / him / her'),
  C('ta', ['t', 'a'], [A.teParticle, A.eAcc], 'the particle të, it / him / her'),
  C('ia', ['i', 'a'], [A.iDat, A.eAcc], 'to him / to her, it'),
  C('ia', ['i', 'a'], [A.iDat, A.iAcc], 'to him / to her, them'),
  C('jua', ['ju', 'a'], [A.juDat, A.eAcc], 'to you (plural), it'),
  C('jua', ['ju', 'a'], [A.juDat, A.iAcc], 'to you (plural), them'),
  C('ua', ['u', 'a'], [A.uDat, A.eAcc], 'to them, it'),
  C('ua', ['u', 'a'], [A.uDat, A.iAcc], 'to them, them'),
  C("m'i", ["m'", 'i'], [A.meDat, A.iAcc], 'to me, them'),
  C("t'i", ["t'", 'i'], [A.teDat, A.iAcc], 'to you, them'),
  C("t'i", ["t'", 'i'], [A.teParticle, A.iAny], 'the particle të, the pronoun i'),
  C("m'u", ["m'", 'u'], [A.meDat, A.uNonActive], 'to me, with the non-active u'),
  C("t'u", ["t'", 'u'], [A.teDat, A.uNonActive], 'to you, with the non-active u'),
  C("t'u", ["t'", 'u'], [A.teParticle, A.uNonActive], 'the particle të, the non-active u'),
  C("t'u", ["t'", 'u'], [A.teParticle, A.uDat], 'the particle të, to them'),
  C('iu', ['i', 'u'], [A.iDat, A.uNonActive], 'to him / to her, with the non-active u'),
  C("t'ia", ["t'", 'ia'], [A.teParticle, A.iaPair], 'the particle të, then ia'),
  C("t'ua", ["t'", 'ua'], [A.teParticle, A.uaPair], 'the particle të, then ua'),
];

export const SQ_CLUSTERS: SqCluster[] = CLUSTER_DEFS.map((d) => ({
  form: d.form,
  components: d.atoms.map((a) => a.word),
  roles: d.atoms.map((a) => a.role),
  gloss: d.gloss,
  attested: ATTESTED,
}));

// ───────────────────────────── readings ─────────────────────────────

const PRONOUN_LEMMA: Record<string, string> = { 'më': 'unë', 'të': 'ti', e: 'ai', i: 'ai', na: 'ne', ju: 'ju', u: 'ai' };
const bareCase = (c: SqClitic): string => c.cases.join(',');

/** Reading of a bare clitic. Same lemma, part of speech and features as the function-word list gives, so a merge can dedupe. */
function bareReadings(form: string): SqReading[] {
  return SQ_CLITICS.filter((c) => c.form === form).map((c, i) => ({
    lemma: PRONOUN_LEMMA[form],
    pos: 'PRON' as PartOfSpeech,
    morph: { ...PRS, Person: c.person, Number: c.number, Case: bareCase(c) },
    gloss: c.gloss,
    confidence: Math.round((0.6 - 0.05 * i) * 100) / 100,
    lemmaKnown: true,
    rule: `short object pronoun: ${c.gloss}`,
    origin: 'hand' as const,
    role: 'short object pronoun, said before the verb',
  }));
}

/** The parts of a token cut into pieces (`segs`), one atom each, starting at `at`. */
function partsOf(segs: string[], atoms: Atom[], at = 0): WordPart[] {
  let pos = at;
  return atoms.map((a, i) => {
    const part: WordPart = { text: segs[i], start: pos, end: pos + segs[i].length, lemma: a.lemma, pos: a.pos, role: a.role, kind: a.kind };
    if (Object.keys(a.morph).length) part.morph = a.morph;
    pos += segs[i].length;
    return part;
  });
}

const makeUp = (words: string[], gloss: string): string => `${words.join(' + ')}: ${gloss}`;

function clusterReadings(form: string): SqReading[] {
  const defs = CLUSTER_DEFS.filter((d) => d.form === form);
  return defs.map((d, i) => {
    const first = d.atoms[0];
    return {
      lemma: first.lemma,
      pos: first.pos,
      morph: first.morph,
      gloss: d.gloss,
      confidence: defs.length === 1 ? 0.85 : Math.round((0.6 - 0.05 * i) * 100) / 100,
      lemmaKnown: true,
      rule: makeUp(d.atoms.map((a) => a.word), d.gloss),
      origin: 'hand' as const,
      parts: partsOf(d.segs, d.atoms),
    };
  });
}

const VERB_POS = (r: SqReading): boolean => r.pos === 'VERB' || r.pos === 'AUX';

const APOSTROPHE_PREFIXES: Record<string, { lemma: string; pos: PartOfSpeech; role: string; morph: Record<string, string> }> = {
  "s'": { lemma: 'nuk', pos: 'PART', role: 'negation: not (the short form of nuk)', morph: {} },
  "ç'": { lemma: 'çfarë', pos: 'PRON', role: 'what (the short form of çfarë)', morph: { PronType: 'Int' } },
};

function shiftParts(parts: WordPart[], by: number): WordPart[] {
  return parts.map((p) => ({ ...p, start: p.start + by, end: p.end + by }));
}

function apostropheReadings(form: string, verb: (form: string) => SqReading[]): SqReading[] {
  const prefix = form.startsWith("s'") ? "s'" : form.startsWith("ç'") ? "ç'" : '';
  if (!prefix || form.length === prefix.length) return [];
  const rest = form.slice(prefix.length);
  const p = APOSTROPHE_PREFIXES[prefix];
  const head: WordPart = { text: prefix, start: 0, end: prefix.length, lemma: p.lemma, pos: p.pos, role: p.role, kind: 'contracted' };
  if (Object.keys(p.morph).length) head.morph = p.morph;

  const out: SqReading[] = [];
  // the rest is a pronoun or a fused pair (s'e, s'më, s'ia)
  for (const r of [...bareReadings(rest), ...clusterReadings(rest)]) {
    const restParts: WordPart[] = r.parts
      ? shiftParts(r.parts, prefix.length)
      : [{ text: rest, start: prefix.length, end: form.length, lemma: r.lemma, pos: r.pos, role: r.role ?? 'object pronoun', kind: 'clitic', morph: r.morph }];
    out.push({ ...r, confidence: Math.min(r.confidence, 0.6), rule: `${prefix} + ${r.rule}`, parts: [head, ...restParts] });
  }
  // the rest is a verb (s'jam, s'kam, s'është, ç'është, ç'ke)
  for (const r of verb(rest).filter(VERB_POS)) {
    const restPart: WordPart = { text: rest, start: prefix.length, end: form.length, lemma: r.lemma, pos: r.pos, role: 'verb', kind: 'contracted', morph: r.morph };
    out.push({
      ...r,
      confidence: Math.min(r.confidence, 0.85),
      rule: `${prefix} + ${rest}: ${p.role.split(' (')[0]}, then ${r.rule}`,
      parts: [head, restPart],
    });
  }
  return out;
}

/** Pronouns that may be written onto the end of an imperative: jepma, jepia, jepua, merre, merri. */
const ATTACHED: Array<{ suffix: string; defs: () => Array<{ segs: string[]; atoms: Atom[]; gloss: string }> }> = [
  { suffix: 'ma', defs: () => CLUSTER_DEFS.filter((d) => d.form === 'ma') },
  { suffix: 'ia', defs: () => CLUSTER_DEFS.filter((d) => d.form === 'ia') },
  { suffix: 'ua', defs: () => CLUSTER_DEFS.filter((d) => d.form === 'ua') },
  { suffix: 'e', defs: () => [{ segs: ['e'], atoms: [A.eAcc], gloss: 'it / him / her' }] },
  { suffix: 'i', defs: () => [{ segs: ['i'], atoms: [A.iDat], gloss: 'to him / to her' }, { segs: ['i'], atoms: [A.iAcc], gloss: 'them' }] },
];

const isImperativeSingular = (r: SqReading): boolean =>
  VERB_POS(r) && r.lemmaKnown && (r.morph.Mood ?? '').split(',').includes('Imp') && (r.morph.Number === undefined || r.morph.Number.split(',').includes('Sing'));

function attachedReadings(form: string, verb: (form: string) => SqReading[]): SqReading[] {
  const out: SqReading[] = [];
  for (const { suffix, defs } of ATTACHED) {
    if (!form.endsWith(suffix) || form.length - suffix.length < 2) continue;
    const stem = form.slice(0, form.length - suffix.length);
    const verbs = verb(stem).filter(isImperativeSingular);
    for (const r of verbs) {
      for (const d of defs()) {
        const stemPart: WordPart = { text: stem, start: 0, end: stem.length, lemma: r.lemma, pos: r.pos, role: 'verb (imperative)', morph: r.morph };
        out.push({
          ...r,
          confidence: Math.round((0.6 - 0.05 * out.length) * 100) / 100,
          rule: `${stem} + ${d.atoms.map((a) => a.word).join(' + ')}: ${r.rule}, with the attached pronouns ${d.gloss}`,
          parts: [stemPart, ...partsOf(d.segs, d.atoms, stem.length)],
        });
      }
    }
  }
  return out;
}

/**
 * Readings of a written form that is a clitic, a fused cluster, a particle fused with a clitic (t'i, t'u, ta), or a
 * word with an apostrophe prefix (s'jam, ç'është, m'u). `verb` reads the rest of an apostrophe form or the stem of a
 * form with attached pronouns (it is the engine's own verb analysis, passed in so this file does not import it).
 * Empty when the form is none of these.
 *
 * A bare clitic carries no `parts` (it is one word); the function-word list gives the same pronoun reading, so a caller
 * that merges both should dedupe on lemma + part of speech + features.
 */
export function cliticReadings(form: string, verb: (form: string) => SqReading[]): SqReading[] {
  if (!form) return [];
  if (Object.prototype.hasOwnProperty.call(PRONOUN_LEMMA, form)) return bareReadings(form);
  const cluster = clusterReadings(form);
  if (cluster.length) return cluster;
  const apostrophe = apostropheReadings(form, verb);
  if (apostrophe.length) return apostrophe;
  if (form.includes("'")) return [];
  return attachedReadings(form, verb);
}
