import { describe, expect, it } from 'vitest';
import { learningMetrics } from '../../packages/goreview/src/transfer/learning-metrics';
import type { GoEvent } from '../../packages/repository-contract/src';
const scope = { learnerId: 'L', languageId: 'sq', now: '2026-10-27T12:00:00Z' };
const event = (id: string, at: string, rating: number, over: Record<string, unknown> = {}): GoEvent => ({
  id, at, v: 3, learnerId: 'L', enrolmentId: 'E', languageId: 'sq', producer: { app:'gopractice-review',version:'test',deviceId:'D' },
  kind:'CardReviewed',subject:{cardId:'C',itemIds:['U']},payload:{cardKind:'recognition',grade:'good',correct:rating>1,hinted:false,rating,family:'written-recognition',...over},evidence:{quality:'moderate'}
});
describe('local learning measurements', () => {
  it('counts delayed recall separately from immediate repeats and reports timing coverage', () => {
    const a=event('1','2026-10-20T10:00:00Z',3), b=event('2','2026-10-20T10:01:00Z',3), c=event('3','2026-10-22T10:01:00Z',3,{reviewSeconds:12,retrievabilityBefore:.9});
    const m=learningMetrics([c,b,a,b],[],scope);
    expect(m.independentReviews).toBe(3); expect(m.delayedAttempts).toBe(1);expect(m.delayedRetainedTargets).toBe(1);
    expect(m.predictionBrier).toBeCloseTo(.01);expect(m.secondsPerDelayedRetainedTarget).toBe(12);expect(m.timedReviews).toBe(1);
    expect(m.timedReviewCoverage).toBeCloseTo(1/3); expect(m.delayedRecallCoverage).toBeCloseTo(1/3);
  });
  it('excludes assisted, unscored, future and other-learner events', () => {
    const a=event('1','2026-10-20T10:00:00Z',3);a.evidence={quality:'none',assisted:true};
    const b=event('2','2026-10-20T10:01:00Z',3);b.learnerId='other';
    const c=event('3','2027-10-20T10:01:00Z',3);
    expect(learningMetrics([a,b,c],[],scope).independentReviews).toBe(0);
  });
  it('does not invent calibration or retained-item measurements without delayed evidence', () => {
    const m=learningMetrics([event('1','2026-10-20T10:00:00Z',3)],[],scope);
    expect(m.predictionBrier).toBeNull();expect(m.secondsPerDelayedRetainedTarget).toBeNull();
    expect(m.timedReviewCoverage).toBe(0);expect(m.delayedRecallCoverage).toBe(0);
  });
  it('does not count transcript-assisted or scheduler-excluded partial answers as retained recall', () => {
    const a=event('a','2026-10-20T10:00:00Z',3);
    const transcript=event('t','2026-10-22T10:00:00Z',3,{transcriptShownBefore:true,answerShownBefore:true});
    const partial=event('p','2026-10-23T10:00:00Z',2,{outcome:'partial',correct:false,retrievabilityBefore:.9});
    const excluded=event('x','2026-10-24T10:00:00Z',3,{retrievabilityBefore:.9});
    const conflictedCopy={...excluded,payload:{...excluded.payload,rating:4,grade:'easy'}};
    const deck=[{ itemId:'card:written-recognition:U',unitId:'U',unitKind:'lexeme',languageId:'sq',dimension:'written-recognition',family:'written-recognition',addedAt:'2026-10-01T00:00:00Z',addedBy:'intake',reasons:[],schedule:{due:'2026-10-01T00:00:00Z',stability:1,difficulty:1,elapsedDays:1,scheduledDays:1,reps:1,lapses:0,phase:'review',algorithm:'fake',parametersVersion:'0',lastReview:'2026-10-20T10:00:00Z'},history:[{at:excluded.at,rating:3,outcome:'correct',deviceId:'D',exerciseId:'x',family:'written-recognition',elapsedDays:1,eventId:'x',scheduleExcluded:'conflicting sibling',conflict:true}],status:'active'}] as never;
    const m=learningMetrics([a,transcript,partial,excluded,conflictedCopy],deck,scope);
    expect(m.independentReviews).toBe(2);
    expect(m.delayedAttempts).toBe(1);expect(m.delayedCorrect).toBe(0);expect(m.delayedFailed).toBe(1);expect(m.delayedRetainedTargets).toBe(0);
  });
  it('keeps weak choice evidence out of delayed-recall and calibration claims', () => {
    const a=event('a','2026-10-20T10:00:00Z',3);
    const choice=event('choice','2026-10-22T10:00:00Z',3,{retrievabilityBefore:.9});
    choice.evidence={quality:'weak'};
    const m=learningMetrics([a,choice],[],scope);
    expect(m.independentReviews).toBe(2);expect(m.readingAttempts).toBe(2);
    expect(m.delayedAttempts).toBe(0);expect(m.delayedCorrect).toBe(0);expect(m.predictionSamples).toBe(0);expect(m.predictionBrier).toBeNull();
  });
  it('keeps moderate-looking evidence below the effective source-reliability floor out of delayed success',()=>{
    const a=event('a','2026-10-20T10:00:00Z',3),b=event('b','2026-10-22T10:00:00Z',3);
    b.evidence={quality:'strong',sourceReliability:.79};
    const m=learningMetrics([a,b],[],scope);
    expect(m.independentReviews).toBe(2);expect(m.delayedAttempts).toBe(0);expect(m.delayedCorrect).toBe(0);
  });
  it('separates successful difficult retrieval from failed partial response and weak self-Hard',()=>{
    const first=event('a','2026-10-20T10:00:00Z',3);
    const difficult=event('b','2026-10-22T10:00:00Z',2,{outcome:'partial',correct:true,retrievabilityBefore:.5});
    const failedPartial=event('c','2026-10-24T10:00:00Z',1,{outcome:'partial',retrievalSucceeded:false,correct:false,retrievabilityBefore:.4});
    const weakSelf=event('d','2026-10-26T10:00:00Z',2,{outcome:'partial',correct:true,responseMode:'self-graded',retrievalSucceeded:true});
    weakSelf.evidence={quality:'weak'};
    const m=learningMetrics([first,difficult,failedPartial,weakSelf],[],scope);
    expect(m.delayedAttempts).toBe(2);
    expect(m.delayedSuccessfulDifficult).toBe(1);
    expect(m.delayedFullyCorrect).toBe(0);
    expect(m.delayedCorrect).toBe(1);
    expect(m.delayedFailed).toBe(1);
    expect(m.predictionSamples).toBe(2);
  });
  it('uses the shared causal selector to reject same-device stale sibling evidence',()=>{
    const root=event('root','2026-10-20T10:00:00Z',3);
    root.payload.expectedPreviousReviewId=null;
    const winner=event('winner','2026-10-21T10:00:00Z',3);winner.payload.expectedPreviousReviewId='root';
    const stale=event('stale','2026-10-21T10:01:00Z',3);stale.payload.expectedPreviousReviewId='root';
    const result=learningMetrics([root,winner,stale],[],scope);
    expect(result.independentReviews).toBe(2);
  });
  it('keeps qualified sibling activity consistent whether or not a schedule projection is supplied',()=>{
    const root=event('root','2026-10-20T10:00:00Z',3,{scheduledDueBefore:'2026-10-20T10:00:00Z'});root.payload.expectedPreviousReviewId=null;
    const sibling=event('sibling','2026-10-21T10:00:00Z',3,{scheduledDueBefore:'2026-10-20T10:00:00Z',retrievabilityBefore:.8});sibling.payload.expectedPreviousReviewId=null;sibling.producer.deviceId='D2';
    const later=event('later','2026-10-22T10:00:00Z',3,{scheduledDueBefore:'2026-10-21T10:00:00Z',retrievabilityBefore:.8});later.payload.expectedPreviousReviewId=root.id;
    const noDeck=learningMetrics([root,sibling],[],scope);
    const deck=[{itemId:'C',unitId:'U',unitKind:'lexeme',languageId:'sq',dimension:'written-recognition',family:'written-recognition',addedAt:'2026-10-01T00:00:00Z',addedBy:'intake',reasons:[],schedule:{due:'2026-10-01T00:00:00Z',stability:1,difficulty:1,elapsedDays:1,scheduledDays:1,reps:1,lapses:0,phase:'review',algorithm:'fake',parametersVersion:'0'},history:[{at:root.at,rating:3,outcome:'correct',deviceId:'D1',exerciseId:'x',family:'written-recognition',elapsedDays:1,eventId:root.id},{at:sibling.at,rating:3,outcome:'correct',deviceId:'D2',exerciseId:'x',family:'written-recognition',elapsedDays:1,eventId:sibling.id,scheduleExcluded:'concurrent sibling',conflict:true}],status:'active'}] as never;
    const withDeck=learningMetrics([root,sibling,later],deck,scope),withoutDeck=learningMetrics([root,sibling,later],[],scope);
    expect(noDeck.independentReviews).toBe(2);expect(noDeck.independentConcurrentSiblingAttempts).toBe(1);
    expect(withDeck.independentReviews).toBe(3);expect(withDeck.independentReviews).toBe(withoutDeck.independentReviews);
    expect(withDeck.independentConcurrentSiblingAttempts).toBe(1);
    expect(withDeck.dueReviewsObserved).toBe(2);expect(withDeck.predictionSamples).toBe(1);expect(withDeck.predictionBrier).toBeCloseTo(.04);
  });
  it('reports overdue age, admission follow-up and null denominators explicitly',()=>{
    const added:GoEvent={...event('add','2026-10-20T10:00:00Z',3),kind:'CardAdded',payload:{lifecycle:'create'}};
    const review=event('review','2026-10-21T10:00:00Z',3,{scheduledDueBefore:'2026-10-20T10:00:00Z',reviewSeconds:20});
    const deck=[{itemId:'C',unitId:'U',unitKind:'lexeme',languageId:'sq',dimension:'written-recognition',family:'written-recognition',addedAt:'2026-10-20T10:00:00Z',addedBy:'intake',reasons:[],schedule:{due:'2026-10-26T12:00:00Z',stability:1,difficulty:1,elapsedDays:1,scheduledDays:1,reps:1,lapses:0,phase:'review',algorithm:'fake',parametersVersion:'0',lastReview:'2026-10-21T10:00:00Z'},history:[{at:review.at,rating:3,outcome:'correct',deviceId:'D',exerciseId:'x',family:'written-recognition',elapsedDays:1,eventId:'review'}],status:'active'}] as never;
    const m=learningMetrics([added,review],deck,scope);
    expect(m.newAdmissions).toBe(1);expect(m.admittedCardsReviewed).toBe(1);expect(m.admissionFollowupCoverage).toBe(1);
    expect(m.medianOverdueDays).toBe(1);expect(m.maxOverdueDays).toBe(1);expect(m.completedDue).toBe(1);
    const empty=learningMetrics([],[],scope);expect(empty.admissionFollowupCoverage).toBeNull();expect(empty.medianOverdueDays).toBeNull();
  });
  it('counts delayed objective GoTell use as observed transfer, not as a review or saved-deck claim',()=>{
    const recognition=event('read','2026-10-20T10:00:00Z',3);
    const production:GoEvent={id:'tell',at:'2026-10-22T10:00:00Z',v:3,learnerId:'L',enrolmentId:'E',languageId:'sq',
      producer:{app:'gopractice-tell',version:'test',deviceId:'D'},kind:'ProductionRecorded',subject:{itemIds:['U']},
      payload:{authorship:'independent',usedCorrectly:true,assisted:false},evidence:{quality:'moderate',sourceReliability:1}};
    const synced={...production,recordedAt:'2026-10-23T00:00:00Z'};
    const copy={...production,payload:{...production.payload,usedCorrectly:false}};
    expect(learningMetrics([recognition,production,synced],[],scope).recognitionThenProduction).toBe(1);
    expect(learningMetrics([recognition,production,copy],[],scope).recognitionThenProduction).toBe(0);
    expect(learningMetrics([production],[],scope).productionAttempts).toBe(0);
  });
  it('computes an as-of metric without future correction leakage',()=>{
    const first=event('before','2026-10-20T10:00:00Z',3);
    const futureWithdrawal:GoEvent={...first,id:'future-withdrawal',at:'2026-10-28T00:00:00Z',correctionOf:first.id,
      payload:{...first.payload,rating:null,challenged:true},evidence:{quality:'none'}};
    const asOf={learnerId:'L',languageId:'sq',now:'2026-10-27T12:00:00Z'};
    expect(learningMetrics([first],[],asOf).independentReviews).toBe(1);
    expect(learningMetrics([first,futureWithdrawal],[],asOf).independentReviews).toBe(1);
    const laterDeck=[{itemId:'C',unitId:'U',unitKind:'lexeme',languageId:'sq',dimension:'written-recognition',family:'written-recognition',addedAt:'2026-10-01T00:00:00Z',addedBy:'intake',reasons:[],schedule:{due:'2026-10-28T00:00:00Z',stability:1,difficulty:1,elapsedDays:1,scheduledDays:1,reps:1,lapses:0,phase:'review',algorithm:'fake',parametersVersion:'0'},history:[{at:first.at,rating:3,outcome:'correct',deviceId:'D',exerciseId:'x',family:'written-recognition',elapsedDays:1,eventId:first.id,retracted:true}],status:'active'}] as never;
    expect(learningMetrics([first,futureWithdrawal],laterDeck,asOf).independentReviews).toBe(1);
  });
  it('does not count synthetic, unplayed or transcript-shown listening as objective recall or calibration',()=>{
    const seed=event('seed','2026-10-20T10:00:00Z',3);
    const listening=(id:string,at:string,extra:Record<string,unknown>):GoEvent=>({...event(id,at,3,{family:'audio-to-meaning',assessmentDimension:'auditory-recognition',responseMode:'typed',voice:'recorded',answerShownBefore:false,retrievabilityBefore:.7,...extra}),kind:'ListeningAssessed'});
    const synthetic=listening('synthetic','2026-10-22T10:00:00Z',{voice:'synthetic'});synthetic.evidence={quality:'strong',sourceReliability:1};
    const unplayed=listening('unplayed','2026-10-24T10:00:00Z',{audioPlayed:false});unplayed.evidence={quality:'strong',sourceReliability:1};
    const transcript=listening('transcript','2026-10-26T10:00:00Z',{answerShownBefore:true,transcriptShownBefore:true});transcript.evidence={quality:'strong',sourceReliability:1};
    const m=learningMetrics([seed,synthetic,unplayed,transcript],[],scope);
    expect(m.independentReviews).toBe(1);expect(m.listeningAttempts).toBe(0);
    expect(m.delayedAttempts).toBe(0);expect(m.delayedCorrect).toBe(0);expect(m.audioPredictionSamples).toBe(0);expect(m.audioPredictionBrier).toBeNull();
  });
});
