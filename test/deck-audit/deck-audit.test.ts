/**
 * THE DECK AUDIT of every live language (the owner, 2026-11-25: "Make sure that there are no false words or unknown words that appear in the GoReview deck";
 * 2026-11-26: "Enforce the same rule for all the other languages"). One test per audited set (a language, or one period variety of it).
 *
 * Each set has two texts under data/deck-audit/<set>/: dev.txt (read while the gate and the known-limits list were written) and heldout.txt (never read
 * for that; run only to measure). A set whose held-out half has since been read to fix what it showed has it as dev2.txt, development material too, and a
 * fresh heldout.txt. Every card GoReview would admit from them, through the real path (test/deck-audit/support.ts), was read by a reader
 * and given a verdict in verdicts.json: ok, false-reading (the sentence's word is another word), false-meaning (the right word, a wrong first meaning),
 * unknown (not a real word, or no real meaning), unsure. The readers were AI models, not native speakers; the file says so.
 *
 * What a test holds a set to:
 *   1. the machine findings are zero: no admitted card whose meaning is only a cross-reference, whose headword is in no word list or dictionary, or
 *      whose headword has no letter;
 *   2. every admitted card has a verdict FOR THE MEANING IT SHOWS: a card that is new, or whose first meaning changed, fails until it is read;
 *   3. no admitted card of the DEVELOPMENT text is false or unknown (a dev card a reader found false is on the known-limits list, or a rule holds it);
 *   4. the admitted false or unknown cards of the HELD-OUT text are exactly the named list in verdicts.json (`residual`): what remains, for the owner
 *      to see. Nothing may be added to it silently, and a card that stops being admitted must be taken off it.
 * The dictionaries and lexicon shards are build outputs, not in git: a set whose data is not on the machine is skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECK_KNOWN_LIMITS } from '../../packages/goreview/src/facts/deck-known-limits';
import { fragmentWhy } from './fragments';
import { DECK_LEAD_SENSES } from '../../packages/goreview/src/facts/deck-lead-senses';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { createPackRuntime, packFor } from '../../packages/language-packs/src';
import { AUDIT_SETS, ROOT, auditText, dataPresent, devParts, diskFetch, readSentences, runDeckAudit, type AuditCard, type AuditPart } from './support';

interface Verdict { shown: string; v: 'ok' | 'false-reading' | 'false-meaning' | 'unknown' | 'unsure'; note?: string }
interface VerdictFile { readBy: string; cards: Record<string, Verdict[]>; residual: string[] }
const BAD = new Set(['false-reading', 'false-meaning', 'unknown']);
const verdictsOf = (id: string): VerdictFile | undefined => {
  const file = path.join(ROOT, 'data/deck-audit', id, 'verdicts.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as VerdictFile : undefined;
};
const verdictFor = (file: VerdictFile, card: AuditCard): Verdict | undefined => (file.cards[card.unitId] ?? []).find((x) => x.shown === card.shown);

describe.each(AUDIT_SETS.map((s) => [s.id, s] as const))('deck audit: %s', (_id, set) => {
  const file = verdictsOf(set.id);
  const ready = dataPresent(set.lang) && !!file && fs.existsSync(auditText(set.id, 'dev')) && fs.existsSync(auditText(set.id, 'heldout'));

  it.skipIf(!ready)(`${set.name}: no unknown card, no unread card, no false card on the development text, and exactly the named residue on the held-out text`, async () => {
    const runs: Array<[AuditPart, Awaited<ReturnType<typeof runDeckAudit>>]> = [];
    for (const part of [...devParts(set.id), 'heldout' as const]) runs.push([part, await runDeckAudit(set.lang, readSentences(auditText(set.id, part)), { varietyId: set.varietyId })]);
    const heldout = runs.find(([part]) => part === 'heldout')![1];
    const devCards = runs.filter(([part]) => part !== 'heldout').flatMap(([, r]) => r.cards);
    for (const [part, result] of runs) {
      // 1 — machine findings
      expect(result.cards.filter((c) => c.xref).map((c) => `${c.unitId} = ${c.shown}`), `${part}: meaning is only a cross-reference`).toEqual([]);
      expect(result.cards.filter((c) => !c.listed).map((c) => c.unitId), `${part}: headword in no word list or dictionary`).toEqual([]);
      expect(result.cards.filter((c) => c.fragment || !c.shown.trim()).map((c) => c.unitId), `${part}: no letter, or no meaning`).toEqual([]);
      // 2 — every card was read with the meaning it shows
      expect(result.cards.filter((c) => !verdictFor(file!, c)).map((c) => `${c.unitId} = ${c.shown}`), `${part}: admitted cards no reader has judged (run npm run deck:audit -- ${set.id} --part ${part} --cards)`).toEqual([]);
    }
    const bad = (cards: AuditCard[]): string[] => cards.filter((c) => BAD.has(verdictFor(file!, c)!.v)).map((c) => c.unitId).sort();
    // 3 — the development text
    expect([...new Set(bad(devCards))], 'development texts: false or unknown cards still admitted').toEqual([]);
    // 4 — the held-out text: what remains, by name (a unit also met in the development text is counted there)
    const devUnits = new Set(devCards.map((c) => c.unitId));
    expect(bad(heldout.cards.filter((c) => !devUnits.has(c.unitId))), 'held-out text: the named residue').toEqual([...file!.residual].sort());
    expect(runs.flatMap(([, r]) => r.cards).map((c) => ({ unit: c.unitId, shown: c.shown, why: fragmentWhy(c.shown) })).filter((x) => x.why), 'no admitted card shows a fragment').toEqual([]);
  }, 600_000);

  it.skipIf(!file)(`${set.name}: every unit on the known-limits list is one a reader found false or unknown`, () => {
    const listed = Object.keys(DECK_KNOWN_LIMITS[set.lang] ?? {});
    const all = AUDIT_SETS.filter((s) => s.lang === set.lang).map((s) => verdictsOf(s.id)).filter((f): f is VerdictFile => !!f);
    for (const unit of listed) expect(all.some((f) => (f.cards[unit] ?? []).some((x) => BAD.has(x.v))), `${unit} is on the known-limits list without a verdict that says why`).toBe(true);
  });
});

describe('lead senses (deck-lead-senses.ts): the entry\u2019s own sense, named for a word whose first sense a reader found wrong', () => {
  for (const [key, units] of Object.entries(DECK_LEAD_SENSES)) {
    const lang = key.split('-')[0];
    it.skipIf(!dataPresent(lang))(`${key}: every sense named is a sense the app has for the word, and a verdict says why it is named`, async () => {
      const varietyId = AUDIT_SETS.find((x) => x.varietyId === key)?.varietyId;
      const runtime = createPackRuntime(packFor(lang)!, { fetch: diskFetch, baseUrl: 'http://assets.local/' });
      const api = { units: async (ids: string[]) => ({ ok: true, data: { units: {}, missing: ids } }), unit: async () => ({ ok: false }) } as never;
      const raw = packFactsFor({ fetch: diskFetch, baseUrl: 'http://assets.local/', deckGate: false })(lang, api)!;
      const primed = raw as unknown as { prime?(ids: string[], varietyId?: string): Promise<void> };
      await primed.prime?.(Object.keys(units), varietyId);
      const files = AUDIT_SETS.filter((x) => x.lang === lang).map((x) => verdictsOf(x.id)).filter((f): f is VerdictFile => !!f);
      for (const [unit, leads] of Object.entries(units)) {
        const parts = unit.split(':');
        const entry = await runtime.gloss(parts.slice(2, -1).join(':'), parts[parts.length - 1]);
        const facts = await raw.factsFor(unit, lang, varietyId);
        const has = [...(entry?.senses ?? []).map((x) => x.gloss), ...(facts?.glosses ?? [])];
        for (const g of leads) expect(has.includes(g), `${unit}: no sense "${g}"`).toBe(true);
        expect(files.some((f) => (f.cards[unit] ?? []).some((x) => x.v === 'false-meaning')), `${unit} is named without a verdict that says why`).toBe(true);
      }
    }, 120_000);
  }
});
