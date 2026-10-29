import {describe,expect,it} from 'vitest';
import type {GoEvent} from '../../../packages/repository-contract/src';
import {admissionBudget} from '../../../packages/goreview/src/planner/budget';
import {buildRemediationStudiedEvent,remediationBacklog} from '../../../packages/goreview/src/planner/remediation';
import {createReviewEligibilityContext,reviewEligibility} from '../../../packages/goreview/src/planner/eligibility';
import {planSession} from '../../../packages/goreview/src/planner/planner';
import {ratingFor} from '../../../packages/goreview/src/grading/grade';
import {deckItem,knowledge,NOW,prefs,fakeScheduler,testNow} from '../intake/fixtures';
const unit='form:sq:x', card='card:written-recognition:'+unit;
const ev=(id:string,at:string,rating:number|null,extra:Record<string,unknown>={}):GoEvent=>({id,at,v:2,learnerId:'L',enrolmentId:'E',languageId:'sq',
  producer:{app:'gopractice-review',version:'1',deviceId:'D'},kind:'CardReviewed',subject:{cardId:card,itemIds:[unit]},
  payload:{cardKind:'recognition',grade:'good',correct:Number(rating)>=3,hinted:false,rating,...extra},evidence:{quality:'moderate',assisted:false}});
const item=()=>deckItem({unitId:unit,itemId:card});
describe('shared eligibility, budgets and persistent remediation',()=>{
 it('indexes one planning snapshot and rebuilds after the event set changes',()=>{
  const before=createReviewEligibilityContext([item()],[],'2026-10-08T10:00:00Z');
  const failure=ev('snapshot-failure','2026-10-08T09:00:00Z',1,{family:'meaning-to-form',retrievalAttempted:true,answerShownBefore:false});
  const after=createReviewEligibilityContext([item()],[failure],'2026-10-08T10:00:00Z');
  expect(before).not.toBe(after);
  expect(before.automaticFailureUnits.has(unit)).toBe(false);
  expect(after.automaticFailureUnits.has(unit)).toBe(true);
  expect(after.reviewEventsByCard.get(card)).toHaveLength(1);
  expect(after.remediationByCard.has(card)).toBe(true);
 });
 it('counts first recorded introductions over all history, normalizes UTC, and separates explicit practice',()=>{
  const old=ev('old','2026-10-06T12:00:00Z',3),repeat=ev('repeat','2026-10-08T00:10:00Z',3);
  const fresh=ev('new','2026-10-07T23:10:00-02:00',3);fresh.subject={cardId:'new-card',itemIds:['new-unit']};
  const explicit=ev('explicit','2026-10-08T01:15:00Z',3,{practiceIntent:{kind:'explicit',reason:'selected-vocabulary',requestedAt:'2026-10-08T01:15:00Z'}});explicit.subject={cardId:'explicit-card',itemIds:['explicit-unit']};
  expect(admissionBudget([repeat,explicit,fresh,old,fresh],{learnerId:'L',languageId:'sq',now:NOW,maxNew:4,dailyNewLimit:2})).toEqual({used:1,remaining:1});
 });
 it('an explicit first creation (a saved deck or a selected word practised before GoReview proposed it) is an introduction; an explicit re-review stays free (2026-10-29)',()=>{
  const intent={kind:'explicit',reason:'saved-deck',requestedAt:'2026-10-08T01:00:00Z'};
  const created:GoEvent={...ev('made','2026-10-08T01:00:00Z',null),kind:'CardAdded',payload:{lifecycle:'create',admission:{at:'2026-10-08T01:00:00Z',intent}}};created.subject={cardId:'saved-card',itemIds:['saved-unit']};
  const answered=ev('answered','2026-10-08T01:00:00Z',3,{practiceIntent:intent});answered.subject={cardId:'saved-card',itemIds:['saved-unit']};
  const again=ev('again','2026-10-08T02:00:00Z',3,{practiceIntent:intent});again.subject={cardId:'saved-card',itemIds:['saved-unit']};
  expect(admissionBudget([created,answered,again],{learnerId:'L',languageId:'sq',now:NOW,maxNew:4,dailyNewLimit:2})).toEqual({used:1,remaining:1});
  // a card that already existed, practised again from a saved deck: no introduction
  const old=ev('old','2026-10-06T12:00:00Z',3),oldAgain=ev('old-again','2026-10-08T03:00:00Z',3,{practiceIntent:intent});
  expect(admissionBudget([old,oldAgain],{learnerId:'L',languageId:'sq',now:NOW,maxNew:4,dailyNewLimit:2})).toEqual({used:0,remaining:2});
 });
 it('keeps snooze, suspension and dismissal hard even for saved or selected practice',()=>{
  for(const status of ['suspended','dismissed','snoozed'] as const)
   expect(reviewEligibility({item:{...item(),status,snoozedUntil:'2027-01-01T00:00:00Z'},unitId:unit,knowledge:knowledge(unit),events:[],now:NOW,intent:{kind:'explicit',reason:'saved-deck',requestedAt:NOW}}).eligible).toBe(false);
  expect(reviewEligibility({item:{...item(),status:'snoozed',snoozedUntil:'2026-10-01T00:00:00Z'},unitId:unit,events:[],now:NOW}).eligible).toBe(true);
 });
 it('excludes catalog New and zero automatic budget, while preserving due Automatic obligations',()=>{
  expect(reviewEligibility({unitId:unit,knowledge:{...knowledge(unit),level:'new'},events:[],now:NOW,remainingNew:5}).eligible).toBe(false);
  expect(reviewEligibility({unitId:unit,knowledge:knowledge(unit),events:[],now:NOW,remainingNew:0}).eligible).toBe(false);
  expect(reviewEligibility({item:item(),unitId:unit,knowledge:{...knowledge(unit),level:'automatic'},events:[],now:NOW}).eligible).toBe(true);
  expect(reviewEligibility({item:{...item(),schedule:{...item().schedule,due:'2027-01-01T00:00:00Z'}},unitId:unit,knowledge:{...knowledge(unit),level:'automatic'},events:[],now:NOW}).eligible).toBe(false);
 });
 it('carries unresolved independent failures across batches and resolves only independent Good',()=>{
  const fail=ev('fail','2026-10-07T00:00:00Z',1),hard=ev('hard','2026-10-07T01:00:00Z',2,{correct:true});
  expect(remediationBacklog([item()],[fail,hard],NOW)).toEqual([]);
  const assisted=ev('assist','2026-10-07T02:00:00Z',3);assisted.evidence={quality:'none',assisted:true};
  expect(remediationBacklog([item()],[fail,hard,assisted],NOW)).toEqual([]);
  expect(remediationBacklog([{...item(),invalidatedAt:'2026-10-08T09:00:00Z'}],[fail,hard],NOW)).toEqual([]);
  expect(remediationBacklog([item()],[fail,ev('good','2026-10-07T03:00:00Z',3)],NOW)).toEqual([]);
 });
 it('requires a matching study marker and real delay before reassessing a repeated failure',()=>{
  const failures=Array.from({length:5},(_,i)=>ev('f'+i,'2026-10-07T0'+i+':00:00Z',1));
  const row={...item(),history:failures.map(e=>({at:e.at,rating:1 as const,outcome:'incorrect' as const,deviceId:'D',exerciseId:e.id,eventId:e.id,family:'written-recognition' as const,elapsedDays:0}))};
  const marker:GoEvent={...failures[4],id:'study',at:'2026-10-08T09:55:00Z',kind:'PreferenceChanged',payload:{key:'goreview.remediation',origin:'explicit',value:{cardId:card,action:'studied',failureEventId:'f4'}},evidence:{quality:'none'}};
  const intent={kind:'explicit' as const,reason:'reassessment' as const,requestedAt:'2026-10-08T09:55:00Z'};
  expect(reviewEligibility({item:row,unitId:unit,events:[...failures,marker],now:NOW,intent}).eligible).toBe(false);
  expect(reviewEligibility({item:row,unitId:unit,events:[...failures,marker],now:'2026-10-08T10:05:00Z',intent}).eligible).toBe(true);
  const laterGood=ev('premature-good','2026-10-08T09:56:00Z',3);
  expect(remediationBacklog([row],[...failures,laterGood],NOW)).toMatchObject([{repairRequired:true,needsStudy:true,ready:false}]);
  expect(reviewEligibility({item:{...row,history:[...row.history,{...row.history[0],eventId:'pre-study-good',rating:3,outcome:'correct'}]},unitId:unit,events:[],now:'2026-10-08T10:05:00Z',intent}).eligible).toBe(false);
  expect(remediationBacklog([row],[...failures,marker],'2026-10-08T10:05:00Z')).toMatchObject([{repairRequired:true,needsStudy:false,ready:true}]);
  const independentGood=ev('independent-good','2026-10-08T10:06:00Z',3);
  expect(remediationBacklog([row],[...failures,marker,independentGood],'2026-10-08T10:07:00Z')).toEqual([]);
  const dueRow={...row,schedule:{...row.schedule,due:'2026-10-08T10:06:00Z'}};
  expect(reviewEligibility({item:dueRow,unitId:unit,events:[...failures,marker,independentGood],now:'2026-10-08T10:07:00Z'}).eligible).toBe(true);
  const partial=ev('partial','2026-10-08T10:06:00Z',4,{outcome:'partial'});
  const lowQuality=ev('low-quality','2026-10-08T10:06:00Z',4);lowQuality.evidence={quality:'none'};
  const transcript=ev('transcript','2026-10-08T10:06:00Z',4,{transcriptShownBefore:true});
  for(const weak of [partial,lowQuality,transcript]) expect(remediationBacklog([row],[...failures,marker,weak],'2026-10-08T10:07:00Z')).toHaveLength(1);
 });
 it('keeps instruction opportunities out of automatic questions and admits only a targeted ready reassessment',()=>{
  const failures=Array.from({length:5},(_,i)=>ev('f'+i,'2026-10-07T0'+i+':00:00Z',1));
  const history=failures.map(e=>({at:e.at,rating:1 as const,outcome:'incorrect' as const,deviceId:'D',exerciseId:e.id,eventId:e.id,family:'written-recognition' as const,elapsedDays:0}));
  const row={...item(),history,schedule:{...item().schedule,due:'2026-10-09T00:00:00Z'}};
  const study=buildRemediationStudiedEvent({learnerId:'L',enrolmentId:'E',languageId:'sq',itemId:card,failureEventId:'f4',at:'2026-10-08T09:55:00Z',deviceId:'D'});
  const common={deck:[row],intake:[],preferences:prefs(),audio:{available:false,eligibleForEvidence:false,reason:'none'},scheduler:fakeScheduler,now:'2026-10-08T10:05:00Z',readingSignals:[...failures,study],random:()=>0};
  const automatic=planSession(common);
  expect(automatic.items).toEqual([]);
  expect(automatic.remediation?.[0]).toMatchObject({itemId:card,needsStudy:false,ready:true});
  const selected=planSession({...common,intent:{kind:'explicit',reason:'reassessment',requestedAt:common.now},remediationItemIds:new Set([card])});
  expect(selected.items.map(p=>p.queue)).toEqual(['remediation']);
  expect(selected.items[0].intent).toEqual({kind:'explicit',reason:'reassessment',requestedAt:common.now});
  expect(planSession({...common,intent:{kind:'explicit',reason:'reassessment',requestedAt:common.now}}).items).toEqual([]);
 });
 it('protects due backlog before higher-attention new cards and honors maxNew zero',()=>{
  const due={...item(),schedule:{...item().schedule,due:'2026-10-01T00:00:00Z'}},fresh=testNow('form:sq:fresh',{score:999});
  const base={deck:[due],intake:[fresh],knowledge:[{...knowledge(unit),level:'known' as const},knowledge(fresh.unitId)],preferences:prefs({sessionMinutes:1,maxNew:1}),
   audio:{available:false,eligibleForEvidence:false,reason:'none'},scheduler:fakeScheduler,now:NOW,random:()=>0};
  expect(planSession(base).items[0].item.itemId).toBe(card);
  expect(planSession({...base,preferences:prefs({maxNew:0})}).items.filter(p=>p.isNew)).toEqual([]);
 });
 it('maps uncertain partial recall to Again and difficult successful recall to Hard',()=>{
  const r={hinted:false,assistance:[]};
  expect(ratingFor({outcome:'partial',confidence:.7,explanation:'missing essential content'},r)).toBe(1);
  expect(ratingFor({outcome:'partial',confidence:.7,explanation:'recalled',retrievalSucceeded:true},r)).toBe(2);
  expect(ratingFor({outcome:'correct',confidence:.6,explanation:'self reported'}, {...r,selfGrade:'hard'})).toBe(2);
  expect(ratingFor({outcome:'partial',confidence:.6,explanation:'unsuccessful partial'}, {...r,selfGrade:'hard'})).toBe(1);
 });
});

it('counts assisted introductions and never refunds exposure merely because its grade is corrected',()=>{
 const first=ev('assisted','2026-10-08T09:00:00Z',null,{hinted:true});first.evidence={quality:'none',assisted:true};
 const corrected={...first,id:'undo',at:'2026-10-08T09:01:00Z',correctionOf:first.id,payload:{...first.payload,rating:null,challenged:true}};
 const x={learnerId:'L',languageId:'sq',now:NOW,maxNew:2,dailyNewLimit:1};
 expect(admissionBudget([corrected,first,first],x)).toEqual({used:1,remaining:0});
});
it('debits a partially committed creation at its actual introduction instant across UTC midnight',()=>{
 const creation={...ev('creation','2026-10-07T23:55:00Z',null),kind:'CardAdded' as const,payload:{lifecycle:'create',admission:{at:'2026-10-08T00:05:00Z',intent:{kind:'automatic'}}}};
 const x={learnerId:'L',languageId:'sq',now:NOW,maxNew:2,dailyNewLimit:1};
 expect(admissionBudget([creation],x)).toEqual({used:1,remaining:0});
 expect(admissionBudget([creation],{...x,learnerId:'another'})).toEqual({used:0,remaining:1});
});
