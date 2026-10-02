/**
 * Rule checks on a learner's own German (GoTell). An empty result means nothing was found, never "correct": every
 * check fires only on its own unambiguous shape, uses the lexicon view for the facts it needs (a noun's gender, a verb's
 * perfect auxiliary, whether a prefix separates, the case a preposition governs) and says nothing when a fact is
 * missing. A suggestion (an exact replacement with offsets in `sentence`) is offered only where the fix is certain.
 *
 * Checks: capital letter of a noun; article and noun of different gender; an article that is not in the case the
 * preposition governs; verb not second after a fronted adverb; conjugated verb not last after dass / weil / wenn / ob;
 * haben where the verb takes sein; a separable verb written together in a main clause; a verb ending that does not go
 * with the subject pronoun; an adjective with no ending between article and noun; older spelling (daß, muß); kein for
 * "nicht ein".
 */
import type { AnalysisCandidate, AnalyzedToken, ErrorCandidate, RawToken } from '../../core';
import { matchCase } from '../shared';
import { exact, has, makeCtx, type Ctx } from './constructions';
import { conjugateGerman } from './morphology';
import type { DeLexiconView } from './types';

type Kase = 'Nom' | 'Acc' | 'Dat' | 'Gen';
type Gender = 'm' | 'f' | 'n';

interface PCtx extends Ctx { sentence: string; lex: DeLexiconView }

const normalize = (s: string): string => s.normalize('NFC').toLocaleLowerCase('de');
const set = (c: AnalysisCandidate | undefined, k: string): string[] => (c?.morph[k] ?? '').split(',').filter(Boolean);
const nounLike = (c: AnalysisCandidate | undefined): boolean => c?.pos === 'NOUN' || c?.pos === 'PROPN';
const verbal = (c: AnalysisCandidate | undefined): c is AnalysisCandidate => c?.pos === 'VERB' || c?.pos === 'AUX';
const finite = (c: AnalysisCandidate | undefined): c is AnalysisCandidate => verbal(c) && has(c, 'VerbForm', 'Fin') && !has(c, 'VerbForm', 'Part');
/** A verb that can only be finite: no infinitive or participle reading left in the union. */
const surelyFinite = (c: AnalysisCandidate | undefined): boolean => finite(c) && !has(c, 'VerbForm', 'Inf');
const pastParticiple = (c: AnalysisCandidate | undefined): boolean => verbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Tense', 'Past') && !has(c, 'VerbForm', 'Fin');
const subjectPronoun = (c: AnalysisCandidate | undefined): boolean => c?.pos === 'PRON' && has(c, 'PronType', 'Prs') && has(c, 'Case', 'Nom');
/** A personal pronoun that can only be a subject (ich, du, er, wir, ihr: not es, sie, which may be objects). */
const nominativeOnly = (c: AnalysisCandidate | undefined): boolean => subjectPronoun(c) && c?.morph.Case === 'Nom' && !c.unconfirmed;const sameClause = (p: Ctx, a: number, b: number): boolean => a >= 0 && b >= 0 && p.clauseOf[a] === p.clauseOf[b];

// ───────────────────────────── articles (a closed class, written out) ─────────────────────────────

const DEFINITE: Record<Kase, Record<Gender, string>> = {
  Nom: { m: 'der', f: 'die', n: 'das' }, Acc: { m: 'den', f: 'die', n: 'das' }, Dat: { m: 'dem', f: 'der', n: 'dem' }, Gen: { m: 'des', f: 'der', n: 'des' },
};
const EIN_ENDINGS: Record<Kase, Record<Gender, string>> = {
  Nom: { m: '', f: 'e', n: '' }, Acc: { m: 'en', f: 'e', n: '' }, Dat: { m: 'em', f: 'er', n: 'em' }, Gen: { m: 'es', f: 'er', n: 'es' },
};
const EIN_WORDS = new Set(['ein', 'kein', 'mein', 'dein', 'sein', 'ihr', 'unser']);

/** The singular form of an article of the given lemma (der, ein, kein, mein …) for a case and gender. */
function articleForm(lemma: string | undefined, kase: Kase, gender: Gender): string | undefined {
  if (lemma === 'der') return DEFINITE[kase][gender];
  if (lemma && EIN_WORDS.has(lemma)) return lemma + EIN_ENDINGS[kase][gender];
  return undefined;
}

const KASE_NAME: Record<Kase, string> = { Nom: 'nominative', Acc: 'accusative', Dat: 'dative', Gen: 'genitive' };
const GENDER_NAME: Record<Gender, string> = { m: 'masculine', f: 'feminine', n: 'neuter' };

/** A noun's gender from the lexicon (when every entry agrees), else from the reading. */
function nounGender(c: AnalysisCandidate, lex: DeLexiconView): Gender | undefined {
  if (c.lemma) {
    const genders = new Set(lex.nouns(normalize(c.lemma)).map((n) => n.gender));
    if (genders.size > 1) return undefined;
    if (genders.size === 1) {
      const g = [...genders][0];
      return g === 'm' || g === 'f' || g === 'n' ? g : undefined;
    }
  }
  return c.morph.Gender === 'Masc' ? 'm' : c.morph.Gender === 'Fem' ? 'f' : c.morph.Gender === 'Neut' ? 'n' : undefined;
}

/** The noun an article belongs to: the next word, skipping adjectives. */
function nounAfter(p: Ctx, i: number): number {
  let k = p.next(i);
  for (let guard = 0; guard < 3 && sameClause(p, i, k) && p.c(k)?.pos === 'ADJ'; guard++) k = p.next(k);
  return sameClause(p, i, k) && p.c(k)?.pos === 'NOUN' ? k : -1;
}

// ───────────────────────────── the checks ─────────────────────────────

function capitalisation(p: PCtx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    const cands = p.analyses[i]?.candidates ?? [];
    if (!t.isWord || !cands.length || !cands.every((c) => nounLike(c))) return;
    const first = t.surface[0];
    if (first === first.toLowerCase() && first !== first.toUpperCase()) {
      out.push({
        category: 'spelling', tokenIndexes: [i], confidence: 0.85, affectsMeaning: false,
        message: 'German nouns are written with a capital letter.',
        suggestion: { start: t.start, end: t.end, replacement: first.toUpperCase() + t.surface.slice(1) },
      });
    }
  });
  return out;
}

const CASE_NAME: Record<string, Kase> = { N: 'Nom', A: 'Acc', D: 'Dat', G: 'Gen' };
const GENDER_CODE: Record<string, Gender> = { Masc: 'm', Fem: 'f', Neut: 'n' };

/**
 * Every case / gender / number cell a determiner's written form can fill: the closed forms the lexicon lists for it, or,
 * when the lexicon lists none, the product of the reading's own sets (a superset: never narrower than the form).
 */
function determinerCells(p: PCtx, i: number, art: AnalysisCandidate): Array<{ c: string; g: string }> {
  const listed = p.lex.closed(p.tokens[i].normalized).filter((f) => f.pos === 'DET' && (!art.lemma || f.lemma === art.lemma)).flatMap((f) => f.cells ?? []);
  if (listed.length) return listed;
  const cases = set(art, 'Case');
  const genders = set(art, 'Gender').map((g) => GENDER_CODE[g]).filter(Boolean);
  const numbers = set(art, 'Number');
  const out: Array<{ c: string; g: string }> = [];
  for (const k of cases) {
    const code = Object.keys(CASE_NAME).find((x) => CASE_NAME[x] === k);
    if (!code) continue;
    if (!numbers.length || numbers.includes('Plur')) out.push({ c: code, g: 'p' });
    if (!numbers.length || numbers.includes('Sing')) for (const g of genders.length ? genders : (['m', 'f', 'n'] as Gender[])) out.push({ c: code, g });
  }
  return out;
}

/** The genders / number the noun itself leaves open: 'm' | 'f' | 'n' for the singular, 'p' for the plural. */
function nounSlots(nouns: AnalysisCandidate[], lex: DeLexiconView): Set<string> {
  const slots = new Set<string>();
  for (const noun of nouns) {
    const g = nounGender(noun, lex);
    const numbers = set(noun, 'Number');
    if (!numbers.length || numbers.includes('Plur')) slots.add('p');
    if (!numbers.length || numbers.includes('Sing')) for (const x of g ? [g] : (['m', 'f', 'n'] as Gender[])) slots.add(x);
  }
  return slots;
}

/** Every noun reading of token i, not only the chosen one: the phrase is judged on what ALL of them allow (Arme: der Arme or die Arme). */
function nounReadings(p: PCtx, i: number): AnalysisCandidate[] {
  const all = (p.analyses[i]?.candidates ?? []).filter((c) => c.pos === 'NOUN');
  return all.length ? all : [];
}

/** The plural article for the nominative / accusative (the dative plural needs the noun to change too: no suggestion). */
function pluralArticle(lemma: string | undefined, kase: Kase): string | undefined {
  if (kase !== 'Nom' && kase !== 'Acc') return undefined;
  if (lemma === 'der') return 'die';
  return lemma && EIN_WORDS.has(lemma) && lemma !== 'ein' ? `${lemma}e` : undefined;
}

/**
 * A determiner that cannot be in a case its preposition governs: mit den Mann → mit dem Mann. The determiner's own cells
 * are cut down to the noun's gender and number (the noun is what the article agrees with); when no governed case is left
 * the preposition and the phrase disagree. A two-way preposition (in, an, auf …) is silent unless neither the accusative
 * nor the dative is possible; a genitive preposition is silent (the dative is common in speech: wegen dem Wetter).
 */
function prepositionCase(p: PCtx, flagged: Set<number>): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    const c = p.c(i);
    if (!t.isWord || c?.pos !== 'ADP') return;
    const prep = p.lex.preposition(t.normalized) ?? (c.lemma ? p.lex.preposition(normalize(c.lemma)) : undefined);
    if (!prep || (prep.cases.length === 1 && prep.cases[0] === 'G')) return;
    const governed: string[] = prep.cases.filter((k) => k !== 'G');
    if (!governed.length) return;
    const ai = p.next(i);
    if (!sameClause(p, i, ai)) return;
    const art = p.c(ai);
    if (art?.pos !== 'DET') return;
    const ni = nounAfter(p, ai);
    const noun = ni >= 0 ? p.c(ni) : undefined;
    if (!noun || noun.unconfirmed) return;
    const slots = nounSlots(nounReadings(p, ni), p.lex);
    const cells = determinerCells(p, ai, art);
    // an article of another gender than the noun (die Mann) has no cell of the noun's: then every cell of the form counts
    const fitting = cells.filter((cell) => slots.has(cell.g));
    const left = fitting.length ? fitting : cells;
    if (!left.length || left.some((cell) => governed.includes(cell.c))) return;
    let suggestion: ErrorCandidate['suggestion'];
    let message: string;
    const at = p.tokens[ai];
    if (governed.length === 1) {
      const want = CASE_NAME[governed[0]];
      const only = [...slots];
      const fix = only.length === 1 ? (only[0] === 'p' ? pluralArticle(art.lemma, want) : articleForm(art.lemma, want, only[0] as Gender)) : undefined;
      if (fix) suggestion = { start: at.start, end: at.end, replacement: matchCase(at.surface, fix) };
      message = `"${t.surface}" takes the ${KASE_NAME[want]}: "${at.surface}" is not ${want === 'Acc' ? 'an' : 'a'} ${KASE_NAME[want]} form.`;
    } else {
      message = `"${t.surface}" takes the accusative or the dative: "${at.surface}" is neither.`;
    }
    flagged.add(ai);
    out.push({ category: 'case', tokenIndexes: [i, ai], confidence: suggestion ? 0.8 : 0.6, affectsMeaning: false, message, suggestion });
  });
  return out;
}

/** das Mann → der Mann: the article of another gender than the noun. */
function genderAgreement(p: PCtx, flagged: Set<number>): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    const art = p.c(i);
    if (!t.isWord || flagged.has(i) || art?.pos !== 'DET') return;
    const genders = set(art, 'Gender');
    const numbers = set(art, 'Number');
    if (!genders.length || (numbers.length > 0 && !numbers.includes('Sing'))) return;
    const ni = nounAfter(p, i);
    const noun = ni >= 0 ? p.c(ni) : undefined;
    if (!noun || !exact(noun, 'Number', 'Sing')) return;
    // every reading of the noun must be a singular of the same gender (Arme may be the plural of Arm)
    const readings = nounReadings(p, ni);
    if (readings.some((r) => !exact(r, 'Number', 'Sing') || nounGender(r, p.lex) !== nounGender(noun, p.lex))) return;
    const g = nounGender(noun, p.lex);
    if (!g) return;
    const name = g === 'm' ? 'Masc' : g === 'f' ? 'Fem' : 'Neut';
    if (genders.includes(name)) return;
    // the case the article stands in: what the article and the noun both allow
    const nounCases = set(noun, 'Case');
    const cases = set(art, 'Case').filter((k) => !nounCases.length || nounCases.includes(k)) as Kase[];
    const forms = new Set(cases.map((k) => articleForm(art.lemma, k, g)));
    const fix = forms.size === 1 ? [...forms][0] : undefined;
    out.push({
      category: 'agreement', tokenIndexes: [i, ni], confidence: fix ? 0.8 : 0.7, affectsMeaning: false,
      message: `"${t.surface}" does not fit "${p.tokens[ni].surface}", which is ${GENDER_NAME[g]}${fix ? `: ${fix} ${p.tokens[ni].surface}` : ''}.`,
      suggestion: fix ? { start: t.start, end: t.end, replacement: matchCase(t.surface, fix) } : undefined,
    });
  });
  return out;
}

/** Adverbs that open a main clause as its first element and cannot belong to the subject ("Heute ich gehe" is wrong; "Auch ich gehe" is not). */
const FRAME_ADVERBS = new Set([
  'heute', 'gestern', 'morgen', 'jetzt', 'dann', 'später', 'früher', 'bald', 'danach', 'davor', 'zuerst', 'schließlich', 'plötzlich', 'hier', 'dort',
  'draußen', 'drinnen', 'oben', 'unten', 'oft', 'manchmal', 'meistens', 'selten', 'normalerweise', 'leider', 'vielleicht', 'wahrscheinlich',
  'natürlich', 'trotzdem', 'deshalb', 'deswegen', 'darum', 'außerdem', 'inzwischen', 'mittlerweile',
]);

/** Heute ich gehe → Heute gehe ich. */
function verbSecond(p: PCtx): ErrorCandidate[] {
  const f = p.tokens.findIndex((t) => t.isWord);
  if (f < 0) return [];
  const s = p.next(f);
  const v = s >= 0 ? p.next(s) : -1;
  if (!sameClause(p, f, s) || !sameClause(p, f, v)) return [];
  const adv = p.c(f);
  if (adv?.pos !== 'ADV' || !FRAME_ADVERBS.has(normalize(adv.lemma ?? p.tokens[f].normalized))) return [];
  const verb = p.c(v);
  if (!subjectPronoun(p.c(s)) || !finite(verb) || has(verb, 'Mood', 'Imp')) return [];
  const [a, b, c] = [p.tokens[f], p.tokens[s], p.tokens[v]];
  const fixed = `${a.surface} ${c.surface} ${b.surface}`;
  return [{
    category: 'word-order', tokenIndexes: [f, s, v], confidence: 0.7, affectsMeaning: false,
    message: `In a main clause the conjugated verb is the second element: "${fixed}".`,
    suggestion: { start: a.start, end: c.end, replacement: fixed },
  }];
}

const SUBORDINATORS = new Set(['dass', 'weil', 'wenn', 'ob']);
const MODAL_LEMMAS = new Set(['können', 'müssen', 'wollen', 'sollen', 'dürfen', 'mögen', 'möchten']);

/** weil ich bin müde → weil ich müde bin. */
function verbFinal(p: PCtx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.clauses.forEach((cl) => {
    const ws = cl.words;
    ws.forEach((w, k) => {
      const sc = p.c(w);
      if (sc?.pos !== 'SCONJ' || !SUBORDINATORS.has(normalize(sc.lemma ?? p.tokens[w].normalized))) return;
      // the subject: a pronoun, or a noun phrase
      let j = k + 1;
      const first = p.c(ws[j]);
      if (subjectPronoun(first)) j += 1;
      else if (first && ['DET', 'ADJ', 'NOUN', 'PROPN'].includes(first.pos ?? '')) {
        while (p.c(ws[j]) && ['DET', 'ADJ', 'NUM'].includes(p.c(ws[j])!.pos ?? '')) j++;
        if (!nounLike(p.c(ws[j]))) return;
        j += 1;
      } else return;
      const verbIndex = ws[j];
      const verb = verbIndex === undefined ? undefined : p.c(verbIndex);
      if (!finite(verb) || has(verb, 'Mood', 'Imp')) return;
      const rest = ws.slice(j + 1);
      if (!rest.length) return;
      if (rest.some((r) => p.c(r)?.pos === 'SCONJ' || surelyFinite(p.c(r)))) return; // two clauses run together
      const verbs = rest.filter((r) => verbal(p.c(r)));
      if (verbs.length >= 2) return; // hätte … können: the double infinitive keeps the finite verb in front
      if (verbs.length === 1) {
        const last = p.c(rest[rest.length - 1]);
        const lemma = verb.lemma ?? '';
        const closes = verbal(last) && ((pastParticiple(last) && ['haben', 'sein', 'werden'].includes(lemma)) || (has(last, 'VerbForm', 'Inf') && (MODAL_LEMMAS.has(lemma) || lemma === 'werden')));
        if (!closes) return;
      }
      const joined = rest.some((r) => p.c(r)?.pos === 'CONJ');
      const vt = p.tokens[verbIndex];
      const from = p.tokens[rest[0]];
      const to = p.tokens[rest[rest.length - 1]];
      const replacement = `${p.sentence.slice(from.start, to.end)} ${vt.surface}`;
      const example = `${p.sentence.slice(p.tokens[w].start, vt.start)}${replacement}`;
      out.push({
        category: 'word-order', tokenIndexes: [w, verbIndex], confidence: joined ? 0.7 : 0.8, affectsMeaning: false,
        message: `After "${p.tokens[w].surface}" the conjugated verb goes to the end of its clause (in writing; speech often does otherwise): "${example}".`,
        suggestion: joined ? undefined : { start: vt.start, end: to.end, replacement },
      });
    });
  });
  return out;
}

// ── the auxiliaries of the perfect, by 'Tense Mood' and then person and number (1s 2s 3s 1p 2p 3p)
const SEIN_FORMS: Record<string, string[]> = {
  'Pres Ind': ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'],
  'Past Ind': ['war', 'warst', 'war', 'waren', 'wart', 'waren'],
  'Past Sub': ['wäre', 'wärst', 'wäre', 'wären', 'wärt', 'wären'],
};
const HABEN_FORMS: Record<string, string[]> = {
  'Pres Ind': ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'],
  'Past Ind': ['hatte', 'hattest', 'hatte', 'hatten', 'hattet', 'hatten'],
  'Past Sub': ['hätte', 'hättest', 'hätte', 'hätten', 'hättet', 'hätten'],
};

/**
 * The form of the other auxiliary for the same person, number, tense and mood, when every possibility of the reading gives
 * the same form. A present that is the same in the indicative and Konjunktiv I (habe: Ind,Sub) is read as the indicative.
 */
function otherAuxiliary(a: AnalysisCandidate, table: Record<string, string[]>): string | undefined {
  const pres = has(a, 'Tense', 'Pres') && !has(a, 'Tense', 'Past');
  const past = has(a, 'Tense', 'Past') && !has(a, 'Tense', 'Pres');
  const ind = has(a, 'Mood', 'Ind');
  const sub = has(a, 'Mood', 'Sub');
  const mood = ind && (!sub || pres) ? 'Ind' : sub && !ind ? 'Sub' : undefined;
  const tense = pres ? 'Pres' : past ? 'Past' : undefined;
  const forms = tense && mood ? table[`${tense} ${mood}`] : undefined;
  if (!forms) return undefined;
  const persons = set(a, 'Person');
  const numbers = set(a, 'Number');
  if (!persons.length || !numbers.length) return undefined;
  const found = new Set<string | undefined>();
  for (const n of numbers) for (const pe of persons) found.add(forms[(n === 'Plur' ? 3 : 0) + Number(pe) - 1]);
  return found.size === 1 ? [...found][0] : undefined;
}

/** A word of the clause that can be a direct object (accusative) and is not the object of a preposition. */
function hasAccusativeObject(p: PCtx, ws: number[], skip: number[]): boolean {
  return ws.some((w) => {
    const c = p.c(w);
    if (skip.includes(w) || !c || !['DET', 'NOUN', 'PRON', 'PROPN'].includes(c.pos ?? '') || !has(c, 'Case', 'Acc')) return false;
    const before = p.prev(w);
    return !(before >= 0 && sameClause(p, w, before) && ['ADP', 'DET', 'ADJ'].includes(p.c(before)?.pos ?? ''));
  });
}

/**
 * The wrong auxiliary of the perfect: ich habe gegangen → ich bin gegangen, ich bin das Buch gelesen → ich habe das Buch
 * gelesen. The lexicon must list ONE auxiliary for the verb (a verb listed with both stays silent). Haben where the verb
 * takes sein stays silent when a direct object is there (fahren is both); sein where the verb takes haben needs a
 * personal-pronoun subject and a direct object (otherwise it is a state: Ich bin überzeugt, Die Tür ist geöffnet).
 */
function perfectAuxiliary(p: PCtx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.clauses.forEach((cl) => {
    const ws = cl.words;
    if (ws.some((w) => p.tokens[w].normalized === 'worden')) return; // ist gebaut worden: a perfect passive (geworden is the perfect of werden)
    const participles = ws.filter((w) => pastParticiple(p.c(w)));
    if (participles.length !== 1) return;
    const pi = participles[0];
    const pc = p.c(pi)!;
    if (pc.unconfirmed || !pc.lemma) return;
    // every participle reading counts: gefallen is the participle of fallen (sein) and of gefallen (haben)
    const lemmas = new Set((p.analyses[pi]?.candidates ?? []).filter((c) => verbal(c) && has(c, 'VerbForm', 'Part') && c.lemma).map((c) => normalize(c.lemma!)));
    const verbs = [...lemmas].flatMap((l) => p.lex.verb(l));
    const auxes = new Set(verbs.map((v) => v.aux));
    if (auxes.size !== 1 || auxes.has('haben/sein')) return;
    const needs = [...auxes][0];
    ws.forEach((w, pos) => {
      const a = p.c(w);
      if (!finite(a) || a.unconfirmed || has(a, 'Mood', 'Imp') || (a.lemma !== 'haben' && a.lemma !== 'sein') || a.lemma === needs) return;
      const object = hasAccusativeObject(p, ws, [w, pi]);
      if (needs === 'sein' && object) return; // fahren, fliegen … with an object take haben
      if (needs === 'haben') {
        const before = pos > 0 ? p.c(ws[pos - 1]) : undefined;
        if (!object || !nominativeOnly(before)) return;
      }
      const form = otherAuxiliary(a, needs === 'sein' ? SEIN_FORMS : HABEN_FORMS);
      const t = p.tokens[w];
      out.push({
        category: 'conjugation', tokenIndexes: [w, pi], confidence: form ? 0.85 : 0.75, affectsMeaning: false,
        message: `"${p.tokens[pi].surface}" makes its perfect with ${needs}, not ${a.lemma}${form ? `: "${form} ${p.tokens[pi].surface}"` : ''}.`,
        suggestion: form ? { start: t.start, end: t.end, replacement: matchCase(t.surface, form) } : undefined,
      });
    });
  });
  return out;
}

/** Ich aufstehe um sechs → Ich stehe um sechs auf. */
function separableTogether(p: PCtx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.clauses.forEach((cl) => {
    const ws = cl.words;
    const s = p.c(ws[0])?.pos === 'CONJ' ? 1 : 0;
    const first = p.c(ws[s]);
    const vi = ws[s + 1];
    const verb = vi === undefined ? undefined : p.c(vi);
    const frontOk = subjectPronoun(first) || first?.pos === 'PROPN' || (first?.pos === 'ADV' && !has(first, 'PronType', 'Int') && !has(first, 'PronType', 'Rel'));
    if (!frontOk || !finite(verb) || has(verb, 'Mood', 'Imp') || !verb.lemma) return;
    const prefix = verb.parts?.find((x) => x.kind === 'prefix');
    const stem = verb.parts?.find((x) => x.kind === 'stem');
    if (!prefix || !stem) return;
    // facts: the lexicon says the prefix separates and the verb has no inseparable twin
    const entries = p.lex.verb(normalize(verb.lemma));
    if (!entries.length || !entries.every((e) => e.prefix !== undefined && normalize(e.prefix) === normalize(prefix.text))) return;
    if (p.lex.prefixKind(normalize(prefix.text)) !== 'separable') return;
    // the rest of the clause, up to a conjunction or another conjugated verb
    const rest: number[] = [];
    for (const r of ws.slice(s + 2)) {
      const c = p.c(r);
      if (c?.pos === 'CONJ' || c?.pos === 'SCONJ' || finite(c)) break;
      rest.push(r);
    }
    const t = p.tokens[vi];
    const noVerbsInRest = !rest.some((r) => verbal(p.c(r)));
    const end = rest.length ? p.tokens[rest[rest.length - 1]].end : t.end;
    const middle = rest.length ? ` ${p.sentence.slice(p.tokens[rest[0]].start, end)}` : '';
    const replacement = `${stem.text}${middle} ${prefix.text}`;
    const example = `${p.sentence.slice(p.tokens[ws[s]].start, t.start)}${replacement}`;
    out.push({
      category: 'word-order', tokenIndexes: [vi], confidence: noVerbsInRest ? 0.85 : 0.7, affectsMeaning: false,
      message: `${verb.lemma} is a separable verb: in a main clause the prefix goes to the end: "${example}".`,
      suggestion: noVerbsInRest ? { start: t.start, end, replacement } : undefined,
    });
  });
  return out;
}

const PERSON_NAME: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const FINITE_TENSES = ['pres', 'pret', 'subj1', 'subj2'] as const;
const SLOTS = ['1s', '2s', '3s', '1p', '2p', '3p'] as const;
const slotName = (slot: string): string => `${PERSON_NAME[slot[0]]} person ${slot[1] === 's' ? 'singular' : 'plural'}`;

/**
 * What the verb's own paradigm says about a written finite form and the subject pronoun's slot ("2s"): undefined when the
 * paradigm is not available or the written form is not one of the verb's finite forms (then nothing is said); `ok` when the
 * form is right for the slot (any tense or Konjunktiv); otherwise the slots the written form does belong to and the
 * indicative form the learner meant when the tense is clear.
 */
function paradigmVerdict(p: PCtx, vi: number, slot: string): { ok: true } | { ok: false; belongs: string[]; fix?: string } | undefined {
  const verb = p.c(vi);
  const entries = verb?.lemma ? p.lex.verb(normalize(verb.lemma)) : [];
  if (entries.length !== 1) return undefined;
  let conj: ReturnType<typeof conjugateGerman>;
  try { conj = conjugateGerman(entries[0]); } catch { return undefined; }
  const formOf = (key: string): string | undefined => {
    const f = conj.split ? conj.split[key]?.[0] : conj.forms[key];
    return f === undefined ? undefined : normalize(f);
  };
  const written = p.tokens[vi].normalized;
  if (FINITE_TENSES.some((t) => formOf(`${t}.${slot}`) === written)) return { ok: true };
  const matches: string[][] = [];
  for (const t of FINITE_TENSES) for (const s of SLOTS) if (formOf(`${t}.${s}`) === written) matches.push([t, s]);
  if (!matches.length) return undefined;
  const indicative = matches.filter(([t]) => t === 'pres' || t === 'pret');
  const shown = indicative.length ? indicative : matches;
  const tenses = new Set(indicative.map(([t]) => t));
  const fix = tenses.size === 1 ? conj.split ? conj.split[`${[...tenses][0]}.${slot}`]?.[0] : conj.forms[`${[...tenses][0]}.${slot}`] : undefined;
  return { ok: false, belongs: [...new Set(shown.map(([, s]) => s))], fix };
}

/**
 * ich geht, du gehen, er gehen, wir geht: the verb form cannot belong to the personal pronoun that is its subject, directly
 * before it or directly after it. The verb's own paradigm decides (so a form that is two persons at once is still caught);
 * without a paradigm the reading's Person and Number sets decide. Silent for sie / Sie / es (not decided as subjects), for
 * a coordinated subject, for an imperative, and whenever the verb reading is only a guess.
 */
function subjectVerbAgreement(p: PCtx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  const seen = new Set<string>();
  const pairs: Array<[number, number]> = [];
  p.tokens.forEach((t, i) => {
    if (!t.isWord) return;
    const nx = p.next(i);
    if (nx < 0 || !sameClause(p, i, nx)) return;
    if (nominativeOnly(p.c(i))) pairs.push([i, nx]); // ich geht
    if (finite(p.c(i)) && nominativeOnly(p.c(nx))) pairs.push([nx, i]); // geht ich
  });
  for (const [i, vi] of pairs) {
    if (seen.has(`${i},${vi}`)) continue;
    seen.add(`${i},${vi}`);
    const pron = p.c(i)!;
    const verb = p.c(vi);
    if (!finite(verb) || verb.unconfirmed || has(verb, 'Mood', 'Imp') || !pron.morph.Person || !pron.morph.Number) continue;
    if (pron.morph.Person.includes(',') || pron.morph.Number.includes(',')) continue;
    // a coordinated subject: "er und ich gehen", "ich und du"
    const around = [p.prev(Math.min(i, vi)), p.next(Math.max(i, vi))].filter((k) => k >= 0);
    if (around.some((k) => sameClause(p, k, i) && p.c(k)?.pos === 'CONJ' && Math.abs(k - i) <= 1)) continue;
    const slot = `${pron.morph.Person}${pron.morph.Number === 'Sing' ? 's' : 'p'}`;
    const verdict = paradigmVerdict(p, vi, slot);
    const t = p.tokens[i];
    const vt = p.tokens[vi];
    const pronounIs = `${PERSON_NAME[pron.morph.Person]} person ${pron.morph.Number === 'Sing' ? 'singular' : 'plural'}`;
    if (verdict) {
      if (verdict.ok) continue;
      const belongs = verdict.belongs.map((s) => slotName(s)).join(' / ');
      out.push({
        category: 'agreement', tokenIndexes: [Math.min(i, vi), Math.max(i, vi)], confidence: verdict.fix ? 0.85 : 0.75, affectsMeaning: false,
        message: `"${t.surface}" is ${pronounIs}, but "${vt.surface}" is a ${belongs} form: the verb ending has to match the subject${verdict.fix ? ` ("${verdict.fix}")` : ''}.`,
        suggestion: verdict.fix ? { start: vt.start, end: vt.end, replacement: matchCase(vt.surface, verdict.fix) } : undefined,
      });
      continue;
    }
    // no paradigm: the reading's own sets, when it is a confirmed one
    const persons = set(verb, 'Person');
    const numbers = set(verb, 'Number');
    const wrongPerson = persons.length > 0 && !persons.includes(pron.morph.Person);
    const wrongNumber = numbers.length > 0 && !numbers.includes(pron.morph.Number);
    if (!wrongPerson && !wrongNumber) continue;
    const shown = (list: string[]) => list.map((x) => PERSON_NAME[x] ?? x.toLowerCase()).join(' / ');
    const verbIs = `${persons.length ? `${shown(persons)} person ` : ''}${numbers.length ? numbers.map((x) => x.toLowerCase().replace('sing', 'singular').replace('plur', 'plural')).join(' / ') : ''}`.trim();
    out.push({
      category: 'agreement', tokenIndexes: [Math.min(i, vi), Math.max(i, vi)], confidence: 0.8, affectsMeaning: false,
      message: `"${t.surface}" is ${pronounIs}, but "${vt.surface}" is a ${verbIs} form: the verb ending has to match the subject.`,
    });
  }
  return out;
}

/** The ending of an attributive adjective after an article, when article, case and gender are decided. */
function adjectiveEndingFor(art: AnalysisCandidate): string | undefined {
  const definite = exact(art, 'Definite', 'Def');
  const indefinite = exact(art, 'Definite', 'Ind') || exact(art, 'Poss', 'Yes');
  if (!definite && !indefinite) return undefined;
  const cases = set(art, 'Case') as Kase[];
  if (!cases.length) return undefined;
  if (exact(art, 'Number', 'Plur')) return 'en';
  if (!exact(art, 'Number', 'Sing')) return undefined;
  const genders = set(art, 'Gender');
  const endings = new Set<string | undefined>();
  for (const kase of cases) {
    if (kase === 'Dat' || kase === 'Gen') { endings.add('en'); continue; }
    for (const g of genders) {
      if (g !== 'Masc' && g !== 'Fem' && g !== 'Neut') { endings.add(undefined); continue; }
      if (definite) endings.add(kase === 'Acc' && g === 'Masc' ? 'en' : 'e');
      else if (g === 'Fem') endings.add('e');
      else if (g === 'Neut') endings.add('es');
      else endings.add(kase === 'Nom' ? 'er' : 'en');
    }
    if (!genders.length) endings.add(undefined);
  }
  return endings.size === 1 ? [...endings][0] : undefined; // only when every possibility gives the same ending
}

/** der gut Mann → der gute Mann. */
function adjectiveWithoutEnding(p: PCtx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    const art = p.c(i);
    if (!t.isWord || art?.pos !== 'DET') return;
    const ai = p.next(i);
    const ni = ai >= 0 ? p.next(ai) : -1;
    if (!sameClause(p, i, ai) || !sameClause(p, i, ni)) return;
    const adj = p.c(ai);
    if (adj?.pos !== 'ADJ' || !adj.lemma || set(adj, 'VerbForm').length || p.c(ni)?.pos !== 'NOUN') return;
    if (p.tokens[ai].normalized !== normalize(adj.lemma)) return; // already has an ending
    const known = p.lex.adjective(normalize(adj.lemma));
    if (!known || known.indeclinable) return;
    const ending = adjectiveEndingFor(art);
    const at = p.tokens[ai];
    const fixed = ending ? matchCase(at.surface, `${normalize(known.stem ?? adj.lemma)}${ending}`) : undefined;
    out.push({
      category: 'morphology', tokenIndexes: [i, ai, ni], confidence: fixed ? 0.8 : 0.7, affectsMeaning: false,
      message: `An adjective between article and noun needs an ending: "${at.surface}" ${fixed ? `→ "${fixed}"` : `before "${p.tokens[ni].surface}"`}.`,
      suggestion: fixed ? { start: at.start, end: at.end, replacement: fixed } : undefined,
    });
  });
  return out;
}

/** Spellings from before the 1996 reform and their modern form. */
const OLD_SPELLING: Record<string, string> = {
  daß: 'dass', muß: 'muss', mußt: 'musst', mußte: 'musste', mußten: 'mussten', mußtest: 'musstest', läßt: 'lässt', laß: 'lass',
  gewußt: 'gewusst', wußte: 'wusste', wußten: 'wussten', wißt: 'wisst', haß: 'hass', fluß: 'fluss', schluß: 'schluss', kuß: 'kuss',
  naß: 'nass', paß: 'pass', schloß: 'schloss', bißchen: 'bisschen', eß: 'ess', eßt: 'esst', gerißen: 'gerissen', biß: 'biss',
};

/** daß, muß … in new writing: a gentle note, since the learner may be copying an older text. */
function oldSpelling(p: PCtx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  p.tokens.forEach((t, i) => {
    const modern = t.isWord ? OLD_SPELLING[normalize(t.surface)] : undefined;
    if (!modern) return;
    out.push({
      category: 'spelling', tokenIndexes: [i], confidence: 0.5, affectsMeaning: false,
      message: `Today this is written "${modern}" (ß only after a long vowel; ${t.surface} is the spelling from before 1996). Ignore this if you are copying an older text.`,
      suggestion: { start: t.start, end: t.end, replacement: matchCase(t.surface, modern) },
    });
  });
  return out;
}

const NOT_NEGATION_OF_EIN = new Set(['bisschen', 'paar', 'wenig', 'mal', 'einmal', 'einziges', 'einzige', 'einziger', 'einzigen', 'einzigem']);

/** Ich habe nicht ein Auto → Ich habe kein Auto. */
function keinForNichtEin(p: PCtx): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  if (p.tokens.some((t) => t.isWord && t.normalized === 'sondern')) return out; // "nicht ein Auto, sondern zwei"
  p.tokens.forEach((t, i) => {
    if (!t.isWord || t.normalized !== 'nicht') return;
    const ei = p.next(i);
    if (!sameClause(p, i, ei) || p.tokens[ei].start - t.end > 3) return;
    const ein = p.c(ei);
    if (ein?.pos !== 'DET' || ein.lemma !== 'ein') return;
    const ni = nounAfter(p, ei);
    if (ni < 0) return;
    const after = p.next(ei);
    if (NOT_NEGATION_OF_EIN.has(p.tokens[after].normalized)) return;
    const kein = `k${p.tokens[ei].surface}`;
    out.push({
      category: 'syntax', tokenIndexes: [i, ei], confidence: 0.75, affectsMeaning: false,
      message: `Before a noun with "ein" (or none) German negates with kein, not "nicht ein": "${kein} ${p.tokens[ni].surface}".`,
      suggestion: { start: t.start, end: p.tokens[ei].end, replacement: kein },
    });
  });
  return out;
}

/** The checks over one sentence; `sentence` is the text the token offsets refer to. */
export function checkGermanProduction(tokens: RawToken[], analyses: AnalyzedToken[], sentence: string, lex: DeLexiconView): ErrorCandidate[] {
  const p: PCtx = { ...makeCtx(tokens, analyses), sentence, lex };
  const flagged = new Set<number>();
  const out = [
    ...capitalisation(p), ...prepositionCase(p, flagged), ...genderAgreement(p, flagged), ...verbSecond(p), ...verbFinal(p),
    ...perfectAuxiliary(p), ...separableTogether(p), ...subjectVerbAgreement(p), ...adjectiveWithoutEnding(p), ...oldSpelling(p),
    ...keinForNichtEin(p),
  ];
  return out.sort((a, b) => Math.min(...a.tokenIndexes) - Math.min(...b.tokenIndexes));
}
