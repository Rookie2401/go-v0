// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computePosition, createCardUI, type CardUI, type DismissReason, type SpeechLike } from '../../packages/golearn-extension/src/popup/card';
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
  it('is a fixed host with a closed shadow root appended to body, and shows word, lemma, meaning, form and confidence', () => {
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
    expect(t).toMatch(/confidence/);
    expect(t).toMatch(/machine-drafted/);
    expect(ui.isOpen()).toBe(true);
    expect(placement.placement).toBe('below');
    const cardEl = ui.root()!.querySelector('.card') as HTMLElement;
    expect(cardEl.style.top).toBe('128px');
    expect(cardEl.getAttribute('role')).toBe('dialog');
  });

  it('labels each analysis line as analysis and the word as fact, and names the limits in the "more" panel', () => {
    ui.show(cardFor(), anchor());
    const tags = [...ui.root()!.querySelectorAll('.tag')].map((x) => x.textContent);
    expect(tags).toContain('analysis');
    const more = ui.root()!.querySelector('.more:not(.layer)') as HTMLElement;
    expect(more.textContent).toMatch(/machine-drafted/);
    expect(more.textContent).toMatch(/fact: what you selected/);
    expect(more.textContent).toMatch(/Context/);
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
  it('with no voice: the controls are Close, the four layers, Review, Wrong, More and the three "how well do you know it" marks; the pronounce button is disabled and says why', () => {
    ui.show(cardFor(), anchor());
    const names = [...ui.root()!.querySelectorAll('button:not([disabled])')].filter((b) => !b.closest('[hidden]')).map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Close GoLearn card', 'Form', 'Phrase & syntax', 'Grammar', 'English rescue', 'Review this', 'This analysis is wrong', 'More', 'All forms', 'Meanings', 'Origin', 'Word structure', 'Sound', 'New to me', 'I recognise it', 'I can use it']);
    const say = ui.root()!.querySelector('.say') as HTMLButtonElement;
    expect(say.disabled).toBe(true);
    expect(text(ui.root())).toMatch(/Speech is not available/);
  });
  it('Tab wraps inside the card in both directions while focus is in it', () => {
    ui.show(cardFor(), anchor(), { focus: true });
    const root = ui.root()!;
    const close = root.querySelector('.close') as HTMLElement;
    const more = root.querySelector('.rateBtn[data-mark="productive"]') as HTMLElement; // the last control: "I can use it"
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
  it('the more panel is a disclosure: hidden by default, aria-expanded follows', () => {
    ui.show(cardFor(), anchor());
    const more = ui.root()!.querySelector('.more:not(.layer)') as HTMLElement;
    const btn = ui.root()!.querySelector('.moreBtn') as HTMLButtonElement;
    expect(more.hasAttribute('hidden')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(more.hasAttribute('hidden')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.textContent).toBe('Less');
    btn.click();
    expect(more.hasAttribute('hidden')).toBe(true);
  });
});

describe('pronunciation', () => {
  const speechWith = (voices: Array<{ lang: string; name: string; localService?: boolean }>): SpeechLike & { spoken: unknown[]; cancelled: number } => {
    const s = { spoken: [] as unknown[], cancelled: 0, getVoices: () => voices, speak(u: unknown) { s.spoken.push(u); }, cancel() { s.cancelled++; } };
    return s;
  };
  it('plays through a local Albanian voice, labelled as practice', () => {
    const speech = speechWith([{ lang: 'en-US', name: 'en', localService: true }, { lang: 'sq-AL', name: 'sq', localService: true }]);
    ui.destroy(); ui = make(speech);
    ui.show(cardFor(), anchor());
    const say = ui.root()!.querySelector('.say') as HTMLButtonElement;
    expect(say.disabled).toBe(false);
    expect(say.textContent).toMatch(/practice/i);
    expect(text(ui.root())).toMatch(/Practice only/);
    say.click();
    expect(speech.spoken).toEqual([{ text: 'shtëpinë', voice: expect.objectContaining({ lang: 'sq-AL' }) }]);
  });
  it('does not use a remote voice: disabled with a note', () => {
    const speech = speechWith([{ lang: 'sq-AL', name: 'cloud', localService: false }]);
    ui.destroy(); ui = make(speech);
    ui.show(cardFor(), anchor());
    expect((ui.root()!.querySelector('.say') as HTMLButtonElement).disabled).toBe(true);
    expect(text(ui.root())).toMatch(/No local Albanian voice/);
    expect(speech.spoken).toEqual([]);
  });
  it('no Albanian voice at all: disabled', () => {
    const speech = speechWith([{ lang: 'en-US', name: 'en', localService: true }]);
    ui.destroy(); ui = make(speech);
    ui.show(cardFor(), anchor());
    expect((ui.root()!.querySelector('.say') as HTMLButtonElement).disabled).toBe(true);
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
