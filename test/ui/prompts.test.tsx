// @vitest-environment jsdom
/**
 * Recall prompts at the end of a text (R3): optional, one at a time, before the four-button report.
 * REAL: the Reader, the prompt generator, the memory store and bus. FAKE: the harness GoLearn, given a `getItemState` that
 * says which words are weak (the real GoLearn answers the same question from the learner's record).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComprehensionReported } from '../../src/core';
import { buildFixtureText, ids } from '../../src/core';
import type { FixtureSentence } from '../../src/core/testing';
import { Reader } from '../../src/ui/reader/Reader';
import { button, byLabel, click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const TEXT_ID = 'text:es:prompts';
const S = (i: number) => ids.sentence(TEXT_ID, i);

const SENTENCES: FixtureSentence[] = [
  { tokens: [{ surface: 'El', lemma: 'el', pos: 'DET' }, { surface: 'hombre', lemma: 'hombre', pos: 'NOUN' }, { surface: 'compró', lemma: 'comprar', pos: 'VERB' }, { surface: 'una', lemma: 'uno', pos: 'DET' }, { surface: 'manzana', lemma: 'manzana', pos: 'NOUN' }, { surface: 'roja', lemma: 'rojo', pos: 'ADJ' }, { surface: '.', isWord: false }] },
  { tokens: [{ surface: 'La', lemma: 'el', pos: 'DET' }, { surface: 'mujer', lemma: 'mujer', pos: 'NOUN' }, { surface: 'cantaba', lemma: 'cantar', pos: 'VERB' }, { surface: 'una', lemma: 'uno', pos: 'DET' }, { surface: 'canción', lemma: 'canción', pos: 'NOUN' }, { surface: 'antigua', lemma: 'antiguo', pos: 'ADJ' }, { surface: '.', isWord: false }] },
  { tokens: [{ surface: 'Los', lemma: 'el', pos: 'DET' }, { surface: 'niños', lemma: 'niño', pos: 'NOUN' }, { surface: 'miraban', lemma: 'mirar', pos: 'VERB' }, { surface: 'el', lemma: 'el', pos: 'DET' }, { surface: 'camino', lemma: 'camino', pos: 'NOUN' }, { surface: 'largo', lemma: 'largo', pos: 'ADJ' }, { surface: '.', isWord: false }] },
];
const SENTENCE_TEXTS = ['El hombre compró una manzana roja.', 'La mujer cantaba una canción antigua.', 'Los niños miraban el camino largo.'];

/** Tells the Reader which forms are known only weakly (the record GoLearn would hold). */
function weak(levels: Record<string, string>) {
  Object.assign(h.learn, {
    getItemState: vi.fn(async (_userId: string, itemId: string) => {
      const level = levels[itemId.replace('form:es:', '')];
      return level ? { itemId, reading: { level } } : undefined;
    }),
  });
}

async function open(kind: 'story' | 'scripture' = 'story') {
  await buildFixtureText(h.store, { lang: 'es', slug: 'prompts', title: 'Prompts', kind, sentences: SENTENCES, ...(kind === 'scripture' ? { scripture: { book: 'JHN', chapter: 3 }, version: 'Reina-Valera 1909' } : {}) });
  mounted = await h.mount(<Reader textId={TEXT_ID} mode={kind === 'scripture' ? 'scripture' : 'corpus'} />);
}
const finish = () => click(button(mounted!.container, /finished reading/));
const block = () => q(mounted!.container, '[aria-label="Quick questions"]');
const reports = async () => (await h.events('ComprehensionReported')) as ComprehensionReported[];
const choice = (label: string) => button(byLabel(block()!, 'Choices'), label);

describe('Prompts at the end of a text', () => {
  it('appear after "I have finished reading", before the four-button report, and only when something qualifies', async () => {
    weak({ manzana: 'recognized_with_help' });
    await open();
    expect(block()).toBeNull(); // nothing until the end
    await finish();
    expect(block()).not.toBeNull();
    const report = byLabel(mounted!.container, 'How much did you understand?');
    expect(block()!.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(qa(report, 'button').map((b) => b.textContent)).toEqual(['All', 'Most', 'Some', 'Little']);
  });

  it('shows no questions at all when no word is known only weakly (a new learner)', async () => {
    weak({});
    await open();
    await finish();
    expect(block()).toBeNull();
    expect(byLabel(mounted!.container, 'How much did you understand?')).toBeTruthy(); // the report is unchanged
  });

  it('a correct cloze answer emits the ordinary sentence-level ComprehensionReported for THAT sentence', async () => {
    weak({ manzana: 'recognized_with_help' });
    await open();
    await finish();
    expect(q(block()!, '[data-testid="prompt-sentence"]')!.textContent).toBe('El hombre compró una _____ roja.');
    expect(await reports()).toHaveLength(0);
    await click(choice('manzana'));
    const sent = await reports();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'ComprehensionReported', textId: TEXT_ID, sentenceIds: [S(0)], modality: 'reading', scope: 'sentence', degree: 'all', surface: 'corpus' });
  });

  it('a correct answer is the same report as the Understood button: a sentence already marked is not reported twice', async () => {
    weak({ manzana: 'recognized_with_help' });
    await open();
    await click(button(mounted!.container, 'Understood sentence 1'));
    await finish();
    await click(choice('manzana'));
    expect((await reports()).filter((r) => r.scope === 'sentence')).toHaveLength(1);
  });

  it('a wrong answer emits nothing and shows the sentence', async () => {
    weak({ manzana: 'recognized_with_help' });
    await open();
    await finish();
    const wrong = qa<HTMLButtonElement>(byLabel(block()!, 'Choices'), 'button').find((b) => b.textContent !== 'manzana')!;
    await click(wrong);
    expect(await reports()).toHaveLength(0);
    expect(block()!.textContent).toContain('The sentence reads: El hombre compró una manzana roja.');
    // the choices stop answering once answered
    await click(choice('manzana'));
    expect(await reports()).toHaveLength(0);
  });

  it('"Skip" moves on without recording anything, and "Skip all" ends the block', async () => {
    weak({ manzana: 'recognized_with_help', canción: 'recognized_with_help' });
    await open();
    await click(button(mounted!.container, 'Understood sentence 3')); // an Understood sentence, so a yes/no exists too
    await finish();
    const before = (await reports()).length;
    expect(block()!.textContent).toContain('1 of 3');
    await click(button(block()!, 'Skip'));
    expect(block()!.textContent).toContain('2 of 3');
    await click(button(block()!, 'Skip all'));
    expect(block()).toBeNull();
    expect((await reports()).length).toBe(before);
    expect(button(byLabel(mounted!.container, 'How much did you understand?'), 'Most')).toBeTruthy();
  });

  it('the yes/no records nothing; two misses mark "Some" as a suggestion but report nothing', async () => {
    weak({ manzana: 'recognized_with_help' });
    await open();
    await click(button(mounted!.container, 'Understood sentence 3'));
    await finish();
    const sentReports = (await reports()).length;
    // miss the cloze
    await click(qa<HTMLButtonElement>(byLabel(block()!, 'Choices'), 'button').find((b) => b.textContent !== 'manzana')!);
    await click(button(block()!, 'Next'));
    // miss the yes/no: say the opposite of the truth (a verbatim sentence of the text is true, a swapped one is not)
    const statement = q(block()!, '[data-testid="prompt-sentence"]')!.textContent!;
    expect(block()!.textContent).toContain('Did this happen in the text?');
    await click(button(byLabel(block()!, 'Choices'), SENTENCE_TEXTS.includes(statement) ? 'No' : 'Yes'));
    expect((await reports()).length).toBe(sentReports); // nothing recorded by either miss
    const report = byLabel(mounted!.container, 'How much did you understand?');
    const some = button(report, 'Some');
    expect(some.getAttribute('data-suggested')).toBe('true');
    expect(some.getAttribute('aria-pressed')).toBe('false'); // suggested, not chosen
    expect(await h.events('ComprehensionReported')).toHaveLength(sentReports);
    // the learner's own word still decides
    await click(button(report, 'Most'));
    const last = (await reports()).at(-1)!;
    expect(last).toMatchObject({ scope: 'text', degree: 'most' });
    expect(button(report, 'Some').getAttribute('data-suggested')).toBeNull(); // a choice made, the suggestion is gone
  });

  it('one miss suggests nothing', async () => {
    weak({ manzana: 'recognized_with_help' });
    await open();
    await finish();
    await click(qa<HTMLButtonElement>(byLabel(block()!, 'Choices'), 'button').find((b) => b.textContent !== 'manzana')!);
    expect(button(byLabel(mounted!.container, 'How much did you understand?'), 'Some').getAttribute('data-suggested')).toBeNull();
  });

  it('Scripture gets clozes only, never a yes/no', async () => {
    weak({ manzana: 'recognized_with_help' });
    await open('scripture');
    await click(button(mounted!.container, 'Understood sentence 3'));
    await finish();
    expect(block()!.textContent).toContain('1 of 1');
    expect(block()!.textContent).not.toContain('Did this happen');
  });
});
