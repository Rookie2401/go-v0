/**
 * Checks on a learner's own French: a few CERTAIN, rule-based checks, each with a short learner-facing message and, where it is
 * safe, a suggestion. Machine-drafted, not checked by a native speaker. An empty result means "nothing found", never "correct":
 * the checks do not read meaning, style or most grammar. A rule that is not certain is left out (a lone `ne` without `pas` is NOT
 * flagged: literary French has it; the number of an article and its noun is reported without a suggestion, because the rules cannot
 * tell which of the two the learner meant).
 *
 * The checks:
 *  1. a missing elision (le homme → l'homme, je ai → j'ai, de un → d'un, que il → qu'il, si il → s'il, ne a → n'a, ce est → c'est),
 *     never before an h aspiré (the next word's reading has `notes.hAspire`) or before onze, oui, yaourt;
 *  2. a missing contraction (à le → au, à les → aux, de le → du, de les → des), only when a noun follows (à le voir is correct);
 *  3. an article, demonstrative or possessive that does not match a noun whose gender the word list gives as a single value
 *     (le maison → la maison, ce homme → cet homme, cet garçon → ce garçon, ma amie → mon amie), and a mismatch of number;
 *  4. a subject pronoun and a finite verb of another person or number (je es → je suis, tu a → tu as, nous mange → nous mangeons);
 *  5. a verb of the être group conjugated with avoir in a compound tense (j'ai allé → je suis allé).
 */
import type { AnalyzedToken, AnalysisCandidate, ErrorCandidate, PartOfSpeech, RawToken } from '../../core';
import { matchCase, type LexEntry } from '../shared';
import type { FrAnnotation } from './types';
import { ETRE_VERBS } from './verb-irregular';
import { conjugateFrench } from './verbs';

/** What the checks may ask the word list (kept out of this file so it does not import fr.ts). */
export interface ProductionLexicon {
  find(lemma: string, pos?: PartOfSpeech): LexEntry | undefined;
  annotation(lemma: string, pos: PartOfSpeech): FrAnnotation | undefined;
}

const set = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

/** The elided form of each word that elides, and what it may elide before. */
const ELIDES: Record<string, string> = {
  le: 'l\'', la: 'l\'', je: 'j\'', me: 'm\'', te: 't\'', se: 's\'', de: 'd\'', ne: 'n\'', que: 'qu\'', si: 's\'', ce: 'c\'',
  jusque: 'jusqu\'', lorsque: 'lorsqu\'', puisque: 'puisqu\'', quoique: 'quoiqu\'',
};
/** si elides only before il and ils; ce only before a form of être that begins with a vowel. */
const SI_BEFORE = set('il ils');
const CE_BEFORE = set('est était étaient');
/** Words that begin with a vowel letter but take no elision (and h-words that are aspirated, as a safety net beside the word list's own tag). */
const NO_ELISION = set('onze onzième oui ouistiti ouate yaourt yogourt yoyo yucca yacht yeuse');
const H_ASPIRE_FALLBACK = set('haricot héros hibou hasard hauteur haut haute hache haine halle hamac hanche hangar harpe hareng harem héraut hérisson hêtre heurter hocher homard hongrois hurler huit huitième hublot huppe housse hockey handicap honte hollandais hiérarchie hamster hanter hardi harceler harnais hasarder hâte hâtif hurlement hutte');
const VOWEL_START = /^[aeiouyàâäéèêëîïôöùûüœæ]/u;

const DEF = {
  le: { g: 'Masc', n: 'Sing', kind: 'def' }, la: { g: 'Fem', n: 'Sing', kind: 'def' }, les: { n: 'Plur', kind: 'def' },
  un: { g: 'Masc', n: 'Sing', kind: 'indef' }, une: { g: 'Fem', n: 'Sing', kind: 'indef' }, des: { n: 'Plur', kind: 'indef' },
  ce: { g: 'Masc', n: 'Sing', kind: 'dem' }, cet: { g: 'Masc', n: 'Sing', kind: 'dem' }, cette: { g: 'Fem', n: 'Sing', kind: 'dem' }, ces: { n: 'Plur', kind: 'dem' },
  mon: { n: 'Sing', kind: 'mon' }, ma: { g: 'Fem', n: 'Sing', kind: 'mon' }, mes: { n: 'Plur', kind: 'mon' },
  ton: { n: 'Sing', kind: 'ton' }, ta: { g: 'Fem', n: 'Sing', kind: 'ton' }, tes: { n: 'Plur', kind: 'ton' },
  son: { n: 'Sing', kind: 'son' }, sa: { g: 'Fem', n: 'Sing', kind: 'son' }, ses: { n: 'Plur', kind: 'son' },
} as const satisfies Record<string, { g?: 'Masc' | 'Fem'; n: 'Sing' | 'Plur'; kind: string }>;
type DetForm = keyof typeof DEF;

/** Subject pronouns with the person and number they ask of the verb. */
const SUBJECTS: Record<string, { p: string; n: string }> = {
  je: { p: '1', n: 'Sing' }, 'j\'': { p: '1', n: 'Sing' }, tu: { p: '2', n: 'Sing' }, il: { p: '3', n: 'Sing' }, elle: { p: '3', n: 'Sing' }, on: { p: '3', n: 'Sing' },
  nous: { p: '1', n: 'Plur' }, vous: { p: '2', n: 'Plur' }, ils: { p: '3', n: 'Plur' }, elles: { p: '3', n: 'Plur' },
};
/** What may stand before nous or vous for it to be a subject (otherwise it is probably an object: il vous parle). */
const SUBJECT_CONTEXT = set('et mais ou que qu\' puis donc quand lorsque lorsqu\' si s\' comme où parce car puisque puisqu\'');
const PERSON_WORDS: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const NUMBER_WORDS: Record<string, string> = { Sing: 'singular', Plur: 'plural' };
const GENDER_WORDS: Record<string, string> = { Masc: 'masculine', Fem: 'feminine' };

const q = (s: string): string => `“${s}”`;

export function checkFrenchProduction(tokens: RawToken[], analyses: AnalyzedToken[], _sentence: string, lex: ProductionLexicon): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  const seen = new Set<string>();
  const push = (e: ErrorCandidate): void => {
    const key = `${e.category}|${e.tokenIndexes.join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  const n = tokens.length;
  const norm = (i: number): string => tokens[i]?.normalized ?? '';
  const isWord = (i: number): boolean => i >= 0 && i < n && !!tokens[i]!.isWord;
  const first = (i: number): AnalysisCandidate | undefined => analyses[i]?.candidates[0];
  /** The token is written separately from the next (a space between them): the elision was not written. */
  const spaced = (i: number): boolean => isWord(i) && isWord(i + 1) && tokens[i + 1]!.start > tokens[i]!.end;
  /** A hyphen right before the token: a clitic after its verb (donne-le, dit-il), where none of the checks below apply. */
  const afterHyphen = (i: number): boolean => i > 0 && !tokens[i - 1]!.isWord && /^[-‐‑]$/u.test(tokens[i - 1]!.surface) && tokens[i - 1]!.end === tokens[i]!.start;
  /** The word begins with a vowel sound: true / false, or undefined when the rules cannot tell (an h-word the list does not know). */
  const vowelSound = (i: number): boolean | undefined => {
    const w = norm(i);
    if (!w || NO_ELISION.has(w) || /^ou[aeiéèïî]/u.test(w) || (w.startsWith('y') && w !== 'y' && w !== 'yeux')) return false;
    if (VOWEL_START.test(w)) return true;
    if (!w.startsWith('h')) return false;
    const cands = analyses[i]?.candidates ?? [];
    if (H_ASPIRE_FALLBACK.has(w) || cands.some((c) => c.notes?.hAspire === 'yes' || (c.lemma && c.pos && lex.annotation(c.lemma, c.pos)?.hAspire))) return false;
    // a mute h is claimed only for a word the list really knows
    const c = cands[0];
    return c && c.origin === 'hand' && c.unconfirmed !== true && (c.confidence ?? 0) >= 0.7 ? true : undefined;
  };
  const replace = (from: number, to: number, text: string): ErrorCandidate['suggestion'] => ({ start: tokens[from]!.start, end: tokens[to]!.end, replacement: text });

  // ── 1. a missing elision ──
  for (let i = 0; i + 1 < n; i++) {
    const w = norm(i);
    const elided = ELIDES[w];
    if (!elided || !spaced(i) || afterHyphen(i)) continue;
    const next = norm(i + 1);
    if (w === 'si' && !SI_BEFORE.has(next)) continue;
    if (w === 'ce' && !CE_BEFORE.has(next)) continue;
    if (vowelSound(i + 1) !== true) continue;
    // "de" and "ne" before y: d'y is not French; only the pronouns take y
    if (next === 'y' && (w === 'de' || w === 'le' || w === 'la' || w === 'que' || w === 'ce' || w === 'si')) continue;
    const written = matchCase(tokens[i]!.surface, elided) + tokens[i + 1]!.surface;
    push({
      category: 'spelling', tokenIndexes: [i, i + 1], confidence: w === 'si' || w === 'ce' ? 0.9 : 0.88, affectsMeaning: false,
      message: `Before a vowel sound ${q(tokens[i]!.surface)} is shortened: write ${q(written)}.`,
      suggestion: replace(i, i + 1, written),
    });
  }

  // ── 2. a missing contraction: à le → au, à les → aux, de le → du, de les → des ──
  for (let i = 0; i + 2 < n; i++) {
    const w = norm(i);
    const art = norm(i + 1);
    if ((w !== 'à' && w !== 'de') || (art !== 'le' && art !== 'les') || !spaced(i) || !spaced(i + 1) || !isWord(i + 2) || afterHyphen(i + 1)) continue;
    if (afterHyphen(i)) continue;
    // the noun that the article belongs to: directly after it, or after one adjective
    const a = first(i + 2);
    const b = first(i + 3);
    const nounish = (a?.pos === 'NOUN' && a.unconfirmed !== true) || (a?.pos === 'ADJ' && isWord(i + 3) && b?.pos === 'NOUN');
    const pronounUse = (analyses[i + 2]?.candidates ?? []).some((c) => (c.pos === 'VERB' || c.pos === 'AUX') && c.morph.VerbForm === 'Inf');
    if (!nounish || pronounUse) continue;
    // before a vowel sound l' is the right form (à l'école), and the elision check speaks; les never elides (aux enfants)
    if (art === 'le' && vowelSound(i + 2) !== false) continue;
    const joined = w === 'à' ? (art === 'le' ? 'au' : 'aux') : (art === 'le' ? 'du' : 'des');
    push({
      category: 'morphology', tokenIndexes: [i, i + 1], confidence: 0.9, affectsMeaning: false,
      message: `${q(`${tokens[i]!.surface} ${tokens[i + 1]!.surface}`)} contracts to ${q(joined)} before a noun.`,
      suggestion: replace(i, i + 1, matchCase(tokens[i]!.surface, joined)),
    });
  }

  // ── 3. an article, demonstrative or possessive against its noun ──
  const nounInfo = (i: number): { gender: 'Masc' | 'Fem'; number?: 'Sing' | 'Plur'; lemma: string } | undefined => {
    const c = first(i);
    if (!c || c.pos !== 'NOUN' || !c.lemma || c.unconfirmed === true) return undefined;
    const cands = analyses[i]?.candidates ?? [];
    // a word that is also a verb, an adjective or a pronoun may be read another way (le porte): not judged
    if (cands.some((x) => x.pos === 'VERB' || x.pos === 'AUX' || x.pos === 'ADJ' || x.pos === 'PRON' || x.pos === 'ADV')) return undefined;
    const entry = lex.find(c.lemma, 'NOUN');
    if (!entry) return undefined;
    const genders = new Set(entry.forms.flatMap((f) => (f.morph.Gender ?? '').split(',')).filter(Boolean));
    if (genders.size !== 1) return undefined;
    const gender = [...genders][0] as 'Masc' | 'Fem';
    const numbers = (c.morph.Number ?? '').split(',').filter(Boolean);
    return { gender, ...(numbers.length === 1 ? { number: numbers[0] as 'Sing' | 'Plur' } : {}), lemma: c.lemma };
  };
  for (let i = 0; i + 1 < n; i++) {
    const w = norm(i) as DetForm;
    const d = DEF[w];
    if (!d || !spaced(i) || afterHyphen(i) || first(i)?.pos !== 'DET') continue;
    const noun = nounInfo(i + 1);
    if (!noun) continue;
    const written = tokens[i + 1]!.surface;
    const vowel = vowelSound(i + 1);
    // number first: the rules cannot tell which of the two words the learner meant, so no suggestion
    if (noun.number && noun.number !== d.n) {
      push({
        category: 'agreement', tokenIndexes: [i, i + 1], confidence: 0.7, affectsMeaning: false,
        message: `${q(tokens[i]!.surface)} is ${NUMBER_WORDS[d.n]} but ${q(written)} is ${NUMBER_WORDS[noun.number]}: the article and the noun must agree in number.`,
      });
      continue;
    }
    if (d.n !== 'Sing') continue;
    let expected: string | undefined;
    let why = '';
    if (d.kind === 'def' || d.kind === 'indef') {
      if (d.kind === 'def' && vowel !== false) continue; // l' before a vowel: the elision check speaks
      expected = d.kind === 'def' ? (noun.gender === 'Masc' ? 'le' : 'la') : (noun.gender === 'Masc' ? 'un' : 'une');
      why = `${q(written)} is ${GENDER_WORDS[noun.gender]}`;
    } else if (d.kind === 'dem') {
      if (noun.gender === 'Fem') expected = 'cette';
      else if (vowel === true) expected = 'cet';
      else if (vowel === false) expected = 'ce';
      why = noun.gender === 'Fem' ? `${q(written)} is feminine` : `${q(written)} is masculine and begins with ${vowel ? 'a vowel sound' : 'a consonant sound'}`;
    } else {
      const base = d.kind;
      const fem = base === 'mon' ? 'ma' : base === 'ton' ? 'ta' : 'sa';
      if (noun.gender === 'Masc') expected = base;
      else if (vowel === true) expected = base;
      else if (vowel === false) expected = fem;
      why = noun.gender === 'Masc' ? `${q(written)} is masculine` : `${q(written)} is feminine${vowel ? ' but begins with a vowel sound, so mon, ton, son are used' : ''}`;
    }
    if (!expected || expected === w) continue;
    push({
      category: 'agreement', tokenIndexes: [i, i + 1], confidence: d.kind === 'def' || d.kind === 'indef' ? 0.85 : 0.82, affectsMeaning: false,
      message: `${why}, so write ${q(`${expected} ${written}`)}, not ${q(`${tokens[i]!.surface} ${written}`)}.`,
      suggestion: replace(i, i, matchCase(tokens[i]!.surface, expected)),
    });
  }

  // ── 4. a subject pronoun and a verb of another person or number ──
  /** The forms of a lemma with the wanted person, number and the tense and mood of the verb the learner wrote; the one form they all give. */
  const verbFormFor = (c: AnalysisCandidate, persons: string[], numbers: string[]): string | undefined => {
    const lemma = c.lemma;
    if (!lemma || (c.pos !== 'VERB' && c.pos !== 'AUX')) return undefined;
    const pool = lex.find(lemma, c.pos)?.forms ?? [];
    const known = lex.find(lemma) !== undefined;
    const tryPool = (forms: ReadonlyArray<{ form: string; morph: Record<string, string> }>): string | undefined => {
      const found = new Set<string>();
      for (const p of persons) for (const nn of numbers) {
        const hit = forms.filter((f) => f.morph.VerbForm === 'Fin' && f.morph.Mood === c.morph.Mood && (f.morph.Tense ?? '') === (c.morph.Tense ?? '') && (f.morph.Person ?? '').split(',').includes(p) && (f.morph.Number ?? '').split(',').includes(nn));
        if (hit.length !== 1) return undefined;
        found.add(hit[0]!.form);
      }
      return found.size === 1 ? [...found][0] : undefined;
    };
    return tryPool(pool) ?? (known ? tryPool(conjugateFrench(lemma)?.forms ?? []) : undefined);
  };
  for (let i = 0; i + 1 < n; i++) {
    const subj = SUBJECTS[norm(i)];
    if (!subj || !isWord(i) || afterHyphen(i)) continue;
    // nous and vous are also object pronouns: only where a subject is likely
    if (norm(i) === 'nous' || norm(i) === 'vous') {
      const prev = [...Array(i).keys()].reverse().find((k) => isWord(k) || /[.!?;:,«»"“”—–()]/u.test(tokens[k]!.surface));
      if (prev !== undefined && isWord(prev) && !SUBJECT_CONTEXT.has(norm(prev))) continue;
    }
    let j = i + 1;
    if (isWord(j) && (norm(j) === 'ne' || norm(j) === 'n\'')) j++;
    if (!isWord(j) || afterHyphen(j)) continue;
    const cands = analyses[j]?.candidates ?? [];
    const fin = cands.filter((c) => (c.pos === 'VERB' || c.pos === 'AUX') && c.morph.VerbForm === 'Fin');
    const lead = fin[0];
    if (!lead || lead.unconfirmed === true || (lead.confidence ?? 0) < 0.6) continue;
    const fits = fin.some((c) => (c.morph.Person ?? '').split(',').includes(subj.p) && (c.morph.Number ?? '').split(',').includes(subj.n));
    if (fits) continue;
    // a word that is mostly something else (a noun after a pronoun that is really an object) is not judged
    if (cands.some((c) => (c.pos === 'NOUN' || c.pos === 'ADJ') && (c.confidence ?? 0) >= (lead.confidence ?? 0))) continue;
    const want = verbFormFor(lead, [subj.p], [subj.n]);
    const hasPerson = (lead.morph.Person ?? '').split(',').filter(Boolean).map((p) => PERSON_WORDS[p] ?? p);
    const hasNumber = (lead.morph.Number ?? '').split(',').filter(Boolean).map((p) => NUMBER_WORDS[p] ?? p);
    push({
      category: 'conjugation', tokenIndexes: [i, j], confidence: want ? 0.8 : 0.7, affectsMeaning: false,
      message: `${q(tokens[i]!.surface)} needs the ${PERSON_WORDS[subj.p]} person ${NUMBER_WORDS[subj.n]} form of the verb, but ${q(tokens[j]!.surface)} is ${hasPerson.length ? `the ${hasPerson.join(' or ')} person ${hasNumber.join('/') || ''}`.trim() : 'another form'}${want ? `: ${q(want)}` : ''}.`,
      // je + a verb form that begins with a vowel is written with the elision (je a → j'ai)
      ...(want ? { suggestion: j === i + 1 && norm(i) === 'je' && spaced(i) && /^[aeiouàâäéèêëîïôöùûüœæ]/u.test(want)
        ? replace(i, j, `${matchCase(tokens[i]!.surface, 'j\'')}${want}`)
        : replace(j, j, matchCase(tokens[j]!.surface, want)) } : {}),
    });
  }

  // ── 5. a verb of the être group conjugated with avoir ──
  const etre = lex.find('être', 'AUX') ?? lex.find('être');
  const etreFor = (c: AnalysisCandidate): string | undefined => {
    if (!etre) return undefined;
    const persons = (c.morph.Person ?? '').split(',').filter(Boolean);
    const numbers = (c.morph.Number ?? '').split(',').filter(Boolean);
    if (!persons.length || !numbers.length) return undefined;
    const found = new Set<string>();
    for (const p of persons) for (const nn of numbers) {
      const hit = etre.forms.filter((f) => f.morph.VerbForm === 'Fin' && f.morph.Mood === c.morph.Mood && (f.morph.Tense ?? '') === (c.morph.Tense ?? '') && (f.morph.Person ?? '').split(',').includes(p) && (f.morph.Number ?? '').split(',').includes(nn));
      if (hit.length !== 1) return undefined;
      found.add(hit[0]!.form);
    }
    return found.size === 1 ? [...found][0] : undefined;
  };
  const ADVERBS = set('pas jamais déjà bien encore toujours souvent vite enfin');
  for (let i = 0; i < n; i++) {
    const aux = first(i);
    if (!isWord(i) || !aux || aux.lemma !== 'avoir' || aux.pos !== 'AUX' || aux.morph.VerbForm !== 'Fin') continue;
    let j = i + 1;
    while (isWord(j) && ADVERBS.has(norm(j)) && j - i <= 3) j++;
    if (!isWord(j)) continue;
    const part = first(j);
    if (!part || (part.pos !== 'VERB' && part.pos !== 'AUX') || part.morph.VerbForm !== 'Part' || part.morph.Tense !== 'Past' || !part.lemma || part.unconfirmed === true) continue;
    // être only: the word list's tag, or the verbs the engine lists as taking être alone; "être or avoir" verbs (sortir, monter) are not judged
    const tag = part.notes?.auxiliary;
    const strict = tag === 'être' || (tag === undefined && ETRE_VERBS.has(part.lemma) && lex.annotation(part.lemma, part.pos)?.aux !== 'both');
    if (!strict) continue;
    // the participle must not be a plain adjective or noun that follows avoir (j'ai arrivé is wrong; il a sorti is not judged)
    const subjectAt = i > 0 && /^(?:j'|je)$/u.test(norm(i - 1)) && !afterHyphen(i - 1) ? i - 1 : -1;
    const want = etreFor(aux);
    const message = `${q(part.lemma)} is conjugated with être, not avoir, in the compound tenses${want ? `: ${q(`${subjectAt >= 0 ? 'je ' : ''}${want} ${tokens[j]!.surface}`)}` : ''}.`;
    const written = subjectAt >= 0 && want ? `${matchCase(tokens[subjectAt]!.surface, 'je')} ${want}` : want ? matchCase(tokens[i]!.surface, want) : undefined;
    push({
      category: 'conjugation', tokenIndexes: [i, j], confidence: want ? 0.85 : 0.75, affectsMeaning: false, message,
      ...(want && written ? { suggestion: replace(subjectAt >= 0 ? subjectAt : i, i, written) } : {}),
    });
  }

  // one learner slip can trip two checks (je es: the elision j'es and the verb form suis): the verb form is the answer, so the
  // elision suggestion that overlaps another suggestion is dropped
  const overlaps = (a: NonNullable<ErrorCandidate['suggestion']>, b: NonNullable<ErrorCandidate['suggestion']>): boolean => a.start < b.end && b.start < a.end;
  const kept = out.filter((e) => !(e.category === 'spelling' && e.suggestion && out.some((o) => o !== e && o.suggestion && o.category !== 'spelling' && overlaps(e.suggestion!, o.suggestion))));
  return kept.sort((a, b) => a.tokenIndexes[0]! - b.tokenIndexes[0]! || a.category.localeCompare(b.category));
}
