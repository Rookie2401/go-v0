/** Small presentation helpers shared by the pages. */
import { LANGUAGE_ROWS } from '../core';
import type { ComfortBand, Course, Text } from '../core';

export const BAND_LABEL: Record<ComfortBand, string> = {
  comfortable: 'comfortable',
  'productive-challenge': 'good challenge',
  difficult: 'difficult',
  stretch: 'stretch',
};

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export const textPath = (t: Pick<Text, 'id' | 'kind'>) =>
  `${t.kind === 'scripture' ? '/scripture' : '/read'}/${encodeURIComponent(t.id)}`;

/** "form:es:creo" → "creo"; "lemma:de:anfangen:VERB" → "anfangen"; "phrase:es:creer_en_" → "creer en …". */
export function itemSurface(itemId: string): string {
  const parts = itemId.split(':');
  const body = parts.slice(2).join(':');
  if (itemId.startsWith('phrase:')) return body.split('_').map((p) => (p === '' ? '…' : p)).join(' ');
  if (itemId.startsWith('lemma:')) return parts[2] ?? body;
  return body;
}

export const REASON_LABEL: Record<string, string> = {
  'easy-story': 'An easy next story',
  'reinforces-weak-items': 'Strengthens words you have barely met',
  'listen-to-read-text': 'Listen to something you have read',
  'prepares-scripture': 'Prepares you for a passage',
  'revisit-scripture': 'Revisit a passage',
  'rehearse-testimony': 'Rehearse your testimony',
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Testimony revisions are private Texts (kind "testimony", corpus kind "testimony"). They must never be
 * listed, recommended, badged or opened through the public Read / Scripture surfaces.
 * TODO(integration): GoTell exports `isTestimonyText(text)`; this local check is equivalent.
 */
export function isTestimonyText(text: Pick<Text, 'kind' | 'corpusId'>, corpora?: Map<string, { kind: string }>): boolean {
  return text.kind === 'testimony' || corpora?.get(text.corpusId)?.kind === 'testimony';
}

/** "Spanish" for a course whose language is es. */
export const languageName = (course: Pick<Course, 'lang'>): string => LANGUAGE_ROWS.find((l) => l.id === course.lang)?.name ?? course.lang;
/** "Thailand team · Thai" */
export const teamLabel = (course: Pick<Course, 'lang' | 'country'>): string => `${course.country} team · ${languageName(course)}`;
