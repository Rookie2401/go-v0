// @vitest-environment jsdom
/**
 * Phase I parity gate: every registered, installable GoLearn language must be
 * executable through the same page-analysis path. No language-specific fake
 * tokenizer is used here; the fixtures are the packs' own validation cases.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKS } from '../../packages/language-packs/src/registry';
import { loadAnalyser } from '../../packages/golearn-extension/src/analysers/loaders';
import { getAnalyser } from '../../packages/golearn-extension/src/parser';
import { createScanner } from '../../packages/golearn-extension/src/active/scan';
import { analyzePage } from '../../packages/golearn-extension/src/reading/analyze';
import { declaredTextVariety, needsTextVariety, scopedVarietyUnitId, validTextVariety } from '../../packages/golearn-extension/src/reading/varieties';
import type { ProfileReply, KnowledgeView } from '../../packages/golearn-extension/src/protocol';

const VARIETY: Readonly<Record<string, string>> = { he: 'he-bib', el: 'el-koi' };
const langs = Object.keys(PACKS);
let rects: PropertyDescriptor | undefined;
beforeAll(() => {
  rects = Object.getOwnPropertyDescriptor(Element.prototype, 'getClientRects');
  Object.defineProperty(Element.prototype, 'getClientRects', {
    configurable: true, value: () => [{ top: 0, left: 0, bottom: 20, right: 200, width: 200, height: 20 }],
  });
});
afterAll(() => {
  if (rects) Object.defineProperty(Element.prototype, 'getClientRects', rects);
  else delete (Element.prototype as unknown as Record<string, unknown>).getClientRects;
  document.body.replaceChildren();
});

function makeDocument(word: string): void {
  document.body.replaceChildren();
  const main = document.createElement('main');
  const p = document.createElement('p');
  p.textContent = word + ' ' + word;
  main.append(p);
  document.body.append(main);
}
function local(rows: Record<string, KnowledgeView>) {
  const batches: string[][] = [];
  const bridge = {
    readingProfile: async ({ unitIds }: { unitIds: string[] }) => {
      batches.push([...unitIds]);
      return {
        ok: true, connected: false, source: 'device', depth: 'brief', depthOrigin: 'default',
        rows: Object.fromEntries(unitIds.filter((id) => rows[id]).map((id) => [id, rows[id]])),
      } satisfies ProfileReply;
    },
  } as unknown as Parameters<typeof analyzePage>[2];
  return { bridge, batches };
}

describe('every GoLearn language pack can be analyzed', () => {
  it.each(langs)('%s uses its real adapter, the same Repository bridge and truthful token accounting', async (languageId) => {
    const pack = PACKS[languageId];
    const fixture = pack.validation.find((v) => v.expect.readings !== 'none' && !!v.surface);
    expect(fixture, languageId + ' needs a validated test word').toBeDefined();
    const adapter = await loadAnalyser(languageId);
    expect(adapter, languageId + ' must have a registered analyser').toBeDefined();
    makeDocument(fixture!.surface);
    const varietyId = VARIETY[languageId];
    const scanner = createScanner({
      doc: document, adapterOf: getAnalyser, viewport: 'all', requireUnambiguousLemma: true, varietyId,
    });
    const tokens = scanner.tokensIn(scanner.textNodes(document), languageId);
    expect(tokens.length, languageId + ' did not tokenize its own validated word').toBe(2);

    const candidates = tokens.filter((t) => t.known && t.ids.length > 1);
    const rows: Record<string, KnowledgeView> = {};
    for (const t of candidates) {
      const id = varietyId ? scopedVarietyUnitId(t.ids[0], languageId, varietyId) : t.ids[0];
      if (id) rows[id] = { unitId: id, level: 'known', dimensions: {} };
    }
    const { bridge, batches } = local(rows);
    const result = await analyzePage(document, languageId, bridge, getAnalyser, new AbortController().signal, varietyId);
    expect(result.ok, languageId + ' could not complete its page analysis').toBe(true);
    if (!result.ok) return;
    expect(result.coverage.totalOccurrences).toBe(2);
    expect(result.coverage.languageId).toBe(languageId);
    expect(result.coverage.occurrences.confidentKnown +
      result.coverage.occurrences.familiarOnly +
      result.coverage.occurrences.newOrSeen +
      result.coverage.occurrences.unrecorded +
      result.coverage.occurrences.unresolved).toBe(2);
    expect(result.coverage.confidentCoverage).toBeGreaterThanOrEqual(0);
    expect(result.coverage.familiarCoverage).toBeGreaterThanOrEqual(result.coverage.confidentCoverage!);
    expect(batches.every((b) => b.length <= 60)).toBe(true);
    if (candidates.length) expect(result.coverage.confidentCoverage).toBeGreaterThan(0);
  }, 45000);

  it.each(['he', 'el'])('%s never transfers legacy cross-period knowledge into a confident estimate', async (languageId) => {
    const pack = PACKS[languageId];
    await loadAnalyser(languageId);
    makeDocument(pack.validation[0].surface);
    const adapter = getAnalyser(languageId)!;
    const form = `form:${languageId}:${adapter.normalize(pack.validation[0].surface)}`;
    const { bridge } = local({ [form]: { unitId: form, level: 'automatic', dimensions: {} } });
    const result = await analyzePage(document, languageId, bridge, getAnalyser, new AbortController().signal, VARIETY[languageId]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.coverage.confidentCoverage).toBe(0);
    expect(result.coverage.familiarCoverage).toBe(0);
    expect(result.coverage.occurrences.legacyShared).toBeGreaterThanOrEqual(0);
  });

  it('Hebrew / Greek require valid period choice but non-period languages do not', async () => {
    await loadAnalyser('he');
    makeDocument('אֱלֹהִ֑ים');
    const { bridge } = local({});
    expect(await analyzePage(document, 'he', bridge, getAnalyser, new AbortController().signal))
      .toEqual({ ok: false, code: 'variety-required' });
    expect(validTextVariety('he', 'el-koi')).toBe(false);
    expect(validTextVariety('he', 'he-bib')).toBe(true);
    expect(needsTextVariety('arc')).toBe(false);
  });
});

describe('document language evidence never guesses an historical period', () => {
  it('recognizes explicit ancient tags, not generic or competing tags', () => {
    expect(declaredTextVariety('he', 'hbo')).toBe('he-bib');
    expect(declaredTextVariety('el', 'grc-x-koine')).toBe('el-koi');
    expect(declaredTextVariety('he', 'he')).toBeUndefined();
    expect(declaredTextVariety('el', 'grc')).toBeUndefined();
    expect(declaredTextVariety('el', 'el')).toBeUndefined();
    expect(declaredTextVariety('arc', 'hbo')).toBeUndefined();
  });
});
