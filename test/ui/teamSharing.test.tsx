// @vitest-environment jsdom
/**
 * GoRead team sharing, the UI side: Settings → Team sharing (server address, kept on this device, a health check; no code) and
 * Team Texts (fetch, share a book, share what was just imported). The library under it (client, sync, sharing) is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Text } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { recordTeamImport } from '../../src/ui/goread/TeamTexts';
import { getPref, setPref } from '../../src/ui/prefs';
import { button, byLabel, click, flush, makeHarness, pickFiles, q, qa, type as typeInto } from './harness';
import type { Harness, Mounted } from './harness';

const m = vi.hoisted(() => ({
  health: vi.fn(),
  createTeamClient: vi.fn(),
  fetchTeamTexts: vi.fn(),
  shareBook: vi.fn(),
  shareableText: vi.fn(),
}));
vi.mock('../../src/goread/client', () => ({ createTeamClient: m.createTeamClient }));
vi.mock('../../src/goread/sync', () => ({ fetchTeamTexts: m.fetchTeamTexts, shareBook: m.shareBook }));
vi.mock('../../src/goread/sharing', () => ({ shareableText: m.shareableText }));

let h: Harness;
let mounted: Mounted | undefined;
const client = { health: m.health };
beforeEach(async () => {
  m.health.mockReset(); m.createTeamClient.mockReset(); m.fetchTeamTexts.mockReset(); m.shareBook.mockReset(); m.shareableText.mockReset();
  m.createTeamClient.mockReturnValue(client);
  m.shareableText.mockResolvedValue({ ok: true });
  h = await makeHarness(); // resets the prefs, so a server is set after this, per test
});
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const open = async (router: string) => { mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router }); return mounted; };
const useServer = () => { setPref('teamServer', 'https://team.example.org/api'); };
const storedPrefs = () => JSON.parse(localStorage.getItem('go-v0:prefs') ?? '{}') as { teamServer?: string; teamCode?: string };
const listSection = () => byLabel(mounted!.container, 'Team texts');
const addSection = () => byLabel(mounted!.container, 'Add a text');
const json = (o: unknown, name: string) => new File([JSON.stringify(o)], name, { type: 'application/json' });

const textRow = (over: Partial<Text> & { id: string; title: string }): Text => ({
  corpusId: 'ci-es', lang: 'es', kind: 'story', sourceId: 'src:team', importedAt: '2026-05-04T10:00:00.000Z', tags: [], editorialTags: [], prepTargets: [],
  reviewStatus: 'unreviewed', published: false, unpublishedReasons: ['Awaiting native-speaker review.'], schemaVersion: 2, generated: false, transformations: [], contentVersion: 1, ...over,
});
const view = (id: string) => ({ id, action: 'created' as const, issues: [] });

/** Two books on the shelf: "Mi libro" (two chapters) and "Un cuento". */
async function seedShelf() {
  await h.store.texts.bulkPut([
    textRow({ id: 'text:es:libro-1', title: 'Mi libro — Uno', sourceId: 'src:libro', chapter: { index: 1 } }),
    textRow({ id: 'text:es:libro-2', title: 'Mi libro — Dos', sourceId: 'src:libro', chapter: { index: 2 } }),
    textRow({ id: 'text:es:cuento', title: 'Un cuento', sourceId: 'src:cuento' }),
  ]);
  await recordTeamImport(h.store, 'es', [view('libro-1'), view('libro-2'), view('cuento')], 'Ana', '2026-05-04T10:00:00.000Z');
}

describe('Settings → Team sharing', () => {
  it('is a section right after "You", in the nav too, with its note and an empty-server line', async () => {
    await open('/settings');
    const sec = byLabel(mounted!.container, 'Team sharing');
    expect(sec.getAttribute('data-settings-section')).toBe('team-sharing');
    expect(q(sec, 'h2.section-head')!.textContent).toBe('Team sharing');
    expect(sec.textContent).toContain("Your team's server holds the texts the team added. Anyone with the app can join any team, read its texts and add to them; a text once added stays. The address is kept on this device.");
    const order = qa(mounted!.container, '[data-settings-section]').map((s) => s.getAttribute('data-settings-section'));
    expect(order.indexOf('team-sharing')).toBe(order.indexOf('you') + 1);
    expect(qa(byLabel(mounted!.container, 'Settings sections'), 'button').map((b) => b.textContent)).toContain('Team sharing');
    expect(byLabel<HTMLInputElement>(sec, 'Team server address').placeholder).toBe('https://…');
    expect(q(sec, '[aria-label="Team code"]')).toBeNull(); // no code: the team is the course
    expect(q(sec, 'input[type="password"]')).toBeNull();
    expect(button(sec, 'Check the server').disabled).toBe(true);
    expect(sec.textContent).toContain('No team server set. Team Texts stays on this device.');
  });

  it('typing an address keeps it in the preferences on this device (and stores no code)', async () => {
    await open('/settings');
    const sec = byLabel(mounted!.container, 'Team sharing');
    await typeInto(byLabel<HTMLInputElement>(sec, 'Team server address'), 'https://team.example.org');
    expect(getPref('teamServer')).toBe('https://team.example.org');
    expect(storedPrefs()).toMatchObject({ teamServer: 'https://team.example.org' });
    expect(storedPrefs().teamCode).toBeUndefined();
    expect(button(sec, 'Check the server').disabled).toBe(false);
    expect(sec.textContent).not.toContain('No team server set.');
  });

  it('"Check the server" shows the answer', async () => {
    useServer();
    m.health.mockResolvedValue({ ok: true });
    await open('/settings');
    const sec = byLabel(mounted!.container, 'Team sharing');
    await click(button(sec, 'Check the server'));
    expect(m.createTeamClient).toHaveBeenCalledWith({ baseUrl: 'https://team.example.org/api' });
    expect(q(sec, '[role="status"]')!.textContent).toBe('The team server answers.');
    expect(q(sec, '[role="alert"]')).toBeNull();
  });

  it('"Check the server" shows the error, whether the server refuses or cannot be reached', async () => {
    useServer();
    m.health.mockRejectedValueOnce(new Error('The team server did not answer.'));
    await open('/settings');
    const sec = byLabel(mounted!.container, 'Team sharing');
    await click(button(sec, 'Check the server'));
    expect(q(sec, '[role="alert"]')!.textContent).toBe('The team server did not answer.');
    expect(q(sec, '[role="status"]')).toBeNull();

    m.health.mockResolvedValueOnce({ ok: false, message: 'The server is not a team server.' });
    await click(button(sec, 'Check the server'));
    expect(q(sec, '[role="alert"]')!.textContent).toBe('The server is not a team server.');
  });
});

describe('Team Texts without a team server', () => {
  it('says how to set one, and offers no fetch or share', async () => {
    await seedShelf();
    await open('/team-texts');
    expect(mounted!.container.textContent).toContain('To share texts with your team on other devices, set a team server in Settings → Team sharing.');
    expect(qa(mounted!.container, 'button').some((b) => (b.textContent ?? '').includes('Fetch team texts'))).toBe(false);
    expect(qa(listSection(), 'li.work[data-book]')).toHaveLength(2);
    expect(qa(listSection(), 'button').some((b) => /^Share /.test(b.getAttribute('aria-label') ?? ''))).toBe(false);
    expect(m.shareableText).not.toHaveBeenCalled();
  });
});

describe('Team Texts with a team server: fetching', () => {
  it('shows the host and fetches with the app\'s importer and the course; then the counts', async () => {
    useServer();
    let release!: () => void;
    m.fetchTeamTexts.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ fetched: 5, imported: 3, skipped: 2, failed: [] }); }));
    await open('/team-texts');
    expect(q(mounted!.container, '[data-testid="team-server-line"]')!.textContent).toContain('Team server: team.example.org');
    expect(m.createTeamClient).toHaveBeenCalledWith({ baseUrl: 'https://team.example.org/api' });
    expect(mounted!.container.textContent).not.toContain('set a team server in Settings');

    await click(button(mounted!.container, 'Fetch team texts'));
    expect(m.fetchTeamTexts).toHaveBeenCalledTimes(1);
    const opts = m.fetchTeamTexts.mock.calls[0][0] as { client: unknown; course: string; lang: string; store: unknown; ingest: unknown; recordTeamImport: unknown };
    expect(opts.client).toBe(client);
    expect(opts.course).toBe('honduras-es');
    expect(opts.lang).toBe('es');
    expect(opts.store).toBe(h.store);
    expect(opts.ingest).toBe(h.controls.ingest);
    expect(opts.recordTeamImport).toBe(recordTeamImport);
    expect(button(mounted!.container, 'Fetching…').disabled).toBe(true);

    release();
    await flush(); // let the promise settle inside act
    const status = q(q(mounted!.container, '[data-testid="team-server-line"]')!, '[role="status"]')!;
    expect(status.textContent).toBe('3 new texts fetched, 2 already here.');
    expect(button(mounted!.container, 'Fetch team texts').disabled).toBe(false);
  });

  it('a fetched text shows up on the shelf (the page refreshes after the fetch)', async () => {
    useServer();
    m.fetchTeamTexts.mockImplementation(async () => {
      await h.store.texts.put(textRow({ id: 'text:es:remoto', title: 'Un texto remoto', sourceId: 'src:remoto' }));
      await recordTeamImport(h.store, 'es', [view('remoto')], 'Berta', '2026-06-01T10:00:00.000Z');
      return { fetched: 1, imported: 1, skipped: 0, failed: [] };
    });
    await open('/team-texts');
    expect(qa(listSection(), 'li.work[data-book]')).toHaveLength(0);
    await click(button(mounted!.container, 'Fetch team texts'));
    const rows = qa(listSection(), 'li.work[data-book]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Un texto remoto');
    expect(rows[0].textContent).toContain('Added by Berta');
    expect(q(q(mounted!.container, '[data-testid="team-server-line"]')!, '[role="status"]')!.textContent).toBe('1 new text fetched, 0 already here.');
  });

  it('says so when one text could not be added, and shows an error when the fetch fails', async () => {
    useServer();
    m.fetchTeamTexts.mockResolvedValueOnce({ fetched: 2, imported: 1, skipped: 0, failed: [{ id: 'x', message: 'x is not valid.' }] });
    await open('/team-texts');
    await click(button(mounted!.container, 'Fetch team texts'));
    const line = q(mounted!.container, '[data-testid="team-server-line"]')!;
    expect(q(line, '[role="status"]')!.textContent).toBe('1 new text fetched, 0 already here.');
    expect(q(line, '[role="alert"]')!.textContent).toContain('x is not valid.');

    m.fetchTeamTexts.mockRejectedValueOnce(new Error('The team server could not be reached.'));
    await click(button(mounted!.container, 'Fetch team texts'));
    expect(q(line, '[role="alert"]')!.textContent).toBe('The team server could not be reached.');
    expect(q(line, '[role="status"]')).toBeNull();
  });
});

describe('Team Texts with a team server: sharing a book', () => {
  it('a book row offers "Share … with the team" and sends its text ids with the learner\'s name', async () => {
    useServer();
    await seedShelf();
    m.shareBook.mockResolvedValue({ shared: ['text:es:libro-1', 'text:es:libro-2'], refused: [] });
    await open('/team-texts');
    const book = qa(listSection(), 'li.work[data-book]').find((r) => (r.textContent ?? '').includes('Mi libro'))!;
    await click(button(book, 'Share Mi libro with the team'));
    expect(m.shareBook).toHaveBeenCalledTimes(1);
    expect(m.shareBook).toHaveBeenCalledWith({
      client, course: 'honduras-es', store: h.store, textIds: ['text:es:libro-1', 'text:es:libro-2'], addedBy: 'Test learner',
    });
    expect(q(book, '[role="status"]')!.textContent).toBe('Shared with the team.');
    // the other book is untouched
    const other = qa(listSection(), 'li.work[data-book]').find((r) => (r.textContent ?? '').includes('Un cuento'))!;
    expect(q(other, '[role="status"]')).toBeNull();
  });

  it('shows the refusal, and an error when the server fails', async () => {
    useServer();
    await seedShelf();
    m.shareBook.mockResolvedValueOnce({ shared: [], refused: [{ id: 'text:es:cuento', reason: 'Someone else shared this text first.' }] });
    await open('/team-texts');
    const cuento = () => qa(listSection(), 'li.work[data-book]').find((r) => (r.textContent ?? '').includes('Un cuento'))!;
    await click(button(cuento(), 'Share Un cuento with the team'));
    expect(q(cuento(), '[role="alert"]')!.textContent).toBe('Someone else shared this text first.');
    expect(q(cuento(), '[role="status"]')).toBeNull();

    m.shareBook.mockRejectedValueOnce(new Error('The team server did not answer.'));
    await click(button(cuento(), 'Share Un cuento with the team'));
    expect(q(cuento(), '[role="alert"]')!.textContent).toBe('The team server did not answer.');
  });

  it('says how many were already on the team\'s shelf, as part of the status line', async () => {
    useServer();
    await seedShelf();
    const cuento = () => qa(listSection(), 'li.work[data-book]').find((r) => (r.textContent ?? '').includes('Un cuento'))!;
    const libro = () => qa(listSection(), 'li.work[data-book]').find((r) => (r.textContent ?? '').includes('Mi libro'))!;
    m.shareBook.mockResolvedValueOnce({ shared: ['text:es:libro-2'], alreadyThere: ['text:es:libro-1'], refused: [] });
    await open('/team-texts');
    await click(button(libro(), 'Share Mi libro with the team'));
    expect(q(libro(), '[role="status"]')!.textContent).toBe("Shared with the team. 1 already on the team's shelf.");
    expect(q(libro(), '[role="alert"]')).toBeNull();

    m.shareBook.mockResolvedValueOnce({ shared: [], alreadyThere: ['text:es:cuento'], refused: [] });
    await click(button(cuento(), 'Share Un cuento with the team'));
    expect(q(cuento(), '[role="status"]')!.textContent).toBe("1 already on the team's shelf.");
    expect(q(cuento(), '[role="alert"]')).toBeNull();
  });

  it('a book that may not be shared shows why instead of a button', async () => {
    useServer();
    await seedShelf();
    m.shareableText.mockImplementation(async (_store: unknown, t: Text) => (t.id === 'text:es:cuento'
      ? { ok: false, reason: 'This text is your own copy of a published work, so it cannot be shared.' }
      : { ok: true }));
    await open('/team-texts');
    const cuento = qa(listSection(), 'li.work[data-book]').find((r) => (r.textContent ?? '').includes('Un cuento'))!;
    expect(q(cuento, 'span.work__noshare')!.textContent).toBe('This text is your own copy of a published work, so it cannot be shared.');
    expect(qa(cuento, 'button')).toHaveLength(0);
    const libro = qa(listSection(), 'li.work[data-book]').find((r) => (r.textContent ?? '').includes('Mi libro'))!;
    expect(q(libro, 'span.work__noshare')).toBeNull();
    expect(button(libro, 'Share Mi libro with the team')).toBeTruthy();
    // the verdict is asked of the first chapter of each book
    expect(m.shareableText.mock.calls.map((c) => (c[1] as Text).id).sort()).toEqual(['text:es:cuento', 'text:es:libro-1']);
  });
});

describe('Team Texts with a team server: sharing what was just imported', () => {
  it('after a local import the same texts are offered, and one tap sends their ids', async () => {
    useServer();
    m.shareBook.mockResolvedValue({ shared: ['text:es:my-story'], refused: [] });
    await open('/team-texts');
    expect(q(mounted!.container, '[data-testid="team-share-offer"]')).toBeNull();
    await pickFiles(byLabel<HTMLInputElement>(addSection(), 'Choose text files to import'), [json({ id: 'my-story', title: 'My story' }, 'my-story.json')]);
    await click(button(addSection(), 'Import 1 document'));
    expect(h.controls.ingest.import).toHaveBeenCalledTimes(1);

    const offer = q(mounted!.container, '[data-testid="team-share-offer"]')!;
    expect(offer.textContent).toContain('Share these 1 text with the team?');
    expect(m.shareBook).not.toHaveBeenCalled(); // nothing is sent without a tap
    await click(button(offer, 'Share with the team'));
    expect(m.shareBook).toHaveBeenCalledWith({ client, course: 'honduras-es', store: h.store, textIds: ['text:es:my-story'], addedBy: 'Test learner' });
    expect(q(offer, '[role="status"]')!.textContent).toBe('Shared with the team.');
    expect(qa(offer, 'button')).toHaveLength(0); // sent: the question is answered
  });

  it('is not offered when no server is set', async () => {
    await open('/team-texts');
    await pickFiles(byLabel<HTMLInputElement>(addSection(), 'Choose text files to import'), [json({ id: 'my-story', title: 'My story' }, 'my-story.json')]);
    await click(button(addSection(), 'Import 1 document'));
    expect(q(mounted!.container, '[data-testid="team-share-offer"]')).toBeNull();
    expect(qa(mounted!.container, 'button').some((b) => (b.textContent ?? '') === 'Share with the team')).toBe(false);
  });
});
