/**
 * Opening a local file in the controlled reader. The rule that matters: the repo's own EPUB reader
 * (`src/ingest/epub.ts`) runs FIRST, and it refuses protected files (`EpubError('encrypted')`: META-INF/encryption.xml
 * naming content documents, rights.xml, encrypted zip entries). A refused file is never handed to the renderer —
 * `deps.render` is not called, so no iframe is created and no byte of a protected book is laid out. Nothing here
 * decrypts, strips or works around protection; nothing is uploaded.
 *
 * The same module is the fallback path: when the rendering library cannot open a file the repo's reader can read, the
 * plain-text chapters from `readEpub` are shown instead (and `.txt` files go the same way).
 */
import { EpubError, readEpub, type EpubBook, type EpubChapter } from '../../../src/ingest/epub';

export type { EpubBook, EpubChapter };

export type OpenResult<T> =
  | { status: 'refused'; message: string }
  | { status: 'unreadable'; code: EpubError['code']; message: string }
  | { status: 'rendered'; view: T; book: EpubBook }
  | { status: 'fallback'; book: EpubBook; message: string };

export interface OpenDeps<T> {
  /** The rendering library: called only for a file that `readEpub` accepted. */
  render(bytes: Uint8Array): Promise<T>;
}

export async function openLocalEpub<T>(bytes: Uint8Array, deps: OpenDeps<T>): Promise<OpenResult<T>> {
  let book: EpubBook;
  try {
    book = await readEpub(bytes);
  } catch (err) {
    if (err instanceof EpubError) {
      return err.code === 'encrypted'
        ? { status: 'refused', message: err.message }
        : { status: 'unreadable', code: err.code, message: err.message };
    }
    return { status: 'unreadable', code: 'damaged', message: 'This file could not be read as an EPUB.' };
  }
  try {
    return { status: 'rendered', view: await deps.render(bytes), book };
  } catch {
    return { status: 'fallback', book, message: 'The page renderer could not open this book; its text is shown as plain paragraphs instead.' };
  }
}

/** A plain-text file as a one-chapter book for the fallback renderer. Paragraphs are lines. */
export function plainTextBook(text: string, title = 'Text'): EpubBook {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  return { title, chapters: [{ text: lines.join('\n') }], notes: ['Plain text: one paragraph per line.'] };
}

/**
 * The fallback renderer: one chapter at a time as plain paragraphs in the given container (no iframe, no pagination).
 * Returns the number of chapters. Text goes in through `textContent`, never `innerHTML`.
 */
export function renderChapterPlain(container: HTMLElement, chapters: EpubChapter[], index: number, dir: 'ltr' | 'rtl' = 'ltr'): number {
  const chapter = chapters[Math.max(0, Math.min(index, chapters.length - 1))];
  container.replaceChildren();
  container.dir = dir;
  const article = container.ownerDocument.createElement('article');
  for (const line of chapter ? chapter.text.split('\n') : []) {
    const p = container.ownerDocument.createElement('p');
    p.textContent = line;
    article.appendChild(p);
  }
  container.appendChild(article);
  return chapters.length;
}
