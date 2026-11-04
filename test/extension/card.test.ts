// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computePosition, createCardUI, localSpeechPronouncer, type CardUI, type DismissReason, type SpeechLike } from '../../packages/golearn-extension/src/popup/card';
import { DEVICE_TAGS } from '../../packages/golearn-extension/src/content/voiceTags';
import { parseSelection, type CardModel } from '../../packages/golearn-extension/src/parser';
import { GOLEARN_HOST_ATTR, type PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { setBody, stubLayout } from './dom';

const anchor = (over: Partial<PopupAnchor['rect']> = {}, extra: Partial<PopupAnchor> = {}): PopupAnchor => ({
  rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20, ...over },
  viewport: { width: 1024, height: 768 }, rtl: false, source: 'range', ...extra,
});

const cardFor = (sel = 'shtëpinë', sentence = 'Unë po lexoj një libër të bukur në shtëpinë time.'): CardModel => {
  const at = sentence.indexOf(sel);
  return parseSelection({ surface: sel, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + sel.length } });
};

let restore: () => void;
let ui: CardUI;
const dismissed: DismissReason[] = [];
const make = (speech: SpeechLike | null = null) => createCardUI({ doc: document, speech, onDismiss: (r) => dismissed.push(r), makeUtterance: (text, voice) => ({ text, voice }) });
const text = (el: ParentNode | undefined): string => (el as HTMLElement | undefined)?.textContent ?? '';
/** What is on screen: the card's text without the closed panels, the off-screen live regions and the style sheet. */
const visibleText = (root: ShadowRoot | undefined): string => {
  const c = (root!.querySelector('.card') as HTMLElement).cloneNode(true) as HTMLElement;
  c.querySelectorAll('[hidden], .sr, style').forEach((e) => e.remove());
  return c.textContent ?? '';
};
const buttonsOf = (root: ShadowRoot | undefined): HTMLButtonElement[] => [...root!.querySelectorAll('button')].filter((b) => !b.closest('[hidden]'));
const click = (root: ShadowRoot | undefined, selector: string): void => (root!.querySelector(selector) as HTMLElement).click();
const pointerDown = (target: EventTarget) => target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true, cancelable: true }));
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

beforeEach(() => { restore = stubLayout(); setBody('<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p><button id="outside">outside</button>'); dismissed.length = 0; ui = make(); });
afterEach(() => { ui.destroy(); restore(); vi.restoreAllMocks(); });

describe('placement', () => {
  const size = { width: 340, height: 200 };
  it('goes below the selection by default', () => {
    const p = computePosition(anchor(), size);
    expect(p.placement).toBe('below');
    expect(p.top).toBe(120 + 8);
    expect(p.left).toBe(50);
  });
  it('flips above when it does not fit below and there is more room above', () => {
    const p = computePosition(anchor({ top: 700, bottom: 720 }), size);
    expect(p.placement).toBe('above');
    expect(p.top).toBe(700 - 8 - 200);
  });
  it('stays below when neither side fits, clamped inside the viewport', () => {
    const tall = { width: 340, height: 700 };
    const p = computePosition(anchor({ top: 300, bottom: 320 }), tall);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + tall.height).toBeLessThanOrEqual(768 - 8);
  });
  it('is clamped horizontally at both edges', () => {
    expect(computePosition(anchor({ left: -30, right: 20 }), size).left).toBe(8);
    expect(computePosition(anchor({ left: 1000, right: 1020 }), size).left).toBe(1024 - 340 - 8);
  });
  it('aligns the end edge for right-to-left text', () => {
    const p = computePosition(anchor({ left: 500, right: 600 }, { rtl: true }), size);
    expect(p.left).toBe(600 - 340);
  });
  it('the fallback corner puts the card top-right', () => {
    const p = computePosition({ rect: { top: 16, left: 1008, right: 1008, bottom: 16, width: 0, height: 0 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'fallback' }, size);
    expect(p.left).toBe(1024 - 340 - 8);
    expect(p.top).toBe(24);
  });
});

describe('the card in the page', () => {
  it('is a fixed host with a closed shadow root appended to body, and holds word, lemma, meaning, form and confidence (the last three in "Go deeper")', () => {
    const placement = ui.show(cardFor(), anchor());
    const host = document.body.querySelector(`[${GOLEARN_HOST_ATTR}]`) as HTMLElement;
    expect(host).toBeTruthy();
    expect(host.shadowRoot).toBeNull(); // closed: page scripts cannot read what was looked up
    expect(host.style.position).toBe('fixed');
    expect(host.style.cssText).toMatch(/all: initial/);
    expect(document.body.lastElementChild).toBe(host);
    const t = text(ui.root());
    expect(t).toContain('shtëpinë');
    expect(t).toContain('shtëpi (NOUN)');
    expect(t).toContain('house, home');
    expect(t).toMatch(/definite feminine accusative singular/);
    expect(t).toMatch(/Confidence/);
    expect(t).toMatch(/machine-drafted/);
    expect(ui.isOpen()).toBe(true);
    expect(placement.placement).toBe('below');
    const cardEl = ui.root()!.querySelector('.card') as HTMLElement;
    expect(cardEl.style.top).toBe('128px');
    expect(cardEl.getAttribute('role')).toBe('dialog');
  });

  it('labels each analysis line as analysis, and names the context, confidence, labels, limits and analyser in "About this analysis", the last block of "Go deeper"', () => {
    ui.show(cardFor(), anchor());
    const tags = [...ui.root()!.querySelectorAll('.tag')].map((x) => x.textContent);
    expect(tags).toContain('analysis');
    const about = ui.root()!.querySelector('.about') as HTMLElement;
    expect(about.textContent).toMatch(/machine-drafted/);
    expect(about.textContent).toMatch(/fact: what you selected/);
    expect(about.textContent).toMatch(/Context/);
    expect(about.textContent).toMatch(/Confidence\s*0\.\d\d/);
    expect(about.textContent).toMatch(/Limits/);
    expect(about.textContent).toMatch(/adapter-sq@/);
    expect([...ui.root()!.querySelectorAll('.deeper h3')].at(-1)!.textContent).toBe('About this analysis');
  });

  it('the immediate card is the word with its speaker, the meaning and the subscript "view sources", then "Go deeper": no form line, confidence, context, you-row, pronounce button or Review button', () => {
    ui.show(cardFor(), anchor());
    const v = visibleText(ui.root());
    expect(v).toContain('shtëpinë');
    expect(v).toContain('house, home');
    expect(v).toContain('view sources');
    expect(v).toContain('Go deeper');
    expect(v).not.toMatch(/confidence/i);
    expect(v).toContain('Meaning · Lemma meaning');
    expect(v).toMatch(/shtëpi.*lemma/); // the lemma line, only because the lemma differs from the word
    expect(v).not.toMatch(/definite feminine/); // the morphology line is in Go deeper
    expect(v).not.toMatch(/Pronounce|practice/i);
    expect(v).not.toMatch(/Review this|Saved for review/);
    const labels = buttonsOf(ui.root()).map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(labels).not.toContain('Review this');
    expect(labels.join('|')).not.toMatch(/wrong|More|Pronounce/);
    // the word comes first, the meaning under it, "view sources" under the meaning
    const order = ['.word', '.meaning', '.sourcesBtn', '.deeperBtn'].map((sel) => ui.root()!.querySelector(sel)!);
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, order[i].className).toBeTruthy();
  });

  it('does not touch the page: no page element changes, no style added to the document, nothing inserted but the host', () => {
    const before = document.body.innerHTML;
    const headBefore = document.head.innerHTML;
    ui.show(cardFor(), anchor());
    const host = document.querySelector(`[${GOLEARN_HOST_ATTR}]`)!;
    host.remove();
    expect(document.body.innerHTML).toBe(before);
    expect(document.head.innerHTML).toBe(headBefore);
    expect(document.body.getAttribute('style')).toBeNull();
    expect(document.getElementById('p')!.getAttribute('style')).toBeNull();
    expect(document.querySelector('style, link')).toBeNull();
  });

  it('keeps its style inside the shadow root', () => {
    ui.show(cardFor(), anchor());
    expect(ui.root()!.querySelector('style')).toBeTruthy();
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('gives touch users 44px controls while keeping the six knowledge marks in a tight row', () => {
    ui.show(cardFor(), anchor());
    const css = ui.root()!.querySelector('style')!.textContent!;
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toContain('button, input, select { min-width: 44px; min-height: 44px; }');
    // 2026-10-25: the button IS the circle (26px, the same border and gold fill as with a pointer) and an invisible ::after halo makes the 44px
    // target; before, a 44px transparent button with a ::before circle was painted gold whole by the more specific .rateBtn.on rule (iPhone blobs)
    expect(css).toContain('.rateBtn { min-width: 26px; min-height: 26px; width: 26px; height: 26px; margin: 9px; position: relative; }');
    expect(css).toContain('.rateBtn::after { content: \'\'; position: absolute; inset: -9px; border-radius: 50%; }');
    expect(css).not.toMatch(/pointer: coarse[\s\S]*\.rateBtn[^{]*\{[^}]*background: transparent/);
  });

  it('page text reaches the DOM only as text: markup in a selection is shown literally and runs nothing', () => {
    const evil = '<img src=x onerror="window.__pwned=1"> <b>bold</b>';
    const c = parseSelection({ surface: evil, context: { kind: 'none', confidence: 0 } });
    c.notes.push('<script>window.__pwned=2</script>');
    ui.show(c, anchor());
    expect(ui.root()!.querySelector('img, b, script')).toBeNull();
    expect(document.querySelector('img, script')).toBeNull();
    expect(text(ui.root())).toContain('<img src=x onerror="window.__pwned=1">');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('does not steal focus unless asked to', () => {
    const btn = document.getElementById('outside') as HTMLButtonElement;
    btn.focus();
    ui.show(cardFor(), anchor());
    expect(document.activeElement).toBe(btn);
  });
});

describe('dismissal', () => {
  it('Escape dismisses', () => {
    ui.show(cardFor(), anchor());
    key(document.body, 'Escape');
    expect(ui.isOpen()).toBe(false);
    expect(document.querySelector(`[${GOLEARN_HOST_ATTR}]`)).toBeNull();
    expect(dismissed).toEqual(['escape']);
  });
  it('a click outside dismisses; a click inside does not', () => {
    ui.show(cardFor(), anchor());
    const host = document.querySelector(`[${GOLEARN_HOST_ATTR}]`)!;
    pointerDown(host);
    expect(ui.isOpen()).toBe(true);
    pointerDown(document.getElementById('outside')!);
    expect(ui.isOpen()).toBe(false);
    expect(dismissed).toEqual(['outside']);
  });
  it('the close button dismisses', () => {
    ui.show(cardFor(), anchor());
    (ui.root()!.querySelector('.close') as HTMLButtonElement).click();
    expect(dismissed).toEqual(['close']);
    expect(document.querySelector(`[${GOLEARN_HOST_ATTR}]`)).toBeNull();
  });
  it('leaves no listener behind after a dismissal or a destroy', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const rem = vi.spyOn(document, 'removeEventListener');
    ui.show(cardFor(), anchor());
    ui.show(cardFor('libër'), anchor());
    ui.dismiss('replaced');
    ui.show(cardFor(), anchor());
    ui.destroy();
    const count = (spy: typeof add) => spy.mock.calls.filter((c) => c[0] === 'keydown' || c[0] === 'pointerdown').length;
    expect(count(add)).toBeGreaterThan(0);
    expect(count(rem)).toBe(count(add));
    key(document.body, 'Escape'); // no handler left; must not throw
  });
  it('showing again replaces the card; there is only ever one host', () => {
    ui.show(cardFor(), anchor());
    ui.show(cardFor('libër'), anchor());
    ui.show(cardFor('bukur'), anchor());
    expect(document.querySelectorAll(`[${GOLEARN_HOST_ATTR}]`)).toHaveLength(1);
    expect(text(ui.root())).toContain('bukur');
  });
  it('re-attaches to the new body when the page replaced it', () => {
    ui.show(cardFor(), anchor());
    const fresh = document.createElement('body');
    fresh.innerHTML = '<p>new page</p>';
    document.documentElement.replaceChild(fresh, document.body);
    expect(document.querySelector(`[${GOLEARN_HOST_ATTR}]`)).toBeNull();
    ui.show(cardFor(), anchor());
    expect(document.body.querySelector(`[${GOLEARN_HOST_ATTR}]`)).toBeTruthy();
  });
});

describe('keyboard and tab order', () => {
  it('with no voice: the controls are Close, view sources, the six circles of the level meter, Go deeper, See full sentence and Report; the speaker is disabled and its title says why', () => {
    ui.show(cardFor(), anchor());
    const names = buttonsOf(ui.root()).filter((b) => !b.disabled).map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Close GoLearn card', 'view sources', 'New', 'Seen', 'Recognized', 'Familiar', 'Known', 'Automatic', 'Go deeper', 'See full sentence', 'Report']);
    const say = ui.root()!.querySelector('.say') as HTMLButtonElement;
    expect(say.disabled).toBe(true);
    expect(say.getAttribute('aria-label')).toBe('Play with GoListen');
    expect(say.title).toMatch(/Speech is not available/); // the title says so; nothing else of it is drawn
    expect(visibleText(ui.root())).toMatch(/Speech is not available/);
  });
  it('with a voice: the speaker comes right after Close, and the list is Close, Play with GoListen, view sources, the six levels, Go deeper, See full sentence, Report', () => {
    ui.destroy(); ui = make({ getVoices: () => [{ lang: 'sq-AL', name: 'sq', localService: true }], speak() {}, cancel() {} });
    ui.show(cardFor(), anchor());
    const names = buttonsOf(ui.root()).filter((b) => !b.disabled).map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Close GoLearn card', 'Play with GoListen', 'view sources', 'New', 'Seen', 'Recognized', 'Familiar', 'Known', 'Automatic', 'Go deeper', 'See full sentence', 'Report']);
    expect((ui.root()!.querySelector('.say') as HTMLButtonElement).title).toBe('Play with GoListen');
  });
  it('Tab wraps inside the card in both directions while focus is in it', () => {
    ui.show(cardFor(), anchor(), { focus: true });
    const root = ui.root()!;
    const close = root.querySelector('.close') as HTMLElement;
    const more = root.querySelector('.reportBtn') as HTMLElement; // the last control: "Report"
    expect(root.activeElement).toBeTruthy();
    more.focus();
    const e1 = key(more, 'Tab');
    expect(e1.defaultPrevented).toBe(true);
    expect(root.activeElement).toBe(close);
    const e2 = key(close, 'Tab', { shiftKey: true });
    expect(e2.defaultPrevented).toBe(true);
    expect(root.activeElement).toBe(more);
    close.focus();
    const e3 = key(close, 'Tab'); // not at the end: the browser moves on by itself
    expect(e3.defaultPrevented).toBe(false);
  });
  it('focus returns to where it was when a card that took focus is dismissed', () => {
    const btn = document.getElementById('outside') as HTMLButtonElement;
    btn.focus();
    ui.show(cardFor(), anchor(), { focus: true });
    expect(document.activeElement).not.toBe(btn);
    key(ui.root()!.querySelector('.card')!, 'Escape');
    expect(document.activeElement).toBe(btn);
  });
  it('"Go deeper" is one disclosure: the sections are hidden by default, aria-expanded follows, the button reads "Less" while open', () => {
    ui.show(cardFor(), anchor());
    const deeper = ui.root()!.querySelector('.deeper') as HTMLElement;
    const btn = ui.root()!.querySelector('.deeperBtn') as HTMLButtonElement;
    expect(deeper.hasAttribute('hidden')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe(deeper.id);
    expect(btn.textContent).toBe('Go deeper');
    btn.click();
    expect(deeper.hasAttribute('hidden')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.textContent).toBe('Less');
    btn.click();
    expect(deeper.hasAttribute('hidden')).toBe(true);
    expect(btn.textContent).toBe('Go deeper');
  });
  it('"Go deeper" shows every section at once, in the order Form, Syntax, All forms, Meanings, Origin, Word structure, About this analysis (Sentence has its own pill)', () => {
    ui.show(cardFor(), anchor());
    click(ui.root(), '.deeperBtn');
    const titles = [...ui.root()!.querySelectorAll('.deeper > h3')].map((x) => x.textContent);
    expect(titles).toEqual(['Form', 'Syntax', 'All forms', 'Meanings', 'Origin', 'Word structure', 'About this analysis']);
    expect([...ui.root()!.querySelectorAll('.deeper [hidden]')].map((e) => e.className)).toEqual(['analysis']); // every section is open; only the ANALYSIS dropdown is closed
    const buttons = buttonsOf(ui.root()).map((b) => b.textContent);
    // the Form section's quiet "analysis" toggle comes into the tab order with Go deeper, after the pills (Go deeper, Report)
    expect(buttons.indexOf('analysis')).toBeGreaterThan(buttons.indexOf('Report'));
    expect(buttons.filter((b) => b === 'analysis')).toHaveLength(1);
    for (const gone of ['Form', 'Phrase & syntax', 'English rescue', 'All forms', 'Meanings', 'Origin', 'Word structure', 'Sound', 'More', 'Pronounce (practice)']) expect(buttons).not.toContain(gone);
  });
});

describe('pronunciation', () => {
  const speechWith = (voices: Array<{ lang: string; name: string; localService?: boolean }>): SpeechLike & { spoken: unknown[]; cancelled: number } => {
    const s = { spoken: [] as unknown[], cancelled: 0, getVoices: () => voices, speak(u: unknown) { s.spoken.push(u); }, cancel() { s.cancelled++; } };
    return s;
  };
  it('plays through a local Albanian voice when the speaker beside the word is clicked', () => {
    const speech = speechWith([{ lang: 'en-US', name: 'en', localService: true }, { lang: 'sq-AL', name: 'sq', localService: true }]);
    ui.destroy(); ui = make(speech);
    ui.show(cardFor(), anchor());
    const say = ui.root()!.querySelector('.say') as HTMLButtonElement;
    expect(say.disabled).toBe(false);
    expect(say.title).toBe('Play with GoListen');
    expect(say.getAttribute('aria-label')).toBe('Play with GoListen');
    expect(text(say)).not.toMatch(/Pronounce/);
    say.click();
    expect(speech.spoken).toEqual([{ text: 'shtëpinë', voice: expect.objectContaining({ lang: 'sq-AL' }) }]);
  });
  it('does not use a remote voice: disabled, the title says why', () => {
    const speech = speechWith([{ lang: 'sq-AL', name: 'cloud', localService: false }]);
    ui.destroy(); ui = make(speech);
    ui.show(cardFor(), anchor());
    expect((ui.root()!.querySelector('.say') as HTMLButtonElement).disabled).toBe(true);
    expect((ui.root()!.querySelector('.say') as HTMLButtonElement).title).toMatch(/No Albanian voice on this device/);
    expect(visibleText(ui.root())).toMatch(/No Albanian voice on this device/);
    expect(speech.spoken).toEqual([]);
  });
  it('no Albanian voice at all: disabled', () => {
    const speech = speechWith([{ lang: 'en-US', name: 'en', localService: true }]);
    ui.destroy(); ui = make(speech);
    ui.show(cardFor(), anchor());
    expect((ui.root()!.querySelector('.say') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the built-in local pronouncer (the GoLearn web app card, on an iPhone too)', () => {
  const speechOf = (voices: Array<{ lang: string; name: string; localService?: boolean }>) =>
    ({ spoken: [] as unknown[], getVoices: () => voices, speak(u: unknown) { (this as { spoken: unknown[] }).spoken.push(u); }, cancel() {} });
  const say = (text: string, voice: { lang: string }) => ({ text, voice });
  it('takes the same voices as the extension: Latin is read by an Italian voice, and says so (2026-10-29)', () => {
    const speech = speechOf([{ lang: 'en-US', name: 'en', localService: true }, { lang: 'it-IT', name: 'Alice', localService: true }]);
    const p = localSpeechPronouncer(speech, say, DEVICE_TAGS);
    const a = p.availability('la') as { available: boolean; note: string };
    expect(a.available).toBe(true);
    expect(a.note).toContain('it-IT, standing in');
    expect(p.play('salve', 'la')).toMatchObject({ ok: true, voiceId: 'device:Alice' });
    expect(speech.spoken).toEqual([{ text: 'salve', voice: expect.objectContaining({ lang: 'it-IT' }) }]);
  });
  it('without a voice says which language is missing and where to add one; for Latin, an Italian voice', () => {
    const speech = speechOf([{ lang: 'en-US', name: 'en', localService: true }]);
    const p = localSpeechPronouncer(speech, say, DEVICE_TAGS);
    expect((p.availability('de') as { note: string }).note).toBe("No German voice on this device. Add one in the system's speech settings; GoLearn setup, Audio, shows how.");
    expect((p.availability('la') as { note: string }).note).toContain('Add an Italian voice, which reads Latin here,');
  });
  it('an empty voice list is still loading (Safari fills it only once asked), not a device without voices', () => {
    const p = localSpeechPronouncer(speechOf([]), say, DEVICE_TAGS);
    expect(p.availability('hi')).toEqual({ available: false, note: 'Looking for a voice on this device…' });
  });
});

describe('status, messages and repositioning', () => {
  it('shows "Encounter recorded." after the write, or says it was not recorded', () => {
    ui.show(cardFor(), anchor());
    expect(text(ui.root()!.querySelector('.status') as HTMLElement)).toBe('');
    ui.setRecorded('recorded');
    expect(text(ui.root()!.querySelector('.status') as HTMLElement)).toBe('Encounter recorded.');
    ui.setRecorded('failed');
    expect(text(ui.root()!.querySelector('.status') as HTMLElement)).toBe('Encounter not recorded.');
    expect(ui.root()!.querySelector('.status')!.getAttribute('aria-live')).toBe('polite');
  });
  it('shows a one-line message as an alert', () => {
    ui.showMessage('Select a word first.', anchor());
    const alert = ui.root()!.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toBe('Select a word first.');
    expect(ui.isOpen()).toBe(true);
  });
  it('repositions on request, and does nothing when closed', () => {
    expect(ui.reposition(anchor())).toBeUndefined();
    ui.show(cardFor(), anchor());
    const p = ui.reposition(anchor({ top: 300, bottom: 330 }))!;
    expect(p.top).toBe(338);
    expect((ui.root()!.querySelector('.card') as HTMLElement).style.top).toBe('338px');
  });
  it('flips above near the bottom of the viewport', () => {
    ui.show(cardFor(), anchor({ top: 700, bottom: 720 }));
    expect(ui.root()!.querySelector('.card')!.getAttribute('data-placement')).toBe('above');
  });
});

describe('evidence boundaries in deeper layers', () => {
  it('keeps the pack explanation for comma-union morphology instead of falling back to codes', () => {
    const c = cardFor();
    c.features = [{ key: 'Case', value: 'Nom,Acc' }];
    ui.show(c, anchor());
    ui.update({ explain: { state: 'ready', constructions: [], features: [
      { key: 'Case', value: 'Nom,Acc', label: 'Case', brief: 'nominative or accusative', explanation: 'Subject or direct object; context is needed.' },
    ] } });
    click(ui.root(), '.deeperBtn');
    const panel = ui.root()!.querySelector('.layer.l2') as HTMLElement;
    expect(panel.textContent).toContain('nominative or accusative');
    expect(panel.textContent).toContain('Subject or direct object');
    expect(panel.textContent).toContain('alternative values');
  });
  it('collapses duplicate feature reports and preserves unresolved alternatives', () => {
    const c = cardFor();
    c.features = [{ key: 'Number', value: 'Sing' }, { key: 'Number', value: 'Sing' }, { key: 'Number', value: 'Plur' }];
    ui.show(c, anchor());
    click(ui.root(), '.deeperBtn');
    const panel = ui.root()!.querySelector('.layer.l2') as HTMLElement;
    expect(panel.querySelectorAll('details.feat')).toHaveLength(1);
    expect(panel.querySelector('details.feat summary')!.textContent).toBe('Number · Sing / Plur');
    expect(panel.textContent).toContain('alternative values');
  });

  it('distinguishes an unavailable paradigm from a language-level non-inflecting result', () => {
    ui.show(cardFor(), anchor());
    ui.update({ enrichment: { state: 'ready', message: 'This build has no full dictionary records.' } });
    click(ui.root(), '.deeperBtn');
    expect(text(ui.root()!.querySelector('.layer.l6') as HTMLElement)).toMatch(/No inflection paradigm is available/);
    expect(text(ui.root()!.querySelector('.layer.l6') as HTMLElement)).toMatch(/no full dictionary records/);

    ui.show(cardFor(), anchor());
    ui.update({ enrichment: { state: 'ready', paradigm: { languageId: 'th', lemma: 'ตา', pos: 'NOUN', kind: 'none', cells: [], status: 'none', notes: ['Thai words do not inflect.'], constructions: ['aspect-particle'], sources: [] } } });
    click(ui.root(), '.deeperBtn');
    expect(text(ui.root()!.querySelector('.layer.l6') as HTMLElement)).toContain('Thai words do not inflect.');
    expect(text(ui.root()!.querySelector('.layer.l6') as HTMLElement)).not.toMatch(/No inflection paradigm is available/);
  });
});

describe('view sources', () => {
  const SOURCES = [
    { label: 'Wiktionary: shtëpi (Albanian)', url: 'https://en.wiktionary.org/wiki/shtëpi#Albanian', licence: 'CC BY-SA 4.0' },
    { label: 'kaikki.org: Albanian dictionary', url: 'https://kaikki.org/dictionary/Albanian/', licence: 'CC BY-SA 4.0' },
    { label: 'Course word list (adapter-sq@9)' },
  ];
  it('is a subscript button that opens a list of links (new tab, no opener) with the licence; the course word list is named without a link', () => {
    ui.show(cardFor(), anchor());
    ui.update({ sources: SOURCES });
    const btn = ui.root()!.querySelector('.sourcesBtn') as HTMLButtonElement;
    const panel = ui.root()!.querySelector('.sources') as HTMLElement;
    expect(btn.textContent).toBe('view sources');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.hasAttribute('hidden')).toBe(true);
    btn.click();
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const links = [...panel.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(['Wiktionary: shtëpi (Albanian)', 'kaikki.org: Albanian dictionary']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://en.wiktionary.org/wiki/sht%C3%ABpi#Albanian', 'https://kaikki.org/dictionary/Albanian/']);
    for (const a of links) { expect(a.getAttribute('target')).toBe('_blank'); expect(a.getAttribute('rel')).toBe('noopener noreferrer'); }
    expect(panel.textContent).toContain('CC BY-SA 4.0');
    expect(panel.textContent).toContain('Course word list (adapter-sq@9)');
    expect(panel.querySelectorAll('li')).toHaveLength(3);
    btn.click();
    expect(panel.hasAttribute('hidden')).toBe(true);
  });
  it('with no source it says so', () => {
    ui.show(cardFor(), anchor());
    click(ui.root(), '.sourcesBtn');
    expect((ui.root()!.querySelector('.sources') as HTMLElement).textContent).toBe('No external source: the course word list only.');
    expect(ui.root()!.querySelectorAll('.sources a')).toHaveLength(0);
  });
  it("shows the dictionary's attribution notice beside the links", () => {
    ui.show(cardFor(), anchor());
    ui.update({ sources: SOURCES, gloss: { state: 'ready', senses: ['house'], attribution: 'Meanings: Wiktionary (CC BY-SA 4.0)' } });
    expect((ui.root()!.querySelector('.sources') as HTMLElement).textContent).toContain('Meanings: Wiktionary (CC BY-SA 4.0)');
  });
  it('only an https address becomes a link: javascript:, data: and http: addresses a reply carries are shown as names', () => {
    ui.show(cardFor(), anchor());
    ui.update({ sources: [
      { label: 'bad one', url: 'javascript:window.__pwned=1' }, { label: 'bad two', url: 'data:text/html,<script>1</script>' },
      { label: 'bad three', url: 'http://example.test/x' }, { label: 'bad four', url: 'https://user:pw@example.test/x' }, { label: 'good', url: 'https://example.test/x' },
    ] });
    const links = [...ui.root()!.querySelectorAll('.sources a')];
    expect(links.map((a) => a.textContent)).toEqual(['good']);
    expect((ui.root()!.querySelector('.sources') as HTMLElement).textContent).toContain('bad one');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});

describe('the rating row and the footer', () => {
  it('offers the six levels in order, each sends its word as the mark, and the current level is the pressed one', () => {
    const marks: string[] = [];
    ui.show(cardFor(), anchor(), { actions: { onRate: (m) => marks.push(m) } });
    const buttons = [...ui.root()!.querySelectorAll('.rateBtn')] as HTMLButtonElement[];
    // each circle is named by its level (aria-label); the circles have no text of their own
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['New', 'Seen', 'Recognized', 'Familiar', 'Known', 'Automatic']);
    expect(buttons.every((b) => b.textContent === '')).toBe(true);
    expect(buttons.map((b) => b.getAttribute('data-mark'))).toEqual(['new', 'seen', 'recognized', 'familiar', 'known', 'automatic']);
    expect(ui.root()!.querySelector('.rate')!.textContent).toContain('How well do you know it?');
    for (const b of buttons) b.click();
    expect(marks).toEqual(['new', 'seen', 'recognized', 'familiar', 'known', 'automatic']);
    // the model's level is highlighted until the learner marks the word
    ui.update({ profile: { state: 'ready', weak: [], met: 2, level: 'familiar', encounters: 2 } });
    const pressedNames = (): Array<string | null> => buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'));
    const filled = (): number => buttons.filter((b) => b.classList.contains('on')).length;
    expect(pressedNames()).toEqual(['Familiar']);
    expect(filled()).toBe(4); // the circles up to and including the current level are filled
    expect(ui.root()!.querySelector('.levelName')!.textContent).toBe('Familiar');
    ui.update({ rated: 'automatic' });
    expect(pressedNames()).toEqual(['Automatic']);
    expect(filled()).toBe(6);
    expect(ui.root()!.querySelector('.levelName')!.textContent).toBe('Automatic');
    // the same mark again is not sent twice
    marks.length = 0;
    buttons[5].click();
    expect(marks).toEqual([]);
  });

  it('the kicker "· N× encounters" under the meter is the number only, shown once the model has answered', () => {
    ui.show(cardFor(), anchor());
    const line = ui.root()!.querySelector('.encounters') as HTMLElement;
    expect(line.textContent).toBe('');
    ui.update({ profile: { state: 'loading', weak: [] } });
    expect(line.textContent).toBe('');
    ui.update({ profile: { state: 'ready', weak: [], met: 3, encounters: 7 } });
    expect(line.textContent).toBe('· 7× encounters');
    ui.update({ profile: { state: 'ready', weak: [] } });
    expect(line.textContent).toBe('· 0× encounters');
    ui.update({ profile: { state: 'unavailable', weak: [], reason: 'offline' } });
    expect(line.textContent).toBe('');
    // nothing else about the learner is on the card
    ui.update({ profile: { state: 'ready', weak: [], met: 3, encounters: 7, level: 'seen', recognition: { level: 'high', confidence: 0.9 } } });
    expect(visibleText(ui.root())).not.toMatch(/You have met|reading recognition|confidence/i);
    expect(line.previousElementSibling!.classList.contains('rate')).toBe(true); // right under the meter
  });

  it('"Report" is the quiet pill beside "Go deeper" that opens the correction form (and closes it again); there is no "This analysis is wrong" and no "Review this"', () => {
    ui.show(cardFor(), anchor());
    const report = ui.root()!.querySelector('.reportBtn') as HTMLButtonElement;
    const form = ui.root()!.querySelector('form.fix') as HTMLElement;
    expect(report.textContent).toBe('Report');
    expect(report.closest('.pills')).toBeTruthy();
    expect(report.previousElementSibling).toBe(ui.root()!.querySelector('.sentenceBtn')); // Go deeper, See full sentence, then Report
    expect(report.getAttribute('aria-controls')).toBe(form.id);
    expect(form.hasAttribute('hidden')).toBe(true);
    report.click();
    expect(form.hasAttribute('hidden')).toBe(false);
    expect(report.getAttribute('aria-expanded')).toBe('true');
    expect(form.textContent).toContain('Send correction');
    report.click();
    expect(form.hasAttribute('hidden')).toBe(true);
    const everything = [...ui.root()!.querySelectorAll('button')].map((b) => b.textContent).join('|');
    expect(everything).not.toMatch(/This analysis is wrong|Review this|Saved for review/);
  });

  it('"Go deeper" reports every section once, in order, each time it is opened (the paradigm only for a single word); closing reports nothing', () => {
    const layers: string[] = [];
    ui.show(cardFor(), anchor(), { actions: { onLayer: (l) => layers.push(l) } });
    click(ui.root(), '.deeperBtn');
    expect(layers).toEqual(['morphology', 'phrase-syntax', 'forms', 'meaning', 'origin', 'structure']);
    click(ui.root(), '.deeperBtn');
    expect(layers).toHaveLength(6);
    click(ui.root(), '.deeperBtn');
    expect(layers).toHaveLength(12);
    // the sentence is reported once, on its first opening (opening it closes Go deeper)
    click(ui.root(), '.sentenceBtn'); click(ui.root(), '.sentenceBtn'); click(ui.root(), '.sentenceBtn');
    expect(layers.filter((l) => l === 'sentence')).toEqual(['sentence']);
    // the grammar is reported once, when ANALYSIS is first opened
    click(ui.root(), '.analysisBtn'); click(ui.root(), '.analysisBtn'); click(ui.root(), '.analysisBtn');
    expect(layers.filter((l) => l === 'grammar')).toEqual(['grammar']);
  });
});

describe('the rows of Form never let a kicker run under its value', () => {
  const cssOf = (selector: string): string => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/src/popup/card.ts'), 'utf8');
    const m = new RegExp(`^${selector.replace(/[.]/g, '\.')} \{([^}]*)\}`, 'm').exec(src);
    if (!m) throw new Error(`no rule ${selector}`);
    return m[1];
  };

  it('a long kicker ("lemma (guess)") comes first in its row, is nowrap with no max-width, and the row is auto width: it pushes the value, it cannot overlap it', () => {
    ui.show(cardFor('Flurbozitet', 'Ai tha Flurbozitet sot.'), anchor());
    click(ui.root(), '.deeperBtn');
    const lemma = ui.root()!.querySelector('.layer.l2 [data-row="lemma"]') as HTMLElement;
    const k = lemma.querySelector('.k') as HTMLElement;
    const v = lemma.querySelector('.v') as HTMLElement;
    expect(k.textContent).toBe('lemma (guess)');
    expect(k.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the kicker, then the value: two boxes in a flex row, never one over the other
    const kc = cssOf('.k');
    expect(kc).toMatch(/white-space:\s*nowrap/);
    expect(kc).not.toMatch(/max-width/); // a fixed width would let the text spill under the value
    expect(kc).toMatch(/min-width:\s*5\.5em/); // a column MINIMUM: a longer kicker widens it
    expect(kc).toMatch(/flex:\s*none/);
    expect(cssOf('.row')).toMatch(/display:\s*flex/);
    expect(cssOf('.row')).not.toMatch(/(^|[;\s])width:/); // auto width
  });

  it('the "analysis" subscript sits in the value column of the form row, with no rule between them, its spacer as wide as that row\'s kicker', () => {
    ui.show(cardFor(), anchor());
    click(ui.root(), '.deeperBtn');
    const form = ui.root()!.querySelector('.layer.l2 [data-row="form"]') as HTMLElement;
    const sub = ui.root()!.querySelector('.layer.l2 .analysisRow') as HTMLElement;
    expect(form.classList.contains('noRule')).toBe(true);
    expect(form.nextElementSibling).toBe(sub);
    expect(sub.querySelector('.kpad')!.getAttribute('data-pad')).toBe(form.querySelector('.k')!.textContent);
    expect(sub.querySelector('.v button.analysisBtn')).toBeTruthy();
    expect(cssOf('.row.noRule')).toMatch(/border-bottom:\s*0/);
    expect(cssOf('.row.analysisRow')).toMatch(/border-bottom:\s*0/);
    expect(cssOf('.row.analysisRow')).toMatch(/margin-top:\s*0\.2rem/);
  });
});
