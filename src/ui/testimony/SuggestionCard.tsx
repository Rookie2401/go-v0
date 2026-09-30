/**
 * One GoTell suggestion, as a raised card: a tracked kind label, what you wrote and what is
 * suggested (original literal, suggestion natural), why, where the language comes from
 * (provenance: "encountered N times in …"), and accept / reject / edit.
 */
import { useState } from 'react';
import type { GoTellSuggestion, LanguageCode, SuggestionKind } from '../../core';
import { itemSurface } from '../format';

export const KIND_LABEL: Record<SuggestionKind, string> = {
  repair: 'Correction',
  recombination: 'Uses language you know',
  expansion: 'New expression',
};

export interface SuggestionCardProps {
  suggestion: GoTellSuggestion;
  lang: LanguageCode;
  /** textId → title, for provenance lines. */
  titles: Map<string, string>;
  onAccept(s: GoTellSuggestion): void;
  onReject(s: GoTellSuggestion): void;
  onEdit(s: GoTellSuggestion, finalText: string): void;
}

export function SuggestionCard({ suggestion: s, lang, titles, onAccept, onReject, onEdit }: SuggestionCardProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.suggested);
  const open = s.status === 'shown';

  return (
    <li className={`sugg sugg-${s.kind}`} data-status={s.status} data-suggestion-id={s.id} aria-label={`${KIND_LABEL[s.kind]} for sentence ${s.sentenceIndex + 1}`}>
      <div className="sugg-head">
        <span className={`card__ref kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
        {s.status !== 'shown' && <span className="chip">{s.status}</span>}
      </div>

      <dl className="sugg-diff">
        <dt className="label">You wrote</dt>
        <dd lang={lang} className="sugg-original literal">{s.original}</dd>
        <dt className="label">Suggested</dt>
        <dd lang={lang} className="sugg-suggested natural">{s.suggested}</dd>
      </dl>

      {s.meaningChange && (
        <p className="note note--warn sugg-warn" role="note"><strong>This changes the meaning.</strong> {s.meaningChange} Keep your own wording unless you are sure.</p>
      )}
      <p className="card__text sugg-why">{s.explanation}</p>

      {s.familiar.length > 0 && (
        <ul className="sugg-prov card__prov" aria-label="Where this language comes from">
          {s.familiar.map((f) => {
            const where = f.textIds.map((id) => titles.get(id) ?? id).slice(0, 3).join(', ');
            return (
              <li key={f.itemId}>
                <span lang={lang}>{itemSurface(f.itemId)}</span>
                {' — '}encountered {f.encounterCount} time{f.encounterCount === 1 ? '' : 's'}{where ? ` in ${where}` : ''}
              </li>
            );
          })}
        </ul>
      )}
      {s.newItems.length > 0 && (
        <p className="card__prov" aria-label="New language">
          New to you: {s.newItems.map((n) => `${itemSurface(n.itemId)}${n.gloss ? ` (${n.gloss})` : ''}`).join(', ')}
        </p>
      )}

      {editing ? (
        <div className="sugg-edit">
          <label className="field">
            <span className="label">Your version of this sentence</span>
            <textarea lang={lang} value={text} rows={2} onChange={(e) => setText(e.target.value)} aria-label="Edit suggestion" />
          </label>
          <div className="card__actions">
            <button type="button" className="btn btn--small btn--primary" disabled={text.trim() === ''} onClick={() => { onEdit(s, text); setEditing(false); }}>Use my edit</button>
            <button type="button" className="btn btn--small btn--quiet" onClick={() => { setText(s.suggested); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="card__actions">
          <button type="button" className="btn btn--small btn--primary" disabled={!open} onClick={() => onAccept(s)}>Accept</button>
          <button type="button" className="btn btn--small btn--quiet" disabled={!open} onClick={() => onReject(s)}>Reject</button>
          <button type="button" className="btn btn--small btn--quiet" disabled={!open} onClick={() => setEditing(true)}>Edit</button>
        </div>
      )}
    </li>
  );
}
