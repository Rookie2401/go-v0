/**
 * Wiktionary (kaikki.org) Russian labels → this adapter's features. Three entrances, one reader:
 *
 *   ruFeaturesOfCode        the tag bundle of an index row ("accusative|singular", "first-person|present|singular") together with
 *                           the part of speech and the lemma's own features (`lex`): the features of one FORM of one lexeme.
 *   ruMorphFromTags         the adapter's `morphFromTags`: the labels of a dictionary form-of sense, no lexeme known.
 *   ruFeaturesFromTableTags the adapter's `featuresFromTableTags`: one row of a dictionary inflection table → the cell it fills.
 *
 * The keys and values are the ones docs/russian/PLAN.md binds (UD style): Case Nom Gen Dat Acc Ins Prep Loc Par Voc, Number Sing Plur,
 * Gender Masc Fem Neut, Animacy Anim Inan, Person 1 2 3, Tense Pres Past Fut, Mood Ind Imp, VerbForm Fin Inf Part Conv, Voice Act Pass,
 * Aspect Imp Perf, Degree Cmp Sup, Variant Short, Reflex Yes. Several values of one key are sorted and joined with a comma.
 *
 * What the source does NOT say is not said here either:
 *  - a noun's Gender and Animacy are the lexeme's (`lex`); the row's own animacy tag wins (adjective accusatives are tagged);
 *  - a verb's Aspect is the lexeme's (`lex`); only when `lex` has none, the row's own tag is used;
 *  - a noun row with a case and no number is singular (the source leaves the singular implicit); an adjective, participle or
 *    pronoun row with a gender and no number is singular; a plural has no gender of its own;
 *  - the source tags the non-past of a perfective verb "future" and that of an imperfective verb "present": taken as given;
 *  - register labels (dated, archaic, colloquial …) are returned apart, as `usage`, and never become a feature.
 * A label this file does not know is ignored and COUNTED (`ruUnknownTags`), so that a script can list what the data holds beyond it.
 */
import type { PartOfSpeech } from '../../core';

type Entry = readonly [key: string, value: string];

/** Labels that name one value of one feature. */
const LABELS: Readonly<Record<string, Entry>> = {
  nominative: ['Case', 'Nom'], genitive: ['Case', 'Gen'], dative: ['Case', 'Dat'], accusative: ['Case', 'Acc'],
  instrumental: ['Case', 'Ins'], prepositional: ['Case', 'Prep'], locative: ['Case', 'Loc'], partitive: ['Case', 'Par'], vocative: ['Case', 'Voc'],
  singular: ['Number', 'Sing'], plural: ['Number', 'Plur'],
  masculine: ['Gender', 'Masc'], feminine: ['Gender', 'Fem'], neuter: ['Gender', 'Neut'],
  animate: ['Animacy', 'Anim'], inanimate: ['Animacy', 'Inan'],
  'first-person': ['Person', '1'], 'second-person': ['Person', '2'], 'third-person': ['Person', '3'],
  present: ['Tense', 'Pres'], past: ['Tense', 'Past'], future: ['Tense', 'Fut'],
  indicative: ['Mood', 'Ind'], imperative: ['Mood', 'Imp'],
  active: ['Voice', 'Act'], passive: ['Voice', 'Pass'],
  imperfective: ['Aspect', 'Imp'], perfective: ['Aspect', 'Perf'],
  comparative: ['Degree', 'Cmp'], superlative: ['Degree', 'Sup'],
  'short-form': ['Variant', 'Short'],
  reflexive: ['Reflex', 'Yes'],
};
/** Labels that decide the verb form (read by the reader itself). */
const FORM_LABELS: ReadonlySet<string> = new Set(['infinitive', 'participle', 'adverbial']);

/**
 * Register and style labels: they say how a form is used, never what it is. They go to `usage`.
 * LOWERED_USAGE are the ones that make a reading less likely to be the intended one (the analyser lowers its confidence by 0.10).
 */
export const RU_USAGE_LABELS: ReadonlySet<string> = new Set([
  'dated', 'archaic', 'obsolete', 'colloquial', 'rare', 'poetic', 'dialectal', 'nonstandard', 'proscribed', 'uncommon', 'regional', 'pejorative',
  'slang', 'vulgar', 'derogatory', 'informal', 'formal', 'literary', 'humorous', 'vernacular', 'offensive', 'endearing', 'euphemistic', 'ironic',
  'sarcastic', 'slur', 'childish', 'neologism', 'bureaucratese', 'historical', 'misspelling', 'pronunciation-spelling', 'Internet',
]);
export const RU_LOWERED_USAGE: ReadonlySet<string> = new Set([
  'dated', 'archaic', 'obsolete', 'colloquial', 'rare', 'dialectal', 'nonstandard', 'proscribed', 'uncommon', 'regional', 'slang', 'vulgar',
  'misspelling', 'pronunciation-spelling', 'slur', 'offensive',
]);

/**
 * Labels that are known and name no feature of the contract: what kind of word the entry is, which derivation a head line points to,
 * qualifiers of a table cell, region names, and the markers the extraction tool leaves. They are ignored without being counted.
 */
const NON_FEATURE: ReadonlySet<string> = new Set([
  // markers of the extract and of the table template
  'canonical', 'romanization', 'table-tags', 'inflection-template', 'class', 'form-of', 'alt-of', 'alternative', 'error-unrecognized-form',
  'error-unknown-tag', 'unknown', 'previous', 'also', 'usually', 'sometimes', 'often', 'especially', 'specifically', 'always', 'possibly',
  // kinds of word and kinds of relation (the head line's derivations)
  'noun', 'verb', 'adjective', 'adverb', 'name', 'person', 'relational', 'possessive', 'attributive', 'demonstrative', 'personal', 'pronoun', 'relative',
  'diminutive', 'augmentative', 'collective', 'singulative', 'semelfactive', 'iterative', 'abbreviation', 'initialism', 'acronym', 'clipping',
  'ellipsis', 'contraction', 'morpheme', 'letter', 'demonym', 'noun-from-verb', 'abstract-noun', 'abstract', 'concrete', 'by-personal-gender',
  'common-gender', 'animal-not-person', 'suppletive', 'plural-of', 'uppercase', 'lowercase', 'capitalized', 'stressed', 'unstressed', 'emphatic',
  'before-vowel', 'apocopic', 'misconstruction', 'deliberate', 'subjective', 'adjectival', 'metonymically', 'figuratively', 'idiomatic', 'ethnic',
  // qualifiers of a cell or of a lexeme
  'irregular', 'indeclinable', 'invariable', 'uncountable', 'plural-only', 'plural-normally', 'no-comparative', 'no-perfect', 'transitive', 'intransitive',
  'impersonal', 'predicative', 'with-subjunctive', 'parenthetic', 'mixed', 'soft', 'common', 'standard', 'Standard', 'modern', 'contemporary', 'variant',
  'count-form', 'paucal', 'dual', 'mediopassive', 'pluperfect', 'imperfect', 'ablative', 'letter-name', 'verb-form',
  // names of places and scripts the source tags regional forms with
  'Ukraine', 'Southern', 'Saint-Petersburg', 'Russian', 'Russia', 'Roman', 'Pskov', 'Perm', 'Middle', 'Italy', 'Canada', 'Arkhangelsk', 'Armenia',
  'European', 'Cyrillic', 'Judaism', '-ko',
]);

const POS_NAMES: Readonly<Record<string, string>> = {
  noun: 'NOUN', name: 'PROPN', propn: 'PROPN', verb: 'VERB', adj: 'ADJ', adjective: 'ADJ', adv: 'ADV', adverb: 'ADV', pron: 'PRON', det: 'DET',
  num: 'NUM', prep: 'ADP', adp: 'ADP', conj: 'CONJ', sconj: 'SCONJ', particle: 'PART', part: 'PART', intj: 'INTJ', aux: 'AUX',
};
const normPos = (pos: string | undefined): string | undefined => (pos ? POS_NAMES[pos.toLowerCase()] ?? pos.toUpperCase() : undefined);

// ───────────────────────────── the unknown labels ─────────────────────────────

const UNKNOWN = new Map<string, number>();
/** The labels met that no table of this file knows, with how often (for the index probe and the tests). */
export const ruUnknownTags = (): Array<[string, number]> => [...UNKNOWN.entries()].sort((a, b) => b[1] - a[1]);
export const resetRuUnknownTags = (): void => UNKNOWN.clear();
/** Whether a label is read by this file (a feature, a form marker, a usage label or a known non-feature). */
export const isKnownRuTag = (t: string): boolean => t in LABELS || FORM_LABELS.has(t) || RU_USAGE_LABELS.has(t) || NON_FEATURE.has(t);

// ───────────────────────────── the reader ─────────────────────────────

const NOUNISH = new Set(['NOUN', 'PROPN']);
const ADJECTIVAL = new Set(['ADJ', 'PRON', 'DET', 'NUM']);
const VERBAL = new Set(['VERB', 'AUX']);
const CONTRACT_LEX_KEYS = new Set(['Gender', 'Animacy', 'Aspect', 'Reflex']);

interface Read { morph: Record<string, string>; usage: string[] }

function parseLex(lex: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of lex.split('|')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/** Several values of one key as one union value: sorted, joined with a comma (PLAN.md: `Case=Acc,Nom`). */
const joinValues = (values: ReadonlySet<string>): string => [...values].sort().join(',');

/**
 * The reading rule. `tags` are the source's labels, `pos` an UPOS name (or the source's own, or undefined when unknown), `lex` the
 * lexeme's features. `countUnknown` is false for the dry runs a caller makes only to see whether a row names a cell.
 */
function read(tags: readonly string[], pos: string | undefined, lex: string, countUnknown = true): Read & { forms: Set<string> } {
  const sets: Record<string, Set<string>> = {};
  const forms = new Set<string>();
  const usage: string[] = [];
  const put = (k: string, v: string): void => { (sets[k] ??= new Set()).add(v); };
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const hit = LABELS[t];
    if (hit) { put(hit[0], hit[1]); continue; }
    if (FORM_LABELS.has(t)) { forms.add(t); continue; }
    if (RU_USAGE_LABELS.has(t)) { if (!usage.includes(t)) usage.push(t); continue; }
    if (t === 'alternative') { if (!usage.includes('alternative spelling')) usage.push('alternative spelling'); continue; }
    if (NON_FEATURE.has(t)) continue;
    if (countUnknown) UNKNOWN.set(t, (UNKNOWN.get(t) ?? 0) + 1);
  }
  const P = normPos(pos);
  const has = (k: string): boolean => (sets[k]?.size ?? 0) > 0;
  const nounish = P !== undefined && NOUNISH.has(P);
  const verbal = P === undefined || VERBAL.has(P);

  // the verb form
  if (forms.has('adverbial')) {
    // an adverbial participle has a tense and nothing of the noun's agreement; "short-form" there only marks the -в / -ши variant
    sets.VerbForm = new Set(['Conv']);
    delete sets.Variant; delete sets.Case; delete sets.Number; delete sets.Gender; delete sets.Animacy; delete sets.Voice;
  } else if (forms.has('participle')) {
    sets.VerbForm = new Set(['Part']);
  } else if (forms.has('infinitive')) {
    sets.VerbForm = new Set(['Inf']);
  } else if (verbal && (has('Tense') || has('Mood') || (P !== undefined && has('Person')))) {
    sets.VerbForm = new Set(['Fin']);
    if (!has('Mood')) sets.Mood = new Set(['Ind']);
    // "short-form" on a past tense or an imperative is a spelling variant, not the short adjective form
    delete sets.Variant;
  }
  if (sets.Mood?.has('Imp')) { sets.Mood = new Set(['Imp']); delete sets.Tense; sets.VerbForm = new Set(['Fin']); }

  // the number nobody wrote
  const adjectival = P !== undefined && ADJECTIVAL.has(P);
  const agrees = forms.has('participle') || adjectival || (P !== undefined && VERBAL.has(P) && !has('Tense'));
  // a numeral has no number of its own: the gender of два / одна is the counted noun's, and only a row that says singular or plural has a number
  if (!has('Number') && P !== 'NUM') {
    if (has('Case') && !has('Person') && (nounish || P === undefined || has('Gender'))) put('Number', 'Sing');
    else if (has('Gender') && agrees) put('Number', 'Sing');
  }
  // a plural has no gender of its own (a noun's gender is the lexeme's, added below; without a part of speech a noun cannot be told from an adjective)
  const onlyPlural = sets.Number?.size === 1 && sets.Number.has('Plur');
  if (onlyPlural && ((P !== undefined && !nounish) || forms.has('participle') || has('Tense'))) delete sets.Gender;

  const morph: Record<string, string> = {};
  for (const [k, vs] of Object.entries(sets)) if (vs.size) morph[k] = joinValues(vs);

  // the lexeme's own features
  if (lex) {
    const L = parseLex(lex);
    for (const [k, v] of Object.entries(L)) {
      if (!CONTRACT_LEX_KEYS.has(k) || !v) continue;
      if (k === 'Gender') { if (nounish || (!morph.Gender && morph.Number !== 'Plur' && P !== 'ADJ')) morph.Gender = v; }
      else if (k === 'Animacy') { if (nounish && !morph.Animacy) morph.Animacy = v; }
      else if (k === 'Aspect') { if (verbal) morph.Aspect = v; }
      else if (k === 'Reflex') { if (verbal && !morph.Reflex) morph.Reflex = v; }
    }
  }
  if (morph.Aspect && !verbal) delete morph.Aspect;
  return { morph, usage, forms };
}

/**
 * The features of one form: a row's tag bundle ("accusative|singular", "feminine|past|singular"), the lemma's UPOS and the lemma's
 * own features (`lex`, "Animacy=Inan|Gender=Fem"). `usage` is the register labels of the bundle, never part of `morph`.
 */
export function ruFeaturesOfCode(code: string, pos: string, lex: string): { morph: Record<string, string>; usage: string[] } {
  const r = read(code ? code.split('|') : [], pos, lex);
  return { morph: r.morph, usage: r.usage };
}

/** The adapter's `morphFromTags`: a form-of sense's labels, no lexeme known. */
export function ruMorphFromTags(tags: readonly string[]): Record<string, string> {
  return read(tags, undefined, '').morph;
}

/** Rows of a table that name no cell: the template's own rows, romanizations, the head line's relations. */
const NOT_A_CELL: ReadonlySet<string> = new Set([
  'canonical', 'romanization', 'table-tags', 'inflection-template', 'class', 'diminutive', 'augmentative', 'relational', 'collective', 'singulative',
  'semelfactive', 'iterative', 'alternative', 'abbreviation', 'initialism', 'noun-from-verb', 'abstract-noun', 'demonym', 'by-personal-gender',
  'adjective', 'adverb', 'suppletive', 'plural-of', 'form-of', 'alt-of', 'count-form', 'paucal', 'dual',
]);

/**
 * The adapter's `featuresFromTableTags`: the cell one row of a dictionary inflection table fills, or undefined for a row that is not a
 * cell (the template's rows, the head line's derivations, the declined participles of a verb entry whose own label is the table's
 * header, a row that only names an aspect). A multi-word form (the analytic future "бу́ду чита́ть") is a cell like any other: it
 * has Tense=Fut and its person and number.
 */
export function ruFeaturesFromTableTags(tags: readonly string[], pos: PartOfSpeech | string, _form?: string): Record<string, string> | undefined {
  for (const t of tags) if (NOT_A_CELL.has(t)) return undefined;
  const r = read(tags, pos, '');
  const m = r.morph;
  delete m.Reflex;
  const keys = Object.keys(m);
  if (!keys.length) return undefined;
  // only an aspect: a head line's partner, not a cell
  if (keys.length === 1 && keys[0] === 'Aspect') return undefined;
  // a verb entry's table also holds its participles' declension; those rows carry no participle label (the table header does)
  const P = normPos(pos);
  if (P !== undefined && VERBAL.has(P) && !m.VerbForm) return undefined;
  return m;
}

// ───────────────────────────── the feature table of the pack manifest ─────────────────────────────

/** What the card and the tutorial show for each feature: its values in plain words and two or three sentences on what it does. */
export const RU_FEATURES: Array<{ key: string; label: string; values: Record<string, string>; explain: string }> = [
  {
    key: 'Case', label: 'Case',
    values: { Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Ins: 'instrumental', Prep: 'prepositional', Loc: 'locative (second prepositional)', Par: 'partitive', Voc: 'vocative' },
    explain: 'Russian marks the job a noun does in its sentence with an ending. The nominative names who or what acts (Кошка спит, the cat sleeps); the genitive says of what or whose, and follows many numbers and negations (нет книги, there is no book); the dative gives the receiver (Я дал книгу брату, I gave the book to my brother); the accusative is the direct object (Я читаю книгу); the instrumental is the tool or means (пишу ручкой, I write with a pen); the prepositional is used only after prepositions such as о, в and на (о книге, about the book). A few nouns also have a second locative after в and на (в лесу, in the forest) or a partitive (чашка чаю, a cup of tea).',
  },
  {
    key: 'Number', label: 'Number',
    values: { Sing: 'singular', Plur: 'plural' },
    explain: 'The ending also says whether there is one thing or several: книга is one book, книги are books (or the genitive of one book, so the ending alone can leave both open). Adjectives, participles and past-tense verbs agree with their noun in number.',
  },
  {
    key: 'Gender', label: 'Gender',
    values: { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' },
    explain: 'Every Russian noun is masculine, feminine or neuter, and adjectives, participles and the past tense of verbs must match it: новый дом (a new house), новая книга (a new book), новое окно (a new window). The gender of a noun is usually clear from its ending in the dictionary form, and it is a fact of the word, not of one inflected form. There is no gender in the plural.',
  },
  {
    key: 'Animacy', label: 'Animacy',
    values: { Anim: 'animate', Inan: 'inanimate' },
    explain: 'Russian treats people and animals (animate) differently from things (inanimate) in one place, the accusative. For an inanimate masculine noun the accusative looks like the nominative (Я вижу стол), for an animate one it looks like the genitive (Я вижу брата, I see my brother). The same split applies to the plural of every gender.',
  },
  {
    key: 'Person', label: 'Person',
    values: { 1: '1st person', 2: '2nd person', 3: '3rd person' },
    explain: 'Verbs in the present (or the future of a perfective verb) show who is acting: я читаю (I read, first person), ты читаешь (you read, second person), он читает (he reads, third person). The past tense has no person; it shows gender and number instead (я читал, я читала).',
  },
  {
    key: 'Tense', label: 'Tense',
    values: { Pres: 'present', Past: 'past', Fut: 'future' },
    explain: 'The past ends in -л (читал, читала, читали); the present belongs to imperfective verbs (читаю, I read or I am reading). A perfective verb has no present: its present-shaped forms mean the future (прочитаю, I will read it through). An imperfective verb makes the future with the helper быть and the infinitive (буду читать).',
  },
  {
    key: 'Mood', label: 'Mood',
    values: { Ind: 'indicative', Imp: 'imperative' },
    explain: 'The indicative states a fact (Он читает), the imperative gives an order or a request (Читай! Читайте!). The imperative has only the second person, in the singular for one person and in the plural for several or for politeness. The conditional is made with the particle бы and the past tense (Я бы прочитал), not with a verb ending.',
  },
  {
    key: 'VerbForm', label: 'Verb form',
    values: { Fin: 'finite verb', Inf: 'infinitive', Part: 'participle', Conv: 'adverbial participle' },
    explain: 'A finite verb has a person or a gender and number (читаю, читала). The infinitive is the dictionary form (читать). A participle works like an adjective and agrees with its noun (читающий мальчик, the boy who is reading; прочитанная книга, the book that was read). An adverbial participle works like an adverb and shows an action alongside the main one (читая, while reading; прочитав, having read).',
  },
  {
    key: 'Voice', label: 'Voice',
    values: { Act: 'active', Pass: 'passive' },
    explain: 'The voice of a participle: the active participle describes the one who acts (читающий, the one who is reading; прочитавший, the one who has read), the passive one describes what is acted on (читаемый, being read; прочитанный, read). A reflexive verb in -ся can also be passive (Книга читается, the book is read).',
  },
  {
    key: 'Aspect', label: 'Aspect',
    values: { Imp: 'imperfective', Perf: 'perfective' },
    explain: 'Almost every verb comes in two aspects, which are two separate dictionary words. The perfective presents the event as a single whole, usually with its result or limit (прочитать, to read it through); the imperfective presents it as a process, a repeated event or a simple fact (читать, to read, to be reading). The two are usually named together as a pair, with the imperfective first.',
  },
  {
    key: 'Degree', label: 'Degree',
    values: { Cmp: 'comparative', Sup: 'superlative' },
    explain: 'The comparative says more: быстрее (faster), больше (more). It does not change for case or gender when it stands alone in a sentence (Он быстрее меня, he is faster than me). The superlative is formed with самый or with the ending -ейший (самый быстрый, the fastest).',
  },
  {
    key: 'Variant', label: 'Form variant',
    values: { Short: 'short form' },
    explain: 'Many adjectives and passive participles have a short form that changes only for gender and number and is used after a noun in the predicate: Книга интересна (the book is interesting), Дом построен (the house is built). The long form (интересная книга) is the one that takes the case endings.',
  },
  {
    key: 'Reflex', label: 'Reflexive',
    values: { Yes: 'reflexive' },
    explain: 'A reflexive verb ends in -ся or -сь (мыться, to wash oneself; учиться, to study) and the action returns to the one who does it, or the verb simply has no object. The pronoun себя (oneself) is the reflexive pronoun and does not have a nominative case.',
  },
];
