/**
 * Which reading of a written form is meant here? Hindi spells many different things alike: की (of, feminine / did,
 * feminine), पर (on / but), से, खाना (food / to eat), सोना (gold / to sleep), आम (mango / common), का-के-की before their
 * noun, a perfective participle that is also an adjective. A small set of neighbour rules orders the readings; it
 * removes none of them and says which neighbour decided (`notes.context`). Not a parser.
 *
 * What it is: an ordering of readings the analysis already has. The chosen reading moves to the front and keeps its
 * own confidence; the others stay, below it, marked down to 0.4 at most, and `notes.context` says which neighbour
 * decided. Nothing is invented and nothing is removed, so a wrong choice is one tap away from the right one on the word
 * sheet. What it is not: a parser. It reads one or two words to the left and one to the right (and, for ने, the clause
 * to the left); where those do not decide, the readings are returned as they were (the same array).
 *
 * Deliberately left alone: कल (yesterday and tomorrow are one word; the context belongs to the sentence, not to the
 * lemma) and the spellings की / कि (different words). तो, भी, ही are particles wherever they stand.
 * Machine-drafted rules, not checked by a native speaker.
 */
import type { AnalysisCandidate, RawToken } from '../../core';
import { HINDI_VECTOR_VERBS } from './verb-group';

type C = AnalysisCandidate;

const feat = (c: C, k: string): string[] => (c.morph[k] ? c.morph[k].split(',') : []);
const has = (c: C, k: string, v: string): boolean => feat(c, k).includes(v);
const isVerbal = (c: C): boolean => c.pos === 'VERB' || c.pos === 'AUX';
const isNominal = (c: C): boolean => c.pos === 'NOUN' || c.pos === 'PROPN';
const NUMBERS_PLURAL_DETERMINERS = new Set(['ये', 'वे', 'कई', 'सभी', 'सारे', 'अनेक', 'दोनों', 'सब', 'बहुत-से']);
const OBLIQUE_DETERMINERS = new Set(['इस', 'उस', 'इन', 'उन', 'किस', 'जिस', 'किन', 'जिन']);
const POSTPOSITIONS = new Set(['ने', 'को', 'से', 'में', 'पर', 'तक', 'का', 'के', 'की']);
const COMPOUND_HEADS = new Set([
  'लिए', 'लिये', 'साथ', 'बाद', 'पास', 'पहले', 'पीछे', 'बारे', 'ऊपर', 'नीचे', 'अंदर', 'बाहर', 'सामने', 'बीच', 'बिना', 'द्वारा', 'कारण',
  'अलावा', 'अनुसार', 'बजाय', 'भीतर', 'मुताबिक़', 'बावजूद', 'दौरान', 'आगे', 'ओर', 'तरफ़', 'तरह', 'वजह', 'जगह', 'समान', 'निकट', 'क़रीब', 'बदले', 'चलते', 'रूप', 'तहत',
].map((s) => s.normalize('NFC')));
const PARTICLES = new Set(['तो', 'भी', 'ही']);
/** Words that govern the noun before them as a postposition does: वाला, जैसा, सा …. */
const GOVERNING_WORDS = new Set(['वाला', 'वाली', 'वाले', 'वालों', 'जैसा', 'जैसी', 'जैसे', 'सा', 'सी', 'से'].map((x) => x.normalize('NFC')));
/** Verbs that take an infinitive: after one of them a word that is also a noun is read as the infinitive. */
const TAKES_INFINITIVE = new Set(['चाहना', 'चाहिए', 'पड़ना', 'लगना', 'देना', 'सकना']);

export function disambiguateHindi(i: number, tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[] {
  const cands = base[i];
  if (!cands || cands.length === 0 || !tokens[i]?.isWord) return cands;
  // one reading whose features are lists (Number Plur,Sing; Case Dir,Obl) can only be annotated, never split
  const mergedNP = cands.length === 1 && (isNominal(cands[0]) || cands[0].pos === 'ADJ') && has(cands[0], 'Number', 'Plur') && has(cands[0], 'Number', 'Sing') && has(cands[0], 'Case', 'Dir') && has(cands[0], 'Case', 'Obl');
  if (cands.length < 2 && !mergedNP) return cands;
  const w = tokens[i].normalized;
  if (w === 'कल') return cands; // one word; yesterday or tomorrow is for the sentence to say

  const word = (j: number): number | undefined => (j >= 0 && j < tokens.length && tokens[j].isWord ? j : undefined);
  const prev = word(i - 1);
  const next = word(i + 1);
  const form = (j: number | undefined): string | undefined => (j === undefined ? undefined : tokens[j].normalized);
  const top = (j: number | undefined): C | undefined => (j === undefined ? undefined : base[j]?.[0]);
  const any = (j: number | undefined, pred: (c: C) => boolean): boolean => j !== undefined && (base[j] ?? []).some(pred);
  const commaBefore = i > 0 && !tokens[i - 1].isWord && /^[,;:]$/u.test(tokens[i - 1].surface);
  const atClauseStart = prev === undefined && (i === 0 || !tokens.slice(0, i).some((t) => t.isWord) || commaBefore || (i > 0 && !tokens[i - 1].isWord));
  const atClauseEnd = next === undefined;
  const isPost = (j: number | undefined): boolean => j !== undefined && (any(j, (c) => c.pos === 'ADP') || (base[j]?.length === 0 && POSTPOSITIONS.has(tokens[j].normalized)));

  /** Readings that satisfy `pred` first; the rest after them, marked down. The same array when nothing changes. */
  const choose = (pred: (c: C) => boolean, why: string): C[] | undefined => {
    const yes = cands.filter(pred);
    if (yes.length === 0) return undefined;
    const no = cands.filter((c) => !pred(c));
    if (no.length === 0) return undefined;
    const first: C = { ...yes[0], notes: { ...(yes[0].notes ?? {}), context: why } };
    const out = [first, ...yes.slice(1), ...no.map((c) => (c.confidence > 0.4 ? { ...c, confidence: 0.4 } : c))];
    const unchanged = cands[0] === yes[0] && no.every((c) => c.confidence <= 0.4);
    return unchanged ? undefined : out;
  };

  // ── particles ──
  if (PARTICLES.has(w) && cands.some((c) => c.pos === 'PART')) {
    const r = choose((c) => c.pos === 'PART', `${w} is a particle wherever it stands`);
    if (r) return r;
    return cands;
  }

  // ── रहा: "stayed", or the progressive auxiliary ──
  if (cands.some((c) => c.lemma === 'रहना' && has(c, 'Aspect', 'Prog')) && cands.some((c) => c.lemma === 'रहना' && !has(c, 'Aspect', 'Prog') && isVerbal(c))) {
    // the word directly before (a particle ही / भी / तो / नहीं / न aside) has a bare-stem reading: खा रहा है
    let p = prev;
    if (p !== undefined && ['ही', 'भी', 'तो', 'नहीं', 'न'].includes(form(p) as string)) p = word((p as number) - 1);
    const progressive = (c: C) => c.lemma === 'रहना' && has(c, 'Aspect', 'Prog');
    if (p !== undefined && any(p, (c) => has(c, 'VerbForm', 'Stem'))) return choose(progressive, `after the bare stem "${form(p)}": the progressive (रहा = is …-ing)`) ?? cands;
    return choose((c) => !progressive(c), 'no bare verb stem before it: "stayed, kept on"') ?? cands;
  }

  // ── की: of, or did ──
  if (w === 'की' && cands.some((c) => c.lemma === 'का') && cands.some((c) => c.lemma === 'करना')) {
    const gen = (c: C) => c.lemma === 'का';
    const did = (c: C) => c.lemma === 'करना';
    if (next !== undefined && COMPOUND_HEADS.has(form(next) as string)) return choose(gen, 'a compound postposition follows (की ओर, की तरह): of') ?? cands;
    // ने, or a doer in the ergative, earlier in the clause: the perfective of करना takes it
    let erg = false;
    for (let k = i - 1; k >= 0 && tokens[k].isWord; k--) if (form(k) === 'ने' || any(k, (c) => has(c, 'Case', 'Erg'))) { erg = true; break; }
    const nextNominal = next !== undefined && (any(next, (c) => isNominal(c) || c.pos === 'ADJ' || c.pos === 'NUM') && !any(next, (c) => c.pos === 'AUX'));
    const nextGoes = next !== undefined && any(next, (c) => c.lemma === 'जाना');
    const nextBe = next !== undefined && any(next, (c) => c.lemma === 'होना');
    const prevNominal = prev !== undefined && any(prev, (c) => isNominal(c) || c.pos === 'PRON');
    if (nextNominal && !(erg && !prevNominal)) return choose(gen, 'between a noun and another noun: of') ?? cands;
    if (nextGoes) return choose(did, 'followed by जाना (की गई, की जाती है): the passive of करना') ?? cands;
    if (erg) return choose(did, 'after ने and its doer, the verb comes last: did') ?? cands;
    if ((atClauseEnd || nextBe) && !prevNominal) return choose(did, 'ends the clause and no noun stands before it: did') ?? cands;
    if ((atClauseEnd || nextBe) && prevNominal) return choose(gen, 'a noun before it and no ने in the clause: of') ?? cands;
    return cands;
  }

  // ── के before a compound postposition; के after a bare stem ──
  if ((w === 'के' || w === 'की' || w === 'का') && cands.some((c) => c.lemma === 'का') && next !== undefined && COMPOUND_HEADS.has(form(next) as string)) {
    return choose((c) => c.lemma === 'का', 'a compound postposition follows (के लिए, के साथ, के बाद): the genitive') ?? cands;
  }
  if (w === 'के' && cands.some((c) => has(c, 'VerbForm', 'Conv')) && cands.some((c) => c.lemma === 'का') && prev !== undefined && any(prev, (c) => has(c, 'VerbForm', 'Stem'))) {
    return choose((c) => has(c, 'VerbForm', 'Conv'), 'after a bare verb stem: के as "having done"') ?? cands;
  }

  // ── पर: on, or but ──
  if (w === 'पर' && cands.some((c) => c.pos === 'ADP') && cands.some((c) => c.pos === 'CONJ' || c.pos === 'SCONJ')) {
    const conj = (c: C) => c.pos === 'CONJ' || c.pos === 'SCONJ';
    if (atClauseStart || commaBefore) return choose(conj, 'starts a clause or follows a comma: "but"') ?? cands;
    const prevFinite = prev !== undefined && any(prev, (c) => isVerbal(c) && (has(c, 'VerbForm', 'Fin') || has(c, 'Aspect', 'Perf') || has(c, 'Aspect', 'Imp') || c.morph.Tense !== undefined)) && !any(prev, (c) => c.pos === 'NOUN');
    const nextSubject = next !== undefined && any(next, (c) => c.pos === 'PRON' && !has(c, 'Case', 'Obl') && !has(c, 'Case', 'Dat'));
    if (prevFinite && nextSubject) return choose(conj, 'after a finished verb, before a new subject: "but"') ?? cands;
    if (prev !== undefined && any(prev, (c) => isNominal(c) || c.pos === 'PRON')) return choose((c) => c.pos === 'ADP', 'after a noun or pronoun: the postposition "on"') ?? cands;
    return cands;
  }

  // ── और: "and", or "more" (no second conjunct of the same kind) ──
  if (w === 'और' && cands.some((c) => c.pos === 'CONJ') && cands.some((c) => c.pos === 'ADV' || c.pos === 'ADJ' || c.pos === 'DET')) {
    const and = (c: C) => c.pos === 'CONJ';
    const moreReading = (c: C) => c.pos !== 'CONJ';
    const group = (c: C | undefined): string => (c === undefined ? '' : isNominal(c) || c.pos === 'PRON' ? 'nominal' : c.pos === 'ADJ' || c.pos === 'NUM' ? 'modifier' : isVerbal(c) ? 'verb' : c.pos ?? '');
    const pk = top(prev);
    const nk = top(next);
    const prevMarks = prev !== undefined && (any(prev, (c) => has(c, 'Case', 'Dat')) || isPost(prev));
    if (prevMarks && next !== undefined && any(next, (c) => isNominal(c) || c.pos === 'ADJ' || c.pos === 'NUM')) return choose(moreReading, 'after a word with को / से and before a noun: "more"') ?? cands;
    if (prev !== undefined && pk && isVerbal(pk) && (has(pk, 'VerbForm', 'Fin') || pk.pos === 'AUX' || has(pk, 'Aspect', 'Perf')) && nk?.pos === 'PRON') return choose(and, 'a new clause with its own subject follows: "and"') ?? cands;
    if (prev !== undefined && next !== undefined && pk && nk) {
      if (group(pk) === group(nk) && group(pk) !== '') return choose(and, 'joins two words of the same kind: "and"') ?? cands;
      if (['ADJ', 'NUM'].includes(nk.pos ?? '') || (isNominal(nk) && group(pk) !== 'nominal')) return choose(moreReading, 'no left word of the same kind to join: "more, another"') ?? cands;
    }
    if (atClauseStart) return choose(and, 'starts a sentence: "and"') ?? cands;
    return cands;
  }

  // ── आप: "you", or "self" after अपने ──
  if (w === 'आप' && cands.some((c) => feat(c, 'Person').includes('2')) && cands.some((c) => !feat(c, 'Person').includes('2'))) {
    const self = (c: C) => !feat(c, 'Person').includes('2');
    if (prev !== undefined && ['अपने', 'अपनी', 'अपना', 'ख़ुद'].includes(form(prev) as string)) return choose(self, 'after अपने: "self" (अपने आप)') ?? cands;
    return choose((c) => feat(c, 'Person').includes('2'), 'not after अपने: "you"') ?? cands;
  }

  // ── an adjective that is also a noun with a different meaning (आम: common / mango) ──
  if (cands.some((c) => c.pos === 'NOUN') && cands.some((c) => c.pos === 'ADJ') && cands.some((a) => a.pos === 'ADJ' && cands.some((n) => n.pos === 'NOUN' && n.gloss !== undefined && a.gloss !== undefined && n.gloss !== a.gloss))) {
    const nextNoun = next !== undefined && (top(next)?.pos === 'NOUN' || top(next)?.pos === 'PROPN') && !isPost(next);
    if (nextNoun) return choose((c) => c.pos === 'ADJ', 'directly before a noun it can modify: the adjective') ?? cands;
    if (prev !== undefined && any(prev, (c) => c.pos === 'ADV')) return choose((c) => c.pos === 'ADJ', 'after an adverb of degree: the adjective') ?? cands;
    const copulaAfter = next !== undefined && any(next, (c) => c.lemma === 'होना');
    if (copulaAfter && prev !== undefined && any(prev, (c) => isNominal(c) || c.pos === 'PRON')) return cands; // "ये आम हैं": common, or mangoes
    return choose((c) => c.pos === 'NOUN', 'not before a noun: the noun') ?? cands;
  }

  // ── a bare stem (before a second verb, रहा or कर), or the familiar command ──
  const stem = (c: C) => has(c, 'VerbForm', 'Stem');
  const command = (c: C) => isVerbal(c) && has(c, 'Mood', 'Imp') && !has(c, 'VerbForm', 'Stem');
  if (cands.some(stem) && cands.length > 1) {
    let n2 = next;
    if (n2 !== undefined && ['ही', 'भी', 'तो', 'नहीं', 'न'].includes(form(n2) as string)) n2 = word((n2 as number) + 1);
    const joins = n2 !== undefined && (any(n2, (c) => c.lemma !== undefined && (c.lemma in HINDI_VECTOR_VERBS || c.lemma === 'सकना' || (c.lemma === 'रहना' && has(c, 'Aspect', 'Prog')))) || ['कर', 'के'].includes(form(n2) as string));
    // the participle of one verb that is the stem of its causative (चला, बना, सुना) before जाना: "went away", "was made" - the participle (चला गया)
    if (n2 !== undefined && any(n2, (c) => c.lemma === 'जाना') && cands.some((c) => isVerbal(c) && has(c, 'Aspect', 'Perf') && !stem(c))) return choose((c) => isVerbal(c) && has(c, 'Aspect', 'Perf') && !stem(c), 'before जाना: the participle (चला गया), not the stem of a causative') ?? cands;
    if (joins) return choose(stem, 'a second verb, रहा or कर follows: the bare stem') ?? cands;
    // a noun homograph (कर "tax") after a determiner, a genitive or an adjective
    const prevT = top(prev);
    if (prev !== undefined && cands.some((c) => c.pos === 'NOUN') && (any(prev, (c) => c.pos === 'DET' || c.morph.Poss === 'Yes' || c.lemma === 'का') || prevT?.pos === 'ADJ' || prevT?.pos === 'NUM' || (next !== undefined && isPost(next)))) return choose((c) => c.pos === 'NOUN', 'after a determiner, genitive or adjective, or before a postposition: the noun') ?? cands;
    if (atClauseEnd) {
      if (cands.some(command)) return choose(command, 'ends the clause with nothing after it: the familiar command') ?? cands;
      // the bare stem ending a clause is the command to तू; with another verb reading to choose (मिला: मिलना, not the stem of मिलाना) it needs तू before it
      const toTu = tokens.slice(0, i).some((t, k) => t.isWord && (base[k] ?? []).some((c) => c.pos === 'PRON' && has(c, 'Polite', 'Infm')));
      if (!cands.some((c) => !stem(c) && isVerbal(c)) || toTu) return choose(stem, 'ends the clause: the bare stem is the command to तू') ?? cands;
    }
    if (cands.some(stem) && cands.some((c) => !stem(c))) return choose((c) => !stem(c), 'no second verb, रहा or कर follows: not the bare stem') ?? cands;
  }

  // ── a vocative-only noun reading against a finite verb (करो) ──
  {
    const nouns = cands.filter((c) => isNominal(c));
    const vocativeOnly = nouns.length > 0 && nouns.every((c) => has(c, 'Case', 'Voc') && !has(c, 'Case', 'Dir'));
    const addressed = (next === undefined && i > 0 && /^[!]$/u.test(tokens[i + 1]?.surface ?? '')) || (i + 1 < tokens.length && /^[,!]$/u.test(tokens[i + 1].surface)) || (i > 0 && /^(हे|ऐ|अरे|ओ)$/u.test(tokens[i - 1].normalized));
    if (vocativeOnly && !addressed && cands.some((c) => isVerbal(c) && has(c, 'VerbForm', 'Fin'))) return choose((c) => isVerbal(c), 'a vocative noun needs a call (हे …, a comma): this is the verb') ?? cands;
  }

  // ── a noun that is also a verb form (खाना, सोना, a participle that is also an adjective) ──
  const nominalReading = (c: C) => c.pos === 'NOUN' || c.pos === 'ADJ' || c.pos === 'PROPN';
  const verbalReading = (c: C) => isVerbal(c);
  if (cands.some(nominalReading) && cands.some((c) => verbalReading(c) && c.confidence > 0.4)) {
    if (w.endsWith('के') && w !== 'करके' && cands.some((c) => has(c, 'VerbForm', 'Conv') && !has(c, 'VerbForm', 'Stem')) && cands.some((c) => c.pos === 'NOUN')) {
      const r = choose(nominalReading, 'a noun in -े, not the conjunctive in -के (which is written -कर)');
      return r ? disambiguateHindi(i, tokens, base.map((b, k) => (k === i ? r : b))) : cands;
    }
    const participle = cands.some((c) => isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Aspect', 'Perf'));
    const nextGoes = next !== undefined && any(next, (c) => c.lemma === 'जाना');
    const prevPron = prev !== undefined && any(prev, (c) => c.pos === 'PRON' && feat(c, 'Person').length > 0 && !has(c, 'Case', 'Obl') && !has(c, 'Case', 'Dat') && !has(c, 'Case', 'Erg') && !has(c, 'Case', 'Gen'));
    const finiteFor = (c: C) => isVerbal(c) && has(c, 'VerbForm', 'Fin') && prev !== undefined && (base[prev] ?? []).some((p) => p.pos === 'PRON' && (feat(c, 'Person').length === 0 || feat(c, 'Person').some((x) => feat(p, 'Person').includes(x))));
    if (prevPron && cands.some(finiteFor)) return choose(finiteFor, `after its subject pronoun "${form(prev)}": a finite verb`) ?? cands;
    if (participle && nextGoes) return choose((c) => isVerbal(c) && has(c, 'Aspect', 'Perf'), 'followed by जाना (…ी गई): the participle of the passive') ?? cands;
    const prevT = top(prev);
    if (next !== undefined && !['चाहिए', 'चाहिये'].includes(form(next) as string) && any(next, (c) => c.lemma === 'चाहना' || c.lemma === 'पड़ना' || c.lemma === 'लगना')) {
      return choose(verbalReading, `before "${form(next)}": the infinitive`) ?? cands;
    }
    const prevDetermines = prev !== undefined && (any(prev, (c) => c.pos === 'DET' || c.morph.Poss === 'Yes' || c.lemma === 'का') || ['एक', 'हर', 'कोई', 'कुछ', 'सब'].includes(form(prev) as string) || prevT?.pos === 'ADJ' || prevT?.pos === 'NUM');
    const prevDemonstrative = prev !== undefined && ['यह', 'वह', 'इस', 'उस', 'ये', 'वे'].includes(form(prev) as string) && !prevDetermines;
    // a feminine noun that is also a perfective participle (बोली): the participle when no other finite verb stands in the sentence and no determiner stands before it
    if (participle && !prevDetermines && !(next !== undefined && isPost(next))) {
      const otherFinite = base.some((r, k) => k !== i && tokens[k].isWord && !!r[0] && isVerbal(r[0]) && (r[0].pos === 'AUX' || has(r[0], 'VerbForm', 'Fin') || has(r[0], 'Aspect', 'Perf') || has(r[0], 'Aspect', 'Imp')));
      if (!otherFinite) return choose((c) => isVerbal(c) && has(c, 'Aspect', 'Perf'), 'no other verb in the sentence: the participle') ?? cands;
    }
    if (prevDemonstrative) return choose(nominalReading, `after "${form(prev)}": a noun or adjective`) ?? cands;
    if (prevDetermines) return choose(nominalReading, `after "${form(prev)}": a noun or adjective`) ?? cands;
    const nextT = top(next);
    if (next !== undefined && isPost(next)) return choose(nominalReading, `before the postposition "${form(next)}": a noun`) ?? cands;
    if (participle && next !== undefined && any(next, isNominal) && !isPost(next)) return choose((c) => c.pos === 'ADJ' || c.pos === 'NOUN', 'before a noun: used as an adjective') ?? cands;
    if (nextT && next !== undefined && isVerbal(nextT) && !has(nextT, 'VerbForm', 'Inf') && !TAKES_INFINITIVE.has(nextT.lemma ?? '') && nextT.lemma !== 'होना' ) {
      return choose(nominalReading, `a conjugated verb follows ("${form(next)}"): this is its noun`) ?? cands;
    }
    // a dative (मुझे / X को) earlier and a form of होना after: the infinitive of "must" (मुझे जाना है)
    const dativeBefore = tokens.slice(0, i).some((t, k) => t.isWord && (t.normalized === 'को' || (base[k] ?? []).some((c) => has(c, 'Case', 'Dat'))));
    if (dativeBefore && next !== undefined && any(next, (c) => c.lemma === 'होना' && c.pos === 'AUX')) return choose((c) => isVerbal(c) && has(c, 'VerbForm', 'Inf'), 'a person with को before it and "to be" after: the infinitive of "must"') ?? cands;
    if (prevT && isNominal(prevT) && !has(prevT, 'Case', 'Obl') && (atClauseEnd || (next !== undefined && any(next, (c) => c.lemma === 'होना'))) && !isPost(prev)) {
      return choose((c) => isVerbal(c) && has(c, 'VerbForm', 'Inf'), 'after its object, ending the clause: the infinitive') ?? cands;
    }
    return cands;
  }

  // ── case and number by government (लड़के: oblique singular only when a postposition governs the phrase, else the direct plural) ──
  const casey = (c: C) => (isNominal(c) || c.pos === 'ADJ' || c.pos === 'DET') && feat(c, 'Case').length > 0;
  const dirOnly = (c: C) => casey(c) && has(c, 'Case', 'Dir') && !has(c, 'Case', 'Obl');
  const oblOnly = (c: C) => casey(c) && has(c, 'Case', 'Obl') && !has(c, 'Case', 'Dir');
  /** A merged reading of an adjective (Number Plur,Sing; Case Obl): its plural part is direct, its singular part oblique. It fits either decision. */
  const mixed = (c: C) => casey(c) && has(c, 'Number', 'Plur') && has(c, 'Number', 'Sing');
  if ((cands.some(dirOnly) && cands.some(oblOnly)) || mergedNP) {
    // the head noun of the phrase this word belongs to: itself, or the first noun after its modifiers
    const topPos = (j: number | undefined): string | undefined => (j === undefined ? undefined : base[j]?.[0]?.pos);
    const isHeadPos = (p: string | undefined): boolean => p === 'NOUN' || p === 'PROPN';
    let head = i;
    if (!isHeadPos(topPos(i))) {
      let j = i + 1;
      for (let step = 0; step < 4 && word(j) !== undefined && ['ADJ', 'DET', 'NUM'].includes(topPos(j) ?? ''); step++) j++;
      head = word(j) !== undefined && isHeadPos(topPos(j)) ? j : Math.max(i, j - 1);
    }
    let after = word(head + 1);
    if (after !== undefined && ['ही', 'भी', 'तो'].includes(form(after) as string)) after = word(after + 1);
    const governs = after !== undefined && (isPost(after) || GOVERNING_WORDS.has(form(after) as string));
    const obliqueDeterminer = prev !== undefined && OBLIQUE_DETERMINERS.has(form(prev) as string);
    const governed = governs || obliqueDeterminer;
    const why = governs ? `the postposition "${form(after)}" governs the phrase: oblique` : obliqueDeterminer ? `after "${form(prev)}": oblique` : 'no postposition governs the phrase: the direct case';
    const pluralContext = (): boolean | undefined => {
      if (prev !== undefined && (NUMBERS_PLURAL_DETERMINERS.has(form(prev) as string) || (top(prev)?.pos === 'NUM' && form(prev) !== 'एक'))) return true;
      for (let k = head + 1, n = 0; k < tokens.length && tokens[k].isWord && n < 4; k++, n++) {
        if (isPost(k)) return undefined;
        const v = base[k]?.find((x) => isVerbal(x) && feat(x, 'Number').length > 0);
        if (v) return has(v, 'Number', 'Plur') && !has(v, 'Number', 'Sing') ? true : undefined;
      }
      return undefined;
    };
    if (mergedNP) {
      const note = governed ? 'the postposition governs the phrase: oblique singular' : pluralContext() ? 'a plural determiner or verb: the direct plural' : undefined;
      if (!note) return cands;
      return cands[0].notes?.context === note ? cands : [{ ...cands[0], notes: { ...(cands[0].notes ?? {}), context: note } }];
    }
    // the head's own readings in the chosen case say which number the phrase has
    const headReadings = (base[head] ?? []).filter((c) => (governed ? oblOnly(c) : dirOnly(c)) && (isNominal(c) || c.pos === 'ADJ'));
    let numbers = [...new Set(headReadings.flatMap((c) => feat(c, 'Number')))];
    if (!governed && numbers.length > 1 && pluralContext()) numbers = ['Plur'];
    const numberOk = (c: C): boolean => numbers.length !== 1 || feat(c, 'Number').length === 0 || has(c, 'Number', numbers[0]);
    const pred = (c: C): boolean => !casey(c) || mixed(c) || ((governed ? oblOnly(c) : dirOnly(c)) && numberOk(c));
    if (!cands.some((c) => casey(c) && pred(c))) return cands;
    return choose(pred, why) ?? cands;
  }
  return cands;
}
