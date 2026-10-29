import {describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import type {GoEvent} from '../../../packages/repository-contract/src';
import type {Exercise} from '../../../packages/goreview/src/types';
import {assessmentFingerprint,buildCardAdded,buildVerifiedFactsRepairEvent,factsFingerprint,foldDeckItems} from '../../../packages/goreview/src/scheduler/deck';
import {fakeScheduler,facts,LANG,NOW,deckItem} from '../intake/fixtures';

const item=deckItem({unitId:'form:sq:repair',itemId:'card:written-recognition:form:sq:repair'});
const exercise=(gloss='the book',varietyId?:string):Exercise=>({exerciseId:'repair-exercise',family:'written-recognition',target:{unitId:item.unitId,unitKind:'form',languageId:LANG,dimension:'written-recognition',...(varietyId?{varietyId}:{})},
  prompt:{instruction:'Choose the meaning',stimulusText:'librin',meaning:gloss,options:[gloss,'a table']},answerKey:{accepted:[gloss],normalization:'loose',explanation:'verified'},hiddenBeforeAnswer:[],responseMode:'choice',
  eligibility:{eligible:true,status:'verified',caveats:[]},builtFrom:{facts:['gloss']},validation:{ok:true,issues:[]}});
const base=(id:string,at:string,kind:GoEvent['kind'],subject:GoEvent['subject'],payload:Record<string,unknown>):GoEvent=>({id,v:2,learnerId:'L1',enrolmentId:'E1',languageId:LANG,at,
  producer:{app:'gopractice-review',version:'0.1.0',deviceId:'D1'},kind,subject,payload,evidence:{quality:'none'}});
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([k])=>!['seq','recordedAt','createdAt','updatedAt','fetchedAt','packVersion','version','provenance'].includes(k)).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;

describe('verified facts repair lifecycle',()=>{
 it('requires changed answer-relevant facts; timestamps, pack version and provenance alone do not count',async()=>{
  const oldFacts=facts(item.unitId),oldExercise=exercise(),oldFingerprint=await factsFingerprint(oldFacts,oldExercise);
  const metadataOnly={...oldFacts,unit:{...oldFacts.unit,createdAt:'2026-10-09T00:00:00Z',packVersion:'2',provenance:{source:'hand-lexicon' as const,ref:'metadata-only',confidence:1}}};
  expect(await factsFingerprint(metadataOnly,oldExercise)).toBe(oldFingerprint);
  expect(await factsFingerprint({...oldFacts,exampleSentences:[{text:'unrelated example',source:'original'}]},oldExercise)).toBe(oldFingerprint);
  const cryptoDescriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  try { Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined}); expect(await factsFingerprint(oldFacts,oldExercise)).toBe(oldFingerprint); }
  finally { if(cryptoDescriptor)Object.defineProperty(globalThis,'crypto',cryptoDescriptor);else delete (globalThis as {crypto?:Crypto}).crypto; }
  expect(await factsFingerprint({...oldFacts,glosses:['a volume']},exercise('a volume'))).not.toBe(oldFingerprint);
  expect(await assessmentFingerprint({...oldExercise,prompt:{...oldExercise.prompt,instruction:'A clearer instruction',options:['the book','another distractor']},answerKey:{...oldExercise.answerKey,explanation:'new explanation'}})).toBe(oldFingerprint);
  const long={...oldExercise,prompt:{...oldExercise.prompt,stimulusText:'λόγος🙂'.repeat(40_000)}};
  const prompt=long.prompt,content={family:long.family,target:long.target,prompt:{stimulusText:prompt.stimulusText,meaning:prompt.meaning,sentenceWithGap:prompt.sentenceWithGap},answerKey:{accepted:[...long.answerKey.accepted].sort(),normalization:long.answerKey.normalization,features:long.answerKey.features}};
  const expected='sha256:'+createHash('sha256').update(new TextEncoder().encode(JSON.stringify(canonical(content)))).digest('hex');
  expect(await assessmentFingerprint(long)).toBe(expected);
 });
 it('only a current, validated exercise with changed facts can clear the referenced invalidation',async()=>{
  const oldFacts=facts(item.unitId),oldExercise=exercise(),fingerprint=await factsFingerprint(oldFacts,oldExercise);
  const created=buildCardAdded({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:'2026-10-07T00:00:00Z',deviceId:'D1',unitId:item.unitId,unitKind:'form',dimension:item.dimension,family:item.family,addedBy:'intake'});
  const review=base('review','2026-10-08T09:00:00Z','CardReviewed',{cardId:item.itemId,itemIds:[item.unitId]},{rating:1,assessmentFingerprint:fingerprint});
  const withdrawal={...review,id:'withdrawal',at:'2026-10-08T09:00:30Z',correctionOf:review.id,payload:{...review.payload,rating:null,challenged:true}};
  const invalidation=base('invalidated','2026-10-08T09:01:00Z','ReviewItemInvalidated',{cardId:item.itemId,itemIds:[item.unitId]},{reason:'analysis-invalidated',reviewEventId:review.id});
  const history=[created,review,withdrawal,invalidation],suspended=foldDeckItems(history,fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0];
  expect(suspended.invalidatedBy).toBe(invalidation.id);
  await expect(buildVerifiedFactsRepairEvent({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:'2026-10-08T09:02:00Z',deviceId:'D1',item:suspended,invalidationEvent:invalidation,events:history,currentFacts:{...oldFacts,unit:{...oldFacts.unit,packVersion:'2'}},validatedExercise:oldExercise})).rejects.toThrow('has not changed');
  const repaired=await buildVerifiedFactsRepairEvent({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:'2026-10-08T09:03:00Z',deviceId:'D1',item:suspended,invalidationEvent:invalidation,events:history,currentFacts:{...oldFacts,glosses:['a volume']},validatedExercise:exercise('a volume')});
  const cleared=foldDeckItems([...history,repaired],fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0];
  expect(cleared.status).toBe('active');expect(cleared).not.toHaveProperty('invalidatedAt');expect(cleared).not.toHaveProperty('invalidatedBy');
  const counterfeit=buildCardAdded({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:'2026-10-08T09:04:00Z',deviceId:'D1',unitId:item.unitId,unitKind:'form',dimension:item.dimension,family:item.family,addedBy:'intake'});
  counterfeit.payload.lifecycle='facts-repaired';counterfeit.payload.invalidationEventId=invalidation.id;counterfeit.payload.verifiedAssessmentFingerprint='sha256:short';counterfeit.payload.sourceFactIds=['gloss'];
  const stillSuspended=foldDeckItems([...history,counterfeit],fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0];
  expect(stillSuspended.status).toBe('suspended');expect(stillSuspended.invalidatedAt).toBe(invalidation.at);
  await expect(buildVerifiedFactsRepairEvent({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:'not-a-time',deviceId:'D1',item:suspended,invalidationEvent:invalidation,events:history,currentFacts:{...oldFacts,glosses:['a volume']},validatedExercise:exercise('a volume')})).rejects.toThrow('repair timestamp is invalid');
 });
 it('keeps legacy invalidations without original fingerprint suspended with an actionable reason',()=>{
  const created=buildCardAdded({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:'2026-10-07T00:00:00Z',deviceId:'D1',unitId:item.unitId,unitKind:'form',dimension:item.dimension,family:item.family,addedBy:'intake'});
  const invalidation=base('legacy-invalidation','2026-10-08T09:01:00Z','ReviewItemInvalidated',{cardId:item.itemId},{reason:'analysis-invalidated'});
  const folded=foldDeckItems([created,invalidation],fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0];
  expect(folded.status).toBe('suspended');expect(folded.suspendedReason).toContain('predates verified facts provenance');
 });
 it('repairs the invalid key without undoing a later learner snooze',async()=>{
  const oldFacts=facts(item.unitId),oldExercise=exercise(),fingerprint=await factsFingerprint(oldFacts,oldExercise);
  const created=buildCardAdded({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:'2026-10-07T00:00:00Z',deviceId:'D1',unitId:item.unitId,unitKind:'form',dimension:item.dimension,family:item.family,addedBy:'intake'});
  const review=base('review','2026-10-08T09:00:00Z','CardReviewed',{cardId:item.itemId,itemIds:[item.unitId]},{rating:1,assessmentFingerprint:fingerprint});
  const withdrawal={...review,id:'withdrawal',at:'2026-10-08T09:00:30Z',correctionOf:review.id,payload:{...review.payload,rating:null,challenged:true}};
  const invalidation=base('invalidated','2026-10-08T09:01:00Z','ReviewItemInvalidated',{cardId:item.itemId,itemIds:[item.unitId]},{reason:'analysis-invalidated',reviewEventId:review.id});
  const snooze=base('snooze','2026-10-08T09:02:00Z','CardRemoved',{cardId:item.itemId},{reason:'snoozed',until:'2026-10-09T00:00:00Z'});
  const history=[created,review,withdrawal,invalidation,snooze],suspended=foldDeckItems(history,fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0];
  const repaired=await buildVerifiedFactsRepairEvent({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:'2026-10-08T09:03:00Z',deviceId:'D1',item:suspended,invalidationEvent:invalidation,events:history,currentFacts:{...oldFacts,glosses:['a volume']},validatedExercise:exercise('a volume')});
  expect(foldDeckItems([...history,repaired],fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0]).toMatchObject({status:'snoozed',snoozedUntil:'2026-10-09T00:00:00Z'});
 });
 it('preserves same-instant snooze and suspension controls ordered before facts repair',async()=>{
  const oldFacts=facts(item.unitId),fingerprint=await factsFingerprint(oldFacts,exercise());
  const created=buildCardAdded({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:'2026-10-07T00:00:00Z',deviceId:'D1',unitId:item.unitId,unitKind:'form',dimension:item.dimension,family:item.family,addedBy:'intake'});
  const review=base('review','2026-10-08T09:00:00Z','CardReviewed',{cardId:item.itemId,itemIds:[item.unitId]},{rating:1,assessmentFingerprint:fingerprint});
  const withdrawal={...review,id:'withdrawal',at:'2026-10-08T09:00:30Z',correctionOf:review.id,payload:{...review.payload,rating:null,challenged:true}};
  const invalidation=base('invalidated','2026-10-08T09:01:00Z','ReviewItemInvalidated',{cardId:item.itemId,itemIds:[item.unitId]},{reason:'analysis-invalidated',reviewEventId:review.id});
  for(const reason of ['snoozed','suspended'] as const){
   const control=base(`aaa-control-${reason}`,'2026-10-08T09:03:00Z','CardRemoved',{cardId:item.itemId},
    {reason,...(reason==='snoozed'?{until:'2026-10-09T00:00:00Z'}:{})});
   const history=[created,review,withdrawal,invalidation,control],suspended=foldDeckItems(history,fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0];
   const repaired=await buildVerifiedFactsRepairEvent({learnerId:'L1',enrolmentId:'E1',languageId:LANG,at:control.at,deviceId:'D1',item:suspended,invalidationEvent:invalidation,events:history,currentFacts:{...oldFacts,glosses:['a volume']},validatedExercise:exercise('a volume')});
   const folded=foldDeckItems([...history,repaired],fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0];
   expect(folded.status).toBe(reason==='snoozed'?'snoozed':'suspended');
   if(reason==='snoozed')expect(folded.snoozedUntil).toBe('2026-10-09T00:00:00Z');
  }
 });
 it('allows a variety-scoped card to use verified generic unit facts',async()=>{
  const genericFacts=facts(item.unitId);delete genericFacts.unit.varietyId;
  const created=buildCardAdded({learnerId:'L1',enrolmentId:'E1',languageId:LANG,varietyId:'sq-AL',at:'2026-10-07T00:00:00Z',deviceId:'D1',unitId:item.unitId,unitKind:'form',dimension:item.dimension,family:item.family,addedBy:'intake'});
  const original=base('review-generic','2026-10-08T09:00:00Z','CardReviewed',{cardId:item.itemId,itemIds:[item.unitId]},{rating:1,assessmentFingerprint:await factsFingerprint(genericFacts,exercise('the book','sq-AL'))});original.varietyId='sq-AL';
  const withdrawal={...original,id:'withdrawal-generic',at:'2026-10-08T09:00:30Z',correctionOf:original.id,payload:{...original.payload,rating:null,challenged:true}};
  const invalidation=base('invalidated-generic','2026-10-08T09:01:00Z','ReviewItemInvalidated',{cardId:item.itemId,itemIds:[item.unitId]},{reason:'analysis-invalidated',reviewEventId:original.id});invalidation.varietyId='sq-AL';
  const events=[created,original,withdrawal,invalidation],suspended=foldDeckItems(events,fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0];
  const repaired=await buildVerifiedFactsRepairEvent({learnerId:'L1',enrolmentId:'E1',languageId:LANG,varietyId:'sq-AL',at:'2026-10-08T09:03:00Z',deviceId:'D1',item:{...suspended,varietyId:'sq-AL'},invalidationEvent:invalidation,events,currentFacts:{...genericFacts,glosses:['a volume']},validatedExercise:exercise('a volume','sq-AL')});
  expect(foldDeckItems([...events,repaired],fakeScheduler,{learnerId:'L1',languageId:LANG,now:NOW})[0].status).toBe('active');
 });
});
