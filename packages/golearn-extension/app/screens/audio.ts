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
import type { View } from './view';
import { button, h, p, setStatus, statusLine } from '../dom';
import { languageNameOf } from '../../src/protocol';
import { DEVICE_TAGS, hasDeviceVoice } from '../../src/content/voiceTags';

/** The languages that can have a voice at all, in the catalogue's order, each with the tags a device voice must carry. */
const VOICE_LANGUAGES: ReadonlyArray<{ id: string; note?: string }> = [
  { id: 'nb', note: 'Azure offers Bokmål; it is never used for Nynorsk' }, { id: 'nn', note: 'no Azure Nynorsk voice; only an exact Nynorsk device voice is accepted' }, { id: 'de' }, { id: 'sq', note: 'few devices ship one; Azure has Albanian voices' }, { id: 'hi' }, { id: 'th' }, { id: 'es' }, { id: 'he' }, { id: 'el' },
  { id: 'la', note: 'Azure Italian is only an Ecclesiastical Latin stand-in; it is not Classical Latin' },
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
  let repositoryOrigin: string | undefined;
  const permissionStatus = statusLine();
  const permissionButton = button('Allow account speech access', async () => {
    if (!repositoryOrigin) { setStatus(permissionStatus, 'The Repository service address is not ready.', 'error'); return; }
    const permissions = ctx.deps.chrome?.permissions;
    if (!permissions?.request) { setStatus(permissionStatus, 'This browser does not support optional site access.', 'error'); return; }
    try {
      const granted = await permissions.request({ origins: [repositoryOrigin] });
      setStatus(permissionStatus, granted ? 'Repository speech access was granted for this exact service origin.' : 'Repository speech access was not granted.', granted ? 'ok' : 'error');
    } catch { setStatus(permissionStatus, 'Repository speech access could not be requested.', 'error'); }
  }, { id: 'allow-account-speech' });
  if (ctx.inExtension) {
    permissionButton.disabled = true;
    void ctx.serviceUrl().then((url) => {
      try { repositoryOrigin = `${new URL(url).origin}/*`; permissionButton.disabled = false; }
      catch { setStatus(permissionStatus, 'The configured Repository service URL is invalid.', 'error'); }
    }).catch(() => setStatus(permissionStatus, 'The configured Repository service URL could not be loaded.', 'error'));
  }
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

      h('h3', {}, '2. Remote voices through your account'),
      p('If you are signed in, GoLearn can use speech from your Repository account. The service manages the Azure connection; you do not need to create an Azure resource or provide a speech key. Remote speech starts off and sends no text until you enable it.'),
      ctx.inExtension ? h('section', { class: 'card', id: 'account-speech-access' },
        h('h4', {}, 'Allow account speech access'),
        p('This grants the extension access to the exact Repository service origin. It does not send text by itself.'),
        permissionButton, permissionStatus) : p('Account speech access must be granted in the GoLearn extension.', 'muted'),
      h('ol', {},
        li(strong('Allow the service. '), 'In the extension setup page, press “Allow account speech access” and allow it when the browser asks.'),
        li(strong('Choose remote speech. '), 'Open ', privacy('Privacy settings'), ' and switch off “Use only voices that run on this device”; switch on “Allow a remote speech provider to say words for me”. This records your explicit consent and is off until you enable it.'),
        li(strong('Listen. '), 'The service supports words and exact approved pack examples. Arbitrary passages are refused. Only text you ask to hear is sent, and only after consent and source checks.')),
      p('Azure Neural voices are registered for languages including Albanian and Bokmål. No Azure Nynorsk voice is substituted; Latin uses an explicitly labelled Italian stand-in only for the Ecclesiastical reading. Actual availability depends on the signed-in service and its voice configuration.', 'muted'),

      h('h3', {}, '3. Optional: your own speech backend'),
      h('p', {}, 'Advanced users can configure a separate compatible speech backend in ', privacy('Privacy → Speech backend'), '. GoLearn stores its backend token in extension storage, never the Azure key. This route requires a backend you operate and remains separate from Repository account speech.'),
      h('ol', {},
        li(strong('An Azure Speech resource. '), 'In the Azure portal create an “Azure AI Speech” resource (kind SpeechServices) on the free F0 tier in a region of your choice, then open Keys and Endpoint. Keep the key off screenshots and out of any GoLearn setting.'),
        li(strong('The backend. '), 'This repository ships it: run ', code('npm run speech:serve'), ' with ', code('AZURE_SPEECH_KEY'), ', ', code('AZURE_SPEECH_REGION'), ', a token you generate yourself of at least 32 letters and digits as ', code('GO_SPEECH_AUTH_TOKEN'), ', and ', code('GO_SPEECH_ALLOWED_EXTENSION_ORIGINS=chrome-extension://<the extension’s id>'), ' in ', code('.env.local'), '. It listens at ', code('http://127.0.0.1:8791/api/speech'), ' on this computer; on a server put it behind HTTPS. The full guide is docs/golisten/AZURE-SETUP.md.'),
        li(strong('Tell GoLearn where it is. '), 'Open ', privacy('the Speech backend section'), ' (in the extension’s setup page): the endpoint (ending in /api/speech), the backend access token you generated (never the Azure key), and, if you want pages of a site you own spoken, that site’s origin with the rights box ticked. Press Save speech backend and allow the address when the browser asks.'),
        li(strong('Allow remote speech. '), 'On the same ', privacy('Privacy page'), ' switch off “Use only voices that run on this device” and switch on “Allow a remote speech provider to say words for me”. The switch records your consent; it is off until then.'),
        li(strong('Listen. '), 'The speaker on a word’s card now uses Azure on the pages whose origin you declared (or that GoLearn’s reader list already approves), and GoReview’s practice uses it too. Only the text you ask to hear is sent; the pages you read never are.')),
      p('For the custom route, the speech endpoint and backend access token are configured on the Privacy page. Do not paste an Azure key into GoLearn.', 'muted'),
      p('Azure speech is synthetic: good for hearing a word, never proof that you understood it.', 'muted'),

      h('h3', {}, '4. ElevenLabs'),
      p('Not available yet. GoLearn only ever speaks through a backend of your own, never to a voice provider directly, and the backend this repository ships speaks Azure only. A backend that answered the same three calls (status, voices, synthesize) with ElevenLabs voices would plug in at steps 3 to 5 above unchanged; until one is written, the choices are the voices on this device and Azure.'),
      ctx.inExtension ? null : p('The speech backend is set in the extension’s own setup page (the GoLearn button in the browser toolbar → GoLearn → Privacy), not in this hosted page.', 'muted')),
  ];
}

/**
 * Audio, a page under Settings (2026-11-11; it was a closed section of the Languages page, where two screens of setup notes sat under the
 * language list). What this device can speak now is said first; then each way of hearing a word is a part that opens: the first (the
 * voices on this device, which is all most learners need) open, the rest closed until wanted.
 */
export function render(el: HTMLElement, ctx: AppContext, _view: View): void {
  const guide = audioGuide(ctx)[0];
  let body: HTMLElement | undefined;
  let parts = 0;
  const out: Node[] = [];
  for (const child of [...guide.childNodes]) {
    if (child instanceof HTMLElement && child.tagName === 'H3') {
      // on this page a part's heading comes straight under the page's own: the second level, not the third
      const fold = h('details', { class: 'fold' }, h('summary', {}, h('h2', {}, child.textContent ?? ''))) as HTMLDetailsElement;
      body = h('div', { class: 'fold-body' });
      fold.append(body);
      fold.open = parts++ === 0;
      out.push(fold);
    } else if (body) body.append(child);
    else out.push(child);
  }
  guide.replaceChildren(...out);
  // and a heading inside a part follows its part: the third level
  for (const h4 of [...guide.querySelectorAll('h4')]) h4.replaceWith(h('h3', {}, h4.textContent ?? ''));
  el.append(guide);
}
