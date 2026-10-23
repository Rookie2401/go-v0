// @vitest-environment jsdom
/**
 * Knowledge levels on the page (packages/biblia/src/levels.ts): which unit ids a word is asked about (the same ids the card puts on the events the
 * recorder sends), how rows become one of the six levels, and the controller that fetches them in batches, caches them per chapter, and repaints at
 * once after the learner's own mark. A fake `knowledge` stands in for the service; no network.
 */
import fs from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEVEL_ATTR, KNOWLEDGE_BATCH, createLevels, formUnitId, levelOfRows, unitIdsOfSite, type LevelSite } from '../../packages/biblia/src/levels';
import { greekVerseText, type GrVerse, type HeVerse } from '../../packages/biblia/src/data';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { languageMeta } from '../../packages/golearn-extension/src/parser/registry';
import type { KnowledgeLevel, UnitKnowledge } from '../../packages/repository-contract/src';
import { elAdapter } from '../../src/adapters/el';
import { heAdapter } from '../../src/adapters/he';
import { registerAllAnalysers } from '../support/analysers';

const row = (unitId: string, over: Partial<UnitKnowledge> = {}): UnitKnowledge => ({ learnerId: 'L1', unitId, languageId: 'el', level: 'new', encounters: 0, ...over } as UnitKnowledge);
const mark = (level: KnowledgeLevel, at = '2026-10-22T12:00:00.000Z'): { mark: KnowledgeLevel; at: string } => ({ mark: level, at });

describe('levelOfRows', () => {
  it('a word with no rows is New', () => {
    expect(levelOfRows([])).toBe('new');
    expect(levelOfRows([undefined, null])).toBe('new');
  });
  it('is the highest level any of its rows reports (form row and lemma row)', () => {
    expect(levelOfRows([row('form:el:x', { level: 'seen' }), row('lemma:el:x:NOUN', { level: 'familiar' })])).toBe('familiar');
    expect(levelOfRows([row('form:el:x', { level: 'automatic' }), undefined])).toBe('automatic');
  });
  it('the learner own latest mark decides, at the level the engine gave the row that carries it', () => {
    const a = row('form:el:x', { level: 'known', selfMark: mark('known', '2026-10-22T10:00:00.000Z') });
    const b = row('lemma:el:x:NOUN', { level: 'automatic' });
    expect(levelOfRows([a, b])).toBe('known'); // the mark, not the higher level of the other row
    const newer = row('lemma:el:x:NOUN', { level: 'new', selfMark: mark('new', '2026-10-22T11:00:00.000Z') });
    expect(levelOfRows([a, newer])).toBe('new'); // the later mark wins
  });
  it('a stored mark in an older word is read through levelOfMark; a row without a level is Seen if it was ever met', () => {
    const legacy = { ...row('form:el:x'), level: undefined, selfMark: { mark: 'productive', at: '2026-10-22T10:00:00.000Z' } } as unknown as UnitKnowledge;
    expect(levelOfRows([legacy])).toBe('known');
    const old = { ...row('form:el:y'), level: undefined, encounters: 2 } as unknown as UnitKnowledge;
    expect(levelOfRows([old])).toBe('seen');
  });
});

describe('the styles', () => {
  const css = fs.readFileSync('packages/biblia/styles.css', 'utf8');
  it('give New a light-blue highlight and Seen, Recognized, Familiar a heavy, lighter and faint underline; Known and Automatic nothing', () => {
    const rule = (level: string): string => new RegExp(`\\.reader \\.word\\[data-level="${level}"\\][^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('new')).toMatch(/background-color: rgba\(173, 216, 230/);
    const width = (level: string): number => Number(/text-decoration-thickness: ([\d.]+)px/.exec(rule(level))?.[1]);
    expect(width('seen')).toBeGreaterThan(width('recognized'));
    expect(width('recognized')).toBeGreaterThan(width('familiar'));
    expect(width('familiar')).toBeGreaterThan(0);
    expect(rule('known')).toBe('');
    expect(rule('automatic')).toBe('');
  });
});

// ── the unit ids a word is asked about are the ones the card records ──
const DATA = 'packages/biblia/public/data';
describe.skipIf(!fs.existsSync(`${DATA}/he/Gen.json`) || !fs.existsSync(`${DATA}/el/John.json`))('unit ids against the real texts', () => {
  beforeAll(() => { registerAllAnalysers(); });
  const nextStart = (text: string, from: number): number => { let i = from; while (i < text.length && /\s/u.test(text[i])) i++; return i; };
  void nextStart;
  function hebrewSites(verse: HeVerse): LevelSite[] {
    const toks = heAdapter.tokenize(verse.t);
    const wordCount = toks.filter((t) => t.isWord).length;
    const out: LevelSite[] = []; let wi = 0;
    for (const t of toks) {
      if (!t.isWord) continue;
      const g = wordCount === verse.w.length ? verse.w[wi] : null; wi++;
      out.push({ el: document.createElement('button'), lang: 'he', sentence: verse.t, start: t.start, end: t.end, surface: verse.t.slice(t.start, t.end), varietyId: 'he-bib', ...(g ? { gold: { lemmaId: g[0].split('/').pop()!.replace(/\+$/, ''), code: g[1] } } : {}) });
    }
    return out;
  }
  function greekSites(verse: GrVerse): LevelSite[] {
    const text = greekVerseText(verse);
    const golds = verse.w.filter((t) => /\p{L}/u.test(t[0]));
    const toks = elAdapter.tokenize(text);
    const wordCount = toks.filter((t) => t.isWord).length;
    const out: LevelSite[] = []; let wi = 0;
    for (const t of toks) {
      if (!t.isWord) continue;
      const g = wordCount === golds.length ? golds[wi] : undefined; wi++;
      out.push({ el: document.createElement('button'), lang: 'el', sentence: text, start: t.start, end: t.end, surface: text.slice(t.start, t.end), varietyId: 'el-koi', ...(g ? { gold: { lemmaId: g[1].normalize('NFC'), code: `${g[2]}|${g[3] ?? ''}` } } : {}) });
    }
    return out;
  }
  const cardIds = (s: LevelSite): string[] => parseSelection({ surface: s.surface, languageId: s.lang, context: { kind: 'sentence', confidence: 1, sentence: s.sentence, selStart: s.start, selEnd: s.end, direction: s.lang === 'he' ? 'rtl' : 'ltr', varietyId: s.varietyId, ...(s.gold ? { gold: { ...s.gold, source: 'test' } } : {}) } }).itemIds;

  it.skipIf(!languageMeta('he'))('Genesis 1:1-5: every id the card would record for a word is among the ids asked about', () => {
    const gen = JSON.parse(fs.readFileSync(`${DATA}/he/Gen.json`, 'utf8')) as { chapters: Array<{ verses: HeVerse[] }> };
    let words = 0; let withLemma = 0;
    for (const v of gen.chapters[0].verses.slice(0, 5)) {
      const cache = new Map();
      for (const s of hebrewSites(v)) {
        const asked = unitIdsOfSite(s, cache);
        const card = cardIds(s);
        expect(asked, s.surface).toEqual(expect.arrayContaining(card));
        expect(asked[0]).toBe(formUnitId('he', s.surface.normalize('NFC')));
        words++; if (asked.length > 1) withLemma++;
      }
    }
    expect(words).toBeGreaterThan(40);
    expect(withLemma).toBeGreaterThan(words / 2); // most words have a creditable lemma, so a mark on the lemma reaches them
  });

  it.skipIf(!languageMeta('el'))('John 1:1-8: the same for Greek', () => {
    const john = JSON.parse(fs.readFileSync(`${DATA}/el/John.json`, 'utf8')) as { chapters: Array<{ verses: GrVerse[] }> };
    let words = 0; let withLemma = 0;
    for (const v of john.chapters[0].verses.slice(0, 8)) {
      const cache = new Map();
      for (const s of greekSites(v)) {
        const asked = unitIdsOfSite(s, cache);
        expect(asked, s.surface).toEqual(expect.arrayContaining(cardIds(s)));
        words++; if (asked.length > 1) withLemma++;
      }
    }
    expect(words).toBeGreaterThan(80);
    expect(withLemma).toBeGreaterThan(words / 2);
  });
});

// ── the controller ──
const SENTENCE = 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν';
function sitesOf(sentence = SENTENCE, varietyId = 'el-koi'): LevelSite[] {
  return elAdapter.tokenize(sentence).filter((t) => t.isWord).map((t) => {
    const el = document.createElement('button');
    el.textContent = sentence.slice(t.start, t.end);
    document.body.append(el);
    return { el, lang: 'el' as const, sentence, start: t.start, end: t.end, surface: sentence.slice(t.start, t.end), varietyId };
  });
}
function fakeKnowledge(rows: Record<string, Partial<UnitKnowledge>> = {}, opts: { failBatch?: number; status?: number } = {}) {
  const calls: string[][] = [];
  const knowledge = vi.fn(async (ids?: string[]) => {
    calls.push(ids ?? []);
    if (opts.status) return { ok: false as const, status: opts.status, error: 'x', message: 'x', body: {} };
    if (opts.failBatch !== undefined && calls.length - 1 === opts.failBatch) throw new TypeError('network down');
    return { ok: true as const, status: 200, data: { knowledge: (ids ?? []).filter((id) => rows[id]).map((id) => row(id, rows[id])) } };
  });
  return { calls, knowledge, rows };
}
const make = (api: ReturnType<typeof fakeKnowledge> | undefined, extra: { onAuthExpired?: () => void } = {}) => {
  let live = api;
  const levels = createLevels({ win: window, doc: document, api: () => (live ? { knowledge: live.knowledge as never } : undefined), yieldNow: async () => undefined, ...extra });
  return { levels, signOut: () => { live = undefined; } };
};
const levelsOn = (sites: LevelSite[]): Array<string | null> => sites.map((s) => s.el.getAttribute(LEVEL_ATTR));

describe('the levels controller', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('asks for the words of the chapter (form id first, then the lemma id), each unit once, and paints every word', async () => {
    const sites = sitesOf();
    const api = fakeKnowledge();
    const { levels } = make(api);
    await levels.setChapter('read/John/1', sites);
    const asked = api.calls.flat();
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked).toContain(formUnitId('el', 'λόγος'));
    expect(asked.some((id) => id.startsWith('lemma:el:λόγος'))).toBe(true);
    expect(levelsOn(sites).every((l) => l === 'new')).toBe(true); // nothing met yet: every word is New
    levels.destroy();
  });

  it('paints the level of each word from its rows: the highest of form and lemma, the learner mark, known and automatic', async () => {
    const sites = sitesOf();
    const ids = (w: string): string[] => unitIdsOfSite(sites.find((s) => s.surface === w)!);
    const [logosForm, logosLemma] = ids('λόγος');
    const rows: Record<string, Partial<UnitKnowledge>> = {
      [logosForm]: { level: 'seen', encounters: 1 },
      ...(logosLemma ? { [logosLemma]: { level: 'familiar', encounters: 4 } } : {}),
      [ids('ἀρχῇ')[0]]: { level: 'recognized' },
      [ids('θεόν')[0]]: { level: 'known', selfMark: mark('known') },
      [ids('πρὸς')[0]]: { level: 'automatic' },
    };
    const { levels } = make(fakeKnowledge(rows));
    await levels.setChapter('read/John/1', sites);
    const of = (w: string): Array<string | null> => sites.filter((s) => s.surface === w).map((s) => s.el.getAttribute(LEVEL_ATTR));
    expect(of('λόγος')).toEqual(logosLemma ? ['familiar', 'familiar'] : ['seen', 'seen']); // both occurrences share the rows
    expect(of('ἀρχῇ')).toEqual(['recognized']);
    expect(of('θεόν')).toEqual(['known']);
    expect(of('πρὸς')).toEqual(['automatic']);
    expect(of('ἦν')).toEqual(['new', 'new']);
    levels.destroy();
  });

  it('asks in batches of at most 80 units', async () => {
    expect(KNOWLEDGE_BATCH).toBe(80);
    const words = Array.from({ length: 200 }, (_, i) => `λόγος${'α'.repeat(i % 7)}${String.fromCharCode(0x3b1 + (i % 24))}${String.fromCharCode(0x3b1 + ((i * 7) % 24))}${i}`);
    const sites = sitesOf(words.join(' '));
    const api = fakeKnowledge();
    const { levels } = make(api);
    await levels.setChapter('read/Big/1', sites);
    expect(api.calls.length).toBeGreaterThanOrEqual(3);
    expect(api.calls.every((c) => c.length > 0 && c.length <= KNOWLEDGE_BATCH)).toBe(true);
    levels.destroy();
  });

  it('caches rows per chapter: coming back to a chapter paints it before the service has answered', async () => {
    const a = sitesOf();
    const rows = { [unitIdsOfSite(a[1])[0]]: { level: 'seen' as const } };
    const api = fakeKnowledge(rows);
    const { levels } = make(api);
    await levels.setChapter('read/John/1', a);
    expect(a[1].el.getAttribute(LEVEL_ATTR)).toBe('seen');
    await levels.setChapter('read/John/2', sitesOf('ὁ ἄνθρωπος'));
    // back to chapter 1 (new buttons for the same words): the answer is held up, yet the words are painted from the cache
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    api.knowledge.mockImplementationOnce(async (ids) => { await gate; return { ok: true as const, status: 200, data: { knowledge: (ids ?? []).filter((id) => (rows as Record<string, unknown>)[id]).map((id) => row(id, { level: 'recognized' })) } }; });
    document.body.innerHTML = '';
    const again = sitesOf();
    const pending = levels.setChapter('read/John/1', again);
    await vi.waitFor(() => expect(again[1].el.getAttribute(LEVEL_ATTR)).toBe('seen'));
    release();
    await pending;
    expect(again[1].el.getAttribute(LEVEL_ATTR)).toBe('recognized'); // then the fresh answer
    levels.destroy();
  });

  it('repaints at once after the learner own mark, until the service row carries it', async () => {
    const sites = sitesOf();
    const [form] = unitIdsOfSite(sites[0]);
    const api = fakeKnowledge({ [form]: { level: 'seen' } });
    const { levels } = make(api);
    await levels.setChapter('read/John/1', sites);
    expect(sites[0].el.getAttribute(LEVEL_ATTR)).toBe('seen');
    levels.mark(unitIdsOfSite(sites[0]), 'known', '2026-10-22T12:00:00.000Z');
    expect(sites[0].el.getAttribute(LEVEL_ATTR)).toBe('known'); // synchronously, no fetch needed
    expect(levelsOn(sites).slice(1).some((l) => l === 'known')).toBe(false);
    await levels.refresh([form]); // the service has not seen the mark yet: the page keeps the learner's word
    expect(sites[0].el.getAttribute(LEVEL_ATTR)).toBe('known');
    api.rows[form] = { level: 'known', selfMark: mark('known', '2026-10-22T12:00:00.000Z') };
    await levels.refresh([form]);
    expect(sites[0].el.getAttribute(LEVEL_ATTR)).toBe('known');
    api.rows[form] = { level: 'recognized', selfMark: mark('recognized', '2026-10-22T13:00:00.000Z') }; // marked again on another device
    await levels.refresh([form]);
    expect(sites[0].el.getAttribute(LEVEL_ATTR)).toBe('recognized'); // the override was settled, so the service is believed again
    levels.destroy();
  });

  it('a mark that could not be saved is taken back; a word looked up is at least Seen at once', async () => {
    const sites = sitesOf();
    const ids = unitIdsOfSite(sites[0]);
    const { levels } = make(fakeKnowledge());
    await levels.setChapter('read/John/1', sites);
    levels.met(ids);
    expect(sites[0].el.getAttribute(LEVEL_ATTR)).toBe('seen');
    levels.mark(ids, 'familiar', '2026-10-22T12:00:00.000Z');
    expect(sites[0].el.getAttribute(LEVEL_ATTR)).toBe('familiar');
    levels.forget(ids);
    expect(sites[0].el.getAttribute(LEVEL_ATTR)).toBe('seen');
    levels.destroy();
  });

  it('clear() (signed out) removes every mark and asks for nothing more; with no api nothing is asked or painted', async () => {
    const sites = sitesOf();
    const api = fakeKnowledge();
    const { levels, signOut } = make(api);
    await levels.setChapter('read/John/1', sites);
    expect(levelsOn(sites).every((l) => l !== null)).toBe(true);
    signOut();
    levels.clear();
    expect(levelsOn(sites).every((l) => l === null)).toBe(true);
    const n = api.calls.length;
    await levels.refresh();
    await levels.setChapter('read/John/1', sites);
    expect(api.calls.length).toBe(n);
    expect(levelsOn(sites).every((l) => l === null)).toBe(true);
    levels.destroy();
  });

  it('a 401 from the service reports the session as ended and paints nothing', async () => {
    const sites = sitesOf();
    const onAuthExpired = vi.fn();
    const { levels } = make(fakeKnowledge({}, { status: 401 }), { onAuthExpired });
    await levels.setChapter('read/John/1', sites);
    expect(onAuthExpired).toHaveBeenCalledTimes(1);
    expect(levelsOn(sites).every((l) => l === null)).toBe(true);
    levels.destroy();
  });

  it('a batch the service could not answer leaves its words unpainted (never wrongly New) while the others are painted', async () => {
    const words = Array.from({ length: 120 }, (_, i) => `ωα${String.fromCharCode(0x3b1 + (i % 24))}${String.fromCharCode(0x3b1 + ((i * 5) % 24))}${String.fromCharCode(0x3b1 + ((i * 11) % 24))}${i}`);
    const sites = sitesOf(words.join(' '));
    const api = fakeKnowledge({}, { failBatch: 1 });
    const { levels } = make(api);
    await levels.setChapter('read/Big/2', sites);
    const painted = levelsOn(sites).filter((l) => l !== null).length;
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(sites.length);
    levels.destroy();
  });
});
