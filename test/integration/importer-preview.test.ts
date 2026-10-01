/**
 * The in-app importer says BEFORE importing whether a file would be published, and what is missing if not —
 * so "missing publication requirements" is a visible validation result, not a surprise after the import.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { applyReview } from '../../src/ingest';
import { createIngestApi } from '../../src/app/bootstrap';
import { bundledDoc } from './harness';

describe('importer preview states the publication outcome', () => {
  const api = createIngestApi(createMemoryStore(), createAdapterRegistry());

  it('an unreviewed text: valid, will import, will NOT publish — with the reason', async () => {
    const [view] = await api.validate([bundledDoc('es', 'story-01')]);
    expect(view.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(view.published).toBe(false);
    expect(view.unpublishedReasons!.join(' ')).toMatch(/review/i);
  });

  it('the same text with a recorded review would publish', async () => {
    const r = applyReview(bundledDoc('es', 'story-01'), { by: 'Synthetic test reviewer', date: '2026-10-01' });
    if (!r.ok) throw new Error('review refused');
    const [view] = await api.validate([r.doc]);
    expect(view.published).toBe(true);
    expect(view.unpublishedReasons).toEqual([]);
  });

  it('verified Scripture would publish; unverified Scripture would not, and says what is missing', async () => {
    const [ok] = await api.validate([bundledDoc('es', 'bible-1john-1')]);
    expect(ok.published).toBe(true);
    const [blocked] = await api.validate([bundledDoc('th', 'bible-1john-1')]);
    expect(blocked.published).toBe(false);
    expect(blocked.unpublishedReasons!.join(' ')).toMatch(/verif/i);
  });

  it('a document with errors gets no publication verdict (it would not be imported at all)', async () => {
    const bad = bundledDoc('es', 'story-01') as unknown as Record<string, unknown>;
    bad.schemaVersion = 1;
    const [view] = await api.validate([bad]);
    expect(view.issues.some((i) => i.severity === 'error')).toBe(true);
    expect(view.published).toBeUndefined();
  });
});
