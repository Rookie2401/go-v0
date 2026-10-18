// @vitest-environment node
import { expect, it } from 'vitest';
import { createHarness, signUp } from './fakes';
import type { ReviewCandidate } from '../../../packages/repository-contract/src';

it('pages the complete ranked learner set beyond 200 and rejects a foreign enrolment', async () => {
  const h = createHarness();
  const user = await signUp(h, 'candidate-pages@example.test');
  const other = await signUp(h, 'other-pages@example.test');
  const ranked: ReviewCandidate[] = Array.from({ length: 237 }, (_, i) => ({
    unitId: `form:sq:word${i}`, kind: 'form', score: 1 - i / 237, reasons: [],
    targetDimension: 'readingRecognition', eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, cost: 0,
  }));
  h.engine.candidates = async (_learner, _enrolment, opts) => ranked.slice(0, opts?.limit ?? 20);
  const first = await user.api.candidates(user.enrolmentId!, 200);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.data.candidates).toEqual(ranked.slice(0, 200));
  const next = await user.api.candidates(user.enrolmentId!, 200, first.data.nextCursor);
  expect(next.ok && next.data.candidates).toEqual(ranked.slice(200));
  expect(next.ok && next.data.nextCursor).toBeUndefined();
  const invalid = await user.api.candidates(user.enrolmentId!, 200, 'missing');
  expect(!invalid.ok && invalid.status).toBe(422);
  const foreign = await user.api.candidates(other.enrolmentId!, 200);
  expect(!foreign.ok && foreign.status).toBe(404);
});
