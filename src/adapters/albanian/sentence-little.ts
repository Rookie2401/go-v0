/**
 * The little words of Albanian and what the sentence makes of them (rule 1 and the particles of rule 2): e, i, të, së,
 * më, u, ju, do, po, pa. Each of them has several readings read alone; here the neighbours decide, or the readings are
 * left as they were.
 *
 *   linking article + articulated adjective, ordinal or possessive  → one lexical unit written as two words ("i mirë")
 *   linking article between a noun and a noun in the genitive        → the article of a genitive, its own word
 *   before a conjugated verb (short pronouns may stand between)      → the object pronoun; të → the subjunctive particle
 *
 * Machine-drafted rules, not checked by a native speaker. Where the words around do not decide, nothing is changed.
 */
import { sqAgree } from './types';
import { SQ_LEXEMES } from './morphology';
import {
  decided, hasVal, isArticle, isArticulated, isClitic, isFin, isNominal, isNounish, isParticiple, isParticle,
  isTeParticle, lowered, narrowed, nextWord, norm, pick, prevWord, vals, withContext,
  type C, type Ctx,
} from './sentence-core';
import { nameDecided } from './sentence-names';
import { adjLike, agreeWith, genitiveAhead, headOf, phraseHead, verbAhead, verbLike } from './sentence-look';
import type { SqLexeme } from './types';

/** Subject pronouns with the person and number a verb must have to go with them. */
export const SUBJECTS: Record<string, { person: string; number: string }> = {
  unë: { person: '1', number: 'Sing' }, ti: { person: '2', number: 'Sing' }, ai: { person: '3', number: 'Sing' },
  ajo: { person: '3', number: 'Sing' }, ne: { person: '1', number: 'Plur' }, ju: { person: '2', number: 'Plur' },
  ata: { person: '3', number: 'Plur' }, ato: { person: '3', number: 'Plur' },
};

const ARTICLE_FORMS = new Set(['e', 'i', 'të', 'së']);
/** Words after which a subjunctive clause may begin without being a pronoun's neighbour. */
const subCapable = (cx: Ctx, k: number): boolean => cx.base[k].some((c) => isFin(c) && hasVal(c.morph.Mood, 'Sub'));
/** The word list's entry for a verb, for the one fact the sentence needs: has it non-active forms? */
let verbLexemes: Map<string, SqLexeme> | undefined;
const lexemeOf = (lemma: string): SqLexeme | undefined => (verbLexemes ??= new Map(SQ_LEXEMES.filter((l) => l.pos === 'VERB').map((l) => [l.lemma, l]))).get(lemma);

// ───────────────────────────── article + adjective: one unit ─────────────────────────────

/** Rule 1, first half: every linking article directly before an articulated adjective, ordinal or possessive. */
export function formUnits(cx: Ctx): void {
  for (let a = 0; a < cx.tokens.length; a++) {
    const j = nextWord(cx, a);
    if (!cx.tokens[a].isWord || j === undefined || !ARTICLE_FORMS.has(norm(cx, a)) || cx.inUnit.has(a)) continue;
    // a name written with a capital letter is not an adjective (Drita e Mira)
    if (!adjLike(cx, j) || !cx.cur[a].some(isArticle) || nameDecided(cx, j)) continue;
    if (verbLike(cx, j) && !nounBefore(cx, a)) continue;
    formUnit(cx, a, j);
  }
}

/**
 * A word that is both an articulated adjective and a conjugated verb ("re": fem. of i ri, or "you fell") forms the unit
 * only when the article stands right after a noun it agrees with and that is nothing but a noun: "një xhaketë të re" (a
 * new jacket). Elsewhere ("punon e lexon", a short pronoun before a verb) the word is left to the other rules.
 */
function nounBefore(cx: Ctx, a: number): boolean {
  const p = prevWord(cx, a);
  if (p === undefined || cx.cur[p].length === 0 || !cx.cur[p].every(isNominal)) return false;
  const head = headOf(cx, a, norm(cx, a));
  return head !== undefined && head.idx === p && head.reading !== undefined;
}

function formUnit(cx: Ctx, a: number, j: number): void {
  const form = norm(cx, a);
  const artC = cx.cur[a].find(isArticle) as C;
  const adjs = cx.cur[j].filter(isArticulated);
  const head = headOf(cx, a, form);
  const art = narrowed(artC, agreeWith(head?.reading));
  const good = adjs.filter((c) => sqAgree(c.morph.Gender, art.morph.Gender) && sqAgree(c.morph.Number, art.morph.Number));
  const chosen = good.length > 0 ? good : adjs;
  const allow = { Gender: vals(art.morph.Gender), Number: vals(art.morph.Number) };
  const front = chosen.map((c) => withContext(narrowed(c, allow), `after the linking article "${form}": an adjective that goes with it, and the two words are one lexical unit`));
  const display = front[0].lemma ?? '';
  front[0] = { ...front[0], unit: { head: j, pieces: [a, j], role: 'head', display } };
  cx.cur[j] = [...front, ...cx.cur[j].filter((c) => !chosen.includes(c)).map(lowered)];
  // the article piece carries the unit's lemma and part of speech; its own morph (PronType Art) and role stay
  const piece: C = {
    ...withContext(art, `before "${cx.tokens[j].surface}": the linking article, one lexical unit with it ("${display}")`),
    lemma: display, pos: front[0].pos, unit: { head: j, pieces: [a, j], role: 'linking article', display },
  };
  cx.cur[a] = [piece, ...cx.cur[a].filter((c) => c !== artC).map(lowered)];
  cx.inUnit.add(a);
  cx.inUnit.add(j);
}

// ───────────────────────────── the other readings of the little words ─────────────────────────────

/** Rule 1, second half and the particles of rule 2: left to right, every little word not already inside a unit. */
export function littleWords(cx: Ctx): void {
  for (let i = 0; i < cx.tokens.length; i++) {
    if (!cx.tokens[i].isWord || cx.inUnit.has(i) || cx.cur[i].length === 0) continue;
    const w = norm(cx, i);
    if (w === 'do') future(cx, i);
    else if (w === 'po') progressive(cx, i);
    else if (w === 'pa') without(cx, i);
    else if (w === 'më') more(cx, i);
    else if (w === 'u') nonActive(cx, i);
    else if (w === 'ju') you(cx, i);
    else if (MODAL_FORMS.has(w)) modal(cx, i);
    else if (ARTICLE_FORMS.has(w) || cx.cur[i].some((c) => isTeParticle(c) && c.parts !== undefined)) articleOrPronoun(cx, i);
  }
}

/** The written forms of the two modal words (function-minor.ts MODALS). */
const MODAL_FORMS = new Set(['mund', 'duhet', 'duhen', 'duhej']);

/** mund / duhet right before të: the modal (mund të vij), not the full verb (mundem, to be able; duhem, to be needed). */
function modal(cx: Ctx, i: number): void {
  const k = nextWord(cx, i);
  if (k === undefined || norm(cx, k) !== 'të') return;
  pick(cx, i, { pred: (c) => c.lemma === 'mund' || c.lemma === 'duhem', why: `before "të": the modal "${norm(cx, i)}" (+ të + a verb)` });
}

/** Did the sentence open (or a new clause begin after a comma) just before this word? */
function clauseStart(cx: Ctx, i: number): 'start' | 'comma' | undefined {
  if (prevWord(cx, i) !== undefined) return undefined;
  return i > 0 && /^[,;]$/u.test(cx.tokens[i - 1].surface.trim()) ? 'comma' : 'start';
}

function articleOrPronoun(cx: Ctx, i: number): void {
  const cands = cx.cur[i];
  const w = norm(cx, i);
  const isTe = cands.some(isTeParticle);
  const simpleTe = isTe && !cands.some((c) => c.parts !== undefined);
  const k = nextWord(cx, i);
  const p = prevWord(cx, i);
  const pw = p === undefined ? undefined : norm(cx, p);
  const v = verbAhead(cx, i, isTe);

  const particle = (why: string) => pick(cx, i, { pred: (c) => isTeParticle(c), why });
  const clitic = (why: string) => pick(cx, i, { pred: isClitic, why });

  if (isTe) {
    if (pw === 'për' && (v || (k !== undefined && cx.base[k].some(isParticiple)))) { particle('after "për": the "to do" phrase, with the subjunctive particle'); return; }
    if (pw === 'do' && v) { particle('after "do": the future, with the subjunctive particle'); return; }
    // the modal words take të + a verb (mund të vij, duhet të punoj)
    if (pw !== undefined && MODAL_FORMS.has(pw) && v) { particle(`after the modal "${pw}": the subjunctive particle`); return; }
    // "të të shoh": the first is the particle, the second the short pronoun
    if (simpleTe && pw === 'të' && p !== undefined && decided(cx, p) && isTeParticle(cx.cur[p][0]) && v) { clitic('after the particle "të", before a verb: the short object pronoun (të të shoh)'); return; }
    if (v) {
      if (simpleTe && v.shorts > 0) { particle('before a short pronoun and a verb: the subjunctive particle (të më shohë)'); return; }
      const before = clauseStart(cx, i);
      const sub = subCapable(cx, v.idx);
      const verbBefore = p !== undefined && cx.base[p].length > 0 && cx.base[p].every(isVerbish);
      if (verbBefore && sub) { particle(`after the verb "${pw}", before a verb that has a subjunctive form: the subjunctive particle`); return; }
      const subject = pw !== undefined && (pw in SUBJECTS || pw === 'nuk' || pw === "s'");
      if (subject) { clitic(`after "${pw}", before a verb: the short object pronoun (the particle cannot follow a subject or nuk)`); return; }
      const noun = p !== undefined && cx.cur[p].some(isNominal);
      if ((noun || before) && !sub) { clitic('before a verb that has no subjunctive form: the short object pronoun'); return; }
      return;
    }
  }
  if (!isTe && v) {
    if (cands.some((c) => c.pos === 'CONJ')) {
      // "punon e lexon": a verb, "e", a verb — the verb before has no object to be the pronoun's
      const verbBefore = p !== undefined && v.shorts === 0 && cx.base[p].length > 0 && cx.base[p].every(isVerbish) && cx.cur[p].every(isFin);
      if (verbBefore) { pick(cx, i, { pred: (c) => c.pos === 'CONJ', why: 'between two verbs: "and"' }); return; }
      if (clauseStart(cx, i) === 'comma') return; // ", e lexon": "and reads" or "it reads" — the words do not say
    }
    clitic(`before a conjugated verb${v.shorts > 0 ? ' (another short pronoun between)' : ''}: the short object pronoun`);
    return;
  }
  // no verb to follow: a genitive, or "and"
  if (!isTe && cands.some(isArticle) && genitiveArticle(cx, i, w)) return;
  if (isTe && !simpleTe) return;
  if (isTe && cands.some(isArticle)) { genitiveArticle(cx, i, w); return; }
  if (w === 'e' && k !== undefined && !verbLike(cx, k)) {
    if (clauseStart(cx, i) !== undefined) { pick(cx, i, { pred: (c) => c.pos === 'CONJ', why: 'opens a clause: "and"' }); return; }
    if (p === undefined) return;
    const hi = phraseHead(cx, k)?.idx ?? k;
    const left = cx.cur[p][0];
    const right = cx.cur[hi][0];
    const kinds = (a: C, b: C) => (isNominal(a) && isNominal(b)) || (a.pos === b.pos && ['ADV', 'NUM', 'PRON'].includes(a.pos ?? ''));
    const noGenitive = !cx.base[hi].some((c) => hasVal(c.morph.Case, 'Gen'));
    if (left && right && kinds(left, right) && noGenitive) {
      pick(cx, i, { pred: (c) => c.pos === 'CONJ', why: 'between two words of the same kind, no verb or adjective after it: "and"' });
    }
  }
}

/** A conjugated verb or a participle: the word before "e"/"të" is a verb if every reading is. */
const isVerbish = (c: C): boolean => isFin(c) || isParticiple(c);

/** A linking article between a noun and a noun that can only be in the genitive. */
function genitiveArticle(cx: Ctx, a: number, form: string): boolean {
  const k = nextWord(cx, a);
  const g = k === undefined ? undefined : genitiveAhead(cx, k);
  if (!g || !g.certain) return false;
  const head = headOf(cx, a, form);
  if (!head) return false;
  pick(cx, a, {
    pred: isArticle, role: 'genitive linking article', allow: agreeWith(head.reading),
    why: `between a noun and a noun in the genitive: the linking article of a genitive (it stays its own word)`,
  });
  pick(cx, g.idx, {
    pred: (c) => isNounish(c) && hasVal(c.morph.Case, 'Gen'), allow: { Case: ['Gen'] },
    why: `after the linking article "${form}": the genitive`,
  });
  return true;
}

// ───────────────────────────── do, po, pa, më, u, ju ─────────────────────────────

/** do: before të (or ta, t'i …) the future particle; otherwise the verb dua. */
function future(cx: Ctx, i: number): void {
  const k = nextWord(cx, i);
  if (k !== undefined && cx.base[k].some(isTeParticle)) {
    pick(cx, i, { pred: (c) => isParticle(c, 'do'), why: 'before "të": the future particle' });
  } else {
    pick(cx, i, { pred: (c) => c.lemma === 'dua' && c.pos === 'VERB', why: 'not before "të": the verb "dua" (to want, to love)' });
  }
}

/** po: before a conjugated verb the progressive particle; alone, before a comma or a full stop, "yes". */
function progressive(cx: Ctx, i: number): void {
  if (verbAhead(cx, i)) {
    pick(cx, i, { pred: (c) => isParticle(c, 'po'), why: 'before a conjugated verb: the progressive particle' });
    return;
  }
  const after = cx.tokens[i + 1];
  if (after === undefined || (!after.isWord && /^[,.!?;…]/u.test(after.surface.trim()))) {
    pick(cx, i, { pred: (c) => c.pos === 'INTJ', why: 'alone, before a pause: "yes"' });
  }
}

/** pa: before a participle "without" (particle); before a noun phrase the preposition; after a subject, alone, the verb shoh. */
function without(cx: Ctx, i: number): void {
  const k = nextWord(cx, i);
  const p = prevWord(cx, i);
  if (k !== undefined && cx.base[k].some(isParticiple) && !cx.base[k].some(isNominal)) {
    pick(cx, i, { pred: (c) => c.pos === 'PART', why: 'before a participle: "without doing"' });
    return;
  }
  const demanding = p !== undefined && (cliticOrNegation(cx, p));
  const subject = p !== undefined && (norm(cx, p) in SUBJECTS || cx.cur[p].some(isNominal));
  const otherVerb = cx.tokens.some((_, j) => j !== i && cx.tokens[j].isWord && !cx.inUnit.has(j) && cx.base[j].length > 0 && cx.base[j].every(isFin));
  if (demanding || (subject && !otherVerb)) {
    pick(cx, i, { pred: (c) => c.lemma === 'shoh', why: demanding ? `after "${norm(cx, p as number)}": a verb (aorist of "shoh")` : 'after its subject, no other verb in the sentence: a verb (aorist of "shoh")' });
    return;
  }
  if (k !== undefined && phraseHead(cx, k)) pick(cx, i, { pred: (c) => c.pos === 'ADP', why: 'before a noun phrase: the preposition "without"' });
}

const cliticOrNegation = (cx: Ctx, p: number): boolean => cx.cur[p].length > 0 && (['nuk', "s'"].includes(norm(cx, p)) || (isClitic(cx.cur[p][0]) && (cx.cur[p].length === 1 || decided(cx, p))));

/** më: before a verb the pronoun; before an adjective, an adverb or an article unit "more"; before a date "on". */
function more(cx: Ctx, i: number): void {
  const k = nextWord(cx, i);
  if (k !== undefined && cx.inUnit.has(k) && cx.cur[k][0].unit?.pieces[0] === k) {
    pick(cx, i, { pred: (c) => c.pos === 'ADV', why: 'before an adjective with its linking article (më i mirë): "more"' });
    return;
  }
  if (verbAhead(cx, i)) { pick(cx, i, { pred: isClitic, why: 'before a conjugated verb: the short object pronoun' }); return; }
  const after = cx.tokens[i + 1];
  if (after !== undefined && !after.isWord && /^\d/u.test(after.surface)) { pick(cx, i, { pred: (c) => c.pos === 'ADP', why: 'before a number: "on" (a date)' }); return; }
  if (k !== undefined && cx.base[k].some((c) => c.pos === 'ADJ' || c.pos === 'ADV') && !verbLike(cx, k)) {
    pick(cx, i, { pred: (c) => c.pos === 'ADV', why: 'before an adjective or adverb: "more"' });
  }
}

/** u: the non-active particle before an aorist of a verb that has non-active forms; otherwise the pronoun "to them". */
function nonActive(cx: Ctx, i: number): void {
  const v = verbAhead(cx, i);
  if (!v || v.shorts > 0) return;
  const forms = cx.base[v.idx].filter(isFin);
  const lexemes = forms.map((c) => (c.unconfirmed ? undefined : lexemeOf(c.lemma ?? '')));
  if (forms.length === 0 || lexemes.some((l) => l === undefined)) return;
  const aorist = forms.some((c) => c.morph.Tense === 'Past');
  const na = lexemes.some((l) => l?.nonActive === 'only') ? 'only' : lexemes.some((l) => l?.nonActive) ? 'yes' : 'no';
  const asParticle = (why: string, usual = false) => pick(cx, i, { pred: (c) => isParticle(c, 'u'), why, usual });
  const asPronoun = (why: string, usual = false) => pick(cx, i, { pred: isClitic, why, usual });
  if (na === 'only' && aorist) asParticle('before an aorist of a verb that exists only in the non-active: the non-active particle');
  else if (na === 'no') asPronoun('this verb has no non-active forms: "u" is the short pronoun "to them"');
  else if (!aorist) asPronoun('not before an aorist: "u" is the short pronoun "to them" (the non-active present has its own endings)');
  else {
    const after = nextWord(cx, v.idx);
    const object = after !== undefined && cx.base[after].some((c) => isNominal(c) && hasVal(c.morph.Case, 'Acc') && hasVal(c.morph.Definite, 'Def'));
    if (object) asPronoun('before an aorist with an object after it: more likely the pronoun "to them" than the non-active particle', true);
    else asParticle('before an aorist with no object after it: more likely the non-active particle', true);
  }
}

/** ju: the subject "you" before a verb in the second person plural; otherwise the short object pronoun. */
function you(cx: Ctx, i: number): void {
  const v = verbAhead(cx, i);
  if (!v) return;
  const agrees = v.shorts === 0 && cx.base[v.idx].some((c) => isFin(c) && hasVal(c.morph.Person, '2') && hasVal(c.morph.Number, 'Plur'));
  if (agrees) {
    pick(cx, i, { pred: (c) => c.pos === 'PRON' && !isClitic(c), allow: { Case: ['Nom'] }, why: 'before a verb in the second person plural: the subject "you"' });
  } else {
    pick(cx, i, { pred: isClitic, why: 'before a verb that is not second person plural: the short object pronoun' });
  }
}
