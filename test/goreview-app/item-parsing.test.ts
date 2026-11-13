// @vitest-environment jsdom
/**
 * "This item" on a card: the parsing of the word and its table of forms (packages/goreview/app/screens/itemParsing.ts).
 * Looked up when the section is opened; before the answer only on a card that asks for the meaning; never on a concealed (audio) item
 * before the response; and never a meaning in it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { destroyRigs, dueCard, fakeFacts, ids, key, makeRig, startWith, until, FAKE_BUILDERS, type as typeInto, type Rig } from './helpers';
import { nameFeature, renderForms } from '../../packages/goreview/app/screens/itemParsing';
import type { ItemParadigm, ItemParadigmRequest } from '../../packages/goreview/app/packFacts';
import { projectWordAnalysis } from '../../src/core/word-analysis';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
// the real written-recognition builder's default: a flashcard (typed or self-graded), not multiple choice
const builders = FAKE_BUILDERS.map((builder) => builder.family !== 'written-recognition' ? builder : {
  ...builder,
  async build(...args: Parameters<typeof builder.build>) {
    const exercise = await builder.build(...args);
    if ('unavailable' in exercise) return exercise;
    return { ...exercise, responseMode: 'typed-or-self' as const, prompt: { instruction: exercise.prompt.instruction, stimulusText: exercise.prompt.stimulusText } };
  },
});

const FEATURE_NAMES = { Case: { label: 'Case', values: { Nom: 'nominative', Acc: 'accusative' } }, Number: { label: 'Number', values: { Sing: 'singular', Plur: 'plural' } }, Definite: { label: 'Definiteness', values: { Ind: 'indefinite', Def: 'definite' } } };
const cell = (form: string, features: Record<string, string>, status: 'verified' | 'supported' | 'generated' | 'conflicted' = 'verified', extra: Record<string, unknown> = {}) =>
  ({ form, features, sources: status === 'generated' ? ['generated' as const] : ['generated' as const, 'wiktionary' as const], status, ...extra });
const tableOf = (over: Partial<ItemParadigm> = {}): ItemParadigm => ({
  paradigm: {
    languageId: 'sq', lemma: 'shtepi', pos: 'NOUN', kind: 'noun-declension', template: 'sq-noun-f', status: 'conflicted',
    cells: [
      cell('shtepi', { Case: 'Nom', Number: 'Sing', Definite: 'Ind' }),
      cell('shtepia', { Case: 'Nom', Number: 'Sing', Definite: 'Def' }),
      cell('shtepine', { Case: 'Acc', Number: 'Sing', Definite: 'Def' }, 'generated'),
      cell('shtepite', { Case: 'Nom', Number: 'Plur', Definite: 'Def' }, 'conflicted', { alternatives: ['shtepit'] }),
      cell('shtepiake', { Case: 'Voc', Number: 'Sing' }, 'supported'),
    ],
    layout: { columns: { key: 'Number', values: [['Sing', 'singular'], ['Dual', 'dual'], ['Plur', 'plural']] }, rows: { key: 'Case', values: [['Nom', 'nominative'], ['Gen', 'genitive'], ['Acc', 'accusative']] }, sections: ['Definite'] },
    notes: ['The plural is formed on the same stem.'],
    sources: [{ id: 'adapter-sq@1', label: 'Albanian analyser (rules and its irregular tables)' }, { id: 'wiktionary', label: 'Wiktionary (kaikki.org extract)', licence: 'CC BY-SA 4.0' }],
  },
  selected: ['Case=Nom|Definite=Def|Number=Sing'], formRoman: {}, more: false, incomplete: false, origin: 'merged',
  sources: [{ label: 'Albanian analyser (rules and its irregular tables)' }, { label: 'Wiktionary (kaikki.org extract)', licence: 'CC BY-SA 4.0' }],
  featureNames: FEATURE_NAMES, ...over,
});

/** The rig's facts with the analysis a real pack attaches: shtepia, the definite nominative singular of shtepi (house). */
function withAnalysis(rig: Rig, paradigm?: (request: ItemParadigmRequest) => Promise<ItemParadigm | undefined>): { asked: ItemParadigmRequest[]; factCalls: () => number } {
  const asked: ItemParadigmRequest[] = [];
  let factCalls = 0;
  rig.deps.engine.factsFor = async (unitId, languageId) => {
    factCalls++;
    const facts = await fakeFacts.factsFor(unitId, languageId);
    return { ...facts!, morphDescription: 'definite nominative singular', featureDefs: FEATURE_NAMES,
      wordAnalysis: projectWordAnalysis({ language: 'sq', surface: 'shtepia', lemma: 'shtepi', pos: 'NOUN',
        lexicalMeaning: { text: 'house' }, inflectedMeaning: { text: 'the house' }, ambiguity: ['the home'],
        grammaticalFeatures: [{ key: 'Case', value: 'Nom' }, { key: 'Number', value: 'Sing' }, { key: 'Definite', value: 'Def' }] }) } as never;
  };
  rig.deps.paradigm = async (request) => { asked.push(request); return paradigm ? paradigm(request) : tableOf(); };
  return { asked, factCalls: () => factCalls };
}
const open = (rig: Rig): void => { const d = rig.q<HTMLDetailsElement>('#item-tools'); d.open = true; d.dispatchEvent(new Event('toggle')); };

describe('"This item": the parsing and the table of forms', () => {
  it('is looked up only when the section is opened, and shows the analysis and the table with the card\'s form marked', async () => {
    const rig = await makeRig({ signedIn: true, builders });
    const probe = withAnalysis(rig);
    await startWith(rig, dueCard(A, 'shtepi', 'written-recognition'));
    expect(rig.q('.flashcard').getAttribute('data-side')).toBe('front');
    // closed: the box is there and empty, and nothing was asked for
    expect(rig.q('#item-parsing').children.length).toBe(0);
    expect(probe.asked).toEqual([]);
    const before = probe.factCalls();
    open(rig);
    await until(() => rig.q('#item-parsing').getAttribute('data-state') === 'ready', 'the parsing');
    expect(probe.factCalls()).toBe(before + 1);
    const rows = Object.fromEntries(rig.qa('#parsing-facts .parsing-row').map((r) => [r.getAttribute('data-row'), [r.querySelector('dt')!.textContent, r.querySelector('dd')!.textContent]]));
    expect(rows).toEqual({
      form: ['Form', 'shtepia'], lemma: ['Lemma', 'shtepi'], pos: ['Part of speech', 'noun'],
      'feature-Case': ['Case', 'nominative'], 'feature-Number': ['Number', 'singular'], 'feature-Definite': ['Definiteness', 'definite'],
    });
    expect(rig.q('#parsing-description').textContent).toBe('In words: definite nominative singular.');
    expect(rig.q('#parsing-facts [data-row="lemma"] dd span').getAttribute('lang')).toBe('sq-AL');
    // the table was asked for with the reading of the card's form
    expect(probe.asked).toEqual([{ languageId: 'sq', lemma: 'shtepi', pos: 'NOUN', surface: 'shtepia', features: { Case: 'Nom', Number: 'Sing', Definite: 'Def' }, varietyId: 'sq-AL' }]);
    expect(rig.q('#forms-summary').textContent).toBe('5 forms · sq-noun-f: 2 from both the rules and the dictionary; 1 from the dictionary only; 1 from the rules only (unverified); 1 from the two disagree.');
    // one table per section (definite, indefinite), named in the pack's words; only the rows and columns that hold a form
    expect(rig.qa('#item-forms h4').map((x) => x.textContent)).toEqual(['indefinite', 'definite', 'Other forms']);
    const definite = rig.qa('#item-forms table')[1];
    expect([...definite.querySelectorAll('thead th')].map((x) => x.textContent)).toEqual(['singular', 'plural']); // no empty "dual" column
    expect([...definite.querySelectorAll('tbody th')].map((x) => x.textContent)).toEqual(['nominative', 'accusative']); // no empty "genitive" row
    const marked = rig.qa('#item-forms [data-selected="true"]');
    expect(marked.map((x) => x.getAttribute('data-cell'))).toEqual(['Case=Nom|Definite=Def|Number=Sing']);
    expect(marked[0].textContent).toContain('shtepia');
    expect(marked[0].querySelector('.sr')!.textContent).toBe(' (the form on this card)');
    // a cell says who vouches for it, to the eye (its mark, explained in the legend) and to a screen reader (the mark's name): never a tooltip
    const generated = rig.q('#item-forms [data-cell="Case=Acc|Definite=Def|Number=Sing"]');
    expect(generated.querySelector('.pmark')!.getAttribute('aria-label')).toBe('from the rules only (unverified)');
    expect(rig.q('#item-forms [data-cell="Case=Nom|Definite=Def|Number=Plur"]').textContent).toContain('shtepite / shtepit'); // a disagreement shows both
    expect(rig.root.querySelector('#item-parsing [title]')).toBeNull();
    expect(rig.q('#forms-legend').textContent).toContain('The form on this card is underlined.');
    // a cell the layout has no place for is listed, described in the pack's words
    expect(rig.q('#item-forms .forms-list li').textContent).toContain('shtepiake — Voc, singular');
    expect(rig.q('#forms-sources').textContent).toBe('Sources: Albanian analyser (rules and its irregular tables); Wiktionary (kaikki.org extract) (CC BY-SA 4.0).');
    // nothing in it is a meaning: the card asks for the meaning
    const text = rig.q('#item-parsing').textContent ?? '';
    for (const meaning of ['house', 'the home', 'Other possible readings']) expect(text).not.toContain(meaning);
    // closing and opening again asks for nothing more
    open(rig); open(rig);
    expect(probe.asked).toHaveLength(1);
  });

  it('a card that asks for the form does not show its parsing until the answer is in; then other readings may be named too', async () => {
    const rig = await makeRig({ signedIn: true, builders });
    const probe = withAnalysis(rig);
    await startWith(rig, dueCard(A, 'shtepi', 'meaning-to-form'));
    expect(rig.root.querySelector('#item-parsing')).toBeNull();
    expect(rig.q('#item-parsing-later').textContent).toBe('The parsing and the table of forms are shown after you answer.');
    open(rig);
    expect(probe.asked).toEqual([]);
    typeInto(rig.q<HTMLInputElement>('#answer-input'), 'shtepi');
    key('Enter', rig.q('#answer-input'));
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(rig.root.querySelector('#item-parsing-later')).toBeNull();
    open(rig);
    await until(() => rig.q('#item-parsing').getAttribute('data-state') === 'ready', 'the parsing');
    expect(rig.q('#parsing-facts [data-row="lemma"] dd').textContent).toBe('shtepi');
    expect(rig.qa('#item-forms table').length).toBe(2);
    expect(rig.q('#parsing-readings').textContent).toBe('Other possible readings: the home.');
  });

  it('a concealed (audio) item shows no parsing, and no promise of one that names the item, before the response', async () => {
    const rig = await makeRig({ signedIn: true, builders });
    const probe = withAnalysis(rig);
    await startWith(rig, dueCard(A, 'qen', 'audio-to-meaning'));
    expect(rig.q('.exercise').getAttribute('data-family')).toBe('audio-to-meaning');
    expect(rig.root.querySelector('#item-parsing')).toBeNull();
    expect(rig.root.querySelector('#item-parsing-later')).toBeNull();
    open(rig);
    expect(probe.asked).toEqual([]);
  });

  it('shows a verb\'s first cells at once and the whole table when the rest of its files arrive', async () => {
    const rig = await makeRig({ signedIn: true, builders });
    let release!: () => void;
    const rest = new Promise<void>((r) => { release = r; });
    const probe = withAnalysis(rig, async (request) => {
      if (!request.whole) return tableOf({ more: true });
      await rest;
      const whole = tableOf();
      whole.paradigm!.cells.push(cell('shtepive', { Case: 'Gen', Number: 'Plur', Definite: 'Def' }));
      return whole;
    });
    await startWith(rig, dueCard(A, 'shtepi', 'written-recognition'));
    open(rig);
    await until(() => !!rig.root.querySelector('#forms-loading'), 'the first cells');
    expect(rig.q('#forms-summary').textContent).toContain('5 forms');
    expect(rig.q('#forms-loading').textContent).toBe('Loading the rest of the table…');
    release();
    await until(() => rig.q('#item-parsing').getAttribute('data-state') === 'ready', 'the whole table');
    expect(probe.asked.map((r) => r.whole === true)).toEqual([false, true]);
    expect(rig.q('#forms-summary').textContent).toContain('6 forms');
    expect(rig.root.querySelector('#forms-loading')).toBeNull();
  });

  it('says so when the facts cannot be read, and tries again when the section is opened again', async () => {
    const rig = await makeRig({ signedIn: true, builders });
    await startWith(rig, dueCard(A, 'shtepi', 'written-recognition'));
    withAnalysis(rig);
    const working = rig.deps.engine.factsFor!;
    rig.deps.engine.factsFor = async () => { throw new Error('offline'); };
    open(rig);
    await until(() => rig.q('#item-parsing').getAttribute('data-state') === 'error', 'the failure');
    expect(rig.q('#item-parsing').textContent).toBe('The parsing could not be loaded. Close and open “This item” to try again.');
    rig.deps.engine.factsFor = working;
    open(rig);
    await until(() => rig.q('#item-parsing').getAttribute('data-state') === 'ready', 'the second try');
    expect(rig.q('#parsing-facts [data-row="lemma"] dd').textContent).toBe('shtepi');
  });

  it('an item with no analysis, and a copy with no table lookup, say what they lack', async () => {
    const rig = await makeRig({ signedIn: true, builders });
    await startWith(rig, dueCard(A, 'shtepi', 'written-recognition'));
    open(rig); // the rig's plain facts carry no word analysis
    await until(() => rig.q('#item-parsing').getAttribute('data-state') === 'ready', 'the answer');
    expect(rig.q('#item-parsing').textContent).toBe('ParsingNo analysis is recorded for this item, so there is no parsing to show.');
    destroyRigs();
    const second = await makeRig({ signedIn: true, builders });
    withAnalysis(second);
    delete second.deps.paradigm;
    await startWith(second, dueCard(A, 'shtepi', 'written-recognition'));
    open(second);
    await until(() => second.q('#item-parsing').getAttribute('data-state') === 'ready', 'the parsing alone');
    expect(second.q('#parsing-facts [data-row="lemma"] dd').textContent).toBe('shtepi');
    expect(second.q('#item-forms').textContent).toBe('No table of forms is available in this copy of GoReview.');
  });
});

describe('the table of forms, laid out', () => {
  const draw = (table: ItemParadigm | undefined): HTMLElement => { const el = document.createElement('div'); renderForms(el, table, { tag: 'he' }); return el; };

  it('a table read off the form files carries no "who vouches" marks: every cell is a form a source holds', () => {
    const table = tableOf({ origin: 'attested', sources: [{ label: 'Wiktionary Hebrew entries and their inflection tables, via kaikki.org', licence: 'CC BY-SA 4.0' }] });
    for (const c of table.paradigm!.cells) { c.status = 'generated'; c.sources = ['generated']; }
    const el = draw(table);
    expect(el.querySelector('.pmark')).toBeNull();
    expect(el.querySelector('td.generated')).toBeNull();
    expect(el.querySelector('#forms-summary')!.textContent).toBe('5 forms · sq-noun-f, each one held by a source; nothing is generated.');
    expect(el.querySelector('#forms-legend')!.textContent).toBe('The form on this card is underlined.');
    expect(el.querySelector('#forms-sources')!.textContent).toBe('Sources: Wiktionary Hebrew entries and their inflection tables, via kaikki.org (CC BY-SA 4.0).');
  });

  it('names a finite section without "Fin", lists every form when there is no layout, and says when some files did not load', () => {
    const verb = tableOf({ incomplete: true, featureNames: { Conj: { label: 'Conjugation', values: { Perf: 'perfect (qatal)' } } } });
    verb.paradigm!.cells = [cell('זָעַק', { Conj: 'Perf', VerbForm: 'Fin', Person: '3', Number: 'Sing' })];
    verb.paradigm!.layout = { columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] }, rows: { key: 'Person', values: [['1', '1st'], ['2', '2nd'], ['3', '3rd']] }, sections: ['Conj', 'VerbForm'] };
    verb.selected = [];
    const el = draw(verb);
    expect([...el.querySelectorAll('h4')].map((x) => x.textContent)).toEqual(['perfect (qatal)']);
    expect(el.querySelector('table')!.getAttribute('aria-label')).toBe('perfect (qatal)');
    expect(el.querySelector('#forms-incomplete')!.textContent).toContain('Some form files could not be loaded');
    const flat = tableOf();
    delete flat.paradigm!.layout;
    const list = draw(flat);
    expect(list.querySelector('table')).toBeNull();
    expect(list.querySelectorAll('.forms-list li').length).toBe(5);
    expect(list.querySelector('.forms-list li.sel')!.textContent).toContain('shtepia');
  });

  it('says so when there is no table, and shows a language that does not inflect its constructions instead', () => {
    expect(draw(undefined).textContent).toBe('No table of forms is available for this lemma: neither the analyser nor the dictionary supplied one.');
    const none = tableOf();
    none.paradigm = { ...none.paradigm!, kind: 'none', cells: [], notes: ['Thai words do not change their form.'], constructions: ['classifier phrases'], status: 'none' };
    expect(draw(none).textContent).toBe('Thai words do not change their form.Constructions to know instead: classifier phrases.');
  });

  it('names a feature in the pack\'s words, a union value with "or", and an unknown one as the analyser writes it', () => {
    expect(nameFeature('Case', 'Nom', FEATURE_NAMES)).toEqual({ label: 'Case', value: 'nominative' });
    expect(nameFeature('Case', 'Nom,Acc', FEATURE_NAMES)).toEqual({ label: 'Case', value: 'nominative or accusative' });
    expect(nameFeature('VerbForm', 'Fin')).toEqual({ label: 'verb form', value: 'finite' }); // a value every analyser writes the same way has a plain word
    expect(nameFeature('Aspect', 'Hab')).toEqual({ label: 'aspect', value: 'Hab' });
  });
});
