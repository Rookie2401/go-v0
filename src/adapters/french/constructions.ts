/**
 * French constructions: the grammar patterns a reader can name in a sentence (passé composé, ne … pas, the object pronouns
 * before the verb, the relative pronouns, the partitive article …). Each detector reads the FIRST reading of each token (the
 * reading french/disambiguate.ts put in front), and a few closed words by their spelling, and reports a pattern only when its
 * words are really there: `tokenIndexes` are the words that make it (the auxiliary and the participle; ne and pas; the
 * relative pronoun with its antecedent and its verb). Confidence is 0.9 where the words are unambiguous and lower where a
 * reading had to be assumed (est descendu: être or avoir; plus after a verb with no ne). A token whose only reading is a
 * rule's guess (`unconfirmed`) makes no pattern unless the pattern is made of closed-class words.
 *
 * The id of every pattern is one of docs/french/PLAN.md "CONTEXT"; its title and explanation come from
 * french/construction-texts.ts, one text per id. Machine-drafted, not checked by a native speaker.
 */
import type { AnalyzedToken, PatternCandidate, RawToken } from '../../core';
import { FRENCH_CONSTRUCTION_TEXTS } from './construction-texts';
import {
  ARTICLES, BETWEEN_ADVERBS, type C, IMPERATIVE_CLITICS, INVERTED_SUBJECTS, LE_FORMS, NEGATIVE_FRONT, NEGATIVE_WORDS, NE_FORMS,
  OBJECT_CLITICS, PREPOSITIONS, QUE_FORMS, REFLEXIVE_PERSON, SUBJECT_PRONOUNS, clauseEnd, has, hyphenAfter, hyphenBefore,
  isFinite, isInfinitive, isPastParticiple, isPause, isPresentParticiple, isVerbal, nextWord, opensClause, prevWord,
} from './context-shared';
import { DE_VERBS, frenchSubjunctiveTrigger } from './disambiguate';

/** The construction ids, in the order of docs/french/PLAN.md. */
export const FRENCH_CONSTRUCTIONS: readonly string[] = Object.keys(FRENCH_CONSTRUCTION_TEXTS);

/** Adjectives whose meaning changes with their place (un grand homme / un homme grand). Lemmas. */
const POSITION_ADJECTIVES = new Set(['grand', 'ancien', 'pauvre', 'propre', 'cher', 'seul', 'dernier', 'certain', 'brave', 'curieux', 'pur', 'simple', 'vrai', 'sale', 'unique', 'différent', 'nouveau']);
const POSSESSIVES = new Set(['mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur', 'nos', 'vos', 'leurs']);
const ANTECEDENT_PRONOUNS = new Set(['ce', "c'", 'celui', 'celle', 'ceux', 'celles', 'cela', 'ceci', 'lui', 'elle', 'eux', 'elles', 'moi', 'toi', 'nous', 'vous', 'quelqu\'un', 'chacun', 'chacune', 'rien', 'tout', 'là']);
const LEQUEL_LEMMAS = new Set(['lequel', 'auquel', 'duquel', 'auxquels', 'auxquelles', 'desquels', 'desquelles']);
/** The literary ne without pas: il ne cesse de, je n'ose, il ne peut, je ne sais. Lemmas. */
const BARE_NE_VERBS = new Set(['cesser', 'oser', 'pouvoir', 'savoir']);

class Sentence {
  constructor(readonly tokens: RawToken[], readonly analyses: AnalyzedToken[]) {}
  /** The first reading of a word token. */
  first(k: number | undefined): C | undefined {
    if (k === undefined || !this.tokens[k]?.isWord) return undefined;
    return this.analyses[k]?.candidates[0];
  }
  form(k: number | undefined): string | undefined { return k === undefined || !this.tokens[k]?.isWord ? undefined : this.tokens[k].normalized; }
  prev(k: number | undefined): number | undefined { return k === undefined ? undefined : prevWord(this.tokens, k); }
  next(k: number | undefined): number | undefined { return k === undefined ? undefined : nextWord(this.tokens, k); }
  /** A reading of the adapter's own, or of a closed class: something a pattern may rest on. */
  trusted(k: number | undefined): boolean {
    const c = this.first(k);
    return !!c && c.unconfirmed !== true;
  }
  private all: C[][] | undefined;
  readings(): C[][] { return (this.all ??= this.analyses.map((a, k) => (this.tokens[k]?.isWord ? a.candidates : []))); }
}

const hit = (key: string, idx: Array<number | undefined>, confidence: number): PatternCandidate => {
  const t = FRENCH_CONSTRUCTION_TEXTS[key];
  const tokenIndexes = [...new Set(idx.filter((x): x is number => x !== undefined))].sort((a, b) => a - b);
  return { key, title: t.label, explanation: t.explain, tokenIndexes, confidence: Math.round(Math.min(0.95, confidence) * 100) / 100 };
};

// ── compound tenses, the passive, participle agreement ──
interface Compound { aux: number; part: number }

/** The avoir or être before a participle at p, with only adverbs, an inverted subject and hyphens between. */
function auxiliaryOf(s: Sentence, p: number): number | undefined {
  let k = p - 1;
  for (let steps = 0; k >= 0 && steps < 8; steps++) {
    const t = s.tokens[k];
    if (!t.isWord) {
      if (t.normalized === '-') { k--; continue; }
      return undefined;
    }
    const f = t.normalized;
    if (BETWEEN_ADVERBS.has(f) || f === 't' || (INVERTED_SUBJECTS.has(f) && hyphenBefore(s.tokens, k) !== undefined)) { k--; continue; }
    const c = s.first(k);
    return c && isVerbal(c) && (c.lemma === 'avoir' || c.lemma === 'être') ? k : undefined;
  }
  return undefined;
}
const TENSE_OF_AUXILIARY = (aux: C): string | undefined => {
  if (!isFinite(aux)) return undefined;
  if (has(aux, 'Mood', 'Cnd')) return 'conditionnel-passe';
  if (has(aux, 'Mood', 'Sub')) return has(aux, 'Tense', 'Pres') ? 'subjonctif-passe' : undefined;
  if (!has(aux, 'Mood', 'Ind')) return undefined;
  if (has(aux, 'Tense', 'Pres')) return 'passe-compose';
  if (has(aux, 'Tense', 'Imp')) return 'plus-que-parfait';
  if (has(aux, 'Tense', 'Fut')) return 'futur-anterieur';
  if (has(aux, 'Tense', 'Past')) return 'passe-anterieur';
  return undefined;
};
/** The clitics (and ne) before token k, nearest last; and the word before them. */
function cliticChain(s: Sentence, k: number): { clitics: number[]; before: number | undefined } {
  const clitics: number[] = [];
  let j = s.prev(k);
  for (let steps = 0; j !== undefined && steps < 6; steps++, j = s.prev(j)) {
    const f = s.form(j) as string;
    if (NE_FORMS.has(f)) continue;
    if (!OBJECT_CLITICS.has(f) || s.first(j)?.pos !== 'PRON') break;
    clitics.unshift(j);
  }
  return { clitics, before: j };
}
/** The subject of the verb at k: a pronoun before its clitics, the inverted pronoun after it, or a noun before it. */
function subjectOf(s: Sentence, k: number): { index: number; gender?: string; number?: string; person: string } | undefined {
  const { clitics, before } = cliticChain(s, k);
  const bf = s.form(before);
  if (before !== undefined && bf !== undefined && SUBJECT_PRONOUNS.has(bf)) {
    const sp = SUBJECT_PRONOUNS.get(bf)!;
    return { index: before, person: sp.person, number: sp.number, gender: bf === 'elle' || bf === 'elles' ? 'Fem' : bf === 'il' || bf === 'ils' ? 'Masc' : undefined };
  }
  const first = clitics[0];
  const ff = s.form(first);
  const verb = s.first(k);
  if (first !== undefined && (ff === 'nous' || ff === 'vous') && verb && has(verb, 'Person', ff === 'nous' ? '1' : '2') && has(verb, 'Number', 'Plur')) {
    return { index: first, person: ff === 'nous' ? '1' : '2', number: 'Plur' };
  }
  let j = hyphenAfter(s.tokens, k);
  if (j !== undefined && s.form(j) === 't') j = hyphenAfter(s.tokens, j);
  const jf = s.form(j);
  if (j !== undefined && jf !== undefined && SUBJECT_PRONOUNS.has(jf)) {
    const sp = SUBJECT_PRONOUNS.get(jf)!;
    return { index: j, person: sp.person, number: sp.number, gender: jf === 'elle' || jf === 'elles' ? 'Fem' : undefined };
  }
  const n = s.first(before);
  if (before !== undefined && n && (n.pos === 'NOUN' || n.pos === 'PROPN')) return { index: before, person: '3', number: n.morph.Number?.includes(',') ? undefined : n.morph.Number, gender: n.morph.Gender?.includes(',') ? undefined : n.morph.Gender };
  return undefined;
}
/** A reflexive clitic before the verb at k that belongs to its subject (elle s'est levée, nous nous sommes lavés). */
function reflexiveOf(s: Sentence, k: number): number | undefined {
  const { clitics } = cliticChain(s, k);
  const subject = subjectOf(s, k);
  for (const c of clitics) {
    if (subject && c === subject.index) continue;
    const f = s.form(c) as string;
    const r = REFLEXIVE_PERSON.get(f);
    if (!r) continue;
    if (f === 'se' || f === "s'") return c;
    if (subject && r.person === subject.person && (r.number === undefined || subject.number === undefined || r.number === subject.number)) return c;
  }
  return undefined;
}
/** A direct object written before the auxiliary at a: a clitic (je les ai vues), the relative que (les lettres que j'ai écrites), a fronted quel + noun. */
function precedingObject(s: Sentence, a: number): number[] | undefined {
  const { clitics } = cliticChain(s, a);
  const subject = subjectOf(s, a);
  for (let x = clitics.length - 1; x >= 0; x--) {
    const c = clitics[x];
    const f = s.form(c) as string;
    if (subject && c === subject.index) continue;
    if (LE_FORMS.has(f) || ['me', 'te', "m'", "t'", 'nous', 'vous'].includes(f)) return [c];
  }
  // walk back over the subject (a pronoun, or a short noun phrase) to que, then to its antecedent
  let k = s.prev(cliticChain(s, a).clitics[0] ?? a);
  for (let steps = 0; k !== undefined && steps < 4; steps++, k = s.prev(k)) {
    const f = s.form(k) as string;
    if (QUE_FORMS.has(f)) {
      const ante = s.prev(k);
      const c = s.first(ante);
      return ante !== undefined && c && (c.pos === 'NOUN' || c.pos === 'PROPN' || c.pos === 'PRON') ? [ante, k] : undefined;
    }
    const c = s.first(k);
    if (!c || !(SUBJECT_PRONOUNS.has(f) || NE_FORMS.has(f) || ['DET', 'NOUN', 'ADJ', 'PROPN'].includes(c.pos ?? ''))) break;
  }
  // quelles lettres a-t-il écrites ?
  k = s.prev(a);
  for (let steps = 0; k !== undefined && steps < 3; steps++, k = s.prev(k)) {
    const f = s.form(k) as string;
    if (['quel', 'quelle', 'quels', 'quelles'].includes(f)) {
      const n = s.next(k);
      return s.first(n)?.pos === 'NOUN' ? [k, n as number] : undefined;
    }
  }
  return undefined;
}
const agreesVisibly = (c: C): boolean => has(c, 'Gender', 'Fem') || has(c, 'Number', 'Plur');
const plainParticiple = (c: C): boolean => has(c, 'Gender', 'Masc') && has(c, 'Number', 'Sing') && !has(c, 'Gender', 'Fem') && !has(c, 'Number', 'Plur');

function compoundTenses(s: Sentence, out: PatternCandidate[], compounds: Compound[]): void {
  for (let p = 0; p < s.tokens.length; p++) {
    const part = s.first(p);
    if (!part || !isPastParticiple(part) || !s.trusted(p)) continue;
    const a = auxiliaryOf(s, p);
    if (a === undefined) continue;
    const aux = s.first(a) as C;
    // a été vendue, avait été reçu: the passive, its auxiliary être in a compound tense of avoir
    if (isPastParticiple(aux) && aux.lemma === 'être') {
      const a0 = auxiliaryOf(s, a);
      out.push(hit('passive-voice', [a0, a, p], 0.85));
      if (agreesVisibly(part)) out.push(hit('participle-agreement-etre', [a, p], 0.8));
      continue;
    }
    const key = TENSE_OF_AUXILIARY(aux);
    if (!key) continue;
    compounds.push({ aux: a, part: p });
    if (aux.lemma === 'avoir') {
      out.push(hit(key, [a, p], Math.min(0.9, part.confidence + 0.1)));
      if (part.lemma === 'être') continue;
      if (agreesVisibly(part)) {
        const obj = precedingObject(s, a);
        if (obj) out.push(hit('participle-agreement-preceding-object', [...obj, a, p], 0.8));
      } else if (plainParticiple(part)) {
        const subject = subjectOf(s, a);
        const n = s.next(p);
        const nf = s.form(n);
        const objectFollows = n !== undefined && (['DET', 'NOUN', 'PROPN', 'NUM'].includes(s.first(n)?.pos ?? '') || (nf !== undefined && (ARTICLES.has(nf) || LE_FORMS.has(nf))));
        if (subject && (subject.gender === 'Fem' || subject.number === 'Plur') && objectFollows) out.push(hit('participle-no-agreement', [subject.index, a, p], 0.75));
      }
      continue;
    }
    // être
    const refl = reflexiveOf(s, a);
    if (refl !== undefined) {
      out.push(hit(key, [a, p], 0.85));
      out.push(hit('pronominal-verb', [refl, a, p], 0.85));
      if (agreesVisibly(part)) out.push(hit('participle-agreement-etre', [a, p], 0.7));
      else if (plainParticiple(part)) {
        const subject = subjectOf(s, a);
        if (subject && (subject.gender === 'Fem' || subject.number === 'Plur')) out.push(hit('participle-no-agreement', [refl, a, p], 0.65));
      }
      continue;
    }
    // (aller is listed with the auxiliaries in function-words.ts, whose row carries no être tag: the gap is reported to the
    // lead; until the row says so, aller is named here, because "il est allé" read as a passive would be a wrong card)
    const auxNote = part.notes?.auxiliary ?? (part.lemma === 'aller' ? 'être' : undefined);
    if (auxNote === 'être' || auxNote === 'être or avoir') {
      out.push(hit(key, [a, p], auxNote === 'être' ? 0.9 : 0.65));
    } else {
      // être + the participle of a verb that takes avoir: the passive (la lettre est écrite; il fut reçu)
      const par = [s.next(p), s.next(s.next(p))].find((k) => s.form(k) === 'par');
      out.push(hit('passive-voice', [a, p, par], 0.8));
    }
    if (agreesVisibly(part)) out.push(hit('participle-agreement-etre', [a, p], 0.85));
  }
}

// ── simple tenses and periphrases ──
function simpleTenses(s: Sentence, out: PatternCandidate[], auxiliaries: Set<number>): void {
  for (let i = 0; i < s.tokens.length; i++) {
    const c = s.first(i);
    if (!c || !isFinite(c) || !s.trusted(i)) continue;
    const literarySub = has(c, 'Mood', 'Sub') && has(c, 'Tense', 'Imp');
    if (auxiliaries.has(i) && !literarySub) continue;
    const key = literarySub ? 'literary-subjunctive-imperfect'
      : has(c, 'Mood', 'Ind') && has(c, 'Tense', 'Past') ? 'passe-simple'
        : has(c, 'Mood', 'Ind') && has(c, 'Tense', 'Imp') ? 'imparfait'
          : has(c, 'Mood', 'Ind') && has(c, 'Tense', 'Fut') ? 'futur-simple' : undefined;
    if (!key) continue;
    // the same spelling is also another tense (il finit: present or passé simple): the pattern rests on the order chosen
    const others = (s.analyses[i]?.candidates ?? []).slice(1).some((x) => isFinite(x) && (x.morph.Tense !== c.morph.Tense || x.morph.Mood !== c.morph.Mood));
    out.push(hit(key, [i], others ? Math.min(0.6, c.confidence) : Math.max(0.7, Math.min(0.9, c.confidence))));
  }
}
/** The next word after k that is an infinitive, over ne, pas, object clitics and adverbs. */
function infinitiveAfter(s: Sentence, k: number): number | undefined {
  let j = s.next(k);
  for (let steps = 0; j !== undefined && steps < 5; steps++, j = s.next(j)) {
    const c = s.first(j);
    if (c && isInfinitive(c)) return j;
    const f = s.form(j) as string;
    if (!(OBJECT_CLITICS.has(f) || NE_FORMS.has(f) || BETWEEN_ADVERBS.has(f))) return undefined;
  }
  return undefined;
}
function periphrases(s: Sentence, out: PatternCandidate[]): void {
  for (let i = 0; i < s.tokens.length; i++) {
    const c = s.first(i);
    if (!c) continue;
    const presentInd = isFinite(c) && has(c, 'Mood', 'Ind') && has(c, 'Tense', 'Pres');
    if (presentInd && c.lemma === 'aller') {
      const inf = infinitiveAfter(s, i);
      if (inf !== undefined) out.push(hit('futur-proche', [i, inf], 0.85));
    }
    if (presentInd && c.lemma === 'venir') {
      const de = s.next(i);
      if (de !== undefined && (s.form(de) === 'de' || s.form(de) === "d'")) {
        const inf = infinitiveAfter(s, de);
        if (inf !== undefined) out.push(hit('passe-recent', [i, de, inf], 0.85));
      }
    }
    if (isFinite(c) && c.lemma === 'être') {
      const en = s.next(i);
      const train = s.next(en);
      const de = s.next(train);
      if (s.form(en) === 'en' && s.form(train) === 'train' && (s.form(de) === 'de' || s.form(de) === "d'")) out.push(hit('etre-en-train-de', [i, en, train, de, infinitiveAfter(s, de as number)], 0.9));
    }
    if (s.form(i) === 'en' && c.pos === 'ADP') {
      const n = s.next(i);
      const part = s.first(n);
      if (part && isPresentParticiple(part)) out.push(hit('gerondif', [s.form(s.prev(i)) === 'tout' ? s.prev(i) : undefined, i, n], 0.9));
    }
    if (isFinite(c) && has(c, 'Mood', 'Sub') && s.trusted(i)) {
      const t = frenchSubjunctiveTrigger(i, s.tokens, s.readings());
      if (t) out.push(hit('subjunctive-after-que', [t.trigger, t.que, i], 0.8));
    }
    if (s.form(i) === 'y' && c.pos === 'PRON') {
      const a = s.next(i);
      const av = s.first(a);
      if (a === undefined || !av || av.lemma !== 'avoir' || !isFinite(av)) continue;
      const p = s.prev(i);
      const pf = s.form(p);
      if (pf === 'il') out.push(hit('il-y-a', [p, i, a], 0.95));
      else if (pf !== undefined && NE_FORMS.has(pf) && s.form(s.prev(p)) === 'il') out.push(hit('il-y-a', [s.prev(p), i, a], 0.95));
      else if (opensClause(s.tokens, i) || pf === 'qu\'') {
        let j = hyphenAfter(s.tokens, a);
        if (j !== undefined && s.form(j) === 't') j = hyphenAfter(s.tokens, j);
        if (s.form(j) === 'il') out.push(hit('il-y-a', [i, a, j], 0.9));
      }
    }
  }
}

// ── negation ──
function negations(s: Sentence, out: PatternCandidate[]): void {
  for (let i = 0; i < s.tokens.length; i++) {
    const f = s.form(i);
    if (f === undefined) continue;
    if (NE_FORMS.has(f) && s.first(i)?.lemma === 'ne') {
      let negative: number | undefined;
      let que: number | undefined;
      for (let k = i + 1, steps = 0; k < s.tokens.length && steps < 12; k++) {
        const t = s.tokens[k];
        if (!t.isWord) { if (t.normalized === '-') continue; break; }
        steps++;
        const w = t.normalized;
        const c = s.first(k);
        if (NEGATIVE_WORDS.has(w) && c && c.pos !== 'NOUN' && !(w === 'plus' && isVerbal(c))) { negative = k; break; }
        if (QUE_FORMS.has(w)) { que = k; break; }
      }
      if (negative === undefined) {
        for (let k = s.prev(i), steps = 0; k !== undefined && steps < 4; k = s.prev(k), steps++) {
          const w = s.form(k) as string;
          if (NEGATIVE_FRONT.has(w) && s.first(k)?.pos !== 'NOUN') { negative = k; break; }
        }
      }
      if (negative !== undefined) out.push(hit('negation', [i, negative], 0.9));
      else if (que !== undefined) out.push(hit('negation-ne-que', [i, que], 0.85));
      else {
        // the literary ne without pas: il ne cesse de pleurer, je n'ose le dire
        let v = s.next(i);
        while (v !== undefined && OBJECT_CLITICS.has(s.form(v) as string)) v = s.next(v);
        const verb = s.first(v);
        if (verb && isFinite(verb) && BARE_NE_VERBS.has(verb.lemma ?? '')) out.push(hit('negation', [i, v], 0.65));
      }
      continue;
    }
    // je sais pas, c'est pas vrai: the second word right after a conjugated verb, no ne in the clause (never "plus": it may mean "more")
    if (['pas', 'jamais', 'rien', 'personne'].includes(f)) {
      const c = s.first(i);
      const p = s.prev(i);
      const verb = s.first(p);
      if (!c || c.pos === 'NOUN' || !verb || !isFinite(verb) || s.form(s.next(i)) === 'mal') continue;
      let ne = false;
      for (let k = i - 1; k >= 0; k--) {
        const t = s.tokens[k];
        if (!t.isWord) { if (t.normalized === '-') continue; break; }
        if (NE_FORMS.has(t.normalized)) { ne = true; break; }
      }
      if (!ne) out.push(hit('negation-ne-dropped', [p, i], 0.75));
    }
  }
}

// ── pronouns, questions ──
function pronouns(s: Sentence, out: PatternCandidate[], compoundOf: Map<number, number>): void {
  for (let v = 0; v < s.tokens.length; v++) {
    const verb = s.first(v);
    if (!verb || !isVerbal(verb) || !(isFinite(verb) || isInfinitive(verb))) continue;
    const { clitics } = cliticChain(s, v);
    const subject = subjectOf(s, v);
    const objects = clitics.filter((c) => !(subject && c === subject.index));
    if (objects.length === 0) continue;
    const part = compoundOf.get(v);
    const verbIdx = part === undefined ? [v] : [v, part];
    const ilYA = s.form(s.prev(objects[0])) === 'il' && objects.length === 1 && s.form(objects[0]) === 'y' && verb.lemma === 'avoir';
    // a reflexive of the subject's person: the pronominal verb (compound tenses report it with their participle)
    const refl = reflexiveOf(s, v);
    if (refl !== undefined && part === undefined) out.push(hit('pronominal-verb', [refl, v], 0.85));
    for (const o of objects) {
      const f = s.form(o);
      if (f === 'y' && !ilYA) out.push(hit('pronoun-y', [o, ...verbIdx], 0.85));
      if (f === 'en') out.push(hit('pronoun-en', [o, ...verbIdx], 0.85));
    }
    if (objects.length >= 2) out.push(hit('double-object-pronouns', [...objects, ...verbIdx], 0.85));
    else if (objects[0] !== refl && !['y', 'en'].includes(s.form(objects[0]) as string)) out.push(hit('object-pronouns', [objects[0], ...verbIdx], 0.85));
  }
  for (let v = 0; v < s.tokens.length; v++) {
    const verb = s.first(v);
    if (!verb || !isFinite(verb)) continue;
    // donne-le-moi, allons-y, va-t'en
    const after: number[] = [];
    let j = hyphenAfter(s.tokens, v);
    while (j !== undefined && IMPERATIVE_CLITICS.has(s.form(j) as string)) {
      after.push(j);
      const f = s.form(j) as string;
      const adjacent = s.next(j);
      if ((f === "m'" || f === "t'") && adjacent !== undefined && ['en', 'y'].includes(s.form(adjacent) as string)) { after.push(adjacent); break; }
      j = hyphenAfter(s.tokens, j);
    }
    const question = clauseEnd(s.tokens, v) === '?';
    if (after.length > 0 && (has(verb, 'Mood', 'Imp') || ['moi', 'toi'].includes(s.form(after[0]) as string)) && !(question && ['nous', 'vous'].includes(s.form(after[0]) as string))) {
      out.push(hit('imperative-pronouns', [v, ...after], 0.85));
      for (const a of after) {
        if (s.form(a) === 'y') out.push(hit('pronoun-y', [v, a], 0.85));
        if (s.form(a) === 'en') out.push(hit('pronoun-en', [v, a], 0.85));
      }
      continue;
    }
    // viens-tu ? a-t-il fini ? est-ce vrai ?
    let k = hyphenAfter(s.tokens, v);
    const t = k !== undefined && s.form(k) === 't' ? k : undefined;
    if (t !== undefined) k = hyphenAfter(s.tokens, t);
    const kf = s.form(k);
    if (k !== undefined && kf !== undefined && INVERTED_SUBJECTS.has(kf)) {
      const que = s.next(k);
      if (s.form(v) === 'est' && kf === 'ce' && que !== undefined && QUE_FORMS.has(s.form(que) as string)) {
        const qu = s.prev(v);
        out.push(hit('est-ce-que', [qu !== undefined && QUE_FORMS.has(s.form(qu) as string) ? qu : undefined, v, k, que], 0.95));
      } else if (question) out.push(hit('inversion-question', [v, t, k], 0.85));
    }
  }
  // c'est, ce sont, c'était
  for (let i = 0; i < s.tokens.length; i++) {
    const f = s.form(i);
    if (f !== "c'" && f !== 'ce' && f !== "ç'") continue;
    if (s.first(i)?.pos !== 'PRON') continue;
    const n = s.next(i);
    const c = s.first(n);
    if (c && isVerbal(c) && c.lemma === 'être' && isFinite(c)) out.push(hit('c-est', [i, n], 0.95));
  }
}

// ── relative clauses ──
/** The antecedent of a relative pronoun at k, and the preposition between them (la table sur laquelle; le monument près duquel). */
function antecedentOf(s: Sentence, k: number): number[] | undefined {
  let p = s.prev(k);
  if (p === undefined && isPause(s.tokens[k - 1]) && s.tokens[k - 1].normalized === ',') p = s.prev(k - 1); // l'homme, qui …
  const between: number[] = [];
  for (let steps = 0; p !== undefined && steps < 2; steps++) {
    const c = s.first(p);
    const f = s.form(p) as string;
    if (c && (c.pos === 'NOUN' || c.pos === 'PROPN' || ANTECEDENT_PRONOUNS.has(f))) return [p, ...between];
    if (!(PREPOSITIONS.has(f) || c?.pos === 'ADP' || c?.pos === 'ADV')) return undefined;
    between.unshift(p);
    p = s.prev(p);
  }
  return undefined;
}
/** The verb of the clause that a relative pronoun at k opens. */
function clauseVerb(s: Sentence, k: number): number | undefined {
  let j = s.next(k);
  for (let steps = 0; j !== undefined && steps < 6; steps++, j = s.next(j)) {
    const c = s.first(j);
    if (c && isFinite(c)) return j;
  }
  return undefined;
}
function relatives(s: Sentence, out: PatternCandidate[]): void {
  for (let i = 0; i < s.tokens.length; i++) {
    const f = s.form(i);
    const c = s.first(i);
    if (f === undefined || !c) continue;
    if (f === 'qui' || f === 'dont' || f === 'où' || QUE_FORMS.has(f)) {
      if (QUE_FORMS.has(f) && !(c.pos === 'PRON' && has(c, 'PronType', 'Rel'))) continue;
      const ante = antecedentOf(s, i);
      const verb = clauseVerb(s, i);
      if (f === 'dont') { out.push(hit('relative-dont', [...(ante ?? []), i, verb], ante ? 0.9 : 0.8)); continue; }
      if (!ante) continue;
      // after a verb (je sais qui vient, je sais où il est) it is an indirect question: ante is never a verb here
      const key = f === 'qui' ? 'relative-qui' : f === 'où' ? 'relative-ou' : 'relative-que';
      out.push(hit(key, [...ante, i, verb], 0.85));
      continue;
    }
    if (LEQUEL_LEMMAS.has(c.lemma ?? '') || (c.parts ?? []).some((p) => p.lemma === 'lequel')) {
      if (opensClause(s.tokens, i)) continue; // lequel veux-tu ? the interrogative
      const ante = antecedentOf(s, i);
      if (ante) out.push(hit('relative-lequel', [...ante, i, clauseVerb(s, i)], 0.85));
    }
  }
}

// ── the noun phrase ──
function nominal(s: Sentence, out: PatternCandidate[]): void {
  for (let i = 0; i < s.tokens.length; i++) {
    const f = s.form(i);
    const c = s.first(i);
    if (f === undefined || !c) continue;
    const n = s.next(i);
    // elision: l'homme, qu'il, j'aime — the elided word and the word it is run onto
    if (f.endsWith("'") && n !== undefined && s.tokens[i].end === s.tokens[n].start) out.push(hit('elision', [i, n], 0.95));
    if (f === 'au' || f === 'aux') { out.push(hit('contraction-article', [i], 0.95)); continue; }
    if (f === 'du' || f === 'des') {
      if (c.pos === 'ADP') out.push(hit('contraction-article', [i], 0.85));
      else if (c.pos === 'DET') out.push(hit('partitive-article', [i, s.first(n)?.pos === 'NOUN' ? n : undefined], f === 'du' ? 0.8 : 0.65));
      continue;
    }
    if (f === 'de' || f === "d'") {
      const p = s.prev(i);
      const pf = s.form(p);
      // je n'ai pas de pain: after the negation, plain de
      if (pf !== undefined && ['pas', 'plus', 'jamais', 'point', 'guère'].includes(pf) && s.first(p)?.pos !== 'NOUN' && n !== undefined && ['NOUN', 'ADJ'].includes(s.first(n)?.pos ?? '')) {
        out.push(hit('partitive-article', [p, i, n], 0.75));
        continue;
      }
      // il mange de la viande, boire de l'eau: de + la / l' after a verb that does not itself take de
      const art = s.first(n);
      const noun = s.next(n);
      const pv = s.first(p);
      if ((s.form(n) === 'la' || s.form(n) === "l'") && art?.pos === 'DET' && s.first(noun)?.pos === 'NOUN' && pv && isVerbal(pv) && !DE_VERBS.has(pv.lemma ?? '')) {
        out.push(hit('partitive-article', [i, n, noun], 0.7));
      }
      continue;
    }
    // un grand homme / un homme grand
    if (c.pos === 'ADJ' && POSITION_ADJECTIVES.has(c.lemma ?? '')) {
      const nb = s.first(n)?.pos === 'NOUN' ? n : s.first(s.prev(i))?.pos === 'NOUN' ? s.prev(i) : undefined;
      if (nb !== undefined) out.push(hit('adjective-position', [i, nb], 0.7));
    }
    if ((f === 'plus' || f === 'moins' || f === 'aussi') && c.pos === 'ADV') {
      const p = s.prev(i);
      const pf = s.form(p);
      const next = s.first(n);
      const degree = next !== undefined && (next.pos === 'ADJ' || next.pos === 'ADV');
      if (f !== 'aussi' && pf !== undefined && (LE_FORMS.has(pf) || POSSESSIVES.has(pf))) {
        if (degree || (next && isPastParticiple(next))) out.push(hit('superlative', [p, i, n], 0.85));
        continue;
      }
      // ne … plus is the negation, not "more"
      let ne = false;
      for (let k = i - 1; k >= 0 && !ne; k--) {
        const t = s.tokens[k];
        if (!t.isWord) { if (t.normalized === '-') continue; break; }
        ne = NE_FORMS.has(t.normalized);
      }
      if (ne && f === 'plus') continue;
      let que: number | undefined;
      for (let k = s.next(i), steps = 0; k !== undefined && steps < 4; k = s.next(k), steps++) if (QUE_FORMS.has(s.form(k) as string)) { que = k; break; }
      if (degree && n !== undefined && !QUE_FORMS.has(s.form(n) as string)) out.push(hit('comparative', [i, n, que], que !== undefined ? 0.85 : 0.7));
      else if (que !== undefined && f !== 'aussi') out.push(hit('comparative', [i, que], 0.7));
    }
  }
}

/** Every construction of one sentence (or of a run of sentences: no window crosses a full stop). */
export function detectFrenchConstructions(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  const s = new Sentence(tokens, analyses);
  const out: PatternCandidate[] = [];
  const compounds: Compound[] = [];
  compoundTenses(s, out, compounds);
  const auxiliaries = new Set(compounds.map((c) => c.aux));
  const compoundOf = new Map(compounds.map((c) => [c.aux, c.part]));
  simpleTenses(s, out, auxiliaries);
  periphrases(s, out);
  negations(s, out);
  pronouns(s, out, compoundOf);
  relatives(s, out);
  nominal(s, out);
  return out;
}
