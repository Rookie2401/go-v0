/**
 * Choose your language (a section of the Welcome screen). Six languages, from the catalogue and in its order, each with what
 * works, what does not and how far the pack is built. Any learner may pick any of them freely; there is no team to belong to and
 * no account to hold.
 *
 * Choosing one does everything in one go, on the card itself: the enrolment in the on-device Repository (and, when the learner is
 * signed in, one on the account too), then the language pack install with its verification, with the progress and the result
 * shown inline ("Albanian is ready: 16 checks passed", or the honest failure with a Retry button). Norwegian asks for the written
 * standard (Bokmål or Nynorsk) with nothing preselected and nothing guessed; Spanish offers a regional preference. Several
 * languages may be chosen; the list at the top marks the one being read and switches between them.
 */
import type { Enrolment } from '../../../repository-contract/src';
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, shortDate, statusLine } from '../dom';
import { installAndRecord, renderChecks, verifyAndRecord } from '../packInstall';
import type { LanguageView, PackView, VerifyView } from '../ports';
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

export interface LanguageSection {
  /** Repaint the list of chosen languages, each card’s state and the “what to do next” note. */
  refresh(): Promise<void>;
  /** After sign-in: finish what is missing for the language this device or the account already uses (its enrolment here, its pack). */
  ensureActive(): Promise<void>;
}

/** What the card says about the pack, in the words the pack’s own review status allows. Never “reviewed”. */
export function reviewLine(pack: PackView): string {
  return pack.reviewStatus === 'machine-drafted'
    ? `Pack ${pack.version}: machine-drafted, not native-reviewed.`
    : `Pack ${pack.version}: review status ${pack.reviewStatus}.`;
}

interface CardRefs {
  lang: LanguageView;
  card: HTMLElement;
  variety: HTMLSelectElement | undefined;
  info: HTMLElement;
  choose: HTMLButtonElement;
  more: HTMLElement;
  progress: HTMLProgressElement;
  status: HTMLElement;
  results: HTMLElement;
  installed: HTMLElement;
}

export async function renderLanguageSection(el: HTMLElement, ctx: AppContext, view: View): Promise<LanguageSection> {
  const languages = ctx.deps.packs.languages();
  const next = h('div', { id: 'next-steps' });
  const listBox = h('div', { id: 'my-languages' });
  const cardsBox = h('div', { id: 'language-cards' });
  append(el, [
    p('Pick the language you want to read. Choosing it sets everything up: GoLearn saves the choice on this device and installs the language’s pack, checking it as it goes. You can choose more than one, and you do not need an account.'),
    next, listBox, cardsBox,
  ]);

  const packsOfCard = (l: LanguageView): PackView[] => {
    const ids = l.choice ? l.choice.options.map((o) => o.languageId) : [l.languageId];
    return [...new Set(ids)].map((id) => ctx.deps.packs.packFor(id)).filter((x): x is PackView => !!x);
  };
  const selectedPack = (c: CardRefs): PackView | undefined => {
    const l = c.lang;
    const option = l.choice?.options.find((o) => o.id === c.variety?.value);
    return ctx.deps.packs.packFor(option?.languageId ?? l.choice?.options[0]?.languageId ?? l.languageId);
  };

  const refs: CardRefs[] = [];
  let busy = 0;

  function describe(c: CardRefs): void {
    const l = c.lang;
    const pack = selectedPack(c);
    if (l.choice?.required && !c.variety?.value) c.info.textContent = STANDARD_MESSAGE;
    else if (pack) c.info.textContent = pack.status === 'installable' ? `${l.name}: ${l.level}. ${reviewLine(pack)}` : `${l.name}: planned, not installable yet, so it cannot be chosen.`;
    else c.info.textContent = '';
    c.choose.disabled = busy > 0 || !pack || pack.status !== 'installable';
  }
  const describeAll = (): void => { for (const r of refs) describe(r); };

  // ── the install, inline on the card
  async function install(c: CardRefs, pack: PackView, intro: string, force: boolean): Promise<void> {
    const progress0 = await ctx.state.getProgress();
    const have = progress0.packs[pack.packId];
    const set = (text: string, kind: 'info' | 'ok' | 'error'): void => { if (view.alive()) setStatus(c.status, text, kind); };
    if (!force && have?.ok && have.version === pack.version) {
      set(`${pack.name} is ready: already installed and verified on this device (version ${have.version}).${intro}`, 'ok');
      await refresh();
      ctx.changed();
      return;
    }
    busy++;
    describeAll();
    if (view.alive()) { clear(c.results); c.progress.hidden = false; c.progress.value = 0; }
    set(`Installing ${pack.name}…`, 'info');
    let result: VerifyView | undefined;
    let problem: string | undefined;
    try {
      result = await installAndRecord(ctx, pack, (fraction, label) => {
        if (!view.alive()) return;
        c.progress.value = fraction;
        if (label) c.status.textContent = `Installing ${pack.name}… ${label}`;
      });
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy--;
    }
    if (view.alive()) { c.progress.hidden = true; clear(c.results); }
    if (result) {
      if (view.alive()) c.results.append(h('details', { class: 'checks-box' }, h('summary', {}, 'Show the checks'), renderChecks(result)));
      if (result.ok) set(`${pack.name} is ready: ${result.checks.length} checks passed.${intro}`, 'ok');
      else {
        const failed = result.checks.filter((x) => !x.ok).length;
        set(`${pack.name} is chosen, but its pack did not pass verification: ${failed} of ${result.checks.length} checks failed.${result.message ? ` ${result.message}` : ''}${intro}`, 'error');
      }
    } else {
      set(`The ${pack.name} pack did not install: ${problem}. Your choice is saved; try again.${intro}`, 'error');
    }
    if (view.alive() && !result?.ok) {
      c.results.append(button('Retry', () => { void install(c, pack, intro, true); }, { class: 'btn primary', 'data-action': 'retry', 'aria-label': `Retry installing ${pack.name}` }));
    }
    await refresh();
    ctx.changed();
  }

  /** Choose the language on this card and install its pack. */
  async function chooseOnCard(c: CardRefs): Promise<void> {
    const l = c.lang;
    const ch = l.choice;
    let option = ch?.options.find((o) => o.id === c.variety?.value);
    if (ch?.required && !option) { setStatus(c.status, STANDARD_MESSAGE, 'error'); return; }
    if (ch && !option) option = ch.options[0];
    const pack = ctx.deps.packs.packFor(option?.languageId ?? l.languageId);
    if (!pack) { setStatus(c.status, `GoLearn has no pack for ${l.name} yet.`, 'error'); return; }
    if (pack.status !== 'installable') { setStatus(c.status, `${pack.name} is planned, not installable yet, so it cannot be chosen.`, 'error'); return; }
    const standard = ch?.kind === 'standard' && (option?.id === 'nb' || option?.id === 'nn') ? option.id : undefined;
    busy++;
    describeAll();
    setStatus(c.status, 'Saving your choice…', 'info');
    let where = '';
    try {
      const r = await ctx.chooseLanguage({ pack, ...(option?.varietyId ? { varietyId: option.varietyId } : {}), ...(standard ? { standard } : {}) });
      if (!r.ok) { if (view.alive()) setStatus(c.status, r.message, 'error'); return; }
      where = r.where === 'account'
        ? ' Saved on this device and on your account.'
        : ` Saved on this device${r.accountProblem ? `; your account could not be updated (${r.accountProblem})` : ''}.`;
    } finally {
      busy--;
      describeAll();
    }
    await install(c, pack, where, false);
  }

  // ── what is chosen on this device: the list, the cards’ state, the note about what to do next
  async function refresh(): Promise<void> {
    const [active, local, progress] = await Promise.all([ctx.activeLanguage(), ctx.localEnrolments(), ctx.state.getProgress()]);
    if (!view.alive()) return;
    const rows: Array<Pick<Enrolment, 'enrolmentId' | 'languageId'> & Partial<Pick<Enrolment, 'varietyId' | 'packId' | 'startedAt'>>> = [...local];
    if (active && !rows.some((r) => r.enrolmentId === active.enrolmentId)) rows.push(active);

    clear(listBox);
    if (rows.length) {
      listBox.append(h('h3', { id: 'mine-h', class: 'sub' }, 'Your languages on this device'));
      const list = h('ul', { class: 'enrolments', id: 'enrolments', 'aria-labelledby': 'mine-h' });
      for (const e of rows) {
        const isActive = e.enrolmentId === active?.enrolmentId;
        const pack = ctx.deps.packs.packFor(e.languageId);
        const rec = pack ? progress.packs[pack.packId] : undefined;
        list.append(h('li', { 'data-enrolment': e.enrolmentId, 'data-language': e.languageId, 'data-variety': e.varietyId ?? '', 'data-pack-ok': String(rec?.ok === true) },
          h('strong', {}, languageLabel(ctx, e.languageId, e.varietyId)), ' ',
          e.startedAt ? h('span', { class: 'muted' }, `· since ${shortDate(e.startedAt)}`) : null, ' ',
          h('span', { class: 'muted' }, rec ? (rec.ok ? '· pack ready' : '· pack did not verify') : '· pack not installed'), ' ',
          isActive ? h('span', { class: 'tag' }, 'reading now') : button('Use this one', async () => { await ctx.useEnrolment(e); await refresh(); ctx.changed(); }, { class: 'small', 'data-action': 'use', 'aria-label': `Use this one: ${languageLabel(ctx, e.languageId, e.varietyId)}` })));
      }
      listBox.append(list);
    }

    // each card: chosen? installed? the active one is marked
    for (const c of refs) {
      const cardPacks = packsOfCard(c.lang);
      const ids = new Set(cardPacks.map((x) => x.languageId));
      const enrolled = rows.filter((r) => ids.has(r.languageId));
      const records = cardPacks.map((pk) => ({ pk, rec: progress.packs[pk.packId] })).filter((x) => x.rec);
      const ready = records.some((x) => x.rec!.ok);
      c.card.classList.toggle('chosen', enrolled.length > 0);
      c.card.setAttribute('data-state', ready ? 'ready' : enrolled.length ? 'chosen' : 'new');
      c.card.setAttribute('data-active', String(!!active && ids.has(active.languageId)));
      c.installed.textContent = records.map(({ pk, rec }) => `Installed here: ${pk.name} version ${rec!.version}, ${rec!.ok ? 'verified' : 'verification failed'} on ${shortDate(rec!.verifiedAt)}.`).join(' ');
      c.choose.textContent = enrolled.length ? `Use ${c.lang.name}` : `Choose ${c.lang.name}`;
      c.choose.setAttribute('aria-label', c.choose.textContent);
      clear(c.more);
      const have = records.find((x) => x.pk === selectedPack(c));
      if (have && have.pk.status === 'installable') {
        c.more.append(
          button('Re-verify', async () => {
            c.more.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
            setStatus(c.status, 'Checking…', 'info');
            try {
              const r = await verifyAndRecord(ctx, have.pk);
              if (!view.alive()) return;
              clear(c.results);
              c.results.append(h('details', { class: 'checks-box', open: true }, h('summary', {}, 'The checks'), renderChecks(r)));
              setStatus(c.status, r.ok ? `Verified ${have.pk.name} ${r.version ?? have.pk.version}.` : `${have.pk.name} did not pass verification.`, r.ok ? 'ok' : 'error');
              await refresh();
              ctx.changed();
            } catch (e) {
              if (view.alive()) setStatus(c.status, `The check did not complete: ${e instanceof Error ? e.message : String(e)}`, 'error');
            } finally {
              c.more.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = false; });
            }
          }, { class: 'small', 'data-action': 'verify', 'aria-label': `Re-verify ${have.pk.name}` }),
          button('Reinstall', () => { void install(c, have.pk, '', true); }, { class: 'small', 'data-action': 'install', 'aria-label': `Reinstall ${have.pk.name}` }));
      }
      describe(c);
    }

    // what to do next, once a language is ready
    clear(next);
    const pack = active?.languageId ? ctx.deps.packs.packFor(active.languageId) : undefined;
    if (active && pack && progress.packs[pack.packId]?.ok === true) {
      next.append(h('div', { class: 'notice', id: 'next-note', role: 'status' },
        h('strong', {}, `${languageLabel(ctx, active.languageId, active.varietyId)} is ready. `),
        ctx.inExtension
          ? 'Next: open a page in the language and switch on GoLearn Active in the extension popup. Then select any word.'
          : 'Next: open a page in the language and switch on GoLearn Active in the extension popup. GoLearn reads pages as a browser extension; the link at the bottom of this page says how it is installed.'));
    }
  }

  // ── the six cards
  for (const l of languages) {
    const works = h('ul', { class: 'works' }, ...l.whatWorks.map((x) => h('li', {}, x)));
    const not = h('ul', { class: 'does-not' }, ...l.whatDoesNot.map((x) => h('li', {}, x)));
    const info = h('p', { class: 'muted pack-info', id: `pack-info-${l.languageId}` });
    const progress = h('progress', { max: '1', value: '0', hidden: true, 'aria-label': `Installing ${l.name}` }) as HTMLProgressElement;
    const status = statusLine();
    const results = h('div', { class: 'results' });
    const installed = h('p', { class: 'installed muted', id: `installed-${l.languageId}` });
    const more = h('span', { class: 'more' });
    let variety: HTMLSelectElement | undefined;
    let varietyField: HTMLElement | null = null;
    const opt = (value: string, text: string): HTMLOptionElement => h('option', { value }, text) as HTMLOptionElement;
    if (l.choice) {
      variety = h('select', { id: `variety-${l.languageId}`, name: 'variety', class: 'variety' }) as HTMLSelectElement;
      if (l.choice.required) variety.append(opt('', 'Choose the written standard…'));
      for (const o of l.choice.options) variety.append(opt(o.id, o.label));
      if (!l.choice.required && l.choice.options[0]) variety.value = l.choice.options[0].id;
      varietyField = h('label', { class: 'field' },
        h('span', { class: 'cap' }, l.choice.kind === 'standard' ? 'Written standard' : 'Regional preference (optional)'), variety);
    }
    const choose = button(`Choose ${l.name}`, () => { void chooseOnCard(c); }, { class: 'btn primary', 'data-action': 'choose', 'aria-label': `Choose ${l.name}` });
    const card = h('section', { class: 'card lang', 'data-language': l.languageId, 'data-script': l.scriptId, 'aria-labelledby': `lang-h-${l.languageId}` },
      h('h3', { id: `lang-h-${l.languageId}`, class: 'lang-name' }, l.name, l.nativeName && l.nativeName !== l.name ? h('span', { class: 'native', lang: l.languageId }, ` ${l.nativeName}`) : null),
      h('p', { class: 'muted' }, `${l.scriptId} script · ${l.level}${l.choice ? (l.choice.kind === 'standard' ? ' · you choose the written standard' : ' · regional preference offered') : ''}`),
      info,
      h('details', { class: 'about' }, h('summary', {}, 'What works and what does not'),
        h('h4', {}, 'What works'), works, h('h4', {}, 'What does not'), not,
        h('p', { class: 'audio' }, h('strong', {}, 'Audio: '), l.audio)),
      varietyField,
      h('div', { class: 'row' }, choose, more),
      progress, status, results, installed);
    const c: CardRefs = { lang: l, card, variety, info, choose, more, progress, status, results, installed };
    refs.push(c);
    variety?.addEventListener('change', () => { describe(c); });
    cardsBox.append(card);
    // licences and attribution are shown for every pack of the card
    const cardPacks = packsOfCard(l);
    const lic = h('details', { class: 'licences' }, h('summary', {}, 'Licences, attribution and where the pack comes from'));
    for (const pk of cardPacks) {
      if (cardPacks.length > 1) lic.append(h('h4', {}, pk.name));
      if (pk.attribution.length) lic.append(h('ul', { class: 'attribution' }, ...pk.attribution.map((a) => h('li', {}, a))));
      if (pk.licences.length) lic.append(h('ul', {}, ...pk.licences.map((x) => h('li', {}, h('strong', {}, x.resource), ` — ${x.licence}`, x.notice ? h('span', { class: 'muted' }, ` (${x.notice})`) : null))));
      else lic.append(p('This pack states no licence information.', 'muted'));
      if (pk.provenance.length) lic.append(h('ul', { class: 'provenance' }, ...pk.provenance.map((x) => h('li', {}, x))));
    }
    card.append(lic);
    describe(c);
  }

  await refresh();

  async function ensureActive(): Promise<void> {
    if (!view.alive()) return;
    // the language this device reads (the learner’s choice here, or else the account’s active enrolment): its pack must be installed
    const [active, progress] = await Promise.all([ctx.activeLanguage(), ctx.state.getProgress()]);
    if (!active?.languageId) return;
    const pack = ctx.deps.packs.packFor(active.languageId);
    const card = refs.find((x) => packsOfCard(x.lang).some((pk) => pk.languageId === active.languageId));
    if (!pack || pack.status !== 'installable' || !card) return;
    if (progress.packs[pack.packId]?.ok === true && progress.packs[pack.packId]?.version === pack.version) return;
    await install(card, pack, active.enrolmentId && !(await ctx.state.getChoice()) ? ' Taken from your account.' : '', true);
  }

  return { refresh, ensureActive };
}
