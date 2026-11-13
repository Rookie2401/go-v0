/**
 * Modern Greek σε + the article, written as one word (2026-11-13): στο, στον, στη(ν), στου, στης, στους, στις, στα, στων. They are among the
 * commonest written forms of the language (seven στο in one Wikipedia article) and no index holds them: the Wiktionary tables list the words a
 * contraction is made of, not the contraction. The list is closed and written by hand; a form not here is not read as one.
 *
 * A reading says what the word is: the preposition σε, with the article it carries as a part of the word (as Spanish del = de + el). The article's
 * case, number and gender are the contraction's own: στον is always masculine accusative singular. Where the same spelling serves two articles
 * (στο: neuter το, and masculine τον without its final ν; στου: masculine and neuter του) each is a reading, the usual one first. Nothing in
 * the sentence is consulted: there is no parser, so the noun that follows does not choose between them.
 */
import type { WordPart } from '../../core';

export interface SeArticle {
  /** The article as written apart from the preposition. */
  article: string;
  /** Its features (Case, Number, and Gender where the form has one). */
  morph: Record<string, string>;
  /** Said on a reading that is not the usual one. */
  note?: string;
}

const ART = (article: string, kase: 'Acc' | 'Gen', number: 'Sing' | 'Plur', gender?: 'Masc' | 'Fem' | 'Neut', note?: string): SeArticle => ({
  article, morph: { Case: kase, Number: number, ...(gender ? { Gender: gender } : {}), Definite: 'Def', PronType: 'Art' }, ...(note ? { note } : {}),
});

/** By the written form (monotonic, lower case). The first reading is the usual one. */
const SE_CONTRACTIONS: Readonly<Record<string, readonly SeArticle[]>> = {
  'στο': [ART('το', 'Acc', 'Sing', 'Neut'), ART('τον', 'Acc', 'Sing', 'Masc', 'the masculine τον written without its final ν (as before a consonant that does not keep it: στο δρόμο)')],
  'στον': [ART('τον', 'Acc', 'Sing', 'Masc')],
  'στη': [ART('την', 'Acc', 'Sing', 'Fem')],
  'στην': [ART('την', 'Acc', 'Sing', 'Fem')],
  'στου': [ART('του', 'Gen', 'Sing', 'Masc'), ART('του', 'Gen', 'Sing', 'Neut')],
  'στης': [ART('της', 'Gen', 'Sing', 'Fem')],
  'στους': [ART('τους', 'Acc', 'Plur', 'Masc')],
  'στις': [ART('τις', 'Acc', 'Plur', 'Fem')],
  'στα': [ART('τα', 'Acc', 'Plur', 'Neut')],
  'στων': [ART('των', 'Gen', 'Plur')],
};

/** The articles a written form contracts σε with, the usual one first; undefined for any other form. */
export function seContraction(key: string): readonly SeArticle[] | undefined {
  return Object.prototype.hasOwnProperty.call(SE_CONTRACTIONS, key) ? SE_CONTRACTIONS[key] : undefined;
}

/** The two parts of the written word: σ (the preposition σε, its vowel dropped) and the article's letters as they stand in it. */
export function seParts(form: string, reading: SeArticle): WordPart[] {
  return [
    { text: form.slice(0, 1), start: 0, end: 1, lemma: 'σε', pos: 'ADP', role: 'the preposition σε (in, at, to, on)' },
    { text: form.slice(1), start: 1, end: form.length, lemma: 'ο', pos: 'DET', morph: { ...reading.morph }, role: `the article ${reading.article}` },
  ];
}
