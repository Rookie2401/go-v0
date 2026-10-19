/**
 * Latin paradigm generation (GoLearn Linguistic Engine V2, Stage 3): the forms a lexeme takes, as the shared `GeneratedParadigm` shape
 * of src/core/paradigm.ts, produced ONLY from what the adapter's own analysis generates (morph-noun.ts, morph-verb.ts and the closed
 * tables): the cells here are exactly the cells the form index is built from, so every cell analyses back to its lemma
 * (test/adapters/latin-paradigm.test.ts checks it).
 *
 *   noun        Case (Nom Gen Dat Acc Abl Voc, Loc for domus) x Number; Gender is a fact of the word (a note)
 *   adjective   Degree (positive, Cmp, Sup) x Number as sections, Case x Gender; the adverb is a separate lexeme
 *   verb        VerbForm=Fin x Mood x Voice x Tense as sections, Person x Number; the infinitives, supines and gerund beside them. The
 *               periphrastic perfect passive (amatus sum) is a cell of two words; participles and the gerundive are listed in the
 *               nominative singular (they decline like adjectives, said in the notes)
 *   pronoun     Case x Gender (Number as a section) or Case x Number (Person as a section)
 *
 * What it will not do: an indeclinable word (adverb, preposition, conjunction) has no table; a lemma outside the lexicon gets nothing.
 */
import type { GeneratedParadigm, Paradigm, ParadigmCell, ParadigmLayout, PartOfSpeech } from '../../core';
import { cellsForSelection } from '../../core/paradigm';
import { latinLexicon } from './lexicon';
import type { Cell, Feats, Lexeme } from './types';

const CASE_ROWS: Array<[string, string]> = [['Nom', 'nominative (subject)'], ['Gen', 'genitive (of)'], ['Dat', 'dative (to, for)'], ['Acc', 'accusative (object)'], ['Abl', 'ablative (by, with, from)'], ['Voc', 'vocative (addressing)']];
const NUMBER_COLS: Array<[string, string]> = [['Sing', 'singular'], ['Plur', 'plural']];
const GENDER_COLS: Array<[string, string]> = [['Masc', 'masculine'], ['Fem', 'feminine'], ['Neut', 'neuter']];
const GENDER_WORD: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter', 'Fem,Masc': 'masculine or feminine (common gender)' };

const noteOf = (c: Cell): string | undefined => c.note === 'variant' ? 'a variant form' : c.note === 'contracted' ? 'a contracted form' : c.note === 'indeclinable' ? 'indeclinable in the Vulgate: this form stands for every case' : c.periphrastic ? 'two words: the participle agrees with the subject, sum is the auxiliary' : c.note;

function toCells(cells: Cell[]): GeneratedParadigm['cells'] {
  return cells.map((c) => ({ features: c.features, form: c.form, ...(noteOf(c) ? { note: noteOf(c) } : {}) }));
}

function nounParadigm(lex: Lexeme): GeneratedParadigm | undefined {
  const cells = lex.cells();
  if (!cells.length) return undefined;
  const rows = CASE_ROWS.slice();
  if (cells.some((c) => c.features.Case === 'Loc')) rows.push(['Loc', 'locative (at, in a place)']);
  const notes: string[] = [];
  if (lex.info.gender) notes.push(`Gender: ${GENDER_WORD[lex.info.gender] ?? lex.info.gender}. The cells hold the bare noun.`);
  if (lex.info.indeclinable) notes.push('A name the Vulgate leaves undeclined in most uses: one form stands for every case.');
  if (lex.origin === 'rule') notes.push('The declension of this name is assumed from its ending; the word list holds no genitive for it.');
  if (cells.every((c) => c.features.Number === 'Plur')) notes.push('Used in the plural only.');
  const p = lex.info.principal ?? [];
  return {
    kind: 'noun-declension', cells: toCells(cells), layout: { columns: { key: 'Number', values: NUMBER_COLS }, rows: { key: 'Case', values: rows } },
    template: `${p[0]}${p[1] ? `, ${p[1]}` : ''} (${lex.info.declension ? `${['', '1st', '2nd', '3rd', '4th', '5th'][Number(lex.info.declension)]} declension` : 'indeclinable'})`,
    notes,
  };
}

function adjectiveParadigm(lex: Lexeme): GeneratedParadigm | undefined {
  const cells = lex.cells();
  if (!cells.length) return undefined;
  const p = lex.info.principal ?? [];
  const layout: ParadigmLayout = {
    columns: { key: 'Gender', values: GENDER_COLS }, rows: { key: 'Case', values: CASE_ROWS }, sections: ['Degree', 'Number'],
    labels: { Degree: { Cmp: 'comparative', Sup: 'superlative' }, Number: { Sing: 'singular', Plur: 'plural' } },
  };
  const notes = ['The positive degree has no Degree feature. The comparative is formed with -ior, the superlative with -issimus (-rimus after -er, -limus in facilis and a few more); the irregular comparisons (bonus, malus, magnus, parvus, multus) are listed by hand.'];
  if (lex.info.adjType === '3b') notes.push('A two-termination adjective of the third declension: one form for masculine and feminine, one for neuter.');
  return { kind: 'adjective-declension', cells: toCells(cells), layout, template: `${p.filter(Boolean).join(', ')} (${lex.info.adjType === '12' || lex.info.adjType === '12r' ? '1st/2nd declension' : '3rd declension'})`, notes };
}

const VERB_LAYOUT: ParadigmLayout = {
  columns: { key: 'Number', values: NUMBER_COLS },
  rows: { key: 'Person', values: [['1', 'first person (I / we)'], ['2', 'second person (you)'], ['3', 'third person (he, she, it / they)'], ['', 'no person (infinitive, participle, gerund, supine)']] },
  sections: ['VerbForm', 'Mood', 'Voice', 'Tense'],
  labels: {
    VerbForm: { Fin: 'finite forms', Inf: 'infinitive', Part: 'participle', Ger: 'gerund', Gdv: 'gerundive', Sup: 'supine' },
    Mood: { Ind: 'indicative', Sub: 'subjunctive', Imp: 'imperative' },
    Voice: { Act: 'active', Pass: 'passive' },
    Tense: { Pres: 'present', Imp: 'imperfect', Fut: 'future', Perf: 'perfect', Pqp: 'pluperfect', FutPerf: 'future perfect' },
  },
};

function verbParadigm(lex: Lexeme): GeneratedParadigm | undefined {
  const all = lex.cells();
  if (!all.length) return undefined;
  // participles and the gerundive decline like adjectives: the table lists the nominative singular, the analysis finds every case
  const cells = all.filter((c) => (c.features.VerbForm !== 'Part' && c.features.VerbForm !== 'Gdv') || (c.features.Case === 'Nom' && c.features.Number === 'Sing'));
  const p = lex.info.principal ?? [];
  const notes: string[] = [];
  if (lex.info.deponent) notes.push('Deponent (or semi-deponent) verb: passive forms with an active meaning. Its cells are marked Voice=Act, the meaning, although the forms look passive; the participles and the perfect system follow the same pattern.');
  if (lex.info.defective) notes.push('Defective verb: only the forms listed exist.');
  notes.push('Periphrastic forms of two words (amatus sum, amatum esse) are cells of the table, but the analysis reads each word separately: the participle (amatus) and sum.');
  notes.push('Participles and the gerundive are shown in the nominative singular only; they decline like adjectives (the present participle like a third-declension i-stem, the others like bonus, -a, -um).');
  notes.push('Syncopated perfects (amasti, audisse, audierunt) and the third plural -ere are listed as variants of the regular form.');
  return { kind: 'verb-conjugation', cells: toCells(cells), layout: VERB_LAYOUT, template: `${p.join(', ')}${lex.info.conjugation ? ` (${({ '1': '1st', '2': '2nd', '3': '3rd', '3io': '3rd in -io', '4': '4th' } as Record<string, string>)[lex.info.conjugation] ?? lex.info.conjugation} conjugation${lex.info.deponent ? ', deponent' : ''})` : ''}`, notes };
}

function pronounParadigm(lex: Lexeme): GeneratedParadigm | undefined {
  const cells = lex.cells().filter((c) => !c.periphrastic);
  if (!cells.length || cells.length < 2) return undefined;
  const hasGender = cells.some((c) => c.features.Gender);
  const hasPerson = cells.some((c) => c.features.Person);
  const layout: ParadigmLayout = hasGender
    ? { columns: { key: 'Gender', values: GENDER_COLS }, rows: { key: 'Case', values: CASE_ROWS }, sections: ['Number'], labels: { Number: { Sing: 'singular', Plur: 'plural' } } }
    : { columns: { key: 'Number', values: NUMBER_COLS }, rows: { key: 'Case', values: CASE_ROWS }, ...(hasPerson ? { sections: ['Person'], labels: { Person: { '1': 'first person', '2': 'second person', '3': 'third person' } } } : {}) };
  return { kind: lex.kind === 'pron' ? 'pronoun-paradigm' : 'adjective-declension', cells: toCells(cells), layout, template: lex.gloss, notes: ['Taken from the Romance app\'s closed-class tables; a form the table does not hold has no cell.'] };
}

/** The paradigm of a lemma, from the adapter's own generation; undefined for an indeclinable word or a lemma the lexicon does not hold. */
export function latinParadigm(lemma: string, pos: PartOfSpeech, hint?: { features?: Feats; surface?: string }): GeneratedParadigm | undefined {
  const lexicon = latinLexicon();
  const list = (lexicon.byLemma.get(lemma) ?? []).filter((l) => l.pos === pos || (pos === 'VERB' && l.pos === 'AUX') || (pos === 'AUX' && l.pos === 'VERB'));
  const lex = list.length > 1 && hint?.surface ? (list.find((l) => l.cells().some((c) => c.form.toLowerCase() === hint.surface?.toLowerCase())) ?? list[0]) : (list[0] ?? lexicon.find(lemma, pos));
  if (!lex) return undefined;
  if (lex.info.indeclinable && lex.kind !== 'proper' && lex.kind !== 'noun') return undefined;
  switch (lex.kind) {
    case 'noun': case 'proper': return nounParadigm(lex);
    case 'adj': return adjectiveParadigm(lex);
    case 'verb': return verbParadigm(lex);
    case 'pron': case 'num': case 'det': return pronounParadigm(lex);
    default: return undefined;
  }
}

/** The cells a reading occupies: a union reading ("Acc,Nom") takes every cell it could be; a feature the cells do not carry (a noun's Gender, Deponent) is ignored. */
export function latinCellsFor(paradigm: Pick<Paradigm, 'cells' | 'kind' | 'pos'>, features: Feats, surface?: string): ParadigmCell[] {
  const f: Feats = { ...features };
  delete f.Deponent;
  delete f.NumValue;
  if (paradigm.kind === 'noun-declension') delete f.Gender;
  const hits = cellsForSelection(paradigm, f, surface);
  if (hits.length || !surface) return hits;
  return [];
}
