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
 * be turned off in the session controls (WCAG 2.1.4); Enter and Esc are not character keys and stay. There is no timer on screen.
 */
import type { Grading, Response, SessionPlan } from '../../src/types';
import type { PlaybackHandle, PronunciationResult } from '../../../golisten/src/contracts';
import type { AppContext } from '../context';
import { explainFailure } from '../config';
import { append, button, clear, embedTarget, field, h, langProps, p, setStatus, statusLine } from '../dom';
import {
  answerInTarget, DIMENSION_LABEL, FAMILY_LABEL, forecastRecording, isAudioExercise, itemLabel, OUTCOME_LABEL, RATING_LABEL, unitLabel, withheldReason,
} from '../format';
import type { ActiveRun, ItemControl, Presented } from '../ports';
import type { ReviewExercise } from '../../src/exercises/shared';
import { beginSession, endSavedSession, loadReviewModel, recoverableSessions, resumeSession } from '../workspace';
import { fillItemHistory } from './history';
import { entriesOf, planFromEntries, planRemediation, planCurrentDeck, VOCAB_NOTE } from '../deckModel';
import { remediationBacklog } from '../../src/planner/remediation';
import { DEFAULT_UI, getUiPrefs, type UiPrefs } from './uiprefs';
import type { View } from './view';

const GRADES = ['again', 'hard', 'good', 'easy'] as const;
const OVERLAP_LABEL: Record<NonNullable<Presented['planned']['overlap']>, string> = {
  scheduled: 'Scheduled return', remediation: 'Remediation reassessment', explicit: 'Optional extra practice',
};
const PRESENTATION_REASON_LABEL: Record<string, string> = {
  'due-learning-return': 'A timed learning return became due.',
  'remediation-reassessment': 'You chose a delayed remediation reassessment.',
  'explicit-repeat': 'You chose to repeat this practice.',
};
const presentationReasonLabel = (reason: string | undefined, overlap: NonNullable<Presented['planned']['overlap']>): string =>
  PRESENTATION_REASON_LABEL[reason ?? ''] ?? OVERLAP_LABEL[overlap];

/** A speaker icon for the card's corner: plain SVG, no text; the button around it carries the name. */
function speakerIcon(doc: Document): Element {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '22', height: '22', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const body = doc.createElementNS(ns, 'path');
  body.setAttribute('d', 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z');
  const wave1 = doc.createElementNS(ns, 'path');
  wave1.setAttribute('d', 'M15.5 9.2a4 4 0 0 1 0 5.6');
  const wave2 = doc.createElementNS(ns, 'path');
  wave2.setAttribute('d', 'M18 6.8a7.4 7.4 0 0 1 0 10.4');
  svg.append(body, wave1, wave2);
  return svg;
}

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
  /** The summary's "Repeat this deck" / "New deck from the weak words": the new run takes this screen over, in place. */
  const restart = async (next: ActiveRun): Promise<void> => {
    if (!view.alive()) return;
    ctx.run.active = next;
    clear(el);
    await render(el, ctx, view);
  };
  if (run.finish) {
    const off = ctx.onData(() => { void repaintSummary(root, ctx, run, view, actions); });
    const actions: NextActions = { restart: async (next) => { off(); await restart(next); } };
    view.onDispose(off);
    await renderSummary(root, ctx, run, actions);
    return;
  }
  await new Controller(root, ctx, run, view, restart).start();
}

/**
 * A live update reached a finished session: the summary is drawn again from the same run (its sync line reads the fresh state).
 * Not while a grade is being undone (that button is disabled until the correction is written).
 */
async function repaintSummary(root: HTMLElement, ctx: AppContext, run: ActiveRun, view: View, actions?: NextActions): Promise<void> {
  if (!view.alive() || !root.querySelector('#summary') || root.querySelector('#session-undo button:disabled')) return;
  clear(root);
  await renderSummary(root, ctx, run, actions);
}

/** What the summary can start next; absent when the screen cannot be taken over (a summary drawn alone). */
export interface NextActions { restart(run: ActiveRun): Promise<void> }

type Stage = 'loading' | 'prompt' | 'feedback' | 'summary';

class Controller {
  private stage: Stage = 'loading';
  private presented: Presented | undefined;
  /** The answer given and its preview, waiting to be committed. */
  private given: { response: Response; grading: Grading; challenged: boolean; /** the analysis was reported wrong before the commit: the card is set aside once the answer is recorded */ keyIsWrong?: boolean; committed?: import('../../src/types').ReviewResult } | undefined;
  private playback: PlaybackHandle | undefined;
  private pronunciation: PlaybackHandle | undefined;
  private pronunciationStateOff: (() => void) | undefined;
  private pronunciationAbort: AbortController | undefined;
  private pronunciationUsed = false;
  private audioGeneration = 0;
  private pronunciationGeneration = 0;
  private managedPlayback = false;
  private hearings = 0;
  private completedHearings = 0;
  private observesPlaybackState = false;
  private playbackStateOff: (() => void) | undefined;
  /** A provider can fail after play() returns (for example a blocked Audio element). Keep that separate from a
   * hearing count so a failed attempt is never presented as listening evidence. */
  private audioPlaybackFailed = false;
  private revealed = false;
  private typingCard = false;
  private isFlashcard(): boolean { return this.presented?.exercise.family === 'written-recognition' && this.presented.exercise.responseMode === 'typed-or-self' && !this.typingCard; }
  /** Other self-graded exercises use an explicit attempt check; flashcard ratings state whether the learner recalled it. */
  private retrievalAttempted = false;
  /** Time spent on this visible card, measured from presentation (never from session planning). */
  private presentedAt: number | undefined;
  private lastReviewActivityAt: number | undefined;
  private activeReviewMs = 0;
  private readonly tag: string;
  private busy = false;
  /** A live update arrived while a card was on screen; the summary reads the new state anyway. */
  dataWaiting = false;
  private readonly doc: Document;
  /** Interface switches of this device, read when the session screen opens. */
  private ui: UiPrefs = { ...DEFAULT_UI };
  /** Set when the summary handed the screen to a new run: this controller then touches the screen no more. */
  private retired = false;
  private offData: () => void = () => {};
  private readonly actions: NextActions;

  constructor(private root: HTMLElement, private ctx: AppContext, private run: ActiveRun, view: View, restart: (run: ActiveRun) => Promise<void>) {
    this.actions = { restart: async (next) => { this.retired = true; this.offData(); await restart(next); } };
    this.doc = ctx.deps.doc;
    this.tag = run.ctx.varietyId ?? run.ctx.languageId;
    const onKey = (ev: KeyboardEvent): void => { this.trackReviewActivity(); void this.key(ev); };
    const onActivity = (): void => this.trackReviewActivity();
    const onSuspend = (): void => {
      this.trackReviewActivity();
      this.lastReviewActivityAt = undefined;
      this.disposeAudio();
    };
    const onResume = (): void => {
      if (this.stage === 'prompt') this.lastReviewActivityAt = this.ctx.deps.now().getTime();
    };
    this.doc.addEventListener('keydown', onKey);
    this.doc.addEventListener('pointerdown', onActivity, true);
    this.doc.addEventListener('input', onActivity, true);
    this.doc.addEventListener('change', onActivity, true);
    ctx.deps.win.addEventListener('suspend', onSuspend);
    ctx.deps.win.addEventListener('resume', onResume);
    // a live update while a card is on screen touches nothing (the answer box, the choice, the grade stay as they are);
    // what arrived is read when the summary is drawn, and a summary already on screen is drawn again
    this.offData = ctx.onData(() => {
      if (this.retired) return;
      if (this.stage === 'summary') void repaintSummary(this.root, this.ctx, this.run, view, this.actions);
      else this.dataWaiting = true;
    });
    view.onDispose(this.offData);
    view.onDispose(() => {
      this.doc.removeEventListener('keydown', onKey);
      this.doc.removeEventListener('pointerdown', onActivity, true);
      this.doc.removeEventListener('input', onActivity, true);
      this.doc.removeEventListener('change', onActivity, true);
      ctx.deps.win.removeEventListener('suspend', onSuspend);
      ctx.deps.win.removeEventListener('resume', onResume);
      this.disposeAudio();
      // leaving the screen: an answered item is committed, the rest of the plan stays due
      if (this.stage !== 'summary') void this.leave();
    });
  }

  async start(): Promise<void> {
    this.ui = await getUiPrefs(this.ctx);
    await this.showCurrent();
  }

  // ───────────── flow ─────────────

  private async leave(): Promise<void> {
    try { await this.commit(); } catch { /* the answer could not be recorded; it is not claimed */ }
  }

  private async showCurrent(): Promise<void> {
    this.disposeAudio();
    this.presented = await this.run.driver.current();
    this.run.plan = this.run.driver.state().plan;
    if (!this.presented) { await this.conclude('complete'); return; }
    this.given = undefined;
    this.revealed = false;
    this.typingCard = false;
    this.retrievalAttempted = false;
    this.hearings = 0;
    this.completedHearings = 0;
    this.observesPlaybackState = false;
    this.audioPlaybackFailed = false;
    this.pronunciationUsed = false;
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
    this.disposeAudio();
    clear(this.root);
    await renderSummary(this.root, this.ctx, this.run, this.actions);
  }

  /** Records the answered item (if any) through the driver. Throws when the queue refuses; nothing advanced then. */
  private async commit(): Promise<void> {
    const g = this.given;
    const pr = this.presented;
    if (!g || !pr) return;
    if (g.committed) { this.given = undefined; return; }
    // an analysis reported wrong before the commit: the answer is recorded, then retracted with keyIsWrong, so the invalidation can name
    // the recorded review and the card waits for verified facts (a pre-commit challenge alone records a null-rated answer and nothing else)
    const reportWrong = g.keyIsWrong && !!this.run.driver.undo;
    const response: Response = g.challenged && !reportWrong ? { ...g.response, challenged: true } : g.response;
    let result = await this.run.driver.answer(response);
    this.given = undefined;
    if (reportWrong) {
      const retracted = await this.run.driver.undo!(result.resultId, 'analysis reported wrong', { keyIsWrong: true }).catch(() => undefined);
      if (retracted) result = retracted;
      else this.say('The report was sent, but this answer could not be retracted here; it stays an ordinary answer. Challenge it from the summary.', 'error');
    }
    this.run.results.push(result);
    const why = reportWrong ? 'the analysis was reported wrong; the card waits for a repair' : withheldReason(result, pr.exercise);
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
      if (ev && ectx) {
        const history = await this.ctx.events(ectx.languageId);
        const prefs = await this.ctx.state.getPrefs(ectx.learnerId, ectx.languageId);
        const exists = this.ctx.engine.foldDeck(history, ectx.languageId, prefs, ectx.now).some(row => row.itemId === item.itemId);
        const batch = [];
        if (!exists) {
          const creation = this.ctx.engine.cardAdded(ectx, item, 'learner');
          creation.payload.lifecycle = 'create';
          creation.payload.admission = {at:ectx.now,intent:{kind:'explicit',reason:'selected-vocabulary',requestedAt:ectx.now}};
          batch.push(creation);
        }
        batch.push(ev);
        const recorded = await this.ctx.record(batch);
        if (recorded.refused.length) { this.say('The control could not be saved: ' + recorded.refused[0].issues.join('; '), 'error'); return; }
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
      if (this.isFlashcard() && response.selfGrade !== undefined && commitImmediately) {
        await this.showCurrent();
        return;
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
      } else if (ev.key === 'Enter' && !onControl && (mode === 'self-graded' || this.isFlashcard()) && !this.revealed) {
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
      hinted: false, ...extra,
      assistance: [...new Set([...(extra.assistance ?? []), ...(this.pronunciationUsed ? ['pronunciation'] : [])])],
      retrievalAttempted: extra.retrievalAttempted ?? (extra.typed !== undefined || extra.choice !== undefined
        ? true : this.presented?.exercise.responseMode === 'self-graded' || this.presented?.exercise.responseMode === 'typed-or-self'
          ? (this.isFlashcard() && extra.selfGrade !== undefined ? true : this.retrievalAttempted) : true),
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

  /** One quiet line: where the learner is, the kind of question, and two links. Nothing ticks and nothing is timed on screen. */
  private header(pr: Presented, withSkip: boolean): HTMLElement {
    return h('div', { class: 'session-bar', id: 'session-header', role: 'group', 'aria-label': 'Session' },
      h('span', { class: 'bar-kicker', id: 'session-progress' }, `${pr.index + 1} of ${pr.total}`),
      h('span', { class: 'bar-kicker bar-kind' }, FAMILY_LABEL[pr.exercise.family]),
      pr.planned.overlap ? h('span', { class: 'bar-kicker session-overlap', 'data-overlap': pr.planned.overlap },
        `${OVERLAP_LABEL[pr.planned.overlap]}${PRESENTATION_REASON_LABEL[pr.planned.presentationReason ?? ''] ? ` · ${PRESENTATION_REASON_LABEL[pr.planned.presentationReason!]}` : ''}`) : null,
      h('span', { class: 'bar-actions' },
        withSkip ? button('Skip', () => void this.skip(), { id: 'skip', class: 'linklike', title: 'Skip (Esc)', 'aria-keyshortcuts': 'Escape' }) : null,
        button('Finish early', () => void this.finish('early'), { id: 'finish-early', class: 'linklike' })));
  }

  private paintPrompt(pr: Presented): void {
    const { exercise } = pr;
    const hidden = new Set<string>(exercise.hiddenBeforeAnswer);
    clear(this.root);
    const concealed = exercise.hiddenBeforeAnswer.length > 0 || isAudioExercise(exercise);
    const card = h('article', { class: 'exercise', 'data-family': exercise.family, 'data-mode': exercise.responseMode, ...(concealed ? {} : { 'data-item': pr.planned.item.itemId }) });
    if (this.isFlashcard()) {
      card.classList.add('flashcard');
      card.setAttribute('data-side', 'front');
      card.setAttribute('aria-label', 'Flashcard front');
      card.append(h('p', { class: 'flashcard-label', id: 'flashcard-label' }, 'Recall the meaning'));
    } else append(card, [h('p', { class: 'instruction strong', id: 'instruction' }, exercise.prompt.instruction)]);
    const pp = exercise.prompt;
    const wordContext = (exercise as ReviewExercise).context;
    if (pp.stimulusText && !hidden.has('stimulusText')) {
      card.append(h('p', { ...langProps(this.tag), id: 'stimulus', class: 'target-text stimulus' }, this.isFlashcard() && wordContext?.surface ? wordContext.surface : pp.stimulusText));
      if (this.isFlashcard() && wordContext?.surface) card.append(h('p', { ...langProps(this.tag), class: 'flashcard-context' }, pp.stimulusText));
    }
    if (pp.sentenceWithGap && !hidden.has('sentenceWithGap')) card.append(h('p', { ...langProps(this.tag), id: 'sentence-gap', class: 'target-text stimulus' }, pp.sentenceWithGap));
    if (pp.meaning && !hidden.has('meaning')) card.append(h('p', { id: 'meaning', class: 'meaning' }, pp.meaning));
    const pronunciation = this.pronunciationBlock(pr);
    if (pronunciation) card.append(pronunciation);
    if (pp.audio) card.append(this.audioBlock(pp.audio.replaysAllowed));
    card.append(this.responseArea(pr));
    append(this.root, [this.header(pr, true), pr.index === 0 && pr.planned.why.includes(VOCAB_NOTE) ? h('p', { class: 'muted', id: 'vocab-note' }, VOCAB_NOTE) : null, card, h('p', { class: 'status', id: 'session-status', role: 'status', 'aria-live': 'polite' }), this.itemTools(pr, concealed)]);
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
    if (this.isFlashcard()) {
      area.append(button(this.ui.shortcuts ? 'Show answer (Space)' : 'Show answer', () => this.reveal(), { id: 'reveal', class: 'btn primary' }),
        button('Type an answer', () => { this.typingCard = true; this.paintPrompt(pr); }, { id: 'type-answer', class: 'btn small' }),
        h('div', { id: 'self-grade', class: 'self-grade', hidden: true }));
      return area;
    }
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
    const flashcard = this.isFlashcard();
    if (flashcard) {
      const card = this.root.querySelector<HTMLElement>('.flashcard');
      card?.setAttribute('data-side', 'back');
      card?.setAttribute('aria-label', 'Flashcard back');
      const label = this.root.querySelector<HTMLElement>('#flashcard-label');
      if (label) label.textContent = 'Meaning';
      const typing = this.root.querySelector<HTMLElement>('#type-answer');
      if (typing) typing.hidden = true;
    }
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
      h('p', { class: 'reference' }, h('span', { class: 'sr' }, 'Answer: '), h('span', { ...(answerInTarget(exercise.family) ? langProps(this.tag) : {}), id: 'revealed-answer' }, ref)),
      h('p', { class: 'muted' }, 'How well did you know it?'),
      h('div', { class: 'grades', role: 'group', 'aria-label': 'How well did you know it?' }, ...GRADES.map((g, i) => {
        const word = RATING_LABEL[i + 1];
        const choice = button('', () => void this.submit(this.base({ selfGrade: g }), true), { class: 'grade', 'data-grade': g, 'aria-label': word, ...(this.ui.shortcuts ? { 'aria-keyshortcuts': String(i + 1) } : {}) });
        append(choice, [h('span', { class: 'grade-dot', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'grade-word' }, word)]);
        return choice;
      })),
      h('p', { class: 'grade-help' }, button('I needed help', () => void this.submit(this.base({ hinted: true, assistance: ['learner-requested-help'], retrievalAttempted: false, selfGrade: 'again' }), true), { id: 'grade-assisted', class: 'linklike' })),
    ]);
    if (flashcard) area.append(h('details', {}, h('summary', {}, 'More detail'), h('p', {}, exercise.answerKey.explanation)));
    try { area.querySelector<HTMLElement>('.grade')?.focus({ preventScroll: true }); } catch { /* */ }
  }

  // ───────────── audio ─────────────

  /** Pronounce only text already visible on this card; audio-only prompts stay fully concealed. */
  private pronunciationTarget(pr: Presented): { text: string; kind: 'word' | 'phrase' } | undefined {
    const exercise = pr.exercise;
    const afterAnswer = this.stage === 'feedback';
    if (isAudioExercise(exercise) && !afterAnswer) return undefined;
    const hidden = new Set(exercise.hiddenBeforeAnswer);
    if (hidden.has('stimulusText') && !afterAnswer) return undefined;
    const context = (exercise as ReviewExercise).context;
    const revealedTarget = afterAnswer && answerInTarget(exercise.family) ? exercise.answerKey.accepted[0] : undefined;
    const text = context?.surface ?? exercise.prompt.stimulusText ?? revealedTarget;
    if (!text?.trim()) return undefined;
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return undefined;
    return { text: normalized, kind: /\s/.test(normalized) ? 'phrase' : 'word' };
  }

  private pronunciationBlock(pr: Presented): HTMLElement | null {
    if (!this.ctx.deps.audio) return null;
    const target = this.pronunciationTarget(pr);
    if (!target) return null;
    return h('div', { class: 'pronunciation', id: 'pronunciation', role: 'group', 'aria-label': 'Pronunciation' },
      (() => {
        const hear = button('', () => this.pronounce(target), { id: 'pronounce', class: 'icon-btn', 'aria-label': 'Hear word', title: 'Hear word' });
        hear.append(speakerIcon(this.ctx.deps.doc));
        return hear;
      })(),
      h('span', { id: 'pronunciation-status', class: 'muted', role: 'status', 'aria-live': 'polite' }));
  }

  private pronounce(target: { text: string; kind: 'word' | 'phrase' }): void {
    if ((this.stage !== 'prompt' && this.stage !== 'feedback') || !this.presented) return;
    const generation = ++this.pronunciationGeneration;
    this.disposePronunciation();
    const abortController = new AbortController();
    this.pronunciationAbort = abortController;
    const status = this.root.querySelector<HTMLElement>('#pronunciation-status');
    if (status) status.textContent = 'Preparing pronunciation…';
    void (async () => {
      let audio: Awaited<ReturnType<AppContext['audio']>>;
      try { audio = await this.ctx.audio(); } catch {
        if (generation === this.pronunciationGeneration && status) status.textContent = 'Pronunciation is not available here.';
        return;
      }
      if (generation !== this.pronunciationGeneration || (this.stage !== 'prompt' && this.stage !== 'feedback')) return;
      if (!audio?.pronounce) {
        if (status) status.textContent = 'Pronunciation is not available here.';
        return;
      }
      let result: PronunciationResult;
      try {
        result = await audio.pronounce({
          languageId: this.run.ctx.languageId,
          ...(this.run.ctx.varietyId ? { varietyId: this.run.ctx.varietyId } : {}),
          text: target.text,
          kind: target.kind,
          autoplay: false,
          processingPermission: 'allowed',
          signal: abortController.signal,
        });
      } catch {
        if (status) status.textContent = 'Pronunciation failed. Continue without audio.';
        return;
      }
      if (generation !== this.pronunciationGeneration || (this.stage !== 'prompt' && this.stage !== 'feedback')) {
        if (result.ok) result.playback.dispose();
        return;
      }
      if (!result.ok) {
        if (status) status.textContent = result.message;
        return;
      }
      this.pronunciation = result.playback;
      const off = result.playback.onState?.((state) => {
        if (generation !== this.pronunciationGeneration) return;
        if ((state === 'playing' || state === 'ended') && this.stage === 'prompt') this.pronunciationUsed = true;
        if (state === 'error' && status) status.textContent = 'Pronunciation could not be played here. Continue without audio.';
        else if (status) status.textContent = ''; // a normal playback says nothing; only a failure is worth a line
      });
      this.pronunciationStateOff = off;
      try { result.playback.play(); } catch {
        off?.();
        result.playback.dispose();
        this.pronunciation = undefined;
        if (status) status.textContent = 'Pronunciation could not be played here. Continue without audio.';
        return;
      }
      if (status) status.textContent = result.playback.state === 'error' ? 'Pronunciation could not be played here. Continue without audio.' : '';
      if (this.stage === 'prompt' && (result.playback.state === 'playing' || result.playback.state === 'ended')) this.pronunciationUsed = true;
    })();
  }

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
    const generation = ++this.audioGeneration;
    void (async () => {
      const audio = await this.ctx.audio();
      if (generation !== this.audioGeneration || this.stage !== 'prompt' || this.presented?.exercise.prompt.audio !== stimulus) return;
      try {
        if (!this.playback) {
          this.playback = audio?.playbackOf(stimulus);
          this.managedPlayback = typeof audio?.source()?.releaseStimulus === 'function';
        }
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
    this.audioGeneration += 1;
    this.pronunciationGeneration += 1;
    this.disposePronunciation();
    try { this.playbackStateOff?.(); } catch { /* */ }
    this.playbackStateOff = undefined;
    // The runner owns prepared stimuli, including an unanswered one reopened after navigation.
    try { if (this.managedPlayback) this.playback?.stop(); else this.playback?.dispose(); } catch { /* */ }
    this.playback = undefined;
    this.managedPlayback = false;
    this.observesPlaybackState = false;
  }

  private disposePronunciation(): void {
    try { this.pronunciationAbort?.abort(); } catch { /* */ }
    this.pronunciationAbort = undefined;
    try { this.pronunciationStateOff?.(); } catch { /* */ }
    this.pronunciationStateOff = undefined;
    try { this.pronunciation?.stop(); } catch { /* */ }
    try { this.pronunciation?.dispose(); } catch { /* */ }
    this.pronunciation = undefined;
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
    const pronunciation = this.pronunciationBlock(pr);
    if (pronunciation) fb.append(pronunciation);
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

  /**
   * Before the answer counts: the learner disputes the key. The result is kept, scheduled nowhere, and counts as no evidence.
   * With keyIsWrong (the analysis was reported wrong), the card is also set aside until verified facts repair it, so the same key
   * does not come back next session (2026-10-29).
   */
  private challenge(opts: { keyIsWrong?: boolean } = {}): void {
    const g = this.given;
    if (!g || g.challenged || !this.presented) return;
    if (g.committed && this.run.driver.undo) {
      const committed = g.committed;
      void this.run.driver.undo(committed.resultId, opts.keyIsWrong ? 'analysis reported wrong' : 'learner challenged the answer', opts).then((updated) => {
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
    if (opts.keyIsWrong) g.keyIsWrong = true;
    const rec = this.root.querySelector<HTMLElement>('#recording');
    if (rec) rec.textContent = forecastRecording(g.grading, { ...g.response, challenged: true }, this.presented.exercise);
    const btn = this.root.querySelector<HTMLButtonElement>('#challenge');
    if (btn) btn.disabled = true;
    this.say(opts.keyIsWrong ? 'Reported. The answer will not count as evidence, and the card waits until the analysis is repaired.' : 'Challenged. The answer stays in your history and is not counted as evidence or used to schedule the item.', 'ok');
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
          setStatus(out, 'Reported. The correction is recorded and the analysis may be replaced; this answer will not count as evidence, and the card waits until the analysis is repaired.', 'ok');
          this.challenge({ keyIsWrong: true });
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

/** Next paths are labeled by their actual scheduling purpose. */
async function nextDeckSection(ctx: AppContext, run: ActiveRun, actions: NextActions, _tag: string): Promise<HTMLElement> {
  const planned = run.plan.initialQuestionCount ?? run.plan.items.length;
  const status = statusLine();
  const model = await loadReviewModel(ctx);
  const scheduled = model ? await planCurrentDeck(ctx, model) : undefined;
  const remediation = model ? remediationBacklog(model.deck.filter(item => !item.invalidatedAt), model.events, model.now) : [];
  const cards = (n: number): string => `${n} card${n === 1 ? '' : 's'}`;
  const begin = async (make: (model: NonNullable<Awaited<ReturnType<typeof loadReviewModel>>>) => Promise<SessionPlan | undefined>, buttons: HTMLButtonElement[]): Promise<void> => {
    for (const b of buttons) b.disabled = true;
    try {
      const model = await loadReviewModel(ctx);
      if (!model) { setStatus(status, 'Choose a language first.', 'error'); return; }
      const plan = await make(model);
      if (!plan || !plan.items.length) { setStatus(status, 'None of these cards can be asked right now.', 'info'); return; }
      const r = await beginSession(ctx, model, { plan });
      if (!r.ok) { setStatus(status, r.message, 'info'); return; }
      await actions.restart(r.run);
    } catch (e) {
      setStatus(status, `The next deck could not be started: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally { for (const b of buttons) b.disabled = false; }
  };
  const repeat = button('Repeat this batch', () => { void begin(async (model) => {
    return planFromEntries(ctx, model, entriesOf(run.plan), run.plan.batch?.targetQuestions ?? run.plan.questionLimit ?? planned);
  }, [repeat]); },
    { class: 'btn', id: 'repeat-deck', 'aria-label': `Repeat this deck: the same ${cards(planned)} again` });
  const fresh = button('Begin ready reassessment', () => { void begin(async (model) => planRemediation(ctx, model), [repeat, fresh]); },
    { class: 'btn primary', id: 'begin-remediation' });
  fresh.disabled = !remediation.some(c => c.ready);
  const nextAt = scheduled?.summary.nextReturnAt;
  const nextReviewAt = scheduled?.summary.nextReviewAt;
  const continueWork = scheduled?.entries.length ? button(`Continue ready work (${cards(scheduled.entries.length)})`, (event) => {
    void begin(async (model) => (await planCurrentDeck(ctx, model)).plan, [event.currentTarget as HTMLButtonElement]);
  }, { id: 'continue-due-work', class: 'btn primary' }) : undefined;
  const setupLink = ctx.deps.links?.setup ?? ctx.deps.links?.extension;
  const goLearn = setupLink ? h('a', { class: 'btn', id: 'continue-golearn', href: setupLink }, 'Continue reading in GoLearn') : null;
  const remediationNote = h('p', { class: 'muted', id: 'next-remediation-note' },
    `Remediation is optional and separate from due work: ${remediation.filter(c => !c.studiedAt).length} need study, ${remediation.filter(c => !!c.studiedAt && !c.ready).length} await their delayed return, and ${remediation.filter(c => c.ready).length} are ready for reassessment.`);
  const extra = h('details', { id: 'optional-extra-practice', class: 'card' }, h('summary', {}, 'Optional extra practice'),
    h('p', { class: 'muted', id: 'optional-repeat-note' }, 'Repeat the same session items, capped by your current deck size and session time settings. Other saved-deck members remain available in their collection; this does not represent a new due session.'), repeat);
  return h('section', { id: 'summary-next', class: 'card', 'aria-labelledby': 'summary-next-heading' },
    h('h2', { id: 'summary-next-heading' }, 'Next'),
    p(`Next scheduled session: ${scheduled?.entries.length ?? 0} eligible question(s) now · ${scheduled?.summary.dueReviews ?? 0} due reviews · ${scheduled?.summary.dueLearning ?? 0} due learning returns · ${scheduled?.summary.newAvailable ?? 0} new admissions.`, 'muted'),
    continueWork ?? null,
    nextAt ? p(`Next short-term learning return: ${new Date(nextAt).toLocaleString()}. GoReview keeps it scheduled; you do not need to wait here.`, 'muted') : null,
    nextReviewAt ? p(`Next scheduled review: ${new Date(nextReviewAt).toLocaleString()}.`, 'muted') : null,
    remediationNote,
    fresh,
    h('div', { class: 'row' }, button(remediation.some(c => !c.studiedAt) ? 'Study remediation' : 'Open remediation', () => ctx.go('review/remediation'), { class: 'btn', id: 'open-remediation' })),
    h('h3', {}, 'Continue GoLearn'), goLearn ?? p('Continue your next reading in GoLearn; GoReview keeps your due work here.', 'muted'),
    extra, status);
}

export async function renderSummary(root: HTMLElement, ctx: AppContext, run: ActiveRun, actions?: NextActions): Promise<void> {
  const tag = run.ctx.varietyId ?? run.ctx.languageId;
  const results = run.results;
  const sessionState = run.driver.state();
  const initialPlanCount = sessionState.plan.initialQuestionCount ?? run.plan.initialQuestionCount ?? run.plan.items.length;
  const presentedCount = sessionState.presentations?.length ?? (results.length + run.skipped.length + run.controls.length);
  const answered = results.length;
  const correct = results.filter((r) => r.grading.outcome === 'correct').length;
  const unbuildable = run.driver.skips().filter((s) => s.kind === 'build-failed');
  const left = Math.max(0, sessionState.plan.items.length - sessionState.index) + (sessionState.deferredItems?.length ?? 0);
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
  const overlapPresentations = (run.driver.state().presentations ?? []).filter(row => row.overlap);
  const overlapSection = overlapPresentations.length ? h('section', { class: 'card', id: 'session-overlap-history', 'aria-labelledby': 'session-overlap-heading' },
    h('h3', { id: 'session-overlap-heading' }, 'Why questions appeared again'),
    p('GoReview records why each repeated presentation was scheduled, requested, or part of remediation.', 'muted'),
    h('ul', {}, ...overlapPresentations.map(row => {
      const item = run.plan.items.find(planItem => planItem.item.itemId === row.itemId)?.item;
      return h('li', { 'data-overlap': row.overlap }, `${item ? unitLabel(item.unitId) : 'Question'} · ${presentationReasonLabel(row.presentationReason, row.overlap!)}`);
    }))) : null;

  append(root, [
    h('section', { id: 'summary', class: 'card summary' },
      h('h2', {}, run.finish === 'early' ? 'Session ended early' : 'Session complete'),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Answered'), h('dd', { id: 'sum-answered' }, `${answered} answered; ${presentedCount} prompt(s) shown; ${initialPlanCount} initially planned; ${correct} correct`),
        h('dt', {}, 'Skipped'), h('dd', { id: 'sum-skipped' }, String(run.skipped.length)),
        h('dt', {}, 'Set aside'), h('dd', { id: 'sum-controls' }, ...(run.controls.length ? run.controls.flatMap((c, i) => [i ? ', ' : '', h('span', langProps(tag), unitLabel(c.unitId)), ` (${c.control})`]) : ['none'])),
        h('dt', {}, 'Still due'), h('dd', { id: 'sum-left' }, `${left + run.skipped.length} item(s) were not answered; nothing was written for them, so they stay due.`)),
      h('h3', {}, 'Results by dimension'),
      answered ? h('table', { class: 'plain', id: 'sum-dimensions' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Dimension'), h('th', {}, 'Answered'), h('th', {}, 'Correct'), h('th', {}, 'Partly'), h('th', {}, 'Not quite'), h('th', {}, 'Not judged'))),
        h('tbody', {}, ...[...byDim].map(([k, d]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, String(d.answered)), h('td', {}, String(d.correct)), h('td', {}, String(d.partial)), h('td', {}, String(d.incorrect)), h('td', {}, String(d.other)))))) : p('No answers.', 'muted'),
      p('Dimensions are kept apart: a pass in one says nothing about another.', 'muted'),
      overlapSection,
      h('h3', {}, 'What was recorded'),
      h('p', { id: 'sum-recorded' }, recorded.length
        ? `${recorded.length} event(s) were written to your record (${[...kinds].map(([k, n]) => `${n} ${k}`).join(', ')}); ${counting.length} count as evidence.${run.addedCount ? ` Up to ${run.addedCount} new item(s) joined your deck as they were answered.` : ''}`
        : 'Nothing was written as evidence.'),
      h('h3', {}, 'What was withheld, and why'),
      run.withheld.length ? h('ul', { id: 'sum-withheld' }, ...run.withheld.map((w) => h('li', {}, h('span', langProps(tag), unitLabel(w.unitId)), ` (${w.family}): `, ...embedTarget(`${w.reason}.`, [unitLabel(w.unitId)], tag)))) : p('Nothing was withheld.', 'muted'),
      unbuildable.length ? h('p', { class: 'muted', id: 'sum-unbuildable' }, 'Could not be asked: ', ...unbuildable.flatMap((u, i) => [i ? '; ' : '', h('span', langProps(tag), itemLabel(u.itemId)), ` (${u.reason})`]), '.') : null,
      p(`${view.status?.pending ?? 0} event(s) wait to be sent${view.status?.online === false ? '; you are offline, so they wait on this device' : ''}.`, 'muted'),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/review', id: 'back-to-review' }, 'Back to GoReview'))),
    ...(actions ? [await nextDeckSection(ctx, run, actions, tag)] : []),
  ]);
  if (run.driver.undo) {
    const undoable = results.filter((result) => result.evidence && !result.correctedAt && !result.response.challenged);
    if (undoable.length) {
      const status = statusLine();
      const section = h('section', { class: 'card', id: 'session-undo', 'aria-labelledby': 'session-undo-heading' },
        h('h2', { id: 'session-undo-heading' }, 'Correct a grade'),
        p('Undo appends a correction to your history; it does not erase the original event.', 'muted'), status,
        ...undoable.map((result, index) => h('div', { class: 'row', 'data-result-id': result.resultId },
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
          }, { class: 'btn small', 'aria-label': `Undo this grade for ${unitLabel(result.target.unitId)} (${DIMENSION_LABEL[result.target.dimension]}, review ${index + 1})` }))));
      root.append(section);
    }
  }
}
