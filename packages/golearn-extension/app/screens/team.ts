/**
 * 3. Team and language. A mission team is not a language: the enrolment carries the team id and the language id (and the
 * variety and script) as separate fields. Norwegian forces the written-standard choice (Bokmål / Nynorsk) with nothing
 * preselected and nothing guessed. One learner may hold several enrolments; one is active at a time (the one the
 * extension records into).
 */
import type { Enrolment } from '../../../repository-contract/src';
import type { AppContext } from '../context';
import { append, button, clear, field, h, p, setStatus, shortDate, statusLine } from '../dom';
import type { PackView, TeamLanguageView, TeamView } from '../ports';
import type { Session } from '../state';
import type { View } from './view';

/** The written standard (nb / nn) a chosen language and variety stand for, if any. */
export function writtenStandardOf(pack: PackView | undefined, languageId: string, varietyId: string | undefined): 'nb' | 'nn' | undefined {
  const v = pack?.varieties.find((x) => x.varietyId === varietyId);
  if (v?.writtenStandard) return v.writtenStandard;
  if (languageId === 'nb' || languageId === 'nn') return languageId;
  return undefined;
}

/** Whether this team language forces an explicit choice of written standard (Norwegian). */
export function forcesWrittenStandard(tl: TeamLanguageView | undefined): boolean {
  return !!tl && (!!tl.requiredChoice || tl.languageId === 'nb' || tl.languageId === 'nn' || tl.languageId === 'no');
}

const labelOf = (e: Enrolment, ctx: AppContext): string => {
  const pack = ctx.deps.packs.packFor(e.languageId);
  const team = e.teamId ? ctx.deps.packs.teams().find((t) => t.teamId === e.teamId) : undefined;
  const variety = pack?.varieties.find((v) => v.varietyId === e.varietyId)?.label ?? e.varietyId;
  return `${team?.name ?? e.teamId ?? 'No team'} → ${pack?.name ?? e.languageId}${variety ? ` (${variety})` : ''}`;
};

const NORWAY_MESSAGE = 'Norwegian has two written standards, Bokmål (nb) and Nynorsk (nn). Choose the one you will read; GoLearn never guesses.';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const session = await ctx.state.getSession();
  if (!view.alive()) return;
  if (!session) {
    append(el, [p('Sign in first: the enrolment is stored on your account.'), h('p', {}, h('a', { class: 'btn primary', href: '#/account' }, 'Go to Account →'))]);
    return;
  }
  const { packs } = ctx.deps;
  const listBox = h('section', { class: 'card', 'aria-labelledby': 'enr-h' });
  const formBox = h('section', { class: 'card', 'aria-labelledby': 'enr-form-h' });
  append(el, [
    p('Choose the mission team you are preparing for, then the language of that team. A team is not a language: both are kept, and you can add another team or language later without losing anything.'),
    listBox, formBox,
  ]);

  async function currentSession(): Promise<Session> { return (await ctx.state.getSession()) ?? session!; }

  const adopt = (e: Enrolment): Promise<void> => ctx.adoptEnrolment(e);

  async function paintList(): Promise<void> {
    const s = await currentSession();
    const { api } = await ctx.api();
    const r = await api.listEnrolments().catch(() => undefined);
    if (!view.alive()) return;
    clear(listBox);
    listBox.append(h('h2', { id: 'enr-h' }, 'Your enrolments'));
    if (!r) { listBox.append(p('The service could not be reached, so your enrolments cannot be listed now.', 'error')); return; }
    if (!r.ok) { listBox.append(p(r.status === 401 ? 'Your session is no longer valid. Sign in again.' : r.message || `The service answered ${r.status}.`, 'error')); return; }
    const rows = r.data.enrolments;
    await ctx.state.setProfile({ fetchedAt: ctx.deps.now().toISOString(), email: s.email, learnerId: s.learnerId, enrolments: rows });
    if (!rows.length) { listBox.append(p('None yet. Enrol below.', 'muted')); return; }
    const list = h('ul', { class: 'enrolments' });
    for (const e of rows) {
      const active = e.enrolmentId === s.enrolmentId;
      list.append(h('li', { 'data-enrolment': e.enrolmentId, 'data-team': e.teamId ?? '', 'data-language': e.languageId, 'data-variety': e.varietyId ?? '' },
        h('strong', {}, labelOf(e, ctx)), ' ',
        h('span', { class: 'muted' }, `· ${e.packId}@${e.packVersion} · since ${shortDate(e.startedAt)}${e.endedAt ? ' · ended' : ''}`), ' ',
        active ? h('span', { class: 'tag' }, 'active') : e.endedAt ? null : button('Use this one', async () => { await adopt(e); await paintList(); }, { class: 'small' })));
    }
    listBox.append(list);
  }

  // ── the enrolment form
  const team = h('select', { id: 'team', name: 'team' }) as HTMLSelectElement;
  const language = h('select', { id: 'language', name: 'language' }) as HTMLSelectElement;
  const variety = h('select', { id: 'variety', name: 'variety' }) as HTMLSelectElement;
  const varietyField = field('Variety', variety);
  varietyField.hidden = true;
  const info = h('p', { class: 'muted', id: 'pack-info' });
  const status = statusLine();
  const enrol = h('button', { type: 'submit', id: 'enrol', class: 'btn primary' }, 'Enrol') as HTMLButtonElement;
  const noTeam = h('button', { type: 'button', id: 'enrol-no-team', class: 'btn', hidden: true }, 'Enrol without a team') as HTMLButtonElement;
  const form = h('form', { id: 'enrol-form' }, field('Team', team), field('Language', language), varietyField, info, h('div', { class: 'row' }, enrol, noTeam), status);
  append(formBox, [h('h2', { id: 'enr-form-h' }, 'Enrol in a language'), form]);

  const opt = (value: string, text: string): HTMLOptionElement => h('option', { value }, text) as HTMLOptionElement;
  const teams = packs.teams();
  team.append(opt('', 'Choose a team…'), ...teams.map((t) => opt(t.teamId, t.name)));

  const selectedTeam = (): TeamView | undefined => teams.find((t) => t.teamId === team.value);
  const selectedTL = (): TeamLanguageView | undefined => selectedTeam()?.languages.find((l) => l.languageId === language.value);
  const selectedPack = (): PackView | undefined => (language.value ? packs.packFor(language.value) : undefined);
  const packLine = (pack: PackView): string => pack.status === 'installable'
    ? `${pack.name} pack ${pack.version}: installable. Review status: ${pack.reviewStatus}.`
    : `${pack.name} pack ${pack.version}: planned, not installable. You can enrol once it exists.`;

  function fillLanguages(): void {
    clear(language);
    const t = selectedTeam();
    const forced = !!t?.languages.some(forcesWrittenStandard);
    language.append(opt('', t ? (forced ? 'Choose the written standard…' : 'Choose a language…') : 'Choose a team first'));
    for (const l of t?.languages ?? []) language.append(opt(l.languageId, l.label));
    // a single language is preselected, unless it is one the learner must choose on purpose
    if (t && t.languages.length === 1 && !forcesWrittenStandard(t.languages[0])) language.value = t.languages[0].languageId;
    fillVarieties();
  }

  function fillVarieties(): void {
    clear(variety);
    const pack = selectedPack();
    const tl = selectedTL();
    const choices = (pack?.varieties ?? []).filter((v) => v.analysed);
    const show = !!pack && choices.length > 1;
    varietyField.hidden = !show;
    if (show) {
      for (const v of choices) variety.append(opt(v.varietyId, v.label));
      variety.value = choices.some((v) => v.varietyId === tl?.varietyId) ? tl!.varietyId! : pack!.defaultVarietyId;
    }
    info.textContent = `${pack ? packLine(pack) : ''}${forcesWrittenStandard(tl) ? ` ${NORWAY_MESSAGE}` : ''}`.trim();
    enrol.disabled = !pack || pack.status !== 'installable';
  }

  team.addEventListener('change', fillLanguages);
  language.addEventListener('change', fillVarieties);
  fillLanguages();

  async function submit(withTeam: boolean): Promise<void> {
    {
      const t = selectedTeam();
      if (!t) { setStatus(status, 'Choose a team.', 'error'); return; }
      const forced = t.languages.some(forcesWrittenStandard);
      if (!language.value) { setStatus(status, forced ? NORWAY_MESSAGE : 'Choose a language.', 'error'); return; }
      const pack = selectedPack();
      const tl = selectedTL();
      if (!pack || !tl) { setStatus(status, 'That language is not offered by this team.', 'error'); return; }
      if (pack.status !== 'installable') { setStatus(status, `${pack.name} is planned, not installable yet, so it cannot be enrolled in.`, 'error'); return; }
      const analysed = pack.varieties.filter((v) => v.analysed);
      const varietyId = (!varietyField.hidden && variety.value) || (analysed.some((v) => v.varietyId === tl.varietyId) ? tl.varietyId! : pack.defaultVarietyId);
      if (forcesWrittenStandard(tl) && !writtenStandardOf(pack, pack.languageId, varietyId)) { setStatus(status, NORWAY_MESSAGE, 'error'); return; }
      enrol.disabled = true;
      setStatus(status, 'Enrolling…', 'info');
      try {
        const { api } = await ctx.api();
        const r = await api.enrol({
          ...(withTeam ? { teamId: t.teamId } : {}), languageId: pack.languageId, varietyId, scriptId: pack.scriptId,
          packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }],
        });
        if (!r.ok) {
          const teamProblem = r.error === 'not-a-member' || r.error === 'no-such-team';
          noTeam.hidden = !teamProblem;
          setStatus(status, r.error === 'not-a-member' ? 'The service says you are not a member of that team yet. A team leader adds members; until then you can enrol in the language without a team and add the team later.' : r.error === 'no-such-team' ? 'The service does not know that team yet. You can enrol in the language without a team and add the team later.' : r.message || `The service answered ${r.status}.`, 'error');
          return;
        }
        noTeam.hidden = true;
        await adopt(r.data.enrolment);
        setStatus(status, `Enrolled: ${labelOf(r.data.enrolment, ctx)}. Next, install the language pack.`, 'ok');
        await paintList();
      } catch {
        setStatus(status, 'The service could not be reached.', 'error');
      } finally {
        enrol.disabled = pack.status !== 'installable';
      }
    }
  }
  form.addEventListener('submit', (ev) => { ev.preventDefault(); void submit(true); });
  noTeam.addEventListener('click', () => { void submit(false); });

  await paintList();
}
