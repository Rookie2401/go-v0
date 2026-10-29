// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { default_w } from 'ts-fsrs';
import { createFsrsScheduler } from '../../packages/goreview/src/scheduler/fsrs';
import { activeSchedulerProfile, schedulerProfileSelection, PROFILE_KEY } from '../../packages/goreview/app/profiles';
import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { evidenceFor, ratingFor, buildCardAdded } from '../../packages/goreview/src';
import { DEFAULT_PREFERENCES } from '../../packages/goreview/app/state';
import { ids, reviewed, unitOf } from './helpers';

const preference = (id: string, at: string, value: unknown): GoEvent => ({ id, at, v: CONTRACT_VERSION,
  learnerId: 'L', enrolmentId: 'E', languageId: 'hi', kind: 'PreferenceChanged', subject: {},
  producer: { app: 'gopractice-review', version: '2', deviceId: 'D', surface: 'scheduler-settings' },
  payload: { key: PROFILE_KEY, value, origin: 'explicit' }, evidence: { quality: 'none' } });

describe('explicit shared scheduler profile selection', () => {
  it('does not replay unversioned legacy grades with newly activated parameters or retention', () => {
    const identity = ids('L1', 'sq');
    const events = [buildCardAdded({ ...identity, at: '2026-01-01T10:00:00Z', deviceId: 'D', unitId: unitOf('zog'), unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'learner' }),
      reviewed(identity, 'zog', 'written-recognition', 3, '2026-01-01T10:01:00Z')];
    const engine = createReviewEngine({ builders: [], evidenceFor, ratingFor });
    const before = engine.foldDeck(events, 'sq', DEFAULT_PREFERENCES('sq'), '2026-01-02T10:00:00Z');
    const parameters = [...default_w]; parameters[0] *= 1.1;
    const personal = createFsrsScheduler({ parameters, desiredRetention: 0.95 });
    const activation = { ...preference('personal', '2026-01-02T09:00:00Z', personal.profile), learnerId: 'L1', languageId: 'sq' };
    const after = engine.foldDeck([...events, activation], 'sq', { ...DEFAULT_PREFERENCES('sq'), desiredRetention: 0.95 }, '2026-01-02T10:00:00Z');
    expect(after[0].schedule).toEqual(before[0].schedule);
  });
  it('retains the selected parameters and resets without deleting the original assertion', () => {
    const scheduler = createFsrsScheduler({ parameters: [...default_w], desiredRetention: 0.9 });
    const events = [preference('activate', '2026-01-01T10:00:00Z', scheduler.profile)];
    expect(activeSchedulerProfile(events)?.parameters).toEqual(default_w);
    const original = JSON.stringify(events[0]);
    events.push(preference('reset', '2026-01-02T10:00:00Z', null));
    expect(activeSchedulerProfile(events)).toBeUndefined();
    expect(JSON.stringify(events[0])).toBe(original);
  });

  it('orders actual instants across time-zone offsets and rejects a mismatched profile identity', () => {
    const scheduler = createFsrsScheduler();
    const events = [preference('valid', '2026-01-01T10:00:00+02:00', scheduler.profile),
      preference('reset', '2026-01-01T09:00:00Z', null)];
    expect(activeSchedulerProfile(events)).toBeUndefined();
    expect(activeSchedulerProfile([preference('invalid', '2026-01-01T10:00:00Z', { ...scheduler.profile, parametersVersion: 'forged' })])).toBeUndefined();
  });
});


describe('Phase One profile admission safeguards', () => {
  it('distinguishes unsupported and missing profile assertions from an explicit reset', () => {
    const supported=createFsrsScheduler().profile!;
    expect(schedulerProfileSelection([preference('bad','2026-01-01T10:00:00Z',{...supported,algorithm:'fsrs@999'})]).error).toMatch(/unsupported/i);
    expect(schedulerProfileSelection([preference('missing','2026-01-01T10:00:00Z',undefined)]).error).toMatch(/no settings/i);
    expect(schedulerProfileSelection([preference('reset','2026-01-01T10:00:00Z',null)])).toEqual({reset:true});
  });
  it('preserves validated full settings and diagnoses conflicting duplicate selection IDs', () => {
    const scheduler=createFsrsScheduler({desiredRetention:0.95,maximumInterval:999,enableShortTerm:true,learningSteps:['2m','15m'],relearningSteps:['20m']});
    const event=preference('choice','2026-01-01T10:00:00Z',scheduler.profile);
    const selected=schedulerProfileSelection([event,event]);
    expect(selected.error).toBeUndefined();
    expect(selected.profile?.parametersVersion).toEqual(scheduler.profile?.parametersVersion);
    expect(selected.profile).toMatchObject({maximumInterval:999,enableShortTerm:true,learningSteps:['2m','15m'],relearningSteps:['20m']});
    expect(selected.profile?.desiredRetention).toBe(0.95);
    expect(schedulerProfileSelection([event,{...event,payload:{...event.payload,value:null}}]).error).toMatch(/conflicting/);
  });
});

it('the application adapter uses every validated active setting rather than reconstructing a partial profile',()=>{
 const selected=createFsrsScheduler({desiredRetention:.96,maximumInterval:27,enableShortTerm:true,learningSteps:['3m','25m'],relearningSteps:['35m']});
 const engine=createReviewEngine({builders:[],evidenceFor,ratingFor});
 expect(engine.scheduler(DEFAULT_PREFERENCES('sq'),{...selected.profile!,priorityPolicyVersion:'knowability-priority@2'}).profile).toEqual(selected.profile);
 expect(()=>engine.scheduler(DEFAULT_PREFERENCES('sq'),{...selected.profile!,algorithm:'future',priorityPolicyVersion:'knowability-priority@2'})).toThrow(/unsupported/);
});

it('accepts semantic profile redelivery with reordered properties and server-added metadata',()=>{
 const profile=createFsrsScheduler().profile!,event=preference('redelivered','2026-01-01T10:00:00Z',profile);
 const copy={...event,seq:5,recordedAt:'2026-01-02T10:00:00Z',payload:{...event.payload,value:Object.fromEntries(Object.entries(profile).reverse())}};
 expect(schedulerProfileSelection([event,copy]).error).toBeUndefined();
 expect(schedulerProfileSelection([event,copy]).profile?.parametersVersion).toBe(profile.parametersVersion);
});
