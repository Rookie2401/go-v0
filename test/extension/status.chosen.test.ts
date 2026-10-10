/**
 * The worker's status names the languages the learner chose as the ones the reader resolves against (every pack when none is
 * chosen), so a page in the chosen language is recognised from its own word list and no other chunk is loaded to compare.
 */
import { describe, expect, it } from 'vitest';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { createChromeFake } from './chromeFake';

const CONTENT = { id: 'test-ext-id', tab: { id: 7 }, url: 'https://example.test/page' };
const PAGE = { id: 'test-ext-id', url: 'chrome-extension://test-ext-id/app/index.html' };

describe('installedLanguages in the status', () => {
  it('is every non-planned pack before a language is chosen, then exactly the chosen ones, in setup order', async () => {
    const fake = createChromeFake();
    createBackground(fake, { fetch: (async () => { throw new TypeError('no network'); }) as typeof fetch }).register();
    const before = await fake.dispatch({ type: MSG.status }, CONTENT) as { installedLanguages: string[] };
    expect(before.installedLanguages.sort()).toEqual(['de', 'es', 'hi', 'nb', 'nn', 'sq', 'th']);
    expect(await fake.dispatch({ type: MSG.localRepo, op: 'enrol', languageId: 'de', packId: 'pack:de', packVersion: '1' }, PAGE)).toMatchObject({ ok: true });
    const one = await fake.dispatch({ type: MSG.status }, CONTENT) as { installedLanguages: string[]; languageId: string };
    expect(one.installedLanguages).toEqual(['de']);
    expect(one.languageId).toBe('de');
    await fake.dispatch({ type: MSG.localRepo, op: 'enrol', languageId: 'sq', packId: 'pack:sq', packVersion: '1' }, PAGE);
    const two = await fake.dispatch({ type: MSG.status }, CONTENT) as { installedLanguages: string[] };
    expect(two.installedLanguages.sort()).toEqual(['de', 'sq']);
  });
});
