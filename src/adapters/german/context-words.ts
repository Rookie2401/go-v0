/**
 * Capital letters and the words that have several functions (package GC, steps 1 and 5).
 *  - Inside a sentence a capitalised word is a noun or a name (or the polite Sie / Ihnen / Ihr); its lower-case readings go
 *    below. A lower-case word is never a noun. At the start of a sentence both stay, and the neighbours decide only where
 *    they can (Leben ist schön: the noun; Essen wir?: the verb).
 *  - der / die / das …: the relative pronoun after a comma when the clause ends in its verb; the article before a noun;
 *    otherwise the demonstrative pronoun. zu: the infinitive marker before an infinitive, the preposition before a noun
 *    phrase, "too" before an adjective. sein / ihr: a possessive only before a noun phrase.
 *  - The modal particles (doch, mal, ja, denn, eben, halt, eigentlich): the particle in the middle of a clause after the
 *    finite verb; otherwise the ordinary reading stays first.
 */
import type { DeCell } from './types';
import {
  DE_SOURCE_IDS, addContext, anyLive, finiteSlot, has, isFin, isInf, isNounLike, isUpper, prefer, settle, top, verbFinalClause,
  type C, type Clause, type R, type Sent, type Tok,
} from './context';

/** Closed classes: a capitalised word that is one of these (Du, Dein in a letter) is not taken for a noun the list lacks. */
const CLOSED_POS = new Set(['DET', 'PRON', 'ADP', 'CONJ', 'SCONJ']);
const FUNCTION_POS = new Set(['ADV', 'CONJ', 'SCONJ', 'ADP', 'DET', 'PRON', 'PART', 'INTJ', 'NUM']);

// ───────────────────────────── capital letters ─────────────────────────────

/** A reading that a capital letter inside a sentence allows: a noun, a name, the polite Sie / Ihnen / Ihr. */
const licensed = (c: C): boolean => isNounLike(c) || !!c.notes?.nominalization || (!!c.lemma && isUpper(c.lemma[0]));

/** The reading of a capitalised word inside a sentence that the list does not hold: the word itself, case, number and gender not known (as the engine guesses a word that has no reading at all). */
function unknownNoun(surface: string): R {
  const cells: DeCell[] = (['N', 'A', 'D', 'G'] as const).flatMap((c) => (['m', 'f', 'n', 'p'] as const).map((g) => ({ c, g })));
  return {
    own: true, cells,
    c: {
      lemma: surface, pos: 'NOUN', morph: { Case: 'Nom,Acc,Dat,Gen' }, confidence: 0.5, unconfirmed: true,
      notes: { source: 'rule', rule: 'guessed noun (capitalised inside a sentence, not in the word list): the word itself as lemma; case, number and gender not known', lemmaStatus: 'inferred by the rules' },
      origin: 'rule', sourceId: DE_SOURCE_IDS.rules,
    },
  };
}

export function applyCapitals(toks: Tok[]): void {
  const letters = toks.filter((t) => t.word && t.raw.surface.length > 1);
  if (letters.length > 0 && letters.every((t) => t.caps)) return; // capitals say nothing here
  const anyCap = toks.some((t) => t.word && t.cap && !t.start);
  for (const t of toks) {
    if (!t.word) continue;
    if (t.cap && !t.start) {
      // a capital inside a sentence and nothing the list holds that a capital allows: a noun the list lacks, said so
      if (t.own && !t.frozen && !t.caps && t.rs.length && !t.rs.some((r) => licensed(r.c) || (r.c.pos && CLOSED_POS.has(r.c.pos) && !r.c.unconfirmed))) t.rs.unshift(unknownNoun(t.raw.surface));
      prefer(t, (r) => licensed(r.c), 'a capital letter inside a sentence: a noun or a name');
    } else if (!t.cap && anyCap) {
      prefer(t, (r) => !isNounLike(r.c), 'written without a capital letter: not a noun or a name');
    }
  }
}

/** The word after token `t` in its clause. */
function nextInClause(s: Sent, t: Tok): Tok | undefined {
  const cl = s.clauses[s.clauseOf[t.i]];
  if (!cl) return undefined;
  const k = cl.words.indexOf(t.i);
  return k >= 0 && k + 1 < cl.words.length ? s.toks[cl.words[k + 1]] : undefined;
}

const subjectPronoun = (t: Tok | undefined): boolean => anyLive(t, (c) => c.pos === 'PRON' && has(c, 'Case', 'Nom') && (has(c, 'PronType', 'Prs') || has(c, 'PronType', 'Ind')));

/** The first word of a sentence that is both a noun and something else. */
export function decideInitial(s: Sent): void {
  for (const t of s.toks) {
    if (!t.word || !t.cap || !t.start || t.caps) continue;
    const nounR = t.rs.filter((r) => !r.down && isNounLike(r.c));
    const other = t.rs.filter((r) => !r.down && !isNounLike(r.c));
    if (!nounR.length || !other.length) continue;
    const nx = nextInClause(s, t);
    // a function word opens a sentence far more often than a bare noun does (Morgen gehe ich nach Hause)
    const fn = other.filter((r) => r.c.pos && FUNCTION_POS.has(r.c.pos) && !r.c.unconfirmed);
    if (fn.length) {
      prefer(t, (r) => fn.includes(r), 'opens the sentence: a function word, not a bare noun');
      continue;
    }
    const verbR = other.filter((r) => isFin(r.c) || isInf(r.c));
    if (!verbR.length) continue;
    if (nx && isFin(top(nx)?.c) && !anyLive(nx, (c) => isInf(c))) prefer(t, (r) => isNounLike(r.c), `followed by the finite verb ${nx.raw.surface}: a noun`);
    else if (subjectPronoun(nx)) prefer(t, (r) => isFin(r.c) || isInf(r.c), `followed by the subject ${nx?.raw.surface}: a verb`);
    else if (s.endMark === '?' && t.i === s.toks.findIndex((x) => x.word)) prefer(t, (r) => isFin(r.c) || isInf(r.c), 'a question that opens with the verb');
  }
}

/** A title or a kinship word that is followed by a name: Herr Koch, Familie Keller, Tante Berg. */
const NAME_TITLES = new Set(['herr', 'frau', 'fräulein', 'familie', 'ehepaar', 'pastor', 'pfarrer', 'doktor', 'dr', 'professor', 'prof', 'onkel', 'tante', 'bruder', 'schwester']);
/** A preposition that stands before a place name with no article: nach Halle, aus Jena, in Bremen, bei Koch. */
const NAME_PREPOSITIONS = new Set(['nach', 'aus', 'in', 'bei', 'bis']);

/**
 * A word that is a name and also an ordinary noun or adjective (Keller, Koch, Bauer, Wolf, Klein, Halle) is read as the name
 * where the sentence says so: straight after a title (Herr Koch) or after another name that is no genitive (Anna Keller), and
 * after a preposition that takes a place with no article (nach Halle). Elsewhere the ordinary reading stays first (der Keller).
 * The name reading is only moved up, never made.
 */
export function decideNames(s: Sent): void {
  for (const t of s.toks) {
    if (!t.word || !t.cap || t.caps) continue;
    const prev = s.toks[t.i - 1];
    // Dr. Richter: the full stop of the abbreviation lets a sentence begin by the layer's reckoning, but it does not here
    const abbreviated = !!prev && !prev.word && prev.raw.surface === '.' && !!s.toks[t.i - 2]?.word && /^(dr|prof)$/.test(s.toks[t.i - 2].raw.normalized);
    if (t.start && !abbreviated) continue;
    if (!anyLive(t, (c) => c.pos === 'PROPN') || top(t)?.c.pos === 'PROPN') continue;
    let why = '';
    if (abbreviated) {
      why = `follows the title ${s.toks[t.i - 2].raw.surface}.: a name`;
    } else if (prev?.word) {
      const p = prev.raw.normalized;
      if (NAME_TITLES.has(p)) why = `follows the title ${prev.raw.surface}: a name`;
      else if (NAME_PREPOSITIONS.has(p)) why = `follows ${prev.raw.surface} with no article: a place or a name`;
      else if (top(prev)?.c.pos === 'PROPN' && !has(top(prev)?.c, 'Case', 'Gen')) why = `follows the name ${prev.raw.surface}: a surname`;
    }
    if (why) prefer(t, (r) => r.c.pos === 'PROPN', why);
  }
}

// ───────────────────────────── words with several functions ─────────────────────────────

const RELATIVE_FORMS = new Set(['der', 'die', 'das', 'dem', 'den', 'des', 'dessen', 'deren', 'denen']);
const hasType = (c: C, v: string): boolean => has(c, 'PronType', v);

/** Does a noun (perhaps after adjectives) follow directly after `t`? */
function nounFollows(s: Sent, t: Tok): boolean {
  let k = t.i + 1;
  for (let guard = 0; guard < 4; guard++) {
    const n = s.toks[k];
    if (!n || !n.word) return false;
    if (anyLive(n, (c) => isNounLike(c)) && n.cap) return true;
    if (anyLive(n, (c) => c.pos === 'ADJ' || (c.pos === 'VERB' && has(c, 'VerbForm', 'Part')))) { k++; continue; }
    return false;
  }
  return false;
}

function relativeStart(s: Sent, t: Tok): boolean {
  const cl: Clause | undefined = s.clauses[s.clauseOf[t.i]];
  if (!cl || !/,/.test(cl.open) || !verbFinalClause(s, cl)) return false;
  const k = cl.words.indexOf(t.i);
  if (k === 0) return true;
  return k === 1 && !!s.lex.preposition(s.toks[cl.words[0]].raw.normalized);
}

function decideArticles(s: Sent, t: Tok): void {
  if (!RELATIVE_FORMS.has(t.raw.normalized)) return;
  const det = t.rs.filter((r) => !r.down && r.c.pos === 'DET');
  const pron = t.rs.filter((r) => !r.down && r.c.pos === 'PRON' && (hasType(r.c, 'Rel') || hasType(r.c, 'Dem')));
  if (!det.length || !pron.length) return; // a noun phrase already decided it
  if (nounFollows(s, t)) { prefer(t, (r) => r.c.pos === 'DET', 'a noun follows: the article'); return; }
  if (relativeStart(s, t)) { prefer(t, (r) => r.c.pos === 'PRON' && hasType(r.c, 'Rel'), 'opens a clause after a comma that ends in its verb: the relative pronoun'); return; }
  prefer(t, (r) => r.c.pos === 'PRON' && hasType(r.c, 'Dem'), 'no noun follows and it opens no relative clause: the demonstrative pronoun');
}

function decideZu(s: Sent, t: Tok): void {
  if (t.raw.normalized !== 'zu' || t.rs.some((r) => r.c.unit)) return;
  const nx = s.toks[t.i + 1];
  if (!nx || !nx.word) return;
  if (anyLive(nx, (c) => isInf(c)) && !anyLive(nx, (c) => c.pos === 'NOUN' && nx.cap)) { prefer(t, (r) => r.c.pos === 'PART', 'before an infinitive: the infinitive marker'); return; }
  const npFollows = (nx.cap && anyLive(nx, (c) => c.pos === 'NOUN')) || (anyLive(nx, (c) => c.pos === 'DET' || c.pos === 'ADJ') && nounFollows(s, nx)) || (anyLive(nx, (c) => c.pos === 'DET') && !anyLive(nx, (c) => c.pos === 'ADJ'));
  if (npFollows) {
    prefer(t, (r) => r.c.pos === 'ADP', 'before a noun phrase: the preposition');
    return;
  }
  if (anyLive(nx, (c) => c.pos === 'PRON' && has(c, 'PronType', 'Prs') && (has(c, 'Case', 'Dat') || has(c, 'Case', 'Acc')) && !has(c, 'Case', 'Nom'))) { prefer(t, (r) => r.c.pos === 'ADP', 'before a pronoun in the dative: the preposition'); return; }
  if (anyLive(nx, (c) => c.pos === 'ADJ' || c.pos === 'ADV')) prefer(t, (r) => r.c.pos === 'ADV', 'before an adjective or adverb: "too"');
}

/** sein / ihr / unser …: a possessive determiner only before a noun phrase. */
function decidePossessive(s: Sent, t: Tok): void {
  const poss = t.rs.filter((r) => !r.down && r.c.pos === 'DET' && has(r.c, 'Poss', 'Yes'));
  const rest = t.rs.filter((r) => !r.down && !(r.c.pos === 'DET' && has(r.c, 'Poss', 'Yes')));
  if (!poss.length || !rest.length) return;
  if (nounFollows(s, t)) { prefer(t, (r) => poss.includes(r), 'before a noun: the possessive'); return; }
  prefer(t, (r) => !poss.includes(r), 'no noun follows: not a possessive');
}

/** The modal particles whose particle reading is chosen on position alone. */
const PARTICLES = new Set(['doch', 'mal', 'ja', 'denn', 'eben', 'halt', 'eigentlich']);
/** Ones that also make sense at the end of a command or a question (Komm doch! Du kommst doch?). */
const FINAL_OK = new Set(['doch', 'mal', 'denn', 'ja', 'halt']);

const isParticle = (r: R): boolean => r.c.pos === 'PART' && !!r.c.role;

function decideParticle(s: Sent, t: Tok): void {
  if (!PARTICLES.has(t.raw.normalized) || !t.rs.some(isParticle)) return;
  const others = t.rs.filter((r) => !r.down && !isParticle(r));
  if (!others.length) return;
  const cl = s.clauses[s.clauseOf[t.i]];
  if (!cl) return;
  const k = cl.words.indexOf(t.i);
  const slot = finiteSlot(s, cl);
  const lastWord = k === cl.words.length - 1;
  const n = t.raw.normalized;
  const startsClause = k === 0;
  if (startsClause && (n === 'ja' || n === 'doch' || n === 'denn')) {
    // Ja, … / Doch, … / , denn …: the answer, the contrast, the conjunction
    prefer(t, (r) => !isParticle(r), n === 'denn' ? 'opens a clause after a comma: the conjunction' : 'at the start of the clause: not the modal particle');
    return;
  }
  const afterVerb = slot >= 0 && slot < k && !verbFinalClause(s, cl);
  const inside = !lastWord || (FINAL_OK.has(n) && /[!?]/.test(s.endMark));
  if (afterVerb && inside) {
    prefer(t, isParticle, `in the middle of the clause after the finite verb ${s.toks[cl.words[slot]].raw.surface}: the modal particle`);
    return;
  }
  // unsure: the ordinary reading first, the particle behind it, nothing marked down
  const ordinary = t.rs.filter((r) => !isParticle(r));
  const particle = t.rs.filter(isParticle);
  t.rs = [...ordinary, ...particle];
  settle(t);
}

/** zwei, sieben: a number, though the list also inflects it like an adjective. */
function decideNumeral(t: Tok): void {
  const num = t.rs.filter((r) => !r.down && r.c.pos === 'NUM');
  if (!num.length || !t.rs.some((r) => !r.down && r.c.pos === 'ADJ' && num.some((n) => n.c.lemma === r.c.lemma))) return;
  prefer(t, (r) => r.c.pos === 'NUM', 'a cardinal number');
}

/** An adjective that no noun phrase took: the form without an ending (Ich bin müde). */
function decideAdjective(t: Tok): void {
  const bare = t.rs.filter((r) => !r.down && (r.c.pos === 'ADJ') && !r.cells && !r.c.morph.Case);
  const ending = t.rs.filter((r) => !r.down && r.c.pos === 'ADJ' && (r.cells || r.c.morph.Case));
  if (!bare.length || !ending.length) return;
  prefer(t, (r) => !ending.includes(r), 'not in a noun phrase: the form without an ending');
}

/** Does a noun phrase, or a pronoun, follow directly after `t` in its clause? */
function phraseFollows(s: Sent, t: Tok): boolean {
  const n = nextInClause(s, t);
  if (!n) return false;
  return anyLive(n, (c) => c.pos === 'DET' || c.pos === 'NOUN' || c.pos === 'PROPN' || c.pos === 'PRON' || c.pos === 'NUM' || c.pos === 'ADJ') && !anyLive(n, (c) => isFin(c) && !n.cap);
}

/** laut, vor, bei … without a noun phrase after them are the adverb or adjective, not the preposition. */
function decidePreposition(s: Sent, t: Tok): void {
  if (!s.lex.preposition(t.raw.normalized) || t.rs.some((r) => r.c.unit)) return;
  const prep = t.rs.filter((r) => !r.down && r.c.pos === 'ADP');
  const other = t.rs.filter((r) => !r.down && (r.c.pos === 'ADV' || r.c.pos === 'ADJ'));
  if (!prep.length || !other.length || phraseFollows(s, t)) return;
  prefer(t, (r) => !prep.includes(r), 'no noun phrase follows: not a preposition');
}

/** bis, seit, während: the conjunction only when a clause with its finite verb at the end follows; before a noun phrase, a time word, a number or another preposition they are prepositions. */
const CONJUNCTION_OR_PREPOSITION = new Set(['bis', 'seit', 'während']);
function decideConjunctionPreposition(s: Sent, t: Tok): void {
  if (!CONJUNCTION_OR_PREPOSITION.has(t.raw.normalized) || t.rs.some((r) => r.c.unit)) return;
  if (!anyLive(t, (c) => c.pos === 'ADP') || !anyLive(t, (c) => c.pos === 'SCONJ')) return;
  const cl = s.clauses[s.clauseOf[t.i]];
  if (!cl) return;
  const tail = cl.words.slice(cl.words.indexOf(t.i) + 1).map((k) => s.toks[k]);
  const first = tail[0];
  const conjunction = tail.length >= 2 && anyLive(tail[tail.length - 1], (c) => isFin(c))
    && !(s.lex.preposition(first.raw.normalized) || s.lex.contraction(first.raw.normalized) || anyLive(first, (c) => c.pos === 'NUM'));
  if (conjunction) prefer(t, (r) => r.c.pos === 'SCONJ', 'a clause with its finite verb at the end follows: the conjunction');
  else prefer(t, (r) => r.c.pos === 'ADP', 'before a noun phrase, a time word, a number or another preposition (no clause ending in its verb follows): the preposition');
}

/**
 * als: the conjunction (SCONJ, "when") when a clause with its finite verb at the end follows (Als Gregor Samsa erwachte, …; … ließ ab, als er
 * zu fühlen begann); the comparison particle (CONJ) before a noun phrase or a pronoun with no clause behind it (größer als ich; Als Kind wohnte er …).
 */
function decideAls(s: Sent, t: Tok): void {
  if (t.raw.normalized !== 'als' || !anyLive(t, (c) => c.pos === 'CONJ') || !anyLive(t, (c) => c.pos === 'SCONJ')) return;
  const cl = s.clauses[s.clauseOf[t.i]];
  if (!cl) return;
  const tail = cl.words.slice(cl.words.indexOf(t.i) + 1).map((k) => s.toks[k]);
  const clause = tail.length >= 2 && anyLive(tail[tail.length - 1], (c) => isFin(c)) && !s.lex.preposition(tail[0].raw.normalized);
  if (clause) prefer(t, (r) => r.c.pos === 'SCONJ', 'a clause with its finite verb at the end follows: the conjunction "when"');
  else prefer(t, (r) => r.c.pos === 'CONJ', 'no clause ending in its verb follows (a noun phrase or pronoun): the comparison "than / as"');
}

/** The step: capitals first, then the words with several functions. */
export function decideWords(s: Sent): void {
  for (const t of s.toks) {
    if (!t.word) continue;
    decideNumeral(t);
    decideAdjective(t);
    decidePreposition(s, t);
    decideConjunctionPreposition(s, t);
    decideAls(s, t);
    decideArticles(s, t);
    decideZu(s, t);
    decidePossessive(s, t);
    decideParticle(s, t);
  }
  void addContext;
}
