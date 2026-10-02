/**
 * The Hindi verb group: a main verb, perhaps a second (vector) verb that colours it, and the helping verbs after them
 * (कह दिया था, कर रहा है, खा चुका होगा, पढ़ने लगा, जाना पड़ा, खाया जाता है). Found once per sentence from the analyses,
 * and shared by the phrase detector (compound verbs), the construction detectors (tenses, aspects, ability, passive …)
 * and the writing checks.
 *
 * Machine-drafted from general knowledge of Hindi grammar, not checked by a native speaker. The grouping is a small
 * left-to-right state machine over the verbal readings of each word; it never parses beyond the group, it reads
 * every reading of a word that is not clearly outweighed (see `viable`), and it fires only where the words are analysed.
 * Feature names follow docs/PLAN12.md (VerbForm Fin / Inf / Part / Conv / Stem; Aspect Imp / Perf / Prog).
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';

export type C = AnalysisCandidate;

/** The second verbs of compound verbs, by lemma, with what each adds in plain words. */
export const HINDI_VECTOR_VERBS: Readonly<Record<string, string>> = {
  'देना': 'done for someone else, or done and over with',
  'लेना': 'done for oneself, or taken in',
  'जाना': 'a change completed, or moving away',
  'आना': 'done in coming, toward the speaker or the point of reference',
  'डालना': 'done thoroughly or recklessly',
  'पड़ना': 'suddenly, without meaning to',
  'उठना': 'suddenly begun',
  'बैठना': 'done rashly, and it cannot be undone',
  'रखना': 'done and kept so, done in advance',
  'निकलना': 'setting off, or coming out doing it',
  'मारना': 'done with force or in a rush',
  'चुकना': 'already done, finished',
  'पाना': 'managed to, was able to (usually with a negative)',
};

// ───────────────────────────── feature helpers ─────────────────────────────

/** The values of a feature (a comma list holds several readings of one form). */
export const feat = (c: C, k: string): string[] => (c.morph[k] ? c.morph[k].split(',') : []);
export const hasF = (c: C, k: string, v: string): boolean => feat(c, k).includes(v);
/** The single value of a feature, or undefined when it is absent or ambiguous. */
export const one = (c: C, k: string): string | undefined => { const f = feat(c, k); return f.length === 1 ? f[0] : undefined; };
export const isVerbal = (c: C): boolean => c.pos === 'VERB' || c.pos === 'AUX';

/**
 * A reading counts when it is the top one of its word or has not been marked down by a neighbour rule (the
 * disambiguator lowers the readings it did not choose to 0.4 at most).
 */
export const viable = (cands: readonly C[], c: C): boolean => c === cands[0] || c.confidence > 0.4;

export type VKind = 'stem' | 'conv' | 'inf' | 'infobl' | 'ipf' | 'pf' | 'prog' | 'pres' | 'past' | 'fut' | 'sub' | 'imp' | 'fin';

/**
 * What kinds of verb form a verbal reading can be. A reading whose features are comma lists (Mood Imp,Sub; VerbForm Fin,Stem)
 * is every kind the lists allow, in this order of preference; the group builder tries them. The surface decides the direct
 * and the oblique infinitive when the case is silent.
 */
export function vkinds(c: C, surface: string): VKind[] {
  const out: VKind[] = [];
  const add = (k: VKind): void => { if (!out.includes(k)) out.push(k); };
  const vfs = feat(c, 'VerbForm');
  const asp = feat(c, 'Aspect');
  if (vfs.includes('Stem')) add('stem');
  if (vfs.includes('Conv')) add('conv');
  if (vfs.includes('Inf')) add(/ने$/u.test(surface) ? 'infobl' : /ना$|नी$|नीं$/u.test(surface) ? 'inf' : hasF(c, 'Case', 'Obl') && !hasF(c, 'Case', 'Dir') ? 'infobl' : 'inf');
  if (vfs.includes('Part') || (vfs.length === 0 && asp.length > 0)) {
    if (asp.includes('Prog')) add('prog');
    if (asp.includes('Imp')) add('ipf');
    if (asp.includes('Perf')) add('pf');
  }
  if (vfs.includes('Fin') || (vfs.length === 0 && asp.length === 0)) {
    const before = out.length;
    if (hasF(c, 'Mood', 'Imp')) add('imp');
    if (hasF(c, 'Mood', 'Sub')) add('sub');
    if (hasF(c, 'Tense', 'Fut')) add('fut');
    if (hasF(c, 'Tense', 'Past')) add('past');
    if (hasF(c, 'Tense', 'Pres')) add('pres');
    if (out.length === before) add('fin');
  }
  if (out.length === 0) add('fin');
  return out;
}

/** The first kind of verb form a reading can be (see `vkinds`). */
export const vkind = (c: C, surface: string): VKind => vkinds(c, surface)[0];

/** चाहिए is its own word in the word list (lemma चाहिए); an engine without it reads the form as चाहना. */
export const isChahiye = (e: { lemma: string; surface: string }): boolean => e.lemma === 'चाहिए' || (e.lemma === 'चाहना' && /^चाहिए|^चाहिये/u.test(e.surface));

export interface Elem { i: number; c: C; lemma: string; kind: VKind; surface: string; role: 'main' | 'vector' | 'aux' }

export interface VerbGroup {
  elems: Elem[];
  main: Elem;
  vector?: Elem;
  /** The helping verbs after the main verb and its vector, in order. */
  aux: Elem[];
  /** ही / भी / तो / न / नहीं standing inside the group. */
  particles: number[];
  /** Every token of the group, particles included, ascending. */
  tokenIndexes: number[];
  start: number;
  end: number;
  /** The finite होना that carries tense (है, था, होगा, हों), when there is one. */
  tenseAux?: Elem;
  /** The last element that is not that होना: the one that carries the aspect or mood. */
  core: Elem;
  flags: {
    compound: boolean;
    progressive: boolean;
    ability: boolean;
    managing: boolean;
    finished: boolean;
    obligation: boolean;
    wanting: boolean;
    beginning: boolean;
    letting: boolean;
    passive: boolean;
    continuative: boolean;
  };
  /** How much the readings that make the group are trusted (the lowest of them; less when the main word reads as a non-verb first). */
  confidence: number;
}

const PARTICLES = new Set(['ही', 'भी', 'तो', 'न', 'नहीं']);
const PARTICIPLE = new Set<VKind>(['ipf', 'pf', 'prog']);
const FINITE_BE = new Set<VKind>(['pres', 'past', 'fut', 'sub', 'fin']);

/** Role of `e` as a continuation of `elems`, or undefined when it does not continue the group. */
function fit(elems: Elem[], e: Elem): 'vector' | 'aux' | undefined {
  const main = elems[0];
  const last = elems[elems.length - 1];
  const hasVector = elems.some((x) => x.role === 'vector');
  const lem = e.lemma;
  if (lem === 'होना' && FINITE_BE.has(e.kind)) {
    if (last.lemma === 'होना') return undefined;
    if (PARTICIPLE.has(last.kind)) return 'aux';
    if (elems.length === 1 && (main.kind === 'inf' || main.kind === 'infobl')) return 'aux';
    return undefined;
  }
  if (elems.length === 1) {
    if (main.kind === 'stem') {
      if (lem in HINDI_VECTOR_VERBS) return 'vector';
      if (lem === 'रहना' || lem === 'सकना') return 'aux';
    } else if (main.kind === 'ipf' || main.kind === 'pf') {
      if (main.kind === 'pf' && main.lemma === 'चलना' && (lem === 'जाना' || lem === 'आना')) return 'vector';
      if (lem === 'रहना') return 'aux';
      if (lem === 'जाना') return 'aux';
    } else if (main.kind === 'inf') {
      if (lem === 'पड़ना' || lem === 'चाहना' || lem === 'चाहिए') return 'aux';
    } else if (main.kind === 'infobl') {
      if (lem === 'लगना' || lem === 'देना') return 'aux';
    }
    return undefined;
  }
  // after a vector: progressive or a helping verb
  if (hasVector && last.role === 'vector' && lem === 'रहना' && e.kind === 'prog') return 'aux';
  // passive जाना (stem) may carry रहना / सकना: किया जा रहा है, किया जा सकता है
  if (last.lemma === 'जाना' && last.kind === 'stem' && last.role === 'aux' && (lem === 'रहना' || lem === 'सकना')) return 'aux';
  if (last.lemma === 'जाना' && last.role === 'aux' && main.kind === 'pf' && lem === 'रहना' && e.kind === 'prog') return 'aux';
  return undefined;
}

function flagsOf(elems: Elem[]): VerbGroup['flags'] {
  const main = elems[0];
  const second = elems[1];
  const lem = (k: number) => elems[k]?.lemma;
  const f = {
    compound: elems.some((e) => e.role === 'vector'),
    progressive: elems.some((e) => e.lemma === 'रहना' && e.kind === 'prog' && e !== main) && main.kind !== 'ipf' && main.kind !== 'pf',
    ability: elems.some((e, k) => k > 0 && e.lemma === 'सकना'),
    managing: elems.some((e) => e.role === 'vector' && e.lemma === 'पाना'),
    finished: elems.some((e) => e.role === 'vector' && e.lemma === 'चुकना'),
    obligation: (main.kind === 'inf' || main.kind === 'infobl') && (lem(1) === 'पड़ना' || lem(1) === 'होना' || lem(1) === 'चाहिए' || (lem(1) === 'चाहना' && second.kind !== 'ipf' && second.kind !== 'pf')),
    wanting: main.kind === 'inf' && lem(1) === 'चाहना' && (second.kind === 'ipf' || second.kind === 'pf'),
    beginning: main.kind === 'infobl' && lem(1) === 'लगना',
    letting: main.kind === 'infobl' && lem(1) === 'देना',
    passive: main.kind === 'pf' && elems.some((e, k) => k > 0 && e.lemma === 'जाना' && e.role === 'aux'),
    continuative: (main.kind === 'ipf' || main.kind === 'pf') && elems.some((e, k) => k > 0 && e.lemma === 'रहना'),
  };
  if (f.passive) f.continuative = false;
  if (f.continuative && elems.some((e, k) => k > 0 && e.lemma === 'रहना' && e.kind === 'prog')) f.progressive = main.kind !== 'ipf' && main.kind !== 'pf';
  return f;
}

function finish(elems: Elem[], particles: number[], base: number): VerbGroup {
  const tenseAux = elems.length > 1 && elems[elems.length - 1].lemma === 'होना' ? elems[elems.length - 1] : undefined;
  const core = tenseAux ? elems[elems.length - 2] : elems[elems.length - 1];
  const vector = elems.find((e) => e.role === 'vector');
  const idx = [...elems.map((e) => e.i), ...particles].sort((a, b) => a - b);
  return {
    elems, main: elems[0], vector, aux: elems.filter((e) => e.role === 'aux' && e !== elems[0]), particles,
    tokenIndexes: idx, start: idx[0], end: idx[idx.length - 1], tenseAux, core, flags: flagsOf(elems),
    confidence: Math.min(...elems.map((e) => e.c.confidence), base),
  };
}

/** Every verb group of a sentence, in order, each token in at most one group. */
/** Words that put the readings of a form that is both a participle / command and a subjunctive (आए, आओ, समझें) on the subjunctive. */
const SUBJUNCTIVE_TRIGGERS = new Set(['शायद', 'ताकि', 'काश', 'चाहे', 'कहीं', 'यदि', 'अगर']);
/** Verbs after which a कि-clause is a wish, a request or a command. */
const WISHING = new Set(['चाहना', 'चाहिए', 'कहना', 'माँगना', 'बोलना', 'सुझाना', 'आदेश', 'प्रार्थना']);

export function buildVerbGroups(tokens: RawToken[], analyses: AnalyzedToken[]): VerbGroup[] {
  /** A subjunctive trigger stands before word i in the sentence: शायद, ताकि …, जब तक, a न directly before, or कि after a verb of wishing. */
  const subjunctiveContext = (i: number): boolean => {
    for (let k = i - 1, n = 0; k >= 0 && n < 8; k--) {
      const t = tokens[k];
      if (!t.isWord) { if (/^[।॥?!]$/u.test(t.surface)) return false; continue; }
      n++;
      const w = t.normalized;
      if (SUBJUNCTIVE_TRIGGERS.has(w)) return true;
      if (w === 'तक' && tokens[k - 1]?.normalized === 'जब') return true;
      if (w === 'न' && k === i - 1) return true;
      if (w === 'कि') {
        for (let m = k - 1; m >= 0 && m > k - 6; m--) if (tokens[m].isWord && (analyses[m]?.candidates ?? []).some((c) => c.lemma !== undefined && WISHING.has(c.lemma))) return true;
        return false;
      }
    }
    return false;
  };
  const verbal = (i: number): Elem[] => {
    const t = tokens[i];
    if (!t?.isWord) return [];
    const cands = analyses[i]?.candidates ?? [];
    // a verb form that a noun or adjective reading of the same word outranks does not count, except the bare stem (a stem followed by a second verb is strong evidence in itself)
    const nonVerbalTop = Math.max(0, ...cands.filter((c) => !isVerbal(c)).map((c) => c.confidence));
    return cands
      .filter((c) => isVerbal(c) && c.lemma !== undefined && viable(cands, c))
      .flatMap((c) => {
        let kinds = vkinds(c, t.normalized);
        // the conjunctive without कर (the bare stem tagged as the conjunctive) is the stem before a second verb
        const l = c.lemma as string;
        if (kinds.includes('conv') && !kinds.includes('stem') && l.endsWith('ना') && t.normalized === l.slice(0, -2)) kinds.push('stem');
        // a form that is a participle / command AND a subjunctive: the subjunctive when a trigger stands before it
        if (kinds.includes('sub') && (kinds.includes('pf') || kinds.includes('imp')) && subjunctiveContext(i)) kinds = ['sub', ...kinds.filter((k) => k !== 'sub')];
        if (c.confidence < nonVerbalTop) kinds = kinds.filter((k) => k === 'stem');
        return kinds.map((kind) => ({ i, c, lemma: l, kind, surface: t.normalized, role: 'aux' as const }));
      });
  };
  const groups: VerbGroup[] = [];
  for (let i = 0; i < tokens.length; ) {
    const firsts = verbal(i);
    if (firsts.length === 0) { i++; continue; }
    let best: VerbGroup | undefined;
    for (const first of firsts) {
      const elems: Elem[] = [{ ...first, role: 'main' }];
      const particles: number[] = [];
      let j = i + 1;
      for (;;) {
        let k = j;
        let skipped: number | undefined;
        if (tokens[k]?.isWord && PARTICLES.has(tokens[k].normalized) && verbal(k).length === 0) { skipped = k; k++; }
        if (!tokens[k]?.isWord) break;
        let picked: Elem | undefined;
        for (const e of verbal(k)) {
          const role = fit(elems, e);
          if (!role) continue;
          // रहा after a stem is the progressive auxiliary when the word has that reading ("stayed" is the other)
          if (!picked || (e.lemma === 'रहना' && e.kind === 'prog' && picked.kind !== 'prog')) picked = { ...e, role };
          if (!(e.lemma === 'रहना')) break;
        }
        if (!picked) break;
        if (skipped !== undefined) particles.push(skipped);
        elems.push(picked);
        j = k + 1;
      }
      const topIsVerbal = !!analyses[i].candidates[0] && isVerbal(analyses[i].candidates[0]);
      const g = finish(elems, particles, topIsVerbal ? 1 : 0.7);
      if (!best || g.elems.length > best.elems.length) best = g;
    }
    groups.push(best as VerbGroup);
    i = (best as VerbGroup).end + 1;
  }
  return groups;
}

// ───────────────────────────── plain words ─────────────────────────────

const GENDER: Record<string, string> = { Masc: 'masculine', Fem: 'feminine' };
const NUMBER: Record<string, string> = { Sing: 'singular', Plur: 'plural' };

function agreementWords(c: C): string {
  const g = one(c, 'Gender');
  const n = one(c, 'Number');
  return [g ? GENDER[g] : '', n ? NUMBER[n] : ''].filter(Boolean).join(' ');
}

const TENSE_OF_AUX = (e: Elem | undefined): 'Pres' | 'Past' | 'Fut' | 'Sub' | undefined => {
  if (!e) return undefined;
  if (e.kind === 'fut' || hasF(e.c, 'Tense', 'Fut')) return 'Fut';
  if (e.kind === 'past' || hasF(e.c, 'Tense', 'Past')) return 'Past';
  if (e.kind === 'sub') return 'Sub';
  return 'Pres';
};

/** The meaning of the whole group in plain words, with the key facts about the forms. */
export function describeGroup(g: VerbGroup): string {
  const gloss = g.main.c.gloss;
  const head = `${g.main.lemma}${gloss ? ` ("${gloss}")` : ''}${g.vector ? ` + ${g.vector.lemma} (${HINDI_VECTOR_VERBS[g.vector.lemma] ?? 'adds a shade of meaning'})` : ''}`;
  const f = g.flags;
  const aux = g.tenseAux;
  const t = TENSE_OF_AUX(aux);
  const carrier = g.vector && !f.managing ? g.vector : g.core;
  const agr = agreementWords(carrier.c);
  const withAux = aux ? `with ${aux.surface}` : '';
  let meaning: string;
  if (f.passive) meaning = `passive: the thing done is the subject (${t === 'Past' ? 'was' : t === 'Fut' ? 'will be' : 'is'} done)`;
  else if (f.ability) meaning = `ability: can${f.passive ? '' : ' do it'} (सकना)`;
  else if (f.obligation) meaning = `obligation: has to, must, should${t === 'Past' ? ' (past: had to)' : ''}`;
  else if (f.wanting) meaning = 'wanting: wants to';
  else if (f.beginning) meaning = 'beginning: started to';
  else if (f.letting) meaning = 'letting: allowed to, let';
  else if (f.progressive) meaning = `progressive: ${t === 'Past' ? 'was' : t === 'Fut' ? 'will be' : 'is'} in the middle of doing it`;
  else if (f.continuative) meaning = 'continuing: keeps on, stays doing it';
  else if (carrier.kind === 'pf') meaning = t === 'Pres' ? 'present perfect: has done' : t === 'Past' ? 'past perfect: had done' : t === 'Fut' ? 'future perfect: will have done' : 'simple past: did';
  else if (carrier.kind === 'ipf') meaning = t === 'Pres' ? 'habitual present: does, usually does' : t === 'Past' ? 'habitual past: used to do, would do' : t === 'Fut' ? 'probably does (future of the habitual)' : 'habitual, with the helping verb left out';
  else if (carrier.kind === 'fut') meaning = 'future: will do';
  else if (carrier.kind === 'sub') meaning = 'subjunctive: may do, should do, let us do';
  else if (carrier.kind === 'imp') meaning = 'command or request';
  else if (carrier.kind === 'inf' || carrier.kind === 'infobl') meaning = 'the infinitive: the act named, to do';
  else if (carrier.kind === 'stem') meaning = 'the bare stem, which joins another verb';
  else if (carrier.kind === 'conv') meaning = 'having done, and then';
  else if (g.main.lemma === 'होना') meaning = t === 'Past' ? 'was' : t === 'Fut' ? 'will be' : 'is, are';
  else meaning = 'a conjugated form';
  const parts = [head, agr, g.main.kind === 'pf' || carrier.kind === 'pf' ? 'perfective' : carrier.kind === 'ipf' ? 'imperfective' : carrier.kind === 'prog' ? 'progressive' : '', withAux].filter(Boolean);
  return `${parts.join(', ')}: ${meaning}`;
}

/** The verb group that contains token i (a particle inside it counts), described; undefined when token i is in none. */
export function groupAround(tokens: RawToken[], analyses: AnalyzedToken[], i: number): VerbGroup | undefined {
  if (!tokens[i]?.isWord) return undefined;
  return buildVerbGroups(tokens, analyses).find((g) => g.tokenIndexes.includes(i));
}
