// @vitest-environment jsdom
/**
 * GoLearn Active, dictionary confirmation (2026-10-27, docs/ecosystem/GOLEARN-ACTIVE-DICTIONARY.md): a word the course word list does
 * not know is asked of the dictionary's forms index (through the background) before it is given up on. A hit is marked and recorded like
 * an analysed word, a miss (a name, another language's word, a typo) stays skipped, and with no dictionary the page behaves as before.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { ActiveMode } from '../../packages/golearn-extension/src/content/active';
import type { HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import { applyConfirmations, createScanner, formsToConfirm } from '../../packages/golearn-extension/src/active/scan';
import { clearAnalysers, getAnalyser, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import type { ConfirmFormsReply, KnowledgeView, ProfileReply } from '../../packages/golearn-extension/src/protocol';
import { deAdapter } from '../../src/adapters/de';
import { flush, makeRig, setBody, stubLayout, type Rig } from './dom';

class FakeHighlight implements HighlightLike {
  ranges = new Set<Range>();
  add(r: Range) { this.ranges.add(r); return this; }
  delete(r: Range) { return this.ranges.delete(r); }
  clear() { this.ranges.clear(); }
  get size() { return this.ranges.size; }
}
const w = window as unknown as { CSS?: { highlights?: Map<string, HighlightLike> }; Highlight?: typeof FakeHighlight };

const HEBREW = 'אֱלֹהִים';
const TEXT = `Der Sklave und die bisherigen Patrizier, xyzzy ${HEBREW}.`;
/** What the fake dictionary knows: form -> [lemma, pos]. */
const DICTIONARY: Record<string, [string, string | null]> = { bisherigen: ['bisherig', 'ADJ'], patrizier: ['Patrizier', 'NOUN'] };

let restore: () => void;
let registry: Map<string, HighlightLike>;
let rig: Rig;
let active: ActiveMode | undefined;
const requests: Array<{ forms: string[]; languageId: string }> = [];
const profileAsked: string[][] = [];
let reply: (forms: string[]) => ConfirmFormsReply | undefined;
let restoreRects: (() => void) | undefined;

const answer = (forms: string[]): ConfirmFormsReply => ({ ok: true, forms: Object.fromEntries(forms.map((f) => [f, DICTIONARY[f] ?? null])), source: 'hosted' });

beforeEach(() => {
  restore = stubLayout();
  registry = new Map();
  w.CSS = { highlights: registry }; w.Highlight = FakeHighlight;
  registerAnalyser('de', deAdapter);
  setBody(`<div id="content"><p id="p">${TEXT}</p></div>`);
  document.documentElement.lang = 'de';
  requests.length = 0; profileAsked.length = 0;
  reply = answer;
  rig = makeRig({ analysers: ['sq', 'de'] });
});
afterEach(() => {
  active?.stop(); active = undefined; restoreRects?.(); restoreRects = undefined;
  rig.controller.dispose(); restore(); clearAnalysers(['sq']);
  w.CSS = undefined; w.Highlight = undefined; document.documentElement.removeAttribute('lang');
});

const profile = async (unitIds: string[]): Promise<ProfileReply> => {
  profileAsked.push(unitIds);
  return { ok: true, connected: false, source: 'device', rows: {} as Record<string, KnowledgeView>, depth: 'brief', depthOrigin: 'default' };
};
const confirmForms = async (forms: string[], languageId: string): Promise<ConfirmFormsReply | undefined> => { requests.push({ forms: [...forms], languageId }); return reply(forms); };
function make(over: Partial<ConstructorParameters<typeof ActiveMode>[0]> = {}): ActiveMode {
  active = new ActiveMode({ doc: document, controller: rig.controller, adapters: rig.deps.adapters, ui: rig.ui, adapterOf: getAnalyser, profile, confirmForms, viewport: 'all', ...over });
  return active;
}
const marked = (): string[] => [...registry.values()].flatMap((h) => [...(h as FakeHighlight).ranges].map((r) => r.toString())).sort();
const visibleRects = (): void => {
  const proto = Range.prototype as unknown as { getClientRects?: () => DOMRectList };
  const old = proto.getClientRects;
  Object.defineProperty(proto, 'getClientRects', { configurable: true, value: () => [{ top: 1, bottom: 20, left: 1, right: 120, width: 119, height: 19 }] });
  restoreRects = () => { if (old) Object.defineProperty(proto, 'getClientRects', { configurable: true, value: old }); else delete proto.getClientRects; };
};

describe('the analyser alone (what the dictionary adds to)', () => {
  it('does not confirm the two dictionary words, so today they are skipped', async () => {
    const a = make({ confirmForms: undefined });
    const s = await a.start({ speak: false });
    expect(s.languageId).toBe('de');
    expect(marked()).not.toContain('Patrizier');
    expect(marked()).not.toContain('bisherigen');
    expect(s.skipped).toBe(4); // bisherigen, Patrizier, xyzzy and the Hebrew word
    expect(s.confirmed).toBe(0);
  });
});

describe('confirming through the dictionary', () => {
  it('marks the words the dictionary has and gives them lemma ids; names and other languages stay skipped; every form is asked once', async () => {
    const a = make();
    const s = await a.start({ speak: false });
    expect(marked()).toContain('Patrizier');
    expect(marked()).toContain('bisherigen');
    expect(marked()).not.toContain('xyzzy');
    expect(marked()).not.toContain(HEBREW);
    expect(s).toMatchObject({ confirmed: 2 });
    expect(s.unconfirmed).toBe(2); // xyzzy and the Hebrew word were asked about and not found
    // one request, every form once, the normalised form (the part after form:de:), the Hebrew word included (the dictionary decides)
    expect(requests).toHaveLength(1);
    const forms = requests[0].forms;
    expect(new Set(forms).size).toBe(forms.length);
    expect(forms).toEqual(expect.arrayContaining(['patrizier', 'bisherigen', 'xyzzy']));
    expect(forms.filter((f) => f === 'patrizier')).toHaveLength(1);
    expect(requests[0].languageId).toBe('de');
    // the learner model is asked about the confirmed words' ids, after the confirmation
    const ids = profileAsked.flat();
    expect(ids).toContain('lemma:de:bisherig:ADJ');
    expect(ids).toContain('lemma:de:Patrizier:NOUN');
    expect(ids.some((id) => id.includes('xyzzy'))).toBe(false);
    expect(ids.some((id) => id.includes(HEBREW))).toBe(false);
  });

  it('a second scan, and a changed text node with the same words, send no request', async () => {
    const a = make();
    await a.start({ speak: false });
    expect(requests).toHaveLength(1);
    await a.rescan();
    expect(requests).toHaveLength(1);
    document.getElementById('p')!.textContent = `Ein Patrizier, ein bisherigen xyzzy ${HEBREW}.`;
    await a.rescan();
    expect(requests).toHaveLength(1);
    expect(marked()).toContain('Patrizier');
    expect(marked()).toContain('bisherigen');
    expect(a.state.confirmed).toBe(2);
    // a NEW unknown word is asked, alone
    document.getElementById('p')!.textContent = 'Der Patrizier und Zzyzx.';
    await a.rescan();
    expect(requests).toHaveLength(2);
    expect(requests[1].forms).toEqual(['zzyzx']);
    expect(marked()).toContain('Patrizier');
  });

  it('records the confirmed words as encounters, with the form and lemma ids', async () => {
    visibleRects();
    const events: GoEvent[] = [];
    const a = make({
      buildEncounter: (ids) => ({
        id: `enc-${events.length}`, v: 3, learnerId: 'l', enrolmentId: 'e', languageId: 'de', at: new Date(1_000 + events.length).toISOString(),
        producer: { app: 'golearn-ext', version: 't', deviceId: 'd' }, kind: 'EncounterRecorded', subject: { itemIds: ids },
        payload: { contextKind: 'none', tokenCount: 1, readerId: 'web-generic' }, dedupeKey: `enc:${ids.join(',')}`,
      }),
      recordEncounter: async (e) => { events.push(e); return { ok: true }; },
    });
    await a.start({ speak: false });
    await flush(900);
    const all = events.flatMap((e) => e.subject.itemIds ?? []);
    expect(all).toContain('form:de:patrizier');
    expect(all).toContain('lemma:de:Patrizier:NOUN');
    expect(all).toContain('form:de:bisherigen');
    expect(all).toContain('lemma:de:bisherig:ADJ');
    expect(all.some((id) => id.includes('xyzzy'))).toBe(false);
  });

  it('splits more than 500 forms over several messages, each form once', async () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const words = Array.from({ length: 1_200 }, (_, i) => `q${letters[i % 26]}${letters[Math.floor(i / 26) % 26]}${letters[Math.floor(i / 676)]}x`);
    document.getElementById('p')!.textContent = words.join(' ');
    await make().start({ speak: false });
    expect(requests.length).toBeGreaterThanOrEqual(3);
    expect(requests.every((r) => r.forms.length <= 500)).toBe(true);
    const sent = requests.flatMap((r) => r.forms);
    expect(sent).toHaveLength(new Set(sent).size);
    expect(new Set(sent).size).toBe(1_200);
  });

  it('never asks about a run that is not made of letters', async () => {
    document.getElementById('p')!.textContent = 'Der 2026 xyzzy 12abc a-b.';
    await make().start({ speak: false });
    const sent = requests.flatMap((r) => r.forms);
    expect(sent).toContain('xyzzy');
    expect(sent.some((f) => /\d/.test(f))).toBe(false);
  });
});

describe('when the dictionary cannot answer', () => {
  it('"offline": the page behaves as without a dictionary, says so, and tries again later', async () => {
    reply = () => ({ ok: true, forms: {}, reason: 'offline' });
    const a = make();
    const s = await a.start({ speak: false });
    const baseline = make({ confirmForms: undefined });
    active!.stop();
    const b = await baseline.start({ speak: false });
    expect(s.reason).toBe('The dictionary could not be reached, so only the course word list underlines words.');
    expect(s.confirmed).toBe(0);
    expect(s.marked).toEqual(b.marked);
    expect(s.scanned).toBe(b.scanned);
    expect(s.skipped).toBe(b.skipped);
    expect(requests).toHaveLength(1);
  });

  it('the reason clears once a question gets through', async () => {
    let t = 0;
    reply = () => ({ ok: true, forms: {}, reason: 'offline' });
    const a = make({ perf: { now: () => t } });
    expect((await a.start({ speak: false })).reason).toMatch(/could not be reached/);
    await a.rescan(); // inside the retry wait: nothing is asked
    expect(requests).toHaveLength(1);
    t = 60_000;
    reply = answer;
    await a.rescan();
    expect(requests).toHaveLength(2);
    expect(a.state.reason).toBeUndefined();
    expect(marked()).toContain('Patrizier');
  });

  it.each(['no-pack', 'no-index'] as const)('"%s": quiet, and not asked again on this tab', async (reason) => {
    reply = () => ({ ok: true, forms: {}, reason });
    const a = make();
    const s = await a.start({ speak: false });
    expect(s.reason).toBeUndefined();
    expect(s.confirmed).toBe(0);
    document.getElementById('p')!.textContent = 'Der Zzyzx.';
    await a.rescan();
    expect(requests).toHaveLength(1);
  });

  it('a silent or broken background changes nothing', async () => {
    reply = () => undefined;
    const s = await make().start({ speak: false });
    expect(s.confirmed).toBe(0);
    expect(s.on).toBe(true);
    active!.stop();
    const boom = make({ confirmForms: async () => { throw new Error('no background'); } });
    expect((await boom.start({ speak: false })).confirmed).toBe(0);
  });

  it('without the message at all (no extension context) the scan is the analyser\'s alone', async () => {
    const s = await make({ confirmForms: undefined }).start({ speak: false });
    expect(requests).toEqual([]);
    expect(s.confirmed).toBe(0);
    expect(s.unconfirmed).toBe(0);
  });
});

describe('the scan helpers', () => {
  it('applyConfirmations flips known only from false to true, on the cached token, and never twice', () => {
    document.body.innerHTML = '<p id="q">Patrizier xyzzy</p>';
    const scanner = createScanner({ doc: document, adapterOf: getAnalyser, viewport: 'all' });
    const node = document.getElementById('q')!.firstChild as Text;
    const tokens = scanner.tokensIn([node], 'de');
    const sklave = tokens.find((t) => t.surface === 'Patrizier')!;
    expect(sklave.known).toBe(false);
    expect(formsToConfirm(tokens, 'de', new Map())).toEqual(['form:de:patrizier', 'form:de:xyzzy']);
    const answers = new Map<string, string | null>([['form:de:patrizier', 'lemma:de:Patrizier:NOUN'], ['form:de:xyzzy', null]]);
    expect(formsToConfirm(tokens, 'de', answers)).toEqual([]);
    expect(applyConfirmations(tokens, answers)).toEqual({ confirmed: 1, unconfirmed: 1 });
    expect(applyConfirmations(tokens, answers)).toEqual({ confirmed: 1, unconfirmed: 1 });
    expect(sklave.ids).toEqual(['form:de:patrizier', 'lemma:de:Patrizier:NOUN']);
    // the cache hands the same, already confirmed, token back while the text is unchanged
    expect(scanner.tokensIn([node], 'de').find((t) => t.surface === 'Patrizier')).toBe(sklave);
  });
});
