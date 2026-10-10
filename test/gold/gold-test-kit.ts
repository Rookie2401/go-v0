/**
 * Shared body of the gold tests (Linguistic Engine V2, Stage 8). One call per language (test/gold/<lang>.test.ts).
 *
 * The gold labels are AI-judged and unreviewed (no native speaker): a floor here is the number MEASURED on 2026-10-10 minus two
 * points (a ceiling: plus two points), so it guards against regression, it does not certify correctness. The floors live in floors.ts.
 * The `unseen` set is checked structurally only: it is never a target of tuning.
 */
import { describe, expect, it } from 'vitest';
import { MIN_ITEMS, dictShardsPresent, loadGold, paradigmRoundTrip, scoreSet, validateGold } from '../../scripts/gold-lib.mts';
import type { GoldFile, GoldSet, SetResult } from '../../scripts/gold-lib.mts';
import { FLOORS } from './floors';

export function defineGoldTests(lang: string): void {
  const sets: GoldSet[] = ['dev', 'hard', 'unseen'];
  const files: Partial<Record<GoldSet, GoldFile>> = {};
  for (const s of sets) files[s] = loadGold(lang, s);

  describe(`gold sets: ${lang} (structure)`, () => {
    for (const s of sets) {
      it(`${s}: file exists, header, >= ${MIN_ITEMS[s]} items, valid offsets`, () => {
        const f = files[s];
        expect(f, `data/gold/${lang}/${s} file is missing`).toBeDefined();
        const errs = validateGold(f!, lang, s);
        expect(errs, errs.slice(0, 5).join('\n')).toEqual([]);
        expect(f!.labelled_by).toContain('AI-judged, unreviewed');
        expect(f!.items.length).toBeGreaterThanOrEqual(MIN_ITEMS[s]);
      });
    }
    it('hard: has the expected and the wrong analysis and why it is hard', () => {
      for (const it2 of files.hard!.items) {
        expect(it2.wrong, it2.id).toBeDefined();
        expect(it2.why_hard?.length ?? 0, it2.id).toBeGreaterThan(5);
      }
    });
    it('unseen shares no sentence+offset with the dev set', () => {
      const dev = new Set(files.dev!.items.map((x) => `${x.sentence}|${x.start}`));
      expect(files.unseen!.items.filter((x) => dev.has(`${x.sentence}|${x.start}`)).length).toBe(0);
    });
  });

  const fl = FLOORS[lang];
  const scored: Partial<Record<GoldSet, SetResult>> = {};
  const get = async (s: GoldSet): Promise<SetResult> => (scored[s] ??= await scoreSet(lang, s, files[s]!));

  describe(`gold sets: ${lang} (measured floors)`, () => {
    for (const s of ['dev', 'hard'] as const) {
      it(`${s}: lemma, POS and feature floors; conflict ceiling`, async () => {
        const r = await get(s);
        const f = fl[s];
        expect(r.errors, 'parser threw on a gold item').toBe(0);
        expect(r.lemma / r.scored).toBeGreaterThanOrEqual(f.lemma);
        expect(r.pos / r.scored).toBeGreaterThanOrEqual(f.pos);
        expect(r.f1 ?? 0).toBeGreaterThanOrEqual(f.f1);
        expect(r.conflictRate).toBeLessThanOrEqual(f.conflictMax);
      }, 55_000);
    }
    it('dev: the gold word is one engine token at least as often as measured', async () => {
      expect((await get('dev')).tokenAligned).toBeGreaterThanOrEqual(fl.tokenAligned);
    }, 55_000);
    it('paradigm round trip: the share of cells that analyse back to lemma and features', () => {
      const rt = paradigmRoundTrip(lang, sets.map((s) => files[s]!).filter(Boolean));
      expect(rt.share ?? 0).toBeGreaterThanOrEqual(fl.roundTrip);
    }, 55_000);
  });

  describe.skipIf(!dictShardsPresent(lang))(`gold sets: ${lang} (dictionary floors)`, () => {
    it('dev: dictionary hit rate and definition availability', async () => {
      const r = await get('dev');
      expect(r.dictionary.hit ?? 0).toBeGreaterThanOrEqual(fl.dictHit);
      expect(r.dictionary.definition ?? 0).toBeGreaterThanOrEqual(fl.definition);
    }, 55_000);
  });
}
