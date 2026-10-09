/**
 * 5. Reader integration. In the extension: installed, its version, how it is switched on. On the web: how to install it
 * legitimately (a web page can never install an extension, and nothing here pretends to). What works, what does not.
 */
import type { AppContext } from '../context';
import { append, button, h, listOf, p } from '../dom';
import { PERMISSIONS, SHORTCUT, STATUS_LABEL, SURFACES } from '../surfaces';
import type { View } from './view';

export const EXTENSION_FOLDER = 'packages/golearn-extension/dist';

export async function render(el: HTMLElement, ctx: AppContext, _view: View): Promise<void> {
  const chrome = ctx.deps.chrome;
  if (chrome) {
    const version = chrome.runtime.getManifest?.().version ?? 'unknown';
    append(el, [
      h('section', { class: 'card', id: 'reader-installed' },
        h('h2', {}, 'The extension is installed'),
        h('p', { id: 'ext-version' }, `Installed, version ${version}.`),
        listOf([
          'GoLearn is switched on per tab: open the page you are reading, press the GoLearn button in the toolbar and turn “GoLearn on for this tab”.',
          [`Or select a word and press `, h('kbd', {}, SHORTCUT), ' to look it up once.'],
          'Or select a word and right-click: “Look up with GoLearn”.',
          'Nothing is read until you do one of these, and it stops when you leave the page.',
        ])),
    ]);
  } else {
    const note = h('p', { class: 'status', role: 'status', 'aria-live': 'polite', id: 'reader-note' });
    append(el, [
      h('section', { class: 'card', id: 'reader-install' },
        h('h2', {}, 'Installing the extension'),
        p('This page is running as a website. A web page cannot install a browser extension and GoLearn never tries to: the extension is installed by you, in your browser, and Chrome asks you to confirm.'),
        h('ol', { class: 'howto' },
          h('li', {}, `Today (Chrome; other Chromium browsers have not been tried): the extension is not in a store yet. Get the built folder (${EXTENSION_FOLDER}), open `, h('code', {}, 'chrome://extensions'), ', turn on Developer mode, choose “Load unpacked” and select that folder.'),
          h('li', {}, 'Later: the Chrome Web Store. When it is listed there, install it from the store page; the listing will say plainly what it reads.'),
          h('li', {}, 'Pin the GoLearn button to the toolbar so you can switch it on for a tab. This page cannot check whether the extension is installed; the extension’s own settings page (the same screens as these) shows “installed” once it is.'),
        ),
        p('Safari and Firefox are not supported yet.', 'muted'),
        h('p', {}, button('I have installed it', async () => { await ctx.state.patchProgress({ readerAck: true }); ctx.changed(); note.textContent = 'Noted. Next, try the card on a practice passage.'; }, { id: 'reader-ack' })),
        note),
    ]);
  }

  const perms = h('ul', { class: 'perms' }, ...PERMISSIONS.map((x) => h('li', {}, h('code', {}, x.name), ` — ${x.why}`)));
  append(el, [
    h('section', { class: 'card' }, h('h2', {}, 'What it asks permission for'), perms,
      p('There are no host permissions: GoLearn has no access to any website until you use it on that page, and it sends nothing off your device except what you switch on under Privacy.')),
    h('section', { class: 'card', id: 'surfaces' }, h('h2', {}, 'Where it works'),
      h('ul', { class: 'surfaces' }, ...SURFACES.map((s) => h('li', { 'data-surface': s.id, 'data-status': s.status }, h('strong', {}, s.name), ' — ', h('span', { class: `status-${s.status}` }, STATUS_LABEL[s.status]), '. ', s.summary))),
      p('GoLearn never bypasses DRM, never scrolls or downloads a book to read it, and never keeps a copy of what you read.', 'muted')),
    h('p', {}, h('a', { class: 'btn primary', id: 'try-here', href: '#/tutorial' }, 'Try it here →'), ' ', h('span', { class: 'muted' }, 'A short orientation on a practice passage, using the real card.')),
  ]);
}
