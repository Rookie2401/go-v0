// @vitest-environment node
/**
 * End-to-end period-safe knowledge path: a real GoLearn ItemMarked event goes
 * through the background, the on-device Repository fold and the Reading Analysis
 * read-only profile. No mocked vocabulary API.
 */
import { expect, it } from 'vitest';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { PENDING_IDENTITY, buildMarkEvent } from '../../packages/golearn-extension/src/store';
import { createRig } from './rig';

it('a Koine mark is reflected in the Koine profile, never the Attic profile', async () => {
  const rig = createRig();
  const card = {
    languageId: 'el', surface: 'λόγος',
    itemIds: ['lemma:el:λόγος:NOUN'], formId: 'form:el:λόγος',
    packId: 'pack:el:test', analyzerId: 'test', confidence: 0.95,
    tokenCount: 1, provenance: 'dictionary', unconfirmed: false, constructions: [],
    pronunciation: [], phrases: [], context: { kind: 'none', confidence: 0 },
  };
  const event = buildMarkEvent({
    card: card as never, readerId: 'web-generic',
    identity: { ...PENDING_IDENTITY }, version: 'test', sessionId: 'period-reading',
    now: new Date('2026-11-12T22:00:00.000Z'),
    language: { languageId: 'el', varietyId: 'el-koi', basis: 'override', confidence: 1 },
  }, 'known');
  const record = await rig.content({ type: MSG.record, event });
  expect(record).toMatchObject({ ok: true });
  const fetched = await rig.content({
    type: MSG.readingProfile, languageId: 'el',
    unitIds: ['form:el:el-koi:λόγος', 'lemma:el:el-koi:λόγος:NOUN', 'form:el:el-att:λόγος'],
  });
  expect(fetched).toMatchObject({ ok: true, source: 'device' });
  expect(fetched.rows?.['form:el:el-koi:λόγος']?.selfMark?.mark).toBe('known');
  expect(fetched.rows?.['lemma:el:el-koi:λόγος:NOUN']?.selfMark?.mark).toBe('known');
  expect(fetched.rows?.['form:el:el-att:λόγος']).toBeUndefined();
});
