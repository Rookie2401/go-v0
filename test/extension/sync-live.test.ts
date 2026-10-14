// @vitest-environment node
/**
 * The live second device: an event the learner makes while signed in on the desktop is pushed within one debounce (2 s), and a phone that is
 * holding POST /sync/wait against the real service handler hears of it at once. Covers both SelectionLookedUp and ItemMarked.
 */
import { describe, expect, it } from 'vitest';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { SYNC_DEBOUNCE_MS } from '../../packages/golearn-extension/src/background/sync';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { PENDING_IDENTITY, buildMarkEvent } from '../../packages/golearn-extension/src/store';
import { PASSWORD, createRig, pendingEvent } from './rig';
import { raw } from '../repository/service/fakes';

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const markEvent = () => {
  const word = 'libër';
  const at = SENTENCE.indexOf(word);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence: SENTENCE, selStart: at, selEnd: at + word.length } });
  return buildMarkEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY }, version: '0.1.0', sessionId: 's-live', now: new Date('2026-10-08T10:00:00.000Z') }, 'known');
};

async function phoneToken(rig: ReturnType<typeof createRig>): Promise<string> {
  const s = await rig.h.api().createSession({ email: 'ana@example.com', password: PASSWORD, deviceId: 'phone-1', platform: 'ios' });
  if (!s.ok) throw new Error('phone sign-in failed');
  return s.data.token;
}

describe('an event queued while signed in reaches a waiting phone', () => {
  for (const [name, make] of [['SelectionLookedUp', () => pendingEvent('libër')], ['ItemMarked', markEvent]] as const) {
    it(`${name}: pushed within one 2 s debounce, and the phone wait resolves with changed:true`, async () => {
      expect(SYNC_DEBOUNCE_MS).toBe(2000);
      const rig = createRig();
      const who = await rig.signUp();
      await rig.connect();
      await rig.fireTimers(); // the sign-in's own round
      const token = await phoneToken(rig);
      const status = await raw(rig.h, 'GET', '/sync/status', { token });
      expect(status.status).toBe(200);
      let result: { status: number; body: Record<string, any> } | undefined;
      const waiting = raw(rig.h, 'POST', '/sync/wait', { token, body: { since: status.body.cursor, timeoutMs: 25_000 } }).then((r) => { result = r; });
      await new Promise((r) => setTimeout(r, 20));
      expect(result).toBeUndefined(); // held

      rig.timers.length = 0;
      expect((await rig.content({ type: MSG.record, event: make() })).ok).not.toBe(false);
      const live = rig.timers.filter((t) => !t.cleared);
      expect(live).toHaveLength(1);
      expect(live[0].ms).toBe(SYNC_DEBOUNCE_MS); // the push is scheduled, not yet made
      await new Promise((r) => setTimeout(r, 20));
      expect(result).toBeUndefined();

      await rig.fireTimers(); // the debounce elapses
      await waiting;
      expect(result?.status).toBe(200);
      expect(result?.body).toMatchObject({ changed: true });
      expect(Number(result?.body.cursor)).toBeGreaterThan(Number(status.body.cursor));
      expect(await rig.h.store.list({ learnerId: who.learnerId, kinds: [name] })).toHaveLength(1);
    });
  }
});
