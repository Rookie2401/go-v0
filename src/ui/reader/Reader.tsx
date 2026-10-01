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
 * Events: TextViewed (mode 'open', once per sitting), SentenceViewed (a sentence that stayed in view long enough, in
 * the reader itself, in a visible focused tab, with no preparation panel open; once per sentence per sitting),
 * TokenHelpOpened (level), PhraseHelpOpened, GrammarHelpOpened, SentenceExplanationRevealed,
 * EnglishRescueRevealed (scope), TextCompleted (explicit), ComprehensionReported. All carry the text's contentVersion
 * where the contract has the field.
 *
 * Progress is never fetched or formatted here: the block reads the canonical record through `useReadingProgress` (after
 * `golearn.settled()`, again on every event of this learner) and renders it with the shared `ProgressLine`.
 * EnglishRescueRevealed is deduped by (learner, SITTING, text, scope[, sentence set]) at the bus, not by a ref that lives
 * only as long as this component: remounting the reader, or toggling Parallel English off and on again, in the same
 * sitting emits nothing new. Turning it off emits nothing.
 *
 * Viewing is EXPOSURE only ("Seen"). What the learner says about understanding is a separate, deliberate, quiet act:
 * "Understood" on a sentence, and "How much did you understand? All · Most · Some · Little" at the end. Only
 * those reports (never views, never finishing) can demonstrate comprehension, and a report never fabricates a view.
 *
 * Assistance by stage: the course catalogue gives an AssistanceProfile (which help layers the word sheet offers and in
 * what order, how close English is, how much chrome shows). A course without a ladder gets DEFAULT_ASSISTANCE and the
 * reader is then exactly what it always was. Opening a layer emits the event LAYER_ASSISTANCE_LEVEL names for it:
 *   gloss → TokenHelpOpened 1 · decoding → DecodingRevealed (romanization: true only from the Stage 0 rescue button) ·
 *   phrase → TokenHelpOpened 2 + PhraseHelpOpened · grammar, discourse → TokenHelpOpened 3 + GrammarHelpOpened ·
 *   definition → TokenHelpOpened 3 · sentence → TokenHelpOpened 4 + SentenceExplanationRevealed ·
 *   clause-structure → TokenHelpOpened 4 + SentenceExplanationRevealed + NoteOpened · english → TokenHelpOpened 5 +
 *   EnglishRescueRevealed · note → NoteOpened (context, no evidence) · history → nothing (a look at one's own record).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LANGUAGE_ROWS, LAYER_ASSISTANCE_LEVEL, decodeFor } from '../../core';
import type {
  AssistanceLevel, AssistanceProfile, ComprehensionReported, ContentNote, DecodingRevealed, EnglishRescueRevealed, GrammarHelpOpened, HelpLayer, LanguageAdapter,
  NoteOpened, PhraseHelpOpened, Sentence, SentenceExplanationRevealed, SentenceViewed, SyllableAnalysis, Text, TextCompleted, TextViewed, Token,
  TokenAnalysis, TokenHelpOpened, TokenSupport,
} from '../../core';
import { useApp } from '../context';
import { TextProgress, useReadingProgress } from '../coverage';
import { makeEmitter } from '../events';
import { TextBadges, UnpublishedReasons } from '../library';
import { isTestimonyText, textPath } from '../format';
import { hasPref, usePref, usePreview } from '../prefs';
import type { HighlightPref } from '../prefs';
import { BackLink, I, IconBtn, Topbar } from '../ui';
import { ReadingGateContext } from './readingGate';
import type { ReadingGate } from './readingGate';
import { TokenCard } from './TokenCard';
import type { DecodingView } from './TokenCard';
import { createViewDetector } from './viewDetection';
import type { ViewDetector, ViewDetectorFactory } from './viewDetection';
import { useTextData } from './useTextData';
import type { TextData } from './useTextData';
import { englishBehindMenu, hasClauseSpans, isLegacyProfile, maxLevel, nextLayer, pick, planLayers, visibleNotes } from './assistance';
import type { LayerFacts } from './assistance';
import { useAssistance } from './useAssistance';
import './thai.css';

export interface ReaderProps {
  textId: string;
  mode: 'corpus' | 'scripture';
  /** Injectable for tests; default is IntersectionObserver-based, null ⇒ manual "mark as seen" buttons. */
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

/** The decoding of one token from the best source (an analysis's own, the dictionary's pronunciation, the spelling rules). */
function decodeToken(adapter: LanguageAdapter | undefined, token: Token, analysis?: TokenAnalysis): SyllableAnalysis[] {
  if (!adapter) return analysis?.syllables ?? [];
  try { return decodeFor(adapter, token.surface, analysis); } catch { return []; }
}

export function Reader(props: ReaderProps) {
  const { userId } = useApp();
  const state = useTextData(props.textId);
  const profile = useAssistance(props.textId);
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
  if (profile === null) return bare(<p className="muted" role="status">Loading…</p>);
  // Not keyed by session: a new sitting in a page that stayed open must not remount the reader (events resolve the sitting at emission).
  return <ReaderBody key={`${props.textId}|${userId}`} data={state.data} profile={profile} {...props} />;
}

/** What the sheet is open on: a word (with the layers opened so far) or the notes of a sentence. */
interface CardState {
  subject: { kind: 'word'; token: Token } | { kind: 'sentence'; sentenceId: string };
  opened: HelpLayer[];
  supports: Partial<Record<number, TokenSupport>>;
  why?: string;
  /** The Stage 0 rescue: the learner asked for the romanization of this word. */
  rescued: boolean;
  /** Lines from the learner's own record with this word. */
  history: string[];
  /** The fetch of everything the layers need has finished (ladder stages; always true where the sheet fetches level by level). */
  detailDone: boolean;
}

function ReaderBody({ data, profile, mode, createDetector, activeSentenceId, concealed, bar, before }: ReaderProps & { data: TextData; profile: AssistanceProfile }) {
  const { bus, golearn, adapters, userId, currentSession } = useApp();
  const preview = usePreview();
  const { text } = data;
  const legacy = useMemo(() => isLegacyProfile(profile), [profile]);
  const plan = useMemo(() => planLayers(profile), [profile]);
  const chrome = legacy ? 'full' : profile.chrome;
  const adapter = useMemo<LanguageAdapter | undefined>(() => {
    if (legacy) return undefined;
    try { return adapters.get(text.lang); } catch { return undefined; }
  }, [adapters, legacy, text.lang]);
  const surface = mode === 'scripture' ? 'scripture' : 'corpus';
  const emitter = useMemo(() => makeEmitter({ bus, userId, lang: text.lang, session: currentSession }), [bus, userId, text.lang, currentSession]);
  const script = LANGUAGE_ROWS.find((l) => l.id === text.lang)?.script ?? 'Latn';
  const [highlightPref, setHighlightPref] = usePref('highlight');
  // The stage's default highlighting applies until the learner has chosen one himself; his choice then wins.
  const [chosenHighlight, setChosenHighlight] = useState(() => hasPref('highlight'));
  const highlight: HighlightPref = legacy || chosenHighlight ? highlightPref : profile.defaultHighlight;
  const setHighlight = useCallback((v: HighlightPref) => { setChosenHighlight(true); setHighlightPref(v); }, [setHighlightPref]);
  const [fontSize] = usePref('fontSize');
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** deep / on-request English: the per-sentence English buttons stay out of the text until the learner asks for them. */
  const [englishButtons, setEnglishButtons] = useState(false);
  const behindMenu = englishBehindMenu(profile);
  const { prev, next } = useSiblings(text);
  const back = mode === 'scripture' ? '/scripture' : '/read';

  const rootRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLElement>(null);
  /** Sentences already reported in the CURRENT sitting (reset when the sitting changes: a later sitting's view is a new exposure). */
  const viewedRef = useRef<{ session: string; ids: Set<string> }>({ session: '', ids: new Set() });
  const [viewed, setViewed] = useState<ReadonlySet<string>>(new Set());
  const [auto, setAuto] = useState<boolean | null>(null);
  const [finishedHere, setFinishedHere] = useState(false);
  const record = useReadingProgress(useMemo(() => [text.id], [text.id])).get(text.id);
  const detectorRef = useRef<ViewDetector | null>(null);
  const overlays = useRef(new Set<string>());
  const gate = useMemo<ReadingGate>(() => ({
    setOverlay(id, open) {
      if (open) overlays.current.add(id); else overlays.current.delete(id);
      detectorRef.current?.setPaused(overlays.current.size > 0);
    },
  }), []);
  const [understood, setUnderstood] = useState<ReadonlySet<string>>(new Set());
  const [textDegree, setTextDegree] = useState<ComprehensionReported['degree'] | null>(null);

  // ── English rescue state ──
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [parallel, setParallel] = useState(false);

  // ── token card state ──
  const [card, setCard] = useState<CardState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** The in-flight "everything level 3 knows" fetch of the open word (ladder stages): the layers wait for it, the gloss does not. */
  const detailRef = useRef<Promise<TokenSupport | undefined>>(Promise.resolve(undefined));

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

  // Finished THIS version (explicitly)? Say so instead of offering the button again. Only an explicit TextCompleted of this
  // content version sets `finishedAt`; having finished an earlier version still offers the button.
  const finished = finishedHere || !!record?.finishedAt;

  // TextViewed (displayed, not exposure) once per sitting.
  useEffect(() => {
    void emitter.emit<TextViewed>(surface, {
      type: 'TextViewed', textId: text.id, mode: 'open', contentVersion: text.contentVersion,
      dedupeKey: (session) => `textviewed:${userId}:${session}:${text.id}`,
    });
  }, [emitter, surface, userId, text.id, text.contentVersion]);

  // ── SentenceViewed: reading exposure only (the detector decides when a sentence was in front of the learner long enough) ──
  const onViewed = useCallback((sentenceId: string, dwellMs?: number) => {
    const sitting = currentSession();
    if (viewedRef.current.session !== sitting) viewedRef.current = { session: sitting, ids: new Set() };
    if (viewedRef.current.ids.has(sentenceId)) return;
    viewedRef.current.ids.add(sentenceId);
    setViewed(new Set(viewedRef.current.ids));
    const tokenIds = (data.tokensBySentence.get(sentenceId) ?? []).filter((t) => t.isWord).map((t) => t.id);
    void emitter.emit<SentenceViewed>(surface, {
      type: 'SentenceViewed', textId: text.id, sentenceId, tokenIds, contentVersion: text.contentVersion,
      ...(dwellMs !== undefined ? { dwellMs } : {}),
      dedupeKey: (session) => `view:${userId}:${session}:${sentenceId}`,
    });
  }, [data.tokensBySentence, emitter, surface, currentSession, userId, text.id, text.contentVersion]);
  const onViewedRef = useRef(onViewed);
  onViewedRef.current = onViewed;

  useEffect(() => {
    const detector = (createDetector ?? createViewDetector)((id, dwell) => onViewedRef.current(id, dwell));
    detectorRef.current = detector;
    setAuto(detector !== null);
    if (!detector || !rootRef.current) return;
    detector.setPaused(overlays.current.size > 0);
    rootRef.current.querySelectorAll('[data-sentence-id]').forEach((el) => {
      const id = el.getAttribute('data-sentence-id')!;
      detector.observe(el, id, (data.tokensBySentence.get(id) ?? []).filter((t) => t.isWord).length);
    });
    return () => { detector.disconnect(); if (detectorRef.current === detector) detectorRef.current = null; };
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
    // One event per sitting + text + scope (the whole-passage reveal) or + sentence set (a sentence or a verse). The key is built
    // from the sitting-stable session id, so a remount, a toggle off and on, or a second tap in the same sitting is deduped by the
    // bus; a later sitting is a new exposure and is recorded.
    const set = scope === 'parallel' ? '' : `:${ids.join(',')}`;
    void emitter.emit<EnglishRescueRevealed>(surface, {
      type: 'EnglishRescueRevealed', textId: text.id, sentenceIds: ids, scope,
      dedupeKey: (session) => `rescue:${userId}:${session}:${text.id}:${scope}${set}`,
    });
  }, [data.rescues, emitter, surface, text.id, userId]);

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
  const cardToken = card?.subject.kind === 'word' ? card.subject.token : undefined;
  const cardSentenceId = card ? (card.subject.kind === 'word' ? card.subject.token.sentenceId : card.subject.sentenceId) : undefined;
  const clauseView = !legacy && profile.layers.includes('clause-structure');

  const fetchSupport = useCallback(async (token: Token, level: AssistanceLevel) => {
    const support = await golearn.tokenSupport(userId, token.id, level);
    setCard((c) => (c && c.subject.kind === 'word' && c.subject.token.id === token.id ? { ...c, supports: { ...c.supports, [level]: support } } : c));
    return support;
  }, [golearn, userId]);

  /** Opening the decoding is help with the written form: it names the writing-system items the word exercises. */
  const emitDecoding = useCallback(async (token: Token, analysis: TokenAnalysis | undefined, romanization: boolean) => {
    let features: string[] = [];
    try { features = adapter?.orthFeatures?.(decodeToken(adapter, token, analysis)) ?? []; } catch { features = []; }
    await emitter.emit<DecodingRevealed>(surface, {
      type: 'DecodingRevealed', sentenceId: token.sentenceId, tokenId: token.id, itemId: token.formId, features, romanization,
      // Once per learner, sitting, word and kind: re-opening the same word in the same sitting adds no second record.
      dedupeKey: (session) => `decoding:${userId}:${session}:${token.id}:${romanization ? 'rom' : 'dec'}`,
    });
  }, [adapter, emitter, surface, userId]);

  /** A note was shown: context, recorded once per sitting and note. A clause-structure note is also a sentence explanation. */
  const emitNote = useCallback(async (n: ContentNote) => {
    await emitter.emit<NoteOpened>(surface, {
      type: 'NoteOpened', textId: text.id, noteId: n.id, kind: n.kind, ...(n.sentenceId ? { sentenceId: n.sentenceId } : {}),
      dedupeKey: (session) => `noteopened:${userId}:${session}:${n.id}`,
    });
  }, [emitter, surface, text.id, userId]);

  const openToken = useCallback(async (token: Token) => {
    if (card && sheetOpen && card.subject.kind === 'word' && card.subject.token.id === token.id) { setSheetOpen(false); return; }
    setCard({ subject: { kind: 'word', token }, opened: plan.base, supports: {}, rescued: false, history: [], detailDone: legacy });
    setSheetOpen(true);
    await emitter.emit<TokenHelpOpened>(surface, { type: 'TokenHelpOpened', sentenceId: token.sentenceId, tokenId: token.id, itemId: token.formId, level: 1 });
    // Why GoLearn believes what it believes about this word ("Seen 7 times in 2 texts; needed help twice…").
    void golearn.explainItem(userId, token.formId).then(
      (why) => setCard((c) => (c && c.subject.kind === 'word' && c.subject.token.id === token.id ? { ...c, why: why.summary } : c)),
      () => undefined, // the summary is a nicety; the gloss never waits on it
    );
    if (legacy) { await fetchSupport(token, 1); return; }
    // A ladder stage: the gloss shows as soon as it is there; what the other layers need (analysis, phrases, patterns) is fetched once, now.
    const detail = fetchSupport(token, 3).catch(() => undefined);
    detailRef.current = detail;
    void detail.then(() => setCard((c) => (c && c.subject.kind === 'word' && c.subject.token.id === token.id ? { ...c, detailDone: true } : c)));
    if (profile.layers.includes('history')) {
      void Promise.resolve().then(() => golearn.itemHistory?.(userId, token.formId)).then(
        (h) => setCard((c) => (c && c.subject.kind === 'word' && c.subject.token.id === token.id ? { ...c, history: h?.lines ?? [] } : c)),
        () => undefined, // the history is a nicety too
      );
    }
    const [, support] = await Promise.all([fetchSupport(token, 1), detail]);
    if (plan.base.includes('decoding')) await emitDecoding(token, support?.analysis, false);
  }, [card, sheetOpen, plan, legacy, profile.layers, emitter, surface, fetchSupport, emitDecoding, golearn, userId]);

  /** Open one more layer of the word sheet and emit what that layer means for evidence. */
  const openLayer = useCallback(async (layer: HelpLayer) => {
    if (!card || card.subject.kind !== 'word' || card.opened.includes(layer)) return;
    const { token } = card.subject;
    const level = LAYER_ASSISTANCE_LEVEL[layer];
    setCard((c) => (c && c.subject.kind === 'word' && c.subject.token.id === token.id ? { ...c, opened: [...c.opened, layer] } : c));
    // Decoding is help with the written form (its own event); notes and the learner's own history are not help with the word.
    if (level > 0 && layer !== 'decoding') {
      await emitter.emit<TokenHelpOpened>(surface, { type: 'TokenHelpOpened', sentenceId: token.sentenceId, tokenId: token.id, itemId: token.formId, level });
    }
    const support = legacy ? (level > 0 ? await fetchSupport(token, level as AssistanceLevel) : undefined) : await detailRef.current;
    if (layer === 'phrase') {
      for (const { phrase, occurrence } of support?.phrases ?? []) {
        await emitter.emit<PhraseHelpOpened>(surface, { type: 'PhraseHelpOpened', sentenceId: token.sentenceId, phraseOccurrenceId: occurrence.id, phraseId: phrase.id });
      }
    } else if (layer === 'grammar' || layer === 'discourse') {
      for (const pattern of support?.patterns ?? []) {
        await emitter.emit<GrammarHelpOpened>(surface, { type: 'GrammarHelpOpened', sentenceId: token.sentenceId, patternId: pattern.id, tokenIds: [token.id] });
      }
    } else if (layer === 'sentence') {
      await emitter.emit<SentenceExplanationRevealed>(surface, { type: 'SentenceExplanationRevealed', sentenceId: token.sentenceId });
    } else if (layer === 'clause-structure') {
      await emitter.emit<SentenceExplanationRevealed>(surface, { type: 'SentenceExplanationRevealed', sentenceId: token.sentenceId });
      const sentence = sentenceById.get(token.sentenceId);
      for (const n of visibleNotes(data.notes, token.sentenceId, preview)) {
        if (n.kind === 'clause-structure' && sentence && hasClauseSpans(sentence.text, n.spans)) await emitNote(n);
      }
    } else if (layer === 'english') {
      revealRescue([token.sentenceId], 'sentence');
    } else if (layer === 'note') {
      for (const n of visibleNotes(data.notes, token.sentenceId, preview)) {
        if (!(clauseView && n.kind === 'clause-structure')) await emitNote(n);
      }
    } else if (layer === 'decoding') {
      await emitDecoding(token, support?.analysis ?? pick(card.supports, 'analysis'), false);
    }
  }, [card, legacy, emitter, surface, fetchSupport, revealRescue, emitDecoding, emitNote, sentenceById, data.notes, preview, clauseView]);

  /** The Stage 0 rescue: the learner asked to see the romanization. Recorded, so that dependence on it is visible. */
  const romanizationRescue = useCallback(async (romanization: string | undefined) => {
    if (!card || card.subject.kind !== 'word' || card.rescued || legacy || profile.romanization !== 'rescue') return;
    const { token } = card.subject;
    setCard((c) => (c ? { ...c, rescued: true } : c));
    if (romanization) await emitDecoding(token, pick(card.supports, 'analysis'), true);
  }, [card, legacy, profile.romanization, emitDecoding]);

  /** The notes of one sentence, from the mark at its end. */
  const openNotes = useCallback(async (sentence: Sentence) => {
    if (card && sheetOpen && card.subject.kind === 'sentence' && card.subject.sentenceId === sentence.id) { setSheetOpen(false); return; }
    setCard({ subject: { kind: 'sentence', sentenceId: sentence.id }, opened: ['note'], supports: {}, rescued: false, history: [], detailDone: true });
    setSheetOpen(true);
    const notes = visibleNotes(data.notes, sentence.id, preview);
    for (const n of notes) await emitNote(n);
    if (notes.some((n) => n.kind === 'clause-structure')) {
      await emitter.emit<SentenceExplanationRevealed>(surface, { type: 'SentenceExplanationRevealed', sentenceId: sentence.id });
    }
  }, [card, sheetOpen, data.notes, preview, emitNote, emitter, surface]);

  const finish = useCallback(async () => {
    setFinishedHere(true);
    // The key carries the content version: finishing a REVISED text in the same sitting as an earlier finish is a new, explicit act.
    await emitter.emit<TextCompleted>(surface, { type: 'TextCompleted', textId: text.id, contentVersion: text.contentVersion, dedupeKey: (session) => `textcompleted:${userId}:${session}:${text.id}:v${text.contentVersion}` });
  }, [emitter, surface, userId, text.id, text.contentVersion]);

  /** "Understood" on one sentence: a deliberate report. It is not a view: it emits no SentenceViewed. */
  const reportUnderstood = useCallback(async (sentenceId: string) => {
    if (understood.has(sentenceId)) return;
    setUnderstood((prev) => new Set([...prev, sentenceId]));
    await emitter.emit<ComprehensionReported>(surface, {
      type: 'ComprehensionReported', textId: text.id, sentenceIds: [sentenceId], modality: 'reading', scope: 'sentence', degree: 'all',
      contentVersion: text.contentVersion,
      dedupeKey: (session) => `understood:${userId}:${session}:${sentenceId}`,
    });
  }, [understood, emitter, surface, userId, text.id, text.contentVersion]);

  /** "How much did you understand?" for the whole text. */
  const reportText = useCallback(async (degree: ComprehensionReported['degree']) => {
    setTextDegree(degree);
    await emitter.emit<ComprehensionReported>(surface, {
      type: 'ComprehensionReported', textId: text.id, sentenceIds: data.sentences.map((s) => s.id), modality: 'reading', scope: 'text', degree,
      contentVersion: text.contentVersion,
      dedupeKey: (session) => `understood-text:${userId}:${session}:${text.id}:${degree}`,
    });
  }, [emitter, surface, userId, text.id, text.contentVersion, data.sentences]);

  // ── rendering ──
  // A sentence with a note the learner may see gets one quiet mark at its end (only where the stage offers notes).
  const noteMarks = useMemo(() => {
    const m = new Map<string, ContentNote[]>();
    if (legacy || !(profile.layers.includes('note') || profile.layers.includes('clause-structure'))) return m;
    for (const s of data.sentences) {
      const list = visibleNotes(data.notes, s.id, preview);
      if (list.length) m.set(s.id, list);
    }
    return m;
  }, [legacy, profile.layers, data.sentences, data.notes, preview]);

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
            className={`w tok hl-${state}${MARK[state] ? ` ${MARK[state]}` : ''}${sheetOpen && cardToken?.id === t.id ? ' sel is-open' : ''}`}
            data-token-id={t.id}
            aria-expanded={sheetOpen && cardToken?.id === t.id}
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
          {(noteMarks.get(s.id)?.length ?? 0) > 0 && (
            <button
              type="button" className={`note-mark sent__btn${sheetOpen && card?.subject.kind === 'sentence' && card.subject.sentenceId === s.id ? ' is-open' : ''}`}
              aria-label={`Note on sentence ${s.index + 1}`} aria-expanded={sheetOpen && card?.subject.kind === 'sentence' && card.subject.sentenceId === s.id}
              onClick={() => { void openNotes(s); }}
            ><span aria-hidden="true">i</span></button>
          )}
          {rescue && (!behindMenu || englishButtons) && (
            <IconBtn
              className="iconbtn--mini sent__btn" active={isShown}
              label={`${isShown ? 'Hide' : 'Show'} English for sentence ${s.index + 1}`}
              onClick={() => toggleRescue([s.id], 'sentence')}
            >{I.english}</IconBtn>
          )}
          {auto === false && !viewed.has(s.id) && (
            <IconBtn className="iconbtn--mini sent__btn" label={`Mark sentence ${s.index + 1} as seen`} onClick={() => onViewed(s.id)}>{I.check}</IconBtn>
          )}
          <button
            type="button" className="sent__understood sent__btn" aria-pressed={understood.has(s.id)}
            aria-label={`Understood sentence ${s.index + 1}`} title="I understood this sentence without help"
            onClick={() => { void reportUnderstood(s.id); }}
          >{understood.has(s.id) ? 'Understood ✓' : 'Understood'}</button>
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

  const cardSentence = cardSentenceId ? sentenceById.get(cardSentenceId) : undefined;
  const allViewed = data.sentences.length > 0 && viewed.size >= data.sentences.length;
  const progress = data.sentences.length > 0 ? (viewed.size / data.sentences.length) * 100 : 0;
  const hasPanel = !!(card && cardSentence && sheetOpen);
  const marks = highlight === 'off' ? '' : highlight === 'strong' ? ' marks marks--strong' : ' marks';

  // ── what the open sheet shows ──
  const cardNotes = useMemo(() => (cardSentenceId ? visibleNotes(data.notes, cardSentenceId, preview) : []), [data.notes, cardSentenceId, preview]);
  const cardAnalysis = card ? pick(card.supports, 'analysis') : undefined;
  const wordCard = card?.subject.kind === 'word' ? card : undefined;
  /** Everything "more help" needs is here: the level fetched (today's sheet) or the gloss plus the one detail fetch (ladder stages). */
  const loaded = !!wordCard && (legacy ? wordCard.supports[maxLevel(wordCard.opened)] !== undefined : wordCard.supports[1] !== undefined && wordCard.detailDone);
  const syllables = useMemo<SyllableAnalysis[] | null>(
    () => (cardToken && wordCard?.opened.includes('decoding') && loaded ? decodeToken(adapter, cardToken, cardAnalysis) : null),
    [adapter, cardToken, wordCard?.opened, loaded, cardAnalysis],
  );
  const romanization = syllables
    ? (syllables.map((s) => s.romanization).filter((r): r is string => !!r).join('-') || (typeof cardAnalysis?.notes?.romanization === 'string' ? cardAnalysis.notes.romanization : undefined))
    : undefined;
  const decodingView: DecodingView = {
    syllables, canRescue: !legacy && profile.romanization === 'rescue', rescued: !!card?.rescued, romanization,
  };
  const nextStep = useMemo<HelpLayer | undefined>(() => {
    if (!wordCard || !loaded) return undefined;
    if (legacy) return plan.steps.find((l) => !wordCard.opened.includes(l)); // today's sheet climbs every rung
    const notes = cardNotes.filter((n) => !(clauseView && n.kind === 'clause-structure'));
    const sentence = cardSentence;
    const facts: LayerFacts = {
      analysis: cardAnalysis,
      phrases: (pick(wordCard.supports, 'phrases') ?? []).length,
      patterns: (pick(wordCard.supports, 'patterns') ?? []).length,
      morphologyLine: pick(wordCard.supports, 'morphologyLine'),
      canDecode: !!adapter?.decode || !!adapter?.decodeWithPronunciation || !!cardAnalysis?.syllables?.length,
      explanation: sentence ? data.support.get(sentence.id)?.explanation : undefined,
      notes,
      clauseNotes: sentence ? cardNotes.filter((n) => n.kind === 'clause-structure' && hasClauseSpans(sentence.text, n.spans)) : [],
      history: wordCard.history,
    };
    return nextLayer(plan.steps, wordCard.opened, facts);
  }, [wordCard, loaded, legacy, plan, cardNotes, clauseView, cardSentence, cardAnalysis, adapter, data.support]);

  // Where the reader's own controls live: in the text's header area (full, reduced) or behind one quiet menu (minimal).
  const highlightTool = (
    <label className="tool">
      <span className="label">Highlight</span>
      <select value={highlight} onChange={(e) => setHighlight(e.target.value as HighlightPref)} aria-label="Highlighting">
        <option value="off">off</option>
        <option value="subtle">subtle</option>
        <option value="strong">strong</option>
      </select>
    </label>
  );
  const toolbar = (
    <>
      {highlightTool}
      {behindMenu && anyRescue && mode !== 'scripture' && (
        <button type="button" className="btn btn--small btn--quiet" aria-pressed={englishButtons} onClick={() => setEnglishButtons((v) => !v)}>English buttons</button>
      )}
      {mode === 'scripture' && anyRescue && (
        <button type="button" className="btn btn--small btn--quiet" aria-pressed={parallel} onClick={toggleParallel}>Parallel English</button>
      )}
    </>
  );
  const badges = (
    <div className="chips">
      <TextBadges text={text} />
      {text.version && <span className="chip">{text.version}</span>}
      {data.source?.rights === 'unverified' && <span className="chip chip--wine" title="Rights not established — replace before release">sample · rights unverified</span>}
    </div>
  );
  const details = (
    <section className="reading-details" aria-label="Reading details">
      <button type="button" className="btn btn--small btn--quiet" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((v) => !v)}>Reading details</button>
      {detailsOpen && <TextProgress textId={text.id} progress={record} />}
    </section>
  );

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
          subject={card.subject.kind === 'word' ? { kind: 'word', token: card.subject.token } : { kind: 'sentence', sentence: cardSentence }}
          legacy={legacy}
          opened={card.opened}
          next={nextStep}
          supports={card.supports}
          loaded={loaded}
          explanation={data.support.get(cardSentence.id)?.explanation}
          english={data.rescues.get(cardSentence.id)?.english}
          why={card.why}
          lang={text.lang}
          sentence={cardSentence}
          notes={cardNotes}
          clauseView={clauseView}
          decoding={decodingView}
          history={card.history}
          open={sheetOpen}
          onMore={() => { if (nextStep) void openLayer(nextStep); }}
          onRescue={() => { void romanizationRescue(romanization); }}
          onClose={() => setSheetOpen(false)}
          onExited={() => setCard(null)}
        />
      )}

      <div className="reader__main">
        <header className="reader__header" ref={headRef}>
          <div className="reader__header-inner">
            <BackLink to={back} label={mode === 'scripture' ? 'Scripture' : 'Library'} />
            <div className="reader__headbtn">
              {chrome !== 'minimal' && <span className="reader__crumb">{data.corpus?.title ?? (mode === 'scripture' ? 'Scripture' : 'Read')}</span>}
              <h1 className="reader__chapter" lang={text.lang}>{text.title}</h1>
            </div>
            {chrome === 'minimal'
              ? <IconBtn label="Reading menu" active={menuOpen} onClick={() => setMenuOpen((v) => !v)}>{I.settings}</IconBtn>
              : <IconBtn label="Settings" to="/settings">{I.settings}</IconBtn>}
          </div>
          {chrome !== 'minimal' && <div className="reader__progress"><span style={{ width: `${progress}%` }} /></div>}
          {chrome === 'minimal' && menuOpen && (
            <div className="reader__menu" role="group" aria-label="Reading menu">
              {badges}
              <div className="reader__tools">{toolbar}</div>
              {details}
              <Link to="/settings" className="btn btn--small btn--quiet">Settings</Link>
            </div>
          )}
        </header>

        {bar}

        <div className={`reader__prose${marks}`}>
          {chrome !== 'minimal' && (
            <div className="reader__meta">
              {badges}
              <div className="reader__tools">{toolbar}</div>
            </div>
          )}

          <UnpublishedReasons text={text} />
          {chrome === 'full' && <TextProgress textId={text.id} progress={record} />}
          {chrome === 'reduced' && details}

          <ReadingGateContext.Provider value={gate}>{before}</ReadingGateContext.Provider>

          <div className="reader-body">{sectionBlocks}</div>

          <footer className="reader__end">
            {finished ? (
              <p className="muted" role="status">Marked as finished.</p>
            ) : (
              <button type="button" className={`btn${allViewed ? ' btn--primary' : ''}`} onClick={() => { void finish(); }}>I have finished reading</button>
            )}
            {(finished || allViewed) && (
              <div className="reader__howmuch" role="group" aria-label="How much did you understand?">
                <p className="muted">How much did you understand?</p>
                <div className="segmented">
                  {([['all', 'All'], ['most', 'Most'], ['some', 'Some'], ['little', 'Little']] as const).map(([degree, label]) => (
                    <button key={degree} type="button" aria-pressed={textDegree === degree} onClick={() => { void reportText(degree); }}>{label}</button>
                  ))}
                </div>
                <p className="card__note">This is your own word on it. Nothing here is graded.</p>
              </div>
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
