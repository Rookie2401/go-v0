// @vitest-environment jsdom
/**
 * Korean on the GoLearn card, through the REAL `parseSelection`, the REAL card UI and the REAL enrich/dictionary path (brief XV, XVI, XX; the
 * linguistic auditor's shared faults, docs/korean/PLAN.md "Identities" and "Confidence and honesty"):
 *   A. the card picks the adapter's first reading, for every token of a varied set; the readings are ordered by their confidence
 *   B. the headline never shows a homonym number; a numbered reading shows "entry N" beside the meaning; the dictionary answers a numbered lemma with
 *      that entry alone and an undecided one with every candidate
 *   C. the card before the lexicon shards load and after: the same for the words the compiled core holds; honest for a word only a shard holds; the
 *      analysis cache does not serve the pre-load reading after the shard arrives
 *   D. the English on the card
 *   E. performance guards on the real modules: lazy analyser, shards fetched once, a bounded cache, a poisoned token
 * Homonym numbers are read from the lexicon at run time, never written here.
 *
 * WOULD SKIP on a machine without the built data (public/lexicon/ko, public/dict/ko): blocks C (shards), B's dictionary part and E's shard counts.
 * A fault of the PRODUCT is `it.fails` with the place in the comment above it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzedToken, LanguageAdapter } from '../../src/core';
import { koAdapter } from '../../src/adapters/ko';
import { koClearAnalysisCache } from '../../src/adapters/korean/analyze';
import { hasKoreanStem, uninstallKoreanLexicon } from '../../src/adapters/korean/index-store';
import { createKoreanShardLoader } from '../../src/adapters/korean/shards';
import { KO_VALIDATION } from '../../packages/language-packs/src/packs/ko';
import { createPackRuntime, koreanManifest } from '../../packages/language-packs/src';
import { lemmaHomonymNumber, lemmaLookupKeys } from '../../packages/repository-contract/src/lemma-display';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { clearAnalysers, getAnalyser, hasAnalyser, parseSelection, registerAnalyser, type CardModel } from '../../packages/golearn-extension/src/parser';
import { pickRecord, type LexicalRecord } from '../../packages/golearn-extension/src/content/enrich';
import { createLexiconPreparer } from '../../packages/golearn-extension/src/lexicon/prepare';
import { ActiveMode } from '../../packages/golearn-extension/src/content/active';
import type { HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { BASE, diskFetch } from '../language-packs/helpers';
import { registerAllAnalysers } from '../support/analysers';
import { DICT_PRESENT, SHARDS_PRESENT, SNOW, diskShardSource } from '../support/korean/lexicon';
import { flush, makeRig, setBody, stubLayout, type Rig } from './dom';

const anchor: PopupAnchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' };
const SUPERSCRIPT = /[⁰¹²³⁴-⁹]/u;

/** The card for one word of a sentence, as the extension builds it. */
function cardIn(sentence: string, surface: string, occurrence = 0): CardModel {
  let at = -1;
  for (let i = 0; i <= occurrence; i++) at = sentence.indexOf(surface, at + 1);
  if (at < 0) throw new Error(`${surface} is not in ${sentence}`);
  return parseSelection({ surface, languageId: 'ko', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + surface.length } });
}
const SENTENCES: string[] = [
  ...new Set([
    ...KO_VALIDATION.map((v) => v.sentence).filter((s): s is string => !!s),
    '학생이 세 명 있어요.', '눈이 와요.', '눈이 예뻐요.', '시간이 없어요.', '學校에서 공부해요.', '선생님이 책을 읽으셨습니다.', '예산안을 발표했습니다.',
    '저는 밥을 먹었습니다.', '학교에서 친구에게만 말했어요.', '밥을 먹고 싶어요.',
  ]),
];
const wordsOf = (sentence: string): string[] => koAdapter.tokenize(sentence).filter((t) => t.isWord).map((t) => t.surface);
const ALL_WORDS: Array<[string, string]> = SENTENCES.flatMap((s) => wordsOf(s).map((w): [string, string] => [s, w]));

let restore: () => void;
beforeEach(() => { restore = stubLayout(); });
afterEach(() => { restore(); });
beforeAll(() => { registerAllAnalysers(); uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache(); });
afterAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache(); });

async function loadShardsFor(sentences: string[]): Promise<void> {
  const loader = await createKoreanShardLoader(diskShardSource, { base: 'lexicon/ko/standard' });
  const r = await loader.ensure(sentences.flatMap((s) => koAdapter.tokenize(s).filter((t) => t.isWord).map((t) => t.normalized)));
  expect(r.failed).toEqual([]);
}

// ═════════════════════════ A. the first reading is the picked reading ═════════════════════════
describe('A. the card picks the adapter\'s first reading (parser/index.ts pick(): the highest confidence, ties to the first)', () => {
  const check = (): { n: number; wrongPick: string[]; unordered: string[] } => {
    const wrongPick: string[] = []; const unordered: string[] = []; let n = 0;
    for (const [s, w] of ALL_WORDS) {
      const tokens = koAdapter.tokenize(s);
      const an = koAdapter.analyze(tokens);
      const i = tokens.findIndex((t) => t.isWord && t.surface === w);
      const cs = an[i].candidates;
      const card = cardIn(s, w);
      n++;
      const first = cs[0];
      if (card.lemma !== first.lemma || card.pos !== first.pos || Math.abs(card.confidence - first.confidence) > 1e-9) wrongPick.push(`${w} in ${s}: card ${card.lemma}:${card.pos}@${card.confidence}, first ${first.lemma}:${first.pos}@${first.confidence}`);
      for (let k = 1; k < cs.length; k++) if (cs[k].confidence > cs[k - 1].confidence + 1e-9) { unordered.push(`${w} in ${s}: ${cs.map((c) => `${c.lemma}@${c.confidence}`).join(' > ')}`); break; }
    }
    return { n, wrongPick, unordered };
  };

  it('for every word of ~25 varied sentences (verbs, nouns with particles, homonyms, counters, Hanja, the unconfirmed), with the compiled core alone', () => {
    const r = check();
    expect(r.n).toBeGreaterThanOrEqual(60);
    expect(r.wrongPick).toEqual([]);
    expect(r.unordered, 'the adapter lists its readings by falling confidence').toEqual([]);
  });

  it.skipIf(!SHARDS_PRESENT)('and with the stem lexicon\'s shards loaded', async () => {
    await loadShardsFor(SENTENCES);
    const r = check();
    expect(r.wrongPick).toEqual([]);
    expect(r.unordered).toEqual([]);
    uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
  });
});

// ═════════════════════════ B. homonyms on the card ═════════════════════════
describe('B. a homonym on the card', () => {
  let ui: CardUI;
  beforeEach(() => { setBody('<p>한국어</p>'); ui = createCardUI({ doc: document, speech: null, onDismiss: () => undefined }); });
  afterEach(() => ui.destroy());
  const cardText = (): string => { const c = (ui.root()!.querySelector('.card') as HTMLElement).cloneNode(true) as HTMLElement; c.querySelectorAll('style').forEach((e) => e.remove()); return c.textContent ?? ''; };

  it('눈이 와요 (cue): the card is the numbered entry for snow; the headline is 눈 with no number; "entry N" is beside the meaning', () => {
    const snow = SNOW();
    const card = cardIn('눈이 와요.', '눈이');
    expect(card.lemma).toBe(snow);
    const n = lemmaHomonymNumber('ko', snow);
    ui.show(card, anchor);
    const line = ui.root()!.querySelector('.lemmaLine')!;
    expect(line.querySelector('.lv')!.textContent).toContain('눈');
    expect(line.querySelector('.lv')!.textContent).not.toMatch(SUPERSCRIPT);
    if (n !== undefined) expect(line.querySelector('[data-row="homonym"]')!.textContent).toBe(`entry ${n}`);
    else expect(line.querySelector('[data-row="homonym"]')).toBeNull();
    expect(cardText()).toMatch(/snow/);
  });

  // FAULT (the Analysis panel shows the number): the "Units and parts" line reads "눈: from 눈², stem" (parser/index.ts, `syntaxNotes` from `c.parts[].lemma` as the
  // analyser wrote it: the numbered lemma string) and the panel's "Other possible readings" lists 눈¹ (NOUN; Case=Nom, …) with the raised number and no meaning.
  // The number is identity, never spelling (repository-contract lemma-display.ts displayLemma); popup/card.ts shows the headline through it and these two lines not.
  it.fails('눈이 와요: no part of the card, the Analysis panel included, shows a raised number', () => {
    ui.show(cardIn('눈이 와요.', '눈이'), anchor);
    (ui.root()!.querySelector('.deeperBtn') as HTMLElement | null)?.click();
    expect(cardText()).not.toMatch(SUPERSCRIPT);
  });

  // FAULT (the same leak on the undecided card): the Analysis panel's "Other possible readings: 눈¹ (NOUN; Case=Nom, Particle=subject); 눈² …" lists the numbered lemma
  // strings as written, with no meaning to tell them apart (popup/card.ts, from `card.alternatives`).
  it.fails('눈이 예뻐요 (no cue): the undecided card names every candidate meaning, and no part of it, the Analysis panel included, shows a raised number', () => {
    const card = cardIn('눈이 예뻐요.', '눈이');
    expect(card.lemma, 'undecided: the bare lemma').toBe('눈');
    ui.show(card, anchor);
    (ui.root()!.querySelector('.deeperBtn') as HTMLElement | null)?.click();
    const text = cardText();
    expect(text).toMatch(/eye/);
    expect(text).toMatch(/snow/);
    expect(text).not.toMatch(SUPERSCRIPT);
  });

  it('눈이 예뻐요 (no cue): the headline is the bare headword, no "entry N", and both candidate meanings are on the card', () => {
    const card = cardIn('눈이 예뻐요.', '눈이');
    ui.show(card, anchor);
    const line = ui.root()!.querySelector('.lemmaLine')!;
    expect(line.querySelector('.lv')!.textContent).toContain('눈');
    expect(line.querySelector('.lv')!.textContent).not.toMatch(SUPERSCRIPT);
    expect(line.querySelector('[data-row="homonym"]')).toBeNull();
    const text = cardText();
    expect(text).toMatch(/eye/);
    expect(text).toMatch(/snow/);
  });

  it('시간이 (a main-set word): the bare lemma, no "entry N"', () => {
    const card = cardIn('시간이 없어요.', '시간이');
    ui.show(card, anchor);
    expect(card.lemma).toBe('시간');
    expect(ui.root()!.querySelector('[data-row="homonym"]')).toBeNull();
    expect(cardText()).not.toMatch(SUPERSCRIPT);
  });

  describe.skipIf(!DICT_PRESENT)('the dictionary (public/dict/ko, through the real pack runtime)', () => {
    const runtime = () => createPackRuntime(koreanManifest(), { fetch: diskFetch(), baseUrl: BASE } as never);
    it('a numbered lemma is answered with that entry alone, in the gloss and in the full record the card builds its tables from', async () => {
      const snow = SNOW();
      if (!SUPERSCRIPT.test(snow)) return;
      const rt = runtime();
      const gloss = await rt.gloss(snow, 'NOUN', [snow]);
      expect(gloss?.senses.map((s) => s.gloss)).toEqual(['snow']);
      const entry = await rt.entry(snow, 'NOUN', [snow]);
      expect(entry?.records).toHaveLength(1);
      const record = pickRecord(entry!.records as unknown as LexicalRecord[], 'NOUN') as unknown as { s: Array<{ g: string }>; e?: number };
      expect(record.s.map((x) => x.g)).toEqual(['snow']);
      expect(record.e).toBe(lemmaHomonymNumber('ko', snow));
    });

    it('the bare (undecided) lemma is answered with every entry: the gloss names each meaning and labels its entry', async () => {
      const gloss = await runtime().gloss('눈', 'NOUN', ['눈']);
      const text = (gloss?.senses ?? []).map((s) => s.gloss).join(' | ');
      expect(text).toMatch(/eye/);
      expect(text).toMatch(/snow/);
      expect(text).toMatch(/entry 1/);
      expect(text).toMatch(/entry 2/);
    });

    // FAULT (the full entry of an undecided word): packages/golearn-extension/src/content/enrich.ts:72 pickRecord(records, pos) takes the FIRST record of the
    // part of speech. For the bare 눈 the dictionary answers four records (eye, snow, scale, bud); the card's "full entry" sections (pronunciation, etymology,
    // the form table, the structure) are then entry 1's, presented as the word's own. It cannot tell a homonym number, and an undecided reading has none
    // to give (the auditor's shared fault 2; controller.ts:557 and the same call in GoReview's paradigm-table.ts).
    it.fails('an undecided word does not get one entry\'s record presented as its own', async () => {
      const entry = await runtime().entry('눈', 'NOUN', ['눈']);
      const records = entry!.records as unknown as LexicalRecord[];
      expect(records.length).toBeGreaterThan(1);
      expect(pickRecord(records, 'NOUN'), 'with four entries and no number, no single record may be chosen').toBeUndefined();
    });
  });
});

// ═════════════════════════ C. before and after the shards ═════════════════════════
describe.skipIf(!SHARDS_PRESENT)('C. the card before the stem lexicon\'s shards load, and after', () => {
  // the words the compiled core holds: 40 of the page's words whose stem is in the core
  const CORE_WORDS = (): Array<[string, string]> => ALL_WORDS.filter(([s, w]) => { const c = cardIn(s, w); return !c.unconfirmed && c.confidence >= 0.5; }).slice(0, 80);
  type Shown = { lemma?: string; pos?: string; gloss?: string; confidence: number; pron: string; morphology?: string; unconfirmed: boolean };
  const shown = (c: CardModel): Shown => ({ lemma: c.lemma, pos: c.pos, gloss: c.gloss, confidence: c.confidence, pron: c.pronunciation.join('|'), morphology: c.morphology, unconfirmed: c.unconfirmed });

  it('the words the core holds read the same after the shards load: lemma, class, pronunciation, form line (the gloss and the confidence are checked on their own below)', async () => {
    uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
    const words = CORE_WORDS();
    expect(words.length).toBeGreaterThanOrEqual(40);
    const before = words.map(([s, w]) => shown(cardIn(s, w)));
    await loadShardsFor(SENTENCES);
    const after = words.map(([s, w]) => shown(cardIn(s, w)));
    const differ: string[] = [];
    words.forEach(([s, w], i) => {
      const a = before[i]; const b = after[i];
      if (a.lemma !== b.lemma || a.pos !== b.pos || a.pron !== b.pron || a.morphology !== b.morphology) differ.push(`${w} in ${s}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    });
    expect(differ).toEqual([]);
  });

  // FAULT (a core word's meaning changes when shards load): 발표했습니다 reads "announcement; presentation (+ 하다: to do)" with the core alone and "to give a presentation"
  // once the shards are in: the compiled core (src/adapters/korean/generated/core.ts) and the shard rows (scripts/ko-build-lexicon.mts) carry different first glosses for
  // the same entry, so the card's meaning depends on what has loaded. (Both are uncommitted work of other sessions today; they may only be out of step until the build is re-run.)
  it.fails('the meaning of a core word is the same before and after the shards load', async () => {
    uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
    const words = CORE_WORDS();
    const before = words.map(([s, w]) => cardIn(s, w).gloss);
    await loadShardsFor(SENTENCES);
    expect(words.map(([s, w]) => cardIn(s, w).gloss)).toEqual(before);
  });

  // FAULT (a reading's confidence moves when shards load): src/adapters/korean/analyze.ts. A word the core holds in full is read at one confidence with the
  // core alone and a LOWER one once the shards are in, because the shards add other readings within the 0.15 band (저는 0.88 -> 0.84; 와요 0.92 -> 0.84;
  // 學校에서 0.92 -> 0.84 with a second reading 학괴 "Chungcheong" at 0.83). The first reading and its meaning are unchanged; the number the card shows and the
  // underline's certainty are not. (Seen in the probe of 2026-11-25 against uncommitted work of other sessions; they may settle it.)
  it.fails('the confidence of a core word is the same before and after the shards load', async () => {
    uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
    const words = CORE_WORDS();
    const before = words.map(([s, w]) => cardIn(s, w).confidence);
    await loadShardsFor(SENTENCES);
    const after = words.map(([s, w]) => cardIn(s, w).confidence);
    expect(after).toEqual(before);
  });

  /** A word whose stem only a shard holds (read from the installed lexicons, never assumed). */
  const SHARD_ONLY = ['신호등', '박물관', '도서관', '대통령', '환경', '병원', '약국', '공항', '시장', '은행', '우체국', '미술관', '체육관', '식당'];
  async function shardOnlyWord(): Promise<{ stem: string; sentence: string; surface: string }> {
    uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
    const loader = await createKoreanShardLoader(diskShardSource, { base: 'lexicon/ko/standard' });
    for (const stem of SHARD_ONLY) {
      if (hasKoreanStem(stem)) continue; // the core holds it
      await loader.ensure([stem]);
      if (!hasKoreanStem(stem)) continue; // no such headword at all
      uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
      return { stem, sentence: `${stem}에서 공부해요.`, surface: `${stem}에서` };
    }
    throw new Error('no probe word is held by a shard only: widen SHARD_ONLY');
  }

  it('a word only a shard holds: before, the card is honestly unconfirmed (no gloss, low confidence, nothing credited); after, it is the full reading; the analysis cache is not stale', async () => {
    const { stem, sentence, surface } = await shardOnlyWord();
    expect(hasKoreanStem(stem)).toBe(false);
    const before = cardIn(sentence, surface);
    expect(before.unconfirmed, 'honestly unconfirmed').toBe(true);
    expect(before.gloss).toBeUndefined();
    expect(before.confidence).toBeLessThanOrEqual(0.45);
    expect(before.itemIds, 'nothing is credited to a lemma on an unconfirmed reading').toEqual([`form:ko:${surface}`]);
    // what the card tells the learner about it: the shared parser's sentence, which says "not in the word list"
    expect(before.notes.join(' ')).toMatch(/Not in the word list/);
    await loadShardsFor([sentence]);
    const after = cardIn(sentence, surface);   // the same analysis cache key: the lexicon generation changed, so the stale reading is not served
    expect(after.unconfirmed).toBe(false);
    expect(after.lemma).toBe(stem);
    expect(after.gloss, 'the meaning arrives').toBeTruthy();
    expect(after.confidence).toBeGreaterThanOrEqual(0.8);
    expect(after.itemIds).toEqual([`lemma:ko:${stem}:NOUN`]);
    // and back: removing the shard makes the next reading unconfirmed again (the cache follows the lexicon in both directions)
    uninstallKoreanLexicon('kaikki-ko-lexicon');
    expect(cardIn(sentence, surface).unconfirmed).toBe(true);
  });

  // FAULT (what a card says when the lexicon could not be loaded): packages/golearn-extension/src/lexicon/prepare.ts remembers a failed set (`unavailable()`),
  // and nothing on the card says so for Korean. The card reads with the compiled core alone, and a word that only a shard holds shows the shared sentence
  // "Not in the word list: the lemma is a guess from the ending and no meaning is given" (parser/index.ts:217), which is false of Korean: the word IS in
  // the lexicon, it has not been loaded. (The auditor's shared fault 7: what a card shows before the model is ready.)
  it.fails('when the stem lexicon cannot be loaded, the card says it is not loaded rather than that the word is not in the word list', async () => {
    const { sentence, surface } = await shardOnlyWord();
    const dead = (async () => new Response('gone', { status: 503 })) as typeof fetch;
    const preparer = createLexiconPreparer({ runtime: { getURL: (p: string) => `http://assets.local/${p}` } } as never, dead, 'http://assets.local/');
    const r = await preparer.prepare('ko', sentence);
    expect(preparer.unavailable()).toEqual(['ko/standard']);
    expect(r.failed.length).toBeGreaterThan(0);
    const card = cardIn(sentence, surface);
    expect(card.unconfirmed).toBe(true);
    expect(card.notes.join(' ') + card.limits.join(' '), 'the card names the cause').toMatch(/not (been )?loaded|still loading|could not be loaded/i);
    expect(card.notes.join(' ')).not.toMatch(/Not in the word list/);
  });
});

// ═════════════════════════ D. English on the card ═════════════════════════
describe('D. the English on the card', () => {
  const TOKENS: Array<[string, string]> = ALL_WORDS;
  const lines = (c: CardModel): string[] => {
    const w = c.wordAnalysis;
    return [c.gloss, w?.lexicalMeaning?.text, w?.inflectedMeaning?.text, w?.contextualMeaning?.text].filter((x): x is string => !!x);
  };

  it('no meaning line has an English subject pronoun it cannot know ("he, she, or it"), and a past or adnominal form is not glossed with an -ing word', () => {
    const bad: string[] = [];
    for (const [s, w] of TOKENS) {
      const c = cardIn(s, w);
      const feats = Object.fromEntries(c.features.map((f) => [f.key, f.value]));
      const pastOrAdnominal = feats.Tense === 'Past' || feats.VerbForm === 'Adn';
      for (const line of lines(c)) {
        if (/he, she,? or it/i.test(line)) bad.push(`${w}: "${line}"`);
        // the dictionary's own gloss may contain "-ing" inside a description; the form's English line must not, for a past or adnominal form
        if (pastOrAdnominal && c.wordAnalysis?.inflectedMeaning?.text === line && /\b\w+ing\b/.test(line)) bad.push(`${w} (past/adnominal): "${line}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('a descriptive verb\'s meaning reads "to be …"', () => {
    const adjectives = TOKENS.map(([s, w]) => cardIn(s, w)).filter((c) => c.pos === 'ADJ' && c.features.some((f) => f.key === 'VerbType' && f.value === 'Descriptive'));
    expect(adjectives.length).toBeGreaterThanOrEqual(4);
    for (const c of adjectives) expect(c.gloss, `${c.surface} -> ${c.lemma}`).toMatch(/^to be /);
  });
});

// ═════════════════════════ identity at the parser: what a selection credits, and that nothing normalises the number away ═════════════════════════
describe('identity: one lemma unit for every form of a word, a threshold for crediting, no compatibility normalisation', () => {
  const LEMMA = 'lemma:ko:먹다:VERB';
  it('먹어요, 먹었습니다, 먹으면, 먹는 credit ONE lemma unit; their grammar is in four different morph units, and each has its own form unit', () => {
    const cards = [['밥을 먹어요.', '먹어요'], ['저는 밥을 먹었습니다.', '먹었습니다'], ['밥을 먹으면 좋아요.', '먹으면'], ['먹는 사람', '먹는']].map(([s, w]) => cardIn(s, w));
    for (const c of cards) expect(c.itemIds, c.surface).toEqual([LEMMA]);
    const morphs = cards.map((c) => c.unitIds.find((u) => u.startsWith('morph:ko:VERB:')));
    expect(morphs.every(Boolean)).toBe(true);
    expect(new Set(morphs).size, 'each ending is its own grammatical unit').toBe(4);
    expect(new Set(cards.map((c) => c.formId)).size).toBe(4);
    for (const c of cards) expect(c.unitIds).toContain(LEMMA);
  });

  it('a reading is credited to a lemma only at LEMMA_MIN_CONFIDENCE (0.5) and above, and never when unconfirmed: below it the form is credited', () => {
    const real = getAnalyser('ko')!;
    const withConfidence = (confidence: number, unconfirmed?: boolean): LanguageAdapter => new Proxy(real, {
      get(t, p, r) {
        if (p === 'analyze') return (tokens: Parameters<LanguageAdapter['analyze']>[0], o?: Parameters<LanguageAdapter['analyze']>[1]): AnalyzedToken[] =>
          t.analyze(tokens, o).map((a) => ({ ...a, candidates: a.candidates.map((c, i) => (i === 0 ? { ...c, confidence, ...(unconfirmed ? { unconfirmed: true } : {}) } : { ...c, confidence: Math.min(c.confidence, confidence - 0.01) })) }));
        return Reflect.get(t, p, r);
      },
    }) as LanguageAdapter;
    try {
      registerAnalyser('ko', withConfidence(0.5));
      expect(cardIn('저는 밥을 먹었습니다.', '먹었습니다').itemIds).toEqual([LEMMA]);
      registerAnalyser('ko', withConfidence(0.49));
      expect(cardIn('저는 밥을 먹었습니다.', '먹었습니다').itemIds).toEqual(['form:ko:먹었습니다']);
      registerAnalyser('ko', withConfidence(0.9, true));
      expect(cardIn('저는 밥을 먹었습니다.', '먹었습니다').itemIds, 'unconfirmed is never credited, whatever the number').toEqual(['form:ko:먹었습니다']);
    } finally { registerAnalyser('ko', real, { createShardLoader: createKoreanShardLoader as never }); koClearAnalysisCache(); }
  });

  it('no compatibility normalisation touches a numbered lemma between the analyser and the wire: the adapter\'s own normaliser, the dictionary keys the card asks for, the ids a card carries', () => {
    const numbered = SNOW();
    if (!SUPERSCRIPT.test(numbered)) return; // the lexicon gives snow the bare lemma: nothing to carry
    const a = getAnalyser('ko')!;
    expect(a.normalize(numbered), 'the adapter\'s normalize keeps the number').toBe(numbered);
    const keys = [...new Set([...lemmaLookupKeys('ko', numbered).map((k) => a.normalize(k)), ...(a.lemmaVariants?.(numbered, 'NOUN') ?? []).map((v) => a.normalize(v))])];   // content/index.ts glossForms
    expect(keys).toContain(numbered);
    expect(keys.some((k) => k === numbered.normalize('NFKC'))).toBe(false);
    const card = cardIn('눈이 와요.', '눈이');
    expect(card.itemIds).toEqual([`lemma:ko:${numbered}:NOUN`]);
    expect(Buffer.from(card.itemIds[0], 'utf8').equals(Buffer.from(`lemma:ko:${numbered}:NOUN`, 'utf8'))).toBe(true);
    expect(card.itemIds[0].normalize('NFC')).toBe(card.itemIds[0]);
    expect(card.itemIds[0].normalize('NFKC'), 'the reason for the guard').not.toBe(card.itemIds[0]);
  });
});

// ═════════════════════════ E. performance guards ═════════════════════════
describe('E. performance guards', () => {
  it('the Korean analyser is not in memory until Korean is wanted: only Albanian is loaded at import, ko is a lazy chunk', () => {
    clearAnalysers(['sq']);
    expect(hasAnalyser('sq')).toBe(true);
    expect(hasAnalyser('ko')).toBe(false);
    expect(getAnalyser('ko')).toBeUndefined();
    registerAllAnalysers();
  });

  describe('the controller loads the Korean analyser only for a Korean lookup, once', () => {
    let rig: Rig | undefined;
    afterEach(() => { rig?.controller.dispose(); rig = undefined; registerAllAnalysers(); });
    const lookupIn = async (r: Rig, html: string, word: string): Promise<void> => {
      setBody(html);
      document.documentElement.lang = html.includes('lang="ko"') ? 'ko' : 'sq';
      const range = document.createRange(); const t = document.querySelector('p')!.firstChild as Text;
      const at = t.data.indexOf(word); range.setStart(t, at); range.setEnd(t, at + word.length);
      document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
      const out = await r.controller.lookup({ trigger: 'command' });
      if (out.status === 'shown') await out.settled;
      await flush(20);
    };
    it('an Albanian lookup never asks for ko; a Korean one asks once, and a second finds it loaded', async () => {
      clearAnalysers(['sq']);
      const asked: string[] = [];
      const loadAnalyser = vi.fn(async (l: string) => { asked.push(l); if (l === 'ko') registerAnalyser('ko', koAdapter); });
      rig = makeRig({ analysers: ['sq', 'ko'], loadAnalyser, hasAnalyser });
      await lookupIn(rig, '<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p>', 'shtëpinë');
      expect(asked, 'Albanian is linked in; nothing else is fetched').toEqual([]);
      await lookupIn(rig, '<p lang="ko">저는 밥을 먹었습니다.</p>', '먹었습니다');
      expect(asked).toEqual(['ko']);
      await lookupIn(rig, '<p lang="ko">저는 밥을 먹었습니다.</p>', '밥을');
      expect(asked, 'once per page').toEqual(['ko']);
    });
  });

  describe.skipIf(!SHARDS_PRESENT)('the lexicon preparer', () => {
    const counted = () => {
      const urls: string[] = [];
      const f = (async (input: RequestInfo | URL) => { const u = new URL(String(input), 'http://assets.local/').pathname; urls.push(u); const file = path.join(path.resolve(__dirname, '../../public'), decodeURIComponent(u)); return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('', { status: 404 }); }) as typeof fetch;
      return { urls, f };
    };
    const chrome = { runtime: { getURL: (p: string) => `http://assets.local/${p}` } } as never;
    it('fetches nothing for a page whose language is not Korean', async () => {
      const { urls, f } = counted();
      const p = createLexiconPreparer(chrome, f, 'http://assets.local/');
      await p.prepare('sq', 'Unë po lexoj një libër');
      await p.prepare('de', 'Ich lese das Buch');
      expect(urls).toEqual([]);
    });
    it('fetches each shard once for a page, however many passes read it', async () => {
      uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
      const { urls, f } = counted();
      const p = createLexiconPreparer(chrome, f, 'http://assets.local/');
      const text = SENTENCES.join(' ');
      const first = await p.prepare('ko', text);
      expect(first.failed).toEqual([]);
      const afterFirst = urls.length;
      expect(afterFirst).toBeGreaterThan(1);
      await p.prepare('ko', text);
      await p.prepare('ko', SENTENCES.slice(0, 5).join(' '));
      expect(urls.length, 'a second and a third pass fetch nothing').toBe(afterFirst);
      expect(new Set(urls).size, 'no file twice').toBe(urls.length);
      uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
    });
  });

  it('the analysis cache is bounded (src/adapters/korean/analyze.ts CACHE_MAX, evicting the least recently used) and never serves a wrong reading after eviction', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/adapters/korean/analyze.ts'), 'utf8');
    const max = Number(/const CACHE_MAX = (\d+);/.exec(src)?.[1]);
    expect(max, 'the constant exists and is a number').toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(20_000);
    expect(src, 'the cache evicts when it grows past the constant').toMatch(/if \(cache\.size > CACHE_MAX\) cache\.delete\(/);
    // the constant is private, so the size itself is not observable: fill well past it with distinct tokens and compare a word read before the flood with the same word read after it
    koClearAnalysisCache();
    const key = (s: string) => koAdapter.analyze(koAdapter.tokenize(s)).map((a) => a.candidates.map((c) => `${c.lemma}:${c.pos}:${c.confidence}`).join(','));
    const probe = '학생들이 학교에서 공부했습니다.';
    const before = key(probe);
    const syll = [...'가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호구누두루무부수우주추쿠투푸후'];
    for (let i = 0; i < max + 600; i++) key(`${syll[i % syll.length]}${syll[Math.floor(i / syll.length) % syll.length]}${syll[Math.floor(i / (syll.length * syll.length)) % syll.length]}${i % 7 ? '이' : '가'}`);
    expect(key(probe)).toEqual(before);
  }, 120_000);

  describe('an analyser exception does not blank the page', () => {
    class FakeHighlight implements HighlightLike {
      ranges = new Set<Range>();
      add(r: Range) { this.ranges.add(r); return this; }
      delete(r: Range) { return this.ranges.delete(r); }
      clear() { this.ranges.clear(); }
      get size() { return this.ranges.size; }
    }
    const w = window as unknown as { CSS?: { highlights?: Map<string, HighlightLike> }; Highlight?: typeof FakeHighlight };
    let registry: Map<string, HighlightLike>;
    let rig: Rig | undefined; let active: ActiveMode | undefined;
    const POISON = '먹었습니다';
    beforeEach(() => { registry = new Map(); w.CSS = { highlights: registry }; w.Highlight = FakeHighlight; });
    afterEach(() => { active?.stop(); active = undefined; rig?.controller.dispose(); rig = undefined; w.CSS = undefined; w.Highlight = undefined; registerAllAnalysers(); document.documentElement.removeAttribute('lang'); });
    const poisoned: LanguageAdapter = new Proxy(koAdapter, {
      get(target, prop, receiver) {
        if (prop === 'analyze') return (tokens: Parameters<LanguageAdapter['analyze']>[0], opts?: Parameters<LanguageAdapter['analyze']>[1]): AnalyzedToken[] => {
          if (tokens.some((t) => t.surface === POISON)) throw new Error('the analyser failed on one token');
          return target.analyze(tokens, opts);
        };
        return Reflect.get(target, prop, receiver);
      },
    }) as LanguageAdapter;
    const marked = (): string[] => [...registry.values()].flatMap((h) => [...(h as FakeHighlight).ranges].map((r) => r.toString()));

    it('a scan survives a token the analyser throws on: the other text nodes are read and underlined', async () => {
      registerAnalyser('ko', poisoned);
      setBody('<p id="a">학생들이 학교에서 공부했습니다.</p><p id="b">저는 밥을 먹었습니다.</p><p id="c">눈이 와요.</p>');
      document.documentElement.lang = 'ko';
      rig = makeRig({ analysers: ['sq', 'ko'] });
      const profile = async () => ({ ok: true as const, connected: false, source: 'device' as const, rows: {}, depth: 'brief' as const, depthOrigin: 'default' as const });
      active = new ActiveMode({ doc: document, controller: rig.controller, adapters: rig.deps.adapters, ui: rig.ui, adapterOf: getAnalyser, profile, viewport: 'all' });
      const state = await active.start({ speak: false });
      expect(state.on).toBe(true);
      expect(marked(), 'the page is not blank').toEqual(expect.arrayContaining(['학생들이', '학교에서', '눈이', '와요']));
    });

    // FAULT (granularity of the guard): packages/golearn-extension/src/active/scan.ts wordsOfText wraps the whole text node's `adapter.analyze(tokens)` in one
    // try/catch (analysed = []), so one poisoned token takes every other word of its text node (in a real page, a whole paragraph) out of the page's marks.
    // The page is not blank, but the guard is per paragraph, not per token.
    it.fails('only the poisoned token is left alone: the other words of its own text node are still underlined', async () => {
      registerAnalyser('ko', poisoned);
      setBody('<p id="b">저는 밥을 먹었습니다.</p>');
      document.documentElement.lang = 'ko';
      rig = makeRig({ analysers: ['sq', 'ko'] });
      const profile = async () => ({ ok: true as const, connected: false, source: 'device' as const, rows: {}, depth: 'brief' as const, depthOrigin: 'default' as const });
      active = new ActiveMode({ doc: document, controller: rig.controller, adapters: rig.deps.adapters, ui: rig.ui, adapterOf: getAnalyser, profile, viewport: 'all' });
      await active.start({ speak: false });
      expect(marked()).toEqual(expect.arrayContaining(['밥을']));
    });

    it('a lookup of the poisoned word is a plain message, not a throw out of the content script', async () => {
      registerAnalyser('ko', poisoned);
      setBody('<p id="b">저는 밥을 먹었습니다.</p>');
      document.documentElement.lang = 'ko';
      rig = makeRig({ analysers: ['sq', 'ko'] });
      const t = document.querySelector('p')!.firstChild as Text;
      const range = document.createRange(); const at = t.data.indexOf(POISON); range.setStart(t, at); range.setEnd(t, at + POISON.length);
      document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
      const out = await rig.controller.lookup({ trigger: 'command' });
      expect(out.status).toBe('message');
      expect((out as { reason?: string }).reason).toBe('parser-error');
    });
  });
});
