/**
 * Checks on a learner's own Hindi (testimony writing). Rule-based and modest: each finding names the words, says in
 * one plain sentence what the rule is, offers a replacement only when the rule is sure of it, and carries a
 * confidence. An empty result means nothing was found, never "correct". Meaning, idiom and tone are not judged here.
 *
 * Covered: the adjective and का / के / की agree with their noun; a noun or pronoun before a postposition is in its oblique
 * form; ने only with a perfective verb; the verb agrees with its subject otherwise (the subject being the one bare noun or
 * personal pronoun of the clause, and honorific plurals being left alone); को with the one who must or feels (मुझे जाना है,
 * not मैं जाना है); a misplaced nukta or chandrabindu, and a nukta or nasal mark that differs from the spelling the word
 * list vouches for (`notes.variantOf`); the infinitive before लगना / चाहना / सकना in its right form; है / हैं / हूँ with the subject.
 *
 * A finding needs the words it depends on to be analysed AND vouched for by the word list (a reading marked `unconfirmed` is
 * a guess, and a guess is not a ground for correcting a learner). Corrections are built by rule from the forms the learner
 * wrote (construction-forms.ts) and are offered only when the rule reproduces the learner's own form first. Machine-drafted
 * from general knowledge of Hindi, not checked by a native speaker.
 */
import type { AnalyzedToken, ErrorCandidate, RawToken } from '../../core';
import { isGenitive, isPostposition, makeCtx, type Ctx } from './construction-ctx';
import {
  DATIVE_OF, DATIVE_OF_ERGATIVE, FUSED, INVARIANT_IN_AA, PAST_OF_BE, adjectiveForm, genitiveEnding, obliquePluralOfFeminine, participleForm,
  presentOfBe, stemOfInfinitive, type Gender, type Num,
} from './construction-forms';
import { feat, hasF, isChahiye, one, vkinds, type C, type VerbGroup } from './verb-group';

const NUKTA = '़';
/** A reading the word list vouches for (not a rule's guess), and not a weak one. */
const solid = (c: C | undefined): c is C => !!c && !c.unconfirmed && c.confidence >= 0.5;
const isNounC = (c: C): boolean => c.pos === 'NOUN';
const norm = (s: string): string => s.normalize('NFC').replace(/ं/gu, 'ँ');
const gender = (c: C): Gender | undefined => { const g = one(c, 'Gender'); return g === 'Masc' || g === 'Fem' ? g : undefined; };
const num = (c: C): Num | undefined => { const n = one(c, 'Number'); return n === 'Sing' || n === 'Plur' ? n : undefined; };

type Out = ErrorCandidate[];

function make(tokens: RawToken[], category: ErrorCandidate['category'], idx: number[], message: string, confidence: number, replace?: { a: number; b: number; text: string }, affectsMeaning = false): ErrorCandidate {
  return {
    category, tokenIndexes: [...idx].sort((x, y) => x - y), message, confidence, affectsMeaning,
    ...(replace ? { suggestion: { start: tokens[replace.a].start, end: tokens[replace.b].end, replacement: replace.text } } : {}),
  };
}

/** The word i's best reading that satisfies pred, only when the word list vouches for it. */
const solidFind = (c: Ctx, i: number, pred: (x: C) => boolean): C | undefined => { const r = c.find(i, pred); return solid(r) ? r : undefined; };

// ───────────────────────────── agreement of adjective and noun, and of का / के / की ─────────────────────────────

function adjectiveAndNoun(c: Ctx): Out {
  const out: Out = [];
  for (let i = 0; i < c.tokens.length; i++) {
    const adjs = c.cands(i).filter((x) => x.pos === 'ADJ' && gender(x) !== undefined && x.morph.Poss === undefined);
    if (adjs.length === 0 || c.cands(i).some((x) => x.pos !== 'ADJ' && x.confidence >= adjs[0].confidence)) continue;
    const j = c.after(i);
    if (j < 0) continue;
    const nouns = c.cands(j).filter((x) => isNounC(x) && gender(x) !== undefined);
    if (nouns.length === 0 || !solid(nouns[0]) || !solid(adjs[0]) || c.cands(j).some((x) => x.pos === 'ADJ' && x.confidence >= nouns[0].confidence)) continue;
    const adjGenders = new Set(adjs.map((x) => gender(x)));
    const nounGenders = new Set(nouns.map((x) => gender(x)));
    if (nounGenders.size !== 1) continue;
    const ng = gender(nouns[0]) as Gender;
    const lemma = adjs[0].lemma ?? '';
    if (!adjGenders.has(ng)) {
      // the form to offer: only when the rule reproduces the adjective as written, and every reading of the noun asks for the same form
      const observed = adjs.some((a) => adjectiveForm(lemma, gender(a) as Gender, num(a) ?? 'Sing', hasF(a, 'Case', 'Obl')) === c.n(i));
      const forms = new Set(nouns.map((n) => adjectiveForm(lemma, ng, num(n) ?? 'Sing', hasF(n, 'Case', 'Obl') && !hasF(n, 'Case', 'Dir'))));
      const form = observed && forms.size === 1 ? [...forms][0] : undefined;
      out.push(make(c.tokens, 'agreement', [i, j],
        `"${c.tokens[j].surface}" is ${ng === 'Fem' ? 'feminine' : 'masculine'}, so the adjective "${c.tokens[i].surface}" has to be ${ng === 'Fem' ? 'feminine' : 'masculine'} too${form ? ` (${form})` : ''}.`,
        form ? 0.8 : 0.65, form ? { a: i, b: i, text: form } : undefined));
      continue;
    }
    // masculine -ा adjective before an oblique noun with a postposition after it: बड़ा लड़के को → बड़े लड़के को
    const k = c.after(j);
    const obliqueOnly = ng === 'Masc' && nouns.every((n) => n.lemma !== c.n(j)) && nouns.some((n) => hasF(n, 'Case', 'Obl') && !hasF(n, 'Case', 'Dir') && num(n) !== 'Plur');
    if (obliqueOnly && k >= 0 && isPostposition(c, k) && lemma.endsWith('ा') && c.n(i) === lemma && adjs.every((x) => !hasF(x, 'Case', 'Obl'))) {
      const form = adjectiveForm(lemma, 'Masc', 'Sing', true);
      if (form) out.push(make(c.tokens, 'agreement', [i, j], `Before a postposition the noun is oblique (${c.tokens[j].surface}), and the adjective with it takes -े: ${form} ${c.tokens[j].surface}.`, 0.7, { a: i, b: i, text: form }));
    }
  }
  return out;
}

function genitives(c: Ctx): Out {
  const out: Out = [];
  const isGen = (x: C): boolean => x.lemma === 'का' || x.morph.Poss === 'Yes' || x.morph.Case === 'Gen';
  for (let i = 0; i < c.tokens.length; i++) {
    if (!c.isWord(i) || !isGenitive(c, i)) continue;
    const surface = c.n(i);
    const gens = c.cands(i).filter(isGen);
    const other = c.cands(i).find((x) => !isGen(x) && x.confidence >= (gens[0]?.confidence ?? 0));
    if (gens.length === 0 || other || !/[ाेी]$/u.test(surface)) continue;
    // the noun owned: the first noun after up to two adjectives
    let j = c.after(i);
    for (let step = 0; step < 3 && j >= 0 && c.pos(j, 'ADJ') && !c.pos(j, 'NOUN'); step++) j = c.after(j);
    if (j < 0) continue;
    const nouns = c.cands(j).filter((x) => isNounC(x) && gender(x) !== undefined);
    if (nouns.length === 0 || !solid(nouns[0]) || new Set(nouns.map((x) => gender(x))).size !== 1) continue;
    if (c.cands(j).some((x) => x.pos === 'ADP' && x.confidence >= nouns[0].confidence) || c.cands(j)[0]?.pos !== 'NOUN') continue;
    const g = gender(nouns[0]) as Gender;
    const last = surface[surface.length - 1];
    const allowed = new Set<string>();
    for (const n of nouns) for (const e of genitiveEnding(g, num(n) ?? 'Sing', feat(n, 'Case'))) allowed.add(e);
    if (allowed.has(last)) continue;
    const fixed = allowed.size === 1 ? surface.slice(0, -1) + [...allowed][0] : undefined;
    const saidWith = g === 'Fem' ? 'feminine' : allowed.has('े') && !allowed.has('ा') ? 'a plural or oblique masculine' : allowed.has('े') ? 'masculine (का, or के before a plural or oblique)' : 'a masculine singular';
    out.push(make(c.tokens, 'agreement', [i, j],
      `${surface} has to agree with the thing owned, not the owner: "${c.tokens[j].surface}" is ${saidWith}${fixed ? `, so ${fixed}` : ''}.`,
      fixed ? 0.8 : 0.6, fixed ? { a: i, b: i, text: fixed } : undefined));
  }
  return out;
}

// ───────────────────────────── the oblique before a postposition ─────────────────────────────

function obliques(c: Ctx): Out {
  const out: Out = [];
  for (let i = 0; i < c.tokens.length; i++) {
    const j = c.after(i);
    if (!c.isWord(i) || j < 0 || !isPostposition(c, j)) continue;
    const post = c.n(j);
    // a personal pronoun in the direct case: मैं को → मुझे
    const pr = solidFind(c, i, (x) => x.pos === 'PRON' && x.lemma !== undefined && !!FUSED[c.n(i)]);
    if (pr && FUSED[c.n(i)]?.[post] && c.cands(i).every((x) => x.pos === 'PRON' && !hasF(x, 'Case', 'Obl') && !hasF(x, 'Case', 'Dat') && !hasF(x, 'Case', 'Erg'))) {
      const fused = FUSED[c.n(i)][post];
      out.push(make(c.tokens, 'case', [i, j], `Before ${post} the pronoun changes: "${c.tokens[i].surface} ${c.tokens[j].surface}" is written ${fused}.`, 0.8, { a: i, b: j, text: fused }));
      continue;
    }
    // a masculine noun in -ा, direct singular, before a postposition: लड़का को → लड़के को
    const noun = solidFind(c, i, (x) => isNounC(x) && gender(x) === 'Masc' && num(x) === 'Sing' && hasF(x, 'Case', 'Dir') && !hasF(x, 'Case', 'Obl'));
    if (noun && noun.lemma && noun.lemma === c.n(i) && noun.lemma.endsWith('ा') && !INVARIANT_IN_AA.has(noun.lemma) && c.cands(i).every((x) => !hasF(x, 'Case', 'Obl') && !hasF(x, 'Case', 'Voc'))) {
      const fixed = noun.lemma.slice(0, -1) + 'े';
      out.push(make(c.tokens, 'case', [i, j], `Before a postposition a masculine noun in -ा changes to -े: ${fixed} ${c.tokens[j].surface}.`, 0.75, { a: i, b: i, text: fixed }));
      continue;
    }
    // a feminine plural, direct, before a postposition: किताबें में → किताबों में
    const fem = solidFind(c, i, (x) => isNounC(x) && gender(x) === 'Fem' && num(x) === 'Plur' && hasF(x, 'Case', 'Dir') && !hasF(x, 'Case', 'Obl'));
    if (fem && c.cands(i).every((x) => !hasF(x, 'Case', 'Obl'))) {
      const fixed = obliquePluralOfFeminine(c.n(i));
      if (fixed) out.push(make(c.tokens, 'case', [i, j], `A plural noun ends in -ों before a postposition: ${fixed} ${c.tokens[j].surface}.`, 0.75, { a: i, b: i, text: fixed }));
    }
  }
  return out;
}

// ───────────────────────────── ने ─────────────────────────────

function ergative(c: Ctx): Out {
  const out: Out = [];
  c.tokens.forEach((_, i) => {
    if (!c.isWord(i)) return;
    const fusedErg = c.find(i, (x) => hasF(x, 'Case', 'Erg') && x.pos === 'PRON');
    const isNe = c.n(i) === 'ने' && !!c.pos(i, 'ADP');
    if (!fusedErg && !isNe) return;
    if (fusedErg && !solid(fusedErg)) return;
    const [, to] = c.clause(i);
    const later = c.groups.filter((g) => g.start > i && g.start <= to);
    if (later.length === 0) return;
    const hasPerfective = later.some((g) => g.elems.some((e) => e.kind === 'pf'));
    const finite = later.find((g) => ['ipf', 'prog', 'fut', 'imp', 'sub', 'pres'].includes(g.core.kind) || g.elems.some((e) => e.kind === 'ipf' || e.kind === 'prog'));
    const obligation = later.find((g) => g.flags.obligation);
    const bad = obligation ?? finite;
    if (hasPerfective || !bad || !later.every((g) => g.confidence >= 0.9)) return;
    const word = c.tokens[i].surface;
    if (obligation && fusedErg && DATIVE_OF_ERGATIVE[c.n(i)]) {
      out.push(make(c.tokens, 'postposition', [i, ...obligation.tokenIndexes], `${word} goes with a perfective verb only. With "must" the person takes को: ${DATIVE_OF_ERGATIVE[c.n(i)]}.`, 0.75, { a: i, b: i, text: DATIVE_OF_ERGATIVE[c.n(i)] }));
    } else {
      out.push(make(c.tokens, 'postposition', [i, bad.main.i], `${isNe ? 'ने' : word} goes with a perfective verb (किया, गया, खाया …); "${bad.main.surface}" is not perfective.`, 0.7));
    }
  });
  return out;
}

// ───────────────────────────── the verb agrees with its subject ─────────────────────────────

const FEELINGS = new Set(['भूख', 'प्यास', 'डर', 'ठंड', 'सर्दी', 'गर्मी', 'नींद', 'शर्म', 'चोट', 'पता', 'मालूम']);

function bareNominals(c: Ctx, from: number, to: number): Array<{ i: number; c: C }> {
  const out: Array<{ i: number; c: C }> = [];
  for (let k = from; k < to; k++) {
    if (!c.isWord(k)) continue;
    if (c.cands(k).some((x) => x.parts?.some((p) => p.pos === 'ADP'))) continue;
    // a word that can be in the direct case (a form shared by the direct and the oblique counts)
    const r = c.cands(k).find((x) => (x.pos === 'NOUN' || x.pos === 'PROPN' || x.pos === 'PRON') && x.morph.Poss === undefined && (!x.morph.Case || hasF(x, 'Case', 'Dir')));
    if (!r) continue;
    const j = c.after(k);
    if (j >= 0 && (isPostposition(c, j) || (isGenitive(c, j) && !c.pos(j, 'NOUN')))) continue;
    out.push({ i: k, c: r });
  }
  return out;
}

/** A group that says what someone feels, knows or needs ("भूख लगी है", "पता नहीं है", "चाहिए"): its person takes को and is not its subject. */
function experiencerGroup(c: Ctx, g: VerbGroup): boolean {
  if (g.elems.some(isChahiye)) return true;
  if (!(g.main.lemma === 'लगना' || (g.main.lemma === 'होना' && g.elems.length === 1))) return false;
  const [from] = c.clause(g.start);
  for (let k = g.start - 1; k >= from; k--) if (c.isWord(k) && c.find(k, (x) => x.lemma !== undefined && FEELINGS.has(x.lemma.normalize('NFC')))) return true;
  return false;
}

const aux = (g: VerbGroup) => g.tenseAux ?? (g.elems.length === 1 && g.main.lemma === 'होना' ? g.main : undefined);

/** Number of a personal pronoun: its own, or plural for तुम and आप (they take plural verbs). */
const pronounNumber = (p: C): string | undefined => one(p, 'Number') ?? (['Fam', 'Form'].includes(one(p, 'Polite') ?? '') ? 'Plur' : undefined);

function subjectAgreement(c: Ctx): Out {
  const out: Out = [];
  c.groups.forEach((g, gi) => {
    const f = g.flags;
    if (f.obligation || f.passive || experiencerGroup(c, g)) return;
    const [clauseFrom] = c.clause(g.start);
    const before = c.groups[gi - 1];
    const from = before && before.end >= clauseFrom ? before.end + 1 : clauseFrom;
    for (let k = clauseFrom; k < g.start; k++) if (c.isWord(k) && (c.find(k, (x) => hasF(x, 'Case', 'Erg') || hasF(x, 'Case', 'Dat')) || ['ने', 'को'].includes(c.n(k)))) return;
    const bare = bareNominals(c, from, g.start);
    const personalOf = (b: { i: number; c: C }): boolean => b.c.pos === 'PRON' && one(b.c, 'Person') !== undefined && pronounNumber(b.c) !== undefined && !['Int', 'Rel', 'Ind'].includes(b.c.morph.PronType ?? '');
    const personal = bare.filter(personalOf);
    const a = aux(g);
    if (personal.length === 1 && bare.filter((b) => b.c.pos === 'PRON').length === 1) {
      const p = personal[0].c;
      const pi = personal[0].i;
      const person = one(p, 'Person') as string;
      const number = pronounNumber(p) as string;
      const readings = c.cands(pi).filter((x) => x.pos === 'PRON');
      if (!solid(p) || !readings.every((x) => one(x, 'Person') === person) || !a || a.c.unconfirmed) return;
      if (a.kind === 'pres') {
        const ok = presentOfBe(person, number, one(p, 'Polite'));
        const surface = norm(a.surface);
        const consistent = c.cands(a.i).some((x) => x.lemma === 'होना' && hasF(x, 'Tense', 'Pres') && (feat(x, 'Person').length === 0 || feat(x, 'Person').includes(person)) && (feat(x, 'Number').length === 0 || feat(x, 'Number').includes(number)));
        if (!ok.map(norm).includes(surface) && !consistent && ['हूँ', 'है', 'हैं', 'हो'].map(norm).includes(surface)) {
          out.push(make(c.tokens, 'agreement', [pi, a.i], `"${c.tokens[pi].surface}" goes with "${ok[0]}", not "${a.surface}".`, 0.8, { a: a.i, b: a.i, text: ok[0] }));
        }
      } else if (a.kind === 'past' && !(person === '3' && number === 'Sing')) {
        const wantPlural = number === 'Plur';
        const sing = ['था', 'थी'].includes(a.surface);
        const plur = ['थे', 'थीं'].includes(a.surface);
        if ((wantPlural && sing) || (!wantPlural && plur && one(p, 'Polite') !== 'Form')) {
          const gd = one(a.c, 'Gender') ?? (a.surface === 'थी' || a.surface === 'थीं' ? 'Fem' : 'Masc');
          const text = PAST_OF_BE[`${gd}${wantPlural ? 'Plur' : 'Sing'}`];
          if (text) out.push(make(c.tokens, 'agreement', [pi, a.i], `"${c.tokens[pi].surface}" goes with "${text}", not "${a.surface}".`, 0.7, { a: a.i, b: a.i, text }));
        }
      }
      return;
    }
    if (bare.length === 1 && bare[0].c.pos === 'NOUN') {
      const ni = bare[0].i;
      const readings = c.cands(ni).filter((x) => x.pos === 'NOUN' && (!x.morph.Case || hasF(x, 'Case', 'Dir')));
      const genders = new Set(readings.map(gender));
      const numbers = new Set(readings.map(num));
      const ng = [...genders][0];
      const nn = [...numbers][0];
      if (readings.length === 0 || !solid(readings[0]) || genders.size !== 1 || numbers.size !== 1 || !ng || !nn) return;
      if (c.cands(ni).some((x) => x.pos !== 'NOUN' && x.confidence >= readings[0].confidence)) return;
      // participles agree with the subject in gender and number; a reading that fits is enough
      for (const e of g.elems) {
        if (e.kind !== 'ipf' && e.kind !== 'pf' && e.kind !== 'prog') continue;
        const rs = c.cands(e.i).filter((x) => x.lemma === e.lemma && vkinds(x, e.surface).includes(e.kind));
        if (rs.length === 0 || rs.some((x) => x.unconfirmed || !gender(x) || !num(x))) continue;
        // the feminine -ी forms are the same in the singular and the plural (a list may give only one of them)
        const fits = rs.some((x) => gender(x) === ng && (num(x) === nn || (nn === 'Sing' && num(x) === 'Plur') || (ng === 'Fem' && /ी$/u.test(e.surface))));
        if (fits) continue;
        const seen = rs.find((x) => participleForm(e.lemma, e.kind as 'ipf' | 'pf' | 'prog', gender(x) as Gender, num(x) as Num) === e.surface);
        const fixed = seen ? participleForm(e.lemma, e.kind as 'ipf' | 'pf' | 'prog', ng, nn) : undefined;
        out.push(make(c.tokens, 'agreement', [ni, e.i],
          `The verb agrees with its subject: "${c.tokens[ni].surface}" is ${ng === 'Fem' ? 'feminine' : 'masculine'} ${nn === 'Plur' ? 'plural' : 'singular'}${fixed ? `, so ${fixed}` : ''}.`,
          fixed ? 0.8 : 0.6, fixed ? { a: e.i, b: e.i, text: fixed } : undefined));
        break;
      }
      if (a && !a.c.unconfirmed) {
        if (a.kind === 'pres' && nn === 'Plur' && norm(a.surface) === 'है') out.push(make(c.tokens, 'agreement', [ni, a.i], `"${c.tokens[ni].surface}" is plural, so "हैं", not "है".`, 0.75, { a: a.i, b: a.i, text: 'हैं' }));
        if (a.kind === 'past') {
          const ag = one(a.c, 'Gender');
          const an = one(a.c, 'Number');
          if (ag && an && (ag !== ng || (nn === 'Plur' && an === 'Sing'))) {
            const text = PAST_OF_BE[`${ng}${nn}`];
            if (text && text !== a.surface) out.push(make(c.tokens, 'agreement', [ni, a.i], `"${c.tokens[ni].surface}" is ${ng === 'Fem' ? 'feminine' : 'masculine'} ${nn === 'Plur' ? 'plural' : 'singular'}, so "${text}", not "${a.surface}".`, 0.75, { a: a.i, b: a.i, text }));
          }
        }
      }
    }
  });
  return out;
}

// ───────────────────────────── को with the one who must or feels ─────────────────────────────

function mustAndFeel(c: Ctx): Out {
  const out: Out = [];
  for (const g of c.groups) {
    const chahiye = g.elems.some(isChahiye);
    const obligation = g.flags.obligation;
    const [from] = c.clause(g.start);
    const feeling = !chahiye && experiencerGroup(c, g);
    if (!obligation && !chahiye && !feeling) continue;
    if (c.tokens.slice(from, g.start).some((t, off) => t.isWord && (['ने', 'को'].includes(t.normalized) || c.find(from + off, (x) => hasF(x, 'Case', 'Dat') || hasF(x, 'Case', 'Erg'))))) continue;
    const bare = bareNominals(c, from, g.start);
    const pronouns = bare.filter((b) => b.c.pos === 'PRON' && DATIVE_OF[c.n(b.i)] && solid(b.c));
    if (pronouns.length !== 1) {
      // a lone bare noun before "must": लड़का जाना है → लड़के को जाना है
      if (obligation && pronouns.length === 0 && bare.length === 1 && bare[0].c.pos === 'NOUN' && solid(bare[0].c) && gender(bare[0].c) === 'Masc' && num(bare[0].c) === 'Sing' && bare[0].c.lemma === c.n(bare[0].i) && !!bare[0].c.lemma?.endsWith('ा') && !INVARIANT_IN_AA.has(bare[0].c.lemma ?? '')) {
        const text = `${bare[0].c.lemma?.slice(0, -1)}े को`;
        out.push(make(c.tokens, 'case', [bare[0].i, g.main.i], `With "must" the person takes को: ${text} ${g.main.surface}.`, 0.65, { a: bare[0].i, b: bare[0].i, text }));
      }
      continue;
    }
    const p = pronouns[0];
    const person = one(p.c, 'Person');
    if (feeling && person !== '1' && person !== '2') continue;
    const dative = DATIVE_OF[c.n(p.i)];
    const what = obligation || chahiye ? 'must, should or need' : 'feel or know';
    out.push(make(c.tokens, 'case', [p.i, g.main.i], `The person who ${what === 'feel or know' ? 'feels or knows' : 'must or needs'} takes को: ${dative}, not ${c.tokens[p.i].surface}.`, 0.8, { a: p.i, b: p.i, text: dative }));
  }
  return out;
}

// ───────────────────────────── spelling of marks ─────────────────────────────

const NUKTA_BASES = new Set(['क', 'ख', 'ग', 'ज', 'ड', 'ढ', 'फ', 'य', 'ऩ', 'ऱ']);
const stripMarks = (s: string): string => s.normalize('NFC').replace(/[़ँं]/gu, '');

function marks(c: Ctx): Out {
  const out: Out = [];
  c.tokens.forEach((t, i) => {
    if (!t.isWord) return;
    const s = t.normalized;
    for (let k = 0; k < s.length; k++) {
      if (s[k] === NUKTA && !NUKTA_BASES.has(s[k - 1] ?? '')) {
        out.push(make(c.tokens, 'spelling', [i], 'The dot under a letter (nukta) belongs only under क ख ग ज ड ढ फ.', 0.6, { a: i, b: i, text: s.slice(0, k) + s.slice(k + 1) }));
        return;
      }
    }
    const m = /[िीेैोौ]ँ/u.exec(s);
    if (m) {
      out.push(make(c.tokens, 'spelling', [i], `With a vowel sign above the line, the nasal mark is the dot ं, not ँ: ${s.replace(/([िीेैोौ])ँ/gu, '$1ं')}.`, 0.75, { a: i, b: i, text: s.replace(/([िीेैोौ])ँ/gu, '$1ं') }));
      return;
    }
    // the word list knows this word under another spelling that differs only in a nukta or a nasal mark
    for (const x of c.cands(i)) {
      const v = x.notes?.variantOf;
      const vs = typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
      if (vs && vs.normalize('NFC') !== s && stripMarks(vs) === stripMarks(s)) {
        out.push(make(c.tokens, 'spelling', [i], `The usual spelling of this word is ${vs}.`, /़/u.test(vs + s) ? 0.55 : 0.45, { a: i, b: i, text: vs }));
        return;
      }
    }
  });
  return out;
}

// ───────────────────────────── the infinitive before लगना / चाहना / सकना ─────────────────────────────

function infinitives(c: Ctx): Out {
  const out: Out = [];
  for (let i = 0; i < c.tokens.length; i++) {
    const j = c.after(i);
    if (!c.isWord(i) || j < 0) continue;
    const inf = c.find(i, (x) => hasF(x, 'VerbForm', 'Inf') && solid(x));
    const stem = c.find(i, (x) => hasF(x, 'VerbForm', 'Stem'));
    const s = c.n(i);
    // रोना लगा → रोने लगा
    if (inf && /ना$/u.test(s) && c.lemma(j, 'लगना') && c.cands(i).every((x) => hasF(x, 'VerbForm', 'Inf'))) {
      const fixed = s.replace(/ना$/u, 'ने');
      out.push(make(c.tokens, 'morphology', [i, j], `Before लगना ("begin") the infinitive ends in -ने: ${fixed} ${c.tokens[j].surface}.`, 0.7, { a: i, b: i, text: fixed }));
    }
    // जाने चाहता → जाना चाहता
    if (inf && /ने$/u.test(s) && c.lemma(j, 'चाहना', 'चाहिए') && c.cands(i).every((x) => hasF(x, 'VerbForm', 'Inf'))) {
      const fixed = s.replace(/ने$/u, 'ना');
      out.push(make(c.tokens, 'morphology', [i, j], `चाहना takes the infinitive in -ना: ${fixed} ${c.tokens[j].surface}.`, 0.7, { a: i, b: i, text: fixed }));
    }
    // जाना सकता → जा सकता
    if (inf && /(ना|ने)$/u.test(s) && c.lemma(j, 'सकना') && c.cands(i).every((x) => hasF(x, 'VerbForm', 'Inf'))) {
      const lemma = inf.lemma ?? '';
      const st = stemOfInfinitive(lemma);
      if (st && (s === lemma || s === st + 'ने')) out.push(make(c.tokens, 'morphology', [i, j], `सकना goes with the bare stem: ${st} ${c.tokens[j].surface}, not ${s} ${c.tokens[j].surface}.`, 0.8, { a: i, b: i, text: st }));
    }
    // जा चाहता → जाना चाहता
    if (stem && c.cands(i).every((x) => hasF(x, 'VerbForm', 'Stem')) && solid(stem) && c.lemma(j, 'चाहना') && stem.lemma && stemOfInfinitive(stem.lemma) === s) {
      out.push(make(c.tokens, 'morphology', [i, j], `चाहना takes the infinitive: ${stem.lemma} ${c.tokens[j].surface}.`, 0.65, { a: i, b: i, text: stem.lemma }));
    }
  }
  return out;
}

/**
 * Checks on a learner's sentence. Empty means nothing was found, not that the sentence is correct.
 */
export function checkHindiProduction(tokens: RawToken[], analyses: AnalyzedToken[], sentence: string): ErrorCandidate[] {
  void sentence;
  if (!tokens.some((t) => t.isWord)) return [];
  const c = makeCtx(tokens, analyses);
  const all = [
    ...adjectiveAndNoun(c), ...genitives(c), ...obliques(c), ...ergative(c), ...subjectAgreement(c), ...mustAndFeel(c), ...marks(c), ...infinitives(c),
  ];
  const seen = new Set<string>();
  const unique = all.filter((e) => { const k = `${e.category}|${e.tokenIndexes.join(',')}|${e.suggestion?.replacement ?? e.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return unique.sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || b.confidence - a.confidence);
}
