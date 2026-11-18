/**
 * #/setup: choose a language, in GoReview itself (the owner, 2026-11-17: "let them go through the whole set up procedure from GoReview"). Before
 * this, a learner had to choose a language in GoLearn setup first. The list is the language catalogue's, the same rows GoLearn setup shows, so
 * Norwegian asks for its written standard (nothing preselected, nothing guessed) and Spanish offers its regional preference. Choosing enrols the
 * learner on the account (the hosted copy and the iPhone app) or on this device's Repository (inside the extension, where GoLearn sees the same
 * choice), makes it the active language and opens the GoReview home.
 *
 * The home opens this page by itself when the learner has no language yet; the + beside the language in the header opens it to add another.
 * No pack is installed here: GoReview reads each language's dictionary and analyser when it needs them, as it always has.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, statusLine } from '../dom';
import { flushTermsAcceptance } from './consent';
import type { View } from './view';

/** A catalogue row as GoLearn setup shows it (packages/golearn-extension/app/languages.ts). Loaded on demand: most visits never need it. */
type LanguageView = import('../../../golearn-extension/app/ports').LanguageView;

const STANDARD_MESSAGE = 'Norwegian has two written standards, Bokmål and Nynorsk. Choose the one you will read; GoReview never guesses.';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const [{ languagesOf }, { packFor }, mode, enrolments] = await Promise.all([
    import('../../../golearn-extension/app/languages'),
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

  const list = h('ul', { class: 'setup-list', id: 'setup-languages' });
  for (const l of languages) list.append(row(l));

  append(el, [
    h('section', { class: 'card', id: 'setup', 'aria-label': 'Choose your language' },
      p(first
        ? 'Choose the language you want to review. You can add more later with the + beside the language at the top.'
        : 'Add another language, or go back to one you have.'),
      p('GoReview brings back the words you meet: what you look up while reading with GoLearn or Biblia, and words you add yourself under My Vocabulary.', 'muted'),
      list,
      p(mode === 'account'
        ? 'Your choice is saved on your account, so GoLearn and your other devices have it too.'
        : 'Your choice is saved on this device, where GoLearn sees it too. Sign in to keep it across devices (optional).', 'muted'),
      first ? h('p', { class: 'muted', id: 'setup-check' }, 'Chose your language in GoLearn already? ',
        button('Check again', () => { void (async () => { await ctx.refreshProfile(); if ((await ctx.enrolments()).length) ctx.go('review'); })(); }, { id: 'setup-recheck' })) : null),
  ]);

  function row(l: LanguageView): HTMLElement {
    const status = statusLine();
    const choice = l.choice;
    let read: () => { languageId: string; varietyId?: string } | undefined = () => ({ languageId: l.languageId });
    let control: HTMLElement | null = null;
    if (choice?.kind === 'standard') {
      // nothing preselected: the learner names the standard
      const radios = choice.options.map((o) => h('label', { class: 'setup-option' },
        h('input', { type: 'radio', name: `standard-${l.languageId}`, value: o.id }), ` ${o.label}`));
      control = h('fieldset', { class: 'setup-choice', 'data-choice': 'standard' }, h('legend', {}, choice.label), ...radios);
      read = () => {
        const picked = control!.querySelector<HTMLInputElement>('input:checked');
        const o = choice.options.find((x) => x.id === picked?.value);
        return o ? { languageId: o.languageId, ...(o.varietyId ? { varietyId: o.varietyId } : {}) } : undefined;
      };
    } else if (choice?.kind === 'variety') {
      const select = h('select', { name: `variety-${l.languageId}`, 'aria-label': `${l.name}: ${choice.label}` },
        ...choice.options.map((o) => h('option', { value: o.id }, o.label))) as HTMLSelectElement;
      control = h('label', { class: 'setup-choice', 'data-choice': 'variety' }, `${choice.label} `, select);
      read = () => {
        const o = choice.options.find((x) => x.id === select.value) ?? choice.options[0];
        return { languageId: o.languageId, ...(o.varietyId ? { varietyId: o.varietyId } : {}) };
      };
    }
    const have = choice?.kind === 'standard'
      ? choice.options.some((o) => mine.has(o.languageId))
      : mine.has(l.languageId);
    const start = button(have ? `Review ${l.name}` : `Start ${l.name}`, () => { void choose(); }, { class: have ? 'btn' : 'btn primary', 'data-action': 'start' });
    async function choose(): Promise<void> {
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
    return h('li', { class: 'setup-language', 'data-language': l.languageId, 'data-state': have ? 'chosen' : 'new' },
      h('h2', {}, l.name, ' ', h('span', { class: 'muted', lang: l.languageId }, l.nativeName)),
      p(`${l.level}.`, 'muted'),
      control,
      h('p', {}, start),
      status);
  }
}
