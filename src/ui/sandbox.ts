/**
 * Sandbox mode: `?sandbox=<name>` (letters, digits, dash) opens a separate database (`go-v0-sandbox-<name>`) and
 * namespaces EVERY localStorage key the app uses under `sandbox:<name>:`. It exists so acceptance and import tests in a
 * real browser can use synthetic material without ever touching the learner's library, preferences, sittings, drafts or
 * remembered choices.
 *
 *  - Never active without the parameter: with no `sandbox` parameter every function below is the identity.
 *  - The parameter lives in `location.search`. The app uses a HashRouter, which leaves the search part alone, so the
 *    sandbox survives in-app navigation and a reload.
 *  - A parameter that is present but not a valid name does NOT silently fall back to the normal library (that would write
 *    test data into it): bootstrap refuses to start and says why (`sandboxProblem`).
 *
 * Reading `location` on every call (instead of caching at import) keeps the module honest in tests that change the URL.
 */
export const SANDBOX_PARAM = 'sandbox';
const VALID_NAME = /^[A-Za-z0-9-]+$/;

const search = (): string => (typeof location !== 'undefined' ? location.search : '');

/** The sandbox name in a query string, if present AND valid. */
export function parseSandboxName(query: string): string | undefined {
  try {
    const v = new URLSearchParams(query).get(SANDBOX_PARAM);
    return v !== null && VALID_NAME.test(v) ? v : undefined;
  } catch { return undefined; }
}

/** Why the `sandbox` parameter cannot be honoured (present but invalid); undefined when absent or valid. */
export function sandboxProblem(query: string = search()): string | undefined {
  try {
    const v = new URLSearchParams(query).get(SANDBOX_PARAM);
    if (v === null || VALID_NAME.test(v)) return undefined;
    return `The sandbox name "${v}" is not valid: use only letters, digits and dashes (for example ?sandbox=import-test). Nothing was opened, so your library is untouched.`;
  } catch { return undefined; }
}

/** The active sandbox name, or undefined for the normal app. */
export function activeSandbox(): string | undefined {
  return parseSandboxName(search());
}

export const sandboxDbName = (name: string): string => `go-v0-sandbox-${name}`;

/** Database name for this page: the sandbox's own when the parameter is present, else `fallback` (default: the normal one). */
export function resolveDbName(fallback?: string): string | undefined {
  const name = activeSandbox();
  return name ? sandboxDbName(name) : fallback;
}

/** A localStorage key for this page: namespaced under `sandbox:<name>:` in sandbox mode, unchanged otherwise. */
export function scopedKey(key: string): string {
  const name = activeSandbox();
  return name ? `sandbox:${name}:${key}` : key;
}

/** The same page without the sandbox parameter (other query parameters and the hash are kept): the link back to the normal app. */
export function normalAppHref(): string {
  if (typeof location === 'undefined') return './';
  const params = new URLSearchParams(location.search);
  params.delete(SANDBOX_PARAM);
  const rest = params.toString();
  return `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`;
}
