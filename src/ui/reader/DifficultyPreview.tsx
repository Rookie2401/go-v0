/**
 * "Preview difficulty" — what this text will be like for THIS learner, before (or while) he reads it.
 *
 * An optional, collapsed disclosure on the text page. It reads GoLearn's forecast and shows it: the summary, the lists
 * (new useful words, rare words, weak phrases, new constructions, names, varieties), then the forecast's own `limits`
 * word for word. It is a look, not a reading: opening it emits no event at all (no TextViewed, no exposure), and it never
 * blocks, warns against or ranks reading.
 */
import { useEffect, useState } from 'react';
import type { DifficultyForecast, ForecastItem } from '../../core';
import { useApp } from '../context';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; forecast: DifficultyForecast }
  | { status: 'error'; message: string };

const SHOWN = 24;

const LISTS: Array<{ key: 'newUsefulWords' | 'rareWords' | 'weakPhrases' | 'newConstructions' | 'properNouns'; label: string; note: string }> = [
  { key: 'newUsefulWords', label: 'New words worth knowing', note: 'new to you and likely to come back' },
  { key: 'rareWords', label: 'Rare words', note: 'new to you and unlikely to come back' },
  { key: 'weakPhrases', label: 'Phrases that needed help before', note: 'met before, not yet easy' },
  { key: 'newConstructions', label: 'New constructions', note: 'patterns you have not met' },
  { key: 'properNouns', label: 'Names', note: 'people and places' },
];

function ItemChip({ item }: { item: ForecastItem }) {
  return (
    <li className="chip" title={item.register?.length ? item.register.join(', ') : undefined}>
      <span className="chip-text">{item.surface}</span>
      {item.count > 1 && <span className="faint"> ×{item.count}</span>}
      {item.gloss && <span className="chip-gloss"> — {item.gloss}</span>}
    </li>
  );
}

export function DifficultyPreview({ textId }: { textId: string }) {
  const { golearn, userId } = useApp();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: 'idle' });
  useEffect(() => { setOpen(false); setState({ status: 'idle' }); }, [textId, userId]);

  // An engine without the forecast (older wiring) simply has no preview to offer.
  if (typeof golearn.predictDifficulty !== 'function') return null;

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (state.status === 'ready' || state.status === 'loading') return;
    setState({ status: 'loading' });
    try {
      await golearn.settled(); // the forecast is read after every emitted event has been folded in
      const forecast = await golearn.predictDifficulty(userId, textId);
      setState({ status: 'ready', forecast });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <section className="difficulty" aria-label="Preview difficulty">
      <button type="button" className="btn btn--small btn--quiet" aria-expanded={open} onClick={() => { void toggle(); }}>Preview difficulty</button>
      {open && state.status === 'loading' && <p className="muted" role="status">Looking at what you have read…</p>}
      {open && state.status === 'error' && <p role="alert" className="error">Could not preview: {state.message}</p>}
      {open && state.status === 'ready' && <ForecastBody forecast={state.forecast} />}
    </section>
  );
}

function ForecastBody({ forecast: f }: { forecast: DifficultyForecast }) {
  const varieties = Object.entries(f.varieties).filter(([, n]) => n > 0);
  return (
    <div className="difficulty-body" data-testid="difficulty-body">
      <p className="difficulty__summary" data-testid="difficulty-summary">{f.summary}</p>
      {LISTS.map(({ key, label, note }) => {
        const items = f[key];
        if (items.length === 0) return null;
        return (
          <div key={key} className="card__section" data-testid={`difficulty-${key}`}>
            <h3 className="label">{label}</h3>
            <p className="card__note">{note}</p>
            <ul className="difficulty__list" aria-label={label}>
              {items.slice(0, SHOWN).map((item) => <ItemChip key={item.itemId} item={item} />)}
            </ul>
            {items.length > SHOWN && <p className="card__note">and {items.length - SHOWN} more</p>}
          </div>
        );
      })}
      {varieties.length > 0 && (
        <div className="card__section" data-testid="difficulty-varieties">
          <h3 className="label">Varieties of the language</h3>
          <ul className="difficulty__list" aria-label="Varieties of the language">
            {varieties.map(([tag, n]) => <li key={tag} className="chip">{tag} <span className="faint">×{n}</span></li>)}
          </ul>
        </div>
      )}
      {f.unanalysedWords > 0 && (
        <p className="card__note" data-testid="difficulty-unanalysed">{f.unanalysedWords} {f.unanalysedWords === 1 ? 'word has' : 'words have'} no analysis yet, so the forecast cannot say anything about {f.unanalysedWords === 1 ? 'it' : 'them'}.</p>
      )}
      {f.limits.length > 0 && (
        <div className="card__section">
          <h3 className="label">What this preview cannot tell you</h3>
          <ul className="difficulty__limits" aria-label="Limits of this preview" data-testid="difficulty-limits">
            {f.limits.map((limit, i) => <li key={`${i}:${limit}`}>{limit}</li>)}
          </ul>
        </div>
      )}
      <p className="card__note">An estimate from what you have read so far. It is only a preview: read whatever you like.</p>
    </div>
  );
}
