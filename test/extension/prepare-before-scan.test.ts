// @vitest-environment jsdom
/**
 * Only the languages in PREPARE_BEFORE_SCAN (Korean) load their word list before Active's scan or a Reading Analysis run analyses a page.
 * Greek, Hebrew and Russian keep loading on the first lookup: a page of theirs requests no lexicon file, and the marks and the table are what the
 * same code gives with no preparer at all.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLexiconPreparer, PREPARE_BEFORE_SCAN } from '../../packages/golearn-extension/src/lexicon/prepare';
import { ActiveMode } from '../../packages/golearn-extension/src/content/active';
import { createReadingSession } from '../../packages/golearn-extension/src/reading/session';
import { createAdapters } from '../../packages/golearn-extension/src/adapters';
import { getAnalyser } from '../../packages/golearn-extension/src/parser';
import type { HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { registerAllAnalysers } from '../support/analysers';
import { makeRig, setBody, stubLayout, type Rig } from './dom';

class FakeHighlight implements HighlightLike {
  ranges = new Set<Range>();
  add(r: Range) { this.ranges.add(r); return this; }
  delete(r: Range) { return this.ranges.delete(r); }
  clear() { this.ranges.clear(); }
  get size() { return this.ranges.size; }
}
const w = window as unknown as { CSS?: { highlights?: Map<string, HighlightLike> }; Highlight?: typeof FakeHighlight };
const PAGES: Array<{ lang: string; variety?: string; html: string }> = [
  { lang: 'el', variety: 'el-mod', html: 'Ο άνθρωπος πηγαίνει στο σχολείο και διαβάζει ένα βιβλίο στην πόλη.' },
  { lang: 'he', variety: 'he-mod', html: 'הילד הלך לבית הספר וקרא ספר בעיר הגדולה.' },
  { lang: 'ru', html: 'Она прочитала книгу и сказала, что это очень хорошая книга. Они стали читать каждый день.' },
];
const profile = async () => ({ ok: true as const, connected: false, source: 'device' as const, rows: {}, depth: 'brief' as const, depthOrigin: 'default' as const });
const chrome = { runtime: { getURL: (p: string) => `http://assets.local/${p}` } } as never;

let restore: () => void; let rig: Rig | undefined; let active: ActiveMode | undefined; let registry: Map<string, HighlightLike>;
beforeEach(() => { restore = stubLayout(); registry = new Map(); w.CSS = { highlights: registry }; w.Highlight = FakeHighlight; registerAllAnalysers(); });
afterEach(() => { active?.stop(); active = undefined; rig?.controller.dispose(); rig = undefined; w.CSS = undefined; w.Highlight = undefined; restore(); document.documentElement.removeAttribute('lang'); });

const marked = (): string[] => [...registry.values()].flatMap((h) => [...(h as FakeHighlight).ranges].map((r) => r.toString())).sort();

describe('the table', () => {
  it('only Korean is prepared before a scan', () => { expect([...PREPARE_BEFORE_SCAN]).toEqual(['ko']); });
});

describe.each(PAGES)('a $lang page', ({ lang, variety, html }) => {
  async function scan(withPreparer: boolean): Promise<{ marks: string[]; fetched: string[] }> {
    const fetched: string[] = [];
    const f = (async (input: RequestInfo | URL) => { fetched.push(String(input)); return new Response('', { status: 404 }); }) as typeof fetch;
    const preparer = createLexiconPreparer(chrome, f, 'http://assets.local/');
    setBody(`<p>${html}</p>`);
    document.documentElement.lang = lang;
    rig = makeRig({ analysers: ['sq', lang] });
    active = new ActiveMode({ doc: document, controller: rig.controller, adapters: rig.deps.adapters, ui: rig.ui, adapterOf: getAnalyser, profile, viewport: 'all', ...(withPreparer ? { prepareLexicon: (l: string, t: string) => preparer.prepare(l, t) } : {}) });
    await active.start({ speak: false });
    const marks = marked();
    active.stop(); active = undefined; rig.controller.dispose(); rig = undefined; registry.clear();
    return { marks, fetched };
  }

  it('Active requests no lexicon file, and marks what it marks with no preparer at all', async () => {
    const without = await scan(false);
    const withIt = await scan(true);
    expect(withIt.fetched).toEqual([]);
    expect(withIt.marks).toEqual(without.marks);
  });

  it('Reading Analysis requests no lexicon file and builds the table it builds with no preparer', async () => {
    const run = async (withPreparer: boolean) => {
      const fetched: string[] = [];
      const f = (async (input: RequestInfo | URL) => { fetched.push(String(input)); return new Response('', { status: 404 }); }) as typeof fetch;
      const preparer = createLexiconPreparer(chrome, f, 'http://assets.local/');
      setBody(`<main><p>${html}</p></main>`);
      document.documentElement.lang = lang;
      const knowledge = async (req: { op: string; words?: unknown[]; snapshot?: string }) => req.op === 'snapshot'
        ? { ok: true as const, op: 'snapshot' as const, snapshot: { id: 's1', authority: 'device', state: 'verified', verifiedAt: 1, unsent: 0 } }
        : { ok: true as const, op: 'classify' as const, snapshot: req.snapshot, verdicts: (req.words ?? []).map(() => ['below', 'new']), asked: (req.words ?? []).length, answered: (req.words ?? []).length };
      const session = createReadingSession({ doc: document, adapters: createAdapters(document), languages: [lang], adapterOf: (l) => (l === lang ? getAnalyser(lang) : undefined), knowledge: knowledge as never, ...(withPreparer ? { prepareLexicon: (l: string, t: string) => preparer.prepare(l, t) } : {}) });
      session.handle({ type: MSG.readingAnalysis, op: 'start', languageId: lang, ...(variety ? { varietyId: variety } : {}) });
      const t0 = Date.now();
      while (!['done', 'failed', 'canceled'].includes(session.status().stage) && Date.now() - t0 < 20_000) await new Promise((r) => setTimeout(r, 5));
      const out = { stage: session.status().stage, counts: session.status().result?.coverage.counts, fetched };
      session.dispose();
      return out;
    };
    const without = await run(false);
    const withIt = await run(true);
    expect(withIt.fetched).toEqual([]);
    expect(withIt.stage).toBe(without.stage);
    expect(withIt.counts).toEqual(without.counts);
  }, 60_000);
});
