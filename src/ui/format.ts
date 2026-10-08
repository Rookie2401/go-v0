/** Small presentation helpers shared by the pages. */
import { LANGUAGE_ROWS } from '../core';
import type { ComfortBand, Course, LanguageCode, Text } from '../core';

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
  'first-text': 'A good first text',
  'next-input': 'Something new to read',
  reread: 'Read it again',
  'reread-before-next': 'Once more before moving on',
  'stage0-recall': 'Refresh the words from Stage 0',
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

/** The language's English name from a language code. */
export const nameOfLang = (lang: LanguageCode): string => LANGUAGE_ROWS.find((l) => l.id === lang)?.name ?? lang;

/**
 * The publication gate as the learner meets it. Published texts are always visible; unpublished ones only in
 * preview mode. (A missing `published` field — a row from before review tracking — counts as unpublished.)
 */
export const isVisibleText = (text: Pick<Text, 'published'>, preview: boolean): boolean => preview || text.published === true;

/** Learner-facing label for a review status. */
export const REVIEW_LABEL: Record<string, string> = {
  unreviewed: 'not reviewed',
  'in-review': 'in review',
  reviewed: 'reviewed',
  approved: 'approved',
  rejected: 'rejected',
};

export interface Awaited {
  /** One sentence that says exactly what is (not) available and what it is waiting for. */
  headline: string;
  /** The specific reasons the imported texts are held back, deduplicated. */
  reasons: string[];
}

/**
 * What to say instead of an empty list. `texts` are ALL the non-private texts of one language and kind group
 * (published or not). Called only when nothing of that kind is visible to the learner.
 */
export function awaitedStatement(texts: Text[], kind: 'corpus' | 'scripture', language: string): Awaited {
  const noun = kind === 'scripture' ? 'Scripture' : 'stories or dialogues';
  const held = texts.filter((t) => t.published !== true);
  if (texts.length === 0) {
    return {
      headline: kind === 'scripture'
        ? `No Scripture in ${language} has been imported yet. It has to be supplied, and its wording verified against a named source, before it can be read here.`
        : `No ${noun} in ${language} have been imported yet. Texts are supplied through Settings → Content.`,
      reasons: [],
    };
  }
  const needs: string[] = [];
  if (held.some((t) => !['reviewed', 'approved'].includes(t.reviewStatus ?? 'unreviewed'))) {
    needs.push(kind === 'scripture' ? 'review' : 'native-speaker review');
  }
  if (kind === 'scripture' && held.some((t) => !t.scripture?.verification)) needs.push('verification of the wording against a named source');
  if (needs.length === 0) needs.push('publication (see the reasons below)');
  const reasons = [...new Set(held.flatMap((t) => t.unpublishedReasons ?? []))];
  const n = held.length;
  return {
    headline: `No ${noun} in ${language} ${kind === 'scripture' ? 'is' : 'are'} published yet: ${n} ${n === 1 ? 'text is' : 'texts are'} imported but awaiting ${needs.join(' and ')}.`,
    reasons,
  };
}

/**
 * Learner-facing wording for "why is this not available". The importer's reasons carry developer hints
 * ("(set review.status …)", "run scripts/…"); only Settings → Content shows them in full. This maps the known
 * reasons to short plain forms and strips any remaining trailing parenthetical that starts "(set ", "(run " or
 * "(or ". Works on one reason or on a longer sentence that embeds reasons (GoLearn's note text).
 */
const PLAIN_REASONS: Array<[RegExp, string]> = [
  [/review status is "[^"]*" — machine-drafted text needs a native-speaker review(?: \((?:set|run|or) [^()]*\))?/g, 'awaiting native-speaker review'],
  [/review status is "[^"]*" — needs a review(?: \((?:set|run|or) [^()]*\))?/g, 'awaiting review'],
  [/review was rejected — fix the text and record a new review/g, 'the review was rejected, so the text needs fixing'],
  [/the review names no reviewer — set review\.reviewedBy/g, 'the review does not name a reviewer'],
  [/rights are unverified — replace the text with a licensed or public-domain one, or establish the rights and update source\.rights/g, 'rights not yet established'],
  [/the translation is not identified — set scripture\.translationId to the exact translation/g, 'translation not yet identified'],
  [/the edition is not established — set scripture\.edition/g, 'edition not yet established'],
  [/the wording is not verified against a published source — run scripts\/verify-scripture\.mjs(?: \((?:set|run|or) [^()]*\))?/g, 'wording not yet verified against a published source'],
];

export function plainReason(reason: string): string {
  let out = reason;
  for (const [re, plain] of PLAIN_REASONS) out = out.replace(re, plain);
  out = out.replace(/\s*\((?:set|run|or) [^()]*\)/g, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** Plain forms of a list of reasons, with duplicates removed. */
export const plainReasons = (reasons: readonly string[]): string[] => [...new Set(reasons.map(plainReason).filter(Boolean))];

/** Sentences of a paragraph (a full stop followed by a space ends one). */
export const sentencesOf = (text: string): string[] => text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);

/**
 * A long checker-coverage paragraph as an inline lead plus a remainder for a disclosure. The lead is the first
 * sentence — extended through the first sentence that says what accepting does not prove ("…does not mean the sentence
 * is now correct") when that is not the first.
 */
export function splitCoverage(text: string): { lead: string; rest: string } {
  const ss = sentencesOf(text);
  if (ss.length <= 1) return { lead: text.trim(), rest: '' };
  const idx = ss.findIndex((x) => /correct/i.test(x));
  const cut = idx > 0 && idx <= 2 ? idx + 1 : 1;
  return { lead: ss.slice(0, cut).join(' '), rest: ss.slice(cut).join(' ') };
}

/** The top Home recommendation list's notion of "input": the reasons that point at a text to read or listen to. */
export const INPUT_REASONS: ReadonlySet<string> = new Set([
  'first-text', 'next-input', 'reread', 'reread-before-next', 'listen-to-read-text', 'reinforces-weak-items', 'prepares-scripture', 'revisit-scripture',
]);
