/**
 * Words whose everyday reading is a noun (an adjective, an adverb, a name) although the same written form is also a verb form:
 * खाँसी "cough" beside the feminine perfective of खाँसना, गाड़ी "car" beside the perfective of गाड़ना, फल "fruit" beside the stem of
 * फलना, भाई "brother" beside the perfective of भाना, सही "right" beside the perfective of सहना, the name सीता beside the
 * imperfective participle of सीना. The word list puts verbs before nouns (closed classes first, then verbs, adjectives, nouns, names), so
 * a form written alone, or where no neighbour speaks for the verb, was read as the verb; the plan of the Hindi reading ladder
 * (data/ladder/hi/PLAN.md, 7.1 and 7.1b) found that this splits one word the learner meets as one word, and credits it to a
 * lemma that is not there (भाना, सीना, सहना, फलना).
 *
 * What this module does: the neighbour rules (./disambiguate.ts) ask `preferNounFirst` before they decide, for the word as it is
 * written in the list (the lemma form: not for the plural of समझ, समझें, which is also the subjunctive of the verb): it puts the noun
 * first unless a neighbour clearly speaks for the verb, and then it puts that verb reading first. Nothing is removed: the other reading stays on the list, one tap away.
 *
 * The flags after the word (a row of NOUN_FIRST_ROWS reads `lemma|POS flags`):
 *   s   a verb stem of the same spelling before a vector verb is the verb (सोच लिया, भर दिया, पानी डाल दिया), unless the word has a
 *       determiner, a genitive, a number or an adjective of its own before it (उसकी सोच लेना);
 *   p   a subject pronoun or noun before it, and the clause ending (or होना / a negative following), makes it the perfective participle
 *       (वह हँसी, माँ बोली), not the noun;
 *   i   a noun before it that is the object of a verb, and होना after it, makes it the imperfective participle (कपड़े सीता है);
 *   l   the noun is first only for a form that stands alone (a citation form, a list); in a sentence the ordinary neighbour rules decide,
 *       after the checks above (बोली, भरा, कर, जोड़ा, खोया: the verb or the participle is at least as usual there).
 * Always: a progressive रहा, सकना, चुकना or कर after a form that has a stem reading, and a ने earlier in the clause with the
 * perfective participle ending the clause (उसने दुख सही), are verb evidence.
 *
 * Also here: the oblique plurals that two listed words share (कमरों is कमरा "room" and कमर "waist", तालों is ताला and ताल); the
 * everyday word is first. Machine-drafted, not checked by a native speaker.
 */
import type { AnalysisCandidate, RawToken } from '../../core';
import { HINDI_VECTOR_VERBS } from './verb-group';

type C = AnalysisCandidate;

/** One entry per line: `lemma|POS flags` (flags: see above; `-` is none). */
const NOUN_FIRST_ROWS = `
खाँसी|NOUN p
गाड़ी|NOUN -
कमाई|NOUN -
पढ़ाई|NOUN -
फल|NOUN -
दुआ|NOUN -
मोड़|NOUN s
खोज|NOUN s
चमक|NOUN s
खेल|NOUN s
समझ|NOUN s
चढ़ाई|NOUN -
डाल|NOUN s
डाली|NOUN -
सोच|NOUN s
सुधार|NOUN s
नाच|NOUN s
हँसी|NOUN p
जाँच|NOUN s
सावधानी|NOUN -
मच्छरदानी|NOUN -
सीख|NOUN s
चराई|NOUN -
दिखाई|NOUN -
दुख|NOUN s
जीत|NOUN s
हार|NOUN s
दौड़|NOUN s
पोता|NOUN -
पोती|NOUN -
फ़ोटो|NOUN -
महँगाई|NOUN -
भाई|NOUN -
बोली|NOUN lp
जोड़ा|NOUN l
सोता|NOUN l
कर|NOUN l
थका|ADJ -
खोया|ADJ -
भरा|ADJ -
उबला|ADJ -
तला|ADJ -
दुखी|ADJ -
सही|ADJ -
फिर|ADV -
सबसे|ADV -
भर|PART s
सीता|PROPN i
रवि|PROPN -
`;

export const NOUN_FIRST: ReadonlyMap<string, string> = new Map(
  NOUN_FIRST_ROWS.split('\n').map((l) => l.trim().normalize('NFC')).filter(Boolean).map((l) => {
    const [key, flags] = l.split(' ');
    return [key, flags === '-' ? '' : flags] as const;
  }),
);

/** Whether the entry is one of the list and not a flag-l word (its own written form is read before the verb forms that are spelled alike; a word with flag l is first only when it stands alone). */
export const isNounFirst = (lemma: string, pos: string): boolean => {
  const flags = NOUN_FIRST.get(`${lemma}|${pos}`);
  return flags !== undefined && !flags.includes('l');
};

/** A written form that two listed words share, and the reading the everyday word has: `form → lemma|POS`. */
export const FORM_PREFERENCE: ReadonlyMap<string, string> = new Map(
  ([
    ['कमरों', 'कमरा|NOUN'], // room, not waist (कमर)
    ['तालों', 'ताला|NOUN'], // lock, not rhythm (ताल)
    ['मेलों', 'मेला|NOUN'], // fair, not mixing (मेल)
    ['वादों', 'वादा|NOUN'], // promise, not doctrine (वाद)
    ['तारों', 'तारा|NOUN'], // star, not wire (तार): both are real, the star is the one a child's book has
  ] as const).map(([f, r]) => [f.normalize('NFC'), r.normalize('NFC')] as const),
);

const feat = (c: C, k: string): string[] => (c.morph[k] ? c.morph[k].split(',') : []);
const has = (c: C, k: string, v: string): boolean => feat(c, k).includes(v);
const isVerbal = (c: C): boolean => c.pos === 'VERB' || c.pos === 'AUX';
/** Words before a stem that are no determiner of a noun but a degree or a quantity (पेट कितना भर गया, सब डाल दो). */
const DEGREE_WORDS = new Set(['कितना', 'कितनी', 'कितने', 'इतना', 'इतनी', 'इतने', 'उतना', 'जितना', 'सब', 'कुछ', 'सभी'].map((x) => x.normalize('NFC')));
const NEGATIVES = new Set(['नहीं', 'न', 'ही', 'भी', 'तो', 'मत']);
const SUBJECT_PRONOUNS = new Set(['मैं', 'तू', 'तुम', 'हम', 'आप', 'वे', 'वह'].map((s) => s.normalize('NFC')));

/**
 * A feminine plural noun in -ें and the subjunctive of a verb are written alike (गायें / गाएँ, सोचें, बातें): the noun when it is the subject of a
 * clause that goes on with "to be" (दुकानें हैं), or opens the clause before a noun, an adjective, a postposition or a participle (गायें घास खाती हैं),
 * or follows a postposition before a verb (घर में गायें चर रही हैं). A subject pronoun before it (आप सोचें) leaves the verb.
 */
function pluralNounBeforeVerb(i: number, tokens: RawToken[], base: C[][], reorder: (pred: (c: C) => boolean, why: string) => C[] | undefined): C[] | undefined {
  const cands = base[i];
  if (!tokens[i].normalized.endsWith('ें')) return undefined;
  const isNoun = (c: C): boolean => c.pos === 'NOUN' && has(c, 'Number', 'Plur') && (!c.morph.Gender || has(c, 'Gender', 'Fem'));
  if (!cands.some(isNoun) || !cands.some((c) => isVerbal(c) && has(c, 'VerbForm', 'Fin'))) return undefined;
  const word = (j: number): number | undefined => (j >= 0 && j < tokens.length && tokens[j].isWord ? j : undefined);
  const prev = word(i - 1);
  const next = word(i + 1);
  const anyAt = (j: number | undefined, pred: (c: C) => boolean): boolean => j !== undefined && (base[j] ?? []).some(pred);
  const topPos = (j: number | undefined): string | undefined => (j === undefined ? undefined : base[j]?.[0]?.pos);
  if (prev !== undefined && anyAt(prev, (c) => c.pos === 'PRON' && !c.morph.Poss && c.morph.Case !== 'Gen')) {
    // आप सोचें: the verb; तुम गायें घर लाओ: a subject, then its object, then the verb
    return topPos(next) === 'NOUN' && !anyAt(next, (c) => c.pos === 'ADP') ? reorder(isNoun, 'a subject pronoun before it and a noun after it: the object, a feminine plural noun') ?? undefined : undefined;
  }
  if (prev !== undefined && anyAt(prev, (c) => c.pos === 'SCONJ' || c.pos === 'CONJ')) return undefined; // ताकि हम / कि वे सोचें
  const verbalPart = (c: C): boolean => isVerbal(c) && (has(c, 'VerbForm', 'Part') || c.pos === 'AUX');
  const why = (what: string) => `a feminine plural noun, not the subjunctive: ${what}`;
  if (anyAt(next, (c) => c.lemma === 'होना')) return reorder(isNoun, why('"to be" follows')) ?? undefined;
  if (prev === undefined && next !== undefined && (['NOUN', 'PROPN', 'ADJ', 'ADP', 'NUM', 'DET'].includes(topPos(next) ?? '') || anyAt(next, verbalPart))) return reorder(isNoun, why('it opens the clause before a noun, an adjective, a postposition or a participle')) ?? undefined;
  if (prev !== undefined && anyAt(prev, (c) => c.pos === 'ADP') && next !== undefined && (anyAt(next, verbalPart) || ['NOUN', 'ADJ'].includes(topPos(next) ?? ''))) return reorder(isNoun, why('after a postposition, before a participle, a noun or an adjective')) ?? undefined;
  return undefined;
}

/**
 * `undefined` when this word is not one of the list, or when it is but the ordinary neighbour rules should decide (a flag `l` in a
 * sentence); otherwise the readings reordered: the noun (adjective, adverb, name) first unless a neighbour speaks for the verb, and then
 * the verb readings of that kind first. The others are marked down to 0.4, and `notes.context` says why.
 */
export function preferNounFirst(i: number, tokens: RawToken[], base: C[][]): C[] | undefined {
  const cands = base[i];
  if (!cands || cands.length < 2 || !tokens[i]?.isWord) return undefined;
  const word = (j: number): number | undefined => (j >= 0 && j < tokens.length && tokens[j].isWord ? j : undefined);
  const form = (j: number | undefined): string => (j === undefined ? '' : tokens[j].normalized);
  const anyAt = (j: number | undefined, pred: (c: C) => boolean): boolean => j !== undefined && (base[j] ?? []).some(pred);
  /** The readings that satisfy `pred` first, in their order; the rest after them, marked down; the same array when nothing changes. */
  const reorder = (pred: (c: C) => boolean, why: string): C[] | undefined => {
    const yes = cands.filter(pred);
    const no = cands.filter((c) => !pred(c));
    if (!yes.length) return undefined;
    if (!no.length) return cands;
    const first: C = { ...yes[0], notes: { ...(yes[0].notes ?? {}), context: why } };
    const out = [first, ...yes.slice(1), ...no.map((c) => (c.confidence > 0.4 ? { ...c, confidence: 0.4 } : c))];
    return cands[0] === yes[0] && no.every((c) => c.confidence <= 0.4) ? cands : out;
  };

  // a feminine plural in -ें (गायें, बातें, सोचें) beside the subjunctive of a verb (गाएँ, सोचें)
  const plural = pluralNounBeforeVerb(i, tokens, base, reorder);
  if (plural) return plural;

  // two listed words share this form: the everyday one
  const pref = FORM_PREFERENCE.get(tokens[i].normalized);
  if (pref) {
    const t = cands.find((c) => `${c.lemma}|${c.pos}` === pref);
    if (t) return reorder((c) => c === t, `two listed words are written alike: ${t.lemma}${t.gloss ? ` "${t.gloss}"` : ''} is the everyday one`) ?? cands;
  }

  let target: C | undefined;
  let flags = '';
  for (const c of cands) {
    const f = NOUN_FIRST.get(`${c.lemma}|${c.pos}`);
    if (f !== undefined) { target = c; flags = f; break; }
  }
  if (!target) return undefined;
  const t = target;
  // only the written form of the entry itself (गाड़ी, not the plural of a word that is also a subjunctive: समझें)
  if (tokens[i].normalized !== t.lemma) return undefined;
  const isTarget = (c: C): boolean => c.lemma === t.lemma && (t.pos !== 'PROPN' || c.pos === 'PROPN');
  if (cands.every(isTarget)) return undefined;
  const prev = word(i - 1);
  const next = word(i + 1);
  const gloss = t.gloss ? ` "${t.gloss}"` : '';
  const nounWhy = `${t.lemma}${gloss} is the everyday word; no neighbour speaks for the verb`;

  // a form that stands alone (a citation form, a list of words): the word the list holds
  if (prev === undefined && next === undefined) return reorder(isTarget, `the word stands alone: ${t.lemma}${gloss}, the everyday word, not a verb form`) ?? cands;

  let n2 = next;
  while (n2 !== undefined && NEGATIVES.has(form(n2))) n2 = word(n2 + 1);
  const stemRead = (c: C): boolean => !isTarget(c) && has(c, 'VerbForm', 'Stem');
  const perfRead = (c: C): boolean => !isTarget(c) && isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Aspect', 'Perf');
  const impRead = (c: C): boolean => !isTarget(c) && isVerbal(c) && has(c, 'VerbForm', 'Part') && has(c, 'Aspect', 'Imp');
  const hasStem = cands.some(stemRead);
  const hasPerf = cands.some(perfRead);
  const hasImp = cands.some(impRead);
  // the clause to the left of this word
  let start = i;
  while (start > 0 && !(tokens[start - 1].isWord === false && /^[,;:।॥?!…]$/u.test(tokens[start - 1].surface))) start--;
  const inClause = (pred: (c: C, k: number) => boolean): boolean => tokens.slice(start, i).some((tk, k) => tk.isWord && (base[start + k] ?? []).some((c) => pred(c, start + k)));
  const ergBefore = inClause((c, k) => tokens[k].normalized === 'ने' || has(c, 'Case', 'Erg'));
  const tuBefore = inClause((c) => c.pos === 'PRON' && c.morph.Polite === 'Infm');
  const endsClause = next === undefined || anyAt(next, (c) => c.lemma === 'होना') || NEGATIVES.has(form(next));
  const prevAny = (pred: (c: C) => boolean): boolean => anyAt(prev, pred);
  const adverbLike = (c: C): boolean => c.pos === 'ADV' || c.pos === 'PART';
  const prevDeterminer = prevAny((c) => c.pos === 'DET' || c.morph.Poss === 'Yes' || c.lemma === 'का' || c.pos === 'NUM' || c.pos === 'ADP') || (prevAny((c) => c.pos === 'ADJ') && !prevAny(adverbLike));
  // a postposition before the word does not stop a ने clause from ending in the verb (उसने बच्चे को जोड़ा)
  const prevDeterminerNoAdp = !DEGREE_WORDS.has(form(prev)) && (prevAny((c) => c.pos === 'DET' || c.morph.Poss === 'Yes' || c.lemma === 'का' || c.pos === 'NUM') || (prevAny((c) => c.pos === 'ADJ') && !prevAny(adverbLike)));
  const verb = (pred: (c: C) => boolean, why: string): C[] => reorder(pred, why) ?? cands;

  // evidence for the verb that always counts: a stem before a progressive रहा, सकना, चुकना or कर
  if (hasStem && n2 !== undefined && (anyAt(n2, (c) => c.lemma === 'रहना' && has(c, 'Aspect', 'Prog')) || anyAt(n2, (c) => c.lemma === 'सकना' || c.lemma === 'चुकना') || ['कर', 'करके'].includes(form(n2)))) {
    return verb(stemRead, `a second verb (रहा, सकना, चुकना) or कर follows: the verb stem, not the noun ${t.lemma}`);
  }
  // the perfective participle before जाना is the passive (भरा गया): the verb
  if (hasPerf && n2 !== undefined && anyAt(n2, (c) => c.lemma === 'जाना') && !prevDeterminerNoAdp) return verb(perfRead, `जाना follows: the passive, the perfective participle, not ${t.lemma}`);
  // the perfective of a transitive verb ends a ने clause
  if (hasPerf && ergBefore && endsClause && !prevDeterminerNoAdp) return verb(perfRead, `after ने the verb ends the clause: the perfective, not the noun ${t.lemma}`);
  // a stem before a vector verb (सोच लिया, पानी डाल दिया, माँ समझ गईं): the verb, unless the word has its own determiner, genitive or adjective before it (उसकी सोच लेना)
  if (flags.includes('s') && hasStem && n2 !== undefined && anyAt(n2, (c) => c.lemma !== undefined && c.lemma in HINDI_VECTOR_VERBS) && !prevDeterminerNoAdp) {
    return verb(stemRead, `a vector verb follows (${form(n2)}): the verb stem, not the noun ${t.lemma}`);
  }
  // the command to तू: a stem ending the clause
  if (flags.includes('s') && hasStem && next === undefined && tuBefore) return verb(stemRead, 'तू in the clause and nothing after it: the command');
  // a subject before the perfective participle, ending the clause (an adverb may stand between)
  if (flags.includes('p') && hasPerf && endsClause && !ergBefore && !prevDeterminer) {
    let j = prev;
    while (j !== undefined && anyAt(j, adverbLike) && !(base[j]?.[0] && (base[j][0].pos === 'NOUN' || base[j][0].pos === 'PRON'))) j = word(j - 1);
    const pronoun = j !== undefined && SUBJECT_PRONOUNS.has(form(j));
    // a word the list does not know before it is taken for a name: the subject
    const nounSubject = j !== undefined && j === prev && ((base[j] ?? []).length === 0 || anyAt(j, (c) => (c.pos === 'NOUN' || c.pos === 'PROPN') && (!c.morph.Case || has(c, 'Case', 'Dir'))));
    if (pronoun || nounSubject) return verb(perfRead, `a subject before it and the clause ends: the perfective participle, not the noun ${t.lemma}`);
  }
  // an object, then the imperfective participle and होना
  if (flags.includes('i') && hasImp && next !== undefined && anyAt(next, (c) => c.lemma === 'होना') && prev !== undefined && anyAt(prev, (c) => c.pos === 'NOUN')) {
    const before = word(prev - 1);
    if (before !== undefined && SUBJECT_PRONOUNS.has(form(before))) return verb(impRead, `a subject and an object stand before it and "to be" follows: the imperfective participle, not the name ${t.lemma}`);
  }
  // no evidence for the verb: the noun, except for the words that are first only when alone (the ordinary neighbour rules decide)
  return flags.includes('l') ? undefined : reorder(isTarget, nounWhy) ?? cands;
}
