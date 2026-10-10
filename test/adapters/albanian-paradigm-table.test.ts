/**
 * The dictionary half of an Albanian paradigm: the mapping of Wiktionary's table tags (kaikki.org rows, copied from the real
 * dump for libër, punoj and sëmurë) to the adapter's feature keys, and the merge with the generated cells (verified /
 * supported / generated / conflicted). The tables are template-generated and sometimes wrong; the mapper reports what a row
 * says and never corrects it.
 */
import { describe, expect, it } from 'vitest';
import { cellOf, paradigmSummary } from '../../src/core/paradigm';
import { sqAdapter } from '../../src/adapters/sq';
import { sqParadigmFromTable, sqTableForms } from '../../src/adapters/albanian/paradigm';
import type { SqTableRow } from '../../src/adapters/albanian/paradigm';
import { sqTableTagsDetail } from '../../src/adapters/albanian/table-tags';

const map = (tags: string[], pos: 'NOUN' | 'VERB' | 'ADJ' | 'PRON' | 'PROPN') => sqAdapter.featuresFromTableTags!(tags, pos);

/** libër's table, as the dump has it (form, tags). */
const LIBER: SqTableRow[] = [
  ['libër', 'indefinite nominative singular'], ['libri', 'definite nominative singular'], ['libra', 'indefinite nominative plural'], ['librat', 'definite nominative plural'],
  ['libër', 'accusative indefinite singular'], ['librin', 'accusative definite singular'], ['libra', 'accusative indefinite plural'], ['librat', 'accusative definite plural'],
  ['libri', 'dative indefinite singular'], ['librit', 'dative definite singular'], ['librave', 'dative indefinite plural'], ['librave', 'dative definite plural'],
  ['libri', 'ablative indefinite singular'], ['librit', 'ablative definite singular'], ['librash', 'ablative indefinite plural'], ['librave', 'ablative definite plural'],
].map(([form, tags]) => ({ form, tags: tags.split(' ') }));

describe('table tags → adapter features', () => {
  it('a noun row', () => {
    expect(map(['accusative', 'definite', 'singular'], 'NOUN')).toEqual({ Case: 'Acc', Definite: 'Def', Number: 'Sing' });
    expect(map(['indefinite', 'nominative', 'plural'], 'NOUN')).toEqual({ Case: 'Nom', Definite: 'Ind', Number: 'Plur' });
  });
  it('dative and genitive are one row (Gen,Dat); the ablative is its own', () => {
    expect(map(['dative', 'definite', 'singular'], 'NOUN')?.Case).toBe('Gen,Dat');
    expect(map(['genitive', 'definite', 'singular'], 'NOUN')?.Case).toBe('Gen,Dat');
    expect(map(['ablative', 'indefinite', 'plural'], 'NOUN')?.Case).toBe('Abl');
  });
  it('a finite verb row: person, number, tense, mood, voice and VerbForm like the analysis', () => {
    expect(map(['first-person', 'indicative', 'present', 'singular'], 'VERB')).toEqual({ Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', Voice: 'Act', VerbForm: 'Fin' });
    expect(map(['aorist', 'indicative', 'plural', 'third-person'], 'VERB')).toMatchObject({ Tense: 'Past', Person: '3', Number: 'Plur' });
    expect(map(['imperfect', 'indicative', 'second-person', 'singular'], 'VERB')).toMatchObject({ Tense: 'Imp' });
    expect(map(['present', 'singular', 'subjunctive', 'third-person'], 'VERB')).toMatchObject({ Mood: 'Sub', Tense: 'Pres' });
    expect(map(['admirative', 'first-person', 'present', 'singular'], 'VERB')).toMatchObject({ Mood: 'Adm', Tense: 'Pres' });
  });
  it('the adapter gives the imperative and the optative no tense', () => {
    expect(map(['imperative', 'second-person', 'singular'], 'VERB')).toEqual({ Person: '2', Number: 'Sing', Mood: 'Imp', Voice: 'Act', VerbForm: 'Fin' });
    expect(map(['first-person', 'optative', 'present', 'singular'], 'VERB')).toEqual({ Person: '1', Number: 'Sing', Mood: 'Opt', Voice: 'Act', VerbForm: 'Fin' });
  });
  it('non-active labels are Voice Mid', () => {
    expect(map(['first-person', 'indicative', 'mediopassive', 'present', 'singular'], 'VERB')?.Voice).toBe('Mid');
    expect(map(['passive', 'first-person', 'indicative', 'present', 'singular'], 'VERB')?.Voice).toBe('Mid');
  });
  it('the participle and the gerund are single cells', () => {
    expect(map(['participle'], 'VERB')).toEqual({ VerbForm: 'Part' });
    expect(map(['gerund'], 'VERB')).toEqual({ VerbForm: 'Ger' });
  });
  it('an adjective row is Gender × Number; a case other than nominative or a definite row is not placed', () => {
    expect(map(['feminine', 'plural'], 'ADJ')).toEqual({ Gender: 'Fem', Number: 'Plur' });
    expect(map(['masculine', 'nominative', 'singular'], 'ADJ')).toEqual({ Gender: 'Masc', Number: 'Sing' });
    expect(map(['accusative', 'masculine', 'singular'], 'ADJ')).toBeUndefined();
    expect(map(['definite', 'masculine', 'singular'], 'ADJ')).toBeUndefined();
  });
  it('a pronoun row: case, number, gender, clitic', () => {
    expect(map(['accusative', 'clitic'], 'PRON')).toEqual({ Case: 'Acc', Clitic: 'Yes' });
  });
  it('rows that are not inflected forms map to undefined, with the reason', () => {
    expect(map(['canonical'], 'NOUN')).toBeUndefined();
    expect(map(['canonical', 'masculine'], 'NOUN')).toBeUndefined();
    expect(map(['table-tags'], 'NOUN')).toBeUndefined();
    expect(map(['inflection-template'], 'VERB')).toBeUndefined();
    expect(map(['alternative', 'colloquial', 'informal'], 'NOUN')).toBeUndefined();
    expect(sqTableTagsDetail(['error-unrecognized-form', 'accusative'], 'NOUN').skipped).toBe('error');
    expect(sqTableTagsDetail(['indicative', 'perfect', 'singular', 'third-person'], 'VERB').skipped).toBe('construction');
    expect(sqTableTagsDetail(['future', 'indicative', 'singular', 'third-person'], 'VERB').skipped).toBe('construction');
    expect(sqTableTagsDetail(['infinitive'], 'VERB').skipped).toBe('construction');
    expect(sqTableTagsDetail(['vocative', 'singular'], 'NOUN').skipped).toBe('not-modelled');
    expect(sqTableTagsDetail(['first-person', 'indicative', 'present', 'singular'], 'NOUN').skipped).toBe('wrong-table');
  });
  it('an unknown tag is ignored and reported, never guessed', () => {
    const d = sqTableTagsDetail(['accusative', 'definite', 'singular', 'zzz-new-label'], 'NOUN');
    expect(d.features).toEqual({ Case: 'Acc', Definite: 'Def', Number: 'Sing' });
    expect(d.unknown).toEqual(['zzz-new-label']);
  });
});

describe('spellings of a table cell', () => {
  it('the subjunctive loses its particle; a bracketed variant is a second spelling', () => {
    expect(sqTableForms('të punoj', { Mood: 'Sub' })).toEqual(['punoj']);
    expect(sqTableForms('humbitni (humbisni)', { Mood: 'Ind' })).toEqual(['humbitni', 'humbisni']);
    expect(sqTableForms('pres (³prej, ³prëj)', { Mood: 'Ind' })).toEqual(['pres', 'prej', 'prëj']);
    expect(sqTableForms('libri', {})).toEqual(['libri']);
  });
});

describe('the merge: libër (the table and the rules agree)', () => {
  const p = sqParadigmFromTable('libër', 'NOUN', LIBER)!;
  it('all 16 cells are verified, and the rows took the word list\'s gender', () => {
    expect(p.cells).toHaveLength(16);
    expect(paradigmSummary(p)).toEqual({ verified: 16, supported: 0, generated: 0, conflicted: 0 });
    expect(p.status).toBe('verified');
    expect(cellOf(p, { Case: 'Acc', Number: 'Sing', Definite: 'Def', Gender: 'Masc' })?.form).toBe('librin');
    expect(p.sources.map((s) => s.id)).toEqual(expect.arrayContaining(['kaikki-sq']));
    expect(p.languageId).toBe('sq');
  });
});

describe('the merge statuses', () => {
  it('conflicted: the table disagrees (the dictionary\'s form first, the rules\' in alternatives)', () => {
    const rows = LIBER.map((r) => (r.form === 'librash' ? { ...r, form: 'librosh' } : r));
    const p = sqParadigmFromTable('libër', 'NOUN', rows)!;
    const c = cellOf(p, { Case: 'Abl', Number: 'Plur', Definite: 'Ind', Gender: 'Masc' })!;
    expect(c.status).toBe('conflicted');
    expect(c.form).toBe('librosh');
    expect(c.alternatives).toEqual(['librash']);
    expect(p.status).toBe('conflicted');
  });
  it('generated: a cell only the rules have; supported: a cell only the table has', () => {
    const rows = LIBER.filter((r) => r.form !== 'librin').concat([{ form: 'libërz', tags: ['vocative', 'singular'] }]);
    const p = sqParadigmFromTable('libër', 'NOUN', rows)!;
    expect(cellOf(p, { Case: 'Acc', Number: 'Sing', Definite: 'Def', Gender: 'Masc' })?.status).toBe('generated');
    // a vocative row is not placed at all
    expect(p.cells.some((c) => c.form === 'libërz')).toBe(false);
    const q = sqParadigmFromTable('punoj', 'VERB', [{ form: 'punuakam', tags: ['admirative', 'first-person', 'imperfect', 'singular'] }])!;
    const s = cellOf(q, { Person: '1', Number: 'Sing', Tense: 'Imp', Mood: 'Adm', Voice: 'Act', VerbForm: 'Fin' });
    expect(s?.status).toBe('supported');
    expect(s?.sources).toEqual(['wiktionary']);
  });
  it('a lemma the adapter cannot generate is the table alone (supported), and says so', () => {
    const p = sqParadigmFromTable('zzxyqq', 'NOUN', [{ form: 'zzxyqq', tags: ['indefinite', 'nominative', 'singular'] }])!;
    expect(p.cells).toHaveLength(1);
    expect(p.cells[0].status).toBe('supported');
    expect(p.notes.join(' ')).toContain('dictionary\'s table alone');
    expect(sqParadigmFromTable('zzxyqq', 'NOUN', [])).toBeUndefined();
  });
});

describe('a real verb table: punoj', () => {
  const T = (form: string, ...tags: string[]): SqTableRow => ({ form, tags });
  const rows: SqTableRow[] = [
    T('punuar', 'participle'), T('duke punuar', 'gerund'), T('për të punuar', 'infinitive'),
    T('punoj', 'first-person', 'indicative', 'present', 'singular'), T('punon', 'indicative', 'present', 'second-person', 'singular'),
    T('punon', 'indicative', 'present', 'singular', 'third-person'),
    T('të punoj', 'first-person', 'present', 'singular', 'subjunctive'), T('të punosh', 'present', 'second-person', 'singular', 'subjunctive'),
    T('punova', 'aorist', 'first-person', 'indicative', 'singular'), T('kam punuar', 'first-person', 'indicative', 'perfect', 'singular'),
    T('do të punoj', 'first-person', 'future', 'indicative', 'singular'), T('pata punuar', 'error-unrecognized-form', 'first-person', 'indicative', 'singular'),
  ];
  const p = sqParadigmFromTable('punoj', 'VERB', rows)!;
  it('cells are verified; the periphrases and the error row are not cells', () => {
    for (const f of <Array<Record<string, string>>>[
      { VerbForm: 'Part' }, { VerbForm: 'Ger' },
      { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', Voice: 'Act', VerbForm: 'Fin' },
      { Person: '2', Number: 'Sing', Tense: 'Pres', Mood: 'Sub', Voice: 'Act', VerbForm: 'Fin' },
      { Person: '1', Number: 'Sing', Tense: 'Past', Mood: 'Ind', Voice: 'Act', VerbForm: 'Fin' },
    ]) expect(cellOf(p, f)?.status).toBe('verified');
    expect(p.cells.some((c) => c.form === 'kam punuar' || c.form === 'do të punoj' || c.form === 'për të punuar' || c.form === 'pata punuar')).toBe(false);
  });
  it('the rest of the paradigm is generated, not claimed by the dictionary', () => {
    const s = paradigmSummary(p);
    expect(s.verified).toBe(8);
    expect(s.generated).toBeGreaterThan(30);
    expect(s.conflicted).toBe(0);
  });
});

describe('a real adjective table: sëmurë', () => {
  it('Gender × Number with the article in the form', () => {
    const rows: SqTableRow[] = [
      { form: 'i sëmurë', tags: ['masculine', 'singular'] }, { form: 'e sëmurë', tags: ['feminine', 'singular'] },
      { form: 'të sëmurë', tags: ['masculine', 'plural'] }, { form: 'të sëmura', tags: ['feminine', 'plural'] },
    ];
    const p = sqParadigmFromTable('sëmurë', 'ADJ', rows)!;
    expect(p.cells).toHaveLength(4);
    expect(p.cells.every((c) => c.sources.includes('wiktionary'))).toBe(true);
    // verified where the word list knows the adjective; otherwise supported
    const known = sqAdapter.paradigm!('sëmurë', 'ADJ');
    expect(p.cells.every((c) => c.status === (known ? 'verified' : 'supported'))).toBe(true);
  });
});
