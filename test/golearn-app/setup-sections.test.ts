// @vitest-environment jsdom
/**
 * The main setup page as two disclosures (the owner, 2026-10-28): LANGUAGE (the downloads) and AUDIO (the guide to hearing the words:
 * the voices on this device, Azure through a speech backend of one's own, and ElevenLabs as not available yet). Language opens by itself
 * while nothing is downloaded; once a language is downloaded both wait closed.
 */
import { describe, expect, it } from 'vitest';
import { downloadLanguage, makeRig as baseRig, type RigOptions } from './helpers';

const makeRig = (o: RigOptions = {}) => baseRig({ startRoute: 'languages', ...o });
const details = (rig: Awaited<ReturnType<typeof makeRig>>, id: string): HTMLDetailsElement => rig.q<HTMLDetailsElement>(`#${id}`);

describe('the main setup page: Language and Audio', () => {
  it('is two disclosures whose headings are their summaries; Language is open on a first run, Audio closed; the reader link stays at the foot', async () => {
    const rig = await makeRig();
    expect(rig.q('#screen h1').textContent).toBe('Choose your languages');
    const language = details(rig, 'languages');
    const audio = details(rig, 'audio');
    expect(language.tagName).toBe('DETAILS');
    expect(audio.tagName).toBe('DETAILS');
    expect(language.querySelector(':scope > summary > h2')!.textContent).toBe('Language');
    expect(audio.querySelector(':scope > summary > h2')!.textContent).toBe('Audio');
    expect(language.open).toBe(true); // nothing downloaded yet: the downloads show by themselves
    expect(audio.open).toBe(false);
    expect(language.nextElementSibling).toBe(audio);
    // the downloads live inside Language
    expect(language.contains(rig.q('#language-cards'))).toBe(true);
    expect(language.contains(rig.q('#account-line'))).toBe(true);
    expect(rig.q<HTMLAnchorElement>('#reader-link').getAttribute('href')).toBe('#/reader');
  });

  it('closes Language once a language is downloaded', async () => {
    const rig = await makeRig({ extension: true });
    await downloadLanguage(rig, 'sq');
    await rig.go('home');
    await rig.go('languages');
    expect(details(rig, 'languages').open).toBe(false);
    expect(details(rig, 'audio').open).toBe(false);
  });

  it('the Audio guide tells the three ways as they are: device voices with the install steps and the strict tags, Azure through a speech backend set under Privacy, ElevenLabs not available yet', async () => {
    const rig = await makeRig({ extension: true });
    const guide = rig.q('#audio-guide');
    const text = guide.textContent ?? '';
    const headings = [...guide.querySelectorAll('h3')].map((x) => x.textContent);
    expect(headings).toEqual(['1. Voices on this device (free, nothing leaves the device)', '2. Azure voices, through a speech backend of your own', '3. ElevenLabs']);
    // device voices: the four platforms and the exact-match rule, the tags from voiceTags.ts
    for (const os of ['Windows 11', 'macOS', 'Android', 'iPhone and iPad']) expect(text).toContain(os);
    expect(text).toMatch(/matches exactly/);
    expect(guide.querySelector('table')!.textContent).toContain('sq-AL, sq');
    expect(guide.querySelector('table')!.textContent).toContain('la, la-VA, it-IT, it');
    // Azure: the backend holds the key, the fields are under Privacy, the two switches, the repository's own backend
    expect(text).toContain('never holds the Azure key');
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
    expect(rig.q('#audio-guide').textContent).toContain('set in the extension’s own setup page');
    const ext = await makeRig({ extension: true });
    expect(ext.q('#audio-guide').textContent).not.toContain('set in the extension’s own setup page');
  });
});
