/**
 * #/tell — the GoTell workspace. It needs no deck and no session: it reads the words the learner can already use and the
 * private drafts, and saves a draft with revisions. The writing engine is a later phase, and the screen says so.
 */
import { createGoTellWorkspace, type GoTellWorkspace } from '../../gotell/src';
import type { AppContext } from '../context';
import { append, button, clear, field, h, langProps, p, setStatus, shortDate, statusLine } from '../dom';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const id = await ctx.identity();
  if (!id) {
    append(el, [p('Choose a language first: GoTell writes in one language at a time.'), h('div', { class: 'notice', id: 'tell-no-language' }, 'You have no language yet. Set one up in GoLearn; it appears here after the next sync.')]);
    return;
  }
  const { api } = await ctx.api();
  const ws: GoTellWorkspace = createGoTellWorkspace({
    api, identity: { learnerId: id.learnerId, enrolmentId: id.enrolmentId, deviceId: id.deviceId }, languageId: id.languageId,
    now: ctx.deps.now, newId: () => `draft-${ctx.deps.newId()}`,
  });
  const tag = id.varietyId ?? id.languageId;

  append(el, [
    h('p', { class: 'notice', id: 'tell-notice' },
      'GoTell is separate from GoReview and needs neither a deck nor a session. The writing engine itself (checking your sentences, suggesting repairs, recording corrections, the practice ladder) is the next phase and is not here yet. This page keeps your private drafts safe and shows the words you have already used.'),
  ]);
  const wordsBox = h('section', { class: 'card', id: 'tell-words', 'aria-labelledby': 'tell-words-h' });
  const draftsBox = h('section', { class: 'card', id: 'tell-drafts', 'aria-labelledby': 'tell-drafts-h' });
  const editorBox = h('section', { class: 'card', id: 'tell-editor', 'aria-labelledby': 'tell-editor-h' });
  const notes = h('div', { id: 'tell-notes' });
  el.append(notes, wordsBox, draftsBox, editorBox);

  // ── editor state
  let docId: string | undefined;
  const title = h('input', { type: 'text', id: 'draft-title', name: 'title', maxlength: 300, autocomplete: 'off', ...langProps(tag) }) as HTMLInputElement;
  const body = h('textarea', { id: 'draft-body', name: 'body', rows: 10, ...langProps(tag), spellcheck: 'true' }) as HTMLTextAreaElement;
  const kind = h('select', { id: 'draft-kind', name: 'kind' }, h('option', { value: 'draft' }, 'Draft'), h('option', { value: 'testimony' }, 'Testimony'), h('option', { value: 'note' }, 'Note')) as HTMLSelectElement;
  const status = statusLine();
  const revision = h('p', { id: 'draft-revision', class: 'muted' }, 'New draft (not saved yet).');
  const reload = button('Load the current version', () => void 0, { id: 'draft-reload', class: 'btn', hidden: true });

  function paintEditorState(): void {
    revision.textContent = docId ? `Revision ${ws.revisionOf(docId)} (saved).` : 'New draft (not saved yet).';
  }

  async function openDraft(target: string): Promise<void> {
    const r = await ws.open(target);
    if (!view.alive()) return;
    if (!r.ok) { setStatus(status, r.message, 'error'); return; }
    docId = r.doc.docId;
    title.value = r.doc.title ?? '';
    body.value = r.doc.body;
    kind.value = r.doc.kind;
    reload.setAttribute('hidden', '');
    paintEditorState();
    setStatus(status, 'Opened.', 'ok');
  }

  const save = button('Save', () => {
    void (async () => {
      save.disabled = true;
      try {
        const r = await ws.save({ ...(docId ? { docId } : {}), title: title.value.trim() || undefined, body: body.value, kind: kind.value as 'draft' | 'testimony' | 'note' });
        if (!view.alive()) return;
        if (r.ok) {
          docId = r.doc.docId;
          reload.setAttribute('hidden', '');
          setStatus(status, `Saved as revision ${r.doc.revision}.`, 'ok');
          paintEditorState();
          paintDrafts();
        } else {
          setStatus(status, r.conflict ? 'This draft changed on another device. Your text is still here; nothing was overwritten.' : r.message, 'error');
          if (r.conflict && docId) { reload.removeAttribute('hidden'); reload.onclick = () => { void openDraft(docId as string); }; }
        }
      } finally { save.disabled = false; }
    })();
  }, { id: 'draft-save', class: 'btn primary' });
  const fresh = button('New draft', () => {
    docId = undefined; title.value = ''; body.value = ''; kind.value = 'draft'; reload.setAttribute('hidden', '');
    paintEditorState(); setStatus(status, '', 'info');
  }, { id: 'draft-new', class: 'btn' });

  append(editorBox, [
    h('h2', { id: 'tell-editor-h' }, 'Write'),
    field('Title', title), field('Kind', kind), field('Your text', body),
    revision,
    h('div', { class: 'row' }, save, fresh, reload), status,
    p('Stored as a private document under your account. It is not sent to any AI provider and is not used for review.', 'muted'),
  ]);

  function paintWords(): void {
    clear(wordsBox);
    const words = ws.wordsYouCanUse();
    append(wordsBox, [h('h2', { id: 'tell-words-h' }, 'Words you can use')]);
    if (!words.length) {
      wordsBox.append(p('Nothing yet. A word appears here once you have produced it, in a review or in your own writing.', 'muted'));
      return;
    }
    wordsBox.append(p('Words you have produced, not just recognised. This is read from your record; GoTell does not change it.', 'muted'),
      h('ul', { class: 'words' }, ...words.map((w) => h('li', { 'data-unit': w.unitId },
        h('span', langProps(tag), w.label), ' ',
        h('span', { class: 'muted' }, `${w.dimensions.map((d) => (d === 'contextualProduction' ? 'used in context' : 'recalled')).join(' and ')} · ${w.observations} observation(s)`)))));
  }

  function paintDrafts(): void {
    clear(draftsBox);
    const drafts = ws.drafts();
    append(draftsBox, [h('h2', { id: 'tell-drafts-h' }, 'Your drafts')]);
    if (!drafts.length) { draftsBox.append(p('No drafts yet.', 'muted')); return; }
    draftsBox.append(h('ul', { class: 'drafts' }, ...drafts.map((d) => h('li', { 'data-doc': d.docId },
      h('strong', {}, d.title || 'Untitled'), ` · ${d.kind} · revision ${d.revision} · ${shortDate(d.updatedAt)} `,
      button('Open', () => { void openDraft(d.docId); }, { class: 'btn small', 'data-open': d.docId })))));
  }

  const snap = await ws.init();
  if (!view.alive()) return;
  for (const n of snap.notes) notes.append(p(n, 'error'));
  paintWords();
  paintDrafts();
}
