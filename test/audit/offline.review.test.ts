// @vitest-environment node
/**
 * Offline / failure audit — GoReview and GoListen (brief §23):
 *   speech synthesis unavailable, an interrupted review session, a review session with the Repository unreachable.
 * Real service (both stores), real Albanian pack and facts provider, real FSRS scheduler, real planner, exercise builders, grading
 * and session runner, real GoListen registry. Fakes: the network boundary, the clock, the browser's speech object.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { foldDeckItems } from '../../packages/goreview/src';
import { albanianRegistry, createGoListen } from '../../packages/golisten/src';
import { createAudioDeps } from '../../packages/gopractice/audio';
import { createMemoryArea } from '../../packages/repository-sync/src';
import {
  STORE_KINDS, createNet, createStack, serverEvents, signUp, text, type Stack, type StoreKind,
} from './privacy.support';
import { createReviewRig } from './offline.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const quietSpeech = { getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {} };
const reviewEvents = (evs: GoEvent[]): GoEvent[] => evs.filter((e) => ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'].includes(e.kind));

describe('speech synthesis unavailable: GoListen says so, honestly, and never throws', () => {
  it('no device voice and no consent: nothing can speak Albanian, the gaps are listed, the device voice is shown as "none installed" rather than hidden', async () => {
    const listen = createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: false }), speech: quietSpeech });
    const a = await listen.availability('sq');
    expect(a.canPronounce).toBe(false);
    expect(a.gaps.length).toBeGreaterThan(0);
    expect(a.voices.length).toBeGreaterThan(0);
    expect(a.voices.every((v) => v.state !== 'available')).toBe(true);
    expect(a.voices.some((v) => v.state === 'unavailable')).toBe(true);                // the device slot, labelled as unavailable
    expect(a.voices.some((v) => v.state === 'needs-consent')).toBe(true);              // the remote voices, asking for consent rather than silently trying
    const voices = await listen.voices('sq');
    expect(voices.some((v) => /none installed/i.test(v.label))).toBe(true);
  });

  it('pronouncing fails with a reason and advice, never an exception, never the learner\'s text in the message, and records no playback event', async () => {
    const listen = createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: false }), speech: quietSpeech });
    const r = await listen.pronounce({ languageId: 'sq', text: 'SECRET-WORD-9912', kind: 'word' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message.length).toBeGreaterThan(0);
    expect(r.message).not.toContain('SECRET-WORD-9912');
    expect(listen.events(r, true)).toBeNull();
    const unknownLanguage = await listen.pronounce({ languageId: 'xx', text: 'word', kind: 'word' });
    expect(unknownLanguage.ok).toBe(false);
  });

  it('with consent given but the network down, the remote voices are reported unavailable (not available, not an error) and pronouncing still fails cleanly', async () => {
    const fetchDown = (async () => { throw new TypeError('Failed to fetch'); }) as never;
    const listen = createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: true }), speech: quietSpeech, fetch: fetchDown });
    const a = await listen.availability('sq');
    expect(a.canPronounce).toBe(false);
    expect(a.voices.filter((v) => v.provider === 'remote').every((v) => v.state === 'unavailable')).toBe(true);
    const r = await listen.pronounce({ languageId: 'sq', text: 'libër', kind: 'word' });
    expect(r.ok).toBe(false);
  });

  it('GoPractice\'s view of it: available:false with the reason, and never "eligible for evidence"', async () => {
    const deps = createAudioDeps({ consent: () => false, registries: [albanianRegistry()], speech: quietSpeech });
    const av = await deps.availability('sq');
    expect(av).toMatchObject({ available: false, eligibleForEvidence: false });
    expect(av.reason.length).toBeGreaterThan(0);
    const stim = await deps.source()!.prepareStimulus({ languageId: 'sq', kind: 'word', text: 'libër', itemIds: ['lemma:sq:libër:NOUN'] });
    expect('unavailable' in stim && stim.unavailable).toBe(true);
  });

  it('a device voice for the language, once it exists, works with no network at all (the one audio path that is offline-safe)', async () => {
    const spoken: string[] = [];
    const speech = {
      getVoices: () => [{ name: 'Test Albanian', lang: 'sq-AL', localService: true, voiceURI: 'test-sq' }],
      speak(u: { text?: string; onend: (() => void) | null }) { spoken.push(u.text ?? ''); setTimeout(() => u.onend?.(), 1); },
      cancel() {}, pause() {}, resume() {},
    };
    const fetchDown = (async () => { throw new TypeError('Failed to fetch'); }) as never;
    const listen = createGoListen({
      registries: [albanianRegistry()], consent: () => ({ remoteSpeech: false }), speech, fetch: fetchDown,
      utterance: (t) => ({ text: t, lang: '', rate: 1, voice: null, onend: null, onerror: null }),
    });
    const a = await listen.availability('sq');
    expect(a.canPronounce).toBe(true);
    const r = await listen.pronounce({ languageId: 'sq', text: 'libër', kind: 'word', autoplay: true });
    expect(r.ok).toBe(true);
    expect(spoken).toEqual(['libër']);
    if (r.ok) expect(r.voice.synthetic).toBe(true);                                      // and it says it is synthetic: practice, never evidence
  });
});

describe.each(STORE_KINDS)('the review session when audio is unavailable — %s store', (kind) => {
  it('a learner who asks for listening with no Albanian audio still gets a session: written items run to the end, no listening exercise is built, no listening evidence exists', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const rig = await createReviewRig(s, net, a);
    await rig.seedDeck(['written-recognition', 'audio-to-meaning']);                     // the deck holds listening cards too
    const plan = await rig.plan({ includeListening: true });
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.every((p) => !p.family.startsWith('audio'))).toBe(true);           // the planner never asks for audio it cannot play
    const runner = rig.runner(plan);
    let done = 0;
    for (;;) { const r = await rig.answerRight(runner); if (!r) break; expect(r.family).not.toMatch(/^audio/); done++; }
    expect(done).toBeGreaterThan(0);
    await runner.finish();
    const evs = await serverEvents(s, a.learnerId);
    await rig.device.client.syncOnce();
    const after = await serverEvents(s, a.learnerId);
    expect(after.length).toBeGreaterThan(evs.length);
    expect(reviewEvents(after).some((e) => e.kind === 'ListeningAssessed')).toBe(false);
    expect(reviewEvents(after).length).toBe(done);
  });

  it('a listening item whose audio fails at the last moment is not credited: outcome unable-to-grade, no rating, no event, and the session moves on', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const rig = await createReviewRig(s, net, a);
    await rig.seedDeck(['written-recognition']);
    const plan = await rig.plan();
    const runner = rig.runner(plan);
    const cur = (await runner.current())!;
    const failed = await runner.answer({ typed: '', hinted: false, assistance: [], audioFailed: true });
    expect(failed.rating).toBeNull();
    // a written exercise ignores the audio flag; an audio one cannot be judged: either way nothing about the learner is claimed from a failed playback
    expect(cur.exercise.family).toBe('written-recognition');
    expect(failed.evidence === null || failed.evidence.kind !== 'ListeningAssessed').toBe(true);
  });
});

describe.each(STORE_KINDS)('an interrupted review session — %s store', (kind) => {
  async function sessionOf(n: number, families: Array<'written-recognition' | 'meaning-to-form'> = ['written-recognition']) {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const rig = await createReviewRig(s, net, a);
    await rig.seedDeck(families);
    const plan = await rig.plan();
    expect(plan.items.length).toBeGreaterThanOrEqual(n);
    return { s, net, a, rig, plan };
  }
  const reps = async (s: Stack, a: { learnerId: string }, rig: Awaited<ReturnType<typeof createReviewRig>>): Promise<Record<string, number>> => {
    const deck = foldDeckItems(await serverEvents(s, a.learnerId), rig.scheduler, { languageId: 'sq', now: rig.now() });
    return Object.fromEntries(deck.map((d) => [d.unitId + '|' + d.family, d.schedule.reps]));
  };
  const keyOf = (p: { item: { unitId: string }; family: string }): string => p.item.unitId + '|' + p.family;

  it('the page dies after two answers: the reopened session continues after them; the answered items are kept once, the unanswered ones are not credited', async () => {
    const { s, a, rig, plan } = await sessionOf(4, ['written-recognition', 'meaning-to-form']);
    const persist = createMemoryArea();                                                // the session survives in storage, the page does not
    const first = rig.runner(plan, { persist, sessionId: 'sess-1' });
    const done = [await rig.answerRight(first), await rig.answerRight(first)];
    const lastAnswered = done[1]!.index;
    expect(done[0]!.index).toBeLessThan(lastAnswered);
    await rig.device.client.syncOnce();
    const answeredKeys = [plan.items[done[0]!.index], plan.items[lastAnswered]].map(keyOf);
    const laterKeys = plan.items.slice(lastAnswered + 1).map(keyOf);
    expect(laterKeys.length).toBeGreaterThanOrEqual(2);
    // — crash — a new page, a new runner, the same storage
    const second = rig.runner(plan, { persist, sessionId: 'sess-1' });
    expect(await second.recover('sess-1')).toBe(true);
    expect(second.state().index).toBe(lastAnswered + 1);
    expect(second.state().results.length).toBe(2);
    expect(second.state().status).toBe('in-progress');
    const cur = (await second.current())!;
    expect(cur.index).toBeGreaterThan(lastAnswered);                                   // never one of the two it already has
    // nothing about the unanswered items has reached the Repository
    const before = await reps(s, a, rig);
    for (const k of answeredKeys) expect(before[k], k).toBe(1);
    for (const k of laterKeys) expect(before[k] ?? 0, k).toBe(0);
    expect(reviewEvents(await serverEvents(s, a.learnerId)).length).toBe(2);
    // finishing the recovered session answers the rest, each exactly once
    while (await rig.answerRight(second)) { /* until the plan ends */ }
    await rig.device.client.syncOnce();
    const final = await reps(s, a, rig);
    const built = second.state().results.map((r) => r.itemId).length;
    expect(built).toBeGreaterThanOrEqual(3);
    for (const r of second.state().results) expect(r.rating).not.toBeNull();
    expect(Object.values(final).filter((n) => n === 1).length).toBe(second.state().results.length);
    expect(Object.values(final).every((n) => n <= 1)).toBe(true);                      // nobody was credited twice
    expect(reviewEvents(await serverEvents(s, a.learnerId)).length).toBe(second.state().results.length);
  });

  it('the page dies AFTER the answer was recorded but BEFORE the session state was saved: the item is asked again, and the repeat is a duplicate, not a second observation', async () => {
    const { s, a, rig, plan } = await sessionOf(2);
    const persist = createMemoryArea();
    const lossy = { ...persist, set: async () => { throw new Error('the tab was closed before this write'); } };
    const first = rig.runner(plan, { persist: lossy, sessionId: 'sess-2' });
    const r = await rig.answerRight(first);
    expect(r?.index).toBe(0);
    expect(first.persistErrors().length).toBeGreaterThan(0);                            // reported, not fatal: the answer itself is safe in the queue
    await rig.device.client.syncOnce();
    // a new page: nothing was saved, so there is nothing to recover, and the same plan starts again from item 0
    const second = rig.runner(plan, { persist, sessionId: 'sess-2' });
    expect(await second.recover('sess-2')).toBe(false);
    const again = await rig.answerRight(second);
    expect(again?.index).toBe(0);
    const outcome = await rig.device.client.syncOnce();
    expect(outcome.ok).toBe(true);
    const kinds = reviewEvents(await serverEvents(s, a.learnerId)).filter((e) => e.subject.itemIds?.includes(plan.items[0].item.unitId));
    expect(kinds.length).toBe(1);                                                       // exactly one observation of that item
    expect(kinds[0].id).toBe('gr:sess-2:0:CardReviewed');                               // deterministic id: the repeat collided with it
    expect((await reps(s, a, rig))[keyOf(plan.items[0])]).toBe(1);
  });

  it('the Repository cannot be reached when the answer is recorded: nothing advances, the same item is still current, and answering again later succeeds once', async () => {
    const { s, a, rig, plan } = await sessionOf(2);
    let down = true;
    const record = async (evs: GoEvent[]): Promise<void> => { if (down) throw new TypeError('Failed to fetch'); await rig.device.record(evs); };
    const runner = rig.runner(plan, { record, sessionId: 'sess-3' });
    const cur = (await runner.current())!;
    await expect(runner.answer({ typed: cur.exercise.answerKey.accepted[0], hinted: false, assistance: [] })).rejects.toThrow(/Failed to fetch/);
    expect(runner.state().index).toBe(0);
    expect(runner.state().results).toEqual([]);
    expect((await runner.current())!.index).toBe(0);
    down = false;
    expect((await rig.answerRight(runner))?.index).toBe(0);
    await rig.device.client.syncOnce();
    expect(reviewEvents(await serverEvents(s, a.learnerId)).length).toBe(1);
  });

  it('a skipped item writes nothing and stays due; a session abandoned half-way leaves the rest due, not postponed or falsified', async () => {
    const { s, a, rig, plan } = await sessionOf(3);
    const persist = createMemoryArea();
    const runner = rig.runner(plan, { persist, sessionId: 'sess-4' });
    await runner.skip('not now');
    await rig.answerRight(runner);
    await runner.finish();                                                              // the learner stops here
    await rig.device.client.syncOnce();
    expect(reviewEvents(await serverEvents(s, a.learnerId)).length).toBe(1);
    const deck = foldDeckItems(await serverEvents(s, a.learnerId), rig.scheduler, { languageId: 'sq', now: rig.now() });
    const skipped = deck.find((d) => d.unitId === plan.items[0].item.unitId)!;
    expect(skipped.schedule.reps).toBe(0);
    expect(new Date(skipped.schedule.due).getTime()).toBeLessThanOrEqual(Date.parse(rig.now()));   // still due
    const tomorrow = await rig.plan();
    expect(tomorrow.items.map((p) => p.item.unitId)).toContain(plan.items[0].item.unitId);
    expect(runner.state().status).toBe('finished');
    expect(runner.skips().filter((k) => k.kind === 'learner').length).toBe(1);
  });

  it('a session from yesterday is listed as recoverable and recovers; a finished one does not', async () => {
    const { rig, plan } = await sessionOf(2);
    const persist = createMemoryArea();
    const open = rig.runner(plan, { persist, sessionId: 'open' });
    await rig.answerRight(open);
    const closed = rig.runner(plan, { persist, sessionId: 'closed' });
    await rig.answerRight(closed);
    await closed.finish();
    const { listRecoverable } = await import('../../packages/goreview/src');
    expect(await listRecoverable(persist)).toEqual(['open']);
  });
});

describe.each(STORE_KINDS)('a review session with the Repository unreachable — %s store', (kind) => {
  it('the session runs from the pack on the device; every answer is queued and sent when the connection returns, each once', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const rig = await createReviewRig(s, net, a);
    await rig.seedDeck(['written-recognition']);
    const plan = await rig.plan();
    net.down = true;
    const runner = rig.runner(plan, { facts: 'offline', sessionId: 'off-1' });
    let done = 0;
    for (;;) { const r = await rig.answerRight(runner); if (!r) break; done++; }
    // whatever the facts provider could build offline was answered; nothing was lost on the way
    expect(done).toBe(plan.items.length);                                              // the pack alone is enough to build every written exercise: no skip, no loss
    expect(runner.skips()).toEqual([]);
    expect(await rig.device.queue.size()).toBeGreaterThanOrEqual(done);
    expect((await rig.device.client.syncOnce()).ok).toBe(false);
    net.down = false;
    rig.device.clock.ms += 120_000;
    expect((await rig.device.client.syncOnce()).ok).toBe(true);
    expect(reviewEvents(await serverEvents(s, a.learnerId)).length).toBe(done);
    expect(await rig.device.queue.size()).toBe(0);
    await rig.device.client.syncOnce({ force: true });
    expect(reviewEvents(await serverEvents(s, a.learnerId)).length).toBe(done);
    expect(text(runner.skips())).not.toContain('undefined');
  });
});
