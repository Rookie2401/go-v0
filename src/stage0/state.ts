/**
 * Stage 0 learner state — a PURE fold of the Stage0* events of one learner and language. Nothing is stored; the state is
 * rebuilt on every read, so a backup of the events restores it exactly.
 *
 * Kept apart: reading checks (and whether English came first), listening checks by channel and audio source (a computer
 * voice is practice, never evidence), decoding per feature, production by kind, speaking, support dependence.
 * A feature is SECURE after `secureAfter` correct decodes in a row with no transliteration shown, or four unaided
 * correct readings of words that carry it (a reading check answered right, text only, no romanization, no English).
 */
import type {
  DomainEvent, LanguageCode, Stage0CheckAnswered, Stage0DecodeAnswered, Stage0ExitAnswered, Stage0ExitFinished, Stage0ExitStarted,
  Stage0FeatureState, Stage0Meters, Stage0ProductionAttempted, Stage0ProductionKind, Stage0SpeakingRecorded,
  Stage0StepCompleted, Stage0SupportUsed,
} from '../core';
import { stage0Config } from './lang';

export const STAGE0_TYPES = [
  'Stage0CheckAnswered', 'Stage0DecodeAnswered', 'Stage0SupportUsed', 'Stage0ProductionAttempted', 'Stage0SpeakingRecorded',
  'Stage0StepCompleted', 'Stage0SettingsChanged', 'Stage0ExitStarted', 'Stage0ExitAnswered', 'Stage0ExitFinished',
] as const;
export type Stage0Event = Extract<DomainEvent, { type: (typeof STAGE0_TYPES)[number] }>;

/** Unaided correct readings of a feature that make it secure even without decode checks. */
export const READ_SECURE = 4;
/** Recent window for the independence and dependence meters. */
export const WINDOW = 20;

export interface Stage0StepFacts {
  stepId: string;
  events: number;
  completed: boolean;
  completedAt?: string;
  /** Latest answer per check id. */
  checks: Map<string, Stage0CheckAnswered>;
  decodes: Map<string, Stage0DecodeAnswered>;
  production: Map<string, Stage0ProductionAttempted[]>;
  speaking: Stage0SpeakingRecorded[];
  supports: Stage0SupportUsed[];
}

export interface Stage0State {
  lang: LanguageCode;
  steps: Map<string, Stage0StepFacts>;
  features: Map<string, Stage0FeatureState & { readUnaided: number }>;
  segmentation: { correct: number; streak: number; secure: boolean };
  speakerForm?: 'm' | 'f';
  checks: Stage0CheckAnswered[];
  exits: Array<{ started: Stage0ExitStarted; answers: Stage0ExitAnswered[]; finished?: Stage0ExitFinished }>;
  meters: Stage0Meters;
}

const facts = (stepId: string): Stage0StepFacts => ({ stepId, events: 0, completed: false, checks: new Map(), decodes: new Map(), production: new Map(), speaking: [], supports: [] });

export function foldStage0(lang: LanguageCode, events: DomainEvent[]): Stage0State {
  const cfg = stage0Config(lang);
  const secureAfter = cfg.script.transliteration?.secureAfter ?? 2;
  const segAfter = cfg.script.segmentation?.secureAfter ?? 3;
  const steps = new Map<string, Stage0StepFacts>();
  const features = new Map<string, Stage0FeatureState & { readUnaided: number }>();
  const segmentation = { correct: 0, streak: 0, secure: false };
  const checks: Stage0CheckAnswered[] = [];
  const exits: Stage0State['exits'] = [];
  const production: Partial<Record<Stage0ProductionKind, { accepted: number; attempts: number }>> = {};
  let speakerForm: 'm' | 'f' | undefined;
  let recorded = 0;
  const feature = (f: string) => {
    let s = features.get(f);
    if (!s) { s = { feature: f, attempts: 0, correct: 0, unaidedStreak: 0, secure: false, readUnaided: 0 }; features.set(f, s); }
    return s;
  };
  const sorted = [...events].filter((e) => e.lang === lang && (STAGE0_TYPES as readonly string[]).includes(e.type)).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)) as Stage0Event[];
  for (const e of sorted) {
    const st = steps.get(e.stepId) ?? facts(e.stepId);
    steps.set(e.stepId, st);
    st.events++;
    switch (e.type) {
      case 'Stage0CheckAnswered':
        st.checks.set(e.checkId, e);
        checks.push(e);
        for (const f of e.unaidedFeatures) { const s = feature(f); s.readUnaided++; if (s.readUnaided >= READ_SECURE) s.secure = true; }
        break;
      case 'Stage0DecodeAnswered': {
        st.decodes.set(e.checkId, e);
        if (e.kind === 'segment') {
          if (e.correct) { segmentation.correct++; segmentation.streak++; } else segmentation.streak = 0;
          if (segmentation.streak >= segAfter) segmentation.secure = true;
        }
        for (const f of e.features) {
          const s = feature(f);
          s.attempts++;
          if (e.correct) { s.correct++; if (!e.transliterationShown) s.unaidedStreak++; } else s.unaidedStreak = 0;
          if (s.unaidedStreak >= secureAfter) s.secure = true;
        }
        break;
      }
      case 'Stage0SupportUsed': st.supports.push(e); break;
      case 'Stage0ProductionAttempted': {
        const list = st.production.get(e.taskId) ?? [];
        list.push(e);
        st.production.set(e.taskId, list);
        const m = production[e.kind] ?? { accepted: 0, attempts: 0 };
        m.attempts++;
        if (e.accepted) m.accepted++;
        production[e.kind] = m;
        break;
      }
      case 'Stage0SpeakingRecorded': st.speaking.push(e); if (e.recordingId) recorded++; break;
      case 'Stage0StepCompleted': st.completed = true; st.completedAt = e.at; break;
      case 'Stage0SettingsChanged': if (e.speakerForm) speakerForm = e.speakerForm; break;
      case 'Stage0ExitStarted': exits.push({ started: e, answers: [] }); break;
      case 'Stage0ExitAnswered': exits.find((x) => x.started.attemptId === e.attemptId)?.answers.push(e); break;
      case 'Stage0ExitFinished': { const x = exits.find((y) => y.started.attemptId === e.attemptId); if (x) x.finished = e; break; }
    }
  }

  const recent = checks.slice(-WINDOW);
  const reading = recent.filter((c) => c.channel === 'read' || c.channel === 'read+listen');
  const listenOnly = checks.filter((c) => c.channel === 'listen-only' || (c.channel === 'listen-first' && !c.supportsBefore.includes('transcript')));
  const fs = [...features.values()];
  const meters: Stage0Meters = {
    decoding: { secure: fs.filter((f) => f.secure).length, met: fs.length, total: fs.length },
    readingIndependence: { unaided: reading.filter((c) => c.correct && !c.rescuedBefore).length, answered: reading.length },
    listening: {
      native: { correct: listenOnly.filter((c) => c.audio === 'native' && c.correct).length, answered: listenOnly.filter((c) => c.audio === 'native').length },
      computerVoice: { correct: listenOnly.filter((c) => c.audio === 'computer-voice' && c.correct).length, answered: listenOnly.filter((c) => c.audio === 'computer-voice').length },
    },
    production,
    speaking: { recorded },
    constructions: { met: 0, recognized: 0, produced: 0, total: 0 }, // filled by the service, which knows the content
    supportDependence: {
      english: recent.filter((c) => c.rescuedBefore).length,
      transliteration: recent.filter((c) => c.supportsBefore.includes('transliteration')).length,
      window: recent.length,
    },
  };
  return { lang, steps, features, segmentation, ...(speakerForm ? { speakerForm } : {}), checks, exits, meters };
}

/** Supports used for these lines in the step's current visit (since it was last completed). */
export function supportsInVisit(state: Stage0State, stepId: string, lineIds: string[]): Stage0SupportUsed[] {
  const st = state.steps.get(stepId);
  if (!st) return [];
  return st.supports.filter((s) => (!st.completedAt || s.at > st.completedAt) && s.lineIds.some((l) => lineIds.includes(l)));
}

export type { Stage0StepCompleted };
