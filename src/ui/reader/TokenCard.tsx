/**
 * TokenCard — the layered tap-word support sheet (Biblia's word card, as a bottom sheet on every width).
 * Level 1 gloss → 2 phrases → 3 morphology / grammar / prior encounters → 4 sentence explanation →
 * 5 English rescue. The card only ever shows what has been asked for; "More help" goes one level up.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistanceLevel, LanguageCode, Sentence, Token, TokenSupport } from '../../core';
import { useApp } from '../context';
import { I, IconBtn } from '../ui';

export const LEVEL_NEXT_LABEL: Record<number, string> = {
  1: 'Show phrases',
  2: 'Show grammar',
  3: 'Explain this sentence',
  4: 'Show English',
};

export interface TokenCardProps {
  token: Token;
  level: AssistanceLevel;
  /** Supports fetched so far, keyed by the level they were requested at. */
  supports: Partial<Record<number, TokenSupport>>;
  explanation?: string;
  english?: string;
  /** Language of the tapped form, so the surface is set in the text's own font. */
  lang?: LanguageCode;
  /** The sheet is up. When false it plays its exit, then calls onExited. */
  open: boolean;
  onMore(): void;
  onClose(): void;
  /** The exit animation has finished: the parent may drop the card. */
  onExited(): void;
}

/** Latest defined value for a field, searching from the highest level down (levels return only what they need). */
function pick<K extends keyof TokenSupport>(supports: Partial<Record<number, TokenSupport>>, key: K): TokenSupport[K] | undefined {
  for (let l = 5; l >= 1; l--) {
    const v = supports[l]?.[key];
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return undefined;
}

export function TokenCard({ token, level, supports, explanation, english, lang, open, onMore, onClose, onExited }: TokenCardProps) {
  const { store } = useApp();
  const gloss = pick(supports, 'gloss');
  const phrases = pick(supports, 'phrases') ?? [];
  const patterns = pick(supports, 'patterns') ?? [];
  const lemma = pick(supports, 'lemma');
  const morphologyLine = pick(supports, 'morphologyLine');
  const prior = pick(supports, 'priorEncounters') ?? [];
  const exampleIds = pick(supports, 'knownExamples') ?? [];
  const uncertain = supports[level]?.uncertain ?? pick(supports, 'uncertain') ?? false;
  const loaded = supports[level] !== undefined;
  const anyLoaded = Object.keys(supports).length > 0;

  const [examples, setExamples] = useState<Sentence[]>([]);
  const exampleKey = exampleIds.slice(0, 3).join('|');
  useEffect(() => {
    let live = true;
    if (level < 3 || !exampleKey) { setExamples([]); return; }
    void store.sentences.getMany(exampleKey.split('|')).then((rows) => {
      if (live) setExamples(rows.filter((r): r is Sentence => !!r));
    });
    return () => { live = false; };
  }, [store, level, exampleKey]);

  // Titles of the texts where the learner has met this word ("Seen 7 times in Story 1, Story 2").
  const [titles, setTitles] = useState<string[]>([]);
  const priorKey = [...new Set(prior.map((p) => p.textId))].slice(0, 3).join('|');
  useEffect(() => {
    let live = true;
    if (level < 3 || !priorKey) { setTitles([]); return; }
    void store.texts.getMany(priorKey.split('|')).then((rows) => {
      if (live) setTitles(rows.filter((t): t is NonNullable<typeof t> => !!t).map((t) => t.title));
    });
    return () => { live = false; };
  }, [store, level, priorKey]);

  // ── the sheet: rises on mount, falls on close (kept mounted until the exit has played) ──
  const openRef = useRef(open);
  openRef.current = open;
  const exitedRef = useRef(onExited);
  exitedRef.current = onExited;
  const finish = useCallback(() => { if (!openRef.current) exitedRef.current(); }, []);
  useEffect(() => {
    if (open) return;
    const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { finish(); return; }
    const t = setTimeout(finish, 340); // animationend normally gets there first; this covers anything that never animates
    return () => clearTimeout(t);
  }, [open, finish]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <aside
      className={`panel ${open ? 'panel--rise' : 'panel--fall'}`} role="dialog" aria-label={`Help for ${token.surface}`} data-level={level}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && !open) finish(); }}
    >
      <div className="panel__grip" aria-hidden="true" />
      <div className="panel__body" key={token.id}>
      <div className="panel__head">
        <span className="label">Word</span>
        <IconBtn label="Close word help" onClick={onClose}>{I.close}</IconBtn>
      </div>

      <div className="card__surface" lang={lang}>{token.surface}</div>

      <section aria-label="Gloss">
        {!anyLoaded ? (
          <p className="card__note">Looking up…</p>
        ) : gloss ? (
          <p className="card__gloss">{uncertain ? 'possibly ' : ''}{gloss}</p>
        ) : (
          <p className="card__note">No gloss for this word yet.</p>
        )}
        {uncertain && anyLoaded && <p className="card__note">The analysis here is uncertain.</p>}
        {lemma && lemma.lemma !== token.surface.toLowerCase() && (
          <div className="card__line"><span className="k">Lemma</span><span lang={lang}>{lemma.lemma}</span></div>
        )}
        {lemma?.pos && <div className="card__line"><span className="k">Part of speech</span><span>{lemma.pos.toLowerCase()}</span></div>}
      </section>

      {level >= 2 && (
        <section className="card__section" aria-label="Phrases">
          <h3 className="label">Phrases</h3>
          {phrases.length === 0 ? (
            <p className="card__text">This word is not part of a known phrase here.</p>
          ) : (
            <ul className="chips">
              {phrases.map(({ phrase, occurrence }) => (
                <li key={occurrence.id} className="chip" title={phrase.gloss ?? phrase.kind}>
                  <span className="chip-text" lang={lang}>{phrase.display}</span>
                  {phrase.gloss && <span className="chip-gloss"> — {phrase.gloss}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {level >= 3 && (
        <section className="card__section" aria-label="Grammar">
          <h3 className="label">Grammar</h3>
          {morphologyLine ? (
            <div className="card__line"><span className="k">Morphology</span><span>{morphologyLine}</span></div>
          ) : (
            <p className="card__text">No grammar analysis available.</p>
          )}
          {patterns.map((p) => (
            <p key={p.id} className="card__text"><b>{p.title}.</b> {p.explanation}</p>
          ))}
          <p className="card__prov" aria-label="Prior encounters">
            {prior.length === 0
              ? 'You have not met this word before.'
              : `Seen ${prior.length} time${prior.length === 1 ? '' : 's'}${titles.length ? ` in ${titles.join(', ')}` : ''}.`}
          </p>
          {examples.length > 0 && (
            <ul className="examples" aria-label="Where you met it">
              {examples.map((s) => <li key={s.id} lang={s.lang} className="literal">{s.text}</li>)}
            </ul>
          )}
        </section>
      )}

      {level >= 4 && (
        <section className="card__section" aria-label="Sentence explanation">
          <h3 className="label">This sentence</h3>
          <p className="card__text">{explanation ?? <span className="faint">No written explanation for this sentence.</span>}</p>
        </section>
      )}

      {level >= 5 && (
        <section className="card__section" aria-label="English">
          <h3 className="label">English</h3>
          <p className="natural">{english ?? <span className="faint">No English available for this sentence.</span>}</p>
        </section>
      )}

      {level < 5 && loaded && (
        <div className="card__actions">
          <button type="button" className="btn btn--small btn--quiet" onClick={onMore}>{LEVEL_NEXT_LABEL[level]}</button>
        </div>
      )}
      </div>
    </aside>
  );
}
