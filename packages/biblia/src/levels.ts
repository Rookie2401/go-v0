/**
 * Knowledge levels on the page (the standalone edition, signed in): how well the learner knows each word of the chapter on screen, painted on
 * the word's button as `data-level` (styles.css gives the six levels the extension's look: New = light-blue highlight, Seen = heavy underline,
 * Recognized = lighter underline, Familiar = faint underline, Known and Automatic = nothing).
 *
 * Which units are asked about. The Repository's rows are keyed by unit id (`form:<lang>:<normalised surface>`, `lemma:<lang>:<lemma>:<POS>`),
 * and the events Biblia records carry the ids the GoLearn parser puts on the card (`card.itemIds`): the LEMMA id when the best reading of the
 * word is creditable (confidence ≥ LEMMA_MIN_CONFIDENCE, not a guess from the ending), else the FORM id. So a word is asked about by both, the
 * way the extension's page scan does (`golearn-extension/src/active/scan.ts`): its form id, and its lemma id when creditable. The reading is
 * the one `parseSelection` makes for a tap on that very word: the verse's NFC text, the same adapter, the period (`varietyId`) the reader
 * declares, the source's own reading (`gold`) put first, then the candidate of highest confidence. What the card names for a tapped word is
 * also remembered for that word (`learn`), so even a reading that differs is covered from then on.
 *
 * The level of a word is `levelOfRows` over its rows: the learner's own latest mark decides (as the engine computed it); else the highest
 * level the engine reports for any of its rows; a word with no row is New. After the learner's own mark the word is repainted at once from
 * the mark (`mark`), until the service's row carries it. The chapter is asked for in batches (rows cached per chapter), and refreshed on focus,
 * when the tab becomes visible, after the events the service acknowledged, and every 60 s while visible.
 */
import { KNOWLEDGE_LEVEL_RANK, isKnowledgeLevel, levelOfMark, type KnowledgeLevel } from '../../repository-contract/src/knowledge-levels';
import type { UnitKnowledge } from '../../repository-contract/src';
import type { RepositoryApi } from '../../repository-service/src/api';
import { LEMMA_MIN_CONFIDENCE } from '../../golearn-extension/src/parser';
import { heAdapter } from '../../../src/adapters/he';
import { elAdapter } from '../../../src/adapters/el';
import type { BibliaLang } from './canon';

export const LEVEL_ATTR = 'data-level';
/** Units per `GET /knowledge` call (the ids travel in the query string; Hebrew and Greek letters are several bytes each). */
export const KNOWLEDGE_BATCH = 80;
const CONCURRENCY = 3;
const KEEP_CHAPTERS = 6;
const MAX_OVERRIDES = 500;
export const REFRESH_MS = 60_000;

/** A word of the chapter on screen: its button and where it sits in its verse, exactly as the lookup hands them to the parser. */
export interface LevelSite {
  el: HTMLElement;
  lang: BibliaLang;
  sentence: string;
  start: number;
  end: number;
  surface: string;
  varietyId: string;
  gold?: { lemmaId: string; code: string };
}

type Adapter = typeof heAdapter | typeof elAdapter;
const adapterOf = (lang: BibliaLang): Adapter => (lang === 'he' ? heAdapter : elAdapter);
interface VerseReading { text: string; adapter: Adapter; tokens: ReturnType<Adapter['tokenize']>; analyses: ReturnType<Adapter['analyze']> }
const same = (a: string, b: string): boolean => a.replace(/\s+/gu, ' ').trim() === b.replace(/\s+/gu, ' ').trim();

export const formUnitId = (lang: BibliaLang, surface: string): string => `form:${lang}:${adapterOf(lang).normalize(surface)}`;

function readVerse(site: LevelSite, cache: Map<string, VerseReading>): VerseReading {
  const key = `${site.lang}|${site.varietyId}|${site.sentence}`;
  let r = cache.get(key);
  if (!r) {
    const adapter = adapterOf(site.lang);
    const text = site.sentence.normalize('NFC');
    const tokens = adapter.tokenize(text);
    let analyses: VerseReading['analyses'] = [];
    try { analyses = adapter.analyze(tokens, site.varietyId ? { varietyId: site.varietyId } : undefined); } catch { analyses = []; }
    r = { text, adapter, tokens, analyses };
    cache.set(key, r);
  }
  return r;
}

/**
 * The unit ids a tap on this word would put on the card, plus its form id: [form id] and, when the best reading is creditable, [.., lemma id].
 * Falls back to the form id of the surface alone when the word cannot be located in its verse.
 */
export function unitIdsOfSite(site: LevelSite, cache: Map<string, VerseReading> = new Map()): string[] {
  const surface = site.surface.normalize('NFC').trim();
  const fallback = [formUnitId(site.lang, surface)];
  let r: VerseReading;
  try { r = readVerse(site, cache); } catch { return fallback; }
  // where the word sits, found the way the parser finds it
  let selStart = site.start; let selEnd = site.end;
  if (!same(r.text.slice(selStart, selEnd), surface)) {
    const at = r.text.indexOf(surface);
    if (at < 0) return fallback;
    selStart = at; selEnd = at + surface.length;
  }
  const selected: number[] = [];
  r.tokens.forEach((t, i) => { if (t.isWord && t.start < selEnd && t.end > selStart) selected.push(i); });
  if (selected.length !== 1) return fallback;
  const i = selected[0];
  const ids = [`form:${site.lang}:${r.adapter.normalize(r.tokens[i].surface)}`];
  let cands = [...(r.analyses[i]?.candidates ?? [])];
  if (site.gold) {
    const k = cands.findIndex((c) => c.notes?.lemmaId === site.gold!.lemmaId && c.notes?.code === site.gold!.code);
    if (k > 0) cands = [cands[k], ...cands.filter((_, j) => j !== k)];
  }
  const best = cands.length ? cands.reduce((m, c) => (c.confidence > m.confidence ? c : m), cands[0]) : undefined;
  if (best?.lemma && !best.unconfirmed && best.confidence >= LEMMA_MIN_CONFIDENCE) ids.push(`lemma:${site.lang}:${best.lemma}${best.pos ? ':' + best.pos : ''}`);
  return ids;
}

/** The level a row reports; an older engine that sent none is read from whether the unit was ever met. */
function levelOfRow(r: UnitKnowledge | undefined | null): KnowledgeLevel | undefined {
  if (!r) return undefined;
  if (isKnowledgeLevel(r.level)) return r.level;
  return (typeof r.encounters === 'number' && r.encounters > 0) || r.lastSeenAt || r.firstSeenAt ? 'seen' : 'new';
}

/** The newest of the learner's own marks among a word's rows. */
function newestMark(rows: Array<UnitKnowledge | undefined | null>): { level: KnowledgeLevel; at: string } | undefined {
  let best: { level: KnowledgeLevel; at: string } | undefined;
  for (const r of rows) if (r?.selfMark && (!best || r.selfMark.at > best.at)) best = { level: levelOfMark(r.selfMark.mark), at: r.selfMark.at };
  return best;
}

/**
 * The level of a word from its rows (its form row and its lemma row): the learner's own latest mark decides outright — after the first
 * automatic step from New to Seen, only the learner changes a word's state (the owner's rule, 2026-10-26), so a mark other than New stands
 * whatever the engine folded after it (a row still folded under the older rule, which read a Known word back down to Seen after a lookup,
 * is read by its mark, not its stale level). A mark of New means "not met": it is released by any later meeting, so there the engine's
 * level of the row that carries the mark decides (never below Seen once met). Without a mark, the highest level any row reports; no row at
 * all is New.
 */
export function levelOfRows(rows: Array<UnitKnowledge | undefined | null>): KnowledgeLevel {
  const mark = newestMark(rows);
  if (mark) {
    if (mark.level !== 'new') return mark.level;
    let engine: KnowledgeLevel | undefined;
    for (const r of rows) {
      if (!r || r.selfMark?.at !== mark.at) continue;
      const l = isKnowledgeLevel(r.level) ? r.level : undefined; // an older engine that sent none: the mark stands as it reads
      if (l && (!engine || KNOWLEDGE_LEVEL_RANK[l] > KNOWLEDGE_LEVEL_RANK[engine])) engine = l;
    }
    return engine ?? mark.level;
  }
  let best: KnowledgeLevel = 'new';
  for (const r of rows) { const l = levelOfRow(r); if (l && KNOWLEDGE_LEVEL_RANK[l] > KNOWLEDGE_LEVEL_RANK[best]) best = l; }
  return best;
}

// ───────────────────────────── the controller ─────────────────────────────

export interface LevelsOptions {
  win: Window;
  doc: Document;
  /** The signed-in api, or undefined when signed out (read at every use). */
  api(): Pick<RepositoryApi, 'knowledge'> | undefined;
  /** The service said 401 to a knowledge call. */
  onAuthExpired?(): void;
  intervalMs?: number;
  /** Lets the page breathe while a long chapter's unit ids are worked out; tests pass an immediate one. */
  yieldNow?(): Promise<void>;
}

export interface Levels {
  /** The chapter now on screen (undefined = no chapter: stop refreshing). Paints what is cached at once, then asks the service. */
  setChapter(key: string | undefined, sites: LevelSite[]): Promise<void>;
  /** Asks the service again: the whole chapter, or only these units (after the learner's own events). Resolves when the page has been repainted. */
  refresh(unitIds?: string[]): Promise<void>;
  /** The learner's own mark on a word: repaint it (and every word sharing a unit id with it) at once. */
  mark(unitIds: string[], level: KnowledgeLevel, at: string): void;
  /** The learner's mark could not be saved: take back what `mark` painted. */
  forget(unitIds: string[]): void;
  /** The learner looked a word up: a word still New is Seen at once. */
  met(unitIds: string[]): void;
  /** The unit ids the card named for this word: asked about from now on. */
  learn(site: LevelSite, unitIds: string[]): void;
  /** The level painted on a word button (for tests and the legend). */
  levelOf(el: Element): KnowledgeLevel | undefined;
  /**
   * What the card shows for a word of the chapter on screen: its level (the learner's own mark first, as `levelFor` paints it) and how often
   * it was met (the larger of its rows' encounters). `undefined` level = its rows were not fetched yet; a button that is not a word of the
   * chapter on screen gets undefined.
   */
  profileOf(el: Element): { level?: KnowledgeLevel; encounters?: number } | undefined;
  /** Called after every repaint (rows fetched, a mark, a lookup), so an open card can follow the word's level. */
  subscribe(cb: () => void): () => void;
  /** Paint no levels and forget what was fetched (signed out). */
  clear(): void;
  destroy(): void;
}

type Rows = Map<string, UnitKnowledge | null>;
interface OwnMark { level: KnowledgeLevel; at: string }
interface Current { key: string; sites: LevelSite[]; byEl: Map<Element, LevelSite>; ids: Map<LevelSite, string[]>; all: Set<string>; rows: Rows; ready: boolean }

export function createLevels(o: LevelsOptions): Levels {
  const { win, doc } = o;
  const chapters = new Map<string, Rows>();
  const marks = new Map<string, OwnMark>(); // the learner's own marks the service has not yet shown back
  const mets = new Set<string>(); // units looked up since the page was drawn (New is at least Seen)
  let cur: Current | undefined;
  let setGen = 0;
  const listeners = new Set<() => void>();
  const notifyPainted = (): void => { for (const l of [...listeners]) { try { l(); } catch { /* a listener never breaks the page */ } } };
  const yieldNow = o.yieldNow ?? (() => new Promise<void>((r) => { win.setTimeout(r, 0); }));

  const rowsFor = (key: string): Rows => {
    let r = chapters.get(key);
    if (r) { chapters.delete(key); chapters.set(key, r); return r; }
    r = new Map();
    chapters.set(key, r);
    while (chapters.size > KEEP_CHAPTERS) chapters.delete(chapters.keys().next().value as string);
    return r;
  };

  /** undefined = nothing is known about this word yet (its rows were not fetched): it is left unpainted rather than shown as New. */
  function levelFor(c: Current, site: LevelSite): KnowledgeLevel | undefined {
    const ids = c.ids.get(site) ?? [];
    const rows = ids.map((id) => c.rows.get(id));
    const asked = ids.some((id) => c.rows.has(id));
    const computed = levelOfRows(rows);
    const server = newestMark(rows);
    let mark: OwnMark | undefined;
    let met = false;
    for (const id of ids) {
      const ov = marks.get(id);
      if (ov && (!server || ov.at > server.at) && (!mark || ov.at > mark.at)) mark = ov;
      if (mets.has(id)) met = true;
    }
    if (mark) return mark.level;
    if (!asked) return met ? 'seen' : undefined;
    if (met && computed === 'new') return 'seen';
    return computed;
  }

  function paint(): void {
    if (!cur || !o.api()) return;
    for (const site of cur.sites) {
      const level = levelFor(cur, site);
      if (level) site.el.setAttribute(LEVEL_ATTR, level); else site.el.removeAttribute(LEVEL_ATTR);
    }
    notifyPainted();
  }
  function unpaint(): void {
    for (const site of cur?.sites ?? []) site.el.removeAttribute(LEVEL_ATTR);
    notifyPainted();
  }

  /** Drops the overrides the service has caught up with. */
  function settle(ids: Iterable<string>, rows: Rows): void {
    for (const id of ids) {
      const row = rows.get(id);
      if (!row) continue;
      const own = marks.get(id);
      if (own && row.selfMark && row.selfMark.at >= own.at) marks.delete(id);
      if (mets.has(id) && levelOfRow(row) !== 'new') mets.delete(id);
    }
  }

  async function fetchRows(api: Pick<RepositoryApi, 'knowledge'>, ids: string[], into: Rows): Promise<'ok' | 'auth' | 'failed'> {
    const batches: string[][] = [];
    // an id with a comma cannot travel in the comma-separated list; none of ours has one, but the guard costs nothing
    const clean = ids.filter((id) => !id.includes(','));
    for (let i = 0; i < clean.length; i += KNOWLEDGE_BATCH) batches.push(clean.slice(i, i + KNOWLEDGE_BATCH));
    let status: 'ok' | 'auth' | 'failed' = 'ok';
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < batches.length && status !== 'auth') {
        const batch = batches[next++];
        try {
          const r = await api.knowledge(batch);
          if (r.ok) {
            const got = new Map((r.data.knowledge ?? []).map((k) => [k.unitId, k] as const));
            for (const id of batch) into.set(id, got.get(id) ?? null);
          } else if (r.status === 401) status = 'auth';
          else status = 'failed';
        } catch { status = status === 'auth' ? status : 'failed'; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
    return status;
  }

  let pending: { full: boolean; ids: Set<string> } | undefined;
  let running: Promise<void> | undefined;

  async function once(p: { full: boolean; ids: Set<string> }): Promise<void> {
    const api = o.api();
    const c = cur;
    if (!api || !c) return;
    if (!c.ready) return; // setChapter asks once the ids are worked out
    const ids = p.full ? [...c.all] : [...c.all].filter((id) => p.ids.has(id));
    if (!ids.length) return;
    const status = await fetchRows(api, ids, c.rows);
    settle(ids, c.rows);
    if (status === 'auth') { o.onAuthExpired?.(); return; }
    if (cur === c) paint();
  }

  function kick(): Promise<void> {
    if (!running) {
      running = (async () => {
        while (pending) { const p = pending; pending = undefined; await once(p); }
      })().finally(() => { running = undefined; });
    }
    return running;
  }

  function refresh(unitIds?: string[]): Promise<void> {
    if (!o.api() || !cur) return Promise.resolve();
    if (!unitIds) pending = { full: true, ids: new Set() };
    else if (pending) { if (!pending.full) for (const u of unitIds) pending.ids.add(u); }
    else pending = { full: false, ids: new Set(unitIds) };
    return kick();
  }

  const onFocus = (): void => { void refresh(); };
  const onVisible = (): void => { if (doc.visibilityState !== 'hidden') void refresh(); };
  const timer = win.setInterval(() => { if (doc.visibilityState !== 'hidden') void refresh(); }, o.intervalMs ?? REFRESH_MS);
  win.addEventListener('focus', onFocus);
  doc.addEventListener('visibilitychange', onVisible);

  return {
    async setChapter(key, sites) {
      const gen = ++setGen;
      unpaint();
      pending = undefined;
      if (key === undefined || !sites.length) { cur = undefined; return; }
      const c: Current = { key, sites, byEl: new Map(sites.map((s) => [s.el, s] as const)), ids: new Map(), all: new Set(), rows: rowsFor(key), ready: false };
      cur = c;
      if (!o.api()) return;
      // the unit ids of every word, a few verses at a time so a long chapter does not freeze the page
      const readings = new Map<string, VerseReading>();
      let n = 0;
      for (const site of sites) {
        const ids = unitIdsOfSite(site, readings);
        c.ids.set(site, ids);
        for (const id of ids) c.all.add(id);
        if (++n % 120 === 0) { await yieldNow(); if (gen !== setGen) return; }
      }
      if (gen !== setGen) return;
      c.ready = true;
      if (c.rows.size) paint(); // what an earlier visit to this chapter fetched, at once
      await refresh();
    },
    refresh,
    mark(unitIds, level, at) {
      for (const id of unitIds) { marks.delete(id); marks.set(id, { level, at }); }
      while (marks.size > MAX_OVERRIDES) marks.delete(marks.keys().next().value as string);
      paint();
    },
    forget(unitIds) {
      for (const id of unitIds) marks.delete(id);
      paint();
    },
    met(unitIds) {
      for (const id of unitIds) mets.add(id);
      while (mets.size > MAX_OVERRIDES) mets.delete(mets.values().next().value as string);
      paint();
    },
    learn(site, unitIds) {
      if (!cur?.ready) return;
      const have = cur.ids.get(site);
      if (!have) return;
      const add = unitIds.filter((id) => !have.includes(id));
      if (!add.length) return;
      cur.ids.set(site, [...have, ...add]);
      for (const id of add) cur.all.add(id);
    },
    levelOf(el) {
      const v = el.getAttribute(LEVEL_ATTR);
      return isKnowledgeLevel(v) ? v : undefined;
    },
    profileOf(el) {
      const c = cur;
      const site = c?.byEl.get(el);
      if (!c || !site || !o.api()) return undefined;
      const level = levelFor(c, site);
      let encounters: number | undefined;
      for (const id of c.ids.get(site) ?? []) {
        const n = c.rows.get(id)?.encounters;
        if (typeof n === 'number' && (encounters === undefined || n > encounters)) encounters = n;
      }
      return { ...(level ? { level } : {}), ...(encounters !== undefined ? { encounters } : {}) };
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    clear() {
      setGen++;
      pending = undefined;
      unpaint();
      chapters.clear();
      marks.clear();
      mets.clear();
      cur = undefined;
    },
    destroy() {
      listeners.clear();
      win.clearInterval(timer);
      win.removeEventListener('focus', onFocus);
      doc.removeEventListener('visibilitychange', onVisible);
      setGen++;
      pending = undefined;
      unpaint();
      cur = undefined;
    },
  };
}
