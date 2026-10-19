/**
 * Wiktionary's Latin inflection tags (as the kaikki.org extract and the dictionary shards carry them) mapped to this adapter's
 * feature keys. Only the vocabulary of the tags is used (nominative, first-person, pluperfect ...); no table data is copied.
 * A row whose tags name a form the adapter does not model (the archaic sigmatic future and aorist, a potential infinitive) maps to
 * undefined: it is not placed in the table. A row that stands for all three genders (the dative plural bonis) is placed in the
 * masculine cell; the feminine and neuter cells of that case stay "rules only".
 */
import type { PartOfSpeech } from '../../core';

const CASE: Record<string, string> = { nominative: 'Nom', genitive: 'Gen', dative: 'Dat', accusative: 'Acc', ablative: 'Abl', vocative: 'Voc', locative: 'Loc' };
const NUMBER: Record<string, string> = { singular: 'Sing', plural: 'Plur' };
const GENDER: Record<string, string> = { masculine: 'Masc', feminine: 'Fem', neuter: 'Neut' };
const PERSON: Record<string, string> = { 'first-person': '1', 'second-person': '2', 'third-person': '3' };
const IGNORED = new Set(['canonical', 'table-tags', 'inflection-template', 'alternative', 'noun-from-verb', 'obsolete', 'archaic', 'rare', 'poetic', 'dialectal', 'uncommon', 'Medieval-Latin', 'Late-Latin', 'Old-Latin', 'Classical-Latin', 'Ecclesiastical', 'New-Latin', 'Medieval', 'Late', 'Early', 'nonstandard', 'vulgar', 'proscribed', 'misspelling', 'pronunciation-spelling', 'post-Augustan', 'Latin']);
const UNMODELLED = new Set(['sigmatic', 'aorist', 'potential', 'adverb', 'diminutive', 'abbreviation', 'comparative', 'superlative', 'positive', 'oblique', 'stem', 'class', 'pronominal', 'contraction', 'syncope', 'apocopic', 'clitic', 'emphatic', 'before-vowel', 'symbol', 'uppercase', 'lowercase']);

export type TableRow = { features: Record<string, string> } | { unplaced: string };

export function latinTableRow(tags: readonly string[], pos: PartOfSpeech): TableRow {
  const t = new Set(tags);
  for (const x of t) if (UNMODELLED.has(x)) return { unplaced: x };
  const f: Record<string, string> = {};
  const genders: string[] = [];
  for (const x of t) {
    if (CASE[x]) f.Case = CASE[x];
    else if (NUMBER[x]) f.Number = NUMBER[x];
    else if (GENDER[x]) genders.push(GENDER[x]);
    else if (PERSON[x]) f.Person = PERSON[x];
  }
  const verbal = pos === 'VERB' || pos === 'AUX';
  if (verbal) {
    const voice = t.has('passive') ? 'Pass' : t.has('active') ? 'Act' : undefined;
    if (t.has('infinitive')) {
      f.VerbForm = 'Inf';
      f.Tense = t.has('future') ? 'Fut' : t.has('perfect') ? 'Perf' : 'Pres';
      if (voice) f.Voice = voice;
      return { features: { VerbForm: f.VerbForm, Tense: f.Tense, ...(voice ? { Voice: voice } : {}) } };
    }
    if (t.has('participle') && t.has('future') && voice === 'Pass') {
      // the future passive participle is the gerundive
      f.VerbForm = 'Gdv';
      f.Voice = 'Pass';
      if (genders.length) f.Gender = genders[0];
      return { features: f };
    }
    if (t.has('participle')) {
      f.VerbForm = 'Part';
      f.Tense = t.has('future') ? 'Fut' : t.has('perfect') ? 'Perf' : 'Pres';
      if (voice) f.Voice = voice;
      if (genders.length) f.Gender = genders[0];
      return { features: f };
    }
    if (t.has('gerund')) { f.VerbForm = 'Ger'; delete f.Number; return { features: f }; }
    if (t.has('supine')) { f.VerbForm = 'Sup'; delete f.Number; return { features: f }; }
    if (t.has('gerundive')) { f.VerbForm = 'Gdv'; f.Voice = 'Pass'; if (genders.length) f.Gender = genders[0]; return { features: f }; }
    f.VerbForm = 'Fin';
    if (t.has('indicative')) f.Mood = 'Ind';
    else if (t.has('subjunctive')) f.Mood = 'Sub';
    else if (t.has('imperative')) f.Mood = 'Imp';
    else return { unplaced: 'no mood' };
    if (t.has('future') && t.has('perfect')) f.Tense = 'FutPerf';
    else if (t.has('pluperfect')) f.Tense = 'Pqp';
    else if (t.has('perfect')) f.Tense = 'Perf';
    else if (t.has('imperfect')) f.Tense = 'Imp';
    else if (t.has('future')) f.Tense = 'Fut';
    else if (t.has('present')) f.Tense = 'Pres';
    else return { unplaced: 'no tense' };
    if (voice) f.Voice = voice;
    if (!f.Voice) return { unplaced: 'no voice' };
    if (!f.Person || !f.Number) return { unplaced: 'no person or number' };
    return { features: f };
  }
  if (!f.Case || !f.Number) return { unplaced: 'no case or number' };
  if ((pos === 'ADJ' || pos === 'PRON' || pos === 'DET' || pos === 'NUM') && genders.length) f.Gender = genders[0];
  return { features: f };
}

export function latinFeaturesFromTableTags(tags: readonly string[], pos: PartOfSpeech): Record<string, string> | undefined {
  const r = latinTableRow(tags, pos);
  return 'features' in r ? r.features : undefined;
}

/** Dictionary labels for an inflected form ("first-person", "plural", "imperfect", "subjunctive") → features (the `morphFromTags` contract). Unknown labels are ignored. */
export function latinMorphFromTags(tags: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, v: string): void => { out[k] = out[k] ? [...new Set([...out[k].split(','), v])].sort().join(',') : v; };
  const t = new Set(tags);
  for (const x of tags) {
    if (IGNORED.has(x)) continue;
    if (CASE[x]) add('Case', CASE[x]);
    else if (NUMBER[x]) add('Number', NUMBER[x]);
    else if (GENDER[x]) add('Gender', GENDER[x]);
    else if (PERSON[x]) add('Person', PERSON[x]);
    else if (x === 'indicative') add('Mood', 'Ind');
    else if (x === 'subjunctive') add('Mood', 'Sub');
    else if (x === 'imperative') add('Mood', 'Imp');
    else if (x === 'active') add('Voice', 'Act');
    else if (x === 'passive') add('Voice', 'Pass');
    else if (x === 'present') add('Tense', 'Pres');
    else if (x === 'imperfect') add('Tense', 'Imp');
    else if (x === 'pluperfect') add('Tense', 'Pqp');
    else if (x === 'perfect' && !t.has('future')) add('Tense', 'Perf');
    else if (x === 'future') add('Tense', t.has('perfect') ? 'FutPerf' : 'Fut');
    else if (x === 'infinitive') add('VerbForm', 'Inf');
    else if (x === 'participle') add('VerbForm', 'Part');
    else if (x === 'gerund') add('VerbForm', 'Ger');
    else if (x === 'gerundive') add('VerbForm', 'Gdv');
    else if (x === 'supine') add('VerbForm', 'Sup');
    else if (x === 'comparative') add('Degree', 'Cmp');
    else if (x === 'superlative') add('Degree', 'Sup');
    else if (x === 'deponent') add('Deponent', 'Yes');
  }
  if (out.Mood && !out.VerbForm) out.VerbForm = 'Fin';
  return out;
}
