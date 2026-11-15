/**
 * The error `loadBuiltInAdapter` rejects with when a language's analyser could not be loaded (an application that fetches each language's
 * analyser as its own chunk, such as GoReview's review build, meets it on a phone with no connection and no cached copy). `message` is
 * written for the learner; `retryable` is always true: the next call tries again.
 */
export class AdapterLoadError extends Error {
  readonly languageId: string;
  readonly retryable = true as const;
  constructor(languageId: string, cause?: unknown) {
    super(`The ${languageId} language tools could not be loaded. Check your connection, then try again.`);
    this.name = 'AdapterLoadError';
    this.languageId = languageId;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}
