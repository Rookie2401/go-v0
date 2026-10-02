/**
 * A text in a heritage variety (Awadhi, Braj, the language of the sant poets beside Modern Standard Hindi) is read as
 * its own language: reading it credits no word, phrase, pattern or script item of the course language. The reading
 * itself stays in the event log, so nothing is lost; it is only never taken as evidence about Modern Standard Hindi.
 * The adapter's own variety table decides what is a heritage variety — GoLearn knows no language by name.
 */
import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { LanguageAdapter } from '../../src/core';
import { HI_VARIETIES } from '../../src/adapters/hindi/varieties';
import { createHarness } from './harness';
import { t } from './courseFixtures';

const U = 'u1';

async function setup() {
  const h = createHarness();
  // the test registry's Hindi adapter gets the real variety table of the Hindi adapter
  (h.adapters.get('hi') as { varieties?: LanguageAdapter['varieties'] }).varieties = HI_VARIETIES;
  const sentences = (words: string[]) => [{ tokens: words.map((w) => t(w, w, 'NOUN')) }, { tokens: words.map((w) => t(w, w, 'NOUN')) }];
  const std = await buildFixtureText(h.store, { lang: 'hi', slug: 'std', title: 'std', kind: 'story', sentences: sentences(['घर', 'पानी']) });
  const awa = await buildFixtureText(h.store, { lang: 'hi', slug: 'awa', title: 'awa', kind: 'story', sentences: sentences(['भवन', 'नीर']) });
  await h.store.texts.put({ ...awa, variety: 'awa' });
  const regional = await buildFixtureText(h.store, { lang: 'hi', slug: 'reg', title: 'reg', kind: 'story', sentences: sentences(['दरिया']) });
  await h.store.texts.put({ ...regional, variety: 'hi-unknown-code' });
  return { h, std: std.id, awa: ids.text('hi', 'awa'), regional: ids.text('hi', 'reg') };
}

describe('heritage varieties are kept apart from the course language', () => {
  it('every variety the Hindi adapter lists is a heritage variety, and none is called a dialect or an older Hindi', () => {
    expect(Object.keys(HI_VARIETIES).sort()).toEqual(['awa', 'bra', 'hi-sant']);
    for (const v of Object.values(HI_VARIETIES)) {
      expect(v.kind).toBe('heritage');
      expect(v.note).toMatch(/Modern Standard Hindi/);
      expect(v.note).not.toMatch(/dialect|corrupt|old Hindi|impure|incorrect/i);
    }
  });

  it('reading a Modern Standard Hindi text credits its words; reading an Awadhi text credits nothing', async () => {
    const { h, std, awa } = await setup();
    await h.viewAll(U, 'hi', awa, 2);
    expect(await h.store.learnerItems.count()).toBe(0);
    await h.viewAll(U, 'hi', std, 2, 's2');
    const rows = await h.store.learnerItems.where('userId', U);
    expect(rows.length).toBeGreaterThan(0);
    const all = JSON.stringify(rows);
    expect(all).toContain('घर');
    expect(all).not.toContain('भवन');
    expect(all).not.toContain('नीर');
  });

  it('the heritage reading is still in the log: it is left out of the evidence, not erased', async () => {
    const { h, awa } = await setup();
    await h.viewAll(U, 'hi', awa, 2);
    const events = await h.store.events.all();
    expect(events.filter((e) => e.type === 'SentenceViewed')).toHaveLength(2);
  });

  it('a variety code the adapter does not list as heritage is counted like any other text', async () => {
    const { h, regional } = await setup();
    await h.viewAll(U, 'hi', regional, 2);
    expect(JSON.stringify(await h.store.learnerItems.where('userId', U))).toContain('दरिया');
  });

  it('a language whose adapter lists no heritage variety is untouched (Spanish text with a variety)', async () => {
    const h = createHarness();
    const text = await buildFixtureText(h.store, { lang: 'es', slug: 'v', title: 'v', kind: 'story', sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
    await h.store.texts.put({ ...text, variety: 'es-ES' });
    await h.view(U, 'es', text.id, 0);
    expect(JSON.stringify(await h.store.learnerItems.where('userId', U))).toContain('sol');
  });
});
