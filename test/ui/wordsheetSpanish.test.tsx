// @vitest-environment jsdom
/**
 * The Spanish word sheet: morphology in plain words, the parts of a written word, varieties with the course's policy,
 * a modern aid beside historical forms, and the personal difficulty estimate (PLAN9 F2).
 *
 * FAKES: the language adapter (`describeMorph`, `varieties`), GoLearn's `predictDifficulty`, and the analysis rows
 * (written by hand, as the Spanish adapter and the importer will fill them). The harness course is `honduras-es`, whose
 * real policy is { target: 'es-HN', within: ['es-CA', 'es-419'], activeFeatures: ['voseo'] }.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DifficultyForecast, LanguageAdapter, TokenAnalysis, Variety, WordPart } from '../../src/core';
import { buildFixtureText, ids } from '../../src/core';
import type { AppStore } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { Reader } from '../../src/ui/reader/Reader';
import { button, click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const ES = 'text:es:formas';
const S0 = ids.sentence(ES, 0);

const PERSON = { '1': 'first', '2': 'second', '3': 'third' } as Record<string, string>;
const NUMBER = { Sing: 'singular', Plur: 'plural' } as Record<string, string>;
const TENSE = { Imp: 'imperfect', Pres: 'present' } as Record<string, string>;
const MOOD = { Sub: 'subjunctive', Ind: 'indicative' } as Record<string, string>;
const VARIETIES: Record<string, Variety> = {
  voseo: { code: 'voseo', label: 'voseo', kind: 'feature' },
  vosotros: { code: 'vosotros', label: 'vosotros', kind: 'feature' },
  'es-hist': { code: 'es-hist', label: 'older Spanish', kind: 'historical' },
};
const fakeAdapter = {
  lang: 'es', name: 'fake-es', varieties: VARIETIES,
  describeMorph: (m: Record<string, string>) => `${PERSON[m.Person]} person ${NUMBER[m.Number]}, ${TENSE[m.Tense]} ${MOOD[m.Mood]}`,
} as unknown as LanguageAdapter;
const plainAdapter = { lang: 'es', name: 'plain-es' } as unknown as LanguageAdapter;

async function seed(store: AppStore) {
  return buildFixtureText(store, {
    lang: 'es', slug: 'formas', title: 'Formas',
    sentences: [{ tokens: [
      { surface: 'hubiéramos', lemma: 'haber', pos: 'AUX', gloss: 'have (auxiliary)' },
      { surface: 'decírselo', lemma: 'decir', pos: 'VERB', gloss: 'to say it to him' },
      { surface: 'tenés', lemma: 'tener', pos: 'VERB', gloss: 'you have' },
      { surface: 'tenéis', lemma: 'tener', pos: 'VERB', gloss: 'you all have' },
      { surface: 'agora', lemma: 'ahora', pos: 'ADV', gloss: 'now' },
    ] }],
  });
}
async function patch(store: AppStore, index: number, p: Partial<TokenAnalysis>) {
  const tokenId = ids.token(S0, index);
  const row = (await store.analyses.where('tokenId', tokenId))[0];
  await store.analyses.put({ ...row, ...p });
}
const wire = (adapter: LanguageAdapter) => Object.assign(h.services, { adapters: { get: () => adapter, all: () => [adapter] } });
const open = async () => { mounted = await h.mount(<Reader textId={ES} mode="corpus" />); };
const tok = (surface: string) => qa<HTMLButtonElement>(mounted!.container, 'button.tok').find((b) => b.textContent === surface)!;
const t = (testid: string) => q(mounted!.container, `[data-testid="${testid}"]`)?.textContent;

const SUBJ = { Person: '1', Number: 'Plur', Tense: 'Imp', Mood: 'Sub' };

describe('morphology in plain words (grammar layer)', () => {
  it('hubiéramos: the adapter\'s words plus the lemma, and the other readings briefly', async () => {
    await seed(h.store);
    await patch(h.store, 0, { morph: SUBJ, alternatives: [
      { lemmaId: ids.lemma('es', 'haber', 'AUX'), pos: 'AUX', morph: { Person: '3', Number: 'Sing', Tense: 'Imp', Mood: 'Sub' }, confidence: 0.3 },
      { pos: 'AUX', morph: {}, confidence: 0.2, gloss: 'a dictionary gloss', origin: 'dictionary' }, // not morphology: not listed
    ] });
    wire(fakeAdapter);
    await open();
    await click(tok('hubiéramos'));
    expect(t('morph-line')).toBeUndefined(); // nothing until the learner asks for grammar
    await click(button(mounted!.container, 'Show phrases'));
    await click(button(mounted!.container, 'Show grammar'));
    expect(t('morph-line')).toBe('first person plural, imperfect subjunctive of haber');
    expect(t('morph-alternates')).toBe('or: third person singular, imperfect subjunctive of haber');
  });

  it('without the adapter\'s describeMorph the grammar layer is today\'s line, and the tap fetches no more than before', async () => {
    await seed(h.store);
    await patch(h.store, 0, { morph: SUBJ });
    wire(plainAdapter);
    await open();
    await click(tok('hubiéramos'));
    expect(h.learn.tokenSupport.mock.calls.map((c) => c[2])).toEqual([1]);
    await click(button(mounted!.container, 'Show phrases'));
    await click(button(mounted!.container, 'Show grammar'));
    expect(t('morph-line')).toContain('aux'); // the sheet's own "pos · features" line from GoLearn
    expect(t('morph-alternates')).toBeUndefined();
  });
});

describe('parts of one written word (gloss layer)', () => {
  const parts: WordPart[] = [
    { text: 'decir', start: 0, end: 5, role: 'infinitive' },
    { text: 'se', start: 5, end: 7, role: 'indirect object pronoun' },
    { text: 'lo', start: 7, end: 9, role: 'direct object pronoun' },
  ];

  it('decírselo = decir + se + lo, each part with its short role, in one line', async () => {
    await seed(h.store);
    await patch(h.store, 1, { parts });
    wire(fakeAdapter);
    await open();
    expect(q(mounted!.container, '[data-testid="word-parts"]')).toBeNull();
    await click(tok('decírselo'));
    expect(t('word-parts')).toBe('decírselo = decir (infinitive) + se (indirect object pronoun) + lo (direct object pronoun)');
  });

  it('a word with a single part, or none, shows no line', async () => {
    await seed(h.store);
    await patch(h.store, 1, { parts: [parts[0]] });
    wire(fakeAdapter);
    await open();
    await click(tok('decírselo'));
    expect(t('word-parts')).toBeUndefined();
  });
});

describe('varieties with the course policy', () => {
  it('vos tenés is part of the target (voseo); vosotros tenéis is worth recognising, not the default', async () => {
    await seed(h.store);
    await patch(h.store, 2, { varieties: ['voseo'], morph: { Person: '2', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' } });
    await patch(h.store, 3, { varieties: ['vosotros'], morph: { Person: '2', Number: 'Plur', Tense: 'Pres', Mood: 'Ind' } });
    wire(fakeAdapter);
    await open();
    await click(tok('tenés'));
    expect(t('variety-tags')).toBe('voseo — part of the language you are aiming to use.');
    await click(tok('tenéis'));
    expect(t('variety-tags')).toBe('vosotros — used elsewhere: worth recognising, not your default for speaking or writing.');
    await click(button(mounted!.container, 'Show phrases'));
    await click(button(mounted!.container, 'Show grammar'));
    expect(t('morph-line')).toBe('second person plural, present indicative of tener');
  });

  it('a historical form adds "today: <modern form>" as an aid and leaves the text as written', async () => {
    await seed(h.store);
    await patch(h.store, 4, { varieties: ['es-hist'], notes: { modern: 'ahora' } });
    wire(fakeAdapter);
    await open();
    await click(tok('agora'));
    expect(t('variety-tags')).toBe('older Spanish — older language: recognise it when reading; it is not used this way today.');
    expect(t('modern-form')).toBe('today: ahora');
    expect(tok('agora').textContent).toBe('agora'); // the text itself is untouched
    expect(qa(mounted!.container, '.sent-text').map((e) => e.textContent)).toEqual(['hubiéramos decírselo tenés tenéis agora']);
  });

  it('a word with no varieties, parts or modern form shows none of these lines', async () => {
    await seed(h.store);
    wire(fakeAdapter);
    await open();
    await click(tok('agora'));
    for (const id of ['variety-tags', 'modern-form', 'word-parts']) expect(t(id)).toBeUndefined();
  });
});

describe('personal difficulty in the preview', () => {
  const forecast = (personal?: DifficultyForecast['personal']): DifficultyForecast => ({
    textId: STORY_ID, userId: 'u1', coverage: {} as DifficultyForecast['coverage'], predictedCoverage: 0.96,
    newUsefulWords: [], rareWords: [], weakPhrases: [], newConstructions: [], properNouns: [], varieties: {}, unanalysedWords: 0,
    limits: ['No frequency data.'], summary: 'About 96 % of the words are familiar.', ...(personal ? { personal } : {}),
  });
  const mountPage = async (f: DifficultyForecast) => {
    await seedStory(h.store);
    Object.assign(h.learn, { predictDifficulty: vi.fn(async () => f) });
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: `/read/${encodeURIComponent(STORY_ID)}` });
    await click(button(mounted.container, 'Preview difficulty'));
  };

  it('shows the label and its factors in words, then the caveats verbatim', async () => {
    await mountPage(forecast({
      label: 'manageable', lexicalCoverage: 0.96,
      factors: [
        { key: 'lexical-coverage', level: 'low', note: 'most words are familiar' },
        { key: 'constructions', level: 'moderate', note: 'some constructions are new' },
        { key: 'historical', level: 'high', note: 'older vocabulary' },
      ],
      caveats: ['You have read little so far, so this is a rough estimate.', 'Three words have no analysis.'],
    }));
    expect(t('difficulty-personal-label')).toBe('manageable');
    expect(t('difficulty-factors')).toBe('lexical coverage: 96% · unfamiliar constructions: moderate · historical vocabulary: high');
    expect(qa(q(mounted!.container, '[data-testid="difficulty-caveats"]')!, 'li').map((li) => li.textContent)).toEqual([
      'You have read little so far, so this is a rough estimate.', 'Three words have no analysis.',
    ]);
  });

  it('shows nothing personal when the forecast has none', async () => {
    await mountPage(forecast());
    expect(t('difficulty-summary')).toContain('96');
    expect(q(mounted!.container, '[data-testid="difficulty-personal"]')).toBeNull();
  });
});
