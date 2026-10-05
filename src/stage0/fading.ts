/**
 * Support fading — what the scene player shows by default, decided from the learner's own evidence, with the reasons.
 * Never by lesson number alone; but romanization and Thai word gaps have a hard retirement step (config), after which they
 * are only a rescue on request, so they can never become the permanent reading surface.
 *
 *   transliteration (hi, th)  a word gets its reading underneath while any of its features is not secure, until retirement
 *   segmentation (th)          thin gaps between words until segmentation is secure (three right in a row), until retirement
 *   pictures                   while the scene is new, and while reading independence is below 80 % of the last 10 reading checks
 *   new-word highlight         on a scene's first visit
 *   channel                    a review step's own channel; a scene: read+listen when audio exists, else read
 *   English                    always on request (meaning first); a wrong answer offers it, never forces it
 */
import type { LanguageAdapter, LanguageCode, Stage0AudioSource, Stage0Channel, Stage0PathStep, Stage0Presentation, Stage0Scene } from '../core';
import { wordsOf } from './features';
import { stage0Config } from './lang';
import type { Stage0State } from './state';

export interface FadingInput {
  lang: LanguageCode;
  adapter: LanguageAdapter;
  state: Stage0State;
  step: Stage0PathStep;
  stepIndex: number;
  scene?: Stage0Scene;
  /** Whether this device can play audio for the scene (native recording or a computer voice), and which. */
  audio: Stage0AudioSource;
}

export function presentation(input: FadingInput): Stage0Presentation {
  const { lang, adapter, state, step, stepIndex, scene, audio } = input;
  const cfg = stage0Config(lang);
  const reasons: string[] = [];
  const facts = state.steps.get(step.id);
  const firstVisit = !facts || !facts.completed;

  // channel
  let channel: Stage0Channel = audio === 'none' ? 'read' : 'read+listen';
  if (step.kind === 'review' && step.channel) {
    channel = audio === 'none' ? 'read' : step.channel;
    reasons.push(audio === 'none' ? 'No audio for this scene on this device, so the review is read, not heard.' : `A review by ear: ${channelWords(step.channel)}.`);
  } else {
    reasons.push(audio === 'none' ? 'No audio for this scene on this device yet: you read it.' : audio === 'computer-voice' ? 'You hear each line (a computer voice — practice only) as you read it.' : 'You hear each line as you read it.');
  }

  // pictures
  const lastReading = state.checks.filter((c) => c.channel === 'read' || c.channel === 'read+listen').slice(-10);
  const independent = lastReading.length >= 10 && lastReading.filter((c) => c.correct && !c.rescuedBefore).length >= 8;
  const pictures = firstVisit && !independent;
  if (!pictures && independent) reasons.push('Pictures are off: you understand most sentences without help now.');

  // transliteration
  const transliteration: Record<string, string[]> = {};
  const tl = cfg.script.transliteration;
  if (tl && scene) {
    if (stepIndex > tl.retireAfterStep) {
      reasons.push('Romanization has stepped aside for good: tap a word if you need it.');
    } else {
      let shown = 0;
      let total = 0;
      for (const line of scene.lines) {
        const words = wordsOf(adapter, lang, line.text);
        const need = words.filter((w) => w.romanization && w.features.some((f) => !state.features.get(f)?.secure));
        total += words.length;
        shown += need.length;
        if (need.length) transliteration[line.id] = need.map((w) => w.surface);
      }
      if (shown === 0 && total > 0) reasons.push('No romanization: you read every letter in this scene on your own.');
      else if (shown > 0) reasons.push(`Romanization under ${shown} of ${total} words — only those with letters you are still learning.`);
    }
  }

  // segmentation (Thai)
  const seg = cfg.script.segmentation;
  let segmentation = false;
  if (seg) {
    segmentation = stepIndex <= seg.retireAfterStep && !state.segmentation.secure;
    reasons.push(segmentation ? 'Small gaps show where words begin (Thai has no spaces) until you can find them yourself.' : state.segmentation.secure ? 'No word gaps: you find the words yourself now.' : 'Word gaps have stepped aside: Thai is written without them.');
  }

  return { channel, audio, english: 'on-request', pictures, transliteration, segmentation, highlightNew: firstVisit, reasons };
}

export function channelWords(c: Stage0Channel): string {
  return c === 'read' ? 'reading' : c === 'read+listen' ? 'hearing it while you read' : c === 'listen-first' ? 'hear first, the text only if you ask' : 'by ear only';
}
