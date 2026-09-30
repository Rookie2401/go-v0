/**
 * TokenCard — the layered tap-word support sheet.
 * Level 1 gloss → 2 phrases → 3 morphology / grammar / prior encounters → 4 sentence explanation →
 * 5 English rescue. The card only ever shows what has been asked for; "More help" goes one level up.
 */
import { useEffect, useState } from 'react';
import type { AssistanceLevel, Sentence, Token, TokenSupport } from '../../core';
import { useApp } from '../context';

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
  onMore(): void;
  onClose(): void;
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

export function TokenCard({ token, level, supports, explanation, english, onMore, onClose }: TokenCardProps) {
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

  return (
    <aside className="card" role="dialog" aria-label={`Help for ${token.surface}`} data-level={level}>
      <div className="card-head">
        <span className="card-word">{token.surface}</span>
        {lemma && lemma.lemma !== token.surface.toLowerCase() && (
          <span className="card-lemma">from {lemma.lemma}{lemma.pos ? ` (${lemma.pos.toLowerCase()})` : ''}</span>
        )}
        <button type="button" className="card-close" onClick={onClose} aria-label="Close word help">×</button>
      </div>

      <section className="card-layer" aria-label="Gloss">
        {!anyLoaded ? (
          <p className="muted">Looking up…</p>
        ) : gloss ? (
          <p className="card-gloss">{uncertain ? 'possibly ' : ''}{gloss}</p>
        ) : (
          <p className="muted">No gloss for this word yet.</p>
        )}
        {uncertain && anyLoaded && <p className="muted small">The analysis here is uncertain.</p>}
      </section>

      {level >= 2 && (
        <section className="card-layer" aria-label="Phrases">
          <h3>Phrases</h3>
          {phrases.length === 0 ? (
            <p className="muted">This word is not part of a known phrase here.</p>
          ) : (
            <ul className="chips">
              {phrases.map(({ phrase, occurrence }) => (
                <li key={occurrence.id} className="chip" title={phrase.gloss ?? phrase.kind}>
                  <span className="chip-text">{phrase.display}</span>
                  {phrase.gloss && <span className="chip-gloss"> — {phrase.gloss}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {level >= 3 && (
        <section className="card-layer" aria-label="Grammar">
          <h3>Grammar</h3>
          {morphologyLine ? <p>{morphologyLine}</p> : <p className="muted">No grammar analysis available.</p>}
          {patterns.map((p) => (
            <p key={p.id} className="small"><strong>{p.title}.</strong> {p.explanation}</p>
          ))}
          <p className="small muted" aria-label="Prior encounters">
            {prior.length === 0 ? 'You have not met this word before.' : `You have met this word ${prior.length} time${prior.length === 1 ? '' : 's'} before.`}
          </p>
          {examples.length > 0 && (
            <ul className="examples" aria-label="Where you met it">
              {examples.map((s) => <li key={s.id} lang={s.lang}>{s.text}</li>)}
            </ul>
          )}
        </section>
      )}

      {level >= 4 && (
        <section className="card-layer" aria-label="Sentence explanation">
          <h3>This sentence</h3>
          <p>{explanation ?? <span className="muted">No written explanation for this sentence.</span>}</p>
        </section>
      )}

      {level >= 5 && (
        <section className="card-layer" aria-label="English">
          <h3>English</h3>
          <p>{english ?? <span className="muted">No English available for this sentence.</span>}</p>
        </section>
      )}

      {level < 5 && loaded && (
        <button type="button" className="btn-quiet" onClick={onMore}>{LEVEL_NEXT_LABEL[level]}</button>
      )}
    </aside>
  );
}
