/**
 * Numerals, ordinals, prepositions, conjunctions and particles of Standard Albanian as lexemes. Package Q3.
 * Machine-drafted, not checked by a native speaker. Single words only: the phrases (për të, në qoftë se, me anë të,
 * të gjithë, një mijë) are for the phrase layer.
 */
import type { SqLexeme } from './types';
import { F } from './function-build';

const CARD = (lemma: string, gloss: string, forms?: string[]): SqLexeme => F(lemma, 'NUM', gloss, forms);

export const NUMERALS: SqLexeme[] = [
  CARD('zero', 'zero (0)'), CARD('një', 'one (1)'), CARD('dy', 'two (2)'), CARD('tre', 'three (3)', ['tre: m', 'tri: f']),
  CARD('katër', 'four (4)'), CARD('pesë', 'five (5)'), CARD('gjashtë', 'six (6)'), CARD('shtatë', 'seven (7)'),
  CARD('tetë', 'eight (8)'), CARD('nëntë', 'nine (9)'), CARD('dhjetë', 'ten (10)'),
  CARD('njëmbëdhjetë', 'eleven (11)'), CARD('dymbëdhjetë', 'twelve (12)'), CARD('trembëdhjetë', 'thirteen (13)'),
  CARD('katërmbëdhjetë', 'fourteen (14)'), CARD('pesëmbëdhjetë', 'fifteen (15)'), CARD('gjashtëmbëdhjetë', 'sixteen (16)'),
  CARD('shtatëmbëdhjetë', 'seventeen (17)'), CARD('tetëmbëdhjetë', 'eighteen (18)'), CARD('nëntëmbëdhjetë', 'nineteen (19)'),
  CARD('njëzet', 'twenty (20)'), CARD('tridhjetë', 'thirty (30)'), CARD('dyzet', 'forty (40)'), CARD('pesëdhjetë', 'fifty (50)'),
  CARD('gjashtëdhjetë', 'sixty (60)'), CARD('shtatëdhjetë', 'seventy (70)'), CARD('tetëdhjetë', 'eighty (80)'),
  CARD('nëntëdhjetë', 'ninety (90)'), CARD('njëqind', 'one hundred (100)'),
  F('mijë', 'NUM', 'thousand (një mijë: one thousand)'),
];

const ORD_ROLE = 'ordinal number: written with a linking article (i parë, e parë, të parë) and agrees with its noun';
const ORD = (lemma: string, gloss: string, forms: string[]): SqLexeme => F(lemma, 'ADJ', gloss, forms, { articulated: true, role: ORD_ROLE });

export const ORDINALS: SqLexeme[] = [
  ORD('parë', 'first', ['parë: m f sg', 'parë: m pl', 'para: f pl']),
  ORD('dytë', 'second', ['dytë: sg pl']),
  ORD('tretë', 'third', ['tretë: sg pl']),
  ORD('katërt', 'fourth', ['katërt: sg pl']),
  ORD('pestë', 'fifth', ['pestë: sg pl']),
  ORD('gjashtë', 'sixth', ['gjashtë: sg pl']),
  ORD('shtatë', 'seventh', ['shtatë: sg pl']),
  ORD('tetë', 'eighth', ['tetë: sg pl']),
  ORD('nëntë', 'ninth', ['nëntë: sg pl']),
  ORD('dhjetë', 'tenth', ['dhjetë: sg pl']),
];

const PREP = (lemma: string, gloss: string, governs: NonNullable<SqLexeme['governs']>): SqLexeme =>
  F(lemma, 'ADP', gloss, undefined, { governs });

/** Single-word prepositions with the case they govern (the nominative for nga / te / tek, as the course's grammar states it). */
export const PREPOSITIONS: SqLexeme[] = [
  PREP('nga', 'from, by, of', 'Nom'), PREP('te', 'at, to (a person or a place)', 'Nom'), PREP('tek', 'at, to (a person or a place)', 'Nom'),
  PREP('në', 'in, into, to, at', 'Acc'), PREP('me', 'with, by means of', 'Acc'), PREP('për', 'for, about, to', 'Acc'),
  PREP('pa', 'without', 'Acc'), PREP('mbi', 'on, above, over', 'Acc'), PREP('nën', 'under, below', 'Acc'),
  PREP('ndër', 'among, in (plural)', 'Acc'), PREP('më', 'on (with a date)', 'Acc'), PREP('nëpër', 'through, along, around', 'Acc'),
  PREP('prej', 'from, by', 'Abl'), PREP('ndaj', 'towards, against, because of', 'Abl'), PREP('sipas', 'according to', 'Abl'),
  PREP('afër', 'near', 'Abl'), PREP('pranë', 'next to, near', 'Abl'), PREP('larg', 'far from', 'Abl'),
  PREP('para', 'before, in front of', 'Abl'), PREP('pas', 'after, behind', 'Abl'), PREP('përpara', 'in front of, before', 'Abl'),
  PREP('gjatë', 'during, along', 'Abl'), PREP('rreth', 'around, about', 'Abl'), PREP('drejt', 'towards', 'Abl'),
  PREP('kundër', 'against', 'Abl'), PREP('midis', 'between, among', 'Abl'), PREP('ndërmjet', 'between', 'Abl'),
  // the ladder plan's additions (data/ladder/sq/PLAN-A1-2-A2.md section 6.1)
  PREP('mes', 'in the middle of, between', 'Abl'), PREP('përmes', 'through, by means of', 'Abl'),
  PREP('përgjatë', 'along', 'Abl'), PREP('përveç', 'except, besides', 'Abl'),
  // deri: "deri në Tiranë", "deri sot": it stands before another preposition or an adverb, so it names no case of its own
  F('deri', 'ADP', 'until, up to, as far as'),
];

/** The prepositions that are also adverbs (afër = near, as in "jam afër"). Read after the preposition. */
export const PREPOSITION_ADVERBS: SqLexeme[] = [
  F('afër', 'ADV', 'near, close'), F('larg', 'ADV', 'far, far away'), F('pranë', 'ADV', 'near, close by'),
  F('përpara', 'ADV', 'ahead, in front'), F('drejt', 'ADV', 'straight, directly'), F('rreth', 'ADV', 'about, approximately'),
  F('kundër', 'ADV', 'against'),
];

export const CONJUNCTIONS: SqLexeme[] = [
  F('dhe', 'CONJ', 'and'), F('e', 'CONJ', 'and'), F('edhe', 'CONJ', 'and, also, even'), F('por', 'CONJ', 'but'),
  F('ose', 'CONJ', 'or'), F('apo', 'CONJ', 'or (between questions or alternatives)'),
  F('prandaj', 'CONJ', 'therefore, that is why'), F('pra', 'CONJ', 'so, therefore, in other words'),
  F('se', 'SCONJ', 'that; than'), F('që', 'SCONJ', 'that'), F('sepse', 'SCONJ', 'because'), F('kur', 'SCONJ', 'when'),
  F('nëse', 'SCONJ', 'if'), F('megjithëse', 'SCONJ', 'although'), F('ndërsa', 'SCONJ', 'while, whereas'),
  F('sa', 'SCONJ', 'as much as, as many as'), F('si', 'SCONJ', 'as, like'), F('derisa', 'SCONJ', 'until, while'),
  // the ladder plan's additions (data/ladder/sq/PLAN-A1-2-A2.md section 6.1)
  F('mirëpo', 'CONJ', 'but, however'), F('siç', 'CONJ', 'as, the way (siç thotë: as he says)'), F('pasi', 'SCONJ', 'after, since (conjunction)'),
];

export const PARTICLES: SqLexeme[] = [
  F('nuk', 'PART', 'not', ['nuk', "s'"], { role: "negation of a verb; s' is its short form before a vowel or j (s'jam, s'ka)" }),
  F('mos', 'PART', 'not, do not', undefined, { role: 'negation in a command or a wish (mos shko: do not go; mos qofsha)' }),
  F('po', 'PART', 'progressive particle', undefined, { role: 'marks an action going on now (po lexoj: I am reading)' }),
  F('po', 'INTJ', 'yes'),
  F('do', 'PART', 'future particle', undefined, { role: 'future particle: do të punoj = I will work (do is also a form of the verb dua)' }),
  F('të', 'PART', 'subjunctive particle', undefined, {
    role: 'subjunctive particle: introduces the subjunctive (dua të punoj) and, after për, the "to do" phrase (për të punuar)',
  }),
  F('duke', 'PART', '-ing, while doing', undefined, { role: 'with a participle: the action in progress (duke punuar: working)' }),
  F('pa', 'PART', 'without doing', undefined, { role: 'before a participle: pa ngrënë = without eating' }),
  F('le', 'PART', 'let', undefined, { role: 'introduces a request or permission: le të punojmë = let us work' }),
  F('u', 'PART', 'non-active particle', undefined, {
    role: 'non-active particle: with the aorist (u lava: I washed myself) and with a participle after të (për t\'u larë)',
  }),
  F('a', 'PART', 'question particle', undefined, { role: 'opens a yes / no question: a vjen? = is he coming?' }),
  F('më', 'ADV', 'more', undefined, { role: 'comparative word: more (më shumë: more); with an adjective it builds the comparative' }),
  F('jo', 'INTJ', 'no'),
  F('ja', 'PART', 'here is, there is; look', undefined, { role: 'points at something: ja libri = here is the book' }),
];

/**
 * The two modal words that stand before të + a verb. Both are also forms of full verbs (mund / mundem, to defeat, to
 * be able; duhem, to be needed), which the word list reads beside them.
 */
export const MODALS: SqLexeme[] = [
  F('mund', 'VERB', 'can, may, to be able', undefined, { role: 'modal: stands unchanged before të + a verb (mund të vij: I can come)' }),
  F('duhem', 'VERB', 'to be needed; must, have to', ['duhet: 3 sg pres ind mid', 'duhen: 3 pl pres ind mid', 'duhej: 3 sg impf ind mid'], {
    role: 'modal: duhet të + a verb (duhet të punoj: I must work)',
  }),
];

/** The pointing adverbs of place and manner. */
export const DEICTIC_ADVERBS: SqLexeme[] = [
  F('këtu', 'ADV', 'here'), F('aty', 'ADV', 'there (near you)'), F('atje', 'ADV', 'there, over there'),
  F('kështu', 'ADV', 'like this, so'), F('ashtu', 'ADV', 'like that, so'),
];

/** Greetings and thanks: one word each, said as a whole. */
export const GREETINGS: SqLexeme[] = [
  F('mirëmëngjes', 'INTJ', 'good morning'), F('mirëdita', 'INTJ', 'good day, hello'), F('mirëmbrëma', 'INTJ', 'good evening'),
  F('mirupafshim', 'INTJ', 'goodbye'), F('tungjatjeta', 'INTJ', 'hello; goodbye (a long life to you)'),
  F('faleminderit', 'INTJ', 'thank you'), F('përshëndetje', 'INTJ', 'hello, greetings'),
];

/**
 * Abbreviations of running text, read as the words they stand for. They are not words of the language, but they are not
 * unknown either: a learner does not "learn" km or etj. Part of speech 'X', `role` 'abbreviation', no inflection. The
 * letter m (metre) is read only after a figure, by the sentence layer (sentence-clause.ts): a bare m is no abbreviation.
 * The full stop after an abbreviation is a separate token; p.sh and p.e.s are single tokens.
 */
const ABBR = (lemma: string, gloss: string): SqLexeme => F(lemma, 'X', gloss, undefined, { role: 'abbreviation' });

export const ABBREVIATIONS: SqLexeme[] = [
  ABBR('km', 'km, kilometre(s)'), ABBR('cm', 'cm, centimetre(s)'), ABBR('mm', 'mm, millimetre(s)'), ABBR('kg', 'kg, kilogram(s)'),
  ABBR('shek', 'shek., century (shekulli)'), ABBR('etj', 'etj., and so on (e të tjera)'),
  ABBR('p.sh', 'p.sh., for example (për shembull)'), ABBR('p.e.s', 'p.e.s., before our era (para erës sonë)'),
  ABBR('e.s', 'e.s., of our era (erës sonë)'), ABBR('vj', 'vj., years (vjet)'), ABBR('nr', 'nr., number (numri)'),
  ABBR('fq', 'fq., page (faqe)'), ABBR('prof', 'prof., professor'), ABBR('dr', 'Dr., doctor'),
];
