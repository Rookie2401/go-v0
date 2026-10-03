// @vitest-environment jsdom
// Uses: the real createCourseCatalog (h.catalogIsReal, falling back to the harness fake only while package E is a stub), the
// real THAI manifest, a fake GoLearn (stageReadiness / readingPace scripted), a memory lexicon.
import { afterEach, describe, expect, it } from 'vitest';
import type { LanguageAdapter, TextCompleted } from '../../src/core';
import { ids } from '../../src/core';
import { THAI_COURSE_ID, THAI_STAGES, THAI_WORKS } from '../../src/course';
import { createMemoryLexiconSource } from '../../src/dict';
import { AppRoutes, Shell } from '../../src/ui/App';
import { rightsLine } from '../../src/ui/course/wording';
import { button, byLabel, choose, click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import { seedChapter } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;
const thai = (opts: Parameters<typeof makeHarness>[0] = {}) => makeHarness({ ...opts, courseId: THAI_COURSE_ID });
const stageId = (key: string) => ids.stage(THAI_COURSE_ID, key);
const workId = (slug: string) => ids.work(THAI_COURSE_ID, slug);
const stageEl = (key: string) => q(mounted!.container, `[data-stage="${stageId(key)}"]`)!;
const stageButton = (key: string) => q<HTMLButtonElement>(stageEl(key), '.disclosure__btn')!;
const openStage = async (key: string) => { if (stageButton(key).getAttribute('aria-expanded') !== 'true') await click(stageButton(key)); };
const workEl = (slug: string) => q(mounted!.container, `[data-work="${workId(slug)}"]`)!;

describe('the reading ladder page', () => {
  it('renders every stage of the real manifest, the current one open and the rest collapsed', async () => {
    const h = await thai();
    mounted = await h.mount(app(), { router: '/course' });
    const stages = qa(mounted.container, '[data-stage]');
    expect(stages.map((s) => s.getAttribute('data-stage'))).toEqual(THAI_STAGES.map((s) => s.id));
    // The first stage whose verdict is not "ready to advance" (the fake says "insufficient data" everywhere): Stage 0.
    expect(stageButton('0').getAttribute('aria-expanded')).toBe('true');
    expect(stageButton('g1').getAttribute('aria-expanded')).toBe('false');
    expect(stageButton('g1').getAttribute('aria-controls')).toBeTruthy();
    expect(stageButton('0').textContent).toContain(THAI_STAGES[0].label);
    expect(q(mounted.container, '[data-testid="current-stage"]')!.textContent).toBe(THAI_STAGES[0].label);
    // the works of Stage 0, spine first, in groups
    const first = THAI_WORKS.filter((w) => w.stageId === stageId('0'));
    expect(qa(stageEl('0'), '[data-work]').map((e) => e.getAttribute('data-work'))).toHaveLength(first.length);
    expect(qa(stageEl('0'), '.stage__group-head')[0].textContent).toBe('Main reading');
    expect(q(stageEl('0'), '[data-group="spine"] [data-work]')!.getAttribute('data-work')).toBe(workId('an-an-an'));
    // a collapsed stage does not render its works until it is opened
    expect(qa(stageEl('g1'), '[data-work]')).toHaveLength(0);
    await openStage('g1');
    expect(qa(stageEl('g1'), '[data-work]').length).toBe(THAI_WORKS.filter((w) => w.stageId === stageId('g1')).length);
  });

  it('shows the stage band and purpose when stated, and never a lock, a badge or a percentage on the stage list', async () => {
    const h = await thai();
    mounted = await h.mount(app(), { router: '/course' });
    const withBand = THAI_STAGES.find((s) => s.band)!;
    expect(stageButton(withBand.key).textContent).toContain(withBand.band!);
    await openStage('0');
    expect(stageEl('0').textContent).toContain(THAI_STAGES[0].purpose[0]);
    const list = q(mounted.container, '.course__stages')!;
    expect(list.textContent).not.toMatch(/\d\s?%/);
    expect(list.textContent!.toLowerCase()).not.toMatch(/locked|unlock|badge|score|level up/);
    expect(qa(list, '[disabled], [aria-disabled="true"]')).toHaveLength(0);
  });

  it('gives every work one rights line, and none of them says "public domain" for data nobody verified', async () => {
    const h = await thai();
    mounted = await h.mount(app(), { router: '/course' });
    for (const s of THAI_STAGES) await openStage(s.key);
    const lines = qa(mounted.container, '[data-testid="rights-line"]').map((e) => e.textContent!);
    expect(lines).toHaveLength(THAI_WORKS.length);
    for (const l of lines) expect(l.toLowerCase()).not.toContain('public domain');
    expect(lines).toContain('In copyright (presumed, not verified). Read it from your own copy.');
    expect(lines).toContain('Rights not researched. Read it from your own copy.');
    // every one of them points at the learner's own copy, and says that nothing was verified
    for (const l of lines.filter((x) => !x.startsWith('A listening recommendation'))) expect(l).toContain('Read it from your own copy.');
  });

  it('the rights wording only claims what the data says', () => {
    const base = THAI_WORKS[0].rights;
    expect(rightsLine({ ...base, copyrightStatus: 'public-domain', verified: false })).not.toMatch(/public domain/i);
    expect(rightsLine({ ...base, copyrightStatus: 'licensed', verified: false })).toContain('has not been verified');
    expect(rightsLine({ ...base, copyrightStatus: 'public-domain', verified: true })).toContain('Public domain (checked against a source).');
    expect(rightsLine({ ...base, copyrightStatus: 'in-copyright', verified: true })).toContain('In copyright (checked against a source).');
    expect(rightsLine({ ...base, copyrightStatus: 'public-domain', verified: true, userImportOnly: false, canBundle: true })).not.toContain('your own copy');
  });

  it('shows the varieties a work uses as chips (never "standard"), the author, and the purpose', async () => {
    const h = await thai();
    mounted = await h.mount(app(), { router: '/course' });
    const verse = THAI_WORKS.find((w) => w.registers?.includes('archaic'))!;
    await openStage(verse.stageId.split(':').pop()!);
    const chips = qa(workEl(verse.id.split(':').pop()!), '.work__chips .chip').map((c) => c.textContent);
    expect(chips).toContain('older language');
    expect(chips).not.toContain('standard');
    const authored = THAI_WORKS.find((w) => w.author && w.registers?.includes('standard') && w.registers.length > 1)!;
    await openStage(authored.stageId.split(':').pop()!);
    const el = workEl(authored.id.split(':').pop()!);
    expect(el.textContent).toContain(authored.author!);
    expect(el.textContent).toContain(authored.purpose[0]);
    expect(qa(el, '.work__chips .chip').map((c) => c.textContent)).not.toContain('standard');
  });
});

describe('the stage the learner is working at', () => {
  it('"Change" picks a stage, it persists, and that stage opens by itself next time', async () => {
    const h = await thai();
    mounted = await h.mount(app(), { router: '/course' });
    const status = byLabel(mounted.container, 'Your stage');
    expect(button(status, 'Change').getAttribute('aria-expanded')).toBe('false');
    await click(button(status, 'Change'));
    expect(button(status, 'Change').getAttribute('aria-expanded')).toBe('true');
    await choose(q<HTMLSelectElement>(status, 'select')!, stageId('g2'));
    expect(q(mounted.container, '[data-testid="current-stage"]')!.textContent).toBe('Grade 2');
    expect(stageButton('g2').getAttribute('aria-expanded')).toBe('true');
    expect(stageButton('0').getAttribute('aria-expanded')).toBe('false');
    expect((await h.services.catalog.currentStage('u1', THAI_COURSE_ID))?.id).toBe(stageId('g2'));
    await mounted.unmount();
    mounted = await h.mount(app(), { router: '/course' });
    expect(q(mounted.container, '[data-testid="current-stage"]')!.textContent).toBe('Grade 2');
    expect(stageButton('g2').getAttribute('aria-expanded')).toBe('true');
  });

  it('"How is this going?" is collapsed, asks nothing until opened, and with too little reading says so in plain words', async () => {
    const h = await thai();
    mounted = await h.mount(app(), { router: '/course' });
    const going = button(mounted.container, 'How is this going?');
    expect(going.getAttribute('aria-expanded')).toBe('false');
    h.learn.stageReadiness.mockClear(); // the catalogue itself asked once, to pick the current stage
    expect(h.learn.stageReadiness).not.toHaveBeenCalled();
    await click(going);
    expect(going.getAttribute('aria-expanded')).toBe('true');
    expect(h.learn.stageReadiness).toHaveBeenCalledWith('u1', THAI_COURSE_ID, stageId('0'));
    const panel = q(mounted.container, '[data-testid="readiness"]')!;
    expect(panel.textContent).toContain('Not enough reading here yet');
    expect(q(panel, '[data-signal="lexical-coverage"]')!.textContent).toContain('not enough reading yet');
    expect(q(panel, '[data-signal="listening"]')!.textContent).toContain('not available');
    expect(panel.textContent).toContain('advice');
    expect(panel.textContent).toContain('Not enough timed reading yet');
    expect(q(panel, '.going__signals')!.textContent!.toLowerCase()).not.toMatch(/locked|badge|score/); // the signals themselves; the closing note says nothing is locked
  });

  it('shows met and not-yet signals with their own explanations, and the pace as a rough figure, not a target', async () => {
    const h = await thai({
      learn: {
        stageReadiness: {
          verdict: 'stay', explanation: 'Keep reading at this stage for now.',
          signals: [
            { key: 'lookup-rate', status: 'met', target: '4 or fewer per 100 words', explanation: '3 lookups per 100 words over your last 300 sentences.' },
            { key: 'retention', status: 'not-met', target: '85 % without help', explanation: '70 of 100 words came back without help.' },
          ],
        },
        pace: { wordsPerMinute: 41.6, sentences: 80, lookupsPer100Words: 3, rescuesPer100Sentences: 2.5, trend: 'faster' },
      },
    });
    mounted = await h.mount(app(), { router: '/course' });
    await click(button(mounted.container, 'How is this going?'));
    const panel = q(mounted.container, '[data-testid="readiness"]')!;
    expect(q(panel, '[data-signal="lookup-rate"]')!.textContent).toContain('met');
    expect(q(panel, '[data-signal="lookup-rate"]')!.textContent).toContain('3 lookups per 100 words over your last 300 sentences.');
    expect(q(panel, '[data-signal="retention"]')!.textContent).toContain('not yet');
    expect(q(panel, '[data-testid="pace"]')!.textContent).toContain('About 42 words a minute');
    expect(q(panel, '[data-testid="pace"]')!.textContent).toContain('not a target');
  });
});

describe('a learner\'s own copy on the ladder', () => {
  it('"Your copy · n chapters" links to the first chapter not yet finished, and each chapter carries the canonical progress line', async () => {
    const h = await thai();
    const w = workId('an-an-an');
    const [c1, c2] = [await seedChapter(h.store, w, 1), await seedChapter(h.store, w, 2), await seedChapter(h.store, w, 3)];
    await h.bus.emit<TextCompleted>({ type: 'TextCompleted', userId: 'u1', lang: 'th', surface: 'corpus', session: 's0', dedupeKey: 'done:c1', textId: c1.id });
    mounted = await h.mount(app(), { router: '/course' });
    const link = q<HTMLAnchorElement>(workEl('an-an-an'), '[data-testid="work-copy"] .work__copy-link')!;
    expect(link.textContent).toBe('Your copy · 3 chapters');
    expect(link.getAttribute('href')).toBe(`/read/${encodeURIComponent(c2.id)}`);
    await click(button(workEl('an-an-an'), 'Chapters'));
    const lines = qa(workEl('an-an-an'), '[data-testid="chapter-progress"]').map((e) => e.textContent);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Finished');
    expect(lines[1]).toContain('Seen 0 of 1 sentences');
    // a work without a copy has no such line
    expect(q(workEl('pet-hai'), '[data-testid="work-copy"]')).toBeNull();
  });

  it('chapters that are not published stay out of the count and the page says why', async () => {
    const h = await thai();
    const w = workId('an-an-an');
    await seedChapter(h.store, w, 1);
    await seedChapter(h.store, w, 2, { published: false });
    mounted = await h.mount(app(), { router: '/course' });
    expect(q(workEl('an-an-an'), '.work__copy-link')!.textContent).toBe('Your copy · 1 chapter');
    expect(q(workEl('an-an-an'), '[data-testid="work-held"]')!.textContent).toContain('1 chapter is not shown');
  });
});

describe('Home, Read and Settings around the ladder', () => {
  it('a course with a ladder gets a "Reading ladder" door showing the stage; a course without one has none and /course goes home', async () => {
    const t = await thai();
    mounted = await t.mount(app());
    const door = qa(mounted.container, 'a.home__entry').find((a) => a.getAttribute('href') === '/course')!;
    expect(door.textContent).toContain('Reading ladder');
    expect(door.textContent).toContain(THAI_STAGES[0].label);
    await mounted.unmount();

    const es = await makeHarness();
    mounted = await es.mount(app());
    expect(qa(mounted.container, 'a').some((a) => a.getAttribute('href') === '/course')).toBe(false);
    expect(mounted.container.textContent).not.toContain('Reading ladder');
    await mounted.unmount();
    mounted = await es.mount(app(), { router: '/course' });
    expect(q(mounted.container, '.home__title')!.textContent).toBe('Go'); // redirected home
    expect(mounted.container.textContent).not.toContain('Reading ladder');
  });

  it('Read lists the learner\'s copies grouped by work, in chapter order, labelled "Your copy"', async () => {
    const h = await thai();
    const w = workId('an-an-an');
    await seedChapter(h.store, w, 2);
    await seedChapter(h.store, w, 1);
    mounted = await h.mount(app(), { router: '/read' });
    // Read is now shelf → book → chapters (src/ui/read): the copies are the books of the shelf "Your books" (they were a section per work
    // headed "Your copy · 2 chapters"); the book says "2 chapters" and each chapter row carries the chip "Your copy".
    const shelf = q(mounted.container, '[data-group="personal"]')!;
    expect(q(shelf, ':scope > button .lib__title')!.textContent).toBe('Your books');
    const group = q(shelf, `[data-group="b:p:w:${w}"]`)!;
    expect(q(group, '.lib__title')!.textContent).toBe(THAI_WORKS.find((x) => x.id === w)!.title);
    expect(q(group, '.lib__meta')!.textContent).toBe('2 chapters');
    // the only shelf and its only book are open by default
    expect(q(group, ':scope > button.lib__head')!.getAttribute('aria-expanded')).toBe('true');
    const rows = qa(group, '.entrylist [role="listitem"] a.entry');
    expect(rows.map((e) => `${q(e, '.entry__num')!.textContent}|${q(e, '.entry__native')!.textContent}`)).toEqual(['Chapter 1|ตอนที่ 1', 'Chapter 2|ตอนที่ 2']);
    for (const r of rows) expect(qa(r, '.entry__badges .chip').map((c) => c.textContent)).toEqual(['Your copy']);
  });

  it('Read for a course without a ladder is unchanged (grouped by corpus only)', async () => {
    const es = await makeHarness();
    await (await import('./fixtures')).seedStory(es.store);
    mounted = await es.mount(app(), { router: '/read' });
    // Read is now shelf → book: with no work anywhere, texts are books per corpus (they were one section per corpus), all on one shelf
    expect(qa(mounted.container, '[data-group^="b:w:"]')).toHaveLength(0);
    expect(qa(mounted.container, '.lib__group--1')).toHaveLength(1);
    expect(qa(mounted.container, '.lib__group--3').map((g) => g.getAttribute('data-group'))).toEqual(['b:c:ci-es']);
  });

  it('Settings → Language support says per language whether a dictionary is installed', async () => {
    const h = await thai();
    const adapter = (lang: 'th' | 'es') => ({ lang, support: { tokenization: 'limited', sentenceSegmentation: 'limited', lemmatization: 'seed-only', morphology: 'none', phraseDetection: 'none', productionChecks: 'none', limitations: [] } }) as unknown as LanguageAdapter;
    h.services.adapters = { get: () => { throw new Error('unused'); }, all: () => [adapter('th'), adapter('es')] };
    h.services.lexicon = (lang) => (lang === 'th'
      ? createMemoryLexiconSource('th', [], { attribution: 'Wiktionary via kaikki.org, CC BY-SA 4.0', entries: 123456, builtAt: '2026-09-30T10:00:00.000Z' })
      : { ...createMemoryLexiconSource(lang, []), info: async () => undefined });
    mounted = await h.mount(app(), { router: '/settings' });
    await click(button(byLabel(mounted.container, 'Advanced'), 'Advanced'));
    expect(q(mounted.container, '[data-testid="dictionary-th"]')!.textContent).toBe('Wiktionary via kaikki.org, CC BY-SA 4.0 · 123,456 entries · built 2026-09-30');
    expect(q(mounted.container, '[data-testid="dictionary-es"]')!.textContent).toBe('No dictionary installed: words outside the built-in list show as not analysed');
  });
});

describe('the services', () => {
  it('the harness catalogue answers for the Thai ladder (real catalogue when package E has landed)', async () => {
    const h: Harness = await thai();
    expect((await h.services.catalog.stages(THAI_COURSE_ID)).map((s) => s.id)).toEqual(THAI_STAGES.map((s) => s.id));
    expect(await h.services.catalog.stages('honduras-es')).toEqual([]);
    expect(h.catalogIsReal).toBe(true);
  });
});

describe('fix batch 1', () => {
  it('a listening work says it is a recommendation of audio Go does not supply, and offers no import', async () => {
    const h = await thai();
    mounted = await h.mount(app(), { router: '/course' });
    const audio = THAI_WORKS.filter((w) => w.role === 'audio');
    expect(audio.length).toBeGreaterThan(0);
    for (const s of new Set(audio.map((w) => w.stageId.split(':').pop()!))) await openStage(s);
    for (const w of audio) {
      const el = workEl(w.id.split(':').pop()!);
      expect(q(el, '[data-testid="rights-line"]')!.textContent).toBe('A listening recommendation. Go does not supply the audio.');
      expect(qa(el, 'input[type="file"]')).toHaveLength(0);
      expect(qa(el, 'button').map((b) => b.textContent)).not.toContain('Add your copy');
      expect(el.textContent).not.toContain('Read it from your own copy');
    }
    // a book still has its import control and its rights basis disclosure
    const book = THAI_WORKS.find((w) => w.role !== 'audio' && w.stageId === audio[0].stageId)!;
    expect(button(workEl(book.id.split(':').pop()!), /Add (or replace )?your copy/)).toBeDefined();
  });

  it('the stage selector appears only after "Change" is pressed, and closes after a choice', async () => {
    const h = await thai();
    mounted = await h.mount(app(), { router: '/course' });
    const status = byLabel(mounted.container, 'Your stage');
    const pick = q<HTMLElement>(status, '.stage-status__pick')!;
    expect(pick.hidden).toBe(true);
    expect(button(status, 'Change').getAttribute('aria-expanded')).toBe('false');
    await click(button(status, 'Change'));
    expect(pick.hidden).toBe(false);
    expect(button(status, 'Change').getAttribute('aria-expanded')).toBe('true');
    expect(button(status, 'Change').getAttribute('aria-controls')).toBe(pick.id);
    await choose(q<HTMLSelectElement>(status, 'select')!, stageId('g1'));
    expect(q<HTMLElement>(status, '.stage-status__pick')!.hidden).toBe(true);
    expect(button(status, 'Change').getAttribute('aria-expanded')).toBe('false');
  });
});
