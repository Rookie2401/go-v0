/**
 * #/setup: choose a language, in GoReview itself (the owner, 2026-11-17: "let them go through the whole set up procedure from GoReview"). The list
 * is the language catalogue's, the same rows GoLearn setup shows, so Norwegian asks for its written standard (nothing preselected, nothing
 * guessed) and Spanish, Hebrew and Greek offer their varieties. Choosing enrols the learner on the account (the hosted copy and the iPhone app) or
 * on this device's Repository (inside the extension, where GoLearn sees the same choice), makes it the active language and opens the home.
 *
 * In the home's look (the owner, 2026-11-18): the hero (app.ts: "Choose your language" between gold rules, "Languages", the photo), then the
 * home's warm tiles with no outline, YOUR LANGUAGES first and ADD A LANGUAGE after. A language that asks nothing is one tile, pressed like the
 * home's Review Deck: its level as the kicker, its name, its native name. A language that asks a question holds the question and the gold pill.
 *
 * The home opens this page by itself when the learner has no language yet; Account's "Add a language" opens it to add another. No pack is
 * installed here: GoReview reads each language's dictionary and analyser when it needs them, as it always has.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { icon } from '../icons';
import { attachRipple } from '../ripple';
import { flushTermsAcceptance } from './consent';
import type { View } from './view';

/** A catalogue row as GoLearn setup shows it (GoReview's copy, ../languageChoices.ts). Loaded on demand: most visits never need it. */
type LanguageView = import('../languageChoices').LanguageView;

const STANDARD_MESSAGE = 'Norwegian has two written standards, Bokmål and Nynorsk. Choose the one you will read; GoReview never guesses.';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const [{ languagesOf }, { packFor }, mode, enrolments] = await Promise.all([
    import('../languageChoices'),
    import('../../../language-packs/src/registry'),
    ctx.mode(),
    ctx.enrolments().catch(() => []),
  ]);
  if (!view.alive()) return;
  const installable = (l: LanguageView): boolean => l.packIds.some((id) => {
    const languageId = id.replace(/^pack:/, '').split(':')[0];
    return packFor(languageId)?.status === 'installable';
  });
  const languages = languagesOf().filter(installable);
  const mine = new Set(enrolments.map((e) => e.languageId));
  const first = enrolments.length === 0;
  const haveOf = (l: LanguageView): boolean => (l.choice?.kind === 'standard' ? l.choice.options.some((o) => mine.has(o.languageId)) : mine.has(l.languageId));

  // one list (the tests and assistive technology read it as such), the learner's own languages first, each group under its kicker
  const list = h('ul', { class: 'setup-list', id: 'setup-languages' });
  const own = languages.filter(haveOf);
  const rest = languages.filter((l) => !haveOf(l));
  if (own.length) list.append(h('li', { class: 'setup-group' }, h('h2', { class: 'tiles-heading' }, 'Your languages')), ...own.map(row));
  if (rest.length) list.append(h('li', { class: 'setup-group' }, h('h2', { class: 'tiles-heading' }, own.length ? 'Add a language' : 'Languages')), ...rest.map(row));

  append(el, [
    h('section', { class: 'home setup-page', id: 'setup', 'aria-label': 'Choose your language' },
      p(first
        ? 'Choose the language you want to review. You can add more later, under your Account.'
        : 'Add another language, or go back to one you have.', 'setup-lede'),
      p('GoReview brings back the words you meet: what you look up while reading with GoLearn or Biblia, and words you add yourself under My Vocabulary.', 'setup-note'),
      list,
      p(mode === 'account'
        ? 'Your choice is saved on your account, so GoLearn and your other devices have it too.'
        : 'Your choice is saved on this device, where GoLearn sees it too. Sign in to keep it across devices (optional).', 'setup-note'),
      first ? h('p', { class: 'setup-note', id: 'setup-check' }, 'Chose your language in GoLearn already? ',
        button('Check again', () => { void (async () => { await ctx.refreshProfile(); if ((await ctx.enrolments()).length) ctx.go('review'); })(); }, { id: 'setup-recheck', class: 'account-link' })) : null),
  ]);

  function row(l: LanguageView): HTMLElement {
    const status = statusLine();
    const choice = l.choice;
    const have = haveOf(l);
    let read: () => { languageId: string; varietyId?: string } | undefined = () => ({ languageId: l.languageId });
    let control: HTMLElement | null = null;
    if (choice?.kind === 'standard') {
      // nothing guessed: the learner names the standard; only the one they already have is shown chosen. Two words, the chosen one underlined in gold
      const radios = choice.options.map((o) => h('label', { class: 'setup-option' },
        h('input', { type: 'radio', name: `standard-${l.languageId}`, value: o.id, ...(mine.has(o.languageId) ? { checked: true } : {}) }), h('span', {}, o.label)));
      control = h('fieldset', { class: 'setup-choice', 'data-choice': 'standard' }, h('legend', {}, choice.label), ...radios);
      read = () => {
        const picked = control!.querySelector<HTMLInputElement>('input:checked');
        const o = choice.options.find((x) => x.id === picked?.value);
        return o ? { languageId: o.languageId, ...(o.varietyId ? { varietyId: o.varietyId } : {}) } : undefined;
      };
    } else if (choice?.kind === 'variety') {
      const select = h('select', { name: `variety-${l.languageId}`, 'aria-label': `${l.name}: ${choice.label}` },
        ...choice.options.map((o) => h('option', { value: o.id }, o.label))) as HTMLSelectElement;
      control = h('label', { class: 'setup-choice', 'data-choice': 'variety' }, h('span', { class: 'setup-choice-label' }, choice.label), select);
      read = () => {
        const o = choice.options.find((x) => x.id === select.value) ?? choice.options[0];
        return { languageId: o.languageId, ...(o.varietyId ? { varietyId: o.varietyId } : {}) };
      };
    }
    const action = have ? `Review ${l.name}` : `Start ${l.name}`;
    const label = h('span', { class: 'deck-label' },
      h('span', { class: 'deck-kicker' }, have ? 'Yours' : l.level),
      h('span', { class: 'deck-title' }, l.name),
      h('span', { class: 'deck-caption', lang: l.languageId }, l.nativeName));
    async function choose(start: HTMLButtonElement): Promise<void> {
      const picked = read();
      if (!picked) { setStatus(status, STANDARD_MESSAGE, 'error'); return; }
      start.disabled = true;
      setStatus(status, 'Saving your choice…', 'info');
      try {
        const r = await ctx.chooseLanguage(picked);
        if (!view.alive()) return;
        if (!r.ok) { setStatus(status, r.message, 'error'); return; }
        clear(status);
        // a new account's acceptance of the Terms waits for its first language (screens/consent.ts)
        await flushTermsAcceptance(ctx);
        ctx.go('review');
      } finally { start.disabled = false; }
    }
    let tile: HTMLElement;
    if (!control) {
      // nothing to ask: the tile is the button, pressed like the home's tiles
      const face: HTMLButtonElement = button('', () => { void choose(face); }, { class: 'deck-face', 'data-action': 'start', 'aria-label': action });
      face.append(label, icon(ctx.deps.doc, 'arrow'));
      tile = h('div', { class: 'deck-tile', 'data-deck': have ? 'current' : 'language' }, face);
      attachRipple(tile);
    } else {
      // a question first: the tile holds it, and the gold pill acts
      const start: HTMLButtonElement = button(action, () => { void choose(start); }, { class: 'account-pill', 'data-action': 'start' });
      tile = h('div', { class: 'deck-tile account-panel setup-asks', 'data-deck': have ? 'current' : 'language' }, label, control, h('div', { class: 'account-panel-actions' }, start));
    }
    return h('li', { class: 'setup-language', 'data-language': l.languageId, 'data-state': have ? 'chosen' : 'new' }, tile, status);
  }
}
