/**
 * 6. Orientation. The pack’s own tutorial steps, one at a time: skippable in one click, repeatable at any time. The
 * practice steps put a demonstration sentence on the page and ask the learner to double-click the target word; the
 * real parser and the real card answer (tutorialLookup.ts), and the step is complete when the card’s surface is the
 * target. The lookup is recorded like any other, with producer.surface = 'tutorial'.
 */
import type { AppContext } from '../context';
import { append, button, clear, h, p, statusLine, setStatus } from '../dom';
import type { TutorialStepView, TutorialView } from '../ports';
import { createTutorialLookup, sameWord, type LookupOutcome, type TutorialLookup } from '../tutorialLookup';
import type { View } from './view';

export const DEFAULT_TUTORIAL_LANGUAGE = 'sq';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const session = await ctx.state.getSession();
  const languageId = session?.languageId || DEFAULT_TUTORIAL_LANGUAGE;
  const tutorial = ctx.deps.packs.tutorial(languageId);
  if (!view.alive()) return;
  if (!tutorial) {
    const pack = ctx.deps.packs.packFor(languageId);
    append(el, [p(`There is no orientation for ${pack?.name ?? languageId} yet. The card works the same way on any page once the extension is installed.`), h('p', {}, h('a', { class: 'btn', href: '#/sync' }, 'Continue →'))]);
    return;
  }
  const holder = h('div', { class: 'tutorial', id: 'tutorial-root' });
  el.append(holder);
  const controller = new TutorialController(holder, ctx, view, tutorial, languageId);
  view.onDispose(() => controller.destroy());
  await controller.start();
}

class TutorialController {
  private lookup: TutorialLookup | undefined;
  private completed = false;
  private step = 0;

  constructor(private readonly root: HTMLElement, private readonly ctx: AppContext, private readonly view: View, private readonly tutorial: TutorialView, private readonly languageId: string) {}

  async start(): Promise<void> {
    const progress = await this.ctx.state.getProgress();
    if (!this.view.alive()) return;
    if (progress.tutorial !== 'pending') { this.paintSummary(progress.tutorial); return; }
    this.step = Math.min(progress.tutorialStep, this.tutorial.steps.length - 1);
    this.paintStep();
  }

  destroy(): void { this.lookup?.destroy(); this.lookup = undefined; }

  // ── finished or skipped: a summary with “Repeat orientation”
  private paintSummary(state: 'done' | 'skipped'): void {
    this.destroy();
    clear(this.root);
    append(this.root, [
      h('p', { id: 'tutorial-state', 'data-state': state }, state === 'done' ? 'You have finished the orientation.' : 'You skipped the orientation.'),
      p(this.tutorial.notice, 'muted'),
      h('div', { class: 'row' },
        button('Repeat orientation', async () => {
          await this.ctx.state.patchProgress({ tutorial: 'pending', tutorialStep: 0 });
          this.ctx.changed();
          this.step = 0;
          this.paintStep();
        }, { id: 'tutorial-repeat', class: 'btn primary' }),
        h('a', { class: 'btn', href: '#/sync' }, 'Continue →')),
    ]);
  }

  private async finish(state: 'done' | 'skipped'): Promise<void> {
    await this.ctx.state.patchProgress({ tutorial: state, tutorialStep: 0 });
    this.ctx.changed();
    if (this.view.alive()) this.paintSummary(state);
  }

  // ── one step
  private paintStep(): void {
    this.destroy();
    this.completed = false;
    clear(this.root);
    const steps = this.tutorial.steps;
    const s = steps[this.step];
    const feedback = statusLine();
    feedback.id = 'tutorial-feedback';
    const next = h('button', { type: 'button', id: 'tutorial-next', class: 'btn primary' }, this.step === steps.length - 1 ? 'Finish' : 'Next') as HTMLButtonElement;
    const gated = !!s.practice;
    next.disabled = gated;
    next.addEventListener('click', () => {
      if (this.step >= steps.length - 1) { void this.finish('done'); return; }
      this.step++;
      void this.ctx.state.patchProgress({ tutorialStep: this.step });
      this.paintStep();
    });
    const back = button('Back', () => { this.step = Math.max(0, this.step - 1); void this.ctx.state.patchProgress({ tutorialStep: this.step }); this.paintStep(); }, { id: 'tutorial-back' }) as HTMLButtonElement;
    back.disabled = this.step === 0;
    const skip = button('Skip orientation', () => { void this.finish('skipped'); }, { id: 'tutorial-skip' });

    append(this.root, [
      p(this.tutorial.notice, 'muted'),
      h('p', { class: 'progress', id: 'tutorial-progress' }, `Step ${this.step + 1} of ${steps.length} · about ${s.estimatedMinutes} min`),
      h('h2', { id: 'tutorial-title' }, s.title),
      ...s.body.split(/\n{2,}/u).map((t) => p(t)),
      this.examples(s),
      this.interactive(s, feedback, next),
      feedback,
      h('div', { class: 'row nav' }, back, next, skip),
    ]);
  }

  private examples(s: TutorialStepView): HTMLElement | null {
    if (!s.examples?.length) return null;
    return h('table', { class: 'examples' },
      h('tbody', {}, ...s.examples.map((e) => h('tr', {}, h('th', { scope: 'row', lang: this.languageId }, e.surface), h('td', {}, e.gloss), h('td', { class: 'muted' }, e.note ?? '')))));
  }

  private interactive(s: TutorialStepView, feedback: HTMLElement, next: HTMLButtonElement): HTMLElement | null {
    if (!s.practice && !s.passage) return null;
    const wrap = h('div', { class: 'demo' });
    const onOutcome = (o: LookupOutcome): void => {
      const target = s.practice?.target;
      if (!target) { setStatus(feedback, `Looked up “${o.surface}”. The card is the one GoLearn shows on any page.${o.recorded === 'recorded' ? ' The encounter was recorded.' : ''}`, 'ok'); return; }
      if (sameWord(o.card.surface, target)) {
        this.completed = true;
        next.disabled = false;
        wrap.setAttribute('data-complete', 'true');
        setStatus(feedback, `Yes — that is “${target}”. This is the card GoLearn shows on any page: its dictionary form, meaning and form, with the reading’s confidence and where it comes from. ${o.recorded === 'recorded' ? 'The lookup was recorded as a tutorial encounter (it does not count as evidence that you know the word).' : o.recorded === 'duplicate' ? 'That lookup was already recorded in this session.' : 'The lookup could not be recorded on this device.'} You can go on.`, 'ok');
      } else {
        setStatus(feedback, `You looked up “${o.surface}” — the card works for any word. Now double-click “${target}”.`, 'info');
      }
    };
    this.lookup = createTutorialLookup({ ctx: this.ctx, languageId: this.languageId, onOutcome, onMessage: (t) => setStatus(feedback, t, 'info') });

    if (s.practice) {
      const para = h('p', { class: 'demo-sentence', id: 'demo-paragraph', lang: this.languageId }, s.practice.sentence);
      this.lookup.attach(para);
      const lookup = this.lookup;
      append(wrap, [
        p(`${s.practice.instruction}`, 'instruction'),
        p(`Double-click the word “${s.practice.target}” below.`, 'instruction strong'),
        para,
        h('div', { class: 'row' }, button('Select it for me', () => { void lookup.selectAndLookup(para, s.practice!.target); }, { id: 'demo-select' }),
          h('span', { class: 'muted' }, 'For the keyboard: this selects the word and looks it up.')),
      ]);
    } else if (s.passage) {
      const lookup = this.lookup;
      append(wrap, [h('h3', {}, s.passage.title), p('Double-click any word to open its card. The English line under each sentence is the drafter’s own, not a published translation.', 'muted')]);
      for (const sentence of s.passage.sentences) {
        const para = h('p', { class: 'demo-sentence', lang: this.languageId }, sentence.text);
        lookup.attach(para);
        append(wrap, [para, p(sentence.gloss, 'gloss muted')]);
      }
    }
    return wrap;
  }

  /** For tests and diagnostics: whether the current practice step has been completed. */
  get isComplete(): boolean { return this.completed; }
}
