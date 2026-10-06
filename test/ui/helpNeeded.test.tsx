// @vitest-environment jsdom
/**
 * "Help you needed" on Home: the rescue-dependence record in plain words. Nothing before any reading; each kind of help
 * on its own line; the two script lines only when such help was used; a direction only when GoLearn states one.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { RescueDependence } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { rescueChanges, rescueLines } from '../../src/ui/rescue';
import { makeHarness, q, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;

const rates = (over: Partial<RescueDependence['overall']> = {}): RescueDependence['overall'] => ({
  sentences: 200, words: 1000, per100Words: { decoding: 0, romanization: 0, word: 6.4, phrase: 0, grammar: 0 }, per100Sentences: { explanation: 0, english: 12 }, unaidedSentenceShare: 0.71, ...over,
});

describe('rescueLines (pure)', () => {
  it('says nothing before any reading', () => {
    expect(rescueLines({ overall: rates({ sentences: 0, words: 0 }), trend: 'insufficient-data' })).toEqual([]);
  });

  it('gives each kind of help its own line and leaves out kinds that were never used', () => {
    const lines = rescueLines({ overall: rates(), trend: 'steady' });
    expect(lines).toEqual([
      'Sentences read with no help at all: 71 in 100',
      'English for a sentence: 12 in 100 sentences',
      'A word looked up: 6.4 in 100 words',
    ]);
  });

  it('shows the script lines only when the script help was used (a course whose script needs decoding)', () => {
    const lines = rescueLines({ overall: rates({ per100Words: { decoding: 22, romanization: 3.5, word: 6.4, phrase: 1, grammar: 2 } }), trend: 'steady' });
    expect(lines).toContain('A word read piece by piece: 22 in 100 words');
    expect(lines).toContain('The Latin-letter spelling: 3.5 in 100 words');
    expect(lines).toContain('A phrase looked up: 1 in 100 words');
    expect(lines).toContain('Grammar help: 2 in 100 words');
  });

  it('names what was needed less and what was needed more, kind by kind', () => {
    const d: RescueDependence = { overall: rates(), trend: 'falling', byKind: { decoding: 'falling', romanization: 'falling', word: 'steady', phrase: 'steady', grammar: 'rising', explanation: 'steady', english: 'falling' } };
    expect(rescueChanges(d)).toEqual([
      'Needed less than before: reading a word piece by piece, the Latin-letter spelling.',
      'Needed more than before: grammar help.',
    ]);
    expect(rescueChanges({ overall: rates(), trend: 'insufficient-data' })).toEqual([]);
  });
});

describe('Home is a directory; reading guidance stays with reading surfaces', () => {
  it('links to the reader without showing invented progress figures', async () => {
    const h = await makeHarness();
    mounted = await h.mount(app());
    expect(qa(mounted.container, 'a.home__entry').some((a) => a.getAttribute('href') === '/read')).toBe(true);
    expect(q(mounted.container, '[data-testid="help-needed"]')).toBeNull();
    expect(h.learn.rescueDependence).not.toHaveBeenCalled();
  });

  it('does not put rescue trend numbers on Home after there is reading history either', async () => {
    const h = await makeHarness();
    h.learn.rescueDependence.mockImplementation(async () => ({ overall: rates({ sentences: 8, words: 40 }), trend: 'insufficient-data' as const }));
    mounted = await h.mount(app());
    expect(q(mounted.container, '[data-testid="help-needed"]')).toBeNull();
    expect(h.learn.rescueDependence).not.toHaveBeenCalled();
    expect(mounted.container.textContent).not.toMatch(/Too little reading yet|in 100 sentences/);
  });
});
