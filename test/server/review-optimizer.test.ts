import { buildCardAdded, createFsrsScheduler } from '../../packages/goreview/src/scheduler';
import type { GoEvent } from '../../packages/repository-contract/src';
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FSRSBinding, FSRSBindingItem, FSRSBindingReview } from '@open-spaced-repetition/binding';
import { default_w } from 'ts-fsrs';
import { optimizeReviewProfile, prepareOptimization, reliableReviewHistory, type ReliableReview } from '../../server/review/optimizer';

const sample = (overrides: Partial<ReliableReview> = {}): ReliableReview => ({ eventId: 'r1', targetId: 'word', languageId: 'hi', objective: 'written-recognition', at: '2026-01-01T10:00:00Z', rating: 3, independent: true, ...overrides });

describe('official FSRS personalization boundary', () => {
  it('excludes assistance, corrected grades, duplicate ids, other languages and other objectives', () => {
    const p = prepareOptimization([sample(), sample(), sample({ eventId: 'hint', independent: false }), sample({ eventId: 'undo', corrected: true }),
      sample({ eventId: 'es', languageId: 'es' }), sample({ eventId: 'production', objective: 'productive-recall' }), sample({ eventId: 'clock', at: 'invalid' })], 'hi', 'written-recognition');
    expect(p.rows.map((r) => r.eventId)).toEqual(['r1']);
    expect(p.delayed).toBe(0);
  });

  it('does not fit or activate a profile from a burst of same-day successful clicks', async () => {
    const history = Array.from({ length: 1000 }, (_, i) => sample({ eventId: `r${i}`, at: new Date(Date.UTC(2026, 0, 1, 10, 0, i)).toISOString() }));
    expect(await optimizeReviewProfile(history, { languageId: 'hi', objective: 'written-recognition' })).toMatchObject({ status: 'insufficient-history', reviews: 0, automaticallyActivated: false });
  });

  it('loads the installed official WASI implementation and evaluates genuine delayed histories', () => {
    const item = new FSRSBindingItem([new FSRSBindingReview(3, 0), new FSRSBindingReview(1, 10), new FSRSBindingReview(3, 5)]);
    const evaluation = new FSRSBinding([...default_w]).evaluate([item]);
    expect(Number.isFinite(evaluation.logLoss)).toBe(true);
    expect(Number.isFinite(evaluation.rmseBins)).toBe(true);
  });

  it('fits with the official optimizer and evaluates a chronological holdout without activating it', async () => {
    const history = Array.from({ length: 80 }, (_, target) => Array.from({ length: 8 }, (_, review) => sample({
      eventId: `${target}:${review}`, targetId: `target:${target}`,
      at: new Date(Date.UTC(2026, 0, 1 + review * 20)).toISOString(),
      rating: (target + review) % 5 === 0 ? 1 : 3,
    }))).flat();
    const result = await optimizeReviewProfile(history, { languageId: 'hi', objective: 'written-recognition' });
    expect(['candidate', 'not-improved']).toContain(result.status);
    expect(result.automaticallyActivated).toBe(false);
    expect(Number.isFinite(result.baseline?.logLoss)).toBe(true);
    expect(Number.isFinite(result.candidate?.logLoss)).toBe(true);
  }, 45_000);
});

it('does not train on raw offline sibling branches or unsupported profile reviews',()=>{
 const scheduler=createFsrsScheduler(),addition=buildCardAdded({learnerId:'L',enrolmentId:'E',languageId:'hi',deviceId:'D',at:'2026-01-01T10:00:00Z',unitId:'lemma:hi:test:NOUN',unitKind:'lexeme',family:'written-recognition',dimension:'written-recognition',addedBy:'intake'});
 const review=(id:string,at:string,parent:string|null):GoEvent=>({...addition,id,at,kind:'CardReviewed',payload:{cardKind:'recognition',grade:'good',correct:true,hinted:false,rating:3,family:'written-recognition',expectedPreviousReviewId:parent,schedulerProfile:scheduler.profile},evidence:{quality:'moderate',assisted:false}});
 const first=review('a','2026-01-01T10:01:00Z',null),sibling=review('b','2026-01-02T10:01:00Z',null),child=review('child','2026-01-03T10:01:00Z','a');
 const bad=review('future','2026-01-04T10:01:00Z','child');bad.payload.schedulerProfile={...scheduler.profile,algorithm:'future'};
 const rows=reliableReviewHistory([sibling,child,bad,addition,first],'hi');
 expect(rows.map(r=>r.eventId)).toEqual(['a','child']);
 expect(prepareOptimization(rows,'hi','written-recognition').rows.map(r=>r.eventId)).toEqual(['a','child']);
});
