// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ComprehensionReported } from '../../src/core';
import { buildFixtureText, ids } from '../../src/core';
import { Reader } from '../../src/ui/reader/Reader';
import { ManualViewDetector } from '../../src/ui/reader/viewDetection';
import { button, byLabel, click, flush, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness({ learn: { known: 0.62, estimated: 0.05 } }); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const S = (i: number) => ids.sentence(STORY_ID, i);
const tokenButton = (surface: string) => qa<HTMLButtonElement>(mounted!.container, 'button.tok').find((b) => b.textContent === surface)!;

describe('Reader — viewing is exposure only', () => {
  it('emits SentenceViewed and TextViewed for what is on screen, and never a comprehension report or a completion', async () => {
    await seedStory(h.store);
    const detector = new ManualViewDetector();
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" createDetector={detector.factory} />);
    await act(async () => { detector.see(S(0)); detector.see(S(1)); detector.see(S(2)); });
    await flush();
    expect(await h.events('SentenceViewed')).toHaveLength(3);
    expect(await h.events('ComprehensionReported')).toHaveLength(0);
    expect(await h.events('TextCompleted')).toHaveLength(0);
  });
});

describe('Reader — "Understood" on a sentence', () => {
  it('reports degree "all" for that sentence, once, without fabricating a view', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect(qa(mounted.container, 'button[aria-label^="Understood sentence"]')).toHaveLength(3); // quiet, one per sentence
    await click(button(mounted.container, 'Understood sentence 2'));
    await click(button(mounted.container, 'Understood sentence 2')); // a second click adds nothing

    const reports = (await h.events('ComprehensionReported')) as ComprehensionReported[];
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ textId: STORY_ID, sentenceIds: [S(1)], modality: 'reading', scope: 'sentence', degree: 'all', surface: 'corpus', session: 'ses-test', userId: 'u1', lang: 'es' });
    // a report is not a view: saying "I understood it" never fabricates a SentenceViewed
    expect(await h.events('SentenceViewed')).toHaveLength(0);
    expect(byLabel(mounted.container, 'Understood sentence 2').getAttribute('aria-pressed')).toBe('true');
    expect(byLabel(mounted.container, 'Understood sentence 1').getAttribute('aria-pressed')).toBe('false');
  });

  it('reports Scripture on the scripture surface', async () => {
    const { seedJohn, JOHN_ID } = await import('./fixtures');
    await seedJohn(h.store);
    mounted = await h.mount(<Reader textId={JOHN_ID} mode="scripture" />);
    await click(button(mounted.container, 'Understood sentence 1'));
    const report = ((await h.events('ComprehensionReported')) as ComprehensionReported[])[0];
    expect(report).toMatchObject({ surface: 'scripture', sentenceIds: [ids.sentence(JOHN_ID, 0)], degree: 'all' });
  });
});

describe('Reader — "How much did you understand?"', () => {
  it('appears at the end, not before, and each choice is a text-level report over every sentence', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect(q(mounted.container, '[aria-label="How much did you understand?"]')).toBeNull();
    await click(button(mounted.container, /finished reading/));

    const group = byLabel(mounted.container, 'How much did you understand?');
    expect(qa(group, 'button').map((b) => b.textContent)).toEqual(['All', 'Most', 'Some', 'Little']);
    await click(button(group, 'Most'));
    let reports = (await h.events('ComprehensionReported')) as ComprehensionReported[];
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ textId: STORY_ID, scope: 'text', degree: 'most', modality: 'reading', sentenceIds: [S(0), S(1), S(2)], session: 'ses-test' });
    expect(button(group, 'Most').getAttribute('aria-pressed')).toBe('true');

    await click(button(group, 'Some')); // changing your mind is a new report
    reports = (await h.events('ComprehensionReported')) as ComprehensionReported[];
    expect(reports.map((r) => r.degree)).toEqual(['most', 'some']);
    expect((await h.events('TextCompleted'))).toHaveLength(1); // finishing is exposure; it is reported once
  });

  it('also appears once every sentence has been seen, without pressing finish', async () => {
    await seedStory(h.store);
    const detector = new ManualViewDetector();
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" createDetector={detector.factory} />);
    await act(async () => { detector.see(S(0)); detector.see(S(1)); });
    await flush();
    expect(q(mounted.container, '[aria-label="How much did you understand?"]')).toBeNull();
    await act(async () => { detector.see(S(2)); });
    await flush();
    expect(q(mounted.container, '[aria-label="How much did you understand?"]')).not.toBeNull();
  });
});

describe('Reader — coverage wording', () => {
  it('states reading completion and vocabulary separately, with the estimate labelled and an explanation', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    const box = byLabel(mounted.container, 'Your progress with this text');
    expect(q(box, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 0 of 3 sentences');
    const vocab = q(box, '[data-testid="vocabulary-coverage"]')!;
    expect(vocab.textContent).toContain('shown 62% · likely familiar 5% (estimate) · met 15% · new 18%');
    expect(q(vocab, '[data-testid="coverage-explanation"]')!.textContent).toContain('likely familiar is an estimate');
  });

  it('"Seen" moves with what was seen and "Finished" only with the button; the vocabulary line is a different statement that does not', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    await click(button(mounted.container, 'Mark sentence 1 as seen'));
    await click(button(mounted.container, 'Mark sentence 2 as seen'));
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 2 of 3 sentences');
    await click(button(mounted.container, /finished reading/));
    await click(button(byLabel(mounted.container, 'How much did you understand?'), 'Most'));
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 2 of 3 sentences · Finished (your mark)'); // the shared line: identical on every surface
    expect(q(mounted.container, '[data-testid="reading-extras"]')!.textContent).toBe(' · you said you understood most of it'); // the reader's own addition, beside it
    expect(q(mounted.container, '[data-testid="vocabulary-coverage"]')!.textContent).toContain('shown 62%');
  });
});

describe('Reader — the word sheet says what Go knows, and what it does not', () => {
  it('shows the explainItem summary for the tapped word', async () => {
    h = await makeHarness({ learn: { explain: { [ids.form('es', 'creo')]: 'Seen 7 times in 2 texts; needed help twice; understood without help once.' } } });
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    await click(tokenButton('creo'));
    expect(h.learn.explainItem).toHaveBeenCalledWith('u1', ids.form('es', 'creo'));
    expect(q(byLabel(mounted.container, 'Help for creo'), '[data-testid="word-why"]')!.textContent).toBe('Seen 7 times in 2 texts; needed help twice; understood without help once.');
  });

  it('says "not analysed yet" for a word with no analysis, instead of a guess', async () => {
    await buildFixtureText(h.store, {
      lang: 'es', slug: 'supplied', title: 'Supplied',
      sentences: [{ tokens: [{ surface: 'Yo', lemma: 'yo', gloss: 'I' }, { surface: 'reconozco' }, { surface: '.', isWord: false }] }],
    });
    mounted = await h.mount(<Reader textId="text:es:supplied" mode="corpus" />);
    await click(tokenButton('reconozco'));
    const card = byLabel(mounted.container, 'Help for reconozco');
    expect(q(card, '[data-testid="not-analysed"]')!.textContent).toContain('Not analysed yet');
    expect(card.textContent).not.toContain('possibly');
    await click(button(mounted.container, 'Show phrases'));
    await click(button(mounted.container, 'Show grammar'));
    expect(byLabel(mounted.container, 'Grammar').textContent).toContain('Not analysed yet.');
    await click(tokenButton('Yo')); // an analysed word is unaffected
    expect(q(byLabel(mounted.container, 'Help for Yo'), '[data-testid="not-analysed"]')).toBeNull();
    expect(byLabel(mounted.container, 'Help for Yo').textContent).toContain('I');
  });
});

describe('Reader — the live sentences of the current content version', () => {
  it('does not show a retired sentence, and keeps the others in order', async () => {
    await seedStory(h.store);
    const second = (await h.store.sentences.get(S(1)))!;
    await h.store.sentences.put({ ...second, retiredInVersion: 2 });
    const text = (await h.store.texts.get(STORY_ID))!;
    await h.store.texts.put({ ...text, contentVersion: 2 });
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    const shown = qa(mounted.container, '.sent-text').map((e) => e.textContent);
    expect(shown).toEqual(['Yo creo en Dios.', 'Entendí mi pecado.']);
    expect(q(mounted.container, '[data-testid="reading-progress"]')!.textContent).toBe('Seen 0 of 2 sentences');
  });
});
