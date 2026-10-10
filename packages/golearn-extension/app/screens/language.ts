/**
 * 2. Choose your language. Six languages, from the catalogue and in its order, each with what works, what does not and how far
 * the pack is built. Any learner may pick any of them freely; there is no team to belong to and no account to hold.
 *
 * Picking one makes an enrolment in the on-device Repository (and, when the learner is signed in, one on the account too). Norwegian
 * asks for the written standard (Bokmål or Nynorsk) with nothing preselected and nothing guessed; Spanish offers a regional
 * preference. Several languages may be active; the list at the top switches between them.
 */
import type { Enrolment } from '../../../repository-contract/src';
import type { AppContext } from '../context';
import { append, button, clear, field, h, p, setStatus, shortDate, statusLine } from '../dom';
import type { LanguageView } from '../ports';
import type { View } from './view';

const STANDARD_MESSAGE = 'Norwegian has two written standards, Bokmål (nb) and Nynorsk (nn). Choose the one you will read; GoLearn never guesses.';

/** “Norwegian (Bokmål)”, “Spanish (Honduras)”, “Albanian”: the language and, when it matters, its standard or variety. */
export function languageLabel(ctx: AppContext, languageId: string, varietyId: string | undefined): string {
  const pack = ctx.deps.packs.packFor(languageId);
  if (!pack) return languageId;
  const analysed = pack.varieties.filter((v) => v.analysed);
  const v = pack.varieties.find((x) => x.varietyId === varietyId);
  const show = !!v && !v.writtenStandard && analysed.length > 1;
  return `${pack.name}${show ? ` (${v!.label})` : ''}`;
}

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const languages = ctx.deps.packs.languages();
  const listBox = h('section', { class: 'card', id: 'my-languages', 'aria-labelledby': 'mine-h' });
  const cards = h('div', { id: 'language-cards' });
  const formBox = h('section', { class: 'card', 'aria-labelledby': 'enr-form-h' });
  append(el, [
    p('Pick the language you want to read. Any language is open to you, you can add another one later, and you do not need an account: your choice and your lookups stay on this device.'),
    listBox, cards, formBox,
  ]);

  // ── the languages already chosen on this device, with a switcher
  async function paintList(): Promise<void> {
    const [active, local] = await Promise.all([ctx.activeLanguage(), ctx.localEnrolments()]);
    if (!view.alive()) return;
    clear(listBox);
    listBox.append(h('h2', { id: 'mine-h' }, 'Your languages on this device'));
    const rows: Array<Pick<Enrolment, 'enrolmentId' | 'languageId'> & Partial<Pick<Enrolment, 'varietyId' | 'packId' | 'startedAt'>>> = [...local];
    if (active && !rows.some((r) => r.enrolmentId === active.enrolmentId)) rows.push(active);
    if (!rows.length) { listBox.append(p('None yet. Choose one below.', 'muted')); return; }
    const list = h('ul', { class: 'enrolments', id: 'enrolments' });
    for (const e of rows) {
      const isActive = e.enrolmentId === active?.enrolmentId;
      list.append(h('li', { 'data-enrolment': e.enrolmentId, 'data-language': e.languageId, 'data-variety': e.varietyId ?? '' },
        h('strong', {}, languageLabel(ctx, e.languageId, e.varietyId)), ' ',
        e.startedAt ? h('span', { class: 'muted' }, `· since ${shortDate(e.startedAt)}`) : null, ' ',
        isActive ? h('span', { class: 'tag' }, 'reading now') : button('Use this one', async () => { await ctx.useEnrolment(e); await paintList(); }, { class: 'small', 'data-action': 'use' })));
    }
    listBox.append(list);
  }

  // ── the form: the language (and its standard or variety)
  const language = h('select', { id: 'language', name: 'language' }) as HTMLSelectElement;
  const variety = h('select', { id: 'variety', name: 'variety' }) as HTMLSelectElement;
  const varietyCap = h('span', { class: 'cap' }, 'Variety');
  const varietyField = h('label', { class: 'field' }, varietyCap, variety);
  varietyField.hidden = true;
  const info = h('p', { class: 'muted', id: 'pack-info' });
  const status = statusLine();
  const enrol = h('button', { type: 'submit', id: 'enrol', class: 'btn primary' }, 'Start with this language') as HTMLButtonElement;
  const form = h('form', { id: 'enrol-form' }, field('Language', language), varietyField, info, h('div', { class: 'row' }, enrol), status);
  append(formBox, [h('h2', { id: 'enr-form-h' }, 'Start reading a language'), form]);

  const opt = (value: string, text: string): HTMLOptionElement => h('option', { value, ...(value ? {} : { selected: true }) }, text) as HTMLOptionElement;
  // the English name only: an <option> cannot carry a span with its own lang, and the native names are on the cards (with lang)
  language.append(opt('', 'Choose a language…'), ...languages.map((l) => opt(l.languageId, l.name)));

  const selected = (): LanguageView | undefined => languages.find((l) => l.languageId === language.value);
  const packOf = (l: LanguageView | undefined) => {
    if (!l) return undefined;
    const option = l.choice?.options.find((o) => o.id === variety.value);
    return ctx.deps.packs.packFor(option?.languageId ?? l.choice?.options[0]?.languageId ?? l.languageId);
  };

  function fillVarieties(): void {
    clear(variety);
    const l = selected();
    const c = l?.choice;
    varietyField.hidden = !c;
    if (c) {
      varietyCap.textContent = c.kind === 'standard' ? 'Written standard' : 'Regional preference (optional)';
      if (c.required) variety.append(opt('', 'Choose the written standard…'));
      for (const o of c.options) variety.append(opt(o.id, o.label));
      if (!c.required && c.options[0]) variety.value = c.options[0].id;
    }
    describe();
    cards.querySelectorAll('[data-language]').forEach((card) => card.classList.toggle('chosen', card.getAttribute('data-language') === language.value));
  }

  function describe(): void {
    const l = selected();
    const pack = packOf(l);
    const parts: string[] = [];
    if (l && l.choice?.required && !variety.value) parts.push(STANDARD_MESSAGE);
    else if (l && pack) parts.push(pack.status === 'installable' ? `${l.name}: ${l.level}. Pack ${pack.version}; review status: ${pack.reviewStatus}.` : `${l.name}: planned, not installable yet, so it cannot be chosen.`);
    info.textContent = parts.join(' ');
    enrol.disabled = !l || (!!pack && pack.status !== 'installable');
  }

  language.addEventListener('change', fillVarieties);
  variety.addEventListener('change', describe);

  // ── the six cards
  for (const l of languages) cards.append(languageCard(l, () => {
    language.value = l.languageId;
    fillVarieties();
    try { language.focus({ preventScroll: false }); } catch { /* focus is a convenience */ }
  }));

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      const l = selected();
      if (!l) { setStatus(status, 'Choose a language.', 'error'); return; }
      const c = l.choice;
      let option = c?.options.find((o) => o.id === variety.value);
      if (c?.required && !option) { setStatus(status, STANDARD_MESSAGE, 'error'); return; }
      if (c && !option) option = c.options[0];
      const pack = ctx.deps.packs.packFor(option?.languageId ?? l.languageId);
      if (!pack) { setStatus(status, `GoLearn has no pack for ${l.name} yet.`, 'error'); return; }
      if (pack.status !== 'installable') { setStatus(status, `${pack.name} is planned, not installable yet, so it cannot be chosen.`, 'error'); return; }
      const standard = c?.kind === 'standard' && (option?.id === 'nb' || option?.id === 'nn') ? option.id : undefined;
      enrol.disabled = true;
      setStatus(status, 'Saving your choice…', 'info');
      try {
        const r = await ctx.chooseLanguage({ pack, ...(option?.varietyId ? { varietyId: option.varietyId } : {}), ...(standard ? { standard } : {}) });
        if (!r.ok) { setStatus(status, r.message, 'error'); return; }
        const name = languageLabel(ctx, r.choice.languageId, r.choice.varietyId);
        setStatus(status, r.where === 'account'
          ? `Chosen: ${name}. Saved on this device and on your account. Next, install the language pack.`
          : `Chosen: ${name}. Saved on this device${r.accountProblem ? `; your account could not be updated (${r.accountProblem})` : ''}. Next, install the language pack.`, r.accountProblem ? 'info' : 'ok');
        await paintList();
        ctx.changed();
      } finally {
        describe();
      }
    })();
  });

  fillVarieties();
  await paintList();
}

function languageCard(l: LanguageView, choose: () => void): HTMLElement {
  const works = h('ul', { class: 'works' }, ...l.whatWorks.map((x) => h('li', {}, x)));
  const not = h('ul', { class: 'does-not' }, ...l.whatDoesNot.map((x) => h('li', {}, x)));
  return h('section', { class: 'card lang', 'data-language': l.languageId, 'data-script': l.scriptId, 'aria-labelledby': `lang-h-${l.languageId}` },
    h('h2', { id: `lang-h-${l.languageId}` }, l.name, l.nativeName && l.nativeName !== l.name ? h('span', { class: 'native', lang: l.languageId }, ` ${l.nativeName}`) : null),
    h('p', { class: 'muted' }, `${l.scriptId} script · ${l.level}${l.choice ? (l.choice.kind === 'standard' ? ' · you choose the written standard' : ' · regional preference offered') : ''}`),
    h('h3', {}, 'What works'), works,
    h('h3', {}, 'What does not'), not,
    h('p', { class: 'audio' }, h('strong', {}, 'Audio: '), l.audio),
    h('p', { class: 'muted' }, l.tutorialAvailable ? 'Has an orientation that walks you through the card.' : 'No orientation yet; the card works the same way on any page.'),
    h('div', { class: 'row' }, button(`Choose ${l.name}`, choose, { class: 'btn', 'data-action': 'choose', 'aria-label': `Choose ${l.name}` })));
}
