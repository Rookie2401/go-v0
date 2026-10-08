/**
 * The sentence layer of the Norwegian analyzer: what the neighbours decide among the readings of a homograph.
 * MACHINE-DRAFTED rules, not checked by a native speaker. There is no parser: a token's readings are scored by the words
 * directly around it (an article before a noun, å or a modal before an infinitive, har before a participle, a subject
 * before a finite verb, a preposition before a noun) and by a short list of function words whose part of speech depends on
 * the next word (den, det, de, noen, så, for, om, når, da, har). Nothing is removed: the readings are reordered and the
 * confidence of the top one says how much the neighbours decided.
 */
import type { AnalysisCandidate, PartOfSpeech, RawToken, WordPart } from '../../core';
import type { NoGender, NoStandard } from './types';

export interface Cand {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  gloss?: string;
  rules: string[];
  order: number;
  base: number;
  register?: AnalysisCandidate['register'];
  varieties?: string[];
  unverified?: boolean;
  score: number;
  origin: 'hand' | 'rule';
  gender?: NoGender;
  parts?: WordPart[];
  orthography?: AnalysisCandidate['orthography'];
  unconfirmed?: boolean;
  role?: string;
  unit?: AnalysisCandidate['unit'];
  notes?: Record<string, string | string[]>;
  context?: string;
  hyphen?: boolean;
}

export interface Slot { i: number; tok: RawToken; cands: Cand[]; initial: boolean; word: boolean }

const split = (v: string | undefined): string[] => (v ?? '').split(',').filter(Boolean);
const has = (c: Cand, k: string, v: string): boolean => split(c.morph[k]).includes(v);
const isVerb = (c: Cand): boolean => c.pos === 'VERB' || c.pos === 'AUX';
const finiteOnly = (c: Cand): boolean => isVerb(c) && has(c, 'VerbForm', 'Fin') && !has(c, 'VerbForm', 'Inf') && !has(c, 'VerbForm', 'Part') && !has(c, 'Mood', 'Imp');
const finiteAny = (c: Cand): boolean => isVerb(c) && has(c, 'VerbForm', 'Fin') && !has(c, 'Mood', 'Imp');

const MODALS = new Set(['kunne', 'skulle', 'ville', 'måtte', 'burde', 'tørre', 'tore']);
const SENT_ADV = new Set(['ikke', 'ikkje', 'aldri', 'alltid', 'ofte', 'også', 'òg', 'bare', 'berre', 'jo', 'nok', 'vel', 'allerede', 'allereie', 'snart', 'nå', 'no', 'da', 'då', 'sikkert', 'kanskje', 'visst', 'heller', 'veldig', 'nesten', 'ennå', 'enno', 'sjelden', 'sjeldan', 'gjerne', 'fortsatt']);
const SUBJECT_LEMMAS = new Set(['jeg', 'du', 'han', 'hun', 'vi', 'dere', 'de', 'man', 'eg', 'ho', 'dei', 'me', 'ein', 'den', 'det']);
const PRE_NOUN_DET = new Set(['en', 'ei', 'et', 'eit', 'ein', 'den', 'det', 'de', 'dei', 'denne', 'dette', 'disse', 'desse', 'min', 'din', 'sin', 'vår', 'hans', 'hennes', 'hennar', 'deres', 'deira', 'dykkar', 'dens', 'dets', 'ingen', 'noen', 'noe', 'nokon', 'noko', 'hver', 'kvar', 'all', 'alle', 'begge', 'hele', 'heile', 'hvilken', 'mange', 'slik', 'sånn', 'annen', 'annan', 'samme', 'same', 'mye', 'mykje', 'lite', 'litt', 'få', 'flere', 'fleire', 'mer', 'meir', 'hvilket', 'hvilke']);

/** Does any reading of the slot satisfy p? */
const can = (s: Slot | undefined, p: (c: Cand) => boolean): boolean => !!s && s.cands.some(p);
const topIs = (s: Slot | undefined, p: (c: Cand) => boolean): boolean => !!s && !!s.cands[0] && p(s.cands[0]);

const subjectSlot = (s: Slot | undefined): boolean => can(s, (c) => c.pos === 'PRON' && (has(c, 'Case', 'Nom') || SUBJECT_LEMMAS.has(c.lemma)) && !has(c, 'PronType', 'Rel') && !has(c, 'PronType', 'Int'));
/** A word that can only be an adverb (endelig, snart): it may stand between an auxiliary and its participle. */
const advSlot = (s: Slot | undefined): boolean => !!s && s.word && s.cands.length > 0 && s.cands.every((c) => c.pos === 'ADV');
const TIME_NOUNS = new Set(['vinter', 'sommer', 'høst', 'vår', 'kveld', 'morgen', 'natt', 'dag', 'uke', 'måned', 'år', 'ettermiddag', 'formiddag', 'sommar', 'haust', 'morgon', 'veke', 'månad']);
const nomPron = (s: Slot | undefined): boolean => can(s, (c) => c.pos === 'PRON' && has(c, 'Case', 'Nom'));

/** A reading that could start a noun phrase or be in the middle of one. */
const nominalCand = (c: Cand): boolean => c.pos === 'NOUN' || c.pos === 'PROPN' || c.pos === 'ADJ' || c.pos === 'NUM';
/** Is the slot a word that continues a noun phrase (not a finite verb, adverb or preposition)? */
function nominalSlot(s: Slot | undefined): boolean {
  if (!s || !s.word || !s.cands.length) return false;
  if (!s.cands.some(nominalCand)) return false;
  const top = s.cands[0];
  if (isVerb(top) && finiteOnly(top)) return false;
  return true;
}

interface Ctx { i: number; slots: Slot[]; std: NoStandard; pw?: Slot; ppw?: Slot; nw?: Slot; nnw?: Slot; punctBefore: string; clauseStart: boolean }

function context(slots: Slot[], i: number, std: NoStandard): Ctx {
  const prev = slots[i - 1];
  const pw = prev?.word ? prev : undefined;
  const ppw = pw ? (slots[i - 2]?.word ? slots[i - 2] : undefined) : undefined;
  const next = slots[i + 1];
  const nw = next?.word ? next : undefined;
  const nnw = nw && slots[i + 2]?.word ? slots[i + 2] : undefined;
  const punctBefore = prev && !prev.word ? prev.tok.surface : '';
  const clauseStart = !prev || (!!punctBefore && /[.!?;:,—–"»«“”(]/.test(punctBefore)) || (!!pw && can(pw, (c) => c.pos === 'CONJ' && ['og', 'men', 'eller', 'for', 'så'].includes(c.lemma)));
  return { i, slots, std, pw, ppw, nw, nnw, punctBefore, clauseStart };
}

/** Score adjustment of one candidate in its context (positive = more likely). */
function adjust(c: Cand, x: Ctx): number {
  const { pw, ppw, nw, nnw } = x;
  const surface = x.slots[x.i].tok.normalized;
  let s = 0;
  const pTop = pw?.cands[0];
  const afterMarker = !!pw && (can(pw, (p) => p.pos === 'PART' && p.lemma === 'å') || can(pw, (p) => p.pos === 'AUX' && MODALS.has(p.lemma) && finiteAny(p)) || can(pw, (p) => p.pos === 'VERB' && ['la', 'late', 'få'].includes(p.lemma) && finiteAny(p)));
  const postposed = !!pw && can(pw, (p) => p.pos === 'DET' && split(p.morph.Poss).includes('Yes')) && !!ppw && topIs(ppw, (p) => p.pos === 'NOUN' && has(p, 'Definite', 'Def'));
  // a subject (or an adverb after it) directly before: ... han spiser, ... han ikke spiser
  const afterSubject = postposed || !!pw && (subjectSlot(pw) || (SENT_ADV.has(pw.tok.normalized) && subjectSlot(ppw)) || topIs(pw, (p) => (p.pos === 'NOUN' || p.pos === 'PROPN') && (has(p, 'Definite', 'Def') || p.pos === 'PROPN')));
  const afterDet = !postposed && !!pw && can(pw, (p) => (p.pos === 'DET' || (p.pos === 'ADJ' && (has(p, 'Definite', 'Def') || p.lemma === 'annen'))) && (PRE_NOUN_DET.has(p.lemma) || p.pos === 'ADJ'));
  const afterAdj = !!pw && topIs(pw, (p) => p.pos === 'ADJ');
  const afterAdp = !!pw && topIs(pw, (p) => p.pos === 'ADP');
  const afterHa = !!pw && can(pw, (p) => p.pos === 'AUX' && ['ha', 'bli', 'hava', 'verte'].includes(p.lemma) && (finiteAny(p) || has(p, 'VerbForm', 'Inf')));
  const afterVaere = !!pw && can(pw, (p) => p.pos === 'AUX' && ['være', 'vere'].includes(p.lemma));
  const afterHaAdv = !!pw && (SENT_ADV.has(pw.tok.normalized) || advSlot(pw)) && can(ppw, (p) => p.pos === 'AUX' && ['ha', 'bli', 'hava', 'verte'].includes(p.lemma));
  const afterSeUt = !!pw && pw.tok.normalized === 'ut' && can(ppw, (p) => ['se', 'sjå'].includes(p.lemma) && p.pos === 'VERB');
  const afterCopula = !!pw && can(pw, (p) => p.pos === 'AUX' && ['være', 'bli', 'vere', 'verte'].includes(p.lemma));
  const beforeNominal = nominalSlot(nw);

  if (isVerb(c)) {
    const inf = has(c, 'VerbForm', 'Inf');
    const part = has(c, 'VerbForm', 'Part');
    const fin = has(c, 'VerbForm', 'Fin') && !has(c, 'Mood', 'Imp');
    const imp = has(c, 'Mood', 'Imp');
    if (afterMarker) { if (inf) s += 3; else s -= 1.5; }
    else if (inf && !part && !fin) s -= 1;
    if ((afterHa || afterHaAdv) && part) s += 3;
    else if (afterVaere && part) s += can(x.slots[x.i], (k) => k.pos === 'ADJ') ? -0.5 : 1.5;
    else if (part) s -= 1;
    if (afterSubject && fin) s += 2.5;
    if (fin && nw && nw.tok.normalized === 'å' && can(nw, (n) => n.pos === 'PART')) s += 2.5;
    if (fin && x.clauseStart && subjectSlot(nw)) s += 2.5; // inversion and questions: Kommer du? I dag spiser jeg
    if (afterDet || afterAdp) s -= 2.5;
    if (imp) { s += x.slots[x.i].initial && !subjectSlot(nw) ? 0.5 : -2; if (afterSubject) s -= 1.5; }
    if (c.pos === 'AUX' && !part && !imp && !inf) s += 0.5;
    if (has(c, 'Voice', 'Pass')) s -= 0.5;
  } else if (c.pos === 'NOUN') {
    if (afterDet) s += 2.5;
    if (afterAdj) s += 1.5;
    if (afterAdp) s += 2;
    if (afterMarker) s -= 2;
    if (afterSubject && !afterDet) s -= 0.5;
    if (afterHa || afterHaAdv) s -= 1;
    if (pw && can(pw, (p) => p.pos === 'DET' && split(p.morph.Poss).includes('Yes'))) s += 1;
    if (x.clauseStart && subjectSlot(nw) && !x.pw) s -= 1;
  } else if (c.pos === 'ADJ') {
    if (afterCopula || afterSeUt) s += 3.5;
    if (afterDet && beforeNominal) s += 1.5;
    if (afterDet && !beforeNominal && !afterAdj) s += 0.5;
    if (afterAdp) s -= 0.5;
    if (afterMarker) s -= 2;
    if (!afterCopula && !afterSeUt && !afterDet && !beforeNominal && !afterAdj && !afterVaere) s -= 1;
  } else if (c.pos === 'ADV') {
    if (nw && can(nw, (n) => n.pos === 'ADJ') && !beforeNominalNoun(nw)) s += 0.5;
  }

  // a name written as the lexicon holds it, with a capital in the middle of a sentence
  if (c.pos === 'PROPN' && x.slots[x.i].tok.surface === c.lemma) s += x.slots[x.i].initial ? 1 : 3;
  // lemma-specific resolution of function words
  s += functionWordAdjust(c, x, { afterSubject, afterDet, afterAdp, afterMarker, beforeNominal, surface, afterHa });
  void pTop; void nnw;
  return s;
}

function beforeNominalNoun(n: Slot): boolean { return n.cands.some((c) => c.pos === 'NOUN'); }

interface Flags { afterSubject: boolean; afterDet: boolean; afterAdp: boolean; afterMarker: boolean; beforeNominal: boolean; surface: string; afterHa: boolean }

function functionWordAdjust(c: Cand, x: Ctx, f: Flags): number {
  const { nw, nnw, pw } = x;
  const { surface } = f;
  const nextFinite = can(nw, (n) => finiteAny(n));
  const nextSubject = subjectSlot(nw);
  const nextIsNounPhraseStart = f.beforeNominal && !nextFinite;
  // a number in front of a plural noun (tre år, tre veker): the numeral, not the noun tre
  const nextPluralNoun = can(nw, (n) => n.pos === 'NOUN' && has(n, 'Number', 'Plur') && has(n, 'Definite', 'Ind'));
  if (c.pos === 'NUM' && nextPluralNoun) return 3;
  if (c.pos === 'NOUN' && c.lemma === 'tre' && nextPluralNoun) return -3;
  // verb forms that are also very frequent function words: så (se, past), for (fare, past)
  if (c.pos === 'VERB' && surface === 'så' && c.lemma === 'se') return f.afterSubject && !x.clauseStart && !nextSubject ? 2.5 : -3;
  if (c.pos === 'VERB' && surface === 'for' && c.lemma === 'fare') return nextIsNounPhraseStart ? -6 : f.afterSubject ? 0 : -4;
  const quant = ['denne', 'dette', 'disse', 'desse', 'noen', 'noe', 'nokon', 'noko', 'ingen', 'mange', 'mye', 'mykje', 'lite', 'alt', 'all', 'alle', 'begge', 'hver', 'kvar', 'mer', 'meir', 'mest', 'flere', 'fleire', 'flest', 'få', 'litt'];
  if (c.pos === 'PRON' && ['dette', 'disse', 'desse'].includes(c.lemma)) return nextIsNounPhraseStart ? -2.5 : 1.5;
  if (c.pos === 'DET' && quant.includes(c.lemma)) return nextIsNounPhraseStart ? 1.5 : -1.5;
  if (c.pos === 'PRON' && quant.includes(c.lemma)) return nextIsNounPhraseStart ? -1.5 : 1.5;
  if (c.pos === 'ADV' && ['mer', 'meir', 'mest', 'mye', 'mykje', 'litt'].includes(c.lemma)) return nextIsNounPhraseStart ? -1 : 0.5;
  switch (c.lemma) {
    case 'den': case 'det': case 'de': case 'dei': {
      if (c.pos === 'DET') {
        const adjThenNoun = can(nw, (n) => n.pos === 'ADJ') && (can(nnw, (n) => n.pos === 'NOUN') || can(nnw, (n) => n.pos === 'ADJ'));
        const nounDef = can(nw, (n) => n.pos === 'NOUN' && has(n, 'Definite', 'Def')) && !nextFinite;
        const ok = adjThenNoun || nounDef;
        return ok && !(c.lemma === 'det' && can(nw, (n) => n.pos === 'AUX')) ? 2.5 : -2.5;
      }
      if (c.pos === 'PRON') {
        const adjThenNoun = can(nw, (n) => n.pos === 'ADJ') && can(nnw, (n) => n.pos === 'NOUN');
        const nounDef = can(nw, (n) => n.pos === 'NOUN' && has(n, 'Definite', 'Def')) && !nextFinite;
        const afterFiniteVerb = !!pw && can(pw, (p) => finiteAny(p));
        return adjThenNoun || nounDef ? -2.5 : afterFiniteVerb ? 2.5 : 1.5;
      }
      return 0;
    }
    case 'en': case 'ein': {
      const nextAv = !!nw && nw.tok.normalized === 'av';
      if (c.pos === 'DET') return nextAv ? -2 : nextFinite && !f.beforeNominal ? -2 : 1.5;
      if (c.pos === 'NUM') return nextAv ? 1 : -1;
      if (c.pos === 'PRON') return nextAv ? 1 : f.beforeNominal ? -2 : nextFinite ? 1 : -1;
      return 0;
    }
    case 'ha': case 'hava': {
      const isPart = (n: Cand): boolean => isVerb(n) && has(n, 'VerbForm', 'Part');
      const nnnw = nnw && x.slots[nnw.i + 1]?.word ? x.slots[nnw.i + 1] : undefined;
      // har + participle, har ikke + participle, Har du + participle, Har du ikke + participle
      const nextPart = can(nw, isPart) || (!!nw && (SENT_ADV.has(nw.tok.normalized) || advSlot(nw)) && can(nnw, isPart)) || (subjectSlot(nw) && (can(nnw, isPart) || (!!nnw && (SENT_ADV.has(nnw.tok.normalized) || advSlot(nnw)) && can(nnnw, isPart))));
      const modalBefore = pw && can(pw, (p) => p.pos === 'AUX' && MODALS.has(p.lemma));
      if (c.pos === 'AUX') return nextPart || (modalBefore && nextPart) ? 2.5 : -2;
      if (c.pos === 'VERB') return nextPart ? -2 : 1.5;
      return 0;
    }
    case 'bli': case 'verte': {
      const nextPart = can(nw, (n) => isVerb(n) && has(n, 'VerbForm', 'Part') && n.lemma !== 'bli') || (nw && (SENT_ADV.has(nw.tok.normalized) || advSlot(nw)) && can(nnw, (n) => isVerb(n) && has(n, 'VerbForm', 'Part')));
      if (c.pos === 'AUX') return nextPart ? 2 : -1;
      if (c.pos === 'VERB') return nextPart ? -2 : 1;
      return 0;
    }
    case 'så': {
      if (c.pos === 'VERB') return f.afterSubject && !x.clauseStart && !nextSubject ? 2.5 : -3;
      if (c.pos === 'CONJ') return x.punctBefore === ',' || (pw && can(pw, (p) => p.pos === 'CONJ' && p.lemma === 'og')) ? (nextSubject ? 2 : -1) : -2;
      if (c.pos === 'ADV') return 0.5;
      return 0;
    }
    case 'for': {
      if (c.pos === 'CONJ') return nomPron(nw) && (x.punctBefore === ',' || !x.clauseStart || true) && !x.clauseStart ? 3 : x.clauseStart && nomPron(nw) && x.punctBefore === ',' ? 3 : -1.5;
      if (c.pos === 'ADV') return can(nw, (n) => n.pos === 'ADJ' || n.pos === 'ADV') && !beforeNominalNoun(nw as Slot) ? 3 : -2;
      if (c.pos === 'ADP') return nomPron(nw) ? -2 : 0.5;
      if (c.pos === 'VERB') return nextIsNounPhraseStart ? -6 : f.afterSubject ? 0 : -4;
      return 0;
    }
    case 'om': {
      const timeNoun = can(nw, (n) => n.pos === 'NOUN' && TIME_NOUNS.has(n.lemma) && has(n, 'Definite', 'Def'));
      if (timeNoun && !nomPron(nw)) return c.pos === 'ADP' ? 3 : c.pos === 'SCONJ' ? -3 : 0;
      if (c.pos === 'SCONJ') return nomPron(nw) || (can(nw, (n) => n.pos === 'NOUN') && can(nnw, (n) => finiteAny(n) || (n.pos === 'ADV' && SENT_ADV.has(n.lemma)))) ? 3 : -2;
      if (c.pos === 'ADP') return nomPron(nw) ? -2 : 0.5;
      return 0;
    }
    case 'når': {
      if (c.pos === 'ADV') return nextFinite && !nextSubject && !can(nw, (n) => n.pos === 'NOUN') && x.clauseStart ? 3 : -2;
      if (c.pos === 'SCONJ') return nextFinite && !nextSubject && x.clauseStart ? -2 : 1.5;
      return 0;
    }
    case 'da': case 'då': {
      if (c.pos === 'ADV') return nextFinite && !nextSubject ? 2.5 : !nw ? 1 : f.afterDet ? 0 : nextSubject || can(nw, (n) => n.pos === 'NOUN' || n.pos === 'PROPN') ? -1.5 : 0;
      if (c.pos === 'SCONJ') return nextSubject || (can(nw, (n) => n.pos === 'NOUN' || n.pos === 'PROPN') && !nextFinite) ? 2.5 : -2;
      return 0;
    }
    case 'takk': return c.pos === 'INTJ' ? 3 : 0;
    case 'takke': return c.pos === 'VERB' && surface === 'takk' ? (nomPron(nw) ? 0 : -3) : 0;
    case 'før': case 'siden': case 'sidan': {
      if (c.pos === 'ADV' && c.lemma === 'før') return !nw || !nominalSlot(nw) && !nomPron(nw) && !can(nw, (n) => n.pos === 'DET' || n.pos === 'PRON') ? 3 : -3;
      if (c.pos === 'SCONJ') return nomPron(nw) ? 2.5 : -1.5;
      if (c.pos === 'ADP') return nomPron(nw) ? -2 : !nw ? -2 : 0.5;
      return 0;
    }
    case 'som': {
      if (c.pos === 'SCONJ') return pw && can(pw, (p) => ['samme', 'same', 'slik', 'sånn', 'like', 'så', 'ikke'].includes(p.lemma)) ? 1.5 : -0.5;
      return 0;
    }
    case 'hvis': {
      if (c.pos === 'SCONJ') return 1;
      return -1;
    }
    case 'nå': return c.pos === 'VERB' && surface === 'når' ? (f.afterSubject ? 1 : -4) : 0;
    case 'enn': return 0;
    case 'alle': return 0;
    case 'rett': return 0;
    case 'på': case 'av': case 'over': case 'under': case 'etter': case 'før ': {
      if (c.pos === 'ADV') return !nw || !nextIsNounPhraseStart && !nomPron(nw) && !can(nw, (n) => n.pos === 'DET' || n.pos === 'PRON') ? 1 : -2;
      if (c.pos === 'ADP') return !nw ? -1.5 : 0;
      return 0;
    }
    default: break;
  }
  void surface;
  return 0;
}

/**
 * Reorder every word's candidates by the words around it. The scores use the neighbours' context-free order (the lexicon
 * order), so the result does not depend on the order the tokens are visited.
 */
export function rankSentence(slots: Slot[], _tokens: RawToken[], std: NoStandard): void {
  // snapshot of the context-free candidate lists, so that every token is judged against its neighbours' original readings
  const snapshot = slots.map((s) => ({ ...s, cands: s.cands }));
  const scores = new Map<number, number[]>();
  for (const s of slots) {
    if (!s.word || s.cands.length === 0) continue;
    const x = context(snapshot, s.i, std);
    const base = s.cands.map((c, k) => -(k * 0.01) - c.order / 1e7 + adjust(c, x));
    scores.set(s.i, base);
  }
  for (const s of slots) {
    const sc = scores.get(s.i);
    if (!sc) continue;
    const order = s.cands.map((c, k) => ({ c, v: sc[k] })).sort((a, b) => b.v - a.v);
    s.cands = order.map((o) => ({ ...o.c, score: o.v }));
    if (s.cands.length > 1 && s.cands[0].score - s.cands[1].score >= 1.5) s.cands[0].context = describe(s.cands[0]);
  }
}

function describe(c: Cand): string {
  return `the neighbouring words fit ${c.lemma} as ${c.pos.toLowerCase()}`;
}
