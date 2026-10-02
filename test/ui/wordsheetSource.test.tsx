// @vitest-environment jsdom
/**
 * The word sheet says where an analysis and a reading come from (PLAN6 F2).
 *
 * FAKES: the course catalogue (answers with the profile under test), the language adapter (`decode`,
 * `decodeWithPronunciation`, `sources`) and the lexicon (`info()` only). The importer and the Thai adapter that fill
 * `origin`, `sourceId`, `source` and `ruleTone` for real are other packages; here the fields are written by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisSourceInfo, AssistanceProfile, CourseCatalog, DictionaryInfo, LanguageAdapter, SyllableAnalysis, TokenAnalysis } from '../../src/core';
import { DEFAULT_ASSISTANCE, buildFixtureText, ids } from '../../src/core';
import type { AppStore } from '../../src/core';
import { Reader } from '../../src/ui/reader/Reader';
import { button, byLabel, click, makeHarness, q, qa } from './harness';
import { STORY_ID, seedStory } from './fixtures';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); override = {}; });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const TH = 'text:th:source';
const S0 = ids.sentence(TH, 0);

const ladder: AssistanceProfile = { ...DEFAULT_ASSISTANCE, layers: ['gloss', 'decoding', 'english'], decodingFirst: true, chrome: 'full', englishRescue: 'easy' };

const sources: Record<string, AnalysisSourceInfo> = {
  'adapter-th@2:hand': { id: 'adapter-th@2:hand', label: 'Course word list', origin: 'hand', reviewStatus: 'machine-drafted' },
  'adapter-th@2:checked': { id: 'adapter-th@2:checked', label: 'Checked word list', origin: 'hand', reviewStatus: 'native-reviewed' },
};
const DICT: DictionaryInfo = {
  id: 'kaikki-th@2026-09-28', lang: 'th', attribution: 'Wiktionary via kaikki.org, CC BY-SA 4.0', licence: 'CC BY-SA 4.0', entries: 20342, builtAt: '2026-09-30T00:00:00.000Z', hasFrequency: false,
};

const syl = (text: string, over: Partial<SyllableAnalysis> = {}): SyllableAnalysis => ({ text, start: 0, end: text.length, ending: 'open', confidence: 0.9, tone: 'mid', ...over });

const decodeWithPronunciation = vi.fn((_s: string, _p: unknown, _id?: string): SyllableAnalysis[] => [syl('ไป', { source: 'dictionary', sourceId: 'kaikki-th@2026-09-28' })]);
/** Per-test decodings that take precedence over the defaults below. */
let override: Record<string, SyllableAnalysis[]> = {};
const adapter = {
  lang: 'th', name: 'fake-th', sources,
  decode: (surface: string): SyllableAnalysis[] => (
    override[surface] ? override[surface] : surface === 'แม่' ? [syl('แม่', { source: 'exception-list', tone: 'falling' })]
      : surface === 'กิน' ? [syl('กิน', { source: 'dictionary', tone: 'mid', ruleTone: 'rising' })]
        : surface === 'ข้าว' ? [syl('ข้าว', { source: 'rule' })] : []),
  decodeWithPronunciation,
  orthFeatures: () => [],
} as unknown as LanguageAdapter;

function wire() {
  const catalog = { assistanceFor: vi.fn(async () => ladder), currentStage: vi.fn(async () => undefined) } as unknown as CourseCatalog;
  const info = vi.fn(async () => DICT);
  Object.assign(h.services, { catalog, adapters: { get: () => adapter, all: () => [adapter] }, lexicon: () => ({ info, lookup: async () => new Map() }) });
  return { info };
}

async function seed(store: AppStore) {
  return buildFixtureText(store, {
    lang: 'th', slug: 'source', title: 'แหล่งที่มา',
    sentences: [{ tokens: [{ surface: 'แม่', lemma: 'แม่', gloss: 'mother' }, { surface: 'กิน', lemma: 'กิน', gloss: 'eat' }, { surface: 'ข้าว', lemma: 'ข้าว', gloss: 'rice' }, { surface: 'ไป', lemma: 'ไป', gloss: 'go' }] }],
  });
}
async function patch(store: AppStore, index: number, p: Partial<TokenAnalysis>) {
  const tokenId = ids.token(S0, index);
  const row = (await store.analyses.where('tokenId', tokenId))[0];
  await store.analyses.put({ ...row, ...p });
}
const tok = (surface: string) => qa<HTMLButtonElement>(mounted!.container, 'button.tok').find((b) => b.textContent === surface)!;
const open = async () => { mounted = await h.mount(<Reader textId={TH} mode="corpus" />); };
const sourceLine = () => q(mounted!.container, '[data-testid="analysis-source"]')?.textContent;

describe('the source line under the gloss', () => {
  it.each([
    ['hand, machine-drafted', { origin: 'hand', sourceId: 'adapter-th@2:hand' }, 'Course word list, machine-drafted — not checked by a native speaker'],
    ['hand, reviewed by a native speaker', { origin: 'hand', sourceId: 'adapter-th@2:checked' }, 'Checked word list, checked by a native speaker'],
    ['dictionary: its attribution', { origin: 'dictionary', sourceId: DICT.id }, 'Wiktionary via kaikki.org, CC BY-SA 4.0'],
    ['rule', { origin: 'rule' }, 'worked out by rule'],
    ['corpus', { origin: 'corpus' }, 'supplied with this text'],
    ['reviewed: the person named', { origin: 'reviewed', sourceId: 'human:Khun Somchai' }, 'checked by Khun Somchai'],
  ] as const)('%s', async (_name, fields, line) => {
    await seed(h.store);
    await patch(h.store, 3, { ...fields });
    wire();
    await open();
    await click(tok('ไป'));
    expect(sourceLine()).toBe(line);
  });

  it('says nothing when the origin is absent, or a hand source cannot be named', async () => {
    await seed(h.store);
    await patch(h.store, 3, { origin: 'hand', sourceId: 'unknown-source' });
    wire();
    await open();
    await click(tok('ไป'));
    expect(sourceLine()).toBeUndefined();
    await click(tok('ข้าว')); // origin absent
    expect(sourceLine()).toBeUndefined();
  });

  it('a course without a ladder and without origins looks as it did: no line, no disclosure', async () => {
    await seed(h.store);
    Object.assign(h.services, { catalog: { assistanceFor: async () => DEFAULT_ASSISTANCE, currentStage: async () => undefined } });
    await open();
    await click(tok('ไป'));
    await click(button(mounted!.container, 'Show phrases'));
    await click(button(mounted!.container, 'Show grammar'));
    expect(sourceLine()).toBeUndefined();
    expect(qa(mounted!.container, 'button').some((b) => /also lists/.test(b.textContent ?? ''))).toBe(false);
  });
});

describe('dictionary alternatives', () => {
  const alt = { pos: 'NOUN' as const, morph: {}, confidence: 0.4, gloss: 'a kind of sweet', origin: 'dictionary' as const, sourceId: DICT.id };

  it('are collapsed behind a disclosure named from the attribution, with the neutral "differ here" line when the part of speech differs', async () => {
    await seed(h.store);
    await patch(h.store, 3, { origin: 'hand', sourceId: 'adapter-th@2:hand', pos: 'VERB', alternatives: [alt] });
    wire();
    await open();
    await click(tok('ไป'));
    const toggle = button(mounted!.container, 'Wiktionary also lists');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(mounted!.container.textContent).not.toContain('a kind of sweet');
    expect(q(mounted!.container, '[data-testid="lists-differ"]')!.textContent).toBe('The course word list and the dictionary differ here.');
    await click(toggle);
    const list = byLabel(mounted!.container, 'Dictionary alternatives');
    expect(list.textContent).toContain('a kind of sweet');
    expect(mounted!.container.textContent).toContain('Wiktionary via kaikki.org, CC BY-SA 4.0');
  });

  it('adds the line when the glosses share no word, and not when they agree', async () => {
    await seed(h.store);
    await patch(h.store, 3, { origin: 'hand', sourceId: 'adapter-th@2:hand', pos: 'NOUN', alternatives: [alt] }); // same part of speech, "go" vs "a kind of sweet"
    await patch(h.store, 2, { origin: 'hand', sourceId: 'adapter-th@2:hand', pos: 'NOUN', alternatives: [{ ...alt, gloss: 'cooked rice; food' }] });
    wire();
    await open();
    await click(tok('ไป'));
    expect(q(mounted!.container, '[data-testid="lists-differ"]')).not.toBeNull();
    await click(tok('ข้าว'));
    expect(q(mounted!.container, '[data-testid="lists-differ"]')).toBeNull(); // both say "rice"
    expect(button(mounted!.container, 'Wiktionary also lists')).toBeTruthy();
  });

  it('say nothing about disagreement when the dictionary is the analysis on show', async () => {
    await seed(h.store);
    await patch(h.store, 3, { origin: 'dictionary', sourceId: DICT.id, pos: 'VERB', alternatives: [alt] });
    wire();
    await open();
    await click(tok('ไป'));
    expect(q(mounted!.container, '[data-testid="lists-differ"]')).toBeNull();
  });
});

describe('the decoding block names its source', () => {
  it('rule: nothing added; exception list and dictionary: one line each; ruleTone and several readings are stated', async () => {
    await seed(h.store);
    await patch(h.store, 1, { notes: { readings: ['kin', 'gin'] } });
    wire();
    await open();
    await click(tok('ข้าว'));
    expect(q(mounted!.container, '[data-testid="decoding-source"]')!.textContent).toBe('by the spelling rules');
    expect(q(mounted!.container, '[data-testid="several-readings"]')).toBeNull();
    await click(tok('แม่'));
    expect(q(mounted!.container, '[data-testid="decoding-source"]')!.textContent).toBe("from the course's list of irregular words (machine-drafted)");
    await click(tok('กิน'));
    expect(q(mounted!.container, '[data-testid="decoding-source"]')!.textContent).toBe("from the dictionary's pronunciation (Wiktionary)");
    expect(q(mounted!.container, '[data-testid="rule-tone"]')!.textContent).toBe('Dictionary: mid. Spelling rules alone: rising.');
    expect(q(mounted!.container, '[data-testid="several-readings"]')!.textContent).toBe('This word has more than one reading.');
  });

  it('a single reading is not announced as several', async () => {
    await seed(h.store);
    await patch(h.store, 1, { notes: { readings: ['kin'] } });
    wire();
    await open();
    await click(tok('กิน'));
    expect(q(mounted!.container, '[data-testid="several-readings"]')).toBeNull();
  });

  it('passes the dictionary id to decodeWithPronunciation when the pronunciation came from a dictionary', async () => {
    await seed(h.store);
    await patch(h.store, 3, { notes: { respelling: 'ไป', pronunciationSource: DICT.id } });
    await patch(h.store, 2, { notes: { respelling: 'ข้าว' } }); // no stated source: none is passed
    wire();
    await open();
    await click(tok('ไป'));
    expect(decodeWithPronunciation).toHaveBeenCalledWith('ไป', { respelling: 'ไป', ipa: undefined }, DICT.id);
    expect(q(mounted!.container, '[data-testid="decoding-source"]')!.textContent).toBe("from the dictionary's pronunciation (Wiktionary)");
    decodeWithPronunciation.mockClear();
    await click(tok('ข้าว'));
    expect(decodeWithPronunciation).toHaveBeenCalledWith('ข้าว', { respelling: 'ข้าว', ipa: undefined }, undefined);
  });
});

// ───────────────────────────── the dictionary is asked when the sheet opens ─────────────────────────────

describe('dictionary lookup on tap (hand-analysed words carry only a marker)', () => {
  const entry = { form: 'ไป', lang: 'th' as const, pos: 'NOUN' as const, glosses: ['sweets; dessert', 'a snack'] };
  function wireLexicon(lookup: (forms: readonly string[]) => Promise<Map<string, unknown[]>>, info: DictionaryInfo | null = DICT) {
    wire();
    const lookupFn = vi.fn(lookup);
    const infoFn = vi.fn(async () => info ?? undefined);
    Object.assign(h.services, { lexicon: () => ({ info: infoFn, lookup: lookupFn }) });
    return { lookupFn, infoFn };
  }

  it('shows "Wiktionary also lists" and the neutral line once the lookup resolves; asks once per form', async () => {
    await seed(h.store);
    await patch(h.store, 3, { origin: 'hand', sourceId: 'adapter-th@2:hand', pos: 'VERB', notes: { dictionary: DICT.id } });
    const { lookupFn } = wireLexicon(async (forms) => new Map([[forms[0], [entry]]]));
    await open();
    await click(tok('ไป'));
    expect(lookupFn).toHaveBeenCalledWith(['ไป']);
    await click(button(mounted!.container, 'Wiktionary also lists'));
    expect(byLabel(mounted!.container, 'Dictionary alternatives').textContent).toContain('sweets; dessert');
    expect(q(mounted!.container, '[data-testid="lists-differ"]')!.textContent).toBe('The course word list and the dictionary differ here.');
    await click(tok('ข้าว'));
    await click(tok('ไป'));
    expect(lookupFn.mock.calls.filter((c) => c[0][0] === 'ไป')).toHaveLength(1); // cached for the page
  });

  it('never blocks the sheet: nothing while the lookup is pending, nothing if it fails', async () => {
    await seed(h.store);
    await patch(h.store, 3, { origin: 'hand', sourceId: 'adapter-th@2:hand', notes: { dictionary: DICT.id } });
    let release: (m: Map<string, unknown[]>) => void = () => undefined;
    const { lookupFn } = wireLexicon(() => new Promise((res) => { release = res; }));
    await open();
    await click(tok('ไป'));
    expect(byLabel(mounted!.container, 'Help for ไป').textContent).toContain('go'); // the gloss is there
    expect(qa(mounted!.container, 'button').some((b) => /also lists/.test(b.textContent ?? ''))).toBe(false);
    release(new Map([['ไป', [entry]]]));
    await click(tok('ข้าว')); // any later flush
    await click(tok('ไป'));
    expect(lookupFn).toHaveBeenCalledTimes(2); // ไป once, ข้าว once
    expect(button(mounted!.container, 'Wiktionary also lists')).toBeTruthy();

    await mounted!.unmount();
    wireLexicon(async () => { throw new Error('shard missing'); });
    await open();
    await click(tok('ไป'));
    expect(byLabel(mounted!.container, 'Help for ไป').textContent).toContain('go');
    expect(qa(mounted!.container, 'button').some((b) => /also lists/.test(b.textContent ?? ''))).toBe(false);
  });

  it('makes no lookup for a language whose dictionary has no info', async () => {
    await seed(h.store);
    const { lookupFn, infoFn } = wireLexicon(async () => new Map(), null);
    await open();
    await click(tok('ไป'));
    expect(infoFn).toHaveBeenCalled();
    expect(lookupFn).not.toHaveBeenCalled();
  });
});

describe('the other languages show no provenance', () => {
  it('a Spanish analysis with origin rule or corpus has no source line, and no dictionary is asked', async () => {
    await seedStory(h.store);
    const lookup = vi.fn(async () => new Map());
    const info = vi.fn(async () => undefined);
    Object.assign(h.services, { lexicon: () => ({ info, lookup }) });
    const first = ids.token(ids.sentence(STORY_ID, 0), 1);
    for (const origin of ['rule', 'corpus'] as const) {
      const row = (await h.store.analyses.where('tokenId', first))[0];
      await h.store.analyses.put({ ...row, origin });
      mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
      await click(qa<HTMLButtonElement>(mounted.container, 'button.tok').find((b) => b.textContent === 'creo')!);
      await click(button(mounted.container, 'Show phrases'));
      await click(button(mounted.container, 'Show grammar')); // the analysis is loaded from here on
      expect(sourceLine()).toBeUndefined();
      await mounted.unmount();
      mounted = undefined;
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('but a meaning that came from the dictionary always names the dictionary and says it was not checked here', async () => {
    // found in the browser audit of the Spanish dictionary: a word decided by Wiktionary showed its gloss with no source at all
    await seedStory(h.store);
    const info = vi.fn(async () => ({ id: 'kaikki-es@test', lang: 'es' as const, attribution: 'Wiktionary, via kaikki.org — CC BY-SA 4.0', licence: 'CC BY-SA 4.0', entries: 1, builtAt: '2026-10-01', hasFrequency: false }));
    Object.assign(h.services, { lexicon: () => ({ lang: 'es', info, lookup: async () => new Map() }) });
    const first = ids.token(ids.sentence(STORY_ID, 0), 1);
    const row = (await h.store.analyses.where('tokenId', first))[0];
    await h.store.analyses.put({ ...row, origin: 'dictionary', sourceId: 'kaikki-es@test', analyzer: 'dict:kaikki-es@test' });
    mounted = await h.mount(<Reader textId={STORY_ID} mode="corpus" />);
    await click(qa<HTMLButtonElement>(mounted.container, 'button.tok').find((b) => b.textContent === 'creo')!);
    await click(button(mounted.container, 'Show phrases'));
    await click(button(mounted.container, 'Show grammar'));
    await vi.waitFor(() => expect(sourceLine()).toBe('Wiktionary, via kaikki.org — CC BY-SA 4.0'));
    expect(q(mounted.container, '[data-testid="dictionary-gloss"]')?.textContent).toBe('dictionary meaning, not checked for this sentence');
  });
});

describe('the syllable row: source and certainty are separate statements', () => {
  const sourceTop = () => q(mounted!.container, '[data-testid="decoding-source"]')?.textContent;
  const rows = () => qa(mounted!.container, 'li.decode__syl');
  const decodingText = () => byLabel(mounted!.container, 'Decoding').textContent ?? '';

  async function show(surface: string, syllables: SyllableAnalysis[], analysis?: Partial<TokenAnalysis>) {
    await seed(h.store);
    override[surface] = syllables;
    if (analysis) await patch(h.store, ['แม่', 'กิน', 'ข้าว', 'ไป'].indexOf(surface), analysis);
    wire();
    await open();
    await click(tok(surface));
  }

  it('REGRESSION: a dictionary syllable at 0.7 is "from the dictionary", never "by the spelling rules"', async () => {
    await show('ไป', [syl('ไป', { source: 'dictionary', sourceId: DICT.id, confidence: 0.7, tone: 'falling', rule: 'tone taken from the dictionary' })]);
    expect(sourceTop()).toBe("from the dictionary's pronunciation (Wiktionary)");
    expect(decodingText()).not.toContain('by the spelling rules');
    expect(decodingText()).not.toContain('not checked against a dictionary');
    expect(rows()[0].textContent).toContain('less certain');
    expect(rows()[0].textContent).not.toContain('uncertain');
    expect(rows()[0].textContent).toContain('tone taken from the dictionary');
  });

  it('says a uniform source once at the top, not on every syllable', async () => {
    await show('ข้าว', [syl('ข้า', { source: 'rule' }), syl('ว', { source: 'rule' })]);
    expect(sourceTop()).toBe('by the spelling rules');
    expect(qa(mounted!.container, '[data-testid="syllable-source"]')).toHaveLength(0);
  });

  it('labels each syllable when the sources are mixed, and says nothing at the top', async () => {
    await show('ข้าว', [syl('ข้า', { source: 'rule' }), syl('ว', { source: 'dictionary', confidence: 0.7 })]);
    expect(sourceTop()).toBeUndefined();
    expect(qa(mounted!.container, '[data-testid="syllable-source"]').map((e) => e.textContent)).toEqual([
      'by the spelling rules', "from the dictionary's pronunciation (Wiktionary)",
    ]);
    expect(rows()[0].textContent).not.toContain('less certain');
    expect(rows()[1].textContent).toContain('less certain');
  });

  it('rule-only decoding at 0.9, 0.7 and 0.5: the source is the same, the certainty differs', async () => {
    await show('ข้าว', [syl('ข้าว', { source: 'rule', confidence: 0.9 })]);
    expect(sourceTop()).toBe('by the spelling rules');
    expect(decodingText()).not.toMatch(/less certain|uncertain/);
    await mounted!.unmount();
    override['ข้าว'] = [syl('ข้าว', { source: 'rule', confidence: 0.7 })];
    await open();
    await click(tok('ข้าว'));
    expect(sourceTop()).toBe('by the spelling rules');
    expect(rows()[0].textContent).toContain('less certain');
    await mounted!.unmount();
    override['ข้าว'] = [syl('ข้าว', { source: 'rule', confidence: 0.5 })];
    await open();
    await click(tok('ข้าว'));
    expect(sourceTop()).toBe('by the spelling rules');
    expect(rows()[0].textContent).toContain('uncertain');
    expect(rows()[0].textContent).not.toContain('less certain');
  });

  it('exception list, author and an absent source', async () => {
    await show('แม่', [syl('แม่', { source: 'exception-list' })]);
    expect(sourceTop()).toBe("from the course's list of irregular words (machine-drafted)");
    await mounted!.unmount();
    override['แม่'] = [syl('แม่', { source: 'author' })];
    await open();
    await click(tok('แม่'));
    expect(sourceTop()).toBe('supplied with this text');
    await mounted!.unmount();
    override['แม่'] = [syl('แม่', { confidence: 0.7 })]; // no source: nothing is said about it, only the certainty
    await open();
    await click(tok('แม่'));
    expect(sourceTop()).toBeUndefined();
    expect(qa(mounted!.container, '[data-testid="syllable-source"]')).toHaveLength(0);
    expect(rows()[0].textContent).toContain('less certain');
  });

  it('only a reviewed analysis that supplies the syllables says "checked by <name>"', async () => {
    await show('ไป', [syl('ไป', { source: 'dictionary' })], { origin: 'reviewed', sourceId: 'human:Khun Somchai', syllables: [syl('ไป', { source: 'dictionary' })] });
    expect(sourceTop()).toBe('checked by Khun Somchai');
    await mounted!.unmount();
    await patch(h.store, 3, { origin: 'reviewed', sourceId: 'human:Khun Somchai', syllables: undefined }); // a reviewed gloss; the reviewer did not supply the decoding
    await open();
    await click(tok('ไป'));
    expect(sourceTop()).toBe("from the dictionary's pronunciation (Wiktionary)");
    expect(decodingText()).not.toContain('checked by');
  });

  it('shows both readings with their labels when the rules disagree, without saying which is right', async () => {
    await show('กิน', [syl('กิน', { source: 'dictionary', tone: 'mid', ruleTone: 'rising' })]);
    const line = q(mounted!.container, '[data-testid="rule-tone"]')!.textContent!;
    expect(line).toBe('Dictionary: mid. Spelling rules alone: rising.');
    expect(line).not.toMatch(/correct|wrong|reviewed|settled/i);
    await mounted!.unmount();
    override['กิน'] = [syl('กิน', { source: 'exception-list', tone: 'high', ruleTone: 'mid' })];
    await open();
    await click(tok('กิน'));
    expect(q(mounted!.container, '[data-testid="rule-tone"]')!.textContent).toBe("The course's list of irregular words: high. Spelling rules alone: mid.");
  });

  it('keeps the several-readings line', async () => {
    await show('กิน', [syl('กิน', { source: 'rule' })], { notes: { readings: ['kin', 'gin'] } });
    expect(q(mounted!.container, '[data-testid="several-readings"]')!.textContent).toBe('This word has more than one reading.');
  });
});
