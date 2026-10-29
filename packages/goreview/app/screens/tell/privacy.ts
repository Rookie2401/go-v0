/** #/tell/privacy — what GoTell does with writing, export of everything, the remote-assistance switch, device cleanup. */
import { append, button, h, p, setStatus, statusLine } from '../../dom';
import { tellNav, type TellEnv } from './common';

export async function render(env: TellEnv): Promise<void> {
  const { el, host, engine, view } = env;
  const privacy = engine.privacy;
  const statementText = privacy.statement();

  const statement = h('section', { class: 'card', id: 'tell-privacy-statement', 'aria-labelledby': 'tell-privacy-h' },
    h('h2', { id: 'tell-privacy-h' }, statementText.title),
    ...statementText.sections.flatMap((sec) => [h('h3', {}, sec.heading), h('ul', {}, ...sec.points.map((pt) => h('li', {}, pt)))]));

  // ── export
  const exportStatus = statusLine();
  const exportBox = h('section', { class: 'card', id: 'tell-privacy-export', 'aria-labelledby': 'tell-export-h' },
    h('h2', { id: 'tell-export-h' }, 'Take your writing with you'),
    p('Everything you have written here, in one file, in a format you can read without GoTell.', 'muted'),
    h('div', { class: 'row' }, button('Export all my writing', () => {
      void (async () => {
        try { host.download(await privacy.exportAll()); setStatus(exportStatus, 'Your writing was exported to a file.', 'ok'); } catch (e) {
          setStatus(exportStatus, `The export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
        }
      })();
    }, { id: 'tell-export-all', class: 'btn' })), exportStatus);

  // ── remote assistance
  const provider = privacy.remote.providerName();
  const remoteStatus = statusLine();
  const toggle = h('input', { type: 'checkbox', id: 'tell-remote-consent', name: 'remote-assistance' }) as HTMLInputElement;
  toggle.checked = privacy.remote.consent();
  toggle.addEventListener('change', () => {
    void (async () => {
      try {
        await privacy.remote.setConsent(toggle.checked);
        if (!view.alive()) return;
        setStatus(remoteStatus, toggle.checked
          ? (provider ? `Remote help is allowed. Sentences you ask help for may be sent to ${provider}.` : 'Remote help is allowed in principle, but no provider is configured, so nothing can be sent.')
          : 'Remote help is off. Nothing you write leaves your account and this device.', 'ok');
      } catch (e) {
        toggle.checked = privacy.remote.consent();
        setStatus(remoteStatus, `The setting could not be changed: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
    })();
  });
  const remoteBox = h('section', { class: 'card', id: 'tell-privacy-remote', 'aria-labelledby': 'tell-remote-h' },
    h('h2', { id: 'tell-remote-h' }, 'Remote assistance'),
    p(provider
      ? `A remote assistant (${provider}) is configured. It is used only for a sentence you ask a model for, and only while this switch is on.`
      : 'No remote assistant is configured in this build, so nothing is ever sent to an outside service, whatever this switch says.', provider ? undefined : 'notice'),
    h('label', { class: 'toggle' }, toggle,
      h('span', {}, 'Allow remote help for the sentences I ask a model for ', h('span', { class: 'help' }, '(off by default; the English you type for a targeted expression is never sent)'))),
    remoteStatus);

  // ── device cleanup
  const cleanStatus = statusLine();
  const confirmRow = h('div', { class: 'row', id: 'tell-clean-confirm', hidden: true },
    'Remove every draft this device holds? The copies in your account stay. ',
    button('Remove from this device', () => {
      void (async () => {
        try {
          const r = await privacy.cleanDevice();
          setStatus(cleanStatus, `${r.removed} draft(s) removed from this device. Your account copies were not touched.`, 'ok');
        } catch (e) { setStatus(cleanStatus, `The cleanup failed: ${e instanceof Error ? e.message : String(e)}`, 'error'); }
        confirmRow.hidden = true;
      })();
    }, { id: 'tell-clean-go', class: 'btn' }),
    button('Cancel', () => { confirmRow.hidden = true; }, { id: 'tell-clean-cancel', class: 'btn' }));
  const cleanBox = h('section', { class: 'card', id: 'tell-privacy-device', 'aria-labelledby': 'tell-device-h' },
    h('h2', { id: 'tell-device-h' }, 'This device'),
    p('Drafts are kept on this device so you can write offline. On a shared device you can remove them.', 'muted'),
    h('div', { class: 'row' }, button('Clean up this device', () => { confirmRow.hidden = false; }, { id: 'tell-clean', class: 'btn' })),
    confirmRow, cleanStatus);

  // ── licences
  const licencesBox = h('section', { class: 'card', id: 'tell-privacy-licences', 'aria-labelledby': 'tell-licences-h' },
    h('h2', { id: 'tell-licences-h' }, 'Licences and attribution'),
    p("The dictionary meanings and the review scheduler are other people's work, used under their licences.", 'muted'),
    h('p', {}, h('a', { href: '#/settings', id: 'tell-licences-link' }, 'Read the licences and attribution'), ' (in Settings, under "Licences and attribution").'));

  append(el, [tellNav('privacy'), statement, exportBox, remoteBox, cleanBox, licencesBox]);
}
