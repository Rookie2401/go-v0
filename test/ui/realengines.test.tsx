// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ComprehensionReported, Text } from '../../src/core';
import { createMemoryStore } from '../../src/core';
import { bootstrap } from '../../src/app/bootstrap';
import type { BootstrapResult } from '../../src/app/bootstrap';
import { AppRoutes, Shell } from '../../src/ui/App';
import { AppProvider } from '../../src/ui/context';
import { resetPrefsForTests, setPref } from '../../src/ui/prefs';
import { button, byLabel, check, click, flush, installMediaStubs, q, qa } from './harness';

/**
 * The whole UI over the REAL engines (adapters, importer, GoLearn, GoListen, GoTell, backup) and the real bundled
 * corpus, in jsdom. This is the check that the screens and the engines agree on the contract.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let boot: BootstrapResult;
let unmount: (() => Promise<void>) | undefined;
beforeEach(async () => {
  resetPrefsForTests(); localStorage.clear(); installMediaStubs();
  boot = await bootstrap({ store: createMemoryStore(), courseId: 'honduras-es', features: { listen: true } });
});
afterEach(async () => { await unmount?.(); unmount = undefined; resetPrefsForTests(); localStorage.clear(); });

async function render(route: string) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AppProvider services={boot.services} user={boot.user!} course={boot.course!} session="ses-real">
        <MemoryRouter initialEntries={[route]}><Shell><AppRoutes /></Shell></MemoryRouter>
      </AppProvider>,
    );
  });
  await flush(12);
  unmount = async () => { await act(async () => root.unmount()); container.remove(); };
  return container;
}

const texts = async (): Promise<Text[]> => (await boot.services.store.texts.all()).filter((t) => t.lang === 'es');

describe('the UI over the real engines', () => {
  it('normal mode: Read says what is awaited, Scripture offers only the verified Spanish text, Home is not a dead end', async () => {
    const all = await texts();
    const published = all.filter((t) => t.published);
    expect(published.every((t) => t.kind === 'scripture')).toBe(true); // the bundle's state: only verified Scripture is published

    let page = await render('/read');
    // Read is shelf → book → chapters and Scripture the canon tree: rows are `.entrylist [role=listitem] a.entry` (they were `ul.list a`)
    expect(qa(page, '.entrylist [role="listitem"] a.entry')).toHaveLength(0);
    expect(q(page, '[data-testid="awaited"]')!.textContent).toContain('awaiting');
    await unmount!(); unmount = undefined;

    page = await render('/scripture');
    // only the first book with chapters is open by default, so: every chapter shown is a published text, and there is one
    const shown = qa<HTMLAnchorElement>(page, 'a.entry--chapter').map((a) => decodeURIComponent(a.getAttribute('href')!.replace(/^.*\/scripture\//, '')));
    expect(shown.length).toBeGreaterThan(0);
    for (const id of shown) expect(published.map((t) => t.id)).toContain(id);
    expect(published.length).toBeGreaterThan(0);
    await unmount!(); unmount = undefined;

    page = await render('/');
    const empty = q(page, '[data-testid="home-empty"]');
    const rows = qa(page, 'ul.list li');
    // either GoLearn offers a note, Home explains what is awaited, or Best next reads has something: never a blank "for you today"
    const best = q(page, '[data-testid="best-next"]'); // a Spanish Home with something ranked for the learner is not a dead end either
    expect(rows.length > 0 || !!empty || !!best).toBe(true);
    expect(page.textContent).not.toContain('Open a story to begin');
  });

  it('preview mode lists the unreviewed stories with reasons, and the whole reading flow works on real data', async () => {
    setPref('preview', true);
    const page = await render('/read');
    expect(q(page, '[data-testid="preview-banner"]')).not.toBeNull();
    const links = qa<HTMLAnchorElement>(page, '.entrylist [role="listitem"] a.entry'); // the open first shelf and book (was `ul.list a`)
    expect(links.length).toBeGreaterThan(0);
    expect(qa(page, 'ul.reasons').length).toBeGreaterThan(0);
    const story = (await texts()).find((t) => t.kind !== 'scripture')!;
    await unmount!(); unmount = undefined;

    const reader = await render(`/read/${encodeURIComponent(story.id)}`);
    expect(q(reader, 'article.reader')).not.toBeNull();
    // exact sentence text on screen, from the real importer's sentences
    const live = (await boot.services.store.sentences.where('textId', story.id)).filter((s) => !s.retiredInVersion).sort((a, b) => a.index - b.index);
    expect(qa(reader, '.sent-text').map((e) => e.textContent)).toEqual(live.map((s) => s.text));
    expect(q(reader, '[data-testid="reading-progress"]')!.textContent).toBe(`Seen 0 of ${live.length} sentences`);
    expect(q(reader, '[data-testid="vocabulary-coverage"]')!.textContent).toMatch(/shown \d+% · likely familiar \d+% \(estimate\) · met \d+% · new \d+%/);

    // tap a word: real GoLearn support + explanation
    await click(qa<HTMLButtonElement>(reader, 'button.tok')[0]);
    const sheet = q(reader, '[role="dialog"]')!;
    expect(sheet).not.toBeNull();
    expect(q(sheet, '[data-testid="word-why"]')!.textContent!.length).toBeGreaterThan(5);

    // "Understood" → a real ComprehensionReported event, completion moves, vocabulary wording stays separate
    await click(button(reader, 'Understood sentence 1'));
    const events = await boot.services.bus.history({ userId: boot.user!.id, types: ['ComprehensionReported'] });
    expect(events).toHaveLength(1);
    expect((events[0] as ComprehensionReported).degree).toBe('all');
    // a report is not a view: Seen stays 0, and "Understood" is the learner's own report
    expect(q(reader, '[data-testid="reading-progress"]')!.textContent).toBe(`Seen 0 of ${live.length} sentences · Understood 1 of ${live.length} (your report)`);

    // finish + "How much did you understand?"
    await click(button(reader, /finished reading/));
    await click(button(byLabel(reader, 'How much did you understand?'), 'Most'));
    expect(q(reader, '[data-testid="reading-progress"]')!.textContent).toBe(`Seen 0 of ${live.length} sentences · Understood 1 of ${live.length} (your report) · Finished (your mark)`);
    expect(q(reader, '[data-testid="reading-extras"]')!.textContent).toContain('you said you understood most of it');
    // finished with nothing seen: the reader explains why the two facts differ
    expect(q(reader, '[data-testid="reading-progress-why"]')!.textContent).toContain('so the two can differ');
  });

  it('Settings over the real adapters, importer report, and evidence audit', async () => {
    const page = await render('/settings');
    await click(button(byLabel(page, 'Advanced'), 'Advanced')); // the language-support table and the evidence audit are under Advanced
    const table = byLabel(page, 'Language support table');
    expect(qa(table, 'tbody tr')).toHaveLength(5);
    expect(table.textContent).toContain('seed words only'); // the adapters say lemmatization is seed-only
    expect(byLabel(page, 'Language support').textContent).toMatch(/limitations/i);
    // the list of texts is the real catalogue, with real reasons for what is held back
    const list = byLabel(page, 'Texts');
    expect(qa(list, 'tbody tr').length).toBeGreaterThanOrEqual((await boot.services.store.texts.count()) - 0);
    expect(list.textContent).toContain('not reviewed');
    await click(button(byLabel(page, 'Evidence'), 'Check evidence'));
    expect(q(page, '[data-testid="evidence-audit"]')!.textContent).toContain(`Rules ${boot.services.golearn.policyVersion}`);
    // speech: no provider, so the page says so
    expect(q(page, '[data-testid="speech-availability"]')!.getAttribute('data-available')).toBe('no');
    await check(byLabel<HTMLInputElement>(page, 'Preview unreviewed content'));
    expect(q(page, '[data-testid="preview-banner"]')).not.toBeNull();
  });

  it('Testimony over the real GoTell: autosave, restore after a remount, and a version with its private audio status', async () => {
    const page = await render('/testimony');
    const editor = byLabel<HTMLTextAreaElement>(page, 'Your testimony');
    expect(editor.readOnly).toBe(false);
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { set.call(editor, 'Yo creo en Dios.'); editor.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); editor.dispatchEvent(new FocusEvent('blur')); });
    await flush(12);
    const draft = await boot.services.store.drafts.get(`draft:${boot.user!.id}:es`);
    expect(draft!.text).toBe('Yo creo en Dios.');
    expect(q(page, '[data-testid="draft-status"]')!.textContent).toMatch(/^Saved /);

    await click(button(page, 'Save this version'));
    expect(page.textContent).toContain('Saved as version 1.');
    // saving a version kept the draft and did not break the next autosave
    await act(async () => { set.call(editor, 'Yo creo en Dios. Gracias.'); editor.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); editor.dispatchEvent(new FocusEvent('blur')); });
    await flush(12);
    expect((await boot.services.store.drafts.get(`draft:${boot.user!.id}:es`))!.text).toBe('Yo creo en Dios. Gracias.');
    expect(q(page, '[data-testid="draft-conflict"]')).toBeNull();
    // rehearsal audio for version 1: no provider ⇒ the honest state, and the label with its note about the editor
    const box = byLabel(page, 'Listen and rehearse');
    expect(box.textContent).toContain('Audio for version 1');
    expect(q(box, '[data-testid="draft-differs"]')).not.toBeNull();
    expect(q(box, '[data-testid="audio-unavailable"]')!.textContent).toContain('no speech provider is configured');
  });
});
