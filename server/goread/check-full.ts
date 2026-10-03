/**
 * The full document check (Node only): the light check, then the validator with every language adapter
 * (`validateBatch`). Kept apart from check.ts so a Worker bundle of the light check never contains the adapters.
 */
import { createAdapterRegistry } from '../../src/adapters/index.ts';
import { validateBatch } from '../../src/ingest/format.ts';
import { issueSummary, lightCheck, type CheckResult, type DocumentCheck, type GoreadCourse } from './check.ts';

let registry: ReturnType<typeof createAdapterRegistry> | undefined;

export const fullCheck: DocumentCheck = (doc: Record<string, unknown>, course: GoreadCourse): CheckResult => {
  const light = lightCheck(doc, course);
  if (!light.ok) return light;
  registry ??= createAdapterRegistry();
  const verdict = validateBatch([doc], { registry });
  const issues = verdict.documents[0]?.issues ?? [];
  if (!verdict.ok) return { ok: false, error: 'invalid-document', message: issueSummary(issues.filter((i) => i.severity === 'error')), issues };
  return { ok: true };
};
