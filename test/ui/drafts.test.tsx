// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { LanguageCode, TestimonyDraft } from '../../src/core';
import { useApp } from '../../src/ui/context';
import type { AppContextValue } from '../../src/ui/context';
import { draftTiming, fallbackKey } from '../../src/ui/testimony/draft';
import { Testimony } from '../../src/ui/testimony/Testimony';
import { blur, button, byLabel, click, flush, installMediaStubs, makeHarness, q, qa, sleep, type as typeInto } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
const original = { ...draftTiming };

beforeEach(() => { installMediaStubs(); draftTiming.debounceMs = 40; draftTiming.retryMs = 80; });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; Object.assign(draftTiming, original); });

const DRAFT = 'Yo creo en Dios. Dios me perdonó.';
const editor = () => byLabel<HTMLTextAreaElement>(mounted!.container, 'Your testimony');
const status = () => q(mounted!.container, '[data-testid="draft-status"]')!.textContent;
const row = (userId = 'u1', lang: LanguageCode = 'es') => h.store.drafts.get(ids.draft(userId, lang));
const SAVED = /^Saved \d{1,2}[:.]\d{2}/;

/** Exposes the app context so a test can switch learner or language while the editor stays mounted. */
const probe: { app?: AppContextValue } = {};
function Probe() { probe.app = useApp(); return null; }
const inAct = async (fn: () => Promise<unknown>) => { await act(async () => { await fn(); }); };
const withProbe = () => <><Probe /><Testimony /></>;

describe('Testimony autosave', () => {
  it('saves the draft after a pause in typing, says so, and restores it after a remount', async () => {
    draftTiming.debounceMs = 150;
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    expect(status()).toBe('Your writing is saved automatically as you type.');
    await typeInto(editor(), DRAFT);
    expect(status()).toBe('Saving…');
    expect(h.tell.saveDraft).not.toHaveBeenCalled(); // debounced: not one write per keystroke
    await sleep(450);
    expect(h.tell.saveDraft).toHaveBeenCalledTimes(1);
    expect(h.tell.saveDraft).toHaveBeenCalledWith('u1', 'es', DRAFT, { expectedSeq: 0, basedOnRevisionId: undefined });
    expect(status()).toMatch(SAVED);
    expect((await row())!.text).toBe(DRAFT);

    await mounted.unmount();
    mounted = await h.mount(<Testimony />);
    expect(editor().value).toBe(DRAFT); // restored for this learner + language
    expect(status()).toMatch(SAVED);
  });

  it('coalesces a burst of typing into one save of the latest text, carrying the last seq', async () => {
    draftTiming.debounceMs = 120;
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Yo');
    await typeInto(editor(), 'Yo creo');
    await typeInto(editor(), 'Yo creo en Dios.');
    await sleep(400);
    expect(h.tell.saveDraft).toHaveBeenCalledTimes(1);
    expect((await row())!.text).toBe('Yo creo en Dios.');
    await typeInto(editor(), 'Yo creo en Dios. Gracias.');
    await sleep(400);
    expect(h.tell.saveDraft).toHaveBeenLastCalledWith('u1', 'es', 'Yo creo en Dios. Gracias.', { expectedSeq: 1, basedOnRevisionId: undefined });
    expect((await row())!.seq).toBe(2);
  });

  it('flushes on blur, without waiting for the pause', async () => {
    draftTiming.debounceMs = 10_000;
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), DRAFT);
    expect(await row()).toBeUndefined();
    await blur(editor());
    expect((await row())!.text).toBe(DRAFT);
    expect(status()).toMatch(SAVED);
  });

  it('flushes when the page is hidden (visibilitychange) and on pagehide', async () => {
    draftTiming.debounceMs = 10_000;
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), DRAFT);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    expect((await row())!.text).toBe(DRAFT);

    await typeInto(editor(), `${DRAFT} Más.`);
    window.dispatchEvent(new Event('pagehide'));
    await flush();
    expect((await row())!.text).toBe(`${DRAFT} Más.`);
  });

  it('flushes on route change: leaving the page right after typing still saves', async () => {
    draftTiming.debounceMs = 10_000;
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), DRAFT);
    expect(await row()).toBeUndefined();
    await mounted.unmount(); // navigating away unmounts the editor
    mounted = undefined;
    await flush();
    expect((await row())!.text).toBe(DRAFT);
    expect(localStorage.getItem(fallbackKey({ userId: 'u1', lang: 'es' }))).toBeNull(); // saved, so no leftover copy
  });

  it('never loses text across a language switch, and gives each language its own draft back', async () => {
    draftTiming.debounceMs = 10_000;
    h = await makeHarness();
    mounted = await h.mount(withProbe());
    await typeInto(editor(), DRAFT);

    // switch team to Thailand while the editor is open: the Spanish draft is saved on the way out
    await h.store.users.put({ ...(await h.store.users.get('u1'))!, courseId: 'thailand-th' });
    await inAct(() => probe.app!.refreshUser());
    await flush(10);
    expect((await row('u1', 'es'))!.text).toBe(DRAFT);
    expect(editor().value).toBe(''); // the Thai editor starts empty: no Spanish text leaks into it
    expect(editor().getAttribute('lang')).toBe('th');

    await typeInto(editor(), 'พระเจ้าทรงรักโลก');
    await blur(editor());
    expect((await row('u1', 'th'))!.text).toBe('พระเจ้าทรงรักโลก');

    // and back again: Spanish is exactly as left
    await h.store.users.put({ ...(await h.store.users.get('u1'))!, courseId: 'honduras-es' });
    await inAct(() => probe.app!.refreshUser());
    await flush(10);
    expect(editor().value).toBe(DRAFT);
    expect((await row('u1', 'th'))!.text).toBe('พระเจ้าทรงรักโลก');
  });

  it('keeps each learner\'s draft private, and restores it when switching back', async () => {
    draftTiming.debounceMs = 10_000;
    h = await makeHarness();
    await h.store.users.put({ id: 'u2', displayName: 'Second', courseId: 'honduras-es', createdAt: '2026-02-01T00:00:00.000Z' });
    mounted = await h.mount(withProbe());
    await typeInto(editor(), DRAFT);
    await inAct(() => probe.app!.selectUser('u2'));
    await flush(10);
    expect(editor().value).toBe(''); // u2 sees nothing of u1's writing
    expect(mounted.container.textContent).not.toContain('Dios me perdonó');
    await typeInto(editor(), 'Hola.');
    await inAct(() => probe.app!.selectUser('u1'));
    await flush(10);
    expect(editor().value).toBe(DRAFT);
    expect(h.learn.ensureCurrent).toHaveBeenCalledWith('u2'); // another learner's state is brought up to the current policy before it is shown
    expect((await row('u2'))!.text).toBe('Hola.');
    expect((await row('u1'))!.text).toBe(DRAFT);
  });
});

describe('Testimony when storage fails', () => {
  const FAIL = 'QuotaExceededError: disk full';

  it('keeps the text on the page, says it was not saved, keeps a local copy, and retries on its own', async () => {
    h = await makeHarness();
    const works = h.tell.saveDraft.getMockImplementation()!;
    h.tell.saveDraft.mockImplementation(async () => { throw new Error(FAIL); });
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), DRAFT);
    await sleep(150);
    expect(status()).toBe('Not saved — storage failed. Your text is kept on this page; copy it to be safe.');
    expect(editor().value).toBe(DRAFT); // never cleared
    expect(JSON.parse(localStorage.getItem(fallbackKey({ userId: 'u1', lang: 'es' }))!).text).toBe(DRAFT);
    expect(button(mounted.container, 'Copy my text')).toBeTruthy();

    // storage recovers: the next retry saves without the learner touching anything
    h.tell.saveDraft.mockImplementation(works);
    await sleep(300);
    expect(status()).toMatch(SAVED);
    expect((await row())!.text).toBe(DRAFT);
    expect(localStorage.getItem(fallbackKey({ userId: 'u1', lang: 'es' }))).toBeNull(); // the copy goes once it is safe
  });

  it('offers the local copy for recovery on the next load, and only applies it when asked', async () => {
    h = await makeHarness();
    h.tell.saveDraft.mockImplementation(async () => { throw new Error(FAIL); });
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), DRAFT);
    await sleep(150);
    await mounted.unmount(); // the tab is closed while storage is still failing
    mounted = undefined;

    expect(await row()).toBeUndefined(); // nothing reached the database
    const works = makeHarnessSaveImpl();
    h.tell.saveDraft.mockImplementation(works);

    mounted = await h.mount(<Testimony />);
    const banner = q(mounted.container, '[data-testid="draft-recovery"]')!;
    expect(banner.textContent).toContain('not saved last time');
    expect(banner.textContent).toContain('Yo creo en Dios.');
    expect(editor().value).toBe(''); // offered, not applied silently
    await click(button(banner, 'Restore it'));
    expect(editor().value).toBe(DRAFT);
    await sleep(200);
    expect((await row())!.text).toBe(DRAFT); // restored text is saved like any other
    expect(q(mounted.container, '[data-testid="draft-recovery"]')).toBeNull();
    expect(localStorage.getItem(fallbackKey({ userId: 'u1', lang: 'es' }))).toBeNull();
  });

  it('lets the learner discard a recovered copy', async () => {
    h = await makeHarness();
    localStorage.setItem(fallbackKey({ userId: 'u1', lang: 'es' }), JSON.stringify({ text: 'Texto viejo.', savedAt: '2026-01-01T10:00:00.000Z', seq: 0 }));
    mounted = await h.mount(<Testimony />);
    await click(button(q(mounted.container, '[data-testid="draft-recovery"]')!, 'Discard it'));
    expect(q(mounted.container, '[data-testid="draft-recovery"]')).toBeNull();
    expect(editor().value).toBe('');
    expect(localStorage.getItem(fallbackKey({ userId: 'u1', lang: 'es' }))).toBeNull();
  });

  it('drops a leftover copy that is identical to the saved draft, without bothering the learner', async () => {
    h = await makeHarness();
    await h.store.drafts.put({ id: ids.draft('u1', 'es'), userId: 'u1', lang: 'es', text: DRAFT, updatedAt: new Date().toISOString(), seq: 2 });
    localStorage.setItem(fallbackKey({ userId: 'u1', lang: 'es' }), JSON.stringify({ text: DRAFT, savedAt: 'x', seq: 2 }));
    mounted = await h.mount(<Testimony />);
    expect(q(mounted.container, '[data-testid="draft-recovery"]')).toBeNull();
    expect(editor().value).toBe(DRAFT);
    expect(localStorage.getItem(fallbackKey({ userId: 'u1', lang: 'es' }))).toBeNull();
  });

  it('can still save a version while the draft cannot be stored', async () => {
    h = await makeHarness();
    h.tell.saveDraft.mockImplementation(async () => { throw new Error(FAIL); });
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), DRAFT);
    await click(button(mounted.container, 'Save this version'));
    expect(mounted.container.textContent).toContain('Saved as version 1.');
    expect(editor().value).toBe(DRAFT);
  });

  function makeHarnessSaveImpl() {
    return async (userId: string, lang: TestimonyDraft['lang'], text: string, o?: { expectedSeq?: number; basedOnRevisionId?: string }) => {
      const id = ids.draft(userId, lang);
      const existing = await h.store.drafts.get(id);
      if (o?.expectedSeq !== undefined && o.expectedSeq !== (existing?.seq ?? 0)) throw Object.assign(new Error('conflict'), { name: 'DraftConflict' });
      const d: TestimonyDraft = { id, userId, lang, text, updatedAt: new Date().toISOString(), seq: (existing?.seq ?? 0) + 1 };
      await h.store.drafts.put(d);
      return d;
    };
  }
});

describe('Testimony when another window saved a draft', () => {
  const mine = 'Yo creo en Dios. Mi texto.';
  const theirs = 'Otra ventana escribió esto.';

  async function openWithConflict() {
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Primero.');
    await sleep(200); // saved: seq 1
    // another window writes a newer, different draft
    await h.store.drafts.put({ id: ids.draft('u1', 'es'), userId: 'u1', lang: 'es', text: theirs, updatedAt: '2026-03-03T10:00:00.000Z', seq: 4 });
    await typeInto(editor(), mine);
    await sleep(250);
  }

  it('never overwrites: keeps the learner\'s text, shows both, and lets them choose', async () => {
    await openWithConflict();
    expect(status()).toContain('newer draft was saved in another window');
    expect(editor().value).toBe(mine);
    expect((await row())!.text).toBe(theirs); // the other window's draft is intact
    const box = q(mounted!.container, '[data-testid="draft-conflict"]')!;
    expect(box.textContent).toContain(mine);
    expect(box.textContent).toContain(theirs);
    expect(box.textContent).toContain('Nothing has been overwritten');
  });

  it('"Keep mine" overwrites deliberately; "Use the newer draft" takes theirs', async () => {
    await openWithConflict();
    await click(button(mounted!.container, 'Keep mine'));
    expect((await row())!.text).toBe(mine);
    expect(status()).toMatch(SAVED);
    expect(q(mounted!.container, '[data-testid="draft-conflict"]')).toBeNull();

    await mounted!.unmount();
    mounted = undefined;
    await openWithConflict();
    await click(button(mounted!.container, 'Use the newer draft'));
    expect(editor().value).toBe(theirs);
    expect((await row())!.text).toBe(theirs);
    expect(status()).toMatch(SAVED);
  });

  it('adopts the new sequence silently when only the bookkeeping moved (same text)', async () => {
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Primero.');
    await sleep(200);
    const saved = (await row())!;
    await h.store.drafts.put({ ...saved, seq: saved.seq + 3 }); // e.g. another tab re-saved the same words
    await typeInto(editor(), 'Primero. Segundo.');
    await sleep(300);
    expect(q(mounted.container, '[data-testid="draft-conflict"]')).toBeNull();
    expect(status()).toMatch(SAVED);
    expect((await row())!.text).toBe('Primero. Segundo.');
  });
});

describe('Saving a version is separate from autosave', () => {
  it('does not create a version by itself; the button saves the draft first, then freezes it, and autosave carries on', async () => {
    draftTiming.debounceMs = 10_000;
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), DRAFT);
    await blur(editor());
    await sleep(100);
    expect(h.tell.acceptRevision).not.toHaveBeenCalled(); // autosave is not a version
    expect(mounted.container.textContent).toContain('No saved versions yet.');

    await typeInto(editor(), `${DRAFT} Gracias.`);
    await click(button(mounted.container, 'Save this version'));
    const lastDraftSave = h.tell.saveDraft.mock.invocationCallOrder.at(-1)!;
    expect(lastDraftSave).toBeLessThan(h.tell.acceptRevision.mock.invocationCallOrder[0]); // nothing typed is left behind
    expect((await row())!.text).toBe(`${DRAFT} Gracias.`);
    expect((await row())!.basedOnRevisionId).toBe('tst:u1:es/r1'); // the draft descends from the version, and is kept
    expect(mounted.container.textContent).toContain('Saved as version 1.');

    // typing on after saving a version saves normally (no stale-sequence conflict)
    await typeInto(editor(), `${DRAFT} Gracias. Amén.`);
    await blur(editor());
    expect(status()).toMatch(SAVED);
    expect((await row())!.text).toBe(`${DRAFT} Gracias. Amén.`);
    expect(q(mounted.container, '[data-testid="draft-conflict"]')).toBeNull();
  });

  it('restores a version as the draft, replacing the editor text, with an undo for what was there', async () => {
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Versión uno.');
    await click(button(mounted.container, 'Save this version'));
    await typeInto(editor(), 'Algo que escribí después.');
    await sleep(200);

    await click(button(mounted.container, 'Restore as draft'));
    expect(h.tell.restoreRevisionAsDraft).toHaveBeenCalledWith('tst:u1:es/r1');
    expect(editor().value).toBe('Versión uno.');
    expect((await row())!.text).toBe('Versión uno.');
    expect(mounted.container.textContent).toContain('Version 1 is now your draft.');
    expect(mounted.container.textContent).toContain('Versión uno.'); // the version itself is untouched in the list
    expect((await h.tell.listRevisions('tst:u1:es'))).toHaveLength(1);

    // what was being written is not gone: one click brings it back (and autosave keeps it)
    await click(button(mounted.container, 'Undo'));
    expect(editor().value).toBe('Algo que escribí después.');
    await sleep(250);
    expect((await row())!.text).toBe('Algo que escribí después.');
  });

  it('labels the rehearsal audio with its version and says when the editor text differs from it', async () => {
    draftTiming.debounceMs = 10_000;
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Yo creo en Dios.');
    await click(button(mounted.container, 'Save this version'));
    const box = byLabel(mounted.container, 'Listen and rehearse');
    expect(box.textContent).toContain('Audio for version 1');
    expect(q(box, '[data-testid="draft-differs"]')).toBeNull(); // the editor still matches the version

    await typeInto(editor(), 'Yo creo en Dios. Dios me perdonó.');
    const note = q(byLabel(mounted.container, 'Listen and rehearse'), '[data-testid="draft-differs"]')!;
    expect(note.textContent).toContain('version 1');
    expect(note.textContent).toContain('not for the text in your editor now');

    await typeInto(editor(), 'Yo creo en Dios.');
    expect(q(byLabel(mounted.container, 'Listen and rehearse'), '[data-testid="draft-differs"]')).toBeNull();
  });

  it('restoring then clearing the text is saved too (an emptied editor is a real edit)', async () => {
    h = await makeHarness();
    mounted = await h.mount(<Testimony />);
    await typeInto(editor(), 'Algo.');
    await blur(editor());
    await typeInto(editor(), '');
    await blur(editor());
    expect((await row())!.text).toBe('');
    expect(qa(mounted.container, 'button').find((b) => b.textContent === 'Check my writing')!.hasAttribute('disabled')).toBe(true);
  });
});
