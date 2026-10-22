/**
 * Biblia: the library (testament → division → book → chapters), the reader (one chapter, every word tappable, the shared GoLearn card) and the
 * settings, over a hash router. Routes: #/ (library) · #/read/<book>/<chapter> · #/settings · #/sources.
 *
 * Parsing is GoLearn's: a tapped word is parsed by `parseSelection` with the he / el analyser, in the period the reader declares for the text
 * (he-bib for the Tanakh, arc-bib for its Aramaic chapters, el-koi for the New Testament); the card is `createCardUI`'s. Every lookup and mark is
 * a Repository event through the Recorder (repo.ts) when one exists.
 */
import { createCardUI, type CardUI } from '../../golearn-extension/src/popup/card';
import type { CardModel } from '../../golearn-extension/src/parser';
import { parseSelection } from '../../golearn-extension/src/parser';
import { hasAnalyser, languageMeta, registerAnalyser } from '../../golearn-extension/src/parser/registry';
import { buildAssistanceEvent, buildMarkEvent, buildSelectionEvent, type InteractionContext } from '../../golearn-extension/src/store';
import type { ExpandedLayer } from '../../golearn-extension/src/store';
import type { PopupAnchor } from '../../golearn-extension/src/contract/readerAdapter';
import type { KnowledgeLevel } from '../../repository-contract/src/knowledge-levels';
import { heAdapter } from '../../../src/adapters/he';
import { elAdapter } from '../../../src/adapters/el';
import { consonantal } from '../../../src/adapters/hebrew/text';
import { Canon, TREE, numeral, parseCanon, type BibliaLang, type BookInfo } from './canon';
import { Texts, greekVerseText, installFullIndexes, verseIsAramaic, type AnyBook, type DataSource, type GrVerse, type HeVerse } from './data';
import { APP_VERSION, READER_ID, type Recorder } from './repo';

export interface BibliaDeps {
  win: Window;
  doc: Document;
  source: DataSource;
  recorder: Recorder;
  storage?: Storage;
  now(): Date;
}

export type HebrewDisplay = 'full' | 'niqqud' | 'consonants';
const DISPLAY_LABEL: Record<HebrewDisplay, string> = { full: 'Full Masoretic (points and accents)', niqqud: 'Points only', consonants: 'Consonants only' };
const POETRY = new Set(['Ps', 'Prov', 'Job', 'Lam', 'Song']);
const LANGUAGE_NAME: Record<BibliaLang, string> = { he: 'Hebrew', el: 'Greek' };

type Child = Node | string | null | undefined | false;

export interface BibliaApp {
  go(hash: string): Promise<void>;
  readonly route: string;
  /** The open card's shadow root (tests and tooling); undefined when no card is shown. */
  cardRoot(): ShadowRoot | undefined;
  destroy(): void;
}

export async function createBibliaApp(deps: BibliaDeps): Promise<BibliaApp> {
  const { doc, win } = deps;
  const root = doc.getElementById('app') ?? doc.body.appendChild(doc.createElement('div'));
  const h = (tag: string, attrs: Record<string, string | undefined> = {}, ...children: Child[]): HTMLElement => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, v);
    for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
    return el;
  };
  const pref = <T extends string>(key: string, fallback: T, allowed: readonly T[]): T => {
    try { const v = deps.storage?.getItem(`biblia:${key}`); return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback; } catch { return fallback; }
  };
  const setPref = (key: string, value: string): void => { try { deps.storage?.setItem(`biblia:${key}`, value); } catch { /* storage blocked */ } };

  // the analysers: registered with the parser when the parser's language table knows them (the extension's LANGUAGE_META)
  const analyserNotes: string[] = [];
  for (const [lang, adapter] of [['he', heAdapter], ['el', elAdapter]] as const) {
    if (hasAnalyser(lang)) continue;
    if (languageMeta(lang)) registerAnalyser(lang, adapter);
    else analyserNotes.push(`The GoLearn parser does not list ${LANGUAGE_NAME[lang]} yet, so ${LANGUAGE_NAME[lang]} words cannot be looked up on this build.`);
  }
  const indexes = await installFullIndexes(deps.source);
  const canon: Canon = parseCanon(await deps.source.fetchJson('data/canon.json'));
  const texts = new Texts(deps.source);
  const sessionId = `biblia:${deps.now().getTime().toString(36)}`;
  let hebrewDisplay = pref<HebrewDisplay>('hebrewDisplay', 'full', ['full', 'niqqud', 'consonants']);

  const card: CardUI = createCardUI({ doc, speech: (win as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis ?? null, onDismiss: () => clearSelection() });
  let selectedButton: HTMLElement | undefined;
  const clearSelection = (): void => { selectedButton?.classList.remove('sel'); selectedButton = undefined; };

  let route = '';
  const notices: string[] = [...analyserNotes, ...indexes.notes, ...(deps.recorder.mode === 'none' && deps.recorder.reason ? [deps.recorder.reason] : [])];

  function topbar(title: string, crumb?: string): HTMLElement {
    return h('div', { class: 'topbar' }, h('a', { href: '#/', class: 'crumb' }, 'Biblia'), crumb ? h('span', { class: 'crumb' }, `· ${crumb}`) : null, h('h1', {}, title), h('a', { href: '#/settings' }, 'Settings'));
  }

  // ── library ──
  function renderLibrary(): HTMLElement {
    const last = (() => { try { return deps.storage?.getItem('biblia:last') ?? undefined; } catch { return undefined; } })();
    const lib = h('div', { class: 'library' });
    for (const t of TREE) {
      const td = h('details', { open: '' }, h('summary', {}, t.title, h('span', { class: 'native', lang: t.lang, dir: 'auto' }, t.native)));
      for (const d of t.divisions) {
        const dd = h('details', {}, h('summary', {}, d.title, h('span', { class: 'native', lang: t.lang, dir: 'auto' }, d.native)));
        for (const b of canon.booksOf(d)) {
          const bd = h('details', {}, h('summary', {}, b.en, h('span', { class: 'native', lang: b.lang, dir: 'auto' }, b.native)));
          const chapters = h('div', { class: 'chapters' });
          b.verses.forEach((_, i) => {
            const ch = i + 1;
            const href = `#/read/${b.id}/${ch}`;
            chapters.append(h('a', { href, class: last === `${b.id}/${ch}` ? 'last' : undefined, lang: b.lang, title: `${b.en} ${ch}` }, numeral(b.lang, ch)));
          });
          bd.append(chapters);
          dd.append(bd);
        }
        td.append(dd);
      }
      lib.append(td);
    }
    return h('div', {}, topbar('Library'), ...notices.map((n) => h('div', { class: 'notice' }, n)), lib, sourcesNote());
  }

  function sourcesNote(): HTMLElement {
    return h('div', { class: 'sources' },
      'Texts: Miqra according to the Masorah (CC BY-SA 4.0, via Sefaria) with the Open Scriptures Hebrew Bible morphology (CC BY 4.0); The Greek New Testament: SBL Edition (CC BY 4.0) with MorphGNT (CC BY-SA 3.0). ',
      'Every word is read by the Go analysers for Hebrew and Greek; nothing here has been reviewed by a Hebrew scholar, a classicist or a native speaker. ',
      h('a', { href: '#/sources' }, 'Sources and limits'));
  }

  // ── reader ──
  interface WordRef { lang: BibliaLang; book: string; ch: number; v: number; sentence: string; start: number; end: number; surface: string; varietyId: string; gold?: { lemmaId: string; code: string; source: string } }

  function renderHebrewVerse(info: BookInfo, ch: number, v: HeVerse, aramaic: boolean): HTMLElement {
    const text = hebrewDisplay === 'full' ? v.t : hebrewDisplay === 'niqqud' ? v.t.replace(/[֑-ֽֿ֯׀ׅׄ]/g, '') : consonantal(v.t).replace(/־/g, ' ');
    const el = h('span', { class: `verse${aramaic ? ' aramaic' : ''}`, 'data-v': String(v.n) }, h('span', { class: 'vn' }, numeral('he', v.n)));
    if (v.absent) { el.append(h('span', { class: 'mark' }, '(absent from this edition)')); return el; }
    const varietyId = aramaic ? 'arc-bib' : 'he-bib';
    // the source's reading of each word (Open Scriptures), by word order: the maqaf-split words of the text and the `w` column align one to one
    const toks = heAdapter.tokenize(text);
    const wordCount = toks.filter((t) => t.isWord).length;
    let wi = 0;
    for (const t of toks) {
      const piece = text.slice(t.start, t.end);
      if (t.isWord) {
        const g = wordCount === v.w.length ? v.w[wi] : null;
        wi++;
        const gold = g ? { lemmaId: g[0].split('/').pop()!.replace(/\+$/, ''), code: g[1], source: 'Open Scriptures morphology' } : undefined;
        el.append(wordButton({ lang: 'he', book: info.id, ch, v: v.n, sentence: text, start: t.start, end: t.end, surface: piece, varietyId, ...(gold ? { gold } : {}) }));
      } else el.append(doc.createTextNode(piece));
      el.append(doc.createTextNode(text.slice(t.end, nextStart(text, t.end))));
    }
    if (v.pe) el.append(h('span', { class: 'mark' }, ' פ '));
    if (v.s) el.append(h('span', { class: 'mark' }, ' ס '));
    return el;
  }
  /** The whitespace between a token's end and the next non-space character (tokens drop whitespace; the text keeps it). */
  const nextStart = (text: string, from: number): number => { let i = from; while (i < text.length && /\s/u.test(text[i])) i++; return i; };

  function renderGreekVerse(info: BookInfo, ch: number, v: GrVerse): HTMLElement {
    const text = greekVerseText(v);
    const el = h('span', { class: 'verse', 'data-v': String(v.n) }, h('span', { class: 'vn' }, numeral('el', v.n)));
    // MorphGNT's reading of each word, by word order (its printed tokens with letters align one to one with the word tokens)
    const golds = v.w.filter((t) => /\p{L}/u.test(t[0]));
    const toks = elAdapter.tokenize(text);
    const wordCount = toks.filter((t) => t.isWord).length;
    let wi = 0;
    for (const t of toks) {
      const piece = text.slice(t.start, t.end);
      if (t.isWord) {
        const g = wordCount === golds.length ? golds[wi] : undefined;
        wi++;
        const gold = g ? { lemmaId: g[1].normalize('NFC'), code: `${g[2]}|${g[3] ?? ''}`, source: 'MorphGNT' } : undefined;
        el.append(wordButton({ lang: 'el', book: info.id, ch, v: v.n, sentence: text, start: t.start, end: t.end, surface: piece, varietyId: 'el-koi', ...(gold ? { gold } : {}) }));
      } else el.append(doc.createTextNode(piece));
      el.append(doc.createTextNode(text.slice(t.end, nextStart(text, t.end))));
    }
    return el;
  }

  function wordButton(ref: WordRef): HTMLElement {
    const b = h('button', { type: 'button', class: 'word', lang: ref.lang }, ref.surface);
    b.addEventListener('click', () => { void lookup(ref, b); });
    return b;
  }

  async function lookup(ref: WordRef, button: HTMLElement): Promise<void> {
    if (!hasAnalyser(ref.lang)) { showNotice(`The GoLearn parser does not list ${LANGUAGE_NAME[ref.lang]} on this build; nothing can be looked up.`); return; }
    clearSelection();
    selectedButton = button; button.classList.add('sel');
    const direction = ref.lang === 'he' ? 'rtl' : 'ltr';
    let model: CardModel;
    try {
      model = parseSelection({ surface: ref.surface, languageId: ref.lang, context: { kind: 'sentence', confidence: 1, sentence: ref.sentence, selStart: ref.start, selEnd: ref.end, direction, varietyId: ref.varietyId, ...(ref.gold ? { gold: ref.gold } : {}) } });
    } catch (e) { showNotice(`This word could not be parsed: ${e instanceof Error ? e.message : String(e)}`); return; }
    const r = button.getBoundingClientRect();
    const anchor: PopupAnchor = { rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, viewport: { width: win.innerWidth, height: win.innerHeight }, rtl: direction === 'rtl', source: 'range' };
    const identity = await deps.recorder.identity(ref.lang, ref.varietyId);
    const now = deps.now();
    let ictx: InteractionContext | undefined;
    if (identity) {
      const base = { card: model, readerId: READER_ID, identity, version: APP_VERSION, sessionId, now, direction, language: { languageId: ref.lang, varietyId: ref.varietyId, basis: 'override' as const, confidence: 1, source: `biblia:${ref.book}.${ref.ch}.${ref.v}` } };
      const selection = buildSelectionEvent(base);
      ictx = { ...base, selectionEventId: selection.id };
      void deps.recorder.record([selection]).then((r2) => { if (!r2.ok) showNotice(`Could not record this lookup: ${r2.message ?? 'unknown reason'}.`); });
    }
    card.show(model, anchor, {
      view: {
        languageName: `${LANGUAGE_NAME[ref.lang]} · ${canon.refLabel(ref.book, ref.ch)}:${ref.v}`,
        // "view sources": the analyser's own sources for this language (the Open Scriptures morphology, MorphGNT, the Wiktionary tables, the rules)
        sources: Object.values((ref.lang === 'he' ? heAdapter : elAdapter).sources ?? {}).map((s) => ({ label: s.label, ...(s.licence ? { licence: s.licence } : {}) })),
      },
      actions: {
        onLayer: (layer) => { if (ictx) void deps.recorder.record([buildAssistanceEvent({ ...ictx, now: deps.now() }, layer as ExpandedLayer)]); },
        onRate: (mark) => {
          if (!ictx) { showNotice(deps.recorder.reason ?? 'Nothing is recorded here.'); return; }
          void deps.recorder.record([buildMarkEvent({ ...ictx, now: deps.now() }, mark as KnowledgeLevel)]).then((r2) => card.update({ rated: r2.ok ? mark : undefined, correction: r2.ok ? { state: 'idle' } : { state: 'error', message: `Could not save that: ${r2.message ?? 'unknown reason'}. Try again.` } }));
        },
      },
    });
  }

  let noticeEl: HTMLElement | undefined;
  function showNotice(text: string): void {
    if (!noticeEl) return;
    noticeEl.textContent = text;
    noticeEl.removeAttribute('hidden');
  }

  async function renderReader(bookId: string, ch: number): Promise<HTMLElement> {
    const info = canon.book(bookId);
    if (!info || !canon.validRef(bookId, ch)) {
      return h('div', {}, topbar('Not found'), h('div', { class: 'notice err' }, info ? `${info.en} has ${info.verses.length} chapters; there is no chapter ${ch}.` : `No book called “${bookId}”.`), h('p', {}, h('a', { href: '#/' }, 'Library')));
    }
    setPref('last', `${bookId}/${ch}`);
    let book: AnyBook;
    try { book = await texts.loadBook(info.lang, bookId); } catch (e) {
      return h('div', {}, topbar(canon.refLabel(bookId, ch)), h('div', { class: 'notice err' }, `The text could not be loaded (${e instanceof Error ? e.message : String(e)}). Run npm run biblia:import to copy the texts from the Biblia app.`));
    }
    const chapter = book.chapters[ch - 1];
    const prev = canon.adjacent(bookId, ch, -1);
    const next = canon.adjacent(bookId, ch, 1);
    const nav = h('div', { class: 'nav' },
      prev ? h('a', { href: `#/read/${prev.book}/${prev.ch}` }, `← ${canon.refLabel(prev.book, prev.ch)}`) : h('span', {}),
      h('span', { class: 'crumb' }, `${info.en} ${ch}`, h('span', { class: 'native', lang: info.lang, dir: 'auto' }, ` · ${info.native} ${numeral(info.lang, ch)}`)),
      next ? h('a', { href: `#/read/${next.book}/${next.ch}` }, `${canon.refLabel(next.book, next.ch)} →`) : h('span', {}));
    const prose = h('div', { class: `prose${POETRY.has(bookId) ? ' poetry' : ''}`, lang: info.lang, dir: info.lang === 'he' ? 'rtl' : 'ltr' });
    const chapterNotes: string[] = [];
    let aramaicVerses = 0;
    if (book.lang === 'he') {
      const verses = (chapter as { verses: HeVerse[] }).verses;
      if (indexes.modernHe) {
        const keys: string[] = [];
        for (const v of verses) for (const t of heAdapter.tokenize(v.t)) if (t.isWord) keys.push(t.normalized);
        const r = await indexes.modernHe.ensure(keys);
        if (r.failed.length) chapterNotes.push(`${r.failed.length} of the Modern Hebrew shards this chapter needs could not be loaded (${r.failed[0][1]}); the Variants tab shows less for those words.`);
      }
      for (const v of verses) { const ar = verseIsAramaic(v); if (ar) aramaicVerses++; prose.append(renderHebrewVerse(info, ch, v, ar), doc.createTextNode(' ')); }
    } else {
      const verses = (chapter as { verses: GrVerse[] }).verses;
      // the Ancient Greek tables are sharded: fetch the shards this chapter's words live in, so Attic and Homeric readings are on the card
      if (indexes.ancient) {
        const keys: string[] = [];
        for (const v of verses) for (const t of elAdapter.tokenize(greekVerseText(v))) if (t.isWord) keys.push(t.normalized);
        const r = await indexes.ancient.ensure(keys);
        if (r.failed.length) chapterNotes.push(`${r.failed.length} of the Ancient Greek shards this chapter needs could not be loaded (${r.failed[0][1]}); the Variants tab shows less for those words.`);
        if (indexes.modernEl) { const m = await indexes.modernEl.ensure(keys); if (m.failed.length) chapterNotes.push(`${m.failed.length} of the Modern Greek shards this chapter needs could not be loaded (${m.failed[0][1]}).`); }
      }
      for (const v of verses) prose.append(renderGreekVerse(info, ch, v), doc.createTextNode(' '));
    }
    const period = info.lang === 'he'
      ? (aramaicVerses ? `Read as Biblical Hebrew; ${aramaicVerses} verse${aramaicVerses === 1 ? '' : 's'} of this chapter are Biblical Aramaic (marked) and are read as Aramaic.` : 'Read as Biblical Hebrew (the Masoretic text, with its cantillation).')
      : `Read as Koine Greek (the Greek New Testament)${indexes.ancient ? `; the Attic and Homeric tables are loaded for this chapter's words (${indexes.ancient.loaded().length} shards in memory)` : ''}.`;
    noticeEl = h('div', { class: 'notice', role: 'status', hidden: '' });
    return h('div', { class: 'reader' }, topbar(canon.refLabel(bookId, ch), TREE.find((t) => t.lang === info.lang)?.title), nav, h('div', { class: 'period' }, period), ...[...notices, ...chapterNotes].map((n) => h('div', { class: 'notice' }, n)), prose, noticeEl, nav.cloneNode(true) as HTMLElement, sourcesNote());
  }

  // ── settings and sources ──
  function renderSettings(): HTMLElement {
    const box = h('div', { class: 'settings' }, topbar('Settings'));
    const group = h('fieldset', {}, h('legend', {}, 'Hebrew text'));
    for (const d of ['full', 'niqqud', 'consonants'] as HebrewDisplay[]) {
      const input = h('input', { type: 'radio', name: 'hebrewDisplay', value: d }) as HTMLInputElement;
      input.checked = hebrewDisplay === d;
      input.addEventListener('change', () => { hebrewDisplay = d; setPref('hebrewDisplay', d); });
      group.append(h('label', {}, input, ` ${DISPLAY_LABEL[d]}`));
    }
    box.append(group);
    box.append(h('p', { class: 'notice' }, 'The Hebrew analyser always reads the full Masoretic text, whatever is displayed; the display only hides marks.'));
    box.append(h('p', { class: 'notice' }, deps.recorder.mode === 'extension' ? 'Your lookups and marks are recorded in the GoLearn extension’s on-device Repository, under a Hebrew or Greek enrolment whose variety is the period of the text (Biblical Hebrew, Biblical Aramaic, Koine Greek); GoReview reads them from there.' : (deps.recorder.reason ?? 'Nothing is recorded here.')));
    return box;
  }
  function renderSources(): HTMLElement {
    return h('div', {}, topbar('Sources and limits'),
      h('ul', {},
        h('li', {}, 'Tanakh text: Miqra according to the Masorah (מקרא על פי המסורה), ed. Dovi, Hebrew Wikisource — CC BY-SA 4.0, via the Sefaria API; morphology: Open Scriptures Hebrew Bible (CC BY 4.0); glosses: BDB, Strong’s, the Open Scriptures lexical index (public domain).'),
        h('li', {}, 'Greek New Testament: The Greek New Testament: SBL Edition (Michael W. Holmes, ed.; SBL / Logos, 2010) — CC BY 4.0; analysis: MorphGNT (CC BY-SA 3.0); glosses: Dodson, Abbott-Smith, Strong’s (public domain); Septuagint counts: lxx-morph.'),
        h('li', {}, 'Both copied from the owner’s Biblia app’s data build (npm run biblia:import). None of that app’s parsing code is used: every word is read by the Go analysers adapter-he and adapter-el, whose readings are the sources’ own readings of these very words; the compiled cores hold the commonest words and the full indexes (loaded here when built) the rest.'),
        h('li', {}, 'Limits: no dictionary panel yet (BDB / Abbott-Smith entries are not shown); no search, no vocabulary list (GoPractice shows the vocabulary); a form the Bible reads two ways shows both, the commoner first; nothing has been reviewed by a Hebrew scholar, a classicist or a native speaker; no voice exists for Biblical Hebrew or Koine Greek.'),
      ),
      h('p', {}, h('a', { href: '#/' }, 'Library')));
  }

  // ── router ──
  // The hash rendered last. `go()` renders at once; the browser then fires `hashchange` for the same hash asynchronously, and that second
  // render must not happen: it would replace the page, drop the selection and dismiss a card opened in between.
  let renderedHash = '';
  async function render(): Promise<void> {
    const hash = win.location.hash || '#/';
    renderedHash = hash;
    const m = /^#\/?([a-z]*)(?:\/([^/]+))?(?:\/(\d+))?/.exec(hash);
    const id = m?.[1] ?? '';
    try { if (card.isOpen()) card.dismiss('escape'); } catch { /* no card */ }
    clearSelection();
    let view: HTMLElement;
    if (id === 'read' && m?.[2]) { route = `read/${m[2]}/${m[3] ?? '1'}`; view = await renderReader(decodeURIComponent(m[2]), Number(m[3] ?? '1')); }
    else if (id === 'settings') { route = 'settings'; view = renderSettings(); }
    else if (id === 'sources') { route = 'sources'; view = renderSources(); }
    else { route = 'library'; view = renderLibrary(); }
    root.replaceChildren(view);
    try { win.scrollTo(0, 0); } catch { /* jsdom has no layout */ }
  }
  const onHash = (): void => { if ((win.location.hash || '#/') !== renderedHash) void render(); };
  win.addEventListener('hashchange', onHash);
  await render();

  return {
    get route() { return route; },
    async go(hash: string) { win.location.hash = hash.startsWith('#') ? hash : `#/${hash.replace(/^\/+/, '')}`; await render(); },
    cardRoot: () => card.root() ?? undefined,
    destroy() { win.removeEventListener('hashchange', onHash); card.destroy(); },
  };
}
