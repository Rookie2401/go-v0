// @vitest-environment node
/**
 * The Korean DECK AUDIT in the suite (the full audit is `npm run ko:deck-audit`, which writes docs/korean/DECK-AUDIT.md; method in scripts/ko-deck-audit.mts).
 * Runs the real path (page-scan naming, the pack facts GoReview builds a card from, the review gate) over:
 *   - the common-word sweep's own sentences, always (they are in the repository);
 *   - a FIXED sample of the treebank's DEVELOPMENT part (every 12th sentence of the first 1200), when data/raw/ud-ko is present (skipped otherwise, like the shard tests).
 * It fails on any FALSE card (part 1) or UNKNOWN / fragment card that is not on the recorded list test/certification/korean-deck-audit.known.json, and on any
 * recorded entry that no longer occurs: the list may only SHRINK (the sweep's pattern). `KO_AUDIT_WRITE=1 npx vitest run test/certification/korean-deck-audit.test.ts`
 * rewrites the list from what is found now: use it only to RECORD a decision, never to hide a regression.
 * Part-2 cards (false only by the annotation's convention) are counted, not failed.
 * WOULD SKIP without public/lexicon/ko and public/dict/ko (all), without data/raw/ud-ko (the development sample).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATA_PRESENT, devSentences, loadShards, runAudit, sweepSentences, type AuditSentence, type Figures } from '../../scripts/ko-deck-audit.mts';

const KNOWN_PATH = path.resolve(__dirname, 'korean-deck-audit.known.json');
const BUILT = fs.existsSync(path.resolve(__dirname, '../../public/dict/ko/manifest.json')) && fs.existsSync(path.resolve(__dirname, '../../public/lexicon/ko/standard/manifest.json'));
const known: { sweep: string[]; dev: string[]; unknown: string[] } = fs.existsSync(KNOWN_PATH) ? JSON.parse(fs.readFileSync(KNOWN_PATH, 'utf8')) : { sweep: [], dev: [], unknown: [] };
const WRITE = process.env.KO_AUDIT_WRITE === '1';
const keyOf = (c: { surface: string; lemma: string; sentence: string }): string => `${c.surface}→${c.lemma}|${c.sentence.slice(0, 24)}`;

const sample = (): AuditSentence[] => (DATA_PRESENT ? devSentences().slice(0, 1200).filter((_, i) => i % 12 === 0).map((g) => ({ text: g.text, gold: g })) : []);
const found: Record<string, Figures> = {};

describe.skipIf(!BUILT)('the Korean deck audit', () => {
  beforeAll(async () => { await loadShards([...sweepSentences().map((s) => s.text), ...sample().map((s) => s.text)]); }, 120_000);

  it('the sweep\'s sentences: no false card and no unknown card that is not recorded; the recorded list only shrinks', async () => {
    const fig = (found.sweep = await runAudit(sweepSentences()));
    expect(fig.tokens).toBeGreaterThan(5000);
    expect(fig.unitsWith).toBeGreaterThan(500);
    expect(fig.admittedOccurrencesWith).toBeLessThan(fig.admittedOccurrencesWithout); // the gate holds words back
    const falses = [...new Set(fig.falseWith.map(keyOf))];
    expect(falses.filter((k) => !known.sweep.includes(k)), 'a NEW false card').toEqual([]);
    expect(known.sweep.filter((k) => !falses.includes(k)), 'a recorded false card that is gone: remove it from the list').toEqual([]);
    expect(fig.unknown.map(keyOf).filter((k) => !known.unknown.includes(k)), 'an unknown or fragment card').toEqual([]);
  }, 120_000);

  it.skipIf(!DATA_PRESENT)('a fixed sample of the development part: the same, judged against the treebank\'s gold and its lenient alternatives', async () => {
    const fig = (found.dev = await runAudit(sample(), { trainForms: new Set() }));
    expect(fig.sentences).toBeGreaterThan(80);
    expect(fig.judged).toBeGreaterThan(500);
    const falses = [...new Set(fig.falseWith.map(keyOf))];
    expect(falses.filter((k) => !known.dev.includes(k)), 'a NEW false card').toEqual([]);
    expect(known.dev.filter((k) => !falses.includes(k)), 'a recorded false card that is gone: remove it from the list').toEqual([]);
    expect(fig.unknown.map(keyOf).filter((k) => !known.unknown.includes(k)), 'an unknown or fragment card').toEqual([]);
  }, 180_000);

  it('records the list when KO_AUDIT_WRITE=1', () => {
    if (!WRITE) return;
    const out = {
      sweep: [...new Set((found.sweep?.falseWith ?? []).map(keyOf))].sort(), dev: [...new Set((found.dev?.falseWith ?? []).map(keyOf))].sort(),
      unknown: [...new Set([...(found.sweep?.unknown ?? []), ...(found.dev?.unknown ?? [])].map(keyOf))].sort(),
    };
    fs.writeFileSync(KNOWN_PATH, JSON.stringify(out, null, 1));
  });
});
