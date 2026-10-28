import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { evaluateChronologicalPrefixes, type PrefixPolicyContext } from '../../../packages/goreview/src/transfer/policy-evaluation';
import { makePlan } from '../session/helpers';

function review(id:string,at:string,family='written-recognition'):GoEvent{return {
  id,at,v:3,learnerId:'L',enrolmentId:'E',languageId:'sq',producer:{app:'gopractice-review',version:'test',deviceId:'D'},
  kind:'CardReviewed',subject:{cardId:`card-${id}`,itemIds:[`unit-${id}`]},payload:{rating:1,grade:'again',correct:false,outcome:'incorrect',family,reviewSeconds:60,hinted:false},evidence:{quality:'moderate',sourceReliability:1},
};}

const context=(queueIds:string[]=[]):PrefixPolicyContext=>{
  const template=makePlan({due:1}).items[0]!;
  const queueCandidates=queueIds.map((id,index)=>({planned:{...structuredClone(template),item:{...structuredClone(template.item),itemId:id}},tier:index<5?1:2,score:1,due:index}));
  return {learnerId:'L',languageId:'sq',configuredMaximum:12,admission:{hardNewLimit:10,sessionMinutes:20,dueSeconds:600,upcomingLearningSeconds:300,averageNewSeconds:30},queueCandidates};
};

describe('chronological-prefix planner comparisons',()=>{
  it('uses only prefix history for choices and reports later observations separately',()=>{
    const firstAt='2026-10-20T00:00:00Z',cut='2026-10-22T00:00:00Z',next='2026-10-24T00:00:00Z';
    const rows=Array.from({length:12},(_,i)=>review(`r${i}`,new Date(Date.parse(firstAt)+i*3600_000).toISOString(),i%2?'audio-to-meaning':'written-recognition'));
    rows.push(review('future','2026-10-23T00:00:00Z'));
    const snapshots=[{at:cut,context:context(['d1','d2','d3','d4','d5','r1'])},{at:next,context:context(['d1','d2','d3','d4','d5','r1'])}];
    const [a,b]=evaluateChronologicalPrefixes(rows,snapshots);
    expect(a.evidenceEventsAvailable).toBe(12);
    expect(a.adaptiveTarget).toBeLessThan(a.fixedTarget);
    expect(a.fixedAdmission).toBe(10);expect(a.workloadAwareAdmission).toBeLessThan(10);
    expect(a.strictQueueOrder).not.toEqual(a.boundedQueueOrder);
    expect(a.observedWindow).toMatchObject({start:cut,end:next,reviews:1});
    expect(b.evidenceEventsAvailable).toBe(13);
    const extraFuture=review('later-choice','2026-10-23T12:00:00Z','audio-transcription');
    extraFuture.payload={...extraFuture.payload,rating:4,correct:true,grade:'easy',outcome:'correct',reviewSeconds:1};
    const changedFuture=evaluateChronologicalPrefixes([...rows,extraFuture],snapshots)[0]!;
    expect(changedFuture).toMatchObject({evidenceEventsAvailable:a.evidenceEventsAvailable,fixedTarget:a.fixedTarget,adaptiveTarget:a.adaptiveTarget,
      fixedAdmission:a.fixedAdmission,workloadAwareAdmission:a.workloadAwareAdmission,strictQueueOrder:a.strictQueueOrder,boundedQueueOrder:a.boundedQueueOrder});
  });

  it('excludes assisted, weak, conflicting and unresolved causal claims from prefix inputs',()=>{
    const base=review('same','2026-10-20T00:00:00Z');
    const conflict={...base,payload:{...base.payload,correct:true,rating:3}};
    const assisted=review('assisted','2026-10-20T01:00:00Z');assisted.evidence={quality:'moderate',assisted:true};
    const weak=review('weak','2026-10-20T02:00:00Z');weak.evidence={quality:'weak'};
    const unknown=review('unknown','2026-10-20T03:00:00Z');unknown.payload.expectedPreviousReviewId='missing';
    const valid=review('valid','2026-10-20T04:00:00Z');
    const fakeAudio=review('bad-audio','2026-10-20T05:00:00Z','audio-to-meaning');fakeAudio.kind='ListeningAssessed';
    fakeAudio.payload={...fakeAudio.payload,assessmentDimension:'auditory-recognition',voice:'synthetic',responseMode:'typed',answerShownBefore:false};fakeAudio.evidence={quality:'strong',sourceReliability:1};
    const out=evaluateChronologicalPrefixes([base,conflict,assisted,weak,unknown,valid,fakeAudio],[{at:'2026-10-21T00:00:00Z',context:context()}]);
    expect(out[0]?.evidenceEventsAvailable).toBe(1);
  });

  it('resolves corrections, duplicate conflicts and causal parents only from each chronological prefix',()=>{
    const cutoff='2026-10-22T00:00:00Z',later='2026-10-24T00:00:00Z';
    const base=review('base','2026-10-20T00:00:00Z');
    const withdrawal:GoEvent={...base,id:'withdraw',at:'2026-10-23T00:00:00Z',correctionOf:base.id,
      payload:{...base.payload,rating:null,challenged:true},evidence:{quality:'none'}};
    const conflict={...base,at:'2026-10-23T01:00:00Z',payload:{...base.payload,rating:4,grade:'easy'}};
    const unknown=review('unknown-parent','2026-10-21T00:00:00Z');unknown.payload.expectedPreviousReviewId='late-parent';
    const lateParent=review('late-parent','2026-10-23T02:00:00Z');lateParent.payload.expectedPreviousReviewId=null;
    const snapshots=[{at:cutoff,context:context()},{at:later,context:context()}];
    const corrected=evaluateChronologicalPrefixes([base,withdrawal],snapshots);
    expect(corrected[0]?.evidenceEventsAvailable).toBe(1);expect(corrected[1]?.evidenceEventsAvailable).toBe(0);
    const conflicted=evaluateChronologicalPrefixes([base,conflict],snapshots);
    expect(conflicted[0]?.evidenceEventsAvailable).toBe(1);expect(conflicted[1]?.evidenceEventsAvailable).toBe(0);
    const unresolved=evaluateChronologicalPrefixes([unknown,lateParent],snapshots);
    expect(unresolved[0]?.evidenceEventsAvailable).toBe(0);expect(unresolved[1]?.evidenceEventsAvailable).toBe(1);
  });
  it('rejects queue context carrying future card history while allowing future due dates',()=>{
    const future=review('future-row','2026-10-23T00:00:00Z');
    const ctx=context(['future']);
    ctx.queueCandidates[0]!.planned.item.history=[{at:future.at,rating:3,outcome:'correct',deviceId:'D',exerciseId:'x',family:'written-recognition',elapsedDays:1,eventId:future.id}];
    expect(()=>evaluateChronologicalPrefixes([],[{at:'2026-10-22T00:00:00Z',context:ctx}])).toThrow(/history after the policy cutoff/);
  });
});
