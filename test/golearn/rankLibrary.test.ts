/** rankLibrary — comprehensibility peaking at the asked-for coverage, interest, natural reinforcement, regional fit, novelty, and the anti-pathology rules. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { RankCandidate, RankedText } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { buildChapter, t } from './courseFixtures';
import { profile } from './profiles';

const U = 'u1';
const BASE = ids.text('es', 'base');

/** sol and habla shown understood; casa met with help (a weak item); rio never met. */
async function learner(h: Harness) {
  await buildChapter(h.store, {
    slug: 'base', sentences: [
      { tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] },
      { tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] },
      { tokens: [t('casa', 'casa', 'NOUN'), t('sol', 'sol', 'NOUN')] },
    ],
  });
  await h.understood(U, 'es', BASE, [0, 1], 'a');
  await h.view(U, 'es', BASE, 2, 'a');
  await h.help(U, 'es', BASE, 2, 0, ids.form('es', 'casa'), 1, 'a');
}
const make = async () => { const h = createHarness(); await learner(h); return h; };

/** A candidate whose `known` of 100 words are sol (known) and the rest rio (new). */
const cand = (id: string, known: number, extra: Partial<RankCandidate> = {}, forms?: Array<[string, number]>): RankCandidate => ({
  profile: profile(`text:es:${id}`, forms ?? [['sol', known], ['rio', 100 - known]]),
  published: true, rights: 'verified-public-domain', ...extra,
});
const rank = (h: Harness, cs: RankCandidate[], opts: Parameters<Harness['golearn']['rankLibrary']>[2] = {}) => h.golearn.rankLibrary(U, cs, { limit: 50, ...opts });
const order = (r: RankedText[]) => r.map((x) => x.textId.replace('text:es:', ''));
const scoreOf = (r: RankedText[], id: string) => r.find((x) => x.textId === `text:es:${id}`)!.score;

describe('comprehensibility peaks at the asked-for coverage, not at 100 %', () => {
  it('monotonic in coverage up to the target; falls gently above it', async () => {
    const h = await make();
    const r = await rank(h, [cand('c50', 50), cand('c70', 70), cand('c85', 85), cand('c93', 93), cand('c100', 100)]);
    const c = (id: string) => r.find((x) => x.textId === `text:es:${id}`)!.parts.comprehensibility;
    expect(c('c50')).toBeLessThan(c('c70'));
    expect(c('c70')).toBeLessThan(c('c85'));
    expect(c('c85')).toBeLessThan(c('c93'));
    expect(c('c93')).toBe(1); // steady target
    expect(c('c100')).toBeLessThan(c('c93')); // a text with nothing new in it is worth less than one at the target ...
    expect(c('c100')).toBeGreaterThan(c('c85')); // ... but more than one that is too hard
    expect(order(r)[0]).toBe('c93');
    expect(order(r)[order(r).length - 1]).toBe('c50');
  });

  it('the challenge option moves the peak: easy prefers more known, stretch accepts more new', async () => {
    const h = await make();
    const cs = [cand('k97', 97), cand('k93', 93), cand('k88', 88)];
    expect(order(await rank(h, cs, { challenge: 'easy' }))[0]).toBe('k97');
    expect(order(await rank(h, cs, { challenge: 'steady' }))[0]).toBe('k93');
    expect(order(await rank(h, cs, { challenge: 'stretch' }))[0]).toBe('k88');
  });
});

describe('the other parts', () => {
  it('interest: a stream or domain he said he cares about', async () => {
    const h = await make();
    const r = await rank(h, [cand('plain', 93), cand('hist', 93, { domains: ['history'] }), cand('str', 93, { stream: 'honduras' })], { interests: ['History', 'honduras'] });
    expect(r.find((x) => x.textId === 'text:es:plain')!.parts.interest).toBe(0);
    expect(order(r)[2]).toBe('plain');
    expect(r.find((x) => x.textId === 'text:es:hist')!.reasons.join(' ')).toMatch(/interest in history/);
    // no interests named: no effect
    const none = await rank(h, [cand('a', 93, { domains: ['history'] }), cand('b', 93)]);
    expect(none.every((x) => x.parts.interest === 0)).toBe(true);
  });

  it('reinforcement: a text that uses a word he is struggling with ranks higher, in natural context (and says so)', async () => {
    const h = await make();
    const withCasa = cand('with', 0, {}, [['sol', 90], ['casa', 5], ['rio', 5]]);
    const without = cand('without', 0, {}, [['sol', 90], ['rio', 10]]);
    const r = await rank(h, [without, withCasa]);
    expect(order(r)[0]).toBe('with');
    expect(r[0].parts.reinforcement).toBeGreaterThan(0);
    expect(r[0].profile.weakItems).toEqual([ids.form('es', 'casa')]);
    expect(r[0].reasons.join(' ')).toMatch(/still need help with, in natural context/);
    expect(r.find((x) => x.textId === 'text:es:without')!.parts.reinforcement).toBe(0);
  });

  it('regional relevance: the target variety, then other Latin American Spanish, then Spain, then older Spanish', async () => {
    const h = await make();
    const r = await rank(h, [cand('hn', 93, { variety: 'es-HN' }), cand('mx', 93, { variety: 'es-MX' }), cand('es', 93, { variety: 'es-ES' }), cand('old', 93, { variety: 'es-hist' })], { targetVariety: 'es-HN' });
    expect(order(r)).toEqual(['hn', 'mx', 'es', 'old']);
    // without a target nothing is preferred
    const none = await rank(h, [cand('a', 93, { variety: 'es-ES' }), cand('b', 93, { variety: 'es-HN' })]);
    expect(none[0].score).toBe(none[1].score);
  });

  it('novelty: unread texts first; quality: published, rights on record', async () => {
    const h = await make();
    const r = await rank(h, [cand('read', 93, { alreadyRead: true }), cand('fresh', 93)]);
    expect(order(r)).toEqual(['fresh', 'read']);
    const q = await rank(h, [cand('unpub', 93, { published: false, rights: 'rights-unverified' }), cand('pub', 93)]);
    expect(order(q)).toEqual(['pub', 'unpub']);
    expect(q[0].reasons.join(' ')).toMatch(/published, with its rights on record/);
  });

  it('every result has its parts, a score in 0..1 and at least one reason in plain words', async () => {
    const h = await make();
    const r = await rank(h, [cand('a', 93), cand('b', 60), cand('c', 99)]);
    for (const x of r) {
      expect(x.score).toBeGreaterThanOrEqual(0);
      expect(x.score).toBeLessThanOrEqual(1);
      expect(Object.keys(x.parts).sort()).toEqual(['challenge', 'comprehensibility', 'interest', 'novelty', 'quality', 'regional', 'reinforcement']);
      expect(x.reasons.length).toBeGreaterThan(0);
      for (const reason of x.reasons) expect(reason).toMatch(/^[A-Z].*\.$/);
      expect(x.profile.textId).toBe(x.textId);
    }
    expect(r[0].reasons[0]).toMatch(/words are shown understood or likely familiar/);
  });
});

describe('anti-pathology: the acquisition path is a ramp, not the course', () => {
  it('a controlled text does not outrank an authentic text of comparable comprehensibility merely on overlap', async () => {
    const h = await make();
    // below the target the controlled text leads on comprehensibility alone (90 % against 88 %)
    const r = await rank(h, [cand('ctl', 90, { controlled: true, rights: 'course-authored' }), cand('real', 88)]);
    const ctl = r.find((x) => x.textId === 'text:es:ctl')!;
    const real = r.find((x) => x.textId === 'text:es:real')!;
    expect(ctl.parts.comprehensibility).toBeGreaterThan(real.parts.comprehensibility);
    expect(order(r)).toEqual(['real', 'ctl']);
    expect(real.score).toBeGreaterThan(ctl.score);
    // a controlled text that is better in more than overlap, or far more comprehensible, is not held back
    const far = await rank(h, [cand('ctl', 93, { controlled: true, rights: 'course-authored' }), cand('real', 60)]);
    expect(order(far)[0]).toBe('ctl');
  });

  it('the weight of controlled texts falls as authentic candidates become comprehensible', async () => {
    const h = await make();
    const ctl = cand('ctl', 80, { controlled: true, rights: 'course-authored' });
    const hard = await rank(h, [ctl, cand('a1', 50), cand('a2', 40), cand('a3', 60)]); // no authentic text at 90 %
    const easy = await rank(h, [ctl, cand('a1', 95), cand('a2', 92), cand('a3', 60)]); // two of three at 90 % or more
    expect(scoreOf(easy, 'ctl')).toBeLessThan(scoreOf(hard, 'ctl'));
    const fade = scoreOf(easy, 'ctl') / scoreOf(hard, 'ctl');
    expect(fade).toBeCloseTo(1 - 0.7 * (2 / 3), 1);
    expect(easy.find((x) => x.textId === 'text:es:ctl')!.reasons.join(' ')).toMatch(/written for the course/);
    // with only controlled candidates there is nothing to fade against
    const alone = await rank(h, [ctl, cand('c2', 70, { controlled: true })]);
    expect(scoreOf(alone, 'ctl')).toBeCloseTo(scoreOf(hard, 'ctl'), 6);
  });

  it('no more than two consecutive results from one work', async () => {
    const h = await make();
    const chapters = [1, 2, 3, 4, 5].map((n) => cand(`wa-ch${n}`, 93));
    const others = [1, 2, 3].map((n) => cand(`wb-ch${n}`, 80));
    const r = await rank(h, [...chapters, ...others]);
    const work = (id: string) => id.replace(/-ch\d+$/, '');
    const seq = order(r).map(work);
    for (let i = 2; i < seq.length; i++) expect(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]), seq.join(',')).toBe(true);
    expect(order(r).slice(0, 2).map(work)).toEqual(['wa', 'wa']);
    expect(work(order(r)[2])).toBe('wb'); // the third best chapter of work A waits
    expect(order(r)).toHaveLength(8); // nothing is dropped
    // the stored text's own work decides when it is known
    const h2 = await make();
    for (const n of [1, 2, 3]) {
      await buildChapter(h2.store, { slug: `x${n}`, work: 'same', chapter: n, sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
    }
    const same = await rank(h2, [1, 2, 3].map((n) => cand(`x${n}`, 93)).concat([cand('y', 80)]));
    expect(order(same)[2]).toBe('y');
  });

  it('a result by the same author as the one before keeps 90 % of its score', async () => {
    const h = await make();
    const same = await rank(h, [cand('a', 93, { author: 'X' }), cand('b', 93, { author: 'X', alreadyRead: true })]);
    const diff = await rank(h, [cand('a', 93, { author: 'X' }), cand('b', 93, { author: 'Y', alreadyRead: true })]);
    expect(scoreOf(same, 'a')).toBe(scoreOf(diff, 'a'));
    expect(scoreOf(same, 'b')).toBeCloseTo(scoreOf(diff, 'b') * 0.9, 3);
  });
});

describe('properties of a ranking', () => {
  it('deterministic, ties broken by text id, limit honoured, empty list ok, nothing written', async () => {
    const h = await make();
    const cs = [cand('b', 93), cand('a', 93), cand('c', 93)];
    expect(order(await rank(h, cs))).toEqual(['a', 'b', 'c']);
    expect(JSON.stringify(await rank(h, cs))).toBe(JSON.stringify(await rank(h, [...cs].reverse())));
    expect(await rank(h, cs, { limit: 2 })).toHaveLength(2);
    expect(await rank(h, [])).toEqual([]);
    const events = (await h.store.events.all()).length;
    await rank(h, cs);
    expect((await h.store.events.all()).length).toBe(events);
  });

  it('ranks candidates that are not in the store (profiles only)', async () => {
    const h = await make();
    expect(await h.store.texts.get('text:es:ghost')).toBeUndefined();
    const r = await rank(h, [cand('ghost', 93)]);
    expect(r[0].textId).toBe('text:es:ghost');
  });
});
