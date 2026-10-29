import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { foldEvents } from '../../../packages/repository-engine/src/projection';
import { createFsrsScheduler, foldDeck, itemIdFor } from '../../../packages/goreview/src/scheduler';
import { schedulerForReviewProfile } from '../../../packages/goreview/src/scheduler/replay-profile';
import { classifyReviewConvergence } from '../../../packages/goreview/src/scheduler/review-convergence';
import { added, at, DAY, reviewed, shuffled, T0 } from './helpers';
const ID = itemIdFor('lex:logos', 'written-recognition'), NOW = at(60 * DAY);
const cas = (e: GoEvent, id: string, parent: string | null, profile: unknown): GoEvent => ({
  ...e,id,subject:{...e.subject,itemIds:['lex:logos']},payload:{...e.payload,expectedPreviousReviewId:parent,schedulerProfile:profile},
});
describe('recorded-profile replay and causal convergence', () => {
  it('reconstructs exact settings and rejects null, unsupported and mismatched profiles', () => {
    const fallback=createFsrsScheduler(), authored=createFsrsScheduler({desiredRetention:.97,maximumInterval:25,enableShortTerm:false,learningSteps:['2m'],relearningSteps:['3m']});
    const resolved=schedulerForReviewProfile(authored.profile,fallback);
    expect('scheduler' in resolved && resolved.scheduler.profile).toEqual(authored.profile);
    expect(schedulerForReviewProfile(undefined,fallback)).toEqual({scheduler:fallback});
    for(const p of [null,{...fallback.profile,algorithm:'fsrs@unknown'},{...fallback.profile,parametersVersion:'wrong'},{...fallback.profile,parameters:[1,2]}])
      expect(schedulerForReviewProfile(p,fallback)).toHaveProperty('error');
  });
  it('replays mixed historical profiles stepwise and preserves legacy defaults', () => {
    const loose=createFsrsScheduler(),strict=createFsrsScheduler({parameters:loose.profile!.parameters!.map((n,i)=>i===0?n*1.2:n),desiredRetention:.97,maximumInterval:40,enableShortTerm:false});
    const first=cas(reviewed(ID,at(DAY),3),'first',null,strict.profile),second=cas(reviewed(ID,at(3*DAY),2),'second','first',loose.profile);
    const expected=loose.review(strict.review(strict.newState(T0),3,first.at),2,second.at);
    expect(foldDeck([added('lex:logos',T0),first,second],createFsrsScheduler({desiredRetention:.75}),{now:NOW}).items[0].schedule).toEqual(expected);
    const legacy=reviewed(ID,at(DAY),3);
    expect(foldDeck([added('lex:logos',T0),legacy],loose,{now:NOW}).items[0].schedule).toEqual(loose.review(loose.newState(T0),3,legacy.at));
  });
  it('keeps Repository evidence and FSRS aligned for legacy-head CAS roots', () => {
    const s = createFsrsScheduler();
    const legacy = { ...reviewed(ID, at(DAY), 3, { deviceId: 'old-device' }), subject: { cardId: ID, itemIds: ['lex:logos'] } };
    const legacyB = { ...reviewed(ID, at(DAY + 500), 3, { deviceId: 'old-device' }), subject: { cardId: ID, itemIds: ['lex:logos'] } };
    const remote = { ...cas(reviewed(ID, at(DAY + 1000), 3, { deviceId: 'new-device' }), 'remote-root', null, s.profile), subject: { cardId: ID, itemIds: ['lex:logos'] } };
    const deck = foldDeck([added('lex:logos', T0), legacy, legacyB, remote], s, { now: NOW }).items[0]!;
    const knowledge = foldEvents([legacy, legacyB, remote], { modelVersion: 'test' })[0]!;
    expect(deck.schedule.reps).toBe(2);
    expect(deck.history.find(h => h.eventId === remote.id)?.scheduleExcluded).toMatch(/stale predecessor/);
    expect(knowledge.dimensions.readingRecognition.observations).toBe(3); // plausible cross-device attempt, bounded by 24h

    const localRoot = { ...remote, id: 'same-device-root', producer: { ...remote.producer, deviceId: 'old-device' } };
    const sameDevice = foldEvents([legacy, legacyB, localRoot], { modelVersion: 'test' })[0]!;
    expect(sameDevice.dimensions.readingRecognition.observations).toBe(2);

    const staleChild = { ...cas(reviewed(ID, at(DAY + 2000), 3, { deviceId: 'old-device' }), 'stale-child', legacy.id, s.profile), subject: { cardId: ID, itemIds: ['lex:logos'] } };
    const historyChild = { ...foldDeck([added('lex:logos', T0), legacy, legacyB, staleChild], s, { now: NOW }).items[0]! };
    expect(historyChild.schedule.reps).toBe(2);
    expect(foldEvents([legacy, legacyB, staleChild], { modelVersion: 'test' })[0]!.dimensions.readingRecognition.observations).toBe(2);
  });
  it('retains unsupported profile reviews, blocks contribution and suspends the affected card', () => {
    const s=createFsrsScheduler(),bad=cas(reviewed(ID,at(DAY),3),'bad',null,{...s.profile,algorithm:'fsrs@future'});
    const child=cas(reviewed(ID,at(2*DAY),3),'child','bad',s.profile);
    const item=foldDeck([added('lex:logos',T0),bad,child],s,{now:NOW}).items[0];
    expect(item.history).toHaveLength(2);expect(item.history.every(h=>h.scheduleExcluded)).toBe(true);expect(item.schedule.reps).toBe(0);expect(item.status).toBe('suspended');
  });
  it('chooses equal-clock siblings by ID and converges under permutations and duplicate deliveries', () => {
    const s=createFsrsScheduler(),winner=cas(reviewed(ID,at(DAY),2),'a',null,s.profile),loser=cas(reviewed(ID,at(DAY),4),'z',null,s.profile);
    const child=cas(reviewed(ID,at(2*DAY),3),'child','a',s.profile),events=[added('lex:logos',T0),loser,winner,child,winner];
    const expected=foldDeck(events,s,{now:NOW});
    expect(expected.items[0].schedule.reps).toBe(2);
    expect(expected.items[0].history.find(h=>h.eventId==='z')?.scheduleExcluded).toMatch(/canonical event is a/);
    for(let seed=1;seed<=12;seed++)expect(foldDeck(shuffled(events,seed),s,{now:NOW})).toEqual(expected);
  });
  it('retains but excludes causal clock inversion and unknown predecessors', () => {
    const s=createFsrsScheduler(),parent=cas(reviewed(ID,at(DAY),3),'parent',null,s.profile),child=cas(reviewed(ID,at(DAY-1),4),'child','parent',s.profile);
    const unknown=cas(reviewed(ID,at(2*DAY),3),'unknown','missing',s.profile);
    const item=foldDeck([added('lex:logos',T0),parent,child,unknown],s,{now:NOW}).items[0];
    expect(item.schedule.reps).toBe(1);expect(item.history).toHaveLength(3);
    expect(item.history.find(h=>h.eventId==='child')?.scheduleExcluded).toMatch(/timestamp precedes predecessor/);
    expect(item.history.find(h=>h.eventId==='unknown')?.scheduleExcluded).toMatch(/unresolved|unknown/);
  });
  it('rebases a remote descendant after a valid correction without losing raw history', () => {
    const s=createFsrsScheduler(),old=cas(reviewed(ID,at(DAY),3),'old',null,s.profile);
    const correction:GoEvent={...old,id:'undo',at:at(DAY+1000),correctionOf:'old',payload:{...old.payload,rating:null,challenged:true},evidence:{quality:'none'}};
    const child=cas(reviewed(ID,at(2*DAY),4),'remote','old',s.profile),events=[added('lex:logos',T0),old,child,correction];
    const folded=foldDeck(events,s,{now:NOW});
    expect(folded.items[0].schedule.reps).toBe(1);expect(folded.items[0].history.find(h=>h.eventId==='old')?.retracted).toBe(true);
    expect(folded.items[0].history.find(h=>h.eventId==='remote')?.scheduleExcluded).toBeUndefined();expect(events).toHaveLength(4);
  });
  it('recovers only a canonical orphan review with matching unit, family and dimension', () => {
    const unitId='lemma:grc:logos:NOUN',id=itemIdFor(unitId,'written-recognition');
    const orphan=reviewed(id,at(DAY),3,{extra:{assessmentDimension:'written-recognition',family:'written-recognition'}});
    orphan.subject={cardId:id,itemIds:[unitId]};
    const malformed=reviewed('ghost',at(2*DAY),3,{extra:{assessmentDimension:'written-recognition',family:'written-recognition'}});
    const result=foldDeck([orphan,malformed],createFsrsScheduler(),{now:NOW});
    expect(result.items).toHaveLength(1);expect(result.items[0].schedule.reps).toBe(1);
    expect(result.ignored.some(i=>i.eventId===orphan.id&&i.reason.includes('recovered'))).toBe(true);
    expect(result.ignored.some(i=>i.eventId===malformed.id&&i.reason.includes('not been added'))).toBe(true);
  });

  it('uses strict numeric ratings when selecting causal siblings', () => {
    const s=createFsrsScheduler();
    const malformed=cas(reviewed(ID,at(DAY),3),'a-string',null,s.profile);
    malformed.payload={...malformed.payload,rating:'3'};
    const valid=cas(reviewed(ID,at(DAY),3),'z-number',null,s.profile);
    const folded=foldDeck([added('lex:logos',T0),malformed,valid],s,{now:NOW});
    expect(folded.items[0].schedule.reps).toBe(1);
    expect(folded.unscored[ID]).toBe(1);
    expect(folded.items[0].history.map(h=>h.eventId)).toContain('z-number');
  });

  it('orders a same-clock causal parent before a child even when child ID sorts first', () => {
    const s=createFsrsScheduler(),t=at(DAY);
    const parent=cas(reviewed(ID,t,2),'z-parent',null,s.profile);
    const child=cas(reviewed(ID,t,4),'a-child','z-parent',s.profile);
    const events=[added('lex:logos',T0),child,parent];
    const expected=s.review(s.review(s.newState(T0),2,t),4,t);
    expect(foldDeck(events,s,{now:NOW}).items[0].schedule).toEqual(expected);
    expect(foldDeck([added('lex:logos',T0),parent,child],s,{now:NOW}).items[0].schedule).toEqual(expected);
  });

  it('rejects mixed learner folds and filters a local fold before resolving foreign predecessors', () => {
    const s=createFsrsScheduler();
    const parent={...cas(reviewed(ID,at(DAY),3),'foreign-parent',null,s.profile),learnerId:'L2',enrolmentId:'E2'};
    const child={...cas(reviewed(ID,at(2*DAY),3),'local-child','foreign-parent',s.profile),learnerId:'L1',enrolmentId:'E1'};
    const localAdd={...added('lex:logos',T0),learnerId:'L1'};
    const events=[localAdd,parent,child];
    expect(()=>foldDeck(events,s,{now:NOW})).toThrow(/learnerId/);
    const local=foldDeck(events,s,{now:NOW,learnerId:'L1'}).items[0];
    expect(local.schedule.reps).toBe(0);
    expect(local.history[0].scheduleExcluded).toMatch(/unresolved|unknown expectedPreviousReviewId/);
  });

  it('rejects same-card causal references that cross learner identity', () => {
    const s=createFsrsScheduler();
    const parent={...cas(reviewed(ID,at(DAY),3),'foreign-parent',null,s.profile),learnerId:'L2'};
    const child=cas(reviewed(ID,at(2*DAY),3),'local-child','foreign-parent',s.profile);
    const causal=classifyReviewConvergence([parent,child],new Set());
    expect(causal.excludedReasons.get(child.id)).toMatch(/different learner/);
    const result=foldDeck([added('lex:logos',T0),parent,child],s,{now:NOW,learnerId:'learner-1'});
    expect(result.items[0].history[0].scheduleExcluded).toMatch(/unresolved|unknown expectedPreviousReviewId/);
    expect(result.items[0].schedule.reps).toBe(0);
  });

  it('rejects same-card causal references that cross language and card identity', () => {
    const s=createFsrsScheduler();
    const spanish={...cas(reviewed(ID,at(DAY),3),'spanish-parent',null,s.profile),languageId:'es'};
    const greek=cas(reviewed(ID,at(2*DAY),3),'greek-child','spanish-parent',s.profile);
    expect(()=>foldDeck([added('lex:logos',T0),spanish,greek],s,{now:NOW})).toThrow(/languageId/);
    expect(foldDeck([added('lex:logos',T0),spanish,greek],s,{now:NOW,languageId:'grc'}).items[0].history[0].scheduleExcluded).toMatch(/unresolved|unknown/);

    const wrongCard={...cas(reviewed('card:written-recognition:other',at(DAY),3),'other-card-parent',null,s.profile),subject:{cardId:'card:written-recognition:other'}};
    const child=cas(reviewed(ID,at(2*DAY),3),'wrong-card-child','other-card-parent',s.profile);
    const folded=foldDeck([added('lex:logos',T0),wrongCard,child],s,{now:NOW,languageId:'grc'});
    expect(folded.items[0].schedule.reps).toBe(0);
    expect(folded.items[0].history[0].scheduleExcluded).toMatch(/unresolved|unknown/);
  });

  it('keeps legitimate same-learner language history linked across enrolments', () => {
    const s=createFsrsScheduler();
    const parent={...cas(reviewed(ID,at(DAY),3),'prior-enrolment',null,s.profile),enrolmentId:'E-old'};
    const child={...cas(reviewed(ID,at(2*DAY),3),'current-enrolment','prior-enrolment',s.profile),enrolmentId:'E-new'};
    const causal=classifyReviewConvergence([parent,child],new Set());
    expect(causal.effectiveIds).toEqual(new Set([parent.id,child.id]));
    expect(causal.excludedReasons.size).toBe(0);
  });

  it('excludes conflicting duplicate event IDs and their descendants from scheduling', () => {
    const s=createFsrsScheduler();
    const first=cas(reviewed(ID,at(DAY),1),'conflict-id',null,s.profile);
    const second={...first,payload:{...first.payload,rating:4}};
    const child=cas(reviewed(ID,at(2*DAY),3),'conflict-child','conflict-id',s.profile);
    const folded=foldDeck([added('lex:logos',T0),first,second,child],s,{now:NOW});
    expect(folded.items[0].schedule.reps).toBe(0);
    expect(folded.ignored.some(x=>x.eventId==='conflict-id'&&/conflicting duplicate/i.test(x.reason))).toBe(true);
    expect(folded.items[0].history.find(h=>h.eventId==='conflict-id')?.scheduleExcluded).toMatch(/conflicting duplicate/i);
    expect(folded.items[0].history.find(h=>h.eventId==='conflict-child')?.scheduleExcluded).toMatch(/unresolved|predecessor/i);
  });

  it('excludes descendants of a noncanonical sibling branch, not only the sibling', () => {
    const s=createFsrsScheduler(),winner=cas(reviewed(ID,at(DAY),3),'branch-a',null,s.profile);
    const loser=cas(reviewed(ID,at(DAY),4),'branch-z',null,s.profile);
    const child=cas(reviewed(ID,at(2*DAY),3),'branch-z-child','branch-z',s.profile);
    const item=foldDeck([added('lex:logos',T0),winner,loser,child],s,{now:NOW}).items[0];
    expect(item.schedule.reps).toBe(1);
    expect(item.history.find(h=>h.eventId==='branch-z')?.scheduleExcluded).toMatch(/canonical event is branch-a/);
    expect(item.history.find(h=>h.eventId==='branch-z-child')?.scheduleExcluded).toMatch(/predecessor excluded/i);
  });

  it('does not reactivate a suspended item for a duplicate create lifecycle event', () => {
    const s=createFsrsScheduler(),creation=added('lex:logos',T0);
    const suspended={...creation,id:'suspend',kind:'CardRemoved' as const,at:at(DAY),payload:{reason:'suspended'}};
    const duplicate={...creation,id:'duplicate-create',at:at(2*DAY),payload:{...creation.payload,lifecycle:'create'}};
    const item=foldDeck([creation,suspended,duplicate],s,{now:NOW}).items[0];
    expect(item.status).toBe('suspended');
    expect(item.schedule.reps).toBe(0);
  });
});

describe('mixed legacy and causal stale heads',()=>{
 it('retains stale CAS roots and predecessors after legacy activity without sequential scheduling credit',()=>{
  const scheduler=createFsrsScheduler(),legacy=reviewed(ID,at(DAY),3),root=cas(reviewed(ID,at(2*DAY),4),'stale-root',null,scheduler.profile);
  const legitimate=cas(reviewed(ID,at(3*DAY),3),'current',legacy.id,scheduler.profile);
  const events=[added('lex:logos',T0),legacy,root,legitimate];
  const fold=foldDeck(events,scheduler,{now:NOW});expect(fold.items[0].schedule.reps).toBe(2);
  expect(fold.items[0].history.find(h=>h.eventId==='stale-root')?.scheduleExcluded).toMatch(/stale.*predecessor/);
  expect(foldDeck(shuffled(events,8),scheduler,{now:NOW})).toEqual(fold);
 });
});

it('deduplicates identical semantic events even when replicas attach different delivery metadata',()=>{
 const scheduler=createFsrsScheduler(),review=cas(reviewed(ID,at(DAY),3),'same-event',null,scheduler.profile);
 const decorated={...review,seq:44,recordedAt:at(2*DAY)};
 const expected=foldDeck([added('lex:logos',T0),review],scheduler,{now:NOW});
 expect(foldDeck([added('lex:logos',T0),decorated,review],scheduler,{now:NOW})).toEqual(expected);
});

it('cannot resume an unreplayable profile, but a valid correction removes that scheduling obstacle',()=>{
 const scheduler=createFsrsScheduler(),addition=added('lex:logos',T0),bad=cas(reviewed(ID,at(DAY),3),'unsupported-grade',null,{...scheduler.profile,algorithm:'future'});
 const resume={...addition,id:'resume',at:at(2*DAY)};
 const blocked=foldDeck([addition,bad,resume],scheduler,{now:NOW}).items[0];
 expect(blocked.status).toBe('suspended');expect(blocked.schedulingIssue).toMatch(/unsupported/);
 const correction={...bad,id:'undo-unsupported',at:at(3*DAY),correctionOf:bad.id,payload:{...bad.payload,rating:null,challenged:true},evidence:{quality:'none' as const}};
 const restored=foldDeck([addition,bad,resume,correction],scheduler,{now:NOW}).items[0];
 expect(restored.schedulingIssue).toBeUndefined();expect(restored.status).toBe('active');expect(restored.schedule.reps).toBe(0);
});

it('keeps invalidated questions withheld across ordinary resume and expired snooze controls',()=>{
 const scheduler=createFsrsScheduler(),addition=added('lex:logos',T0);
 const invalidation={...addition,id:'invalid-key',kind:'ReviewItemInvalidated' as const,at:at(DAY),payload:{reason:'analysis-invalidated',cardId:ID}};
 const resume={...addition,id:'ordinary-resume',at:at(2*DAY)};
 const expiredSnooze={...addition,id:'snooze',kind:'CardRemoved' as const,at:at(3*DAY),payload:{reason:'snoozed',until:at(4*DAY)}};
 const item=foldDeck([addition,invalidation,resume,expiredSnooze],scheduler,{now:NOW}).items[0];
 expect(item.status).toBe('suspended');expect(item.invalidatedAt).toBe(invalidation.at);
});
