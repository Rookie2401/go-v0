/**
 * @go/repository-sync — the CLIENT side of Repository synchronization: a device's durable outbound queue, push/pull
 * against a `Transport`, retry with backoff, reconciliation, the mutable-document conflict rules and a status object.
 * Imports the contract only. The server side is a different package that implements the other end of `Transport`.
 */
export * from './area';
export * from './ids';
export * from './queue';
export * from './documents';
export * from './client';
