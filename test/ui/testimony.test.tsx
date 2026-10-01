// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ids } from '../../src/core';
import type { AudioPlayed, ShadowingAttempt, UserRecordingCreated } from '../../src/core';
import { Testimony } from '../../src/ui/testimony/Testimony';
import { button, byLabel, click, flush, installMediaStubs, makeHarness, q, qa, suggestion, type as typeInto } from './harness';
import type { Harness, Mounted } from './harness';
import { seedStory } from './fixtures';

let h: Harness;
let mounted: Mounted | undefined;
let media: ReturnType<typeof installMediaStubs>;

const TEXT_ID = 'text:es:testimony-r1';
const DRAFT = 'Yo cree en Dios. Dios me perdonó.';

beforeEach(() => { media = installMediaStubs(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; vi.unstubAllGlobals(); });

const editor = () => byLabel<HTMLTextAreaElement>(mounted!.container, 'Your testimony');

async function withSuggestions() {
  h = await makeHarness({
    tell: {
      suggestions: [
        suggestion({ id: 'sug:a', kind: 'repair' }),
        suggestion({
          id: 'sug:b', sentenceIndex: 1, kind: 'recombination', original: 'Dios me perdonó', suggested: 'Dios me ha perdonado',
          explanation: 'You have met this frame.', categories: ['collocation'], priority: 3,
          familiar: [{ itemId: 'form:es:perdonó', itemKind: 'form', encounterCount: 3, textIds: ['text:es:story-01'], readingLevel: 'recognized', listeningLevel: 'unseen', writingLevel: 'unseen' }],
        }),
        suggestion({
          id: 'sug:c', sentenceIndex: 1, kind: 'expansion', original: 'Dios', suggested: 'el Señor', explanation: 'This is new language.', categories: ['lexical-choice'], priority: 4,
          newItems: [{ itemId: 'form:es:señor', itemKind: 'form', gloss: 'Lord' }], meaningChange: 'Señor carries a theological nuance that Dios does not.',
        }),
      ],
    },
  });
  await seedStory(h.store);
  mounted = await h.mount(<Testimony />);
}

describe('My Testimony editor', () => {
  it('starts with an empty target-language textarea and nothing to submit', async () => {
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    expect(editor().value).toBe('');
    expect(editor().getAttribute('lang')).toBe('es');
    expect(button(mounted.container, 'Check my writing').disabled).toBe(true);
    expect(button(mounted.container, 'Save this version').disabled).toBe(true);
    expect(mounted.container.textContent).toContain('No saved versions yet.');
    expect(h.tell.getOrCreateTestimony).toHaveBeenCalledWith('u1', 'es');
  });

  it('submits the draft and renders labelled suggestion cards with provenance', async () => {
    await withSuggestions();
    await typeInto(editor(), DRAFT);
    await click(button(mounted!.container, 'Check my writing'));
    expect(h.tell.submitDraft).toHaveBeenCalledWith('tst:u1:es', DRAFT);

    const cards = qa(mounted!.container, 'li.sugg');
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain('Correction');
    expect(cards[0].textContent).toContain('Yo cree en Dios');
    expect(cards[0].textContent).toContain('Yo creo en Dios');
    expect(cards[0].textContent).toContain('Use creo after yo.');
    expect(cards[1].textContent).toContain('Uses language you have met');
    expect(cards[1].textContent).toContain('encountered 3 times in Story 1');
    expect(cards[2].textContent).toContain('New expression');
    expect(cards[2].textContent).toContain('Lord');
    expect(cards[2].textContent).toContain('changes the meaning');
    // the learner's draft is untouched until they accept something
    expect(editor().value).toBe(DRAFT);
  });

  it('accept calls GoTell and only then puts the suggested wording in the draft; reject and edit likewise', async () => {
    await withSuggestions();
    await typeInto(editor(), DRAFT);
    await click(button(mounted!.container, 'Check my writing'));

    const card = (id: string) => q(mounted!.container, `li[data-suggestion-id="${id}"]`)!;
    await click(button(card('sug:a'), 'Accept'));
    expect(h.tell.acceptSuggestion).toHaveBeenCalledWith('sug:a');
    expect(editor().value).toBe('Yo creo en Dios. Dios me perdonó.');
    expect(card('sug:a').getAttribute('data-status')).toBe('accepted');
    expect(button(card('sug:a'), 'Accept').disabled).toBe(true);

    await click(button(card('sug:c'), 'Reject'));
    expect(h.tell.rejectSuggestion).toHaveBeenCalledWith('sug:c');
    expect(editor().value).toBe('Yo creo en Dios. Dios me perdonó.'); // rejecting changes nothing
    expect(card('sug:c').getAttribute('data-status')).toBe('rejected');

    await click(button(card('sug:b'), 'Edit'));
    await typeInto(byLabel<HTMLTextAreaElement>(card('sug:b'), 'Edit suggestion'), 'Dios me perdonó siempre');
    await click(button(card('sug:b'), 'Use my edit'));
    expect(h.tell.editSuggestion).toHaveBeenCalledWith('sug:b', 'Dios me perdonó siempre');
    expect(editor().value).toBe('Yo creo en Dios. Dios me perdonó siempre.');
    expect(card('sug:b').getAttribute('data-status')).toBe('edited');
  });

  it('saves versions, keeps the history, and shows a diff between versions', async () => {
    h = await makeHarness({
      tell: { diff: [{ kind: 'same', a: 'Yo creo en Dios.', b: 'Yo creo en Dios.' }, { kind: 'changed', a: 'Dios me perdonó.', b: 'Dios me ha perdonado.' }, { kind: 'added', b: 'Gracias.' }] },
    });
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Yo creo en Dios. Dios me perdonó.');
    await click(button(mounted.container, 'Save this version'));
    expect(h.tell.acceptRevision).toHaveBeenCalledWith('tst:u1:es', 'Yo creo en Dios. Dios me perdonó.');
    expect(mounted.container.textContent).toContain('Saved as version 1.');

    await typeInto(editor(), 'Yo creo en Dios. Dios me ha perdonado. Gracias.');
    await click(button(mounted.container, 'Save this version'));
    const history = byLabel(mounted.container, 'Version history');
    const items = qa(history, 'li[data-revision-id]');
    expect(items.map((li) => li.querySelector('strong')!.textContent)).toEqual(['Version 2', 'Version 1']); // newest first, nothing overwritten
    // version 1 has no predecessor, so the comparison is offered only on version 2
    expect(qa(items[1], 'button').some((b) => /Show changes/.test(b.textContent ?? ''))).toBe(false);

    await click(button(items[0], 'Show changes from version 1'));
    expect(h.tell.diffRevisions).toHaveBeenCalledWith('tst:u1:es/r1', 'tst:u1:es/r2');
    const rows = qa(items[0], 'ul.diff li');
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['same', 'changed', 'added']);
    expect(rows[1].textContent).toContain('Dios me perdonó.');
    expect(rows[1].textContent).toContain('Dios me ha perdonado.');

    await click(button(items[1], 'Restore as draft'));
    expect(h.tell.restoreRevisionAsDraft).toHaveBeenCalledWith('tst:u1:es/r1');
    expect(editor().value).toBe('Yo creo en Dios. Dios me perdonó.');
  });

  it('asks GoTell for an intent proposal and only adds it to the draft on request', async () => {
    h = await makeHarness({ tell: { proposal: { supported: true, insertable: true, sources: [], unexpressed: [], proposal: 'Dios me perdonó.', familiar: [], newItems: [{ itemId: 'form:es:perdonó', surface: 'perdonó', gloss: 'forgave', whyNeeded: 'No word you know means this.' }], fallbackWithoutNew: { text: 'Dios me ayudó.', lossNote: 'Says help, not forgive.' } } } });
    mounted = await h.mount(<Testimony />);
    await click(button(mounted.container, 'What are you trying to say?')); // a collapsed disclosure: open it first
    await typeInto(byLabel<HTMLInputElement>(mounted.container, 'What you want to say, in English'), 'God forgave me');
    await click(button(mounted.container, 'Help me say it'));
    expect(h.tell.intent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', lang: 'es', english: 'God forgave me' }));
    const box = byLabel(mounted.container, 'Suggested wording');
    expect(box.textContent).toContain('Dios me perdonó.');
    expect(box.textContent).toContain('No word you know means this.');
    expect(box.textContent).toContain('Says help, not forgive.');
    expect(editor().value).toBe('');
    await click(button(box, 'Add to my draft'));
    expect(editor().value).toBe('Dios me perdonó.');
  });
});

describe('My Testimony rehearsal', () => {
  async function saved() {
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Yo creo en Dios. Dios me perdonó.');
    await click(button(mounted.container, 'Save this version'));
  }

  it('rehearses from the private testimony Text manifest with the shared Player (real segment ids, fixture badge, pitch kept)', async () => {
    await saved();
    const rev = (await h.tell.listRevisions('tst:u1:es'))[0];
    expect(rev.textId).toBe(TEXT_ID);
    expect((await h.store.texts.get(TEXT_ID))!.kind).toBe('testimony');
    const box = byLabel(mounted!.container, 'Listen and rehearse');
    expect(q(box, '.player')).not.toBeNull(); // the same Player used for every other text
    expect(q(box, '[data-testid="fixture-badge"]')!.textContent).toBe('fixture audio — not speech');
    expect(q(box, '[aria-live="polite"]')!.textContent).toContain('Sentence 1 of 2');

    await click(button(box, 'Play sentence 2'));
    expect(media.play).toHaveBeenCalled();
    expect(q<HTMLAudioElement>(box, 'audio')!.src).toBe('blob:test/asset:1-1');
    expect(q<HTMLAudioElement>(box, 'audio')!.preservesPitch).toBe(true);
    const played = ((await h.events('AudioPlayed')) as AudioPlayed[]).at(-1)!;
    expect(played).toMatchObject({ textId: TEXT_ID, segmentId: 'seg:1-1', sentenceIds: [ids.sentence(TEXT_ID, 1)] });
    expect(h.listen.ensureAudio).not.toHaveBeenCalled(); // GoTell already prepared the manifest
  });

  it('plays the whole testimony from the first sentence', async () => {
    await saved();
    const box = byLabel(mounted!.container, 'Listen and rehearse');
    await click(button(box, 'Play sentence 2'));
    await click(button(box, 'Play whole testimony'));
    expect(q<HTMLAudioElement>(box, 'audio')!.src).toBe('blob:test/asset:1-0');
    expect(button(box, 'Pause')).toBeTruthy();
  });

  it('counts shadowing attempts and records them as events', async () => {
    await saved();
    expect(q(mounted!.container, '[data-testid="shadow-0"]')!.textContent).toBe('0×');
    await click(button(mounted!.container, 'Count a shadowing attempt for sentence 1'));
    await click(button(mounted!.container, 'Count a shadowing attempt for sentence 1'));
    expect(q(mounted!.container, '[data-testid="shadow-0"]')!.textContent).toBe('2×');
    expect(q(mounted!.container, '[data-testid="shadow-1"]')!.textContent).toBe('0×');
    const attempts = (await h.events('ShadowingAttempt')) as ShadowingAttempt[];
    expect(attempts.map((a) => a.attempt)).toEqual([1, 2]);
    // events carry the real manifest segment and sentence ids, so GoLearn can fold listening evidence
    expect(attempts[0]).toMatchObject({ textId: TEXT_ID, segmentId: 'seg:1-0', sentenceIds: [ids.sentence(TEXT_ID, 0)], surface: 'testimony' });

    // the count survives a remount (it is read back from the event log)
    await mounted!.unmount();
    mounted = await h.mount(<Testimony />);
    await flush();
    expect(q(mounted.container, '[data-testid="shadow-0"]')!.textContent).toBe('2×');
  });

  it('says plainly that recording is unavailable when MediaRecorder is missing', async () => {
    await saved();
    expect(typeof MediaRecorder).toBe('undefined');
    expect(mounted!.container.textContent).toContain('Recording is not available in this browser');
    expect(qa(mounted!.container, 'button').some((b) => /^Record sentence/.test(b.getAttribute('aria-label') ?? ''))).toBe(false);
    expect(button(mounted!.container, 'Play whole testimony')).toBeTruthy();
  });

  it('records a take when MediaRecorder exists: stored as an asset, targeted at the sentence, counted as an attempt', async () => {
    class FakeRecorder {
      state = 'inactive'; mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; onerror: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) }); this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [] }) } });
    await saved();
    await click(button(mounted!.container, 'Record sentence 2'));
    expect(button(mounted!.container, 'Stop recording sentence 2').getAttribute('aria-pressed')).toBe('true');
    await click(button(mounted!.container, 'Stop recording sentence 2'));
    await flush();
    const recs = await h.store.recordings.all();
    expect(recs).toHaveLength(1);
    expect(recs[0].target).toEqual({ sentenceId: ids.sentence(TEXT_ID, 1), testimonyRevisionId: 'tst:u1:es/r1', testimonySentenceIndex: 1, text: 'Dios me perdonó.' });
    expect(await h.store.assets.has(recs[0].assetId)).toBe(true);
    const created = (await h.events('UserRecordingCreated')) as UserRecordingCreated[];
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ recordingId: recs[0].id, testimonyRevisionId: 'tst:u1:es/r1', targetText: 'Dios me perdonó.' });
    expect(q(mounted!.container, '[data-testid="shadow-1"]')!.textContent).toBe('1×');
    expect(qa(mounted!.container, '.take')).toHaveLength(1);
    const attempt = ((await h.events('ShadowingAttempt')) as ShadowingAttempt[])[0];
    expect(attempt).toMatchObject({ segmentId: 'seg:1-1', sentenceIds: [ids.sentence(TEXT_ID, 1)] });
  });
});
