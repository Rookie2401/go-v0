/**
 * Shared library plumbing: the texts of the active language (never private testimony texts), the corpora they
 * belong to, and the badges that say what a text is (generated, unpublished, review status).
 */
import { useEffect, useState } from 'react';
import type { Corpus, Text } from '../core';
import { useApp } from './context';
import { REVIEW_LABEL, isTestimonyText, plainReasons } from './format';

export interface LangTexts {
  /** null while loading. Every non-private text of the active language, published or not. */
  texts: Text[] | null;
  corpora: Map<string, Corpus>;
}

/** All (non-testimony) texts of the learner's current language. Re-read when the learner or language changes. */
export function useLangTexts(reloadKey?: unknown): LangTexts {
  const { store, lang } = useApp();
  const [state, setState] = useState<LangTexts>({ texts: null, corpora: new Map() });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, texts: null }));
    void (async () => {
      const [rows, cs] = await Promise.all([store.texts.where('lang', lang), store.corpora.all()]);
      const corpora = new Map(cs.map((c) => [c.id, c]));
      const texts = rows.filter((t) => t.listeningAssessmentId === undefined && !isTestimonyText(t, corpora));
      if (live) setState({ texts, corpora });
    })().catch(() => { if (live) setState({ texts: [], corpora: new Map() }); });
    return () => { live = false; };
  }, [store, lang, reloadKey]);
  return state;
}

/** Chips for one text: generated, unpublished (+ review status). Published, reviewed texts carry none. */
export function TextBadges({ text }: { text: Text }) {
  return (
    <>
      {text.generated && <span className="chip chip--wine" title="Machine-generated text">generated</span>}
      {text.published !== true && (
        <span className="chip chip--wine" title={plainReasons(text.unpublishedReasons ?? []).join('; ')}>
          unpublished · {REVIEW_LABEL[text.reviewStatus ?? 'unreviewed'] ?? text.reviewStatus}
        </span>
      )}
    </>
  );
}

/** Why a text is not published, as a short list (shown in preview mode and in Settings). */
export function UnpublishedReasons({ text }: { text: Text }) {
  if (text.published === true) return null;
  const reasons = text.unpublishedReasons?.length ? plainReasons(text.unpublishedReasons) : ['Not published.'];
  return (
    <ul className="reasons" aria-label={`Why ${text.title} is not published`}>
      {reasons.map((r) => <li key={r}>{r}</li>)}
    </ul>
  );
}
