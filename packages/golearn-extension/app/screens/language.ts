/**
 * The language rows (the body of the Languages page; redesigned 2026-11-11, docs/golearn/DESIGN-SYSTEM.md). The catalogue's languages in two
 * groups: YOUR LANGUAGES (the ones downloaded here; the one you read in says “Reading now”, the others offer “Use for reading”) and MORE
 * LANGUAGES (the rest, in the catalogue's order). A row is the language and its native name, one quiet line of what level its pack is at, and
 * ONE action. Any learner may download any of them freely; there is no team to belong to and no account to hold.
 *
 * Downloading does everything in one go, on the row itself: the enrolment in the on-device Repository (and, when the learner is
 * signed in, one on the account too), then the language pack install with its verification, with the progress and the result shown
 * inline (“Albanian is ready: 16 checks passed”, or the honest failure with a Retry button). A language with nothing to ask downloads on
 * one press; one that asks first (Norwegian's written standard, with nothing preselected and nothing guessed; a regional preference; a
 * period) opens its question in the row. What works and what does not, the licences and the checks sit in a collapsed “Details”.
 *
 * The display is GoReview's (the owner, 2026-11-26: “Look at the language display of GoReview, please copy it and port it over to GoLearn”;
 * packages/goreview/app/screens/account.ts `languageSettings`): a language is a tile whose face holds its name with the native name beside
 * it, “Reading now” above the one being read in, and a caret; opened, it lists its TRACKS as rows (Germany, Austria, Switzerland; Biblical,
 * Modern), each one a single control with its state at the end of the line (“Reading now”, “Use for reading”, “Download”). A language with
 * one track has one row. Norwegian's written standard is GoReview's two words and a pill, with nothing chosen until the learner chooses.
 * GoLearn keeps what its own page needs and GoReview's has no use for: Remove on a downloaded track, the download's progress and result,
 * “Download for offline use” and Details.
 */
import type { Enrolment } from '../../../repository-contract/src';
import type { AppContext } from '../context';
import { append, button, clear, h, p, setStatus, shortDate, statusLine } from '../dom';
import { installAndRecord, renderChecks, sourceLabel, verifyAndRecord, type InstallResult } from '../packInstall';
import type { LanguageView, PackView } from '../ports';
import { createOfflineBlock, hasDictionary } from './offline';
import type { View } from './view';

const STANDARD_MESSAGE = 'Norwegian has two written standards, Bokmål (nb) and Nynorsk (nn). Choose the one you will read; GoLearn never guesses.';

/**
 * “Norwegian (Bokmål)”, “Spanish (Honduras)”, “Hebrew (Modern Hebrew)”, “Albanian”: the language and, when it matters, its standard or
 * variety. A remark the variety's own label carries in brackets (“Modern Hebrew (the default target)”) belongs to the list it is chosen
 * from, not to a name: it is left out here.
 */
export function languageLabel(ctx: AppContext, languageId: string, varietyId: string | undefined): string {
  const pack = ctx.deps.packs.packFor(languageId);
  if (!pack) return languageId;
  const analysed = pack.varieties.filter((v) => v.analysed);
  const v = pack.varieties.find((x) => x.varietyId === varietyId);
  const show = !!v && !v.writtenStandard && analysed.length > 1;
  const variety = show ? v!.label.replace(/\s*\([^)]*\)\s*$/u, '').trim() : '';
  return `${pack.name}${variety ? ` (${variety})` : ''}`;
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
  reading: HTMLElement;
  row: HTMLElement;
  /** The written-standard question (Norwegian): two words, none chosen until the learner chooses. Absent for every other language. */
  standard: HTMLFieldSetElement | undefined;
  /** The one-line “what this pack is” text, in Details. */
  info: HTMLElement;
  /** The pill under the written-standard question. Absent for every other language: their tracks are the controls. */
  choose: HTMLButtonElement | undefined;
  /** The language's tracks, one row each: its state, and the one thing to do with it (Download, Use for reading), then Remove. */
  tracks: HTMLElement;
  /** The offline-download blocks of the row's packs (extension only), by pack language. */
  offline: HTMLElement;
  more: HTMLElement;
  progress: HTMLProgressElement;
  status: HTMLElement;
  results: HTMLElement;
  installed: HTMLElement;
  installing: boolean;
}

/** One run of the application tries the active language’s missing pack once. */
const attempted = new WeakMap<AppContext, Set<string>>();

export async function renderLanguageSection(el: HTMLElement, ctx: AppContext, view: View, slots: { next?: HTMLElement; onCount?: (chosen: number) => void } = {}): Promise<LanguageSection> {
  const languages = ctx.deps.packs.languages().map((language): LanguageView => {
    const choice = language.choice;
    const ids = choice?.kind === 'standard' ? [...new Set(choice.options.map((o) => o.languageId))] : [language.languageId];
    const options = ids.flatMap((languageId) => {
      const pack = ctx.deps.packs.packFor(languageId);
      if (pack?.status !== 'installable') return [];
      return pack.varieties.filter((v) => v.analysed && (v.varietyId === languageId || v.varietyId.startsWith(`${languageId}-`)))
        .map((v) => ({
          id: choice?.options.find((o) => o.languageId === languageId && o.varietyId === v.varietyId)?.id ?? v.varietyId,
          languageId, varietyId: v.varietyId, label: v.label.replace(/\s*\([^)]*\)\s*$/u, ''),
        }));
    });
    if (language.languageId === 'he' || language.languageId === 'el') options.reverse();
    else if (choice && choice.kind !== 'standard') {
      const first = options.findIndex((option) => option.id === choice.options[0]?.id);
      if (first > 0) options.unshift(...options.splice(first, 1));
    }
    return { ...language, choice: options.length > 1
      ? { kind: choice?.kind ?? 'variety', required: choice?.required ?? true, label: choice?.label ?? 'Choose a track', options }
      : undefined };
  });
  // the one line for a screen reader (see refresh): at the top of the page when the page gives it a place, else above the rows
  const next = slots.next ?? h('div', { id: 'next-steps' });
  // one list, two groups, each under its label: the rows are moved between them as languages are downloaded and removed
  const mineHead = h('li', { class: 'lang-group', id: 'my-languages', hidden: true }, h('h2', { id: 'my-languages-h' }, 'Your languages'));
  const moreHead = h('li', { class: 'lang-group', id: 'more-languages' }, h('h2', { id: 'more-languages-h' }, 'Choose a language'));
  const cardsBox = h('ul', { id: 'language-cards', class: 'lang-rows' }, mineHead, moreHead);
  append(el, slots.next ? [cardsBox] : [next, cardsBox]);
  let arranged = '';
  /**
   * Put every row under its group's label: the language being read in first (as GoReview puts the one being reviewed), then the catalogue's
   * order. Only when the order changed; a moved row loses the focus, so it is given back.
   */
  function arrange(chosen: ReadonlySet<HTMLElement>): void {
    const mine = rowsOf.filter((r) => chosen.has(r.row));
    const reading = (r: RowRefs): boolean => r.row.getAttribute('data-active') === 'true';
    const order = [mineHead, ...mine.filter(reading).map((r) => r.row), ...mine.filter((r) => !reading(r)).map((r) => r.row), moreHead, ...rowsOf.filter((r) => !chosen.has(r.row)).map((r) => r.row)];
    const sig = order.map((n) => n.id || n.getAttribute('data-language')).join(' ');
    mineHead.hidden = chosen.size === 0;
    slots.onCount?.(chosen.size);
    moreHead.hidden = chosen.size === rowsOf.length;
    (moreHead.firstElementChild as HTMLElement).textContent = chosen.size ? 'More languages' : 'Choose a language';
    if (sig === arranged) return;
    arranged = sig;
    const held = cardsBox.ownerDocument.activeElement as HTMLElement | null;
    for (const n of order) cardsBox.append(n);
    if (held && cardsBox.contains(held) && cardsBox.ownerDocument.activeElement !== held) held.focus();
  }

  const packsOfRow = (l: LanguageView): PackView[] => {
    const ids = l.choice ? l.choice.options.map((o) => o.languageId) : [l.languageId];
    return [...new Set(ids)].map((id) => ctx.deps.packs.packFor(id)).filter((x): x is PackView => !!x);
  };
  type Option = NonNullable<LanguageView['choice']>['options'][number];
  /** The written standard the learner has named on the row (Norwegian); nothing for a language whose tracks are rows. */
  const optionOf = (c: RowRefs): Option | undefined => {
    const picked = c.standard?.querySelector<HTMLInputElement>('input:checked')?.value;
    return picked === undefined ? undefined : c.lang.choice?.options.find((o) => o.id === picked);
  };
  const selectedPack = (c: RowRefs): PackView | undefined => ctx.deps.packs.packFor(optionOf(c)?.languageId ?? c.lang.choice?.options[0]?.languageId ?? c.lang.languageId);

  const rowsOf: RowRefs[] = [];
  const offlineBlocks = new Map<string, ReturnType<typeof createOfflineBlock>>();
  let busy = 0;
  /** The enrolments on this device as of the last refresh (so the button can say Download or Use). */
  let enrolledNow: EnrolRow[] = [];

  const isEnrolled = (c: RowRefs): boolean => {
    const pack = selectedPack(c);
    if (!pack) return false;
    const option = optionOf(c);
    return enrolledNow.some((r) => r.languageId === pack.languageId && (!option?.varietyId || (r.varietyId ?? pack.defaultVarietyId) === option.varietyId));
  };

  function describe(c: RowRefs): void {
    const l = c.lang;
    const pack = selectedPack(c);
    let text = '';
    if (l.choice?.kind === 'standard' && !optionOf(c)) text = STANDARD_MESSAGE;
    else if (pack) text = pack.status === 'installable' ? `${l.name}: ${l.level}. ${reviewLine(pack)}` : `${l.name}: planned, not installable yet, so it cannot be downloaded.`;
    c.info.textContent = text;
    // the pill under the written-standard question names what it will do with the standard that is chosen
    if (c.choose) {
      c.choose.textContent = isEnrolled(c) ? `Use ${l.name}` : `Download ${l.name}`;
      c.choose.disabled = busy > 0 || !pack || pack.status !== 'installable';
    }
    // a track that is not here yet: its row downloads it, unless something is downloading or its pack is only planned
    for (const b of c.tracks.querySelectorAll<HTMLButtonElement>('button[data-action="choose"]')) b.disabled = busy > 0 || b.hasAttribute('data-planned');
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
    let result: InstallResult | undefined;
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
      if (result.ok) set(`${pack.name} is ready: ${result.checks.length} checks passed${result.dictionarySource ? `, dictionary from ${sourceLabel(ctx, result.dictionarySource)}` : ''}.${intro}`, 'ok');
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
  async function chooseOnRow(c: RowRefs, track?: Option): Promise<void> {
    const l = c.lang;
    const ch = l.choice;
    // a track's own row names the track; the written standard is the one the learner chose in the question, never a guess
    let option = track ?? optionOf(c);
    if (ch?.kind === 'standard' && !option) { setStatus(c.status, STANDARD_MESSAGE, 'error'); return; }
    if (ch && !option) option = ch.options[0];
    const pack = ctx.deps.packs.packFor(option?.languageId ?? l.languageId);
    if (!pack) { setStatus(c.status, `GoLearn has no pack for ${l.name} yet.`, 'error'); return; }
    if (pack.status !== 'installable') { setStatus(c.status, `${pack.name} is planned, not installable yet, so it cannot be downloaded.`, 'error'); return; }
    const standard = option?.languageId === 'nb' || option?.languageId === 'nn' ? option.languageId : undefined;
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
      c.reading.hidden = !active || !ids.has(active.languageId);
      c.installed.textContent = records.map(({ pk, rec }) => `Installed here: ${pk.name} version ${rec!.version}, ${rec!.ok ? 'verified' : 'verification failed'} on ${shortDate(rec!.verifiedAt)}.`).join(' ');

      // the tracks of this row, one line each, the way GoReview lists them: the name, its state at the end of the line, and the line
      // itself the control (Download; Use for reading). A downloaded track also has Remove. The list is rebuilt, so the focus is put back.
      const held = c.row.ownerDocument.activeElement?.closest('li.track');
      const heldKey = held && c.tracks.contains(held) ? held.getAttribute('data-key') : null;
      clear(c.tracks);
      const choice = c.lang.choice;
      const varietyOf = (e: EnrolRow): string | undefined => e.varietyId ?? ctx.deps.packs.packFor(e.languageId)?.defaultVarietyId;
      /** “Biblical Hebrew” under Hebrew is “Biblical”; “Germany” stays. */
      const short = (label: string): string => (label.endsWith(` ${c.lang.name}`) ? label.slice(0, -c.lang.name.length - 1) : label);
      const downloaded = (e: EnrolRow, name: string): HTMLElement => {
        const isActive = e.enrolmentId === active?.enrolmentId;
        const pk = ctx.deps.packs.packFor(e.languageId);
        const rec = pk ? progress.packs[pk.packId] : undefined;
        const label = languageLabel(ctx, e.languageId, e.varietyId);
        const face = [
          h('span', { class: 'track-name' }, name),
          // a ready track says so by where it stands (Your languages); the words stay for a screen reader. A problem is said in sight.
          h('span', { class: rec?.ok ? 'dl-state ok sr' : 'dl-state error' }, rec ? (rec.ok ? 'Downloaded · ready' : 'Downloaded · did not verify') : 'Download not finished'),
        ];
        const line = isActive
          ? h('span', { class: 'track-row', 'aria-current': 'true', tabindex: '-1' }, face, h('small', { class: 'tag' }, 'Reading now'))
          : button('', async () => { await ctx.useEnrolment(e); await refresh(); ctx.changed(); }, { class: 'track-row', 'data-action': 'use', 'aria-label': `Use for reading: ${label}` });
        if (!isActive) append(line, [face, h('small', {}, 'Use for reading')]);
        return h('li', { class: 'track mine', 'data-key': `e:${e.enrolmentId}`, 'data-enrolment': e.enrolmentId, 'data-language': e.languageId, 'data-variety': e.varietyId ?? '', 'data-pack-ok': String(rec?.ok === true) },
          line,
          button('Remove', async () => {
            await ctx.removeEnrolment(e);
            if (view.alive()) setStatus(c.status, `${label} is removed from this device. Its downloaded pack stays installed; download it again any time.`, 'info');
            await refresh();
            ctx.changed();
          }, { class: 'linklike small', 'data-action': 'remove', 'aria-label': `Remove ${label}` }));
      };
      const offered = (o: Option | undefined, name: string): HTMLElement => {
        const pk = ctx.deps.packs.packFor(o?.languageId ?? c.lang.languageId);
        const line = button('', () => { void chooseOnRow(c, o); }, { class: 'track-row', 'data-action': 'choose', 'data-option': o?.id ?? c.lang.languageId,
          'aria-label': `Download ${c.lang.name}${o ? ` (${name})` : ''}`, ...(pk?.status === 'installable' ? {} : { 'data-planned': true }) });
        append(line, [h('span', { class: 'track-name' }, name), h('small', {}, 'Download')]);
        return h('li', { class: 'track', 'data-key': `o:${o?.id ?? c.lang.languageId}`, 'data-language': o?.languageId ?? c.lang.languageId, 'data-variety': o?.varietyId ?? '' }, line);
      };
      const shown = new Set<EnrolRow>();
      const mineOf = (o: Option): EnrolRow | undefined => {
        const e = enrolled.find((x) => !shown.has(x) && x.languageId === o.languageId && (!o.varietyId || varietyOf(x) === o.varietyId));
        if (e) shown.add(e);
        return e;
      };
      if (choice?.kind === 'standard') {
        // the written standards that are here; another one is added by the question under them
        for (const o of choice.options) { const e = mineOf(o); if (e) c.tracks.append(downloaded(e, o.label)); }
        // the question shows the standard being read in (or the one that is here) as chosen; with none here, nothing is chosen
        if (c.standard && !c.standard.querySelector('input:checked')) {
          const here = enrolled.find((e) => e.enrolmentId === active?.enrolmentId) ?? enrolled[0];
          const option = here ? choice.options.find((o) => o.languageId === here.languageId && (!o.varietyId || varietyOf(here) === o.varietyId)) : undefined;
          const input = option ? [...c.standard.querySelectorAll<HTMLInputElement>('input')].find((i) => i.value === option.id) : undefined;
          if (input) input.checked = true;
        }
      } else if (choice) {
        for (const o of choice.options) { const e = mineOf(o); c.tracks.append(e ? downloaded(e, short(o.label)) : offered(o, short(o.label))); }
      } else {
        const e = enrolled[0];
        if (e) shown.add(e);
        c.tracks.append(e ? downloaded(e, c.lang.name) : offered(undefined, c.lang.name));
      }
      // a track downloaded here that the list above does not name (a variety the pack no longer offers) still has its row, and its Remove
      for (const e of enrolled) if (!shown.has(e)) c.tracks.append(downloaded(e, languageLabel(ctx, e.languageId, e.varietyId)));
      if (heldKey) {
        const again = [...c.tracks.children].find((li) => li.getAttribute('data-key') === heldKey)
          ?? [...c.tracks.children].find((li) => heldKey.startsWith('o:') && li.getAttribute('data-variety') === held!.getAttribute('data-variety') && li.getAttribute('data-language') === held!.getAttribute('data-language'));
        (again?.querySelector<HTMLElement>('.track-row') ?? c.tracks.querySelector<HTMLElement>('.track-row'))?.focus();
      }
      // a downloaded language whose pack is not ready and that is not being installed has a way to try again
      if (enrolled.length && !ready && !c.installing && !c.results.querySelector('[data-action="retry"]')) {
        const target = enrolled.map((e) => ctx.deps.packs.packFor(e.languageId)).find((x): x is PackView => !!x && x.status === 'installable');
        if (target) c.results.append(button('Retry', () => { void install(c, target, '', true); }, { class: 'btn primary', 'data-action': 'retry', 'aria-label': `Retry installing ${target.name}` }));
      }
      if (ready) c.results.querySelectorAll('[data-action="retry"]').forEach((b) => b.remove());

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
      // "Download for offline use": for each pack of the row that is chosen here (or still has its install record) and has a dictionary; extension only
      if (ctx.inExtension) {
        const wanted = rowPacks.filter((pk) => pk.status === 'installable' && hasDictionary(pk) && (enrolled.some((e) => e.languageId === pk.languageId) || !!progress.packs[pk.packId]));
        for (const pk of wanted) {
          let block = offlineBlocks.get(pk.languageId);
          if (!block) { block = createOfflineBlock(ctx, view, pk); offlineBlocks.set(pk.languageId, block); }
          if (!c.offline.contains(block.el)) c.offline.append(block.el);
          void block.poll();
        }
        for (const [id, block] of offlineBlocks) if (c.offline.contains(block.el) && !wanted.some((pk) => pk.languageId === id)) block.el.remove();
      }
      describe(c);
    }

    arrange(new Set(rowsOf.filter((c) => c.row.classList.contains('chosen')).map((c) => c.row)));

    // The top of the page no longer says where the learner stands in words (the owner, 2026-11-26: "Keep review, the header, and my
    // account. Cut the rest"): the tile of the language being read in says “Reading now”, and its row says what a download did. One line
    // stays for a screen reader, which cannot see where a tile stands: that the language being read in is ready.
    clear(next);
    const pack = active?.languageId ? ctx.deps.packs.packFor(active.languageId) : undefined;
    if (active && pack && progress.packs[pack.packId]?.ok === true) {
      next.append(h('p', { class: 'sr', id: 'next-note', role: 'status' }, `${languageLabel(ctx, active.languageId, active.varietyId)} is ready.`));
    }
  }

  // ── the nine rows
  for (const l of languages) {
    const works = h('ul', { class: 'works' }, ...l.whatWorks.map((x) => h('li', {}, x)));
    const not = h('ul', { class: 'does-not' }, ...l.whatDoesNot.map((x) => h('li', {}, x)));
    const info = h('p', { class: 'muted pack-info', id: `pack-info-${l.languageId}` });
    const progress = h('progress', { max: '1', value: '0', hidden: true, 'aria-label': `Downloading ${l.name}` }) as HTMLProgressElement;
    const status = statusLine();
    const results = h('div', { class: 'results' });
    const installed = h('p', { class: 'installed muted', id: `installed-${l.languageId}` });
    const more = h('span', { class: 'more' });
    const tracks = h('ul', { class: 'mine-list track-list', 'aria-label': `${l.name} tracks` });
    const offline = h('div', { class: 'offline-list' });
    // Norwegian's written standard is asked as GoReview asks it: two words, the chosen one underlined, and the pill under them.
    // Nothing is chosen for the learner. Every other language's tracks are the rows of the list above.
    let standard: HTMLFieldSetElement | undefined;
    let choose: HTMLButtonElement | undefined;
    let question: HTMLElement | null = null;
    if (l.choice?.kind === 'standard') {
      standard = h('fieldset', { class: 'standard-choice', 'data-choice': 'standard' },
        h('legend', {}, l.choice.label),
        ...l.choice.options.map((o) => h('label', { class: 'standard-option' },
          h('input', { type: 'radio', name: `standard-${l.languageId}`, value: o.id }), h('span', {}, o.label)))) as HTMLFieldSetElement;
      choose = button(`Download ${l.name}`, () => { void chooseOnRow(c); }, { class: 'btn primary', 'data-action': 'choose' });
      question = h('div', { class: 'download-one', id: `download-${l.languageId}` }, h('div', { class: 'dl-panel' }, standard, h('div', { class: 'row' }, choose)));
    }
    const reading = h('span', { class: 'lang-reading', hidden: true }, 'Reading now');
    const controls = h('details', { class: 'language-box' },
      h('summary', { class: 'language-box-face' },
        // the language's name is its row's heading: the h4s inside the box would otherwise follow the list's h2 directly
        h('div', {}, reading,
          h('h3', { id: `lang-h-${l.languageId}`, class: 'lang-name' }, l.name,
            l.nativeName && l.nativeName !== l.name ? h('small', { class: 'native', lang: l.languageId, dir: 'auto' }, ` (${l.nativeName})`) : null)),
        h('span', { class: 'language-box-caret', 'aria-hidden': 'true' }, '▾')),
      h('div', { class: 'language-box-body' },
        h('div', { class: 'lang-actions' }, tracks, question),
        h('div', { class: 'lang-feedback' }, progress, status, results, offline),
        h('details', { class: 'about' }, h('summary', {}, 'Details'),
          h('p', { class: 'muted lang-level' }, l.level), info,
          h('h4', {}, 'What works'), works, h('h4', {}, 'What does not'), not,
          h('p', { class: 'audio' }, h('strong', {}, 'Audio: '), l.audio),
          installed, h('div', { class: 'row' }, more))));
    const row = h('li', { class: 'lang lang-row', 'data-language': l.languageId, 'data-script': l.scriptId, 'aria-labelledby': `lang-h-${l.languageId}` }, controls);
    const c: RowRefs = { lang: l, row, reading, standard, info, choose, tracks, offline, more, progress, status, results, installed, installing: false };
    rowsOf.push(c);
    standard?.addEventListener('change', () => { describe(c); });
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
