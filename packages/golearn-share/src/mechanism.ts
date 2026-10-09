/**
 * The ways a passage can reach GoLearn from outside a browser tab, and the reader id each one records.
 *
 * Nothing here is a claim that a mechanism works on a given device or in a given app: that is what the plan in
 * docs/ecosystem/reader/MOBILE-COMPANION-PLAN.md says is verified (today only the web share target and the pasted-text
 * path, in jsdom) and what it says is not (every native route).
 */
export const SHARE_MECHANISMS = [
  'android-process-text',
  'android-send',
  'ios-share-extension',
  'ios-safari-extension',
  'web-share-target',
  'clipboard-import',
  'deep-link',
] as const;

export type ShareMechanism = (typeof SHARE_MECHANISMS)[number];

/** The reader ids a share records (`payload.readerId`), alongside the browser's `web-generic` and `epub-local`. */
export type ShareReaderId = 'share-android' | 'share-ios' | 'share-web' | 'clipboard';

export const SHARE_READER_IDS: readonly ShareReaderId[] = ['share-android', 'share-ios', 'share-web', 'clipboard'];

/**
 * `deep-link` maps to `share-web`: a link (Android App Link, iOS Universal Link, or a plain URL) carries the same query a
 * web share target does and arrives through the same page; it does not say which operating system opened it.
 */
export function shareReaderId(mechanism: ShareMechanism): ShareReaderId {
  switch (mechanism) {
    case 'android-process-text':
    case 'android-send':
      return 'share-android';
    case 'ios-share-extension':
    case 'ios-safari-extension':
      return 'share-ios';
    case 'clipboard-import':
      return 'clipboard';
    case 'web-share-target':
    case 'deep-link':
      return 'share-web';
  }
}

export const isShareMechanism = (x: unknown): x is ShareMechanism => typeof x === 'string' && (SHARE_MECHANISMS as readonly string[]).includes(x);

/** What the sending side hands over. Every field but `text`, `mechanism` and `receivedAt` is optional and untrusted. */
export interface SharedPassage {
  /** The selected or shared text. Used once to find a word and a context; never stored. */
  text: string;
  /** The app that sent it, when the platform names it (an Android package name or an app label). Never the text. */
  sourceApp?: string;
  /** A link the sender attached. Only its path is ever kept. */
  url?: string;
  /** A title the sender attached (a book or page title). Dropped when it repeats the text. */
  title?: string;
  /** A BCP 47 tag the sender or the learner's enrolment supplied; informational and used to segment. */
  languageHint?: string;
  /** ISO 8601 time the passage reached GoLearn. */
  receivedAt: string;
  mechanism: ShareMechanism;
}
