import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { createMemoryArea } from '../../../packages/repository-sync/src/area';
import { createSessionRunner, type RunnerDeps } from '../../../packages/goreview/src/session/runner';
import { createFsrsScheduler } from '../../../packages/goreview/src/scheduler/fsrs';
import { foldDeckItems } from '../../../packages/goreview/src/scheduler/deck';
import { registry } from '../../../packages/goreview/src/exercises';
import { factsProvider, IDENTITY, makePlan, right, wrong } from './helpers';
function build(over: Partial<RunnerDeps> = {}, scheduler=createFsrsScheduler()) {
  const plan=makePlan({due:0,newItems:[{unitId:'form:sq:timed-fresh'}]});
  plan.questionLimit=2;plan.items[0].why=['arbitrary display copy'];plan.items[0].origin='vocabulary';plan.items[0].schedulingCardExists=false;
  plan.items[0].item.schedule=scheduler.newState(plan.createdAt);plan.items[0].item.history=[];
  let ms=Date.parse(plan.createdAt);const persist=createMemoryArea(),events:GoEvent[]=[];
  const deps:RunnerDeps={plan,builders:registry,facts:factsProvider,scheduler,identity:IDENTITY,persist,now:()=>new Date(ms).toISOString(),
    random:()=>.3,committedEvents:()=>events,record:async batch=>{events.push(...batch);},...over};
  return{deps,persist,events,setTime:(v:string)=>{ms=Date.parse(v);},runner:createSessionRunner(deps)};
}
describe('real FSRS timed learning and typed persistence',()=>{
  it('resumes an unanswered persisted prompt without consuming another presentation slot',async()=>{
    const a=build();
    const shown=await a.runner.current();expect(shown).not.toBeNull();
    expect(a.runner.state().presentations).toHaveLength(1);
    const resumed=createSessionRunner(a.deps);expect(await resumed.recover(a.runner.sessionId,a.events)).toBe(true);
    const current=await resumed.current();
    expect(current?.index).toBe(shown?.index);
    expect(current?.planned.item.itemId).toBe(shown?.planned.item.itemId);
    expect(resumed.state().presentations).toHaveLength(1);
  });

  it('leaves the original unshown batch intact when a return cannot displace explicit practice',async()=>{
    const scheduler=createFsrsScheduler({learningSteps:['1m']}),a=build({canPresent:()=>({eligible:true})},scheduler);
    const firstPlan=a.deps.plan.items[0],explicit=structuredClone(firstPlan);
    explicit.item.itemId='card:written-recognition:form:sq:explicit';explicit.item.unitId='form:sq:explicit';explicit.item.schedule=scheduler.newState(a.deps.plan.createdAt);explicit.item.history=[];
    explicit.intent={kind:'explicit',reason:'saved-deck',requestedAt:a.deps.plan.createdAt};explicit.overlap='explicit';explicit.presentationReason='explicit-repeat';
    a.deps.plan.items.push(explicit);a.deps.plan.questionLimit=2;
    const runner=createSessionRunner(a.deps);await runner.answer(wrong());const due=runner.state().nextReturnAt!;
    a.setTime(new Date(Date.parse(due)+1).toISOString());
    const current=await runner.current();
    expect(current?.planned.item.itemId).toBe(explicit.item.itemId);
    expect(runner.state().plan.items.map(p=>p.item.itemId)).toEqual([firstPlan.item.itemId,explicit.item.itemId]);
    expect(runner.state().deferredItems).toEqual([]);
    expect(runner.state().pendingReturns).toHaveLength(1);
  });

  it('seeds presentation count conservatively when recovering an older persisted state',async()=>{
    const a=build({canPresent:()=>({eligible:true})});
    const firstPlan=a.deps.plan.items[0],second=structuredClone(firstPlan);
    second.item.itemId='card:written-recognition:form:sq:legacy-second';second.item.history=[];
    a.deps.plan.items.push(second);a.deps.plan.questionLimit=2;
    const runner=createSessionRunner(a.deps);await runner.answer(right());
    const key=`goreview:session:${runner.sessionId}`,rows=await a.persist.get(key),saved=rows[key] as Record<string,unknown>;
    delete saved.presentations;delete saved.displayedPrompt;await a.persist.set({[key]:saved});
    const recovered=createSessionRunner(a.deps);expect(await recovered.recover(runner.sessionId,a.events)).toBe(true);
    const resumedCurrent=await recovered.current();
    expect({index:recovered.state().index,planLength:recovered.state().plan.items.length,presentations:recovered.state().presentations?.length,current:resumedCurrent?.planned.item.itemId}).toEqual({index:1,planLength:2,presentations:2,current:second.item.itemId});
    expect(recovered.state().presentations).toHaveLength(2);
  });

  it('lets a due return displace unshown new work in a full batch without losing it or exceeding the presentation cap',async()=>{
    const scheduler=createFsrsScheduler({learningSteps:['1m','2m']}),a=build({canPresent:()=>({eligible:true})},scheduler);
    const firstPlan=a.deps.plan.items[0],other=structuredClone(firstPlan);
    other.item.itemId='card:written-recognition:form:sq:second';other.item.unitId='form:sq:second';other.item.schedule=scheduler.newState(a.deps.plan.createdAt);other.item.history=[];
    other.queue='new';other.isNew=true;a.deps.plan.items.push(other);a.deps.plan.questionLimit=2;
    const runner=createSessionRunner(a.deps);await runner.answer(wrong());const due=runner.state().nextReturnAt!;
    expect(runner.state().presentations).toHaveLength(1);
    a.setTime(new Date(Date.parse(due)+1).toISOString());
    const returned=await runner.current();
    expect(returned?.planned.item.itemId).toBe(firstPlan.item.itemId);
    expect(returned?.planned.overlap).toBe('scheduled');
    expect(runner.state().deferredItems?.map(p=>p.item.itemId)).toContain(other.item.itemId);
    const second=await runner.answer(wrong());
    expect(second.evidence?.payload).toMatchObject({overlap:'scheduled',presentationReason:'due-learning-return'});
    expect(runner.state().presentations).toHaveLength(2);
    expect(a.events.filter(e=>e.kind==='CardAdded').map(e=>e.subject.cardId)).toEqual([firstPlan.item.itemId]);
    expect(await runner.current()).toBeNull();
    expect(runner.state().pendingReturns).toHaveLength(1);
    const recovered=createSessionRunner(a.deps);expect(await recovered.recover(runner.sessionId,a.events)).toBe(true);
    expect(await recovered.current()).toBeNull();
    expect(recovered.state().presentations).toHaveLength(2);
    expect(recovered.state().pendingReturns).toHaveLength(1);
    expect(recovered.state().deferredItems?.map(p=>p.item.itemId)).toContain(other.item.itemId);
  });

  it('respects active workload seconds using measured time then estimates',async()=>{
    const a=build({canPresent:()=>({eligible:true})});
    const first=a.deps.plan.items[0],second=structuredClone(first),third=structuredClone(first);
    second.item.itemId='second';second.item.unitId='form:sq:second';third.item.itemId='third';third.item.unitId='form:sq:third';
    for(const p of [first,second,third]) p.estimatedSeconds=60;
    a.deps.plan.items=[first,second,third];a.deps.plan.batch={targetQuestions:3,workloadLimit:90,estimatedSeconds:180,reasons:['test workload cap']};a.deps.plan.questionLimit=10;
    const runner=createSessionRunner(a.deps);await runner.answer(right({reviewSeconds:30}));
    expect((await runner.current())?.planned.item.itemId).toBe(second.item.itemId);
    await runner.answer(right({reviewSeconds:60}));
    expect(await runner.current()).toBeNull();
    expect(runner.state().deferredItems?.map(p=>p.item.itemId)).toContain(third.item.itemId);
    expect(runner.state().presentations).toHaveLength(2);
  });

  it('refreshes pending return order from remote history before choosing the next return',async()=>{
    const scheduler=createFsrsScheduler({learningSteps:['1m','2m']}),a=build({canPresent:()=>({eligible:true})},scheduler);
    const firstPlan=a.deps.plan.items[0],other=structuredClone(firstPlan);
    other.item.itemId='card:written-recognition:form:sq:remote-order';other.item.unitId='form:sq:remote-order';other.item.schedule=scheduler.newState(a.deps.plan.createdAt);other.item.history=[];
    a.deps.plan.items.push(other);a.deps.plan.questionLimit=4;
    const runner=createSessionRunner(a.deps),first=await runner.answer(wrong()),firstDue=runner.state().pendingReturns![0].due;
    a.setTime(new Date(Date.parse(first.at)+20_000).toISOString());await runner.answer(wrong());
    const bDue=runner.state().pendingReturns!.find(p=>p.itemId===other.item.itemId)!.due;
    const remoteAt=new Date(Date.parse(first.at)+30_000).toISOString();
    a.events.push({...first.evidence!,id:'remote-review-a',at:remoteAt,dedupeKey:'remote-review-a',payload:{...first.evidence!.payload,rating:1,grade:'again',expectedPreviousReviewId:first.evidence!.id}});
    const remoteDue=foldDeckItems(a.events,scheduler,{languageId:a.deps.plan.languageId,now:remoteAt}).find(i=>i.itemId===first.itemId)!.schedule.due;
    expect(Date.parse(firstDue)).toBeLessThan(Date.parse(bDue));
    expect(Date.parse(remoteDue)).toBeGreaterThan(Date.parse(bDue));
    a.setTime(new Date(Date.parse(bDue)+1).toISOString());
    expect((await runner.current())?.planned.item.itemId).toBe(other.item.itemId);
  });

  it('keeps a displayed prompt fixed when a timed return becomes due, then prioritizes it at the next boundary',async()=>{
    const a=build({canPresent:()=>({eligible:true})}),firstPlan=a.deps.plan.items[0],other=structuredClone(firstPlan);
    other.item.itemId='card:written-recognition:form:sq:second';other.item.unitId='form:sq:second';other.item.schedule=a.deps.scheduler.newState(a.deps.plan.createdAt);
    other.item.history=[];other.intent={kind:'explicit',reason:'saved-deck',requestedAt:a.deps.plan.createdAt};a.deps.plan.items.push(other);a.deps.plan.questionLimit=3;
    const runner=createSessionRunner(a.deps);
    const first=await runner.answer(right()),due=runner.state().nextReturnAt!;
    const shown=await runner.current();expect(shown?.index).toBe(1);expect(shown?.planned.item.unitId).toBe('form:sq:second');
    a.setTime(new Date(Date.parse(due)+1).toISOString());
    expect((await runner.current())?.planned.item.unitId).toBe('form:sq:second');
    const second=await runner.answer(right());expect(second.itemId).toBe(other.item.itemId);
    const returned=await runner.current();expect(returned?.index).toBe(2);expect(returned?.planned.item.itemId).toBe(first.itemId);expect(returned?.planned.queue).toBe('learning');
    expect(a.events.filter(e=>e.kind==='CardReviewed').map(e=>e.subject.cardId)).toEqual([firstPlan.item.itemId,other.item.itemId]);
  });
  it('creates one fresh arbitrary-copy card, recovers its due return, then graduates',async()=>{
    const a=build();await a.runner.current();const first=await a.runner.answer(right());
    expect(first.rating).toBe(3);expect(a.events.filter(e=>e.kind==='CardAdded')).toHaveLength(1);
    const due=a.runner.state().nextReturnAt!;expect(Date.parse(due)-Date.parse(first.at)).toBe(600000);
    expect(await a.runner.current()).toBeNull();a.setTime(new Date(Date.parse(due)-1).toISOString());
    const recovered=createSessionRunner(a.deps);expect(await recovered.recover(a.runner.sessionId,a.events)).toBe(true);
    expect(await recovered.current()).toBeNull();a.setTime(new Date(Date.parse(due)+1).toISOString());
    const current=await recovered.current();expect(current?.index).toBe(1);expect(current?.planned.queue).toBe('learning');
    const second=await recovered.answer(right());expect(second.resultId).toBe(recovered.sessionId+':1');
    expect(second.evidence?.payload.expectedPreviousReviewId).toBe(first.evidence?.id);
    expect(a.events.filter(e=>e.kind==='CardAdded')).toHaveLength(1);expect(recovered.state().pendingReturns).toBeUndefined();
    const card=foldDeckItems(a.events,createFsrsScheduler(),{now:second.at})[0];
    expect(card.history).toHaveLength(2);expect(card.schedule.phase).toBe('review');expect(card.schedule.reps).toBe(2);
  });
  it('rechecks controls before presenting a due return',async()=>{
    let allowed=true;const a=build({canPresent:()=>({eligible:allowed,reason:'control changed'})});
    await a.runner.answer(right());const due=a.runner.state().nextReturnAt!;allowed=false;a.setTime(new Date(Date.parse(due)+1).toISOString());
    expect(await a.runner.current()).toBeNull();expect(a.runner.state().pendingReturns).toHaveLength(1);
    expect(a.events.filter(e=>e.kind==='CardReviewed')).toHaveLength(1);
  });

  it.each(['suspended', 'budget'] as const)('rechecks %s eligibility after an asynchronous build before presenting',async(mode)=>{
    const firstUnit='form:sq:timed-fresh',secondUnit='form:sq:timed-second';
    let finishBuild!:()=>void,signalBuild!:()=>void;
    const buildGate=new Promise<void>(resolve=>{finishBuild=resolve;});
    const buildStarted=new Promise<void>(resolve=>{signalBuild=resolve;});
    let blocked=false;
    const builders=registry.map(builder=>builder.family==='written-recognition'?{
      ...builder,
      build:async(target:Parameters<typeof builder.build>[0],facts:Parameters<typeof builder.build>[1],ctx:Parameters<typeof builder.build>[2])=>{
        if(target.unitId===firstUnit){signalBuild();await buildGate;}
        return builder.build(target,facts,ctx);
      },
    }:builder);
    const a=build({builders,canPresent:(item)=>({eligible:item.item.unitId!==firstUnit||!blocked,reason:mode==='suspended'?'suspended':'new-card budget exhausted'})});
    const first=a.deps.plan.items[0],second=structuredClone(first);
    first.item.unitId=firstUnit;second.item.unitId=secondUnit;second.item.itemId='card:written-recognition:form:sq:timed-second';
    second.item.schedule=a.deps.scheduler.newState(a.deps.plan.createdAt);second.item.history=[];
    a.deps.plan.items.push(second);a.deps.plan.questionLimit=2;

    const runner=createSessionRunner(a.deps);
    const currentPromise=runner.current();
    await buildStarted;
    blocked=true;
    finishBuild();
    const shown=await currentPromise;

    expect(shown?.planned.item.unitId).toBe(secondUnit);
    expect(runner.skips().some(skip=>skip.itemId===first.item.itemId)).toBe(true);
    expect(runner.state().presentations?.map(p=>p.itemId)).toEqual([second.item.itemId]);
    expect(a.events.filter(e=>e.kind==='CardAdded'||e.kind==='CardReviewed')).toEqual([]);
    await runner.answer(right());
    expect(a.events.filter(e=>e.kind==='CardAdded'||e.kind==='CardReviewed').every(e=>e.subject.cardId===second.item.itemId)).toBe(true);
    expect(a.events.some(e=>(e.kind==='CardAdded'||e.kind==='CardReviewed')&&e.subject.cardId===first.item.itemId)).toBe(false);
  });
  it('removes a challenged return by replay instead of treating the dispute as weakness',async()=>{
    const a=build(),first=await a.runner.answer(right()),due=a.runner.state().nextReturnAt!;
    a.setTime(new Date(Date.parse(first.at)+1000).toISOString());await a.runner.challenge('answer disputed');
    a.setTime(new Date(Date.parse(due)+1).toISOString());expect(await a.runner.current()).toBeNull();expect(a.runner.state().pendingReturns).toBeUndefined();
    expect(a.events.some(e=>e.correctionOf===first.evidence?.id)).toBe(true);
  });
  it('does not advance or claim progress if durable recording fails',async()=>{
    const a=build({record:async()=>{throw Error('queue unavailable');}}),before=await a.runner.current();
    await expect(a.runner.answer(wrong())).rejects.toThrow('queue unavailable');expect(a.runner.state().index).toBe(0);
    expect(a.runner.state().results).toEqual([]);expect(a.events).toEqual([]);expect((await a.runner.current())?.exercise.exerciseId).toBe(before?.exercise.exerciseId);
  });
});

it('keeps a correction effective while the host committed-event snapshot still lags',async()=>{
 const a=build({committedEvents:()=>[]}),first=await a.runner.answer(right()),due=a.runner.state().nextReturnAt!;
 a.setTime(new Date(Date.parse(first.at)+1000).toISOString());await a.runner.challenge('withdraw the key',{keyIsWrong:true});
 a.setTime(new Date(Date.parse(due)+1).toISOString());expect(await a.runner.current()).toBeNull();
 expect(a.runner.state().pendingReturns).toBeUndefined();
});
