/**
 * #/tell/write/<draftId> — the writer. A plain textarea in the middle, everything else is a panel the learner opens.
 * The logic lives in `gotell/src/workspace/writer.ts`; this file draws it and wires the keyboard.
 */
import type { AssistanceLevel, AssistanceStep, SentenceAnalysis } from '../../../gotell/src/types';
import { DRAFT_EXPORT_FORMATS } from '../../../gotell/src/workspace/port';
import { LADDER, type IssueView, type WriterSession, type WriterView, createWriterSession } from '../../../gotell/src/workspace/writer';
import { MODE_INFO } from '../../../gotell/src/workspace/drafts';
import { append, button, clear, h, langProps, p, shortDate } from '../../dom';
import { CLASS_LABEL, DIFFICULTY_LABEL, type TellEnv } from './common';

const SOURCE_LABEL: Record<AssistanceStep['source'], string> = {
  'adapter-checker': 'from the language checker',
  'pack-grammar': 'from the language pack\'s grammar notes',
  'pack-sentence': 'a sentence from the language pack',
  'learner-own-sentence': 'a sentence you wrote earlier',
  'remote-assistant': 'from a remote assistant: check it yourself',
  none: '',
};
const REVIEW_LABEL: Record<NonNullable<AssistanceStep['review']>, string> = {
  unreviewed: 'not reviewed by a person',
  reviewed: 'reviewed',
  'learner-own': 'your own words',
};

export async function render(env: TellEnv, params: string[]): Promise<void> {
  const { el, ctx, host, engine, view, tag } = env;
  const draftId = decodeURIComponent(params[0] ?? '');
  if (!draftId) { append(el, [p('No draft was chosen.'), h('a', { href: '#/tell', class: 'btn' }, 'Back to your drafts')]); return; }

  const session: WriterSession = createWriterSession({ engine, host, draftId });
  const first = await session.load();
  if (!view.alive()) { session.dispose(); return; }
  if (first.notFound) {
    append(el, [h('p', { class: 'error', id: 'writer-missing' }, first.status.text), h('a', { href: '#/tell', class: 'btn' }, 'Back to your drafts')]);
    session.dispose();
    return;
  }

  // ───────────── skeleton ─────────────
  const record = first.record;
  const prompt = record.promptId ? engine.promptById(record.promptId) : undefined;
  const targeted = record.mode === 'targeted';
  let intent = '';
  let frames = false;
  let profile: Awaited<ReturnType<WriterSession['profile']>>;
  const pendingModel = new Set<string>();
  const pendingMeaning = new Set<string>();
  const pendingSentenceModel = new Set<number>();
  const sentenceModels = new Map<number, AssistanceStep | string>();
  let modelsFor: unknown;
  let diffFor: string | undefined;
  let lastKey = '';

  const title = h('input', { type: 'text', id: 'writer-title', name: 'title', maxlength: 300, autocomplete: 'off', placeholder: 'Title (optional)', 'aria-label': 'Title', class: 'writer-title grow', value: first.title }) as HTMLInputElement;
  const stateLine = h('p', { id: 'writer-save-state', class: 'writer-state' });
  const status = h('p', { id: 'writer-status', class: 'status', role: 'status', 'aria-live': 'polite' });
  const text = h('textarea', {
    id: 'writer-text', name: 'text', rows: 14, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Your writing', ...langProps(tag),
  }) as HTMLTextAreaElement;
  text.classList.add('writer-text');
  text.value = first.text;

  const saveBtn = button('Save', () => { void doSave(); }, { id: 'writer-save', class: 'btn primary', title: 'Ctrl+S' });
  const analyseBtn = button('Analyse', () => { void doAnalyse(); }, { id: 'writer-analyse', class: 'btn' });
  const versionsBtn = button('Versions', () => togglePanel(versionsPanel), { id: 'writer-versions-btn', class: 'btn', 'aria-controls': 'writer-versions' });
  const exportBtn = button('Export', () => togglePanel(exportPanel), { id: 'writer-export-btn', class: 'btn', 'aria-controls': 'writer-export' });
  const deleteBtn = button('Delete draft', () => togglePanel(deletePanel), { id: 'writer-delete', class: 'btn', 'aria-controls': 'writer-delete-panel' });

  const bar = h('div', { class: 'writer-bar' },
    h('a', { href: '#/tell', class: 'btn', id: 'writer-back' }, 'Drafts'), title, saveBtn, analyseBtn, versionsBtn, exportBtn, deleteBtn);

  const promptPanel = h('details', { id: 'writer-prompt', class: 'writer-panel', open: true }, h('summary', {}, prompt ? 'Prompt and guidance' : 'Guidance')) as HTMLDetailsElement;
  const intentInput = h('textarea', { id: 'writer-intent', name: 'intent', rows: 2, maxlength: 400, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'writer-intent-help' }) as HTMLTextAreaElement;
  intentInput.addEventListener('input', () => { intent = intentInput.value; paintGuidance(); });
  const intentBox = targeted
    ? h('div', { class: 'field', id: 'writer-intent-box' },
      h('label', { class: 'cap', for: 'writer-intent' }, 'I want to say (in English)'), intentInput,
      h('span', { class: 'help', id: 'writer-intent-help' }, 'This stays on this device. It is not sent anywhere, not saved with the draft, and not used by any online service.'))
    : null;
  const guidanceBox = h('div', { id: 'writer-guidance' });

  const conflictBox = h('div', { id: 'writer-conflict', class: 'writer-panel', hidden: true });
  const versionsPanel = h('section', { id: 'writer-versions', class: 'writer-panel', hidden: true, 'aria-label': 'Versions' });
  const exportPanel = h('section', { id: 'writer-export', class: 'writer-panel', hidden: true, 'aria-label': 'Export' });
  const deletePanel = h('section', { id: 'writer-delete-panel', class: 'writer-panel', hidden: true, 'aria-label': 'Delete this draft' });
  const analysisBox = h('section', { id: 'writer-analysis', class: 'writer-panel', 'aria-label': 'Check results', 'aria-live': 'polite', hidden: true });
  const evidenceBox = h('section', { id: 'writer-evidence', class: 'writer-panel', 'aria-label': 'What this save recorded', hidden: true });

  promptPanel.append(guidanceBox);
  const root = h('section', { class: 'tell-writer', id: 'tell-writer', 'data-draft': draftId, 'data-mode': record.mode },
    bar, stateLine, status, promptPanel, intentBox, text, conflictBox, versionsPanel, exportPanel, deletePanel, analysisBox, evidenceBox);
  // the intent box belongs inside the guidance area for tab order: prompt, intent, text
  el.append(root);

  // ───────────── actions ─────────────
  async function doSave(): Promise<void> {
    saveBtn.disabled = true;
    try { await session.save(); } finally { saveBtn.disabled = false; }
    paint(true);
  }
  async function doAnalyse(): Promise<void> {
    analyseBtn.disabled = true;
    sentenceModels.clear(); pendingSentenceModel.clear();
    try { await session.analyse(); } finally { analyseBtn.disabled = false; }
    paint(true);
  }
  function togglePanel(panel: HTMLElement): void {
    const open = panel.hidden;
    closePanels();
    panel.hidden = !open;
    if (open) paint(true);
  }
  function closePanels(): void { versionsPanel.hidden = true; exportPanel.hidden = true; deletePanel.hidden = true; }

  async function ladder(issueId: string, level: AssistanceLevel, confirmed = false): Promise<void> {
    const r = await session.assist(issueId, level, { confirmed });
    if (!r.ok && r.needsConfirmation) { pendingModel.add(issueId); paint(true); focusKey(`issue:${issueId}:model-yes`); return; }
    pendingModel.delete(issueId);
    paint(true);
    focusKey(`issue:${issueId}:next`);
  }
  async function accept(correctionId: string, confirmMeaning = false): Promise<void> {
    const r = await session.accept(correctionId, { confirmMeaningChange: confirmMeaning });
    if (!r.ok && r.needsConfirmation) { pendingMeaning.add(correctionId); paint(true); focusKey(`correction:${correctionId}:yes`); return; }
    pendingMeaning.delete(correctionId);
    paint(true);
    if (r.ok) text.focus();
  }
  async function reject(correctionId: string): Promise<void> { pendingMeaning.delete(correctionId); await session.reject(correctionId); paint(true); }

  function focusKey(key: string): void {
    const t = root.querySelector<HTMLElement>(`[data-focus-key="${key}"]`);
    if (t) t.focus();
  }

  // ───────────── drawing ─────────────
  function stateText(v: WriterView): string {
    const n = v.versions.length;
    const where = v.saveState === 'saved' ? 'Saved to your account' : v.saveState === 'device-only' ? 'On this device only' : v.saveState === 'new' ? 'New draft, nothing saved yet' : 'Changes not saved yet';
    return `${MODE_INFO[v.record.mode].label} · ${where} · ${n} version(s)${v.dirty ? ' · autosaves to this device' : ''}`;
  }

  function stepNode(s: AssistanceStep): HTMLElement {
    const lvl = LADDER.find((l) => l.level === s.level);
    const src = SOURCE_LABEL[s.source];
    const rev = s.review ? REVIEW_LABEL[s.review] : '';
    return h('div', { class: 'tell-step', 'data-level': String(s.level), 'data-source': s.source, ...(s.review ? { 'data-review': s.review } : {}) },
      h('strong', {}, `${s.level}. ${lvl?.label ?? 'Help'}: `), h('span', { class: s.level >= 4 ? 'target-text' : '', ...(s.level >= 4 ? langProps(tag) : {}) }, s.content),
      s.revealedUnitIds.length ? h('span', { class: 'src' }, ` (shows ${s.revealedUnitIds.length} word(s) you did not have to produce)`) : null,
      src || rev ? h('div', { class: 'src' }, [src, rev].filter(Boolean).join(' · ')) : null);
  }

  function sentenceText(s: SentenceAnalysis, issues: Map<string, IssueView>): HTMLElement {
    const node = h('p', { class: 'text target-text', ...langProps(tag), 'data-sentence': String(s.index) });
    node.className = 'text target-text';
    const spans = s.issues
      .map((i) => ({ i, a: Math.max(0, Math.min(i.span.start, s.text.length)), b: Math.max(0, Math.min(i.span.end, s.text.length)) }))
      .filter((x) => x.b > x.a).sort((x, y) => x.a - y.a);
    let pos = 0;
    for (const sp of spans) {
      if (sp.a < pos) continue;
      if (sp.a > pos) node.append(s.text.slice(pos, sp.a));
      const iv = issues.get(sp.i.issueId);
      node.append(h('mark', { class: 'issue-mark', 'data-issue': sp.i.issueId, 'data-class': sp.i.class, 'data-state': iv?.state ?? 'open' },
        s.text.slice(sp.a, sp.b), h('span', { class: 'sr' }, ` (${CLASS_LABEL[sp.i.class] ?? sp.i.class})`)));
      pos = sp.b;
    }
    if (pos < s.text.length) node.append(s.text.slice(pos));
    return node;
  }

  function issueNode(iv: IssueView): HTMLElement {
    const id = iv.issue.issueId;
    const card = h('div', { class: 'tell-issue', 'data-issue-card': id, 'data-state': iv.state, 'data-class': iv.issue.class });
    card.append(h('div', {}, h('span', { class: 'label' }, CLASS_LABEL[iv.issue.class] ?? iv.issue.class), ' · ',
      h('span', { class: 'muted' }, `${iv.issue.category}, looked at by ${iv.issue.provenance.source.replace(/-/g, ' ')}`),
      iv.state === 'rejected' ? h('span', { class: 'tell-badge', 'data-rejected': 'true' }, ' rejected, kept muted') : null));
    for (const s of iv.steps) card.append(stepNode(s));
    for (const [lvl, why] of Object.entries(iv.refusals)) {
      card.append(h('div', { class: 'tell-step refused', 'data-refused': lvl }, h('strong', {}, `${lvl}. ${LADDER.find((l) => l.level === Number(lvl))?.label ?? 'Help'} was not given: `), why));
    }
    if (iv.state === 'open' || iv.steps.length === 0) {
      const row = h('div', { class: 'tell-ladder', role: 'group', 'aria-label': 'Help, one step at a time' });
      for (const step of LADDER) {
        const done = iv.steps.some((s) => s.level === step.level) || iv.refusals[step.level] !== undefined;
        const next = iv.nextLevel === step.level && iv.state === 'open';
        row.append(button(`${step.level}. ${step.label}`, () => { void ladder(id, step.level); }, {
          'data-level': String(step.level), 'data-next': next ? 'true' : 'false', 'data-done': done ? 'true' : 'false', disabled: !next, title: step.verb,
          ...(next ? { 'data-focus-key': `issue:${id}:next` } : {}),
        }));
      }
      card.append(row);
    }
    if (pendingModel.has(id)) {
      card.append(h('div', { class: 'tell-warning', 'data-model-confirm': id },
        'A model is the last step: it shows wording that is not yours. It may come from a sentence in the language pack and be marked unreviewed. Show it?', ' ',
        button('Yes, show a model', () => { void ladder(id, 6, true); }, { class: 'btn small', 'data-model-yes': id, 'data-focus-key': `issue:${id}:model-yes` }),
        button('Not now', () => { pendingModel.delete(id); paint(true); focusKey(`issue:${id}:next`); }, { class: 'btn small', 'data-model-no': id })));
    }
    if (iv.correction && iv.state === 'open') card.append(correctionNode(iv));
    return card;
  }

  function correctionNode(iv: IssueView): HTMLElement {
    const c = iv.correction!;
    const box = h('div', { class: 'tell-correction', 'data-correction': c.correctionId });
    box.append(
      h('p', { class: 'muted' }, 'Your sentence: ', h('span', { class: 'target-text', ...langProps(tag) }, c.original)),
      h('p', {}, 'Suggested: ', h('span', { class: 'target-text strong', ...langProps(tag) }, c.suggested)),
      ...(c.explanation ? [h('p', { class: 'muted' }, c.explanation)] : []),
      c.validation.checkerClean && c.validation.addsOnlyWithinSpans
        ? h('p', { class: 'muted' }, 'The checker finds nothing wrong in the suggestion, and it changes only the marked place. That is not a guarantee that it is right.')
        : h('p', { class: 'muted', 'data-validation': 'partial' }, `Not fully checked: ${c.validation.issues.join('; ') || 'the suggestion changes more than the marked place or the checker still sees something'}`));
    if (c.meaningChange) box.append(h('div', { class: 'tell-warning', 'data-meaning-warning': c.correctionId }, `This changes the meaning: ${c.meaningChange}`));
    if (pendingMeaning.has(c.correctionId)) {
      box.append(h('div', { class: 'tell-warning', 'data-meaning-confirm': c.correctionId },
        `This changes the meaning: ${c.meaningChange ?? ''}. Accept anyway?`, ' ',
        button('Accept anyway', () => { void accept(c.correctionId, true); }, { class: 'btn small primary', 'data-accept-anyway': c.correctionId, 'data-focus-key': `correction:${c.correctionId}:yes` }),
        button('Not now', () => { pendingMeaning.delete(c.correctionId); paint(true); }, { class: 'btn small', 'data-accept-cancel': c.correctionId })));
    } else {
      box.append(h('div', { class: 'row' },
        button('Accept correction', () => { void accept(c.correctionId); }, { class: 'btn small primary', 'data-accept': c.correctionId, title: 'Replaces this sentence only; the earlier text stays in your versions' }),
        button('Reject', () => { void reject(c.correctionId); }, { class: 'btn small', 'data-reject': c.correctionId })));
    }
    return box;
  }

  function paintAnalysis(v: WriterView): void {
    clear(analysisBox);
    analysisBox.hidden = !v.analysis && !v.analysing && !v.analysisError;
    if (analysisBox.hidden) return;
    if (v.analysing) { analysisBox.append(p('Checking your text. Nothing in it will be changed.', 'muted')); return; }
    if (v.analysisError) { analysisBox.append(h('p', { class: 'error', id: 'writer-analysis-error' }, v.analysisError)); return; }
    const a = v.analysis!;
    const byIssue = new Map(v.issues.map((i) => [i.issue.issueId, i] as const));
    const total = v.issues.length;
    analysisBox.append(h('h2', {}, 'Check results'),
      h('p', { id: 'writer-analysis-summary' }, total ? `${total} place(s) to look at in ${a.sentences.length} sentence(s). Your text has not been changed.` : `Nothing found in ${a.sentences.length} sentence(s). That means the checker saw nothing, not that the text is correct.`));
    if (v.stale) analysisBox.append(h('p', { class: 'tell-warning', id: 'writer-stale' }, 'You changed the text after this check, so the markers may be out of date. Analyse again to refresh them.'));
    if (v.coverage.length) {
      analysisBox.append(h('div', { id: 'writer-coverage', class: 'muted' }, h('strong', {}, 'What this checker cannot see: '), v.coverage.join(' ')));
    }
    for (const s of a.sentences) {
      const mine = v.issues.filter((i) => i.sentenceIndex === s.index);
      const wrap = h('div', { class: 'tell-sentence', 'data-sentence-block': String(s.index) }, sentenceText(s, byIssue));
      if (!mine.length) wrap.append(h('p', { class: 'muted' }, v.accepted.some((x) => x.sentenceIndex === s.index) ? 'Replaced with your accepted correction. Analyse again to re-check it.' : s.analysisStatus === 'none' ? 'Not checked.' : 'Nothing found here.'));
      for (const iv of mine) wrap.append(issueNode(iv));
      if (targeted && !v.stale) wrap.append(sentenceModelNode(s.index));
      analysisBox.append(wrap);
    }
  }

  function sentenceModelNode(index: number): HTMLElement {
    const box = h('div', { class: 'tell-sentence-model', 'data-sentence-model': String(index) });
    const got = sentenceModels.get(index);
    if (got) { box.append(typeof got === 'string' ? h('div', { class: 'tell-step refused', 'data-refused': '6' }, `No model was given: ${got}`) : stepNode(got)); return box; }
    if (pendingSentenceModel.has(index)) {
      box.append(h('div', { class: 'tell-warning' }, 'A model shows wording that is not yours, and it comes only from a sentence in the language pack or, if you allowed it, a remote assistant. Show it?', ' ',
        button('Yes, show a model', () => {
          void (async () => {
            const r = await session.modelForSentence(index, { confirmed: true });
            pendingSentenceModel.delete(index);
            sentenceModels.set(index, r.ok && r.step ? r.step : (r.ok ? 'none' : r.message));
            paint(true);
          })();
        }, { class: 'btn small', 'data-sentence-model-yes': String(index) }),
        button('Not now', () => { pendingSentenceModel.delete(index); paint(true); }, { class: 'btn small' })));
      return box;
    }
    box.append(button('Show a model for this sentence', () => { pendingSentenceModel.add(index); paint(true); }, { class: 'btn small', 'data-sentence-model-ask': String(index) }));
    return box;
  }

  function paintGuidance(): void {
    clear(guidanceBox);
    if (prompt) {
      guidanceBox.append(h('h3', {}, prompt.goal), p(prompt.instruction),
        h('p', { class: 'meta muted' }, DIFFICULTY_LABEL[prompt.difficulty] ?? prompt.difficulty,
          prompt.validation.authorship === 'machine-drafted' && !prompt.validation.reviewed ? [' · ', h('span', { class: 'tell-badge warn' }, 'machine-drafted, not yet reviewed')] : null));
      if (prompt.culturalNotes.length) guidanceBox.append(h('ul', { 'aria-label': 'Cultural notes' }, ...prompt.culturalNotes.map((n) => h('li', {}, n))));
    } else if (!targeted) guidanceBox.append(p('No prompt. Write what you want to say; nothing is checked until you ask.', 'muted'));
    const g = engine.guidance({ ...(prompt ? { prompt } : {}), ...(targeted && intent.trim() ? { intent } : {}), ...(profile ? { profile } : {}) });
    if (g.lines.length) guidanceBox.append(h('ul', { id: 'writer-guidance-lines' }, ...g.lines.map((l) => h('li', {}, l))));
    if (g.familiarWords.length) {
      guidanceBox.append(h('p', { id: 'writer-familiar' }, 'Words you already use that fit: ',
        ...g.familiarWords.flatMap((w, i) => [i ? ', ' : '', h('span', { class: 'target-text', ...langProps(tag) }, w)])));
    }
    const allFrames = [...new Set([...(prompt?.frames ?? []), ...g.frames])];
    if (allFrames.length) {
      if (targeted || frames) {
        guidanceBox.append(h('div', { id: 'writer-frames' }, h('p', { class: 'strong' }, 'A frame to start from'),
          h('ul', {}, ...allFrames.map((f) => h('li', { class: 'target-text', ...langProps(tag) }, f)))));
      } else guidanceBox.append(button('Show sentence frames', () => { frames = true; paintGuidance(); }, { id: 'writer-show-frames', class: 'btn small' }));
    }
    if (targeted && !intent.trim()) guidanceBox.append(p('Describe in English what you want to say, and the guidance will look for words you already use.', 'muted'));
  }

  function paintVersions(v: WriterView): void {
    clear(versionsPanel);
    if (versionsPanel.hidden) return;
    versionsPanel.append(h('h2', {}, 'Versions'));
    if (!v.versions.length) { versionsPanel.append(p('No versions yet. Save makes the first one.', 'muted')); return; }
    const ul = h('ul', { class: 'tell-versions' });
    for (const ver of [...v.versions].reverse()) {
      const n = v.versions.indexOf(ver) + 1;
      const counts = new Map<string, number>();
      for (const s of ver.sentences) counts.set(s.authorship, (counts.get(s.authorship) ?? 0) + 1);
      const li = h('li', { 'data-version': ver.versionId },
        h('strong', {}, `Version ${n}`), ` · ${shortDate(ver.at)}`, ver.note ? ` · ${ver.note}` : '',
        h('div', { class: 'muted' }, ver.sentences.length ? [...counts.entries()].map(([k, c]) => `${c} ${k.replace(/-/g, ' ')}`).join(', ') : 'no sentences recorded'),
        h('div', { class: 'row' },
          button('Compare with current text', () => { diffFor = diffFor === ver.versionId ? undefined : ver.versionId; paint(true); }, { class: 'btn small', 'data-diff': ver.versionId }),
          button('Restore', () => { void restore(ver.versionId); }, { class: 'btn small', 'data-restore': ver.versionId })));
      if (diffFor === ver.versionId) {
        const lines = session.diffAgainstCurrent(ver.versionId);
        li.append(h('div', { class: 'tell-diff', 'data-diff-for': ver.versionId, role: 'group', 'aria-label': 'Changes from this version to the current text' },
          ...(lines.length ? lines.map((l) => h('div', { class: l.kind, 'data-kind': l.kind }, h('span', { class: 'sr' }, l.kind === 'added' ? 'added: ' : l.kind === 'removed' ? 'removed: ' : 'unchanged: '), `${l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '- ' : '  '}${l.text}`))
            : [h('div', { class: 'muted' }, 'No differences.')])));
      }
      ul.append(li);
    }
    versionsPanel.append(ul, p('Restoring makes a new version with the old text. Nothing is ever overwritten.', 'muted'));
  }

  async function restore(versionId: string): Promise<void> {
    await session.restore(versionId);
    diffFor = undefined;
    paint(true);
  }

  function paintExport(): void {
    clear(exportPanel);
    if (exportPanel.hidden) return;
    exportPanel.append(h('h2', {}, 'Export this draft'), p('Downloads the text and its versions. Nothing is sent anywhere.', 'muted'),
      h('div', { class: 'row' }, ...DRAFT_EXPORT_FORMATS.map((f) => button(f, () => {
        const r = session.exportAs(f);
        if (r.ok && r.file) host.download(r.file);
        else if (!r.ok) status.textContent = r.message;
      }, { class: 'btn', 'data-export-as': f }))));
  }

  function paintDelete(v: WriterView): void {
    clear(deletePanel);
    if (deletePanel.hidden) return;
    deletePanel.append(h('h2', {}, 'Delete this draft?'),
      p(`This removes the draft and its ${v.versions.length} version(s) from this device and from your account. It cannot be undone. Export it first if you want a copy.`),
      h('div', { class: 'row' },
        button('Delete for good', () => {
          void (async () => {
            const r = await session.remove();
            if (r.ok && view.alive()) ctx.go('tell');
            else paint(true);
          })();
        }, { id: 'writer-delete-confirm', class: 'btn primary' }),
        button('Keep it', () => { deletePanel.hidden = true; paint(true); text.focus(); }, { id: 'writer-delete-cancel', class: 'btn' })));
  }

  function paintConflict(v: WriterView): void {
    clear(conflictBox);
    conflictBox.hidden = !v.conflict;
    if (!v.conflict) return;
    append(conflictBox, [p(v.conflict.reason),
      v.conflict.copyId ? h('p', {}, 'Your own text was kept as a separate draft: ', h('a', { href: `#/tell/write/${encodeURIComponent(v.conflict.copyId)}`, id: 'writer-conflict-copy' }, 'open the copy'), '.') : null]);
  }

  function paintEvidence(v: WriterView): void {
    clear(evidenceBox);
    evidenceBox.hidden = !v.lastEvidence;
    if (!v.lastEvidence) return;
    evidenceBox.append(h('h2', {}, 'What this recorded'),
      h('ul', { class: 'tell-evidence', id: 'writer-evidence-summary' }, ...v.lastEvidence.summary.map((l) => h('li', {}, l))),
      p('Your text is never part of this record. Only that you wrote, how much help was shown, and which words were involved.', 'muted'));
  }

  function paint(force = false): void {
    if (!view.alive()) return;
    const v = session.view();
    stateLine.textContent = stateText(v);
    status.textContent = v.status.text;
    status.setAttribute('data-kind', v.status.kind);
    if (document.activeElement !== title && title.value !== v.title && !v.dirty) title.value = v.title;
    const key = JSON.stringify([
      v.stale, v.analysing, v.analysisError ?? '', v.analysis ? v.analysis.at : '', v.accepted.length, v.issues.map((i) => [i.issue.issueId, i.state, i.steps.length, Object.keys(i.refusals).join(','), i.nextLevel ?? 0, i.correction?.correctionId ?? '']),
      [...pendingModel], [...pendingMeaning], [...pendingSentenceModel], [...sentenceModels.keys()], v.versions.length, !!v.conflict, v.lastEvidence ? v.lastEvidence.summary.join('|') : '', v.record.versions.length,
      versionsPanel.hidden, exportPanel.hidden, deletePanel.hidden, diffFor ?? '',
    ]);
    if (!force && key === lastKey) return;
    lastKey = key;
    if (modelsFor !== v.analysis) { modelsFor = v.analysis; sentenceModels.clear(); pendingSentenceModel.clear(); }
    const active = document.activeElement as HTMLElement | null;
    const focusKeyOf = active && root.contains(active) ? active.getAttribute('data-focus-key') : null;
    paintAnalysis(v);
    paintVersions(v);
    paintExport();
    paintDelete(v);
    paintConflict(v);
    paintEvidence(v);
    if (focusKeyOf) focusKey(focusKeyOf);
  }

  // ───────────── wiring ─────────────
  text.addEventListener('input', () => { session.setText(text.value); });
  text.addEventListener('blur', () => { void session.autosave(); });
  title.addEventListener('input', () => { session.setTitle(title.value); });
  const offText = session.onTextReplaced((t) => { if (text.value !== t) text.value = t; });
  const offChange = session.onChange(() => paint());

  const onKey = (e: KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); void doSave(); return; }
    if (e.key === 'Escape') {
      const anyOpen = !versionsPanel.hidden || !exportPanel.hidden || !deletePanel.hidden || pendingModel.size > 0 || pendingMeaning.size > 0 || pendingSentenceModel.size > 0 || promptPanel.open;
      if (!anyOpen) return;
      closePanels();
      pendingModel.clear(); pendingMeaning.clear(); pendingSentenceModel.clear();
      if (promptPanel.open && !targeted) promptPanel.open = false;
      paint(true);
      text.focus();
    }
  };
  document.addEventListener('keydown', onKey);
  view.onDispose(() => {
    document.removeEventListener('keydown', onKey);
    offText(); offChange();
    void session.autosave();
    session.dispose();
  });

  // the intent box sits inside the guidance panel so Tab goes prompt → intent → text
  if (intentBox) promptPanel.insertBefore(intentBox, guidanceBox);
  paintGuidance();
  paint(true);
  void session.profile().then((pr) => { if (view.alive() && pr) { profile = pr; paintGuidance(); } });
  if (first.text) text.setSelectionRange(first.text.length, first.text.length);
}
