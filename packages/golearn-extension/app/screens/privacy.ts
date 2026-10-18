/**
 * 8. Privacy: snippets, remote speech, external processing, explanation depth, export, deletion. Every switch starts
 * off and says what it would do and what this build actually wires. The switches live in `golearn:settings`, the same
 * record the extension’s background worker reads (it is asked to write them when it answers; this page writes them
 * itself otherwise).
 */
import type { AppContext } from '../context';
import { append, button, h, p, setStatus, statusLine } from '../dom';
import { createStorageEncounterStore } from '../../src/store';
import { setRemoteSpeechConsent } from '../consent';
import { DEPTHS, type ExplanationDepth } from '../state';
import { dataFilename, deleteBlock, mountDeletionBanner } from './accountSecurity';
import { policySection } from './legal';
import type { View } from './view';
import { MSG } from '../../src/platform';

export const DEPTH_LABEL: Record<ExplanationDepth | 'auto', string> = {
  auto: 'Automatic (GoLearn adapts to what you already know)',
  label: 'Label only (just the dictionary form and a one-word gloss)',
  brief: 'Brief (one line of explanation)',
  explanatory: 'Explanatory (the full explanation, always)',
};


export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const [settings, active, session] = await Promise.all([ctx.state.getSettings(), ctx.activeLanguage(), ctx.state.getSession()]);
  if (!view.alive()) return;
  const pack = active?.languageId ? ctx.deps.packs.packFor(active.languageId) : ctx.deps.packs.packs().find((x) => x.status === 'installable');
  const provider = pack?.remoteVoiceProvider ?? 'no provider is named';
  const saved = statusLine();

  /** `onChange` returns the value now in force (so a refused switch snaps back) and may say why in a message. */
  const toggle = (id: string, label: string, checked: boolean, onChange: (v: boolean) => Promise<boolean | { value: boolean; message?: string }>, disabled = false): HTMLElement => {
    const box = h('input', { type: 'checkbox', id, name: id, ...(disabled ? { disabled: true } : {}) }) as HTMLInputElement;
    box.checked = checked;
    box.addEventListener('change', () => {
      const wanted = box.checked;
      void onChange(wanted).then((r) => {
        const out = typeof r === 'boolean' ? { value: r } : r;
        box.checked = out.value;
        if (out.message) setStatus(saved, out.message, 'error'); else setStatus(saved, 'Saved.', 'ok');
      }, () => { box.checked = !wanted; setStatus(saved, 'The switch could not be changed.', 'error'); });
    });
    return h('label', { class: 'toggle' }, box, h('span', {}, label));
  };

  const depth = h('select', { id: 'depth', name: 'depth' }, h('option', { value: 'auto' }, DEPTH_LABEL.auto), ...DEPTHS.map((d) => h('option', { value: d }, DEPTH_LABEL[d]))) as HTMLSelectElement;
  depth.value = settings.explanationDepth ?? 'auto';
  depth.addEventListener('change', () => {
    void ctx.setSettings({ explanationDepth: depth.value === 'auto' ? undefined : (depth.value as ExplanationDepth) }).then(() => setStatus(saved, 'Saved.', 'ok'));
  });

  append(el, [
    p('Remote processing starts off, and speech starts in local-only mode. GoLearn keeps what you looked up as hashes and short word lists, never the pages you read.'),
    h('section', { class: 'card', 'aria-labelledby': 'priv-snip' },
      h('h2', { id: 'priv-snip' }, 'Keep snippets'),
      toggle('keep-snippets', 'Keep one sentence with each lookup, so I can see where I met a word', false, async () => false, true),
      p('Off, and it cannot be switched on in this version. A lookup is recorded as a hash of its sentence, the page title and the page path, never the sentence itself; nothing in the extension can keep a sentence yet. When keeping a sentence becomes possible it will be a separate switch here, off until you turn it on.', 'muted')),
    h('section', { class: 'card', 'aria-labelledby': 'priv-speech' },
      h('h2', { id: 'priv-speech' }, 'Remote speech'),
      toggle('local-only-speech', 'Use only voices that run on this device', settings.localOnlySpeech !== false, async (v) => {
        const next = await ctx.setSettings({ localOnlySpeech: v });
        return next.localOnlySpeech !== false;
      }),
      toggle('remote-speech', `Allow a remote speech provider (${provider}) to say words for me`, settings.remoteSpeechConsent, async (v) => {
        // recorded as a ConsentGiven / ConsentWithdrawn event (scope remote-speech); switched on only once the record is made
        const r = await setRemoteSpeechConsent(ctx, v, active?.languageId || pack?.languageId);
        return r.ok ? r.settings.remoteSpeechConsent : { value: r.settings.remoteSpeechConsent, message: r.message };
      }),
      p('Azure Neural speech receives only the word, phrase or sentence you explicitly ask to hear, through your authenticated speech backend. Source permissions must allow this. Local-only mode also blocks browser voices that use a cloud service. Synthetic pronunciation is practice and exposure; it never proves mastery.', 'muted')),
    h('section', { class: 'card', 'aria-labelledby': 'priv-ext' },
      h('h2', { id: 'priv-ext' }, 'External processing'),
      toggle('external-processing', 'Allow my passages to be analysed by an outside AI service', settings.externalProcessingConsent, async () => settings.externalProcessingConsent, true),
      p('Off, and it cannot be switched on here: nothing in GoLearn sends text to an outside AI provider, and nothing will without a separate, informed switch.', 'muted')),
    h('section', { class: 'card', 'aria-labelledby': 'priv-depth' },
      h('h2', { id: 'priv-depth' }, 'How much explanation'),
      h('label', { class: 'field' }, h('span', { class: 'cap' }, 'Override the automatic choice'), depth)),
    saved,
  ]);

  if (ctx.deps.chrome) {
    const chrome = ctx.deps.chrome;
    const endpoint = h('input', { type: 'url', id: 'speech-endpoint', placeholder: 'https://your-service/api/speech', autocomplete: 'off' }) as HTMLInputElement;
    const access = h('input', { type: 'password', id: 'speech-access', autocomplete: 'off' }) as HTMLInputElement;
    const source = h('input', { type: 'url', id: 'speech-source-origin', placeholder: 'https://my-owned-content.example', autocomplete: 'off' }) as HTMLInputElement;
    const rights = h('input', { type: 'checkbox', id: 'speech-source-rights' }) as HTMLInputElement;
    const setupOut = statusLine();
    append(el, [h('section', { class: 'card', 'aria-labelledby': 'speech-backend' },
      h('h2', { id: 'speech-backend' }, 'Speech backend'),
      p('Azure keys stay on the backend. Enter a separate backend access token here; GoLearn keeps it in trusted extension storage and never exposes it to a web page.'),
      h('label', { class: 'field' }, h('span', {}, 'Speech endpoint'), endpoint),
      h('label', { class: 'field' }, h('span', {}, 'Backend access token'), access),
      h('label', { class: 'field' }, h('span', {}, 'Optional source origin for content you have permission to process'), source),
      h('label', { class: 'toggle' }, rights, h('span', {}, 'I own this content or have permission to send its text to Azure for pronunciation')),
      p('Unknown source rights stay blocked unless you explicitly declare permission for this exact origin. A reader prohibition always remains blocked. Leave the origin blank to use only sources already approved by the reader registry.', 'muted'),
      button('Save speech backend', async () => {
        try {
          const url = new URL(endpoint.value);
          if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Invalid endpoint');
          if (source.value.trim() && !rights.checked) { setStatus(setupOut, 'Declare source processing permission before adding an origin.', 'error'); return; }
          // Must be invoked by this button gesture for Brave to offer the optional permission.
          if (!(await chrome.permissions?.request({ origins: [`${url.origin}/*`] }))) { setStatus(setupOut, 'Speech backend access was not granted.', 'error'); return; }
          const r = await chrome.runtime.sendMessage({ type: MSG.speechConfig, op: 'set', baseUrl: endpoint.value.trim(), token: access.value, permittedSourceOrigins: source.value.trim() ? [source.value.trim()] : [] }) as { ok?: boolean; message?: string };
          access.value = '';
          setStatus(setupOut, r?.ok ? 'Speech backend saved. Remote speech also needs consent and local-only mode switched off.' : r?.message ?? 'Speech setup failed.', r?.ok ? 'ok' : 'error');
        } catch { access.value = ''; setStatus(setupOut, 'Speech setup failed. Check the endpoint and backend access token.', 'error'); }
      }, { id: 'save-speech-backend' }),
      setupOut)]);
  }

  // ── export
  const exportOut = statusLine();
  append(el, [h('section', { class: 'card', 'aria-labelledby': 'priv-export' },
    h('h2', { id: 'priv-export' }, 'Export my data'),
    p('Everything the service holds about you, as one JSON file: events, enrolments, knowledge estimates, preferences and your private documents.'),
    h('div', { class: 'row' },
      button('Export my data', async () => {
        if (!session) { setStatus(exportOut, 'Sign in first: the export comes from your account on the service.', 'error'); return; }
        setStatus(exportOut, 'Preparing the export…', 'info');
        try {
          const { client } = await ctx.accountApi();
          const r = await client.exportData();
          if (!r.ok) { setStatus(exportOut, r.status === 401 ? 'Your session is no longer valid. Sign in again.' : r.message || (r.status === 0 ? 'The service could not be reached.' : `The service answered ${r.status}.`), 'error'); return; }
          ctx.deps.download(dataFilename(ctx.deps.now()), new Blob([r.data], { type: 'application/json' }));
          setStatus(exportOut, `Export ready: ${dataFilename(ctx.deps.now())}.`, 'ok');
        } catch { setStatus(exportOut, 'The service could not be reached.', 'error'); }
      }, { id: 'export-data', class: 'btn primary' }),
      button('Export this device’s rows', async () => {
        const text = await createStorageEncounterStore(ctx.deps.area).exportRows();
        ctx.deps.download(`golearn-device-rows-${ctx.deps.now().toISOString().slice(0, 10)}.json`, new Blob([text], { type: 'application/json' }));
        setStatus(exportOut, 'Device rows exported.', 'ok');
      }, { id: 'export-local' })),
    exportOut)]);

  // ── clear local data (explicit: signing out never does this)
  const clearOut = statusLine();
  let armed = false;
  const clearBtn = button('Clear local data', () => {
    void (async () => {
      if (!armed) {
        armed = true;
        clearBtn.textContent = 'Click again to clear';
        setStatus(clearOut, 'This removes the lookups, the waiting queue and the on-device record kept on this device. An account, if you have one, is not touched. Move on to cancel.', 'info');
        return;
      }
      armed = false;
      clearBtn.textContent = 'Clear local data';
      const n = await ctx.clearLocal();
      setStatus(clearOut, `Cleared the local data on this device (${n} row${n === 1 ? '' : 's'}).`, 'ok');
    })();
  }, { id: 'clear-local', class: 'btn danger' });
  clearBtn.addEventListener('blur', () => { if (armed) { armed = false; clearBtn.textContent = 'Clear local data'; setStatus(clearOut, 'Nothing was cleared.', 'info'); } });
  append(el, [h('section', { class: 'card', 'aria-labelledby': 'priv-clear' },
    h('h2', { id: 'priv-clear' }, 'Local data on this device'),
    p('Your lookups and the record GoLearn keeps for you are stored on this device first. Signing out leaves them here; clearing them is a separate, deliberate step.'),
    h('div', { class: 'row' }, clearBtn), clearOut)]);

  // ── delete (password-confirmed, with a grace period; the same block as in Settings)
  const slot = h('div', { id: 'deletion-slot' });
  mountDeletionBanner(slot, ctx, view);
  append(el, [slot, h('section', { class: 'card', id: 'priv-delete' }, deleteBlock(ctx, view))]);

  // ── the policy and the terms
  append(el, [
    p('The text below is a draft that has not been adopted yet. Creating an account also asks you to accept the Terms of use.', 'muted'),
    h('p', {}, h('a', { href: '#/terms', id: 'link-terms' }, 'Read the Terms of use')),
    policySection(),
  ]);
}
