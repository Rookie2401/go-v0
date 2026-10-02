/**
 * German closed classes: articles, determiners, pronouns (every form with all its cells), prepositions with the cases
 * they govern, contractions, and the uninflected function words (conjunctions, particles, interjections, numerals,
 * names) as rows. MACHINE-DRAFTED, NOT CHECKED BY A NATIVE SPEAKER.
 *
 * The case / gender / number paradigms are built from three small tables below (strong, weak-adjective-style and
 * mixed endings) instead of being typed form by form. A form that belongs to several cells (dieser: Nom masc, Dat
 * fem, Gen fem, Gen plural) is ONE entry with all its cells; the sentence layer narrows them. `form` is always the
 * lower-case written form (the adapter looks words up lower-cased); `lemma` keeps its capital letter (Sie, Ihr).
 * Older "daß" is not listed here.
 */
import type { PartOfSpeech } from '../../core';
import type { DeCase, DeCell, DeClosedForm, DeContraction, DePreposition } from './types';

type G = 'm' | 'f' | 'n' | 'p';
type EndingTable = Record<G, Record<DeCase, string>>;

/** The strong ("dieser") endings. */
const STRONG: EndingTable = {
  m: { N: 'er', A: 'en', D: 'em', G: 'es' },
  f: { N: 'e', A: 'e', D: 'er', G: 'er' },
  n: { N: 'es', A: 'es', D: 'em', G: 'es' },
  p: { N: 'e', A: 'e', D: 'en', G: 'er' },
};
/** The mixed ("ein / kein / mein") endings: no ending in the nominative masculine and the nominative / accusative neuter. */
const MIXED: EndingTable = {
  m: { ...STRONG.m, N: '' },
  f: STRONG.f,
  n: { ...STRONG.n, N: '', A: '' },
  p: STRONG.p,
};

const CASES: DeCase[] = ['N', 'A', 'D', 'G'];

function addCell(map: Map<string, DeCell[]>, form: string, c: DeCase, g: G): void {
  const list = map.get(form) ?? [];
  if (!list.some((x) => x.c === c && x.g === g)) list.push({ c, g });
  map.set(form, list);
}

/** All forms of a declining word: `forms(ending)` gives the written form(s) for one ending. */
function paradigm(table: EndingTable, genders: readonly G[], forms: (ending: string) => string[]): Map<string, DeCell[]> {
  const map = new Map<string, DeCell[]>();
  for (const g of genders) for (const c of CASES) for (const f of forms(table[g][c])) addCell(map, f, c, g);
  return map;
}

function fromTable(
  map: Map<string, DeCell[]>, lemma: string, pos: PartOfSpeech, gloss: string, morph: Record<string, string>,
  extra: Partial<Pick<DeClosedForm, 'governsDecl' | 'role'>> = {},
): DeClosedForm[] {
  const out: DeClosedForm[] = [];
  for (const [form, cells] of map) out.push({ form, lemma, pos, gloss, cells: cells.map((c) => ({ ...c })), morph: { ...morph }, ...extra });
  return out;
}

/** Cells listed by hand: "form: N m, D f, …". */
function explicit(lemma: string, pos: PartOfSpeech, gloss: string, morph: Record<string, string>, spec: Record<string, Array<[DeCase, G]>>, extra: Partial<Pick<DeClosedForm, 'governsDecl' | 'role'>> = {}): DeClosedForm[] {
  const map = new Map<string, DeCell[]>();
  for (const [form, cells] of Object.entries(spec)) for (const [c, g] of cells) addCell(map, form, c, g);
  return fromTable(map, lemma, pos, gloss, morph, extra);
}

const out: DeClosedForm[] = [];

// ── the definite article, and the same forms as relative and demonstrative pronouns
out.push(...explicit('der', 'DET', 'the', { PronType: 'Art', Definite: 'Def' }, {
  der: [['N', 'm'], ['D', 'f'], ['G', 'f'], ['G', 'p']],
  die: [['N', 'f'], ['A', 'f'], ['N', 'p'], ['A', 'p']],
  das: [['N', 'n'], ['A', 'n']],
  dem: [['D', 'm'], ['D', 'n']],
  den: [['A', 'm'], ['D', 'p']],
  des: [['G', 'm'], ['G', 'n']],
}, { governsDecl: 'wk' }));
const RELATIVE_CELLS: Record<string, Array<[DeCase, G]>> = {
  der: [['N', 'm'], ['D', 'f']],
  die: [['N', 'f'], ['A', 'f'], ['N', 'p'], ['A', 'p']],
  das: [['N', 'n'], ['A', 'n']],
  dem: [['D', 'm'], ['D', 'n']],
  den: [['A', 'm']],
  dessen: [['G', 'm'], ['G', 'n']],
  deren: [['G', 'f'], ['G', 'p']],
  denen: [['D', 'p']],
};
out.push(...explicit('der', 'PRON', 'who; which; that (relative pronoun)', { PronType: 'Rel' }, RELATIVE_CELLS,
  { role: 'relative pronoun: begins a relative clause; the verb stands last; gender and number come from the noun it refers to, the case from its job inside the relative clause' }));
out.push(...explicit('der', 'PRON', 'that one; he; she; they (stressed, demonstrative)', { PronType: 'Dem' }, { ...RELATIVE_CELLS, derer: [['G', 'p']] },
  { role: 'demonstrative pronoun: points to someone or something already named (Der war gut = that one was good)' }));

// ── ein, kein, the possessives
const MIXED_THREE: G[] = ['m', 'f', 'n'];
const MIXED_FOUR: G[] = ['m', 'f', 'n', 'p'];
const plainStem = (stem: string) => (e: string) => [stem + e];
out.push(...fromTable(paradigm(MIXED, MIXED_THREE, plainStem('ein')), 'ein', 'DET', 'a; an', { PronType: 'Art', Definite: 'Ind' }, { governsDecl: 'mx' }));
out.push(...fromTable(paradigm(MIXED, MIXED_THREE, plainStem('ein')), 'ein', 'NUM', 'one', {}, { governsDecl: 'mx' }));
out.push(...fromTable(paradigm(MIXED, MIXED_FOUR, plainStem('kein')), 'kein', 'DET', 'no; not a; not any', { PronType: 'Neg' }, { governsDecl: 'mx' }));

interface Poss { lemma: string; gloss: string; person: string; number: string; stem: (e: string) => string[]; polite?: boolean }
const POSSESSIVES: Poss[] = [
  { lemma: 'mein', gloss: 'my', person: '1', number: 'Sing', stem: plainStem('mein') },
  { lemma: 'dein', gloss: 'your (informal, one person)', person: '2', number: 'Sing', stem: plainStem('dein') },
  { lemma: 'sein', gloss: 'his; its', person: '3', number: 'Sing', stem: plainStem('sein') },
  { lemma: 'ihr', gloss: 'her; their', person: '3', number: 'Sing,Plur', stem: plainStem('ihr') },
  { lemma: 'unser', gloss: 'our', person: '1', number: 'Plur', stem: (e) => (e ? [`unser${e}`, `unsr${e}`] : ['unser']) },
  { lemma: 'euer', gloss: 'your (informal, several people)', person: '2', number: 'Plur', stem: (e) => (e ? [`eur${e}`] : ['euer']) },
  { lemma: 'Ihr', gloss: 'your (formal)', person: '2', number: 'Sing,Plur', stem: plainStem('ihr'), polite: true },
];
for (const p of POSSESSIVES) {
  const morph: Record<string, string> = { PronType: 'Prs', Poss: 'Yes', 'Person[psor]': p.person, 'Number[psor]': p.number };
  if (p.polite) morph.Polite = 'Form';
  out.push(...fromTable(paradigm(MIXED, MIXED_FOUR, p.stem), p.lemma, 'DET', p.gloss, morph, { governsDecl: 'mx' }));
}

// ── dieser-type words: strong endings, the adjective after them is weak
interface Strong { lemma: string; stem: string; gloss: string; pronType: string; genders: G[]; extra?: Record<string, Array<[DeCase, G]>>; both?: boolean; weak?: boolean }
const STRONG_WORDS: Strong[] = [
  { lemma: 'dieser', stem: 'dies', gloss: 'this; these', pronType: 'Dem', genders: ['m', 'f', 'n', 'p'], both: true, weak: true },
  { lemma: 'jener', stem: 'jen', gloss: 'that; those (over there; the former)', pronType: 'Dem', genders: ['m', 'f', 'n', 'p'], both: true, weak: true },
  { lemma: 'jeder', stem: 'jed', gloss: 'every; each; everyone', pronType: 'Ind', genders: ['m', 'f', 'n'], both: true, weak: true },
  { lemma: 'jeglicher', stem: 'jeglich', gloss: 'each; every; any (older, literary)', pronType: 'Ind', genders: ['m', 'f', 'n'], both: true, weak: true },
  { lemma: 'welcher', stem: 'welch', gloss: 'which; what', pronType: 'Int', genders: ['m', 'f', 'n', 'p'], both: true, weak: true },
  { lemma: 'mancher', stem: 'manch', gloss: 'some; many a', pronType: 'Ind', genders: ['m', 'f', 'n', 'p'], both: true, weak: true },
  { lemma: 'solcher', stem: 'solch', gloss: 'such', pronType: 'Dem', genders: ['m', 'f', 'n', 'p'], weak: true },
  { lemma: 'alle', stem: 'all', gloss: 'all; everyone; everything', pronType: 'Ind', genders: ['m', 'f', 'n', 'p'], both: true, weak: true },
  { lemma: 'beide', stem: 'beid', gloss: 'both', pronType: 'Ind', genders: ['p'], extra: { beides: [['N', 'n'], ['A', 'n']] }, both: true, weak: true },
  { lemma: 'einige', stem: 'einig', gloss: 'some; a few', pronType: 'Ind', genders: ['p'], extra: { einiges: [['N', 'n'], ['A', 'n']] }, both: true },
  { lemma: 'mehrere', stem: 'mehrer', gloss: 'several', pronType: 'Ind', genders: ['p'], extra: { mehreres: [['N', 'n'], ['A', 'n']] }, both: true },
  { lemma: 'viele', stem: 'viel', gloss: 'many; much', pronType: 'Ind', genders: ['p'], extra: { vieles: [['N', 'n'], ['A', 'n']] }, both: true },
  { lemma: 'wenige', stem: 'wenig', gloss: 'few; little', pronType: 'Ind', genders: ['p'], extra: { weniges: [['N', 'n'], ['A', 'n']] }, both: true },
];
for (const w of STRONG_WORDS) {
  const map = paradigm(STRONG, w.genders, (e) => [w.stem + e]);
  if (w.extra) for (const [form, cells] of Object.entries(w.extra)) for (const [c, g] of cells) addCell(map, form, c, g);
  out.push(...fromTable(map, w.lemma, 'DET', w.gloss, { PronType: w.pronType }, w.weak ? { governsDecl: 'wk' } : {}));
  if (w.both) out.push(...fromTable(map, w.lemma, 'PRON', w.gloss, { PronType: w.pronType }));
}
// "dies" (this; uninflected pronoun), "viel", "wenig" (uninflected quantifiers before a noun without article)
out.push(...explicit('dieser', 'PRON', 'this (uninflected)', { PronType: 'Dem' }, { dies: [['N', 'n'], ['A', 'n']] }));
for (const [form, gloss] of [['viel', 'much; a lot of'], ['wenig', 'little; not much']] as const) {
  out.push({ form, lemma: form, pos: 'DET', gloss, morph: { PronType: 'Ind', Number: 'Sing' } });
  out.push({ form, lemma: form, pos: 'PRON', gloss, morph: { PronType: 'Ind', Number: 'Sing' } });
}

// ── personal, reflexive, interrogative and indefinite pronouns (no gender cells: case, person and number in `morph`)
function prs(form: string, lemma: string, gloss: string, morph: Record<string, string>, role?: string): void {
  out.push({ form, lemma, pos: 'PRON', gloss, morph: { PronType: 'Prs', ...morph }, ...(role ? { role } : {}) });
}
const REFL = 'also the reflexive pronoun: ich freue mich = I am glad';
prs('ich', 'ich', 'I', { Person: '1', Number: 'Sing', Case: 'Nom' });
prs('mich', 'ich', 'me', { Person: '1', Number: 'Sing', Case: 'Acc' }, REFL);
prs('mir', 'ich', 'me; to me', { Person: '1', Number: 'Sing', Case: 'Dat' }, 'also the reflexive pronoun in the dative: ich kaufe mir ein Buch');
prs('meiner', 'ich', 'of me (genitive, rare)', { Person: '1', Number: 'Sing', Case: 'Gen' });
prs('du', 'du', 'you (informal, one person)', { Person: '2', Number: 'Sing', Case: 'Nom' });
prs('dich', 'du', 'you', { Person: '2', Number: 'Sing', Case: 'Acc' }, REFL);
prs('dir', 'du', 'you; to you', { Person: '2', Number: 'Sing', Case: 'Dat' }, 'also the reflexive pronoun in the dative');
prs('deiner', 'du', 'of you (genitive, rare)', { Person: '2', Number: 'Sing', Case: 'Gen' });
prs('er', 'er', 'he; it (masculine)', { Person: '3', Number: 'Sing', Gender: 'Masc', Case: 'Nom' });
prs('ihn', 'er', 'him; it (masculine)', { Person: '3', Number: 'Sing', Gender: 'Masc', Case: 'Acc' });
prs('ihm', 'er', 'him; to him; it', { Person: '3', Number: 'Sing', Gender: 'Masc,Neut', Case: 'Dat' });
prs('seiner', 'er', 'of him; of it (genitive, rare)', { Person: '3', Number: 'Sing', Gender: 'Masc,Neut', Case: 'Gen' });
prs('es', 'es', 'it', { Person: '3', Number: 'Sing', Gender: 'Neut', Case: 'Nom,Acc' }, 'also the empty subject: es regnet = it is raining');
prs('sie', 'sie', 'she; her; it (feminine)', { Person: '3', Number: 'Sing', Gender: 'Fem', Case: 'Nom,Acc' });
prs('ihr', 'sie', 'to her; her; it (feminine)', { Person: '3', Number: 'Sing', Gender: 'Fem', Case: 'Dat' });
prs('ihrer', 'sie', 'of her; of them (genitive, rare)', { Person: '3', Number: 'Sing,Plur', Case: 'Gen' });
prs('wir', 'wir', 'we', { Person: '1', Number: 'Plur', Case: 'Nom' });
prs('uns', 'wir', 'us; to us', { Person: '1', Number: 'Plur', Case: 'Acc,Dat' }, 'also the reflexive pronoun: wir freuen uns');
prs('unser', 'wir', 'of us (genitive, rare)', { Person: '1', Number: 'Plur', Case: 'Gen' });
prs('ihr', 'ihr', 'you (informal, several people)', { Person: '2', Number: 'Plur', Case: 'Nom' });
prs('euch', 'ihr', 'you; to you (several people)', { Person: '2', Number: 'Plur', Case: 'Acc,Dat' }, 'also the reflexive pronoun: ihr freut euch');
prs('euer', 'ihr', 'of you (genitive, rare)', { Person: '2', Number: 'Plur', Case: 'Gen' });
prs('sie', 'sie', 'they; them', { Person: '3', Number: 'Plur', Case: 'Nom,Acc' });
prs('ihnen', 'sie', 'to them; them', { Person: '3', Number: 'Plur', Case: 'Dat' });
prs('sie', 'Sie', 'you (formal, written with a capital letter)', { Person: '2', Number: 'Sing,Plur', Case: 'Nom,Acc', Polite: 'Form' },
  'the formal "you": the same form as "they", always written Sie');
prs('ihnen', 'Sie', 'to you (formal)', { Person: '2', Number: 'Sing,Plur', Case: 'Dat', Polite: 'Form' }, 'the formal "you" in the dative, written Ihnen');
prs('ihrer', 'Sie', 'of you (formal, genitive, rare)', { Person: '2', Number: 'Sing,Plur', Case: 'Gen', Polite: 'Form' });
out.push({ form: 'sich', lemma: 'sich', pos: 'PRON', gloss: 'himself; herself; itself; themselves; yourself (formal)',
  morph: { PronType: 'Prs', Reflex: 'Yes', Person: '3', Case: 'Acc,Dat' }, role: 'reflexive pronoun of the third person and of the formal "you"; it goes with reflexive verbs (sich freuen) and with "each other"' });

function ind(form: string, lemma: string, gloss: string, morph: Record<string, string>, pos: PartOfSpeech = 'PRON'): void {
  out.push({ form, lemma, pos, gloss, morph });
}
ind('wer', 'wer', 'who', { PronType: 'Rel,Int', Number: 'Sing', Case: 'Nom' });
ind('wen', 'wer', 'whom', { PronType: 'Rel,Int', Number: 'Sing', Case: 'Acc' });
ind('wem', 'wer', 'to whom', { PronType: 'Rel,Int', Number: 'Sing', Case: 'Dat' });
ind('wessen', 'wer', 'whose', { PronType: 'Rel,Int', Number: 'Sing', Case: 'Gen' });
ind('was', 'was', 'what; which; that', { PronType: 'Rel,Int', Number: 'Sing', Gender: 'Neut', Case: 'Nom,Acc' });
ind('man', 'man', 'one; you; they; people (impersonal)', { PronType: 'Ind', Person: '3', Number: 'Sing', Case: 'Nom' });
for (const [lemma, gloss, pt] of [['jemand', 'someone; anyone', 'Ind'], ['niemand', 'no one; nobody', 'Neg']] as const) {
  ind(lemma, lemma, gloss, { PronType: pt, Person: '3', Number: 'Sing', Case: 'Nom,Acc,Dat' });
  ind(`${lemma}en`, lemma, gloss, { PronType: pt, Person: '3', Number: 'Sing', Case: 'Acc' });
  ind(`${lemma}em`, lemma, gloss, { PronType: pt, Person: '3', Number: 'Sing', Case: 'Dat' });
  ind(`${lemma}es`, lemma, gloss, { PronType: pt, Person: '3', Number: 'Sing', Case: 'Gen' });
  ind(`${lemma}s`, lemma, gloss, { PronType: pt, Person: '3', Number: 'Sing', Case: 'Gen' });
}
ind('etwas', 'etwas', 'something; some; a little', { PronType: 'Ind', Number: 'Sing', Gender: 'Neut', Case: 'Nom,Acc' });
ind('nichts', 'nichts', 'nothing', { PronType: 'Neg', Number: 'Sing', Gender: 'Neut', Case: 'Nom,Acc' });
ind('jedermann', 'jedermann', 'everyone; everybody', { PronType: 'Ind', Number: 'Sing', Case: 'Nom,Acc,Dat' });

// ── prepositions
export const PREPOSITIONS: DePreposition[] = [
  // accusative
  { form: 'durch', cases: ['A'], gloss: 'through; by' },
  { form: 'für', cases: ['A'], gloss: 'for' },
  { form: 'gegen', cases: ['A'], gloss: 'against; towards; about (time)' },
  { form: 'ohne', cases: ['A'], gloss: 'without' },
  { form: 'um', cases: ['A'], gloss: 'around; at (a time); about' },
  { form: 'bis', cases: ['A'], gloss: 'until; as far as; by' },
  { form: 'entlang', cases: ['A'], gloss: 'along (after its noun: die Straße entlang)' },
  { form: 'wider', cases: ['A'], gloss: 'against; contrary to' },
  { form: 'per', cases: ['A'], gloss: 'by (means of); per' },
  { form: 'pro', cases: ['A'], gloss: 'per' },
  // dative
  { form: 'aus', cases: ['D'], gloss: 'out of; from; made of' },
  { form: 'außer', cases: ['D'], gloss: 'except; apart from; out of' },
  { form: 'bei', cases: ['D'], gloss: 'at; near; with; at the home of' },
  { form: 'mit', cases: ['D'], gloss: 'with; by (means of)' },
  { form: 'nach', cases: ['D'], gloss: 'after; to; according to' },
  { form: 'seit', cases: ['D'], gloss: 'since; for (a period up to now)' },
  { form: 'von', cases: ['D'], gloss: 'from; of; by' },
  { form: 'zu', cases: ['D'], gloss: 'to; at; for' },
  { form: 'gegenüber', cases: ['D'], gloss: 'opposite; towards; compared with' },
  { form: 'ab', cases: ['D'], gloss: 'from; as of' },
  { form: 'entgegen', cases: ['D'], gloss: 'contrary to; towards' },
  { form: 'gemäß', cases: ['D'], gloss: 'according to' },
  { form: 'samt', cases: ['D'], gloss: 'together with' },
  { form: 'nebst', cases: ['D'], gloss: 'along with' },
  { form: 'zuliebe', cases: ['D'], gloss: 'for the sake of' },
  { form: 'dank', cases: ['D', 'G'], gloss: 'thanks to' },
  { form: 'binnen', cases: ['D', 'G'], gloss: 'within (a period)' },
  // two-way: accusative for movement towards, dative for position
  { form: 'an', cases: ['A', 'D'], gloss: 'on; at; to (vertical surface, edge)' },
  { form: 'auf', cases: ['A', 'D'], gloss: 'on; onto; to (an event, an office)' },
  { form: 'hinter', cases: ['A', 'D'], gloss: 'behind' },
  { form: 'in', cases: ['A', 'D'], gloss: 'in; into' },
  { form: 'neben', cases: ['A', 'D'], gloss: 'next to; beside' },
  { form: 'über', cases: ['A', 'D'], gloss: 'over; above; across; about' },
  { form: 'unter', cases: ['A', 'D'], gloss: 'under; among; below' },
  { form: 'vor', cases: ['A', 'D'], gloss: 'in front of; before; ago' },
  { form: 'zwischen', cases: ['A', 'D'], gloss: 'between' },
  // genitive
  { form: 'wegen', cases: ['G'], gloss: 'because of' },
  { form: 'während', cases: ['G'], gloss: 'during' },
  { form: 'trotz', cases: ['G'], gloss: 'despite; in spite of' },
  { form: 'statt', cases: ['G'], gloss: 'instead of' },
  { form: 'anstatt', cases: ['G'], gloss: 'instead of' },
  { form: 'innerhalb', cases: ['G'], gloss: 'within; inside' },
  { form: 'außerhalb', cases: ['G'], gloss: 'outside of' },
  { form: 'oberhalb', cases: ['G'], gloss: 'above' },
  { form: 'unterhalb', cases: ['G'], gloss: 'below' },
  { form: 'diesseits', cases: ['G'], gloss: 'on this side of' },
  { form: 'jenseits', cases: ['G'], gloss: 'on the far side of; beyond' },
  { form: 'aufgrund', cases: ['G'], gloss: 'because of; on the basis of' },
  { form: 'anlässlich', cases: ['G'], gloss: 'on the occasion of' },
  { form: 'angesichts', cases: ['G'], gloss: 'in view of' },
  { form: 'mithilfe', cases: ['G'], gloss: 'with the help of' },
  { form: 'mittels', cases: ['G'], gloss: 'by means of' },
  { form: 'laut', cases: ['G', 'D'], gloss: 'according to' },
  { form: 'infolge', cases: ['G'], gloss: 'as a result of' },
  { form: 'bezüglich', cases: ['G'], gloss: 'regarding' },
  { form: 'hinsichtlich', cases: ['G'], gloss: 'with regard to' },
  { form: 'abseits', cases: ['G'], gloss: 'away from' },
  { form: 'unweit', cases: ['G'], gloss: 'not far from' },
  { form: 'längs', cases: ['G', 'D'], gloss: 'along' },
];

// ── contractions of a preposition with the definite article. `cell` is the first cell of the article; for "dem" the
// article also stands for the neuter dative (im Haus, im Auto), which the article's own cells show.
const DEM: DeCell = { c: 'D', g: 'm' };
const DAS: DeCell = { c: 'A', g: 'n' };
const DER: DeCell = { c: 'D', g: 'f' };
export const CONTRACTIONS: DeContraction[] = [
  { form: 'am', preposition: 'an', article: 'dem', cell: DEM, gloss: 'at the; on the' },
  { form: 'ans', preposition: 'an', article: 'das', cell: DAS, gloss: 'to the; onto the' },
  { form: 'aufs', preposition: 'auf', article: 'das', cell: DAS, gloss: 'onto the' },
  { form: 'beim', preposition: 'bei', article: 'dem', cell: DEM, gloss: 'at the; while' },
  { form: 'im', preposition: 'in', article: 'dem', cell: DEM, gloss: 'in the' },
  { form: 'ins', preposition: 'in', article: 'das', cell: DAS, gloss: 'into the' },
  { form: 'vom', preposition: 'von', article: 'dem', cell: DEM, gloss: 'from the; of the; by the' },
  { form: 'zum', preposition: 'zu', article: 'dem', cell: DEM, gloss: 'to the; for the' },
  { form: 'zur', preposition: 'zu', article: 'der', cell: DER, gloss: 'to the; for the (feminine)' },
  { form: 'fürs', preposition: 'für', article: 'das', cell: DAS, gloss: 'for the' },
  { form: 'durchs', preposition: 'durch', article: 'das', cell: DAS, gloss: 'through the' },
  { form: 'ums', preposition: 'um', article: 'das', cell: DAS, gloss: 'around the' },
  { form: 'übers', preposition: 'über', article: 'das', cell: DAS, gloss: 'over the; about the' },
  { form: 'unters', preposition: 'unter', article: 'das', cell: DAS, gloss: 'under the' },
  { form: 'vorm', preposition: 'vor', article: 'dem', cell: DEM, gloss: 'in front of the' },
  { form: 'hinterm', preposition: 'hinter', article: 'dem', cell: DEM, gloss: 'behind the' },
  { form: 'überm', preposition: 'über', article: 'dem', cell: DEM, gloss: 'above the' },
  { form: 'unterm', preposition: 'unter', article: 'dem', cell: DEM, gloss: 'under the' },
  { form: 'hinters', preposition: 'hinter', article: 'das', cell: DAS, gloss: 'behind the (movement)' },
  { form: 'vors', preposition: 'vor', article: 'das', cell: DAS, gloss: 'in front of the (movement)' },
];

/** Every closed form built above (the articles, determiners and pronouns). */
export const CLOSED_FORMS: readonly DeClosedForm[] = out;

// ── uninflected function words, as rows (parsed by lexicon.ts with the row parser)
export const FUNCTION_ROWS = `
# CONJ
und = and
oder = or
denn = for; because (coordinating)
sondern = but rather; but (after a negative)
doch = but; yet
aber = but
sowie = as well as; and
sowohl = both (in sowohl … als auch)
entweder = either (in entweder … oder)
weder = neither (in weder … noch)
noch = nor (in weder … noch)
beziehungsweise = or rather; respectively
als = than; as (after a comparative, or "as a child")
wie = as; like (in a comparison)
# SCONJ
dass = that
weil = because
wenn = if; when; whenever
als = when (a single event in the past)
ob = whether; if
obwohl = although
obgleich = although
obschon = although
wenngleich = although
während = while; whereas
bevor = before
ehe = before
nachdem = after
damit = so that
sodass = so that; with the result that
seit = since (a point in time)
seitdem = since
bis = until
da = since; because
falls = in case; if
indem = by (doing); while
sobald = as soon as
solange = as long as; while
sofern = provided that
soweit = as far as
zumal = especially since
wohingegen = whereas
# ADV
seitdem = since then
je = ever; each; the (in je … desto)
desto = the (in je … desto: the more … the more)
umso = all the (umso mehr: all the more)
# ADP
willen = for the sake of (um … willen; um des Herrn willen)
# DET
allerlei = all kinds of; of every sort
# PART
zu = to | role: the infinitive marker; it stands before the infinitive (Ich habe Lust, ihn zu sehen) and inside a separable verb (aufzustehen)
nicht = not | role: negates the verb, a whole clause or the word it stands before
doch = (modal particle) | role: contradicts a negative question or statement ("Du kommst nicht?" "Doch!"); in a request or advice it urges or softens (Komm doch!); in a statement it reminds the listener of something they know (Das weiß ich doch)
mal = (modal particle) | role: makes a request or suggestion casual, as if it were a small thing (Komm mal her; Sag mal ...)
eben = (modal particle) | role: marks something as plain fact that cannot be changed, often with a note of resignation (Es ist eben so)
halt = (modal particle) | role: the same job as eben, more colloquial and southern: that is just how it is (Das ist halt so) [colloquial]
ja = (modal particle) | role: marks something as already known or obvious to both speakers (Das ist ja schön); can show mild surprise; in a command it is a stern warning (Vergiss es ja nicht!)
wohl = (modal particle) | role: marks a supposition, "I suppose; probably" (Er ist wohl krank)
schon = (modal particle) | role: in a statement it reassures or concedes a point (Das wird schon gehen = it will work out; Er ist schon nett, aber ... = he is nice, granted, but ...); in a question it hints that the answer is no (Wer weiß das schon?)
denn = (modal particle) | role: in a question it shows interest, impatience or surprise and makes the question less blunt (Was machst du denn da?)
eigentlich = (modal particle) | role: in a question it opens a side topic or softens a challenge (Wie alt bist du eigentlich?); in a statement it means "when you come to think of it"
einfach = (modal particle) | role: stresses that something is simple or beyond argument (Das ist einfach super; Ich kann es einfach nicht)
ruhig = (modal particle) | role: in a request or permission it says there is no need to hold back: go ahead, feel free (Fragen Sie ruhig!)
bloß = (modal particle) | role: in a wish, warning or exasperated question it adds intensity (Lass das bloß!; Wie konnte das bloß passieren?)
nur = (modal particle) | role: strengthens a wish, a warning or an exasperated question, like bloß (Was soll ich nur tun?)
auch = (modal particle) | role: confirms that the fact is what one expected (Du hast auch immer Pech!); in a question it asks the listener to confirm (Hast du auch daran gedacht?)
aber = (modal particle) | role: in an exclamation it expresses surprise at a high degree (Das ist aber schön!); in a command it adds a mild objection
vielleicht = (modal particle) | role: in an exclamation it says something is extreme (Das war vielleicht ein Tag!); in a request it makes it polite (Könntest du mir vielleicht helfen?)
etwa = (modal particle) | role: in a yes-or-no question it expects the answer no or shows worry (Hast du etwa schon gegessen? = you haven't already eaten, have you?)
# INTJ
hallo = hello
tschüss = goodbye; bye
tschau = bye [colloquial]
servus = hello; goodbye [colloquial]
moin = hello (northern Germany) [colloquial]
danke = thank you; thanks
bitte = please; you're welcome; pardon
ach = oh; ah
oh = oh
na = well; so
hey = hey
juhu = hooray
aha = I see
au = ouch
hm = hmm
ups = oops
pfui = ugh; shame
igitt = yuck
hurra = hurray
prost = cheers
gesundheit = bless you
tja = well (resigned)
naja = oh well [colloquial]
okay = okay [colloquial]
bravo = well done; bravo
hoppla = whoops
mensch = wow; gosh; man alive [colloquial]
ja = yes
nein = no
amen = amen [religious]
halleluja = hallelujah [religious]
halt = stop!
siehe = behold; look; see (also the imperative of sehen) [literary]
# NUM
null = zero
eins = one
zwei = two
drei = three
vier = four
fünf = five
sechs = six
sieben = seven
acht = eight
neun = nine
zehn = ten
elf = eleven
zwölf = twelve
dreizehn = thirteen
vierzehn = fourteen
fünfzehn = fifteen
sechzehn = sixteen
siebzehn = seventeen
achtzehn = eighteen
neunzehn = nineteen
zwanzig = twenty
dreißig = thirty
vierzig = forty
fünfzig = fifty
sechzig = sixty
siebzig = seventy
achtzig = eighty
neunzig = ninety
hundert = hundred
tausend = thousand
# PRON
einander = each other; one another
irgendetwas = something or other; anything
irgendwas = something or other; anything [colloquial]
irgendjemand = someone or other; anyone
irgendwer = someone or other; anyone
# PROPN
Deutschland = Germany
Österreich = Austria
Schweiz = Switzerland
Europa = Europe
Berlin = Berlin (capital of Germany)
München = Munich
Hamburg = Hamburg (city)
Köln = Cologne
Frankfurt = Frankfurt (city)
Stuttgart = Stuttgart (city)
Dresden = Dresden (city)
Leipzig = Leipzig (city)
Bonn = Bonn (city)
Wien = Vienna
Zürich = Zurich
Bayern = Bavaria
Sachsen = Saxony
Rhein = the Rhine
Jesus = Jesus
Christus = Christ
Maria = Mary; Maria (name)
Josef = Joseph
Johannes = John
Paulus = Paul (the apostle)
Petrus = Peter (the apostle)
Martin = Martin (male first name)
Anna = Anna (female first name)
Paul = Paul (male first name)
Peter = Peter (male first name)
Hans = Hans (male first name)
Thomas = Thomas (male first name)
Michael = Michael (male first name)
Andreas = Andreas (male first name)
Klaus = Klaus (male first name)
Karl = Karl (male first name)
Eva = Eva (female first name)
Sabine = Sabine (female first name)
Lena = Lena (female first name)
Lukas = Lukas (male first name)
Max = Max (male first name)
Luther = Luther (surname)
Jesu = of Jesus (genitive)
Christi = of Christ (genitive of Christus)
Joseph = Joseph (biblical personal name)
Jakob = Jacob (biblical personal name)
David = David (biblical personal name)
Abraham = Abraham (biblical personal name)
Isaak = Isaac (biblical personal name)
Juda = Judah (biblical personal name)
Perez = Perez (biblical personal name)
Hezron = Hezron (biblical personal name)
Ram = Ram (biblical personal name)
Amminadab = Amminadab (biblical personal name)
Nahesson = Nahshon (biblical personal name)
Salma = Salmon (biblical personal name)
Boas = Boaz (biblical personal name)
Obed = Obed (biblical personal name)
Jesse = Jesse (biblical personal name)
Salomo = Solomon (biblical personal name)
Rehabeam = Rehoboam (biblical personal name)
Abia = Abijah (biblical personal name)
Asa = Asa (biblical personal name)
Josaphat = Jehoshaphat (biblical personal name)
Joram = Joram (biblical personal name)
Usia = Uzziah (biblical personal name)
Jotham = Jotham (biblical personal name)
Ahas = Ahaz (biblical personal name)
Hiskia = Hezekiah (biblical personal name)
Manasse = Manasseh (biblical personal name)
Amon = Amon (biblical personal name)
Josia = Josiah (biblical personal name)
Jechonja = Jeconiah (biblical personal name)
Sealthiel = Shealtiel (biblical personal name)
Serubabel = Zerubbabel (biblical personal name)
Abiud = Abiud (biblical personal name)
Eliakim = Eliakim (biblical personal name)
Asor = Azor (biblical personal name)
Zadok = Zadok (biblical personal name)
Achim = Achim (biblical personal name)
Eliud = Eliud (biblical personal name)
Eleasar = Eleazar (biblical personal name)
Matthan = Matthan (biblical personal name)
Serah = Zerah (biblical personal name)
Thamar = Tamar (biblical personal name)
Rahab = Rahab (biblical personal name)
Ruth = Ruth (biblical personal name)
Uria = Uriah (biblical personal name)
Immanuel = Immanuel (biblical name)
Daniel = Daniel (personal name)
Jonas = Jonas; Jonah (personal name)
`;
