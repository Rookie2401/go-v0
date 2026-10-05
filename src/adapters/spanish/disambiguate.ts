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
 *
 * Readings of unequal standing. When a dictionary is installed the importer puts its readings of another lemma or
 * part of speech BESIDE the adapter's own (es: also the plural of the letter e; la: also a note of the scale; para:
 * also a form of parar). Those are the rarer readings of a word the course list already explains, so a neighbour
 * moves one in front of the adapter's own reading only when it leaves no room for that reading (`Cue`): a "weak" cue
 * (an adjective before it, a noun before it, a sentence that opens with it) orders readings of one standing and no
 * more; a function word's own reading (de, la, es, dos, que) yields only to a cue that is "certain".
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

/**
 * How much a neighbour says: "weak" — the likelier reading among equals; "strong" — the other readings do not fit
 * here; "certain" — nothing else can stand here (a verb after me / te / se).
 */
type Cue = 'weak' | 'strong' | 'certain';
const CUE: Record<Cue, number> = { weak: 1, strong: 2, certain: 3 };
/** Parts of speech of the function words: their word-list reading is the reading nearly every time. */
const FUNCTION_POS = new Set(['DET', 'PRON', 'ADP', 'CONJ', 'SCONJ', 'NUM', 'AUX']);
/** A reading the adapter's own data vouches for (the word list, or a rule on a word-list lemma). */
const isOwn = (c: C): boolean => c.origin !== 'dictionary' && c.unconfirmed !== true;
/**
 * May a cue of this weight put `c` first in `list`? Always among readings of one standing. A dictionary's reading
 * needs a strong cue to go in front of a reading of the adapter's own, and a certain one when that is a function word.
 */
function mayLead(list: C[], c: C, cue: Cue): boolean {
  const head = list[0];
  if (c.origin !== 'dictionary' || !head || !isOwn(head)) return true;
  return CUE[cue] >= (head.origin === 'hand' && FUNCTION_POS.has(head.pos ?? '') ? CUE.certain : CUE.strong);
}

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
/** Determiners that only a noun phrase can follow: the articles and the possessives (la, las, los are also pronouns: handled apart). */
const ARTICLES = new Set([
  'el', 'un', 'una', 'unos', 'unas', 'al', 'del', 'mi', 'mis', 'tu', 'tus', 'su', 'sus',
  'nuestro', 'nuestra', 'nuestros', 'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras',
]);
/** Quantifiers that do not stand before a conjugated verb as its subject (todos cantan, otros dicen, esta canta do): cada día, mucho gusto. */
const NOUN_QUANTIFIERS = new Set(['cada', 'algún', 'ningún', 'mucho', 'mucha', 'poco', 'poca', 'tanto', 'tanta']);
const PREPOSITIONS = new Set(['a', 'de', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'hacia', 'contra', 'según', 'tras', 'durante', 'ante']);
/** Words that stand directly before a conjugated verb. After the first group any person; after the second not "tú" forms (también casas). */
const NEGATIVES = new Set(['no', 'nunca', 'tampoco', 'jamás']);
const PREVERBAL = new Set(['ya', 'también', 'siempre', 'aún', 'todavía']);
const SUBORDINATORS = new Set(['que', 'donde', 'dónde', 'cuando', 'porque', 'si', 'aunque', 'mientras']);
const COPULAS = new Set(['ser', 'estar', 'parecer', 'quedar', 'seguir', 'resultar']);
/** Copulas that take a quality, not a bare noun: está cansado, parece joven (ser takes both: es joven, es médico). */
const QUALITY_COPULAS = new Set(['estar', 'parecer', 'quedar', 'resultar']);
/** Adverbs that may stand between a copula or haber and what it governs: estaba casi llena, había ya pasado. */
const DEGREE = new Set(['muy', 'casi', 'tan', 'más', 'menos', 'bastante', 'ya', 'todavía', 'demasiado', 'siempre', 'nunca', 'también']);
/** After fue, fueron …: a place or direction means "went". */
const GOING = new Set(['a', 'al', 'hacia', 'hasta', 'allí', 'allá', 'acá', 'aquí', 'adentro', 'afuera', 'arriba', 'abajo', 'lejos']);
const OUTINGS = new Set(['compras', 'viaje', 'vacaciones', 'paseo', 'visita', 'pesca', 'caza']);
const FEELING_NEXT = new Set(['bien', 'mal', 'mejor', 'peor', 'muy', 'tan', 'más', 'que', 'como', 'mucho', 'frío', 'calor', 'hambre', 'sed', 'miedo', 'alegría', 'tristeza', 'dolor', 'pena']);
const SITTING_NEXT = new Set(['en', 'a', 'al', 'con', 'junto', 'cerca', 'aquí', 'allí', 'allá', 'ahí', 'y', 'para', 'frente', 'delante', 'detrás', 'entre', 'sobre']);
const COME_HERE = new Set(['a', 'al', 'aquí', 'acá', 'conmigo', 'con', 'y', 'pronto', 'ya', 'tú', 'vos']);
const KNOWING_NEXT = new Set(['que', 'qué', 'dónde', 'cómo', 'cuándo', 'quién', 'cuál', 'si', 'por', 'nada', 'algo', 'mucho', 'poco']);
const NOT_EATING_NEXT = new Set(['si', 'antes', 'siempre', 'cuando', 'nunca']);
/** Words of degree that stand before an adjective or adverb: muy alto, bien bonito, tan lejos. */
const INTENSIFIERS = new Set(['muy', 'tan', 'más', 'menos', 'bien', 'bastante', 'demasiado', 'súper', 'super', 're', 'algo', 'poco', 'medio', 'casi']);
/** Those of them that never stand before a noun (más pollo, bastante dinero, poco tiempo do): after these a quality is the only reading. */
const ONLY_DEGREE = new Set(['muy', 'tan', 'súper', 'super', 're', 'medio']);
/** Words that may stand between "lo" and its adjective: lo más importante, lo poco bueno. */
const LO_DEGREE = new Set(['más', 'menos', 'muy', 'poco', 'bien', 'tan']);
/** Words that are a preposition before a noun phrase and something else elsewhere: bajo la mesa, salvo Ana, menos Juan. */
const ALSO_PREPOSITION = new Set(['bajo', 'salvo', 'menos', 'excepto', 'sobre', 'entre', 'contra', 'tras', 'ante', 'según', 'durante', 'mediante', 'hacia']);
/** What may follow a verb that opens a sentence: its complement. Sal de aquí, Prueba a ver, Sueño con volver. */
const AFTER_OPENING_VERB = new Set(['de', 'a', 'al', 'con', 'en', 'por', 'para', 'que']);
/** A dictionary's gloss for an abbreviation, the name of a letter or a note of the scale: seldom the reading of a small-letter word in running text. */
const LETTER_NAME = /^(abbreviation|initialism|acronym|clipping) of |\b(name of the (Latin[- ]script )?(letter|digraph)|the letter [A-Za-z]\b|musical note|note of the scale|(second|third|fourth|fifth|sixth|seventh) note\b)/i;

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
  const dash = prev === undefined ? dashEndingAt(i - 1, tokens) : undefined;
  if (dash !== undefined) {
    const before = tokens[dash - 1];
    reporting = !!before && before.surface.trim() !== ':' && tokens.slice(0, dash).some((t) => t.isWord);
  }
  return { prev, prev2, next, reporting };
}

/**
 * The dialogue dash whose last token is token `j`: — or –, or the two hyphens that plain-text editions write for it
 * (--dijo, as in Project Gutenberg). The index of its first token; undefined when token `j` does not end one.
 */
function dashEndingAt(j: number, tokens: RawToken[]): number | undefined {
  const t = tokens[j];
  if (!t) return undefined;
  if (/^[—–]$/u.test(t.surface.trim())) return j;
  const p = tokens[j - 1];
  return t.surface === '-' && p?.surface === '-' && p.end === t.start ? j - 1 : undefined;
}

/**
 * Written with a capital where a sentence does not begin: after a word, a comma or a semicolon. After a dash, a
 * colon, ¡ ¿, a quotation mark or a full stop a capital says nothing (—¡Gracias a todos!).
 */
export function capitalInside(i: number, tokens: RawToken[]): boolean {
  if (i === 0 || !/^\p{Lu}/u.test(tokens[i].surface)) return false;
  const before = tokens[i - 1];
  return before.isWord || /^[,;]$/u.test(before.surface.trim());
}

/**
 * Does the word stand by itself between pauses, where an interjection stands? ¡Claro! — Bueno, vamos. — ¿Vienes,
 * hombre? Either it opens (the sentence, an exclamation, a quotation) and a pause follows it, or it closes the
 * sentence after a comma ('closes'). A single bare word with no punctuation at all is a label, not an exclamation.
 */
function standsAlone(i: number, tokens: RawToken[]): 'opens' | 'closes' | undefined {
  const before = tokens[i - 1];
  const after = tokens[i + 1];
  if (before?.isWord || after?.isWord || (!before && !after)) return undefined;
  const b = before?.surface.trim() ?? '';
  const a = after?.surface.trim() ?? '';
  if (after && !/^[,.!?…;:]/u.test(a)) return undefined;
  if (!before || /[¡¿—–«"“(:.!?…]$/u.test(b) || dashEndingAt(i - 1, tokens) !== undefined) return 'opens';
  return b === ',' && (!after || /^[.!?…]/u.test(a)) ? 'closes' : undefined;
}

/** The readings of a neighbour that count when asking what it is: the adapter's own where it has any, else all it has. */
const solid = (list: C[]): C[] => (list.some(isOwn) ? list.filter(isOwn) : list);

/**
 * Does a noun phrase begin at token `next`: a determiner, an article, a name, a pronoun — or (`bare`) a number or a
 * noun with nothing before it (bajo tierra, entre amigos)?
 */
function beforeNounPhrase(next: number | undefined, tokens: RawToken[], base: C[][], bare = true): boolean {
  if (next === undefined) return false;
  const n = tokens[next].normalized;
  return DETERMINERS.has(n) || !!ARTICLE_OR_PRONOUN[n] || (bare ? ['PROPN', 'NUM', 'NOUN', 'PRON'] : ['PROPN', 'PRON']).includes(base[next][0]?.pos ?? '');
}

/**
 * The candidates of token i, reordered where the neighbours decide; the same array when they do not.
 * `base` is the context-free analysis of every token of the sentence (best first).
 * Two passes: verb against everything else (and the pairs that share a spelling), then — when the reading in front
 * is not a verb — noun, adjective, adverb, preposition and name among themselves. Before both: a word that stands
 * alone between pauses and can be an interjection; "qué" before a noun or an adjective; "lo" before an adjective.
 */
export function disambiguateSpanish(i: number, tokens: RawToken[], base: C[][]): C[] {
  const cands = base[i];
  if (cands.length < 2) return cands;
  const lead = (pred: (c: C) => boolean, why: string, cue: Cue): C[] | undefined => {
    const k = cands.findIndex((c) => pred(c) && mayLead(cands, c, cue));
    if (k < 0) return undefined;
    if (k === 0) return cands;
    return [{ ...cands[k], notes: { ...(cands[k].notes ?? {}), context: why } }, ...cands.filter((_, j) => j !== k).map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.4) }))];
  };
  // ¡Claro! — Bueno, vamos. — ¡Vamos, hombre! At the end of a sentence a verb of our own stays a verb (Bueno, vamos.),
  // and before a comma an adverb of our own stays an adverb (Adentro, la iglesia está llena. — but ¡Adentro!)
  const alone = cands.some((c) => c.pos === 'INTJ') ? standsAlone(i, tokens) : undefined;
  const ownAdverb = isOwn(cands[0]) && cands[0].pos === 'ADV';
  const frontedAdverb = alone === 'opens' && tokens[i + 1]?.surface.trim().startsWith(',') && ownAdverb;
  if ((alone === 'opens' && !frontedAdverb) || (alone === 'closes' && !ownAdverb && !cands.some((c) => isOwn(c) && isFinite(c)))) {
    const r = lead((c) => c.pos === 'INTJ', 'alone between pauses: an interjection', 'strong');
    if (r) return r;
  }
  // ¿Qué camisa quieres? ¡Qué suerte! — before a noun "qué" is the determiner; ¡Qué alto! — before an adjective or
  // adverb it is "how"; before a verb, or a word that may be one (¿Qué compra Pedro?), it stays the pronoun
  if (tokens[i].normalized === 'qué' && cands[0].pos === 'PRON') {
    const { next } = around(i, tokens);
    const what = next === undefined ? [] : solid(base[next]);
    if (what.length > 0 && !what.some(isFinite)) {
      if (what[0].pos === 'NOUN') return lead((c) => c.pos === 'DET', 'before a noun: "what, which"', 'certain') ?? cands;
      if (what[0].pos === 'ADJ' || what[0].pos === 'ADV') return lead((c) => c.pos === 'ADV', 'before an adjective or adverb: "how"', 'certain') ?? cands;
    }
    return cands;
  }
  // lo bueno, lo más importante: the neuter article before an adjective; before a verb it is the pronoun (lo veo)
  if (tokens[i].normalized === 'lo' && cands.some((c) => c.pos === 'DET') && cands.some((c) => c.pos === 'PRON')) {
    const { next } = around(i, tokens);
    const afterDegree = next !== undefined && LO_DEGREE.has(tokens[next].normalized) && tokens[next + 1]?.isWord ? next + 1 : next;
    const what = afterDegree === undefined ? [] : solid(base[afterDegree]);
    if (what.length > 0 && what[0].pos === 'ADJ' && !what.some(isFinite)) return lead((c) => c.pos === 'DET', 'before an adjective: the neuter article', 'certain') ?? cands;
    return lead((c) => c.pos === 'PRON', 'not before an adjective: the pronoun', 'weak') ?? cands;
  }
  const first = verbOrNot(i, tokens, base);
  return first.length < 2 || isVerbal(first[0]) ? first : amongNominals(i, tokens, base, first);
}

/**
 * Noun, adjective, adverb, preposition, name: which comes first here? `list` is the token's readings as the first
 * pass left them (verb readings, if any, already behind). Only the order among readings that are not verbs changes.
 */
function amongNominals(i: number, tokens: RawToken[], base: C[][], asLeft: C[]): C[] {
  const w = tokens[i].normalized;
  const { prev, prev2, next } = around(i, tokens);
  const form = (j: number | undefined): string | undefined => (j === undefined ? undefined : tokens[j].normalized);
  const top = (j: number | undefined): C | undefined => (j === undefined ? undefined : base[j][0]);
  const p = form(prev);
  const article = p !== undefined && (ARTICLES.has(p) || !!ARTICLE_OR_PRONOUN[p]);
  const determinerBefore = p !== undefined && (DETERMINERS.has(p) || !!ARTICLE_OR_PRONOUN[p] || top(prev)?.pos === 'NUM');
  // "re" the note, "elle" the letter, "t" the abbreviation: such a reading waits behind every other one, and takes no
  // part in the rules below, unless a determiner stands before the word (la elle, un re)
  const letter = (c: C) => !determinerBefore && typeof c.gloss === 'string' && LETTER_NAME.test(c.gloss);
  const list = asLeft.some(letter) && !asLeft.every(letter) ? [...asLeft.filter((c) => !letter(c)), ...asLeft.filter(letter)] : asLeft;
  const nominal = list.filter((c) => !isVerbal(c) && !letter(c));
  const poses = new Set(nominal.map((c) => c.pos));
  if (poses.size < 2 || isVerbal(list[0])) return list;
  // the first pass already decided among these (junto a, solo, mucho): its choice stands
  if (list[0].notes?.context && nominal.slice(1).every((c) => c.confidence <= 0.4)) return list;
  const has = (pos: C['pos']) => poses.has(pos);
  /**
   * The readings of those parts of speech to the front, in that order; the other readings marked down (a neighbour
   * decided). A reading the cue is too weak to put first (see `Cue`) stays where it is; with none left, nothing changes.
   */
  const prefer = (pos: Array<C['pos']>, why: string, cue: Cue = 'strong'): C[] | undefined => {
    const wanted = nominal.filter((c) => pos.includes(c.pos)).sort((a, b) => pos.indexOf(a.pos) - pos.indexOf(b.pos));
    const k = wanted.findIndex((c) => mayLead(list, c, cue));
    if (k < 0) return undefined;
    const yes = [wanted[k], ...wanted.filter((_, j) => j !== k)];
    if (yes.length === nominal.length && yes[0] === list[0]) return undefined;
    const no = list.filter((c) => !yes.includes(c));
    const head: C = { ...yes[0], notes: { ...(yes[0].notes ?? {}), context: why } };
    return [head, ...yes.slice(1), ...no.map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.4) }))];
  };
  /** What follows is a plain noun or a name, so this word qualifies it (un buen día, de mi padre, a San Pedro). */
  const after = next === undefined ? [] : solid(base[next]);
  const nounNext = after.length > 0 && (after[0].pos === 'NOUN' || after[0].pos === 'PROPN') && !after.some((c) => c.pos === 'ADJ');

  // a capital letter inside a sentence: the name (a Jamaica, del Paraguay, la FAO, Rosa dijo). Also after an article:
  // leaving those to the noun was tried on the dev examples and lost more names (el Paraguay, el Senado, la FAO) than
  // it gained nouns written with a capital (la Red); telling the two apart needs the dictionary's own spelling
  if (has('PROPN') && capitalInside(i, tokens)) {
    return list[0].pos === 'PROPN' ? list : prefer(['PROPN'], 'written with a capital inside the sentence: a name') ?? list;
  }
  // ¿Vamos al cine, gordo? ¡Cállate, tonto!: after a comma, closing a question or an exclamation, someone is addressed
  // (in a statement the last word after a comma may as well describe: Llegó tarde, cansado.)
  if (list[0].pos === 'ADJ' && has('NOUN') && standsAlone(i, tokens) === 'closes' && /^[?!]/u.test(tokens[i + 1]?.surface.trim() ?? '')) {
    const r = prefer(['NOUN'], 'after a comma, closing a question or exclamation: the person addressed');
    if (r) return r;
  }
  // bajo la mesa, salvo Ana, menos Juan: a preposition before its noun phrase (not "el bajo", "un sobre", "a bajo precio")
  // (menos before a bare noun or number is "less": menos trabajo, menos dos)
  if (has('ADP') && ALSO_PREPOSITION.has(w) && !article && !(p !== undefined && PREPOSITIONS.has(p)) && beforeNounPhrase(next, tokens, base, w !== 'menos')) {
    const r = prefer(['ADP'], 'before a noun phrase: a preposition');
    if (r) return r;
  }
  // antes de la cena, cerca de aquí, dentro de un año: an adverb with "de" after it works as a preposition; where the
  // word has that reading it comes first, otherwise the adverb stays. Not a word of degree (menos de diez, más de
  // uno are comparisons) and not after an article (el menos de todos)
  if (has('ADP') && list[0].pos === 'ADV' && !INTENSIFIERS.has(w) && !article && next !== undefined && ['de', 'del'].includes(tokens[next].normalized)) {
    const r = prefer(['ADP'], 'before "de": a preposition (adverb + de)');
    if (r) return r;
  }
  // a bajo precio, de bajo nivel, a salvo: after a preposition a word that is preposition or adjective is the adjective
  if (has('ADP') && has('ADJ') && p !== undefined && PREPOSITIONS.has(p)) {
    const r = prefer(['ADJ'], `after the preposition "${p}": an adjective, not a second preposition`);
    if (r) return r;
  }
  // muy yuca, bien paloma, es muy alto: after a word of degree, a quality. After más, bastante, poco … a noun is as
  // likely (más pollo), so those only order readings of one standing
  if (p !== undefined && INTENSIFIERS.has(p) && (has('ADJ') || has('ADV'))) {
    const r = prefer(['ADJ', 'ADV'], `after "${p}": an adjective or adverb`, ONLY_DEGREE.has(p) ? 'strong' : 'weak');
    if (r) return r;
  }
  // está padre, parece joven: after estar or parecer a quality, not a bare noun (after ser both stand: es joven, es médico)
  const governor = p !== undefined && DEGREE.has(p) && prev2 !== undefined ? prev2 : prev;
  // (an adverb stays: está bien, está lejos)
  if (has('ADJ') && list[0].pos === 'NOUN' && governor !== undefined && solid(base[governor]).some((c) => isVerbal(c) && QUALITY_COPULAS.has(c.lemma ?? ''))) {
    const r = prefer(['ADJ'], 'after estar or parecer: an adjective');
    if (r) return r;
  }
  // no hay menores, aquí hay blancos: "hay" takes a noun phrase
  if (p === 'hay' && has('NOUN')) {
    const r = prefer(['NOUN'], 'after "hay": a noun');
    if (r) return r;
  }
  // no quiero viejos groseros, llegaron jóvenes simpáticos: after a verb, a plural that is noun or adjective, with a
  // word after it that is only an adjective and agrees with it, is the noun that adjective describes
  const afterKnownVerb = prev !== undefined && solid(base[prev]).length > 0 && solid(base[prev]).every((c) => isVerbal(c) && c.unconfirmed !== true);
  const plural = nominal.some((c) => c.pos === 'NOUN' && c.morph.Number === 'Plur');
  if (afterKnownVerb && list[0].pos === 'ADJ' && plural && after.length > 0 && after[0].pos === 'ADJ' && after.every((c) => c.pos === 'ADJ' && hasNumber(c, 'Plur'))) {
    const r = prefer(['NOUN'], 'after a verb, with its adjective after it: a noun');
    if (r) return r;
  }
  // personal de seguridad, medios aristocráticos: a label of a few words (nothing before it, no closing punctuation)
  // opens with its noun rather than with an adjective — a weak cue: lleno de agua, libre de impuestos are labels too
  const words = tokens.filter((t) => t.isWord).length;
  const closed = /[.!?…]/u.test(tokens.slice(-2).filter((t) => !t.isWord).map((t) => t.surface).join(''));
  if (list[0].pos === 'ADJ' && has('NOUN') && !closed && words <= 4 && !tokens.slice(0, i).some((t) => t.isWord)
    && next !== undefined && (tokens[next].normalized === 'de' || (after.length > 0 && after.every((c) => c.pos === 'ADJ')))) {
    const r = prefer(['NOUN'], 'opens a label of a few words: its noun', 'weak');
    if (r) return r;
  }
  // habla claro, trabaja duro, maneja fatal: directly after a verb that is not ser or estar, and not before its noun
  // (tiene alto nivel), a word that is adjective or adverb is the adverb
  // (the verb must be a known one, and what follows must not be, or possibly be, a noun)
  const afterPlainVerb = prev !== undefined && solid(base[prev]).length > 0 && solid(base[prev]).every((c) => isVerbal(c) && c.unconfirmed !== true && !COPULAS.has(c.lemma ?? ''));
  if (afterPlainVerb && list[0].pos === 'ADJ' && has('ADV') && (next === undefined || (after.length > 0 && after[0].pos !== 'NOUN' && after[0].pos !== 'PROPN'))) {
    const r = prefer(['ADV'], 'directly after a verb: an adverb');
    if (r) return r;
  }
  if (determinerBefore) {
    // el vaquero es valiente, un aficionado del club: the noun — unless a plain noun follows (un buen día: the adjective).
    // Only an article or a possessive says so for certain: after qué, mucho, todo or a number an adverb or adjective stands as well (qué bien, todo nuevo)
    // After an article a word that is only sometimes a preposition is not one (el bajo, un sobre, los contras) — "de",
    // "a", "en" stay what they are there (el de Juan, la de ayer)
    const notPreposition = article && ALSO_PREPOSITION.has(w);
    const r = (nounNext && has('ADJ') ? prefer(['ADJ'], `between "${p}" and a noun: an adjective`, 'weak') : undefined)
      ?? (has('NOUN') ? prefer(['NOUN'], `after "${p}": a noun`, notPreposition ? 'certain' : article ? 'strong' : 'weak') : undefined)
      ?? (notPreposition && has('ADP') ? prefer(['ADJ', 'ADV'], `after "${p}": not a preposition`) : undefined);
    if (r) return r;
  }
  // sus ambiciosos objetivos, el destacado opositor: after a determiner and an adjective, the noun
  if (has('NOUN') && top(prev)?.pos === 'ADJ' && prev2 !== undefined && (DETERMINERS.has(form(prev2) as string) || !!ARTICLE_OR_PRONOUN[form(prev2) as string])) {
    const r = prefer(['NOUN'], `after "${form(prev2)} ${p}": a noun`, 'weak');
    if (r) return r;
  }
  // con vaqueros, en inglés, de parto: after a preposition with no article, the noun rather than the adjective
  // (an adverb of our own stays: de cómo, en cuanto)
  if (p !== undefined && PREPOSITIONS.has(p) && has('NOUN') && !nounNext) {
    const r = prefer(['NOUN'], `after the preposition "${p}": a noun`, list[0].pos === 'ADJ' ? 'strong' : 'weak');
    if (r) return r;
  }
  // mujer zancuda, imanes superconductores, personal médico: after a noun, the adjective that agrees with it
  const before = top(prev);
  if (before?.pos === 'NOUN' && has('ADJ') && !(prev2 === undefined && !has('NOUN'))) {
    const agrees = nominal.some((c) => c.pos === 'ADJ' && hasNumber(c, before.morph.Number) && hasGender(c, before.morph.Gender));
    if (agrees) {
      const r = prefer(['ADJ'], `after the noun "${p}": an adjective`, 'weak');
      if (r) return r;
    }
  }
  // re tarde, algo extraño: an adverb before an adjective or adverb
  if (has('ADV') && !determinerBefore && after.length > 0 && ['ADJ', 'ADV'].includes(after[0].pos ?? '') && !after.some((c) => c.pos === 'NOUN')) {
    const r = prefer(['ADV'], 'before an adjective or adverb: an adverb', 'weak');
    if (r) return r;
  }
  // a small letter: not the name
  if (has('PROPN') && !/^\p{Lu}/u.test(tokens[i].surface) && list[0].pos === 'PROPN') return [...list.filter((c) => c.pos !== 'PROPN'), ...list.filter((c) => c.pos === 'PROPN')];
  return list;
}

function verbOrNot(i: number, tokens: RawToken[], base: C[][]): C[] {
  const cands = base[i];
  if (cands.length < 2) return cands;
  const w = tokens[i].normalized;
  const { prev, prev2, next, reporting } = around(i, tokens);
  const form = (j: number | undefined): string | undefined => (j === undefined ? undefined : tokens[j].normalized);
  const top = (j: number | undefined): C | undefined => (j === undefined ? undefined : base[j][0]);
  const any = (j: number | undefined, pred: (c: C) => boolean): boolean => j !== undefined && solid(base[j]).some(pred);
  const hasLemma = (lemma: string): boolean => cands.some((c) => c.lemma === lemma);
  const p = form(prev);
  const n = form(next);

  /**
   * Readings that satisfy `pred` first, in their order; the rest after them. A neighbour that decides marks the rest
   * down; a fallback (`usual`: nothing around the word decided, this is only the commoner reading) leaves them as they were.
   * `cue`: what the neighbour is worth (see `Cue`); a rule too weak to put its first reading in front changes nothing.
   */
  const choose = (pred: (c: C) => boolean, why: string, usual = false, cue: Cue = 'strong'): C[] | undefined => {
    const yes = cands.filter(pred);
    if (yes.length === 0 || !mayLead(cands, yes[0], usual ? 'weak' : cue)) return undefined;
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
  // di: "say!" or "I gave". Opening a sentence the command is only the likelier reading (Di la verdad. / Di un paseo.);
  // after a subject, "no" or an object pronoun the rules below make it the statement (le di, no di, yo di)
  if (w === 'di' && hasLemma('decir') && hasLemma('dar') && prev === undefined && !reporting) {
    return choose((c) => c.lemma === 'decir' && isImperative(c), 'opens the sentence: the likelier reading is the command "say"', true) ?? cands;
  }

  // junto a la ventana: the locution, not the adjective
  if (w === 'junto' && (n === 'a' || n === 'al')) return choose((c) => c.pos === 'ADV', '"junto a": beside') ?? cands;
  // yo solo quería … (only) against un solo sábado, está solo (single, alone)
  if (w === 'solo' && cands.some((c) => c.pos === 'ADV') && cands.some((c) => c.pos === 'ADJ')) {
    const beforeVerb = next !== undefined && solid(base[next]).length > 0 && solid(base[next]).every(isVerbal) && solid(base[next]).some(isFinite);
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

  // doña Reina, la señora Rosa: a capital inside the sentence is a name or a noun rather than a conjugated verb
  // (weak: a heading in capitals says nothing, so a verb of our own is not given up for a dictionary's noun)
  if (other.length > 0 && capitalInside(i, tokens)) {
    const r = choose((c) => !isVerbal(c), 'written with a capital inside the sentence: not a verb', false, 'weak');
    if (r) return r;
  }

  // ── the word before governs ──
  // haber + participle (había pasado, he pecado), an adverb between allowed
  const governor = p !== undefined && DEGREE.has(p) && prev2 !== undefined ? prev2 : prev;
  if (any(governor, (c) => c.lemma === 'haber' && isVerbal(c)) && form(governor) !== 'hay') {
    const r = choose(isParticiple, 'after haber: a participle');
    if (r) return r;
  }
  // ser / estar + adjective (está llena, estaba cansada, es tarde) — but está bajo la mesa, fueron todos salvo Ana:
  // a word that is also a preposition, before a noun phrase, is left to the second pass
  const preposition = ALSO_PREPOSITION.has(w) && cands.some((c) => c.pos === 'ADP') && beforeNounPhrase(next, tokens, base);
  if (other.length > 0 && !preposition && any(governor, (c) => isVerbal(c) && COPULAS.has(c.lemma ?? ''))) {
    const r = choose((c) => c.pos === 'ADJ', 'after ser or estar: an adjective') ?? choose((c) => !isVerbal(c), 'after ser or estar: not a verb', false, 'weak');
    if (r) return r;
  }
  // vino a durar tres horas, sale a correr: a conjugated verb, then "a" and an infinitive. Not after a determiner (la
  // ayuda a vivir), a preposition (de camino a comprar) or a conjugated verb (tiene derecho a votar): there it is a noun
  const afterVerb = prev !== undefined && solid(base[prev]).length > 0 && solid(base[prev]).every(isVerbal) && solid(base[prev]).some(isFinite);
  if (other.length > 0 && n === 'a' && next !== undefined && base[next + 1]?.some((c) => isVerbal(c) && c.morph.VerbForm === 'Inf')
    && !(p !== undefined && (DETERMINERS.has(p) || !!ARTICLE_OR_PRONOUN[p] || PREPOSITIONS.has(p))) && !afterVerb) {
    const r = choose(isFinite, 'before "a" and an infinitive: a verb');
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
    // Jesús salva. Marta canta. — a name that opens the sentence, then a word that is a verb or an adjective, and no
    // other verb in the sentence: the sentence needs its verb, so this is it (Jesús salvo would not be a sentence)
    if (!subject && prev2 === undefined && top(prev)?.pos === 'PROPN' && other.length > 0 && other.every((c) => c.pos === 'ADJ')
      && !tokens.some((t, j) => j > i && t.isWord && solid(base[j]).length > 0 && isFinite(solid(base[j])[0]))) {
      const r = choose((c) => isStatement(c) && hasPerson(c, '3') && hasNumber(c, 'Sing'), 'after a name that opens the sentence, with no other verb: the verb', false, 'weak');
      if (r) return r;
    }
    if (PROCLITICS.has(p)) {
      // nothing but a verb (or another pronoun) follows me, te, se, le: even "para" is parar here (el autobús se para)
      const r = choose(isStatement, `after the pronoun "${p}": a verb`, false, 'certain');
      if (r) return r;
    }
    if (NEGATIVES.has(p)) {
      const r = choose(isStatement, `after "${p}": a verb`);
      if (r) return r;
    }
    if (PREVERBAL.has(p)) {
      const r = choose((c) => isStatement(c) && c.morph.Mood !== 'Sub' && !hasPerson(c, '2'), `after "${p}": a verb`, false, 'weak');
      if (r) return r;
    }
    if (other.length > 0 && (DETERMINERS.has(p) || top(prev)?.pos === 'NUM')) {
      // after an article or a possessive only a noun phrase can come; todos, otros, esta, qué or a number also stand before a verb
      const r = choose((c) => !isVerbal(c), `after "${p}": a noun or adjective`, false, ARTICLES.has(p) || NOUN_QUANTIFIERS.has(p) ? 'strong' : 'weak');
      if (r) return r;
    }
    if (p === 'lo') {
      const r = choose(isStatement, 'after the pronoun "lo": a verb', false, 'weak') ?? choose((c) => !isVerbal(c), 'after "lo": not a verb', false, 'weak');
      if (r) return r;
    }
    const article = ARTICLE_OR_PRONOUN[p];
    if (article) {
      // Juan la llama (subject, pronoun, verb) against la llama (article, noun)
      const p2 = form(prev2);
      const subjectBefore = prev2 !== undefined && (!!SUBJECTS[p2 as string] || NEGATIVES.has(p2 as string) || top(prev2)?.pos === 'PROPN');
      const nominal = (c: C) => !isVerbal(c) && hasGender(c, article.gender) && hasNumber(c, article.number);
      // (la, las, los are articles or pronouns: neither reading of the next word is ruled out, so the cue is weak)
      const r = subjectBefore
        ? choose(isStatement, `a subject, then the pronoun "${p}": a verb`, false, 'weak')
        : choose(nominal, `after the article "${p}": a noun or adjective`, false, 'weak');
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
      const r = choose(isStatement, `after "${p}": a verb`, false, 'weak');
      if (r) return r;
    }
    const before = top(prev);
    const name = before?.pos === 'PROPN' || (base[prev as number].length === 0 && /^\p{Lu}/u.test(tokens[prev as number].surface) && tokens.slice(0, prev).some((t) => t.isWord));
    if (before?.pos === 'ADJ' && other.length > 0) {
      // la niña pequeña cocina arroz: noun, adjective, then a verb with its object; otherwise an adjective stands before its noun
      const third = (c: C) => isStatement(c) && hasPerson(c, '3') && hasNumber(c, before.morph.Number);
      // … and after an article or possessive and an adjective nothing but the noun can come (un buen sentido, con el mayor gusto)
      const p2 = form(prev2);
      const r = (top(prev2)?.pos === 'NOUN' && next !== undefined ? choose(third, 'after a noun and its adjective, with an object after it: a verb', false, 'weak') : undefined)
        ?? choose((c) => !isVerbal(c), `after the adjective "${p}": a noun`, false, p2 !== undefined && ARTICLES.has(p2) ? 'strong' : 'weak');
      if (r) return r;
    }
    if (before?.pos === 'NOUN' || name) {
      const number = name ? undefined : before?.morph.Number;
      const third = (c: C) => isStatement(c) && hasPerson(c, '3') && hasNumber(c, number);
      const adjective = (c: C) => c.pos === 'ADJ' && hasNumber(c, number) && hasGender(c, name ? undefined : before?.morph.Gender);
      // (a reading these weak cues could not put first does not count: a dictionary's adjective beside a verb of ours)
      const canBeVerb = cands.some((c) => third(c) && mayLead(cands, c, 'weak'));
      const canBeAdjective = !preposition && cands.some((c) => adjective(c) && mayLead(cands, c, 'weak')); // una investigación bajo la ley: the preposition, left to the second pass
      if (canBeVerb && canBeAdjective) {
        // la abuela llena la jarra / la jarra llena: an object after it makes it the verb
        const objectFollows = n !== undefined && (DETERMINERS.has(n) || !!ARTICLE_OR_PRONOUN[n] || n === 'a' || ['NUM', 'PROPN'].includes(top(next)?.pos ?? ''));
        // (a noun before the word is a likely subject or head, not a certain one: all three are weak cues)
        const r = objectFollows ? choose(third, 'after its subject, with an object after it: a verb', false, 'weak') : choose(adjective, `after the noun "${p}": an adjective`, false, 'weak');
        if (r) return r;
      } else if (canBeVerb) {
        const r = choose(third, `after its subject "${tokens[prev as number].surface}": a verb`, false, 'weak');
        if (r) return r;
      } else if (canBeAdjective) {
        const r = choose(adjective, `after the noun "${p}": an adjective`, false, 'weak');
        if (r) return r;
      }
    }
    // tiene trabajo, buscó trabajo, hagamos preguntas: after a conjugated verb comes its object, not another conjugated verb
    if (other.length > 0 && afterVerb) {
      const r = choose((c) => !isFinite(c), 'after a conjugated verb: its object or complement', false, 'weak');
      if (r) return r;
    }
  }

  // Sal de aquí. Sueño con volver. Cuenta con nosotros. Cuento que vendrás. — a word that opens a sentence before a
  // preposition and an infinitive, an adverb or a pronoun (or before "que") is likelier the verb; nothing is marked
  // down. Before a preposition and a noun phrase a noun opens a sentence just as well (Parte de la gente canta. Falta
  // de respeto. Paso a paso.): there the verb is likelier only when the sentence has no other verb and is more than a
  // label of two or three words (Sal de mi casa ahora mismo. Gira a la izquierda.). In a heading without closing
  // punctuation, and for a word that is also a preposition (salvo que), the order is left alone.
  const endsAsSentence = /[.!?…]/u.test(tokens.slice(-2).filter((t) => !t.isWord).map((t) => t.surface).join(''));
  if (other.length > 0 && !reporting && endsAsSentence && next !== undefined && n !== undefined && AFTER_OPENING_VERB.has(n)
    && !tokens.slice(0, i).some((t) => t.isWord) && !cands.some((c) => c.pos === 'ADP')) {
    const complement = tokens[next + 1]?.isWord ? solid(base[next + 1]) : [];
    const words = tokens.filter((t) => t.isWord).length;
    const otherVerb = tokens.some((t, j) => j > i && t.isWord && solid(base[j]).length > 0 && isFinite(solid(base[j])[0]));
    const verbFits = n === 'que' || (complement.length > 0 && (['ADV', 'PRON'].includes(complement[0].pos ?? '') || complement.some((c) => isVerbal(c) && c.morph.VerbForm === 'Inf')))
      || (words >= 4 && !otherVerb)
      // Vivo en Honduras. Trabajo con mi hermano. — the only rival is an adjective (vivo, cierto, junto…), which does not
      // open a sentence before a preposition, while a first-person verb does: then even a short sentence is the verb
      || (!otherVerb && other.every((c) => c.pos === 'ADJ') && cands.some((c) => isFinite(c) && c.morph.Person === '1'));
    if (verbFits) {
      const r = choose(isFinite, 'opens the sentence, with its complement after it: the likelier reading is the verb', true);
      if (r) return r;
    }
  }

  // ── nothing decided: a noun or adjective the word list (or an installed dictionary) knows goes before a "tú" form or a command (tiendas, calles, plantas) ──
  // (a dictionary's noun beside a verb of our own stays behind it: haces is hacer, not the plural of haz)
  const known = (c: C) => !isVerbal(c) && (c.origin === 'hand' || c.origin === 'dictionary' || c.notes?.lemmaStatus === 'in the word list') && mayLead(cands, c, 'weak');
  if (isVerbal(cands[0]) && (hasPerson(cands[0], '2') || isImperative(cands[0])) && verbal.every((c) => hasPerson(c, '2') || isImperative(c)) && other.some(known)) {
    const yes = cands.filter(known);
    return [...yes, ...cands.filter((c) => !known(c))];
  }
  return cands;
}
