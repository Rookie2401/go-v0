// @vitest-environment jsdom
// Audit round (PLAN7 F1): Settings → Speech never says "Real speech is available" unless `realSpeech === true`, and tells apart
// real speech / placeholder playback in preview / nothing. Uses the harness fake GoListen with scripted availability.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProviderAvailability } from '../../src/core';
import { useApp } from '../../src/ui/context';
import { AppRoutes, Shell } from '../../src/ui/App';
import { getPref } from '../../src/ui/prefs';
import { SPEECH_SETUP_HINT } from '../../src/ui/pages/settings/SpeechSection';
import { button, byLabel, check, click, flush, makeHarness, q } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const app = () => <Shell><AppRoutes /></Shell>;
const open = async () => { mounted = await h.mount(app(), { router: '/settings' }); };
const section = () => byLabel(mounted!.container, 'Speech');
const line = () => q(section(), '[data-testid="speech-availability"]')!;

const REAL: ProviderAvailability = { available: true, realSpeech: true, detail: 'azure-speech' };
const NOTHING: ProviderAvailability = { available: false, realSpeech: false, reason: 'no-provider', realSpeechReason: 'no-provider', detail: 'no speech provider is registered' };
const FIXTURE_ONLY: ProviderAvailability = {
  available: true, reason: 'development-fixture', detail: 'fixture: not speech, development only',
  realSpeech: false, realSpeechReason: 'missing-credentials', realSpeechDetail: SPEECH_SETUP_HINT,
};
const MISSING: ProviderAvailability = { available: false, reason: 'missing-credentials', detail: SPEECH_SETUP_HINT };

describe('Settings → Speech: three truthful states', () => {
  it('real speech: says so (and only then)', async () => {
    h.listen.availability.mockImplementation(async () => REAL);
    await open();
    expect(line().textContent).toBe('Real speech is available.');
    expect(line().getAttribute('data-state')).toBe('real');
    expect(line().getAttribute('data-available')).toBe('yes');
  });

  it('preview with only the fixture: placeholder sound, real speech unavailable with the reason, and the configuration guidance stays beside it', async () => {
    h.listen.availability.mockImplementation(async () => FIXTURE_ONLY);
    h.controls.speechProxyStatus.current = MISSING;
    await open();
    const text = line().textContent!;
    expect(text).not.toContain('Real speech is available');
    expect(text).toContain('Placeholder sound is available');
    expect(text).toContain('not speech');
    expect(text).toContain('Real speech is not available: the speech provider has no working key');
    expect(text).toContain(SPEECH_SETUP_HINT);
    expect(text).toContain('never counts');
    expect(line().getAttribute('data-state')).toBe('placeholder');
    expect(line().getAttribute('data-available')).toBe('no'); // "available" on this line means REAL speech
    // the service's own instruction is unchanged beside it
    expect(q(section(), '[data-testid="speech-service"]')!.textContent).toContain(SPEECH_SETUP_HINT);
  });

  it('nothing available: as before', async () => {
    h.listen.availability.mockImplementation(async () => NOTHING);
    await open();
    expect(line().getAttribute('data-state')).toBe('none');
    expect(line().textContent).toContain('Real speech is not available: no speech provider is configured');
    expect(line().textContent).not.toContain('Placeholder');
  });

  it('an answer that does not say realSpeech is never shown as real speech', async () => {
    h.listen.availability.mockImplementation(async () => ({ available: true }));
    await open();
    expect(line().textContent).not.toContain('Real speech is available');
  });

  it('the voice card and the voice table keep their "not speech" / "placeholder sound" labels in the placeholder state', async () => {
    await h.store.voices.put({ id: 'es-HN:fixture:default', lang: 'es', providerId: 'fixture', voiceId: 'fixture-voice', requestedLocale: 'es-HN', actualLocale: 'es-419', approved: false, reviewStatus: 'unreviewed', isSpeech: false });
    h.listen.availability.mockImplementation(async () => FIXTURE_ONLY);
    await open();
    expect(q(section(), '[data-testid="voice-card"]')!.textContent).toContain('fixture audio — not speech');
    expect(byLabel(section(), 'Voices').textContent).toContain('placeholder sound');
  });
});

describe('Settings → Speech: every change of state re-reads availability', () => {
  it('entering and leaving preview mode', async () => {
    h.listen.availability.mockImplementation(async () => (getPref('preview') ? FIXTURE_ONLY : NOTHING));
    await open();
    expect(line().getAttribute('data-state')).toBe('none');
    const preview = byLabel<HTMLInputElement>(mounted!.container, 'Preview unreviewed content');
    await check(preview, true);
    await flush();
    expect(line().getAttribute('data-state')).toBe('placeholder');
    expect(line().textContent).not.toContain('Real speech is available');
    await check(preview, false);
    await flush();
    expect(line().getAttribute('data-state')).toBe('none');
  });

  it('switching the course', async () => {
    await h.store.users.put({ id: 'u2', displayName: 'Second', courseId: 'india-hi', createdAt: '2026-01-02T00:00:00.000Z' });
    let current: ProviderAvailability = NOTHING;
    h.listen.availability.mockImplementation(async () => current);
    let api: ReturnType<typeof useApp> | undefined;
    const Probe = () => { api = useApp(); return null; };
    mounted = await h.mount(<><Probe />{app()}</>, { router: '/settings' });
    expect(line().getAttribute('data-state')).toBe('none');
    current = REAL; // what the other course's providers answer
    await act(async () => { await api!.selectUser('u2'); });
    await flush();
    expect(api!.course.id).toBe('india-hi');
    expect(line().getAttribute('data-state')).toBe('real');
  });

  it('"Check again"', async () => {
    let current: ProviderAvailability = NOTHING;
    h.listen.availability.mockImplementation(async () => current);
    h.controls.speechProxyStatus.current = MISSING;
    h.controls.speech.recheck.mockImplementation(async () => { current = REAL; return { available: true, detail: 'azure-speech' }; });
    await open();
    expect(line().getAttribute('data-state')).toBe('none');
    await click(button(section(), 'Check again'));
    expect(h.controls.speech.recheck).toHaveBeenCalledTimes(1);
    expect(line().getAttribute('data-state')).toBe('real');
    expect(line().textContent).toBe('Real speech is available.');
  });
});
