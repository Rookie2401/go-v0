/**
 * The checks every Alphabet Sprint profile must pass (test/alphabet/sprint-<lang>.test.ts call `profileChecks`). They test the
 * profile's own structure and its usefulness for reading, never a native speaker's judgement (none has reviewed any profile).
 */
import { describe, expect, it } from 'vitest';
import { parseSprintUnitId, sprintUnitId } from '../../src/alphabet/sprint/ids';
import { scriptKnowledge } from '../../src/alphabet/sprint/knowledge';
import { planSprint } from '../../src/alphabet/sprint/plan';
import { decodableAfter, sprintOrder, wordDependencies } from '../../src/alphabet/sprint/select';
import type { ScriptProfile } from '../../src/alphabet/sprint/types';
import { alphabetCards } from '../../packages/goreview/app/alphabetDeck';

export interface KitOptions {
  /** Share of starter words the profile must model (default 0.9). */
  minModelled?: number;
  /** Units in the first `n` of the Sprint order must unlock more words than the first `n` of the alphabet order (default n = 5). */
  beatAlphabetAt?: number;
  /** Character keys that are new to the Sprint (not cards of the old Alphabet deck); every other character key must be an old deck glyph. */
  newKeys?: readonly string[];
}

export function profileChecks(profile: ScriptProfile, opts: KitOptions = {}): void {
  const name = `${profile.languageId}${profile.tradition ? ` (${profile.tradition.id})` : ''}`;
  describe(`Alphabet Sprint profile ${name}`, () => {
    it('has unique unit keys with no colon, a display and a sound for every unit, and sane batch sizes', () => {
      const keys = profile.units.map((u) => u.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const u of profile.units) {
        expect(u.key.includes(':'), u.key).toBe(false);
        expect(u.display.trim().length, u.key).toBeGreaterThan(0);
        expect(u.sound.trim().length, u.key).toBeGreaterThan(0);
      }
      expect(profile.firstBatch).toBeGreaterThanOrEqual(2);
      expect(profile.firstBatch).toBeLessThanOrEqual(6);
      expect(profile.laterBatch).toBeGreaterThanOrEqual(1);
      expect(profile.notes.length).toBeGreaterThan(20);
    });

    it('keeps the old Alphabet deck letters as the same cards (same unit ids), so practice carries over', () => {
      if (profile.tradition && profile.tradition.id !== 'default') return; // a non-default tradition has ids of its own
      const old = new Set(alphabetCards(profile.languageId).map((c) => c.glyph));
      const newKeys = new Set(opts.newKeys ?? []);
      for (const u of profile.units.filter((x) => x.kind !== 'rule' && !x.familiar)) {
        expect(old.has(u.key) || newKeys.has(u.key), `${u.key} is neither an old deck glyph nor declared new`).toBe(true);
      }
    });

    it('has real starter words with a meaning and a source, and models most of them', () => {
      expect(profile.words.length).toBeGreaterThanOrEqual(40);
      for (const w of profile.words) {
        expect(w.form.normalize('NFC'), w.form).toBe(w.form);
        expect(w.gloss.trim().length, w.form).toBeGreaterThan(0);
        expect(w.source.length, w.form).toBeGreaterThan(0);
        expect(w.weight, w.form).toBeGreaterThan(0);
        expect(w.weight, w.form).toBeLessThanOrEqual(1);
      }
      const modelled = wordDependencies(profile).length / profile.words.length;
      expect(modelled).toBeGreaterThanOrEqual(opts.minModelled ?? 0.9);
    });

    it('names only its own units in every dependency, and every unit example decodes with known units', () => {
      const keys = new Set(profile.units.map((u) => u.key));
      for (const { word, deps } of wordDependencies(profile)) for (const d of deps) expect(keys.has(d), `${word.form}: ${d}`).toBe(true);
      for (const c of profile.confusions) { expect(keys.has(c.a), c.a).toBe(true); expect(keys.has(c.b), c.b).toBe(true); }
      for (const u of profile.units) if (u.example) expect(profile.dependencies(u.example.form), `${u.key}: ${u.example.form}`).toBeDefined();
    });

    it(`teaches letters in an order that unlocks more real words than the alphabet order`, () => {
      const n = opts.beatAlphabetAt ?? 5;
      const order = sprintOrder(profile, profile.laterBatch);
      const alphabet = profile.units.filter((u) => !u.familiar).map((u) => u.key);
      expect(decodableAfter(profile, order, n)).toBeGreaterThan(decodableAfter(profile, alphabet, n));
    });

    it('starts a beginner with a few letters and a real word as soon as the script allows, and never fills with repeats', () => {
      const plan = planSprint({ profile, knowledge: scriptKnowledge(profile, []), cards: [], now: '2026-11-17T12:00:00.000Z', size: 20 });
      expect(plan.cards.length).toBeGreaterThan(0);
      // the first word comes no later than one unit after the fewest new units any starter word needs (an alphabet: 1–2; a pointed abjad or an
      // abugida: letter, vowel, letter), whatever the script
      const familiar = new Set(profile.units.filter((u) => u.familiar).map((u) => u.key));
      const fewest = Math.min(...wordDependencies(profile).map(({ deps }) => deps.filter((d) => !familiar.has(d)).length));
      const firstWord = plan.cards.findIndex((c) => c.kind === 'word');
      expect(firstWord, 'a real word in the first sprint').toBeGreaterThan(0);
      expect(plan.cards.slice(0, firstWord).filter((c) => c.kind === 'character' || c.kind === 'rule').length).toBeLessThanOrEqual(Math.max(2, fewest + 1));
      expect(new Set(plan.cards.map((c) => c.unitId)).size).toBe(plan.cards.length);
      const newUnits = plan.cards.filter((c) => c.kind === 'character' || c.kind === 'rule').length;
      expect(newUnits).toBeLessThanOrEqual(profile.firstBatch);
      for (const c of plan.cards) {
        expect(parseSprintUnitId(c.unitId)?.languageId, c.unitId).toBe(profile.languageId);
        expect(c.back.trim().length, c.unitId).toBeGreaterThan(0);
      }
    });

    it('round-trips its card ids', () => {
      const t = profile.tradition && profile.tradition.id !== 'default' ? profile.tradition.id : undefined;
      for (const u of profile.units) {
        const id = sprintUnitId(profile.languageId, u.kind === 'rule' ? 'rule' : 'character', u.key, t);
        expect(parseSprintUnitId(id)).toMatchObject({ languageId: profile.languageId, key: u.key });
      }
    });
  });
}
