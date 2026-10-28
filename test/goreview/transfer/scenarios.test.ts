// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { GoEvent, ReviewCandidate } from '../../../packages/repository-contract/src';
import { selectReviewEvidenceEvents, validateEvent } from '../../../packages/repository-contract/src';
import { foldEvents } from '../../../packages/repository-engine/src/projection';
import { createMemoryArea } from '../../../packages/repository-sync/src/area';
import { createSessionRunner } from '../../../packages/goreview/src/session/runner';
import { createFsrsScheduler } from '../../../packages/goreview/src/scheduler/fsrs';
import { foldDeckItems, itemIdFor } from '../../../packages/goreview/src/scheduler/deck';
import { buildRemediationStudiedEvent, remediationBacklog, REMEDIATION_DELAY_MS } from '../../../packages/goreview/src/planner/remediation';
import { decideIntake } from '../../../packages/goreview/src/intake/intake';
import { planSession } from '../../../packages/goreview/src/planner/planner';
import { registry } from '../../../packages/goreview/src/exercises';
import { factsProvider, IDENTITY, makePlan, wrong } from '../session/helpers';
import { audioOk, knowledge as knowledgeRow, NOW, prefs, testNow } from '../intake/fixtures';
import { destroyRigs, makeRig, reopen, seed, T0 } from '../../gopractice/helpers';
import { loadReviewModel } from '../../../packages/gopractice/workspace';
import { listSavedDecks, planFromSaved, removeSavedDeck, saveDeck, type DeckEntry } from '../../../packages/gopractice/deckModel';

const t0='2026-10-20T10:00:00.000Z';
afterEach(()=>destroyRigs());
function review(id:string,at:string,opts:{card?:string;unit?:string;device?:string;rating?:1|2|3|4;previous?:string|null;family?:string;outcome?:string;correct?:boolean}={}):GoEvent{
  const rating=opts.rating??3, correct=opts.correct??rating>1;
  const unit=opts.unit??'form:sq:unit',family=opts.family??'written-recognition';
  const dimension=(family==='meaning-to-form'?'meaning-to-target-retrieval':family==='audio-to-meaning'?'auditory-recognition':family==='audio-transcription'?'auditory-transcription':family==='sentence-completion'?'productive-recall':family==='phrase-comprehension'?'phrase-comprehension':family==='grammar-application'?'construction-understanding':family==='morphological-identification'?'morphological-analysis':'written-recognition') as import('../../../packages/goreview/src/types').AssessmentDimension;
  const card=opts.card??itemIdFor(unit,dimension);
  const event:GoEvent={id,v:3,learnerId:'L',enrolmentId:'E',languageId:'sq',at,
    producer:{app:'gopractice-review',version:'scenario',deviceId:opts.device??'D1'},kind:'CardReviewed',
    subject:{cardId:card,itemIds:[unit]},
    payload:{cardKind:'recognition',family,assessmentDimension:dimension,rating,grade:rating===1?'again':rating===2?'hard':'good',correct,
      outcome:opts.outcome??(correct?'correct':'incorrect'),responseMode:'typed',hinted:false,retrievalAttempted:true,expectedPreviousReviewId:opts.previous??null},
    evidence:{quality:'moderate',sourceReliability:1},
  };
  expect(validateEvent(event),id).toEqual([]);
  return event;
}
function added(id:string,at=t0,card='card:written-recognition:form:sq:unit',unit='form:sq:unit'):GoEvent{
  const event:GoEvent={
  id,v:3,learnerId:'L',enrolmentId:'E',languageId:'sq',at,producer:{app:'gopractice-review',version:'scenario',deviceId:'D1'},
  kind:'CardAdded',subject:{cardId:card,itemIds:[unit]},payload:{lifecycle:'create',unitId:unit,unitKind:unit.startsWith('form:')?'form':'lexeme',dimension:'written-recognition',family:'written-recognition',addedBy:'intake'},evidence:{quality:'none'},
  };
  expect(validateEvent(event),id).toEqual([]);
  return event;
}

describe('realistic A–H chronological scenarios (planner, runner, FSRS and Repository projections)',()=>{
  it('A beginner with two eligible GoLearn outcomes admits exactly one card under a one-card budget and writes nothing',()=>{
    const scheduler=createFsrsScheduler(),preferences=prefs({maxNew:1,dailyNewLimit:1,cardsPerDeck:8,sessionMinutes:10});
    const outcomes=[testNow('form:sq:beginner-a'),testNow('form:sq:beginner-b')],writes:GoEvent[]=[];
    const plan=planSession({deck:[],intake:outcomes,preferences,audio:audioOk,scheduler,now:NOW,learnerId:'L1',knowledge:outcomes.map(x=>knowledgeRow(x.unitId)),random:()=>.2});
    expect(plan.dueCount).toBe(0);expect(plan.newCount).toBe(1);expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.isNew).toBe(true);expect(plan.items[0]?.origin).toBe('intake');
    expect(foldDeckItems(writes,scheduler,{languageId:'sq',now:NOW})).toEqual([]);
  });

  it('B repeated failures defer ordinarily, require delayed study, and keep an unresolved target in the leech backlog',()=>{
    const scheduler=createFsrsScheduler({learningSteps:['1m','10m']}),cards=['card:written-recognition:form:sq:repair-a','card:written-recognition:form:sq:repair-b'];
    const units=['form:sq:repair-a','form:sq:repair-b'],events:GoEvent[]=[];
    const failures=new Map<string,string>();
    for(let c=0;c<cards.length;c++){
      events.push(added(`add-${c}`,t0,cards[c]!,units[c]!));let previous:string|null=null;
      for(let i=0;i<5;i++){
        const id=`again-${c}-${i}`,at=new Date(Date.parse(t0)+(i+1)*60_000).toISOString();
        events.push(review(id,at,{card:cards[c],unit:units[c],rating:1,previous}));previous=id;
      }
      failures.set(cards[c]!,previous!);
    }
    const afterFailures=new Date(Date.parse(t0)+6*60_000).toISOString();
    const deckAt=(at:string)=>foldDeckItems(events,scheduler,{languageId:'sq',now:at});
    const initial=remediationBacklog(deckAt(afterFailures),events,afterFailures);
    expect(initial).toHaveLength(2);expect(initial.every(x=>x.repairRequired&&x.needsStudy&&!x.ready)).toBe(true);
    const ordinary=planSession({deck:deckAt(afterFailures),intake:[],preferences:prefs({maxNew:0,dailyNewLimit:0,cardsPerDeck:4}),audio:audioOk,
      scheduler,now:afterFailures,readingSignals:events,learnerId:'L',random:()=>.1});
    expect(ordinary.items.some(item=>cards.includes(item.item.itemId))).toBe(false);
    expect(ordinary.skipped.some(row=>row.itemId===cards[0]&&row.why.includes('repair'))).toBe(true);
    const studiedAt=new Date(Date.parse(t0)+10*60_000).toISOString();
    for(let c=0;c<cards.length;c++)events.push(buildRemediationStudiedEvent({learnerId:'L',enrolmentId:'E',languageId:'sq',itemId:cards[c]!,failureEventId:failures.get(cards[c]!)!,at:studiedAt,deviceId:'D1'}));
    const beforeReady=new Date(Date.parse(studiedAt)+REMEDIATION_DELAY_MS-1).toISOString();
    expect(remediationBacklog(deckAt(beforeReady),events,beforeReady).every(x=>x.studiedAt===studiedAt&&!x.ready&&!x.needsStudy)).toBe(true);
    const recoveredAt=new Date(Date.parse(studiedAt)+REMEDIATION_DELAY_MS+30_000).toISOString();
    const success=review('reassess-a',recoveredAt,{card:cards[0],unit:units[0],rating:3,previous:failures.get(cards[0]!),family:'written-recognition'});
    events.push(success);
    const after=remediationBacklog(deckAt(recoveredAt),events,recoveredAt);
    expect(after).toHaveLength(1);expect(after[0]).toMatchObject({itemId:cards[1],repairRequired:true,ready:true,needsStudy:false});
    expect(deckAt(recoveredAt).find(x=>x.itemId===cards[0])?.schedule.reps).toBe(6);
  });

  it('C spaced reading proof admits a real productive-retrieval candidate through intake and planning',()=>{
    const unit='form:sq:unit',card=itemIdFor(unit,'written-recognition'),days=[0,2,4,6];
    const events=days.map((d,i)=>review(`read-${i}`,new Date(Date.parse(t0)+d*86_400_000).toISOString(),{card,unit,previous:i?`read-${i-1}`:null,family:'written-recognition'}));
    const row=foldEvents(events,{modelVersion:'projection@7'}).find(x=>x.unitId===unit)!;
    expect(row.dimensions.readingRecognition.independentPositiveEvents).toBe(4);
    expect(row.dimensions.readingRecognition.delayedIndependentPositiveEvents).toBe(3);
    expect(row.level).toBe('known');expect(row.dimensions.productiveRetrieval.observations).toBe(0);
    const candidate:ReviewCandidate={unitId:'form:sq:unit',kind:'form',score:.9,reasons:[{rule:'spaced-reading',weight:1}],targetDimension:'productiveRetrieval',
      eligibility:{eligible:true,status:'verified',caveats:[]},cost:.2};
    const now=new Date(Date.parse(t0)+7*86_400_000).toISOString(),preferences=prefs({maxNew:1,dailyNewLimit:1,cardsPerDeck:1,sessionMinutes:10,practiceGoals:['retrieval']});
    const admitted=decideIntake({candidate,knowledge:row,existing:[],audio:audioOk,saved:new Set(),preferences,now,readingSignals:events});
    expect(admitted.decision).toBe('test-now');expect(admitted.proposed?.family).toBe('meaning-to-form');
    const plan=planSession({deck:[],intake:[admitted],preferences,audio:audioOk,scheduler:createFsrsScheduler(),now,learnerId:'L',readingSignals:events,random:()=>.1});
    expect(plan.items).toHaveLength(1);expect(plan.items[0]?.family).toBe('meaning-to-form');
  });

  it('D advanced learners keep real FSRS due obligations in the workload-bounded planner',()=>{
    const scheduler=createFsrsScheduler(),events:GoEvent[]=[];
    for(let i=0;i<3;i++){
      const unit=`form:sq:advanced-${i}`,card=itemIdFor(unit,'written-recognition');
      events.push(added(`advanced-add-${i}`,t0,card,unit));
      events.push(review(`advanced-review-${i}`,new Date(Date.parse(t0)+60_000).toISOString(),{card,unit,previous:null}));
    }
    const now=new Date(Date.parse(t0)+8*86_400_000).toISOString(),deck=foldDeckItems(events,scheduler,{languageId:'sq',now});
    const plan=planSession({deck,intake:[],preferences:prefs({maxNew:0,dailyNewLimit:0,cardsPerDeck:2,sessionMinutes:5}),audio:audioOk,scheduler,now,readingSignals:events,learnerId:'L',random:()=>.1});
    expect(deck.every(item=>scheduler.isDue(item.schedule,now))).toBe(true);
    expect(plan.dueCount).toBe(2);expect(plan.items.every(item=>!item.isNew)).toBe(true);
    expect(plan.items.length).toBeLessThanOrEqual(plan.questionLimit!);expect(plan.batch?.workloadLimit).toBeGreaterThan(0);
  });

  it('E two offline devices retain both sibling observations while FSRS chooses one deterministic schedule step',()=>{
    const scheduler=createFsrsScheduler(),unit='form:sq:offline-sibling',card=itemIdFor(unit,'written-recognition');
    const add=added('add-e',t0,card,unit),root=review('root-e',new Date(Date.parse(t0)+1000).toISOString(),{card,unit,device:'A',previous:null});
    const sibling=review('sibling-e',new Date(Date.parse(t0)+60_000).toISOString(),{card,unit,device:'B',previous:null});
    const selection=selectReviewEvidenceEvents([add,root,sibling]);
    const deck=foldDeckItems([add,sibling,root],scheduler,{languageId:'sq',now:new Date(Date.parse(t0)+120_000).toISOString()});
    expect(selection.events.map(e=>e.id)).toEqual(['root-e','sibling-e']);
    expect(selection.independentSiblingIds.has('sibling-e')).toBe(true);
    expect(deck).toHaveLength(1);expect(deck[0]?.history.filter(h=>!h.scheduleExcluded&&!h.retracted&&!h.conflict)).toHaveLength(1);expect(deck[0]?.schedule.reps).toBe(1);
  });

  it('F an interrupted timed return is recovered from persisted runner state after its actual due instant',async()=>{
    const scheduler=createFsrsScheduler({learningSteps:['1m']}),plan=makePlan({due:0,newItems:[{unitId:'form:sq:offline-return'}]});
    plan.questionLimit=3;plan.items[0]!.item.schedule=scheduler.newState(plan.createdAt);plan.items[0]!.item.history=[];
    let nowMs=Date.parse(plan.createdAt);const now=()=>new Date(nowMs).toISOString(),events:GoEvent[]=[],persist=createMemoryArea();
    const deps={plan,builders:registry,facts:factsProvider,scheduler,identity:IDENTITY,persist,now,random:()=>.4,committedEvents:()=>events,
      record:async(batch:GoEvent[])=>{events.push(...batch);},canPresent:()=>({eligible:true})};
    const runner=createSessionRunner(deps);const shown=await runner.current();expect(shown).not.toBeNull();
    const first=await runner.answer(wrong());expect(first.rating).toBe(1);
    const due=runner.state().nextReturnAt!;nowMs=Date.parse(due)-1;expect(await runner.current()).toBeNull();
    const resumed=createSessionRunner(deps);expect(await resumed.recover(runner.sessionId,events)).toBe(true);
    expect(await resumed.current()).toBeNull();nowMs=Date.parse(due)+1;
    expect((await resumed.current())?.planned.presentationReason).toBe('due-learning-return');
  });

  it('G rapid correct recognition repeats remain short of delayed Known evidence',()=>{
    const unit='form:sq:rapid',card=itemIdFor(unit,'written-recognition'),events=Array.from({length:5},(_,i)=>review(`rapid-${i}`,new Date(Date.parse(t0)+i*60_000).toISOString(),{card,unit,previous:i?`rapid-${i-1}`:null}));
    const row=foldEvents(events,{modelVersion:'projection@7'}).find(x=>x.unitId===unit)!;
    expect(row.dimensions.readingRecognition.independentPositiveEvents).toBe(5);
    expect(row.dimensions.readingRecognition.delayedIndependentPositiveEvents).toBe(0);
    expect(row.level).not.toBe('known');
  });

  it('H saved collection can be reopened and repeated against one shared FSRS card; removal exhausts the collection only',async()=>{
    const rig=await makeRig({signedIn:true});
    const unit='form:sq:saved-collection',card=itemIdFor(unit,'written-recognition'),reviewAt=new Date(Date.parse(T0)+2*86_400_000).toISOString();
    rig.clock.set(new Date(Date.parse(T0)+3*86_400_000).toISOString());
    const add={...added('saved-add',T0,card,unit),learnerId:'L1',enrolmentId:'L1-e1'};
    const first={...review('saved-review',reviewAt,{card,unit,previous:null}),learnerId:'L1',enrolmentId:'L1-e1'};
    await seed(rig,[add,first]);
    const builtins=await listSavedDecks(rig.app.ctx,'L1','sq');
    if(builtins[0]?.builtin)await removeSavedDeck(rig.app.ctx,'L1','sq',builtins[0].id);
    const entry:DeckEntry={itemId:card,unitId:unit,unitKind:'form',label:'saved collection item',dimension:'written-recognition',family:'written-recognition'};
    const saved=await saveDeck(rig.app.ctx,{learnerId:'L1',languageId:'sq'},[entry]);expect(saved).toBeDefined();
    expect((await listSavedDecks(rig.app.ctx,'L1','sq')).map(d=>d.id)).toEqual([saved!.id]);
    await reopen(rig);
    const reopened=await listSavedDecks(rig.app.ctx,'L1','sq');expect(reopened).toHaveLength(1);expect(reopened[0]?.items).toHaveLength(1);
    const model=await loadReviewModel(rig.app.ctx);expect(model).toBeDefined();
    const firstPlan=await planFromSaved(rig.app.ctx,model!,reopened[0]!);
    const repeatedPlan=await planFromSaved(rig.app.ctx,model!,reopened[0]!);
    expect(firstPlan.items).toHaveLength(1);expect(repeatedPlan.items[0]?.item.itemId).toBe(card);
    expect(firstPlan.items[0]?.schedulingCardExists).toBe(true);expect(firstPlan.items[0]?.item.history).toHaveLength(1);
    expect(foldEvents(await rig.app.ctx.events('sq'),{modelVersion:'projection@7'}).find(row=>row.unitId===unit)?.dimensions.productiveRetrieval.observations).toBe(0);
    await removeSavedDeck(rig.app.ctx,'L1','sq',saved!.id);
    expect(await listSavedDecks(rig.app.ctx,'L1','sq')).toEqual([]);
    const afterRemoval=await loadReviewModel(rig.app.ctx);
    expect(afterRemoval?.deck.find(item=>item.itemId===card)?.history).toHaveLength(1);
  });
});
