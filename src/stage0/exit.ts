/**
 * The Stage 0 exit gate — transfer on unseen controlled material, not "opened every lesson".
 *
 * Form choice: the first form this learner has never started. Starting records exposure at once, so a second attempt on
 * the same form is never called unseen. Sections: reading (unseen passage, few lookups, no English), listening (unseen
 * audio — native recordings only; a computer voice is not a test of listening), writing (a small written response),
 * speaking (a retelling, recorded and compared with the model by the learner — yes / partly / no; never machine-scored),
 * decoding (Hindi, Thai: unseen words, Thai tone-from-spelling and finding word boundaries).
 * The READING section alone opens the ladder (`readingPassed`, `ladderOpening`); the verdict is advice, not the gate.
 * Verdict: ready (every section passed) · ready-provisional (every section that could be given passed; e.g. listening could
 * not be given without native recordings — said so) · not-yet (which sections to work on).
 */
import type { LanguageCode, Stage0ExitForm, Stage0ExitResult, Stage0ExitSection, Stage0ExitSectionResult, Stage0SelfCheck } from '../core';
import { stage0Config } from './lang';
import type { Stage0Pack } from './content';
import type { Stage0State } from './state';

export function chooseForm(pack: Stage0Pack, state: Stage0State): { form: Stage0ExitForm; unseen: boolean } | undefined {
  const forms = [...pack.exits.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!forms.length) return undefined;
  const started = new Set(state.exits.map((x) => x.started.formId));
  const fresh = forms.find((f) => !started.has(f.id));
  if (fresh) return { form: fresh, unseen: true };
  // every form already seen: the one seen longest ago, honestly marked as not unseen
  const lastSeen = (id: string) => state.exits.filter((x) => x.started.formId === id).map((x) => x.started.at).sort().pop() ?? '';
  return { form: [...forms].sort((a, b) => (lastSeen(a.id) < lastSeen(b.id) ? -1 : 1))[0], unseen: false };
}

/** Sections that cannot be given right now (listening without native recordings; speaking without a microphone). */
export function unavailableSections(form: Stage0ExitForm, opts: { microphone: boolean }): Stage0ExitSection[] {
  const out: Stage0ExitSection[] = [];
  if (!form.listening.lines.length || form.listening.lines.some((l) => l.audio?.status !== 'recorded')) out.push('listening');
  if (!opts.microphone) out.push('speaking');
  return out;
}

const pct = (n: number) => `${Math.round(n * 100)} %`;

/** The learner's own comparison counts as "same" when it is yes or partly (the pre-2026-10-07 wording 'like-model' reads as yes). */
export function selfCheckPasses(s: Stage0SelfCheck | undefined): boolean {
  return s === 'yes' || s === 'partly' || s === 'like-model';
}

/**
 * Whether a finished exit result passed its READING section — the only thing that opens the ladder. A result that carries no
 * sections (the simulator's, and any older one) is judged by its verdict: ready and ready-provisional both require reading,
 * which is never "unavailable"; not-yet does not.
 */
export function readingPassed(result: { sections?: ReadonlyArray<{ section: string; status: string }>; verdict?: string } | undefined): boolean {
  if (!result) return false;
  const reading = result.sections?.find((s) => s.section === 'reading');
  if (reading) return reading.status === 'passed';
  return result.verdict === 'ready' || result.verdict === 'ready-provisional';
}

/** How the ladder after Stage 0 was opened: a finished exit whose reading section passed (any attempt), or the learner's own override. */
export function ladderOpening(state: Pick<Stage0State, 'exits' | 'override'>): { open: boolean; by?: 'exit' | 'override'; overriddenAt?: string } {
  if (state.exits.some((x) => readingPassed(x.finished?.result))) return { open: true, by: 'exit', ...(state.override ? { overriddenAt: state.override.at } : {}) };
  if (state.override) return { open: true, by: 'override', overriddenAt: state.override.at };
  return { open: false };
}

export function scoreExit(lang: LanguageCode, form: Stage0ExitForm, attempt: Stage0State['exits'][number]): Stage0ExitResult {
  const cfg = stage0Config(lang).exit;
  const answers = attempt.answers;
  const latest = (section: Stage0ExitSection) => {
    const m = new Map<string, (typeof answers)[number]>();
    for (const a of answers) if (a.section === section) m.set(a.itemId, a);
    return [...m.values()];
  };
  const unavailable = new Set(attempt.started.unavailable);
  const sections: Stage0ExitSectionResult[] = [];

  // reading
  {
    const total = form.reading.checks.length;
    const got = latest('reading');
    const correct = got.filter((a) => a.correct).length;
    const lookups = got.reduce((n, a) => n + (a.lookups ?? 0), 0);
    const ok = total > 0 && correct / total >= cfg.reading.minCorrect && lookups <= cfg.reading.maxLookups;
    sections.push({ section: 'reading', status: got.length < total ? 'not-yet' : ok ? 'passed' : 'not-yet', score: { correct, total },
      detail: `${correct} of ${total} right (needs ${pct(cfg.reading.minCorrect)}), ${lookups} word lookup${lookups === 1 ? '' : 's'} (at most ${cfg.reading.maxLookups}).` });
  }
  // listening
  if (unavailable.has('listening')) {
    sections.push({ section: 'listening', status: 'unavailable', detail: 'Not given: this form has no reviewed native recordings yet. A computer voice is not a fair test of listening.' });
  } else {
    const total = form.listening.checks.length;
    const got = latest('listening');
    const correct = got.filter((a) => a.correct).length;
    const ok = total > 0 && correct / total >= cfg.listening.minCorrect;
    sections.push({ section: 'listening', status: got.length < total ? 'not-yet' : ok ? 'passed' : 'not-yet', score: { correct, total }, detail: `${correct} of ${total} understood by ear (needs ${pct(cfg.listening.minCorrect)}).` });
  }
  // writing
  {
    const total = form.writing.length;
    const got = latest('writing');
    const accepted = got.filter((a) => a.accepted).length;
    sections.push({ section: 'writing', status: accepted >= cfg.writing.minAccepted ? 'passed' : 'not-yet', score: { correct: accepted, total },
      detail: `${accepted} of ${total} written answers accepted (needs ${cfg.writing.minAccepted}).` });
  }
  // speaking: a retelling, recorded, then compared with the model by the learner ("did you say the same thing?"). Passes only when
  // enough attempts were recorded AND enough of them were judged "yes" or "partly" by the learner. Nothing is scored by a machine.
  if (unavailable.has('speaking')) {
    sections.push({ section: 'speaking', status: 'unavailable', detail: 'Not given: no microphone on this device.' });
  } else {
    const got = latest('speaking').filter((a) => a.recordingId);
    const same = got.filter((a) => selfCheckPasses(a.selfCheck));
    const ok = got.length >= cfg.speaking.minRecorded && same.length >= cfg.speaking.minSelfChecked;
    sections.push({ section: 'speaking', status: ok ? 'recorded' : 'not-yet', score: { correct: same.length, total: form.speaking.length },
      detail: ok
        ? `${got.length} spoken retelling${got.length === 1 ? '' : 's'} recorded; you judged ${same.length} the same as the model (yes or partly). Nobody has listened to them yet: play them to a speaker when you can.`
        : got.length < cfg.speaking.minRecorded
          ? 'Retell it aloud and record yourself, then compare with the model.'
          : `${got.length} recorded, but none judged the same as the model, even partly (needs ${cfg.speaking.minSelfChecked}). Try retelling it once more.` });
  }
  // decoding
  if (cfg.decoding) {
    const total = form.decoding?.length ?? 0;
    const got = latest('decoding');
    const correct = got.filter((a) => a.correct).length;
    const ok = total > 0 && correct / total >= cfg.decoding.minCorrect;
    sections.push({ section: 'decoding', status: got.length < total ? 'not-yet' : ok ? 'passed' : 'not-yet', score: { correct, total },
      detail: `${correct} of ${total} unseen words and patterns read correctly with no romanization (needs ${pct(cfg.decoding.minCorrect)}).` });
  }

  const required = sections.filter((s) => s.status !== 'unavailable');
  const passed = required.every((s) => s.status === 'passed' || s.status === 'recorded');
  const missing = sections.filter((s) => s.status === 'unavailable').map((s) => s.section);
  const verdict: Stage0ExitResult['verdict'] = !passed ? 'not-yet' : missing.length ? 'ready-provisional' : 'ready';
  const verdictDetail = verdict === 'ready'
    ? 'You can learn from new simple texts now: Stage 1 is open to you.'
    : verdict === 'ready-provisional'
      ? `Every part that could be given is passed — you can start Stage 1. Not given: ${missing.join(', ')}; ${missing.includes('listening') ? 'come back to the listening part when native recordings exist.' : ''}`.trim()
      : `Not yet: work on ${required.filter((s) => !(s.status === 'passed' || s.status === 'recorded')).map((s) => s.section).join(', ')}, then try the check again (you will get material you have not seen).${
        sections.find((s) => s.section === 'reading')?.status === 'passed' ? ' The reading part passed, so the path after Stage 0 is open to you.' : ' The path after Stage 0 opens when the reading part passes.'}`;
  return {
    attemptId: attempt.started.attemptId, formId: form.id, startedAt: attempt.started.at, ...(attempt.finished ? { finishedAt: attempt.finished.at } : {}),
    unseen: attempt.started.unseen, sections, verdict, verdictDetail,
  };
}
