/**
 * Reader — one component for Read (comprehensible input) and Scripture.
 *
 * The canonical target text is primary and never altered: sentences are rendered from their exact
 * `text`, tokens are laid over it by offset (gaps and punctuation stay plain text). Support is layered
 * and opened by the learner (see TokenCard); every opening emits its event with the assistance level so
 * GoLearn can discount evidence. English is never shown until asked for.
 *
 * Layout is Biblia's: a sticky crumb header with a progress hairline, the prose column, a fixed
 * Previous / Next text bar, and the word card as a bottom sheet that rises on every screen width.
 *
 * Events: TextViewed (once), SentenceViewed (once per sentence per session), TokenHelpOpened (level),
 * PhraseHelpOpened, GrammarHelpOpened, SentenceExplanationRevealed, EnglishRescueRevealed (scope),
 * TextCompleted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LANGUAGE_ROWS } from '../../core';
import type {
  AssistanceLevel, EnglishRescueRevealed, GrammarHelpOpened, PhraseHelpOpened, Sentence, SentenceExplanationRevealed,
  SentenceViewed, Text, TextCompleted, TextViewed, Token, TokenHelpOpened, TokenSupport,
} from '../../core';
import { useApp } from '../context';
import { makeEmitter } from '../events';
import { isTestimonyText, textPath } from '../format';
import { usePref } from '../prefs';
import type { HighlightPref } from '../prefs';
import { BackLink, I, IconBtn, Topbar } from '../ui';
import { TokenCard } from './TokenCard';
import { createViewDetector } from './viewDetection';
import type { ViewDetectorFactory } from './viewDetection';
import { useTextData } from './useTextData';
import type { TextData } from './useTextData';

export interface ReaderProps {
  textId: string;
  mode: 'corpus' | 'scripture';
  /** Injectable for tests; default is IntersectionObserver-based, null ⇒ manual "mark as read" buttons. */
  createDetector?: ViewDetectorFactory;
  /** Sentence currently playing (Player), highlighted and scrolled into view. */
  activeSentenceId?: string;
  /** Sentences whose text is hidden (listening-first transcript modes). */
  concealed?: (sentenceId: string) => boolean;
  /** A bar that stays pinned under the header (the Player). */
  bar?: ReactNode;
  /** Content above the text that scrolls with it (passage preparation). */
  before?: ReactNode;
}

interface VerseInfo { label: string; first: boolean; sentenceIds: string[] }

export function verseLabel(refs: string[]): string {
  const nums = refs.map((r) => r.split('.').pop() ?? r);
  return nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : (nums[0] ?? '');
}

function buildVerses(sentences: Sentence[]): Map<string, VerseInfo> {
  const out = new Map<string, VerseInfo>();
  let shared: string[] = [];
  let prevKey = '';
  for (const s of sentences) {
    const key = (s.verseRefs ?? []).join(',');
    if (!key) { prevKey = ''; continue; }
    const first = key !== prevKey;
    if (first) shared = [];
    prevKey = key;
    shared.push(s.id);
    out.set(s.id, { label: verseLabel(s.verseRefs ?? []), first, sentenceIds: shared });
  }
  return out;
}

/** Previous / next text in the same corpus, in the Library's order (by title). */
function useSiblings(text: Text): { prev?: Text; next?: Text } {
  const { store } = useApp();
  const [sib, setSib] = useState<{ prev?: Text; next?: Text }>({});
  useEffect(() => {
    let live = true;
    void (async () => {
      const [rows, cs] = await Promise.all([store.texts.where('corpusId', text.corpusId), store.corpora.all()]);
      const corpusMap = new Map(cs.map((c) => [c.id, c]));
      const list = rows
        .filter((t) => t.lang === text.lang && !isTestimonyText(t, corpusMap) && (t.kind === 'scripture') === (text.kind === 'scripture'))
        .sort((a, b) => a.title.localeCompare(b.title));
      const i = list.findIndex((t) => t.id === text.id);
      if (live) setSib(i < 0 ? {} : { prev: list[i - 1], next: list[i + 1] });
    })().catch(() => { /* the nav bar is a convenience */ });
    return () => { live = false; };
  }, [store, text.id, text.corpusId, text.lang, text.kind]);
  return sib;
}

export function Reader(props: ReaderProps) {
  const { session, userId } = useApp();
  const state = useTextData(props.textId);
  const back = props.mode === 'scripture' ? '/scripture' : '/read';
  const backLabel = props.mode === 'scripture' ? 'Scripture' : 'Library';
  const bare = (body: ReactNode) => (
    <div>
      <Topbar title={backLabel} left={<BackLink to={back} label={backLabel} />} />
      <div className="page">{body}</div>
    </div>
  );
  if (state.status === 'loading') return bare(<p className="muted" role="status">Loading…</p>);
  if (state.status === 'missing') return bare(<p role="alert">This text is not in your library.</p>);
  if (state.status === 'error') return bare(<p role="alert" className="error">Could not open this text: {state.message}</p>);
  return <ReaderBody key={`${props.textId}|${userId}|${session}`} data={state.data} {...props} />;
}

function ReaderBody({ data, mode, createDetector, activeSentenceId, concealed, bar, before }: ReaderProps & { data: TextData }) {
  const { bus, golearn, userId, session } = useApp();
  const { text } = data;
  const surface = mode === 'scripture' ? 'scripture' : 'corpus';
  const emitter = useMemo(() => makeEmitter({ bus, userId, lang: text.lang, session }), [bus, userId, text.lang, session]);
  const script = LANGUAGE_ROWS.find((l) => l.id === text.lang)?.script ?? 'Latn';
  const [highlight, setHighlight] = usePref('highlight');
  const [fontSize] = usePref('fontSize');
  const { prev, next } = useSiblings(text);
  const back = mode === 'scripture' ? '/scripture' : '/read';

  const rootRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const viewedRef = useRef(new Set<string>());
  const [viewed, setViewed] = useState<ReadonlySet<string>>(new Set());
  const [auto, setAuto] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);

  // ── English rescue state ──
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [parallel, setParallel] = useState(false);
  const emittedRescue = useRef(new Set<string>());

  // ── token card state ──
  const [card, setCard] = useState<{ token: Token; level: AssistanceLevel; supports: Partial<Record<number, TokenSupport>> } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const verses = useMemo(() => (mode === 'scripture' ? buildVerses(data.sentences) : new Map<string, VerseInfo>()), [mode, data.sentences]);
  const sentenceById = useMemo(() => new Map(data.sentences.map((s) => [s.id, s])), [data.sentences]);
  const anyRescue = data.rescues.size > 0;

  // The pinned bar (Player) sits just under the header, whatever height the header has (safe area, wrapping).
  useEffect(() => {
    const head = headRef.current;
    const root = rootRef.current;
    if (!head || !root) return;
    const set = () => root.style.setProperty('--head-h', `${head.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  // TextViewed once per session.
  useEffect(() => {
    void emitter.emit<TextViewed>(surface, { type: 'TextViewed', textId: text.id, dedupeKey: `textviewed:${session}:${text.id}` });
  }, [emitter, surface, session, text.id]);

  // ── SentenceViewed ──
  const onViewed = useCallback((sentenceId: string, dwellMs: number) => {
    if (viewedRef.current.has(sentenceId)) return;
    viewedRef.current.add(sentenceId);
    setViewed(new Set(viewedRef.current));
    const tokenIds = (data.tokensBySentence.get(sentenceId) ?? []).filter((t) => t.isWord).map((t) => t.id);
    void emitter.emit<SentenceViewed>(surface, {
      type: 'SentenceViewed', textId: text.id, sentenceId, tokenIds, dwellMs,
      dedupeKey: `view:${session}:${sentenceId}`,
    });
  }, [data.tokensBySentence, emitter, surface, session, text.id]);
  const onViewedRef = useRef(onViewed);
  onViewedRef.current = onViewed;

  useEffect(() => {
    const detector = (createDetector ?? createViewDetector)((id, dwell) => onViewedRef.current(id, dwell));
    setAuto(detector !== null);
    if (!detector || !rootRef.current) return;
    rootRef.current.querySelectorAll('[data-sentence-id]').forEach((el) => {
      detector.observe(el, el.getAttribute('data-sentence-id')!);
    });
    return () => detector.disconnect();
  }, [data, createDetector]);

  // Keep the playing sentence in view.
  useEffect(() => {
    if (!activeSentenceId || !rootRef.current) return;
    const el = [...rootRef.current.querySelectorAll('[data-sentence-id]')].find((e) => e.getAttribute('data-sentence-id') === activeSentenceId);
    (el as HTMLElement | undefined)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [activeSentenceId]);

  // ── English rescue ──
  const revealRescue = useCallback((sentenceIds: string[], scope: 'sentence' | 'verse' | 'parallel') => {
    const ids = sentenceIds.filter((id) => data.rescues.has(id));
    if (ids.length === 0) return;
    setShown((prev) => new Set([...prev, ...ids]));
    const key = `${scope}:${ids.join(',')}`;
    if (emittedRescue.current.has(key)) return;
    emittedRescue.current.add(key);
    void emitter.emit<EnglishRescueRevealed>(surface, { type: 'EnglishRescueRevealed', textId: text.id, sentenceIds: ids, scope });
  }, [data.rescues, emitter, surface, text.id]);

  const toggleRescue = useCallback((sentenceIds: string[], scope: 'sentence' | 'verse') => {
    const allShown = sentenceIds.every((id) => shown.has(id));
    if (allShown) {
      setShown((prev) => { const n = new Set(prev); sentenceIds.forEach((id) => n.delete(id)); return n; });
    } else {
      revealRescue(sentenceIds, scope);
    }
  }, [shown, revealRescue]);

  const toggleParallel = useCallback(() => {
    if (parallel) { setParallel(false); setShown(new Set()); return; }
    setParallel(true);
    revealRescue(data.sentences.map((s) => s.id), 'parallel');
  }, [parallel, revealRescue, data.sentences]);

  // ── token card ──
  const fetchSupport = useCallback(async (token: Token, level: AssistanceLevel) => {
    const support = await golearn.tokenSupport(userId, token.id, level);
    setCard((c) => (c && c.token.id === token.id ? { ...c, supports: { ...c.supports, [level]: support } } : c));
    return support;
  }, [golearn, userId]);

  const openToken = useCallback(async (token: Token) => {
    if (card && sheetOpen && card.token.id === token.id) { setSheetOpen(false); return; }
    setCard({ token, level: 1, supports: {} });
    setSheetOpen(true);
    await emitter.emit<TokenHelpOpened>(surface, { type: 'TokenHelpOpened', sentenceId: token.sentenceId, tokenId: token.id, itemId: token.formId, level: 1 });
    await fetchSupport(token, 1);
  }, [card, sheetOpen, emitter, surface, fetchSupport]);

  const moreHelp = useCallback(async () => {
    if (!card || card.level >= 5) return;
    const { token } = card;
    const level = (card.level + 1) as AssistanceLevel;
    setCard({ ...card, level });
    await emitter.emit<TokenHelpOpened>(surface, { type: 'TokenHelpOpened', sentenceId: token.sentenceId, tokenId: token.id, itemId: token.formId, level });
    const support = await fetchSupport(token, level);
    if (level === 2) {
      for (const { phrase, occurrence } of support.phrases) {
        await emitter.emit<PhraseHelpOpened>(surface, { type: 'PhraseHelpOpened', sentenceId: token.sentenceId, phraseOccurrenceId: occurrence.id, phraseId: phrase.id });
      }
    } else if (level === 3) {
      for (const pattern of support.patterns) {
        await emitter.emit<GrammarHelpOpened>(surface, { type: 'GrammarHelpOpened', sentenceId: token.sentenceId, patternId: pattern.id, tokenIds: [token.id] });
      }
    } else if (level === 4) {
      await emitter.emit<SentenceExplanationRevealed>(surface, { type: 'SentenceExplanationRevealed', sentenceId: token.sentenceId });
    } else if (level === 5) {
      revealRescue([token.sentenceId], 'sentence');
    }
  }, [card, emitter, surface, fetchSupport, revealRescue]);

  const finish = useCallback(async () => {
    setFinished(true);
    await emitter.emit<TextCompleted>(surface, { type: 'TextCompleted', textId: text.id, dedupeKey: `textcompleted:${session}:${text.id}` });
  }, [emitter, surface, session, text.id]);

  // ── rendering ──
  // Learner state → Biblia's mark classes: unseen = new, partial = recognized, known = familiar.
  const MARK: Record<string, string> = { unseen: 'st-new', partial: 'st-recognized', known: 'st-familiar' };

  const renderSentenceText = (s: Sentence): ReactNode[] => {
    const tokens = data.tokensBySentence.get(s.id) ?? [];
    const hl = data.support.get(s.id)?.highlight ?? {};
    const out: ReactNode[] = [];
    let cursor = 0;
    for (const t of tokens) {
      if (t.start < cursor) continue; // defensive: overlapping tokens never duplicate text
      if (t.start > cursor) out.push(s.text.slice(cursor, t.start));
      if (t.isWord) {
        const state = hl[t.id] ?? 'none';
        out.push(
          <button
            key={t.id}
            type="button"
            className={`w tok hl-${state}${MARK[state] ? ` ${MARK[state]}` : ''}${sheetOpen && card?.token.id === t.id ? ' sel is-open' : ''}`}
            data-token-id={t.id}
            aria-expanded={sheetOpen && card?.token.id === t.id}
            onClick={() => { void openToken(t); }}
          >{t.surface}</button>,
        );
      } else {
        out.push(t.surface);
      }
      cursor = t.end;
    }
    if (cursor < s.text.length) out.push(s.text.slice(cursor));
    return out;
  };

  const renderSentence = (s: Sentence) => {
    const verse = verses.get(s.id);
    const rescue = data.rescues.get(s.id);
    const isShown = shown.has(s.id);
    const cls = ['sent'];
    if (activeSentenceId === s.id) cls.push('sent--on');
    if (concealed?.(s.id)) cls.push('is-concealed');
    if (viewed.has(s.id)) cls.push('is-viewed');
    return (
      <span key={s.id} className={cls.join(' ')} data-sentence-id={s.id} lang={s.lang}>
        {verse?.first && (
          anyRescue ? (
            <button type="button" className="verse-btn" aria-label={`Show English for verse ${verse.label}`} onClick={() => toggleRescue(verse.sentenceIds, 'verse')}>
              <sup className="verse vn">{verse.label}</sup>
            </button>
          ) : <sup className="verse vn">{verse.label}</sup>
        )}
        <span className="sent-text">{renderSentenceText(s)}</span>
        <span className="sent-actions">
          {rescue && (
            <IconBtn
              className="iconbtn--mini sent__btn" active={isShown}
              label={`${isShown ? 'Hide' : 'Show'} English for sentence ${s.index + 1}`}
              onClick={() => toggleRescue([s.id], 'sentence')}
            >{I.english}</IconBtn>
          )}
          {auto === false && !viewed.has(s.id) && (
            <IconBtn className="iconbtn--mini sent__btn" label={`Mark sentence ${s.index + 1} as read`} onClick={() => onViewed(s.id, 0)}>{I.check}</IconBtn>
          )}
        </span>
        {isShown && rescue && <span className="rescue smode__layer" lang="en"><span className="label">English</span> {rescue.english}</span>}{' '}
      </span>
    );
  };

  const sentencesByParagraph = useMemo(() => {
    const m = new Map<string, Sentence[]>();
    for (const s of data.sentences) {
      const list = m.get(s.paragraphId) ?? [];
      list.push(s);
      m.set(s.paragraphId, list);
    }
    return m;
  }, [data.sentences]);

  const sectionBlocks = data.sections.map((sec) => {
    const paras = data.paragraphs.filter((p) => p.sectionId === sec.id);
    const sameAsTitle = sec.title !== undefined && sec.title.trim().toLowerCase() === text.title.trim().toLowerCase();
    const heading = sameAsTitle ? undefined : sec.title ?? (mode === 'scripture' && sec.chapter ? `Chapter ${sec.chapter}` : undefined);
    return (
      <section key={sec.id} className="reader-section">
        {heading && <h2 className="reader__section">{heading}</h2>}
        {paras.map((p) => (
          <p key={p.id} className="para">{(sentencesByParagraph.get(p.id) ?? []).map(renderSentence)}</p>
        ))}
      </section>
    );
  });

  const cardSentence = card ? sentenceById.get(card.token.sentenceId) : undefined;
  const allViewed = data.sentences.length > 0 && viewed.size >= data.sentences.length;
  const progress = data.sentences.length > 0 ? (viewed.size / data.sentences.length) * 100 : 0;
  const hasPanel = !!(card && cardSentence && sheetOpen);
  const marks = highlight === 'off' ? '' : highlight === 'strong' ? ' marks marks--strong' : ' marks';

  return (
    <article
      ref={rootRef}
      className={`reader${hasPanel ? ' reader--panel' : ''}`}
      data-mode={mode}
      data-script={script}
      data-highlight={highlight}
      lang={text.lang}
      aria-label={text.title}
      style={{ '--reading-font-size': `${fontSize}px` } as CSSProperties}
    >
      {card && cardSentence && (
        <TokenCard
          token={card.token}
          level={card.level}
          supports={card.supports}
          open={sheetOpen}
          explanation={data.support.get(cardSentence.id)?.explanation}
          english={data.rescues.get(cardSentence.id)?.english}
          lang={text.lang}
          onMore={() => { void moreHelp(); }}
          onClose={() => setSheetOpen(false)}
          onExited={() => setCard(null)}
        />
      )}

      <div className="reader__main">
        <header className="reader__header" ref={headRef}>
          <div className="reader__header-inner">
            <BackLink to={back} label={mode === 'scripture' ? 'Scripture' : 'Library'} />
            <div className="reader__headbtn">
              <span className="reader__crumb">{data.corpus?.title ?? (mode === 'scripture' ? 'Scripture' : 'Read')}</span>
              <h1 className="reader__chapter" lang={text.lang}>{text.title}</h1>
            </div>
            <IconBtn label="Settings" to="/settings">{I.settings}</IconBtn>
          </div>
          <div className="reader__progress"><span style={{ width: `${progress}%` }} /></div>
        </header>

        {bar}

        <div className={`reader__prose${marks}`}>
          <div className="reader__meta">
            <div className="chips">
              {text.generated && <span className="chip chip--wine" title="Machine-generated text">generated</span>}
              {text.version && <span className="chip">{text.version}</span>}
              {data.source?.rights === 'unverified' && <span className="chip chip--wine" title="Rights not established — replace before release">sample · rights unverified</span>}
            </div>
            <div className="reader__tools">
              <label className="tool">
                <span className="label">Highlight</span>
                <select value={highlight} onChange={(e) => setHighlight(e.target.value as HighlightPref)} aria-label="Highlighting">
                  <option value="off">off</option>
                  <option value="subtle">subtle</option>
                  <option value="strong">strong</option>
                </select>
              </label>
              {mode === 'scripture' && anyRescue && (
                <button type="button" className="btn btn--small btn--quiet" aria-pressed={parallel} onClick={toggleParallel}>Parallel English</button>
              )}
            </div>
          </div>

          {before}

          <div className="reader-body">{sectionBlocks}</div>

          <footer className="reader__end">
            {finished ? (
              <p className="muted" role="status">Marked as finished.</p>
            ) : (
              <button type="button" className={`btn${allViewed ? ' btn--primary' : ''}`} onClick={() => { void finish(); }}>I have finished reading</button>
            )}
          </footer>
        </div>

        {(prev || next) && (
          <nav className="reader__nav" aria-label="Texts">
            <div className="reader__nav-inner">
              {prev ? (
                <Link to={textPath(prev)} className="reader__nav-btn">
                  <span className="reader__nav-dir">Previous</span>
                  <span className="reader__nav-cite" lang={prev.lang}>{prev.title}</span>
                </Link>
              ) : <span />}
              {next ? (
                <Link to={textPath(next)} className="reader__nav-btn reader__nav-btn--next">
                  <span className="reader__nav-dir">Next</span>
                  <span className="reader__nav-cite" lang={next.lang}>{next.title}</span>
                </Link>
              ) : <span />}
            </div>
          </nav>
        )}
      </div>
    </article>
  );
}
