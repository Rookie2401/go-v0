/**
 * The Audio guide on the main setup page (the owner, 2026-10-28): how to hear the words GoLearn shows you.
 *
 * Three ways, told as they are: (1) the voices installed on this device (free, nothing leaves the device; the only voices the word card
 * on a web page uses on its own); (2) Azure voices through a speech backend of YOUR OWN (the extension never holds the Azure key:
 * the backend does; it is configured under Privacy → Speech backend, and remote speech also needs the two Privacy switches);
 * (3) ElevenLabs, which GoLearn cannot use today: no backend for it exists, and the extension talks to a backend only.
 * The facts come from src/content/voiceTags.ts (the strict voice tags), src/background/speech.ts (the backend contract),
 * screens/privacy.ts (the fields) and docs/golisten/AZURE-SETUP.md (the backend); keep them in step.
 */
import type { AppContext } from '../context';
import { h, p } from '../dom';
import { languageNameOf } from '../../src/protocol';
import { DEVICE_TAGS, hasDeviceVoice } from '../../src/content/voiceTags';

/** The languages that can have a voice at all, in the catalogue's order, each with the tags a device voice must carry. */
const VOICE_LANGUAGES: ReadonlyArray<{ id: string; note?: string }> = [
  { id: 'nb' }, { id: 'nn' }, { id: 'de' }, { id: 'sq', note: 'few devices ship one; Azure has Albanian voices' }, { id: 'hi' }, { id: 'th' }, { id: 'es' }, { id: 'he' }, { id: 'el' },
  { id: 'la', note: 'no device and no provider has a Latin voice; an Italian voice stands in for the Church reading, and GoLearn says so' },
];

/** What this browser can speak right now, by the same strict rule the word card uses (an English voice is never "close enough"). */
function voicesNow(): HTMLElement {
  type Synth = { getVoices(): Array<{ lang: string }>; addEventListener?(type: string, fn: () => void): void };
  const synth = (globalThis as { speechSynthesis?: Synth }).speechSynthesis;
  if (!synth) return p('This browser reports no voices to GoLearn, so the words will not be spoken here until one is installed.', 'muted');
  const line = h('p', { id: 'voices-now', class: 'status-note' });
  const fill = (): void => {
    let voices: Array<{ lang: string }> = [];
    try { voices = synth.getVoices(); } catch { voices = []; }
    const yes = VOICE_LANGUAGES.filter((l) => hasDeviceVoice(l.id, voices)).map((l) => languageNameOf(l.id));
    line.setAttribute('data-count', String(yes.length));
    line.textContent = yes.length ? `Voices on this device now: ${yes.join(', ')}.` : voices.length ? 'No voice on this device matches one of GoLearn’s languages yet.' : 'This browser has not listed its voices yet; reopen this page after installing one.';
  };
  fill();
  // browsers list their voices a moment after the page opens: the line follows
  try { synth.addEventListener?.('voiceschanged', fill); } catch { /* the first reading stands */ }
  return line;
}

export function audioGuide(ctx: AppContext): HTMLElement[] {
  const li = (...c: Array<string | HTMLElement>): HTMLElement => h('li', {}, ...c);
  const strong = (t: string): HTMLElement => h('strong', {}, t);
  const code = (t: string): HTMLElement => h('code', {}, t);
  const privacy = (text: string): HTMLElement => h('a', { href: '#/privacy' }, text);
  return [
    h('div', { class: 'audio-guide', id: 'audio-guide' },
      p('Select a word on a page you are reading (with GoLearn Active on) and its card opens; the speaker button on the card says the word. Where the voice comes from is up to you, and nothing is sent anywhere unless you switch that on.'),
      voicesNow(),

      h('h3', {}, '1. Voices on this device (free, nothing leaves the device)'),
      p('GoLearn speaks with the voices installed on your computer or phone; the browser lends them to the page. It uses a voice only when its language matches exactly, so an English or a neighbouring voice is never used for a word in your language.'),
      h('ol', {},
        li(strong('Windows 11: '), 'Settings → Time & language → Language & region → Add a language → pick the language → tick Text-to-speech → Install. Then close and reopen the browser.'),
        li(strong('macOS: '), 'System Settings → Accessibility → Spoken Content → System Voice → Manage Voices… → download a voice for the language.'),
        li(strong('Android: '), 'Settings → Accessibility → Text-to-speech output → Speech Services by Google (the gear) → Install voice data → the language.'),
        li(strong('iPhone and iPad: '), 'Settings → Accessibility → Spoken Content → Voices → the language → download a voice.'),
        li('Come back here: the line above lists the languages this browser can now speak. Leave ', privacy('“Use only voices that run on this device”'), ' switched on (it is on by default); a browser voice that itself runs in a cloud is refused in that mode.')),
      p('The voice tags GoLearn accepts, language by language:', 'muted'),
      h('table', {}, h('tbody', {}, ...VOICE_LANGUAGES.map((l) => h('tr', {}, h('th', { scope: 'row' }, languageNameOf(l.id)), h('td', {}, (DEVICE_TAGS[l.id] ?? []).join(', ') + (l.note ? ` — ${l.note}` : '')))))),

      h('h3', {}, '2. Azure voices, through a speech backend of your own'),
      p('Azure Neural voices (Microsoft) cover every GoLearn language that has a voice, Albanian included. GoLearn never talks to Azure itself and never holds the Azure key: a small speech backend that you run does, and GoLearn asks it for the word, phrase or sentence you pressed the speaker for. Set it up in this order:'),
      h('ol', {},
        li(strong('An Azure Speech resource. '), 'In the Azure portal create an “Azure AI Speech” resource (kind SpeechServices) on the free F0 tier in a region of your choice, then open Keys and Endpoint. Keep the key off screenshots and out of any GoLearn setting.'),
        li(strong('The backend. '), 'This repository ships it: run ', code('npm run speech:serve'), ' with ', code('AZURE_SPEECH_KEY'), ', ', code('AZURE_SPEECH_REGION'), ', a token you generate yourself of at least 32 letters and digits as ', code('GO_SPEECH_AUTH_TOKEN'), ', and ', code('GO_SPEECH_ALLOWED_EXTENSION_ORIGINS=chrome-extension://<the extension’s id>'), ' in ', code('.env.local'), '. It listens at ', code('http://127.0.0.1:8791/api/speech'), ' on this computer; on a server put it behind HTTPS. The full guide is docs/golisten/AZURE-SETUP.md.'),
        li(strong('Tell GoLearn where it is. '), 'Open ', privacy('Privacy → Speech backend'), ' (in the extension’s setup page): the endpoint (ending in /api/speech), the backend access token you generated (never the Azure key), and, if you want pages of a site you own spoken, that site’s origin with the rights box ticked. Press Save speech backend and allow the address when the browser asks.'),
        li(strong('Allow remote speech. '), 'On the same ', privacy('Privacy'), ' page switch off “Use only voices that run on this device” and switch on “Allow a remote speech provider to say words for me”. The switch records your consent; it is off until then.'),
        li(strong('Listen. '), 'The speaker on a word’s card now uses Azure on the pages whose origin you declared (or that GoLearn’s reader list already approves), and GoReview’s practice uses it too. Only the text you ask to hear is sent; the pages you read never are.')),
      p('Azure speech is synthetic: good for hearing a word, never proof that you understood it.', 'muted'),

      h('h3', {}, '3. ElevenLabs'),
      p('Not available yet. GoLearn only ever speaks through a backend of your own, never to a voice provider directly, and the backend this repository ships speaks Azure only. A backend that answered the same three calls (status, voices, synthesize) with ElevenLabs voices would plug in at steps 3 to 5 above unchanged; until one is written, the choices are the voices on this device and Azure.'),
      ctx.inExtension ? null : p('The speech backend is set in the extension’s own setup page (the GoLearn button in the browser toolbar → GoLearn → Privacy), not in this hosted page.', 'muted')),
  ];
}
