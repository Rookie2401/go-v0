// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { analyzePage } from '../../packages/golearn-extension/src/reading/analyze';
import { getAnalyser } from '../../packages/golearn-extension/src/parser';
import type { KnowledgeView, ProfileReply } from '../../packages/golearn-extension/src/protocol';

let beforeRects: PropertyDescriptor | undefined;
beforeEach(() => {
  beforeRects = Object.getOwnPropertyDescriptor(Element.prototype, 'getClientRects');
  Object.defineProperty(Element.prototype, 'getClientRects', {
    configurable: true, value: () => [{ top: 0, left: 0, bottom: 20, right: 200, width: 200, height: 20 }],
  });
  document.body.innerHTML = '<article><p>shtëpinë shtëpinë</p></article>';
});
afterEach(() => {
  if (beforeRects) Object.defineProperty(Element.prototype, 'getClientRects', beforeRects);
  else delete (Element.prototype as unknown as Record<string, unknown>).getClientRects;
  document.body.innerHTML = '';
});

const knownForm: KnowledgeView = {
  unitId: 'form:sq:shtëpinë', level: 'known', dimensions: {},
};
function bridgeWithRows(rows: Record<string, KnowledgeView>, error?: string) {
  const calls: string[][] = [];
  const bridge = {
    readingProfile: async ({ unitIds }: { unitIds: string[] }) => {
      calls.push([...unitIds]);
      const selected = Object.fromEntries(unitIds.filter((id) => !!rows[id]).map((id) => [id, rows[id]]));
      return { ok: true, connected: false, source: 'device', rows: selected, error, depth: 'brief', depthOrigin: 'default' } satisfies ProfileReply;
    },
  } as unknown as Parameters<typeof analyzePage>[2];
  return { bridge, calls };
}

it('counts repeated known inflected forms, queries the device, and excludes page chrome', async () => {
  document.body.innerHTML = '<nav>shtëpinë</nav><article><p>shtëpinë shtëpinë</p><aside>shtëpinë</aside></article>';
  const { bridge, calls } = bridgeWithRows({ [knownForm.unitId]: knownForm });
  const reply = await analyzePage(document, 'sq', bridge, getAnalyser, new AbortController().signal);
  expect(reply.ok).toBe(true);
  if (!reply.ok) return;
  expect(reply.coverage.totalOccurrences).toBe(2);
  expect(reply.coverage.occurrences.confidentKnown).toBe(2);
  expect(reply.coverage.confidentCoverage).toBe(100);
  expect(reply.coverage.uniqueResolvedVocabulary).toBe(1);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.flat()).toContain('form:sq:shtëpinë');
  expect(calls.every((batch) => batch.length <= 60)).toBe(true);
});

it('does not silently classify every word as unknown when local knowledge is unavailable', async () => {
  const { bridge } = bridgeWithRows({}, 'device-unavailable');
  const reply = await analyzePage(document, 'sq', bridge, getAnalyser, new AbortController().signal);
  expect(reply).toEqual({ ok: false, code: 'unavailable' });
});

it('uses the existing forms index for an inflection missing from the analyser without writing word state', async () => {
  document.body.innerHTML = '<article><p>lexitet lexitet</p></article>';
  let dictionaryCalls = 0;
  let profileCalls = 0;
  const bridge = {
    confirmForms: async () => {
      dictionaryCalls++;
      return { ok: true, forms: { lexitet: ['lexo', 'VERB'] } };
    },
    readingProfile: async ({ unitIds }: { unitIds: string[] }) => {
      profileCalls++;
      return {
        ok: true, connected: false, source: 'device', depth: 'brief', depthOrigin: 'default',
        rows: unitIds.includes('form:sq:lexitet')
          ? { 'form:sq:lexitet': { unitId: 'form:sq:lexitet', level: 'known', dimensions: {} } } : {},
      } satisfies ProfileReply;
    },
  } as unknown as Parameters<typeof analyzePage>[2];
  const fake: Parameters<typeof analyzePage>[3] = () => ({
    tokenize: (s: string) => [...s.matchAll(/\p{L}+/gu)].map((m) => ({
      surface: m[0], start: m.index!, end: m.index! + m[0].length, isWord: true,
    })),
    analyze: (ts: unknown[]) => ts.map(() => ({ candidates: [] })),
    normalize: (s: string) => s.toLowerCase(),
  }) as never;
  const reply = await analyzePage(document, 'sq', bridge, fake, new AbortController().signal);
  expect(reply.ok).toBe(true);
  if (!reply.ok) return;
  expect(reply.coverage.totalOccurrences).toBe(2);
  expect(reply.coverage.confidentCoverage).toBe(100);
  expect(dictionaryCalls).toBe(1);
  expect(profileCalls).toBe(1);
});

it('does not credit a lemma when an analysed word has competing confident parses', async () => {
  document.body.innerHTML = '<article><p>ambigua</p></article>';
  let dictionaryCalls = 0, profileCalls = 0;
  const bridge = {
    confirmForms: async () => { dictionaryCalls++; return { ok: true, forms: { ambigua: ['one', 'NOUN'] } }; },
    readingProfile: async () => { profileCalls++; throw new Error('Ambiguous tokens must not ask for a profile'); },
  } as unknown as Parameters<typeof analyzePage>[2];
  const fake: Parameters<typeof analyzePage>[3] = () => ({
    tokenize: (s: string) => [{ surface: s, start: 0, end: s.length, isWord: true }],
    analyze: () => [{ candidates: [
      { lemma: 'one', pos: 'NOUN', confidence: 0.99, unconfirmed: false },
      { lemma: 'two', pos: 'NOUN', confidence: 0.98, unconfirmed: false },
    ] }],
    normalize: (s: string) => s.toLowerCase(),
  }) as never;
  const reply = await analyzePage(document, 'sq', bridge, fake, new AbortController().signal);
  expect(reply.ok).toBe(true);
  if (!reply.ok) return;
  expect(reply.coverage.occurrences.unresolved).toBe(1);
  expect(reply.coverage.confidentCoverage).toBe(0);
  expect(dictionaryCalls).toBe(0);
  expect(profileCalls).toBe(0);
});

it('refuses restricted readers before extracting or consulting vocabulary data', async () => {
  // The registry rejects the reader before any DOM extraction, so an URL-bearing
  // document stub tests the policy without depending on jsdom's optional typings.
  const restricted = { location: {
    href: 'https://read.amazon.com/kp/reader', protocol: 'https:',
    host: 'read.amazon.com', pathname: '/kp/reader',
  } } as unknown as Document;
  const { bridge, calls } = bridgeWithRows({ [knownForm.unitId]: knownForm });
  const result = await analyzePage(restricted, 'sq', bridge, getAnalyser, new AbortController().signal);
  expect(result).toEqual({ ok: false, code: 'unsupported-page' });
  expect(calls).toEqual([]);
});
