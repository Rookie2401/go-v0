import { describe, expect, it } from 'vitest';
import { chooseMicrodeckTarget } from '../../../packages/goreview/src/planner/microdeck';
import { microdeckObservations } from '../../../packages/goreview/src/planner/planner';
import type { ExerciseFamily } from '../../../packages/goreview/src/types';
import type { GoEvent } from '../../../packages/repository-contract/src';

describe('adaptive micro-deck target', () => {
  it('defaults near ten and never exceeds a caller-supplied maximum, including small limits', () => {
    expect(chooseMicrodeckTarget().targetQuestions).toBe(10);
    expect(chooseMicrodeckTarget({ configuredMaximum: 60 }).targetQuestions).toBe(10);
    expect(chooseMicrodeckTarget({ configuredMaximum: 5 }).targetQuestions).toBe(5);
    expect(chooseMicrodeckTarget({ configuredMaximum: 2 }).targetQuestions).toBe(2);
    expect(chooseMicrodeckTarget({ configuredMaximum: 0 }).targetQuestions).toBe(0);
  });

  it('does not inflate a batch from easy recognition accuracy alone', () => {
    const observations = Array.from({ length: 20 }, () => ({ family:'written-recognition' as ExerciseFamily,
      observedSeconds:5, expectedSeconds:25, correct:true }));
    expect(chooseMicrodeckTarget({ observations }).targetQuestions).toBe(10);
  });

  it('does not shrink solely because current material has high cognitive cost', () => {
    const observations = Array.from({ length: 8 }, (_, i) => ({ family:(i % 2 ? 'meaning-to-form' : 'written-recognition') as ExerciseFamily,
      observedSeconds:25, expectedSeconds:25, correct:true }));
    expect(chooseMicrodeckTarget({ observations, cognitiveCost:0.9 }).targetQuestions).toBe(10);
  });

  it('modestly shrinks after slow cross-modality work with weak independent outcomes and repeated failures', () => {
    const observations = Array.from({ length: 8 }, (_, i) => ({ family:(i % 2 ? 'meaning-to-form' : 'written-recognition') as ExerciseFamily,
      observedSeconds:50, expectedSeconds:25, correct:i < 2, repeatedFailure:i >= 3 }));
    expect(chooseMicrodeckTarget({ observations, cognitiveCost:0.9 }).targetQuestions).toBe(8);
  });

  it('modestly grows only after sustained fast responses across multiple modalities', () => {
    const observations = Array.from({ length: 12 }, (_, i) => ({ family:(i % 2 ? 'meaning-to-form' : 'written-recognition') as ExerciseFamily,
      observedSeconds:10, expectedSeconds:25, correct:true }));
    expect(chooseMicrodeckTarget({ observations, configuredMaximum:20 }).targetQuestions).toBe(12);
    expect(chooseMicrodeckTarget({ observations, configuredMaximum:11 }).targetQuestions).toBe(11);
    // the configured maximum is the ceiling: above 20 the batch may still grow, and a policy target above 20 is honoured up to it (2026-10-29)
    expect(chooseMicrodeckTarget({ observations, configuredMaximum:30 }).targetQuestions).toBe(12);
    expect(chooseMicrodeckTarget({ observations, configuredMaximum:30, policy:{ adaptive:false, defaultTarget:25 } }).targetQuestions).toBe(25);
    expect(chooseMicrodeckTarget({ observations, configuredMaximum:30, policy:{ adaptive:false, defaultTarget:70 } }).targetQuestions).toBe(30);
    expect(chooseMicrodeckTarget({ observations, configuredMaximum:20, policy:{ adaptive:false, defaultTarget:9 } }).targetQuestions).toBe(9);
  });

  it('uses shared causal validity and keeps a descendant after its corrected predecessor is retracted', () => {
    const review = (id:string, at:string, expectedPreviousReviewId:string|null):GoEvent=>({
      id,v:2,learnerId:'L1',enrolmentId:'E1',languageId:'sq',at,kind:'CardReviewed',
      producer:{app:'gopractice-review',version:'1',deviceId:'device-1'},subject:{cardId:'card-a',itemIds:['lemma:a']},
      payload:{unitId:'lemma:a',family:'written-recognition',rating:3,correct:true,retrievalAttempted:true,reviewSeconds:20,expectedPreviousReviewId},
      evidence:{quality:'strong',sourceReliability:0.9},
    });
    const parent = review('parent','2026-10-08T09:00:00Z',null);
    const correction:GoEvent={...parent,id:'correction',at:'2026-10-08T09:01:00Z',correctionOf:'parent',
      payload:{...parent.payload,rating:null,challenged:true},evidence:{quality:'none'}};
    const child = review('child','2026-10-08T09:02:00Z','parent');
    const rows = microdeckObservations([parent,correction,child],'sq','2026-10-08T09:03:00Z');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({correct:true,observedSeconds:20});
  });
});
