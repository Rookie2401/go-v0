// @vitest-environment node
/**
 * The French pack's evidence (packages/language-packs/src/evidence.ts PACK_EVIDENCE.fr) is the committed report's own counts
 * (docs/french/EVALUATION.json, written by scripts/fr-eval-ud.mts --json) and the lemma list's own size: a figure here that differs
 * from its file fails. Nothing here judges the French; it keeps the claims and the files in step.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_EVIDENCE } from '../../packages/language-packs/src/evidence';
import { PACKS, packCapabilities } from '../../packages/language-packs/src';
import { FR_FULL_SOURCE } from '../../src/adapters/french/lexicon-full-data';
import { frAdapter } from '../../src/adapters/fr';

const root = path.resolve(__dirname, '../..');
interface Tally { ok: number; n: number }
interface Run { analyser: string; sentences: number; lemmaFirst: Tally; uposStrict: Tally; coverage: { aligned: number; anyReading: number; vouched: number } }
const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/french/EVALUATION.json'), 'utf8')) as { measuredOn: string; gold: string; conventions: string; runs: Record<'dev' | 'test', Record<'hand' | 'lemmas', Run>> };
const pct = (t: Tally): number => Math.round((t.ok / t.n) * 10000) / 100;

describe('French evidence: the figures are the report’s', () => {
  it('the report holds both parts of the treebank, each with the hand list alone and with the lemma list, for the analyser that ships', () => {
    for (const split of ['dev', 'test'] as const) for (const kind of ['hand', 'lemmas'] as const) {
      const r = report.runs[split][kind];
      expect(r.analyser, `${split} ${kind}`).toBe(`adapter-fr@${frAdapter.version}`);
      expect(r.lemmaFirst.n, `${split} ${kind}`).toBeGreaterThan(5000);
      expect(r.lemmaFirst.ok, `${split} ${kind}`).toBeLessThanOrEqual(r.lemmaFirst.n);
    }
    expect(report.gold).toMatch(/annotated by people/);
    expect(report.conventions).toMatch(/test split was run once/);
    // the lemma list helps: it is what the extension has, and the evidence quotes that run
    expect(pct(report.runs.test.lemmas.lemmaFirst)).toBeGreaterThan(pct(report.runs.test.hand.lemmaFirst));
  });

  it('the two measurements are the lemma-list runs of the report, the test part held out and the dev part not', () => {
    const [test, dev] = PACK_EVIDENCE.fr.lemmaMeasurements;
    expect([test.id, test.items, test.lemmaAccuracy, test.heldOut]).toEqual(['ud-gsd-test', report.runs.test.lemmas.lemmaFirst.n, pct(report.runs.test.lemmas.lemmaFirst), true]);
    expect([dev.id, dev.items, dev.lemmaAccuracy, dev.heldOut]).toEqual(['ud-gsd-dev', report.runs.dev.lemmas.lemmaFirst.n, pct(report.runs.dev.lemmas.lemmaFirst), false]);
    for (const m of [test, dev]) expect(m).toMatchObject({ goldKind: 'human-treebank', analyser: `adapter-fr@${frAdapter.version}`, measuredOn: report.measuredOn, source: 'docs/french/EVALUATION.json' });
  });

  it('the sources are the lemma list the analyser reads (its own count) and the form index of the declared dictionary', () => {
    const [lexicon, forms] = PACK_EVIDENCE.fr.lemmaSources;
    const total = Object.values(FR_FULL_SOURCE.entries as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(lexicon).toMatchObject({ kind: 'analyser-lexicon', id: FR_FULL_SOURCE.id, source: 'src/adapters/french/lexicon-full-data.ts' });
    expect(lexicon.size).toEqual({ count: total, unit: 'entries' });
    expect(lexicon.id).toBe(PACKS.fr.lexical.dictionary!.id);
    expect(forms).toMatchObject({ kind: 'dictionary-forms-index', id: PACKS.fr.lexical.dictionary!.id });
  });

  it('92 % on a human treebank is below the bar: French lemmas are limited, not dependable, and the pack stays unreviewed', () => {
    expect(packCapabilities('fr')!.lemma.quality).toBe('limited');
    expect(PACKS.fr.rights.reviewStatus).toBe('machine-drafted');
    expect(PACKS.fr.level).toBe('experimental');
  });
});
