// @vitest-environment jsdom
// Uses: the REAL package-D converter (USE_REAL_CONVERTER in the harness) and the real catalogue; the importer itself
// (validate / import) is the harness fake, which writes a Text row for a personal copy with its workId and chapter.
import { afterEach, describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { Work } from '../../src/core';
import { THAI_COURSE_ID, THAI_STAGES, THAI_WORKS } from '../../src/course';
import { AppRoutes, Shell } from '../../src/ui/App';
import { STAYS_ON_DEVICE } from '../../src/ui/course/CopyImporter';
import { button, byLabel, click, makeHarness, pickFiles, q, qa, type as typeInto } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;

const SLUG = 'an-an-an';
const WORK = THAI_WORKS.find((w) => w.id === ids.work(THAI_COURSE_ID, SLUG)) as Work;
const workEl = () => q(mounted!.container, `[data-work="${WORK.id}"]`)!;
const BOOK = ['บทที่ ๑', 'ฉันรักแม่', '', 'บทที่ ๒', 'แม่รักฉัน', 'ฉันไปโรงเรียน'].join('\n');
const txt = (text: string, name = 'book.txt') => new File([text], name, { type: 'text/plain' });

async function openAdd(h: Awaited<ReturnType<typeof makeHarness>>, router = '/course') {
  mounted = await h.mount(app(), { router });
  await click(button(workEl(), 'Add your copy'));
  return byLabel<HTMLInputElement>(workEl(), `Choose your copy of ${WORK.title}`);
}

describe('adding a personal copy to a work', () => {
  it('.txt → conversion → preview with what was found → explicit confirm → the chapters appear under the work', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    const input = await openAdd(h);
    expect(workEl().textContent).toContain(STAYS_ON_DEVICE);
    await pickFiles(input, [txt(BOOK)]);

    // converted from the exact text, for this work
    expect(h.controls.ingest.convertPlainText).toHaveBeenCalledTimes(1);
    const [text, opts] = h.controls.ingest.convertPlainText.mock.calls[0];
    expect(text).toBe(BOOK);
    expect(opts).toMatchObject({ lang: 'th', work: { id: WORK.id } });
    // checked, not imported
    expect(h.controls.ingest.validate).toHaveBeenCalledTimes(1);
    expect((h.controls.ingest.validate.mock.calls[0][0] as unknown[]).length).toBe(2);
    expect(h.controls.ingest.import).not.toHaveBeenCalled();

    const preview = q(workEl(), '[data-testid="copy-preview"]')!;
    expect(preview.textContent).toContain(STAYS_ON_DEVICE);
    expect(q(preview, '[data-testid="copy-count"]')!.textContent).toBe('2');
    expect(q(preview, '[data-testid="copy-problems"]')!.textContent).toBe('none');
    expect(q(preview, '[data-testid="copy-coverage"]')!.textContent).toContain('50%');
    expect(q(preview, '[data-testid="copy-readable"]')!.textContent).toContain('Yes');
    expect(q(preview, '[data-testid="copy-notes"]')!.textContent).toContain('2 chapters found');
    expect(await h.services.catalog.textsOf(WORK.id)).toHaveLength(0);

    await click(button(preview, 'Import 2 chapters'));
    expect(h.controls.ingest.import).toHaveBeenCalledTimes(1);
    expect(q(workEl(), '[data-testid="copy-done"]')!.textContent).toBe('Imported 2 chapters.');
    const texts = await h.services.catalog.textsOf(WORK.id);
    expect(texts.map((t) => t.chapter?.index)).toEqual([1, 2]);
    expect(texts.every((t) => t.personalCopy)).toBe(true);
    // the ladder now shows the copy
    expect(q(workEl(), '.work__copy-link')!.textContent).toBe('Your copy · 2 chapters');
  });

  it('the note about the copy is passed to the converter', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    const input = await openAdd(h);
    await typeInto(q<HTMLInputElement>(workEl(), 'input[type="text"]')!, 'my paperback, 12th printing');
    await pickFiles(input, [txt(BOOK)]);
    expect(h.controls.ingest.convertPlainText.mock.calls[0][1]).toMatchObject({ copyNote: 'my paperback, 12th printing' });
  });

  it('cancel imports nothing and leaves no chapters', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    const input = await openAdd(h);
    await pickFiles(input, [txt(BOOK)]);
    expect(q(workEl(), '[data-testid="copy-preview"]')).not.toBeNull();
    await click(button(workEl(), 'Cancel'));
    expect(q(workEl(), '[data-testid="copy-preview"]')).toBeNull();
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    expect(await h.services.catalog.textsOf(WORK.id)).toHaveLength(0);
    expect(q(workEl(), '[data-testid="work-copy"]')).toBeNull();
  });

  it('findings from the validator block the import and are shown with their path and how to fix them', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    h.controls.ingest.validate.mockImplementation(async (docs: unknown[]) => docs.map((d) => ({
      id: (d as { id: string }).id, action: 'valid' as const,
      issues: [{ path: 'sections[0]', code: 'empty-sentence', message: 'a sentence is empty', hint: 'Remove the empty line.', severity: 'error' as const }],
    })));
    const input = await openAdd(h);
    await pickFiles(input, [txt(BOOK)]);
    const preview = q(workEl(), '[data-testid="copy-preview"]')!;
    expect(q(preview, '[data-testid="copy-problems"]')!.textContent).toBe('2 errors, 0 warnings');
    expect(q(preview, '[data-testid="copy-readable"]')!.textContent).toContain('No');
    expect(preview.textContent).toContain('How to fix: Remove the empty line.'); // the report opens by itself when there are errors
    expect(button(preview, 'Import 2 chapters').disabled).toBe(true);
    expect(q(preview, '[data-testid="copy-blocked"]')).not.toBeNull();
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
  });

  it('a held-back copy says so instead of promising it is readable', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    h.controls.ingest.validate.mockImplementation(async (docs: unknown[]) => docs.map((d) => ({
      id: (d as { id: string }).id, action: 'valid' as const, issues: [], published: false, unpublishedReasons: ['Awaiting native-speaker review.'],
    })));
    const input = await openAdd(h);
    await pickFiles(input, [txt(BOOK)]);
    expect(q(workEl(), '[data-testid="copy-readable"]')!.textContent).toContain('held back');
    expect(q(workEl(), '[data-testid="copy-readable"]')!.textContent).toContain('Awaiting native-speaker review.');
  });

  it('an empty file and an unreadable .json are reported, and nothing is checked or imported', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    const input = await openAdd(h);
    await pickFiles(input, [txt('   \n', 'empty.txt')]);
    expect(q(workEl(), '[role="alert"]')!.textContent).toBe('That file is empty.');
    await pickFiles(input, [new File(['{ nope'], 'x.json', { type: 'application/json' })]);
    expect(q(workEl(), '[role="alert"]')!.textContent).toContain('not valid JSON');
    expect(h.controls.ingest.validate).not.toHaveBeenCalled();
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
  });

  it('a .json file goes through the same preview and confirm', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    const input = await openAdd(h);
    const doc = { id: 'an-an-an-ch01', title: 'อ่าน อาน อ๊าน', lang: 'th', source: { rights: 'personal-copy' }, work: { slug: SLUG, courseId: THAI_COURSE_ID, chapter: { index: 1 } } };
    await pickFiles(input, [new File([JSON.stringify(doc)], 'ch1.json', { type: 'application/json' })]);
    expect(h.controls.ingest.convertPlainText).not.toHaveBeenCalled();
    expect(q(workEl(), '[data-testid="copy-count"]')!.textContent).toBe('1');
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    await click(button(workEl(), 'Import 1 document'));
    expect((await h.services.catalog.textsOf(WORK.id)).length).toBe(1);
  });

  it('the stage of the work is open by default only when it is the current stage, and the importer is reachable by keyboard (a real disclosure)', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    mounted = await h.mount(app(), { router: '/course' });
    const add = button(workEl(), 'Add your copy');
    expect(add.getAttribute('aria-expanded')).toBe('false');
    expect(qa(workEl(), 'input[type="file"]')).toHaveLength(0); // not even mounted until opened
    await click(add);
    expect(add.getAttribute('aria-expanded')).toBe('true');
    expect(add.getAttribute('aria-controls')).toBeTruthy();
    expect(THAI_STAGES[0].id).toBe(WORK.stageId);
  });
});

describe('Settings → Content accepts a .txt without a work', () => {
  it('asks for a title, shows the preview, imports only after the confirm, and the text is a free-standing copy', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    mounted = await h.mount(app(), { router: '/settings' });
    const content = byLabel(mounted.container, 'Content');
    await click(button(content, 'Add a book from a text file'));
    await pickFiles(byLabel<HTMLInputElement>(content, 'Choose a text file with the text of a book'), [txt(BOOK, 'my-novel.txt')]);
    // asks for a title (prefilled from the file name); nothing converted yet
    const titleInput = qa<HTMLInputElement>(content, 'input[type="text"]').find((i) => i.value === 'my-novel')!;
    expect(h.controls.ingest.convertPlainText).not.toHaveBeenCalled();
    await typeInto(titleInput, 'My novel');
    await click(button(content, 'Check this file'));
    const opts = h.controls.ingest.convertPlainText.mock.calls[0][1];
    expect(opts).toMatchObject({ lang: 'th', title: 'My novel' });
    expect(opts.work).toBeUndefined();
    expect(q(content, '[data-testid="copy-preview"]')!.textContent).toContain(STAYS_ON_DEVICE);
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    await click(button(content, 'Import 2 chapters'));
    expect(h.controls.ingest.import).toHaveBeenCalledTimes(1);
    const imported = (await h.store.texts.all()).filter((t) => t.personalCopy);
    expect(imported.map((t) => t.workId)).toEqual([undefined, undefined]);
    expect(imported.every((t) => t.title.startsWith('My novel'))).toBe(true);
  });

  it('the existing JSON importer is untouched', async () => {
    const h = await makeHarness();
    mounted = await h.mount(app(), { router: '/settings' });
    const content = byLabel(mounted.container, 'Content');
    expect(byLabel<HTMLInputElement>(content, 'Choose text files to import').getAttribute('accept')).toBe('.json,application/json');
  });
});

describe('fix batch 1: the importer panel', () => {
  it('says "stays on this device" once at a time (the form, then the preview), never twice', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    const input = await openAdd(h);
    const count = () => (workEl().textContent!.match(/This stays on this device/g) ?? []).length;
    expect(count()).toBe(1);
    await pickFiles(input, [txt(BOOK)]);
    expect(count()).toBe(1);
    expect(q(workEl(), '[data-testid="copy-preview"]')!.textContent).toContain(STAYS_ON_DEVICE);
  });

  it('at 100% the preview and the report say every word has an analysis; below it, the percentage sentence stays', async () => {
    const h = await makeHarness({ courseId: THAI_COURSE_ID });
    const full = async (docs: unknown[]) => docs.map((d) => ({ id: (d as { id: string }).id, action: 'valid' as const, issues: [], published: true, analysisCoverage: 1 }));
    h.controls.ingest.validate.mockImplementation(full);
    const input = await openAdd(h);
    await pickFiles(input, [txt(BOOK)]);
    expect(q(workEl(), '[data-testid="copy-coverage"]')!.textContent).toBe('Every word has an analysis.');
    expect(workEl().textContent).not.toContain('100%');
    await click(button(workEl(), 'Cancel'));
    h.controls.ingest.validate.mockImplementation(async (docs: unknown[]) => docs.map((d) => ({ id: (d as { id: string }).id, action: 'valid' as const, issues: [], published: true, analysisCoverage: 0.83 })));
    await pickFiles(input, [txt(BOOK)]);
    expect(q(workEl(), '[data-testid="copy-coverage"]')!.textContent).toBe('83% have an analysis; the rest show “not analysed yet”.');
  });
});
