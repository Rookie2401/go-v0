/**
 * THE ACCEPTANCE TEST — same rough sentence, two learners, different suggestions.
 *
 *   Learner A: beginner, story vocabulary only.
 *   Learner B: has met guilt / conviction / forgiveness / repentance and the phrase "I began to understand …".
 *   Sentence:  "when I was young I knew about Jesus but I did not understand my sin" (target language, rough).
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { GoTellSuggestion, LanguageAdapter, LanguageCode } from '../../src/core';
import { CONCEPTS, conceptsForToken } from '../../src/gotell';
import { makeWorld } from './fakes';
import type { World } from './fakes';
import { ES_PHRASE, ES_ROUGH, TH_PHRASE, TH_ROUGH, esAdapter, esLearnerB, esStoryA, thAdapter, thLearnerB, thStoryA } from './fixtures';

/** Theological items a suggestion introduces (tokens of `suggested` that the learner did not write). */
async function introducedTheological(w: World, lang: LanguageCode, adapter: LanguageAdapter, userId: string, s: GoTellSuggestion) {
  const orig = adapter.tokenize(s.original).filter((t) => t.isWord).map((t) => t.normalized);
  const pool = new Map<string, number>();
  orig.forEach((n) => pool.set(n, (pool.get(n) ?? 0) + 1));
  const out: Array<{ itemId: string; encountered: boolean }> = [];
  for (const t of adapter.tokenize(s.suggested).filter((x) => x.isWord)) {
    const c = pool.get(t.normalized) ?? 0;
    if (c > 0) { pool.set(t.normalized, c - 1); continue; }
    if (!conceptsForToken(lang, t.normalized).some((k) => CONCEPTS[k].theological)) continue;
    const id = ids.form(lang, t.normalized);
    const k = await w.golearn.queryItem(userId, { itemId: id, lang });
    out.push({ itemId: id, encountered: k.exists });
  }
  return out;
}

describe('acceptance: same rough sentence, different suggestions (Spanish)', () => {
  it('A gets only an expansion (new items marked); B gets a recombination with the known phrase', async () => {
    const adapter = esAdapter();
    const w = await makeWorld([adapter]);
    await esStoryA(w, 'A');
    await esLearnerB(w, 'B');
    const tA = await w.gotell.getOrCreateTestimony('A', 'es');
    const tB = await w.gotell.getOrCreateTestimony('B', 'es');
    const a = await w.gotell.submitDraft(tA.id, ES_ROUGH);
    const b = await w.gotell.submitDraft(tB.id, ES_ROUGH);

    // Learner A — nothing is recombined; the only fix needs a word he has never met, so it is an expansion
    expect(a.suggestions.map((s) => s.kind)).toEqual(['expansion']);
    const aSug = a.suggestions[0];
    expect(aSug.suggested).toBe('Cuando yo era joven yo conocía de Jesús pero yo no entendía mi pecado.');
    expect(aSug.newItems.map((n) => n.itemId)).toContain(ids.form('es', 'entendía'));
    expect(aSug.explanation).toMatch(/not met yet/);
    expect(a.suggestions.some((s) => s.kind === 'recombination')).toBe(false);

    // Learner B — recombination built from the phrase he already knows, with provenance
    const rec = b.suggestions.find((s) => s.kind === 'recombination')!;
    expect(rec).toBeDefined();
    expect(rec.suggested).toBe('Cuando yo era joven yo conocía de Jesús pero yo no empecé a entender mi pecado.');
    expect(rec.newItems).toEqual([]);
    expect(rec.familiar.map((f) => f.itemId)).toContain(ids.phrase('es', ES_PHRASE));
    const phraseRef = rec.familiar.find((f) => f.itemId === ids.phrase('es', ES_PHRASE))!;
    expect(phraseRef.itemKind).toBe('phrase');
    expect(phraseRef.textIds).toContain('text:es:scripture-b');
    expect(phraseRef.encounterCount).toBeGreaterThan(0);
    // negation moved under a phrase that says more than the learner wrote: surfaced, never silent
    expect(rec.meaningChange).toMatch(/negates/);
    expect(rec.priority).toBe(1);
    // B has already met "entendía", so the same grammar fix is a plain repair for him
    const rep = b.suggestions.find((s) => s.kind === 'repair')!;
    expect(rep.suggested).toBe(aSug.suggested);
    expect(rep.newItems).toEqual([]);
    expect(rep.familiar.map((f) => f.itemId)).toContain(ids.form('es', 'entendía'));

    // the suggested strings differ between the two learners
    const aStrings = new Set(a.suggestions.map((s) => s.suggested));
    const bStrings = new Set(b.suggestions.map((s) => s.suggested));
    expect(bStrings.has(rec.suggested)).toBe(true);
    expect(aStrings.has(rec.suggested)).toBe(false);
    expect([...aStrings].sort()).not.toEqual([...bStrings].sort());

    // never add content: no suggestion text contains anything about events the learner did not write
    for (const s of [...a.suggestions, ...b.suggestions]) expect(s.suggested).not.toMatch(/ayer|fui|iglesia/);

    // the two learners' suggestions are stored separately (ids are scoped to user + context)
    const stored = await w.store.suggestions.all();
    expect(stored).toHaveLength(a.suggestions.length + b.suggestions.length);
    expect(new Set(stored.map((s) => s.id)).size).toBe(stored.length);
    expect(stored.filter((s) => s.userId === 'A')).toHaveLength(a.suggestions.length);
  });

  it('A never receives an unencountered theological item outside an expansion', async () => {
    const adapter = esAdapter();
    const w = await makeWorld([adapter]);
    await esStoryA(w, 'A');
    await esLearnerB(w, 'B');
    const tA = await w.gotell.getOrCreateTestimony('A', 'es');
    // A's sentence that needs a theological replacement: "sé en Jesús" -> "creo en Jesús"
    const a = await w.gotell.submitDraft(tA.id, 'Yo sé en Jesús.');
    expect(a.suggestions).toHaveLength(1);
    expect(a.suggestions[0].kind).toBe('expansion');
    expect(a.suggestions[0].newItems.map((n) => n.itemId)).toContain(ids.form('es', 'creo'));
    for (const s of a.suggestions) {
      for (const t of await introducedTheological(w, 'es', adapter, 'A', s)) {
        if (!t.encountered) {
          expect(s.kind).toBe('expansion');
          expect(s.newItems.map((n) => n.itemId)).toContain(t.itemId);
        }
      }
    }
    const aRough = await w.gotell.analyzeProduction({ userId: 'A', lang: 'es', text: ES_ROUGH, task: 'testimony', contextId: tA.id });
    for (const s of aRough.suggestions) {
      for (const t of await introducedTheological(w, 'es', adapter, 'A', s)) {
        if (!t.encountered) expect(s.kind).toBe('expansion');
      }
    }
  });
});

describe('acceptance: same rough sentence, different suggestions (Thai, non-Latin script)', () => {
  it('A gets no recombination and no unencountered theological item; B gets the recombination', async () => {
    const adapter = thAdapter();
    const w = await makeWorld([adapter]);
    await thStoryA(w, 'A');
    await thLearnerB(w, 'B');
    const tA = await w.gotell.getOrCreateTestimony('A', 'th');
    const tB = await w.gotell.getOrCreateTestimony('B', 'th');
    expect(TH_ROUGH).not.toMatch(/\s/); // no spaces in the learner's draft
    const a = await w.gotell.submitDraft(tA.id, TH_ROUGH);
    const b = await w.gotell.submitDraft(tB.id, TH_ROUGH);

    expect(a.suggestions.filter((s) => s.kind === 'recombination')).toEqual([]);
    for (const s of a.suggestions) {
      for (const t of await introducedTheological(w, 'th', adapter, 'A', s)) if (!t.encountered) expect(s.kind).toBe('expansion');
    }

    const rec = b.suggestions.find((s) => s.kind === 'recombination')!;
    expect(rec).toBeDefined();
    expect(rec.suggested).toBe('ตอนเด็กฉันรู้จักพระเยซูแต่ฉันไม่เริ่มเข้าใจบาปของฉัน');
    expect(rec.suggested).not.toMatch(/\s/);
    expect(rec.familiar.map((f) => f.itemId)).toContain(ids.phrase('th', TH_PHRASE));
    expect(rec.newItems).toEqual([]);
    expect(rec.meaningChange).toBeTruthy();

    expect(new Set(a.suggestions.map((s) => s.suggested)).has(rec.suggested)).toBe(false);
    expect(a.suggestions.map((s) => s.suggested)).not.toEqual(b.suggestions.map((s) => s.suggested));
  });
});
