// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EnglishRescueRevealed, SentenceViewed, TokenHelpOpened } from '../../src/core';
import { buildFixtureText, ids } from '../../src/core';
import { Reader } from '../../src/ui/reader/Reader';
import { ManualViewDetector } from '../../src/ui/reader/viewDetection';
import { button, byLabel, choose, click, flush, makeHarness, pressKey, q, qa } from './harness';
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
    expect(views.every((v) => v.contentVersion === 1)).toBe(true); // evidence is pinned to the version on screen

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

  it('falls back to a "mark as seen" button when there is no IntersectionObserver', async () => {
    await seedStory(h.store);
    expect(typeof IntersectionObserver).toBe('undefined'); // jsdom
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    const marks = qa<HTMLButtonElement>(mounted.container, 'button[aria-label^="Mark sentence"]');
    expect(marks).toHaveLength(3);
    await click(marks[1]);
    const views = (await h.events('SentenceViewed')) as SentenceViewed[];
    expect(views.map((v) => v.sentenceId)).toEqual([ids.sentence(STORY_ID, 1)]);
    expect(qa(mounted.container, 'button[aria-label^="Mark sentence"]')).toHaveLength(2); // the marked one is gone
    expect(views[0].dwellMs).toBeUndefined(); // an explicit mark has no timing to report
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

  it('Parallel English: ONE EnglishRescueRevealed per sitting + text; toggling again or remounting in the same sitting emits nothing; turning it off emits nothing', async () => {
    await seedJohn(h.store);
    const parallel = async () => ((await h.events('EnglishRescueRevealed')) as EnglishRescueRevealed[]).filter((e) => e.scope === 'parallel');
    mounted = await h.mount(<Reader textId={JOHN_ID} mode="scripture" />);
    await click(button(mounted.container, 'Parallel English'));
    expect(mounted.container.textContent).toContain('That the world might live.');
    expect(await parallel()).toHaveLength(1);
    expect((await parallel())[0]).toMatchObject({ textId: JOHN_ID, surface: 'scripture', sentenceIds: [0, 1, 2].map((i) => ids.sentence(JOHN_ID, i)) });

    await click(button(mounted.container, 'Parallel English')); // off: English hidden, nothing emitted
    expect(mounted.container.textContent).not.toContain('That the world might live.');
    expect(await h.events('EnglishRescueRevealed')).toHaveLength(1);
    await click(button(mounted.container, 'Parallel English')); // on again, same sitting
    expect(mounted.container.textContent).toContain('That the world might live.');
    expect(await parallel()).toHaveLength(1);

    // a remount (route revisit, reader re-keyed) is not a new exposure: the key comes from the sitting, not from the component's lifetime
    await mounted.unmount();
    mounted = await h.mount(<Reader textId={JOHN_ID} mode="scripture" />);
    await click(button(mounted.container, 'Parallel English'));
    expect(mounted.container.textContent).toContain('That the world might live.'); // it still works for the learner...
    expect(await parallel()).toHaveLength(1); // ...and adds no evidence
    await mounted.unmount();

    // a LATER sitting (another session id) is a genuine new exposure
    mounted = await h.mount(<Reader textId={JOHN_ID} mode="scripture" />, { session: 'ses-later' });
    await click(button(mounted.container, 'Parallel English'));
    expect(await parallel()).toHaveLength(2);
    expect((await parallel()).map((e) => e.session)).toEqual(['ses-test', 'ses-later']);
  });

  it('per-sentence and per-verse English: one event per sitting + sentence set, also across a remount', async () => {
    await seedJohn(h.store);
    const events = async () => (await h.events('EnglishRescueRevealed')) as EnglishRescueRevealed[];
    mounted = await h.mount(<Reader textId={JOHN_ID} mode="scripture" />);
    await click(button(mounted.container, 'Show English for verse 16'));
    await click(button(mounted.container, 'Show English for sentence 3')); // a different sentence set: its own event
    expect((await events()).map((e) => [e.scope, e.sentenceIds.length])).toEqual([['verse', 2], ['sentence', 1]]);
    await mounted.unmount();
    mounted = await h.mount(<Reader textId={JOHN_ID} mode="scripture" />);
    await click(button(mounted.container, 'Show English for verse 16'));
    await click(button(mounted.container, 'Show English for sentence 3'));
    expect(await events()).toHaveLength(2); // same sitting, same sets: nothing new
    await click(button(mounted.container, 'Hide English for sentence 3')); // hiding emits nothing
    expect(await events()).toHaveLength(2);
  });

  it('badges generated texts and sample (rights-unverified) sources', async () => {
    await seedJohn(h.store);
    const t = (await h.store.texts.get(JOHN_ID))!;
    await h.store.texts.put({ ...t, generated: true });
    mounted = await h.mount(<Reader textId={JOHN_ID} mode="scripture" />);
    const badges = qa(mounted.container, '.chip').map((b) => b.textContent);
    expect(badges).toContain('generated');
    expect(badges).toContain('Reina-Valera 1909');
    expect(badges.some((b) => b?.includes('rights unverified'))).toBe(true); // the fixture source is 'unverified'
  });

  it('says so when the text is not in the library', async () => {
    mounted = await h.mount(<Reader textId="text:es:nope" mode="corpus" />);
    expect(mounted.container.textContent).toContain('not in your library');
  });
});

describe('Reader — Luther verse markers', () => {
  it('lays an inline "[17:1]" / "[1b]" out as a quiet label: not a word to tap, the stored text and the word tokens untouched', async () => {
    const t = await buildFixtureText(h.store, {
      lang: 'de', slug: 'num-16', title: '4. Mose 16', kind: 'scripture', scripture: { book: 'NUM', chapter: 16 },
      sentences: [
        {
          text: '[17:1] Und der HERR redete mit Mose.',
          tokens: [{ surface: '[', isWord: false }, { surface: '17' }, { surface: ':', isWord: false }, { surface: '1' }, { surface: ']', isWord: false },
            { surface: 'Und' }, { surface: 'der' }, { surface: 'HERR' }, { surface: 'redete' }, { surface: 'mit' }, { surface: 'Mose' }, { surface: '.', isWord: false }],
          verseRefs: ['NUM.16.36'],
        },
        { text: 'Er sprach [1b] zu ihm.', tokens: [{ surface: 'Er' }, { surface: 'sprach' }, { surface: 'zu' }, { surface: 'ihm' }, { surface: '.', isWord: false }], verseRefs: ['NUM.16.37'] },
      ],
    });
    // the second sentence's marker has no tokens of its own: it falls in a gap and is still laid out as a label
    const stored = (await h.store.sentences.where('textId', t.id)).sort((a, b) => a.index - b.index);
    expect(stored[0].text).toBe('[17:1] Und der HERR redete mit Mose.');
    mounted = await h.mount(<Reader textId={t.id} mode="scripture" />);
    const marks = qa(mounted.container, 'sup.vn--alt');
    expect(marks.map((e) => e.textContent)).toEqual(['17:1', '1b']);
    expect(qa(mounted.container, 'sup.verse').map((e) => e.textContent)).toEqual(['36', '37']); // the verse labels are the ones from verseRefs
    const words = qa(mounted.container, 'button.tok').map((b) => b.textContent);
    expect(words).toEqual(['Und', 'der', 'HERR', 'redete', 'mit', 'Mose', 'Er', 'sprach', 'zu', 'ihm']);
    const text = qa(mounted.container, '.sent-text').map((e) => e.textContent);
    expect(text).toEqual(['17:1 Und der HERR redete mit Mose.', 'Er sprach 1b zu ihm.']);
  });
});

describe('Reader — word card as a bottom sheet', () => {
  const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

  it('rises on the first tap and keeps the same sheet, crossfading its content, when another word is tapped', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    await click(tokenButton(mounted.container, 'creo'));
    const sheet = q(mounted.container, '.panel')!;
    expect(sheet.classList.contains('panel--rise')).toBe(true);
    expect(q(sheet, '.panel__grip')).not.toBeNull();
    expect(tokenButton(mounted.container, 'creo').classList.contains('sel')).toBe(true);
    const body = q(sheet, '.panel__body')!;

    await click(tokenButton(mounted.container, 'Dios'));
    expect(q(mounted.container, '.panel')).toBe(sheet); // same element: no second rise
    expect(sheet.classList.contains('panel--rise')).toBe(true);
    expect(q(sheet, '.panel__body')).not.toBe(body); // the content is what swaps (and fades in)
    expect(sheet.getAttribute('aria-label')).toBe('Help for Dios');
    expect(tokenButton(mounted.container, 'Dios').classList.contains('sel')).toBe(true);
    expect(tokenButton(mounted.container, 'creo').classList.contains('sel')).toBe(false);
  });

  it('falls and is removed on Escape, and on the close button; tapping the open word closes it too', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    await click(tokenButton(mounted.container, 'creo'));
    await pressKey('Escape');
    expect(q(mounted.container, '.panel')!.classList.contains('panel--fall')).toBe(true); // still mounted while it leaves
    expect(tokenButton(mounted.container, 'creo').classList.contains('sel')).toBe(false);
    await wait(450);
    expect(q(mounted.container, '.panel')).toBeNull();

    await click(tokenButton(mounted.container, 'creo'));
    expect(q(mounted.container, '.panel')!.classList.contains('panel--rise')).toBe(true);
    await click(button(mounted.container, 'Close word help'));
    expect(q(mounted.container, '.panel')!.classList.contains('panel--fall')).toBe(true);
    await wait(450);
    expect(q(mounted.container, '.panel')).toBeNull();

    await click(tokenButton(mounted.container, 'creo'));
    await click(tokenButton(mounted.container, 'creo'));
    expect(q(mounted.container, '.panel')!.classList.contains('panel--fall')).toBe(true);
  });
});
