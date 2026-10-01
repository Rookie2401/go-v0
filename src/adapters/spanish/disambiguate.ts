/**
 * Which reading of a written form is meant here? A small set of rules over the neighbouring words, for the cases
 * that a learner meets on every page: a noun that is also a verb form (la pregunta / —pregunta Marvin; las tiendas /
 * tiendas), an adjective that is also a verb form (está llena / llena la jarra), a participle after haber, and the
 * pairs that share a spelling (fue: ser or ir; sé: saber or ser; siento: sentir or sentar; como: como or comer).
 *
 * What it is: an ordering of readings the analysis already has. The chosen reading moves to the front and keeps
 * its own confidence; the others stay, below it, and `notes.context` says which neighbour decided. Nothing is
 * invented and nothing is removed, so a wrong choice is still one tap away from the right one on the word sheet.
 * What it is not: a parser. It reads one word to the left, at most two, and one to the right; where those do not
 * decide, the order is left as it was. Machine-drafted rules, not checked by a native speaker; measured on the
 * course's own texts only (see docs/spanish/STATUS.md).
 */
import type { AnalysisCandidate, RawToken } from '../../core';

type C = AnalysisCandidate;

const isVerbal = (c: C): boolean => c.pos === 'VERB' || c.pos === 'AUX';
const isParticiple = (c: C): boolean => isVerbal(c) && c.morph.VerbForm === 'Part';
/** A conjugated form. The older hand paradigms carry person and tense without VerbForm. */
const isFinite = (c: C): boolean =>
  isVerbal(c) && (c.morph.VerbForm === 'Fin' || (c.morph.VerbForm === undefined && (c.morph.Person !== undefined || c.morph.Tense !== undefined || c.morph.Mood !== undefined)));
const isImperative = (c: C): boolean => c.morph.Mood === 'Imp';
/** Conjugated and not a command: what follows a subject, "no" or an object pronoun. */
const isStatement = (c: C): boolean => isFinite(c) && !isImperative(c);
const hasPerson = (c: C, p: string): boolean => (c.morph.Person ?? '').split(',').includes(p);
const hasNumber = (c: C, n: string | undefined): boolean => n === undefined || c.morph.Number === undefined || c.morph.Number.split(',').includes(n);
const hasGender = (c: C, g: string | undefined): boolean => g === undefined || c.morph.Gender === undefined || c.morph.Gender.split(',').includes(g);
const kindOf = (c: C): string => `${c.lemma}|${c.pos}`;

const SUBJECTS: Record<string, { person: string; number: string }> = {
  yo: { person: '1', number: 'Sing' }, 'tú': { person: '2', number: 'Sing' }, vos: { person: '2', number: 'Sing' },
  'él': { person: '3', number: 'Sing' }, ella: { person: '3', number: 'Sing' }, usted: { person: '3', number: 'Sing' },
  nosotros: { person: '1', number: 'Plur' }, nosotras: { person: '1', number: 'Plur' },
  vosotros: { person: '2', number: 'Plur' }, vosotras: { person: '2', number: 'Plur' },
  ellos: { person: '3', number: 'Plur' }, ellas: { person: '3', number: 'Plur' }, ustedes: { person: '3', number: 'Plur' },
};
/** Object pronouns that stand only before a conjugated verb (la, los, las, lo are also articles: handled apart). */
const PROCLITICS = new Set(['me', 'te', 'se', 'nos', 'os', 'le', 'les']);
const REFLEXIVES = new Set(['me', 'te', 'se', 'nos', 'os']);
const ARTICLE_OR_PRONOUN: Record<string, { gender?: string; number: string }> = {
  la: { gender: 'Fem', number: 'Sing' }, las: { gender: 'Fem', number: 'Plur' }, los: { gender: 'Masc', number: 'Plur' },
};
const DETERMINERS = new Set([
  'el', 'un', 'una', 'unos', 'unas', 'al', 'del', 'mi', 'mis', 'tu', 'tus', 'su', 'sus',
  'nuestro', 'nuestra', 'nuestros', 'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella', 'aquellos', 'aquellas',
  'cada', 'otro', 'otra', 'otros', 'otras', 'mucho', 'mucha', 'muchos', 'muchas', 'poco', 'poca', 'pocos', 'pocas',
  'todo', 'toda', 'todos', 'todas', 'algún', 'alguna', 'algunos', 'algunas', 'ningún', 'ninguna', 'varios', 'varias',
  'tanto', 'tanta', 'tantos', 'tantas', 'ambos', 'ambas', 'qué', 'cuánto', 'cuánta', 'cuántos', 'cuántas',
]);
const PREPOSITIONS = new Set(['a', 'de', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'hacia', 'contra', 'según', 'tras', 'durante', 'ante']);
/** Words that stand directly before a conjugated verb. After the first group any person; after the second not "tú" forms (también casas). */
const NEGATIVES = new Set(['no', 'nunca', 'tampoco', 'jamás']);
const PREVERBAL = new Set(['ya', 'también', 'siempre']);
const SUBORDINATORS = new Set(['que', 'donde', 'dónde', 'cuando', 'porque', 'si', 'aunque', 'mientras']);
const COPULAS = new Set(['ser', 'estar', 'parecer', 'quedar', 'seguir', 'resultar']);
/** Adverbs that may stand between a copula or haber and what it governs: estaba casi llena, había ya pasado. */
const DEGREE = new Set(['muy', 'casi', 'tan', 'más', 'menos', 'bastante', 'ya', 'todavía', 'demasiado', 'siempre', 'nunca', 'también']);
/** After fue, fueron …: a place or direction means "went". */
const GOING = new Set(['a', 'al', 'hacia', 'hasta', 'allí', 'allá', 'acá', 'aquí', 'adentro', 'afuera', 'arriba', 'abajo', 'lejos']);
const OUTINGS = new Set(['compras', 'viaje', 'vacaciones', 'paseo', 'visita', 'pesca', 'caza']);
const FEELING_NEXT = new Set(['bien', 'mal', 'mejor', 'peor', 'muy', 'tan', 'más', 'que', 'como', 'mucho', 'frío', 'calor', 'hambre', 'sed', 'miedo', 'alegría', 'tristeza', 'dolor', 'pena']);
const SITTING_NEXT = new Set(['en', 'a', 'al', 'con', 'junto', 'cerca', 'aquí', 'allí', 'allá', 'ahí', 'y', 'para', 'frente', 'delante', 'detrás', 'entre', 'sobre']);
const COME_HERE = new Set(['a', 'al', 'aquí', 'acá', 'conmigo', 'con', 'y', 'pronto', 'ya', 'tú', 'vos']);
const KNOWING_NEXT = new Set(['que', 'qué', 'dónde', 'cómo', 'cuándo', 'quién', 'cuál', 'si', 'por', 'nada', 'algo', 'mucho', 'poco']);
const NOT_EATING_NEXT =new Set(['si', 'antes', 'siempre', 'cuando', 'nunca']);

interface Around {
  /** The word directly before (no punctuation between), and the one before that. */
  prev?: number;
  prev2?: number;
  next?: number;
  /** A dialogue dash stands directly before this word, with words before it in the sentence and no colon introducing speech. */
  reporting: boolean;
}

function around(i: number, tokens: RawToken[]): Around {
  const word = (j: number): number | undefined => (j >= 0 && j < tokens.length && tokens[j].isWord ? j : undefined);
  const prev = word(i - 1);
  const prev2 = prev !== undefined ? word(prev - 1) : undefined;
  const next = word(i + 1);
  let reporting = false;
  if (prev === undefined && i > 0 && /^[—–]$/u.test(tokens[i - 1].surface.trim())) {
    const before = tokens[i - 2];
    reporting = !!before && before.surface.trim() !== ':' && tokens.slice(0, i - 1).some((t) => t.isWord);
  }
  return { prev, prev2, next, reporting };
}

/**
 * The candidates of token i, reordered where the neighbours decide; the same array when they do not.
 * `base` is the context-free analysis of every token of the sentence (best first).
 */
export function disambiguateSpanish(i: number, tokens: RawToken[], base: C[][]): C[] {
  const cands = base[i];
  if (cands.length < 2) return cands;
  const w = tokens[i].normalized;
  const { prev, prev2, next, reporting } = around(i, tokens);
  const form = (j: number | undefined): string | undefined => (j === undefined ? undefined : tokens[j].normalized);
  const top = (j: number | undefined): C | undefined => (j === undefined ? undefined : base[j][0]);
  const any = (j: number | undefined, pred: (c: C) => boolean): boolean => j !== undefined && base[j].some(pred);
  const hasLemma = (lemma: string): boolean => cands.some((c) => c.lemma === lemma);
  const p = form(prev);
  const n = form(next);

  /**
   * Readings that satisfy `pred` first, in their order; the rest after them. A neighbour that decides marks the rest
   * down; a fallback (`usual`: nothing around the word decided, this is only the commoner reading) leaves them as they were.
   */
  const choose = (pred: (c: C) => boolean, why: string, usual = false): C[] | undefined => {
    const yes = cands.filter(pred);
    if (yes.length === 0) return undefined;
    const no = cands.filter((c) => !pred(c));
    const first: C = { ...yes[0], notes: { ...(yes[0].notes ?? {}), context: why } };
    return [first, ...yes.slice(1), ...(usual ? no : no.map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.4) })))];
  };

  // ── pairs that share a spelling ──
  if (w === 'sé' && hasLemma('saber') && hasLemma('ser')) {
    const command = prev === undefined && top(next)?.pos === 'ADJ';
    if (command) return choose((c) => c.lemma === 'ser', 'before an adjective, at the start: a command') ?? cands;
    // "no sé", "yo sé", "lo sé", "sé que …", "sé dónde …": the neighbours say it is saber; alone it is only the usual reading
    const knowing = (p !== undefined && (NEGATIVES.has(p) || PREVERBAL.has(p) || p === 'yo' || p === 'lo' || p === 'la' || p === 'me')) || (n !== undefined && KNOWING_NEXT.has(n));
    return choose((c) => c.lemma === 'saber', knowing ? 'after "no", its subject or an object pronoun, or before what is known: "I know"' : 'the usual reading: "I know"', !knowing) ?? cands;
  }
  if (hasLemma('ser') && hasLemma('ir') && cands.every((c) => c.lemma === 'ser' || c.lemma === 'ir')) {
    const clockTime = n === 'a' && ['la', 'las'].includes(tokens[(next as number) + 1]?.normalized ?? '') && base[(next as number) + 2]?.[0]?.pos === 'NUM';
    const outing = n === 'de' && OUTINGS.has(tokens[(next as number) + 1]?.normalized ?? '');
    const going = (p !== undefined && REFLEXIVES.has(p)) || (n !== undefined && GOING.has(n) && !clockTime) || outing;
    if (going) return choose((c) => c.lemma === 'ir', 'a place or direction follows, or a reflexive pronoun stands before: "went"') ?? cands;
    // fue un buen día, fue muy bonita, fue encontrado: what it was follows
    const being = n !== undefined && (DETERMINERS.has(n) || !!ARTICLE_OR_PRONOUN[n] || DEGREE.has(n) || ['ADJ', 'NUM'].includes(top(next)?.pos ?? '') || any(next, isParticiple));
    return choose((c) => c.lemma === 'ser', being ? 'what it was follows: "was"' : 'no place or direction follows: the usual reading, "was"', !being) ?? cands;
  }
  if (w === 'como' && hasLemma('comer')) {
    const afterNegative = p !== undefined && (NEGATIVES.has(p) || PREVERBAL.has(p)) && n !== undefined && !SUBJECTS[n] && top(next)?.pos !== 'PROPN' && !NOT_EATING_NEXT.has(n);
    const eating = p === 'yo' || (p !== undefined && (PROCLITICS.has(p) || ['lo', 'la', 'los', 'las'].includes(p))) || afterNegative;
    return (eating ? choose((c) => c.lemma === 'comer', 'after its subject, an object pronoun or "no": "I eat"') : choose((c) => c.lemma !== 'comer', 'no subject or "no" before it: the usual reading, "like, as"', true)) ?? cands;
  }
  if (hasLemma('sentir') && hasLemma('sentar')) {
    const feeling = p === 'lo' || (n !== undefined && (FEELING_NEXT.has(n) || top(next)?.pos === 'ADJ'));
    const sitting = p !== undefined && REFLEXIVES.has(p) && (n === undefined || SITTING_NEXT.has(n));
    if (feeling) return choose((c) => c.lemma === 'sentir', 'a feeling or "lo" beside it: sentir') ?? cands;
    if (sitting) return choose((c) => c.lemma === 'sentar' && isStatement(c), 'reflexive, with a place after it: sentarse') ?? cands;
    if (w === 'siento') return choose((c) => c.lemma === 'sentir', 'the usual reading: sentir', true) ?? cands;
  }
  // ve / ven: a command (go! come!) at the start, before a place; otherwise a form of ver
  if ((w === 've' || w === 'ven') && cands.some(isImperative) && cands.some(isStatement) && prev === undefined && !reporting) {
    const command = n === undefined || COME_HERE.has(n);
    return (command ? choose((c) => isImperative(c) && c.lemma !== 'ver', 'at the start, before a place: a command') : choose(isStatement, 'an object follows: a form of ver')) ?? cands;
  }

  // junto a la ventana: the locution, not the adjective
  if (w === 'junto' && (n === 'a' || n === 'al')) return choose((c) => c.pos === 'ADV', '"junto a": beside') ?? cands;
  // yo solo quería … (only) against un solo sábado, está solo (single, alone)
  if (w === 'solo' && cands.some((c) => c.pos === 'ADV') && cands.some((c) => c.pos === 'ADJ')) {
    const beforeVerb = next !== undefined && base[next].length > 0 && base[next].every(isVerbal) && base[next].some(isFinite);
    const afterCopula = any(prev, (c) => isVerbal(c) && COPULAS.has(c.lemma ?? ''));
    if (beforeVerb && !afterCopula) return choose((c) => c.pos === 'ADV', 'before a conjugated verb: "only"') ?? cands;
    if (afterCopula || (p !== undefined && DETERMINERS.has(p))) return choose((c) => c.pos === 'ADJ', 'after a determiner or ser/estar: "single, alone"') ?? cands;
  }

  const verbal = cands.filter(isVerbal);
  const other = cands.filter((c) => !isVerbal(c));
  if (verbal.length === 0) return cands;
  const kinds = new Set(cands.map(kindOf));
  const mixedMood = verbal.some(isImperative) && verbal.some(isStatement);
  if (kinds.size < 2 && !mixedMood) return cands;

  // ── the word before governs ──
  // haber + participle (había pasado, he pecado), an adverb between allowed
  const governor = p !== undefined && DEGREE.has(p) && prev2 !== undefined ? prev2 : prev;
  if (any(governor, (c) => c.lemma === 'haber' && isVerbal(c)) && form(governor) !== 'hay') {
    const r = choose(isParticiple, 'after haber: a participle');
    if (r) return r;
  }
  // ser / estar + adjective (está llena, estaba cansada, es tarde)
  if (other.length > 0 && any(governor, (c) => isVerbal(c) && COPULAS.has(c.lemma ?? ''))) {
    const r = choose((c) => c.pos === 'ADJ', 'after ser or estar: an adjective') ?? choose((c) => !isVerbal(c), 'after ser or estar: not a verb');
    if (r) return r;
  }
  // —pregunta Marvin: the reporting verb after a dialogue dash
  if (reporting && next !== undefined) {
    const r = choose((c) => isStatement(c) && hasPerson(c, '3'), 'after a dialogue dash, before the speaker: the reporting verb');
    if (r) return r;
  }
  if (p !== undefined) {
    const subject = SUBJECTS[p];
    if (subject) {
      const r = choose((c) => isStatement(c) && hasPerson(c, subject.person) && hasNumber(c, subject.number), `after its subject "${p}": a verb`);
      if (r) return r;
    }
    if (PROCLITICS.has(p)) {
      const r = choose(isStatement, `after the pronoun "${p}": a verb`);
      if (r) return r;
    }
    if (NEGATIVES.has(p)) {
      const r = choose(isStatement, `after "${p}": a verb`);
      if (r) return r;
    }
    if (PREVERBAL.has(p)) {
      const r = choose((c) => isStatement(c) && c.morph.Mood !== 'Sub' && !hasPerson(c, '2'), `after "${p}": a verb`);
      if (r) return r;
    }
    if (other.length > 0 && (DETERMINERS.has(p) || top(prev)?.pos === 'NUM')) {
      const r = choose((c) => !isVerbal(c), `after "${p}": a noun or adjective`);
      if (r) return r;
    }
    if (p === 'lo') {
      const r = choose(isStatement, 'after the pronoun "lo": a verb') ?? choose((c) => !isVerbal(c), 'after "lo": not a verb');
      if (r) return r;
    }
    const article = ARTICLE_OR_PRONOUN[p];
    if (article) {
      // Juan la llama (subject, pronoun, verb) against la llama (article, noun)
      const p2 = form(prev2);
      const subjectBefore = prev2 !== undefined && (!!SUBJECTS[p2 as string] || NEGATIVES.has(p2 as string) || top(prev2)?.pos === 'PROPN');
      const nominal = (c: C) => !isVerbal(c) && hasGender(c, article.gender) && hasNumber(c, article.number);
      const r = subjectBefore
        ? choose(isStatement, `a subject, then the pronoun "${p}": a verb`)
        : choose(nominal, `after the article "${p}": a noun or adjective`);
      if (r) return r;
      // "los casa": a noun that does not agree with the article may be a verb after a pronoun or a learner's slip —
      // the neighbours do not say which, so the order is left alone (the writing check reports the disagreement)
      if (other.length > 0) return cands;
    }
    if (PREPOSITIONS.has(p)) {
      const r = choose((c) => !isFinite(c), `after the preposition "${p}": not a conjugated verb`);
      if (r) return r;
    }
    if (SUBORDINATORS.has(p)) {
      const r = choose(isStatement, `after "${p}": a verb`);
      if (r) return r;
    }
    const before = top(prev);
    const name = before?.pos === 'PROPN' || (base[prev as number].length === 0 && /^\p{Lu}/u.test(tokens[prev as number].surface) && tokens.slice(0, prev).some((t) => t.isWord));
    if (before?.pos === 'ADJ' && other.length > 0) {
      // la niña pequeña cocina arroz: noun, adjective, then a verb with its object; otherwise an adjective stands before its noun
      const third = (c: C) => isStatement(c) && hasPerson(c, '3') && hasNumber(c, before.morph.Number);
      const r = (top(prev2)?.pos === 'NOUN' && next !== undefined ? choose(third, 'after a noun and its adjective, with an object after it: a verb') : undefined)
        ?? choose((c) => !isVerbal(c), `after the adjective "${p}": a noun`);
      if (r) return r;
    }
    if (before?.pos === 'NOUN' || name) {
      const number = name ? undefined : before?.morph.Number;
      const third = (c: C) => isStatement(c) && hasPerson(c, '3') && hasNumber(c, number);
      const adjective = (c: C) => c.pos === 'ADJ' && hasNumber(c, number) && hasGender(c, name ? undefined : before?.morph.Gender);
      const canBeVerb = cands.some(third);
      const canBeAdjective = cands.some(adjective);
      if (canBeVerb && canBeAdjective) {
        // la abuela llena la jarra / la jarra llena: an object after it makes it the verb
        const objectFollows = n !== undefined && (DETERMINERS.has(n) || !!ARTICLE_OR_PRONOUN[n] || n === 'a' || ['NUM', 'PROPN'].includes(top(next)?.pos ?? ''));
        const r = objectFollows ? choose(third, 'after its subject, with an object after it: a verb') : choose(adjective, `after the noun "${p}": an adjective`);
        if (r) return r;
      } else if (canBeVerb) {
        const r = choose(third, `after its subject "${tokens[prev as number].surface}": a verb`);
        if (r) return r;
      } else if (canBeAdjective) {
        const r = choose(adjective, `after the noun "${p}": an adjective`);
        if (r) return r;
      }
    }
    // tiene trabajo, buscó trabajo, hagamos preguntas: after a conjugated verb comes its object, not another conjugated verb
    if (other.length > 0 && base[prev as number].length > 0 && base[prev as number].every(isVerbal) && base[prev as number].some(isFinite)) {
      const r = choose((c) => !isFinite(c), 'after a conjugated verb: its object or complement');
      if (r) return r;
    }
  }

  // ── nothing decided: a noun or adjective the word list knows goes before a "tú" form or a command (tiendas, calles, plantas) ──
  const known = (c: C) => !isVerbal(c) && (c.origin === 'hand' || c.notes?.lemmaStatus === 'in the word list');
  if (isVerbal(cands[0]) && (hasPerson(cands[0], '2') || isImperative(cands[0])) && verbal.every((c) => hasPerson(c, '2') || isImperative(c)) && other.some(known)) {
    const yes = cands.filter(known);
    return [...yes, ...cands.filter((c) => !known(c))];
  }
  return cands;
}
