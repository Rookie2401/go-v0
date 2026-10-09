/**
 * The controlled reader page — PROTOTYPE, disposable. It opens a local, DRM-free EPUB (file input, or `?fixture=` in
 * the prototype build), refuses protected files BEFORE any rendering (src/open.ts → src/ingest/epub.ts), renders with
 * epub.js in paginated mode and wires the `epub-local` ReaderAdapter to a minimal lookup card so the adapter can be
 * exercised by hand. The card shows the selection and its sentence in memory only; nothing is stored but highlight
 * CFIs (no text) in localStorage.
 */
import ePub from 'epubjs';
import { EpubLocalAdapter, type ReaderHandle } from './adapter';
import { openLocalEpub, plainTextBook, renderChapterPlain, type EpubBook, type OpenResult } from './open';
import { popupPosition } from './geometry';

const PROTOTYPE = import.meta.env.MODE === 'prototype';
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const els = {
  file: $<HTMLInputElement>('file'), prev: $<HTMLButtonElement>('prev'), next: $<HTMLButtonElement>('next'),
  chapters: $<HTMLSelectElement>('chapters'), smaller: $<HTMLButtonElement>('smaller'), bigger: $<HTMLButtonElement>('bigger'),
  size: $('size'), status: $('status'), viewer: $('viewer'), card: $('card'),
};

interface Session {
  book?: ReturnType<typeof ePub>;
  rendition?: ReturnType<ReturnType<typeof ePub>['renderTo']>;
  adapter?: EpubLocalAdapter;
  offLayout?: () => void;
  fallback?: { book: EpubBook; index: number };
  fontPercent: number;
  identifier?: string;
}
const session: Session = { fontPercent: 100 };
let lastOutcome: OpenResult<unknown>['status'] | undefined;

function say(message: string, kind: 'info' | 'refused' = 'info'): void {
  els.status.textContent = message;
  els.status.className = kind === 'refused' ? 'refused' : '';
}

function enable(on: boolean): void {
  for (const b of [els.prev, els.next, els.chapters, els.smaller, els.bigger]) b.disabled = !on;
}

function teardown(): void {
  session.offLayout?.();
  session.adapter?.dispose();
  session.rendition?.destroy();
  session.book?.destroy();
  session.book = session.rendition = session.adapter = session.offLayout = session.fallback = undefined;
  els.viewer.replaceChildren();
  els.chapters.replaceChildren();
  els.card.hidden = true;
  enable(false);
}

// ───────────────────────────── epub.js rendering ─────────────────────────────

async function renderWithEpubjs(bytes: Uint8Array): Promise<void> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  // open as 'binary' explicitly: the constructor's input sniffing compares against this realm's ArrayBuffer
  const book = (ePub as unknown as () => ReturnType<typeof ePub>)();
  await (book as unknown as { open(b: ArrayBuffer, what: string): Promise<unknown> }).open(buffer, 'binary');
  await book.ready;
  const rendition = book.renderTo(els.viewer, { width: '100%', height: '100%', flow: 'paginated', spread: 'none' });
  // epub.js shows the first page of the first spine item
  await rendition.display();
  const adapter = new EpubLocalAdapter({ book, rendition } as unknown as ReaderHandle, { version: (ePub as unknown as { VERSION?: string }).VERSION });
  session.book = book;
  session.rendition = rendition;
  session.adapter = adapter;
  session.identifier = String((book.packaging as unknown as { metadata?: { identifier?: string } }).metadata?.identifier ?? '');
  await fillChapters(book);
  wireRendition(rendition, adapter);
  enable(true);
}

async function fillChapters(book: ReturnType<typeof ePub>): Promise<void> {
  const nav = await book.loaded.navigation;
  const items = nav.toc.length ? nav.toc.map((t) => ({ label: t.label.trim(), href: t.href })) : (book.spine as unknown as { spineItems: Array<{ href: string }> }).spineItems.map((s, i) => ({ label: `Section ${i + 1}`, href: s.href }));
  els.chapters.replaceChildren(...items.map((it) => {
    const o = document.createElement('option');
    o.value = it.href; o.textContent = it.label;
    return o;
  }));
}

function wireRendition(rendition: NonNullable<Session['rendition']>, adapter: EpubLocalAdapter): void {
  rendition.on('relocated', (loc: { start: { href: string; displayed: { page: number; total: number } } }) => {
    const href = loc.start.href;
    const opt = [...els.chapters.options].find((o) => o.value.split('#')[0] === href);
    if (opt) els.chapters.value = opt.value;
    say(`${opt?.textContent ?? href} - page ${loc.start.displayed.page} of ${loc.start.displayed.total}`);
  });
  // selection → card. epub.js debounces the browser's selectionchange (250 ms) before it emits 'selected'.
  rendition.on('selected', () => showCard(adapter));
  // the page moved or the text reflowed under a shown card: put the card back, or hide it if the text is gone
  session.offLayout = adapter.onLayoutChange(() => { if (!els.card.hidden) showCard(adapter, true); });
  restoreHighlights();
}

// ───────────────────────────── the lookup card (demonstration of the adapter) ─────────────────────────────

let cardRange: Range | undefined;

function showCard(adapter: EpubLocalAdapter, keep = false): void {
  let range = cardRange;
  if (!keep || !range || !adapter.isRangeLive(range)) {
    const sel = adapter.selection();
    if (!sel.ok) { if (!keep) els.card.hidden = true; return; }
    range = sel.range;
    cardRange = range;
    const ctx = adapter.context(range, { adjacent: true });
    const surface = document.createElement('div');
    surface.className = 'surface';
    surface.textContent = sel.surface;
    surface.dir = sel.direction === 'rtl' ? 'rtl' : 'auto';
    const sentence = document.createElement('div');
    sentence.className = 'sentence';
    sentence.dir = surface.dir;
    if (ctx.sentence && ctx.selStart !== undefined && ctx.selEnd !== undefined) {
      const mark = document.createElement('mark');
      mark.textContent = ctx.sentence.slice(ctx.selStart, ctx.selEnd);
      sentence.append(ctx.sentence.slice(0, ctx.selStart), mark, ctx.sentence.slice(ctx.selEnd));
    }
    const meta = document.createElement('div');
    const kind = document.createElement('small');
    kind.textContent = `${ctx.kind} (confidence ${ctx.confidence.toFixed(2)})${ctx.reason ? `, ${ctx.reason}` : ''}`;
    const cfi = document.createElement('code');
    cfi.textContent = adapter.cfiOf(range) ?? '';
    const hl = document.createElement('button');
    hl.type = 'button'; hl.textContent = 'Highlight';
    hl.addEventListener('click', () => { if (cardRange) { const c = adapter.highlight(cardRange); if (c) saveHighlight(c); } });
    meta.append(kind, document.createElement('br'), cfi);
    els.card.replaceChildren(surface, sentence, meta, hl);
  }
  els.card.hidden = false;
  const a = adapter.anchor(range);
  const pos = popupPosition(a.rect, a.viewport, { width: els.card.offsetWidth || 300, height: els.card.offsetHeight || 140 });
  els.card.style.left = `${pos.left}px`;
  els.card.style.top = `${pos.top}px`;
  if (a.source === 'fallback' && keep) els.card.hidden = true; // the selected text is no longer on screen
}

// ───────────────────────────── highlights: CFIs only, never text ─────────────────────────────

const storageKey = (): string => `go-controlled-reader:highlights:${session.identifier ?? ''}`;
function readHighlights(): string[] {
  try { return JSON.parse(localStorage.getItem(storageKey()) ?? '[]') as string[]; } catch { return []; }
}
function saveHighlight(cfi: string): void {
  try { localStorage.setItem(storageKey(), JSON.stringify([...new Set([...readHighlights(), cfi])])); } catch { /* storage may be blocked */ }
}
function restoreHighlights(): void {
  const rendition = session.rendition;
  if (!rendition) return;
  for (const cfi of readHighlights()) {
    try { rendition.annotations.highlight(cfi, {}, undefined, 'go-highlight', { fill: 'gold', 'fill-opacity': '0.3' }); } catch { /* a stale CFI is ignored */ }
  }
}

// ───────────────────────────── opening a file ─────────────────────────────

export async function openBytes(bytes: Uint8Array, name: string): Promise<OpenResult<void>['status']> {
  teardown();
  let result: OpenResult<void>;
  if (/\.txt$/i.test(name)) {
    const book = plainTextBook(new TextDecoder('utf-8').decode(bytes), name);
    result = { status: 'fallback', book, message: 'Plain text file.' };
  } else {
    result = await openLocalEpub<void>(bytes, { render: renderWithEpubjs });
  }
  lastOutcome = result.status;
  switch (result.status) {
    case 'refused':
      say(result.message, 'refused'); // nothing was rendered: the viewer is empty
      break;
    case 'unreadable':
      say(result.message, 'refused');
      break;
    case 'rendered':
      say(`${result.book.title ?? name} - opened with epub.js (${result.book.chapters.length} sections).`);
      break;
    case 'fallback':
      showFallback(result.book, result.message);
      break;
  }
  return result.status;
}

function showFallback(book: EpubBook, message: string): void {
  teardown();
  session.fallback = { book, index: 0 };
  els.chapters.replaceChildren(...book.chapters.map((c, i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = c.title ?? `Section ${i + 1}`;
    return o;
  }));
  els.prev.disabled = els.next.disabled = els.chapters.disabled = false;
  drawFallback();
  say(`${message} ${book.notes.join(' ')}`);
}

function drawFallback(): void {
  const f = session.fallback;
  if (!f) return;
  renderChapterPlain(els.viewer, f.book.chapters, f.index, /^(he|ar|fa|ur|yi)\b/i.test(f.book.language ?? '') ? 'rtl' : 'ltr');
  els.chapters.value = String(f.index);
}

async function openFile(file: File): Promise<void> {
  say(`Reading ${file.name} ...`);
  await openBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

// ───────────────────────────── controls ─────────────────────────────

els.file.addEventListener('change', () => { const f = els.file.files?.[0]; if (f) void openFile(f); });
els.next.addEventListener('click', () => {
  if (session.fallback) { session.fallback.index = Math.min(session.fallback.index + 1, session.fallback.book.chapters.length - 1); drawFallback(); } else void session.rendition?.next();
});
els.prev.addEventListener('click', () => {
  if (session.fallback) { session.fallback.index = Math.max(session.fallback.index - 1, 0); drawFallback(); } else void session.rendition?.prev();
});
els.chapters.addEventListener('change', () => {
  if (session.fallback) { session.fallback.index = Number(els.chapters.value); drawFallback(); } else void session.rendition?.display(els.chapters.value);
});
function setFont(delta: number): void {
  session.fontPercent = Math.max(70, Math.min(200, session.fontPercent + delta));
  els.size.textContent = `${session.fontPercent}%`;
  if (session.fallback) els.viewer.style.fontSize = `${session.fontPercent}%`;
  else session.adapter?.setFontSize(session.fontPercent);
}
els.smaller.addEventListener('click', () => setFont(-10));
els.bigger.addEventListener('click', () => setFont(10));
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  if (e.key === 'ArrowRight') els.next.click();
  else if (e.key === 'ArrowLeft') els.prev.click();
});

// ───────────────────────────── prototype-only: debug handle and ?fixture= ─────────────────────────────

if (PROTOTYPE) {
  (window as unknown as { __reader: unknown }).__reader = {
    session,
    openBytes,
    get lastOutcome() { return lastOutcome; },
    get adapter() { return session.adapter; },
    get rendition() { return session.rendition; },
    get book() { return session.book; },
  };
  const name = new URLSearchParams(location.search).get('fixture');
  if (name) {
    void import('./fixtures').then(async ({ FIXTURES }) => {
      const url = FIXTURES[name];
      if (!url) { say(`Unknown fixture "${name}".`, 'refused'); return; }
      const res = await fetch(url);
      await openBytes(new Uint8Array(await res.arrayBuffer()), `${name}.epub`);
    });
  }
}
