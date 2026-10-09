/**
 * The encounter a share records: the SAME `SelectionLookedUp` the browser extension records for a lookup
 * (`golearn-extension/src/store` `buildSelectionEvent`), with the reader id of the share and the share's source reference.
 *
 * This package may import only the Repository contract, so the builder is mirrored field by field rather than imported.
 * `test/golearn-share/event.test.ts` imports both and asserts the two agree (identical except the event id, the
 * producer app/surface a caller chooses, and the reader id), so a change to either side fails there.
 *
 * The event identifies a context; it never carries one: the payload holds the looked-up word or phrase (at most four
 * words, as in the browser), a hash of the sentence or fragment, counts and the reader id. Not the passage, not the
 * sender's title beyond the source reference, not the link beyond its path.
 */
import { CONTRACT_VERSION, type GoEvent, type LanguageEvidence, type SourceRef } from '../../repository-contract/src';
import { sharedSourceRef } from './source';
import { shareReaderId, type SharedPassage } from './mechanism';
import { wordCount } from './text';

/** A selection longer than this many words is a passage, not an item: its text is not stored even as a surface. */
export const MAX_STORED_SURFACE_WORDS = 4;

/** The parts of the extension's `CardModel` the event reads. A `CardModel` satisfies this structurally. */
export interface ShareCardView {
  languageId: string;
  packId: string;
  analyzerId: string;
  surface: string;
  itemIds: readonly string[];
  tokenCount: number;
  confidence: number;
  provenance: string;
  unconfirmed: boolean;
  lemma?: string;
  gloss?: string;
  morphology?: string;
  pronunciation: readonly unknown[];
  phrases: readonly unknown[];
  context: {
    kind: 'sentence' | 'fragment' | 'none';
    confidence: number;
    sentenceKey?: string;
    fragmentKey?: string;
    direction?: string;
  };
}

/**
 * How the language of a share was decided: the learner chose it on the share screen (`override`), or it is the enrolment's language
 * (`team-default`; nothing in a shared passage declares its language). Mirrors the browser's `LanguageInfo` fields an event records.
 */
export interface ShareLanguage {
  basis: LanguageEvidence['basis'];
  confidence: number;
  languageId?: string;
  varietyId?: string;
  source?: string;
}

/** `payload.language` (contract v3), built exactly as the extension's `languagePayload` builds it; `override` is true only for the basis `override`. */
export function shareLanguagePayload(l: ShareLanguage | undefined, languageId: string): LanguageEvidence | undefined {
  if (!l || l.basis === 'undetermined') return undefined;
  return {
    languageId: l.languageId ?? languageId,
    ...(l.varietyId ? { varietyId: l.varietyId } : {}),
    basis: l.basis,
    confidence: l.confidence,
    ...(l.source ? { source: l.source } : {}),
    override: l.basis === 'override',
  };
}

export interface ShareEventInput {
  card: ShareCardView;
  /** How the language was decided; recorded as `payload.language`. */
  language?: ShareLanguage;
  /** The shared passage's metadata. Its `text` is read only to decide whether the title is the text; it is not stored. */
  passage: Pick<SharedPassage, 'mechanism' | 'url' | 'title' | 'sourceApp' | 'text'>;  identity: { learnerId: string; enrolmentId: string; deviceId: string };
  version: string;
  sessionId: string;
  now: Date;
  /** The producing application: the setup web app is 'golearn-app'; inside the extension it must be 'golearn-ext'. Default 'golearn-app'. */
  producerApp?: 'golearn-app' | 'golearn-ext';
  /** Where in the application the lookup happened; recorded as `producer.surface`. Default 'share'. */
  surface?: string;
  /** Direction as detected for the shared text; falls back to the card's. */
  direction?: string;
  /** For tests; a fresh id is made otherwise. */
  id?: string;
}

let counter = 0;
const randomPart = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
};
const newEventId = (now: Date): string => `ev:${now.getTime().toString(36)}:${(counter++).toString(36)}:${randomPart()}`;

export function encounterFromShare(b: ShareEventInput): GoEvent {
  const { card } = b;
  const ctx = card.context;
  const readerId = shareReaderId(b.passage.mechanism);
  const source: SourceRef = sharedSourceRef(b.passage);

  const helpShown = ['surface'];
  if (card.lemma) helpShown.push('lemma');
  if (card.gloss) helpShown.push('gloss');
  if (card.morphology) helpShown.push('morphology');
  if (card.pronunciation.length) helpShown.push('pronunciation');
  if (card.phrases.length) helpShown.push('phrases');
  const short = wordCount(card.surface) <= MAX_STORED_SURFACE_WORDS;
  const subject: GoEvent['subject'] = { itemIds: [...card.itemIds] };
  if (ctx.kind === 'sentence' && ctx.sentenceKey) subject.sentenceKey = ctx.sentenceKey;
  subject.sourceRef = source;
  const payload: Record<string, unknown> = {
    tokenCount: card.tokenCount,
    contextKind: ctx.kind,
    contextConfidence: ctx.confidence,
    readerId,
    direction: b.direction ?? ctx.direction ?? 'unknown',
    provenance: card.provenance,
    unconfirmed: card.unconfirmed,
    helpShown,
    mode: 'word-list-only',
  };
  if (short) payload.surface = card.surface; else payload.surfaceOmitted = true;
  if (ctx.kind === 'fragment' && ctx.fragmentKey) payload.fragmentKey = ctx.fragmentKey;
  const language = shareLanguagePayload(b.language, card.languageId);
  if (language) payload.language = language;
  const itemKey = card.itemIds.join(',');
  return {
    id: b.id ?? newEventId(b.now),
    v: CONTRACT_VERSION,
    learnerId: b.identity.learnerId,
    enrolmentId: b.identity.enrolmentId,
    languageId: card.languageId,
    at: b.now.toISOString(),
    producer: { app: b.producerApp ?? 'golearn-app', version: b.version, deviceId: b.identity.deviceId, surface: b.surface ?? 'share' },
    kind: 'SelectionLookedUp',
    subject,
    payload,
    dedupeKey: `sel:${b.sessionId}:${itemKey}:${ctx.sentenceKey ?? ctx.fragmentKey ?? 'none'}`,
    provenance: { packId: card.packId, analyzerId: card.analyzerId, confidence: card.confidence },
  };
}
