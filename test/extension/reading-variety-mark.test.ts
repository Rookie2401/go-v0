/**
 * Period-safe evidence is additive: a new, explicitly period-qualified mark
 * contributes to the same GoLearn language AND a separately keyed period row.
 * Preexisting events are not guessed into periods or rewritten.
 */
import { expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import { buildMarkEvent } from '../../packages/golearn-extension/src/store';

function mark(languageId: string, varietyId?: string, basis: 'override' | 'document-metadata' | 'team-default' = 'override') {
  const lemmaId = `lemma:${languageId}:λόγος:NOUN`;
  const formId = `form:${languageId}:λόγος`;
  const card = {
    languageId, surface: 'λόγος', itemIds: [lemmaId], formId,
    tokenCount: 1, context: { kind: 'none', confidence: 0 },
    packId: `pack:${languageId}:test`, analyzerId: 'test', confidence: 0.95,
  };
  return buildMarkEvent({
    card: card as never,
    readerId: 'web-generic',
    identity: { learnerId: 'local-learner', enrolmentId: 'local-enrolment:el', deviceId: 'dev-test' },
    language: { languageId, ...(varietyId ? { varietyId } : {}), basis, confidence: basis === 'team-default' ? 0.3 : 1 },
    version: 'test', sessionId: 'period-mark', now: new Date('2026-11-12T17:00:00.000Z'),
  }, 'known');
}

it('records period-specific form and lemma alongside the original identity, without altering the language ID', () => {
  const e = mark('el', 'el-koi');
  expect(e.languageId).toBe('el');
  expect(e.subject.itemIds).toEqual([
    'lemma:el:λόγος:NOUN',
    'lemma:el:el-koi:λόγος:NOUN',
    'form:el:el-koi:λόγος',
  ]);
  expect(validateEvent(e)).toEqual([]);
  expect(e.payload).toMatchObject({ mark: 'known' });
});

it('never assigns team-default, missing, or invalid varieties to a period', () => {
  for (const e of [
    mark('el'),
    mark('el', 'el-koi', 'team-default'),
    mark('el', 'he-bib'),
    mark('sq', 'el-koi'),
  ]) {
    expect(e.subject.itemIds).toEqual(['lemma:' + e.languageId + ':λόγος:NOUN']);
    expect(validateEvent(e)).toEqual([]);
  }
});

it('keeps different Greek periods in separate knowledge keys', () => {
  const koine = mark('el', 'el-koi');
  const attic = mark('el', 'el-att');
  expect(koine.subject.itemIds).toContain('form:el:el-koi:λόγος');
  expect(attic.subject.itemIds).toContain('form:el:el-att:λόγος');
  expect(koine.subject.itemIds).not.toContain('form:el:el-att:λόγος');
  expect(attic.subject.itemIds).not.toContain('form:el:el-koi:λόγος');
});
