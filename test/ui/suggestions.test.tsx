// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GoTellSuggestion, IntentProposal } from '../../src/core';
import { Testimony } from '../../src/ui/testimony/Testimony';
import { button, byLabel, click, installMediaStubs, makeHarness, q, qa, suggestion, type as typeInto } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(() => { installMediaStubs(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const editor = () => byLabel<HTMLTextAreaElement>(mounted!.container, 'Your testimony');
const card = (id: string) => q(mounted!.container, `li[data-suggestion-id="${id}"]`)!;

async function checked(suggestions: GoTellSuggestion[], draft = 'Yo cree en Dios. Yo tiene cinco año.') {
  h = await makeHarness({ tell: { suggestions } });
  mounted = await h.mount(<Testimony />);
  await typeInto(editor(), draft);
  await click(button(mounted.container, 'Check my writing'));
}

describe('Suggestion cards are honest about what they do', () => {
  it('a repair that fixes everything the checker found says exactly that — and what the checker cannot see', async () => {
    await checked([suggestion({ id: 'a', scope: 'fixes-all-detected', checkerCoverage: 'The Spanish checker knows a few verb and agreement patterns; it cannot judge meaning or style.' })]);
    const c = card('a');
    expect(q(c, '[data-testid="suggestion-scope"]')!.textContent).toBe('Fixes everything this checker found.');
    expect(q(c, '[data-testid="checker-coverage"]')!.textContent).toContain('cannot judge meaning or style');
    expect(c.textContent).not.toContain('is now correct');
  });

  it('a partial repair names what is still to check', async () => {
    await checked([suggestion({
      id: 'p', sentenceIndex: 1, original: 'Yo tiene cinco año', suggested: 'Yo tengo cinco año', scope: 'partial',
      remainingIssues: ['agreement: "cinco año" needs a plural noun'], explanation: 'Use tengo after yo.',
    })]);
    expect(q(card('p'), '[data-testid="suggestion-scope"]')!.textContent).toBe('Fixes one thing — still to check: agreement: "cinco año" needs a plural noun.');
    expect(q(card('p'), '[data-testid="checker-coverage"]')).not.toBeNull(); // always shown
  });

  it('recombinations and expansions are labelled by kind and carry no scope line', async () => {
    await checked([
      suggestion({ id: 'r', kind: 'recombination', scope: 'fixes-all-detected', original: 'Dios me perdonó', suggested: 'Dios me ha perdonado' }),
      suggestion({ id: 'e', kind: 'expansion', scope: 'fixes-all-detected', original: 'Dios', suggested: 'el Señor', newItems: [{ itemId: 'form:es:señor', itemKind: 'form', gloss: 'Lord' }] }),
    ]);
    expect(card('r').textContent).toContain('Uses language you have met');
    expect(q(card('r'), '[data-testid="suggestion-scope"]')).toBeNull();
    expect(card('e').textContent).toContain('New expression');
    expect(q(card('e'), '[data-testid="suggestion-scope"]')).toBeNull();
    expect(q(card('e'), '[data-testid="no-sources"]')!.textContent).toContain('new to you'); // no source ⇒ new language
  });

  it('shows where the wording comes from: the text title and the exact sentence', async () => {
    await checked([suggestion({
      id: 's', kind: 'recombination', original: 'Dios me perdonó', suggested: 'Dios me perdonó mis pecados',
      sources: [
        { itemId: 'form:es:perdonó', textId: 'text:es:story-01', textTitle: 'Story 1', sentenceId: 'text:es:story-01/s1', excerpt: 'Dios me perdonó.', surface: 'corpus' },
        { itemId: 'form:es:pecados', textId: 'text:es:testimony-r1', textTitle: 'My testimony, version 1', sentenceId: 'text:es:testimony-r1/s0', excerpt: 'Yo pensaba en mis pecados.', surface: 'testimony' },
      ],
    })]);
    const list = byLabel(card('s'), 'Where you met this wording');
    const items = qa(list, 'li');
    expect(items.map((li) => li.textContent)).toEqual(['Story 1: Dios me perdonó.', 'My testimony, version 1: Yo pensaba en mis pecados.']);
    expect(q(card('s'), '[data-testid="no-sources"]')).toBeNull();
  });

  it('warns prominently when the suggestion changes the meaning, and still applies nothing by itself', async () => {
    await checked([suggestion({ id: 'm', meaningChange: 'This drops the negation: "no creo" becomes "creo".', original: 'No creo', suggested: 'Creo', priority: 1 })], 'No creo.');
    const warn = q(card('m'), '.sugg-warn')!;
    expect(warn.getAttribute('role')).toBe('note');
    expect(warn.textContent).toContain('This changes the meaning.');
    expect(warn.textContent).toContain('drops the negation');
    expect(editor().value).toBe('No creo.');
    expect(h.tell.acceptSuggestion).not.toHaveBeenCalled();
  });

  it('acceptance is explicit: Accept applies and records, Reject leaves the draft alone, Edit applies the learner\'s own version', async () => {
    await checked([
      suggestion({ id: 'a1', original: 'Yo cree en Dios', suggested: 'Yo creo en Dios' }),
      suggestion({ id: 'a2', sentenceIndex: 1, original: 'Yo tiene cinco año', suggested: 'Yo tengo cinco años' }),
    ]);
    await click(button(card('a2'), 'Reject'));
    expect(editor().value).toBe('Yo cree en Dios. Yo tiene cinco año.');
    await click(button(card('a1'), 'Edit'));
    await typeInto(byLabel<HTMLTextAreaElement>(card('a1'), 'Edit suggestion'), 'Yo creo de verdad en Dios');
    await click(button(card('a1'), 'Use my edit'));
    expect(h.tell.editSuggestion).toHaveBeenCalledWith('a1', 'Yo creo de verdad en Dios');
    expect(editor().value).toBe('Yo creo de verdad en Dios. Yo tiene cinco año.');
  });
});

describe('"What are you trying to say?"', () => {
  async function ask(proposal: IntentProposal, draft = '') {
    h = await makeHarness({ tell: { proposal } });
    mounted = await h.mount(<Testimony />);
    if (draft) await typeInto(editor(), draft);
    await typeInto(byLabel<HTMLInputElement>(mounted.container, 'What are you trying to say?'), 'I began to understand my sin');
    await click(button(mounted.container, 'Help me say it'));
    return byLabel(mounted.container, 'Suggested wording');
  }
  const base: IntentProposal = { supported: true, insertable: true, sources: [], unexpressed: [], familiar: [], newItems: [] };

  it('unsupported: explains what is missing, lists what could not be said, and offers nothing to insert', async () => {
    const box = await ask({ ...base, supported: false, insertable: false, limitation: 'You have not met a word for "sin" in anything you have read yet.', unexpressed: ['my sin'] }, 'Yo creo.');
    expect(box.getAttribute('data-supported')).toBe('false');
    expect(q(box, '[data-testid="intent-limitation"]')!.textContent).toContain('not met a word for "sin"');
    expect(byLabel(box, 'What could not be expressed').textContent).toContain('my sin');
    expect(qa(box, 'button')).toHaveLength(0); // no insert button
    expect(box.querySelector('.proposal-text')).toBeNull(); // and no made-up wording
    expect(editor().value).toBe('Yo creo.'); // the draft is untouched
  });

  it('supported: shows the wording, the sentence it came from, and inserts only when asked', async () => {
    const box = await ask({
      ...base, proposal: 'Empecé a entender mi pecado.',
      sources: [{ itemId: 'form:es:empecé', textId: 'text:es:story-03', textTitle: 'Story 3', sentenceId: 'text:es:story-03/s2', excerpt: 'Un día empecé a entender mi pecado.', surface: 'corpus' }],
    });
    expect(q(box, '.proposal-text')!.textContent).toBe('Empecé a entender mi pecado.');
    expect(byLabel(box, 'Where this wording comes from').textContent).toContain('Story 3: Un día empecé a entender mi pecado.');
    expect(editor().value).toBe(''); // never inserted on its own
    await click(button(box, 'Add to my draft'));
    expect(editor().value).toBe('Empecé a entender mi pecado.');
  });

  it('a proposal that is supported but not insertable is shown as information only', async () => {
    const box = await ask({ ...base, insertable: false, proposal: 'Creo en Dios.', limitation: 'Only part of the meaning could be expressed.' });
    expect(q(box, '.proposal-text')!.textContent).toBe('Creo en Dios.');
    expect(box.textContent).toContain('Only part of the meaning could be expressed.');
    expect(qa(box, 'button')).toHaveLength(0);
  });

  it('labels new language in a proposal with why it is needed', async () => {
    const box = await ask({ ...base, proposal: 'Dios me perdonó.', newItems: [{ itemId: 'form:es:perdonó', surface: 'perdonó', gloss: 'forgave', whyNeeded: 'No word you have met means this.' }] });
    expect(byLabel(box, 'New language in this wording').textContent).toContain('perdonó (forgave) — No word you have met means this.');
  });
});
