/** #/tell — the writing workspace home: mode, drafts, goals, privacy, connection. */
import { createDraft, listDrafts, MODE_INFO, type DraftRow } from '../../../gotell/src/workspace/drafts';
import { DRAFT_EXPORT_FORMATS } from '../../../gotell/src/workspace/port';
import { WRITING_MODES, type WritingMode } from '../../../gotell/src/types';
import { append, button, clear, h, p, setStatus, shortDate, statusLine } from '../../dom';
import { tellNav, type TellEnv } from './common';
import { goalsSection } from './goals';

export async function render(env: TellEnv): Promise<void> {
  const { el, ctx, host, engine, view, id } = env;
  const language = `${id.languageId}${id.varietyId ? ` (${id.varietyId})` : ''}`;
  let mode: WritingMode = 'free';

  const connection = h('p', { id: 'tell-connection', class: 'muted', role: 'status', 'aria-live': 'polite' });
  const modeBox = h('section', { class: 'card', id: 'tell-modes', 'aria-labelledby': 'tell-modes-h' });
  const draftsBox = h('section', { class: 'card', id: 'tell-drafts', 'aria-labelledby': 'tell-drafts-h' });
  const status = statusLine();

  async function paintConnection(): Promise<void> {
    const line = await host.syncLine();
    if (view.alive()) connection.textContent = line.text;
  }

  async function start(): Promise<void> {
    if (MODE_INFO[mode].needsPrompt) { ctx.go(`tell/prompts/${mode}`); return; }
    try {
      const rec = await createDraft(host, engine, { mode });
      if (view.alive()) ctx.go(`tell/write/${encodeURIComponent(rec.draftId)}`);
    } catch (e) { setStatus(status, e instanceof Error ? e.message : String(e), 'error'); }
  }

  const modeSet = h('fieldset', { class: 'tell-modes', id: 'tell-mode-set' }, h('legend', { class: 'sr' }, 'Writing mode'));
  for (const m of WRITING_MODES) {
    const input = h('input', { type: 'radio', name: 'tell-mode', value: m, id: `tell-mode-${m}`, ...(m === mode ? { checked: true } : {}) }) as HTMLInputElement;
    input.addEventListener('change', () => { if (input.checked) mode = m; });
    modeSet.append(h('label', { class: 'tell-mode', for: `tell-mode-${m}` }, input, h('span', { class: 'name' }, MODE_INFO[m].label), h('span', { class: 'blurb' }, MODE_INFO[m].blurb)));
  }
  append(modeBox, [
    h('h2', { id: 'tell-modes-h' }, `Write in ${language}`),
    p('GoTell is your own writing space. It checks and offers help only when you ask, and it never changes your text by itself.', 'muted'),
    modeSet,
    h('div', { class: 'row' }, button('New draft', () => { void start(); }, { id: 'tell-new-draft', class: 'btn primary' })),
    status,
  ]);

  function rowView(r: DraftRow): HTMLElement {
    const actions = h('span', { class: 'tell-draft-actions' });
    const confirmBox = h('span', { class: 'tell-draft-confirm', hidden: true });
    const exportSel = h('select', { 'aria-label': `Export format for ${r.title || 'this draft'}`, 'data-export-format': r.draftId },
      ...DRAFT_EXPORT_FORMATS.map((f) => h('option', { value: f }, f))) as HTMLSelectElement;
    actions.append(
      h('a', { class: 'btn small', href: `#/tell/write/${encodeURIComponent(r.draftId)}`, 'data-open': r.draftId }, 'Open'),
      exportSel,
      button('Export', () => { void exportRow(r, exportSel.value as (typeof DRAFT_EXPORT_FORMATS)[number]); }, { class: 'btn small', 'data-export': r.draftId }),
      button('Delete', () => { confirmBox.hidden = false; actions.hidden = true; }, { class: 'btn small', 'data-delete': r.draftId }),
    );
    confirmBox.append(
      `Delete "${r.title || 'Untitled draft'}" and all its versions? `,
      button('Delete for good', () => { void remove(r); }, { class: 'btn small', 'data-delete-confirm': r.draftId }),
      button('Keep it', () => { confirmBox.hidden = true; actions.hidden = false; }, { class: 'btn small', 'data-delete-cancel': r.draftId }),
    );
    return h('li', { 'data-doc': r.draftId },
      h('strong', {}, r.title || 'Untitled draft'),
      ` · ${r.mode ?? r.kind} · ${r.versions} version(s) · ${shortDate(r.updatedAt)}${r.origin === 'device' ? ' · on this device only' : ''} `,
      actions, confirmBox);
  }

  async function exportRow(r: DraftRow, format: (typeof DRAFT_EXPORT_FORMATS)[number]): Promise<void> {
    try {
      const loaded = (await engine.stores.local.load(r.draftId)) ?? (await engine.stores.synced.load(r.draftId));
      if (!loaded) { setStatus(status, 'That draft could not be read.', 'error'); return; }
      host.download(engine.exportDraft(loaded.record, format));
      setStatus(status, `Exported as ${format}.`, 'ok');
    } catch (e) { setStatus(status, `The export failed: ${e instanceof Error ? e.message : String(e)}`, 'error'); }
  }

  async function remove(r: DraftRow): Promise<void> {
    try { await engine.deleteDraft(r.draftId); setStatus(status, 'Draft deleted.', 'ok'); } catch (e) {
      setStatus(status, `The draft could not be deleted: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
    await paintDrafts();
  }

  async function paintDrafts(): Promise<void> {
    const { rows, note } = await listDrafts(engine);
    if (!view.alive()) return;
    clear(draftsBox);
    append(draftsBox, [h('h2', { id: 'tell-drafts-h' }, 'Your drafts')]);
    if (note) draftsBox.append(p(note, 'notice'));
    if (!rows.length) { draftsBox.append(p('No drafts yet.', 'muted')); return; }
    draftsBox.append(h('ul', { class: 'drafts' }, ...rows.map(rowView)));
  }

  el.append(tellNav('home'), connection, modeBox, draftsBox);
  const goals = await goalsSection(env);
  el.append(goals, h('p', { class: 'muted' }, h('a', { href: '#/tell/privacy', id: 'tell-privacy-link' }, 'What GoTell does with your writing'), ' · ',
    h('a', { href: '#/tell/prompts', id: 'tell-prompts-link' }, 'Browse prompts')));
  await Promise.all([paintDrafts(), paintConnection()]);
  void (engine.flushPending?.() ?? Promise.resolve(undefined)).then((r) => { if (r && r.sent && view.alive()) void paintDrafts(); }, () => undefined);
  view.onDispose(ctx.onSync(() => { void paintConnection(); }));
}
