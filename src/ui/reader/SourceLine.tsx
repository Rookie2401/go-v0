/**
 * SourceLine — whose text this is, shown with the text.
 *
 * A text taken from a published source (a licensed translation, a public-domain edition) names that source where it is
 * read: the attribution line always, and behind one disclosure the licence, where the words came from and what was left
 * out. This is not decoration: a licence such as CC BY-SA requires the credit, the licence and an indication of changes
 * to travel with the text, and a public-domain edition deserves to be named as the edition it is.
 *
 * Shown at every assistance level (it is not help, so a "clean" shelf does not hide it). A text written for the course
 * or the learner's own writing has no source line: its badges already say what it is.
 */
import { useEffect, useState } from 'react';
import type { ContentSource, Text } from '../../core';
import { useApp } from '../context';
import { Disclosure } from '../ui';

/** What the line shows for a source, or null when the text needs none (pure). */
export function sourceView(source: ContentSource | undefined): { attribution: string; licence?: string; provenance?: string; url?: string } | null {
  if (!source || (source.rights !== 'licensed' && source.rights !== 'public-domain')) return null;
  const attribution = (source.attribution ?? [source.title, source.edition, source.publisher].filter(Boolean).join(', ')).trim();
  if (!attribution) return null;
  return {
    attribution,
    ...(source.licenseNote ? { licence: source.licenseNote } : {}),
    ...(source.provenance ? { provenance: source.provenance } : {}),
    ...(source.url && /^https?:\/\//.test(source.url) ? { url: source.url } : {}),
  };
}

export function SourceLine({ text }: { text: Pick<Text, 'sourceId' | 'lang'> }) {
  const { store } = useApp();
  const [source, setSource] = useState<ContentSource | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setSource(undefined);
    void store.sources.get(text.sourceId).then((s) => { if (live) setSource(s); }).catch(() => undefined);
    return () => { live = false; };
  }, [store, text.sourceId]);

  const view = sourceView(source);
  if (!view) return null;
  return (
    <div className="reader__source" data-testid="source-line">
      <p className="card__note" data-testid="source-attribution">{view.attribution}</p>
      {(view.licence || view.provenance || view.url) && (
        <Disclosure label="Licence and source" lazy className="reader__source-more">
          {view.licence && <p className="card__note" data-testid="source-licence">{view.licence}</p>}
          {view.provenance && <p className="card__note" data-testid="source-provenance">{view.provenance}</p>}
          {view.url && <p className="card__note"><a href={view.url} target="_blank" rel="noreferrer noopener">{view.url}</a></p>}
        </Disclosure>
      )}
    </div>
  );
}
