// @vitest-environment jsdom
/**
 * The stage-aware word sheet, decoding, notes, clause structure, quiet chrome and the difficulty preview.
 *
 * FAKES used here (the real implementations belong to other packages):
 *  - the course catalogue: `fakeCatalog(profile)` answers `assistanceFor` with the profile under test;
 *  - the language adapter: `fakeAdapter` has a `decode` that returns fixed SyllableAnalysis rows and an `orthFeatures`
 *    that names a feature per consonant class (the real Thai `decode` is still a stub);
 *  - GoLearn's `itemHistory` and `predictDifficulty` (not in the UI harness's fake yet).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AssistanceProfile, ContentNote, CourseCatalog, DecodingRevealed, DifficultyForecast, GrammarHelpOpened, LanguageAdapter, NoteOpened, PhraseHelpOpened,
  SyllableAnalysis, TokenAnalysis, TokenHelpOpened,
} from '../../src/core';
import { DEFAULT_ASSISTANCE, buildFixtureText, ids } from '../../src/core';
import type { AppStore } from '../../src/core';
import { setPref } from '../../src/ui/prefs';
import { AppRoutes, Shell } from '../../src/ui/App';
import { Reader } from '../../src/ui/reader/Reader';
import { button, byLabel, choose, click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';
import { STORY_ID, seedStory } from './fixtures';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness({ learn: { explanations: { [ids.sentence('text:th:wordsheet', 1)]: 'He eats rice and softens it with a particle.' } } }); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const TH = 'text:th:wordsheet';
const S0 = ids.sentence(TH, 0);
const S1 = ids.sentence(TH, 1);

// ───────────────────────────── fakes ─────────────────────────────

const profile = (over: Partial<AssistanceProfile>): AssistanceProfile => ({ ...DEFAULT_ASSISTANCE, ...over });

function fakeCatalog(p: AssistanceProfile): CourseCatalog {
  return {
    install: vi.fn(async () => undefined), stages: vi.fn(async () => []), works: vi.fn(async () => []), work: vi.fn(async () => undefined),
    textsOf: vi.fn(async () => []), stageOfText: vi.fn(async () => undefined), assistanceFor: vi.fn(async () => p),
    currentStage: vi.fn(async () => undefined), setCurrentStage: vi.fn(async () => undefined),
  } as unknown as CourseCatalog;
}

const MOTHER: SyllableAnalysis = {
  text: 'แม่', start: 0, end: 3, initial: 'ม', initialClass: 'low', vowel: 'แ◌', vowelLength: 'long', ending: 'open', toneMark: 'ไม้เอก', tone: 'falling',
  rule: 'low-class consonant + mai ek gives falling', romanization: 'mâe', confidence: 0.95,
};
const GO_UNSURE: SyllableAnalysis = { text: 'ไป', start: 0, end: 2, initial: 'ป', initialClass: 'mid', vowel: 'ไ◌', ending: 'open', confidence: 0.4 };

/** By the rules only (0.6 to 0.8), a written vowel with its sound, and an unwritten vowel read as a respelling. */
const EAT: SyllableAnalysis = { text: 'กิน', start: 0, end: 3, initial: 'ก', initialClass: 'mid', vowel: 'ิ', vowelLength: 'short', vowelSound: 'i', ending: 'live', final: 'น', tone: 'mid', confidence: 0.7 };
const RICE: SyllableAnalysis[] = [
  { text: 'ข', start: 0, end: 1, initial: 'ข', initialClass: 'high', vowel: '◌', vowelLength: 'short', vowelSound: 'a', ending: 'open', respelled: 'หนม', confidence: 0.9 },
  { text: 'าว', start: 1, end: 3, vowel: 'า', vowelLength: 'long', vowelSound: 'ao', ending: 'open', confidence: 0.85 },
];

const fakeAdapter = {
  lang: 'th', name: 'fake-th',
  decode: (surface: string): SyllableAnalysis[] => (
    surface === 'แม่' ? [MOTHER] : surface === 'ไป' ? [GO_UNSURE] : surface === 'กิน' ? [EAT] : surface === 'ข้าว' ? RICE : []),
  orthFeatures: (syl: SyllableAnalysis[]) => syl.map((s) => `class:${s.initialClass}`),
  describeOrthFeature: (f: string) => f,
} as unknown as LanguageAdapter;

/** Wire a ladder stage into the harness: the catalogue, and optionally the adapter and GoLearn's new reads. */
function wire(p: AssistanceProfile, extra: { history?: string[] } = {}) {
  Object.assign(h.services, { catalog: fakeCatalog(p), adapters: { get: () => fakeAdapter, all: () => [fakeAdapter] } });
  Object.assign(h.learn, {
    itemHistory: vi.fn(async (_u: string, itemId: string) => ({ itemId, lines: extra.history ?? [] })),
  });
}

async function seedThaiText(store: AppStore) {
  return buildFixtureText(store, {
    lang: 'th', slug: 'wordsheet', title: 'ตลาดวันนี้',
    sentences: [
      { tokens: [{ surface: 'แม่', lemma: 'แม่', gloss: 'mother' }, { surface: 'ไป', lemma: 'ไป', gloss: 'go' }, { surface: 'ตลาด' }], english: 'Mother goes to the market.' },
      {
        tokens: [{ surface: 'เขา', lemma: 'เขา', gloss: 'he' }, { surface: 'กิน', lemma: 'กิน', gloss: 'eat' }, { surface: 'ข้าว', lemma: 'ข้าว', gloss: 'rice' }, { surface: 'นะ', lemma: 'นะ', gloss: 'softener' }],
        english: 'He eats rice, okay.',
        phrases: [{ pattern: ['ข้าว', 'นะ'], display: 'ข้าวนะ', tokenIndexes: [2, 3] }],
        patterns: [{ key: 'final-particle', title: 'Final particle', tokenIndexes: [3] }],
      },
    ],
  });
}

async function patchAnalysis(store: AppStore, sentence: string, index: number, patch: Partial<TokenAnalysis>) {
  const tokenId = ids.token(sentence, index);
  const row = (await store.analyses.where('tokenId', tokenId))[0];
  await store.analyses.put({ ...row, ...patch });
}

const note = (key: string, over: Partial<ContentNote>): ContentNote => ({
  id: ids.note(TH, key), textId: TH, lang: 'th', sentenceId: S1, kind: 'cultural', body: 'A note.', provenance: 'human', reviewStatus: 'reviewed', ...over,
});

const tokenButton = (surface: string) => {
  const t = qa<HTMLButtonElement>(mounted!.container, 'button.tok').find((b) => b.textContent === surface);
  if (!t) throw new Error(`no token "${surface}"`);
  return t;
};
const more = () => qa<HTMLButtonElement>(mounted!.container, '.card__actions button')[0];
const reader = async () => { mounted = await h.mount(<Reader textId={TH} mode="corpus" />); return mounted; };

/** Click "more help" until the sheet is at the top of its ladder; returns the labels pressed. */
async function climb(): Promise<string[]> {
  const labels: string[] = [];
  for (let i = 0; i < 14 && more(); i++) { labels.push(more().textContent ?? ''); await click(more()); }
  return labels;
}

// ───────────────────────────── a course without a ladder ─────────────────────────────

describe('word sheet — default profile', () => {
  it('is today\'s sheet: no ladder, no marks, no variety line, every rung of the ladder', async () => {
    await seedThaiText(h.store);
    await patchAnalysis(h.store, S1, 3, { register: ['regional-isan'], role: 'particle', definition: 'x' });
    await h.store.notes.put(note('n1', {}));
    wire(DEFAULT_ASSISTANCE);
    await reader();
    expect(qa(mounted!.container, 'button[aria-label^="Note on sentence"]')).toHaveLength(0);
    expect(q(mounted!.container, '.reading-details')).toBeNull();
    expect(q(mounted!.container, 'select[aria-label="Highlighting"]')).not.toBeNull();
    await click(tokenButton('นะ'));
    expect(q(mounted!.container, '[data-testid="variety"]')).toBeNull();
    expect(q(mounted!.container, '[data-testid="word-role"]')).toBeNull();
    expect(await climb()).toEqual(['Show phrases', 'Show grammar', 'Explain this sentence', 'Show English']);
    expect(((await h.events('TokenHelpOpened')) as TokenHelpOpened[]).map((e) => e.level)).toEqual([1, 2, 3, 4, 5]);
    expect(h.learn.itemHistory).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── Stage 0: decoding first, romanization as a rescue ─────────────────────────────

describe('word sheet — Stage 0', () => {
  const stage0 = profile({
    visibility: 'heavy', defaultHighlight: 'strong', layers: ['gloss', 'decoding', 'phrase', 'english', 'grammar', 'sentence', 'history'],
    englishRescue: 'easy', romanization: 'rescue', decodingFirst: true, chrome: 'full',
  });

  it('shows gloss and decoding together on the first tap and emits both events; romanization is not on the page', async () => {
    await seedThaiText(h.store);
    wire(stage0);
    await reader();
    expect(q(mounted!.container, 'article.reader')!.getAttribute('data-highlight')).toBe('strong'); // the stage's default, no choice made yet
    expect(mounted!.container.textContent).not.toContain('mâe');
    await click(tokenButton('แม่'));
    const card = byLabel(mounted!.container, 'Help for แม่');
    expect(card.textContent).toContain('mother');
    const decoding = byLabel(card, 'Decoding');
    expect(decoding.textContent).toContain('low'); // consonant class
    expect(decoding.textContent).toContain('long'); // vowel length
    expect(decoding.textContent).toContain('open'); // ending
    expect(decoding.textContent).toContain('falling'); // tone
    expect(decoding.textContent).toContain('low-class consonant + mai ek gives falling'); // the rule sentence
    expect(card.textContent).not.toContain('mâe');

    const help = (await h.events('TokenHelpOpened')) as TokenHelpOpened[];
    expect(help.map((e) => e.level)).toEqual([1]);
    const revealed = (await h.events('DecodingRevealed')) as DecodingRevealed[];
    expect(revealed).toHaveLength(1);
    expect(revealed[0]).toMatchObject({ tokenId: ids.token(S0, 0), itemId: ids.form('th', 'แม่'), features: ['class:low'], romanization: false, sentenceId: S0, surface: 'corpus' });
  });

  it('offers romanization only as a rescue button, and records its use', async () => {
    await seedThaiText(h.store);
    wire(stage0);
    await reader();
    await click(tokenButton('แม่'));
    const rescue = button(mounted!.container, 'Show romanization (rescue)');
    await click(rescue);
    expect(byLabel(mounted!.container, 'Decoding').textContent).toContain('mâe');
    const revealed = (await h.events('DecodingRevealed')) as DecodingRevealed[];
    expect(revealed.map((e) => e.romanization)).toEqual([false, true]);
    expect(qa(mounted!.container, 'button').some((b) => /rescue/.test(b.textContent ?? ''))).toBe(false); // used: the button is gone
  });

  it('says "uncertain" for a low-confidence syllable and never invents a tone', async () => {
    await seedThaiText(h.store);
    wire(stage0);
    await reader();
    await click(tokenButton('ไป'));
    const decoding = byLabel(mounted!.container, 'Decoding');
    expect(decoding.textContent).toContain('uncertain');
    expect(decoding.textContent).toContain('not decided');
    expect(decoding.textContent).not.toContain('falling');
  });

  it('has three tiers of certainty, separate from the source: nothing, "less certain", and "uncertain"', async () => {
    await seedThaiText(h.store);
    wire(stage0);
    await reader();
    await click(tokenButton('แม่')); // 0.95
    expect(q(mounted!.container, '[data-testid="less-certain"]')).toBeNull();
    expect(byLabel(mounted!.container, 'Decoding').textContent).not.toContain('uncertain');
    await click(tokenButton('กิน')); // 0.7
    expect(q(mounted!.container, '[data-testid="less-certain"]')!.textContent).toBe('less certain');
    expect(mounted!.container.textContent).not.toContain('not checked against a dictionary');
    expect(byLabel(mounted!.container, 'Decoding').textContent).not.toContain('uncertain');
    await click(tokenButton('ไป')); // 0.4
    expect(q(mounted!.container, '[data-testid="less-certain"]')).toBeNull();
    expect(byLabel(mounted!.container, 'Decoding').textContent).toContain('uncertain');
  });

  it('words an unwritten vowel with its sound, and a respelled syllable as "Read as …" with a line above', async () => {
    await seedThaiText(h.store);
    wire(stage0);
    await reader();
    await click(tokenButton('ข้าว'));
    const decoding = byLabel(mounted!.container, 'Decoding');
    expect(q(decoding, '[data-testid="not-as-spelled"]')!.textContent).toBe('This word is not read exactly as it is spelled.');
    expect(q(decoding, '[data-testid="vowel-unwritten"]')!.textContent).toBe('not written — short a');
    expect(qa(decoding, '.decode__respelled').map((e) => e.textContent)).toEqual(['Read as หนม']);
    expect(decoding.textContent).toContain('long — ao'); // a written vowel keeps its pattern, then the sound
    expect(decoding.textContent).not.toContain('mâe');
    await click(tokenButton('กิน')); // no respelling anywhere: no such lines
    expect(q(mounted!.container, '[data-testid="not-as-spelled"]')).toBeNull();
    expect(q(mounted!.container, '.decode__respelled')).toBeNull();
  });

  it('records the decoding once per word and sitting: re-opening the same word adds no second DecodingRevealed', async () => {
    await seedThaiText(h.store);
    wire(stage0);
    await reader();
    await click(tokenButton('แม่'));
    await click(tokenButton('แม่')); // closes
    await click(tokenButton('แม่')); // opens again, same sitting
    expect(await h.events('DecodingRevealed')).toHaveLength(1);
    expect(await h.events('TokenHelpOpened')).toHaveLength(2); // the gloss is a fresh act each time
    await click(tokenButton('กิน'));
    expect(await h.events('DecodingRevealed')).toHaveLength(2); // another word is another record
  });

  it('says plainly when a spelling cannot be decoded', async () => {
    await seedThaiText(h.store);
    wire(stage0);
    await reader();
    await click(tokenButton('ตลาด'));
    expect(q(mounted!.container, '[data-testid="cannot-decode"]')!.textContent).toBe('Go cannot decode this spelling reliably.');
    expect(qa(mounted!.container, 'li.decode__syl')).toHaveLength(0);
  });

  it('a stage that never allows romanization has no rescue button, even when the data has one', async () => {
    await seedThaiText(h.store);
    wire(profile({ ...stage0, romanization: 'never' }));
    await reader();
    await click(tokenButton('แม่'));
    expect(qa(mounted!.container, 'button').some((b) => /romaniz/i.test(b.textContent ?? ''))).toBe(false);
    expect(mounted!.container.textContent).not.toContain('mâe');
  });

  it('opens decoding later, from "more help", when the stage does not put it first (only DecodingRevealed, no TokenHelpOpened)', async () => {
    await seedThaiText(h.store);
    wire(profile({ layers: ['gloss', 'decoding', 'english'], decodingFirst: false, romanization: 'never' }));
    await reader();
    await click(tokenButton('แม่'));
    expect(byLabel(mounted!.container, 'Help for แม่').querySelector('[aria-label="Decoding"]')).toBeNull();
    await click(button(mounted!.container, 'Show how it is read'));
    expect(byLabel(mounted!.container, 'Decoding').textContent).toContain('falling');
    expect((await h.events('DecodingRevealed')) as DecodingRevealed[]).toHaveLength(1);
    expect(((await h.events('TokenHelpOpened')) as TokenHelpOpened[]).map((e) => e.level)).toEqual([1]);
  });
});

// ───────────────────────────── layers, order and events ─────────────────────────────

describe('word sheet — layers', () => {
  const full = profile({
    layers: ['gloss', 'phrase', 'definition', 'discourse', 'note', 'clause-structure', 'grammar', 'sentence', 'history', 'english', 'decoding'],
    englishRescue: 'secondary', romanization: 'never', targetLanguageDefinitions: true,
  });

  async function richSeed() {
    await seedThaiText(h.store);
    await patchAnalysis(h.store, S1, 3, { role: 'softening particle', definition: 'คำลงท้ายที่ทำให้ประโยคอ่อนลง' });
    const text = (await h.store.sentences.get(S1))!.text;
    await h.store.notes.put(note('cultural', { body: 'Rice is the centre of a Thai meal.', topics: ['food'] }));
    await h.store.notes.put(note('clause', {
      kind: 'clause-structure', body: 'Subject, then the verb phrase.',
      spans: [{ start: 0, end: 3, label: 'subject' }, { start: 3, end: text.length, label: 'predicate' }],
    }));
  }

  it('offers the profile\'s layers in order, English after the target-language layers, and emits each layer\'s event', async () => {
    await richSeed();
    wire(full, { history: ['You first met this in Market Day, chapter 1.', 'Met 3 times.'] });
    await reader();
    await click(tokenButton('นะ'));
    const labels = await climb();
    expect(labels).toEqual([
      'Show phrases', 'Show a simple definition', 'Show what it does here', 'Show notes', 'Show sentence structure', 'Show grammar',
      'Explain this sentence', 'Show your history with this word', 'Show how it is read', 'Show English',
    ]);
    const card = byLabel(mounted!.container, 'Help for นะ');
    expect(byLabel(card, 'Definition').textContent).toContain('คำลงท้ายที่ทำให้ประโยคอ่อนลง');
    expect(byLabel(card, 'What this word does').textContent).toContain('Softening particle');
    expect(byLabel(card, 'Your history with this word').textContent).toContain('Met 3 times.');
    expect(byLabel(card, 'English').textContent).toContain('He eats rice, okay.');

    const levels = ((await h.events('TokenHelpOpened')) as TokenHelpOpened[]).map((e) => e.level);
    expect(levels).toEqual([1, 2, 3, 3, 4, 3, 4, 5]); // note, history and decoding are not word help at a level
    expect(((await h.events('PhraseHelpOpened')) as PhraseHelpOpened[])).toHaveLength(1);
    expect(((await h.events('GrammarHelpOpened')) as GrammarHelpOpened[])).toHaveLength(2); // discourse + grammar (one pattern covers the particle)
    expect(await h.events('SentenceExplanationRevealed')).toHaveLength(2); // clause structure + sentence
    const noted = (await h.events('NoteOpened')) as NoteOpened[];
    expect(noted.map((e) => e.noteId).sort()).toEqual([ids.note(TH, 'clause'), ids.note(TH, 'cultural')].sort());
    expect(await h.events('EnglishRescueRevealed')).toHaveLength(1);
    expect(await h.events('DecodingRevealed')).toHaveLength(1);
    expect(h.learn.itemHistory).toHaveBeenCalledWith('u1', ids.form('th', 'นะ'));
  });

  it('skips layers the word has nothing for, and always ends at English', async () => {
    await seedThaiText(h.store);
    wire(profile({ layers: ['gloss', 'phrase', 'grammar', 'definition', 'note', 'decoding', 'english'], englishRescue: 'easy' }));
    await reader();
    await click(tokenButton('ตลาด')); // no analysis at all
    expect(await climb()).toEqual(['Show how it is read', 'Show English']);
  });

  it('adds English when a profile forgot it', async () => {
    await seedThaiText(h.store);
    wire(profile({ layers: ['gloss', 'phrase'], englishRescue: 'easy' }));
    await reader();
    await click(tokenButton('ตลาด'));
    expect(await climb()).toEqual(['Show English']);
    expect(byLabel(mounted!.container, 'English').textContent).toContain('Mother goes to the market.');
  });

  it('shows the variety of a word under its gloss, the role, the dictionary label and the other meanings', async () => {
    await seedThaiText(h.store);
    await patchAnalysis(h.store, S1, 3, { register: ['regional-isan'], role: 'softening particle', analyzer: 'dict:wiktionary', notes: { senses: ['also: a calling-out sound', 'also: a short pause'] } });
    await patchAnalysis(h.store, S1, 0, { register: ['royal'] });
    await patchAnalysis(h.store, S1, 1, { register: ['archaic', 'literary'] });
    await patchAnalysis(h.store, S1, 2, { register: ['standard'] });
    wire(full);
    await reader();
    await click(tokenButton('นะ'));
    const gloss = byLabel(mounted!.container, 'Gloss');
    expect(q(gloss, '[data-testid="variety"]')!.textContent).toBe('Isan regional word — not ordinary Central Thai');
    expect(q(gloss, '[data-testid="dictionary-gloss"]')!.textContent).toBe('dictionary meaning, not checked for this sentence');
    expect(q(gloss, '[data-testid="word-role"]')!.textContent).toBe('softening particle');
    expect(mounted!.container.textContent).not.toContain('also: a short pause'); // behind "Other meanings"
    await click(button(gloss, 'Other meanings'));
    expect(byLabel(gloss, 'Other meanings').textContent).toContain('also: a short pause');
    await click(tokenButton('เขา'));
    expect(q(mounted!.container, '[data-testid="variety"]')!.textContent).toBe('Royal vocabulary');
    await click(tokenButton('กิน'));
    expect(q(mounted!.container, '[data-testid="variety"]')!.textContent).toBe('Older literary word');
    await click(tokenButton('ข้าว'));
    expect(q(mounted!.container, '[data-testid="variety"]')).toBeNull(); // standard says nothing
  });
});

// ───────────────────────────── notes ─────────────────────────────

describe('notes in the text', () => {
  const noted = profile({ layers: ['gloss', 'note', 'clause-structure', 'english'], englishRescue: 'secondary' });

  it('puts one reachable mark at the end of a sentence with a visible note, and opens the sheet on the note', async () => {
    await seedThaiText(h.store);
    await h.store.notes.put(note('cultural', { body: 'Rice is the centre of a Thai meal.', topics: ['food', 'daily life'] }));
    await h.store.notes.put(note('machine', { body: 'A machine draft nobody has read.', provenance: 'machine', reviewStatus: 'unreviewed' }));
    await h.store.notes.put(note('rejected', { body: 'A rejected note.', reviewStatus: 'rejected' }));
    await h.store.notes.put(note('other-sentence', { sentenceId: S0, body: 'Only a machine draft here.', provenance: 'machine', reviewStatus: 'unreviewed' }));
    wire(noted);
    await reader();
    expect(qa(mounted!.container, 'button[aria-label^="Note on sentence"]').map((b) => b.getAttribute('aria-label'))).toEqual(['Note on sentence 2']);
    expect(await h.events('NoteOpened')).toHaveLength(0);

    await click(button(mounted!.container, 'Note on sentence 2'));
    const sheet = byLabel(mounted!.container, 'Notes for sentence 2');
    expect(sheet.textContent).toContain('Cultural note');
    expect(sheet.textContent).toContain('Rice is the centre of a Thai meal.');
    expect(sheet.textContent).toContain('food');
    expect(sheet.textContent).not.toContain('machine draft');
    expect(sheet.textContent).not.toContain('rejected');
    const events = (await h.events('NoteOpened')) as NoteOpened[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ textId: TH, noteId: ids.note(TH, 'cultural'), sentenceId: S1, kind: 'cultural', surface: 'corpus' });
    expect(await h.events('SentenceExplanationRevealed')).toHaveLength(0); // a cultural note is context, not an explanation
    expect(await h.events('TokenHelpOpened')).toHaveLength(0);
  });

  it('shows unreviewed machine notes only in preview mode, labelled as drafts', async () => {
    await seedThaiText(h.store);
    await h.store.notes.put(note('machine', { sentenceId: S0, body: 'A machine draft nobody has read.', provenance: 'machine', reviewStatus: 'unreviewed' }));
    wire(noted);
    setPref('preview', true);
    await reader();
    await click(button(mounted!.container, 'Note on sentence 1'));
    const sheet = byLabel(mounted!.container, 'Notes for sentence 1');
    expect(sheet.textContent).toContain('A machine draft nobody has read.');
    expect(sheet.textContent).toContain('machine draft, not reviewed');
  });

  it('the note layer of a word sheet shows the sentence\'s notes (and nothing when there are none)', async () => {
    await seedThaiText(h.store);
    await h.store.notes.put(note('cultural', { body: 'Rice is the centre of a Thai meal.' }));
    wire(noted);
    await reader();
    await click(tokenButton('ข้าว'));
    await click(button(mounted!.container, 'Show notes'));
    expect(byLabel(mounted!.container, 'Notes').textContent).toContain('Rice is the centre of a Thai meal.');
    await click(tokenButton('แม่')); // sentence 1 has no note: the layer is skipped
    expect(qa(mounted!.container, '.card__actions button').map((b) => b.textContent)).toEqual(['Show English']);
  });

  it('a clause-structure note underlines labelled spans over the sentence and never rewrites it', async () => {
    await seedThaiText(h.store);
    const sentence = (await h.store.sentences.get(S1))!;
    await h.store.notes.put(note('clause', {
      kind: 'clause-structure', body: 'Subject, then the verb phrase.',
      spans: [{ start: 0, end: 3, label: 'subject' }, { start: 3, end: sentence.text.length, label: 'predicate' }],
    }));
    wire(noted);
    await reader();
    await click(button(mounted!.container, 'Note on sentence 2'));
    const clause = q(mounted!.container, '[data-testid="clause-text"]')!;
    expect(clause.textContent).toBe(sentence.text); // byte-identical
    expect(qa(clause, '.clause__span').map((s) => [s.textContent, s.getAttribute('data-label')])).toEqual([
      ['เขา', 'subject'], [sentence.text.slice(3), 'predicate'],
    ]);
    expect(byLabel(mounted!.container, 'Parts of this sentence').textContent).toContain('predicate');
    // the text in the reader itself is untouched
    expect(qa(mounted!.container, '.sent-text').map((e) => e.textContent)).toEqual((await h.store.sentences.where('textId', TH)).sort((a, b) => a.index - b.index).map((s) => s.text));
    expect(await h.events('NoteOpened')).toHaveLength(1);
    expect(await h.events('SentenceExplanationRevealed')).toHaveLength(1);
  });

  it('ignores spans that do not fit the sentence instead of repairing them', async () => {
    await seedThaiText(h.store);
    const sentence = (await h.store.sentences.get(S1))!;
    await h.store.notes.put(note('clause', {
      kind: 'clause-structure', body: 'Bad spans.',
      spans: [{ start: 0, end: 3, label: 'subject' }, { start: 2, end: 6, label: 'overlap' }, { start: 4, end: 999, label: 'too long' }],
    }));
    wire(noted);
    await reader();
    await click(button(mounted!.container, 'Note on sentence 2'));
    const clause = q(mounted!.container, '[data-testid="clause-text"]')!;
    expect(clause.textContent).toBe(sentence.text);
    expect(qa(clause, '.clause__span').map((s) => s.getAttribute('data-label'))).toEqual(['subject']);
  });

  it('no marks at a stage without notes', async () => {
    await seedThaiText(h.store);
    await h.store.notes.put(note('cultural', {}));
    wire(profile({ layers: ['gloss', 'phrase', 'english'] }));
    await reader();
    expect(qa(mounted!.container, 'button[aria-label^="Note on sentence"]')).toHaveLength(0);
  });
});

// ───────────────────────────── chrome and English by stage ─────────────────────────────

describe('chrome and English by profile', () => {
  const grade9 = profile({
    visibility: 'invisible', defaultHighlight: 'off', chrome: 'minimal', englishRescue: 'on-request', romanization: 'never',
    layers: ['gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'],
  });

  it('minimal: the text, its title and one quiet menu; English is still reachable', async () => {
    await seedThaiText(h.store);
    wire(grade9);
    await reader();
    const c = mounted!.container;
    expect(q(c, 'h1.reader__chapter')!.textContent).toBe('ตลาดวันนี้');
    expect(qa(c, '.sent-text').length).toBe(2);
    expect(q(c, 'select[aria-label="Highlighting"]')).toBeNull();
    expect(q(c, '.coverage')).toBeNull();
    expect(q(c, '.reading-details')).toBeNull();
    expect(q(c, '.reader__crumb')).toBeNull();
    expect(q(c, '.reader__progress')).toBeNull();
    expect(q(c, '.reader__meta')).toBeNull();
    expect(qa(c, 'button[aria-label^="Show English for sentence"]')).toHaveLength(0);
    expect(q(c, 'article.reader')!.getAttribute('data-highlight')).toBe('off');

    // the menu holds the rest
    await click(button(c, 'Reading menu'));
    expect(q(c, 'select[aria-label="Highlighting"]')).not.toBeNull();
    expect(button(c, 'Reading details')).toBeTruthy();
    await click(button(c, 'English buttons'));
    expect(qa(c, 'button[aria-label^="Show English for sentence"]')).toHaveLength(2);
    await click(button(c, 'Show English for sentence 1'));
    expect(c.textContent).toContain('Mother goes to the market.');
    await click(button(c, 'English buttons'));
    expect(qa(c, 'button[aria-label^="Show English for sentence"]')).toHaveLength(0);

    // and the word sheet ends at English, last
    await click(tokenButton('แม่'));
    const labels = await climb();
    expect(labels.at(-1)).toBe('Show English');
    expect(labels).not.toContain('Show notes'); // no notes here: skipped
    expect(byLabel(c, 'English').textContent).toContain('Mother goes to the market.');
    expect(await h.events('EnglishRescueRevealed')).not.toHaveLength(0);
  });

  it('reduced: progress and coverage collapse into one "Reading details" disclosure', async () => {
    await seedThaiText(h.store);
    wire(profile({ chrome: 'reduced', englishRescue: 'secondary' }));
    await reader();
    const c = mounted!.container;
    expect(q(c, '.coverage')).toBeNull();
    const toggle = button(c, 'Reading details');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(q(c, 'select[aria-label="Highlighting"]')).not.toBeNull(); // the tools stay
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(q(c, '.coverage')).not.toBeNull();
    expect(q(c, '[data-testid="reading-progress"]')!.textContent).toContain('Seen 0 of 2 sentences');
  });

  it('full: progress as today, English buttons beside each sentence', async () => {
    await seedThaiText(h.store);
    wire(profile({ chrome: 'full' }));
    await reader();
    expect(q(mounted!.container, '.coverage')).not.toBeNull();
    expect(qa(mounted!.container, 'button[aria-label^="Show English for sentence"]')).toHaveLength(2);
  });

  it('the stage\'s highlighting is only a default: the learner\'s own choice wins and is kept', async () => {
    await seedThaiText(h.store);
    wire(profile({ defaultHighlight: 'off', chrome: 'full' }));
    await reader();
    const root = q(mounted!.container, 'article.reader')!;
    expect(root.getAttribute('data-highlight')).toBe('off');
    await choose(byLabel<HTMLSelectElement>(mounted!.container, 'Highlighting'), 'strong');
    expect(root.getAttribute('data-highlight')).toBe('strong');
    await mounted!.unmount();
    await reader();
    expect(q(mounted!.container, 'article.reader')!.getAttribute('data-highlight')).toBe('strong');
  });
});

// ───────────────────────────── difficulty preview ─────────────────────────────

describe('difficulty preview', () => {
  const forecast: DifficultyForecast = {
    textId: STORY_ID, userId: 'u1',
    coverage: {} as DifficultyForecast['coverage'], predictedCoverage: 0.947,
    newUsefulWords: [{ itemId: 'form:es:creo', itemKind: 'form', surface: 'creo', count: 3, gloss: 'believe' }],
    rareWords: [{ itemId: 'form:es:pecado', itemKind: 'form', surface: 'pecado', count: 1 }],
    weakPhrases: [{ itemId: 'phrase:es:creer-en', itemKind: 'phrase', surface: 'creer en …', count: 1 }],
    newConstructions: [{ itemId: 'pattern:es:present', itemKind: 'pattern', surface: 'Present tense', count: 2 }],
    properNouns: [{ itemId: 'form:es:dios', itemKind: 'form', surface: 'Dios', count: 2 }],
    varieties: { 'regional-isan': 2 }, unanalysedWords: 1,
    limits: ['There is no frequency data, so "likely to come back" only counts repeats inside this text.', 'Words with no analysis are not forecast.'],
    summary: 'About 95 % of the words are shown or likely familiar. Four words are new.',
  };

  it('is collapsed, opens on request, shows the summary, the lists and the limits verbatim, and emits nothing', async () => {
    await seedStory(h.store);
    wire(DEFAULT_ASSISTANCE);
    const predictDifficulty = vi.fn(async () => forecast);
    Object.assign(h.learn, { predictDifficulty });
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: `/read/${encodeURIComponent(STORY_ID)}` });
    const c = mounted.container;
    const toggle = button(c, 'Preview difficulty');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(predictDifficulty).not.toHaveBeenCalled();
    expect(q(c, '[data-testid="difficulty-body"]')).toBeNull();

    const before = await h.events();
    expect(before.map((e) => e.type)).toEqual(['TextViewed']); // the reader's own, mode open, from mounting
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(predictDifficulty).toHaveBeenCalledWith('u1', STORY_ID);
    expect(q(c, '[data-testid="difficulty-summary"]')!.textContent).toBe(forecast.summary);
    for (const key of ['newUsefulWords', 'rareWords', 'weakPhrases', 'newConstructions', 'properNouns']) expect(q(c, `[data-testid="difficulty-${key}"]`)).not.toBeNull();
    expect(q(c, '[data-testid="difficulty-newUsefulWords"]')!.textContent).toContain('creo');
    expect(q(c, '[data-testid="difficulty-varieties"]')!.textContent).toContain('regional-isan');
    expect(qa(q(c, '[data-testid="difficulty-limits"]')!, 'li').map((li) => li.textContent)).toEqual(forecast.limits);
    expect(c.textContent).not.toContain('Predicted coverage'); // said once, in the summary
    expect(c.textContent?.match(/95/g)).toHaveLength(1);

    // opening it (and closing it) recorded nothing: no second TextViewed, no exposure, no help
    await click(toggle);
    expect(await h.events()).toHaveLength(before.length);
    expect((await h.events()).some((e) => e.type === 'SentenceViewed' || (e.type === 'TextViewed' && e.mode !== 'open'))).toBe(false);
  });

  it('is not offered when the engine cannot forecast', async () => {
    await seedStory(h.store);
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: `/read/${encodeURIComponent(STORY_ID)}` });
    expect(qa(mounted.container, 'button').some((b) => /Preview difficulty/.test(b.textContent ?? ''))).toBe(false);
  });
});
