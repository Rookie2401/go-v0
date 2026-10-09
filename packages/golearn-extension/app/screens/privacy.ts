/**
 * 8. Privacy: snippets, remote speech, external processing, explanation depth, export, deletion. Every switch starts
 * off and says what it would do and what this build actually wires. The switches live in `golearn:settings`, the same
 * record the extension’s background worker reads (it is asked to write them when it answers; this page writes them
 * itself otherwise).
 */
import type { AppContext } from '../context';
import { append, button, h, p, setStatus, statusLine } from '../dom';
import { createStorageEncounterStore } from '../../src/store';
import { DEPTHS, type ExplanationDepth } from '../state';
import type { View } from './view';

export const DEPTH_LABEL: Record<ExplanationDepth | 'auto', string> = {
  auto: 'Automatic (GoLearn adapts to what you already know)',
  label: 'Label only (just the dictionary form and a one-word gloss)',
  brief: 'Brief (one line of explanation)',
  explanatory: 'Explanatory (the full explanation, always)',
};

export const exportFilename = (now: Date): string => `golearn-export-${now.toISOString().slice(0, 10)}.json`;

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const [settings, session] = await Promise.all([ctx.state.getSettings(), ctx.state.getSession()]);
  if (!view.alive()) return;
  const pack = session?.languageId ? ctx.deps.packs.packFor(session.languageId) : ctx.deps.packs.packs().find((x) => x.status === 'installable');
  const provider = pack?.remoteVoiceProvider ?? 'no provider is named';
  const saved = statusLine();

  const toggle = (id: string, label: string, checked: boolean, onChange: (v: boolean) => Promise<void>, disabled = false): HTMLElement => {
    const box = h('input', { type: 'checkbox', id, name: id, ...(disabled ? { disabled: true } : {}) }) as HTMLInputElement;
    box.checked = checked;
    box.addEventListener('change', () => { void onChange(box.checked).then(() => setStatus(saved, 'Saved.', 'ok')); });
    return h('label', { class: 'toggle' }, box, h('span', {}, label));
  };

  const depth = h('select', { id: 'depth', name: 'depth' }, h('option', { value: 'auto' }, DEPTH_LABEL.auto), ...DEPTHS.map((d) => h('option', { value: d }, DEPTH_LABEL[d]))) as HTMLSelectElement;
  depth.value = settings.explanationDepth ?? 'auto';
  depth.addEventListener('change', () => {
    void ctx.setSettings({ explanationDepth: depth.value === 'auto' ? undefined : (depth.value as ExplanationDepth) }).then(() => setStatus(saved, 'Saved.', 'ok'));
  });

  append(el, [
    p('Everything below starts off. GoLearn keeps what you looked up as hashes and short word lists, never the pages you read.'),
    h('section', { class: 'card', 'aria-labelledby': 'priv-snip' },
      h('h2', { id: 'priv-snip' }, 'Keep snippets'),
      toggle('keep-snippets', 'Keep one sentence with each lookup, so I can see where I met a word', false, async () => undefined, true),
      p('Off, and it cannot be switched on in this version. A lookup is recorded as a hash of its sentence, the page title and the page path, never the sentence itself; nothing in the extension can keep a sentence yet. When keeping a sentence becomes possible it will be a separate switch here, off until you turn it on.', 'muted')),
    h('section', { class: 'card', 'aria-labelledby': 'priv-speech' },
      h('h2', { id: 'priv-speech' }, 'Remote speech'),
      toggle('remote-speech', `Allow a remote speech provider (${provider}) to say words for me`, settings.remoteSpeechConsent, async (v) => { await ctx.setSettings({ remoteSpeechConsent: v }); }),
      p(`What would be sent: only the word or phrase you ask to hear and its language, to ${provider}, when you press “Pronounce” and a speech key has been set up by you; never the page, the surrounding sentence or your name. Nothing is sent otherwise. This build’s card plays only voices that are already on your device, so nothing is sent today; the switch records your consent for when a remote voice is offered.`, 'muted')),
    h('section', { class: 'card', 'aria-labelledby': 'priv-ext' },
      h('h2', { id: 'priv-ext' }, 'External processing'),
      toggle('external-processing', 'Allow my passages to be analysed by an outside AI service', settings.externalProcessingConsent, async () => undefined, true),
      p('Off, and it cannot be switched on here: nothing in GoLearn sends text to an outside AI provider, and nothing will without a separate, informed switch.', 'muted')),
    h('section', { class: 'card', 'aria-labelledby': 'priv-depth' },
      h('h2', { id: 'priv-depth' }, 'How much explanation'),
      h('label', { class: 'field' }, h('span', { class: 'cap' }, 'Override the automatic choice'), depth)),
    saved,
  ]);

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
          const { api } = await ctx.api();
          const r = await api.exportAll();
          if (!r.ok) { setStatus(exportOut, r.status === 401 ? 'Your session is no longer valid. Sign in again.' : r.message || `The service answered ${r.status}.`, 'error'); return; }
          const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
          ctx.deps.download(exportFilename(ctx.deps.now()), blob);
          setStatus(exportOut, `Export ready: ${exportFilename(ctx.deps.now())}.`, 'ok');
        } catch { setStatus(exportOut, 'The service could not be reached.', 'error'); }
      }, { id: 'export-data', class: 'btn primary' }),
      button('Export this device’s rows', async () => {
        const text = await createStorageEncounterStore(ctx.deps.area).exportRows();
        ctx.deps.download(`golearn-device-rows-${ctx.deps.now().toISOString().slice(0, 10)}.json`, new Blob([text], { type: 'application/json' }));
        setStatus(exportOut, 'Device rows exported.', 'ok');
      }, { id: 'export-local' })),
    exportOut)]);

  // ── delete
  const deleteOut = statusLine();
  const confirm = h('input', { type: 'email', id: 'delete-email', name: 'delete-email', autocomplete: 'off', placeholder: session?.email ?? 'your email' }) as HTMLInputElement;
  const alsoLocal = h('input', { type: 'checkbox', id: 'delete-local' }) as HTMLInputElement;
  alsoLocal.checked = true;
  const del = h('button', { type: 'button', id: 'delete-account', class: 'btn danger', disabled: true }, 'Delete my account') as HTMLButtonElement;
  const matches = (): boolean => !!session && confirm.value.trim().toLowerCase() === session.email.toLowerCase();
  confirm.addEventListener('input', () => { del.disabled = !matches(); });
  del.addEventListener('click', () => {
    void (async () => {
      if (!session || !matches()) { setStatus(deleteOut, 'Type your account email exactly to confirm.', 'error'); return; }
      del.disabled = true;
      setStatus(deleteOut, 'Deleting…', 'info');
      try {
        const { api } = await ctx.api();
        const r = await api.deleteMe(confirm.value.trim());
        if (!r.ok) { setStatus(deleteOut, r.message || `The service answered ${r.status}; nothing was deleted.`, 'error'); del.disabled = false; return; }
        if (alsoLocal.checked) await ctx.clearLocal();
        await ctx.signOut();
        confirm.value = '';
        setStatus(deleteOut, 'Your account and everything the service held about you were erased, and this device was disconnected.', 'ok');
      } catch { setStatus(deleteOut, 'The service could not be reached; nothing was deleted.', 'error'); del.disabled = false; }
    })();
  });
  append(el, [h('section', { class: 'card', 'aria-labelledby': 'priv-delete' },
    h('h2', { id: 'priv-delete' }, 'Delete my account'),
    session
      ? [p('This erases your account and every row of your record on the service, and signs this device out. It cannot be undone. Export first if you want a copy.'),
        h('label', { class: 'field' }, h('span', { class: 'cap' }, `Type ${session.email} to confirm`), confirm),
        h('label', { class: 'toggle' }, alsoLocal, h('span', {}, 'Also delete the rows stored on this device')),
        h('div', { class: 'row' }, del)]
      : [p('Sign in to delete an account.', 'muted')],
    deleteOut)]);
}
