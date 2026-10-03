/**
 * The alphabet trainer (#/alphabet): Thai and Devanagari letters, 10 at a time, with spaced repetition.
 *
 * The page has two states. The overview lists the deck as batches of 10 ("Letters 1–10" …) in the shared dropdowns
 * (src/ui/disclosure), each with its glyphs and a state (not started / learning / learned), says how many letters are due or new,
 * and starts a practice session. A session works through `nextSession` (src/alphabet/srs.ts): a new letter is first shown with its
 * answer ("meet it"), then every card is asked as a four-choice question, "What sound?", with the keys 1–4 to choose and Enter or
 * Space for the next step. A card answered wrongly goes back to box 0 and comes round again a few cards later in the same session.
 * When nothing is due the session ends and says when the next review is.
 *
 * Storage: the scheduler state, as JSON, in the learner's `meta` row `alphabet:<userId>:<lang>` (no schema change, no events). It
 * is saved after every answer, so closing the page loses nothing and a new visit resumes. No audio.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Link } from 'react-router-dom';
import type { AppStore, LanguageCode } from '../../core';
import { CHOICE_COUNT, DEFAULT_PROMPT, KIND_LABEL, choicesFor, deckFor } from '../../alphabet/decks';
import type { AlphabetCard, AlphabetDeck, Choice, DetailLine } from '../../alphabet/decks';
import {
  LEARNED_BOX, answer, batchStatus, batches, canStartNext, currentBatchIndex, due, emptyState, nextReviewText, nextSession, parseState,
  requeue, serializeState, startNextBatch,
} from '../../alphabet/srs';
import type { AlphabetState, BatchStatus } from '../../alphabet/srs';
import { useApp } from '../context';
import { Group } from '../disclosure/Disclosure';
import { BackLink, Topbar } from '../ui';
import './alphabet.css';

/** The meta row that holds one learner's trainer state for one language. */
export const alphabetMetaId = (userId: string, lang: string): string => `alphabet:${userId}:${lang}`;

export async function loadAlphabetState(store: AppStore, userId: string, lang: string): Promise<AlphabetState> {
  return parseState((await store.meta.get(alphabetMetaId(userId, lang)))?.value);
}

export async function saveAlphabetState(store: AppStore, userId: string, lang: string, state: AlphabetState, now: number): Promise<void> {
  await store.meta.put({ id: alphabetMetaId(userId, lang), value: serializeState(state), updatedAt: new Date(now).toISOString() });
}

const STATUS_TEXT: Record<BatchStatus, string> = { 'not-started': 'not started', learning: 'learning', learned: 'learned' };
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ───────────────────────────── details ─────────────────────────────

function Details({ lines, lang }: { lines: DetailLine[]; lang: LanguageCode }) {
  return (
    <dl className="alpha__details">
      {lines.filter((l) => l.value || l.script).map((l, i) => (
        <div key={`${l.label}:${i}`} className="alpha__detail">
          <dt>{l.label}</dt>
          <dd>
            {l.script && <span className="alpha__script" lang={lang}>{l.script}</span>}
            {l.script && l.value ? ' — ' : ''}
            {l.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ───────────────────────────── the drill ─────────────────────────────

type Phase = 'intro' | 'ask' | 'result' | 'done';

interface Session {
  queue: string[];
  phase: Phase;
  choices: Choice[];
  picked: number | null;
  right: number;
  wrong: number;
  /** Cards whose introduction ("meet this letter") has been shown in this session. */
  met: string[];
}

function present(deck: AlphabetDeck, state: AlphabetState, session: Session, queue: string[]): Session {
  const card = deck.cards.find((c) => c.id === queue[0]);
  if (!card) return { ...session, queue, phase: 'done', choices: [], picked: null };
  const meet = !state.cards[card.id] && !session.met.includes(card.id);
  return {
    ...session, queue, picked: null, phase: meet ? 'intro' : 'ask', choices: choicesFor(deck.cards, card),
    met: meet ? [...session.met, card.id] : session.met,
  };
}

function Drill({ deck, card, session, lang, nextRef, onPick, onAdvance }: {
  deck: AlphabetDeck; card: AlphabetCard; session: Session; lang: LanguageCode; nextRef: RefObject<HTMLButtonElement | null>;
  onPick: (i: number) => void; onAdvance: () => void;
}) {
  const answered = session.right + session.wrong;
  const prompt = card.prompt ?? DEFAULT_PROMPT;
  const picked = session.picked === null ? undefined : session.choices[session.picked];
  return (
    <section className="alpha__drill" aria-label="Practice">
      <p className="alpha__progress muted" data-testid="alpha-progress">{plural(answered, 'answer', 'answers')} · {session.queue.length} to go · {deck.title}</p>
      <div className="alpha__glyph" lang={lang} data-testid="alpha-glyph">{card.glyph}</div>
      {card.carrier && <p className="alpha__carrier">{card.carrier}</p>}

      {session.phase === 'intro' && (
        <div className="alpha__panel" data-phase="intro">
          <p className="alpha__kicker">New {KIND_LABEL[card.kind]}</p>
          <p className="alpha__answer" data-testid="alpha-answer">{card.answer}</p>
          <Details lines={card.details} lang={lang} />
          <button type="button" ref={nextRef} className="btn btn--primary alpha__next" onClick={onAdvance}>Now try it</button>
          <p className="alpha__keys muted">Enter or Space to go on</p>
        </div>
      )}

      {session.phase === 'ask' && (
        <div className="alpha__panel" data-phase="ask">
          <p className="alpha__prompt">{prompt}</p>
          <ol className="alpha__choices" aria-label="Choices">
            {session.choices.map((c, i) => (
              <li key={`${i}:${c.text}`}>
                <button type="button" className="alpha__choice" data-choice={i + 1} aria-keyshortcuts={String(i + 1)} onClick={() => onPick(i)}>
                  <span className="alpha__num" aria-hidden="true">{i + 1}</span>
                  <span className="alpha__choice-text">{c.text}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="alpha__keys muted">Keys 1–{CHOICE_COUNT} to choose</p>
        </div>
      )}

      {session.phase === 'result' && picked && (
        <div className="alpha__panel" data-phase="result">
          <p className={`alpha__verdict ${picked.correct ? 'alpha__verdict--right' : 'alpha__verdict--wrong'}`} role="status" data-testid="alpha-verdict">
            {picked.correct ? 'Right.' : 'Not quite.'} <span className="alpha__answer-inline">{card.answer}</span>
          </p>
          <ol className="alpha__choices alpha__choices--done" aria-label="Choices">
            {session.choices.map((c, i) => (
              <li key={`${i}:${c.text}`}>
                <span className={`alpha__choice${c.correct ? ' alpha__choice--right' : ''}${i === session.picked && !c.correct ? ' alpha__choice--wrong' : ''}`} data-choice={i + 1}>
                  <span className="alpha__num" aria-hidden="true">{i + 1}</span>
                  <span className="alpha__choice-text">{c.text}</span>
                  {c.correct && <span className="alpha__tag"> — right answer</span>}
                  {i === session.picked && !c.correct && <span className="alpha__tag"> — your answer</span>}
                </span>
              </li>
            ))}
          </ol>
          <Details lines={card.details} lang={lang} />
          <button type="button" ref={nextRef} className="btn btn--primary alpha__next" onClick={onAdvance}>Next</button>
          <p className="alpha__keys muted">Enter or Space for the next card</p>
        </div>
      )}
    </section>
  );
}

// ───────────────────────────── the page ─────────────────────────────

/** `now` is the clock (milliseconds since the epoch); tests pass their own. */
export function AlphabetPage({ now = Date.now }: { now?: () => number } = {}) {
  const { lang } = useApp();
  const deck = deckFor(lang);
  if (!deck) {
    return (
      <div>
        <Topbar title="Alphabet" left={<BackLink to="/" label="Home" />} />
        <div className="page page--narrow alpha disclosure-page route-fade">
          <p className="alpha__unsupported" data-testid="alpha-unsupported">The alphabet trainer is for Thai and Hindi. Your course is in another language, so there is nothing to learn here.</p>
          <p><Link to="/">Back to Home</Link></p>
        </div>
      </div>
    );
  }
  return <Trainer deck={deck} lang={lang} now={now} />;
}

function Trainer({ deck, lang, now }: { deck: AlphabetDeck; lang: LanguageCode; now: () => number }) {
  const { store, userId } = useApp();
  const [state, setState] = useState<AlphabetState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openOverride, setOpenOverride] = useState<Set<string> | null>(null);
  const stateRef = useRef<AlphabetState | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  stateRef.current = state;
  sessionRef.current = session;

  useEffect(() => {
    let live = true;
    setState(null);
    setSession(null);
    void loadAlphabetState(store, userId, lang)
      .then((s) => { if (live) setState(s); })
      .catch((e: unknown) => { if (live) { setState(emptyState()); setError(e instanceof Error ? e.message : 'Could not read your progress.'); } });
    return () => { live = false; };
  }, [store, userId, lang]);

  const save = useCallback(async (next: AlphabetState) => {
    stateRef.current = next;
    setState(next);
    try { await saveAlphabetState(store, userId, lang, next, now()); setError(null); }
    catch (e) { setError(e instanceof Error ? `Your progress could not be saved: ${e.message}` : 'Your progress could not be saved.'); }
  }, [store, userId, lang, now]);

  const begin = useCallback((st: AlphabetState) => {
    const queue = nextSession(deck.cards, st, now()).map((c) => c.id);
    const empty: Session = { queue: [], phase: 'done', choices: [], picked: null, right: 0, wrong: 0, met: [] };
    setSession(queue.length === 0 ? empty : present(deck, st, empty, queue));
  }, [deck, now]);

  const pick = useCallback((i: number) => {
    const s = sessionRef.current;
    const st = stateRef.current;
    if (!s || !st || s.phase !== 'ask' || !s.choices[i]) return;
    const card = deck.cards.find((c) => c.id === s.queue[0]);
    if (!card) return;
    const correct = s.choices[i].correct;
    const next = answer(st, card.id, correct, now());
    const updated: Session = { ...s, phase: 'result', picked: i, right: s.right + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) };
    sessionRef.current = updated;
    setSession(updated);
    void save(next);
  }, [deck, now, save]);

  const advance = useCallback(() => {
    const s = sessionRef.current;
    const st = stateRef.current;
    if (!s || !st) return;
    if (s.phase === 'intro') {
      const asking: Session = { ...s, phase: 'ask' };
      sessionRef.current = asking;
      setSession(asking);
      return;
    }
    if (s.phase !== 'result') return;
    const wasWrong = s.picked !== null && !s.choices[s.picked].correct;
    const [shown, ...rest] = s.queue;
    let queue = wasWrong ? requeue(rest, shown) : rest;
    // the list is used up: only cards that have come due meanwhile go on; letters not yet met wait for the next practice
    if (queue.length === 0) queue = nextSession(deck.cards, st, now()).filter((c) => st.cards[c.id]).map((c) => c.id);
    const following: Session = queue.length === 0 ? { ...s, queue, phase: 'done', choices: [], picked: null } : present(deck, st, s, queue);
    sessionRef.current = following;
    setSession(following);
  }, [deck, now]);

  // keyboard: 1–4 choose; Enter or Space go on (a focused button keeps its own Enter / Space)
  const handlers = useRef({ pick, advance });
  handlers.current = { pick, advance };
  const active = session !== null;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const phase = sessionRef.current?.phase;
      if (phase === 'ask' && /^[1-4]$/.test(e.key) && Number(e.key) <= CHOICE_COUNT) { e.preventDefault(); handlers.current.pick(Number(e.key) - 1); return; }
      if ((e.key === 'Enter' || e.key === ' ') && (phase === 'intro' || phase === 'result')) {
        if (t && t.tagName === 'BUTTON') return; // the button's own click does it
        e.preventDefault();
        handlers.current.advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const phase = session?.phase;
  useEffect(() => {
    if (phase === 'intro' || phase === 'result') nextRef.current?.focus({ preventScroll: true });
  }, [phase, session?.queue[0]]);

  const cardsById = useMemo(() => new Map(deck.cards.map((c) => [c.id, c] as const)), [deck]);
  const bar = <Topbar title="Alphabet" left={<BackLink to="/read" label="Reading" />} />;
  if (!state) return <div>{bar}<div className="page page--narrow alpha disclosure-page"><p className="muted" role="status">Loading…</p></div></div>;

  // ── a session in progress ──
  if (session && session.phase !== 'done') {
    const card = cardsById.get(session.queue[0]);
    if (card) {
      return (
        <div>
          {bar}
          <div className="page page--narrow alpha disclosure-page">
            <Drill deck={deck} card={card} session={session} lang={lang} nextRef={nextRef} onPick={pick} onAdvance={advance} />
            {error && <p role="alert" className="error">{error}</p>}
            <p className="alpha__leave"><button type="button" className="btn btn--quiet btn--small" onClick={() => setSession(null)}>End practice</button></p>
          </div>
        </div>
      );
    }
  }

  const t = now();
  const all = batches(deck.cards);
  const learned = deck.cards.filter((c) => (state.cards[c.id]?.box ?? 0) >= LEARNED_BOX).length;
  const queue = nextSession(deck.cards, state, t);
  const dueCount = due(state, t).filter((id) => cardsById.has(id)).length;
  const newCount = queue.length - dueCount;
  const wait = nextReviewText(state, t);
  const current = currentBatchIndex(deck.cards, state);
  const defaults = new Set<string>(current >= 0 ? [`batch:${current}`] : all.length > 0 ? ['batch:0'] : []);
  const open = openOverride ?? defaults;
  const toggle = (id: string) => {
    const next = new Set(openOverride ?? defaults);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenOverride(next);
  };
  const startNext = () => {
    const next = startNextBatch(deck.cards, state);
    void save(next);
    begin(next);
  };

  const finished = session?.phase === 'done' ? session : null;
  const summary: ReactNode = finished && (
    <div className="alpha__summary" role="status" data-testid="alpha-summary">
      <p className="alpha__verdict">{finished.right + finished.wrong === 0 ? 'Nothing is due right now.' : `Practice finished: ${finished.right} right, ${finished.wrong} wrong.`}</p>
      {wait && <p>{capital(wait)}.</p>}
    </div>
  );

  return (
    <div>
      {bar}
      <div className="page page--narrow alpha disclosure-page route-fade">
        <h1 className="alpha__title">{deck.title}</h1>
        <p className="muted">Learn the letters 10 at a time. {plural(learned, 'letter', 'letters')} of {deck.cards.length} learned.</p>
        <p className="card__note">{deck.note}</p>
        {error && <p role="alert" className="error">{error}</p>}
        {summary}

        <div className="alpha__actions">
          {queue.length > 0 ? (
            <>
              <button type="button" className="btn btn--primary" data-testid="alpha-practise" onClick={() => begin(state)}>Practise now</button>
              <span className="muted alpha__count" data-testid="alpha-count">
                {[dueCount > 0 && `${dueCount} to review`, newCount > 0 && `${newCount} new`].filter(Boolean).join(' · ')}
              </span>
            </>
          ) : (
            !finished && <p className="muted" data-testid="alpha-idle">{wait ? `Nothing is due. ${capital(wait)}.` : 'Nothing is due.'}</p>
          )}
          {canStartNext(deck.cards, state) && (
            <button type="button" className="btn" data-testid="alpha-start-next" onClick={startNext}>Start the next 10 now</button>
          )}
        </div>

        <nav className="lib" aria-label="Letters">
          {all.map((batch, i) => {
            const status = batchStatus(batch, state);
            const id = `batch:${i}`;
            const from = i * 10 + 1;
            return (
              <Group
                key={id}
                id={id}
                level={3}
                open={open.has(id)}
                onToggle={toggle}
                title={`Letters ${from}–${from + batch.length - 1}`}
                native={batch.map((c) => c.glyph).join(' ')}
                lang={lang}
                meta={STATUS_TEXT[status]}
                current={i === current}
              >
                {() => (
                  <ul className="alpha__tiles" aria-label={`Letters ${from}–${from + batch.length - 1}`}>
                    {batch.map((c) => {
                      const p = state.cards[c.id];
                      return (
                        <li key={c.id} className="alpha__tile" data-card={c.id} title={p ? `${KIND_LABEL[c.kind]} · box ${p.box}` : KIND_LABEL[c.kind]}>
                          <span className="alpha__tile-glyph" lang={lang}>{c.glyph}</span>
                          <span className="alpha__tile-answer">{p ? c.answer : ''}</span>
                          {p && <span className="alpha__tile-box">box {p.box}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Group>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
