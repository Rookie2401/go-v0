// @vitest-environment jsdom
/**
 * Every surface that analyses Korean text reads the same word list. GoLearn Active's scan and Reading Analysis prepare the language's sharded
 * word list for the text they are about to analyse (the same `prepare(languageId, text)` the card uses), once per pass and language, before
 * the analysis; a failure is remembered and the pass goes on with the compiled core. A word's lemma is the same on all three.
 */
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { koAdapter } from '../../src/adapters/ko';
import { koClearAnalysisCache } from '../../src/adapters/korean/analyze';
import { hasKoreanStem, uninstallKoreanLexicon } from '../../src/adapters/korean/index-store';
import { createKoreanShardLoader } from '../../src/adapters/korean/shards';
import { createLexiconPreparer } from '../../packages/golearn-extension/src/lexicon/prepare';
import { ActiveMode } from '../../packages/golearn-extension/src/content/active';
import { createReadingSession } from '../../packages/golearn-extension/src/reading/session';
import { createAdapters } from '../../packages/golearn-extension/src/adapters';
import { wordsOfText } from '../../packages/golearn-extension/src/active/scan';
import { getAnalyser, parseSelection, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { loadAnalyser } from '../../packages/golearn-extension/src/analysers/loaders';
import { analyserExtras } from '../../packages/golearn-extension/src/parser/registry';
import { registerAllAnalysers } from '../support/analysers';
import { SHARDS_PRESENT, diskShardSource } from '../support/korean/lexicon';
import { makeRig, setBody, stubLayout, type Rig } from './dom';

const CANDIDATES = ['신호등', '박물관', '도서관', '대통령', '환경', '병원', '약국', '공항', '시장', '은행', '우체국', '미술관', '체육관', '식당'];
// words only a shard holds, read from the installed lexicons (never assumed)
let SHARD_ONLY: string[] = [];
let PAGE = '';
beforeAll(async () => {
  if (!SHARDS_PRESENT) return;
  uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
  const loader = await createKoreanShardLoader(diskShardSource, { base: 'lexicon/ko/standard' });
  const only = CANDIDATES.filter((c) => !hasKoreanStem(c));
  await loader.ensure(only);
  SHARD_ONLY = only.filter((c) => hasKoreanStem(c)).slice(0, 2);
  uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache();
  PAGE = `학생들이 학교에서 공부했습니다. ${SHARD_ONLY[0]}에서 친구에게만 말했어요. 눈이 와요. 저는 밥을 먹고 싶어요. ${SHARD_ONLY[1]}에서 책을 읽으셨습니다.`;
});

describe.skipIf(!SHARDS_PRESENT)('Korean: Active and Reading Analysis read the full word list', () => {
  let restore: () => void; let rig: Rig | undefined; let active: ActiveMode | undefined;
  beforeEach(() => { restore = stubLayout(); uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache(); });
  afterEach(() => { active?.stop(); active = undefined; rig?.controller.dispose(); rig = undefined; restore(); registerAllAnalysers(); uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache(); });

  const counted = () => {
    const urls: string[] = [];
    const f = (async (input: RequestInfo | URL) => {
      const u = new URL(String(input), 'http://assets.local/').pathname; urls.push(u);
      const file = path.join(path.resolve(__dirname, '../../public'), decodeURIComponent(u));
      const fs = await import('node:fs');
      return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200 }) : new Response('', { status: 404 });
    }) as typeof fetch;
    return { urls, f };
  };
  const chrome = { runtime: { getURL: (p: string) => `http://assets.local/${p}` } } as never;
  const profile = async () => ({ ok: true as const, connected: false, source: 'device' as const, rows: {}, depth: 'brief' as const, depthOrigin: 'default' as const });

  it('a scan prepares the word list for its own text before analysing it, once, and a second pass fetches nothing', async () => {
    registerAllAnalysers();
    setBody(`<p>${PAGE}</p>`);
    document.documentElement.lang = 'ko';
    rig = makeRig({ analysers: ['sq', 'ko'] });
    const { urls, f } = counted();
    const preparer = createLexiconPreparer(chrome, f, 'http://assets.local/');
    const prepared: string[] = [];
    const prepareLexicon = async (lang: string, text: string) => { prepared.push(`${lang}:${text.includes(SHARD_ONLY[0])}`); return preparer.prepare(lang, text); };
    active = new ActiveMode({ doc: document, controller: rig.controller, adapters: rig.deps.adapters, ui: rig.ui, adapterOf: getAnalyser, profile, prepareLexicon, viewport: 'all' });
    expect(hasKoreanStem(SHARD_ONLY[0]), 'the shard-only word is not loaded before the scan').toBe(false);
    await active.start({ speak: false });
    expect(prepared[0]).toBe('ko:true');
    expect(hasKoreanStem(SHARD_ONLY[0]), 'the scan loaded the word list for its text').toBe(true);
    const after = urls.length;
    expect(after).toBeGreaterThan(1);
    expect(new Set(urls).size, 'no shard twice').toBe(urls.length);
    await active.start({ speak: false });
    expect(urls.length, 'another pass over the same page fetches nothing').toBe(after);
  });

  it('a failed load is remembered and the scan goes on with the core: nothing throws', async () => {
    registerAllAnalysers();
    setBody(`<p>${PAGE}</p>`);
    document.documentElement.lang = 'ko';
    rig = makeRig({ analysers: ['sq', 'ko'] });
    const dead = (async () => new Response('gone', { status: 503 })) as typeof fetch;
    const preparer = createLexiconPreparer(chrome, dead, 'http://assets.local/');
    active = new ActiveMode({ doc: document, controller: rig.controller, adapters: rig.deps.adapters, ui: rig.ui, adapterOf: getAnalyser, profile, prepareLexicon: (l, t) => preparer.prepare(l, t), viewport: 'all' });
    const state = await active.start({ speak: false });
    expect(state.on).toBe(true);
    expect(preparer.unavailable()).toEqual(['ko/standard']);
  });

  it('after the preparation, a word\'s lemma in the scan is the card\'s lemma for the same word', async () => {
    registerAllAnalysers();
    const { f } = counted();
    await createLexiconPreparer(chrome, f, 'http://assets.local/').prepare('ko', PAGE);
    const sentences = PAGE.split(/(?<=[.])\s+/u);
    for (const s of sentences) {
      for (const w of wordsOfText(s, getAnalyser('ko')!, 'ko')) {
        const surface = s.slice(w.start, w.end);
        const card = parseSelection({ surface, languageId: 'ko', context: { kind: 'sentence', confidence: 0.9, sentence: s, selStart: w.start, selEnd: w.end } });
        const lemmaIds = w.ids.filter((id) => id.startsWith('lemma:'));
        if (card.unconfirmed || !card.lemma) { expect(lemmaIds, surface).toEqual([]); continue; }
        // a reading the review gate holds back (T-A: another listed word could be meant, or two sides, an undecided entry ...) is credited to its form only, by the scan and by the card alike
        // the meaning hold refuses the CARD only: the lemma is still credited, by the scan and by the card alike
        if (card.reviewHold?.kind === 'meaning-unreviewed') { expect(lemmaIds[0], surface).toBe(`lemma:ko:${card.lemma}:${card.pos}`); continue; }
        if (card.reviewHold) { expect(lemmaIds, `${surface} is held: ${card.reviewHold.kind}`).toEqual([]); expect(card.itemIds.filter((id) => id.startsWith('lemma:')), surface).toEqual([]); continue; }
        expect(lemmaIds[0], surface).toBe(`lemma:ko:${card.lemma}:${card.pos}`);
      }
    }
  });

  it('Reading Analysis prepares the word list for the text it analyses, before building its table', async () => {
    registerAllAnalysers();
    setBody(`<main><p>${PAGE}</p></main>`);
    document.documentElement.lang = 'ko';
    const { f } = counted();
    const preparer = createLexiconPreparer(chrome, f, 'http://assets.local/');
    let loadedWhenPrepared: boolean | undefined;
    const prepareLexicon = async (lang: string, text: string) => { const r = await preparer.prepare(lang, text); loadedWhenPrepared = hasKoreanStem(SHARD_ONLY[0]); return r; };
    const knowledge = async (req: { op: string; words?: unknown[]; snapshot?: string }) => req.op === 'snapshot'
      ? { ok: true as const, op: 'snapshot' as const, snapshot: { id: 's1', authority: 'device', state: 'verified', verifiedAt: 1, unsent: 0 } }
      : { ok: true as const, op: 'classify' as const, snapshot: req.snapshot, verdicts: (req.words ?? []).map(() => ['below', 'new']), asked: (req.words ?? []).length, answered: (req.words ?? []).length };
    const session = createReadingSession({ doc: document, adapters: createAdapters(document), languages: ['ko'], adapterOf: (l) => (l === 'ko' ? getAnalyser('ko') : undefined), prepareLexicon, knowledge: knowledge as never });
    session.handle({ type: MSG.readingAnalysis, op: 'start', languageId: 'ko' });
    const t0 = Date.now();
    while (!['done', 'failed', 'canceled'].includes(session.status().stage) && Date.now() - t0 < 20_000) await new Promise((r) => setTimeout(r, 5));
    expect(session.status().error).toBeUndefined();
    expect(loadedWhenPrepared).toBe(true);
    expect(hasKoreanStem(SHARD_ONLY[1])).toBe(true);
    session.dispose();
  }, 30_000);

  it('the mobile and setup loader registers the chunk\'s shard loader too, so Korean is not marked unavailable there', async () => {
    await loadAnalyser('ko').catch(() => undefined);
    // in tests the analyser chunk is the source module itself: its factory is the Korean one
    expect(analyserExtras('ko')?.createShardLoader).toBe(createKoreanShardLoader);
    void koAdapter; void registerAnalyser; void diskShardSource;
  });
});

import { pickRecord, type LexicalRecord } from '../../packages/golearn-extension/src/content/enrich';
import { pickRecord as goreviewPickRecord } from '../../packages/goreview/src/facts/paradigm-table';

describe('pickRecord: DIFFERENT entries make a reading ambiguous, several records of one entry do not', () => {
  const one = (e: number | undefined, form: string): LexicalRecord => ({ w: '눈', p: 'NOUN', ...(e !== undefined ? { e } : {}), f: [{ f: form, t: [] }] });
  for (const [name, pick] of [['the card', pickRecord], ['GoReview', goreviewPickRecord]] as const) {
    it(`${name}: one entry split over two records still gives a record; two entries (two etymology numbers) give none when the reading is ambiguous`, () => {
      const split = [one(1, 'eye'), one(1, 'eyesight')];
      expect(pick(split, 'NOUN', { ambiguous: true })?.f?.[0].f).toBe('eye');
      const two = [one(1, 'eye'), one(2, 'snow')];
      expect(pick(two, 'NOUN', { ambiguous: true })).toBeUndefined();
      expect(pick(two, 'NOUN')?.f?.[0].f, 'a reading that is not ambiguous keeps the old rule').toBe('eye');
    });
  }
});
