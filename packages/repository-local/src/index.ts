/**
 * @go/repository-local — the Repository on one device, with no account: the service's own store, projection engine, linguistic layer
 * and request handler, run in-process over a key-value area, plus the upload that moves the history to an account when the learner
 * signs in. See ../../docs/ecosystem/REPOSITORY-LOCAL.md.
 */
export { openLocalRepository, inspectLocal, markEventsOwned, DEFAULT_PREFIX, LOCAL_EMAIL } from './local';
export type { LocalRepository, LocalIdentity, OpenLocalOptions, LocalInspection } from './local';
export { resolveWithAdapter } from './linguistics';
export type { AdapterLike } from './linguistics';
export { sha256Hex } from './crypto';
export { UPLOAD_BATCH } from './transfer';
export type { UploadMarker } from './transfer';
export type { PersistStats } from './persist';
export { connectLocalRepository } from './proxy';
export type { Send } from './proxy';
