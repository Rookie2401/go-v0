// @vitest-environment jsdom
// Uses fakes: the catalogue's paged work search is scripted where a test needs 500 works (a fake catalogue); elsewhere it is the real catalogue's
// over the works of the memory store (the real Spanish manifest plus works a test seeds). The library is the harness's in-memory index.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Work, WorkRights } from '../../src/core';
import { ids } from '../../src/core';
import { SPANISH_COURSE_ID, SPANISH_SHELVES, SPANISH_STREAMS, SPANISH_WORKS } from '../../src/course/spanish';
import { AppRoutes, Shell } from '../../src/ui/App';
import { stateRightsLine } from '../../src/ui/course/wording';
import { button, byLabel, choose, click, flush, makeHarness, pickFiles, q, qa, type as typeInto } from './harness';
import type { Harness, Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;

const RIGHTS: WorkRights = {
  state: 'rights-unverified', copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true, canModify: false, canStoreOffline: false,
  canBundleAudio: false, audiobook: 'unknown', verified: false,
};
const work = (n: number, over: Partial<Work> = {}): Work => ({
  id: ids.work(SPANISH_COURSE_ID, `test-${n}`), courseId: SPANISH_COURSE_ID, lang: 'es', stageId: ids.stage(SPANISH_COURSE_ID, 's2'), role: 'subsidiary', order: 10_000 + n,
  title: `Obra de prueba ${n}`, purpose: [], rights: RIGHTS, bibliographyVerified: false, streams: ['library'], ...over,
});

async function explore(opts: { route?: string; works?: Work[]; fake?: boolean } = {}): Promise<Harness> {
  const h = await makeHarness({ streams: SPANISH_STREAMS });
  await h.store.stages.bulkPut(SPANISH_SHELVES);
  if (opts.works) await h.store.works.bulkPut(opts.works);
  mounted = await h.mount(app(), { router: opts.route ?? '/explore' });
  await flush(8);
  return h;
}

/** A fake catalogue of N works: findWorks pages over them and records every call. */
function fakeCatalogue(h: Harness, total: number) {
  const all = Array.from({ length: total }, (_, i) => work(i + 1));
  const findWorks = vi.fn(async (q: { offset?: number; limit?: number; text?: string; stageId?: string; stream?: string; domain?: string; variety?: string; rights?: string }) => {
    const rows = q.text ? all.filter((w) => w.title.toLowerCase().includes(q.text!.toLowerCase())) : all;
    const offset = q.offset ?? 0;
    return { total: rows.length, items: rows.slice(offset, offset + (q.limit ?? 30)) };
  });
  h.services.catalog = { ...h.services.catalog, findWorks: findWorks as never };
  return findWorks;
}

describe('Explore: paging', () => {
  it('a catalogue of 500 works renders one page of 20, and Next / Previous move by a page', async () => {
    const h = await makeHarness({ streams: SPANISH_STREAMS });
    const findWorks = fakeCatalogue(h, 500);
    mounted = await h.mount(app(), { router: '/explore' });
    await flush(8);
    expect(qa(mounted.container, '[data-work]')).toHaveLength(20);
    expect(q(mounted.container, '[data-testid="explore-range"]')!.textContent).toBe('Showing 1–20 of 500');
    expect(findWorks.mock.calls.every((c) => (c[0].limit ?? 0) <= 20)).toBe(true); // never more than a page asked for
    expect(button(mounted.container, 'Previous').disabled).toBe(true);
    await click(button(mounted.container, 'Next'));
    expect(qa(mounted.container, '[data-work]')).toHaveLength(20);
    expect(q(mounted.container, '[data-testid="explore-range"]')!.textContent).toBe('Showing 21–40 of 500');
    expect(qa(mounted.container, '[data-work]')[0].getAttribute('data-work')).toBe(work(21).id);
    expect(findWorks.mock.calls.at(-1)![0]).toMatchObject({ offset: 20, limit: 20 });
    await click(button(mounted.container, 'Previous'));
    expect(q(mounted.container, '[data-testid="explore-range"]')!.textContent).toBe('Showing 1–20 of 500');
  });

  it('the last page is short and Next is off', async () => {
    const h = await makeHarness({ streams: SPANISH_STREAMS });
    fakeCatalogue(h, 45);
    mounted = await h.mount(app(), { router: '/explore' });
    await flush(8);
    await click(button(mounted.container, 'Next'));
    await click(button(mounted.container, 'Next'));
    expect(qa(mounted.container, '[data-work]')).toHaveLength(5);
    expect(q(mounted.container, '[data-testid="explore-range"]')!.textContent).toBe('Showing 41–45 of 45');
    expect(button(mounted.container, 'Next').disabled).toBe(true);
  });
});

describe('Explore: search, shelves and filters', () => {
  it('search matches title and author through the catalogue and starts again from the first page', async () => {
    const h = await makeHarness({ streams: SPANISH_STREAMS });
    const findWorks = fakeCatalogue(h, 300);
    mounted = await h.mount(app(), { router: '/explore' });
    await flush(8);
    await click(button(mounted.container, 'Next'));
    await typeInto(byLabel<HTMLInputElement>(mounted.container, 'Search the catalogue'), 'prueba 7');
    await click(button(mounted.container, 'Search'));
    expect(findWorks.mock.calls.at(-1)![0]).toMatchObject({ text: 'prueba 7', offset: 0 });
    expect(qa(mounted.container, '[data-work]').length).toBeGreaterThan(0);
    for (const w of qa(mounted.container, '[data-work]')) expect(w.textContent!.toLowerCase()).toContain('prueba 7');
    await typeInto(byLabel<HTMLInputElement>(mounted.container, 'Search the catalogue'), 'nothing like this');
    await click(button(mounted.container, 'Search'));
    expect(q(mounted.container, '[data-testid="explore-empty"]')!.textContent).toBe('No works match these choices.');
  });

  it('shelves are an orientation: pressing one narrows the list, pressing it again clears it, and none is disabled', async () => {
    const h = await makeHarness({ streams: SPANISH_STREAMS });
    const findWorks = fakeCatalogue(h, 30);
    await h.store.stages.bulkPut(SPANISH_SHELVES);
    mounted = await h.mount(app(), { router: '/explore' });
    await flush(8);
    const shelves = byLabel(mounted.container, 'Shelves');
    expect(qa(shelves, 'button')).toHaveLength(SPANISH_SHELVES.length + 1);
    expect(qa<HTMLButtonElement>(shelves, 'button').some((b) => b.disabled)).toBe(false);
    expect(mounted.container.textContent).toContain('Shelves, not locks');
    await click(button(shelves, 'Early readers'));
    expect(findWorks.mock.calls.at(-1)![0]).toMatchObject({ stageId: ids.stage(SPANISH_COURSE_ID, 's1') });
    expect(button(shelves, 'Early readers').getAttribute('aria-pressed')).toBe('true');
    await click(button(shelves, 'Early readers'));
    expect(findWorks.mock.calls.at(-1)![0].stageId).toBeUndefined();
  });

  it('quiet filters (stream, variety, rights) sit behind a disclosure and narrow the catalogue request; the listening stream is not offered', async () => {
    const h = await makeHarness({ streams: SPANISH_STREAMS });
    const findWorks = fakeCatalogue(h, 30);
    mounted = await h.mount(app(), { router: '/explore' });
    await flush(8);
    const filters = button(mounted.container, 'Filters');
    expect(filters.getAttribute('aria-expanded')).toBe('false');
    await click(filters);
    const stream = byLabel<HTMLSelectElement>(mounted.container, 'Stream');
    expect(qa(stream, 'option').map((o) => o.textContent)).not.toContain('Listen');
    await choose(stream, 'honduras');
    await choose(byLabel<HTMLSelectElement>(mounted.container, 'Variety'), 'es-HN');
    await choose(byLabel<HTMLSelectElement>(mounted.container, 'Rights'), 'prohibited-from-bundling');
    expect(findWorks.mock.calls.at(-1)![0]).toMatchObject({ stream: 'honduras', variety: 'es-HN', rights: 'prohibited-from-bundling', offset: 0 });
  });

  it('a door page starts from the door\'s own filter (domain, stream, or the shelves it covers)', async () => {
    const h = await makeHarness({ streams: SPANISH_STREAMS });
    const findWorks = fakeCatalogue(h, 5);
    mounted = await h.mount(app(), { router: '/explore/history' });
    await flush(8);
    expect(findWorks.mock.calls.at(-1)![0]).toMatchObject({ domain: 'history' });
    expect(q(mounted.container, '.topbar__title')!.textContent).toBe('History');
    await mounted.unmount();

    mounted = await h.mount(app(), { router: '/explore/honduras' });
    await flush(8);
    expect(findWorks.mock.calls.at(-1)![0]).toMatchObject({ stream: 'honduras' });
    expect(q(mounted.container, 'select[aria-label="Stream"]')).toBeNull(); // the door already says which stream
    await mounted.unmount();

    mounted = await h.mount(app(), { router: '/explore/classics' });
    await flush(8);
    const stageIds = findWorks.mock.calls.slice(-3).map((c) => c[0].stageId ?? (c[0] as { stageId?: string }).stageId);
    expect(new Set(stageIds)).toEqual(new Set(['s5', 's6', 's7'].map((k) => ids.stage(SPANISH_COURSE_ID, k))));
  });

  it('an empty door says so honestly instead of showing a blank page; an unknown door goes to Explore', async () => {
    const h = await makeHarness({ streams: SPANISH_STREAMS });
    h.services.catalog = { ...h.services.catalog, findWorks: async () => ({ total: 0, items: [] }) };
    mounted = await h.mount(app(), { router: '/explore/theology' });
    await flush(8);
    expect(q(mounted.container, '[data-testid="explore-empty"]')!.textContent).toBe('Nothing here yet. This fills as texts are added.');
    await mounted.unmount();
    mounted = await h.mount(app(), { router: '/explore/no-such-door' });
    await flush(8);
    expect(q(mounted.container, '.topbar__title')!.textContent).toBe('Explore');
  });
});

describe('Explore: rights lines never claim more than the data says', () => {
  it('each state has its own plain line, and "public domain" needs a verification on record', () => {
    const line = (over: Partial<WorkRights>) => stateRightsLine({ rights: { ...RIGHTS, ...over } });
    expect(line({ state: 'verified-public-domain', verified: true, verifiedBy: 'the course editor', jurisdiction: 'United States' })).toBe('Public domain (verified by the course editor). Where this applies: United States.');
    expect(line({ state: 'verified-public-domain', verified: false })).not.toMatch(/^Public domain/); // recorded but nobody verified it
    expect(line({ state: 'verified-public-domain', verified: true })).not.toMatch(/^Public domain/); // no verifier named
    expect(line({ state: 'verified-open-licence', verified: true, verifiedBy: 'the editor', licensing: 'CC BY 4.0' })).toBe('Open licence: CC BY 4.0 (verified by the editor).');
    expect(line({ state: 'verified-open-licence', verified: false })).toContain('no verification is on record');
    expect(line({ state: 'course-authored' })).toBe('Written for this course.');
    expect(line({ state: 'recommended-only' })).toBe('A recommendation. Go does not supply the text; read it from your own copy.');
    expect(line({ state: 'user-supplied' })).toBe('Your own copy. It stays on this device.');
    expect(line({ state: 'rights-unverified' })).toBe('Rights not verified — not bundled. Read it from your own copy.');
    expect(line({ state: 'prohibited-from-bundling', copyrightStatus: 'in-copyright' })).toBe('In copyright — read it from your own copy.');
    expect(line({ state: 'prohibited-from-bundling', copyrightStatus: 'unknown' })).toBe('Not bundled — read it from your own copy.'); // "in copyright" only if the record says so
  });

  it('every work of the real Spanish manifest, rendered page by page, says "public domain" only where a verification is on record', async () => {
    const verified = SPANISH_WORKS.filter((w) => w.rights.state === 'verified-public-domain');
    for (const w of verified) expect(w.rights.verified && !!w.rights.verifiedBy).toBe(true); // the data itself records who verified it
    const h = await makeHarness({ streams: SPANISH_STREAMS });
    await h.store.works.bulkPut(SPANISH_WORKS);
    await h.store.stages.bulkPut(SPANISH_SHELVES);
    mounted = await h.mount(app(), { router: '/explore' });
    await flush(8);
    const seen = new Map<string, string>();
    for (let page = 0; page < 20; page++) {
      for (const el of qa(mounted.container, '[data-work]')) seen.set(el.getAttribute('data-work')!, q(el, '[data-testid="rights-line"]')!.textContent!);
      const next = button(mounted.container, 'Next');
      if (next.disabled) break;
      await click(next);
    }
    for (const [id, line] of seen) {
      const w = SPANISH_WORKS.find((x) => x.id === id);
      if (!w) continue; // a work the real install added beyond this file's list
      if (w.rights.state === 'verified-public-domain') expect(line.startsWith("Public domain (verified by ")).toBe(true);
      else expect(line.toLowerCase()).not.toContain('public domain');
    }
    expect(seen.size).toBeGreaterThanOrEqual(SPANISH_WORKS.length);
    expect(new Set([...seen.values()].filter((l) => !/^Public domain/.test(l))).size).toBeGreaterThan(0);
  });

  it('shows region and era when known, and the work\'s own state line', async () => {
    const h = await explore({ works: [work(1, { title: 'Zzyzx libro', author: 'Autora Uno', region: 'Cuba', era: '19th century', rights: { ...RIGHTS, state: 'prohibited-from-bundling', copyrightStatus: 'in-copyright' } })] });
    await typeInto(byLabel<HTMLInputElement>(mounted!.container, 'Search the catalogue'), 'zzyzx');
    await click(button(mounted!.container, 'Search'));
    const el = q(mounted!.container, `[data-work="${work(1).id}"]`)!;
    expect(el).not.toBeNull();
    expect(q(el, '[data-testid="work-where"]')!.textContent).toBe('Cuba · 19th century');
    expect(el.textContent).toContain('Autora Uno');
    expect(q(el, '[data-testid="rights-line"]')!.textContent).toBe('In copyright — read it from your own copy.');
    void h;
  });
});

describe('Explore: reading and adding your copy', () => {
  it('a work with no text offers "Add your copy"; a .txt with Spanish chapter headings becomes chapters under it, after the confirm', async () => {
    const w = work(1, { title: 'Zzyzx libro' });
    const h = await explore({ works: [w] });
    await typeInto(byLabel<HTMLInputElement>(mounted!.container, 'Search the catalogue'), 'zzyzx');
    await click(button(mounted!.container, 'Search'));
    const el = () => q(mounted!.container, `[data-work="${w.id}"]`)!;
    expect(q(el(), '[data-testid="work-actions"] a')).toBeNull();
    await click(button(el(), 'Add your copy'));
    const input = byLabel<HTMLInputElement>(el(), `Choose your copy of ${w.title}`);
    const book = ['Capítulo I', 'Había una vez un lobo.', 'Capítulo II', 'El lobo tenía hambre.'].join('\n');
    await pickFiles(input, [new File([book], 'libro.txt', { type: 'text/plain' })]);
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    expect(q(el(), '[data-testid="copy-count"]')!.textContent).toBe('2');
    await click(button(el(), 'Import 2 chapters'));
    expect(h.controls.ingest.import).toHaveBeenCalledTimes(1);
    await flush(4);
    expect(q(el(), '.work__copy-link')!.textContent).toBe('Your copy · 2 chapters');
  });

  it('chapters the library holds are read through the library (import on open), and a work written for the course offers no "add your copy"', async () => {
    const lib = [{ id: 'text:es:test-1-ch1', title: 'Zzyzx libro — Capítulo 1', workId: work(1).id, chapter: 1 }, { id: 'text:es:test-1-ch2', title: 'Zzyzx libro — Capítulo 2', workId: work(1).id, chapter: 2 }];
    const { catalogText } = await import('./harness');
    const h = await makeHarness({ streams: SPANISH_STREAMS, library: lib.map((t) => catalogText({ ...t, stream: 'library' })) });
    await h.store.stages.bulkPut(SPANISH_SHELVES);
    await h.store.works.bulkPut([work(1, { title: 'Zzyzx libro', ingestion: 'ingested' }), work(2, { title: 'Zzyzx curso', ingestion: 'bundled', rights: { ...RIGHTS, state: 'course-authored', verified: true, verifiedBy: 'course authors' } })]);
    mounted = await h.mount(app(), { router: '/explore' });
    await flush(8);
    await typeInto(byLabel<HTMLInputElement>(mounted.container, 'Search the catalogue'), 'zzyzx');
    await click(button(mounted.container, 'Search'));
    const course = q(mounted.container, `[data-work="${work(2).id}"]`)!;
    expect(qa(course, 'button').map((b) => b.textContent)).not.toContain('Add your copy');
    expect(q(course, '[data-testid="rights-line"]')!.textContent).toBe('Written for this course.');

    const read = button(q(mounted.container, `[data-work="${work(1).id}"]`)!, 'Read · 2 chapters');
    await click(read);
    expect(h.library.opened).toEqual(['text:es:test-1-ch1']);
  });
});
