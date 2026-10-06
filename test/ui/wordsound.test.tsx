// @vitest-environment jsdom
/**
 * "How it sounds": a language Go cannot decode (Spanish, German, Albanian) still tells the learner how a word is said — the
 * dictionary's IPA (with a key for its marks) and the adapter's plain-English notes — in the word sheet, with no help event.
 *
 * REAL: the es / de / sq adapters' `pronunciation`. FAKES: the course catalogue (no ladder), the lexicon (`info()` only) and, for
 * the decoded scripts, an adapter with a `decode`. The dictionary's IPA is written onto the stored analysis by hand, as the importer does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistanceProfile, CourseCatalog, DictionaryEntry, DictionaryInfo, LanguageAdapter, SyllableAnalysis, TokenAnalysis } from '../../src/core';
import { DEFAULT_ASSISTANCE, buildFixtureText, ids } from '../../src/core';
import type { AppStore, LanguageCode } from '../../src/core';
import { deAdapter } from '../../src/adapters/de';
import { esAdapter } from '../../src/adapters/es';
import { sqAdapter } from '../../src/adapters/sq';
import { pickReading } from '../../src/ui/reader/assistance';
import { Reader } from '../../src/ui/reader/Reader';
import { click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const dict = (lang: LanguageCode): DictionaryInfo => ({
  id: `kaikki-${lang}@2026-09-28`, lang, attribution: 'Wiktionary via kaikki.org, CC BY-SA 4.0', licence: 'CC BY-SA 4.0', entries: 1000, builtAt: '2026-09-30T00:00:00.000Z', hasFrequency: false,
});

/** `entries`: what the installed dictionary lists, by form (only the fields the sheet reads). */
type Listed = Record<string, Array<Partial<Pick<DictionaryEntry, 'glosses' | 'pronunciations'>>>>;
const LADDER: AssistanceProfile = { ...DEFAULT_ASSISTANCE, layers: ['gloss', 'grammar', 'english'], englishRescue: 'easy' };
function wire(adapter: LanguageAdapter, lang: LanguageCode, entries: Listed = {}, profile: AssistanceProfile = DEFAULT_ASSISTANCE) {
  const catalog = { assistanceFor: vi.fn(async () => profile), currentStage: vi.fn(async () => undefined) } as unknown as CourseCatalog;
  const lookup = async (forms: string[]) => new Map(forms.filter((f) => entries[f]).map((f) => [f, entries[f].map((e) => ({ glosses: [], ...e }))]));
  Object.assign(h.services, { catalog, adapters: { get: () => adapter, all: () => [adapter] }, lexicon: () => ({ info: async () => dict(lang), lookup }) });
}

/** A one-sentence text; `notes` is written onto the stored analysis of each token, by surface. */
async function seed(store: AppStore, lang: LanguageCode, surfaces: string[], notes: Record<string, Record<string, string | string[]>> = {}) {
  const text = await buildFixtureText(store, { lang, slug: 'sound', title: 'Sound', sentences: [{ tokens: surfaces.map((surface) => ({ surface, lemma: surface.toLowerCase(), gloss: 'word' })) }] });
  const sentenceId = ids.sentence(text.id, 0);
  for (const [i, surface] of surfaces.entries()) {
    if (!notes[surface]) continue;
    const row = (await store.analyses.where('tokenId', ids.token(sentenceId, i)))[0];
    await store.analyses.put({ ...row, origin: 'hand', notes: notes[surface] } as TokenAnalysis);
  }
  return text.id;
}
async function open(textId: string, surface: string) {
  mounted = await h.mount(<Reader textId={textId} mode="corpus" />);
  await click(qa<HTMLButtonElement>(mounted.container, 'button.tok').find((b) => b.textContent === surface)!);
}
const text = (testId: string) => q(mounted!.container, `[data-testid="${testId}"]`)?.textContent;
const sections = () => qa(mounted!.container, 'section').map((s) => s.getAttribute('aria-label'));

describe('How it sounds', () => {
  it('Spanish: the dictionary IPA with its source, the key for its one mark, and the stress note first', async () => {
    wire(esAdapter, 'es');
    await open(await seed(h.store, 'es', ['señor'], { señor: { ipa: '/seˈɲoɾ/', pronunciationSource: 'kaikki-es@2026-09-28' } }), 'señor');
    expect(sections()).toContain('How it sounds');
    expect(text('sound-ipa')).toBe('Wiktionary: /seˈɲoɾ/');
    expect(text('sound-key')).toBe('ˈ marks the strong syllable'); // no length mark in this IPA: no length key
    const notes = qa(mounted!.container, '[data-testid="sound-notes"] li').map((li) => li.textContent);
    expect(notes[0]).toBe('No accent mark: stress is on the last syllable.');
    expect(notes).toContain('ñ is like "ny" in canyon.');
    // the sheet's own act (the tap) is recorded as before; the sound lines add no help event of their own
    expect(await h.events('DecodingRevealed')).toHaveLength(0);
    expect(await h.events('TokenHelpOpened')).toHaveLength(1);
  });

  it('German: the key names the strong syllable and the long vowel when the IPA has both', async () => {
    wire(deAdapter, 'de');
    await open(await seed(h.store, 'de', ['Straße'], { Straße: { ipa: '/ˈʃtʁaːsə/', pronunciationSource: 'kaikki-de@2026-09-28' } }), 'Straße');
    expect(text('sound-ipa')).toBe('Wiktionary: /ˈʃtʁaːsə/');
    expect(text('sound-key')).toBe('ˈ marks the strong syllable; ː a long vowel');
    expect(qa(mounted!.container, '[data-testid="sound-notes"] li').map((li) => li.textContent)).toContain('ß is a sharp s (ss).');
  });

  it('Albanian: no IPA means only the adapter notes, and no IPA line or key', async () => {
    wire(sqAdapter, 'sq');
    await open(await seed(h.store, 'sq', ['shtëpi']), 'shtëpi');
    expect(sections()).toContain('How it sounds');
    expect(q(mounted!.container, '[data-testid="sound-ipa"]')).toBeNull();
    expect(q(mounted!.container, '[data-testid="sound-key"]')).toBeNull();
    const notes = qa(mounted!.container, '[data-testid="sound-notes"] li').map((li) => li.textContent ?? '');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((n) => n.startsWith('sh:'))).toBe(true);
  });

  it('an IPA without stress or length marks gets no key, and an IPA that names no dictionary is not credited to one', async () => {
    wire(esAdapter, 'es');
    await open(await seed(h.store, 'es', ['casa'], { casa: { ipa: '/kasa/' } }), 'casa');
    expect(text('sound-ipa')).toBe('/kasa/');
    expect(q(mounted!.container, '[data-testid="sound-key"]')).toBeNull();
  });

  it('shows no section at all when the word has neither IPA nor notes', async () => {
    wire({ ...esAdapter, pronunciation: () => ({ notes: [] }) }, 'es');
    await open(await seed(h.store, 'es', ['casa']), 'casa');
    expect(sections()).not.toContain('How it sounds');
  });

  it('shows nothing from the network: the section is built from the stored analysis and the adapter', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      wire(esAdapter, 'es');
      await open(await seed(h.store, 'es', ['señor'], { señor: { ipa: '/seˈɲoɾ/' } }), 'señor');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('a word whose analysis has no IPA: the dictionary listing the sheet already asks for', () => {
  const pr = (ipa: string, ...tags: string[]) => ({ ipa, ...(tags.length ? { tags } : {}) });
  it('German die: stressed over unstressed, with its label', async () => {
    wire(deAdapter, 'de', { die: [{ pronunciations: [pr('/dɪ/', 'unstressed'), pr('/diː/', 'stressed')] }] });
    await open(await seed(h.store, 'de', ['die']), 'die');
    await vi.waitFor(() => expect(text('sound-ipa')).toBe('Wiktionary (stressed): /diː/'));
    expect(text('sound-key')).toBe('ː a long vowel');
  });

  it('German: an Austrian or Swiss reading loses to a German one', async () => {
    wire(deAdapter, 'de', { sie: [{ pronunciations: [pr('/zi/', 'Austria', 'Southern-Germany', 'Switzerland'), pr('/ziː/', 'Germany')] }] });
    await open(await seed(h.store, 'de', ['sie']), 'sie');
    await vi.waitFor(() => expect(text('sound-ipa')).toBe('Wiktionary (Germany): /ziː/'));
  });

  it('Albanian mirë: Tosk before Gheg, and the label says Tosk (a ladder profile too)', async () => {
    wire(sqAdapter, 'sq', { 'mirë': [{ glosses: ['good'], pronunciations: [pr('/ˈmɪɹ/', 'Gheg'), pr('/ˈmiɾə/', 'Tosk'), pr('/ˈmɜjɹ/', 'Gheg')] }] }, LADDER);
    await open(await seed(h.store, 'sq', ['mirë']), 'mirë');
    await vi.waitFor(() => expect(text('sound-ipa')).toBe('Wiktionary (Tosk): /ˈmiɾə/'));
    expect(text('sound-key')).toBe('ˈ marks the strong syllable');
  });

  it('Albanian një: only dialectal readings exist, so the first Tosk one is shown with both its labels', async () => {
    wire(sqAdapter, 'sq', { 'një': [{ pronunciations: [pr('[ɲa]', 'Gheg', 'dialectal'), pr('[ɲə]', 'Tosk', 'dialectal'), pr('[ɲi]', 'Tosk', 'dialectal')] }] });
    await open(await seed(h.store, 'sq', ['një']), 'një');
    await vi.waitFor(() => expect(text('sound-ipa')).toBe('Wiktionary (Tosk, dialectal): [ɲə]'));
  });

  it('Spanish: a Latin American reading beats a Spain one, whatever the order', async () => {
    wire(esAdapter, 'es', { cielo: [{ pronunciations: [pr('/ˈθjelo/', 'Spain'), pr('/ˈsjelo/', 'Latin-America')] }] });
    await open(await seed(h.store, 'es', ['cielo']), 'cielo');
    await vi.waitFor(() => expect(text('sound-ipa')).toBe('Wiktionary (Latin-America): /ˈsjelo/'));
  });

  it('Spanish: a Spain-only reading is shown with its label rather than nothing; an untagged one wins and has no label', async () => {
    wire(esAdapter, 'es', { gracias: [{ pronunciations: [pr('/ˈɡɾaθjas/', 'Spain')] }], casa: [{ pronunciations: [pr('/ˈkasa/', 'Spain'), pr('/ˈkasa/')] }] });
    await open(await seed(h.store, 'es', ['gracias', 'casa']), 'gracias');
    await vi.waitFor(() => expect(text('sound-ipa')).toBe('Wiktionary (Spain): /ˈɡɾaθjas/'));
    await click(qa<HTMLButtonElement>(mounted!.container, 'button.tok').find((b) => b.textContent === 'casa')!);
    await vi.waitFor(() => expect(text('sound-ipa')).toBe('Wiktionary: /ˈkasa/'));
  });

  it('an inflected form with no IPA anywhere shows the notes only', async () => {
    wire(esAdapter, 'es', { está: [{}] });
    await open(await seed(h.store, 'es', ['está']), 'está');
    expect(q(mounted!.container, '[data-testid="sound-ipa"]')).toBeNull();
    expect(qa(mounted!.container, '[data-testid="sound-notes"] li')[0].textContent).toBe('Stress falls on the accented vowel.');
  });

  it('an IPA on the analysis wins over the listing, and is not shown twice', async () => {
    wire(deAdapter, 'de', { die: [{ pronunciations: [pr('/dɪ/', 'unstressed')] }] });
    await open(await seed(h.store, 'de', ['die'], { die: { ipa: '/diː/', pronunciationSource: 'kaikki-de@2026-09-28' } }), 'die');
    await vi.waitFor(() => expect(text('sound-ipa')).toBe('Wiktionary: /diː/'));
    expect(qa(mounted!.container, '[data-testid="sound-ipa"]')).toHaveLength(1);
  });
});

describe('pickReading', () => {
  it('is deterministic: the lowest rank, then the first listed; no IPA gives nothing; Gheg only when alone', () => {
    expect(pickReading('sq', [{ pronunciations: [{ ipa: '/a/', tags: ['Gheg'] }, { ipa: '/b/', tags: ['Tosk', 'dialectal'] }, { ipa: '/c/', tags: ['Standard', 'Tosk'] }] }])).toEqual({ ipa: '/c/', tags: ['Standard', 'Tosk'] });
    expect(pickReading('sq', [{ pronunciations: [{ ipa: '/a/', tags: ['Gheg'] }, { ipa: '/g/', tags: ['Gheg', 'Northern'] }] }])).toEqual({ ipa: '/a/', tags: ['Gheg'] });
    expect(pickReading('es', [{}, { ipa: '/x/' }])).toEqual({ ipa: '/x/', tags: [] });
    expect(pickReading('es', [{}])).toBeUndefined();
  });
});

describe('languages with a decoding keep it, and only it', () => {
  const syl: SyllableAnalysis = { text: 'x', start: 0, end: 1, ending: 'open', confidence: 0.9, tone: 'mid' };
  it.each([['th', 'ไป'], ['hi', 'घर']] as const)('%s: "How it is read" is offered as before and "How it sounds" never appears', async (lang, surface) => {
    const adapter = { lang, name: `fake-${lang}`, decode: () => [syl], pronunciation: () => ({ notes: ['a note'] }), describeMorph: () => '' } as unknown as LanguageAdapter;
    const catalog = { assistanceFor: vi.fn(async () => ({ ...DEFAULT_ASSISTANCE, layers: ['gloss', 'decoding', 'english'], decodingFirst: true, englishRescue: 'easy' })), currentStage: vi.fn(async () => undefined) } as unknown as CourseCatalog;
    Object.assign(h.services, { catalog, adapters: { get: () => adapter, all: () => [adapter] } });
    await open(await seed(h.store, lang, [surface], { [surface]: { ipa: '/x/' } }), surface);
    expect(sections()).toContain('Decoding');
    expect(sections()).not.toContain('How it sounds');
    expect(await h.events('DecodingRevealed')).toHaveLength(1);
  });
});
