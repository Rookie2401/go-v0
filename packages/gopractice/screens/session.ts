/**
 * The session interface: one exercise at a time, the answer, the feedback, and the summary.
 *
 * What is written, and when. An answer is graded at once for the feedback (`driver.preview`, which writes nothing) and
 * COMMITTED (`driver.answer`: grade, rate, record through the device queue, then advance) only when the learner moves on,
 * finishes, sets the item aside or leaves the screen. That is what lets "Challenge this answer" and "Report an analysis
 * error" take effect before anything is claimed: events are never edited, so the claim is made once. A skipped item writes
 * nothing. Finishing early writes nothing for the rest. If the queue refuses the event, the item stays on screen.
 *
 * What is never on screen before the response: every prompt field the exercise lists in `hiddenBeforeAnswer` (for audio
 * items, the transcript), and the voice's descriptor, which may name a source file. The audio object is never rendered.
 *
 * Keys: Enter submits (and moves on after feedback), 1-4 are the self-grades Again/Hard/Good/Easy (or the first four
 * choices in a choice question), Space plays and replays the audio, Esc skips the item. The character keys (1-4, Space) can
 * be turned off in the session controls (WCAG 2.1.4); Enter and Esc are not character keys and stay. The elapsed-time clock
 * can be hidden from the header (WCAG 2.2.2); nothing is announced every second either way.
 */
import type { Grading, Response } from '../../goreview/src/types';
import type { PlaybackHandle } from '../../golisten/src/contracts';
import type { AppContext } from '../context';
import { explainFailure } from '../config';
import { append, button, clear, embedTarget, field, h, langProps, p, setStatus, statusLine } from '../dom';
import {
  answerInTarget, DIMENSION_LABEL, duration, FAMILY_LABEL, forecastRecording, isAudioExercise, itemLabel, OUTCOME_LABEL, RATING_LABEL, unitLabel, withheldReason,
} from '../format';
import type { ActiveRun, ItemControl, Presented } from '../ports';
import { endSavedSession, recoverableSessions, resumeSession } from '../workspace';
import { fillItemHistory } from './history';
import { DEFAULT_UI, getUiPrefs, patchUiPrefs, type UiPrefs } from './uiprefs';
import type { View } from './view';

const GRADES = ['again', 'hard', 'good', 'easy'] as const;
const GRADE_MEANING: Record<(typeof GRADES)[number], string> = {
  again: 'forgot', hard: 'recalled with difficulty', good: 'recalled', easy: 'easy recall',
};

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const run = ctx.run.active;
  if (!run) {
    const root = h('section', { id: 'session-recovery', class: 'card', 'aria-labelledby': 'session-recovery-heading' },
      h('h2', { id: 'session-recovery-heading' }, 'Session not open'));
    const status = statusLine();
    const rows = h('div', { id: 'session-recovery-list' });
    root.append(p('A saved session may still be available. Completed reviews are already preserved; unanswered prompts remain due.', 'muted'), rows,
      h('a', { class: 'btn', href: '#/review' }, 'Back to GoReview'), status);
    el.append(root);
    const sessions = await recoverableSessions(ctx);
    if (!view.alive()) return;
    if (!sessions.length) { rows.append(p('No session is available to resume.', 'muted')); return; }
    for (const saved of sessions) {
      const row = h('div', { class: 'row', 'data-session-id': saved.sessionId },
        p(`Session from ${new Date(saved.startedAt).toLocaleString()} · ${saved.index} of ${saved.plan.items.length} prompts completed`, 'muted'),
        button('Resume session', () => {
          void (async () => {
            const resumed = await resumeSession(ctx, saved.sessionId);
            if (!resumed.ok) { setStatus(status, resumed.message, 'error'); return; }
            ctx.run.active = resumed.run;
            clear(el);
            await render(el, ctx, view);
          })();
        }, { class: 'btn primary', 'data-action': 'resume-session' }),
        button('End session', () => {
          void (async () => {
            const ended = await endSavedSession(ctx, saved.sessionId);
            if (!ended) { setStatus(status, 'The saved session could not be ended.', 'error'); return; }
            row.remove();
            setStatus(status, 'Session ended. Completed reviews are preserved; unanswered prompts remain due.', 'ok');
          })();
        }, { class: 'btn', 'data-action': 'end-session' }));
      rows.append(row);
    }
    return;
  }
  const root = h('div', { id: 'session', class: 'session' });
  el.append(root);
  if (run.finish) { await renderSummary(root, ctx, run); return; }
  await new Controller(root, ctx, run, view).start();
}

type Stage = 'loading' | 'prompt' | 'feedback' | 'summary';

class Controller {
  private stage: Stage = 'loading';
  private presented: Presented | undefined;
  /** The answer given and its preview, waiting to be committed. */
  private given: { response: Response; grading: Grading; challenged: boolean; committed?: import('../../goreview/src/types').ReviewResult } | undefined;
  private playback: PlaybackHandle | undefined;
  private hearings = 0;
  private completedHearings = 0;
  private observesPlaybackState = false;
  private playbackStateOff: (() => void) | undefined;
  /** A provider can fail after play() returns (for example a blocked Audio element). Keep that separate from a
   * hearing count so a failed attempt is never presented as listening evidence. */
  private audioPlaybackFailed = false;
  private revealed = false;
  /** Self-grade recall is evidence only when the learner explicitly confirms an attempt before the answer is shown. */
  private retrievalAttempted = false;
  /** Time spent on this visible card, measured from presentation (never from session planning). */
  private presentedAt: number | undefined;
  private lastReviewActivityAt: number | undefined;
  private activeReviewMs = 0;
  private clockHandle: unknown;
  private readonly tag: string;
  private busy = false;
  private readonly doc: Document;
  /** Interface switches of this device, read when the session screen opens. */
  private ui: UiPrefs = { ...DEFAULT_UI };

  constructor(private root: HTMLElement, private ctx: AppContext, private run: ActiveRun, view: View) {
    this.doc = ctx.deps.doc;
    this.tag = run.ctx.varietyId ?? run.ctx.languageId;
    const onKey = (ev: KeyboardEvent): void => { this.trackReviewActivity(); void this.key(ev); };
    const onActivity = (): void => this.trackReviewActivity();
    this.doc.addEventListener('keydown', onKey);
    this.doc.addEventListener('pointerdown', onActivity, true);
    this.doc.addEventListener('input', onActivity, true);
    this.doc.addEventListener('change', onActivity, true);
    view.onDispose(() => {
      this.doc.removeEventListener('keydown', onKey);
      this.doc.removeEventListener('pointerdown', onActivity, true);
      this.doc.removeEventListener('input', onActivity, true);
      this.doc.removeEventListener('change', onActivity, true);
      this.stopClock();
      this.disposeAudio();
      // leaving the screen: an answered item is committed, the rest of the plan stays due
      if (this.stage !== 'summary') void this.leave();
    });
  }

  async start(): Promise<void> {
    this.ui = await getUiPrefs(this.ctx);
    this.tick();
    await this.showCurrent();
  }

  // ───────────── flow ─────────────

  private async leave(): Promise<void> {
    try { await this.commit(); } catch { /* the answer could not be recorded; it is not claimed */ }
  }

  private async showCurrent(): Promise<void> {
    this.disposeAudio();
    this.presented = await this.run.driver.current();
    if (!this.presented) { await this.conclude('complete'); return; }
    this.given = undefined;
    this.revealed = false;
    this.retrievalAttempted = false;
    this.hearings = 0;
    this.completedHearings = 0;
    this.observesPlaybackState = false;
    this.audioPlaybackFailed = false;
    this.stage = 'prompt';
    this.paintPrompt(this.presented);
    this.presentedAt = this.ctx.deps.now().getTime();
    this.lastReviewActivityAt = this.presentedAt;
    this.activeReviewMs = 0;
  }

  private async finish(kind: 'complete' | 'early'): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await this.conclude(kind); } finally { this.busy = false; }
  }

  /** Commits what was answered, ends the session and shows the summary. */
  private async conclude(kind: 'complete' | 'early'): Promise<void> {
    try { await this.commit(); } catch (e) { this.say(`That answer could not be recorded (${e instanceof Error ? e.message : String(e)}). It stays on screen; try again.`, 'error'); return; }
    await this.run.driver.finish();
    this.run.finish = kind;
    this.run.endedAt = this.ctx.deps.now().getTime();
    this.stage = 'summary';
    this.stopClock();
    this.disposeAudio();
    clear(this.root);
    await renderSummary(this.root, this.ctx, this.run);
  }

  /** Records the answered item (if any) through the driver. Throws when the queue refuses; nothing advanced then. */
  private async commit(): Promise<void> {
    const g = this.given;
    const pr = this.presented;
    if (!g || !pr) return;
    if (g.committed) { this.given = undefined; return; }
    const response: Response = g.challenged ? { ...g.response, challenged: true } : g.response;
    const result = await this.run.driver.answer(response);
    this.given = undefined;
    this.run.results.push(result);
    const why = withheldReason(result, pr.exercise);
    if (why) this.run.withheld.push({ itemId: result.itemId, unitId: result.target.unitId, family: FAMILY_LABEL[result.family], reason: why });
  }

  private async next(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      try { await this.commit(); } catch (e) { this.say(`That answer could not be recorded (${e instanceof Error ? e.message : String(e)}). It stays on screen; try again.`, 'error'); return; }
      await this.showCurrent();
    } finally { this.busy = false; }
  }

  private async skip(): Promise<void> {
    if (this.busy || this.stage !== 'prompt' || !this.presented) return;
    this.busy = true;
    try {
      this.run.skipped.push(this.presented.planned.item.itemId);
      await this.run.driver.skip('skipped by the learner');
      await this.showCurrent();
    } finally { this.busy = false; }
  }

  private async control(c: ItemControl): Promise<void> {
    if (this.busy || !this.presented) return;
    this.busy = true;
    try {
      const item = this.presented.planned.item;
      try { await this.commit(); } catch (e) { this.say(`That answer could not be recorded (${e instanceof Error ? e.message : String(e)}).`, 'error'); return; }
      const ectx = await this.ctx.eventContext();
      const ev = ectx ? this.ctx.engine.controlEvent(ectx, item, c) : undefined;
      if (ev) {
        await this.ctx.record([ev]);
        this.run.controls.push({ itemId: item.itemId, unitId: item.unitId, control: c.kind });
      }
      // the answered item (if any) already advanced the session; an unanswered one is passed over without a write
      if (this.stage === 'prompt') await this.run.driver.skip(`set aside: ${c.kind}`);
      await this.showCurrent();
    } finally { this.busy = false; }
  }

  private async submit(response: Response, commitImmediately = false): Promise<void> {
    if (this.stage !== 'prompt' || !this.presented || this.busy) return;
    if (this.revealed && response.typed !== undefined) { this.say('The answer has been revealed. Use a self-grade instead of typing it.', 'info'); return; }
    this.busy = true;
    try {
      response = this.withReviewDuration(response);
      let grading: Grading;
      try { grading = await this.run.driver.preview(response); } catch (e) {
        this.say(`That answer could not be graded: ${e instanceof Error ? e.message : String(e)}`, 'error');
        return;
      }
      this.given = { response, grading, challenged: false };
      if (commitImmediately) {
        try {
          const result = await this.run.driver.answer(response);
          this.given.committed = result;
          this.run.results.push(result);
          const why = withheldReason(result, this.presented.exercise);
          if (why) this.run.withheld.push({ itemId: result.itemId, unitId: result.target.unitId, family: FAMILY_LABEL[result.family], reason: why });
        } catch (e) {
          this.given = undefined;
          this.say(`That answer could not be recorded (${e instanceof Error ? e.message : String(e)}). It stays on screen; try again.`, 'error');
          return;
        }
      }
      this.stage = 'feedback';
      this.paintFeedback(this.presented);
    } finally { this.busy = false; }
  }

  private withReviewDuration(response: Response): Response {
    const start = this.presentedAt;
    const end = this.ctx.deps.now().getTime();
    if (!response.retrievalAttempted || start === undefined || !Number.isFinite(start) || !Number.isFinite(end)) return response;
    this.trackReviewActivity(end);
    const elapsedMs = this.activeReviewMs;
    // Long inactive gaps are excluded; active review time is bounded to 15 minutes per item.
    if (elapsedMs <= 0 || elapsedMs > 900_000) return response;
    const seconds = Math.round((elapsedMs / 1000) * 100) / 100;
    return seconds > 0 && seconds <= 900 ? { ...response, reviewSeconds: seconds } : response;
  }

  private trackReviewActivity(at = this.ctx.deps.now().getTime()): void {
    if (this.stage !== 'prompt' || this.lastReviewActivityAt === undefined || !Number.isFinite(at)) return;
    const gap = at - this.lastReviewActivityAt;
    // Gaps longer than two minutes indicate an idle/abandoned interval and are not counted.
    if (gap > 0 && gap <= 120_000) this.activeReviewMs += gap;
    this.lastReviewActivityAt = at;
  }

  // ───────────── keyboard ─────────────

  private async key(ev: KeyboardEvent): Promise<void> {
    if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target as HTMLElement | null;
    const tag = t?.tagName ?? '';
    const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox' && (t as HTMLInputElement).type !== 'button') || !!t?.isContentEditable;
    const onControl = tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY';
    if (this.stage === 'prompt' && this.presented) {
      if (ev.key === 'Escape') { ev.preventDefault(); await this.skip(); return; }
      if (typing) return;
      const mode = this.presented.exercise.responseMode;
      if (!this.ui.shortcuts && (ev.key === ' ' || /^[1-4]$/.test(ev.key))) return; // one-key shortcuts are off: the buttons do the same
      if (/^[1-4]$/.test(ev.key)) {
        ev.preventDefault();
        const n = Number(ev.key) - 1;
        if ((mode === 'self-graded' || mode === 'typed-or-self') && this.revealed) await this.submit(this.base({ selfGrade: GRADES[n] }), true);
        else if (mode === 'self-graded' || mode === 'typed-or-self') this.say('Show the answer first (Enter), then grade yourself with 1 to 4.', 'info');
        else if (mode === 'choice') { const o = this.presented.exercise.prompt.options?.[n]; if (o !== undefined) await this.submit(this.base({ choice: o })); }
      } else if (ev.key === ' ' && this.presented.exercise.prompt.audio && !onControl) {
        ev.preventDefault();
        this.playOrReplay();
      } else if (ev.key === ' ' && !onControl && (mode === 'self-graded' || mode === 'typed-or-self') && !this.revealed) {
        ev.preventDefault();
        this.reveal();
      } else if (ev.key === 'Enter' && !onControl && mode === 'self-graded' && !this.revealed) {
        ev.preventDefault();
        this.reveal();
      }
      return;
    }
    if (this.stage === 'feedback' && ev.key === 'Enter' && !typing && !onControl) { ev.preventDefault(); await this.next(); }
  }

  // ───────────── prompt ─────────────

  private say(text: string, kind: 'info' | 'ok' | 'error' = 'info'): void {
    const s = this.root.querySelector<HTMLElement>('#session-status');
    if (s) setStatus(s, text, kind);
  }

  private base(extra: Partial<Response>): Response {
    const audio = !!this.presented?.exercise.prompt.audio;
    return {
      hinted: false, assistance: [], ...extra,
      retrievalAttempted: extra.retrievalAttempted ?? (extra.typed !== undefined || extra.choice !== undefined
        ? true : this.presented?.exercise.responseMode === 'self-graded' || this.presented?.exercise.responseMode === 'typed-or-self'
          ? this.retrievalAttempted : true),
      ...(audio ? {
        // A playback handle enters error when the browser rejects play() or reports a media error. Treat that as
        // "could not hear" even if the learner pressed Play; the runner then withholds the result entirely.
        audioFailed: extra.audioFailed === true || (this.observesPlaybackState
          ? this.completedHearings === 0
          : this.audioPlaybackFailed || this.playback?.state === 'error'),
        audioPlayed: this.observesPlaybackState ? this.completedHearings > 0 : this.hearings > 0 && !this.audioPlaybackFailed && this.playback?.state !== 'error',
        replays: this.observesPlaybackState
          ? Math.max(0, this.completedHearings - 1)
          : Math.max(this.playback?.replays ?? 0, Math.max(0, this.hearings - 1)), transcriptShownBefore: false,
      } : {}),
    };
  }

  private header(pr: Presented, withSkip: boolean): HTMLElement {
    return h('div', { class: 'progress row', id: 'session-header' },
      h('span', { id: 'session-progress' }, `Item ${pr.index + 1} of ${pr.total}`),
      h('span', { id: 'session-clock', class: 'muted', ...(this.ui.showClock ? {} : { hidden: true }) }, duration(this.ctx.deps.now().getTime() - this.run.startedAt)),
      h('span', { class: 'tag' }, FAMILY_LABEL[pr.exercise.family]),
      withSkip ? button('Skip (Esc)', () => void this.skip(), { id: 'skip', class: 'btn small' }) : null,
      button(this.ui.showClock ? 'Hide clock' : 'Show clock', () => void this.toggleClock(), { id: 'toggle-clock', class: 'btn small' }),
      button('Finish early', () => void this.finish('early'), { id: 'finish-early', class: 'btn small' }));
  }

  private paintPrompt(pr: Presented): void {
    const { exercise } = pr;
    const hidden = new Set<string>(exercise.hiddenBeforeAnswer);
    clear(this.root);
    const concealed = exercise.hiddenBeforeAnswer.length > 0 || isAudioExercise(exercise);
    const card = h('article', { class: 'exercise', 'data-family': exercise.family, 'data-mode': exercise.responseMode, ...(concealed ? {} : { 'data-item': pr.planned.item.itemId }) });
    append(card, [h('p', { class: 'instruction strong', id: 'instruction' }, exercise.prompt.instruction)]);
    const pp = exercise.prompt;
    if (pp.stimulusText && !hidden.has('stimulusText')) card.append(h('p', { ...langProps(this.tag), id: 'stimulus', class: 'target-text stimulus' }, pp.stimulusText));
    if (pp.sentenceWithGap && !hidden.has('sentenceWithGap')) card.append(h('p', { ...langProps(this.tag), id: 'sentence-gap', class: 'target-text stimulus' }, pp.sentenceWithGap));
    if (pp.meaning && !hidden.has('meaning')) card.append(h('p', { id: 'meaning', class: 'meaning' }, pp.meaning));
    if (pp.audio) card.append(this.audioBlock(pp.audio.replaysAllowed));
    card.append(this.responseArea(pr));
    append(this.root, [this.header(pr, true), card, h('p', { class: 'status', id: 'session-status', role: 'status', 'aria-live': 'polite' }), this.itemTools(pr, concealed)]);
    this.focusFirst();
  }

  private focusFirst(): void {
    const target = this.root.querySelector<HTMLElement>('#answer-input, .choice, #reveal');
    try { target?.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
  }

  private responseArea(pr: Presented): HTMLElement {
    const { exercise } = pr;
    const area = h('div', { class: 'response', id: 'response' });
    const mode = exercise.responseMode;
    const options = exercise.prompt.options ?? [];
    const target = answerInTarget(exercise.family);
    if (mode === 'choice') {
      const optsInTarget = exercise.family === 'grammar-application' || exercise.family === 'sentence-completion';
      area.append(h('div', { class: 'choices', role: 'group', 'aria-label': 'Choices' }, ...options.map((o, i) =>
        button(this.ui.shortcuts ? `${i + 1}  ${o}` : o, () => void this.submit(this.base({ choice: o })), { class: 'choice btn', 'data-choice': o, 'data-index': i + 1, ...(optsInTarget ? { lang: this.tag, dir: String(langProps(this.tag).dir) } : {}) }))));
    }
    if (mode === 'typed' || mode === 'typed-or-self') {
      const input = h('input', {
        type: 'text', id: 'answer-input', name: 'answer', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your answer',
        ...(target ? { lang: this.tag, dir: String(langProps(this.tag).dir) } : {}),
      }) as HTMLInputElement;
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); void this.submitTyped(input); }
      });
      const attempt = mode === 'typed-or-self' ? h('input', { type: 'checkbox', id: 'retrieval-attempted' }) as HTMLInputElement : undefined;
      attempt?.addEventListener('change', () => { this.retrievalAttempted = attempt.checked; });
      area.append(field('Your answer', input), h('div', { class: 'row' },
        button('Check (Enter)', () => void this.submitTyped(input), { id: 'answer-check', class: 'btn primary' }),
        mode === 'typed-or-self' ? button('Show the answer instead', () => this.reveal(), { id: 'reveal', class: 'btn' }) : null));
      if (attempt) area.append(h('label', { class: 'toggle attempt-toggle' }, attempt, h('span', {}, 'I tried to recall it before revealing the answer')));
    }
    if (mode === 'self-graded') {
      const attempt = h('input', { type: 'checkbox', id: 'retrieval-attempted' }) as HTMLInputElement;
      attempt.addEventListener('change', () => { this.retrievalAttempted = attempt.checked; });
      area.append(h('label', { class: 'toggle attempt-toggle' }, attempt, h('span', {}, 'I tried to recall it before revealing the answer')),
        h('div', { class: 'row' }, button('Reveal the answer', () => this.reveal(), { id: 'reveal', class: 'btn primary' })));
    }
    if (mode === 'self-graded' || mode === 'typed-or-self') area.append(h('div', { id: 'self-grade', class: 'self-grade', hidden: true }));
    return area;
  }

  private async submitTyped(input: HTMLInputElement): Promise<void> {
    const typed = input.value.trim();
    if (!typed) { this.say('Type an answer, or press Esc to skip.', 'info'); return; }
    await this.submit(this.base({ typed }));
  }

  /** Self-graded items: the reference answer appears, then the four grades. */
  private reveal(): void {
    if (this.stage !== 'prompt' || !this.presented || this.revealed) return;
    this.revealed = true;
    const { exercise } = this.presented;
    if (exercise.responseMode === 'typed-or-self') {
      const input = this.root.querySelector<HTMLInputElement>('#answer-input');
      if (input) { input.disabled = true; input.closest('.field')?.setAttribute('hidden', ''); }
      const check = this.root.querySelector<HTMLButtonElement>('#answer-check');
      if (check) check.hidden = true;
      const revealButton = this.root.querySelector<HTMLButtonElement>('#reveal');
      if (revealButton) revealButton.hidden = true;
      const attempt = this.root.querySelector<HTMLInputElement>('#retrieval-attempted');
      if (attempt) attempt.disabled = true;
    }
    const area = this.root.querySelector<HTMLElement>('#self-grade');
    if (!area) return;
    area.removeAttribute('hidden');
    const ref = exercise.answerKey.accepted[0] ?? '';
    append(area, [
      h('p', { class: 'reference' }, 'Answer: ', h('span', { ...(answerInTarget(exercise.family) ? langProps(this.tag) : {}), id: 'revealed-answer' }, ref)),
      h('p', { class: 'muted' }, 'How well did you know it?'),
      h('div', { class: 'row grades' }, ...GRADES.map((g, i) => button(this.ui.shortcuts ? `${i + 1}  ${RATING_LABEL[i + 1]} · ${GRADE_MEANING[g]}` : `${RATING_LABEL[i + 1]} · ${GRADE_MEANING[g]}`, () => void this.submit(this.base({ selfGrade: g }), true), { class: 'grade btn', 'data-grade': g }))),
      button('I needed help', () => void this.submit(this.base({ hinted: true, assistance: ['learner-requested-help'], retrievalAttempted: false, selfGrade: 'again' }), true), { id: 'grade-assisted', class: 'btn' }),
    ]);
    try { area.querySelector<HTMLElement>('.grade')?.focus({ preventScroll: true }); } catch { /* */ }
  }

  // ───────────── audio ─────────────

  private audioBlock(replaysAllowed: number): HTMLElement {
    const box = h('div', { class: 'audio', id: 'audio', role: 'group', 'aria-label': 'Audio question' });
    const count = h('span', { id: 'audio-count', class: 'muted', 'aria-live': 'polite' }, `Not played yet · ${replaysAllowed} replay(s) allowed`);
    const play = button(this.ui.shortcuts ? 'Play (Space)' : 'Play', () => this.playOrReplay(), { id: 'audio-play', class: 'btn primary' });
    const replay = button(this.ui.shortcuts ? 'Replay (Space)' : 'Replay', () => this.playOrReplay(), { id: 'audio-replay', class: 'btn', hidden: true });
    const failed = button('I could not hear it', () => void this.submit(this.base({ audioFailed: true })), { id: 'audio-failed', class: 'btn' });
    box.append(h('div', { class: 'row' }, play, replay, count, failed));
    return box;
  }

  /** First press plays, every later press replays. The playback handle is opened on the first press. */
  private playOrReplay(): void {
    const stimulus = this.presented?.exercise.prompt.audio;
    if (!stimulus || this.stage !== 'prompt') return;
    void (async () => {
      const audio = await this.ctx.audio();
      if (this.stage !== 'prompt') return;
      try {
        if (!this.playback) this.playback = audio?.playbackOf(stimulus);
        if (!this.playback) throw new Error('no audio');
        if (!this.playbackStateOff && this.playback.onState) {
          this.observesPlaybackState = true;
          this.playbackStateOff = this.playback.onState((state) => {
            if (state === 'error') {
              this.audioPlaybackFailed = true;
              if (this.stage === 'prompt') this.say('Audio could not be played here. Try again or choose “I could not hear it”.', 'error');
            }
            else if (state === 'ended') {
              this.completedHearings += 1;
              // A retry only becomes a valid hearing after it reaches its natural end.
              this.audioPlaybackFailed = false;
            }
          });
        }
        if (this.hearings === 0) this.playback.play(); else this.playback.replay();
        if (this.playback.state === 'error') {
          this.audioPlaybackFailed = true;
          this.say('Audio could not be played here. Try again or choose “I could not hear it”.', 'error');
          return;
        }
      } catch { this.say('Audio is not available here. You can choose "I could not hear it".', 'error'); return; }
      this.hearings += 1;
      const used = this.hearings - 1;
      const c = this.root.querySelector<HTMLElement>('#audio-count');
      if (c) c.textContent = `Played ${this.hearings} time${this.hearings === 1 ? '' : 's'} · replays ${used} of ${stimulus.replaysAllowed}${used > stimulus.replaysAllowed ? ' (extra replays are recorded as help)' : ''}`;
      this.root.querySelector<HTMLElement>('#audio-replay')?.removeAttribute('hidden');
      this.root.querySelector<HTMLElement>('#audio-play')?.setAttribute('hidden', '');
    })();
  }

  private disposeAudio(): void {
    try { this.playbackStateOff?.(); } catch { /* */ }
    this.playbackStateOff = undefined;
    try { this.playback?.dispose(); } catch { /* */ }
    this.playback = undefined;
    this.observesPlaybackState = false;
  }

  // ───────────── feedback ─────────────

  private paintFeedback(pr: Presented): void {
    const g = this.given!;
    const { exercise } = pr;
    const { response, grading } = g;
    clear(this.root);
    this.disposeAudio();
    const fb = h('section', { id: 'feedback', class: 'feedback', 'data-outcome': grading.outcome, 'aria-live': 'polite' });
    fb.append(h('h2', { id: 'outcome' }, response.audioFailed ? 'Not heard: nothing is claimed' : OUTCOME_LABEL[grading.outcome]));
    const gaveText = response.typed ?? response.choice ?? (response.selfGrade ? `self-graded: ${response.selfGrade}` : undefined);
    if (gaveText !== undefined) fb.append(h('p', {}, 'You: ', h('span', { ...(response.selfGrade || !answerInTarget(exercise.family) ? {} : langProps(this.tag)), id: 'given' }, gaveText)));
    const ref = exercise.answerKey.accepted[0];
    if (ref) {
      const also = exercise.answerKey.accepted.slice(1);
      fb.append(h('p', {}, 'Answer: ', h('span', { ...(answerInTarget(exercise.family) ? langProps(this.tag) : {}), id: 'reference' }, ref), also.length ? h('span', { class: 'muted' }, ` (also accepted: ${also.join(', ')})`) : null));
    }
    fb.append(h('p', { id: 'explanation' }, ...embedTarget(grading.explanation, this.targetWords(pr), this.tag)));
    const deeper = grading.deeper ?? exercise.answerKey.deeper;
    if (deeper) fb.append(h('details', { id: 'more' }, h('summary', {}, 'More'), h('p', {}, deeper)));
    if (isAudioExercise(exercise)) fb.append(this.revealAudio(pr));
    fb.append(h('p', { id: 'recording', class: 'muted' }, g.committed
      ? g.committed.rating === null ? 'Saved on this device without a graded memory update.' : 'Review saved on this device.'
      : forecastRecording(grading, g.challenged ? { ...response, challenged: true } : response, exercise)));
    fb.append(h('div', { class: 'row' },
      button('Next (Enter)', () => void this.next(), { id: 'next', class: 'btn primary' }),
      button('Challenge this answer', () => this.challenge(), { id: 'challenge', class: 'btn' })), this.reportForm(pr));
    append(this.root, [this.header(pr, false), fb, h('p', { class: 'status', id: 'session-status', role: 'status', 'aria-live': 'polite' }), this.itemTools(pr, false)]);
    try { this.root.querySelector<HTMLElement>('#next')?.focus({ preventScroll: true }); } catch { /* */ }
  }

  private revealAudio(pr: Presented): HTMLElement {
    const { exercise } = pr;
    const a = exercise.prompt.audio;
    const box = h('div', { id: 'audio-reveal', class: 'audio-reveal' });
    if (exercise.prompt.stimulusText) box.append(h('p', {}, 'What was said: ', h('span', { ...langProps(this.tag), id: 'transcript' }, exercise.prompt.stimulusText)));
    if (a) box.append(h('p', { class: 'muted' }, `Voice: ${a.voice.label} (${a.voice.synthetic ? 'synthetic' : 'recorded'}). ${a.validity.eligibleForEvidence ? 'A reviewed recording: this counts as listening evidence.' : a.validity.reason}`));
    return box;
  }

  /** Before the answer counts: the learner disputes the key. The result is kept, scheduled nowhere, and counts as no evidence. */
  private challenge(): void {
    const g = this.given;
    if (!g || g.challenged || !this.presented) return;
    if (g.committed && this.run.driver.undo) {
      const committed = g.committed;
      void this.run.driver.undo(committed.resultId, 'learner challenged the answer').then((updated) => {
        if (!updated) { this.say('This answer could not be reversed.', 'error'); return; }
        const index = this.run.results.findIndex((result) => result.resultId === updated.resultId);
        if (index >= 0) this.run.results[index] = updated;
        this.run.withheld.push({ itemId: updated.itemId, unitId: updated.target.unitId, family: FAMILY_LABEL[updated.family], reason: 'challenged after submission' });
        g.committed = updated;
        g.challenged = true;
        const rec = this.root.querySelector<HTMLElement>('#recording');
        if (rec) rec.textContent = forecastRecording(g.grading, { ...g.response, challenged: true }, this.presented!.exercise);
        const btn = this.root.querySelector<HTMLButtonElement>('#challenge');
        if (btn) btn.disabled = true;
        this.say('Challenged. The correction is recorded; this answer no longer counts as evidence.', 'ok');
      }).catch(() => this.say('This answer could not be reversed. Try again.', 'error'));
      return;
    }
    g.challenged = true;
    const rec = this.root.querySelector<HTMLElement>('#recording');
    if (rec) rec.textContent = forecastRecording(g.grading, { ...g.response, challenged: true }, this.presented.exercise);
    const btn = this.root.querySelector<HTMLButtonElement>('#challenge');
    if (btn) btn.disabled = true;
    this.say('Challenged. The answer stays in your history and is not counted as evidence or used to schedule the item.', 'ok');
  }

  private reportForm(pr: Presented): HTMLElement {
    const reason = h('textarea', { id: 'report-reason', rows: 2, 'aria-label': 'What is wrong with the analysis?' }) as HTMLTextAreaElement;
    const fix = h('input', { type: 'text', id: 'report-correction', autocomplete: 'off', spellcheck: 'false', placeholder: 'lemma:… or case=gen, number=pl' }) as HTMLInputElement;
    const out = statusLine();
    const send = button('Send the report', () => {
      void (async () => {
        const parsed = parseCorrection(fix.value);
        if (!parsed) { setStatus(out, 'Say what the analysis should be: a lemma id (lemma:…) or features such as case=gen.', 'error'); return; }
        const { api } = await this.ctx.api();
        const formId = pr.exercise.builtFrom.facts.find((f) => f.startsWith('form:')) ?? pr.exercise.target.unitId;
        try {
          const r = await api.correct({ formId, ...parsed, ...(reason.value.trim() ? { reason: reason.value.trim() } : {}), enrolmentId: this.run.ctx.enrolmentId, languageId: this.run.ctx.languageId });
          if (!r.ok) { setStatus(out, explainFailure(r), 'error'); return; }
          setStatus(out, 'Reported. The correction is recorded and the analysis may be replaced; this answer will not count as evidence.', 'ok');
          this.challenge();
        } catch { setStatus(out, 'The service could not be reached. Try again when you are online.', 'error'); }
      })();
    }, { id: 'report-send', class: 'btn' });
    return h('details', { id: 'report-error' }, h('summary', {}, 'Report an analysis error'),
      p('If the word was analysed wrongly (a wrong lemma or wrong grammar), tell the Repository. It records a correction you made; it does not change your answer.'),
      field('What is wrong?', reason), field('What it should be', fix, 'A lemma id (lemma:…) or features such as case=gen.'), h('div', { class: 'row' }, send), out);
  }

  // ───────────── per-item tools ─────────────

  /** `concealed`: nothing that could name the item (its label, id, reasons) is rendered; used for audio items before the response. */
  private itemTools(pr: Presented, concealed: boolean): HTMLElement {
    const until = (days: number): string => new Date(this.ctx.deps.now().getTime() + days * 24 * 3600_000).toISOString();
    const item = pr.planned.item;
    const histBox = h('div', { id: 'item-history', class: 'item-history' });
    return h('details', { id: 'item-tools', class: 'item-tools' }, h('summary', {}, 'This item'),
      concealed ? null : h('p', { class: 'muted' }, h('span', langProps(this.tag), unitLabel(item.unitId)), ` · ${DIMENSION_LABEL[item.dimension]}`),
      !concealed && pr.planned.why.length ? h('ul', { class: 'reasons' }, ...pr.planned.why.map((w) => h('li', {}, ...embedTarget(w, this.targetWords(pr), this.tag)))) : null,
      h('div', { class: 'row' },
        button('Snooze a day', () => void this.control({ kind: 'snooze', until: until(1) }), { id: 'snooze-day', class: 'btn small' }),
        button('Snooze a week', () => void this.control({ kind: 'snooze', until: until(7) }), { id: 'snooze-week', class: 'btn small' }),
        button('Suspend', () => void this.control({ kind: 'suspend' }), { id: 'suspend', class: 'btn small' }),
        button('Dismiss', () => void this.control({ kind: 'dismiss' }), { id: 'dismiss', class: 'btn small' }),
        concealed ? null : button('Show history', () => { void fillItemHistory(this.ctx, histBox, item.itemId, this.tag); }, { id: 'show-history', class: 'btn small' })),
      histBox);
  }

  /** Target-language words an interface sentence about this item may quote: its label, and the accepted answers when those are in the target language. */
  private targetWords(pr: Presented): string[] {
    return [unitLabel(pr.planned.item.unitId), ...(answerInTarget(pr.exercise.family) ? pr.exercise.answerKey.accepted : [])];
  }

  // ───────────── clock ─────────────

  private async toggleClock(): Promise<void> {
    this.ui = await patchUiPrefs(this.ctx, { showClock: !this.ui.showClock });
    const clock = this.root.querySelector<HTMLElement>('#session-clock');
    const btn = this.root.querySelector<HTMLButtonElement>('#toggle-clock');
    if (clock) { clock.hidden = !this.ui.showClock; if (this.ui.showClock) clock.textContent = duration(this.ctx.deps.now().getTime() - this.run.startedAt); }
    if (btn) btn.textContent = this.ui.showClock ? 'Hide clock' : 'Show clock';
  }

  private tick(): void {
    const timers = this.ctx.deps.timers ?? { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (x: unknown) => clearTimeout(x as ReturnType<typeof setTimeout>) };
    const loop = (): void => {
      const c = this.root.querySelector<HTMLElement>('#session-clock');
      if (c && this.ui.showClock) c.textContent = duration(this.ctx.deps.now().getTime() - this.run.startedAt);
      this.clockHandle = timers.set(loop, 1000);
    };
    this.clockHandle = timers.set(loop, 1000);
  }

  private stopClock(): void {
    const timers = this.ctx.deps.timers ?? { clear: (x: unknown) => clearTimeout(x as ReturnType<typeof setTimeout>) };
    if (this.clockHandle !== undefined) timers.clear(this.clockHandle);
    this.clockHandle = undefined;
  }
}

/** "lemma:sq:shtëpi:NOUN" or "case=gen, number=pl" → the fields of the correction route; undefined when neither is given. */
export function parseCorrection(text: string): { lexemeId: string } | { features: Record<string, string> } | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (t.startsWith('lemma:')) return { lexemeId: t };
  const features: Record<string, string> = {};
  for (const part of t.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^([A-Za-z][\w-]*)=(.+)$/.exec(part);
    if (!m) return undefined;
    features[m[1]] = m[2];
  }
  return Object.keys(features).length ? { features } : undefined;
}

// ───────────────────────────── summary ─────────────────────────────

export async function renderSummary(root: HTMLElement, ctx: AppContext, run: ActiveRun): Promise<void> {
  const tag = run.ctx.varietyId ?? run.ctx.languageId;
  const results = run.results;
  const planned = run.plan.items.length;
  const answered = results.length;
  const correct = results.filter((r) => r.grading.outcome === 'correct').length;
  const unbuildable = run.driver.skips().filter((s) => s.kind === 'build-failed');
  const left = Math.max(0, planned - answered - run.skipped.length - run.controls.length - unbuildable.length);
  const elapsed = (run.endedAt ?? ctx.deps.now().getTime()) - run.startedAt;
  const recorded = results.filter((r) => r.evidence);
  const counting = recorded.filter((r) => (r.evidence?.evidence?.quality ?? 'none') !== 'none');

  const byDim = new Map<string, { answered: number; correct: number; partial: number; incorrect: number; other: number }>();
  for (const r of results) {
    const key = DIMENSION_LABEL[r.target.dimension] ?? r.target.dimension;
    const d = byDim.get(key) ?? { answered: 0, correct: 0, partial: 0, incorrect: 0, other: 0 };
    d.answered += 1;
    if (r.grading.outcome === 'correct') d.correct += 1;
    else if (r.grading.outcome === 'partial') d.partial += 1;
    else if (r.grading.outcome === 'incorrect') d.incorrect += 1;
    else d.other += 1;
    byDim.set(key, d);
  }
  const kinds = new Map<string, number>();
  for (const r of recorded) kinds.set(r.evidence!.kind, (kinds.get(r.evidence!.kind) ?? 0) + 1);
  const view = await ctx.syncView();

  append(root, [
    h('section', { id: 'summary', class: 'card summary' },
      h('h2', {}, run.finish === 'early' ? 'Session ended early' : 'Session complete'),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Answered'), h('dd', { id: 'sum-answered' }, `${answered} of ${planned} planned, ${correct} correct`),
        h('dt', {}, 'Time'), h('dd', {}, duration(elapsed)),
        h('dt', {}, 'Skipped'), h('dd', { id: 'sum-skipped' }, String(run.skipped.length)),
        h('dt', {}, 'Set aside'), h('dd', { id: 'sum-controls' }, ...(run.controls.length ? run.controls.flatMap((c, i) => [i ? ', ' : '', h('span', langProps(tag), unitLabel(c.unitId)), ` (${c.control})`]) : ['none'])),
        h('dt', {}, 'Still due'), h('dd', { id: 'sum-left' }, `${left + run.skipped.length} item(s) were not answered; nothing was written for them, so they stay due.`)),
      h('h3', {}, 'Results by dimension'),
      answered ? h('table', { class: 'plain', id: 'sum-dimensions' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Dimension'), h('th', {}, 'Answered'), h('th', {}, 'Correct'), h('th', {}, 'Partly'), h('th', {}, 'Not quite'), h('th', {}, 'Not judged'))),
        h('tbody', {}, ...[...byDim].map(([k, d]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, String(d.answered)), h('td', {}, String(d.correct)), h('td', {}, String(d.partial)), h('td', {}, String(d.incorrect)), h('td', {}, String(d.other)))))) : p('No answers.', 'muted'),
      p('Dimensions are kept apart: a pass in one says nothing about another.', 'muted'),
      h('h3', {}, 'What was recorded'),
      h('p', { id: 'sum-recorded' }, recorded.length
        ? `${recorded.length} event(s) were written to your record (${[...kinds].map(([k, n]) => `${n} ${k}`).join(', ')}); ${counting.length} count as evidence.${run.addedCount ? ` Up to ${run.addedCount} new item(s) joined your deck as they were answered.` : ''}`
        : 'Nothing was written as evidence.'),
      h('h3', {}, 'What was withheld, and why'),
      run.withheld.length ? h('ul', { id: 'sum-withheld' }, ...run.withheld.map((w) => h('li', {}, h('span', langProps(tag), unitLabel(w.unitId)), ` (${w.family}): `, ...embedTarget(`${w.reason}.`, [unitLabel(w.unitId)], tag)))) : p('Nothing was withheld.', 'muted'),
      unbuildable.length ? h('p', { class: 'muted', id: 'sum-unbuildable' }, 'Could not be asked: ', ...unbuildable.flatMap((u, i) => [i ? '; ' : '', h('span', langProps(tag), itemLabel(u.itemId)), ` (${u.reason})`]), '.') : null,
      p(`${view.status?.pending ?? 0} event(s) wait to be sent${view.status?.online === false ? '; you are offline, so they wait on this device' : ''}.`, 'muted'),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/review', id: 'back-to-review' }, 'Back to GoReview'))),
  ]);
  if (run.driver.undo) {
    const undoable = results.filter((result) => result.evidence && !result.correctedAt && !result.response.challenged);
    if (undoable.length) {
      const status = statusLine();
      const section = h('section', { class: 'card', id: 'session-undo', 'aria-labelledby': 'session-undo-heading' },
        h('h2', { id: 'session-undo-heading' }, 'Correct a grade'),
        p('Undo appends a correction to your history; it does not erase the original event.', 'muted'), status,
        ...undoable.map((result) => h('div', { class: 'row', 'data-result-id': result.resultId },
          h('span', { lang: tag }, unitLabel(result.target.unitId)),
          h('span', {}, ` · ${DIMENSION_LABEL[result.target.dimension]} · ${result.grading.outcome}`),
          button('Undo this grade', () => {
            const control = [...section.querySelectorAll<HTMLElement>('[data-result-id]')]
              .find((row) => row.dataset.resultId === result.resultId)?.querySelector<HTMLButtonElement>('button');
            if (control) control.disabled = true;
            void run.driver.undo!(result.resultId, 'learner corrected review grade').then(async (updated) => {
              if (!updated) { setStatus(status, 'This grade could not be corrected.', 'error'); if (control) control.disabled = false; return; }
              const index = run.results.findIndex((row) => row.resultId === updated.resultId);
              if (index >= 0) run.results[index] = updated;
              run.withheld.push({ itemId: updated.itemId, unitId: updated.target.unitId, family: FAMILY_LABEL[updated.family], reason: 'grade reversed after submission' });
              clear(root);
              await renderSummary(root, ctx, run);
            }).catch((error) => { setStatus(status, `This grade could not be corrected: ${error instanceof Error ? error.message : 'try again'}`, 'error'); if (control) control.disabled = false; });
          }, { class: 'btn small' }))));
      root.append(section);
    }
  }
}
