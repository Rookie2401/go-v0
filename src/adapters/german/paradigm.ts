/**
 * German paradigm generation (GoLearn Linguistic Engine V2, Stage 3): the forms a lexeme takes, as the shared
 * `GeneratedParadigm` shape of src/core/paradigm.ts, produced ONLY from what the adapter's own analysis generates: the
 * word list (lexicon-*.ts, function-words.ts), `nounForms`, `adjectiveForms`, `conjugateFull` and the closed-class tables.
 * Nothing here has a rule of its own except the layout and the notes; a cell exists when the engine produced a form for it,
 * and its features are the ones the analysis puts on that form (a union reading is taken apart into one cell per value).
 *
 *   noun         Case (Nom, Gen, Dat, Acc) × Number. The cells hold the bare noun; Gender is a fact of the whole word
 *                (a note, with the definite article of every cell). Weak nouns, listed irregular forms and the older
 *                dative singular in -e (dem Hause, a second form of the Dat Sing cell) come from the lexicon rows.
 *                An adjectival noun (die Deutsche) adds Decl (strong / weak / mixed) as sections.
 *   adjective    Decl (Strong, Weak, Mixed) as sections × Case × Gender (singular) / plural, in three degrees (Degree Cmp, Sup;
 *                the positive has none). The uninflected form (gut, besser, am besten) is the cell `Position: 'Pred'`.
 *   verb         VerbForm=Fin × Mood (Ind, Sub, Imp) × Tense (Pres, Past; Konjunktiv I is Sub+Pres, Konjunktiv II is Sub+Past)
 *                × Person × Number; the imperative; infinitive, zu-infinitive (Variant Zu) and the two participles. The
 *                periphrastic perfect, pluperfect, future and passives are CONSTRUCTIONS, not cells. A separable verb's finite
 *                cells are the main-clause forms with the particle separated (steht auf); the subordinate-clause forms
 *                (aufsteht) are cells with `Clause: 'Sub'`.
 *   determiner   der / die / das, ein, kein, the possessives, dieser-type words: Case × Gender (singular) / plural.
 *
 * What it will not do: a lemma outside the word list gets nothing, except a lower-case verb ending in -en / -ern / -eln, whose
 * paradigm is the regular weak one, says "Guessed" in its notes and has no template (the same guess the analysis makes for a
 * word it does not know). Nouns and adjectives are never guessed from a lemma.
 */
import type { GeneratedParadigm, Paradigm, ParadigmCell, ParadigmLayout, PartOfSpeech } from '../../core';
import { featureKey, mergeParadigm } from '../../core/paradigm';
import { DE_ANALYZER } from './context';
import { CLOSED_FORMS } from './function-words';
import { deLexiconView } from './lexicon';
import { adjectiveForms, adjectiveStem, superlativeOf } from './morph-adjective';
import { nounForms } from './morph-noun';
import { PREFIXES } from './prefixes';
import { conjugateFull, plainLemma } from './morph-verb';
import { tableForm, tableNote, tableRow, unknownTableTags } from './table-tags';
import type { DeAdjective, DeCell, DeNoun, DeVerb } from './types';

type Features = Record<string, string>;
interface Cell { features: Features; form: string; note?: string }

const nfc = (s: string): string => s.normalize('NFC');
const lower = (s: string): string => nfc(s).toLocaleLowerCase('de');

const CASE_OF = { N: 'Nom', G: 'Gen', D: 'Dat', A: 'Acc' } as const;
const GENDER_OF = { m: 'Masc', f: 'Fem', n: 'Neut' } as const;
const DECL_OF = { st: 'Strong', wk: 'Weak', mx: 'Mixed' } as const;
const GENDER_WORD = { m: 'masculine', f: 'feminine', n: 'neuter', pl: 'plural only' } as const;

const ORDER: Record<string, readonly string[]> = {
  Degree: ['', 'Cmp', 'Sup'], Decl: ['', 'Strong', 'Weak', 'Mixed'], Case: ['', 'Nom', 'Gen', 'Dat', 'Acc'], Gender: ['Masc', 'Fem', 'Neut', ''], Number: ['Sing', 'Plur'],
};
const rank = (key: string, v: string | undefined): number => { const i = (ORDER[key] ?? []).indexOf(v ?? ''); return i < 0 ? 99 : i; };
/** Stable sort by the given feature keys (a cell keeps its place among cells that tie, so the usual form stays before its variants). */
function sortCells(cells: Cell[], keys: string[]): Cell[] {
  return cells.map((c, i) => ({ c, i })).sort((a, b) => {
    for (const k of keys) { const d = rank(k, a.c.features[k]) - rank(k, b.c.features[k]); if (d) return d; }
    return a.i - b.i;
  }).map((x) => x.c);
}
function put(cells: Cell[], features: Features, form: string, note?: string): void {
  const k = featureKey(features);
  if (cells.some((c) => featureKey(c.features) === k && c.form === form)) return;
  cells.push({ features, form, ...(note ? { note } : {}) });
}

// ───────────────────────────── analysis features → cell features ─────────────────────────────

/**
 * The feature bundle of the paradigm cell an analysed form belongs to. A noun's cells carry Case and Number only (Gender is
 * the word's); an uninflected adjective (gut, besser: the analysis gives it no Case) is the cell `Position: 'Pred'`. Every
 * other reading is taken as it is. A union reading ("Nom,Acc") is not a cell: `deCellsFor` finds every cell it could be.
 */
export function germanCellFeatures(pos: PartOfSpeech, morph: Features): Features {
  const f: Features = { ...morph };
  if (pos === 'NOUN') { delete f.Gender; delete f.Decl; return f; }
  if (pos === 'ADJ' && !f.Case) { delete f.Gender; delete f.Number; delete f.Decl; return { ...f, Position: 'Pred' }; }
  return f;
}

const split = (v: string | undefined): string[] => (v ? v.split(',').filter(Boolean) : []);

/**
 * The cells of a paradigm that an ANALYSIS reading names. The analysis keeps a feature the written form leaves open as a comma
 * union (Case "Nom,Acc", Gender "Masc,Neut", Decl "Strong,Weak"), and the sentence layer may narrow it; a cell has one value per
 * feature. A cell matches when, for every feature the cell has and the reading states, their values overlap. `cellOf` finds the
 * cell when the reading is already narrowed to one; this finds every cell a union reading could be, which is what the card
 * highlights (given the paradigm's `pos`, the reading is first projected with `germanCellFeatures`). `surface` (optional) keeps only cells whose form is that written form (the particle of a separated verb and the
 * "am" of a superlative are not part of it).
 */
export function deCellsFor(paradigm: Pick<Paradigm, 'cells'> & Partial<Pick<Paradigm, 'kind' | 'pos'>>, reading: Features, surface?: string): ParadigmCell[] {
  // a noun's cells carry no Gender and an uninflected adjective is the Position cell: project the reading the way the cells are keyed
  const features = paradigm.pos ? germanCellFeatures(paradigm.pos, reading) : reading;
  const hits = paradigm.cells.filter((c) => {
    // the positive degree and the inflected forms have no Degree / Position: a reading without them is not a comparative or an uninflected cell
    for (const k of ['Degree', 'Position']) if ((features[k] ?? '') !== (c.features[k] ?? '')) return false;
    for (const [k, v] of Object.entries(c.features)) {
      const asked = features[k];
      if (asked === undefined) continue;
      if (!split(asked).includes(v)) return false;
    }
    return true;
  });
  if (!surface) return hits;
  const s = lower(surface);
  const bare = (f: string): string => lower(f).replace(/^am /u, '');
  const parts = (f: string): string[] => [lower(f), bare(f), ...lower(f).split(' ')];
  return hits.filter((c) => [c.form, ...(c.alternatives ?? [])].some((f) => parts(f).includes(s)));
}

// ───────────────────────────── nouns ─────────────────────────────

const ARTICLE: Record<string, Record<'Nom' | 'Gen' | 'Dat' | 'Acc', string>> = {
  m: { Nom: 'der', Gen: 'des', Dat: 'dem', Acc: 'den' },
  f: { Nom: 'die', Gen: 'der', Dat: 'der', Acc: 'die' },
  n: { Nom: 'das', Gen: 'des', Dat: 'dem', Acc: 'das' },
  p: { Nom: 'die', Gen: 'der', Dat: 'den', Acc: 'die' },
};
const CASE_ROWS: Array<[string, string]> = [['Nom', 'nominative (the subject)'], ['Gen', 'genitive (of, belonging to)'], ['Dat', 'dative (to, with)'], ['Acc', 'accusative (the direct object)']];
const CASE_LABEL = Object.fromEntries(CASE_ROWS);
const NOUN_LAYOUT: ParadigmLayout = { columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] }, rows: { key: 'Case', values: CASE_ROWS } };
const DECL_LABELS: Record<string, string> = {
  '': 'uninflected (predicative or adverbial: Das Haus ist ...)', Strong: 'strong: with no article (guter Wein)',
  Weak: 'weak: after der / die / das / dieser / jeder (der gute Wein)', Mixed: 'mixed: after ein / kein / mein (ein guter Wein)',
};

function nounFeaturesOf(c: DeCell): Features { return { Case: CASE_OF[c.c], Number: c.g === 'p' ? 'Plur' : 'Sing' }; }

function pickNoun(list: DeNoun[], hint?: { features?: Features }): DeNoun {
  const g = hint?.features?.Gender;
  const want = g === 'Masc' ? 'm' : g === 'Fem' ? 'f' : g === 'Neut' ? 'n' : undefined;
  return (want && list.find((n) => n.gender === want)) || list[0];
}

function nounParadigm(list: DeNoun[], hint?: { features?: Features }): GeneratedParadigm | undefined {
  const noun = pickNoun(list, hint);
  const forms = nounForms(noun);
  const notes: string[] = [];
  let cells: Cell[] = [];
  const ordered = [...forms.filter((f) => !f.older), ...forms.filter((f) => f.older)];

  if (noun.adjectival) {
    // the word list keeps no gender for an adjectival noun; the lemma in -e is the feminine singular and the plural
    for (const f of ordered) for (const c of f.cells) {
      if (c.g !== 'f' && c.g !== 'p' || !c.decl) continue;
      put(cells, { ...nounFeaturesOf(c), Decl: DECL_OF[c.decl] }, f.form);
    }
    cells = sortCells(cells, ['Decl', 'Number', 'Case']);
    notes.push(`An adjectival noun: it is declined like an adjective, so the ending depends on what stands in front (strong: no article, weak: die ${noun.lemma}, mixed: eine ${noun.lemma}). The cells shown are the feminine singular and the plural; the masculine singular ends in -er / -en / -em (ein Deutscher), the neuter in -es.`);
  } else {
    for (const f of ordered) for (const c of f.cells) put(cells, nounFeaturesOf(c), f.form);
    cells = sortCells(cells, ['Number', 'Case']);
    const g = noun.gender === 'pl' ? 'p' : noun.gender;
    const art = ARTICLE[g];
    const sg = (['Nom', 'Gen', 'Dat', 'Acc'] as const).map((k) => cells.find((c) => c.features.Case === k && c.features.Number === 'Sing')).map((c, i) => c && `${art[(['Nom', 'Gen', 'Dat', 'Acc'] as const)[i]]} ${c.form}`);
    const pl = (['Nom', 'Gen', 'Dat', 'Acc'] as const).map((k) => cells.find((c) => c.features.Case === k && c.features.Number === 'Plur')).map((c, i) => c && `${ARTICLE.p[(['Nom', 'Gen', 'Dat', 'Acc'] as const)[i]]} ${c.form}`);
    notes.push(`Gender: ${GENDER_WORD[noun.gender]}${noun.gender === 'pl' ? '' : ` (${ARTICLE[g].Nom} ${noun.lemma})`}. The cells hold the bare noun. With the definite article: ${[sg.every(Boolean) ? sg.join(', ') : '', pl.every(Boolean) ? pl.join(', ') : ''].filter(Boolean).join(' / ')}.`);
    if (noun.weak) notes.push('Weak noun (n-declension): every case except the nominative singular ends in -n / -en (der Student, den Studenten).');
    if (noun.gender !== 'pl' && !noun.plural) notes.push('No plural is in use for this word (the word list states none).');
    if (noun.irregular && Object.keys(noun.irregular).length) notes.push(`Some forms are listed by hand in the word list (${Object.keys(noun.irregular).join(', ')}) and replace the rule's form for their cell.`);
    if (forms.some((f) => f.older)) notes.push('The dative singular in -e (dem Hause, im Hause) is the older, literary form: it is the second form of the dative singular cell. In everyday German the dative singular is the bare noun.');
    if (cells.some((c) => c.features.Case === 'Gen' && c.features.Number === 'Sing' && cells.filter((x) => featureKey(x.features) === featureKey(c.features)).length > 1)) {
      // handled below by the merge (alternatives); said once here
      notes.push('A masculine or neuter noun may take the genitive in -es or -s (des Mannes / des Manns); both are listed in the cell, the first is the one the word list gives.');
    }
  }
  if (list.length > 1) notes.push(`The word list holds this spelling for more than one word (${list.map((n) => (n.adjectival ? 'adjectival' : GENDER_WORD[n.gender])).join(', ')}); this is the ${noun.adjectival ? 'adjectival' : GENDER_WORD[noun.gender]} one.`);
  if (cells.length === 0) return undefined;
  const header = noun.adjectival ? 'adjectival noun' : noun.gender === 'pl' ? `plural-only noun (die ${noun.lemma})`
    : `${ARTICLE[noun.gender].Nom} ${noun.lemma}, ${ARTICLE[noun.gender].Gen} ${noun.genSg ?? noun.lemma}, die ${noun.plural ?? '(no plural)'}`;
  return {
    kind: 'noun-declension', cells,
    layout: noun.adjectival ? { ...NOUN_LAYOUT, sections: ['Decl'], labels: { Decl: DECL_LABELS } } : { ...NOUN_LAYOUT, labels: { Case: CASE_LABEL } },
    template: `${header}${noun.weak ? ' (weak noun)' : ''}`,
    notes,
  };
}

// ───────────────────────────── adjectives ─────────────────────────────

const ADJ_LAYOUT: ParadigmLayout = {
  columns: { key: 'Gender', values: [['Masc', 'masculine'], ['Fem', 'feminine'], ['Neut', 'neuter'], ['', 'plural (all genders)']] },
  rows: { key: 'Case', values: [...CASE_ROWS, ['', 'no case (uninflected form)']] },
  sections: ['Degree', 'Decl'],
  labels: { Degree: { '': 'positive', Cmp: 'comparative', Sup: 'superlative' }, Decl: DECL_LABELS },
};

function adjectiveParadigm(adj: DeAdjective): GeneratedParadigm | undefined {
  const cells: Cell[] = [];
  const degrees = adj.indeclinable ? (['pos'] as const) : (['pos', 'cmp', 'sup'] as const);
  for (const degree of degrees) {
    const dm: Features = degree === 'cmp' ? { Degree: 'Cmp' } : degree === 'sup' ? { Degree: 'Sup' } : {};
    const af = adjectiveForms(adj, degree);
    if (af.uninflected !== undefined) put(cells, { ...dm, Position: 'Pred' }, af.uninflected);
    else if (degree === 'sup') put(cells, { ...dm, Position: 'Pred' }, `am ${superlativeOf(adj)}en`);
    for (const f of af.forms) for (const c of f.cells) {
      if (!c.decl) continue;
      const features: Features = { ...dm, Decl: DECL_OF[c.decl], Case: CASE_OF[c.c], Number: c.g === 'p' ? 'Plur' : 'Sing' };
      if (c.g !== 'p') features.Gender = GENDER_OF[c.g];
      put(cells, features, f.form);
    }
  }
  if (cells.length === 0) return undefined;
  const sorted = sortCells(cells, ['Degree', 'Decl', 'Case', 'Gender', 'Number']);
  const notes: string[] = [];
  if (adj.indeclinable) {
    notes.push(`${adj.lemma} is indeclinable: the same form in every case, gender and number, with any article; it has no comparison.`);
  } else {
    notes.push('Three declensions: strong (no article in front: guter Wein), weak (after der / die / das / dieser / jeder: der gute Wein) and mixed (after ein / kein / mein: ein guter Wein). Each is a section; the plural has one form for all genders.');
    notes.push('The uninflected form (gut, besser) stands after a verb (Der Wein ist gut) or as an adverb; the predicative superlative is am + superlative + -en (am besten). Both are cells with Position Pred.');
    const stem = adjectiveStem(adj);
    if (stem !== adj.lemma) notes.push(`The endings attach to ${stem}- (not ${adj.lemma}-): ${stem}er, ${stem}en.`);
    if (adj.comparative || adj.superlative) notes.push(`Irregular or stem-changing comparison, listed in the word list: ${adj.comparative ?? 'regular comparative'}, ${adj.superlative ? `superlative ${adj.superlative}` : 'regular superlative'}.`);
    notes.push('The comparative and superlative are declined with the same endings as the positive. The declined superlative has no uninflected form (der beste, am besten).');
  }
  return {
    kind: 'adjective-declension', cells: sorted, layout: ADJ_LAYOUT,
    template: adj.indeclinable ? 'indeclinable adjective' : adj.comparative || adj.superlative || adj.stem ? 'adjective with irregular comparison or stem' : 'regular adjective',
    notes,
  };
}

// ───────────────────────────── verbs ─────────────────────────────

const SIX = ['1s', '2s', '3s', '1p', '2p', '3p'] as const;
const TENSES: Array<[string, string, string]> = [['pres', 'Ind', 'Pres'], ['pret', 'Ind', 'Past'], ['subj1', 'Sub', 'Pres'], ['subj2', 'Sub', 'Past']];

/** The construction ids (constructions.ts keys) a verb's table points to instead of cells. */
export const VERB_CONSTRUCTIONS: readonly string[] = ['sentence-bracket-perfect', 'pluperfect', 'future', 'passive', 'passive-past', 'passive-perfect'];

function verbLayout(separable: boolean): ParadigmLayout {
  return {
    columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] },
    rows: { key: 'Person', values: [['1', 'first person (ich / wir)'], ['2', 'second person (du / ihr)'], ['3', 'third person (er, sie, es / sie)'], ['', 'no person (infinitive, participle)']] },
    sections: separable ? ['VerbForm', 'Clause', 'Mood', 'Tense', 'Variant'] : ['VerbForm', 'Mood', 'Tense', 'Variant'],
    labels: {
      VerbForm: { Fin: 'finite forms', Inf: 'infinitive', Part: 'participle' },
      Clause: { '': 'main clause (the particle stands at the end)', Sub: 'subordinate clause (particle and verb written together, verb last)' },
      Mood: { Ind: 'indicative', Sub: 'subjunctive (Konjunktiv)', Imp: 'imperative' },
      Tense: { Pres: 'present (with the subjunctive: Konjunktiv I)', Past: 'preterite (Präteritum; with the subjunctive: Konjunktiv II; with the participle: past participle)' },
      Variant: { Zu: 'infinitive with zu' },
    },
  };
}

function verbParadigm(verb: DeVerb, others: number, guessed: boolean, derived?: string): GeneratedParadigm | undefined {
  const conj = conjugateFull(verb);
  const prefix = conj.prefix;
  const cells: Cell[] = [];
  const list = (key: string): Array<{ form: string; older?: boolean }> => {
    const l = conj.forms[key] ?? [];
    return [...l.filter((f) => !f.older), ...l.filter((f) => f.older)];
  };
  const detached = (key: string): Array<{ form: string; older?: boolean }> => {
    const l = conj.detached[key] ?? [];
    return [...l.filter((f) => !f.older), ...l.filter((f) => f.older)];
  };
  const finite = (features: Features, key: string): void => {
    if (prefix) {
      for (const f of detached(key)) put(cells, features, `${f.form} ${prefix}`);
      if (!key.startsWith('imp.')) for (const f of list(key)) put(cells, { ...features, Clause: 'Sub' }, f.form);
    } else for (const f of list(key)) put(cells, features, f.form);
  };

  for (const [form, key] of [['inf', 'inf'], ['inf.zu', 'inf.zu']] as const) {
    for (const f of list(form)) put(cells, { VerbForm: 'Inf', ...(key === 'inf.zu' ? { Variant: 'Zu' } : {}) }, f.form);
  }
  for (const f of list('part.pres')) put(cells, { VerbForm: 'Part', Tense: 'Pres' }, f.form);
  for (const f of list('part.past')) put(cells, { VerbForm: 'Part', Tense: 'Past' }, f.form);
  for (const [tense, mood, t] of TENSES) {
    SIX.forEach((who, i) => finite({ VerbForm: 'Fin', Mood: mood, Tense: t, Person: who[0], Number: i < 3 ? 'Sing' : 'Plur' }, `${tense}.${who}`));
  }
  finite({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' }, 'imp.2s');
  finite({ VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Plur' }, 'imp.2p');
  if (cells.length === 0) return undefined;

  const notes: string[] = [];
  const lemma = plainLemma(verb);
  if (guessed) {
    notes.push(derived
      ? `Guessed: ${lemma} is not in the word list; ${derived}, so these are the forms of the listed base verb with the separable prefix (the same reading the analysis makes), unconfirmed. Its meaning and its perfect auxiliary may differ from the base verb's.`
      : `Guessed: ${lemma} is not in the word list, so these are the forms of the regular weak verb with that infinitive (the same guess the analysis makes), unconfirmed. A strong verb, a stem change or the missing ge- of a verb in -ieren would not show here.`);
  }
  if (conj.tier === 'irregular') notes.push(`Irregular verb: every form comes from the irregular table of the engine${conj.head !== lemma ? ` (${lemma} follows ${conj.head})` : ''}.`);
  else if (conj.tier !== 'weak') notes.push(`${conj.tier === 'mixed' ? 'Mixed' : 'Strong'} verb: the forms come from its principal parts (${[verb.pres3, verb.pret, verb.part].filter(Boolean).join(', ')}).`);
  if (prefix) {
    notes.push(`Separable verb, particle "${prefix}": in a main clause the particle stands at the end (${[detached('pres.3s')[0]?.form, prefix].join(' ')}); in a subordinate clause it is written together with the verb (${list('pres.3s')[0]?.form}). The zu-infinitive puts zu inside the word (${list('inf.zu')[0]?.form}). The imperative has no subordinate-clause form.`);
  }
  if (verb.reflexive) notes.push(`Reflexive verb: the reflexive pronoun accompanies every finite form (ich freue mich, du freust dich); the cells are the forms of ${lemma} alone.`);
  notes.push('Konjunktiv I is Mood Sub with Tense Pres; Konjunktiv II is Mood Sub with Tense Past. In everyday German Konjunktiv II is usually replaced by würde + infinitive (a construction, not a cell).');
  notes.push(`The perfect and pluperfect (${verb.aux === 'sein' ? 'ist / war' : verb.aux === 'haben/sein' ? 'hat or ist / hatte or war' : 'hat / hatte'} + participle), the future (werden + infinitive) and the passive (werden + participle) are constructions, not inflected words: they are listed under constructions, not in the table.`);
  if (verb.aux === 'sein' || verb.aux === 'haben/sein') notes.push(`Perfect auxiliary: ${verb.aux}.`);
  notes.push('Not covered: the polite imperative (Gehen Sie), the pronouns, and a second accepted irregularity beyond the engine\'s tables.');
  if (others > 0) notes.push('The word list holds this spelling for more than one verb (for example a separable and an inseparable one); this is the first, or the one the hint names.');
  const tier = conj.tier === 'weak' ? 'weak verb' : conj.tier === 'mixed' ? 'mixed verb' : conj.tier === 'strong' ? 'strong verb' : 'irregular verb';
  return {
    kind: 'verb-conjugation', cells, layout: verbLayout(!!prefix), notes,
    ...(guessed ? {} : { template: `${tier}${prefix ? `, separable (${prefix}-)` : ''}${verb.reflexive ? ', reflexive' : ''}` }),
    constructions: [...VERB_CONSTRUCTIONS, ...(prefix ? ['separable-prefix-verb'] : []), ...(verb.reflexive ? ['reflexive-verb'] : [])],
  };
}

function verbsOf(key: string): DeVerb[] {
  return [...deLexiconView.verb(key), ...(deLexiconView.verb(`sich ${key}`))];
}

const WEAK_INFINITIVE = /^[a-zäöüß]{3,}(?:en|ern|eln)$/u;

/**
 * A verb the word list does not hold. Two explicit paths, both marked "Guessed": a separable prefix + a verb the list DOES hold
 * (dazwischen + kommen: the base verb's own principal parts and auxiliary, the prefix always separable, as the analysis reads such a
 * form); and a lower-case verb with no verb prefix at the start, which is the regular weak verb. A verb that begins with a
 * separable or two-way prefix but whose rest the list does not hold (aufwerten, umfärben) is NOT guessed: it may or may not
 * separate, and the weak endings might not be its endings.
 */
function guessedVerb(key: string): GeneratedParadigm | undefined {
  const prefixes = [...PREFIXES.separable].sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (!key.startsWith(prefix) || key.length - prefix.length < 3) continue;
    const rest = key.slice(prefix.length);
    const base = deLexiconView.verb(rest).find((v) => !v.prefix);
    if (base) return verbParadigm({ ...base, lemma: key, prefix, base: rest, reflexive: undefined, gloss: '' }, 0, true, `read as ${prefix}- + ${rest}`);
  }
  if ([...prefixes, ...PREFIXES.dual].some((p) => key.startsWith(p) && key.length - p.length >= 3)) return undefined;
  return verbParadigm({ lemma: key, cls: 'weak', aux: 'haben', gloss: '' }, 0, true);
}

// ───────────────────────────── determiners ─────────────────────────────

const DET_LAYOUT: ParadigmLayout = {
  columns: { key: 'Gender', values: [['Masc', 'masculine'], ['Fem', 'feminine'], ['Neut', 'neuter'], ['', 'plural (all genders)']] },
  rows: { key: 'Case', values: CASE_ROWS },
};

function determinerParadigm(lemma: string): GeneratedParadigm | undefined {
  let forms = CLOSED_FORMS.filter((f) => f.pos === 'DET' && f.lemma === lemma && f.cells?.length);
  if (!forms.length) forms = CLOSED_FORMS.filter((f) => f.pos === 'DET' && lower(f.lemma) === lower(lemma) && f.cells?.length);
  if (!forms.length) return undefined;
  const cells: Cell[] = [];
  for (const f of forms) for (const c of f.cells!) {
    const features: Features = { Case: CASE_OF[c.c], Number: c.g === 'p' ? 'Plur' : 'Sing' };
    if (c.g !== 'p') features.Gender = GENDER_OF[c.g];
    put(cells, features, f.form);
  }
  const sorted = sortCells(cells, ['Gender', 'Case', 'Number']);
  const m = forms[0].morph ?? {};
  const l = forms[0].lemma;
  let template: string;
  if (m.PronType === 'Art' && m.Definite === 'Def') template = 'definite article';
  else if (m.PronType === 'Art') template = 'indefinite article (declines like a strong adjective except where it has no ending)';
  else if (m.Poss === 'Yes') template = 'possessive determiner (declines like ein)';
  else if (m.PronType === 'Neg') template = 'negative article kein (declines like ein, with a plural)';
  else template = 'determiner';
  const notes: string[] = [`${l}: ${forms[0].gloss}.`];
  if (forms.some((f) => f.governsDecl === 'wk')) notes.push('An adjective after it takes the weak endings (der gute Wein).');
  else if (forms.some((f) => f.governsDecl === 'mx')) notes.push('An adjective after it takes the mixed endings: the strong ending where it has none itself (ein guter Wein, meine gute Freundin).');
  if (!sorted.some((c) => c.features.Number === 'Plur')) notes.push('There is no plural (ein has none: the plural of ein Hund is Hunde with no article; kein, mein … do have one).');
  if (m.Poss === 'Yes') notes.push('The possessive agrees in gender and number with the thing owned, not the owner; it declines like ein (no ending in the nominative masculine and the nominative and accusative neuter).');
  if (sorted.some((c, i) => sorted.findIndex((x) => featureKey(x.features) === featureKey(c.features)) !== i)) notes.push('A cell with two spellings (unsere / unsre) lists both; the first is the usual one.');
  return { kind: 'determiner-paradigm', cells: sorted, layout: { ...DET_LAYOUT, labels: { Case: CASE_LABEL } }, template, notes };
}

// ───────────────────────────── the adapter's method ─────────────────────────────

/** `LanguageAdapter.paradigm`: the generated paradigm of a word of the list (or a weak verb, guessed), else undefined. `hint.features.Gender` picks among nouns of one spelling; `hint.features.Separable` ('Yes' / 'No') among verbs. */
export function germanParadigm(lemma: string, pos: PartOfSpeech, hint?: { features?: Features; surface?: string }): GeneratedParadigm | undefined {
  const key = lower(lemma.trim());
  if (!key || /\s/.test(key) && pos !== 'VERB') return undefined;
  switch (pos) {
    case 'NOUN': {
      const nouns = deLexiconView.nouns(key);
      return nouns.length ? nounParadigm(nouns, hint) : undefined;
    }
    case 'ADJ': {
      const adj = deLexiconView.adjective(key);
      return adj ? adjectiveParadigm(adj) : undefined;
    }
    case 'VERB': case 'AUX': {
      const verbs = verbsOf(key);
      if (verbs.length) {
        const sep = hint?.features?.Separable;
        const wanted = sep === 'Yes' ? verbs.filter((v) => v.prefix) : sep === 'No' ? verbs.filter((v) => !v.prefix) : verbs;
        const pool = wanted.length ? wanted : verbs;
        return verbParadigm(pool[0], verbs.length - 1, false);
      }
      if (!WEAK_INFINITIVE.test(key) || deLexiconView.closed(key).length || deLexiconView.plain(key).length || deLexiconView.nouns(key).length) return undefined;
      return guessedVerb(key);
    }
    case 'DET': return determinerParadigm(lemma.trim());
    default: return undefined;
  }
}

// ───────────────────────────── the dictionary half, merged ─────────────────────────────

export interface DeTableRow { form: string; tags: readonly string[] }

/** What the probe and the merge need to know about a row: where it lands, or why it does not. */
export function deTableRowDetail(tags: readonly string[], pos: PartOfSpeech): { features?: Features; skipped?: string; unknown: string[] } {
  const r = tableRow(tags, pos);
  const unknown = unknownTableTags(tags);
  return 'features' in r ? { features: r.features, unknown } : { skipped: r.skipped, unknown };
}

/**
 * The paradigm of a lexeme with the dictionary's table merged in: the rows (`form` and `tags`, as kaikki gives them) are
 * mapped with the table-tag mapper, the generated cells and the table's cells are merged with `mergeParadigm` (verified /
 * supported / generated / conflicted per cell). Returns undefined when neither the adapter nor the table has a cell.
 * The spelling that agrees with the rules goes first, so a cell is verified when ANY of the table's spellings matches.
 */
export function deParadigmFromTable(
  lemma: string, pos: PartOfSpeech, rows: readonly DeTableRow[],
  opts: { dictionarySource?: { id: string; label: string; licence?: string }; hint?: { features?: Features; surface?: string } } = {},
): Paradigm | undefined {
  const g = germanParadigm(lemma, pos, opts.hint);
  const mine = new Map<string, string[]>();
  for (const c of g?.cells ?? []) { const k = featureKey(c.features); (mine.get(k) ?? mine.set(k, []).get(k)!).push(nfc(c.form)); }
  const byKey = new Map<string, Cell[]>();
  for (const r of rows) {
    const features = tableRow(r.tags, pos);
    if (!('features' in features)) continue;
    const form = tableForm(r.form, r.tags);
    if (form === undefined) continue;
    const k = featureKey(features.features);
    const note = tableNote(r.tags);
    const l = byKey.get(k) ?? [];
    if (!l.some((c) => c.form === form)) l.push({ features: features.features, form, ...(note ? { note } : {}) });
    byKey.set(k, l);
  }
  const wik: Cell[] = [];
  for (const [k, list] of byKey) {
    const have = mine.get(k) ?? [];
    list.sort((a, b) => Number(have.includes(nfc(b.form))) - Number(have.includes(nfc(a.form))));
    wik.push(...list);
  }
  if (!g && wik.length === 0) return undefined;
  const DEFAULT_KIND: Partial<Record<PartOfSpeech, Paradigm['kind']>> = { NOUN: 'noun-declension', ADJ: 'adjective-declension', VERB: 'verb-conjugation', AUX: 'verb-conjugation', DET: 'determiner-paradigm' };
  const base: Omit<Paradigm, 'cells' | 'status'> = {
    languageId: 'de', lemma, pos, kind: g?.kind ?? DEFAULT_KIND[pos] ?? 'none',
    ...(g?.layout ? { layout: g.layout } : {}),
    ...(g?.template ? { template: g.template } : {}),
    notes: g?.notes ?? ["The adapter does not generate this word (it is not in the word list): the forms are the dictionary's table alone."],
    sources: [
      ...(g ? [{ id: DE_ANALYZER, label: 'German word-form rules and word list (machine-drafted, no native review)' }] : []),
      ...(wik.length ? [opts.dictionarySource ?? { id: 'kaikki-de', label: 'Wiktionary German inflection tables via kaikki.org', licence: 'CC BY-SA 4.0' }] : []),
    ],
    ...(g?.constructions ? { constructions: g.constructions } : {}),
  };
  return mergeParadigm(base, g?.cells ?? [], wik);
}
