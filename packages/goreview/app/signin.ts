/**
 * Sign-in helpers (the owner, 2026-11-12): what a learner is told when a sign-in gets no answer (never the service address, never a hint that
 * where GoReview connects could be changed), and one more try when the service is waking up or redeploying.
 */
/** Said when a sign-in gets no answer. */
export const UNREACHABLE_SIGN_IN = 'GoReview could not reach its service. Check your internet connection and try again.';
/** Said when this copy's built-in service address is unusable: the app's fault, not the learner's to fix. */
export const CANNOT_SIGN_IN = 'GoReview cannot sign in from this copy. Update GoReview, then try again.';
/** How long a sign-in or account creation may take: long enough for the service to wake up or finish a redeploy (30-60 s). */
export const SIGN_IN_TIMEOUT_MS = 45_000;
const WAKING = new Set([502, 503, 504]);
/** A service waking up or redeploying answers 502, 503 or 504, or drops the connection quickly: one more try, two seconds later. */
export async function signInOnce<T extends { ok: boolean; status?: number }>(attempt: () => Promise<T>, pause: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), now: () => number = Date.now): Promise<T> {
  const started = now();
  try {
    const first = await attempt();
    if (first.ok || !WAKING.has(first.status ?? 0)) return first;
  } catch (e) {
    if (now() - started > 15_000) throw e; // it already waited its full time: a second wait would only double it
  }
  await pause(2000);
  return attempt();
}
