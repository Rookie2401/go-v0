/** Plain-language reasons for a refused request to the Repository service. */
import type { ApiResult } from '../../repository-service/src/api';

export type Refused = Extract<ApiResult<unknown>, { ok: false }>;

export function explainFailure(r: Refused, mode: 'signin' | 'create'): string {
  if (r.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
  if (r.status === 409) return 'An account with this email already exists. Choose “Sign in” instead.';
  if (r.status === 403 && r.error === 'email-unverified') return r.message || 'Confirm your email address first: open the link in the email GoLearn sent you, or ask for it again below.';
  if (r.status === 401 || r.status === 403) return 'That email and password were not accepted.';
  if (r.status === 400 || r.status === 422) return r.message || (mode === 'create' ? 'The service did not accept those details.' : 'The service did not accept that request.');
  return r.message || `The service answered ${r.status}.`;
}
