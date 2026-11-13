// The Latin ladder's controlled units (data/ladder/la/units), read with the FULL Latin lexicon: every word has a confirmed reading and no
// sentence raises a writing alarm. The coverage, new-word and recycling gate itself is test/ladder/gate.test.ts (all ladders); this adds
// what the gate does not check. Units are machine drafts: this is a check of coverage and of the five rules, not of style.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { laAdapter } from '../../src/adapters/la';
import { loadLatinLexicon } from '../../src/adapters/latin/lexicon-load';

beforeAll(async () => { await loadLatinLexicon(); }, 120_000);

const root = path.resolve(__dirname, '../../data/ladder/la');
interface Unit { id: string; stage: string; kind: string; document?: string; textId?: string }
const ladder = fs.existsSync(path.join(root, 'ladder.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'ladder.json'), 'utf8')) as { lang: string; after?: string; units: Unit[] } : undefined;

function sentencesOf(rel: string): { id: string; text: string }[] {
  const doc = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')) as { sections: { paragraphs: { sentences: { id: string; text: string }[] }[] }[]; pipeline?: { state: string } };
  return doc.sections.flatMap((s) => s.paragraphs.flatMap((p) => p.sentences));
}

describe('the Latin ladder', () => {
  it('exists, follows Stage 0 and is all machine drafts', () => {
    expect(ladder).toBeDefined();
    expect(ladder!).toMatchObject({ lang: 'la', after: 'stage0' });
    expect(ladder!.units.length).toBeGreaterThanOrEqual(10);
    for (const u of ladder!.units.filter((x) => x.document)) {
      const doc = JSON.parse(fs.readFileSync(path.join(root, u.document!), 'utf8')) as { pipeline?: { state: string } };
      expect(doc.pipeline?.state, u.id).toBe('machine-draft');
    }
  });

  it('every word of every controlled unit has a confirmed reading', () => {
    const unread = (ladder?.units ?? []).filter((u) => u.document).flatMap((u) => sentencesOf(u.document!).flatMap((s) => {
      const tokens = laAdapter.tokenize(s.text);
      const an = laAdapter.analyze(tokens);
      return tokens.flatMap((t, i) => (t.isWord && (!an[i].candidates[0]?.lemma || an[i].candidates[0]?.unconfirmed) ? [`${u.id} ${s.id}: ${t.surface}`] : []));
    }));
    expect(unread).toEqual([]);
  }, 120_000);

  it('no sentence of a controlled unit raises a writing alarm', () => {
    const alarms = (ladder?.units ?? []).filter((u) => u.document).flatMap((u) => sentencesOf(u.document!).flatMap((s) => {
      const tokens = laAdapter.tokenize(s.text);
      return laAdapter.checkProduction(tokens, laAdapter.analyze(tokens), s.text).map((e) => `${u.id} ${s.id}: ${e.message} — ${s.text}`);
    }));
    expect(alarms).toEqual([]);
  }, 120_000);
});
