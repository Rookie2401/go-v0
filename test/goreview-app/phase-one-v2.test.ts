// @vitest-environment jsdom
import {afterEach,describe,expect,it} from 'vitest';
import {beginSession,loadReviewModel,resumeSession} from '../../packages/goreview/app/workspace';
import {addToDeck,planCurrentDeck,planSelectedPractice} from '../../packages/goreview/app/deckModel';
import {DEFAULT_PREFERENCES} from '../../packages/goreview/app/state';
import {itemMarked} from '../../packages/goreview/app/events';
import {candidate,defaultService,destroyRigs,knowledgeRow,makeRig,queued,seed,until,unitOf} from './helpers';

afterEach(destroyRigs);
async function setup(){
 const service=defaultService(),u=unitOf('zog');
 service.candidates.set('L1-e1',[candidate('zog',.9)]);
 service.knowledge.set('L1',[{...knowledgeRow('L1',u,'sq',{}),level:'recognized'}]);
 const rig=await makeRig({service,signedIn:true}),model=(await loadReviewModel(rig.app.ctx))!;
 const {plan}=await planCurrentDeck(rig.app.ctx,model,new Set());
 expect(plan.items).toHaveLength(1);
 return {rig,model,plan,u};
}
const answer={choice:'bird',hinted:false,assistance:[]};
describe('Phase One application boundary audit',()=>{
 it('does not present or admit a stale automatic plan after the budget becomes zero',async()=>{
  const {rig,model,plan}=await setup();
  await rig.app.ctx.state.setPrefs('L1',{...DEFAULT_PREFERENCES('sq'),maxNew:0,dailyNewLimit:0});
  const started=await beginSession(rig.app.ctx,model,{plan});expect(started.ok).toBe(true);
  if(!started.ok)return;
  expect(await started.run.driver.current()).toBeFalsy();expect(await queued(rig)).toEqual([]);
 });
 it('rechecks controls before recording an already displayed answer',async()=>{
  const {rig,model,plan}=await setup(),ctx=rig.app.ctx;
  const started=await beginSession(ctx,model,{plan});if(!started.ok)throw Error(started.message);
  expect(await started.run.driver.current()).toBeTruthy();
  await ctx.state.setPrefs('L1',{...DEFAULT_PREFERENCES('sq'),maxNew:0,dailyNewLimit:0});
  await expect(started.run.driver.answer(answer)).rejects.toThrow(/budget/i);
  expect(await queued(rig)).toEqual([]);expect(started.run.driver.state().index).toBe(0);
 });
 it('refreshes relevant admission evidence and respects a newly synchronized learner mark',async()=>{
  const {rig,model,plan,u}=await setup(),ctx=rig.app.ctx;
  const started=await beginSession(ctx,model,{plan});if(!started.ok)throw Error(started.message);
  expect(await started.run.driver.current()).toBeTruthy();
  const ectx=(await ctx.eventContext())!;
  await seed(rig,[itemMarked(ectx,'remote-new',u,'new')]);
  await expect(started.run.driver.answer(answer)).rejects.toThrow(/new|admission|understood/i);
  expect(await queued(rig)).toEqual([]);
 });
 it('records selected fresh vocabulary once, preserves its FSRS state on reload, and excludes it from automatic admission accounting',async()=>{
  const {rig,model,u}=await setup(),ctx=rig.app.ctx;
  await ctx.state.setPrefs('L1',{...DEFAULT_PREFERENCES('sq'),maxNew:0,dailyNewLimit:0});
  await addToDeck(ctx,model.identity,{unitId:u,unitKind:'lemma',dimension:'written-recognition',family:'written-recognition'});
  const selected=await planSelectedPractice(ctx,{...model,prefs:await ctx.state.getPrefs('L1','sq')});
  expect(selected.items[0].intent?.kind).toBe('explicit');
  const started=await beginSession(ctx,model,{plan:selected});if(!started.ok)throw Error(started.message);
  await started.run.driver.answer(answer);
  const events=await ctx.events('sq');expect(events.map(e=>e.kind)).toEqual(['CardAdded','CardReviewed']);
  expect(events[1].payload.practiceIntent).toMatchObject({kind:'explicit'});
  const reloaded=(await loadReviewModel(ctx))!;
  expect(reloaded.deck).toHaveLength(1);expect(reloaded.deck[0].schedule.reps).toBe(1);
  expect(Date.parse(reloaded.deck[0].schedule.due)).toBeGreaterThan(Date.parse(events[1].at));
 });
 it('persists Suspend on a fresh prompt as a creation and control, with no invented review',async()=>{
  const {rig,model,u}=await setup(),ctx=rig.app.ctx;
  await addToDeck(ctx,model.identity,{unitId:u,unitKind:'lemma',dimension:'written-recognition',family:'written-recognition'});
  const started=await beginSession(ctx,model,{plan:await planSelectedPractice(ctx,model)});if(!started.ok)throw Error(started.message);
  ctx.run.active=started.run;await rig.go('review/session');rig.q('#suspend').click();
  await until(()=>!!rig.root.querySelector('#summary'),'suspended summary');
  expect((await queued(rig)).map(e=>e.kind)).toEqual(['CardAdded','CardRemoved']);
  expect((await loadReviewModel(ctx))!.deck[0].status).toBe('suspended');
  expect((await planSelectedPractice(ctx,(await loadReviewModel(ctx))!)).items).toEqual([]);
 });
 it('keeps a fresh prompt displayed when its control event is refused',async()=>{
  const {rig,model,plan}=await setup(),ctx=rig.app.ctx;
  const started=await beginSession(ctx,model,{plan});if(!started.ok)throw Error(started.message);
  ctx.run.active=started.run;await rig.go('review/session');
  const data=(await ctx.data())!;data.queue.enqueue=async()=>({ok:false,reason:'invalid',issues:[{path:'x',message:'refused'}]});
  rig.q('#suspend').click();await until(()=>!!rig.root.querySelector('#session-status')?.textContent?.includes('could not be saved'),'control error');
  expect(rig.root.querySelector('#session .exercise')).not.toBeNull();expect(started.run.driver.state().index).toBe(0);
 });
 it('rechecks a pending automatic session after reload when the budget has changed',async()=>{
  const {rig,model,plan}=await setup(),ctx=rig.app.ctx;
  const started=await beginSession(ctx,model,{plan});if(!started.ok)throw Error(started.message);
  await started.run.driver.current();const id=started.run.driver.state().sessionId;
  await ctx.state.setPrefs('L1',{...DEFAULT_PREFERENCES('sq'),maxNew:0,dailyNewLimit:0});
  const resumed=await resumeSession(ctx,id);if(!resumed.ok)throw Error(resumed.message);
  expect(await resumed.run.driver.current()).toBeFalsy();expect(await queued(rig)).toEqual([]);
 });
});

it.each(['ignore','invalidation'] as const)('blocks a synchronized %s on a fresh automatic prompt',async action=>{
 const {rig,model,plan,u}=await setup(),ctx=rig.app.ctx;
 const started=await beginSession(ctx,model,{plan});if(!started.ok)throw Error(started.message);
 await started.run.driver.current();const ectx=(await ctx.eventContext())!;
 const mark=itemMarked(ectx,'remote-control',u,'ignore');
 if(action==='invalidation'){mark.kind='ReviewItemInvalidated';mark.subject.cardId=plan.items[0].item.itemId;mark.payload={reason:'analysis-invalidated',cardId:plan.items[0].item.itemId};}
 await seed(rig,[mark]);
 await expect(started.run.driver.answer(answer)).rejects.toThrow(/dismissed|invalidated/);
 expect(await queued(rig)).toEqual([]);expect(started.run.driver.state().index).toBe(0);
});
it('cannot apply a stale displayed response to the following eligible card',async()=>{
 const {rig,model,plan}=await setup(),ctx=rig.app.ctx;
 plan.items.push({...plan.items[0],item:{...plan.items[0].item,itemId:'card:written-recognition:'+unitOf('mace'),unitId:unitOf('mace')},intent:{kind:'explicit',reason:'selected-vocabulary',requestedAt:model.now}});
 const started=await beginSession(ctx,model,{plan});if(!started.ok)throw Error(started.message);
 await started.run.driver.current();await ctx.state.updatePrefs('L1','sq',{maxNew:0,dailyNewLimit:0});
 await expect(started.run.driver.answer(answer)).rejects.toThrow(/budget/);
 expect(started.run.driver.state().index).toBe(0);expect(await queued(rig)).toEqual([]);
});
