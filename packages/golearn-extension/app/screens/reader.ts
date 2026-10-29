/**
 * How GoLearn reads pages (an advanced screen, linked from the foot of the languages page and from Settings). In the extension: installed, its version, how it is switched on. On the web: how to install it
 * legitimately (a web page can never install an extension, and nothing here pretends to). What works, what does not.
 */
import type { AppContext } from '../context';
import { append, button, h, listOf, p } from '../dom';
import { PERMISSIONS, SHORTCUT, STATUS_LABEL, SURFACES } from '../surfaces';
import type { View } from './view';

export const EXTENSION_FOLDER = 'packages/golearn-extension/dist';

/**
 * Biblia (2026-10-23): the Hebrew Bible and the Greek New Testament, read with the same card, is its own installable app at the hosted
 * address named in config.json (`bibliaUrl`; nothing is linked when the config names none). It uses the same GoLearn account: what is looked
 * up and marked there is recorded under Hebrew or Greek and reaches GoReview and this extension's page marks. It was a page inside the
 * extension from 2026-10-21 to 2026-10-23; that put 49 MB of Scripture text inside the extension (test/audit/rights.dist), so it moved out.
 */
function bibliaCard(ctx: AppContext): HTMLElement {
  const url = ctx.deps.config.bibliaUrl;
  return h('section', { class: 'card', id: 'biblia' },
    h('h2', {}, 'Biblia: the Hebrew Bible and the Greek New Testament'),
    p('The Scriptures in their own languages, read with the same card as any page: every word parsed in the period of its text (Biblical Hebrew, Biblical Aramaic, Koine Greek), with the Variants tab across the periods. Biblia is its own app; sign in there with this same account and your lookups and marks are recorded under Hebrew or Greek, so they reach GoReview and the marks on the pages you read here.'),
    url
      ? h('p', {}, h('a', { href: url, id: 'biblia-link', target: '_blank', rel: 'noopener' }, 'Open Biblia'), ' (opens in a new tab; it can be added to the home screen of a phone)')
      : p('This build names no Biblia address (config.json bibliaUrl).', 'muted'));
}

export async function render(el: HTMLElement, ctx: AppContext, _view: View): Promise<void> {
  const chrome = ctx.deps.chrome;
  if (chrome) {
    const version = chrome.runtime.getManifest?.().version ?? 'unknown';
    append(el, [
      h('section', { class: 'card', id: 'reader-installed' },
        h('h2', {}, 'The extension is installed'),
        h('p', { id: 'ext-version' }, `Installed, version ${version}.`),
        listOf([
          'For a one-time lookup, select a word and press the GoLearn toolbar button, its keyboard shortcut, or right-click and choose “Look up with GoLearn”. This temporary tab access expires when you navigate to another site or close the tab.',
          [`To use GoLearn Active, open the GoLearn toolbar popup and turn on “GoLearn Active”. Chrome asks you to grant site access. While Active and that optional site access remain enabled, GoLearn scans supported pages on this device until you switch Active off or revoke access.`, h('br', {}), 'Keyboard shortcut: ', h('kbd', {}, SHORTCUT), ' (looks up the selected word once).'],
        ])),
      // Biblia (2026-10-23): its own installable app at the hosted address (config.json bibliaUrl); it was a page of the extension from
      // 2026-10-21 to 2026-10-23, which put 49 MB of Scripture text inside the extension (test/audit/rights.dist). Same account, same card.
      bibliaCard(ctx),
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
        h('p', {}, button('I have installed it', async () => { await ctx.state.patchProgress({ readerAck: true }); ctx.changed(); note.textContent = 'Noted.'; }, { id: 'reader-ack' })),
        note),
      bibliaCard(ctx),
    ]);
  }

  if (!chrome) {
    append(el, [
      h('section', { class: 'card', id: 'mobile-companion' },
        h('h2', {}, 'Use GoLearn on a phone'),
        p('Chrome on phones cannot run this desktop browser extension. Use GoLearn’s hosted mobile companion to paste a word or passage, or share selected text to it from another app on Android.'),
        h('p', {}, h('a', { href: '#/share', id: 'mobile-share-link' }, 'Open GoLearn mobile lookup')),
        h('h3', {}, 'Android: Chrome'),
        h('ol', {},
          h('li', {}, 'Open this GoLearn website in Chrome.'),
          h('li', {}, 'Tap the three-dot menu. Choose “Install app” or “Install and create shortcut,” depending on what Chrome shows, then confirm.'),
          h('li', {}, 'Open the GoLearn icon from your home screen. In another app, select text, tap Share, and choose GoLearn to send it to the lookup screen.'),
        ),
        h('h3', {}, 'iPhone or iPad: Chrome'),
        h('ol', {},
          h('li', {}, 'Open this GoLearn website in Chrome.'),
          h('li', {}, 'Tap Share beside the address bar, choose “Add to Home Screen,” then tap Add.'),
          h('li', {}, 'Open GoLearn from the new home-screen icon. To look something up, paste it into the mobile lookup screen.'),
        ),
        p('On iPhone and iPad, this is a home-screen shortcut. The share-to-GoLearn action from other apps is supported on Android only.', 'muted'),
        h('p', {}, h('a', { href: 'https://support.google.com/chrome/answer/9658361?hl=en-2', target: '_blank', rel: 'noopener' }, 'Google Chrome help: Android and iPhone/iPad web apps')),
      ),
    ]);
  }

  const perms = h('ul', { class: 'perms' }, ...PERMISSIONS.map((x) => h('li', {}, h('code', {}, x.name), ` — ${
    x.name === 'activeTab' ? 'grants temporary access to the current tab after a toolbar click, keyboard shortcut or context-menu lookup; it expires when you navigate to another site or close the tab.'
      : x.name === 'scripting' ? 'adds the one-time lookup card to the current tab; GoLearn Active uses the optional site access described below.'
        : x.why
  }`)), h('li', {}, h('code', {}, 'optional site access'), ' — when you turn on GoLearn Active, Chrome asks permission to scan supported HTTP and HTTPS pages. Turning Active off asks Chrome to withdraw that access.'));
  append(el, [
    h('section', { class: 'card' }, h('h2', {}, 'What it asks permission for'), perms,
      p('GoLearn Active is off by default and has no site access until you turn it on and approve Chrome’s prompt. The one-time lookup uses temporary access to the current tab. Page text is scanned on this device and is not retained as page text. When you are signed in, lookup and mark events sync to your GoLearn account; other optional sharing is controlled under Privacy.')),
    h('section', { class: 'card', id: 'surfaces' }, h('h2', {}, 'Where it works'),
      h('ul', { class: 'surfaces' }, ...SURFACES.map((s) => h('li', { 'data-surface': s.id, 'data-status': s.status }, h('strong', {}, s.name), ' — ', h('span', { class: `status-${s.status}` }, STATUS_LABEL[s.status]), '. ', s.summary))),
      p('GoLearn never bypasses DRM, never scrolls or downloads a book to read it, and never keeps a copy of what you read.', 'muted')),
  ]);
}
