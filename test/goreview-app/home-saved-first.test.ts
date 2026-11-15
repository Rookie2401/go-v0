// @vitest-environment jsdom
/**
 * The home opens from this device's saved deck (2026-11-08, the owner: "the loading times are far too long"). Measured signed in, on a phone-like
 * connection with 1,500 lookups: every visit to the home rebuilt the deck from the service (candidates, knowledge, the whole vocabulary page by
 * page, exercise checks) before showing anything, 18-70 s. Now the last complete prepared deck is painted at once, and the live rebuild follows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositoryApi } from '../../packages/repository-service/src/api';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { candidate, destroyRigs, makeRig, until } from './helpers';

afterEach(() => { destroyRigs(); });

describe('the home with a saved deck on this device', () => {
  it('paints the saved deck while the service has not answered, then takes the live one when it comes', async () => {
    const rig = await makeRig({ signedIn: true });
    rig.service.candidates.set('e1', [candidate('lemma:sq:mace:NOUN', 0.9)]);
    await rig.go('settings');
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#start-session'), 'the first, live home (it saves the prepared deck)');
    const first = rig.q('#current-deck').textContent;

    // from now on the service does not answer the deck's questions until released
    const base = (await rig.app.ctx.api()).api as unknown as Record<string, unknown>;
    const held: Array<() => void> = [];
    let asked = 0;
    const api = new Proxy(base, { get(target, key) {
      const value = Reflect.get(target, key) as unknown;
      if (key !== 'candidates' || typeof value !== 'function') return value;
      return (...args: unknown[]) => { asked++; return new Promise((resolve) => { held.push(() => resolve((value as (...a: unknown[]) => unknown).apply(target, args))); }); };
    } }) as unknown as RepositoryApi;
    const original = rig.app.ctx.api;
    rig.app.ctx.api = async () => ({ ...(await original()), api });
    forgetPaintedHome(rig.app.ctx);
    await rig.go('settings');
    void rig.app.go('review');
    await until(() => !!rig.root.querySelector('#start-session'), 'the saved deck painted without the service');
    expect(rig.q('#current-deck').textContent).toBe(first);
    expect(rig.root.querySelector('#candidate-freshness')).toBeNull(); // no "Using saved word data" while the live deck is being asked for
    await until(() => asked > 0, 'the live rebuild to have asked the service');

    for (const release of held.splice(0)) release();
    await until(() => !rig.root.querySelector('.go-loading') && held.length === 0, 'the live rebuild to finish');
    expect(rig.q('#current-deck').textContent).toBe(first);
  });

  it('without a saved deck (a first visit on this device) it waits for the live one, as before', async () => {
    const rig = await makeRig({ signedIn: true });
    rig.service.candidates.set('e1', [candidate('lemma:sq:mace:NOUN', 0.9)]);
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#start-session'), 'the live home');
  });
});
