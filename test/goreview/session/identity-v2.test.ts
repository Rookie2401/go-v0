import {describe,expect,it} from 'vitest';
import type {GoEvent} from '../../../packages/repository-contract/src';
import {createMemoryArea} from '../../../packages/repository-sync/src/area';
import {createSessionRunner,type RunnerDeps} from '../../../packages/goreview/src/session/runner';
import {buildCardAdded,buildCardRemoved,foldDeckItems} from '../../../packages/goreview/src/scheduler/deck';
import {createFsrsScheduler} from '../../../packages/goreview/src/scheduler/fsrs';
import {registry} from '../../../packages/goreview/src/exercises';
import {factsProvider,IDENTITY,makePlan,right} from './helpers';
function fresh(origin:NonNullable<import('../../../packages/goreview/src/types').PlannedItem['origin']>,at='2026-10-08T10:00:00.000Z'){
 const scheduler=createFsrsScheduler(),plan=makePlan({due:0,newItems:[{unitId:'form:sq:identity-test'}]});plan.createdAt=at;plan.questionLimit=1;
 Object.assign(plan.items[0],{origin,schedulingCardExists:false,why:['arbitrary display explanation'],intent:{kind:'explicit',reason:'selected-vocabulary',requestedAt:at}});
 Object.assign(plan.items[0].item,{addedAt:at,schedule:scheduler.newState(at),history:[]});
 return{plan,scheduler};
}
function run(plan:RunnerDeps['plan'],scheduler:RunnerDeps['scheduler'],events:GoEvent[],over:Partial<RunnerDeps>={}){
 return createSessionRunner({plan,scheduler,builders:registry,facts:factsProvider,identity:IDENTITY,persist:createMemoryArea(),
  now:()=>new Date(Date.parse(plan.createdAt)+1000).toISOString(),random:()=>.2,committedEvents:()=>events,record:async es=>{events.push(...es);},...over});
}
describe('Phase One scheduling identity audit',()=>{
 it.each(['intake','vocabulary','saved-deck','explicit'] as const)('creates one effective scheduling card for fresh %s origin',async origin=>{
  const {plan,scheduler}=fresh(origin),events:GoEvent[]=[],runner=run(plan,scheduler,events);
  const result=await runner.answer(right());expect(events.map(e=>e.kind)).toEqual(['CardAdded','CardReviewed']);
  expect(events[0].payload.lifecycle).toBe('create');
  const deck=foldDeckItems(events,scheduler,{now:result.at});expect(deck).toHaveLength(1);expect(deck[0].history).toHaveLength(1);expect(deck[0].schedule.reps).toBe(1);
  expect(deck[0].schedule).toEqual(scheduler.review(plan.items[0].item.schedule,result.rating!,result.at));
  expect(foldDeckItems(JSON.parse(JSON.stringify(events)),scheduler,{now:result.at})[0].schedule).toEqual(deck[0].schedule);
  expect(Date.parse(deck[0].schedule.due)).toBeGreaterThan(Date.parse(result.at));
 });
 it('safely handles an old unreviewed card with missing metadata and an incomplete event snapshot',async()=>{
  const {plan,scheduler}=fresh('scheduled'),p=plan.items[0];delete p.origin;delete p.schedulingCardExists;delete p.intent;
  p.item.addedAt='2026-10-01T10:00:00Z';p.item.history=[];
  const events:GoEvent[]=[],runner=run(plan,scheduler,events,{committedEvents:()=>[]});
  const original=buildCardAdded({...IDENTITY,languageId:'sq',at:p.item.addedAt,unitId:p.item.unitId,unitKind:p.item.unitKind,dimension:p.item.dimension,family:p.family,addedBy:'intake'});
  await runner.answer(right());expect(events.map(e=>e.kind)).toEqual(['CardAdded','CardReviewed']);
  const folded=foldDeckItems([original,...events],scheduler,{now:events.at(-1)!.at});
  expect(folded).toHaveLength(1);expect(folded[0].addedAt).toBe(original.at);expect(folded[0].schedule.reps).toBe(1);
 });
 it('retries a partially durable creation batch without a second CardAdded',async()=>{
  const {plan,scheduler}=fresh('vocabulary'),events:GoEvent[]=[];let first=true;
  const runner=run(plan,scheduler,events,{record:async batch=>{if(first){first=false;events.push(...batch.filter(e=>e.kind==='CardAdded'));throw Error('interrupted');}events.push(...batch);}});
  await expect(runner.answer(right())).rejects.toThrow('interrupted');expect(runner.state().index).toBe(0);
  await runner.answer(right());expect(events.filter(e=>e.kind==='CardAdded')).toHaveLength(1);expect(events.filter(e=>e.kind==='CardReviewed')).toHaveLength(1);
 });
 it('keeps a learner control effective when a concurrent first creation arrives later',async()=>{
  const f=fresh('intake'),p=f.plan.items[0],at='2026-10-08T10:00:00Z';
  const add=buildCardAdded({...IDENTITY,languageId:'sq',at,unitId:p.item.unitId,unitKind:p.item.unitKind,dimension:p.item.dimension,family:p.family,addedBy:'intake'});
  add.payload.lifecycle='create';
  const control=buildCardRemoved({...IDENTITY,languageId:'sq',at:'2026-10-08T10:00:30Z',itemId:p.item.itemId,reason:'suspended'});
  const late={...add,id:'late-create',at:'2026-10-08T10:01:00Z'};
  expect(foldDeckItems([late,control,add],f.scheduler,{now:'2026-10-08T10:02:00Z'})[0].status).toBe('suspended');
 });
});

it('standalone runner entry points cannot bypass a suspended card without a host guard',async()=>{
 const {plan,scheduler}=fresh('scheduled');plan.items[0].schedulingCardExists=true;plan.items[0].item.status='suspended';
 const events:GoEvent[]=[],runner=run(plan,scheduler,events);
 expect(await runner.current()).toBeNull();expect(events).toEqual([]);
});
