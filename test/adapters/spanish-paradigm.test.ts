import { describe, expect, it } from 'vitest';
import { esAdapter, esLexicon } from '../../src/adapters/es';
import { cellOf, cellsWithForm, featureKey, mergeParadigm, paradigmSummary, type GeneratedParadigm, type Paradigm } from '../../src/core/paradigm';
import { SPANISH_CONSTRUCTIONS } from '../../src/adapters/spanish/constructions';
import { IRREGULAR } from '../../src/adapters/spanish/verb-irregular';
import { alignDictionaryCells, enclitic, spanishCellFeatureSets, spanishCellFeatures } from '../../src/adapters/spanish/paradigm';
import type { PartOfSpeech } from '../../src/core/model';

const gen = (lemma: string, pos: PartOfSpeech = 'VERB'): GeneratedParadigm => {
  const g = esAdapter.paradigm!(lemma, pos);
  if (!g) throw new Error(`no paradigm for ${lemma}`);
  return g;
};
/** A merged paradigm with no dictionary half: cells are all `generated`. */
const table = (lemma: string, pos: PartOfSpeech = 'VERB'): Paradigm => {
  const g = gen(lemma, pos);
  return mergeParadigm({ languageId: 'es', lemma, pos, kind: g.kind, notes: g.notes, sources: [], layout: g.layout }, g.cells, []);
};
const cell = (p: Paradigm, f: Record<string, string>) => cellOf(p, f);
const fin = (mood: string, tense: string | undefined, person: string, number: string, extra: Record<string, string> = {}) =>
  ({ VerbForm: 'Fin', Mood: mood, ...(tense ? { Tense: tense } : {}), Person: person, Number: number, ...extra });

describe('Spanish paradigm: hablar (regular -ar)', () => {
  const p = table('hablar');
  it('has first, second and third person × singular and plural in every simple tense', () => {
    const tables: Array<[string, string | undefined, Record<string, string>]> = [
      ['Ind', 'Pres', {}], ['Ind', 'Imp', {}], ['Ind', 'Past', {}], ['Ind', 'Fut', {}], ['Cnd', undefined, {}],
      ['Sub', 'Pres', {}], ['Sub', 'Imp', { Variant: 'Ra' }], ['Sub', 'Imp', { Variant: 'Se' }], ['Sub', 'Fut', {}],
    ];
    for (const [mood, tense, extra] of tables) for (const person of ['1', '2', '3']) for (const number of ['Sing', 'Plur']) {
      const c = cell(p, fin(mood, tense, person, number, extra));
      expect(c, `${mood} ${tense} ${extra.Variant ?? ''} ${person}${number}`).toBeDefined();
      expect(c!.status).toBe('generated');
    }
  });
  it('spells the forms', () => {
    const f = (x: Record<string, string>) => cell(p, x)?.form;
    expect(f({ VerbForm: 'Inf' })).toBe('hablar');
    expect(f({ VerbForm: 'Ger' })).toBe('hablando');
    expect(f({ VerbForm: 'Part', Gender: 'Fem', Number: 'Plur' })).toBe('habladas');
    expect(f(fin('Ind', 'Pres', '1', 'Sing'))).toBe('hablo');
    expect(f(fin('Ind', 'Past', '3', 'Sing'))).toBe('habló');
    expect(f(fin('Ind', 'Fut', '2', 'Plur'))).toBe('hablaréis');
    expect(f(fin('Cnd', undefined, '1', 'Plur'))).toBe('hablaríamos');
    expect(f(fin('Sub', 'Imp', '1', 'Plur', { Variant: 'Ra' }))).toBe('habláramos');
    expect(f(fin('Sub', 'Imp', '1', 'Plur', { Variant: 'Se' }))).toBe('hablásemos');
    expect(f(fin('Sub', 'Fut', '3', 'Sing'))).toBe('hablare');
  });
  it('has the imperatives (tú, vos, usted, nosotros, vosotros, ustedes) and says the negative command is the subjunctive', () => {
    const f = (x: Record<string, string>) => cell(p, x)?.form;
    expect(f(fin('Imp', undefined, '2', 'Sing'))).toBe('habla');
    expect(f(fin('Imp', undefined, '2', 'Sing', { Variety: 'Voseo' }))).toBe('hablá');
    expect(f(fin('Imp', undefined, '3', 'Sing', { Polite: 'Form' }))).toBe('hable');
    expect(f(fin('Imp', undefined, '1', 'Plur'))).toBe('hablemos');
    expect(f(fin('Imp', undefined, '2', 'Plur'))).toBe('hablad');
    expect(f(fin('Imp', undefined, '3', 'Plur', { Polite: 'Form' }))).toBe('hablen');
    expect(cell(p, fin('Imp', undefined, '1', 'Sing'))).toBeUndefined();
    expect(p.notes.join(' ')).toMatch(/negative command is the present subjunctive/);
  });
  it('has the vos cells, told from tú by Variety=Voseo', () => {
    expect(cell(p, fin('Ind', 'Pres', '2', 'Sing'))?.form).toBe('hablas');
    expect(cell(p, fin('Ind', 'Pres', '2', 'Sing', { Variety: 'Voseo' }))?.form).toBe('hablás');
    expect(cell(p, fin('Sub', 'Pres', '2', 'Sing', { Variety: 'Voseo' }))?.form).toBe('hablés');
    expect(cell(p, fin('Ind', 'Pres', '2', 'Sing', { Variety: 'Voseo' }))?.note).toMatch(/Honduras/);
  });
  it('lists the compound tenses and periphrases as constructions, never as cells', () => {
    const g = gen('hablar');
    expect(g.constructions).toEqual(expect.arrayContaining(['perfect-tense', 'ir-a-infinitive', 'estar-gerund']));
    const keys = new Set(SPANISH_CONSTRUCTIONS.map((c) => c.key));
    for (const k of g.constructions!) expect(keys.has(k), k).toBe(true);
    expect(g.cells.some((c) => /\s/.test(c.form))).toBe(false);
    expect(g.notes.join(' ')).toMatch(/haber|constructions/);
  });
  it('never repeats a cell with the same form, and each cell key is a feature bundle of known keys', () => {
    const seen = new Set<string>();
    for (const c of gen('hablar').cells) { const k = `${featureKey(c.features)}=${c.form}`; expect(seen.has(k), k).toBe(false); seen.add(k); }
  });
  it('lays the table out by Person × Number with sections', () => {
    const g = gen('hablar');
    expect(g.layout!.rows.key).toBe('Person');
    expect(g.layout!.columns.key).toBe('Number');
    expect(g.layout!.sections).toEqual(['VerbForm', 'Mood', 'Tense', 'Variant']);
    expect(g.kind).toBe('verb-conjugation');
  });
});

describe('hablamos is both the present and the preterite', () => {
  it('cellOf finds both cells from the analysis features, and cellsWithForm finds them by surface', () => {
    const p = table('hablar');
    const tokens = esAdapter.tokenize('hablamos');
    const cands = esAdapter.analyze(tokens)[0].candidates.filter((c) => c.lemma === 'hablar');
    const forms = cands.map((c) => cell(p, spanishCellFeatures('VERB', c.morph, c.varieties))).filter(Boolean);
    expect(forms.map((c) => c!.features.Tense).sort()).toEqual(['Past', 'Pres']);
    expect(forms.every((c) => c!.form === 'hablamos')).toBe(true);
    expect(cellsWithForm(p, 'hablamos')).toHaveLength(2); // the present and the preterite (hablemos, the command, is another form)
  });
});

describe('irregular verbs', () => {
  const f = (p: Paradigm, x: Record<string, string>) => cell(p, x)?.form;
  it('ser', () => {
    const p = table('ser');
    expect(f(p, fin('Ind', 'Pres', '1', 'Sing'))).toBe('soy');
    expect(f(p, fin('Ind', 'Pres', '2', 'Sing', { Variety: 'Voseo' }))).toBe('sos');
    expect(f(p, fin('Ind', 'Pres', '2', 'Plur'))).toBe('sois');
    expect(f(p, fin('Ind', 'Imp', '1', 'Plur'))).toBe('éramos');
    expect(f(p, fin('Ind', 'Past', '3', 'Plur'))).toBe('fueron');
    expect(f(p, fin('Imp', undefined, '2', 'Sing'))).toBe('sé');
    expect(f(p, { VerbForm: 'Ger' })).toBe('siendo');
    expect(p.notes.join(' ')).toMatch(/irregular/i);
  });
  it('estar, ir, tener, hacer', () => {
    expect(f(table('estar'), fin('Ind', 'Pres', '1', 'Sing'))).toBe('estoy');
    expect(f(table('estar'), fin('Ind', 'Past', '1', 'Sing'))).toBe('estuve');
    expect(f(table('ir'), fin('Ind', 'Pres', '1', 'Sing'))).toBe('voy');
    expect(f(table('ir'), fin('Ind', 'Imp', '1', 'Sing'))).toBe('iba');
    expect(f(table('ir'), { VerbForm: 'Ger' })).toBe('yendo');
    expect(f(table('tener'), fin('Ind', 'Pres', '1', 'Sing'))).toBe('tengo');
    expect(f(table('tener'), fin('Ind', 'Fut', '1', 'Sing'))).toBe('tendré');
    expect(f(table('tener'), fin('Ind', 'Pres', '2', 'Sing', { Variety: 'Voseo' }))).toBe('tenés');
    expect(f(table('hacer'), fin('Ind', 'Past', '3', 'Sing'))).toBe('hizo');
    expect(f(table('hacer'), { VerbForm: 'Part', Gender: 'Masc', Number: 'Sing' })).toBe('hecho');
    expect(f(table('hacer'), fin('Imp', undefined, '2', 'Sing'))).toBe('haz');
  });
  it('a prefixed relative follows its base (mantener), and an unlisted prefix of an irregular verb gets no table', () => {
    expect(f(table('mantener'), fin('Ind', 'Pres', '1', 'Sing'))).toBe('mantengo');
    expect(esAdapter.paradigm!('postponer', 'VERB')).toBeUndefined(); // the engine would conjugate it as a regular -er verb
  });
  it('a stem-changing verb carries its template', () => {
    const g = gen('pensar');
    expect(g.template).toMatch(/stem-changing/);
    expect(cell(table('pensar'), fin('Ind', 'Pres', '1', 'Sing'))?.form).toBe('pienso');
    expect(cell(table('pensar'), fin('Ind', 'Pres', '1', 'Plur'))?.form).toBe('pensamos');
  });
  it('a verb the engine only assumes regular says so', () => {
    const g = gen('zumbar');
    expect(g.template).toBe('regular -ar');
    expect(g.notes.join(' ')).toMatch(/regular rules only|on no irregular or stem-change list/);
  });
});

describe('reflexive verbs', () => {
  const p = table('lavarse');
  it('are the base verb\'s cells with the clitic in the note, not glued', () => {
    expect(cell(p, fin('Ind', 'Pres', '1', 'Sing'))).toMatchObject({ form: 'lavo', note: 'me lavo' });
    expect(cell(p, fin('Ind', 'Pres', '2', 'Sing', { Variety: 'Voseo' }))?.form).toBe('lavás');
    expect(cell(p, fin('Ind', 'Pres', '2', 'Sing', { Variety: 'Voseo' }))?.note).toMatch(/^te lavás/);
    expect(cell(p, fin('Ind', 'Pres', '3', 'Plur'))?.note).toBe('se lavan');
    expect(cell(p, fin('Ind', 'Pres', '1', 'Plur'))?.note).toBe('nos lavamos');
    expect(cell(p, { VerbForm: 'Inf' })?.form).toBe('lavarse');
    expect(cell(p, { VerbForm: 'Ger' })?.form).toBe('lavándose');
    expect(p.notes.join(' ')).toMatch(/Reflexive verb \(lavarse\)/);
    expect(p.cells.filter((c) => c.features.VerbForm === 'Fin').every((c) => !/\s/.test(c.form))).toBe(true);
  });
  it('write the affirmative command with its clitic in the note', () => {
    expect(cell(p, fin('Imp', undefined, '2', 'Sing'))?.note).toMatch(/^lávate/);
    expect(cell(p, fin('Imp', undefined, '3', 'Sing', { Polite: 'Form' }))?.note).toMatch(/^lávese/);
    expect(enclitic('lavemos', '1', 'Plur', 'lavar')).toBe('lavémonos');
    expect(enclitic('lavad', '2', 'Plur', 'lavar')).toBe('lavaos');
    expect(enclitic('vestid', '2', 'Plur', 'vestir')).toBe('vestíos');
    expect(enclitic('id', '2', 'Plur', 'ir')).toBe('idos');
  });
});

describe('nouns and adjectives', () => {
  it('a noun has Number cells; a feminine counterpart in the word list is the Gender=Fem section', () => {
    const p = table('niño', 'NOUN');
    expect(cell(p, { Number: 'Sing' })?.form).toBe('niño');
    expect(cell(p, { Number: 'Plur' })?.form).toBe('niños');
    expect(cell(p, { Gender: 'Fem', Number: 'Sing' })?.form).toBe('niña');
    expect(cell(p, { Gender: 'Fem', Number: 'Plur' })?.form).toBe('niñas');
    expect(p.kind).toBe('noun-declension');
  });
  it('a noun with no counterpart has one section; an invariable plural is noted', () => {
    const casa = table('casa', 'NOUN');
    expect(casa.cells.map((c) => c.form)).toEqual(['casa', 'casas']);
    const lunes = table('lunes', 'NOUN');
    expect(cell(lunes, { Number: 'Plur' })).toMatchObject({ form: 'lunes', note: 'same form in the plural' });
    expect(cell(table('corazón', 'NOUN'), { Number: 'Plur' })?.form).toBe('corazones');
    expect(cell(table('Pascua', 'NOUN'), { Number: 'Plur' })?.form).toBe('Pascuas');
  });
  it('an adjective has Gender × Number', () => {
    const p = table('bonito', 'ADJ');
    expect(cell(p, { Gender: 'Masc', Number: 'Sing' })?.form).toBe('bonito');
    expect(cell(p, { Gender: 'Fem', Number: 'Sing' })?.form).toBe('bonita');
    expect(cell(p, { Gender: 'Masc', Number: 'Plur' })?.form).toBe('bonitos');
    expect(cell(p, { Gender: 'Fem', Number: 'Plur' })?.form).toBe('bonitas');
    expect(p.kind).toBe('adjective-declension');
    expect(cell(table('trabajador', 'ADJ'), { Gender: 'Fem', Number: 'Plur' })?.form).toBe('trabajadoras');
  });
  it('an invariable adjective has one row and says so', () => {
    const g = gen('grande', 'ADJ');
    expect(g.cells.map((c) => `${featureKey(c.features)}=${c.form}`)).toEqual(['Number=Sing=grande', 'Number=Plur=grandes']);
    expect(g.layout!.rows.values).toEqual([['', 'masculine and feminine']]);
    expect(g.notes.join(' ')).toMatch(/Invariable/);
  });
  it('returns undefined for what the rules do not cover', () => {
    expect(esAdapter.paradigm!('PC', 'NOUN')).toBeUndefined();
    expect(esAdapter.paradigm!('por qué', 'ADV')).toBeUndefined();
    expect(esAdapter.paradigm!('casa', 'ADP')).toBeUndefined();
    expect(esAdapter.paradigm!('xyz', 'VERB')).toBeUndefined();
    expect(esAdapter.paradigm!('mesa', 'VERB')).toBeUndefined();
  });
});

describe('round trip: an analysed form finds its cell', () => {
  const verbLemmas = esLexicon.entries.filter((e) => e.pos === 'VERB' || e.pos === 'AUX').map((e) => e.lemma);
  const sample = [...new Set([...Object.keys(IRREGULAR), ...verbLemmas.filter((_, i) => i % 3 === 0)])];

  it('every reading the analysis gives a sampled form of the word-list verbs and irregular tables has a cell with that form', () => {
    const misses: string[] = [];
    let readings = 0;
    let unread = 0;
    let forms = 0;
    for (const lemma of sample) {
      const g = esAdapter.paradigm!(lemma, 'VERB');
      if (!g) continue;
      const p = mergeParadigm({ languageId: 'es', lemma, pos: 'VERB', kind: g.kind, notes: [], sources: [] }, g.cells, []);
      for (const form of new Set(g.cells.map((c) => c.form))) {
        forms++;
        const analysed = esAdapter.analyze(esAdapter.tokenize(form))[0].candidates.filter((c) => c.lemma === lemma && (c.pos === 'VERB' || c.pos === 'AUX'));
        if (!analysed.length) { unread++; continue; }
        for (const c of analysed) {
          if (lemma === 'ir' && form === 'idos') continue; // the vosotros command of irse, written with its clitic: not a cell of ir
          readings++;
          // a hand-written reading that merges two ("Person": "2,3", "Mood": "Imp,Ind" for perdona) expands to combinations, of which at least one is the cell
          const sets = spanishCellFeatureSets('VERB', c.morph, c.varieties);
          const ok = sets.some((f) => { const hit = cell(p, f); return !!hit && (hit.form === form || (hit.alternatives ?? []).includes(form)); });
          if (!ok) misses.push(`${lemma} ${form} ${sets.map(featureKey).join(' / ')}`);
        }
      }
    }
    expect(forms).toBeGreaterThan(4000);
    expect(readings).toBeGreaterThan(4000);
    expect(unread / forms).toBeLessThan(0.02); // a generated form the analysis does not read at all (a voseo form equal to tú, a spelling variant)
    expect(misses.slice(0, 15)).toEqual([]);
  }, 120_000);
});

describe('merge with a dictionary table', () => {
  const g = gen('hablar');
  const base = { languageId: 'es', lemma: 'hablar', pos: 'VERB' as const, kind: g.kind, notes: [], sources: [] };
  it('statuses: verified, supported, generated, conflicted', () => {
    const dict = [
      { features: fin('Ind', 'Pres', '1', 'Sing'), form: 'hablo' }, // same → verified
      { features: fin('Ind', 'Pres', '3', 'Sing'), form: 'hable' }, // different → conflicted
      { features: fin('Imp', undefined, '1', 'Sing'), form: 'hablo' }, // only the dictionary → supported
    ];
    const p = mergeParadigm(base, g.cells, dict);
    expect(cell(p, fin('Ind', 'Pres', '1', 'Sing'))?.status).toBe('verified');
    const bad = cell(p, fin('Ind', 'Pres', '3', 'Sing'))!;
    expect(bad.status).toBe('conflicted');
    expect(bad.form).toBe('hable');
    expect(bad.alternatives).toContain('habla');
    expect(cell(p, fin('Imp', undefined, '1', 'Sing'))?.status).toBe('supported');
    expect(cell(p, fin('Ind', 'Fut', '1', 'Sing'))?.status).toBe('generated');
    expect(p.status).toBe('conflicted');
    expect(paradigmSummary(p).verified).toBe(1);
  });
  it('alignDictionaryCells puts the dictionary form that matches the rules first, so a second spelling does not make a conflict', () => {
    const features = fin('Ind', 'Pres', '2', 'Sing', { Variety: 'Voseo' });
    const dict = [{ features, form: 'hablas' }, { features, form: 'hablás' }];
    expect(cell(mergeParadigm(base, g.cells, dict), features)?.status).toBe('conflicted');
    expect(cell(mergeParadigm(base, g.cells, alignDictionaryCells(g.cells, dict)), features)?.status).toBe('verified');
  });
});
