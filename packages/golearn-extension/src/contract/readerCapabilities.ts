/**
 * What a reading environment can honestly provide to the extension. An adapter declares this; the content script and
 * the parser read it and never claim more than it states (charter principle 14: no false claims about reader
 * compatibility). The values describe the environment as the adapter can observe it, not as we hope it behaves.
 */

export type SentenceContextLevel = 'full' | 'partial' | 'none';
export type AnchorKind = 'dom-range' | 'cfi' | 'locator' | 'none';
export type PopupPositioning = 'range-rect' | 'fixed-corner' | 'none';
export type LayoutChangeHandling = 'observer' | 'manual' | 'none';

/** Persistent annotation (highlighting the page) is off unless the environment legitimately supports it. */
export type PersistentAnnotation =
  | { supported: false }
  | { supported: true; mechanism: string; /** the reader's own terms were reviewed by a person */ termsReviewed: true };

export interface ReaderCapabilities {
  readerId: string;
  /** Platform and version only where they can be discovered from the page itself; never guessed. */
  platform?: string;
  version?: string;

  /** The learner starts every lookup (selection + a command or toggle). Always true for this extension. */
  userTriggeredSelection: boolean;
  /** A word can be selected in this environment (double-click, drag). */
  wordSelection: boolean;
  /** The text of the selection can be read at all (false in a cross-origin frame or a canvas reader). */
  selectedTextAvailable: boolean;

  /** How much of the surrounding sentence the adapter may and can obtain. */
  sentenceContext: SentenceContextLevel;
  /** Whether the neighbouring sentences (before/after) can be obtained. */
  adjacentContext: boolean;

  /** How a place in the text can be re-found later (never the text itself). */
  stableAnchors: { kind: AnchorKind; note?: string };

  popupPositioning: PopupPositioning;
  layoutChangeHandling: LayoutChangeHandling;
  persistentAnnotation: PersistentAnnotation;
  /** The lookup works without a network. */
  offline: boolean;

  /** Plain statement of what the environment (or its terms) forbids or hides. */
  contentAccessRestrictions: string;
  /** 0..1: how far a sentence taken from this environment can be trusted as the real sentence. 0 when `none`. */
  contextConfidence: number;
  /** Browser permissions the adapter needs beyond the page itself. */
  requiredPermissions: string[];
}

/** Internal consistency of a declaration: the contract refuses claims the other fields contradict. */
export function validateCapabilities(c: ReaderCapabilities): string[] {
  const problems: string[] = [];
  if (!c.readerId) problems.push('readerId required');
  if (!(c.contextConfidence >= 0 && c.contextConfidence <= 1)) problems.push('contextConfidence must be within 0..1');
  if (c.sentenceContext === 'none') {
    if (c.contextConfidence !== 0) problems.push('sentenceContext none requires contextConfidence 0');
    if (c.adjacentContext) problems.push('adjacentContext cannot be claimed without sentence context');
  }
  if (c.sentenceContext === 'full' && c.contextConfidence < 0.5) problems.push('sentenceContext full requires contextConfidence of at least 0.5');
  if (!c.selectedTextAvailable) {
    if (c.sentenceContext !== 'none') problems.push('sentence context cannot be claimed when the selected text is unavailable');
    if (c.wordSelection) problems.push('wordSelection cannot be claimed when the selected text is unavailable');
  }
  if (c.stableAnchors.kind === 'none' && c.popupPositioning === 'range-rect') problems.push('range-rect positioning needs an anchor');
  if (c.persistentAnnotation.supported && !c.persistentAnnotation.termsReviewed) problems.push('persistent annotation needs a terms review');
  if (!c.userTriggeredSelection) problems.push('every lookup must be user-triggered');
  return problems;
}

/** The capabilities of an environment that offers nothing: used by the `unsupported` adapter. */
export function noCapabilities(readerId: string, restriction: string): ReaderCapabilities {
  return {
    readerId,
    userTriggeredSelection: true,
    wordSelection: false,
    selectedTextAvailable: false,
    sentenceContext: 'none',
    adjacentContext: false,
    stableAnchors: { kind: 'none' },
    popupPositioning: 'none',
    layoutChangeHandling: 'none',
    persistentAnnotation: { supported: false },
    offline: true,
    contentAccessRestrictions: restriction,
    contextConfidence: 0,
    requiredPermissions: [],
  };
}
