/**
 * The language rows (the body of the languages page). Six languages, from the catalogue and in its order, each a compact row: the
 * language and its native name, one line of what level it is at, and at the right a “Download language” menu. Any learner may
 * download any of them freely; there is no team to belong to and no account to hold. Several can be downloaded: all of them stay
 * enabled at once, and the one marked “Reading now” is the one GoLearn records against.
 *
 * Downloading does everything in one go, on the row itself: the enrolment in the on-device Repository (and, when the learner is
 * signed in, one on the account too), then the language pack install with its verification, with the progress and the result shown
 * inline (“Albanian is ready: 16 checks passed”, or the honest failure with a Retry button). Norwegian asks for the written standard
 * (Bokmål or Nynorsk) with nothing preselected and nothing guessed; Spanish offers a regional preference. A downloaded row says
 * “Downloaded · ready” and offers “Use for reading” and “Remove”. What works and what does not, the licences and the checks sit in a
 * collapsed “Details” under the row.
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
  /** Repaint every row’s state and the “what to do next” note. */
  refresh(): Promise<void>;
  /**
   * The language this device reads (the learner’s choice, or else the account’s active enrolment) must have its pack on this device.
   * Straight after sign-in (`afterSignIn`) a pack that is missing, failed, or of another version is installed again; on any other visit
   * only a pack with no install on record is, and only once per run of the application. (A learner who signs in on a new device
   * finds the account’s language already being downloaded.)
   */
  ensureActive(afterSignIn?: boolean): Promise<void>;
}

/** What the row says about the pack, in the words the pack’s own review status allows. Never “reviewed”. */
export function reviewLine(pack: PackView): string {
  return pack.reviewStatus === 'machine-drafted'
    ? `Pack ${pack.version}: machine-drafted, not native-reviewed.`
    : `Pack ${pack.version}: review status ${pack.reviewStatus}.`;
}

type EnrolRow = Pick<Enrolment, 'enrolmentId' | 'languageId'> & Partial<Pick<Enrolment, 'varietyId' | 'packId' | 'startedAt'>>;

interface RowRefs {
  lang: LanguageView;
  row: HTMLElement;
  variety: HTMLSelectElement | undefined;
  /** The one-line “what this pack is” text, in Details and in the Download menu. */
  info: HTMLElement;
  note: HTMLElement;
  choose: HTMLButtonElement;
  /** The Download menu (<details>). */
  menu: HTMLDetailsElement;
  /** Where the downloaded state, Use for reading and Remove sit. */
  mine: HTMLElement;
  more: HTMLElement;
  progress: HTMLProgressElement;
  status: HTMLElement;
  results: HTMLElement;
  installed: HTMLElement;
  installing: boolean;
}

/** One run of the application tries the active language’s missing pack once. */
const attempted = new WeakMap<AppContext, Set<string>>();

export async function renderLanguageSection(el: HTMLElement, ctx: AppContext, view: View): Promise<LanguageSection> {
  const languages = ctx.deps.packs.languages();
  const next = h('div', { id: 'next-steps' });
  const cardsBox = h('ul', { id: 'language-cards', class: 'lang-rows' });
  append(el, [next, cardsBox]);

  const packsOfRow = (l: LanguageView): PackView[] => {
    const ids = l.choice ? l.choice.options.map((o) => o.languageId) : [l.languageId];
    return [...new Set(ids)].map((id) => ctx.deps.packs.packFor(id)).filter((x): x is PackView => !!x);
  };
  const optionOf = (c: RowRefs) => c.lang.choice?.options.find((o) => o.id === c.variety?.value);
  const selectedPack = (c: RowRefs): PackView | undefined => ctx.deps.packs.packFor(optionOf(c)?.languageId ?? c.lang.choice?.options[0]?.languageId ?? c.lang.languageId);

  const rowsOf: RowRefs[] = [];
  let busy = 0;
  /** The enrolments on this device as of the last refresh (so the button can say Download or Use). */
  let enrolledNow: EnrolRow[] = [];

  const isEnrolled = (c: RowRefs): boolean => {
    const pack = selectedPack(c);
    if (!pack) return false;
    const option = optionOf(c);
    return enrolledNow.some((r) => r.languageId === pack.languageId && (c.lang.choice?.kind !== 'variety' || !option?.varietyId || (r.varietyId ?? '') === option.varietyId));
  };

  function describe(c: RowRefs): void {
    const l = c.lang;
    const pack = selectedPack(c);
    let text = '';
    if (l.choice?.required && !c.variety?.value) text = STANDARD_MESSAGE;
    else if (pack) text = pack.status === 'installable' ? `${l.name}: ${l.level}. ${reviewLine(pack)}` : `${l.name}: planned, not installable yet, so it cannot be downloaded.`;
    c.info.textContent = text;
    c.note.textContent = text;
    c.choose.textContent = isEnrolled(c) ? `Use ${l.name}` : `Download ${l.name}`;
    c.choose.setAttribute('aria-label', c.choose.textContent);
    c.choose.disabled = busy > 0 || !pack || pack.status !== 'installable';
  }
  const describeAll = (): void => { for (const r of rowsOf) describe(r); };

  // ── the install, inline on the row
  async function install(c: RowRefs, pack: PackView, intro: string, force: boolean): Promise<void> {
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
    c.installing = true;
    describeAll();
    if (view.alive()) { clear(c.results); c.progress.hidden = false; c.progress.value = 0; }
    set(`Downloading ${pack.name}…`, 'info');
    let result: VerifyView | undefined;
    let problem: string | undefined;
    try {
      result = await installAndRecord(ctx, pack, (fraction, label) => {
        if (!view.alive()) return;
        c.progress.value = fraction;
        if (label) c.status.textContent = `Downloading ${pack.name}… ${label}`;
      });
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy--;
      c.installing = false;
    }
    if (view.alive()) { c.progress.hidden = true; clear(c.results); }
    if (result) {
      if (view.alive()) c.results.append(h('details', { class: 'checks-box' }, h('summary', {}, 'Show the checks'), renderChecks(result)));
      if (result.ok) set(`${pack.name} is ready: ${result.checks.length} checks passed.${intro}`, 'ok');
      else {
        const failed = result.checks.filter((x) => !x.ok).length;
        set(`${pack.name} is downloaded, but its pack did not pass verification: ${failed} of ${result.checks.length} checks failed.${result.message ? ` ${result.message}` : ''}${intro}`, 'error');
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

  /** Download the language on this row: enrol it here (and on the account when signed in), then install and verify its pack. */
  async function chooseOnRow(c: RowRefs): Promise<void> {
    const l = c.lang;
    const ch = l.choice;
    let option = ch?.options.find((o) => o.id === c.variety?.value);
    if (ch?.required && !option) { setStatus(c.status, STANDARD_MESSAGE, 'error'); return; }
    if (ch && !option) option = ch.options[0];
    const pack = ctx.deps.packs.packFor(option?.languageId ?? l.languageId);
    if (!pack) { setStatus(c.status, `GoLearn has no pack for ${l.name} yet.`, 'error'); return; }
    if (pack.status !== 'installable') { setStatus(c.status, `${pack.name} is planned, not installable yet, so it cannot be downloaded.`, 'error'); return; }
    const standard = ch?.kind === 'standard' && (option?.id === 'nb' || option?.id === 'nn') ? option.id : undefined;
    c.menu.open = false;
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

  // ── what is downloaded on this device: every row’s state, the note about what to do next
  async function refresh(): Promise<void> {
    const [active, local, progress] = await Promise.all([ctx.activeLanguage(), ctx.localEnrolments(), ctx.state.getProgress()]);
    if (!view.alive()) return;
    const rows: EnrolRow[] = [...local];
    if (active && !rows.some((r) => r.enrolmentId === active.enrolmentId)) rows.push(active);
    enrolledNow = rows;

    for (const c of rowsOf) {
      const rowPacks = packsOfRow(c.lang);
      const ids = new Set(rowPacks.map((x) => x.languageId));
      const enrolled = rows.filter((r) => ids.has(r.languageId));
      const records = rowPacks.map((pk) => ({ pk, rec: progress.packs[pk.packId] })).filter((x) => x.rec);
      const ready = enrolled.some((e) => { const pk = ctx.deps.packs.packFor(e.languageId); return !!pk && progress.packs[pk.packId]?.ok === true; });
      c.row.classList.toggle('chosen', enrolled.length > 0);
      c.row.setAttribute('data-state', ready ? 'ready' : enrolled.length ? 'chosen' : 'new');
      c.row.setAttribute('data-active', String(!!active && ids.has(active.languageId)));
      c.installed.textContent = records.map(({ pk, rec }) => `Installed here: ${pk.name} version ${rec!.version}, ${rec!.ok ? 'verified' : 'verification failed'} on ${shortDate(rec!.verifiedAt)}.`).join(' ');

      // the downloaded languages of this row: state, Reading now / Use for reading, Remove
      clear(c.mine);
      for (const e of enrolled) {
        const isActive = e.enrolmentId === active?.enrolmentId;
        const pk = ctx.deps.packs.packFor(e.languageId);
        const rec = pk ? progress.packs[pk.packId] : undefined;
        const label = languageLabel(ctx, e.languageId, e.varietyId);
        c.mine.append(h('li', { class: 'mine', 'data-enrolment': e.enrolmentId, 'data-language': e.languageId, 'data-variety': e.varietyId ?? '', 'data-pack-ok': String(rec?.ok === true) },
          enrolled.length > 1 || label !== c.lang.name ? h('strong', {}, `${label} `) : null,
          h('span', { class: rec?.ok ? 'dl-state ok' : 'dl-state error' }, rec ? (rec.ok ? 'Downloaded · ready' : 'Downloaded · did not verify') : 'Download not finished'),
          isActive
            ? h('span', { class: 'tag' }, 'Reading now')
            : button('Use for reading', async () => { await ctx.useEnrolment(e); await refresh(); ctx.changed(); }, { class: 'small', 'data-action': 'use', 'aria-label': `Use for reading: ${label}` }),
          button('Remove', async () => {
            await ctx.removeEnrolment(e);
            if (view.alive()) setStatus(c.status, `${label} is removed from this device. Its downloaded pack stays installed; download it again any time.`, 'info');
            await refresh();
            ctx.changed();
          }, { class: 'small', 'data-action': 'remove', 'aria-label': `Remove ${label}` })));
      }
      // a downloaded language whose pack is not ready and that is not being installed has a way to try again
      if (enrolled.length && !ready && !c.installing && !c.results.querySelector('[data-action="retry"]')) {
        const target = enrolled.map((e) => ctx.deps.packs.packFor(e.languageId)).find((x): x is PackView => !!x && x.status === 'installable');
        if (target) c.results.append(button('Retry', () => { void install(c, target, '', true); }, { class: 'btn primary', 'data-action': 'retry', 'aria-label': `Retry installing ${target.name}` }));
      }
      if (ready) c.results.querySelectorAll('[data-action="retry"]').forEach((b) => b.remove());

      // the Download menu: always for a language with a choice; for the others only until they are downloaded
      c.menu.hidden = !c.lang.choice && enrolled.length > 0;

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

  // ── the six rows
  for (const l of languages) {
    const works = h('ul', { class: 'works' }, ...l.whatWorks.map((x) => h('li', {}, x)));
    const not = h('ul', { class: 'does-not' }, ...l.whatDoesNot.map((x) => h('li', {}, x)));
    const info = h('p', { class: 'muted pack-info', id: `pack-info-${l.languageId}` });
    const note = h('p', { class: 'muted dl-note' });
    const progress = h('progress', { max: '1', value: '0', hidden: true, 'aria-label': `Downloading ${l.name}` }) as HTMLProgressElement;
    const status = statusLine();
    const results = h('div', { class: 'results' });
    const installed = h('p', { class: 'installed muted', id: `installed-${l.languageId}` });
    const more = h('span', { class: 'more' });
    const mine = h('ul', { class: 'mine-list' });
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
    const choose = button(`Download ${l.name}`, () => { void chooseOnRow(c); }, { class: 'btn primary', 'data-action': 'choose', 'aria-label': `Download ${l.name}` });
    const menu = h('details', { class: 'download', id: `download-${l.languageId}` },
      h('summary', { class: 'btn primary', 'aria-label': `Download language: ${l.name}` }, 'Download language'),
      h('div', { class: 'dl-panel' }, varietyField, note, h('div', { class: 'row' }, choose))) as HTMLDetailsElement;

    const row = h('li', { class: 'lang lang-row', 'data-language': l.languageId, 'data-script': l.scriptId, 'aria-labelledby': `lang-h-${l.languageId}` },
      h('div', { class: 'lang-main' },
        h('h3', { id: `lang-h-${l.languageId}`, class: 'lang-name' }, l.name, l.nativeName && l.nativeName !== l.name ? h('span', { class: 'native', lang: l.languageId }, ` ${l.nativeName}`) : null),
        h('p', { class: 'muted lang-level' }, `${l.scriptId} script · ${l.level}${l.choice ? (l.choice.kind === 'standard' ? ' · you choose the written standard' : ' · regional preference offered') : ''}`)),
      h('div', { class: 'lang-actions' }, mine, menu),
      h('div', { class: 'lang-feedback' }, progress, status, results),
      h('details', { class: 'about' }, h('summary', {}, 'Details'),
        info,
        h('h4', {}, 'What works'), works, h('h4', {}, 'What does not'), not,
        h('p', { class: 'audio' }, h('strong', {}, 'Audio: '), l.audio),
        installed, h('div', { class: 'row' }, more)));
    const c: RowRefs = { lang: l, row, variety, info, note, choose, menu, mine, more, progress, status, results, installed, installing: false };
    rowsOf.push(c);
    variety?.addEventListener('change', () => { describe(c); });
    cardsBox.append(row);
    // licences and attribution are shown for every pack of the row, inside Details
    const rowPacks = packsOfRow(l);
    const lic = h('details', { class: 'licences' }, h('summary', {}, 'Licences, attribution and where the pack comes from'));
    for (const pk of rowPacks) {
      if (rowPacks.length > 1) lic.append(h('h4', {}, pk.name));
      if (pk.attribution.length) lic.append(h('ul', { class: 'attribution' }, ...pk.attribution.map((a) => h('li', {}, a))));
      if (pk.licences.length) lic.append(h('ul', {}, ...pk.licences.map((x) => h('li', {}, h('strong', {}, x.resource), ` — ${x.licence}`, x.notice ? h('span', { class: 'muted' }, ` (${x.notice})`) : null))));
      else lic.append(p('This pack states no licence information.', 'muted'));
      if (pk.provenance.length) lic.append(h('ul', { class: 'provenance' }, ...pk.provenance.map((x) => h('li', {}, x))));
    }
    row.querySelector('details.about')!.append(lic);
    describe(c);
  }

  await refresh();

  async function ensureActive(afterSignIn = false): Promise<void> {
    if (!view.alive()) return;
    const [active, progress] = await Promise.all([ctx.activeLanguage(), ctx.state.getProgress()]);
    if (!active?.languageId) return;
    const pack = ctx.deps.packs.packFor(active.languageId);
    const row = rowsOf.find((x) => packsOfRow(x.lang).some((pk) => pk.languageId === active.languageId));
    if (!pack || pack.status !== 'installable' || !row) return;
    const have = progress.packs[pack.packId];
    if (afterSignIn) {
      if (have?.ok === true && have.version === pack.version) return;
    } else {
      if (have) return;
      const tried = attempted.get(ctx) ?? new Set<string>();
      attempted.set(ctx, tried);
      if (tried.has(pack.packId)) return;
      tried.add(pack.packId);
    }
    await install(row, pack, active.enrolmentId && !(await ctx.state.getChoice()) ? ' Taken from your account.' : '', true);
  }

  return { refresh, ensureActive };
}
