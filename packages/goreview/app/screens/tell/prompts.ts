/** #/tell/prompts[/<mode>] — the prompt picker: category tabs, the prompts of this language, "Suggest one for me". */
import { CATEGORY_LABEL, createDraft, defaultCategory, isMode, MODE_INFO } from '../../../../gotell/src/workspace/drafts';
import { PROMPT_CATEGORIES, type PromptCategory, type WriterProfile, type WritingMode, type WritingPrompt } from '../../../../gotell/src/types';
import { profileSourceFor } from '../../../../gotell/src/workspace/profileSource';
import { append, button, clear, h, p, setStatus, statusLine } from '../../dom';
import { DIFFICULTY_LABEL, tellNav, type TellEnv } from './common';

export function promptCard(prompt: WritingPrompt, actions?: HTMLElement): HTMLElement {
  const v = prompt.validation;
  return h('li', { class: 'tell-prompt', 'data-prompt': prompt.promptId },
    h('h3', {}, prompt.goal),
    h('p', {}, prompt.instruction),
    h('p', { class: 'meta' }, `${DIFFICULTY_LABEL[prompt.difficulty] ?? prompt.difficulty} · ${CATEGORY_LABEL[prompt.category]}`,
      v.authorship === 'machine-drafted' && !v.reviewed ? [' ', h('span', { class: 'tell-badge warn', 'data-review': 'unreviewed' }, 'machine-drafted, not yet reviewed')] : null),
    prompt.culturalNotes.length ? h('ul', { class: 'cultural-notes', 'aria-label': 'Cultural notes' }, ...prompt.culturalNotes.map((n) => h('li', {}, n))) : null,
    actions ?? null);
}

export async function render(env: TellEnv, params: string[]): Promise<void> {
  const { el, ctx, host, engine, view } = env;
  const mode: WritingMode = isMode(params[0]) ? params[0] : 'guided';
  let category: PromptCategory | 'all' = defaultCategory(mode);
  const status = statusLine();
  const tabs = h('div', { class: 'tell-tabs', role: 'tablist', 'aria-label': 'Prompt categories', id: 'tell-categories' });
  const list = h('ul', { class: 'tell-prompts', id: 'tell-prompt-list' });
  const suggestion = h('div', { id: 'tell-suggestion', 'aria-live': 'polite' });
  let profile: WriterProfile | undefined;

  async function writeWith(prompt: WritingPrompt): Promise<void> {
    try {
      const rec = await createDraft(host, engine, { mode, prompt });
      if (view.alive()) ctx.go(`tell/write/${encodeURIComponent(rec.draftId)}`);
    } catch (e) { setStatus(status, e instanceof Error ? e.message : String(e), 'error'); }
  }

  const writeButton = (prompt: WritingPrompt): HTMLElement =>
    h('div', { class: 'row' }, button('Write with this prompt', () => { void writeWith(prompt); }, { class: 'btn small primary', 'data-write': prompt.promptId, 'aria-label': `Write with this prompt: ${prompt.goal}` }));

  function paintTabs(): void {
    clear(tabs);
    const all: Array<PromptCategory | 'all'> = ['all', ...PROMPT_CATEGORIES];
    for (const c of all) {
      tabs.append(button(c === 'all' ? 'All' : CATEGORY_LABEL[c], () => { category = c; paintTabs(); paintList(); },
        { role: 'tab', 'aria-selected': c === category ? 'true' : 'false', 'data-category': c, class: 'btn small' }));
    }
  }

  const testimonyNote = h('p', { class: 'notice', id: 'tell-testimony-note' },
    'These are an unordered set, not a script. Write only what is true for you; skip what does not apply. You can write them in any order, and none is required.');

  function paintList(): void {
    clear(list);
    testimonyNote.hidden = !(mode === 'testimony' || category === 'testimony');
    const prompts = engine.prompts({ mode, ...(category === 'all' ? {} : { category }) });
    if (!prompts.length) { list.append(h('li', { class: 'muted', id: 'tell-no-prompts' }, 'There are no prompts in this category for this mode and language yet. Try another tab, or write freely instead.')); return; }
    for (const pr of prompts) list.append(promptCard(pr, writeButton(pr)));
  }

  async function suggest(): Promise<void> {
    clear(suggestion);
    if (!profile) {
      try {
        profile = await engine.buildProfile(profileSourceFor(host), host.identity);
      } catch { /* the suggestion falls back to the language alone below */ }
    }
    if (!view.alive()) return;
    if (!profile) { suggestion.append(p('A suggestion needs your profile, which could not be built right now. Pick a prompt from the list.', 'notice')); return; }
    const pick = engine.suggestPrompt(profile, { mode, ...(category === 'all' ? {} : { category }) });
    if (!pick) { suggestion.append(p('Nothing to suggest in this category. Try another tab.', 'notice')); return; }
    suggestion.append(h('div', { class: 'tell-suggest' },
      h('p', { class: 'strong' }, 'Suggested for you'),
      h('ul', { class: 'tell-prompts' }, promptCard(pick.prompt, writeButton(pick.prompt))),
      h('p', { class: 'muted', id: 'tell-suggestion-reason' }, `Why this one: ${pick.reason}`)));
  }

  append(el, [tellNav('prompts')]);
  const header: Array<HTMLElement> = [h('h2', {}, `${MODE_INFO[mode].label}: choose a prompt`)];
  if (mode === 'targeted') header.push(p('Targeted writing is for one specific thing you want to say. You can start without a prompt and describe it in English in the editor.', 'muted'));
  const side: HTMLElement[] = [];
  if (mode === 'targeted') {
    side.push(button('Write without a prompt', () => {
      void (async () => {
        try { const rec = await createDraft(host, engine, { mode }); if (view.alive()) ctx.go(`tell/write/${encodeURIComponent(rec.draftId)}`); } catch (e) { setStatus(status, e instanceof Error ? e.message : String(e), 'error'); }
      })();
    }, { id: 'tell-targeted-free', class: 'btn' }));
  }
  const card = h('section', { class: 'card', id: 'tell-prompt-picker', 'aria-labelledby': 'tell-picker-h' });
  header[0].id = 'tell-picker-h';
  append(card, [...header, testimonyNote, tabs,
    h('div', { class: 'row' }, button('Suggest one for me', () => { void suggest(); }, { id: 'tell-suggest-btn', class: 'btn' }), ...side),
    suggestion, status, list]);
  el.append(card);
  paintTabs();
  paintList();
}
