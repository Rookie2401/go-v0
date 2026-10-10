/**
 * Linguistic Engine V2, Stage 3 wiring: how the card finds the cells the selected form occupies (the adapter's own
 * projection, else the generic split of union readings), and how a script without spaces offers its alternative cuts.
 */
import { describe, expect, it } from 'vitest';
import { cellsForSelection, featureKey, type Paradigm, type ParadigmCell } from '../../src/core/paradigm';
import { buildParadigm, segmentationsOf, selectedCellKeys, type LexicalRecord } from '../../packages/golearn-extension/src/content/enrich';
import { sqAdapter } from '../../src/adapters/sq';
import { esAdapter } from '../../src/adapters/es';
import { thAdapter } from '../../src/adapters/th';

const cell = (form: string, features: Record<string, string>): ParadigmCell => ({ form, features, sources: ['generated'], status: 'generated' });

describe('cellsForSelection (generic, no adapter projection)', () => {
  const p: Pick<Paradigm, 'cells'> = { cells: [
    cell('boka', { Definite: 'Def', Number: 'Sing' }), cell('bok', { Definite: 'Ind', Number: 'Sing' }),
    cell('bøker', { Definite: 'Ind', Number: 'Plur' }), cell('bøkene', { Definite: 'Def', Number: 'Plur' }),
  ] };
  it('splits a union value into every combination and drops keys no cell carries', () => {
    const out = cellsForSelection(p, { Definite: 'Def,Ind', Number: 'Sing', Case: 'Nom' });
    expect(out.map((c) => c.form).sort()).toEqual(['bok', 'boka']);
  });
  it('matches a cell that carries more features than the reading, narrowed by the surface', () => {
    expect(cellsForSelection(p, { Number: 'Plur' }, 'bøkene').map((c) => c.form)).toEqual(['bøkene']);
    expect(cellsForSelection(p, { Number: 'Plur' }).map((c) => c.form).sort()).toEqual(['bøkene', 'bøker']);
  });
  it('falls back to the form when the features name no cell, and to nothing when neither matches', () => {
    expect(cellsForSelection(p, { Tense: 'Past' }, 'boka').map((c) => c.form)).toEqual(['boka']);
    expect(cellsForSelection(p, { Tense: 'Past' }, 'bokk')).toEqual([]);
  });
});

const LIBER: LexicalRecord = { w: 'libër', p: 'NOUN', s: [{ g: 'book' }], tpl: ['sq-noun-m'], f: [
  { f: 'libër', t: ['indefinite', 'nominative', 'singular'], s: 'declension' }, { f: 'libri', t: ['definite', 'nominative', 'singular'], s: 'declension' },
  { f: 'libra', t: ['indefinite', 'nominative', 'plural'], s: 'declension' }, { f: 'librat', t: ['definite', 'nominative', 'plural'], s: 'declension' },
  { f: 'libër', t: ['accusative', 'indefinite', 'singular'], s: 'declension' }, { f: 'librin', t: ['accusative', 'definite', 'singular'], s: 'declension' },
  { f: 'libri', t: ['dative', 'indefinite', 'singular'], s: 'declension' }, { f: 'librit', t: ['dative', 'definite', 'singular'], s: 'declension' },
] };

describe('selectedCellKeys through the adapters', () => {
  it('Albanian: librin (accusative definite singular) is placed by the adapter projection, with the union reading of a dictionary row', () => {
    const p = buildParadigm(sqAdapter, 'sq', 'libër', 'NOUN', LIBER, { features: { Case: 'Acc', Definite: 'Def', Number: 'Sing' }, surface: 'librin' });
    expect(p).toBeDefined();
    const keys = selectedCellKeys(sqAdapter, p, { Case: 'Acc', Definite: 'Def', Number: 'Sing' }, 'librin');
    expect(keys.length).toBeGreaterThan(0);
    const marked = p!.cells.filter((c) => keys.includes(featureKey(c.features)));
    expect(marked.every((c) => c.form === 'librin')).toBe(true);
    // a union reading (the analyser could not decide the case) still lands on cells, never on nothing
    const union = selectedCellKeys(sqAdapter, p, { Case: 'Acc,Nom', Definite: 'Def', Number: 'Sing' }, 'librin');
    expect(union.length).toBeGreaterThan(0);
  });
  it('Spanish: a verb reading with comma lists is projected onto one cell of the conjugation', () => {
    const p = buildParadigm(esAdapter, 'es', 'hablar', 'VERB', undefined, { features: { Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing' }, surface: 'hablo' });
    expect(p).toBeDefined();
    expect(p!.cells.some((c) => c.form === 'hablo')).toBe(true);
    const keys = selectedCellKeys(esAdapter, p, { Mood: 'Ind', Tense: 'Pres', Person: '1', Number: 'Sing', VerbForm: 'Fin' }, 'hablo');
    expect(keys.length).toBeGreaterThan(0);
    expect(p!.cells.filter((c) => keys.includes(featureKey(c.features))).map((c) => c.form)).toEqual(['hablo']);
  });
  it('is empty for an uninflecting paradigm and for no paradigm', () => {
    expect(selectedCellKeys(thAdapter, { languageId: 'th', lemma: 'x', pos: 'NOUN', kind: 'none', cells: [], notes: [], sources: [], status: 'none' }, {}, 'x')).toEqual([]);
    expect(selectedCellKeys(sqAdapter, undefined, { Case: 'Acc' }, 'librin')).toEqual([]);
  });
});

describe('segmentationsOf', () => {
  it('Thai: the chosen cut and the alternatives the word list allows, in the core shape', () => {
    const s = segmentationsOf(thAdapter, 'ตากลม');
    expect(s).toBeDefined();
    expect(s!.chosen.words.length).toBeGreaterThan(0);
    expect(s!.chosen.words.every((w) => typeof w.text === 'string' && typeof w.known === 'boolean')).toBe(true);
    expect(Array.isArray(s!.alternatives)).toBe(true);
    for (const a of s!.alternatives) { expect(a.words.map((w) => w.text).join('')).toBe(s!.text); expect(a.confidence).toBeGreaterThan(0); }
    if (!s!.alternatives.length) expect(typeof s!.reason).toBe('string');
  });
  it('is undefined for a language that writes spaces, and for an empty selection', () => {
    expect(segmentationsOf(sqAdapter, 'librin')).toBeUndefined();
    expect(segmentationsOf(thAdapter, '  ')).toBeUndefined();
  });
});

describe('alignTable: the dictionary rows on the generated cells’ keys', () => {
  const gen = [
    { features: { Case: 'Nom', Definite: 'Ind', Gender: 'Masc', Number: 'Sing' } }, { features: { Case: 'Gen,Dat', Definite: 'Def', Gender: 'Masc', Number: 'Sing' } },
    { features: { Case: 'Abl', Definite: 'Def', Gender: 'Masc', Number: 'Sing' } },
  ];
  it('adds the constant feature the rows lack, narrows a value into the one union cell it fits, and drops headline rows', async () => {
    const { alignTable } = await import('../../packages/golearn-extension/src/content/enrich');
    const rows = alignTable(gen, [
      { form: 'libër', features: { Case: 'Nom', Definite: 'Ind', Number: 'Sing' } },
      { form: 'librit', features: { Case: 'Dat', Definite: 'Def', Number: 'Sing' } },
      { form: 'libra', features: { Number: 'Plur' } },
    ]);
    expect(rows.map((r) => [r.form, featureKey(r.features)])).toEqual([
      ['libër', 'Case=Nom|Definite=Ind|Gender=Masc|Number=Sing'], ['librit', 'Case=Gen,Dat|Definite=Def|Gender=Masc|Number=Sing'],
    ]);
  });
  it('leaves the rows alone when nothing was generated', async () => {
    const { alignTable } = await import('../../packages/golearn-extension/src/content/enrich');
    const rows = [{ form: 'libra', features: { Number: 'Plur' } }];
    expect(alignTable(undefined, rows)).toEqual(rows);
    expect(alignTable([], rows)).toEqual(rows);
  });
});
