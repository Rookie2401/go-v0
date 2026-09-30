/**
 * Reader — one component for Read (comprehensible input) and Scripture.
 *
 * The canonical target text is primary and never altered: sentences are rendered from their exact
 * `text`, tokens are laid over it by offset (gaps and punctuation stay plain text). Support is layered
 * and opened by the learner (see TokenCard); every opening emits its event with the assistance level so
 * GoLearn can discount evidence. English is never shown until asked for.
 *
 * Events: TextViewed (once), SentenceViewed (once per sentence per session), TokenHelpOpened (level),
 * PhraseHelpOpened, GrammarHelpOpened, SentenceExplanationRevealed, EnglishRescueRevealed (scope),
 * TextCompleted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LANGUAGE_ROWS } from '../../core';
import type {
  AssistanceLevel, EnglishRescueRevealed, GrammarHelpOpened, PhraseHelpOpened, Sentence, SentenceExplanationRevealed,
  SentenceViewed, TextCompleted, TextViewed, Token, TokenHelpOpened, TokenSupport,
} from '../../core';
import { useApp } from '../context';
import { makeEmitter } from '../events';
import { usePref } from '../prefs';
import type { HighlightPref } from '../prefs';
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

export function Reader(props: ReaderProps) {
  const { session, userId } = useApp();
  const state = useTextData(props.textId);
  if (state.status === 'loading') return <p className="muted" role="status">Loading…</p>;
  if (state.status === 'missing') return <p role="alert">This text is not in your library.</p>;
  if (state.status === 'error') return <p role="alert">Could not open this text: {state.message}</p>;
  return <ReaderBody key={`${props.textId}|${userId}|${session}`} data={state.data} {...props} />;
}

function ReaderBody({ data, mode, createDetector, activeSentenceId, concealed }: ReaderProps & { data: TextData }) {
  const { bus, golearn, userId, session } = useApp();
  const { text } = data;
  const surface = mode === 'scripture' ? 'scripture' : 'corpus';
  const emitter = useMemo(() => makeEmitter({ bus, userId, lang: text.lang, session }), [bus, userId, text.lang, session]);
  const script = LANGUAGE_ROWS.find((l) => l.id === text.lang)?.script ?? 'Latn';
  const [highlight, setHighlight] = usePref('highlight');

  const rootRef = useRef<HTMLElement>(null);
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

  const verses = useMemo(() => (mode === 'scripture' ? buildVerses(data.sentences) : new Map<string, VerseInfo>()), [mode, data.sentences]);
  const sentenceById = useMemo(() => new Map(data.sentences.map((s) => [s.id, s])), [data.sentences]);
  const anyRescue = data.rescues.size > 0;

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
    if (card?.token.id === token.id) { setCard(null); return; }
    setCard({ token, level: 1, supports: {} });
    await emitter.emit<TokenHelpOpened>(surface, { type: 'TokenHelpOpened', sentenceId: token.sentenceId, tokenId: token.id, itemId: token.formId, level: 1 });
    await fetchSupport(token, 1);
  }, [card, emitter, surface, fetchSupport]);

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
  const renderSentenceText = (s: Sentence): ReactNode[] => {
    const tokens = data.tokensBySentence.get(s.id) ?? [];
    const hl = data.support.get(s.id)?.highlight ?? {};
    const out: ReactNode[] = [];
    let cursor = 0;
    for (const t of tokens) {
      if (t.start < cursor) continue; // defensive: overlapping tokens never duplicate text
      if (t.start > cursor) out.push(s.text.slice(cursor, t.start));
      if (t.isWord) {
        out.push(
          <button
            key={t.id}
            type="button"
            className={`tok hl-${hl[t.id] ?? 'none'}${card?.token.id === t.id ? ' is-open' : ''}`}
            data-token-id={t.id}
            aria-expanded={card?.token.id === t.id}
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
    if (activeSentenceId === s.id) cls.push('is-active');
    if (concealed?.(s.id)) cls.push('is-concealed');
    if (viewed.has(s.id)) cls.push('is-viewed');
    return (
      <span key={s.id} className={cls.join(' ')} data-sentence-id={s.id} lang={s.lang}>
        {verse?.first && (
          anyRescue ? (
            <button type="button" className="verse-btn" aria-label={`Show English for verse ${verse.label}`} onClick={() => toggleRescue(verse.sentenceIds, 'verse')}>
              <sup className="verse">{verse.label}</sup>
            </button>
          ) : <sup className="verse">{verse.label}</sup>
        )}
        <span className="sent-text">{renderSentenceText(s)}</span>
        <span className="sent-actions">
          {rescue && (
            <button type="button" className="mini" aria-pressed={isShown} aria-label={`${isShown ? 'Hide' : 'Show'} English for sentence ${s.index + 1}`} onClick={() => toggleRescue([s.id], 'sentence')}>EN</button>
          )}
          {auto === false && !viewed.has(s.id) && (
            <button type="button" className="mini" aria-label={`Mark sentence ${s.index + 1} as read`} onClick={() => onViewed(s.id, 0)}>✓</button>
          )}
        </span>
        {isShown && rescue && <span className="rescue" lang="en">{rescue.english}</span>}{' '}
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
        {heading && <h2 className="section-title">{heading}</h2>}
        {paras.map((p) => (
          <p key={p.id} className="para">{(sentencesByParagraph.get(p.id) ?? []).map(renderSentence)}</p>
        ))}
      </section>
    );
  });

  const cardSentence = card ? sentenceById.get(card.token.sentenceId) : undefined;
  const allViewed = data.sentences.length > 0 && viewed.size >= data.sentences.length;

  return (
    <article
      ref={rootRef}
      className="reader"
      data-mode={mode}
      data-script={script}
      data-highlight={highlight}
      lang={text.lang}
      aria-label={text.title}
    >
      <header className="reader-head">
        <h1>{text.title}</h1>
        <div className="badges">
          {text.generated && <span className="badge badge-warn" title="Machine-generated text">generated</span>}
          {text.version && <span className="badge">{text.version}</span>}
          {data.source?.rights === 'unverified' && <span className="badge badge-warn" title="Rights not established — replace before release">sample · rights unverified</span>}
        </div>
        <div className="reader-tools">
          <label className="tool">
            <span className="muted small">Highlight</span>{' '}
            <select value={highlight} onChange={(e) => setHighlight(e.target.value as HighlightPref)} aria-label="Highlighting">
              <option value="off">off</option>
              <option value="subtle">subtle</option>
              <option value="strong">strong</option>
            </select>
          </label>
          {mode === 'scripture' && anyRescue && (
            <button type="button" className="btn-quiet" aria-pressed={parallel} onClick={toggleParallel}>Parallel English</button>
          )}
        </div>
      </header>

      <div className="reader-body">{sectionBlocks}</div>

      <footer className="reader-foot">
        {finished ? (
          <p className="muted" role="status">Marked as finished.</p>
        ) : (
          <button type="button" className={allViewed ? 'btn-primary' : 'btn-quiet'} onClick={() => { void finish(); }}>I have finished reading</button>
        )}
      </footer>

      {card && cardSentence && (
        <TokenCard
          token={card.token}
          level={card.level}
          supports={card.supports}
          explanation={data.support.get(cardSentence.id)?.explanation}
          english={data.rescues.get(cardSentence.id)?.english}
          onMore={() => { void moreHelp(); }}
          onClose={() => setCard(null)}
        />
      )}
    </article>
  );
}
