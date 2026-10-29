/**
 * The GoTell boundary (docs/ecosystem/GOREVIEW-APP-DESIGN.md §3, §4): GoTell is an independent sibling of GoReview. In this
 * phase it imports the Repository contract and the typed API client only, and it initialises with no deck, no session and
 * no review event.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createGoTellWorkspace, wordsFrom, type GoTellApi } from '../../packages/gotell/src';
import type { PrivateDocument, UnitKnowledge } from '../../packages/repository-contract/src';

const SRC = path.resolve(__dirname, '../../packages/gotell');
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? (d.name === 'node_modules' ? [] : files(p)) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
});
const importsOf = (file: string): string[] => [...fs.readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

describe('imports', () => {
  it('imports nothing from GoReview, the shell, GoLearn or GoListen — only the contract, the language packs, the sync client and the API client', () => {
    const all = files(SRC);
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) {
      for (const i of importsOf(f)) {
        if (i.startsWith('node:')) continue;
        // inside the package: './x' or '../x' that stays under packages/gotell
        if (i.startsWith('.') && !i.includes('packages/') && path.resolve(path.dirname(f), i).startsWith(SRC)) continue;
        expect(/goreview|gopractice|golearn|golisten/.test(i), `${f} imports ${i}`).toBe(false);
        expect(/repository-contract\/src(\/[\w-]+)?$|repository-sync\/src(\/[\w-]+)?$|repository-service\/src\/api$|language-packs\/src(\/[\w/-]+)?$/.test(i), `${f} imports ${i}`).toBe(true);
      }
    }
  });

  it('does not mention GoReview vocabulary in code (no deck, no scheduler, no session)', () => {
    for (const f of files(SRC)) {
      const code = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
      expect(/\bdeck\b|foldDeck|createSessionRunner|createFsrsScheduler|goreview/i.test(code), f).toBe(false);
    }
  });
});

const doc = (over: Partial<PrivateDocument>): PrivateDocument => ({
  docId: 'd1', learnerId: 'L1', languageId: 'sq', kind: 'draft', body: 'text', revision: 1, deviceId: 'dev', updatedAt: '2026-10-08T10:00:00.000Z', ...over,
});

function fakeApi(opts: { knowledge?: UnitKnowledge[]; docs?: PrivateDocument[]; down?: boolean } = {}): GoTellApi & { puts: Array<{ id: string; expected: number }> } {
  const docs = new Map((opts.docs ?? []).map((d) => [d.docId, d]));
  const puts: Array<{ id: string; expected: number }> = [];
  const down = () => { if (opts.down) throw new Error('network down'); };
  return {
    puts,
    async knowledge() { down(); return { ok: true, status: 200, data: { knowledge: opts.knowledge ?? [] } }; },
    async listDocuments() { down(); return { ok: true, status: 200, data: { documents: [...docs.values()].map(({ body: _b, ...m }) => m) } }; },
    async getDocument(id) { down(); const d = docs.get(id); return d ? { ok: true, status: 200, data: { document: d } } : { ok: false, status: 404, error: 'x', message: 'missing', body: {} }; },
    async putDocument(id, d, expected) {
      down(); puts.push({ id, expected });
      const cur = docs.get(id);
      if ((cur?.revision ?? 0) !== expected) return { ok: false, status: 409, error: 'conflict', message: 'changed', body: { current: cur } };
      const next = doc({ docId: id, ...d, revision: expected + 1 });
      docs.set(id, next);
      const { body: _b, ...m } = next;
      return { ok: true, status: 200, data: { document: m } };
    },
    async deleteDocument(id) { docs.delete(id); return { ok: true, status: 204, data: null }; },
  };
}

describe('initialisation', () => {
  it('works with an empty log: no deck, no session, no review event, no knowledge', async () => {
    const api = fakeApi();
    const ws = createGoTellWorkspace({ api, identity: { learnerId: 'L1' }, languageId: 'sq' });
    const snap = await ws.init();
    expect(snap).toEqual({ languageId: 'sq', words: [], drafts: [], notes: [] });
    expect(ws.wordsYouCanUse()).toEqual([]);
    expect(ws.drafts()).toEqual([]);
    expect(ws.revisionOf('anything')).toBe(0);
    expect(api.puts).toEqual([]);
  });

  it('turns a failure into a note instead of throwing', async () => {
    const ws = createGoTellWorkspace({ api: fakeApi({ down: true }), identity: { learnerId: 'L1' }, languageId: 'sq' });
    const snap = await ws.init();
    expect(snap.notes).toHaveLength(2);
    expect(snap.words).toEqual([]);
  });

  it('saves with revisions and refuses to overwrite a newer one', async () => {
    const api = fakeApi({ docs: [doc({ docId: 'a', revision: 3 })] });
    const ws = createGoTellWorkspace({ api, identity: { learnerId: 'L1' }, languageId: 'sq', newId: () => 'fresh' });
    await ws.init();
    expect(ws.revisionOf('a')).toBe(3);
    const first = await ws.save({ body: 'one' });
    expect(first).toMatchObject({ ok: true, doc: { docId: 'fresh', revision: 1 } });
    const second = await ws.save({ docId: 'fresh', body: 'two' });
    expect(second).toMatchObject({ ok: true, doc: { revision: 2 } });
    expect(api.puts).toEqual([{ id: 'fresh', expected: 0 }, { id: 'fresh', expected: 1 }]);
    const stale = createGoTellWorkspace({ api, identity: { learnerId: 'L1' }, languageId: 'sq' });
    const lost = await stale.save({ docId: 'fresh', body: 'stale' });
    expect(lost).toMatchObject({ ok: false, conflict: true });
  });
});

describe('words you can use', () => {
  it('needs production evidence in this language; recognition alone does not count', () => {
    const row = (unitId: string, languageId: string, dims: Record<string, Partial<{ observations: number; positive: number; score: number }>>): UnitKnowledge => ({
      learnerId: 'L1', unitId, languageId,
      dimensions: Object.fromEntries(['exposure', 'assistedRecognition', 'readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding']
        .map((d) => [d, { score: 0, confidence: 0.5, observations: 0, positive: 0, negative: 0, weight: 0, contexts: 0, ...dims[d] }])) as UnknownDims,
      retention: { estimate: 0, halfLifeDays: 1, basedOn: 'none' }, level: 'seen', encounters: 1, uncertainty: 1, modelVersion: 't', basis: { events: 0 },
    });
    type UnknownDims = UnitKnowledge['dimensions'];
    const words = wordsFrom([
      row('lemma:sq:a:NOUN', 'sq', { productiveRetrieval: { observations: 2, positive: 2, score: 0.7 } }),
      row('lemma:sq:b:NOUN', 'sq', { readingRecognition: { observations: 9, positive: 9, score: 0.99 } }),
      row('lemma:sq:c:NOUN', 'sq', { contextualProduction: { observations: 1, positive: 1, score: 0.9 }, productiveRetrieval: { observations: 1, positive: 1, score: 0.4 } }),
      row('lemma:de:d:NOUN', 'de', { productiveRetrieval: { observations: 5, positive: 5, score: 1 } }),
      row('lemma:sq:e:NOUN', 'sq', { productiveRetrieval: { observations: 3, positive: 0, score: 0.1 } }),
    ], 'sq');
    expect(words.map((w) => w.label)).toEqual(['c', 'a']);
    expect(words[0].dimensions).toEqual(['productiveRetrieval', 'contextualProduction']);
    expect(words[0].observations).toBe(2);
  });
});
