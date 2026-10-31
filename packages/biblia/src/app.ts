/**
 * Biblia: the library (testament → division → book → chapters), the reader (one chapter, every word tappable, the shared GoLearn card) and the
 * settings, over a hash router. Routes: #/ (library) · #/read/<book>/<chapter> · #/settings · #/sources.
 *
 * Parsing is GoLearn's: a tapped word is parsed by `parseSelection` with the he / el analyser, in the period the reader declares for the text
 * (he-bib for the Tanakh, arc-bib for its Aramaic chapters, el-koi for the New Testament); the card is `createCardUI`'s. Every lookup and mark is
 * a Repository event through the Recorder (repo.ts) when one exists. A tap in a verse also records, once per verse per session, one
 * `EncounterRecorded` (surface 'biblia-reading') for the unit ids of the verse's other words, so the Repository learns what was read without a tap.
 */
import { createCardUI, type CardUI } from '../../golearn-extension/src/popup/card';
import type { CardView } from '../../golearn-extension/src/popup/view';
import type { CardModel } from '../../golearn-extension/src/parser';
import { parseSelection } from '../../golearn-extension/src/parser';
import { hasAnalyser, languageMeta, registerAnalyser } from '../../golearn-extension/src/parser/registry';
import { buildAssistanceEvent, buildEncounterEvent, buildMarkEvent, buildSelectionEvent, type InteractionContext } from '../../golearn-extension/src/store';
import type { ExpandedLayer, LanguageEvidenceInfo } from '../../golearn-extension/src/store';
import type { PopupAnchor } from '../../golearn-extension/src/contract/readerAdapter';
import type { KnowledgeLevel } from '../../repository-contract/src/knowledge-levels';
import { heAdapter } from '../../../src/adapters/he';
import { elAdapter } from '../../../src/adapters/el';
import { consonantal } from '../../../src/adapters/hebrew/text';
import { Canon, TREE, numeral, parseCanon, type BibliaLang, type BookInfo } from './canon';
import { Texts, greekVerseText, installFullIndexes, verseIsAramaic, type AnyBook, type DataSource, type GrVerse, type HeVerse } from './data';
import { APP_VERSION, READER_ID, type Identity, type Recorder } from './repo';
import { renderAccountScreen, renderLegalScreen, type AccountService } from './account';
import { createLevels, unitIdsOfSite, type LevelSite } from './levels';
import type { GoEvent } from '../../repository-contract/src';

export interface BibliaDeps {
  win: Window;
  doc: Document;
  source: DataSource;
  recorder: Recorder;
  /** The standalone web edition's account (sign-in state, the screen at #/account); absent in the extension, in the iPhone app and in a plain reader. With it, the chapter on screen carries the learner's knowledge levels while signed in. */
  account?: AccountService;
  /** With the account: the live sync notice (src/syncStatus.ts), shown in the Settings page's Account card and nowhere else (2026-10-27: it used to be a bar above every page). */
  syncStatus?: HTMLElement;
  storage?: Storage;
  /** Where "GoReview" at the top leads when Biblia is a page of the GoReview app (the iPhone edition); absent elsewhere. */
  backUrl?: string;
  now(): Date;
}

export type HebrewDisplay = 'full' | 'niqqud' | 'consonants';
const POETRY = new Set(['Ps', 'Prov', 'Job', 'Lam', 'Song']);
const LANGUAGE_NAME: Record<BibliaLang, string> = { he: 'Hebrew', el: 'Greek' };
/** Which levels of the library tree are open (a JSON list of ids), remembered on the device; the two testaments are open until the learner closes them. */
export const HOME_OPEN_KEY = 'biblia:home-open';
export type Theme = 'auto' | 'light' | 'dark';
/** The reading type as the Biblia app shipped it: Hebrew 26 px, Greek 22 px, line height 1.85. */
export const READING_DEFAULTS = { hebrewSize: 26, greekSize: 22, lineHeight: 1.85 } as const;
/** Every preference the settings page keeps (`biblia:<name>`); "Reset settings" removes exactly these. */
const PREF_NAMES = ['hebrewDisplay', 'theme', 'hebrewSize', 'greekSize', 'lineHeight', 'verseNumbers', 'levelMarks'] as const;
const SHORT_DISPLAY: Record<HebrewDisplay, string> = { full: 'with accents', niqqud: 'niqqud', consonants: 'consonants' };

/** The icon set (the Biblia app's: 24 px grid, 1.6 stroke). Static markup of this file only, never built from data. */
const ICONS = {
  back: '<path d="M15 6l-6 6 6 6" />',
  chevronRight: '<path d="M9 6l6 6-6 6" />',
  settings: '<path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h8M16 17h4" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="14" cy="17" r="2" />',
  type: '<path d="M4 19l5-14 5 14M6.5 14h5M15 12l3-6 3 6M16 10h4" />',
  account: '<circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />',
} as const;
type IconName = keyof typeof ICONS;

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
  const numPref = (key: string, fallback: number, min: number, max: number): number => {
    try { const raw = deps.storage?.getItem(`biblia:${key}`); const n = raw === null || raw === undefined ? Number.NaN : Number(raw); return Number.isFinite(n) && n >= min && n <= max ? n : fallback; } catch { return fallback; }
  };
  const icon = (name: IconName): SVGElement => {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
    svg.innerHTML = ICONS[name];
    return svg;
  };

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
  // the reading preferences the Biblia app had and this page can honour: theme, type sizes, line spacing, verse numbers, the level marks
  let theme = pref<Theme>('theme', 'auto', ['auto', 'light', 'dark']);
  let hebrewSize = numPref('hebrewSize', READING_DEFAULTS.hebrewSize, 18, 44);
  let greekSize = numPref('greekSize', READING_DEFAULTS.greekSize, 16, 36);
  let lineHeight = numPref('lineHeight', READING_DEFAULTS.lineHeight, 1.4, 2.6);
  let verseNumbers = pref<'on' | 'off'>('verseNumbers', 'on', ['on', 'off']) === 'on';
  let levelMarks = pref<'on' | 'off'>('levelMarks', 'on', ['on', 'off']) === 'on';
  const docEl = doc.documentElement;
  /** The preferences as attributes and custom properties of the page, so the stylesheet does the rest and nothing needs re-rendering. */
  function applyPrefs(): void {
    try {
      if (theme === 'auto') docEl.removeAttribute('data-theme'); else docEl.setAttribute('data-theme', theme);
      docEl.setAttribute('data-verse-numbers', verseNumbers ? 'on' : 'off');
      docEl.setAttribute('data-level-marks', levelMarks ? 'on' : 'off');
      docEl.style.setProperty('--reading-font-size', `${hebrewSize}px`);
      docEl.style.setProperty('--greek-font-size', `${greekSize}px`);
      docEl.style.setProperty('--reading-line-height', String(lineHeight));
    } catch { /* a document without styles */ }
  }
  applyPrefs();

  const card: CardUI = createCardUI({ doc, speech: (win as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis ?? null, onDismiss: () => clearSelection() });
  let selectedButton: HTMLElement | undefined;
  let offCardLevel: (() => void) | undefined; // the open card follows its word's level on the page until it closes
  const clearSelection = (): void => { selectedButton?.classList.remove('sel'); selectedButton = undefined; offCardLevel?.(); offCardLevel = undefined; };

  let route = '';
  const account = deps.account;
  const baseNotices: string[] = [...analyserNotes, ...indexes.notes];
  /** Where lookups and marks go, per mode (read live: the standalone edition changes mode when the learner signs in or out). */
  function recordingNotice(): string {
    const mode = deps.recorder.mode;
    if (mode === 'app') return 'Your lookups and marks are recorded in your GoReview account, under a Hebrew or Greek enrolment whose variety is the period of the text; they reach your review on this phone and everywhere you sign in.';
    if (mode === 'extension') return 'Your lookups and marks are recorded in the GoLearn extension’s on-device Repository, under a Hebrew or Greek enrolment whose variety is the period of the text (Biblical Hebrew, Biblical Aramaic, Koine Greek); GoReview reads them from there.';
    if (mode === 'account') return `Your lookups and marks are recorded in your GoLearn account${account?.state().email ? ` (${account.state().email})` : ''}, under a Hebrew or Greek enrolment whose variety is the period of the text; GoReview and the GoLearn extension read them there. The words you have met anywhere are marked on the page by how well you know them.`;
    return deps.recorder.reason ?? 'Nothing is recorded here.';
  }
  const readerNotices = (): string[] => [...baseNotices, ...(deps.recorder.mode === 'none' && deps.recorder.reason ? [deps.recorder.reason] : [])];
  const libraryNotices = (): string[] => [...baseNotices, recordingNotice()];

  // the knowledge levels on the chapter being read: only with an account (the standalone edition), only while signed in
  const levels = account ? createLevels({ win, doc, api: () => account.api(), onAuthExpired: () => account.expire() }) : undefined;
  const siteByEl = new WeakMap<HTMLElement, LevelSite>();
  /** The verses whose words were already recorded as read this session (`lang|book.ch.v`): one exposure event per verse. */
  const verseExposed = new Set<string>();
  const sitesOfView = new WeakMap<HTMLElement, LevelSite[]>();
  const unitsOf = (events: GoEvent[]): string[] => [...new Set(events.flatMap((e) => e.subject?.itemIds ?? []))];
  const offAppended = account?.onAppended((events) => { void levels?.refresh(unitsOf(events)); });
  const offAccount = account?.subscribe(() => {
    const st = account.state();
    if (!st.signedIn) levels?.clear();
    if (route === 'library' || route === 'account' || route === 'settings') void render();
    else if (!st.signedIn && st.expired) showNotice('Your sign-in has ended, so the levels are no longer shown. Sign in again from the library; what you did since is kept on this device and sent after.');
  });

  // ── the top bars ──
  /** A bar button: a link to a route, with an icon. `current` marks the page being shown. */
  function iconLink(href: string, label: string, name: IconName, opts: { current?: boolean; active?: boolean; title?: string } = {}): HTMLElement {
    return h('a', { href, class: `iconbtn${opts.active ? ' iconbtn--active' : ''}`, 'aria-label': label, title: opts.title ?? label, ...(opts.current ? { 'aria-current': 'page' } : {}) }, icon(name));
  }
  /** The account and settings icons at the right of the home and plain bars (the account only where the edition has one). */
  function barIcons(current?: 'account' | 'settings'): Node[] {
    const out: Node[] = [];
    if (account) {
      const st = account.state();
      out.push(iconLink('#/account', 'Account', 'account', { current: current === 'account', active: st.signedIn, title: st.signedIn ? `Account · ${st.email ?? 'signed in'}` : 'Sign in' }));
    }
    out.push(iconLink('#/settings', 'Settings', 'settings', { current: current === 'settings' }));
    return out;
  }
  /** The library's bar: the BIBLIA wordmark at the left (and the way back to GoReview inside that app), the icons at the right. */
  function homeBar(): HTMLElement {
    return h('header', { class: 'topbar' },
      deps.backUrl ? h('a', { href: deps.backUrl, class: 'textlink back' }, '← GoReview') : null,
      h('a', { href: '#/', class: 'topbar__title', 'aria-label': 'Biblia, the library' }, 'Biblia'),
      h('div', { class: 'topbar__spacer' }), ...barIcons());
  }
  /** The bar of every other page: the back chevron, the title in tracked capitals, the icons. */
  function plainBar(title: string, current?: 'account' | 'settings', back = '#/'): HTMLElement {
    return h('header', { class: 'topbar' },
      iconLink(back, back === '#/' ? 'Library' : 'Back', 'back'),
      h('div', { class: 'topbar__title' }, title),
      h('div', { class: 'topbar__spacer' }), ...barIcons(current));
  }

  // ── library ──
  const storedLast = (): { id: string; ch: number } | undefined => {
    try {
      const m = /^([^/]+)\/(\d+)$/.exec(deps.storage?.getItem('biblia:last') ?? '');
      return m && canon.validRef(m[1], Number(m[2])) ? { id: m[1], ch: Number(m[2]) } : undefined;
    } catch { return undefined; }
  };
  const loadOpen = (): Set<string> => {
    try {
      const raw = deps.storage?.getItem(HOME_OPEN_KEY);
      const v: unknown = raw ? JSON.parse(raw) : undefined;
      if (Array.isArray(v)) return new Set(v.filter((x): x is string => typeof x === 'string'));
    } catch { /* unreadable: the default */ }
    return new Set(['tanakh', 'nt']);
  };
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

  /** The tree, as the Biblia app drew it: testament → division → book → chapters, each level a button head with a chevron over a height-animated collapsible. */
  function renderLibrary(): HTMLElement {
    const last = storedLast();
    const open = loadOpen();
    const remember = (): void => { try { deps.storage?.setItem(HOME_OPEN_KEY, JSON.stringify([...open])); } catch { /* storage blocked */ } };
    function group(id: string, level: 1 | 2 | 3, title: string, native: string, lang: BibliaLang, meta: string, children: Node[], current = false): HTMLElement {
      const isOpen = open.has(id);
      const chev = h('span', { class: `lib__chev${isOpen ? ' lib__chev--open' : ''}`, 'aria-hidden': 'true' }, icon('chevronRight'));
      const head = h('button', { type: 'button', class: 'lib__head', 'aria-expanded': String(isOpen) },
        chev, h('span', { class: 'lib__title' }, title), h('span', { class: `lib__native ${lang}`, lang, dir: 'auto' }, native), h('span', { class: 'lib__meta' }, meta));
      const inner = h('div', { class: 'collapsible__inner' }, h('div', { class: 'lib__children' }, ...children));
      if (!isOpen) inner.setAttribute('inert', '');
      const collapsible = h('div', { class: 'collapsible', 'data-open': String(isOpen) }, inner);
      head.addEventListener('click', () => {
        const now = !open.has(id);
        if (now) open.add(id); else open.delete(id);
        remember();
        head.setAttribute('aria-expanded', String(now));
        collapsible.setAttribute('data-open', String(now));
        chev.classList.toggle('lib__chev--open', now);
        if (now) inner.removeAttribute('inert'); else inner.setAttribute('inert', '');
      });
      return h('div', { class: `lib__group lib__group--${level}${current ? ' lib__group--current' : ''}`, 'data-id': id }, head, collapsible);
    }
    const nav = h('nav', { class: 'lib', 'aria-label': 'Books' });
    for (const t of TREE) {
      const divisions = t.divisions.map((d) => {
        const books = canon.booksOf(d).map((b) => {
          const chapters = h('div', { class: 'entrylist', role: 'list', 'aria-label': `${b.en} chapters` });
          b.verses.forEach((count, i) => {
            const ch = i + 1;
            const at = last?.id === b.id && last.ch === ch;
            chapters.append(h('a', { href: `#/read/${b.id}/${ch}`, role: 'listitem', class: `entry entry--chapter${at ? ' entry--at' : ''}`, 'aria-label': `${b.en} ${ch}, ${plural(count, 'verse', 'verses')}` },
              h('span', { class: 'entry__num' }, `Chapter ${ch}`),
              h('span', { class: `entry__native ${b.lang}`, lang: b.lang, dir: 'auto' }, `${b.lang === 'he' ? 'פֶּרֶק' : 'Κεφάλαιον'} ${numeral(b.lang, ch)}`),
              h('span', { class: 'entry__preview' }, `${plural(count, 'verse', 'verses')}${at ? ' · reading' : ''}`)));
          });
          return group(b.id, 3, b.en, b.native, b.lang, `${b.verses.length} ch`, [chapters], last?.id === b.id);
        });
        return group(d.id, 2, d.title, d.native, t.lang, plural(books.length, 'book', 'books'), books);
      });
      const bookCount = t.divisions.reduce((n, d) => n + canon.booksOf(d).length, 0);
      nav.append(group(t.id, 1, t.title, t.native, t.lang, plural(bookCount, 'book', 'books'), divisions));
    }
    const lastBook = last ? canon.book(last.id) : undefined;
    const resume = last && lastBook
      ? h('a', { class: 'home__continue', href: `#/read/${last.id}/${last.ch}` },
        h('span', { class: 'home__continue-label' }, 'Continue reading'),
        h('div', { class: 'home__continue-ref' }, canon.refLabel(last.id, last.ch)),
        h('div', { class: 'home__continue-sub', lang: lastBook.lang, dir: 'auto' }, `${lastBook.native} ${numeral(lastBook.lang, last.ch)}`))
      : null;
    const page = h('div', { class: 'page home route-fade' },
      h('h1', { class: 'home__title' },
        h('span', { class: 'he', lang: 'he' }, 'תַּנַ״ךְ'),
        h('span', { class: 'gr', lang: 'el' }, 'Ἡ Καινὴ Διαθήκη'),
        'Biblia Sacra'),
      h('p', { class: 'home__subtitle' }, 'The holy scripture in the original language with a linguistic apparatus underneath.'),
      h('div', { class: 'home__rule' }),
      accountLine(), resume, nav,
      h('div', { class: 'home__about' }, ...libraryNotices().map((n) => h('p', {}, n)), sourcesNote()));
    return h('div', {}, homeBar(), page);
  }

  /** Standalone edition only, under the masthead: who is signed in (the account screen has Sign out too), or the way to sign in. */
  function accountLine(): HTMLElement | null {
    if (!account) return null;
    const st = account.state();
    if (!st.signedIn) return h('p', { class: 'accountline', id: 'accountline' }, h('a', { href: '#/account' }, st.expired ? 'Your sign-in ended: sign in again' : 'Sign in to record what you read'));
    const out = h('button', { type: 'button', class: 'linklike', id: 'signout' }, 'Sign out');
    out.addEventListener('click', () => { void account.signOut(); });
    const waiting = deps.recorder.pending?.() ?? 0;
    return h('p', { class: 'accountline', id: 'accountline' }, `Signed in as ${st.email ?? 'your account'}`, st.offline ? ' (the service could not be reached; what you do is kept on this device)' : '', waiting ? ` · ${waiting} waiting to be sent` : '', ' · ', out);
  }

  function sourcesNote(): HTMLElement {
    return h('div', { class: 'sources' },
      'Texts: Miqra according to the Masorah (CC BY-SA 4.0, via Sefaria) with the Open Scriptures Hebrew Bible morphology (CC BY 4.0); The Greek New Testament: SBL Edition (CC BY 4.0) with MorphGNT (CC BY-SA 3.0). ',
      'Every word is read by the Go analysers for Hebrew and Greek; nothing here has been reviewed by a Hebrew scholar, a classicist or a native speaker. ',
      h('a', { href: '#/sources' }, 'Sources and limits'));
  }

  // ── reader ──
  interface WordRef { lang: BibliaLang; book: string; ch: number; v: number; sentence: string; start: number; end: number; surface: string; varietyId: string; gold?: { lemmaId: string; code: string; source: string } }

  function renderHebrewVerse(info: BookInfo, ch: number, v: HeVerse, aramaic: boolean, sites: LevelSite[]): HTMLElement {
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
        el.append(wordButton({ lang: 'he', book: info.id, ch, v: v.n, sentence: text, start: t.start, end: t.end, surface: piece, varietyId, ...(gold ? { gold } : {}) }, sites));
      } else el.append(doc.createTextNode(piece));
      el.append(doc.createTextNode(text.slice(t.end, nextStart(text, t.end))));
    }
    if (v.pe) el.append(h('span', { class: 'mark' }, ' פ '));
    if (v.s) el.append(h('span', { class: 'mark' }, ' ס '));
    return el;
  }
  /** The whitespace between a token's end and the next non-space character (tokens drop whitespace; the text keeps it). */
  const nextStart = (text: string, from: number): number => { let i = from; while (i < text.length && /\s/u.test(text[i])) i++; return i; };

  function renderGreekVerse(info: BookInfo, ch: number, v: GrVerse, sites: LevelSite[]): HTMLElement {
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
        el.append(wordButton({ lang: 'el', book: info.id, ch, v: v.n, sentence: text, start: t.start, end: t.end, surface: piece, varietyId: 'el-koi', ...(gold ? { gold } : {}) }, sites));
      } else el.append(doc.createTextNode(piece));
      el.append(doc.createTextNode(text.slice(t.end, nextStart(text, t.end))));
    }
    return el;
  }

  function wordButton(ref: WordRef, sites: LevelSite[]): HTMLElement {
    const b = h('button', { type: 'button', class: 'word', lang: ref.lang }, ref.surface);
    b.addEventListener('click', () => { void lookup(ref, b); });
    // every word's site is kept (it is cheap), levels or not: a tap needs its verse's other words for the exposure event
    const site: LevelSite = { el: b, lang: ref.lang, sentence: ref.sentence, start: ref.start, end: ref.end, surface: ref.surface, varietyId: ref.varietyId, ...(ref.gold ? { gold: { lemmaId: ref.gold.lemmaId, code: ref.gold.code } } : {}) };
    siteByEl.set(b, site);
    if (levels) sites.push(site);
    return b;
  }

  /** The exposure of a verse: one EncounterRecorded, the first time a word of the verse is tapped this session, for the unit ids of the verse's other words. */
  function verseExposure(ref: WordRef, button: HTMLElement, tappedIds: string[], base: { identity: Identity; version: string; sessionId: string; now: Date; language: LanguageEvidenceInfo }): GoEvent | undefined {
    const key = `${ref.lang}|${ref.book}.${ref.ch}.${ref.v}`;
    if (verseExposed.has(key)) return undefined;
    const verseEl = button.closest('.verse');
    if (!verseEl) return undefined;
    const sites: LevelSite[] = [];
    for (const w of verseEl.querySelectorAll<HTMLElement>('button.word')) { const s = siteByEl.get(w); if (s) sites.push(s); }
    if (!sites.length) return undefined;
    verseExposed.add(key);
    const readings: NonNullable<Parameters<typeof unitIdsOfSite>[1]> = new Map();
    const own = new Set(tappedIds);
    const ids = new Set<string>();
    for (const s of sites) for (const id of unitIdsOfSite(s, readings)) if (!own.has(id)) ids.add(id);
    if (!ids.size) return undefined;
    return buildEncounterEvent({ languageId: ref.lang, itemIds: [...ids], readerId: READER_ID, identity: base.identity, version: base.version, sessionId: base.sessionId, now: base.now, language: base.language, surface: 'biblia-reading', tokenCount: sites.length, contextKind: 'sentence' });
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
      const events: GoEvent[] = [selection];
      const exposure = verseExposure(ref, button, model.itemIds, base);
      if (exposure) events.push(exposure);
      void deps.recorder.record(events).then((r2) => { if (!r2.ok) showNotice(`Could not record this lookup: ${r2.message ?? 'unknown reason'}.`); else if (r2.message) showNotice(r2.message); });
      const site = siteByEl.get(button);
      if (levels && site) { levels.learn(site, model.itemIds); levels.met(model.itemIds); }
    }
    // the card opens showing how well the word is known (the level the page paints on it: the learner's own mark first, else the service's
    // rows; a word still New is Seen from this tap, which is the only state the tap itself changes) and follows it while open, so the rows
    // fetched after the tap, or a mark made on another device, show on the card without reopening it
    const profileNow = (): Partial<CardView> | undefined => {
      const p = levels?.profileOf(button);
      if (!p) return undefined;
      return { profile: { state: p.level ? 'ready' : 'loading', weak: [], ...(p.level ? { level: p.level } : {}), ...(p.encounters !== undefined ? { encounters: p.encounters } : {}) } };
    };
    offCardLevel?.();
    offCardLevel = levels?.subscribe(() => {
      if (selectedButton !== button) return;
      const p = profileNow();
      if (p) card.update(p);
    });
    card.show(model, anchor, {
      view: {
        languageName: `${LANGUAGE_NAME[ref.lang]} · ${canon.refLabel(ref.book, ref.ch)}:${ref.v}`,
        ...(profileNow() ?? {}),
        // "view sources": the analyser's own sources for this language (the Open Scriptures morphology, MorphGNT, the Wiktionary tables, the rules)
        sources: Object.values((ref.lang === 'he' ? heAdapter : elAdapter).sources ?? {}).map((s) => ({ label: s.label, ...(s.licence ? { licence: s.licence } : {}) })),
      },
      actions: {
        onLayer: (layer) => { if (ictx) void deps.recorder.record([buildAssistanceEvent({ ...ictx, now: deps.now() }, layer as ExpandedLayer)]).then((r2) => { if (!r2.ok) showNotice(`Could not record this: ${r2.message ?? 'unknown reason'}.`); }); },
        onRate: (mark) => {
          if (!ictx) { showNotice(deps.recorder.reason ?? 'Nothing is recorded here.'); return; }
          const when = deps.now();
          levels?.mark(model.itemIds, mark as KnowledgeLevel, when.toISOString()); // the word is repainted at once, before the service has answered
          void deps.recorder.record([buildMarkEvent({ ...ictx, now: when }, mark as KnowledgeLevel)]).then((r2) => {
            if (!r2.ok) levels?.forget(model.itemIds);
            else if (r2.message) showNotice(r2.message);
            card.update({ rated: r2.ok ? mark : undefined, correction: r2.ok ? { state: 'idle' } : { state: 'error', message: `Could not save that: ${r2.message ?? 'unknown reason'}. Try again.` } });
          });
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

  /** While signed in (standalone edition): what the marks on the words mean. */
  function levelLegend(): HTMLElement | null {
    if (!levels || !account?.state().signedIn) return null;
    const item = (level: string, label: string): HTMLElement => h('span', { class: 'legend-item' }, h('span', { class: 'swatch', 'data-level': level }, 'אα'), ` ${label}`);
    return h('div', { class: 'legend', id: 'level-legend' }, 'How well you know each word: ', item('new', 'New'), ' · ', item('seen', 'Seen'), ' · ', item('recognized', 'Recognized'), ' · ', item('familiar', 'Familiar'), '; known words carry no mark.');
  }

  async function renderReader(bookId: string, ch: number): Promise<HTMLElement> {
    const info = canon.book(bookId);
    if (!info || !canon.validRef(bookId, ch)) {
      return h('div', {}, plainBar('Biblia'), h('div', { class: 'screen' }, h('h1', {}, 'Not found'),
        h('div', { class: 'notice err' }, info ? `${info.en} has ${info.verses.length} chapters; there is no chapter ${ch}.` : `No book called “${bookId}”.`),
        h('p', {}, info ? h('a', { class: 'btn', href: `#/read/${info.id}/1` }, `${info.en} 1`) : null, info ? ' ' : null, h('a', { class: 'btn', href: '#/' }, 'Library'))));
    }
    setPref('last', `${bookId}/${ch}`);
    let book: AnyBook;
    try { book = await texts.loadBook(info.lang, bookId); } catch (e) {
      return h('div', {}, plainBar(canon.refLabel(bookId, ch)), h('div', { class: 'screen' }, h('div', { class: 'notice err' }, `The text could not be loaded (${e instanceof Error ? e.message : String(e)}). Run npm run biblia:import to copy the texts from the Biblia app.`)));
    }
    const chapter = book.chapters[ch - 1];
    const prev = canon.adjacent(bookId, ch, -1);
    const next = canon.adjacent(bookId, ch, 1);
    /** The reader's footer: PREVIOUS and NEXT with the chapter names; in Hebrew the bar runs right to left, as the text does. */
    const navButton = (dir: 'Previous' | 'Next', to: { book: string; ch: number } | undefined): HTMLElement => {
      const cls = `reader__nav-btn${dir === 'Next' ? ' reader__nav-btn--next' : ''}`;
      const body = [h('span', { class: 'reader__nav-dir' }, dir), h('span', { class: 'reader__nav-cite' }, to ? canon.refLabel(to.book, to.ch) : '')];
      return to ? h('a', { href: `#/read/${to.book}/${to.ch}`, class: cls, rel: dir === 'Next' ? 'next' : 'prev' }, ...body) : h('span', { class: `${cls} is-disabled`, 'aria-disabled': 'true' }, ...body);
    };
    const nav = h('nav', { class: 'reader__nav', 'aria-label': 'Chapters' }, h('div', { class: 'reader__nav-inner', dir: info.lang === 'he' ? 'rtl' : 'ltr' }, navButton('Previous', prev), navButton('Next', next)));
    const sites: LevelSite[] = [];
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
      for (const v of verses) { const ar = verseIsAramaic(v); if (ar) aramaicVerses++; prose.append(renderHebrewVerse(info, ch, v, ar, sites), doc.createTextNode(' ')); if (v.pe) prose.append(h('span', { class: 'para-break', 'aria-hidden': 'true' })); }
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
      for (const v of verses) prose.append(renderGreekVerse(info, ch, v, sites), doc.createTextNode(' '));
    }
    const period = info.lang === 'he'
      ? (aramaicVerses ? `Read as Biblical Hebrew; ${aramaicVerses} verse${aramaicVerses === 1 ? '' : 's'} of this chapter are Biblical Aramaic (marked) and are read as Aramaic.` : 'Read as Biblical Hebrew (the Masoretic text, with its cantillation).')
      : `Read as Koine Greek (the Greek New Testament)${indexes.ancient ? `; the Attic and Homeric tables are loaded for this chapter's words (${indexes.ancient.loaded().length} shards in memory)` : ''}.`;
    noticeEl = h('div', { class: 'notice', role: 'status', hidden: '' });
    const chapters = info.verses.length;
    const header = h('header', { class: 'reader__header' },
      h('div', { class: 'reader__header-inner' },
        iconLink('#/', 'Library', 'back'),
        h('div', { class: 'reader__headbtn' },
          h('span', { class: 'reader__crumb' }, `${info.en} · ${ch} / ${chapters}`),
          h('span', { class: `reader__chapter${info.lang === 'he' ? '' : ' reader__chapter--ltr'}`, lang: info.lang, dir: info.lang === 'he' ? 'rtl' : 'ltr' }, `${info.native} ${numeral(info.lang, ch)}`)),
        h('div', { class: 'topbar__spacer' }),
        iconLink('#/settings', 'Reading settings', 'type')),
      h('div', { class: 'reader__progress' }, h('span', { style: `width:${((ch / chapters) * 100).toFixed(2)}%` })));
    const column = h('div', { class: 'reader__col' },
      h('div', { class: 'reader__title' }, canon.refLabel(bookId, ch)),
      h('div', { class: 'period' }, period), levelLegend(),
      ...[...readerNotices(), ...chapterNotes].map((n) => h('div', { class: 'notice' }, n)),
      prose, noticeEl,
      h('div', { class: 'reader__end' }, sourcesNote()));
    const view = h('div', { class: `reader reader--${info.lang}` }, header, column, nav);
    sitesOfView.set(view, sites);
    return view;
  }

  // ── settings and sources, in GoReview's design: the centred column, the title with its rule, cards with a tracked-capitals kicker ──
  /** A card: a section whose h2 is the kicker. */
  const kickerCard = (id: string, title: string, ...children: Child[]): HTMLElement => h('section', { class: 'card', id, 'aria-labelledby': `${id}-h` }, h('h2', { id: `${id}-h` }, title), ...children);
  const para = (text: string, cls?: string): HTMLElement => h('p', cls ? { class: cls } : {}, text);
  const legalLinks = (): HTMLElement => h('p', { class: 'muted legal-links' }, h('a', { href: '#/terms', id: 'link-terms' }, 'Terms'), ' · ', h('a', { href: '#/privacy', id: 'link-privacy-policy' }, 'Privacy Policy'), ' (drafts)');

  /** A group of pill buttons, one pressed. */
  function pills<T extends string>(label: string, options: ReadonlyArray<readonly [T, string]>, current: T, onPick: (v: T) => void): HTMLElement {
    const wrap = h('div', { class: 'pills', role: 'group', 'aria-label': label });
    const buttons = options.map(([value, text]) => {
      const b = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(value === current), 'data-value': value }, text);
      b.addEventListener('click', () => { onPick(value); for (const x of buttons) x.setAttribute('aria-pressed', String(x === b)); });
      return b;
    });
    wrap.append(...buttons);
    return wrap;
  }
  const labelled = (caption: string, control: HTMLElement): HTMLElement => h('div', { class: 'field' }, h('span', { class: 'cap' }, caption), control);
  function slider(id: string, caption: string, min: number, max: number, step: number, value: number, format: (n: number) => string, onInput: (n: number) => void): HTMLElement {
    const input = h('input', { type: 'range', id, min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
    const out = h('span', { class: 'slider__value' }, format(value));
    input.addEventListener('input', () => { const n = Number(input.value); out.textContent = format(n); onInput(n); });
    return h('div', { class: 'field field--slider' }, h('label', { class: 'cap', for: id }, caption, ' · ', out), input);
  }
  function toggle(id: string, text: string, help: string | undefined, checked: boolean, onChange: (on: boolean) => void): HTMLElement {
    const input = h('input', { type: 'checkbox', id }) as HTMLInputElement;
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'toggle' }, input, h('span', {}, text, help ? h('span', { class: 'help' }, ` ${help}`) : null));
  }

  function renderSettings(): HTMLElement {
    const reading = kickerCard('settings-reading', 'Reading',
      labelled('Theme', pills<Theme>('Theme', [['auto', 'auto'], ['light', 'light'], ['dark', 'dark']], theme, (v) => { theme = v; setPref('theme', v); applyPrefs(); })),
      slider('set-hebrew-size', 'Hebrew size', 18, 44, 1, hebrewSize, (n) => `${n}px`, (n) => { hebrewSize = n; setPref('hebrewSize', String(n)); applyPrefs(); }),
      slider('set-greek-size', 'Greek size', 16, 36, 1, greekSize, (n) => `${n}px`, (n) => { greekSize = n; setPref('greekSize', String(n)); applyPrefs(); }),
      slider('set-line-height', 'Line spacing', 1.4, 2.6, 0.05, lineHeight, (n) => n.toFixed(2), (n) => { lineHeight = n; setPref('lineHeight', String(n)); applyPrefs(); }),
      labelled('Hebrew text', pills<HebrewDisplay>('Hebrew text', (['full', 'niqqud', 'consonants'] as HebrewDisplay[]).map((d) => [d, SHORT_DISPLAY[d]] as const), hebrewDisplay, (d) => { hebrewDisplay = d; setPref('hebrewDisplay', d); })),
      para('The Hebrew analyser always reads the full Masoretic text, whatever is displayed; the display only hides marks. The choice applies to the next chapter you open.', 'muted hint'),
      toggle('set-verse-numbers', 'Verse numbers', undefined, verseNumbers, (on) => { verseNumbers = on; setPref('verseNumbers', on ? 'on' : 'off'); applyPrefs(); }),
      toggle('set-level-marks', 'Mark the words by how well I know them', '(only while signed in)', levelMarks, (on) => { levelMarks = on; setPref('levelMarks', on ? 'on' : 'off'); applyPrefs(); }),
      h('div', { class: 'row' }, (() => {
        const reset = h('button', { type: 'button', class: 'btn', id: 'settings-reset' }, 'Reset settings');
        reset.addEventListener('click', () => {
          for (const name of PREF_NAMES) { try { deps.storage?.removeItem(`biblia:${name}`); } catch { /* storage blocked */ } }
          hebrewDisplay = 'full'; theme = 'auto'; hebrewSize = READING_DEFAULTS.hebrewSize; greekSize = READING_DEFAULTS.greekSize; lineHeight = READING_DEFAULTS.lineHeight; verseNumbers = true; levelMarks = true;
          applyPrefs();
          void render();
        });
        return reset;
      })()));

    // the account: who, Sign out, or the way in
    const accountCard = kickerCard('settings-account', 'Account');
    if (!account) {
      accountCard.append(para('This edition has no sign-in of its own.', 'muted'), para(recordingNotice(), 'muted'));
    } else {
      const st = account.state();
      if (st.signedIn) {
        const out = h('button', { type: 'button', class: 'btn', id: 'settings-signout' }, 'Sign out');
        out.addEventListener('click', () => { void account.signOut(); });
        const waiting = deps.recorder.pending?.() ?? 0;
        accountCard.append(
          h('p', { id: 'settings-email' }, `Signed in as ${st.email ?? 'your account'}`),
          para(recordingNotice(), 'muted'),
          // the live sync notice (pending items, Sync now, last sent) lives here; without it, the plain count
          ...(deps.syncStatus ? [deps.syncStatus] : waiting ? [para(`${waiting} lookup${waiting === 1 ? '' : 's'} and mark${waiting === 1 ? '' : 's'} waiting on this device to be sent.`, 'muted')] : []),
          h('div', { class: 'row' }, out, h('a', { class: 'btn', href: '#/account' }, 'Account')),
          legalLinks());
      } else {
        accountCard.append(
          h('p', { id: 'settings-signed-out', class: st.expired ? 'error' : 'muted' }, st.expired ? 'Your sign-in ended. Sign in again; what you did since is kept on this device and sent after.' : 'Not signed in.'),
          para(recordingNotice(), 'muted'),
          // an expired sign-in's notice names what waits on the device
          ...(deps.syncStatus && st.expired ? [deps.syncStatus] : []),
          h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/account', id: 'settings-signin' }, 'Sign in')),
          legalLinks());
      }
    }

    // the service the account lives on: read from config.json, never edited here
    const serviceCard = kickerCard('settings-service', 'Service');
    if (account) {
      serviceCard.append(
        h('label', { class: 'field' }, h('span', { class: 'cap' }, 'Go Repository service'),
          h('input', { type: 'url', id: 'settings-svc-url', value: account.serviceUrl, readonly: '', spellcheck: 'false', autocomplete: 'off' }),
          h('span', { class: 'help' }, 'Read from this copy’s config.json. Your email and password, and what you look up and mark, go to this service and nowhere else.')));
    } else serviceCard.append(para('No Repository service is connected in this edition.', 'muted'));

    // what the device keeps
    const installed = !!doc.querySelector('meta[name="biblia-edition"]');
    const waiting = deps.recorder.pending?.() ?? 0;
    const offline = kickerCard('settings-offline', 'Offline',
      para(installed
        ? 'This installed edition keeps the app itself from your first visit, and each chapter, lexicon file and dictionary shard the first time you open it, so a chapter you have read once opens without a connection. A chapter you have never opened needs one.'
        : 'This copy does not install itself for offline use: it opens each chapter from where it was loaded. The installable web edition keeps what you read on the device.'),
      para(`Also kept on this device by this page: your place (the last chapter you read), which parts of the library are open, and these settings${account ? `, and the sign-in${waiting ? `, with ${waiting} lookup${waiting === 1 ? '' : 's'} and mark${waiting === 1 ? '' : 's'} not yet sent` : ''}` : ''}.`, 'muted'));

    const sources = kickerCard('settings-sources', 'Sources & licences',
      sourcesNote(),
      para('Type: EB Garamond (Latin and Greek) and Frank Ruhl Libre (Hebrew), under the SIL Open Font License 1.1, copied with their licences.', 'muted'),
      h('p', { class: 'muted' },
        h('a', { href: './fonts/EB-Garamond-OFL.txt', target: '_blank', rel: 'noopener', id: 'link-ofl-garamond' }, 'EB Garamond licence'), ' · ',
        h('a', { href: './fonts/frank-ruhl-libre-OFL.txt', target: '_blank', rel: 'noopener', id: 'link-ofl-frank' }, 'Frank Ruhl Libre licence')));

    return h('div', { class: 'settings' }, plainBar('Biblia', 'settings'), h('div', { class: 'screen' }, h('h1', {}, 'Settings'), reading, accountCard, serviceCard, offline, sources));
  }
  function renderSources(): HTMLElement {
    return h('div', {}, plainBar('Biblia'), h('div', { class: 'screen' }, h('h1', {}, 'Sources and limits'),
      kickerCard('sources-list', 'Texts and analysis',
        h('ul', {},
          h('li', {}, 'Tanakh text: Miqra according to the Masorah (מקרא על פי המסורה), ed. Dovi, Hebrew Wikisource — CC BY-SA 4.0, via the Sefaria API; morphology: Open Scriptures Hebrew Bible (CC BY 4.0); glosses: BDB, Strong’s, the Open Scriptures lexical index (public domain).'),
          h('li', {}, 'Greek New Testament: The Greek New Testament: SBL Edition (Michael W. Holmes, ed.; SBL / Logos, 2010) — CC BY 4.0; analysis: MorphGNT (CC BY-SA 3.0); glosses: Dodson, Abbott-Smith, Strong’s (public domain); Septuagint counts: lxx-morph.'),
          h('li', {}, 'Both copied from the owner’s Biblia app’s data build (npm run biblia:import). None of that app’s parsing code is used: every word is read by the Go analysers adapter-he and adapter-el, whose readings are the sources’ own readings of these very words; the compiled cores hold the commonest words and the full indexes (loaded here when built) the rest.'))),
      kickerCard('sources-limits', 'Limits',
        para('No dictionary panel yet (BDB / Abbott-Smith entries are not shown); no search, no vocabulary list (GoReview shows the vocabulary); a form the Bible reads two ways shows both, the commoner first; nothing has been reviewed by a Hebrew scholar, a classicist or a native speaker; no voice exists for Biblical Hebrew or Koine Greek.')),
      kickerCard('sources-type', 'Type',
        para('EB Garamond (Latin and Greek) and Frank Ruhl Libre (Hebrew), SIL Open Font License 1.1.', 'muted')),
      h('p', {}, h('a', { class: 'btn', href: '#/' }, 'Library'))));
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
    else if (id === 'account' && account) { route = 'account'; view = renderAccountScreen({ doc, account, topbar: plainBar('Biblia', 'account'), done: () => { void api.go('#/'); } }); }
    else if ((id === 'privacy' || id === 'terms') && account) { route = id; view = renderLegalScreen({ doc, which: id, topbar: plainBar('Biblia', undefined, '#/account') }); }
    else { route = 'library'; view = renderLibrary(); }
    root.replaceChildren(view);
    try { win.scrollTo(0, 0); } catch { /* jsdom has no layout */ }
    if (levels) { const sites = sitesOfView.get(view); if (id === 'read' && sites) void levels.setChapter(route, sites); else void levels.setChapter(undefined, []); }
  }
  const onHash = (): void => { if ((win.location.hash || '#/') !== renderedHash) void render(); };
  win.addEventListener('hashchange', onHash);
  await render();

  const api: BibliaApp = {
    get route() { return route; },
    async go(hash: string) { win.location.hash = hash.startsWith('#') ? hash : `#/${hash.replace(/^\/+/, '')}`; await render(); },
    cardRoot: () => card.root() ?? undefined,
    destroy() {
      win.removeEventListener('hashchange', onHash);
      for (const a of ['data-theme', 'data-verse-numbers', 'data-level-marks']) docEl.removeAttribute(a);
      for (const p of ['--reading-font-size', '--greek-font-size', '--reading-line-height']) { try { docEl.style.removeProperty(p); } catch { /* no styles */ } }
      offAppended?.(); offAccount?.(); levels?.destroy(); deps.recorder.destroy?.();
      card.destroy();
    },
  };
  return api;
}
