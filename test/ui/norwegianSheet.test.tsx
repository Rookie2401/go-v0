// @vitest-environment jsdom
/**
 * The Norwegian word sheet: a language with no dictionary installed still says how a word sounds — the adapter's own rule-based IPA,
 * labelled as the adapter's (never as a dictionary's) — and names the other written standard's word for the same idea
 * ("Nynorsk: eg" under Bokmål "jeg"), which is related information only: nothing is credited across the family.
 *
 * REAL: the nb adapter. FAKES: the course catalogue, the lexicon (`info()` only, no entries). Expectations about the IPA are kept to
 * its presence and label: the transcription itself is machine-drafted and awaits a native speaker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStore, AssistanceProfile, CourseCatalog, DictionaryInfo, LanguageAdapter, LanguageCode } from '../../src/core';
import { DEFAULT_ASSISTANCE, buildFixtureText } from '../../src/core';
import { nbAdapter } from '../../src/adapters/nb';
import { familyLine } from '../../src/ui/reader/assistance';
import { Reader } from '../../src/ui/reader/Reader';
import { click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const dict = (lang: LanguageCode): DictionaryInfo => ({
  id: `none-${lang}`, lang, attribution: 'no dictionary installed', licence: '—', entries: 0, builtAt: '2026-10-07T00:00:00.000Z', hasFrequency: false,
});
// the layered (non-legacy) profile the courses use for their own texts: the sheet's variety and family lines are shown only there
const LAYERED: AssistanceProfile = { ...DEFAULT_ASSISTANCE, layers: ['gloss', 'grammar', 'english'], englishRescue: 'easy' };
function wire(adapter: LanguageAdapter, lang: LanguageCode) {
  const catalog = { assistanceFor: vi.fn(async () => LAYERED), currentStage: vi.fn(async () => undefined) } as unknown as CourseCatalog;
  const lookup = async () => new Map();
  Object.assign(h.services, { catalog, adapters: { get: () => adapter, all: () => [adapter] }, lexicon: () => ({ info: async () => dict(lang), lookup }) });
}
async function seed(store: AppStore, lang: LanguageCode, surfaces: string[]) {
  const text = await buildFixtureText(store, { lang, slug: 'sheet', title: 'Sheet', sentences: [{ tokens: surfaces.map((surface) => ({ surface, lemma: surface.toLowerCase(), gloss: 'word' })) }] });
  return text.id;
}
async function open(textId: string, surface: string) {
  mounted = await h.mount(<Reader textId={textId} mode="corpus" />);
  await click(qa<HTMLButtonElement>(mounted.container, 'button.tok').find((b) => b.textContent === surface)!);
}
const text = (testId: string) => q(mounted!.container, `[data-testid="${testId}"]`)?.textContent;

describe('Norwegian word sheet', () => {
  it('shows the adapter\'s own IPA, labelled as the adapter\'s rules, when no dictionary IPA exists', async () => {
    wire(nbAdapter, 'nb');
    const id = await seed(h.store, 'nb', ['Jeg', 'tror']);
    await open(id, 'Jeg');
    const ipa = text('sound-ipa');
    expect(ipa, 'the sound line').toBeTruthy();
    expect(ipa).toContain(`${nbAdapter.name} rules:`);
    expect(ipa).not.toContain('Dictionary');
  });

  it('names the Nynorsk member of the concept family under a Bokmål word, as information only', async () => {
    wire(nbAdapter, 'nb');
    const id = await seed(h.store, 'nb', ['Jeg', 'tror']);
    await open(id, 'Jeg');
    expect(text('family')).toBe('Nynorsk: eg');
  });

  it('familyLine leaves out members of the word\'s own language and is empty without a family', () => {
    expect(familyLine(undefined, 'nb')).toBeUndefined();
    expect(familyLine({ id: 'x', meaning: 'I', members: [{ lang: 'nb', lemma: 'jeg' }] }, 'nb')).toBeUndefined();
    expect(familyLine({ id: 'x', meaning: 'I', members: [{ lang: 'nb', lemma: 'jeg' }, { lang: 'nn', lemma: 'eg' }] }, 'nn')).toBe('Bokmål: jeg');
  });
});
