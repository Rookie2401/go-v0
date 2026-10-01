// @vitest-environment jsdom
// Your Books and the import flow. Uses: the REAL plain-text converter and the REAL EPUB reader (a tiny real EPUB built by tinyEpub in fixtures.ts), and the harness fake importer (validate / import).
import { afterEach, describe, expect, it } from 'vitest';
import type { PlainTextResult } from '../../src/ingest/plaintext';
import { SPANISH_STREAMS } from '../../src/course/spanish';
import { AppRoutes, Shell } from '../../src/ui/App';
import { STAYS_ON_DEVICE } from '../../src/ui/course/CopyImporter';
import { tinyEpub } from './fixtures';
import { button, byLabel, check, choose, click, flush, makeHarness, pickFiles, q, qa, type as typeInto } from './harness';
import type { Harness, Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;

const BOOK = ['Capítulo I', 'Había una vez un lobo.', '', 'Capítulo II', 'El lobo tenía hambre.'].join('\n');
const txt = (text: string, name = 'libro.txt') => new File([text], name, { type: 'text/plain' });
const CHAPTERS = [{ heading: 'Capítulo I', paragraphs: ['Había una vez un lobo.'] }, { heading: 'Capítulo II', paragraphs: ['El lobo tenía hambre.'] }];
const epub = (opts: Parameters<typeof tinyEpub>[1] = {}, name = 'cuentos.epub') => new File([tinyEpub(CHAPTERS, opts) as BlobPart], name, { type: 'application/epub+zip' });

async function books(h?: Harness) {
  const harness = h ?? await makeHarness({ streams: SPANISH_STREAMS });
  mounted = await harness.mount(app(), { router: '/books' });
  await flush(6);
  return harness;
}
const chooseFile = () => byLabel<HTMLInputElement>(mounted!.container, 'Choose a text file with the text of a book');

describe('Your Books: a book without a work', () => {
  it('says what it is, shows nothing yet, and offers the add form open', async () => {
    await books();
    expect(q(mounted!.container, '.topbar__title')!.textContent).toBe('Your Books');
    expect(q(mounted!.container, '[data-testid="books-empty"]')!.textContent).toBe('No books yet. Add one above.');
    expect(mounted!.container.textContent).toContain('stays on this device');
    expect(button(mounted!.container, 'Add a book').getAttribute('aria-expanded')).toBe('true');
  });

  it('.txt: title and author asked for, preview, explicit confirm, then the book is listed as "Your copy"', async () => {
    const h = await books();
    await pickFiles(chooseFile(), [txt(BOOK, 'mi-libro.txt')]);
    expect(h.controls.ingest.convertPlainText).not.toHaveBeenCalled(); // asks for a title first
    const titleInput = qa<HTMLInputElement>(mounted!.container, 'input[type="text"]').find((i) => i.value === 'mi-libro')!;
    await typeInto(titleInput, 'El lobo');
    await typeInto(qa<HTMLInputElement>(mounted!.container, 'input[type="text"]').find((i) => i.closest('label')?.textContent?.includes('Author'))!, 'Ana Rivas');
    await click(button(mounted!.container, 'Check this file'));
    expect(h.controls.ingest.convertPlainText.mock.calls[0][1]).toMatchObject({ lang: 'es', title: 'El lobo', author: 'Ana Rivas' });
    expect(h.controls.ingest.convertPlainText.mock.calls[0][1].work).toBeUndefined();
    expect(q(mounted!.container, '[data-testid="copy-count"]')!.textContent).toBe('2');
    expect(q(mounted!.container, '[data-testid="copy-preview"]')!.textContent).toContain(STAYS_ON_DEVICE);
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    await click(button(mounted!.container, 'Import 2 chapters'));
    expect(h.controls.ingest.import).toHaveBeenCalledTimes(1);
    await flush(4);
    const list = byLabel(mounted!.container, 'Your books');
    expect(list.textContent).toContain('El lobo');
    expect(q(list, '.work__copy-link')!.textContent).toBe('Your copy · 2 chapters');
  });

  it('cancel imports nothing', async () => {
    const h = await books();
    await pickFiles(chooseFile(), [txt(BOOK)]);
    await click(button(mounted!.container, 'Check this file'));
    await click(button(mounted!.container, 'Cancel'));
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    expect(q(mounted!.container, '[data-testid="books-empty"]')).not.toBeNull();
  });
});

describe('EPUB (a tiny real EPUB through the real reader)', () => {
  it('an unprotected EPUB goes through the same preview and confirm (read as bytes on this device, never uploaded)', async () => {
    const h = await books();
    await pickFiles(chooseFile(), [epub()]);
    await click(button(mounted!.container, 'Check this file'));
    expect(h.controls.ingest.convertEpub).toHaveBeenCalledTimes(1);
    const [bytes, opts] = h.controls.ingest.convertEpub.mock.calls[0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK'); // a zip, read as it is
    expect(opts).toMatchObject({ lang: 'es', title: 'cuentos' });
    expect(h.controls.ingest.convertPlainText).not.toHaveBeenCalled();
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    expect(q(mounted!.container, '[data-testid="copy-count"]')!.textContent).toBe('2');
    await click(button(mounted!.container, 'Import 2 chapters'));
    expect(h.controls.ingest.import).toHaveBeenCalledTimes(1);
    const docs = h.controls.ingest.import.mock.calls[0][0] as Array<{ sections: Array<{ paragraphs: Array<{ text: string }> }> }>;
    expect(docs.flatMap((d) => d.sections.flatMap((x) => x.paragraphs.map((p) => p.text)))).toEqual(['Había una vez un lobo.', 'El lobo tenía hambre.']);
  });

  it.each(['rights', 'encryption'] as const)('a protected EPUB (%s) is refused with the reader own message: nothing is checked or imported, and nothing offers a way around it', async (protectedBy) => {
    const h = await books();
    await pickFiles(chooseFile(), [epub({ protectedBy })]);
    await click(button(mounted!.container, 'Check this file'));
    const alert = q(mounted!.container, '[role="alert"]')!;
    expect(alert.textContent).toMatch(/protected/i);
    expect(alert.textContent).toContain('Go does not remove protection');
    expect(alert.textContent).toContain('Nothing was imported.');
    expect(h.controls.ingest.validate).not.toHaveBeenCalled();
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    expect(q(mounted!.container, '[data-testid="copy-preview"]')).toBeNull();
    expect(mounted!.container.textContent!.toLowerCase()).not.toMatch(/remove the protection|strip drm|bypass|crack/);
  });

  it('a file that is not an EPUB at all is reported the same way', async () => {
    const h = await books();
    await pickFiles(chooseFile(), [new File(['this is not a zip'], 'roto.epub', { type: 'application/epub+zip' })]);
    await click(button(mounted!.container, 'Check this file'));
    expect(q(mounted!.container, '[role="alert"]')!.textContent).toContain('This file is not an EPUB');
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
  });
});

/** Make the converter answer with a given quality report and headings (the document list is the real converter's). */
function scripted(h: Harness, extra: Partial<Pick<PlainTextResult, 'quality' | 'headings'>>) {
  const real = h.controls.ingest.convertPlainText.getMockImplementation()!;
  h.controls.ingest.convertPlainText.mockImplementation((text, opts) => ({ ...real(text, opts), ...extra }));
}

describe('what Go noticed in the text', () => {
  it('a damaged verdict is said plainly, each flag is listed with its sample, and the learner can still decide to import', async () => {
    const h = await books();
    scripted(h, { quality: { checkedWith: 'quality@1', verdict: 'damaged', flags: [
      { code: 'mojibake', severity: 'serious', count: 14, sample: 'Ã¡ y Ã±', message: 'Some accented letters were read with the wrong encoding.' },
      { code: 'page-numbers', severity: 'info', count: 1, message: 'Bare page numbers between paragraphs.' },
    ] } });
    await pickFiles(chooseFile(), [txt(BOOK)]);
    await click(button(mounted!.container, 'Check this file'));
    const quality = q(mounted!.container, '[data-testid="copy-quality"]')!;
    expect(quality.getAttribute('data-verdict')).toBe('damaged');
    expect(q(quality, '[data-testid="copy-quality-verdict"]')!.textContent).toContain('looks damaged');
    expect(q(quality, '[data-testid="copy-quality-verdict"]')!.textContent).toContain('the decision is yours');
    expect(q(quality, '[data-code="mojibake"]')!.textContent).toContain('serious: Some accented letters were read with the wrong encoding. (14 places)');
    expect(q(quality, '[data-code="mojibake"]')!.textContent).toContain('Ã¡ y Ã±');
    expect(q(quality, '[data-code="page-numbers"]')!.textContent).toContain('note:');
    expect(button(mounted!.container, 'Import 2 chapters').disabled).toBe(false); // a damaged personal copy is not blocked
    await click(button(mounted!.container, 'Import 2 chapters'));
    expect(h.controls.ingest.import).toHaveBeenCalledTimes(1);
  });

  it('the real quality check: mojibake in a real text is shown plainly with its sample, and an explicit confirm still imports it', async () => {
    const h = await books();
    const broken = ['Capítulo I', ...Array.from({ length: 6 }, () => 'La niÃ±a comiÃ³ pan y cafÃ© en el pueblo.')].join('\n');
    await pickFiles(chooseFile(), [txt(broken)]);
    await click(button(mounted!.container, 'Check this file'));
    const quality = q(mounted!.container, '[data-testid="copy-quality"]')!;
    expect(quality.getAttribute('data-verdict')).toBe('damaged');
    expect(q(quality, '[data-code="mojibake"]')!.getAttribute('data-severity')).toBe('serious');
    expect(q(quality, '[data-code="mojibake"]')!.textContent).toMatch(/Ã/); // the sample is shown as it is in the file
    expect(q(quality, '[data-testid="copy-quality-verdict"]')!.textContent).toContain('looks damaged');
    expect(h.controls.ingest.import).not.toHaveBeenCalled(); // nothing without the confirm
    await click(button(mounted!.container, 'Import 1 chapter'));
    expect(h.controls.ingest.import).toHaveBeenCalledTimes(1);
  });

  it('a clean text says nothing was found, and never claims to have fixed anything', async () => {
    await books();
    await pickFiles(chooseFile(), [txt(BOOK)]);
    await click(button(mounted!.container, 'Check this file'));
    const quality = q(mounted!.container, '[data-testid="copy-quality"]')!;
    expect(quality.textContent).toContain('Nothing wrong was found in the text.');
    expect(quality.textContent!.toLowerCase()).not.toMatch(/fixed|corrected|repaired/);
  });

  it('offers to join wrapped lines or leave out boilerplate only when the report found them, and passes the choice to the converter on "Check again"', async () => {
    const h = await books();
    scripted(h, { quality: { checkedWith: 'quality@1', verdict: 'usable', flags: [
      { code: 'hard-wrapped-lines', severity: 'warning', count: 80, message: 'Lines are wrapped at a fixed width.' },
      { code: 'boilerplate', severity: 'warning', count: 2, message: 'A licence header and footer surround the text.' },
    ] } });
    await pickFiles(chooseFile(), [txt(BOOK)]);
    await click(button(mounted!.container, 'Check this file'));
    expect(h.controls.ingest.convertPlainText.mock.calls[0][1].unwrap).toBeUndefined();
    await click(button(mounted!.container, 'Correct the chapters or the lines'));
    await check(byLabel<HTMLInputElement>(mounted!.container, 'Join wrapped lines'));
    await check(byLabel<HTMLInputElement>(mounted!.container, 'Leave out boilerplate'));
    await click(button(mounted!.container, 'Check again'));
    expect(h.controls.ingest.convertPlainText).toHaveBeenCalledTimes(2);
    expect(h.controls.ingest.convertPlainText.mock.calls[1][1]).toMatchObject({ unwrap: true, stripBoilerplate: true });
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    // with nothing wrapped and no boilerplate the controls are not even there
    await click(button(mounted!.container, 'Cancel'));
    h.controls.ingest.convertPlainText.mockClear();
  });

  it('chapter breaks can be corrected before importing: turn a detected heading off, or ask for one chapter, then check again', async () => {
    const h = await books();
    await pickFiles(chooseFile(), [txt(BOOK)]);
    await click(button(mounted!.container, 'Check this file'));
    const first = h.controls.ingest.convertPlainText.mock.results[0].value as PlainTextResult;
    expect(first.headings.map((x) => x.line)).toEqual([1, 4]);
    expect(q(mounted!.container, '[data-testid="copy-count"]')!.textContent).toBe('2');
    await click(button(mounted!.container, 'Correct the chapters or the lines'));
    expect(q(mounted!.container, '[data-testid="copy-correct"]')!.textContent).toContain('Capítulo II');
    await check(byLabel<HTMLInputElement>(mounted!.container, 'Heading on line 4: Capítulo II'), false);
    await click(button(mounted!.container, 'Check again'));
    expect(h.controls.ingest.convertPlainText.mock.calls[1][1].headings).toEqual([1]); // the corrected list, as line numbers
    expect(q(mounted!.container, '[data-testid="copy-count"]')!.textContent).toBe('1');
    // or one chapter only
    await choose(byLabel<HTMLSelectElement>(mounted!.container, 'How chapters are found'), 'none');
    await click(button(mounted!.container, 'Check again'));
    expect(h.controls.ingest.convertPlainText.mock.calls.at(-1)![1].chapters).toBe('none');
    expect(h.controls.ingest.import).not.toHaveBeenCalled(); // all of this changed nothing on the device
  });
});

describe('the converter never changes the words the learner sees in the preview', () => {
  it('the documents handed to the importer carry the book\'s own lines, exactly', async () => {
    const h = await books();
    await pickFiles(chooseFile(), [txt(BOOK)]);
    await click(button(mounted!.container, 'Check this file'));
    await click(button(mounted!.container, 'Import 2 chapters'));
    const docs = h.controls.ingest.import.mock.calls[0][0] as Array<{ sections: Array<{ paragraphs: Array<{ text: string }> }> }>;
    expect(docs.flatMap((d) => d.sections.flatMap((s) => s.paragraphs.map((p) => p.text)))).toEqual(['Había una vez un lobo.', 'El lobo tenía hambre.']);
  });
});
