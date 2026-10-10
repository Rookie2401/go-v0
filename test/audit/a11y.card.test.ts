// @vitest-environment jsdom
/**
 * ACCESSIBILITY audit, lane 3 of 4 (docs/ecosystem/audit/ACCESSIBILITY.md): the lookup card (popup) in jsdom: every state is audited
 * (accessible names, labels, `lang`), and the behaviour a keyboard or screen-reader user depends on is tested: focus moves in, Tab
 * stays inside, Escape closes and focus returns, the disclosure buttons say whether they are open, the status line is live,
 * pronunciation says when there is no audio.   Plus the focus behaviour of the GoPractice and setup-app shells.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCardUI, type CardUI, type DismissReason } from '../../packages/golearn-extension/src/popup/card';
import { parseSelection, type CardModel } from '../../packages/golearn-extension/src/parser';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import type { Pronouncer } from '../../packages/golearn-extension/src/popup/view';
import { setBody, stubLayout } from '../extension/dom';
import { auditDom, accessibleName, flushAfterAll, isHidden, row } from './a11y.support';
import { defaultService, flush, key, makeRig as makePracticeRig, destroyRigs as destroyPracticeRigs, until } from '../gopractice/helpers';
import { makeTellRig, resetTellRig } from '../gotell-ui/rig';
import { destroyRigs as destroyAppRigs, makeRig as makeAppRig } from '../golearn-app/helpers';

flushAfterAll('a11y.card', 'ACCESSIBILITY lane 3 (card and focus)');

const anchor: PopupAnchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' };
const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const cardFor = (sel = 'shtëpinë', sentence = SENTENCE): CardModel => {
  const at = sentence.indexOf(sel);
  return parseSelection({ surface: sel, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + sel.length } });
};

let restore: () => void;
let ui: CardUI;
const dismissed: DismissReason[] = [];
const pronouncer = (available: boolean): Pronouncer => ({
  availability: () => ({ available, note: available ? 'A device voice is available (practice only).' : 'No Albanian voice is installed on this device.' }),
  play: () => ({ ok: true, voice: 'synthetic' }),
});
beforeEach(() => { restore = stubLayout(); setBody('<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p><button id="outside">outside</button>'); dismissed.length = 0; ui = createCardUI({ doc: document, speech: null, pronouncer: pronouncer(true), onDismiss: (r) => dismissed.push(r) }); });
afterEach(() => { ui.destroy(); restore(); });

const root = (): ShadowRoot => ui.root()!;
const shadowActive = (): Element | null => root().activeElement;
const press = (target: EventTarget, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

describe('the card is a named dialog and every control in every state has a name', () => {
  it('A-D01 the opened card: role, name, controls, status regions', async () => {
    ui.show(cardFor(), anchor, { view: { languageName: 'Albanian', depth: 'brief' } });
    await flush(2);
    const card = root().querySelector('.card')!;
    expect(card.getAttribute('role')).toBe('dialog');
    expect(accessibleName(card).name).toBe('GoLearn: shtëpinë');
    const f = auditDom(root(), 'card/closed-layers', { fragment: true, skipRepeated: true, targetWords: ['shtëpinë', 'shtëpi'], targetLang: 'sq' });
    row('A-D01', 'card', 'card with "Go deeper" and "view sources" closed', f.findings.length ? `${f.findings.length} findings` : 'clean', f.findings.map((x) => `${x.rule}: ${x.where} ${x.detail}`).join('; '));
    const buttons = [...root().querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThanOrEqual(8);
    for (const b of buttons) expect(accessibleName(b).name, b.className).not.toBe('');
    // the live regions
    expect(root().querySelectorAll('[role="status"][aria-live="polite"]').length).toBe(3); // the recorded status, the feedback line and (A-13) the pronunciation note
  });

  it('A-D02 Go deeper open (every section), the sources and the correction form open, and the message state', async () => {
    ui.show(cardFor(), anchor, { view: { languageName: 'Albanian', depth: 'explanatory' } });
    ui.update({ sources: [{ label: 'Wiktionary: shtëpi (Albanian)', url: 'https://en.wiktionary.org/wiki/sht%C3%ABpi#Albanian', licence: 'CC BY-SA 4.0' }, { label: 'Course word list (adapter-sq@9)' }] });
    (root().querySelector('button.deeperBtn') as HTMLElement).click();
    (root().querySelector('button.sourcesBtn') as HTMLElement).click();
    (root().querySelector('button.reportBtn') as HTMLElement).click();
    const f = auditDom(root(), 'card/all-open', { fragment: true, skipRepeated: true });
    row('A-D02', 'card', 'card with Go deeper, the sources and the correction form open', f.findings.length ? `${f.findings.length} findings` : 'clean', f.findings.map((x) => `${x.rule}: ${x.where} ${x.detail}`).join('; '));
    const msg = createCardUI({ doc: document, speech: null });
    msg.showMessage('This page is not in a language GoLearn can read.', anchor, 'error');
    const m = auditDom(msg.root()!, 'card/message', { fragment: true });
    expect(msg.root()!.querySelector('[role="alert"]')).toBeTruthy();
    expect(m.findings).toEqual([]);
    msg.destroy();
    row('A-D03', 'card', 'message state', 'clean; the text is role="alert"');
  });

  it('A-D04 each disclosure button (view sources, Go deeper, Report) says whether its panel is open (aria-expanded) and the panel is hidden when closed', () => {
    ui.show(cardFor(), anchor, {});
    const pairs: Array<[string, string]> = [['button.sourcesBtn', '.sources'], ['button.deeperBtn', '.deeper'], ['button.reportBtn', 'form.fix']];
    for (const [btnSel, panelSel] of pairs) {
      const btn = root().querySelector(btnSel) as HTMLElement;
      const panel = root().querySelector(panelSel) as HTMLElement;
      expect(btn.getAttribute('aria-expanded'), btnSel).toBe('false');
      expect(panel.hasAttribute('hidden'), panelSel).toBe(true);
      btn.click();
      expect(btn.getAttribute('aria-expanded'), btnSel).toBe('true');
      expect(panel.hasAttribute('hidden'), panelSel).toBe(false);
      btn.click();
      expect(btn.getAttribute('aria-expanded'), btnSel).toBe('false');
      expect(panel.hasAttribute('hidden'), panelSel).toBe(true);
    }
    row('A-D04', 'card', 'disclosure buttons: aria-expanded kept in step with the panel', 'pass');
  });

  // The disclosure buttons carry no aria-controls: assistive technology cannot jump from the button to its panel. Minor.
  it('A-12 each disclosure button names the panel it controls (aria-controls), and the panel exists', () => {
    ui.show(cardFor(), anchor, {});
    for (const c of ['sourcesBtn', 'deeperBtn', 'reportBtn']) {
      const id = (root().querySelector(`button.${c}`) as HTMLElement).getAttribute('aria-controls');
      expect(id, c).toBeTruthy();
      expect(root().getElementById(id!), c).toBeTruthy();
    }
  });

  it('A-D05 pronunciation: when no voice exists the speaker is disabled and its title says so (nothing else is drawn); nothing depends on audio', async () => {
    ui.destroy();
    ui = createCardUI({ doc: document, speech: null, pronouncer: pronouncer(false) });
    ui.show(cardFor(), anchor, {});
    await flush(2);
    const say = root().querySelector('button.say') as HTMLButtonElement;
    expect(say.disabled).toBe(true);
    expect(say.title).toMatch(/No Albanian voice/);
    expect(root().querySelector('.pron')!.textContent).toMatch(/No Albanian voice/); // also read out by the off-screen live region
    expect(accessibleName(say).name).toBe('Play with GoListen');
    // the meaning is on the card whether or not audio works
    expect(root().querySelector('.meaning')!.textContent).toMatch(/house, home/);
    row('A-D05', 'card', 'audio-only interaction has a non-audio alternative / honest notice', 'pass', 'the card is text-first; the speaker is disabled and its title says "No Albanian voice is installed on this device."');
  });

  // the pronunciation note is an off-screen live region (a hearing played, a failure) so a change is announced without a note row on the card
  it('A-13 the pronunciation note is a live region (it changes from "Checking voices…" to the result)', async () => {
    ui.show(cardFor(), anchor, {});
    await flush(2);
    const note = root().querySelector('.pron')!;
    expect(note.closest('[aria-live], [role="status"]')).toBeTruthy();
  });
});

describe('the correction form', () => {
  it('A-18 the reading choices of the correction form are grouped (fieldset with a legend, or role="radiogroup" with a name)', () => {
    // a card with competing readings, so the form offers several radios (plus "another lemma")
    const base = cardFor('libër');
    const withAlternatives: CardModel = { ...base, alternatives: [{ lemma: 'libër', pos: 'NOUN', gloss: 'book', confidence: 0.6 }, { lemma: 'libër', pos: 'ADJ', gloss: 'bookish', confidence: 0.3 }] } as CardModel;
    ui.show(withAlternatives, anchor, {});
    (root().querySelector('button.reportBtn') as HTMLElement).click();
    const radios = [...root().querySelectorAll('form.fix input[type="radio"]')];
    expect(radios.length).toBeGreaterThan(1);
    const group = radios[0].closest('fieldset, [role="radiogroup"]');
    expect(group && accessibleName(group).name !== '').toBe(true);
  });
});

describe('focus: in, around, out', () => {
  it('A-D06 a keyboard-opened card takes focus; Tab and Shift+Tab stay inside it; Escape closes it and focus returns to where it was', () => {
    const outside = document.getElementById('outside') as HTMLElement;
    outside.focus();
    expect(document.activeElement).toBe(outside);
    ui.show(cardFor(), anchor, { focus: true, view: { languageName: 'Albanian', depth: 'brief' } });
    const inside = shadowActive();
    expect(inside, 'focus moved into the card').toBeTruthy();
    expect(root().querySelector('.card')!.contains(inside)).toBe(true);
    // the cycle
    const focusables = [...root().querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]')].filter((el) => !el.closest('[hidden]'));
    focusables[focusables.length - 1].focus();
    const t = press(shadowActive()!, 'Tab');
    expect(t.defaultPrevented, 'Tab on the last control wraps to the first').toBe(true);
    expect(shadowActive()).toBe(focusables[0]);
    const s = press(shadowActive()!, 'Tab', { shiftKey: true });
    expect(s.defaultPrevented, 'Shift+Tab on the first control wraps to the last').toBe(true);
    expect(shadowActive()).toBe(focusables[focusables.length - 1]);
    // Escape
    press(shadowActive()!, 'Escape');
    expect(ui.isOpen()).toBe(false);
    expect(dismissed).toEqual(['escape']);
    expect(document.activeElement, 'focus returned to the control that had it').toBe(outside);
    row('A-D06', 'card', 'dialog focus: moves in, Tab wraps, Escape closes, focus returns', 'pass');
  });

  it('A-D07 the close button closes and returns focus; clicking outside closes', () => {
    const outside = document.getElementById('outside') as HTMLElement;
    outside.focus();
    ui.show(cardFor(), anchor, { focus: true });
    (root().querySelector('.close') as HTMLElement).click();
    expect(dismissed).toEqual(['close']);
    expect(document.activeElement).toBe(outside);
    ui.show(cardFor(), anchor, { focus: true });
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
    expect(dismissed).toEqual(['close', 'outside']);
  });

  it('A-D08 a card opened without the focus option (a selection lookup) leaves focus alone and announces its result through the live status', async () => {
    const outside = document.getElementById('outside') as HTMLElement;
    outside.focus();
    ui.show(cardFor(), anchor, {});
    expect(document.activeElement).toBe(outside);
    ui.setRecorded('recorded');
    expect(root().querySelector('.status')!.textContent).toBe('Encounter recorded.');
    expect(root().querySelector('.status')!.closest('[aria-live]')).toBeTruthy();
    row('A-D08', 'card', 'card opened without focus', 'focus stays on the page; "Encounter recorded." goes to a polite live region', 'a screen-reader user who selected text hears the status but not the card contents unless they move into it (no announcement of the dialog itself)');
  });

  // The card traps Tab (a modal behaviour) but is not aria-modal, and nothing on the card says that Escape leaves it.
  it('A-14 a dialog that traps Tab says so (aria-modal="true") or does not trap', () => {
    ui.show(cardFor(), anchor, { focus: true });
    expect(root().querySelector('.card')!.getAttribute('aria-modal')).toBe('true');
  });

  it('A-D09 the correction form: radios are labelled; the group has a name (the form is named)', () => {
    ui.show(cardFor('libër'), anchor, {});
    (root().querySelector('button.reportBtn') as HTMLElement).click();
    const form = root().querySelector('form.fix')!;
    expect(accessibleName(form).name).toBe('Correct this analysis');
    for (const input of form.querySelectorAll('input')) expect(accessibleName(input).name, input.outerHTML.slice(0, 60)).not.toBe('');
    row('A-D09', 'card', 'correction form fields', 'pass', 'each radio and the typed-lemma field has a name');
  });
});

// ───────────────────────────── lang on the card's target-language text ─────────────────────────────

describe('language of the words the card shows', () => {
  it('A-D10 the selected word and the lemma carry lang="sq"', () => {
    ui.show(cardFor(), anchor, { view: { languageName: 'Albanian', depth: 'brief' } });
    const word = root().querySelector('.word') as HTMLElement;
    const lemma = root().querySelector('[data-row="lemma"] .v') as HTMLElement;
    const hasLang = (el: Element | null): boolean => !!el?.closest('[lang]')?.getAttribute('lang');
    row('A-D10', 'card', 'lang on the selected word (.word) and the lemma row', `${hasLang(word) ? 'present' : 'absent'} / ${hasLang(lemma) ? 'present' : 'absent'}`);
    expect(hasLang(word) && hasLang(lemma)).toBe(true); // A-07 fixed: both carry the card's language
  });

  it('A-07 the card marks the selected word and the lemma with the target language (WCAG 3.1.2)', () => {
    ui.show(cardFor(), anchor, { view: { languageName: 'Albanian', depth: 'brief' } });
    expect((root().querySelector('.word') as HTMLElement).closest('[lang]')?.getAttribute('lang')).toBe('sq');
    expect((root().querySelector('[data-row="lemma"] .v') as HTMLElement).closest('[lang]')?.getAttribute('lang')).toBe('sq');
  });
});

// ───────────────────────────── focus in the application shells ─────────────────────────────

describe('focus in the GoPractice and setup-app shells', () => {
  afterEach(() => { resetTellRig(); destroyPracticeRigs(); destroyAppRigs(); });

  it('A-D11 GoPractice: a route change moves focus to the screen (main, tabindex -1) so a keyboard or screen-reader user starts at the new content', async () => {
    const rig = await makePracticeRig({ service: defaultService(), signedIn: true });
    await rig.go('settings');
    expect(document.activeElement).toBe(rig.q('main#screen'));
    expect(rig.q('main#screen').getAttribute('tabindex')).toBe('-1');
    expect(document.title).toBe('GoPractice — Settings');
    await rig.go('review');
    expect(document.activeElement).toBe(rig.q('main#screen'));
    expect(document.title).toBe('GoPractice — GoReview');
    row('A-D11', 'focus', 'GoPractice: focus and document title on route change', 'pass', 'main#screen receives focus; the title names the screen');
  });

  it('A-D12 setup app: a route change moves focus to the screen', async () => {
    const rig = await makeAppRig();
    await rig.go('privacy');
    expect(document.activeElement).toBe(document.getElementById('screen'));
    row('A-D12', 'focus', 'setup app: focus on route change', 'pass', `document.title after the change: "${document.title}"`);
  });

  it('A-D13 a session answer: focus goes to Next when the feedback appears, and to the answer box of the next item', async () => {
    const { startWith, dueCard, ids, type: typeIn } = await import('../gopractice/helpers');
    const rig = await makePracticeRig({ signedIn: true });
    const A = ids('L1', 'sq');
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await flush(10);
    const input = rig.q<HTMLInputElement>('#answer-input');
    typeIn(input, 'zog'); key('Enter', input);
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(document.activeElement, 'Next has focus when the feedback appears').toBe(rig.q('#next'));
    (rig.q('#next') as HTMLElement).click();
    await until(() => (rig.root.querySelector('#session-progress')?.textContent ?? '') === 'Item 2 of 2', 'the second item');
    await flush(4);
    expect(document.activeElement, 'the answer box has focus on the second item').toBe(rig.q('#answer-input'));
    row('A-D13', 'focus', 'session: focus after answering and after Next', 'pass', 'Next → answer box of the next item');
  });

  // Entering the session: the session puts focus in the answer box, then the router, once the render is over, focuses <main>.
  it('A-16 on entering a session the answer box of the first item has focus (the shell focuses <main> after the screen has rendered and takes it away)', async () => {
    const { startWith, dueCard, ids } = await import('../gopractice/helpers');
    const rig = await makePracticeRig({ signedIn: true });
    const A = ids('L1', 'sq');
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await flush(10);
    expect(document.activeElement).toBe(rig.q('#answer-input'));
  });

  // Deleting a draft: the row's buttons are hidden by `actions.hidden = true`, and the confirm box is shown, but nothing moves focus.
  it('A-15 GoTell: after pressing "Delete" on a draft, focus is not left on a button that has just been hidden', async () => {
    const rig = await makeTellRig();
    await rig.open('tell', '#tell-new-draft');
    (rig.q('#tell-mode-free') as HTMLElement).click();
    (rig.q('#tell-new-draft') as HTMLElement).click();
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    await rig.open('tell', '[data-delete]');
    const del = rig.q<HTMLButtonElement>('[data-delete]');
    del.focus();
    expect(document.activeElement).toBe(del);
    del.click();
    await flush(2);
    expect(isHidden(document.activeElement!), 'focus is on an element that is now hidden: a browser drops it to <body>').toBe(false);
  });
});
