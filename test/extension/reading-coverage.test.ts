import { expect, it } from 'vitest';
import { aggregateCoverage } from '../../packages/golearn-extension/src/reading/coverage';

const options = { languageId: 'es', sourceScope: 'primary', freshness: 'current' } as const;

it('counts each occurrence, including unresolved and unrecorded vocabulary', () => {
  const result = aggregateCoverage([
    { identity: 'a', state: 'known' }, { identity: 'a', state: 'known' },
    { identity: 'b', state: 'automatic' }, { identity: 'c', state: 'recognized' },
    { identity: 'd', state: 'familiar' }, { identity: 'e', state: 'new' },
    { identity: 'f', state: 'seen' }, { identity: 'g' }, { state: 'known' }, {},
  ], options);
  expect(result).toMatchObject({
    totalOccurrences: 10, uniqueResolvedVocabulary: 7,
    confidentCoverage: 30, familiarCoverage: 50,
    occurrences: { confidentKnown: 3, familiarOnly: 2, newOrSeen: 2, unrecorded: 1, unresolved: 2 },
  });
});

it('leaves percentages absent for an empty sample', () => {
  expect(aggregateCoverage([], options)).toMatchObject({ familiarCoverage: null, confidentCoverage: null });
});
