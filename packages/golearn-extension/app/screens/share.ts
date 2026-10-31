/**
 * Look up shared text. The web half of the mobile companion (docs/ecosystem/reader/MOBILE-COMPANION-PLAN.md): a passage
 * that reaches this page by the Web Share Target (`#/share?…` with `text`, `url`, `title`) or that the learner pastes
 * into the box. The passage is normalised under the reader contract's rules (golearn-share), the learner picks the word
 * when the sender did not select one, the REAL parser and card answer, and the lookup is recorded through the same path
 * the orientation uses, as the same `SelectionLookedUp` a browser lookup produces, with `payload.readerId` from
 * `shareReaderId`.
 *
 * Rules this screen keeps:
 *   - nothing is recorded until a word has been looked up: a passage on its own, or a refused one, writes nothing;
 *   - the clipboard is never read by the page: the learner pastes into the box, which is their gesture;
 *   - the passage lives in this screen's memory only; after it arrives the address is rewritten without the query so a
 *     reload or the history does not keep it; the event holds the word, a hash and the link's path, never the text.
 */
import { PARSER_LANGUAGES, parseSelection } from '../../src/parser';
import { ensureAnalyser } from '../analysers';
import type { PopupAnchor } from '../../src/contract/readerAdapter';
import { createCardUI, type CardUI } from '../../src/popup/card';
import { DEVICE_TAGS } from '../../src/content/voiceTags';
import {
  candidateWords, chooseWord, encounterFromShare, normaliseSharedPassage, passageFromShareParams, pastedPassage, readShareParams,
  shareReaderId, type NormalisedShare, type ShareContext, type SharedPassage,
} from '../../../golearn-share/src';
import type { AppContext } from '../context';
import { append, button, clear, field, h, p, setStatus, statusLine } from '../dom';
import type { View } from './view';

export const DEFAULT_SHARE_LANGUAGE = 'sq';
export const SHARE_SURFACE = 'share';
/** The learner's own choice here is certain; the chosen language is a default, not evidence (the resolver's default-language confidence). */
export const SHARE_OVERRIDE_CONFIDENCE = 1;
export const SHARE_DEFAULT_CONFIDENCE = 0.3;

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const { win, doc } = ctx.deps;
  const active = await ctx.activeLanguage();
  if (!view.alive()) return;
  // The language is the learner's choice (or the default) until another is picked on this screen: the first is recorded with the
  // contract's `team-default` basis (nothing in a shared passage declares its language; the value is the contract's word for a
  // default, not a team), the second as an `override`, and the event says which.
  const enrolmentLanguage = active?.languageId || DEFAULT_SHARE_LANGUAGE;
  const nameOf = (id: string): string => ctx.deps.packs.packFor(id)?.name ?? id;
  let languageId = enrolmentLanguage;
  let chosen = false;
  let languageName = nameOf(languageId);
  let analysed = PARSER_LANGUAGES.includes(languageId);
  const sessionId = `share-${ctx.deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const ui: CardUI = createCardUI({ doc, speech: ctx.deps.speech, voiceTags: DEVICE_TAGS });
  view.onDispose(() => ui.destroy());

  const status = statusLine();
  status.id = 'share-status';
  const incoming = h('section', { class: 'card', id: 'share-incoming', hidden: true });
  const result = h('div', { id: 'share-result', 'aria-live': 'polite' });

  const resetIncoming = (): void => { clear(incoming); incoming.hidden = true; };

  function fallbackAnchor(): PopupAnchor {
    const viewport = { width: win.innerWidth || 390, height: win.innerHeight || 800 };
    return { rect: { top: 16, left: viewport.width - 16, right: viewport.width - 16, bottom: 16, width: 0, height: 0 }, viewport, rtl: false, source: 'fallback' };
  }

  async function lookUp(passage: SharedPassage, surface: string, context: ShareContext): Promise<void> {
    if (!analysed) {
      setStatus(status, `GoLearn has no analyser for ${languageName} yet, so nothing was looked up and nothing was recorded.`, 'error');
      return;
    }
    let card;
    try {
      await ensureAnalyser(languageId);
      card = parseSelection({ surface, languageId, context });
    } catch (e) {
      setStatus(status, `The lookup failed: ${e instanceof Error ? e.message : String(e)}. Nothing was recorded.`, 'error');
      return;
    }
    ui.show(card, fallbackAnchor());
    const id = await ctx.identity();
    const base = encounterFromShare({
      card, passage, identity: { learnerId: id.learnerId, enrolmentId: id.enrolmentId, deviceId: id.deviceId },
      version: ctx.deps.appVersion, sessionId, now: ctx.deps.now(), direction: context.direction,
      language: chosen ? { basis: 'override', confidence: SHARE_OVERRIDE_CONFIDENCE } : { basis: 'team-default', confidence: SHARE_DEFAULT_CONFIDENCE },
      // the extension’s recorder admits only its own producer (and replaces the identity and device); the web app is its own
      producerApp: ctx.inExtension ? 'golearn-ext' : 'golearn-app', surface: SHARE_SURFACE,
    });
    const recorded = await ctx.record(base);
    if (!view.alive()) return;
    ui.setRecorded(recorded);
    clear(result);
    result.setAttribute('data-recorded', recorded);
    result.setAttribute('data-reader', shareReaderId(passage.mechanism));
    append(result, [p(
      recorded === 'recorded' ? `Looked up “${card.surface}”. The lookup was recorded (the word and where it came from, not the passage).`
        : recorded === 'duplicate' ? `Looked up “${card.surface}”. That lookup was already recorded in this visit.`
          : `Looked up “${card.surface}”, but the lookup could not be recorded on this device.`,
      recorded === 'failed' ? 'error' : 'ok')]);
    setStatus(status, '', 'info');
  }

  /** A passage arrived (shared or pasted): normalise it; look the word up at once or ask which word. */
  async function receive(passage: SharedPassage): Promise<void> {
    clear(result);
    ui.dismiss('new-lookup');
    resetIncoming();
    const norm = normaliseSharedPassage(passage);
    if (!norm.ok) { setStatus(status, `${norm.message} Nothing was looked up and nothing was recorded.`, 'error'); return; }
    if (!norm.needsWordChoice) {
      setStatus(status, `Looking up “${norm.surface}”…`, 'info');
      await lookUp(passage, norm.surface, norm.context);
      return;
    }
    setStatus(status, 'Choose the word to look up. Nothing is recorded until you do.', 'info');
    showChoice(passage, norm);
  }

  function showChoice(passage: SharedPassage, norm: NormalisedShare): void {
    const words = candidateWords(norm, passage.languageHint);
    const group = h('div', { class: 'row share-words', role: 'group', 'aria-label': 'Choose the word to look up', id: 'share-words' });
    for (const w of words) {
      group.append(button(w.surface, () => {
        const chosen = chooseWord(norm, w);
        if (!chosen) { setStatus(status, 'That word could not be located in the shared text.', 'error'); return; }
        void lookUp(passage, chosen.surface, chosen.context);
      }, { class: 'btn', lang: languageId, 'data-word-index': w.index }));
    }
    incoming.hidden = false;
    append(incoming, [
      h('h2', {}, 'What was shared'),
      h('p', { class: 'share-text', lang: languageId }, norm.surface),
      p(norm.context.kind === 'sentence'
        ? 'This looks like one sentence, so the card will use it as context (less certain than on a web page: the sender may have cut it).'
        : 'This is a passage, not a verified sentence: the card will say the context is only a fragment.', 'muted'),
      group,
    ]);
  }

  // ── page
  // the languages this build can look up in (a pack that is not planned and an analyser that is bundled)
  const choices = ctx.deps.packs.packs().filter((k) => k.level !== 'planned' && PARSER_LANGUAGES.includes(k.languageId));
  const languageLine = h('p', { id: 'share-language', class: 'muted' });
  const unanalysed = p('', 'error');
  unanalysed.id = 'share-unanalysed';
  const describeLanguage = (): void => {
    languageLine.textContent = chosen ? `Looking up in ${languageName}, the language you chose.`
      : active?.languageId ? `Looking up in ${languageName}, the language you are reading.` : `No language chosen yet: looking up in ${languageName}.`;
    unanalysed.textContent = `GoLearn has no analyser for ${languageName} yet; a lookup here will say so and record nothing.`;
    unanalysed.hidden = analysed;
  };
  const select = h('select', { id: 'share-language-select', name: 'share-language' }) as HTMLSelectElement;
  for (const k of choices) select.append(h('option', { value: k.languageId, ...(k.languageId === languageId ? { selected: true } : {}) }, k.name));
  select.addEventListener('change', () => {
    languageId = select.value; chosen = true; languageName = nameOf(languageId); analysed = PARSER_LANGUAGES.includes(languageId);
    describeLanguage();
  });
  const textarea = h('textarea', { id: 'share-paste', rows: 4, spellcheck: false, autocomplete: 'off', placeholder: 'Paste a word, a sentence or a short passage' }) as HTMLTextAreaElement;
  const form = h('form', { id: 'share-paste-form', novalidate: true },
    field('Paste what you copied', textarea, 'GoLearn never reads your clipboard by itself: you paste here. Up to 80 words.'),
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn primary', id: 'share-paste-go' }, 'Look up pasted text')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void receive(pastedPassage(textarea.value, { now: ctx.deps.now(), languageHint: languageId }));
  });

  append(el, [
    p('Share a word, a sentence or a short passage from another app to GoLearn, or paste it below. The text is looked up once with the same card as on a web page, and only the word you look up is recorded, with where it came from. The text itself is not kept.'),
    languageLine,
    choices.length > 1 ? field('Language of what you share', select, 'Only needed when it is not your active language. Your choice is recorded with the lookup.') : null,
    unanalysed,
    incoming,
    h('section', { class: 'card', id: 'share-paste-card' }, h('h2', {}, 'Paste text'), form),
    status,
    result,
    p('Sharing from other apps to this page works only when GoLearn is installed as an app from Chrome on Android. Until you have done that, paste.', 'muted'),
  ]);

  describeLanguage();

  // ── a passage that arrived through the web share target or a deep link
  const params = readShareParams(win.location.search, win.location.hash);
  const shared = passageFromShareParams(params, { now: ctx.deps.now(), languageHint: languageId });
  if (params.text !== undefined || params.url !== undefined || params.title !== undefined) {
    // keep neither the text nor the link in the address bar or the history
    try { win.history.replaceState(win.history.state, '', `${win.location.pathname}#/share`); } catch { /* an address that cannot be rewritten stays as it is */ }
  }
  if (shared) { await receive(shared); }
  else if (params.url !== undefined || params.title !== undefined) {
    setStatus(status, 'A link arrived without any text. Select the words you want to look up and share those, or paste them below. Nothing was recorded.', 'error');
  }
}
