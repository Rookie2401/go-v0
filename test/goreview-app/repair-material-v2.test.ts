// @vitest-environment jsdom
import {describe,expect,it} from 'vitest';
import {createReviewEngine} from '../../packages/goreview/app/engine';
import {buildCardAdded,evidenceFor,ratingFor} from '../../packages/goreview/src';
import type {RepositoryApi} from '../../packages/repository-service/src/api';
import {DEFAULT_PREFERENCES} from '../../packages/goreview/app/state';
import {FAKE_BUILDERS,fakeFacts,fakeStimulus,ids,unitOf} from './helpers';
const now='2026-10-27T10:00:00Z',api={} as RepositoryApi;
function setup(status?:'invalidated'|'conflicted'){
 let builds=0,releases=0;
 const builders=FAKE_BUILDERS.map(b=>({...b,build:async(...args:Parameters<typeof b.build>)=>{builds++;return b.build(...args);}}));
 const engine=createReviewEngine({builders,evidenceFor,ratingFor,factsFor:()=>({factsFor:async(u,l)=>{const f=(await fakeFacts.factsFor(u,l))!;return {...f,...(status?{status}:{})};}})});
 const event=buildCardAdded({...ids(),deviceId:'D',at:now,unitId:unitOf('zog'),unitKind:'lexeme',dimension:'written-recognition',family:'written-recognition',addedBy:'intake'});
 const item=engine.foldDeck([event],'sq',DEFAULT_PREFERENCES('sq'),now)[0];
 const source={prepareStimulus:async()=>fakeStimulus(item.unitId),playbackOf:()=>{throw Error('no playback requested');},scoringMetadata:()=>({voice:'synthetic' as const,hinted:false,replays:0,eligibleForEvidence:false}),releaseStimulus:()=>{releases++;}};
 return{engine,item,source,builds:()=>builds,releases:()=>releases};
}
describe('configured study and repair material boundary',()=>{
 it('uses the configured builder and facts provider and never records progress',async()=>{
  const f=setup(),material=await f.engine.repairMaterial!({item:f.item,api,now});
  expect('unavailable' in material).toBe(false);expect(f.builds()).toBe(1);
  if('unavailable' in material)throw Error(material.unavailable);
  expect(material.exercise.family).toBe('written-recognition');expect(material.facts.glosses).toContain('bird');
  material.release();material.release();expect(f.releases()).toBe(0);
 });
 it.each(['invalidated','conflicted'] as const)('does not build study from %s current facts',async status=>{
  const f=setup(status);expect(await f.engine.repairMaterial!({item:f.item,api,now})).toMatchObject({unavailable:expect.stringContaining('current facts')});expect(f.builds()).toBe(0);
 });
 it('releases prepared audio once without playing it',async()=>{
  const f=setup(),item={...f.item,dimension:'auditory-recognition' as const,family:'audio-to-meaning' as const};
  const material=await f.engine.repairMaterial!({item,api,now,assessment:f.source});
  if('unavailable' in material)throw Error(material.unavailable);
  material.release();material.release();expect(f.releases()).toBe(1);
 });
 it('refuses facts returned for a different unit before building',async()=>{
  const f=setup();let builds=0;
  const engine=createReviewEngine({builders:FAKE_BUILDERS.map(b=>({...b,build:async(...args:Parameters<typeof b.build>)=>{builds++;return b.build(...args);}})),evidenceFor,ratingFor,
   factsFor:()=>({factsFor:async()=>fakeFacts.factsFor(unitOf('mace'),'sq')})});
  expect(await engine.repairMaterial!({item:f.item,api,now})).toMatchObject({unavailable:expect.stringContaining('another unit')});
  expect(builds).toBe(0);
 });
 it('uses the card variety when rebuilding study facts and the target',async()=>{
  const f=setup();let variety:string|undefined,targetVariety:string|undefined;
  const engine=createReviewEngine({builders:FAKE_BUILDERS.map(b=>({...b,build:async(...args:Parameters<typeof b.build>)=>{
   targetVariety=args[0].varietyId;return b.build(...args);
  }})),evidenceFor,ratingFor,factsFor:()=>({factsFor:async(u,l,v)=>{variety=v;return fakeFacts.factsFor(u,l,v);}})});
  const material=await engine.repairMaterial!({item:{...f.item,varietyId:'sq-AL'},api,now});
  if('unavailable' in material)throw Error(material.unavailable);
  expect(variety).toBe('sq-AL');expect(targetVariety).toBe('sq-AL');material.release();
 });
 it('refuses a valid exercise for the wrong target and releases its audio',async()=>{
  const f=setup(),item={...f.item,dimension:'auditory-recognition' as const,family:'audio-to-meaning' as const};
  const engine=createReviewEngine({builders:FAKE_BUILDERS.map(b=>({...b,build:async(...args:Parameters<typeof b.build>)=>{
   const exercise=await b.build(...args);return 'unavailable' in exercise?exercise:{...exercise,target:{...exercise.target,unitId:unitOf('mace')}};
  }})),evidenceFor,ratingFor,factsFor:()=>fakeFacts});
  expect(await engine.repairMaterial!({item,api,now,assessment:f.source})).toMatchObject({unavailable:expect.stringContaining('does not match')});
  expect(f.releases()).toBe(1);
 });
});
