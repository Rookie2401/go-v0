// GoReview judges a dictionary sense by the meanings it lists, not as one string (defect found 2026-11-13 by the Latin course:
// the shared builder kept only senses of at most four words, judged WHOLE before splitting, so a long main sense was dropped while a
// short tail sense survived; credo accepted only "to lend, to loan"). The senses below are the real dictionary's, copied from
// public/dict; the last block reads the real packs where the dictionaries are installed (they are gitignored, built locally).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { acceptedMeanings, attributionLine, referenceGloss } from '../../../packages/goreview/src/exercises/shared';
import { packFactsFor } from '../../../packages/goreview/app/packFacts';
import { writtenRecognition } from '../../../packages/goreview/src/exercises/written-recognition';
import type { ReviewFacts } from '../../../packages/goreview/src/facts/review-facts';
import type { UnitFacts } from '../../../packages/goreview/src/types';
import type { RepositoryApi } from '../../../packages/repository-service/src/api';

const ATTRIBUTION = 'Wiktionary, via kaikki.org — CC BY-SA 4.0';
const dictionaryFacts = (glosses: string[], lexicon: string[] = []): UnitFacts =>
  ({ glosses: [...lexicon, ...glosses], lexiconGlossCount: lexicon.length, glossAttribution: ATTRIBUTION }) as unknown as UnitFacts;

// public/dict/la: credo (VERB), in the dictionary's order
const CREDO = [
  'to believe, to trust in, to give credence to',
  'to confide in, have confidence in',
  'to think, imagine, suppose, assume',
  'to commit or consign something to one for preservation, protection, etc., to entrust to one',
  'to lend, to loan',
];

describe('dictionary senses are split before their length is judged', () => {
  it('credo (la): the main sense "to believe" is accepted, ahead of the tail sense "to lend"', () => {
    const accepted = acceptedMeanings(dictionaryFacts(CREDO));
    expect(accepted).toContain('to believe');
    expect(accepted).toContain('to trust in');
    expect(accepted.indexOf('to believe')).toBeLessThan(accepted.indexOf('to lend'));
    expect(accepted.slice(0, 3)).toEqual(['to believe', 'to trust in', 'to give credence to']);
    // the prose sense is not cut into fragments ("etc." is never an answer)
    expect(accepted).not.toContain('etc.');
    expect(accepted).not.toContain('protection');
  });

  it('credo (la): the card explains with the main sense, not the third', () => {
    expect(referenceGloss(dictionaryFacts(CREDO))).toBe('to believe, to trust in');
  });

  it('være (nb): "to be; to have a particular identity, classification, quality or condition." gives "to be", not the prose pieces', () => {
    const facts = dictionaryFacts([
      'to be; to have a particular identity, classification, quality or condition.',
      'to be, exist; of a person, to live.',
      'to take place, occur; to be held.',
    ]);
    const accepted = acceptedMeanings(facts);
    expect(accepted[0]).toBe('to be');
    expect(accepted).toEqual(expect.arrayContaining(['exist', 'to take place', 'occur']));
    expect(accepted).not.toContain('classification');
    expect(referenceGloss(facts)).toBe('to be');
  });

  it('ของ (th): a semicolon list of single words gives each word, in order', () => {
    expect(acceptedMeanings(dictionaryFacts(['thing; item; article; stuff; matter', 'talent; ability']))).toEqual(
      ['thing', 'item', 'article', 'stuff', 'matter', 'talent; ability', 'talent', 'ability']);
  });

  it('παραμένω (el) and करना (hi): list items lose their aside and their conjunction', () => {
    expect(acceptedMeanings(dictionaryFacts(['to remain, stay (at a location)']))).toEqual(['to remain', 'stay']);
    expect(acceptedMeanings(dictionaryFacts(['to move, shift, or place']))).toEqual(['to move', 'shift', 'place']);
  });

  it('prose and the "relating to" template are not cut into fragments', () => {
    // nn gulen; es chalateco
    expect(acceptedMeanings(dictionaryFacts(['a municipality of Sogn og Fjordane, Norway']))).toEqual([]);
    expect(acceptedMeanings(dictionaryFacts(['of, from or relating to Chalatenango']))).toEqual([]);
    expect(referenceGloss(dictionaryFacts(['of, from or relating to Chalatenango']))).toBe('of, from or relating to Chalatenango');
  });

  it('a short sense keeps its old treatment: the whole and every part, function words included (en: "in, at, on")', () => {
    expect(acceptedMeanings(dictionaryFacts(['in, at, on', 'in (a time)']))).toEqual(['in, at, on', 'in', 'at', 'on']);
  });

  it('word-list glosses still come first and are kept whole', () => {
    const facts = dictionaryFacts(CREDO, ['to believe, to trust, and so forth at length']);
    expect(acceptedMeanings(facts)[0]).toBe('to believe, to trust, and so forth at length');
    expect(referenceGloss(facts)).toBe('to believe, to trust, and so forth at length');
  });

  it('a reference cut from a dictionary sense still owes the attribution line; a word-list gloss does not', () => {
    const facts = dictionaryFacts(CREDO);
    expect(attributionLine(facts, [referenceGloss(facts)!])).toContain(ATTRIBUTION);
    expect(attributionLine(dictionaryFacts(CREDO, ['believe']), ['believe'])).toBe('');
  });
});

// The real packs, as GoReview builds a card: the pack's facts provider, then the written-recognition exercise.
const PUBLIC = path.resolve(__dirname, '../../../public');
const installed = (lang: string): boolean => fs.existsSync(path.join(PUBLIC, 'dict', lang, 'manifest.json'));
const fetchAssets = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as typeof fetch;
const api = { async unit() { return { ok: false, status: 404, error: 'not-found', message: 'missing', body: {} }; } } as unknown as RepositoryApi;

async function card(lang: string, variety: string, surface: string) {
  const provider = packFactsFor({ fetch: fetchAssets, baseUrl: 'http://assets.local/' })(lang, api)!;
  const unitId = `form:${lang}:${surface}`;
  const facts = await provider.factsFor(unitId, lang, variety) as ReviewFacts | undefined;
  expect(facts, `facts for ${surface}`).toBeDefined();
  const built = await writtenRecognition.build({ unitId, unitKind: 'form', languageId: lang, varietyId: variety, dimension: 'written-recognition' }, facts!, { now: '2026-11-13T00:00:00.000Z', random: () => 0 });
  const key = (built as { answerKey?: { accepted?: string[]; explanation?: string } }).answerKey ?? {};
  return { accepted: key.accepted ?? [], explanation: key.explanation ?? '' };
}

describe('real cards (dictionaries installed locally)', () => {
  it.skipIf(!installed('la'))('credo (la): the card accepts "to believe" and explains with it', async () => {
    const { accepted, explanation } = await card('la', 'la-eccl', 'credo');
    expect(accepted).toContain('to believe');
    expect(explanation).toContain('means “to believe');
  }, 60_000);

  it.skipIf(!installed('nb'))('være (nb): the card accepts "to be" (before the fix it had no answer and was refused)', async () => {
    const { accepted, explanation } = await card('nb', 'nb', 'være');
    expect(accepted[0]).toBe('to be');
    expect(explanation).toContain('means “to be”');
  }, 60_000);
});
