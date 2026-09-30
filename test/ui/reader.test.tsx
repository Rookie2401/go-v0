// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EnglishRescueRevealed, SentenceViewed, TokenHelpOpened } from '../../src/core';
import { ids } from '../../src/core';
import { Reader } from '../../src/ui/reader/Reader';
import { ManualViewDetector } from '../../src/ui/reader/viewDetection';
import { button, byLabel, choose, click, flush, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import { JOHN_ID, STORY_ID, seedHindi, seedJohn, seedStory, seedThai } from './fixtures';

let h: Harness;
let mounted: Mounted | undefined;

beforeEach(async () => { h = await makeHarness({ learn: { explanations: { [ids.sentence(STORY_ID, 0)]: 'A statement of faith: I believe in God.' } } }); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const tokenButton = (root: ParentNode, surface: string) => {
  const t = qa<HTMLButtonElement>(root, 'button.tok').find((b) => b.textContent === surface);
  if (!t) throw new Error(`no token button "${surface}"`);
  return t;
};

describe('Reader — viewing', () => {
  it('emits exactly one SentenceViewed per sentence, even when the detector fires repeatedly or the reader remounts', async () => {
    await seedStory(h.store);
    const detector = new ManualViewDetector();
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" createDetector={detector.factory} />);
    expect(detector.observed.size).toBe(3);

    await act(async () => {
      detector.see(ids.sentence(STORY_ID, 0));
      detector.see(ids.sentence(STORY_ID, 0)); // same sentence again: ignored
      detector.see(ids.sentence(STORY_ID, 1));
      detector.see(ids.sentence(STORY_ID, 2), 1500);
    });
    await flush();
    let views = (await h.events('SentenceViewed')) as SentenceViewed[];
    expect(views).toHaveLength(3);
    expect(new Set(views.map((v) => v.sentenceId)).size).toBe(3);
    expect(views[0].textId).toBe(STORY_ID);
    expect(views[0].surface).toBe('corpus');
    expect(views[0].session).toBe('ses-test');
    // token ids cover the word tokens only (punctuation excluded)
    expect(views[0].tokenIds).toEqual([0, 1, 2, 3].map((i) => ids.token(ids.sentence(STORY_ID, 0), i)));
    expect(views[2].dwellMs).toBe(1500);

    // remount in the same session: the bus dedupes by session-scoped key
    await mounted.unmount();
    const again = new ManualViewDetector();
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" createDetector={again.factory} />);
    await act(async () => { again.see(ids.sentence(STORY_ID, 0)); });
    await flush();
    views = (await h.events('SentenceViewed')) as SentenceViewed[];
    expect(views).toHaveLength(3);
    expect((await h.events('TextViewed'))).toHaveLength(1);
  });

  it('falls back to a "mark as read" button when there is no IntersectionObserver', async () => {
    await seedStory(h.store);
    expect(typeof IntersectionObserver).toBe('undefined'); // jsdom
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    const marks = qa<HTMLButtonElement>(mounted.container, 'button[aria-label^="Mark sentence"]');
    expect(marks).toHaveLength(3);
    await click(marks[1]);
    const views = (await h.events('SentenceViewed')) as SentenceViewed[];
    expect(views.map((v) => v.sentenceId)).toEqual([ids.sentence(STORY_ID, 1)]);
    expect(qa(mounted.container, 'button[aria-label^="Mark sentence"]')).toHaveLength(2); // the read one is gone
  });

  it('emits TextCompleted once per session from the finish button', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    await click(button(mounted.container, /finished reading/));
    expect(q(mounted.container, '[role="status"]')!.textContent).toContain('finished');
    expect(qa(mounted.container, 'button').some((b) => /finished reading/.test(b.textContent ?? ''))).toBe(false);
    const done = await h.events('TextCompleted');
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ type: 'TextCompleted', textId: STORY_ID });
  });
});

describe('Reader — canonical text', () => {
  it('renders each sentence exactly as stored (Latin, Devanagari, Thai without spaces)', async () => {
    await seedStory(h.store);
    await seedThai(h.store);
    await seedHindi(h.store);
    for (const textId of [STORY_ID, 'text:th:th-1', 'text:hi:hi-1']) {
      mounted = await h.mount(<Reader textId={textId} mode="corpus" />);
      const sentences = (await h.store.sentences.where('textId', textId)).sort((a, b) => a.index - b.index);
      const shown = qa(mounted.container, '.sent-text').map((e) => e.textContent);
      expect(shown).toEqual(sentences.map((s) => s.text));
      const root = q(mounted.container, 'article.reader')!;
      expect(root.getAttribute('lang')).toBe(textId.split(':')[1]);
      await mounted.unmount();
      mounted = undefined;
    }
    // Thai: the canonical text has no spaces, and the reader added none
    const thai = (await h.store.sentences.get(ids.sentence('text:th:th-1', 0)))!;
    expect(thai.text).not.toContain(' ');
  });

  it('applies subtle highlight classes from sentenceSupport and lets the learner change them', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    const root = q(mounted.container, 'article.reader')!;
    expect(root.getAttribute('data-highlight')).toBe('subtle');
    const classes = qa(mounted.container, 'button.tok').map((b) => b.className);
    expect(classes.some((c) => c.includes('hl-unseen'))).toBe(true);
    expect(classes.some((c) => c.includes('hl-partial'))).toBe(true);
    expect(classes.some((c) => c.includes('hl-known'))).toBe(true);
    const select = byLabel<HTMLSelectElement>(mounted.container, 'Highlighting');
    await choose(select, 'off');
    expect(root.getAttribute('data-highlight')).toBe('off');
  });
});

describe('Reader — layered support', () => {
  it('tap opens the gloss and emits TokenHelpOpened at level 1', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect(q(mounted.container, '[role="dialog"]')).toBeNull();

    await click(tokenButton(mounted.container, 'creo'));
    const card = byLabel(mounted.container, 'Help for creo');
    expect(card.textContent).toContain('believe');
    expect(card.textContent).not.toContain('Phrases'); // only what was asked for
    expect(h.learn.tokenSupport).toHaveBeenCalledWith('u1', ids.token(ids.sentence(STORY_ID, 0), 1), 1);

    const helps = (await h.events('TokenHelpOpened')) as TokenHelpOpened[];
    expect(helps).toHaveLength(1);
    expect(helps[0]).toMatchObject({ level: 1, tokenId: ids.token(ids.sentence(STORY_ID, 0), 1), itemId: ids.form('es', 'creo'), surface: 'corpus' });
  });

  it('climbs gloss → phrase → grammar → explanation → English, emitting each level', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    await click(tokenButton(mounted.container, 'creo'));

    await click(button(mounted.container, 'Show phrases'));
    expect(byLabel(mounted.container, 'Phrases').textContent).toContain('creer en …');
    expect(byLabel(mounted.container, 'Help for creo').textContent).toContain('believe'); // gloss stays

    await click(button(mounted.container, 'Show grammar'));
    expect(byLabel(mounted.container, 'Grammar').textContent).toContain('verb');
    expect(byLabel(mounted.container, 'Grammar').textContent).toContain('Present tense');

    await click(button(mounted.container, 'Explain this sentence'));
    expect(byLabel(mounted.container, 'Sentence explanation').textContent).toContain('A statement of faith');

    await click(button(mounted.container, 'Show English'));
    expect(byLabel(mounted.container, 'English').textContent).toContain('I believe in God.');
    expect(qa(mounted.container, 'button').some((b) => b.textContent === 'Show English')).toBe(false); // top of the ladder

    const levels = ((await h.events('TokenHelpOpened')) as TokenHelpOpened[]).map((e) => e.level);
    expect(levels).toEqual([1, 2, 3, 4, 5]);
    expect(await h.events('PhraseHelpOpened')).toHaveLength(1);
    expect(await h.events('GrammarHelpOpened')).toHaveLength(1);
    expect(await h.events('SentenceExplanationRevealed')).toHaveLength(1);
    const rescue = (await h.events('EnglishRescueRevealed')) as EnglishRescueRevealed[];
    expect(rescue).toHaveLength(1);
    expect(rescue[0]).toMatchObject({ scope: 'sentence', sentenceIds: [ids.sentence(STORY_ID, 0)] });
  });

  it('English stays hidden until asked; a reveal emits EnglishRescueRevealed once per scope', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    expect(mounted.container.textContent).not.toContain('I believe in God.');

    const show = button(mounted.container, 'Show English for sentence 1');
    await click(show);
    expect(mounted.container.textContent).toContain('I believe in God.');
    let events = (await h.events('EnglishRescueRevealed')) as EnglishRescueRevealed[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ scope: 'sentence', textId: STORY_ID, sentenceIds: [ids.sentence(STORY_ID, 0)], surface: 'corpus' });

    await click(button(mounted.container, 'Hide English for sentence 1'));
    expect(mounted.container.textContent).not.toContain('I believe in God.');
    await click(button(mounted.container, 'Show English for sentence 1'));
    events = (await h.events('EnglishRescueRevealed')) as EnglishRescueRevealed[];
    expect(events).toHaveLength(1); // re-showing what was already revealed adds no evidence
  });
});

describe('Reader — scripture mode', () => {
  it('shows verse labels as <sup> from verseRefs, hides English, and reveals per verse and in parallel', async () => {
    await seedJohn(h.store);
    mounted = await h.mount(<Reader textId={JOHN_ID} mode="scripture" />);
    const labels = qa(mounted.container, 'sup.verse').map((e) => e.textContent);
    expect(labels).toEqual(['16', '17']); // one label per verse, not per sentence
    // verse numbers are metadata: they never appear inside sentence text
    const sentences = (await h.store.sentences.where('textId', JOHN_ID)).sort((a, b) => a.index - b.index);
    expect(qa(mounted.container, '.sent-text').map((e) => e.textContent)).toEqual(sentences.map((s) => s.text));
    expect(sentences.every((s) => !/\d/.test(s.text))).toBe(true);
    expect(mounted.container.textContent).not.toContain('For God so loved');
    expect(q(mounted.container, 'article.reader')!.getAttribute('data-mode')).toBe('scripture');

    await click(button(mounted.container, 'Show English for verse 16'));
    expect(mounted.container.textContent).toContain('For God so loved the world.');
    expect(mounted.container.textContent).toContain('That he gave his only begotten Son.');
    expect(mounted.container.textContent).not.toContain('That the world might live.');
    const verse = ((await h.events('EnglishRescueRevealed')) as EnglishRescueRevealed[]).find((e) => e.scope === 'verse')!;
    expect(verse.surface).toBe('scripture');
    expect(verse.sentenceIds).toEqual([ids.sentence(JOHN_ID, 0), ids.sentence(JOHN_ID, 1)]);

    await click(button(mounted.container, 'Parallel English'));
    expect(mounted.container.textContent).toContain('That the world might live.');
    const scopes = ((await h.events('EnglishRescueRevealed')) as EnglishRescueRevealed[]).map((e) => e.scope);
    expect(scopes).toEqual(['verse', 'parallel']);
  });

  it('badges generated texts and sample (rights-unverified) sources', async () => {
    await seedJohn(h.store);
    const t = (await h.store.texts.get(JOHN_ID))!;
    await h.store.texts.put({ ...t, generated: true });
    mounted = await h.mount(<Reader textId={JOHN_ID} mode="scripture" />);
    const badges = qa(mounted.container, '.badge').map((b) => b.textContent);
    expect(badges).toContain('generated');
    expect(badges).toContain('Reina-Valera 1909');
    expect(badges.some((b) => b?.includes('rights unverified'))).toBe(true); // the fixture source is 'unverified'
  });

  it('says so when the text is not in the library', async () => {
    mounted = await h.mount(<Reader textId="text:es:nope" mode="corpus" />);
    expect(mounted.container.textContent).toContain('not in your library');
  });
});
