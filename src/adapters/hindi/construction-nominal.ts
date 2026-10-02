/**
 * Construction detectors about nouns, adjectives, postpositions and small words: agreement of adjective and noun, का / के / की,
 * the oblique before a postposition, plural forms, comparison, वाला, repeated words, ही / भी / तो, क्या questions, having and
 * existing. Each fires only where the words it reads are analysed (a reading that says what they are), conservatively.
 * Machine-drafted from general knowledge of Hindi grammar, not checked by a native speaker.
 */
import type { PatternCandidate } from '../../core';
import { genderOf, hasF, hit, isGenitive, isPostposition, numberOf, trust, feat, type Ctx } from './construction-ctx';
import type { C } from './verb-group';

const isNoun = (x: C): boolean => x.pos === 'NOUN' || x.pos === 'PROPN';
const caseOverlap = (a: C, b: C): boolean => {
  const fa = feat(a, 'Case');
  const fb = feat(b, 'Case');
  return fa.length === 0 || fb.length === 0 || fa.some((v) => fb.includes(v));
};
const numberAgrees = (a: C, b: C): boolean => {
  const fa = feat(a, 'Number');
  const fb = feat(b, 'Number');
  return fa.length === 0 || fb.length === 0 || fa.some((v) => fb.includes(v));
};

/** The noun that an adjective or genitive at i describes: the first noun after up to two adjectives. */
function headNoun(c: Ctx, i: number): { j: number; noun: C } | undefined {
  let j = c.after(i);
  for (let step = 0; step < 3 && j >= 0; step++) {
    const noun = c.find(j, (x) => isNoun(x) && genderOf(x) !== undefined);
    if (noun && !c.find(j, (x) => x.pos === 'ADJ' && x.confidence > noun.confidence)) return { j, noun };
    if (!c.pos(j, 'ADJ', 'NUM')) return undefined;
    j = c.after(j);
  }
  return undefined;
}

export function adjectiveNounAgreement(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 0; i < c.tokens.length; i++) {
    const adjs = c.cands(i).filter((x) => x.pos === 'ADJ' && genderOf(x) !== undefined && x.morph.Poss === undefined);
    if (adjs.length === 0 || c.cands(i).some((x) => x.pos !== 'ADJ' && x.confidence >= adjs[0].confidence)) continue; // a word that reads better as something else
    const head = headNoun(c, i);
    if (!head) continue;
    const { j } = head;
    const nouns = c.cands(j).filter((x) => isNoun(x) && genderOf(x) !== undefined);
    // any reading of the adjective that agrees with any reading of the noun
    let found: [C, C] | undefined;
    for (const a of adjs) for (const n of nouns) if (!found && genderOf(a) === genderOf(n) && numberAgrees(a, n) && caseOverlap(a, n)) found = [a, n];
    if (found) out.push(hit('adjective-noun-agreement', trust(found[0], found[1]), [i, j]));
  }
  return out;
}

export function genitiveAgreement(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 0; i < c.tokens.length; i++) {
    if (!isGenitive(c, i)) continue;
    const gen = c.find(i, (x) => x.lemma === 'का' || x.morph.Poss === 'Yes' || x.morph.Case === 'Gen');
    const surface = c.n(i);
    if (!/[ाेी]$/u.test(surface) || (surface.length < 3 && !['का', 'के', 'की'].includes(surface))) continue;
    const head = headNoun(c, i);
    if (!head) continue;
    const { j, noun } = head;
    const g = genderOf(noun);
    const cases = feat(noun, 'Case');
    const plural = numberOf(noun) === 'Plur';
    let wants: string[];
    if (g === 'Fem') wants = ['ी'];
    else if (plural) wants = ['े'];
    else {
      const dir = cases.includes('Dir');
      const obl = cases.includes('Obl');
      wants = dir && !obl ? ['ा'] : obl && !dir ? ['े'] : ['ा', 'े'];
    }
    if (!wants.includes(surface[surface.length - 1])) continue;
    out.push(hit('genitive-agreement', trust(gen, noun), [i, j]));
  }
  return out;
}

export function obliqueBeforePostposition(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 0; i < c.tokens.length; i++) {
    const x = c.find(i, (r) => (isNoun(r) || r.pos === 'PRON') && hasF(r, 'Case', 'Obl') && !hasF(r, 'Case', 'Dir') && r.lemma !== undefined && r.lemma !== c.n(i));
    if (!x) continue;
    const j = c.after(i);
    if (j < 0 || !isPostposition(c, j)) continue;
    out.push(hit('oblique-before-postposition', trust(x, c.find(j, () => true)), [i, j]));
  }
  return out;
}

export function pluralForms(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 0; i < c.tokens.length; i++) {
    const x = c.find(i, (r) => isNoun(r) && numberOf(r) === 'Plur' && r.lemma !== undefined && r.lemma !== c.n(i));
    if (!x) continue;
    if (!['NOUN', 'PROPN', 'ADJ'].includes(c.cands(i)[0]?.pos ?? '')) continue; // the word reads better as something else
    const j = c.after(i);
    if (j >= 0 && isPostposition(c, j)) continue; // before a postposition the form is the oblique singular, not a plural
    // a form that may also be a singular (लड़के) is a plural with less certainty
    const alsoSingular = c.cands(i).some((r) => isNoun(r) && numberOf(r) === 'Sing' && r.lemma === x.lemma);
    out.push(hit('plural-forms', trust(x) * (alsoSingular ? 0.8 : 1), [i]));
  }
  return out;
}

export function postpositionAfterNoun(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 0; i < c.tokens.length; i++) {
    const x = c.find(i, (r) => isNoun(r) || r.pos === 'PRON');
    if (x) {
      const j = c.after(i);
      const adp = j >= 0 ? c.pos(j, 'ADP') : undefined;
      if (adp && adp.confidence >= c.cands(j)[0].confidence - 0.2) out.push(hit('postposition-after-noun', trust(x, adp), [i, j]));
    }
    const fused = c.find(i, (r) => !!r.parts?.some((p) => p.pos === 'ADP'));
    if (fused) out.push(hit('postposition-after-noun', trust(fused) * 0.95, [i]));
  }
  return out;
}

const COMPARATIVE_WORDS = new Set(['ज़्यादा', 'अधिक', 'कम', 'बेहतर', 'बेहतरीन', 'ज्यादा']);
const SKIPPABLE = new Set(['बहुत', 'थोड़ा', 'कहीं', 'ज़रा', 'और', 'काफ़ी', 'कुछ']);

export function comparisonAndSuperlative(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 0; i < c.tokens.length; i++) {
    if (!c.isWord(i)) continue;
    const surface = c.n(i);
    const sabse = surface === 'सबसे' || (surface === 'सब' && c.n(i + 1) === 'से');
    if (sabse) {
      const j = surface === 'सबसे' ? c.after(i) : c.after(i + 1);
      const adj = j >= 0 ? c.pos(j, 'ADJ', 'ADV') : undefined;
      if (adj) out.push(hit('superlative-sabse', trust(adj), [i, j]));
      continue;
    }
    const fusedSe = !!c.find(i, (r) => !!r.parts?.some((p) => p.lemma === 'से'));
    const se = surface === 'से' && (c.cands(i).length === 0 || !!c.find(i, (r) => r.pos === 'ADP' || r.lemma === 'से'));
    if (!fusedSe && !se) continue;
    const source = se ? c.before(i) : i;
    if (source < 0 || !c.pos(source, 'NOUN', 'PROPN', 'PRON')) continue;
    // the thing compared with, then the adjective (a few intensifiers may stand between)
    let j = c.after(i);
    for (let step = 0; step < 2 && j >= 0 && SKIPPABLE.has(c.n(j)) && !COMPARATIVE_WORDS.has(c.n(j)); step++) j = c.after(j);
    if (j < 0) continue;
    const adj = c.pos(j, 'ADJ');
    const word = COMPARATIVE_WORDS.has(c.n(j));
    if (!adj && !word) continue;
    const next = c.after(j);
    const attributive = !word && next >= 0 && !!c.pos(next, 'NOUN') && genderOf(adj as C) === genderOf(c.pos(next, 'NOUN') as C);
    out.push(hit('comparison-se', (word ? 0.85 : attributive ? 0.55 : 0.8) * (adj ? trust(adj) : 1), [source, ...(se ? [i] : []), j]));
  }
  return out;
}

const VAALA = new Set(['वाला', 'वाली', 'वाले', 'वालों', 'वालीं', 'वालियाँ', 'वालो']);

export function vaala(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 1; i < c.tokens.length; i++) {
    if (!c.isWord(i) || !(VAALA.has(c.n(i)) || c.lemma(i, 'वाला'))) continue;
    const p = c.before(i);
    if (p < 0) continue;
    const verbal = c.find(p, (r) => (r.pos === 'VERB' || r.pos === 'AUX') && r.morph.VerbForm === 'Inf');
    const known = c.cands(p).length > 0;
    out.push(hit('vaala', verbal ? 0.9 : known ? 0.8 : 0.5, [p, i]));
  }
  return out;
}

const NOT_REPEATED = new Set(['है', 'हैं', 'था', 'थी', 'थे', 'और', 'से', 'में', 'की', 'के', 'का', 'को', 'ने', 'नहीं', 'न', 'ही', 'भी', 'तो', 'कि', 'यह', 'वह', 'वे', 'ये', 'मैं', 'हम', 'तुम', 'आप', 'पर', 'जो', 'क्या']);
const HYPHENS = new Set(['-', '‐', '–', '‑']);

export function reduplication(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const usable = (i: number): C | undefined => c.find(i, (r) => ['NOUN', 'ADJ', 'ADV', 'VERB', 'NUM', 'PRON'].includes(r.pos ?? ''));
  for (let i = 0; i < c.tokens.length; i++) {
    if (!c.isWord(i)) continue;
    const w = c.n(i);
    const dash = w.split(/[-‐–‑]/u);
    if (dash.length === 2 && dash[0].length > 1 && dash[0] === dash[1] && !NOT_REPEATED.has(dash[0])) {
      const x = usable(i);
      out.push(hit('reduplication', x ? trust(x) : 0.6, [i]));
      continue;
    }
    if (NOT_REPEATED.has(w) || w.length < 2) continue;
    let j = i + 1;
    const hyphen = c.tokens[j] && !c.tokens[j].isWord && HYPHENS.has(c.tokens[j].surface);
    if (hyphen) j++;
    if (!c.isWord(j) || c.n(j) !== w) continue;
    const x = usable(i);
    if (!x && !hyphen) continue; // two equal unanalysed words are not enough
    out.push(hit('reduplication', x ? trust(x) * (hyphen ? 1 : 0.85) : 0.6, [i, j])); // the hyphen between the halves is not a word of the construction
    i = j;
  }
  return out;
}

export function emphaticParticles(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  for (let i = 0; i < c.tokens.length; i++) {
    if (!c.isWord(i)) continue;
    const w = c.n(i);
    if (w !== 'ही' && w !== 'भी' && w !== 'तो') continue;
    const cs = c.cands(i);
    if (cs.length > 0 && !cs.some((r) => r.pos === 'PART' || r.pos === 'ADV' || r.pos === 'CONJ')) continue;
    const commaBefore = i > 0 && !c.tokens[i - 1].isWord && c.tokens[i - 1].surface === ',';
    if (w === 'तो' && commaBefore) continue; // ", तो" answers a condition
    const prev = c.before(i);
    out.push(hit('emphatic-particles', w === 'तो' ? 0.7 : 0.85, prev >= 0 ? [prev, i] : [i]));
  }
  return out;
}

export function questionKya(c: Ctx): PatternCandidate[] {
  let first = -1;
  for (let i = 0; i < c.tokens.length; i++) if (c.tokens[i].isWord) { first = i; break; }
  if (first < 0 || c.n(first) !== 'क्या') return [];
  const mark = c.tokens.some((t) => !t.isWord && t.surface.includes('?'));
  const x = c.lemma(first, 'क्या');
  if (c.cands(first).length > 0 && !x) return [];
  return [hit('question-kya', mark ? 0.9 : 0.6, [first])];
}

export function existencePossession(c: Ctx): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const loneBe = (i: number, from: number, to: number) => {
    const g = c.groups.find((x) => x.main.lemma === 'होना' && x.elems.length === 1 && x.main.i > i && x.main.i >= from && x.main.i <= to);
    return g;
  };
  for (let i = 0; i < c.tokens.length; i++) {
    if (!c.isWord(i)) continue;
    const [from, to] = c.clause(i);
    if (c.n(i) === 'पास' && i > 0) {
      const gi = c.before(i);
      if (gi >= 0 && isGenitive(c, gi)) {
        const be = loneBe(i, from, to);
        if (be) out.push(hit('existence-possession', trust(be.main.c) * 0.95, [gi, i, be.main.i]));
      }
      continue;
    }
    // उसका एक भाई है: a genitive opening the clause, a noun, then the bare verb "to be" (not "this is my house")
    if (i === from && isGenitive(c, i) && c.n(i) !== 'के') {
      let j = c.after(i);
      let noun = -1;
      for (let step = 0; step < 3 && j >= 0; step++) {
        if (c.pos(j, 'NOUN')) { noun = j; break; }
        if (!c.pos(j, 'ADJ', 'NUM')) break;
        j = c.after(j);
      }
      if (noun < 0) continue;
      const be = loneBe(noun, from, to);
      if (be && be.main.i === c.after(noun)) out.push(hit('existence-possession', 0.65, [i, noun, be.main.i]));
    }
  }
  return out;
}
