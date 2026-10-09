// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FakeServer, makeClock, makeDevice, makeEvent, mulberry32 } from './helpers';

/**
 * For a random interleaving of enqueues, pushes, pulls, failures, lost acks and offline periods over two devices, the
 * union of the server's events equals the union of both devices' enqueued events, each exactly once, and after healing
 * every device's local log holds that union too.
 */
describe('sync property: union of events', () => {
  for (let run = 0; run < 50; run++) {
    it(`seed ${run}`, async () => {
      const rnd = mulberry32(1000 + run);
      const clock = makeClock(); const server = new FakeServer(clock);
      const devices = [makeDevice('phone', server, clock, { random: rnd }), makeDevice('laptop', server, clock, { random: rnd })];
      const enqueued = new Set<string>();

      for (let step = 0; step < 60; step++) {
        const d = devices[Math.floor(rnd() * 2)];
        clock.advance(Math.floor(rnd() * 3000) - 500); // the clock sometimes steps back
        const op = rnd();
        if (op < 0.4) {
          const e = makeEvent(d.id, clock, {}, rnd);
          const r = await d.queue.enqueue(e);
          expect(r.ok).toBe(true);
          enqueued.add(e.id);
        } else if (op < 0.6) await d.client.push();
        else if (op < 0.75) await d.client.pull();
        else if (op < 0.85) await d.client.syncOnce({ force: true });
        else if (op < 0.91) server.failNext += 1 + Math.floor(rnd() * 2);
        else if (op < 0.95) server.lostAckNext += 1;
        else d.client.setOnline(rnd() < 0.5);
      }

      // heal: network up, devices online, no pending faults; sync until quiet
      server.failNext = 0; server.lostAckNext = 0;
      for (const d of devices) d.client.setOnline(true);
      for (let round = 0; round < 3; round++) for (const d of devices) {
        clock.advance(10 * 60_000);
        expect((await d.client.syncOnce({ force: true })).ok).toBe(true);
      }

      expect(new Set(server.events.keys())).toEqual(enqueued);
      expect(server.events.size).toBe(enqueued.size);
      for (const d of devices) {
        expect(await d.queue.size()).toBe(0);
        expect(new Set(d.local.events.keys())).toEqual(enqueued);
        expect((await d.client.status()).rejected).toBe(0);
      }
    });
  }
});
