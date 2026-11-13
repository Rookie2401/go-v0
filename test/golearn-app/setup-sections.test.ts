// @vitest-environment jsdom
/**
 * The Languages page and the Audio page (redesigned 2026-11-11, docs/golearn/DESIGN-SYSTEM.md). From 2026-10-28 the main setup page was two
 * closed disclosures, LANGUAGE and AUDIO: once a language was downloaded the page showed two closed headings and nothing of what the learner
 * read in, and two screens of speech-backend notes sat under the language list. Now the Languages page is open (where the learner stands,
 * then the languages) and the guide to hearing the words is its own page under Settings, its four parts each a section that opens.
 */
import { describe, expect, it } from 'vitest';
import { downloadLanguage, makeRig as baseRig, until, type RigOptions } from './helpers';

const makeRig = (o: RigOptions = {}) => baseRig({ startRoute: 'languages', ...o });

describe('the Languages page', () => {
  it('has nothing behind a closed section: where the learner stands, then the languages, then two quiet links', async () => {
    const rig = await makeRig();
    expect(rig.q('#screen h1').textContent).toBe('Languages');
    expect(rig.root.querySelector('details.disclosure, #audio, #audio-guide')).toBeNull();
    const status = rig.q('#languages');
    expect(status.tagName).toBe('SECTION');
    expect(status.contains(rig.q('#next-steps'))).toBe(true);
    expect(status.contains(rig.q('#account-line'))).toBe(true);
    // the status comes before the list, the list before the foot
    const body = [...rig.q('#screen .body').children].map((x) => x.id);
    expect(body).toEqual(['languages', 'language-list', 'to-help']);
    expect(rig.q('#language-list').contains(rig.q('#language-cards'))).toBe(true);
    expect([...rig.root.querySelectorAll<HTMLAnchorElement>('#to-help a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Help', '#/help'], ['How GoLearn reads pages', '#/reader']]);
  });

  it('with a language downloaded it still shows everything: the language is named at the top and stands under Your languages', async () => {
    const rig = await makeRig({ extension: true });
    await downloadLanguage(rig, 'sq');
    await rig.go('settings');
    await rig.go('languages');
    await until(() => rig.root.querySelector('#next-note'));
    expect(rig.q('#next-note .lede').textContent).toContain('Albanian is ready');
    expect(rig.q('#my-languages').hidden).toBe(false);
    expect(rig.q('#language-cards').firstElementChild?.id).toBe('my-languages');
    expect(rig.q('#my-languages').nextElementSibling?.getAttribute('data-language')).toBe('sq');
    // ready is said by where the row stands; the words stay for a screen reader, and “Reading now” is in sight
    expect(rig.q('[data-language="sq"] .dl-state').classList.contains('sr')).toBe(true);
    expect(rig.q('[data-language="sq"] .mine .tag').textContent).toBe('Reading now');
  });
});

describe('the Audio page, under Settings', () => {
  it('is reached from Settings and leads back to it; what this device can speak is said first, then four parts that open, the first open', async () => {
    const rig = await makeRig({ extension: true });
    await rig.go('settings');
    expect(rig.q<HTMLAnchorElement>('#reading-links li[data-route="audio"] a').getAttribute('href')).toBe('#/audio');
    await rig.go('audio');
    expect(rig.q('#screen h1').textContent).toBe('Audio');
    expect(rig.q<HTMLAnchorElement>('.crumb a').getAttribute('href')).toBe('#/settings');
    const guide = rig.q('#audio-guide');
    const folds = [...guide.querySelectorAll<HTMLDetailsElement>(':scope > details.fold')];
    expect(folds.map((d) => d.querySelector(':scope > summary > h2')!.textContent)).toEqual(['1. Voices on this device (free, nothing leaves the device)', '2. Remote voices through your account', '3. Optional: your own speech backend', '4. ElevenLabs']);
    expect(folds.map((d) => d.open)).toEqual([true, false, false, false]);
    // nothing of the guide is left outside a part except its opening lines
    expect([...guide.children].filter((x) => x.tagName !== 'DETAILS').every((x) => x.tagName === 'P')).toBe(true);
  });

  it('the guide leads with device voices, then account speech, a backend of your own and ElevenLabs', async () => {
    const rig = await makeRig({ extension: true });
    await rig.go('audio');
    const guide = rig.q('#audio-guide');
    const text = guide.textContent ?? '';
    const headings = [...guide.querySelectorAll('summary > h2')].map((x) => x.textContent);
    expect(headings).toEqual(['1. Voices on this device (free, nothing leaves the device)', '2. Remote voices through your account', '3. Optional: your own speech backend', '4. ElevenLabs']);
    // device voices: the four platforms and the exact-match rule, the tags from voiceTags.ts
    for (const os of ['Windows 11', 'macOS', 'Android', 'iPhone and iPad']) expect(text).toContain(os);
    expect(text).toMatch(/matches exactly/);
    expect(guide.querySelector('table')!.textContent).toContain('sq-AL, sq');
    expect(guide.querySelector('table')!.textContent).toContain('la, la-VA, it-IT, it');
    // Account speech is managed, explicit, and protected by exact-origin access and the two privacy switches.
    expect(text).toContain('The service manages the Azure connection');
    expect(text).toContain('Allow account speech access');
    expect(text).toContain('exact Repository service origin');
    // Optional self-operated backend setup remains available; no Azure key belongs in GoLearn.
    expect(text).toContain('never the Azure key');
    expect(text).toContain('npm run speech:serve');
    expect(text).toContain('/api/speech');
    expect(text).toContain('Use only voices that run on this device');
    expect(text).toContain('Allow a remote speech provider to say words for me');
    expect([...guide.querySelectorAll('a[href="#/privacy"]')].length).toBeGreaterThanOrEqual(3);
    expect(text).not.toMatch(/AZURE_SPEECH_KEY=|[0-9a-f]{32}/); // no key, no example token
    // ElevenLabs: not available, said plainly, with what would make it work
    expect(text).toContain('Not available yet');
    expect(text).toMatch(/ElevenLabs[\s\S]*same three calls \(status, voices, synthesize\)/);
    // the voices line is computed from the browser (jsdom has no speechSynthesis)
    expect(text).toContain('This browser reports no voices to GoLearn');
    expect(text).not.toMatch(/team|leader/i);
  });

  it('the hosted (web) page says the speech backend is set in the extension\'s setup page', async () => {
    const rig = await makeRig();
    await rig.go('audio');
    expect(rig.q('#audio-guide').textContent).toContain('set in the extension’s own setup page');
    const ext = await makeRig({ extension: true });
    await ext.go('audio');
    expect(ext.q('#audio-guide').textContent).not.toContain('set in the extension’s own setup page');
  });
});
